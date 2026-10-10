// OneEuro filter for smooth low-latency landmark tracking
export class OneEuro {
  private minCutoff: number
  private beta: number
  private dCutoff: number
  private xPrev: number | null = null
  private dxPrev: number | null = null
  private tPrev: number | null = null

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
  }

  filter(x: number, t: number): number {
    if (this.tPrev === null || this.xPrev === null || this.dxPrev === null) {
      this.xPrev = x
      this.dxPrev = 0
      this.tPrev = t
      return x
    }

    const dt = Math.max(0.001, (t - this.tPrev) / 1000)
    this.tPrev = t

    const dx = (x - this.xPrev) / dt
    const edx =
      alpha(dt, this.dCutoff) * dx + (1 - alpha(dt, this.dCutoff)) * this.dxPrev
    this.dxPrev = edx

    const cutoff = this.minCutoff + this.beta * Math.abs(edx)
    const a = alpha(dt, cutoff)
    const xFiltered = a * x + (1 - a) * this.xPrev
    this.xPrev = xFiltered

    return xFiltered
  }

  reset() {
    this.xPrev = null
    this.dxPrev = null
    this.tPrev = null
  }
}

function alpha(dt: number, cutoff: number): number {
  const tau = 1.0 / (2 * Math.PI * cutoff)
  return 1.0 / (1.0 + tau / dt)
}
