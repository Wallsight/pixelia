// Generative background music: every few minutes a short, sparse piece (pad
// chords, a plucked melody that wanders the scale and repeats its own motif,
// a soft bass) in a mode that follows the place and the hour.

import type { AudioEngine } from './engine';

export type Mood = 'day' | 'night' | 'ash' | 'eld';

const SCALES: Record<Mood, number[]> = {
  day: [0, 2, 4, 7, 9],
  night: [0, 2, 3, 5, 7, 9, 10],
  ash: [0, 1, 3, 5, 7, 8, 10],
  eld: [0, 2, 4, 6, 8, 10],
};
const PROGRESSIONS: Record<Mood, number[][]> = {
  day: [[0, 3, 1, 4], [0, 2, 3, 1], [0, 4, 3, 3]],
  night: [[0, 5, 3, 4], [0, 3, 5, 4], [0, 2, 5, 4]],
  ash: [[0, 1, 0, 6], [0, 6, 5, 1]],
  eld: [[0, 1, 2, 1], [0, 3, 0, 4]],
};
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

interface Piece {
  mood: Mood;
  scale: number[];
  root: number;
  prog: number[];
  beat: number;
  start: number;
  length: number;
  /** Next beat to schedule (index) and its time. */
  bi: number;
  bt: number;
  deg: number;
  motif: number[];
}

export class Music {
  private wait = rnd(18, 35);
  private piece: Piece | null = null;
  private out: GainNode | null = null;

  constructor(private e: AudioEngine) {}

  update(dt: number, mood: Mood): void {
    const e = this.e;
    if (!e.ready) return;
    if (!this.out) this.out = e.flat('music', 0.6);
    if (!this.piece) {
      if (!e.musicOn) return;
      this.wait -= dt;
      if (this.wait > 0) return;
      this.begin(mood);
    }
    const p = this.piece!;
    // Schedule up to one second ahead.
    const horizon = e.now + 1.0;
    while (p.bt < horizon) {
      if (p.bt > p.start + p.length) {
        this.piece = null;
        this.wait = rnd(80, 200);
        return;
      }
      this.beat(p, p.bi, p.bt);
      p.bi++;
      p.bt += p.beat;
    }
  }

  private begin(mood: Mood): void {
    const bpm = mood === 'day' ? rnd(70, 84) : rnd(56, 68);
    const t = this.e.now + 0.3;
    this.piece = {
      mood, scale: SCALES[mood], root: pick(mood === 'ash' ? [52, 50] : [57, 60, 62, 55]),
      prog: pick(PROGRESSIONS[mood]), beat: 60 / bpm, start: t, length: rnd(50, 80),
      bi: 0, bt: t, deg: 7, motif: [],
    };
  }

  /** Pitch of a scale degree (degrees wrap into higher octaves). */
  private note(p: Piece, deg: number, octave: number): number {
    const n = p.scale.length;
    const o = Math.floor(deg / n);
    return p.root + octave * 12 + o * 12 + p.scale[((deg % n) + n) % n];
  }

  private beat(p: Piece, i: number, t: number): void {
    const fade = Math.min(1, (t - p.start) / 6, (p.start + p.length - t) / 8);
    if (fade <= 0) return;
    const bar = Math.floor(i / 4), inBar = i % 4;
    const chordDeg = p.prog[Math.floor(bar / 2) % p.prog.length];
    if (inBar === 0 && bar % 2 === 0) {
      // New chord: pad and bass.
      for (const d of [0, 2, 4]) this.pad(mtof(this.note(p, chordDeg + d, 0)), t, p.beat * 8, 0.05 * fade);
      this.pluck(mtof(this.note(p, chordDeg, -1)), t, 0.1 * fade, 2.6, 'sine');
    }
    // Melody: a wandering line; every fourth bar replays the opening motif.
    const slot = (bar % 4) * 4 + inBar;
    if (bar >= 4 && bar % 4 === 0 && p.motif.length) {
      const m = p.motif[inBar];
      if (m !== undefined && m >= 0) this.pluck(mtof(this.note(p, m, 1)), t, 0.11 * fade, 1.8, 'triangle');
      return;
    }
    if (Math.random() < (p.mood === 'day' ? 0.55 : 0.4)) {
      p.deg += pick([-2, -1, -1, 1, 1, 2, 0]);
      // Lean towards chord tones and stay in range.
      if (Math.random() < 0.3) p.deg = chordDeg + pick([0, 2, 4]) + p.scale.length;
      p.deg = Math.max(2, Math.min(12, p.deg));
      this.pluck(mtof(this.note(p, p.deg, 1)), t, 0.11 * fade, 1.8, 'triangle');
      if (slot < 4) p.motif[inBar] = p.deg;
      // An occasional eighth-note grace.
      if (Math.random() < 0.18) this.pluck(mtof(this.note(p, p.deg + 1, 1)), t + p.beat / 2, 0.07 * fade, 1.2, 'triangle');
    } else if (slot < 4) p.motif[inBar] = -1;
  }

  private pluck(f: number, t: number, vol: number, dec: number, type: OscillatorType): void {
    const e = this.e;
    const o = e.osc(type, f);
    const o2 = e.osc('sine', f * 2.001);
    const lp = e.filter('lowpass', Math.min(6000, f * 5), 0.5);
    lp.frequency.setValueAtTime(Math.min(6000, f * 5), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.2), t + dec);
    const g = e.gain(), g2 = e.gain(0.25);
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(this.out!);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.start(t); o.stop(t + dec + 0.05); o2.start(t); o2.stop(t + dec + 0.05);
  }

  private pad(f: number, t: number, dur: number, vol: number): void {
    const e = this.e;
    const lp = e.filter('lowpass', 900, 0.6);
    const g = e.gain();
    lp.connect(g); g.connect(this.out!);
    for (const det of [-6, 6]) {
      const o = e.osc('triangle', f);
      o.detune.value = det;
      o.connect(lp);
      o.start(t); o.stop(t + dur + 3.2);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 2.5);
    g.gain.setValueAtTime(vol, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 3);
  }
}
