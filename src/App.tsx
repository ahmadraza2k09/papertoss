import {
  Camera,
  CameraOff,
  Check,
  Hand,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import GameScene from "./components/GameScene";
import { useHandTracking } from "./hooks/useHandTracking";
import type { GameStage, HandData } from "./types";

type Screen = "welcome" | "permission" | "calibrating" | "game";

const instructions: Record<GameStage, { eyebrow: string; title: string; detail: string }> = {
  lift: {
    eyebrow: "Step 1 of 3",
    title: "Open your hand & lift",
    detail: "Raise an open palm to pick up the paper.",
  },
  fold: {
    eyebrow: "Step 2 of 3",
    title: "Make a fist",
    detail: "Close your hand and hold it for a moment.",
  },
  throw: {
    eyebrow: "Step 3 of 3",
    title: "Throw it!",
    detail: "Aim, then move your hand forward or upward quickly.",
  },
  flying: { eyebrow: "In flight", title: "Looking good…", detail: "Let physics do the rest." },
  result: { eyebrow: "Resetting", title: "Next sheet ready", detail: "Get your hand in position." },
};

function playTone(kind: "fold" | "throw" | "score" | "miss", muted: boolean) {
  if (muted) return;
  const AudioContextClass = window.AudioContext;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);
  const now = context.currentTime;
  oscillator.type = kind === "score" ? "sine" : "triangle";
  oscillator.frequency.setValueAtTime(kind === "score" ? 520 : kind === "miss" ? 130 : 240, now);
  oscillator.frequency.exponentialRampToValueAtTime(kind === "score" ? 920 : 360, now + 0.22);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
  oscillator.start(now);
  oscillator.stop(now + 0.3);
}

function IconButton({
  label,
  children,
  onClick,
  active = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "is-active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [stage, setStage] = useState<GameStage>("lift");
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [sensitivity, setSensitivity] = useState(0.55);
  const [score, setScore] = useState(0);
  const [shots, setShots] = useState(0);
  const [makes, setMakes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [shotId, setShotId] = useState(0);
  const [launch, setLaunch] = useState<HandData | null>(null);
  const [celebration, setCelebration] = useState(false);
  const [message, setMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const resetTimerRef = useRef<number | null>(null);

  const onLift = useCallback(() => setStage((current) => (current === "lift" ? "fold" : current)), []);
  const onFold = useCallback(() => {
    setStage((current) => {
      if (current !== "fold") return current;
      playTone("fold", muted);
      return "throw";
    });
  }, [muted]);
  const onThrow = useCallback(
    (hand: HandData) => {
      setStage((current) => {
        if (current !== "throw") return current;
        setLaunch(hand);
        setShotId((id) => id + 1);
        playTone("throw", muted);
        return "flying";
      });
    },
    [muted],
  );

  const { hand, status, error, stream, startCamera, stopCamera } = useHandTracking(
    videoRef,
    cameraEnabled,
    paused,
    stage,
    sensitivity,
    onLift,
    onFold,
    onThrow,
  );

  const resetPaper = useCallback(() => {
    setStage("lift");
    setLaunch(null);
    setMessage("");
    setCelebration(false);
  }, []);

  const onShotComplete = useCallback(
    (made: boolean) => {
      setStage("result");
      setShots((value) => value + 1);
      if (made) {
        const bonus = streak * 25;
        setScore((value) => value + 100 + bonus);
        setMakes((value) => value + 1);
        setStreak((value) => value + 1);
        setMessage(bonus ? `Nice Shot! +${100 + bonus}` : "Nice Shot! +100");
        setCelebration(true);
        playTone("score", muted);
      } else {
        setStreak(0);
        setMessage("So close!");
        playTone("miss", muted);
      }
      resetTimerRef.current = window.setTimeout(resetPaper, 2100);
    },
    [muted, resetPaper, streak],
  );

  const restart = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setScore(0);
    setShots(0);
    setMakes(0);
    setStreak(0);
    resetPaper();
  }, [resetPaper]);

  const enableCamera = async () => {
    setCameraEnabled(true);
    await startCamera();
  };

  useEffect(() => {
    if (screen === "permission" && status === "ready") {
      setScreen("calibrating");
      const timer = window.setTimeout(() => setScreen("game"), 1800);
      return () => clearTimeout(timer);
    }
  }, [screen, status]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => undefined);
    }
  }, [screen, stream]);

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const accuracy = shots ? Math.round((makes / shots) * 100) : 0;

  if (screen === "welcome") {
    return (
      <main className="landing">
        <div className="landing-glow" />
        <section className="welcome-card">
          <div className="brand-mark">
            <span className="paper-plane" />
          </div>
          <p className="kicker">A hands-free desk game</p>
          <h1>Paper Toss<span>.</span></h1>
          <p className="welcome-copy">
            Lift it. Fold it. Send it. Your hand is the controller in this playful 3D challenge.
          </p>
          <button className="primary-button" type="button" onClick={() => setScreen("permission")}>
            Start game <span>→</span>
          </button>
          <div className="tutorial-row" aria-label="How to play">
            <div><Hand size={20} /><span>Lift</span></div>
            <i />
            <div><span className="fist-glyph">●</span><span>Fold</span></div>
            <i />
            <div><Target size={20} /><span>Throw</span></div>
          </div>
          <p className="privacy-note"><span /> Private by design — video never leaves your browser</p>
        </section>
        <div className="desk-preview">
          <div className="preview-paper" />
          <div className="preview-bin" />
        </div>
      </main>
    );
  }

  if (screen === "permission") {
    return (
      <main className="permission-screen">
        <section className="permission-card">
          <div className={`permission-icon ${status === "denied" || status === "error" ? "error" : ""}`}>
            {status === "denied" || status === "error" ? <CameraOff /> : <Camera />}
          </div>
          <p className="kicker">One quick setup</p>
          <h2>Enable your camera</h2>
          <p>
            Paper Toss uses your camera to understand hand gestures. Everything is processed locally
            and no video is recorded or uploaded.
          </p>
          {error && <div className="error-message">{error}</div>}
          <button
            className="primary-button"
            type="button"
            onClick={enableCamera}
            disabled={status === "requesting" || status === "loading"}
          >
            {status === "requesting" || status === "loading" ? (
              <><RefreshCw className="spin" size={18} /> Starting hand tracking…</>
            ) : (
              <><Camera size={18} /> Enable camera</>
            )}
          </button>
          <button className="text-button" type="button" onClick={() => setScreen("welcome")}>Go back</button>
        </section>
        <video ref={videoRef} className="hidden-video" muted playsInline />
      </main>
    );
  }

  if (screen === "calibrating") {
    return (
      <main className="calibration-screen">
        <video ref={videoRef} className="calibration-video" muted playsInline />
        <div className="calibration-overlay">
          <div className="hand-outline"><Hand /></div>
          <h2>Show us your hand</h2>
          <p>Hold an open palm inside the frame</p>
          <div className="calibration-progress"><span /></div>
          <small>Calibrating gesture tracking…</small>
        </div>
      </main>
    );
  }

  return (
    <main className="game-shell">
      <div className="scene">
        <GameScene
          stage={stage}
          hand={hand}
          shotId={shotId}
          launch={launch}
          onShotComplete={onShotComplete}
          paused={paused}
          celebration={celebration}
        />
      </div>

      <header className="game-header">
        <div className="game-logo"><span className="mini-plane" /> Paper Toss</div>
        <div className="score-board">
          <div><span>Score</span><strong>{score.toLocaleString()}</strong></div>
          <b />
          <div><span>Shots</span><strong>{shots}</strong></div>
          <b />
          <div><span>Accuracy</span><strong>{accuracy}%</strong></div>
        </div>
        <div className="controls">
          <IconButton label={paused ? "Resume" : "Pause"} onClick={() => setPaused((value) => !value)} active={paused}>
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </IconButton>
          <IconButton label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((value) => !value)}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </IconButton>
          <IconButton
            label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
            onClick={() => {
              if (cameraEnabled) {
                stopCamera();
                setCameraEnabled(false);
              } else {
                setCameraEnabled(true);
                startCamera();
              }
            }}
          >
            {cameraEnabled ? <Camera size={18} /> : <CameraOff size={18} />}
          </IconButton>
          <button type="button" className="restart-button" onClick={restart}><RotateCcw size={16} /> Restart</button>
        </div>
      </header>

      <aside className="instruction-panel">
        <p>{instructions[stage].eyebrow}</p>
        <h2>{instructions[stage].title}</h2>
        <span>{instructions[stage].detail}</span>
        <div className="step-track">
          {(["lift", "fold", "throw"] as const).map((step, index) => {
            const order = ["lift", "fold", "throw", "flying", "result"].indexOf(stage);
            const complete = order > index;
            return <i key={step} className={complete ? "complete" : stage === step ? "active" : ""}>{complete ? <Check size={11} /> : index + 1}</i>;
          })}
        </div>
      </aside>

      <aside className="camera-card">
        <video ref={videoRef} className="camera-feed" muted playsInline />
        {!cameraEnabled && <div className="camera-off"><CameraOff size={22} /><span>Camera off</span></div>}
        {cameraEnabled && !hand.detected && status === "ready" && (
          <div className="no-hand">Move your hand into view</div>
        )}
        <div className="tracking-status">
          <i className={hand.detected ? "detected" : ""} />
          <span>{hand.detected ? hand.gesture : "Searching for hand"}</span>
        </div>
      </aside>

      <div className="sensitivity">
        <span>Sensitivity</span>
        <input
          aria-label="Gesture sensitivity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={sensitivity}
          onChange={(event) => setSensitivity(Number(event.target.value))}
        />
      </div>

      {message && (
        <div className={`result-toast ${celebration ? "success" : ""}`}>
          {celebration && <Sparkles size={22} />}
          <strong>{message}</strong>
          <span>{celebration ? `${streak} shot streak` : "Adjust your aim and try again"}</span>
        </div>
      )}
      {paused && (
        <div className="pause-overlay">
          <div><Pause size={24} /><h2>Game paused</h2><button type="button" className="primary-button" onClick={() => setPaused(false)}>Resume</button></div>
        </div>
      )}
    </main>
  );
}
