export type GameStage = "lift" | "fold" | "throw" | "flying" | "result";

export type HandData = {
  detected: boolean;
  gesture: "Open palm" | "Fist" | "Moving" | "No hand";
  x: number;
  y: number;
  z: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  speed: number;
};

export const EMPTY_HAND: HandData = {
  detected: false,
  gesture: "No hand",
  x: 0.5,
  y: 0.5,
  z: 0,
  velocityX: 0,
  velocityY: 0,
  velocityZ: 0,
  speed: 0,
};
