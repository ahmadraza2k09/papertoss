import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision"
import type { HandFrame, HandPoint } from "../types"
import { CONFIG } from "./config"
import { OneEuro } from "./oneEuro"

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm"
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

export const HAND_LINKS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
]

const PALM = [0, 5, 9, 13, 17]
const TIPS = [8, 12, 16, 20]

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
const dist = (a: HandPoint, b: HandPoint) =>
  Math.hypot(a[0] - b[0], a[1] - b[1])

let nextId = 1

class Track {
  id: number = nextId++
  f: Array<[OneEuro, OneEuro]> = Array.from({ length: 21 }, () => [
    new OneEuro(),
    new OneEuro(),
  ])
  lm: HandPoint[] | null = null
  missed = 0
  pinching = false
  rawC: HandPoint | null = null
}

function extractFeatures(track: Track, P: HandPoint[], t: number): HandFrame {
  let cx = 0
  let cy = 0
  for (const i of PALM) {
    cx += P[i][0]
    cy += P[i][1]
  }
  cx /= PALM.length
  cy /= PALM.length

  const size = Math.max(1, dist(P[0], P[9]))
  const pinchD = dist(P[4], P[8]) / size
  track.pinching = track.pinching
    ? pinchD < CONFIG.pinchOff
    : pinchD < CONFIG.pinchOn

  let tip = 0
  for (const i of TIPS) tip += dist(P[i], [cx, cy])
  tip /= TIPS.length * size

  const closure = clamp(
    (CONFIG.fingersOpen - tip) / (CONFIG.fingersOpen - CONFIG.fingersClosed),
  )

  return {
    id: track.id,
    cx,
    cy,
    size,
    pinch: track.pinching,
    px: (P[4][0] + P[8][0]) / 2,
    py: (P[4][1] + P[8][1]) / 2,
    closure,
    angle: Math.atan2(P[9][1] - P[0][1], P[9][0] - P[0][0]),
    lm: P,
    n: track.lm,
    t,
  }
}

export class HandTracker {
  video: HTMLVideoElement
  track = new Track()
  lastVideoTime = -1
  ready = false
  landmarker: HandLandmarker | null = null
  stream: MediaStream | null = null
  lastHands: HandFrame[] = []

  constructor(video: HTMLVideoElement) {
    this.video = video
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access is not supported in this browser.")
    }
    // High-performance 640x480 resolution for lightning-fast 60fps tracking
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
    })
    this.stream = stream
    this.video.srcObject = stream
    await this.video.play()

    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
    const createOptions = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO" as const,
      numHands: 2, // Detect both so we can strictly isolate the Right Hand
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    })

    try {
      this.landmarker = await HandLandmarker.createFromOptions(
        vision,
        createOptions("GPU"),
      )
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(
        vision,
        createOptions("CPU"),
      )
    }
    this.ready = true
  }

  stop() {
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.video.srcObject = null
    this.ready = false
  }

  toScreen(x: number, y: number): HandPoint {
    const v = this.video
    const W = window.innerWidth
    const H = window.innerHeight
    const vw = v.videoWidth || 640
    const vh = v.videoHeight || 480
    const s = Math.max(W / vw, H / vh)
    const dw = vw * s
    const dh = vh * s
    return [(W - dw) / 2 + (1 - x) * dw, (H - dh) / 2 + y * dh]
  }

  poll(t: number): HandFrame[] | null {
    if (!this.ready || !this.landmarker || this.video.readyState < 2) {
      return this.lastHands.length ? this.lastHands : null
    }

    // If camera hasn't pushed a new video frame, reuse last known positions with zero latency
    if (this.video.currentTime === this.lastVideoTime) {
      return this.lastHands.length ? this.lastHands : null
    }
    this.lastVideoTime = this.video.currentTime

    const res = this.landmarker.detectForVideo(this.video, t)
    if (!res.landmarks || !res.landmarks.length) {
      this.track.missed++
      if (this.track.missed > 10) {
        this.lastHands = []
      }
      return this.lastHands
    }

    // STRICT RIGHT-HAND ONLY FILTER:
    // If multiple hands are in camera view, always choose the Right Hand (rightmost in mirrored view)
    let chosenIndex = 0
    if (res.landmarks.length > 1) {
      let maxScreenX = -Infinity
      for (let i = 0; i < res.landmarks.length; i++) {
        const palmScreenX = 1 - (res.landmarks[i][0].x + res.landmarks[i][9].x) / 2
        if (palmScreenX > maxScreenX) {
          maxScreenX = palmScreenX
          chosenIndex = i
        }
      }
    }

    const landmarks = res.landmarks[chosenIndex]
    const palmScreenX = 1 - (landmarks[0].x + landmarks[9].x) / 2

    // Completely ignore any stray left hand on the far left side (screen X < 0.28)
    if (palmScreenX < 0.28) {
      this.track.missed++
      if (this.track.missed > 10) {
        this.lastHands = []
      }
      return this.lastHands
    }

    this.track.missed = 0
    this.track.lm = landmarks.map((p, i) => [
      this.track.f[i][0].filter(p.x, t),
      this.track.f[i][1].filter(p.y, t),
    ])

    const screenLm = this.track.lm.map(([x, y]) => this.toScreen(x, y))
    const frame = extractFeatures(this.track, screenLm, t)
    this.lastHands = [frame]
    return this.lastHands
  }
}

export function drawPipSkeleton(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  hands: HandFrame[],
) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const W = canvas.clientWidth
  const H = canvas.clientHeight
  const dpr = Math.min(2, window.devicePixelRatio || 1)

  if (canvas.width !== Math.round(W * dpr)) {
    canvas.width = W * dpr
    canvas.height = H * dpr
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)

  if (!video.videoWidth) return

  const s = Math.max(W / video.videoWidth, H / video.videoHeight)
  const dw = video.videoWidth * s
  const dh = video.videoHeight * s
  const ox = (W - dw) / 2
  const oy = (H - dh) / 2

  ctx.lineCap = ctx.lineJoin = "round"
  const PIP_BONES = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [0, 17, 18, 19, 20],
    [5, 9, 13, 17],
  ]

  for (const h of hands) {
    if (!h.n) continue
    const P = h.n.map(([x, y]) => [ox + (1 - x) * dw, oy + y * dh])

    ctx.strokeStyle = "rgba(255,255,255,0.85)"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (const f of PIP_BONES) {
      f.forEach((i, k) =>
        k ? ctx.lineTo(P[i][0], P[i][1]) : ctx.moveTo(P[i][0], P[i][1]),
      )
    }
    ctx.stroke()

    ctx.fillStyle = h.pinch
      ? "rgb(255,186,110)"
      : h.closure > 0.55
        ? "rgb(125,180,255)"
        : "#ffffff"
    for (const i of [4, 8, 12, 16, 20]) {
      ctx.beginPath()
      ctx.arc(P[i][0], P[i][1], 2.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
