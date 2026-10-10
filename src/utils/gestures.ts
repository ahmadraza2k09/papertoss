import type { GameMode, GestureState, HandFrame, ThrowMeasure } from "../types";
import { gameAudio } from "./audio";
import { CONFIG } from "./config";

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

type GesturesCallbacks = {
  pick?: () => void;
  crush?: (crumple: number) => void;
  crushed?: () => void;
  release?: (m: ThrowMeasure) => void;
  dropped?: () => void;
};

type BufferSample = { x: number; y: number; s: number; t: number };

export class Gestures {
  cb: GesturesCallbacks;
  mode: GameMode = "game";
  enabled = false;
  pileTest: (x: number, y: number) => boolean = () => false;
  maxPower = CONFIG.defaultMaxPower;

  state: GestureState = "idle";
  holdId: number | null = null;
  crumple = 0;
  target = 0;
  armed = false;
  dwell = 0;
  dwellProgress = 0;
  buf: BufferSample[] = [];
  miss = 0;
  lastSpeed = 0;
  liveSpeed = 0;
  pos: { x: number; y: number; angle: number } | null = null;
  hover = false;
  squeezing = false;
  pilePos: { x: number; y: number } = { x: 0, y: 0 };
  pickOrigin: { x: number; y: number } | null = null;
  pickGlide = 1;
  private lastT = 0;

  constructor(cb: GesturesCallbacks) {
    this.cb = cb;
    this.reset();
  }

  reset() {
    this.state = this.mode === "calibrate" ? "ball" : "idle";
    this.holdId = null;
    this.crumple = this.target = this.mode === "calibrate" ? 1 : 0;
    this.armed = false;
    this.dwell = 0;
    this.dwellProgress = 0;
    this.buf = [];
    this.miss = 0;
    this.lastSpeed = 0;
    this.liveSpeed = 0;
    this.pos = null;
    this.hover = false;
    this.squeezing = false;
    this.pickOrigin = null;
    this.pickGlide = 1;
  }

  isHandOverPile(h: HandFrame): boolean {
    if (this.pileTest(h.cx, h.cy) || this.pileTest(h.px, h.py)) return true;
    if (!h.lm || !h.lm.length) return false;
    // Check all fingertips and joints
    const checkJoints = [4, 8, 12, 16, 20, 5, 9, 3, 7];
    for (let i = 0; i < checkJoints.length; i++) {
      const idx = checkJoints[i];
      if (h.lm[idx] && this.pileTest(h.lm[idx][0], h.lm[idx][1])) {
        return true;
      }
    }
    return false;
  }

  rearm() {
    this.state = "ball";
    this.armed = false;
    this.buf = [];
  }

  update(hands: HandFrame[], t: number) {
    const dt = this.lastT ? Math.min(0.2, (t - this.lastT) / 1000) : 0;
    this.lastT = t;
    if (!this.enabled) return;

    // Single hand tracking: take the primary detected hand
    const primaryHand = hands.length > 0 ? hands[0] : null;

    switch (this.state) {
      case "idle": {
        // "mein hath paper par lay kar jaon to paper uthay or fold na ho"
        // Pick up when hand moves over the desk paper!
        const over = primaryHand && this.isHandOverPile(primaryHand);
        this.hover = !!over;
        this.dwellProgress = over ? 1 : 0;

        if (over && primaryHand) {
          this.holdId = primaryHand.id;
          this.state = "holding";
          this.crumple = 0; // Starts 100% FLAT!
          this.target = 0;
          this.dwell = 0;

          // Smooth glide initiation from desk paper position into hand
          this.pickGlide = 0;
          this.pickOrigin =
            this.pilePos && this.pilePos.x > 0
              ? { ...this.pilePos }
              : { x: primaryHand.cx, y: primaryHand.cy };
          this.pos = {
            x: this.pickOrigin.x,
            y: this.pickOrigin.y,
            angle: primaryHand.angle,
          };
          this.cb.pick?.();
        }
        break;
      }

      case "holding": {
        if (!primaryHand) {
          if (++this.miss > 90) {
            this.state = "idle";
            this.holdId = null;
            this.cb.dropped?.();
          }
          return;
        }
        this.miss = 0;

        // While gliding from desk to hand (first ~120ms), keep paper strictly 100% FLAT
        if (this.pickGlide < 1 && this.pickOrigin) {
          this.pickGlide = Math.min(1, this.pickGlide + dt * 10);
          this.crumple = 0; // Strictly flat! No folding during pickup!
          const ease = 1 - Math.pow(1 - this.pickGlide, 3);
          const curX = lerp(this.pickOrigin.x, primaryHand.cx, ease);
          const curY = lerp(
            this.pickOrigin.y,
            primaryHand.cy - primaryHand.size * 0.35,
            ease,
          );
          this.pos = {
            x: curX,
            y: curY,
            angle: primaryHand.angle,
          };
          this.cb.crush?.(0);
          break;
        }

        // "phir jab mein apna hath fold karon tab paper bi fold ho"
        // If hand is open or relaxed (closure <= 0.36), paper STAYS 100% FLAT!
        // Only when fingers intentionally curl (closure > 0.36), paper folds proportionally!
        let targetCrumple = 0;
        if (primaryHand.closure > 0.36) {
          targetCrumple = clamp((primaryHand.closure - 0.36) / 0.28);
        }

        const delta = Math.abs(targetCrumple - this.crumple);

        // ASMR creasing crackles triggered strictly on finger curling movement
        if (delta > 0.02 && targetCrumple > 0.05) {
          gameAudio.playFoldCrease(delta, primaryHand.closure);
        }

        // Responsive folding strictly following finger curling
        this.crumple += (targetCrumple - this.crumple) * Math.min(1, dt * 16);

        const k = clamp(this.crumple * 1.3);
        const targetX = primaryHand.cx;
        const targetY = lerp(
          primaryHand.cy - primaryHand.size * 0.35,
          primaryHand.cy - primaryHand.size * 0.1,
          k,
        );
        const targetAngle = primaryHand.angle;

        if (this.pos) {
          const smoothK = Math.min(1, dt * 25);
          this.pos.x += (targetX - this.pos.x) * smoothK;
          this.pos.y += (targetY - this.pos.y) * smoothK;
          this.pos.angle = targetAngle;
        } else {
          this.pos = { x: targetX, y: targetY, angle: targetAngle };
        }

        this.cb.crush?.(this.crumple);

        // Turn permanently into paper ball only when hand is firmly clenched into a fist
        if (primaryHand.closure >= 0.64 && this.crumple >= 0.82) {
          this.state = "ball";
          this.crumple = 1;
          this.armed = true;
          this.buf = [];
          this.cb.crushed?.();
        }
        break;
      }

      case "ball": {
        if (!primaryHand) {
          if (this.mode === "calibrate" && this.holdId == null) {
            const fist = hands.find((h) => h.closure > CONFIG.gripClosure);
            if (fist) {
              this.holdId = fist.id;
              this.armed = true;
              this.buf = [];
              this.pushSample(fist, t);
            }
            return;
          }
          this.miss++;
          const [a, b] = CONFIG.dropoutFrames;
          const fast = this.lastSpeed > Math.max(3, this.maxPower * 0.35);
          if (this.armed && fast && this.miss >= a && this.miss <= b) {
            this.release(true);
          }
          return;
        }

        this.miss = 0;
        this.pushSample(primaryHand, t);
        const targetX = primaryHand.cx;
        const targetY = primaryHand.cy - primaryHand.size * 0.12;
        const targetAngle = primaryHand.angle;
        if (this.pos) {
          const smoothK = Math.min(1, dt * 25);
          this.pos.x += (targetX - this.pos.x) * smoothK;
          this.pos.y += (targetY - this.pos.y) * smoothK;
          this.pos.angle = targetAngle;
        } else {
          this.pos = { x: targetX, y: targetY, angle: targetAngle };
        }

        if (!this.armed) {
          if (primaryHand.closure > CONFIG.gripClosure) {
            this.armed = true;
            this.buf = [];
          }
        } else if (primaryHand.closure < CONFIG.releaseClosure) {
          this.release(false);
        }
        break;
      }
    }
  }

  tick(_dt: number) {}

  pushSample(h: HandFrame, t: number) {
    const b = this.buf;
    b.push({ x: h.cx, y: h.cy, s: h.size, t });
    if (b.length > CONFIG.bufferFrames) b.shift();
    this.lastSpeed = segSpeed(b, b.length - 1);
    let live = 0;
    for (let i = Math.max(1, b.length - 3); i < b.length; i++) {
      live = Math.max(live, segSpeed(b, i));
    }
    this.liveSpeed = live;
  }

  measure(): ThrowMeasure {
    const b = this.buf;
    if (b.length < 2) return { raw: 0, dx: 0, dy: -1 };
    const tEnd = b[b.length - 1].t;
    let best = 0;
    let bi = b.length - 1;
    for (let i = 1; i < b.length; i++) {
      if (tEnd - b[i].t > CONFIG.peakWindowMs) continue;
      const sp = segSpeed(b, i);
      if (sp > best) {
        best = sp;
        bi = i;
      }
    }
    const a = b[Math.max(0, bi - 2)];
    const c = b[Math.min(b.length - 1, bi + 1)];
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const n = Math.hypot(dx, dy) || 1;
    return { raw: best, dx: dx / n, dy: dy / n };
  }

  release(fromDropout: boolean) {
    const m = this.measure();
    m.dropout = fromDropout;
    this.state = "done";
    this.armed = false;
    this.cb.release?.(m);
  }
}

function segSpeed(b: BufferSample[], i: number): number {
  if (i < 1) return 0;
  const p = b[i];
  const q = b[i - 1];
  const dt = (p.t - q.t) / 1000;
  if (dt <= 0) return 0;
  return Math.hypot(p.x - q.x, p.y - q.y) / dt / ((p.s + q.s) / 2);
}
