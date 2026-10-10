export function getBinDataUrl(): string {
  const canvas = document.createElement("canvas")
  canvas.width = 240
  canvas.height = 270
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  const W = 240
  const H = 270

  // Outer shadow
  ctx.fillStyle = "rgba(0,0,0,0.15)"
  ctx.beginPath()
  ctx.ellipse(W / 2, H - 15, W * 0.4, 12, 0, 0, Math.PI * 2)
  ctx.fill()

  // Bin Mesh Body
  const topY = 30
  const bottomY = H - 25
  const topW = W * 0.88
  const bottomW = W * 0.65

  // Base metallic fill
  const grad = ctx.createLinearGradient(0, topY, W, bottomY)
  grad.addColorStop(0, "#4a5568")
  grad.addColorStop(0.5, "#2d3748")
  grad.addColorStop(1, "#1a202c")

  ctx.save()
  ctx.beginPath()
  ctx.moveTo((W - topW) / 2, topY)
  ctx.lineTo((W + topW) / 2, topY)
  ctx.lineTo((W + bottomW) / 2, bottomY)
  ctx.lineTo((W - bottomW) / 2, bottomY)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  // Mesh grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.22)"
  ctx.lineWidth = 1.5
  for (let y = topY + 15; y < bottomY; y += 18) {
    const k = (y - topY) / (bottomY - topY)
    const w = topW + (bottomW - topW) * k
    ctx.beginPath()
    ctx.moveTo((W - w) / 2, y)
    ctx.lineTo((W + w) / 2, y)
    ctx.stroke()
  }

  for (let i = -6; i <= 6; i++) {
    const xTop = W / 2 + (i / 6) * (topW / 2)
    const xBot = W / 2 + (i / 6) * (bottomW / 2)
    ctx.beginPath()
    ctx.moveTo(xTop, topY)
    ctx.lineTo(xBot, bottomY)
    ctx.stroke()
  }

  // Rim Top
  ctx.lineWidth = 6
  ctx.strokeStyle = "#cbd5e0"
  ctx.fillStyle = "#2d3748"
  ctx.beginPath()
  ctx.ellipse(W / 2, topY, topW / 2, 14, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Inner shadow
  ctx.fillStyle = "rgba(0,0,0,0.55)"
  ctx.beginPath()
  ctx.ellipse(W / 2, topY + 2, topW * 0.45, 10, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
  return canvas.toDataURL("image/png")
}
