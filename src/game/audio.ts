type SoundName = "pickup" | "crumple" | "throw" | "score" | "miss" | "complete"

const notes: Record<SoundName, number[]> = {
  pickup: [320, 430],
  crumple: [120, 90, 150],
  throw: [260, 180],
  score: [440, 660, 880],
  miss: [180, 140],
  complete: [392, 523, 659, 784],
}

export function playSound(name: SoundName, muted: boolean) {
  if (muted) return
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass()
  const now = context.currentTime

  notes[name].forEach((frequency, index) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = name === "crumple" ? "sawtooth" : "sine"
    oscillator.frequency.setValueAtTime(frequency, now + index * 0.075)
    gain.gain.setValueAtTime(0.0001, now + index * 0.075)
    gain.gain.exponentialRampToValueAtTime(0.08, now + index * 0.075 + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.075 + 0.12)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(now + index * 0.075)
    oscillator.stop(now + index * 0.075 + 0.14)
  })
  window.setTimeout(() => void context.close(), 700)
}
