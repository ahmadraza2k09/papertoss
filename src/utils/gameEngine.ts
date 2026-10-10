import type { GameMode, HandFrame, HUDStats, LevelEndResult, ThrowMeasure } from "../types";
import { gameAudio } from "./audio";
import { BAND_NAMES, CONFIG, LEVELS, ZONE } from "./config";
import type { Gestures } from "./gestures";
import { drawStack, ProceduralPaper, rng } from "./paper";
import { bandOf, mapPower } from "./power";

const Z0 = 0.6;           // camera to throwing plane
const CAM_H = 1.25;       // office chair eye height
const G = 4.2;            // realistic gravity
const RB = 0.38;          // bin mouth radius
const HB = RB * 2.1;      // bin height
const PR = 0.07;          // paper ball physics radius
const PR_VIS = 0.095;     // visual ball radius
const ARC_VY = 2.45;      // upward launch speed

const BIN_RIM_W = 0.94;
const BIN_BASE_Y = 0.90;

const Z_PER_P = (LEVELS[2].z - LEVELS[0].z) / (LEVELS[2].p - LEVELS[0].p);
const ASSIST = ZONE * Z_PER_P * 0.9;
const powerToDistance = (p: number) => Math.max(0.3, LEVELS[0].z + (p - LEVELS[0].p) * Z_PER_P);

const HAND_FINGERS = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [0, 17, 18, 19, 20],
  [5, 9, 13, 17],
];
const HAND_PALM = [0, 1, 5, 9, 13, 17];
const TIPS = [4, 8, 12, 16, 20];

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

type GameEngineOptions = {
  canvas: HTMLCanvasElement;
  gestures: Gestures;
  binImage?: HTMLImageElement;
  onHUDUpdate: (stats: HUDStats) => void;
  onToast: (text: string, kind?: string) => void;
  onMeterUpdate: (power: number, live: boolean) => void;
  onZoneUpdate: (lo: number, hi: number) => void;
  onWindUpdate: (wind: number, max: number) => void;
  onPromptUpdate: (prompt: string) => void;
  onLevelEnd: (result: LevelEndResult) => void;
};

export class GameEngine {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  gestures: Gestures;
  binImage: HTMLImageElement;
  officeImage: HTMLImageElement;

  onHUDUpdate: (stats: HUDStats) => void;
  onToast: (text: string, kind?: string) => void;
  onMeterUpdate: (power: number, live: boolean) => void;
  onZoneUpdate: (lo: number, hi: number) => void;
  onWindUpdate: (wind: number, max: number) => void;
  onPromptUpdate: (prompt: string) => void;
  onLevelEnd: (result: LevelEndResult) => void;

  paper = new ProceduralPaper(5);
  mode: GameMode = "menu";
  calMax = CONFIG.defaultMaxPower;
  level = 0;
  throwIdx = 0;
  total = 0;
  streak = 0;
  levelScore = 0;
  results: boolean[] = [];
  binBalls = 0;
  phase: "ready" | "inhand" | "flying" | "between" | "over" = "ready";
  meter = 0;
  pickFlash = 0;
  t = 0;

  hands: HandFrame[] = [];
  papers: Array<{ X: number; Z: number; rot: number }> = [];
  flying: {
    X: number;
    Y: number;
    Z: number;
    vX: number;
    vY: number;
    vZ: number;
    rot: number;
    vr: number;
    age: number;
    state: "fly" | "in" | "rest";
    inT?: number;
    from?: { X: number; Y: number; Z: number };
    to?: { X: number; Y: number; Z: number };
    ox: number;
    oy: number;
    s0: number;
    done: boolean;
    p: number;
    short: boolean;
    long: boolean;
    landed?: boolean;
  } | null = null;

  r = rng(Date.now() & 0xffff);

  W = 800;
  H = 600;
  sw = 800;
  sh = 600;
  sx = 0;
  sy = 0;
  F = 300;
  cx = 400;
  hz = 300;
  stackW = 120;
  stackX = 600;
  stackY = 500;
  heldSize = 140;
  binScreen = { x: 0, y: 0, w: 0, h: 0, baseX: 0, baseY: 0, rimW: 0 };

  constructor(opts: GameEngineOptions) {
    this.cv = opts.canvas;
    const ctx = this.cv.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");
    this.ctx = ctx;
    this.gestures = opts.gestures;

    this.binImage = opts.binImage || new Image();
    if (!this.binImage.src) {
      this.binImage.src = "/assets/bin.png";
    }

    this.officeImage = new Image();
    this.officeImage.src = "/assets/office_background.jpg";

    this.onHUDUpdate = opts.onHUDUpdate;
    this.onToast = opts.onToast;
    this.onMeterUpdate = opts.onMeterUpdate;
    this.onZoneUpdate = opts.onZoneUpdate;
    this.onWindUpdate = opts.onWindUpdate;
    this.onPromptUpdate = opts.onPromptUpdate;
    this.onLevelEnd = opts.onLevelEnd;

    this.resize();
  }

  resize() {
    const dpr = Math.min(1.25, window.devicePixelRatio || 1);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.cv.width = this.W * dpr;
    this.cv.height = this.H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 16:9 office perspective stage covering the screen
    const s = Math.max(this.W / 16, this.H / 9);
    this.sw = 16 * s;
    this.sh = 9 * s;
    this.sx = (this.W - this.sw) / 2;
    this.sy = (this.H - this.sh) / 2;

    this.F = 0.58 * this.sh;
    this.cx = this.sx + this.sw * 0.495; // Aligned with the center of the office aisle
    this.hz = this.sy + this.sh * 0.42;  // Perspective horizon down the cubicle corridor

    // Paper stack positioned comfortably on the right wooden desk
    this.stackW = Math.max(105, 0.12 * this.sw);
    this.stackX = Math.min(this.sx + 0.74 * this.sw, this.W - this.stackW * 1.1);
    this.stackY = Math.min(this.sy + 0.70 * this.sh, this.H - 75);

    this.updatePileHitbox();

    if (this.level != null) this.lockBin();
  }

  updatePileHitbox(customPile?: { x: number; y: number }) {
    const px = customPile ? customPile.x : this.stackX;
    const py = customPile ? customPile.y : this.stackY - this.stackW * 0.2;
    // Generous reachable desk zone on the right
    const rx = this.stackW * 1.8;
    const ry = this.stackW * 1.5;
    this.gestures.pilePos = { x: px, y: py };
    this.gestures.pileTest = (x: number, y: number) => {
      if (this.phase !== "ready") return false;
      const dx = (x - px) / rx;
      const dy = (y - py) / ry;
      return dx * dx + dy * dy <= 1.0;
    };
  }

  proj(X: number, Y: number, Z: number) {
    const k = this.F / (Z + Z0);
    return { x: this.cx + X * k, y: this.hz + (CAM_H - Y) * k, k };
  }

  lockBin() {
    const z = LEVELS[this.level].z;
    const p = this.proj(0, 0, z);
    const rimW = 2 * RB * p.k;
    const binW = this.binImage.width || 240;
    const binH = this.binImage.height || 270;
    const w = rimW / BIN_RIM_W;
    const h = w * (binH / binW);
    this.binScreen = { x: p.x - w / 2, y: p.y - h * BIN_BASE_Y, w, h, baseX: p.x, baseY: p.y, rimW };
  }

  startGame(calMax: number) {
    this.calMax = calMax;
    this.total = 0;
    this.streak = 0;
    this.startLevel(0);
  }

  startLevel(i: number) {
    this.mode = "play";
    this.level = i;
    this.throwIdx = 0;
    this.levelScore = 0;
    this.results = [];
    this.papers = [];
    this.binBalls = 0;
    this.flying = null;
    this.lockBin();

    this.onZoneUpdate(LEVELS[i].p - ZONE, LEVELS[i].p + ZONE);
    gameAudio.startLoops();
    this.newThrow();
  }

  newThrow() {
    this.phase = "ready";
    this.gestures.mode = "game";
    this.gestures.reset();
    this.gestures.enabled = true;
    this.gestures.maxPower = this.calMax;
    this.updatePileHitbox();
    this.onWindUpdate(0, 0); // Wind obstacle removed
    this.hud();
  }

  hud() {
    this.onHUDUpdate({
      level: this.level + 1,
      levels: LEVELS.length,
      throwNo: Math.min(this.throwIdx + 1, CONFIG.throwsPerLevel),
      throws: CONFIG.throwsPerLevel,
      score: this.total,
      streak: this.streak,
      levelScore: this.levelScore,
      goal: CONFIG.goalPerLevel,
      results: this.results,
      current: this.throwIdx,
    });
  }

  onPick() {
    this.phase = "inhand";
    this.pickFlash = 1;
    gameAudio.playPick();
  }

  onCrushed() {
    gameAudio.crinkleStop();
  }

  onDropped() {
    this.phase = "ready";
    gameAudio.crinkleStop();
    this.onToast("Dropped it. Grab another sheet from the desk.");
  }

  onRelease(th: ThrowMeasure) {
    const p = mapPower(th.raw, this.calMax);
    if (p <= 0.05) {
      this.gestures.rearm();
      this.onToast("Too soft. Give it a proper flick towards the bin.");
      return;
    }
    const band = bandOf(p);
    const lvl = LEVELS[this.level];
    const pos = this.gestures.pos || { x: this.cx, y: this.hz, angle: 0 };
    const X0 = ((pos.x - this.cx) * Z0) / this.F;
    const Y0 = clamp(CAM_H - ((pos.y - this.hz) * Z0) / this.F, 0.85, 1.6);

    let Zt = powerToDistance(p);
    const side = Math.abs(th.dx) < 0.22 ? 0 : th.dx - Math.sign(th.dx) * 0.22;
    let Xt = side * 1.3;
    const off = Math.hypot(Xt, Zt - lvl.z);
    if (off < ASSIST) {
      Xt *= 0.12;
      Zt = lvl.z + (Zt - lvl.z) * 0.12;
    }

    const tF = (ARC_VY + Math.sqrt(ARC_VY * ARC_VY + 2 * G * Math.max(0, Y0 - HB))) / G;
    const s0 = this.proj(X0, Y0, 0);
    const heldDiam = (this.heldSize || 140) * this.paper.ballRatio;

    this.flying = {
      X: X0,
      Y: Y0,
      Z: 0,
      vX: (Xt - X0) / tF,
      vY: ARC_VY,
      vZ: Zt / tF,
      rot: pos.angle || 0,
      vr: (this.r() - 0.5) * 14,
      age: 0,
      state: "fly",
      ox: pos.x - s0.x,
      oy: pos.y - s0.y,
      s0: heldDiam / (2 * PR_VIS * s0.k),
      done: false,
      p,
      short: p < lvl.p - ZONE,
      long: p > lvl.p + ZONE,
    };

    this.phase = "flying";
    this.meter = p;
    this.onMeterUpdate(p, false);
    this.onToast(`${BAND_NAMES[band]} throw`, "band");
    gameAudio.playWhoosh(0.55, p);
  }

  resolve(hit: boolean) {
    const f = this.flying;
    if (!f || f.done) return;
    f.done = true;

    if (hit) {
      this.streak++;
      const pts = this.streak * 100;
      this.levelScore += pts;
      this.total += pts;
      this.onToast(this.streak > 1 ? `Swish! +${pts} (${this.streak} in a row!)` : `In the bin! +${pts}`, "hit");
      gameAudio.playCelebration(this.streak);
      this.binBalls++;
    } else {
      const tip = f.short ? "A bit more power next time" : f.long ? "A little softer next time" : "Just missed the rim. Aim straight";
      this.onToast(this.streak > 0 ? `${tip}. Streak reset.` : `${tip}.`, "miss");
      this.streak = 0;
      this.papers.push({ X: f.X, Z: f.Z, rot: f.rot });
    }

    this.results.push(hit);
    this.throwIdx++;
    this.hud();
    this.phase = "between";

    setTimeout(() => {
      if (this.mode !== "play") return;
      this.flying = null;
      if (this.throwIdx >= CONFIG.throwsPerLevel) {
        this.phase = "over";
        this.gestures.enabled = false;
        this.onLevelEnd({
          level: this.level,
          last: this.level === LEVELS.length - 1,
          cleared: this.levelScore >= CONFIG.goalPerLevel * 100,
          levelScore: this.levelScore,
          total: this.total,
        });
      } else {
        this.newThrow();
      }
    }, hit ? 900 : 1100);
  }

  update(dt: number, t: number) {
    this.t = t / 1000;
    const g = this.gestures;
    g.tick(dt);

    this.pickFlash = Math.max(0, (this.pickFlash || 0) - dt * 1.6);
    if (this.mode === "play" || this.mode === "calibrate") {
      if (g.state === "holding") {
        gameAudio.crinkle(g.crumple, dt);
      }
      if (g.state === "ball" && g.armed) {
        const p = mapPower(g.liveSpeed, this.calMax);
        this.meter = Math.max(p, this.meter - dt * 0.9);
        this.onMeterUpdate(this.meter, true);
      } else if (this.phase !== "flying" && this.phase !== "between") {
        this.meter = Math.max(0, this.meter - dt * 1.5);
        this.onMeterUpdate(this.meter, false);
      }
    }

    if (this.mode === "play") {
      this.updateFlight(dt);
      this.onPromptUpdate(this.promptText());
    }
  }

  updateFlight(dt: number) {
    const f = this.flying;
    if (!f) return;
    f.age += dt;
    const bz = LEVELS[this.level].z;

    if (f.state === "fly") {
      const pY = f.Y;
      f.X += f.vX * dt;
      f.Y += f.vY * dt;
      f.Z += f.vZ * dt;
      f.vY -= G * dt;
      f.rot += f.vr * dt;

      const dx = f.X;
      const dz = f.Z - bz;
      const d = Math.hypot(dx, dz) || 1e-6;

      // Crossing mouth height
      if (!f.done && pY > HB && f.Y <= HB) {
        if (d < RB - 0.02) {
          f.state = "in";
          f.inT = 0;
          f.from = { X: f.X, Y: f.Y, Z: f.Z };
          f.to = this.binSlot(this.binBalls);
          gameAudio.playScoreInside();
        } else if (d < RB + PR) {
          f.vX = (dx / d) * 1.1 + f.vX * 0.3;
          f.vZ = (dz / d) * 1.1 + f.vZ * 0.2;
          f.vY = Math.abs(f.vY) * 0.38;
          f.Y = HB + 0.01;
          gameAudio.playRimHit();
          this.onToast("Off the rim!");
        }
      } else if (f.Y < HB && d < RB + PR) {
        const nx = dx / d;
        const nz = dz / d;
        const vn = f.vX * nx + f.vZ * nz;
        if (vn < 0) {
          f.vX -= 1.6 * vn * nx;
          f.vZ -= 1.6 * vn * nz;
          gameAudio.playRimHit();
        }
      }

      if (f.Z > 11) f.vZ = -Math.abs(f.vZ) * 0.3;

      // Hitting the office carpet floor
      if (f.Y <= PR) {
        f.Y = PR;
        if (!f.landed) {
          f.landed = true;
          gameAudio.playCarpetBounce();
        }
        if (Math.abs(f.vY) > 0.7) {
          f.vY = -f.vY * 0.28;
          f.vX *= 0.55;
          f.vZ *= 0.55;
        } else {
          f.vY = 0;
          const fr = Math.pow(0.015, dt);
          f.vX *= fr;
          f.vZ *= fr;
          f.vr *= fr;
          if (Math.hypot(f.vX, f.vZ) < 0.05) {
            f.state = "rest";
            this.resolve(false);
          }
        }
      }
      if (f.age > 4.5) this.resolve(false);
    } else if (f.state === "in") {
      f.inT = (f.inT || 0) + dt;
      const k = Math.min(1, f.inT / 0.32);
      const e = k * k;
      if (f.from && f.to) {
        f.X = lerp(f.from.X, f.to.X, k);
        f.Z = lerp(f.from.Z, f.to.Z, k);
        f.Y = lerp(f.from.Y, f.to.Y, e);
      }
      f.rot += f.vr * dt;
      if (k >= 1) this.resolve(true);
    }
  }

  promptText(): string {
    const g = this.gestures;
    if (this.phase === "flying" || this.phase === "between" || this.phase === "over") return "";
    if (!this.hands.length && g.state !== "ball" && g.state !== "holding") {
      return "Show your right hand to the camera (or click the desk paper to pick it up)";
    }
    switch (g.state) {
      case "idle":
        return g.hover
          ? "Paper in reach! Hover over paper to pick it up..."
          : "Move your right hand over the paper stack on the desk";
      case "holding":
        return g.crumple > 0.15
          ? "Paper creasing! Squeeze your fist tight to make a paper ball!"
          : "Paper in hand! Squeeze your hand into a fist to fold and crumple it!";
      case "ball":
        return g.armed
          ? "Aim down the aisle at the dustbin and throw (release hand)!"
          : "Make a fist to hold the ball.";
      default:
        return "";
    }
  }

  render() {
    const c = this.ctx;
    c.clearRect(0, 0, this.W, this.H);

    // Draw the realistic office background
    this.drawOfficeBackground(c);

    // Draw the office world (dustbin on floor, paper stack on desk)
    this.drawWorld(c);

    if (this.mode === "play") {
      this.drawHands(c);
    }
  }

  drawOfficeBackground(c: CanvasRenderingContext2D) {
    if (this.officeImage.complete && this.officeImage.naturalWidth) {
      c.drawImage(this.officeImage, this.sx, this.sy, this.sw, this.sh);
    } else {
      // Fallback office gradient
      const grad = c.createLinearGradient(0, 0, 0, this.H);
      grad.addColorStop(0, "#cbd5e1");
      grad.addColorStop(0.42, "#94a3b8");
      grad.addColorStop(0.43, "#64748b");
      grad.addColorStop(1, "#334155");
      c.fillStyle = grad;
      c.fillRect(0, 0, this.W, this.H);
    }
  }

  drawWorld(c: CanvasRenderingContext2D) {
    const bz = LEVELS[this.level].z;

    const items: Array<{ z: number; d: () => void }> = [
      { z: bz, d: () => this.drawBin(c) },
    ];

    for (const p of this.papers) {
      items.push({ z: p.Z, d: () => this.drawFloorPaper(c, p) });
    }
    const f = this.flying;
    if (f) {
      items.push({ z: f.state === "in" ? bz - 0.01 : f.Z, d: () => this.drawFlying(c, f) });
    }

    items.sort((a, b) => b.z - a.z).forEach((it) => it.d());

    // Paper stack resting naturally on the office desk on the right
    const g = this.gestures;
    const left =
      CONFIG.throwsPerLevel -
      this.throwIdx -
      (this.phase === "inhand" ? 1 : 0) -
      (this.phase === "flying" ? 1 : 0);
    const glow =
      g.state === "idle" && this.phase === "ready"
        ? g.hover
          ? 1.0
          : 0.35
        : 0;

    const pile = drawStack(c, this.stackX, this.stackY, this.stackW, Math.max(0, left), glow, this.t);
    if (pile) {
      this.updatePileHitbox(pile);
      const n = Math.max(0, left);
      c.font = `700 ${Math.round(Math.max(12, this.stackW * 0.11))}px "DM Sans", system-ui, sans-serif`;
      c.textAlign = "center";
      c.fillStyle = "#ffffff";
      c.shadowColor = "rgba(0,0,0,0.7)";
      c.shadowBlur = 8;
      c.fillText(
        n === 0 ? "Last Sheet" : `${n} ${n === 1 ? "sheet" : "sheets"} left`,
        this.stackX,
        this.stackY + Math.max(22, this.stackW * 0.24),
      );
      c.shadowBlur = 0;
    }
  }

  drawBin(c: CanvasRenderingContext2D) {
    const b = this.binScreen;

    // Realistic soft contact shadow on office carpet
    const g = c.createRadialGradient(b.baseX, b.baseY, 0, b.baseX, b.baseY, b.rimW * 0.72);
    g.addColorStop(0, "rgba(15, 20, 30, 0.58)");
    g.addColorStop(0.6, "rgba(15, 20, 30, 0.24)");
    g.addColorStop(1, "rgba(15, 20, 30, 0)");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(b.baseX, b.baseY + 2, b.rimW * 0.75, b.rimW * 0.24, 0, 0, Math.PI * 2);
    c.fill();

    const inside: Array<{ X: number; Y: number; Z: number; rot: number }> = [];
    for (let i = 0; i < this.binBalls; i++) {
      inside.push({ ...this.binSlot(i), rot: i * 1.7 });
    }
    const f = this.flying;
    if (f && f.state === "in") {
      inside.push({ X: f.X, Y: f.Y, Z: f.Z, rot: f.rot });
    }

    const drawInside = () =>
      inside.forEach((q) => {
        const p = this.proj(q.X, q.Y, q.Z);
        this.paper.drawBall(c, p.x, p.y, 2 * PR_VIS * p.k, q.rot);
      });

    drawInside();

    if (this.binImage.complete && this.binImage.naturalWidth) {
      c.drawImage(this.binImage, b.x, b.y, b.w, b.h);
    }

    // Inside shadow and crumpled paper visibility through wire mesh
    if (inside.length) {
      const top = b.y + b.h * 0.12;
      const half = b.rimW / 2;
      c.save();
      c.beginPath();
      c.moveTo(b.baseX - half, top);
      c.lineTo(b.baseX + half, top);
      c.lineTo(b.baseX + half * 0.65, b.baseY);
      c.lineTo(b.baseX - half * 0.65, b.baseY);
      c.closePath();
      c.clip();
      c.globalAlpha = 0.45;
      drawInside();
      c.restore();
    }
  }

  binSlot(n: number) {
    const spots = [
      [-0.28, -0.12],
      [0.26, -0.05],
      [0, 0.2],
    ];
    const [sx, sz] = spots[n % 3];
    const layer = Math.floor(n / 3);
    return {
      X: sx * RB,
      Y: PR_VIS * 0.9 + layer * PR_VIS * 1.45,
      Z: LEVELS[this.level].z + sz * RB,
    };
  }

  drawFloorPaper(
    c: CanvasRenderingContext2D,
    p: { X: number; Z: number; rot: number },
  ) {
    const s = this.proj(p.X, PR * 0.8, p.Z);
    this.shadow(c, p.X, p.Z, 2 * PR_VIS * s.k, 0.38);
    this.paper.drawBall(c, s.x, s.y, 2 * PR_VIS * s.k, p.rot);
  }

  drawFlying(
    c: CanvasRenderingContext2D,
    f: NonNullable<GameEngine["flying"]>,
  ) {
    const s = this.proj(f.X, f.Y, f.Z);
    const k = clamp(f.age / 0.22);
    const scale = lerp(f.s0, 1, k);
    const diam = 2 * PR_VIS * s.k * scale;
    if (f.state !== "in") {
      this.shadow(c, f.X, f.Z, diam, 0.34 * clamp(1 - (f.Y - PR) / 1.5));
    }
    if (f.state === "in") return;
    this.paper.drawBall(c, s.x + f.ox * (1 - k), s.y + f.oy * (1 - k), diam, f.rot);
  }

  shadow(c: CanvasRenderingContext2D, X: number, Z: number, diam: number, a: number) {
    if (a <= 0.01) return;
    const s = this.proj(X, 0, Z);
    c.fillStyle = `rgba(15, 20, 30, ${a})`;
    c.beginPath();
    c.ellipse(s.x, s.y, diam * 0.58, diam * 0.18, 0, 0, Math.PI * 2);
    c.fill();
  }

  drawHands(c: CanvasRenderingContext2D) {
    const g = this.gestures;

    // Draw single sleek hand skeleton
    const h = this.hands[0];
    if (h && h.lm) {
      const holding = g.state === "holding" || g.state === "ball";
      const accent = holding ? "59,130,246" : "96,165,250";
      const P = h.lm;
      const s = h.size;

      c.save();
      c.lineCap = c.lineJoin = "round";
      c.fillStyle = "rgba(59,130,246,0.06)";
      c.beginPath();
      HAND_PALM.forEach((i, n) =>
        n ? c.lineTo(P[i][0], P[i][1]) : c.moveTo(P[i][0], P[i][1]),
      );
      c.closePath();
      c.fill();

      const bones = () => {
        c.beginPath();
        for (const f of HAND_FINGERS) {
          f.forEach((i, n) =>
            n ? c.lineTo(P[i][0], P[i][1]) : c.moveTo(P[i][0], P[i][1]),
          );
        }
        c.stroke();
      };

      c.strokeStyle = holding ? "rgba(96,165,250,0.95)" : "rgba(45,212,191,0.9)";
      c.lineWidth = Math.max(2.4, s * 0.038);
      bones();

      for (const i of TIPS) {
        c.beginPath();
        c.arc(P[i][0], P[i][1], Math.max(3.2, s * 0.052), 0, Math.PI * 2);
        c.fillStyle = `rgb(${accent})`;
        c.fill();
        c.lineWidth = 1;
        c.strokeStyle = "rgba(15,23,42,0.5)";
        c.stroke();
      }
      c.restore();
    }

    const hand = this.hands.find((h) => h.id === g.holdId) || this.hands[0];
    if (hand) this.heldSize = hand.size * 3;
    const size = this.heldSize || 140;

    // Single hand paper holding & crumple
    if (
      g.pos &&
      (g.state === "holding" ||
        (g.state === "ball" && (g.holdId != null || this.mode === "play")))
    ) {
      const rot = (g.pos.angle || -Math.PI / 2) + Math.PI / 2;
      if (g.state === "holding") {
        if (this.pickFlash > 0) {
          c.save();
          c.globalAlpha = this.pickFlash;
          c.shadowColor = "rgba(59,130,246,0.6)";
          c.shadowBlur = 10;
          c.strokeStyle = "#ffffff";
          c.lineWidth = 4;
          c.translate(g.pos.x, g.pos.y);
          c.rotate(rot * 0.6);
          c.beginPath();
          c.roundRect(-size * 0.4, -size * 0.52, size * 0.8, size * 1.04, 6);
          c.stroke();
          c.restore();
        }
        this.paper.draw(c, g.pos.x, g.pos.y, size, g.crumple, rot * 0.6);
      } else {
        this.paper.drawBall(c, g.pos.x, g.pos.y, size * this.paper.ballRatio, rot);
      }

      if (hand && hand.lm && g.state !== "holding") {
        c.fillStyle = "rgb(59,130,246)";
        for (const i of TIPS) {
          c.beginPath();
          c.arc(
            hand.lm[i][0],
            hand.lm[i][1],
            Math.max(3, hand.size * 0.05),
            0,
            Math.PI * 2,
          );
          c.fill();
        }
      }
    }
  }
}
