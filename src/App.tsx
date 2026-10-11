import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowRight,
  Camera,
  Check,
  Circle,
  CircleHelp,
  Hand,
  LockKeyhole,
  MoveUpRight,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Sparkles,
  ScanLine,
  Volume2,
  VolumeX,
  Wind,
  X,
} from "lucide-react"
import GameScene, { type SceneHandle } from "./components/GameScene"
import HandSkeleton from "./components/HandSkeleton"
import { playSound } from "./game/audio"
import type { HandTracker } from "./game/HandTracker"
import { LEVELS, type BallState, type TrackingFrame } from "./game/types"

type Screen = "welcome" | "camera" | "tutorial" | "practice" | "game" | "level-complete" | "results"

const emptyTracking: TrackingFrame = {
  landmarks: null,
  gesture: "none",
  confidence: 0,
  velocity: 0,
  lateral: 0,
  handedness: null,
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <span />
      </span>
      <span>Paper Throw</span>
    </div>
  )
}

function Stat({ label, value }: { label: string value: string | number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Welcome({
  preferredHand,
  setPreferredHand,
  onStart,
}: {
  preferredHand: "Left" | "Right"
  setPreferredHand: (value: "Left" | "Right") => void
  onStart: () => void
}) {
  return (
    <main className="welcome page">
      <nav>
        <Brand />
        <span className="local-pill">
          <LockKeyhole size={14} /> 100% on-device
        </span>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">A small break, beautifully made</span>
          <h1>
            Make the shot.
            <br />
            <em>Without touching a thing.</em>
          </h1>
          <p className="hero-lede">
            Pick up, crumple, and toss paper with natural hand gestures in a
            warm, tactile 3D office.
          </p>
          <div className="privacy-card">
            <LockKeyhole size={20} />
            <p>
              <strong>Your camera is used only to track your hand.</strong>
              Your face and video are never displayed or uploaded.
            </p>
          </div>
          <div className="start-row">
            <button className="primary-button" onClick={onStart}>
              <Camera size={19} /> Start playing <ArrowRight size={18} />
            </button>
            <div className="hand-choice" aria-label="Preferred hand">
              <span>Track</span>
              <button
                className={preferredHand === "Left" ? "selected" : ""}
                onClick={() => setPreferredHand("Left")}
              >
                Left
              </button>
              <button
                className={preferredHand === "Right" ? "selected" : ""}
                onClick={() => setPreferredHand("Right")}
              >
                Right
              </button>
            </div>
          </div>
          <p className="secure-note">
            Requires camera permission and HTTPS. Touch controls are always
            available.
          </p>
        </div>
        <div
          className="hero-art"
          aria-label="Paper ball falling into a wastebasket illustration"
        >
          <div className="sun-glow" />
          <div className="paper-ball">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="motion-line line-one" />
          <div className="motion-line line-two" />
          <div className="basket-art">
            <span className="basket-rim" />
            <span className="basket-body" />
          </div>
          <div className="hero-caption">
            <span>Three rooms</span>
            <span>Real physics</span>
            <span>Zero uploads</span>
          </div>
        </div>
      </section>
      <section className="gesture-strip">
        {[
          ["01", "Open", "Hold over the paper"],
          ["02", "Close", "Crumple into a ball"],
          ["03", "Swing", "Build throwing power"],
          ["04", "Release", "Open to let it fly"],
        ].map(([number, title, copy]) => (
          <div className="gesture-item" key={number}>
            <span>{number}</span>
            <div>
              <strong>{title}</strong>
              <small>{copy}</small>
            </div>
          </div>
        ))}
      </section>
    </main>
  )
}

function CameraSetup({
  progress,
  error,
  tracking,
  onRetry,
  onContinue,
  onFallback,
}: {
  progress: string
  error: string
  tracking: TrackingFrame
  onRetry: () => void
  onContinue: () => void
  onFallback: () => void
}) {
  return (
    <main className="setup page">
      <Brand />
      <div className="setup-card">
        <div className="setup-copy">
          <span className="eyebrow">Private hand setup</span>
          <h2>
            {error
              ? "Camera needs attention"
              : tracking.landmarks
                ? "Hand found"
                : "Setting up your hand"}
          </h2>
          <p>{error || progress}</p>
          <div className="privacy-list">
            <span>
              <Check size={16} /> Video is processed in this tab
            </span>
            <span>
              <Check size={16} /> Only landmark coordinates are drawn
            </span>
            <span>
              <Check size={16} /> Nothing is recorded or uploaded
            </span>
          </div>
          <div className="button-stack">
            {error ? (
              <button className="primary-button" onClick={onRetry}>
                <RotateCcw size={18} /> Retry camera
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={!tracking.landmarks}
                onClick={onContinue}
              >
                Continue to practice <ArrowRight size={18} />
              </button>
            )}
            <button className="text-button" onClick={onFallback}>
              Use touch controls instead
            </button>
          </div>
        </div>
        <HandSkeleton frame={tracking} />
      </div>
    </main>
  )
}

function Tutorial({
  onPractice,
  onSkip,
  trackingMode,
}: {
  onPractice: () => void
  onSkip: () => void
  trackingMode: "camera" | "touch"
}) {
  const steps = [
    {
      Icon: Hand,
      title: "Pick up",
      copy: "Hold an open palm steady for a moment.",
    },
    {
      Icon: Circle,
      title: "Crumple",
      copy: "Close your hand into a comfortable fist.",
    },
    {
      Icon: MoveUpRight,
      title: "Build power",
      copy: "Swing forward with purpose, not force.",
    },
    {
      Icon: ScanLine,
      title: "Release",
      copy: "Open your hand after the swing.",
    },
  ]
  return (
    <main className="tutorial page">
      <Brand />
      <div className="tutorial-heading">
        <span className="eyebrow">A ten-second warm up</span>
        <h2>Four gestures. One smooth motion.</h2>
        <p>
          {trackingMode === "camera"
            ? "Keep your hand comfortably inside the tracking frame."
            : "Touch mode mirrors the same steps with accessible controls."}
        </p>
      </div>
      <div className="tutorial-grid">
        {steps.map((step, index) => (
          <article key={step.title}>
            <span className="tutorial-number">0{index + 1}</span>
            <div className="gesture-demo">
              <step.Icon />
              <i className={`demo-pulse pulse-${index}`} />
            </div>
            <h3>{step.title}</h3>
            <p>{step.copy}</p>
          </article>
        ))}
      </div>
      <div className="tutorial-actions">
        <button className="primary-button" onClick={onPractice}>
          Try a practice throw <ArrowRight size={18} />
        </button>
        <button className="text-button" onClick={onSkip}>
          Skip practice
        </button>
      </div>
    </main>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome")
  const [preferredHand, setPreferredHand] = useState<"Left" | "Right">("Right")
  const [trackingMode, setTrackingMode] = useState<"camera" | "touch">("camera")
  const [tracking, setTracking] = useState<TrackingFrame>(emptyTracking)
  const [cameraProgress, setCameraProgress] = useState("")
  const [cameraError, setCameraError] = useState("")
  const [ballState, setBallState] = useState<BallState>("sheet")
  const [level, setLevel] = useState(0)
  const [levelBaskets, setLevelBaskets] = useState(0)
  const [score, setScore] = useState(0)
  const [bestScore, setBestScore] = useState(() =>
    Number(window.localStorage.getItem("paper-throw-best") ?? 0),
  )
  const [totalBaskets, setTotalBaskets] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [power, setPower] = useState(0.52)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [toast, setToast] = useState("")
  const [practiceDone, setPracticeDone] = useState(false)
  const sceneRef = useRef<SceneHandle>(null)
  const trackerRef = useRef<HandTracker | null>(null)
  const ballStateRef = useRef<BallState>("sheet")
  const screenRef = useRef<Screen>("welcome")
  const gestureRef = useRef({
    openSince: 0,
    fistSeen: false,
    maxVelocity: 0,
    cooldownUntil: 0,
  })
  const touchStartRef = useRef<{ time: number x: number y: number } | null>(
    null,
  )
  const pausedRef = useRef(false)
  const mutedRef = useRef(false)

  useEffect(() => {
    ballStateRef.current = ballState
  }, [ballState])
  useEffect(() => {
    pausedRef.current = paused
    mutedRef.current = muted
  }, [muted, paused])
  useEffect(() => {
    screenRef.current = screen
    if (screen === "results") {
      setBestScore((previous) => {
        const next = Math.max(previous, score)
        window.localStorage.setItem("paper-throw-best", String(next))
        return next
      })
      trackerRef.current?.stop()
      setTracking(emptyTracking)
    }
  }, [score, screen])
  useEffect(() => () => trackerRef.current?.stop(), [])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(""), 1800)
  }, [])

  const releaseBall = useCallback((throwPower: number, lateral: number) => {
    if (ballStateRef.current !== "crumpled") return
    const finalPower = Math.max(0.25, Math.min(1, throwPower))
    setPower(finalPower)
    setBallState("flying")
    ballStateRef.current = "flying"
    playSound("throw", mutedRef.current)
    sceneRef.current?.throwBall(finalPower, lateral)
  }, [])

  const processGesture = useCallback(
    (frame: TrackingFrame) => {
      setTracking(frame)
      if (screenRef.current === "level-complete" && frame.landmarks) {
        const machine = gestureRef.current
        if (frame.gesture === "open") {
          if (!machine.openSince) machine.openSince = performance.now()
          if (performance.now() - machine.openSince > 1000) {
            machine.openSince = 0
            setLevel((value) => value + 1)
            setLevelBaskets(0)
            setStreak(0)
            setBallState("sheet")
            ballStateRef.current = "sheet"
            setScreen("game")
          }
        } else {
          machine.openSince = 0
        }
        return
      }
      if (
        (screenRef.current !== "game" && screenRef.current !== "practice") ||
        pausedRef.current ||
        !frame.landmarks
      )
        return
      const now = performance.now()
      const machine = gestureRef.current
      if (now < machine.cooldownUntil) return
      const current = ballStateRef.current
      const palm = frame.landmarks[9]
      const mappedX = 1 - palm.x
      const overPaper =
        mappedX > 0.22 && mappedX < 0.78 && palm.y > 0.2 && palm.y < 0.88
      if (current === "sheet" && frame.gesture === "open" && overPaper) {
        if (!machine.openSince) machine.openSince = now
        if (now - machine.openSince > 650) {
          setBallState("held")
          ballStateRef.current = "held"
          machine.openSince = 0
          machine.cooldownUntil = now + 500
          playSound("pickup", mutedRef.current)
          showToast("Paper picked up")
        }
      } else if (current === "sheet") {
        machine.openSince = 0
      }
      if (current === "held" && frame.gesture === "fist") {
        setBallState("crumpled")
        ballStateRef.current = "crumpled"
        machine.fistSeen = true
        machine.maxVelocity = 0
        machine.cooldownUntil = now + 350
        playSound("crumple", mutedRef.current)
        showToast("Crumpled — swing and open")
      }
      if (current === "crumpled") {
        if (frame.gesture === "fist") {
          machine.fistSeen = true
          machine.maxVelocity = Math.max(machine.maxVelocity, frame.velocity)
          setPower(Math.max(0.12, machine.maxVelocity))
        } else if (
          frame.gesture === "open" &&
          machine.fistSeen &&
          machine.maxVelocity > 0.22
        ) {
          releaseBall(machine.maxVelocity, frame.lateral)
          machine.fistSeen = false
          machine.maxVelocity = 0
          machine.cooldownUntil = now + 1200
        }
      }
    },
    [releaseBall, showToast],
  )

  const startCamera = useCallback(async () => {
    trackerRef.current?.stop()
    setScreen("camera")
    setCameraError("")
    setTracking(emptyTracking)
    setTrackingMode("camera")
    try {
      setCameraProgress("Preparing private hand tracking…")
      const { HandTracker } = await import("./game/HandTracker")
      const tracker = new HandTracker()
      trackerRef.current = tracker
      await tracker.start(preferredHand, processGesture, setCameraProgress)
    } catch (error) {
      trackerRef.current?.stop()
      setCameraError(
        error instanceof Error
          ? error.message
          : "Hand tracking could not be initialized on this device.",
      )
    }
  }, [preferredHand, processGesture])

  const useTouchFallback = () => {
    trackerRef.current?.stop()
    setTracking(emptyTracking)
    setTrackingMode("touch")
    setScreen("tutorial")
  }

  const resetBall = useCallback(() => {
    setBallState("sheet")
    ballStateRef.current = "sheet"
    setPower(0.52)
    gestureRef.current = {
      openSince: 0,
      fistSeen: false,
      maxVelocity: 0,
      cooldownUntil: performance.now() + 400,
    }
  }, [])

  const onOutcome = useCallback(
    (scored: boolean) => {
      if (screenRef.current === "practice") {
        setPracticeDone(true)
        playSound(scored ? "score" : "miss", muted)
        showToast(scored ? "Beautiful shot" : "Good form — adjust your power")
        window.setTimeout(resetBall, 700)
        return
      }
      if (screenRef.current !== "game") return
      if (scored) {
        const nextStreak = streak + 1
        const nextBaskets = levelBaskets + 1
        setStreak(nextStreak)
        setBestStreak((value) => Math.max(value, nextStreak))
        setLevelBaskets(nextBaskets)
        setTotalBaskets((value) => value + 1)
        setScore(
          (value) =>
            value + 100 + level * 50 + Math.round(power * 40) + nextStreak * 10,
        )
        playSound("score", muted)
        showToast("Perfect basket")
        if (nextBaskets >= 5) {
          window.setTimeout(() => {
            playSound("complete", muted)
            setScreen(level === 2 ? "results" : "level-complete")
          }, 900)
          return
        }
      } else {
        setStreak(0)
        playSound("miss", muted)
        showToast("Missed — another sheet is ready")
      }
      window.setTimeout(resetBall, 780)
    },
    [level, levelBaskets, muted, power, resetBall, showToast, streak],
  )

  const beginGame = () => {
    setPracticeDone(false)
    resetBall()
    setScreen("game")
  }

  const nextLevel = () => {
    setLevel((value) => value + 1)
    setLevelBaskets(0)
    setStreak(0)
    resetBall()
    setScreen("game")
  }

  const replay = () => {
    setLevel(0)
    setLevelBaskets(0)
    setScore(0)
    setTotalBaskets(0)
    setStreak(0)
    setBestStreak(0)
    resetBall()
    if (trackingMode === "camera") void startCamera()
    else setScreen("tutorial")
  }

  const pickupTouch = () => {
    if (ballState === "sheet") {
      setBallState("held")
      ballStateRef.current = "held"
      playSound("pickup", muted)
    }
  }
  const crumpleTouch = () => {
    if (ballState === "held") {
      setBallState("crumpled")
      ballStateRef.current = "crumpled"
      playSound("crumple", muted)
    }
  }
  const pointerDown = (event: React.PointerEvent) => {
    touchStartRef.current = {
      time: performance.now(),
      x: event.clientX,
      y: event.clientY,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const pointerUp = (event: React.PointerEvent) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start || ballStateRef.current !== "crumpled") return
    const elapsed = Math.max(100, performance.now() - start.time)
    const rise = start.y - event.clientY
    const throwPower = Math.max(0.25, Math.min(1, (rise / elapsed) * 1.5))
    const lateral = Math.max(-1, Math.min(1, (event.clientX - start.x) / 140))
    releaseBall(throwPower, lateral)
  }

  const share = async () => {
    const text = `I scored ${score} in Paper Throw with ${totalBaskets} clean baskets.`
    try {
      if (navigator.share) await navigator.share({ title: "Paper Throw", text })
      else {
        await navigator.clipboard.writeText(text)
        showToast("Score copied to clipboard")
      }
    } catch {
      showToast("Sharing cancelled")
    }
  }

  if (screen === "welcome") {
    return (
      <Welcome
        preferredHand={preferredHand}
        setPreferredHand={setPreferredHand}
        onStart={() => void startCamera()}
      />
    )
  }
  if (screen === "camera") {
    return (
      <CameraSetup
        progress={cameraProgress}
        error={cameraError}
        tracking={tracking}
        onRetry={() => void startCamera()}
        onContinue={() => setScreen("tutorial")}
        onFallback={useTouchFallback}
      />
    )
  }
  if (screen === "tutorial") {
    return (
      <Tutorial
        trackingMode={trackingMode}
        onPractice={() => {
          resetBall()
          setScreen("practice")
        }}
        onSkip={beginGame}
      />
    )
  }
  if (screen === "level-complete") {
    return (
      <main className="completion page">
        <Brand />
        <div className="completion-card">
          <div className="completion-icon">
            <Sparkles />
          </div>
          <span className="eyebrow">Level {level + 1} complete</span>
          <h2>Room cleared.</h2>
          <p>Five clean baskets. The next room asks for a little more touch.</p>
          <div className="result-stats">
            <Stat label="Score" value={score} />
            <Stat label="Best streak" value={bestStreak} />
            <Stat label="Next" value={LEVELS[level + 1].difficulty} />
          </div>
          <button className="primary-button" onClick={nextLevel}>
            Next level <ArrowRight size={18} />
          </button>
          <small>Or hold an open palm for one second</small>
        </div>
      </main>
    )
  }
  if (screen === "results") {
    return (
      <main className="results page">
        <Brand />
        <div className="results-card">
          <span className="eyebrow">Session complete</span>
          <h2>
            A very good day
            <br />
            at the office.
          </h2>
          <div className="score-orbit">
            <span>Final score</span>
            <strong>{score}</strong>
            <small>personal best</small>
          </div>
          <div className="result-stats">
            <Stat label="Baskets" value={totalBaskets} />
            <Stat label="Best streak" value={bestStreak} />
            <Stat label="Levels" value="3 / 3" />
            <Stat label="Best score" value={bestScore} />
          </div>
          <div className="result-actions">
            <button className="primary-button" onClick={replay}>
              <RotateCcw size={18} /> Play again
            </button>
            <button className="secondary-button" onClick={() => void share()}>
              <Share2 size={18} /> Share score
            </button>
          </div>
          <button className="text-button" onClick={() => setScreen("tutorial")}>
            Repeat practice
          </button>
        </div>
        {toast && <div className="toast">{toast}</div>}
      </main>
    )
  }

  const isPractice = screen === "practice"
  const stateInstruction =
    ballState === "sheet"
      ? trackingMode === "camera"
        ? "Hold an open palm"
        : "Pick up a sheet"
      : ballState === "held"
        ? trackingMode === "camera"
          ? "Close your hand"
          : "Crumple the paper"
        : ballState === "crumpled"
          ? trackingMode === "camera"
            ? "Swing forward, then open"
            : "Swipe upward to throw"
          : "Watch the flight"

  return (
    <main className="game-shell">
      <GameScene
        ref={sceneRef}
        level={LEVELS[level]}
        ballState={ballState}
        paused={paused}
        onOutcome={onOutcome}
      />
      <header className="game-header">
        <Brand />
        <div className="level-copy">
          <span>{isPractice ? "Practice" : `Level ${level + 1} of 3`}</span>
          <strong>
            {isPractice ? "Find your rhythm" : LEVELS[level].name}
          </strong>
        </div>
        <div className="header-actions">
          <button
            aria-label={muted ? "Unmute sound" : "Mute sound"}
            onClick={() => setMuted((value) => !value)}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          <button
            aria-label={paused ? "Resume game" : "Pause game"}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? <Play /> : <Pause />}
          </button>
          <button aria-label="How to play" onClick={() => setShowHelp(true)}>
            <CircleHelp />
          </button>
        </div>
      </header>

      {!isPractice && (
        <aside className="score-panel">
          <Stat label="Score" value={score} />
          <Stat label="Streak" value={`${streak}×`} />
          <div className="goal-stat">
            <span>Level goal</span>
            <div className="goal-dots">
              {[0, 1, 2, 3, 4].map((item) => (
                <i key={item} className={item < levelBaskets ? "filled" : ""} />
              ))}
            </div>
          </div>
          <div className="difficulty">
            <Wind size={14} /> {LEVELS[level].difficulty}
          </div>
        </aside>
      )}

      <aside className="tracking-dock">
        {trackingMode === "camera" ? (
          <HandSkeleton frame={tracking} compact />
        ) : (
          <div className="touch-status">
            <Hand size={20} />
            <span>Touch controls</span>
          </div>
        )}
      </aside>

      <section className="throw-controls">
        <div className="instruction">
          <span className="instruction-dot" />
          <div>
            <small>Next move</small>
            <strong>{stateInstruction}</strong>
          </div>
        </div>
        <div className="power-wrap">
          <div className="power-copy">
            <span>Throw power</span>
            <strong>{Math.round(power * 100)}%</strong>
          </div>
          <div className="power-track">
            <span className={`target-zone zone-${level}`} />
            <i style={{ transform: `scaleX(${power})` }} />
          </div>
        </div>
        {trackingMode === "touch" && (
          <div className="touch-actions">
            <button disabled={ballState !== "sheet"} onClick={pickupTouch}>
              Pick up
            </button>
            <button disabled={ballState !== "held"} onClick={crumpleTouch}>
              Crumple
            </button>
            <button
              className="swipe-pad"
              disabled={ballState !== "crumpled"}
              onPointerDown={pointerDown}
              onPointerUp={pointerUp}
            >
              Swipe ↑
            </button>
          </div>
        )}
      </section>

      {isPractice && practiceDone && (
        <div className="practice-result">
          <span className="eyebrow">Practice complete</span>
          <strong>Ready for the real thing?</strong>
          <div>
            <button className="primary-button" onClick={beginGame}>
              Start level one <ArrowRight size={17} />
            </button>
            <button
              className="text-button"
              onClick={() => {
                setPracticeDone(false)
                resetBall()
              }}
            >
              Repeat practice
            </button>
          </div>
        </div>
      )}
      {paused && (
        <div className="pause-overlay">
          <div>
            <span className="eyebrow">Paused</span>
            <h2>Take your time.</h2>
            <button className="primary-button" onClick={() => setPaused(false)}>
              <Play size={18} /> Resume
            </button>
          </div>
        </div>
      )}
      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <div
            className="help-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close"
              onClick={() => setShowHelp(false)}
            >
              <X />
            </button>
            <span className="eyebrow">How to play</span>
            <h2>A natural four-step throw</h2>
            <ol>
              <li>
                <span>1</span>
                <div>
                  <strong>Open</strong>
                  <p>Hold your palm over the sheet for 0.7 seconds.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Close</strong>
                  <p>Make a fist to crumple the paper.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Swing</strong>
                  <p>Move forward to build real throwing power.</p>
                </div>
              </li>
              <li>
                <span>4</span>
                <div>
                  <strong>Release</strong>
                  <p>Open after moving. A still fist will never throw.</p>
                </div>
              </li>
            </ol>
            <button
              className="secondary-button"
              onClick={() => setShowHelp(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  )
}
