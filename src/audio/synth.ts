import type { Side, Weapon } from '../biotypes';
import type { GameEvent } from '../game';

// Every sound is synthesized with the Web Audio API — no sample files.
// Weapons each have their own firing and impact sounds (lasers zap, acid splorps and
// sizzles, claws hiss and slash). Everything else uses a per-side voice: humans sound
// clean and military (square waves, radio chirps); monsters sound organic and warbly.

/** Sounds that come from a side's voice rather than from a weapon. */
type SoundName = Exclude<GameEvent['type'], 'fire' | 'hit' | 'melee'> | 'click';

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** Frequency to glide to by the end of the note. */
  to?: number;
  start?: number;
  dur: number;
  gain?: number;
  /** Vibrato: [rate Hz, depth Hz]. */
  vibrato?: [number, number];
  /** Optional lowpass cutoff. */
  lowpass?: number;
}

interface NoiseOpts {
  start?: number;
  dur: number;
  gain?: number;
  filter?: BiquadFilterType;
  freq: number;
  /** Filter frequency to sweep to. */
  to?: number;
  q?: number;
}

export class Synth {
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private noiseBuffer: AudioBuffer | undefined;
  private lastPlayed = new Map<string, number>();
  muted = false;

  /** Must be called from a user gesture (browsers block autoplay). */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.35, this.ctx.currentTime, 0.02);
  }

  play(name: SoundName, side: Side): void {
    if (this.throttled(`${name}:${side}`, MIN_GAP[name])) return;
    (side === 'human' ? HUMAN : MONSTER)[name](this);
  }

  playEvent(e: GameEvent): void {
    switch (e.type) {
      case 'fire':
        if (!this.throttled(`fire:${e.weapon}`, 0.07)) WEAPON_FIRE[e.weapon](this);
        break;
      case 'melee':
        if (!this.throttled('fire:claws', 0.12)) WEAPON_FIRE.claws(this);
        break;
      case 'hit':
        if (!this.throttled(`hit:${e.weapon}`, 0.05)) WEAPON_HIT[e.weapon](this);
        break;
      default:
        this.play(e.type, e.side);
    }
  }

  /** Throttle rapid repeats (lots of turrets firing at once) so the mix doesn't clip. */
  private throttled(key: string, gap: number): boolean {
    if (!this.ctx || this.muted) return true;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(key) ?? -1) < gap) return true;
    this.lastPlayed.set(key, now);
    return false;
  }

  tone({ type = 'square', freq, to, start = 0, dur, gain = 0.3, vibrato, lowpass }: ToneOpts): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = osc;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      node.connect(f);
      node = f;
    }
    node.connect(amp).connect(this.master!);
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = vibrato[0];
      depth.gain.value = vibrato[1];
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise({ start = 0, dur, gain = 0.3, filter = 'bandpass', freq, to, q = 1 }: NoiseOpts): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer!;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (to !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(amp).connect(this.master!);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Play a sequence of notes, `step` seconds apart. */
  arp(freqs: number[], step: number, opts: Omit<ToneOpts, 'freq' | 'start'>): void {
    freqs.forEach((freq, i) => this.tone({ ...opts, freq, start: i * step }));
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
}

const MIN_GAP: Record<SoundName, number> = {
  enemyDeath: 0.06,
  towerDamaged: 0.15,
  waveStart: 0.5,
  waveClear: 0.5,
  place: 0.1,
  victory: 1,
  defeat: 1,
  click: 0.03,
};

type Sound = (s: Synth) => void;

/** Laser impact: short metallic click-tick. */
const laserHit: Sound = (s) => {
  s.tone({ freq: 2200, dur: 0.03, gain: 0.08 });
  s.noise({ freq: 4000, dur: 0.04, gain: 0.08, filter: 'highpass' });
};

/** Acid impact: wet splat, then a hissing sizzle. */
const acidHit: Sound = (s) => {
  s.noise({ freq: 500, to: 1400, dur: 0.06, gain: 0.16, q: 8 });
  s.noise({ start: 0.04, freq: 5000, to: 2500, dur: 0.35, gain: 0.07, filter: 'highpass' });
};

const WEAPON_FIRE: Record<Weapon, Sound> = {
  // Laser Bastion: twin cannons, two square-wave "pew"s a hair apart, with a zap of static.
  twinLaser: (s) => {
    s.tone({ freq: 1500, to: 300, dur: 0.12, gain: 0.11 });
    s.tone({ freq: 1250, to: 260, start: 0.045, dur: 0.12, gain: 0.1 });
    s.noise({ freq: 3000, dur: 0.05, gain: 0.05, q: 2 });
  },
  // Sentry Gun: quick, high sawtooth blip-zap.
  sentryLaser: (s) => s.tone({ type: 'sawtooth', freq: 2400, to: 900, dur: 0.06, gain: 0.07, lowpass: 5000 }),
  // Trooper pistol: thin, light "pew".
  pistol: (s) => s.tone({ type: 'triangle', freq: 1700, to: 500, dur: 0.1, gain: 0.12 }),
  // Trooper rifle: a crackling beam — static burst then a long, buzzy falling zap.
  rifle: (s) => {
    s.noise({ freq: 2500, dur: 0.06, gain: 0.09, q: 1.5 });
    s.tone({ type: 'sawtooth', freq: 950, to: 180, dur: 0.24, gain: 0.1, vibrato: [60, 40], lowpass: 3000 });
  },
  // Brood Spire: a deep wet hork, then the "PTOO" of a big glob launching.
  spireSpit: (s) => {
    s.noise({ freq: 250, to: 900, dur: 0.14, gain: 0.2, filter: 'lowpass', q: 8 });
    s.tone({ type: 'triangle', freq: 260, to: 80, start: 0.1, dur: 0.18, gain: 0.18, vibrato: [25, 30] });
    s.noise({ start: 0.1, freq: 1200, to: 400, dur: 0.08, gain: 0.12, q: 4 });
  },
  // Spitter Pod: a smaller, quicker "ptoo".
  podSpit: (s) => {
    s.noise({ freq: 1400, to: 600, dur: 0.06, gain: 0.12, q: 5 });
    s.tone({ type: 'triangle', freq: 520, to: 200, dur: 0.09, gain: 0.12, vibrato: [35, 30] });
  },
  // Crawler claws: a screeching hiss, then a slashing "shhk".
  claws: (s) => {
    s.tone({ type: 'sawtooth', freq: 900, to: 1500, dur: 0.12, gain: 0.07, vibrato: [45, 80], lowpass: 3500 });
    s.noise({ start: 0.05, freq: 7000, to: 1800, dur: 0.12, gain: 0.16, filter: 'highpass' });
  },
};

const WEAPON_HIT: Record<Weapon, Sound> = {
  twinLaser: laserHit,
  sentryLaser: laserHit,
  pistol: laserHit,
  rifle: laserHit,
  spireSpit: acidHit,
  podSpit: acidHit,
  claws: laserHit,
};

type Voice = Record<SoundName, Sound>;

const HUMAN: Voice = {
  // Three-note descending arpeggio.
  enemyDeath: (s) => s.arp([880, 660, 440], 0.06, { dur: 0.08, gain: 0.12 }),
  // Two-tone alarm buzz.
  towerDamaged: (s) => s.arp([220, 180, 220], 0.09, { type: 'sawtooth', dur: 0.1, gain: 0.15, lowpass: 1600 }),
  // Radio chirp, then a two-tone klaxon.
  waveStart: (s) => {
    s.tone({ freq: 1800, to: 2600, dur: 0.05, gain: 0.08 });
    s.noise({ start: 0.05, freq: 2500, dur: 0.08, gain: 0.06, q: 3 });
    s.arp([520, 390, 520, 390], 0.22, { dur: 0.2, gain: 0.14, lowpass: 2400 });
  },
  // Ascending fanfare arpeggio.
  waveClear: (s) => {
    s.arp([523, 659, 784], 0.1, { dur: 0.1, gain: 0.12 });
    s.tone({ freq: 1047, start: 0.3, dur: 0.4, gain: 0.12 });
  },
  // Relay "ka-chunk".
  place: (s) => {
    s.noise({ freq: 1800, dur: 0.04, gain: 0.2, q: 2 });
    s.tone({ freq: 140, to: 70, start: 0.05, dur: 0.1, gain: 0.25 });
  },
  victory: (s) => s.arp([523, 659, 784, 1047, 784, 1047], 0.12, { dur: 0.16, gain: 0.13 }),
  defeat: (s) => s.arp([440, 415, 392, 370, 220], 0.2, { type: 'sawtooth', dur: 0.25, gain: 0.14, lowpass: 1200 }),
  click: (s) => s.tone({ freq: 1200, dur: 0.03, gain: 0.08 }),
};

const MONSTER: Voice = {
  // Gurgle that falls into a low growl.
  enemyDeath: (s) => {
    s.noise({ freq: 700, to: 200, dur: 0.25, gain: 0.18, filter: 'lowpass', q: 10 });
    s.tone({ type: 'sawtooth', freq: 180, to: 60, dur: 0.35, gain: 0.14, vibrato: [18, 25], lowpass: 900 });
  },
  // Pained low moan.
  towerDamaged: (s) =>
    s.tone({ type: 'sawtooth', freq: 140, to: 90, dur: 0.45, gain: 0.18, vibrato: [6, 12], lowpass: 700 }),
  // Rising croak into a howl.
  waveStart: (s) => {
    s.tone({ type: 'sawtooth', freq: 90, to: 140, dur: 0.25, gain: 0.16, vibrato: [25, 30], lowpass: 900 });
    s.tone({ type: 'triangle', freq: 220, to: 660, start: 0.2, dur: 0.7, gain: 0.14, vibrato: [7, 20] });
  },
  // Triumphant chittering trill.
  waveClear: (s) => s.arp([700, 900, 700, 900, 1100, 1300], 0.05, { type: 'triangle', dur: 0.06, gain: 0.12, vibrato: [40, 30] }),
  // Organic "blorp".
  place: (s) => s.tone({ type: 'sine', freq: 180, to: 520, dur: 0.15, gain: 0.25, vibrato: [20, 30] }),
  victory: (s) => {
    s.arp([440, 554, 659, 880], 0.12, { type: 'triangle', dur: 0.18, gain: 0.13, vibrato: [8, 15] });
    s.tone({ type: 'sawtooth', freq: 110, to: 220, start: 0.5, dur: 0.8, gain: 0.12, vibrato: [5, 10], lowpass: 800 });
  },
  defeat: (s) => {
    s.tone({ type: 'sawtooth', freq: 200, to: 40, dur: 1.4, gain: 0.18, vibrato: [4, 15], lowpass: 600 });
    s.noise({ freq: 400, to: 80, dur: 1.2, gain: 0.12, filter: 'lowpass', q: 4 });
  },
  click: (s) => s.tone({ type: 'triangle', freq: 400, to: 600, dur: 0.05, gain: 0.1 }),
};
