export type HandPoint = [number, number]

export type HandFrame = {
  id: number
  cx: number
  cy: number
  size: number
  pinch: boolean
  px: number
  py: number
  closure: number // 0 = open, 1 = fist
  angle: number
  lm: HandPoint[]
  n: HandPoint[] | null
  t: number
}

export type GestureState = "idle" | "holding" | "ball" | "done"

export type ThrowMeasure = {
  raw: number
  dx: number
  dy: number
  dropout?: boolean
}

export type LevelConfig = {
  z: number // Distance to bin
  p: number // Target power (0..1)
  wind: number // Max wind strength
}

export type GameMode = "menu" | "calibrate" | "play"
export type ScreenId = "landing" | "instructions" | "calibrate" | "game" | "levelEnd" | "final"

export type HUDStats = {
  level: number
  levels: number
  throwNo: number
  throws: number
  score: number
  streak: number
  levelScore: number
  goal: number
  results: boolean[]
  current: number
}

export type LevelEndResult = {
  level: number
  last: boolean
  cleared: boolean
  levelScore: number
  total: number
}
