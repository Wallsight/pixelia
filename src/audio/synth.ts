// One-shot sound recipes. Each takes the engine, the node to feed and a start
// time, builds a tiny throwaway graph and returns when it will have finished.

import type { AudioEngine } from './engine';

type P = AudioParam;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Attack-decay envelope on a gain param. */
function ad(g: P, t: number, a: number, peak: number, d: number): number {
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + a);
  g.exponentialRampToValueAtTime(0.0001, t + a + d);
  return t + a + d;
}

/** A filtered noise burst. */
function burst(e: AudioEngine, out: AudioNode, t: number, kind: 'white' | 'pink' | 'brown', type: BiquadFilterType, freq: number, q: number, a: number, peak: number, d: number, sweepTo = 0): number {
  const s = e.noiseSrc(kind);
  const f = e.filter(type, freq, q);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + a + d);
  const g = e.gain();
  s.connect(f); f.connect(g); g.connect(out);
  const end = ad(g.gain, t, a, peak, d);
  e.startNoise(s, t, end - t + 0.02);
  return end;
}

/** A sine (or other) tone with a pitch glide. */
function tone(e: AudioEngine, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, a: number, peak: number, d: number): number {
  const o = e.osc(type, f0);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d);
  const g = e.gain();
  o.connect(g); g.connect(out);
  const end = ad(g.gain, t, a, peak, d);
  o.start(t); o.stop(end + 0.02);
  return end;
}

/** Short noise grains (crunch, gravel, crackle). */
function grains(e: AudioEngine, out: AudioNode, t: number, n: number, span: number, f0: number, f1: number, peak: number, len: number): number {
  const s = e.noiseSrc('white');
  const f = e.filter('bandpass', (f0 + f1) / 2, 1.2);
  const g = e.gain();
  s.connect(f); f.connect(g); g.connect(out);
  g.gain.setValueAtTime(0, t);
  // Time-ordered grains with short ramps (hard steps would click).
  const times = Array.from({ length: n }, () => t + Math.random() * span).sort((a, b) => a - b);
  let end = t, prevEnd = t;
  for (const t0 of times) {
    const s0 = Math.max(t0, prevEnd);
    const l = len * rnd(0.6, 1.4);
    f.frequency.setValueAtTime(rnd(f0, f1), s0);
    g.gain.setValueAtTime(0, s0);
    g.gain.linearRampToValueAtTime(peak * rnd(0.4, 1), s0 + 0.002);
    g.gain.linearRampToValueAtTime(0, s0 + l);
    prevEnd = s0 + l;
    end = Math.max(end, prevEnd + 0.01);
  }
  e.startNoise(s, t, end - t + 0.02);
  return end;
}

// ------------------------------------------------------------------ player

export type Material = 'grass' | 'dirt' | 'stone' | 'wood' | 'sand' | 'snow' | 'gravel' | 'leaves' | 'water' | 'metal';

export function footstep(e: AudioEngine, out: AudioNode, t: number, m: Material, k: number): number {
  const j = rnd(0.85, 1.15);
  switch (m) {
    case 'grass':
      burst(e, out, t, 'pink', 'bandpass', 900 * j, 0.8, 0.004, 0.45 * k, 0.09);
      burst(e, out, t + 0.01, 'white', 'bandpass', 3800 * j, 1, 0.006, 0.12 * k, 0.07);
      return tone(e, out, t, 'sine', 90 * j, 60, 0.003, 0.3 * k, 0.05);
    case 'dirt':
      burst(e, out, t, 'pink', 'lowpass', 700 * j, 0.7, 0.003, 0.55 * k, 0.07);
      return tone(e, out, t, 'sine', 80 * j, 55, 0.003, 0.35 * k, 0.05);
    case 'stone':
      burst(e, out, t, 'white', 'bandpass', 2300 * j, 1.5, 0.002, 0.3 * k, 0.035);
      burst(e, out, t, 'white', 'highpass', 5200, 0.7, 0.001, 0.12 * k, 0.012);
      return tone(e, out, t, 'sine', 150 * j, 90, 0.002, 0.3 * k, 0.035);
    case 'metal':
      burst(e, out, t, 'white', 'bandpass', 3200 * j, 4, 0.002, 0.25 * k, 0.06);
      return tone(e, out, t, 'triangle', 420 * j, 400, 0.002, 0.12 * k, 0.12);
    case 'wood':
      burst(e, out, t, 'white', 'bandpass', 800 * j, 4, 0.002, 0.28 * k, 0.06);
      return tone(e, out, t, 'sine', 175 * j, 115, 0.002, 0.45 * k, 0.09);
    case 'sand':
      burst(e, out, t, 'white', 'bandpass', 3000 * j, 0.6, 0.015, 0.28 * k, 0.12);
      return burst(e, out, t, 'pink', 'lowpass', 500, 0.7, 0.005, 0.2 * k, 0.06);
    case 'snow':
      grains(e, out, t, 6, 0.07, 1500, 3400, 0.3 * k, 0.012);
      return burst(e, out, t, 'pink', 'lowpass', 600, 0.7, 0.008, 0.25 * k, 0.08);
    case 'gravel':
      grains(e, out, t, 7, 0.06, 2500, 6000, 0.24 * k, 0.009);
      return tone(e, out, t, 'sine', 100 * j, 70, 0.003, 0.25 * k, 0.04);
    case 'leaves':
      grains(e, out, t, 5, 0.1, 2000, 5000, 0.18 * k, 0.015);
      return burst(e, out, t, 'white', 'bandpass', 2800 * j, 0.7, 0.012, 0.3 * k, 0.14);
    case 'water':
      burst(e, out, t, 'white', 'bandpass', 700 * j, 0.9, 0.01, 0.35 * k, 0.16, 1700);
      tone(e, out, t + 0.04, 'sine', 500 * j, 1000, 0.004, 0.06 * k, 0.04);
      return tone(e, out, t + 0.09, 'sine', 650 * j, 1300, 0.004, 0.05 * k, 0.04);
  }
}

export function land(e: AudioEngine, out: AudioNode, t: number, s: number): number {
  burst(e, out, t, 'pink', 'lowpass', 500, 0.7, 0.003, 0.6 * s, 0.12);
  return tone(e, out, t, 'sine', 95, 40, 0.003, 0.8 * s, 0.18);
}

export function splash(e: AudioEngine, out: AudioNode, t: number, s: number): number {
  let end = burst(e, out, t, 'white', 'bandpass', 400, 0.8, 0.01, 0.7 * s, 0.45, 2200);
  burst(e, out, t, 'pink', 'lowpass', 900, 0.7, 0.005, 0.5 * s, 0.3);
  for (let i = 0; i < 6; i++) {
    const f = rnd(400, 1200);
    end = Math.max(end, tone(e, out, t + rnd(0.05, 0.4), 'sine', f, f * 1.8, 0.004, 0.08 * s, 0.05));
  }
  return end;
}

// ------------------------------------------------------------------ wildlife

/** Songbird phrase; `v` picks one of four song shapes, `base` its pitch. */
export function chirp(e: AudioEngine, out: AudioNode, t: number, v: number, base: number): number {
  const o = e.osc('sine', base);
  const g = e.gain();
  o.connect(g); g.connect(out);
  const f = o.frequency;
  g.gain.setValueAtTime(0, t);
  let s = t;
  if (v === 0) {
    // Trill.
    const n = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const b = base * (1 - i * 0.025);
      f.setValueAtTime(b, s); f.linearRampToValueAtTime(b * 1.25, s + 0.04);
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.22, s + 0.008); g.gain.linearRampToValueAtTime(0, s + 0.045);
      s += 0.06;
    }
  } else if (v === 1) {
    // "tee-tyoo".
    f.setValueAtTime(base * 1.3, s);
    g.gain.linearRampToValueAtTime(0.22, s + 0.02); g.gain.linearRampToValueAtTime(0, s + 0.13);
    s += 0.18;
    f.setValueAtTime(base * 1.05, s); f.exponentialRampToValueAtTime(base * 0.75, s + 0.2);
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.2, s + 0.02); g.gain.linearRampToValueAtTime(0, s + 0.2);
    s += 0.22;
  } else if (v === 2) {
    // Warble with a fast vibrato.
    const lfo = e.osc('sine', rnd(22, 32));
    const depth = e.gain(base * 0.12);
    lfo.connect(depth); depth.connect(f);
    f.setValueAtTime(base * 0.9, s); f.linearRampToValueAtTime(base * 1.15, s + 0.45);
    g.gain.linearRampToValueAtTime(0.16, s + 0.05); g.gain.setValueAtTime(0.16, s + 0.35); g.gain.linearRampToValueAtTime(0, s + 0.45);
    lfo.start(t); lfo.stop(t + 0.5);
    s += 0.47;
  } else {
    // "chip chip chip".
    for (let i = 0; i < 3; i++) {
      f.setValueAtTime(base * 0.8, s); f.exponentialRampToValueAtTime(base * 1.5, s + 0.03);
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.2, s + 0.006); g.gain.linearRampToValueAtTime(0, s + 0.032);
      s += 0.11;
    }
  }
  o.start(t); o.stop(s + 0.05);
  return s + 0.05;
}

export function gull(e: AudioEngine, out: AudioNode, t: number): number {
  const o = e.osc('sawtooth', 700);
  const f = e.filter('bandpass', 1500, 1.5);
  const g = e.gain();
  o.connect(f); f.connect(g); g.connect(out);
  g.gain.setValueAtTime(0, t);
  let s = t;
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const k = rnd(0.9, 1.1);
    o.frequency.setValueAtTime(700 * k, s); o.frequency.linearRampToValueAtTime(1150 * k, s + 0.08); o.frequency.linearRampToValueAtTime(820 * k, s + 0.34);
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.18, s + 0.04); g.gain.linearRampToValueAtTime(0, s + 0.34);
    s += rnd(0.42, 0.55);
  }
  o.start(t); o.stop(s);
  return s;
}

export function hawk(e: AudioEngine, out: AudioNode, t: number): number {
  const o = e.osc('sawtooth', 2600);
  const f = e.filter('bandpass', 2600, 3);
  const g = e.gain();
  o.connect(f); f.connect(g); g.connect(out);
  o.frequency.setValueAtTime(2500, t); o.frequency.linearRampToValueAtTime(2900, t + 0.15); o.frequency.exponentialRampToValueAtTime(1600, t + 1.1);
  f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(1700, t + 1.1);
  const end = ad(g.gain, t, 0.06, 0.16, 1.05);
  o.start(t); o.stop(end);
  return end;
}

export function cricket(e: AudioEngine, out: AudioNode, t: number, f0: number): number {
  const o = e.osc('sine', f0);
  const g = e.gain();
  o.connect(g); g.connect(out);
  g.gain.setValueAtTime(0, t);
  const n = 3 + Math.floor(Math.random() * 2);
  let s = t;
  for (let i = 0; i < n; i++) {
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.1, s + 0.004);
    g.gain.setValueAtTime(0.1, s + 0.014); g.gain.linearRampToValueAtTime(0, s + 0.02);
    s += 0.04;
  }
  o.start(t); o.stop(s + 0.02);
  return s + 0.02;
}

export function owl(e: AudioEngine, out: AudioNode, t: number): number {
  const f0 = rnd(330, 400);
  tone(e, out, t, 'sine', f0, f0 * 0.96, 0.06, 0.22, 0.3);
  tone(e, out, t + 0.5, 'sine', f0 * 1.04, f0 * 0.9, 0.08, 0.24, 0.6);
  return burst(e, out, t + 0.5, 'pink', 'lowpass', 600, 0.7, 0.08, 0.04, 0.5);
}

export function frog(e: AudioEngine, out: AudioNode, t: number): number {
  const o = e.osc('sawtooth', rnd(110, 150));
  const f = e.filter('bandpass', rnd(600, 900), 5);
  const g = e.gain();
  o.connect(f); f.connect(g); g.connect(out);
  g.gain.setValueAtTime(0, t);
  const n = 6 + Math.floor(Math.random() * 6);
  let s = t;
  for (let i = 0; i < n; i++) {
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.4, s + 0.008); g.gain.linearRampToValueAtTime(0, s + 0.03);
    s += 0.036;
  }
  o.start(t); o.stop(s + 0.02);
  return s + 0.02;
}

export function howl(e: AudioEngine, out: AudioNode, t: number): number {
  const f0 = rnd(360, 420);
  const o = e.osc('triangle', f0);
  const lfo = e.osc('sine', 5);
  const depth = e.gain(7);
  lfo.connect(depth); depth.connect(o.frequency);
  const g = e.gain();
  o.connect(g); g.connect(out);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f0 * 1.6, t + 0.7);
  o.frequency.setValueAtTime(f0 * 1.6, t + 1.8);
  o.frequency.linearRampToValueAtTime(f0 * 1.15, t + 2.8);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.4); g.gain.setValueAtTime(0.2, t + 2.0); g.gain.linearRampToValueAtTime(0, t + 2.9);
  o.start(t); o.stop(t + 3); lfo.start(t); lfo.stop(t + 3);
  return t + 3;
}

export function grunt(e: AudioEngine, out: AudioNode, t: number): number {
  const o = e.osc('sawtooth', rnd(75, 95));
  const f = e.filter('lowpass', 450, 2);
  const g = e.gain();
  o.connect(f); f.connect(g); g.connect(out);
  g.gain.setValueAtTime(0, t);
  let s = t;
  for (let i = 0; i < 5 + Math.random() * 4; i++) {
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.5, s + 0.01); g.gain.linearRampToValueAtTime(0, s + 0.035);
    s += 0.048;
  }
  o.start(t); o.stop(s);
  return s;
}

/** Death cry of a felled animal. */
export function squeal(e: AudioEngine, out: AudioNode, t: number, kind: string): number {
  const big = kind === 'deer', boar = kind === 'boar';
  const f0 = big ? 650 : boar ? 380 : 1400;
  const o = e.osc(boar ? 'square' : 'sawtooth', f0);
  const lfo = e.osc('sine', 9);
  const depth = e.gain(f0 * 0.05);
  lfo.connect(depth); depth.connect(o.frequency);
  const f = e.filter('bandpass', f0 * 1.8, 2);
  const g = e.gain();
  o.connect(f); f.connect(g); g.connect(out);
  const dur = big ? 0.6 : boar ? 0.45 : 0.22;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f0 * 1.5, t + dur * 0.25);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + dur);
  const end = ad(g.gain, t, 0.02, 0.35, dur);
  o.start(t); o.stop(end); lfo.start(t); lfo.stop(end);
  return end;
}

export function fishSplash(e: AudioEngine, out: AudioNode, t: number, s: number): number {
  burst(e, out, t, 'white', 'bandpass', 1400, 1, 0.005, 0.3 * s, 0.14, 2600);
  return tone(e, out, t + 0.03, 'sine', 600, 1300, 0.003, 0.08 * s, 0.05);
}

export function lavaPop(e: AudioEngine, out: AudioNode, t: number): number {
  tone(e, out, t, 'sine', rnd(150, 220), 50, 0.004, 0.45, 0.08);
  burst(e, out, t, 'white', 'highpass', 3000, 0.7, 0.001, 0.08, 0.01);
  return burst(e, out, t, 'brown', 'lowpass', 300, 0.7, 0.005, 0.4, 0.12);
}

/** Popping embers. */
export function crackle(e: AudioEngine, out: AudioNode, t: number, dur: number, rate: number): number {
  return grains(e, out, t, Math.max(1, Math.round(dur * rate)), dur, 1800, 5500, 0.5, 0.006);
}

// ------------------------------------------------------------------ dragons

export function roar(e: AudioEngine, out: AudioNode, t: number, scale: number): number {
  const dur = 2.1 * Math.sqrt(scale);
  const base = 72 / scale;
  const shaper = e.ctx!.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 3.2); }
  shaper.curve = curve;
  const lp = e.filter('lowpass', 400, 3);
  const g = e.gain();
  const tg = e.gain(0.75);
  const mix = e.gain(0.33);
  mix.connect(shaper); shaper.connect(lp); lp.connect(g); g.connect(tg); tg.connect(out);
  for (const k of [1, 1.017, 1.49]) {
    const o = e.osc('sawtooth', base * k);
    o.frequency.setValueAtTime(base * k * 0.8, t);
    o.frequency.linearRampToValueAtTime(base * k * 1.18, t + dur * 0.25);
    o.frequency.exponentialRampToValueAtTime(base * k * 0.62, t + dur);
    o.connect(mix);
    o.start(t); o.stop(t + dur + 0.1);
  }
  // Growl: a fast tremolo on the voice.
  const trem = e.osc('sine', 24);
  const td = e.gain(0.25);
  trem.connect(td); td.connect(tg.gain);
  trem.start(t); trem.stop(t + dur + 0.1);
  lp.frequency.setValueAtTime(320, t);
  lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.3);
  lp.frequency.exponentialRampToValueAtTime(380, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.7, t + 0.22);
  g.gain.setValueAtTime(0.65, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  burst(e, out, t, 'pink', 'bandpass', 650, 0.8, 0.2, 0.3, dur - 0.2);
  return t + dur + 0.1;
}

export function wingFlap(e: AudioEngine, out: AudioNode, t: number, k: number): number {
  burst(e, out, t, 'pink', 'lowpass', 280, 0.9, 0.12, 0.8 * k, 0.32, 520);
  return burst(e, out, t + 0.05, 'brown', 'lowpass', 140, 0.7, 0.06, 0.6 * k, 0.25);
}

export function snore(e: AudioEngine, out: AudioNode, t: number, scale: number): number {
  burst(e, out, t, 'pink', 'bandpass', 480, 1, 1.1, 0.22, 0.35);
  const s = t + 1.6;
  const o = e.osc('sawtooth', 46 / scale);
  const lp = e.filter('lowpass', 230, 1.5);
  const g = e.gain();
  const rg = e.gain(0.6);
  const rattle = e.osc('sine', 13);
  const rd = e.gain(0.4);
  rattle.connect(rd); rd.connect(rg.gain);
  o.connect(lp); lp.connect(g); g.connect(rg); rg.connect(out);
  g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.4, s + 0.3); g.gain.setValueAtTime(0.35, s + 1.1); g.gain.linearRampToValueAtTime(0, s + 1.7);
  o.start(s); o.stop(s + 1.8); rattle.start(s); rattle.stop(s + 1.8);
  burst(e, out, s, 'pink', 'lowpass', 700, 0.7, 0.3, 0.15, 1.3);
  return s + 1.8;
}

// ------------------------------------------------------------------ town

// ------------------------------------------------------------------ night monsters and battle

/** Zombie groan: a low, wavering sawtooth through a vowel-ish band. */
export function groan(e: AudioEngine, out: AudioNode, t: number): number {
  const f0 = rnd(70, 95), dur = rnd(1.1, 1.7);
  const o = e.osc('sawtooth', f0);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f0 * 1.15, t + dur * 0.4);
  o.frequency.linearRampToValueAtTime(f0 * 0.8, t + dur);
  const f = e.filter('bandpass', rnd(380, 520), 2.5);
  const g = e.gain();
  o.connect(f); f.connect(g); g.connect(out);
  const end = ad(g.gain, t, 0.25, 0.5, dur);
  o.start(t); o.stop(end + 0.02);
  return end;
}

/** Bones clattering. */
export function rattle(e: AudioEngine, out: AudioNode, t: number): number {
  return grains(e, out, t, 9, 0.45, 1800, 4200, 0.45, 0.025);
}

/** Deep growl (demons, trolls). */
export function growl(e: AudioEngine, out: AudioNode, t: number): number {
  const dur = rnd(0.8, 1.3);
  burst(e, out, t, 'brown', 'lowpass', 260, 0.9, 0.12, 0.7, dur, 160);
  return tone(e, out, t, 'sawtooth', rnd(48, 62), 40, 0.15, 0.18, dur);
}

/** Spider hiss. */
export function hiss(e: AudioEngine, out: AudioNode, t: number): number {
  return burst(e, out, t, 'white', 'highpass', 3800, 0.8, 0.05, 0.22, rnd(0.4, 0.7));
}

/** Ghostly wail: a sliding sine with slow vibrato. */
export function wail(e: AudioEngine, out: AudioNode, t: number): number {
  const f0 = rnd(420, 560), dur = 1.8;
  const o = e.osc('sine', f0), lfo = e.osc('sine', 5), lg = e.gain(f0 * 0.03);
  lfo.connect(lg); lg.connect(o.frequency);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f0 * 1.35, t + dur * 0.4);
  o.frequency.linearRampToValueAtTime(f0 * 0.8, t + dur);
  const g = e.gain();
  o.connect(g); g.connect(out);
  const end = ad(g.gain, t, 0.5, 0.16, dur);
  o.start(t); lfo.start(t); o.stop(end + 0.02); lfo.stop(end + 0.02);
  return end;
}

/** A weapon whooshing through the air. */
export function swing(e: AudioEngine, out: AudioNode, t: number): number {
  return burst(e, out, t, 'white', 'bandpass', 700, 1.4, 0.04, 0.25, 0.14, 2600);
}

/** A blow landing on a body. */
export function thud(e: AudioEngine, out: AudioNode, t: number): number {
  burst(e, out, t, 'pink', 'lowpass', 700, 0.8, 0.002, 0.5, 0.12);
  return tone(e, out, t, 'sine', 150, 70, 0.002, 0.35, 0.14);
}

/** Steel on steel (the warrior's armour or shield). */
export function clang(e: AudioEngine, out: AudioNode, t: number): number {
  let end = t;
  for (const [f, a, d] of [[1650, 0.2, 0.5], [2410, 0.14, 0.35], [3720, 0.08, 0.25]]) end = Math.max(end, tone(e, out, t, 'sine', f, f * 0.995, 0.001, a, d));
  burst(e, out, t, 'white', 'bandpass', 4000, 1, 0.001, 0.25, 0.03);
  return end;
}

/** Bowstring release. */
export function twang(e: AudioEngine, out: AudioNode, t: number): number {
  burst(e, out, t, 'white', 'highpass', 2500, 0.8, 0.001, 0.12, 0.05);
  return tone(e, out, t, 'triangle', 230, 205, 0.002, 0.3, 0.22);
}

/** A magic bolt: a falling shimmer. */
export function zap(e: AudioEngine, out: AudioNode, t: number): number {
  tone(e, out, t, 'sine', 1400, 380, 0.01, 0.18, 0.4);
  tone(e, out, t + 0.02, 'triangle', 2100, 600, 0.01, 0.08, 0.35);
  return burst(e, out, t, 'white', 'bandpass', 3000, 2, 0.01, 0.08, 0.3, 900);
}

/** A monster dissolving into smoke or bones. */
export function poof(e: AudioEngine, out: AudioNode, t: number): number {
  return burst(e, out, t, 'pink', 'lowpass', 500, 0.7, 0.02, 0.45, 0.6, 180);
}

// ------------------------------------------------------------------ eldritch

/** Deep-one gurgle: a few bubbling low glides. */
export function gurgle(e: AudioEngine, out: AudioNode, t: number): number {
  let end = t;
  for (let i = 0; i < 5; i++) {
    const at = t + i * rnd(0.08, 0.16), f = rnd(140, 260);
    end = Math.max(end, tone(e, out, at, 'sine', f, f * rnd(1.4, 2), 0.01, 0.2, 0.09));
  }
  burst(e, out, t, 'pink', 'bandpass', 420, 2, 0.05, 0.12, 0.5);
  return end;
}

/** A tentacle breaking the surface: water churning over a sub-bass swell. */
export function tentacleRise(e: AudioEngine, out: AudioNode, t: number): number {
  burst(e, out, t, 'pink', 'bandpass', 700, 0.6, 0.6, 0.5, 2.2, 300);
  grains(e, out, t + 0.3, 24, 2.2, 400, 1600, 0.25, 0.05);
  return tone(e, out, t, 'sine', 42, 32, 0.8, 0.5, 3);
}

/** The colossus rising far away: a slow, dissonant drone swell felt more than heard. */
export function colossusDrone(e: AudioEngine, out: AudioNode, t: number): number {
  let end = t;
  for (const [f, a] of [[33, 0.5], [41.5, 0.35], [49, 0.3], [69.3, 0.18], [98, 0.08]]) {
    end = Math.max(end, tone(e, out, t + Math.random() * 0.6, 'sine', f, f * 0.97, 3.5, a, 6));
  }
  burst(e, out, t, 'brown', 'lowpass', 140, 0.7, 3, 0.6, 6);
  return end;
}

/** A huge eye opening: a wet, creaking groan. */
export function eyeOpen(e: AudioEngine, out: AudioNode, t: number): number {
  grains(e, out, t, 30, 1.6, 120, 420, 0.3, 0.04);
  return tone(e, out, t, 'sawtooth', 58, 46, 0.4, 0.12, 1.6);
}

/**
 * The great dragon's voice: slow, huge syllables. A low growling sawtooth
 * through vowel bands, under a sub-bass that follows the words.
 */
export function wyrmVoice(e: AudioEngine, out: AudioNode, t: number, text: string): number {
  const vs = [...text.toLocaleLowerCase('tr')].filter((ch) => 'aeıioöuü'.includes(ch));
  const n = Math.min(14, Math.max(3, Math.round(vs.length * 0.45)));
  const f0 = 44;
  const o = e.osc('sawtooth', f0), sub = e.osc('sine', f0 / 2);
  const f1 = e.filter('bandpass', 380, 3), lp = e.filter('lowpass', 900, 0.7);
  const g = e.gain(), sg = e.gain();
  const trem = e.osc('sine', 17), td = e.gain(0.2);
  trem.connect(td); td.connect(g.gain);
  o.connect(f1); f1.connect(lp); lp.connect(g); g.connect(out);
  sub.connect(sg); sg.connect(out);
  g.gain.setValueAtTime(0, t); sg.gain.setValueAtTime(0, t);
  const formants: Record<string, number> = { a: 520, e: 440, ı: 330, i: 360, o: 400, ö: 380, u: 300, ü: 320 };
  let s = t;
  for (let i = 0; i < n; i++) {
    const v = vs[Math.floor((i / n) * vs.length)] ?? 'a';
    const dur = rnd(0.2, 0.32);
    o.frequency.setTargetAtTime(f0 * (1 + 0.12 * Math.sin(i * 1.3)), s, 0.05);
    f1.frequency.setTargetAtTime(formants[v] ?? 400, s, 0.04);
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.9, s + 0.05); g.gain.linearRampToValueAtTime(0.6, s + dur - 0.04); g.gain.linearRampToValueAtTime(0, s + dur);
    sg.gain.setValueAtTime(0, s); sg.gain.linearRampToValueAtTime(0.5, s + 0.06); sg.gain.linearRampToValueAtTime(0, s + dur + 0.05);
    s += dur + rnd(0.04, 0.09);
  }
  for (const x of [o, sub, trem]) { x.start(t); x.stop(s + 0.1); }
  burst(e, out, t, 'brown', 'lowpass', 160, 0.7, 0.3, 0.25, s - t);
  return s + 0.1;
}

/** A lute phrase: plucked triangle notes on a minor pentatonic, with a soft second string. */
export function lute(e: AudioEngine, out: AudioNode, t: number, root: number, notes: number): number {
  const scale = [0, 3, 5, 7, 10, 12, 15];
  let end = t, step = Math.floor(rnd(0, 4));
  for (let i = 0; i < notes; i++) {
    step = Math.max(0, Math.min(scale.length - 1, step + Math.round(rnd(-2, 2))));
    const f = root * Math.pow(2, scale[step] / 12);
    const at = t + i * 0.24 + (i % 2 ? 0.02 : 0);
    tone(e, out, at, 'triangle', f, f * 0.995, 0.003, 0.16, 0.5);
    end = Math.max(end, tone(e, out, at, 'sine', f * 2, f * 1.99, 0.002, 0.05, 0.25));
  }
  return end;
}

/** Struck bell: inharmonic partials with long, staggered decays. */
export function bell(e: AudioEngine, out: AudioNode, t: number, f0: number, vol: number): number {
  const parts: Array<[number, number, number]> = [
    [0.5, 0.5, 7], [1, 0.7, 5], [1.19, 0.35, 3.5], [1.5, 0.25, 3], [2, 0.3, 2.5],
    [2.52, 0.15, 1.8], [2.98, 0.12, 1.4], [4.07, 0.08, 1], [5.4, 0.05, 0.6],
  ];
  let end = t;
  for (const [r, a, d] of parts) {
    const f = f0 * r * rnd(0.998, 1.002);
    end = Math.max(end, tone(e, out, t, 'sine', f, f * 0.999, 0.004, a * vol * 0.4, d));
  }
  burst(e, out, t, 'white', 'bandpass', 3000, 1, 0.001, 0.3 * vol, 0.03);
  return end;
}

export function anvil(e: AudioEngine, out: AudioNode, t: number): number {
  const f0 = rnd(880, 1050);
  let end = t;
  for (const [r, a, d] of [[1, 0.3, 0.7], [2.76, 0.2, 0.4], [5.4, 0.12, 0.25], [8.93, 0.08, 0.15]] as const) {
    end = Math.max(end, tone(e, out, t, 'sine', f0 * r, f0 * r, 0.001, a, d));
  }
  burst(e, out, t, 'white', 'highpass', 2000, 0.7, 0.001, 0.4, 0.025);
  return end;
}

// Formants (F1, F2) of the Turkish vowels.
const VOWELS: Record<string, [number, number]> = {
  a: [750, 1200], e: [500, 1850], ı: [380, 1400], i: [300, 2250],
  o: [480, 860], ö: [420, 1550], u: [340, 800], ü: [300, 1650],
};

/**
 * Gibberish speech for a line of text: one syllable per vowel of the text
 * (so it follows the line's own vowels), a sawtooth "voice" through two
 * formant filters, rising for questions and falling for statements.
 */
export function babble(e: AudioEngine, out: AudioNode, t: number, text: string, f0: number): number {
  const vs = [...text.toLocaleLowerCase('tr')].filter((ch) => ch in VOWELS);
  if (!vs.length) vs.push('a', 'e');
  const n = Math.min(10, Math.max(2, Math.round(vs.length * 0.6)));
  const step = vs.length / n;
  const q = text.includes('?'), ex = text.includes('!');
  const o = e.osc('sawtooth', f0);
  const vib = e.osc('sine', 5.5);
  const vd = e.gain(f0 * 0.02);
  vib.connect(vd); vd.connect(o.frequency);
  const f1 = e.filter('bandpass', 700, 5), f2 = e.filter('bandpass', 1500, 6);
  const g2 = e.gain(0.45);
  const soft = e.filter('lowpass', f0 * 9, 0.5);
  const lp = e.filter('lowpass', 2400, 0.5);
  const g = e.gain();
  o.connect(soft); soft.connect(f1); soft.connect(f2); f2.connect(g2);
  f1.connect(lp); g2.connect(lp); lp.connect(g); g.connect(out);
  g.gain.setValueAtTime(0, t);
  const peak = ex ? 0.8 : 0.6;
  let s = t;
  for (let i = 0; i < n; i++) {
    const v = VOWELS[vs[Math.floor(i * step)]];
    const dur = rnd(0.07, 0.11);
    let k = 1 + 0.1 * Math.sin(i * 1.7 + f0);
    if (i === n - 1) k *= q ? 1.3 : ex ? 1.1 : 0.85;
    o.frequency.setTargetAtTime(f0 * k, s, 0.015);
    f1.frequency.setTargetAtTime(v[0], s, 0.012);
    f2.frequency.setTargetAtTime(v[1], s, 0.012);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(peak, s + 0.012);
    g.gain.linearRampToValueAtTime(peak * 0.7, s + dur - 0.015);
    g.gain.linearRampToValueAtTime(0, s + dur);
    s += dur + rnd(0.015, 0.035);
  }
  o.start(t); o.stop(s + 0.05); vib.start(t); vib.stop(s + 0.05);
  return s + 0.05;
}

// ------------------------------------------------------------------ UI

/** Soft FM bell arpeggio (discoveries, rumours). */
export function chime(e: AudioEngine, out: AudioNode, t: number, notes: number[], gap = 0.12, vol = 0.22): number {
  let end = t;
  notes.forEach((f, i) => {
    const s = t + i * gap;
    const car = e.osc('sine', f);
    const mod = e.osc('sine', f * 3.5);
    const idx = e.gain(f * 1.2);
    mod.connect(idx); idx.connect(car.frequency);
    idx.gain.setValueAtTime(f * 1.2, s);
    idx.gain.exponentialRampToValueAtTime(f * 0.05, s + 0.6);
    const g = e.gain();
    car.connect(g); g.connect(out);
    const en = ad(g.gain, s, 0.005, vol, 1.8);
    car.start(s); car.stop(en); mod.start(s); mod.stop(en);
    end = Math.max(end, en);
  });
  return end;
}

/** A water droplet / bubble ("plip"). */
export function drip(e: AudioEngine, out: AudioNode, t: number, f: number, vol: number): number {
  return tone(e, out, t, 'sine', f, f * rnd(1.6, 2.4), 0.003, vol, rnd(0.03, 0.06));
}
