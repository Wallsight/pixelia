// Audio engine: one AudioContext (created on the first user gesture), mix
// buses, a generated reverb and looping noise buffers. Every sound in Pixelia
// is synthesised at runtime; there are no audio files.

export type Bus = 'sfx' | 'amb' | 'voice' | 'music';

export interface Spot {
  /** Feed sources into this node. */
  input: GainNode;
  panner: PannerNode;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  /** Master low-pass (closes when the camera is under water). */
  private muffle!: BiquadFilterNode;
  private buses = {} as Record<Bus, GainNode>;
  private reverbIn!: GainNode;
  white!: AudioBuffer;
  pink!: AudioBuffer;
  brown!: AudioBuffer;
  private _muted = false;
  private _music = true;
  private listenerPos = { x: 0, y: 0, z: 0 };
  private out!: AudioNode;
  private meterState: { an: AnalyserNode; buf: Float32Array<ArrayBuffer>; peak: number; rms: number } | null = null;

  constructor() {
    try {
      const raw = localStorage.getItem('pixelia:audio');
      if (raw) {
        const d = JSON.parse(raw) as { muted?: boolean; music?: boolean };
        this._muted = d.muted === true;
        this._music = d.music !== false;
      }
    } catch { /* defaults */ }
  }

  get ready(): boolean { return this.ctx !== null && this.ctx.state === 'running'; }
  get muted(): boolean { return this._muted; }
  get musicOn(): boolean { return this._music; }
  get now(): number { return this.ctx ? this.ctx.currentTime : 0; }

  /** Creates or resumes the context; call from a user gesture. */
  start(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.build(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  suspend(): void { if (this.ctx?.state === 'running') void this.ctx.suspend(); }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.08);
    this.saveSettings();
  }

  setMusic(on: boolean): void {
    this._music = on;
    if (this.ctx) this.buses.music.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.5);
    this.saveSettings();
  }

  private saveSettings(): void {
    try { localStorage.setItem('pixelia:audio', JSON.stringify({ muted: this._muted, music: this._music })); } catch { /* ignore */ }
  }

  private build(ctx: AudioContext): void {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.005; comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.out = comp;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.5;
    this.muffle.connect(comp);
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : 0.9;
    this.master.connect(this.muffle);

    const levels: Record<Bus, number> = { sfx: 0.85, amb: 0.7, voice: 0.55, music: this._music ? 0.32 : 0 };
    for (const k of Object.keys(levels) as Bus[]) {
      const g = ctx.createGain();
      g.gain.value = levels[k];
      g.connect(this.master);
      this.buses[k] = g;
    }

    const rev = ctx.createConvolver();
    rev.buffer = impulse(ctx, 2.6);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    this.reverbIn = ctx.createGain();
    this.reverbIn.connect(rev); rev.connect(revOut); revOut.connect(this.master);

    this.white = noise(ctx, 'white', 3);
    this.pink = noise(ctx, 'pink', 5);
    this.brown = noise(ctx, 'brown', 5);
  }

  bus(b: Bus): GainNode { return this.buses[b]; }

  /** Dev: loudest peak and RMS (dBFS) at the output since the last call. */
  meter(): string {
    if (!this.ctx) return 'no ctx';
    if (!this.meterState) {
      const an = this.ctx.createAnalyser();
      an.fftSize = 2048;
      this.out.connect(an);
      const m = (this.meterState = { an, buf: new Float32Array(2048), peak: 0, rms: 0 });
      setInterval(() => {
        m.an.getFloatTimeDomainData(m.buf);
        let pk = 0, sq = 0;
        for (const v of m.buf) { pk = Math.max(pk, Math.abs(v)); sq += v * v; }
        m.peak = Math.max(m.peak, pk); m.rms = Math.max(m.rms, Math.sqrt(sq / m.buf.length));
      }, 20);
    }
    const m = this.meterState;
    const db = (v: number) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');
    const r = `peak ${db(m.peak)} dB, rms ${db(m.rms)} dB`;
    m.peak = 0; m.rms = 0;
    return r;
  }
  get reverb(): GainNode { return this.reverbIn; }

  /** Moves the listener to the camera. */
  listen(x: number, y: number, z: number, fx: number, fy: number, fz: number, ux: number, uy: number, uz: number, underwater: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener, t = ctx.currentTime;
    this.listenerPos.x = x; this.listenerPos.y = y; this.listenerPos.z = z;
    if (l.positionX) {
      l.positionX.setValueAtTime(x, t); l.positionY.setValueAtTime(y, t); l.positionZ.setValueAtTime(z, t);
      l.forwardX.setValueAtTime(fx, t); l.forwardY.setValueAtTime(fy, t); l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(ux, t); l.upY.setValueAtTime(uy, t); l.upZ.setValueAtTime(uz, t);
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
    this.muffle.frequency.setTargetAtTime(underwater ? 520 : 20000, t, 0.06);
  }

  /** Distance from the listener (for culling far one-shots). */
  dist(x: number, y: number, z: number): number {
    const p = this.listenerPos;
    return Math.hypot(x - p.x, y - p.y, z - p.z);
  }

  /** A positioned input: sources -> gain -> panner -> bus (+ reverb send). */
  spot(x: number, y: number, z: number, bus: Bus, ref = 4, wet = 0.15, rolloff = 1): Spot {
    const ctx = this.ctx!;
    const input = ctx.createGain();
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = ref;
    panner.rolloffFactor = rolloff;
    panner.maxDistance = 10000;
    if (panner.positionX) { panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z; }
    else panner.setPosition(x, y, z);
    input.connect(panner);
    panner.connect(this.buses[bus]);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      panner.connect(send);
      send.connect(this.reverbIn);
    }
    return { input, panner };
  }

  /** A non-positional input (the player's own sounds, UI, beds). */
  flat(bus: Bus, wet = 0): GainNode {
    const ctx = this.ctx!;
    const input = ctx.createGain();
    input.connect(this.buses[bus]);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      input.connect(send);
      send.connect(this.reverbIn);
    }
    return input;
  }

  /** Looping noise starting at a random offset (so parallel copies decorrelate). */
  noiseSrc(kind: 'white' | 'pink' | 'brown', rate = 1): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = kind === 'white' ? this.white : kind === 'pink' ? this.pink : this.brown;
    s.loop = true;
    s.playbackRate.value = rate;
    return s;
  }

  /** Start a looping noise at a random offset. */
  startNoise(s: AudioBufferSourceNode, when: number, dur?: number): void {
    const len = s.buffer!.duration;
    s.start(when, Math.random() * len);
    if (dur !== undefined) s.stop(when + dur);
  }

  filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }

  gain(v = 0): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    return g;
  }

  osc(type: OscillatorType, freq: number): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type; o.frequency.value = freq;
    return o;
  }
}

export function setPannerPos(p: PannerNode, x: number, y: number, z: number, t: number): void {
  if (p.positionX) {
    p.positionX.setTargetAtTime(x, t, 0.03); p.positionY.setTargetAtTime(y, t, 0.03); p.positionZ.setTargetAtTime(z, t, 0.03);
  } else {
    p.setPosition(x, y, z);
  }
}

/** Disconnects a node chain once the last source has ended. */
export function cleanupAfter(src: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
  src.onended = () => { for (const n of nodes) n.disconnect(); };
}

function noise(ctx: AudioContext, kind: 'white' | 'pink' | 'brown', seconds: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w * 0.5;
    else if (kind === 'pink') {
      // Paul Kellet's refined pink filter.
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  // Crossfade the loop seam.
  const f = Math.min(2048, n >> 4);
  for (let i = 0; i < f; i++) {
    const k = i / f;
    d[i] = d[i] * k + d[n - f + i] * (1 - k);
  }
  return buf;
}

/** Stereo decaying-noise impulse that darkens as it decays. */
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const a = 0.15 + 0.8 * t; // one-pole smoothing grows with time: high end dies first
      lp += (Math.random() * 2 - 1 - lp) * (1 - a);
      const pre = i < ctx.sampleRate * 0.012 ? 0 : 1;
      d[i] = lp * Math.pow(1 - t, 2.6) * pre * 0.6;
    }
  }
  return buf;
}
