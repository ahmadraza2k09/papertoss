// Ultra-realistic physical modeling & ASMR audio synthesis for paper interactions
class GameAudio {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private lastCreaseTime = 0;
  private tearNode: AudioBufferSourceNode | null = null;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  // 1. ASMR Paper Pick / Slide sound
  playPick(volume = 0.6) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // High-resolution tactile sliding friction
    const frictionBuffer = this.createNoiseBuffer(0.2);
    const friction = this.ctx.createBufferSource();
    friction.buffer = frictionBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(5600, t + 0.18);
    filter.Q.value = 2.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(volume * 0.45, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);

    friction.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    friction.start(t);

    // Subtle paper edge click
    const click = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    click.type = "triangle";
    click.frequency.setValueAtTime(1400, t);
    click.frequency.exponentialRampToValueAtTime(450, t + 0.035);
    clickGain.gain.setValueAtTime(volume * 0.2, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    click.connect(clickGain);
    clickGain.connect(this.ctx.destination);
    click.start(t);
    click.stop(t + 0.04);
  }

  // 2. ASMR Tactile Paper Folding & Creasing (Triggered strictly when hand folds)
  playFoldCrease(deltaClosure: number, currentClosure: number) {
    if (this.isMuted || deltaClosure <= 0.005) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    if (t - this.lastCreaseTime < 0.035) return; // rate limit micro-crackles
    this.lastCreaseTime = t;

    const intensity = Math.min(1, deltaClosure * 15);
    const duration = 0.03 + Math.random() * 0.04;

    // Micro-crease crackle burst
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(duration);

    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    const centerFreq = 2400 + currentClosure * 3200 + Math.random() * 800;
    bp.frequency.setValueAtTime(centerFreq, t);
    bp.Q.value = 4.0 + Math.random() * 3.0;

    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(1200, t);

    const gain = this.ctx.createGain();
    const vol = (0.2 + intensity * 0.4) * (0.5 + currentClosure * 0.5);
    gain.gain.setValueAtTime(vol * 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(bp);
    bp.connect(hp);
    hp.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(t);
  }

  // 3. ASMR Realistic Paper Tearing / Ripping (When pulling hands apart)
  playPaperTear(intensity = 0.8) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const duration = 0.38 + Math.random() * 0.12;

    // Continuous grain tearing sound buffer (cellulose fibers snapping)
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    let envelope = 0;
    for (let i = 0; i < length; i++) {
      const progress = i / length;
      // Irregular stuttering ripping pulses
      const pulse = Math.sin(progress * 140) * Math.sin(progress * 420);
      const isPop = Math.random() < 0.08 ? 1.8 : 0.6;
      envelope = Math.sin(progress * Math.PI) * (0.8 + 0.4 * pulse);
      data[i] = (Math.random() * 2 - 1) * envelope * isPop;
    }

    const tear = this.ctx.createBufferSource();
    tear.buffer = buffer;

    // Dual filters for crunchy tearing body + crisp paper bite
    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(3200, t);
    bandpass.frequency.exponentialRampToValueAtTime(5400, t + duration * 0.6);
    bandpass.Q.value = 2.8;

    const highpass = this.ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(1600, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(intensity * 0.65, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(intensity * 0.45, t + duration * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    tear.connect(bandpass);
    bandpass.connect(highpass);
    highpass.connect(gain);
    gain.connect(this.ctx.destination);
    tear.start(t);
  }

  // 4. Realistic Aerodynamic Throw Whoosh
  playWhoosh(volume = 0.5, power = 0.6) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const dur = 0.22 + (1 - power) * 0.08;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(dur);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    const startFreq = 240 + power * 100;
    const peakFreq = 580 + power * 450;
    filter.frequency.setValueAtTime(startFreq, t);
    filter.frequency.exponentialRampToValueAtTime(peakFreq, t + dur * 0.45);
    filter.frequency.exponentialRampToValueAtTime(320, t + dur);
    filter.Q.value = 1.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(volume * (0.35 + power * 0.3), t + dur * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(t);
  }

  // 5. Metal Wire Wastebasket Rim Hit
  playRimHit(volume = 0.6) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const freqs = [520, 880, 1380, 2240];
    const decays = [0.32, 0.22, 0.16, 0.09];
    const amps = [0.4, 0.3, 0.18, 0.1];

    freqs.forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i % 2 === 0 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq + (Math.random() - 0.5) * 15, t);
      gain.gain.setValueAtTime(volume * amps[i], t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + decays[i]);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + decays[i] + 0.02);
    });
  }

  // 6. Sound When Ball Lands Cleanly Inside Dustbin
  playScoreInside(volume = 0.7) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const thump = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(140, t);
    thump.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    thumpGain.gain.setValueAtTime(volume * 0.5, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    thump.connect(thumpGain);
    thumpGain.connect(this.ctx.destination);
    thump.start(t);
    thump.stop(t + 0.15);

    // Wire rattle
    const rattleFreqs = [440, 780, 1150];
    rattleFreqs.forEach((f, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, t + 0.01);
      gain.gain.setValueAtTime(volume * (0.18 / (i + 1)), t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + 0.01);
      osc.stop(t + 0.2);
    });
  }

  // 7. Carpet Bounce (Missed Shot)
  playCarpetBounce(volume = 0.5) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.09);
    gain.gain.setValueAtTime(volume * 0.38, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  // 8. Chime / Celebration
  playCelebration(streak: number) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = t + idx * 0.055;
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });
  }

  play(kind: "pick" | "whoosh" | "clang" | "thud" | "chime" | "applause", volume = 0.5, pitch = 1.0) {
    switch (kind) {
      case "pick":
        this.playPick(volume);
        break;
      case "whoosh":
        this.playWhoosh(volume, pitch);
        break;
      case "clang":
        this.playRimHit(volume);
        break;
      case "thud":
        this.playCarpetBounce(volume);
        break;
      case "chime":
        this.playCelebration(2);
        break;
      case "applause":
        this.playCelebration(4);
        break;
    }
  }

  crinkleStop() {}

  startLoops() {
    this.initContext();
  }

  private sharedNoiseBuffer: AudioBuffer | null = null;

  private createNoiseBuffer(duration: number): AudioBuffer {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (!this.sharedNoiseBuffer || this.sharedNoiseBuffer.duration < duration) {
      const sampleRate = this.ctx.sampleRate;
      const bufferSize = Math.max(1, Math.floor(sampleRate * Math.max(2.0, duration)));
      const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      this.sharedNoiseBuffer = buffer;
    }
    return this.sharedNoiseBuffer;
  }
}

export const gameAudio = new GameAudio();
