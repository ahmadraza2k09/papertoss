import confetti from "canvas-confetti";
import { Camera, CameraOff, HelpCircle, MousePointer, Pause, Play, RefreshCw, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HUDStats, LevelEndResult, ScreenId } from "./types";
import { gameAudio } from "./utils/audio";
import { CONFIG } from "./utils/config";
import { GameEngine } from "./utils/gameEngine";
import { Gestures } from "./utils/gestures";
import { drawPipSkeleton, HandTracker } from "./utils/hands";

export default function App() {
  const [screen, setScreen] = useState<ScreenId>("landing");
  const screenRef = useRef<ScreenId>("landing");

  const [cameraState, setCameraState] = useState<"idle" | "requesting" | "ready" | "error">("idle");
  const [cameraError, setCameraError] = useState("");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);

  // HUD state
  const [hudStats, setHudStats] = useState<HUDStats>({
    level: 1,
    levels: 3,
    throwNo: 1,
    throws: 5,
    score: 0,
    streak: 0,
    levelScore: 0,
    goal: 300,
    results: [],
    current: 0,
  });

  const [powerMeter, setPowerMeter] = useState(0);
  const [meterLive, setMeterLive] = useState(false);
  const [zoneBounds, setZoneBounds] = useState<{ lo: number; hi: number }>({
    lo: 0.2,
    hi: 0.6,
  });
  const [promptText, setPromptText] = useState("");
  const [toast, setToast] = useState<{ text: string; kind?: string } | null>(null);
  const [levelEndData, setLevelEndData] = useState<LevelEndResult | null>(null);
  const [finalScore, setFinalScore] = useState(0);

  // Calibration state
  const [calibPeak, setCalibPeak] = useState(0);
  const [calibMax, setCalibMax] = useState(CONFIG.defaultMaxPower);
  const calibMaxRef = useRef(CONFIG.defaultMaxPower);
  const [calibDone, setCalibDone] = useState(false);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipCanvasRef = useRef<HTMLCanvasElement>(null);

  const trackerRef = useRef<HandTracker | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const gesturesRef = useRef<Gestures | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    calibMaxRef.current = calibMax;
  }, [calibMax]);

  const triggerToast = useCallback((text: string, kind = "") => {
    setToast({ text, kind });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1700);
  }, []);

  const triggerConfetti = useCallback(() => {
    gameAudio.playCelebration(4);
    confetti({ particleCount: 75, spread: 65, origin: { x: 0.15, y: 0.8 } });
    confetti({ particleCount: 75, spread: 65, origin: { x: 0.85, y: 0.8 } });
    setTimeout(() => {
      confetti({ particleCount: 110, spread: 110, origin: { x: 0.5, y: 0.4 } });
    }, 240);
  }, []);

  // Initialize camera and tracker
  const initCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setCameraState("requesting");
    setCameraError("");

    try {
      const tracker = new HandTracker(videoRef.current);
      await tracker.start();
      trackerRef.current = tracker;
      setCameraState("ready");
    } catch (err: unknown) {
      console.warn("Camera init:", err);
      setCameraState("error");
      const errObj = err as DOMException;
      setCameraError(
        errObj.name === "NotAllowedError"
          ? "Camera blocked. You can still play with mouse or trackpad flick!"
          : errObj.name === "NotFoundError"
            ? "No camera found. Mouse and trackpad controls are ready!"
            : "Camera unavailable. Mouse and trackpad controls are active!",
      );
    }
  }, []);

  // Initialize Game Engine once on mount
  useEffect(() => {
    if (!canvasRef.current) return;

    const gestures = new Gestures({
      pick: () => engineRef.current?.onPick(),
      crush: () => {},
      crushed: () => engineRef.current?.onCrushed(),
      release: (m) => {
        if (screenRef.current === "calibrate") {
          setCalibPeak(m.raw);
          const max = Math.max(CONFIG.minMaxPower, m.raw);
          setCalibMax(max);
          setCalibDone(true);
        } else if (screenRef.current === "game") {
          engineRef.current?.onRelease(m);
        }
      },
      dropped: () => engineRef.current?.onDropped(),
    });

    gesturesRef.current = gestures;

    const engine = new GameEngine({
      canvas: canvasRef.current,
      gestures,
      onHUDUpdate: (stats) => setHudStats(stats),
      onToast: (text, kind) => triggerToast(text, kind),
      onMeterUpdate: (p, live) => {
        setPowerMeter(p);
        setMeterLive(live);
      },
      onZoneUpdate: (lo, hi) => setZoneBounds({ lo, hi }),
      onWindUpdate: () => {},
      onPromptUpdate: (prompt) => setPromptText(prompt),
      onLevelEnd: (result) => {
        setLevelEndData(result);
        if (result.cleared) {
          triggerConfetti();
        }
        setScreen("levelEnd");
      },
    });

    // Mouse & Touch fallback controls
    const cv = canvasRef.current;
    let isMouseDown = false;
    let pointerTrail: Array<{ x: number; y: number; t: number }> = [];

    const handlePointerDown = (e: PointerEvent) => {
      if (engine.mode !== "play" || engine.phase !== "ready") return;
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      isMouseDown = true;
      pointerTrail = [{ x, y, t: performance.now() }];
      gestures.state = "holding";
      gestures.crumple = 0;
      gestures.squeezing = true;
      gestures.pickGlide = 1;
      gestures.pos = { x, y, angle: -Math.PI / 2 };
      engine.onPick();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isMouseDown) return;
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      pointerTrail.push({ x, y, t: performance.now() });
      if (pointerTrail.length > 8) pointerTrail.shift();
      if (gestures.pos) {
        gestures.pos.x = x;
        gestures.pos.y = y;
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isMouseDown) return;
      isMouseDown = false;
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      pointerTrail.push({ x, y, t: performance.now() });

      let vx = 0;
      let vy = -1;
      let speed = 12;

      if (pointerTrail.length >= 2) {
        const first = pointerTrail[0];
        const last = pointerTrail[pointerTrail.length - 1];
        const dt = Math.max(0.016, (last.t - first.t) / 1000);
        const dx = last.x - first.x;
        const dy = last.y - first.y;
        const pixelSpeed = Math.hypot(dx, dy) / dt;
        speed = Math.min(25, (pixelSpeed / (rect.height || 600)) * 14);
        const dist = Math.hypot(dx, dy) || 1;
        vx = dx / dist;
        vy = dy / dist;
      }

      gestures.state = "ball";
      gestures.crumple = 1;
      engine.onRelease({
        raw: Math.max(6, speed),
        dx: vx,
        dy: vy,
      });
    };

    cv.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    engineRef.current = engine;

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);

    let animFrame = 0;
    let lastTime = performance.now();

    const loop = (t: number) => {
      animFrame = requestAnimationFrame(loop);
      if (pausedRef.current) return;

      const dt = Math.min(0.05, (t - lastTime) / 1000);
      lastTime = t;

      if (trackerRef.current) {
        const hands = trackerRef.current.poll(t);
        if (hands) {
          engine.hands = hands;
          gestures.update(hands, t);
        } else if (engine.hands.length > 0) {
          // Keep updating gestures and smoothing every animation frame for 60/120 FPS fluidity
          gestures.update(engine.hands, t);
        }

        if (pipCanvasRef.current && videoRef.current) {
          drawPipSkeleton(pipCanvasRef.current, videoRef.current, engine.hands);
        }
      }

      engine.update(dt, t);
      engine.render();
    };

    animFrame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("resize", handleResize);
      cv.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [triggerConfetti, triggerToast]);

  const launchGameMode = () => {
    setScreen("game");
    if (cameraState === "idle") {
      initCamera();
    }
    if (engineRef.current) {
      engineRef.current.startGame(calibMaxRef.current);
    }
  };

  const startInstructions = () => {
    if (cameraState !== "ready") {
      initCamera();
    }
    setScreen("instructions");
  };

  const startCalibration = () => {
    setScreen("calibrate");
    setCalibDone(false);
    setCalibPeak(0);
    if (gesturesRef.current) {
      gesturesRef.current.mode = "calibrate";
      gesturesRef.current.reset();
      gesturesRef.current.enabled = true;
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    gameAudio.setMuted(next);
  };

  const toggleCamera = () => {
    if (cameraOn) {
      trackerRef.current?.stop();
      setCameraOn(false);
    } else {
      initCamera().then(() => setCameraOn(true));
    }
  };

  return (
    <div className="app-root">
      {/* Persistent HTML Video element for webcam capture */}
      <video ref={videoRef} id="cam" playsInline muted />

      {/* Main Office Stage Canvas */}
      <canvas ref={canvasRef} id="stage" />

      {/* Picture-in-Picture Camera & Hand Skeleton */}
      <div id="pip" className={screen === "landing" ? "away" : ""}>
        <canvas ref={pipCanvasRef} id="pipHands" />
        <span>Your camera</span>
      </div>

      {/* 1. Landing Screen */}
      <section className={`screen ${screen === "landing" ? "active" : ""}`}>
        <div className="card">
          <h1>Paper Toss</h1>
          <p className="lead">
            Kick back in your office chair and see how many crumpled sheets you can toss into the office wastebasket down the aisle!
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            <button className="btn primary big" onClick={launchGameMode}>
              Play Now
            </button>
            <button className="btn secondary" onClick={startInstructions}>
              <HelpCircle size={18} /> How to Play
            </button>
          </div>
          <p className="privacy">
            <span>Control with your webcam hand tracking, or click & flick with mouse/trackpad!</span>
          </p>
        </div>
      </section>

      {/* 2. Instructions Screen */}
      <section className={`screen ${screen === "instructions" ? "active" : ""}`}>
        <div className="card wide">
          <h2>Office Desk Controls</h2>
          <div className="moves grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="move-card">
              <h3>1. Grab Paper</h3>
              <p>Hover an open palm over the paper pile on your desk (or click the desk paper stack).</p>
            </div>
            <div className="move-card">
              <h3>2. ASMR Fold</h3>
              <p>Physically curl your fingers into a fist to fold the sheet. The paper only folds as your hand folds!</p>
            </div>
            <div className="move-card">
              <h3>3. Rip & Tear</h3>
              <p>Hold the paper with both hands and pull them apart to tear the sheet in two with authentic ASMR sound!</p>
            </div>
            <div className="move-card">
              <h3>4. Toss in Dustbin</h3>
              <p>Swing your arm forward and release fingers (or flick mouse upward) to toss into the basket!</p>
            </div>
          </div>
          {cameraState === "error" && (
            <div className="error-msg mb-4 p-3 bg-blue-900/40 text-blue-200 rounded-xl text-sm text-left">
              <span className="font-semibold">{cameraError}</span>
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <button className="btn secondary" onClick={launchGameMode}>
              Jump to Game
            </button>
            <button
              className="btn primary"
              onClick={startCalibration}
              disabled={cameraState === "requesting"}
            >
              {cameraState === "requesting" ? (
                <>
                  <RefreshCw className="animate-spin" size={18} /> Starting camera...
                </>
              ) : (
                "Practice Throw"
              )}
            </button>
          </div>
        </div>
      </section>

      {/* 3. Calibration / Practice Screen */}
      <section className={`screen ${screen === "calibrate" ? "active" : ""}`}>
        <div className="card">
          <h2>Practice Throw</h2>
          <p className="lead">
            Make a fist and do a swift practice throw towards the screen to set your power!
          </p>

          <div className="power-bar-wrap">
            <div
              className="power-bar-fill"
              style={{ width: `${Math.min(100, (calibPeak / 25) * 100)}%` }}
            />
          </div>

          <p className="text-xl font-bold mb-4">
            Speed: {calibPeak.toFixed(1)}
          </p>

          {calibDone && (
            <p className="text-emerald-400 font-semibold mb-4">
              Calibrated! Your throw power is locked in.
            </p>
          )}

          <div className="flex gap-4 justify-center mt-4">
            <button className="btn secondary" onClick={launchGameMode}>
              {calibDone ? "Start Level 1" : "Skip Practice"}
            </button>
            {calibDone && (
              <button className="btn primary" onClick={launchGameMode}>
                Start Level 1
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 4. Game HUD Layer */}
      {screen === "game" && (
        <div className="hud-layer">
          <header className="hud-header">
            <div className="stats-group">
              <div className="stat-item">
                <span>Distance</span>
                <strong>
                  Level {hudStats.level} / {hudStats.levels}
                </strong>
              </div>
              <div className="stat-item">
                <span>Score</span>
                <strong>{hudStats.score}</strong>
              </div>
              <div className="stat-item">
                <span>Streak</span>
                <strong>{hudStats.streak}</strong>
              </div>
              <div className="stat-item">
                <span>Throws</span>
                <strong>
                  {hudStats.current + 1} / {hudStats.throws}
                </strong>
              </div>
            </div>

            <div className="controls-row">
              <button
                className="icon-btn"
                onClick={() => setPaused(!paused)}
                title={paused ? "Resume" : "Pause"}
              >
                {paused ? <Play size={18} /> : <Pause size={18} />}
              </button>
              <button
                className="icon-btn"
                onClick={toggleMute}
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <button
                className="icon-btn"
                onClick={toggleCamera}
                title={cameraOn ? "Turn Camera Off" : "Turn Camera On"}
              >
                {cameraOn ? <Camera size={18} /> : <CameraOff size={18} />}
              </button>
              <button
                className="icon-btn"
                onClick={launchGameMode}
                title="Restart Level"
              >
                <RotateCcw size={18} />
              </button>
            </div>
          </header>

          {/* Live Power Meter */}
          <div className="meter-wrapper">
            <div
              className="zone-marker"
              style={{
                bottom: `${(zoneBounds.lo * 100).toFixed(1)}%`,
                height: `${((zoneBounds.hi - zoneBounds.lo) * 100).toFixed(1)}%`,
              }}
            />
            <div
              className="meter-fill"
              style={{
                height:
                  meterLive || powerMeter > 0
                    ? `${(powerMeter * 100).toFixed(1)}%`
                    : "0%",
              }}
            />
          </div>

          {/* Guidance Prompt */}
          {promptText && (
            <div className="prompt-box flex items-center gap-2">
              <MousePointer size={15} className="opacity-70" />
              <span>{promptText}</span>
            </div>
          )}

          {/* Action Toast */}
          {toast && <div className={`toast-msg ${toast.kind}`}>{toast.text}</div>}
        </div>
      )}

      {/* 5. Level End Screen */}
      <section className={`screen ${screen === "levelEnd" ? "active" : ""}`}>
        <div className="card">
          <h2>
            {levelEndData?.cleared
              ? `Distance ${hudStats.level} Cleared!`
              : "Missed Target!"}
          </h2>
          <p className="lead">
            {levelEndData?.cleared
              ? `You racked up ${levelEndData.levelScore} points! The dustbin is moving further down the office corridor.`
              : `You scored ${levelEndData?.levelScore} points. Keep a streak going for bonus multipliers!`}
          </p>
          <div className="flex gap-4 justify-center">
            {levelEndData?.cleared && !levelEndData.last ? (
              <button
                className="btn primary"
                onClick={() => {
                  setScreen("game");
                  engineRef.current?.startLevel(hudStats.level);
                }}
              >
                Next Distance
              </button>
            ) : (
              <button
                className="btn primary"
                onClick={() => {
                  setScreen("game");
                  engineRef.current?.startLevel(hudStats.level - 1);
                }}
              >
                Retry Distance
              </button>
            )}
            <button
              className="btn secondary"
              onClick={() => {
                setFinalScore(hudStats.score);
                setScreen("final");
              }}
            >
              Finish Game
            </button>
          </div>
        </div>
      </section>

      {/* 6. Final Score Screen */}
      <section className={`screen ${screen === "final" ? "active" : ""}`}>
        <div className="card">
          <h2>Office Champ!</h2>
          <p className="lead">
            Total Score:{" "}
            <strong className="text-blue-400 text-2xl">{finalScore}</strong>
          </p>
          <button className="btn primary big" onClick={launchGameMode}>
            Play Again
          </button>
        </div>
      </section>
    </div>
  );
}
