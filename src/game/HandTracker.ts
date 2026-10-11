import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision"
import type { Gesture, Landmark, TrackingFrame } from "./types"

const emptyFrame: TrackingFrame = {
  landmarks: null,
  gesture: "none",
  confidence: 0,
  velocity: 0,
  lateral: 0,
  handedness: null,
}

function distance(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.65)
}

function classify(points: Landmark[]): { gesture: Gesture confidence: number } {
  const wrist = points[0]
  const pairs = [
    [4, 2],
    [8, 5],
    [12, 9],
    [16, 13],
    [20, 17],
  ]
  const extended = pairs.map(
    ([tip, base]) =>
      distance(points[tip], wrist) > distance(points[base], wrist) * 1.48,
  )
  const count = extended.filter(Boolean).length
  if (count >= 4) return { gesture: "open", confidence: 0.72 + count * 0.05 }
  if (count <= 1) return { gesture: "fist", confidence: 0.88 - count * 0.08 }
  return { gesture: "neutral", confidence: 0.58 }
}

export class HandTracker {
  private video: HTMLVideoElement | null = null
  private stream: MediaStream | null = null
  private landmarker: HandLandmarker | null = null
  private frameId = 0
  private running = false
  private lastTime = 0
  private smooth: Landmark[] | null = null
  private history: Array<{ t: number x: number y: number z: number }> = []

  async start(
    preferredHand: "Left" | "Right",
    onFrame: (frame: TrackingFrame) => void,
    onProgress: (message: string) => void,
  ) {
    if (!window.isSecureContext && location.hostname !== "localhost") {
      throw new Error("Camera access requires HTTPS or another secure context.")
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not provide compatible camera access.")
    }

    onProgress("Requesting camera permission…")
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    })

    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    video.srcObject = this.stream
    this.video = video
    await video.play()

    onProgress("Loading private on-device hand model…")
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm",
    )
    const options = {
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.55,
    } as const
    const modelAssetPath =
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath, delegate: "GPU" },
      })
    } catch {
      onProgress("GPU unavailable — switching to compatible mode…")
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath, delegate: "CPU" },
      })
    }

    onProgress("Model ready — show one hand to the camera")
    this.running = true
    const loop = () => {
      if (!this.running || !this.video || !this.landmarker) return
      const now = performance.now()
      if (this.video.readyState >= 2 && now - this.lastTime > 32) {
        this.lastTime = now
        try {
          const result = this.landmarker.detectForVideo(this.video, now)
          const index = result.handedness.findIndex(
            (entry) => entry[0]?.categoryName === preferredHand,
          )
          const selected = index >= 0 ? index : result.landmarks.length ? 0 : -1
          if (selected >= 0) {
            const raw = result.landmarks[selected] as Landmark[]
            this.smooth = raw.map((point, pointIndex) => {
              const old = this.smooth?.[pointIndex] ?? point
              return {
                x: old.x * 0.58 + point.x * 0.42,
                y: old.y * 0.58 + point.y * 0.42,
                z: old.z * 0.58 + point.z * 0.42,
              }
            })
            const palm = this.smooth[9]
            this.history.push({ t: now, x: palm.x, y: palm.y, z: palm.z })
            this.history = this.history.filter((item) => now - item.t < 190)
            const oldest = this.history[0]
            const elapsed = Math.max(45, now - oldest.t)
            const movement = Math.hypot(
              palm.x - oldest.x,
              palm.y - oldest.y,
              (palm.z - oldest.z) * 1.7,
            )
            // An upward screen movement maps naturally to a forward desk throw.
            // Lateral-only movement is intentionally discounted.
            const forwardIntent = Math.max(0, oldest.y - palm.y)
            const directionWeight = Math.min(1, forwardIntent * 9 + 0.18)
            const velocity = Math.min(
              1,
              (movement / elapsed) * 1800 * directionWeight,
            )
            const lateral = Math.max(-1, Math.min(1, (0.5 - palm.x) * 2.2))
            const classification = classify(this.smooth)
            onFrame({
              landmarks: this.smooth,
              gesture: classification.gesture,
              confidence: classification.confidence,
              velocity,
              lateral,
              handedness:
                result.handedness[selected]?.[0]
                  ?.categoryName as "Left" | "Right" ?? null,
            })
          } else {
            this.smooth = null
            this.history = []
            onFrame(emptyFrame)
          }
        } catch {
          onFrame(emptyFrame)
        }
      }
      this.frameId = requestAnimationFrame(loop)
    }
    loop()
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.frameId)
    this.stream?.getTracks().forEach((track) => track.stop())
    this.video?.pause()
    if (this.video) this.video.srcObject = null
    this.landmarker?.close()
    this.stream = null
    this.video = null
    this.landmarker = null
    this.smooth = null
    this.history = []
  }
}
