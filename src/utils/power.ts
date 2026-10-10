import { BAND_NAMES, CONFIG } from "./config"

export function mapPower(
  rawSpeed: number,
  maxPower: number = CONFIG.defaultMaxPower,
): number {
  if (rawSpeed <= 0) return 0
  const ratio = Math.min(1.5, rawSpeed / maxPower)
  return Math.min(1, Math.max(0, Math.pow(ratio, 0.85)))
}

export function bandOf(power: number): number {
  if (power < 0.35) return 0 // Soft
  if (power < 0.65) return 1 // Good
  if (power < 0.88) return 2 // Hard
  return 3 // Max
}

export function bandName(power: number): string {
  return BAND_NAMES[bandOf(power)]
}
