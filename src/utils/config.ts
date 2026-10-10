import type { LevelConfig } from "../types";

export const CONFIG = {
  throwsPerLevel: 5,
  goalPerLevel: 3,
  defaultMaxPower: 14.0, // Hand widths per second for maximum throw
  minMaxPower: 6.0,
  pickDwell: 0.05,       // Seconds to dwell over paper stack to pick (instant & snappy)
  pinchOn: 0.42,
  pinchOff: 0.65,
  fingersOpen: 1.1,
  fingersClosed: 0.42,
  crushTrigger: 0.45,
  gripClosure: 0.6,
  releaseClosure: 0.35,
  crumpleSeconds: 0.75,
  dropoutFrames: [2, 10] as [number, number],
  bufferFrames: 12,
  peakWindowMs: 220,
  wind: false,           // Wind obstacle disabled per user request
};

// 3 office distance levels down the hallway aisle
export const LEVELS: LevelConfig[] = [
  { z: 2.1, p: 0.45, wind: 0 }, // Level 1: Near the desk
  { z: 3.2, p: 0.62, wind: 0 }, // Level 2: Middle of the office aisle
  { z: 4.3, p: 0.80, wind: 0 }, // Level 3: Far down the hallway
];

export const ZONE = 0.16; // Half width of target green band on power meter

export const BAND_NAMES = ["Soft", "Good", "Hard", "Max"];
