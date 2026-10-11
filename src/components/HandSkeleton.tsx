import { useEffect, useRef } from "react"
import type { TrackingFrame } from "../game/types"

const connections = [
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
const tips = new Set([4, 8, 12, 16, 20])

export default function HandSkeleton({
  frame,
  compact = false,
}: {
  frame: TrackingFrame
  compact?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const box = canvas.getBoundingClientRect()
    const dpr = Math.min(devicePixelRatio, 2)
    canvas.width = Math.max(1, box.width * dpr)
    canvas.height = Math.max(1, box.height * dpr)
    const context = canvas.getContext("2d")
    if (!context) return
    context.scale(dpr, dpr)
    context.clearRect(0, 0, box.width, box.height)
    if (!frame.landmarks) return
    const point = (index: number) => ({
      x: (1 - frame.landmarks![index].x) * box.width,
      y: frame.landmarks![index].y * box.height,
    })
    context.lineWidth = compact ? 1.2 : 1.6
    context.strokeStyle = "rgba(190, 225, 179, .72)"
    context.shadowBlur = 8
    context.shadowColor = "rgba(159, 210, 144, .62)"
    connections.forEach(([from, to]) => {
      const a = point(from)
      const b = point(to)
      context.beginPath()
      context.moveTo(a.x, a.y)
      context.lineTo(b.x, b.y)
      context.stroke()
    })
    frame.landmarks.forEach((_, index) => {
      const p = point(index)
      const important = tips.has(index) || index === 0 || index === 9
      context.beginPath()
      context.arc(
        p.x,
        p.y,
        important ? (compact ? 3.2 : 4.6) : compact ? 2 : 3,
        0,
        Math.PI * 2,
      )
      context.fillStyle = important ? "#e9f5df" : "#a6cf98"
      context.fill()
    })
  }, [compact, frame])

  return (
    <div className={`tracking-panel ${compact ? "compact" : ""}`}>
      <canvas ref={canvasRef} aria-label="Live hand landmark visualization" />
      {!frame.landmarks && (
        <div className="tracking-empty">
          <span className="tracking-pulse" />
          <span>Show one hand</span>
        </div>
      )}
      <div className="tracking-label">
        <span
          className={frame.landmarks ? "status-dot active" : "status-dot"}
        />
        {frame.landmarks
          ? `${frame.handedness ?? ""} hand · ${frame.gesture}`
          : "Searching locally"}
      </div>
    </div>
  )
}
