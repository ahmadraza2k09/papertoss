import { CONFIG } from "./config"

const BALL_RATIO = 0.44 // ball diameter / sheet height
const N = 8
const LIGHT = [253, 250, 242]
const SHADE = [150, 160, 200]
const DEEP = [96, 104, 150]
const INK = "rgba(34,40,72,"

function clamp(v: number, a = 0, b = 1): number {
  return v < a ? a : v > b ? b : v
}

function mix(a: number[], b: number[], k: number): number[] {
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ]
}

export function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LIGHT_DIR = (() => {
  const L = [-0.45, -0.7, 0.75]
  const len = Math.hypot(...L)
  return [L[0] / len, L[1] / len, L[2] / len] as const
})()

export class ProceduralPaper {
  ballRatio = BALL_RATIO
  private v: Array<{
    fx: number
    fy: number
    bx: number
    by: number
    bz: number
    delay: number
    wx: number
    wy: number
    wz: number
    x: number
    y: number
    z: number
  }> = []
  private tris: Array<{
    i: [number, number, number]
    n: [number, number, number]
    j: number
    z: number
    col: string
  }> = []
  private sortedTris: Array<{
    i: [number, number, number]
    n: [number, number, number]
    j: number
    z: number
    col: string
  }> = []
  private perim: number[] = []
  private cache: HTMLCanvasElement | null = null

  constructor(seed = 7) {
    const r = rng(seed)
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const u = -1 + (2 * i) / N
        const w = -1 + (2 * j) / N
        const dx = u * Math.sqrt(1 - (w * w) / 2)
        const dy = w * Math.sqrt(1 - (u * u) / 2)
        const rho = Math.min(1, Math.hypot(dx, dy))
        const ang = Math.atan2(dy, dx)
        const th = rho * Math.PI * 0.6
        const R = 0.19 * (0.85 + 0.3 * r())
        this.v.push({
          fx: u * 0.36,
          fy: w * 0.5,
          bx: R * Math.sin(th) * Math.cos(ang) + (r() - 0.5) * 0.06,
          by: R * Math.sin(th) * Math.sin(ang) + (r() - 0.5) * 0.06,
          bz: R * Math.cos(th),
          delay: 0.32 * (1 - rho) + r() * 0.1,
          wx: (r() - 0.5) * 0.16,
          wy: (r() - 0.5) * 0.16,
          wz: (r() - 0.5) * 0.14,
          x: 0,
          y: 0,
          z: 0,
        })
      }
    }

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i
        const b = a + 1
        const c = a + N + 1
        const d = c + 1
        const crease = (): [number, number, number] => [
          r() - 0.5,
          r() - 0.5,
          (r() - 0.5) * 0.5,
        ]
        this.tris.push({
          i: [a, b, d],
          n: crease(),
          j: r() - 0.5,
          z: 0,
          col: "",
        })
        this.tris.push({
          i: [a, d, c],
          n: crease(),
          j: r() - 0.5,
          z: 0,
          col: "",
        })
      }
    }

    for (let i = 0; i <= N; i++) this.perim.push(i)
    for (let j = 1; j <= N; j++) this.perim.push(j * (N + 1) + N)
    for (let i = N - 1; i >= 0; i--) this.perim.push(N * (N + 1) + i)
    for (let j = N - 1; j > 0; j--) this.perim.push(j * (N + 1))

    this.sortedTris = this.tris.slice()
  }

  shape(c: number) {
    for (const v of this.v) {
      const p = clamp((c - v.delay) / (1 - v.delay))
      const e = p * p * (3 - 2 * p)
      const s = Math.sin(e * Math.PI)
      v.x = v.fx + (v.bx - v.fx) * e + v.wx * s
      v.y = v.fy + (v.by - v.fy) * e + v.wy * s
      v.z = v.bz * e + v.wz * s - 0.05 * v.fx * v.fx * (1 - e)
    }
  }

  drawFlatSheet(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    rot = 0,
  ) {
    const w = size * 0.72
    const h = size * 1.02
    const halfW = w / 2
    const halfH = h / 2

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)

    // Soft realistic paper drop shadow
    ctx.shadowColor = "rgba(15, 23, 42, 0.25)"
    ctx.shadowBlur = Math.max(8, size * 0.08)
    ctx.shadowOffsetY = Math.max(3, size * 0.04)

    // Crisp sheet background
    const grad = ctx.createLinearGradient(-halfW, -halfH, halfW, halfH)
    grad.addColorStop(0, "#ffffff")
    grad.addColorStop(0.5, "#fafafa")
    grad.addColorStop(1, "#f4f4f5")
    ctx.fillStyle = grad

    ctx.beginPath()
    const r = Math.max(3, size * 0.02)
    ctx.roundRect(-halfW, -halfH, w, h, r)
    ctx.fill()

    // Reset shadow for crisp inner elements
    ctx.shadowColor = "transparent"
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    // Paper edge border
    ctx.strokeStyle = "rgba(100, 116, 139, 0.4)"
    ctx.lineWidth = 1
    ctx.stroke()

    // Red left margin line
    const marginX = -halfW + w * 0.18
    ctx.strokeStyle = "rgba(248, 113, 113, 0.65)"
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(marginX, -halfH + h * 0.06)
    ctx.lineTo(marginX, halfH - h * 0.06)
    ctx.stroke()

    // Ruled horizontal lines
    ctx.strokeStyle = "rgba(147, 197, 253, 0.55)"
    ctx.lineWidth = 1
    const lineSpacing = h * 0.075
    const startY = -halfH + h * 0.14
    for (let yy = startY; yy < halfH - h * 0.08; yy += lineSpacing) {
      ctx.beginPath()
      ctx.moveTo(marginX + w * 0.04, yy)
      ctx.lineTo(halfW - w * 0.08, yy)
      ctx.stroke()
    }

    // Subtle corner dog-ear curl
    ctx.fillStyle = "rgba(226, 232, 240, 0.75)"
    ctx.beginPath()
    ctx.moveTo(halfW - w * 0.12, halfH)
    ctx.lineTo(halfW, halfH - h * 0.08)
    ctx.lineTo(halfW - w * 0.12, halfH - h * 0.08)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  draw(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    c: number,
    rot = 0,
  ) {
    c = clamp(c)
    // Instant, ultra-smooth fast path for flat sheet
    if (c < 0.05) return this.drawFlatSheet(ctx, x, y, size, rot)
    if (c > 0.995) return this.drawBall(ctx, x, y, size * BALL_RATIO, rot)

    this.shape(c)
    const V = this.v
    const Ln = LIGHT_DIR

    for (let i = 0; i < this.tris.length; i++) {
      const t = this.tris[i]
      const a = V[t.i[0]]
      const b = V[t.i[1]]
      const d = V[t.i[2]]

      const e1x = b.x - a.x
      const e1y = b.y - a.y
      const e1z = b.z - a.z
      const e2x = d.x - a.x
      const e2y = d.y - a.y
      const e2z = d.z - a.z

      let nx = e1y * e2z - e1z * e2y
      let ny = e1z * e2x - e1x * e2z
      let nz = e1x * e2y - e1y * e2x
      let m = Math.hypot(nx, ny, nz) || 1
      nx /= m
      ny /= m
      nz /= m
      if (nz < 0) {
        nx = -nx
        ny = -ny
        nz = -nz
      }
      const k = 0.9 * c
      nx += t.n[0] * k
      ny += t.n[1] * k
      nz += t.n[2] * k
      m = Math.hypot(nx, ny, nz) || 1

      let tone = clamp((nx * Ln[0] + ny * Ln[1] + nz * Ln[2]) / m)
      tone = clamp(0.25 + 0.75 * tone + t.j * 0.08 * c)
      tone = (Math.round(tone * 5) / 5) * 0.55 + tone * 0.45
      const col =
        tone > 0.5
          ? mix(SHADE, LIGHT, (tone - 0.5) / 0.5)
          : mix(DEEP, SHADE, tone / 0.5)
      t.col = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`
      t.z = a.z + b.z + d.z
    }

    // In-place sort to avoid GC pressure
    this.sortedTris.sort((p, q) => p.z - q.z)

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.scale(size, size)
    ctx.lineJoin = "round"
    ctx.lineWidth = 1 / size

    for (let i = 0; i < this.sortedTris.length; i++) {
      const t = this.sortedTris[i]
      const a = V[t.i[0]]
      const b = V[t.i[1]]
      const d = V[t.i[2]]
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.lineTo(d.x, d.y)
      ctx.closePath()
      ctx.fillStyle = ctx.strokeStyle = t.col
      ctx.fill()
      ctx.stroke()
    }

    const la = 0.55 * (1 - c / 0.45)
    if (la > 0) {
      ctx.lineWidth = 1.2 / size
      ctx.strokeStyle = `rgba(110,132,196,${la})`
      for (let j = 2; j < N; j++) {
        ctx.beginPath()
        for (let i = 1; i < N; i++) {
          const p = V[j * (N + 1) + i]
          i === 1 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
        }
        ctx.stroke()
      }
      ctx.strokeStyle = `rgba(226,112,112,${la})`
      ctx.beginPath()
      for (let j = 1; j < N; j++) {
        const p = V[j * (N + 1) + 1]
        j === 1 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()
    }

    ctx.lineWidth = Math.max(1.4, size * 0.012) / size
    const pa = 0.85 * clamp(1 - (c - 0.4) / 0.2)
    if (pa > 0) {
      ctx.strokeStyle = INK + pa + ")"
      ctx.beginPath()
      this.perim.forEach((k, idx) =>
        idx ? ctx.lineTo(V[k].x, V[k].y) : ctx.moveTo(V[k].x, V[k].y),
      )
      ctx.closePath()
      ctx.stroke()
    }
    ctx.restore()
  }

  drawBall(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    diam: number,
    rot = 0,
  ) {
    if (!this.cache) {
      const S = 200
      const cv = document.createElement("canvas")
      cv.width = cv.height = S
      const c2d = cv.getContext("2d")
      if (c2d) this.draw(c2d, S / 2, S / 2, (S * 0.8) / BALL_RATIO, 0.994)
      this.cache = cv
    }
    const S = this.cache.width
    const k = diam / (S * 0.8)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.drawImage(this.cache, (-S * k) / 2, (-S * k) / 2, S * k, S * k)
    ctx.restore();
  }

  drawDualHeld(
    ctx: CanvasRenderingContext2D,
    leftPos: { x: number; y: number },
    rightPos: { x: number; y: number },
    size: number,
    c: number,
    tearStress: number,
  ) {
    const cx = (leftPos.x + rightPos.x) / 2;
    const cy = (leftPos.y + rightPos.y) / 2;
    const dx = rightPos.x - leftPos.x;
    const dy = rightPos.y - leftPos.y;
    const rot = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    this.draw(ctx, 0, 0, size, c, 0);

    // Jagged tension tear line down center if hands are pulling apart
    if (tearStress > 0.05) {
      ctx.save();
      const h = size * 0.52;
      ctx.strokeStyle = `rgba(239, 68, 68, ${Math.min(0.85, tearStress)})`;
      ctx.lineWidth = Math.max(2, size * 0.02);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, -h);
      ctx.lineTo(0, h);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([]);
      ctx.beginPath();
      for (let y = -h; y <= h; y += 6) {
        const jx = (Math.sin(y * 0.4) + (y % 8 - 4) * 0.5) * 4 * tearStress;
        if (y === -h) ctx.moveTo(jx, y);
        else ctx.lineTo(jx, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  drawTornPiece(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    c: number,
    rot: number,
    side: "left" | "right",
  ) {
    if (c > 0.92) {
      return this.drawBall(ctx, x, y, size * BALL_RATIO * 0.72, rot);
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    const halfW = size * 0.26;
    const halfH = size * 0.46;

    const grad = ctx.createLinearGradient(-halfW, -halfH, halfW, halfH);
    grad.addColorStop(0, "#fdfbf7");
    grad.addColorStop(1, "#eae6dc");
    ctx.fillStyle = grad;
    ctx.strokeStyle = "rgba(34, 40, 72, 0.75)";
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    if (side === "left") {
      ctx.moveTo(-halfW, -halfH);
      ctx.lineTo(0, -halfH);
      for (let py = -halfH; py <= halfH; py += 5) {
        ctx.lineTo((Math.sin(py * 0.3) + (py % 10 - 5) * 0.4) * 3.5, py);
      }
      ctx.lineTo(-halfW, halfH);
      ctx.closePath();
    } else {
      ctx.moveTo(halfW, -halfH);
      ctx.lineTo(0, -halfH);
      for (let py = -halfH; py <= halfH; py += 5) {
        ctx.lineTo((Math.sin(py * 0.3) + (py % 10 - 5) * 0.4) * 3.5, py);
      }
      ctx.lineTo(halfW, halfH);
      ctx.closePath();
    }

    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(110, 132, 196, 0.4)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const yy = -halfH + i * (size * 0.16);
      ctx.beginPath();
      if (side === "left") {
        ctx.moveTo(-halfW * 0.8, yy);
        ctx.lineTo(-halfW * 0.05, yy);
      } else {
        ctx.moveTo(halfW * 0.05, yy);
        ctx.lineTo(halfW * 0.8, yy);
      }
      ctx.stroke();
    }

    ctx.restore();
  }
}

const STACK_JITTER = (() => {
  const r = rng(42)
  return Array.from(
    { length: 40 },
    () => [r() - 0.5, r() - 0.5] as [number, number],
  )
})()

export function drawStack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  count: number,
  glow = 0,
  t = 0,
): { x: number; y: number } | null {
  const d = w * 0.42
  const th = Math.max(1.5, w * 0.026)
  const sheets = 3 + count * 2

  const g = ctx.createRadialGradient(
    x,
    y - d * 0.4,
    w * 0.1,
    x,
    y - d * 0.4,
    w * 0.75,
  )
  g.addColorStop(0, "rgba(30,36,80,0.32)")
  g.addColorStop(1, "rgba(30,36,80,0)")
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(x, y - d * 0.35, w * 0.72, d * 0.8, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.lineJoin = "round"
  let top: { quad: number[][]; ox: number; oy: number } | null = null
  for (let s = 0; s < sheets; s++) {
    const [jx, jy] = STACK_JITTER[s % 40]
    const ox = x + jx * w * 0.06
    const oy = y - s * th + jy * 2
    const quad = [
      [ox - w * 0.5, oy],
      [ox + w * 0.5, oy],
      [ox + w * 0.42, oy - d],
      [ox - w * 0.42, oy - d],
    ]
    const last = s === sheets - 1

    ctx.fillStyle = s % 2 ? "#dfe1ee" : "#eceef6"
    ctx.strokeStyle = "rgba(40,46,84,0.55)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(quad[0][0], quad[0][1])
    ctx.lineTo(quad[1][0], quad[1][1])
    ctx.lineTo(quad[1][0], quad[1][1] + th)
    ctx.lineTo(quad[0][0], quad[0][1] + th)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    const tg = ctx.createLinearGradient(ox, oy - d, ox, oy)
    tg.addColorStop(0, "#fffdf6")
    tg.addColorStop(1, "#eeeaf0")
    ctx.fillStyle = tg
    ctx.strokeStyle = last ? "rgba(34,40,72,0.9)" : "rgba(40,46,84,0.45)"
    ctx.lineWidth = last ? 1.6 : 1
    ctx.beginPath()
    quad.forEach(([qx, qy], i) => (i ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy)))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    if (last) top = { quad, ox, oy }
  }

  if (!top) return null
  const { quad, ox, oy } = top

  ctx.strokeStyle = "rgba(110,132,196,0.55)"
  ctx.lineWidth = 1
  for (let i = 1; i <= 5; i++) {
    const k = i / 6.5
    const yy = oy - d + d * k
    const inset = w * (0.42 + 0.08 * k) - w * 0.08
    ctx.beginPath()
    ctx.moveTo(ox - inset, yy)
    ctx.lineTo(ox + inset * (i === 5 ? 0.3 : 1), yy)
    ctx.stroke()
  }

  ctx.fillStyle = "rgba(255,196,130,0.12)"
  ctx.beginPath()
  quad.forEach(([qx, qy], i) => (i ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy)))
  ctx.fill()

  if (glow > 0) {
    const a = glow * (0.55 + 0.35 * Math.sin(t * 6))
    ctx.save()
    ctx.shadowColor = `rgba(255,170,80,${a})`
    ctx.shadowBlur = 18
    ctx.strokeStyle = `rgba(255,178,92,${a})`
    ctx.lineWidth = 3
    ctx.beginPath()
    quad.forEach(([qx, qy], i) => (i ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy)))
    ctx.closePath()
    ctx.stroke()
    ctx.restore()
  }

  return { x: ox, y: oy - d / 2 }
}
