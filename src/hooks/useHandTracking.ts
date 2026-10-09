import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { EMPTY_HAND, type GameStage, type HandData } from "../types";

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

type TrackingStatus = "idle" | "requesting" | "loading" | "ready" | "denied" | "error";

function extendedFingers(points: NormalizedLandmark[]) {
  const fingerTips = [8, 12, 16, 20];
  const fingerPips = [6, 10, 14, 18];
  let extended = fingerTips.filter((tip, index) => points[tip].y < points[fingerPips[index]].y).length;
  const thumbTip = points[4];
  const thumbBase = points[2];
  if (Math.abs(thumbTip.x - thumbBase.x) > 0.09) extended += 1;
  return extended;
}

export function useHandTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  paused: boolean,
  stage: GameStage,
  sensitivity: number,
  onLift: () => void,
  onFold: () => void,
  onThrow: (hand: HandData) => void,
) {
  const [status, setStatus] = useState<TrackingStatus>("idle");
  const [error, setError] = useState("");
  const [hand, setHand] = useState<HandData>(EMPTY_HAND);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<HandLandmarker | null>(null);
  const frameRef = useRef(0);
  const previousRef = useRef({ x: 0.5, y: 0.5, z: 0, time: performance.now() });
  const smoothedRef = useRef({ x: 0.5, y: 0.5, z: 0 });
  const fistSinceRef = useRef(0);
  const cooldownRef = useRef(0);
  const callbacksRef = useRef({ onLift, onFold, onThrow, stage, sensitivity, paused });

  useEffect(() => {
    callbacksRef.current = { onLift, onFold, onThrow, stage, sensitivity, paused };
  }, [onLift, onFold, onThrow, stage, sensitivity, paused]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    setHand(EMPTY_HAND);
    setStatus("idle");
  }, [videoRef]);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector || !streamRef.current) return;

    if (video.readyState >= 2 && !callbacksRef.current.paused) {
      const now = performance.now();
      const result = detector.detectForVideo(video, now);
      const points = result.landmarks[0];

      if (points) {
        const palm = points[9];
        const raw = { x: 1 - palm.x, y: 1 - palm.y, z: palm.z };
        const smooth = smoothedRef.current;
        smooth.x += (raw.x - smooth.x) * 0.32;
        smooth.y += (raw.y - smooth.y) * 0.32;
        smooth.z += (raw.z - smooth.z) * 0.32;

        const previous = previousRef.current;
        const dt = Math.max((now - previous.time) / 1000, 0.016);
        const velocityX = (smooth.x - previous.x) / dt;
        const velocityY = (smooth.y - previous.y) / dt;
        const velocityZ = (previous.z - smooth.z) / dt;
        const speed = Math.hypot(velocityX, velocityY, velocityZ);
        previousRef.current = { ...smooth, time: now };

        const count = extendedFingers(points);
        const gesture = count >= 4 ? "Open palm" : count <= 1 ? "Fist" : "Moving";
        const nextHand: HandData = {
          detected: true,
          gesture,
          ...smooth,
          velocityX,
          velocityY,
          velocityZ,
          speed,
        };
        setHand(nextHand);

        const { stage: currentStage, sensitivity: level } = callbacksRef.current;
        const threshold = 1.35 - level * 0.65;
        if (now > cooldownRef.current) {
          if (currentStage === "lift" && gesture === "Open palm" && velocityY > threshold * 0.45) {
            cooldownRef.current = now + 900;
            callbacksRef.current.onLift();
          } else if (currentStage === "fold" && gesture === "Fist") {
            if (!fistSinceRef.current) fistSinceRef.current = now;
            if (now - fistSinceRef.current > 280) {
              cooldownRef.current = now + 1000;
              fistSinceRef.current = 0;
              callbacksRef.current.onFold();
            }
          } else if (
            currentStage === "throw" &&
            (velocityY > threshold || velocityZ > threshold * 0.7 || speed > threshold * 1.55)
          ) {
            cooldownRef.current = now + 1600;
            callbacksRef.current.onThrow(nextHand);
          } else if (gesture !== "Fist") {
            fistSinceRef.current = 0;
          }
        }
      } else {
        setHand(EMPTY_HAND);
        fistSinceRef.current = 0;
      }
    }
    frameRef.current = requestAnimationFrame(processFrame);
  }, [videoRef]);

  const startCamera = useCallback(async () => {
    setError("");
    setStatus("requesting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not supported in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("loading");
      if (!detectorRef.current) {
        const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
        detectorRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      }
      setStatus("ready");
      previousRef.current.time = performance.now();
      frameRef.current = requestAnimationFrame(processFrame);
    } catch (cause) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const denied = cause instanceof DOMException && cause.name === "NotAllowedError";
      setStatus(denied ? "denied" : "error");
      setError(
        denied
          ? "Camera permission was blocked. Allow access in your browser settings, then try again."
          : cause instanceof Error
            ? cause.message
            : "We couldn't start hand tracking.",
      );
    }
  }, [processFrame, videoRef]);

  useEffect(() => {
    if (!active && streamRef.current) stopCamera();
  }, [active, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  return { hand, status, error, stream, startCamera, stopCamera };
}
