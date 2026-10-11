export type Landmark = { x: number y: number z: number }

export type Gesture = "open" | "fist" | "neutral" | "none"

export type TrackingFrame = {
  landmarks: Landmark[] | null
  gesture: Gesture
  confidence: number
  velocity: number
  lateral: number
  handedness: "Left" | "Right" | null
}

export type BallState = "sheet" | "held" | "crumpled" | "flying" | "spent"

export type LevelConfig = {
  name: string
  subtitle: string
  distance: number
  wind: number
  palette: "morning" | "greenhouse" | "evening"
  difficulty: string
}

export const LEVELS: LevelConfig[] = [
  {
    name: "The Studio",
    subtitle: "Warm light, still air",
    distance: 5.5,
    wind: 0,
    palette: "morning",
    difficulty: "Easy",
  },
  {
    name: "The Conservatory",
    subtitle: "A longer shot with a light draft",
    distance: 6.7,
    wind: 0.32,
    palette: "greenhouse",
    difficulty: "Medium",
  },
  {
    name: "After Hours",
    subtitle: "Long range, shifting crosswind",
    distance: 7.8,
    wind: 0.58,
    palette: "evening",
    difficulty: "Expert",
  },
]
