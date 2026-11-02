// The living soundscape: reads the world around the listener (water, lava,
// trees, biome, hour, nearby creatures and towns) and drives looping beds
// (wind, stream, surf, lava, crowd, tower drone...) plus positioned one-shots
// (footsteps, birds, crickets, bells, anvils, voices, dragons).

import type * as THREE from 'three';
import { AudioEngine, setPannerPos, type Bus } from './engine';
import * as X from './synth';
import { Music, type Mood } from './music';
import { B, KIND, KIND_LEAVES, KIND_PLANT, KIND_WATER } from '../world/blocks';
import { BIOME } from '../world/biomes';
import { SITE_CITY, SITE_VILLAGE } from '../world/structures';
import { villageLayout } from '../world/village';
import type { ColumnSample, Terrain } from '../world/terrain';
import type { World } from '../world/world';
import type { Creature, Creatures } from '../creatures/creatures';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** Vowel patterns for far-off chatter (only the vowels matter). */
const WALLA = ['Evet evet, öyle', 'Ne diyorsun?', 'Bugün hava güzel', 'Hadi bakalım', 'Olur mu öyle şey!', 'Haklısın', 'Pazara gidelim'];
const TAU = Math.PI * 2;

// Footstep material per block id.
const MATS: X.Material[] = ['stone', 'grass', 'dirt', 'wood', 'sand', 'snow', 'gravel', 'leaves', 'water', 'metal'];
const MAT = new Uint8Array(256);
for (const [name, id] of Object.entries(B)) {
  const n = name.toLowerCase();
  const m: X.Material =
    n.includes('snow') ? 'snow'
      : n.includes('water') ? 'water'
        : n === 'sandstone' ? 'stone'
          : n.includes('sand') || n === 'ash' ? 'sand'
            : n.includes('grass') ? 'grass'
              : n === 'dirt' || n === 'farmland' ? 'dirt'
                : n === 'path' ? 'dirt'
                : n === 'gravel' ? 'gravel'
                  : n.includes('leaves') || n === 'hay' || n === 'thatch' || n.startsWith('cloth') ? 'leaves'
                    : n.includes('planks') || n.includes('log') || n.startsWith('door') || n === 'crate' || n === 'window_wood' || n === 'booth_blue' ? 'wood'
                      : n === 'steel' || n === 'gold' || n === 'vault_gear' || n === 'lantern' ? 'metal'
                        : 'stone';
  MAT[id] = MATS.indexOf(m);
}

const BIRDY = new Set<number>([BIOME.PLAINS, BIOME.FOREST, BIOME.BIRCH_FOREST, BIOME.TAIGA, BIOME.RIVER]);
const SEASIDE = new Set<number>([BIOME.OCEAN, BIOME.FROZEN_OCEAN, BIOME.BEACH, BIOME.STONY_SHORE, BIOME.BLACK_BEACH, BIOME.ELDRITCH_SEA]);
const HIGH = new Set<number>([BIOME.MOUNTAINS, BIOME.SNOW_PEAKS, BIOME.BADLANDS, BIOME.DESERT, BIOME.TUNDRA]);
const WOODS = new Set<number>([BIOME.FOREST, BIOME.BIRCH_FOREST, BIOME.TAIGA, BIOME.GLOOM]);
const WOLVES = new Set<number>([BIOME.TAIGA, BIOME.TUNDRA, BIOME.GLOOM, BIOME.MOUNTAINS, BIOME.SNOW_PEAKS]);
const CRICKETS = new Set<number>([BIOME.PLAINS, BIOME.FOREST, BIOME.BIRCH_FOREST, BIOME.RIVER, BIOME.DESERT, BIOME.BADLANDS]);

interface Loop { srcs: AudioScheduledSourceNode[]; out: GainNode }
interface DragonAudio { lastSin: number; snore: number; roar: number; fire: { loop: Loop; panner: PannerNode } | null }
interface Cricket { x: number; z: number; f: number; next: number }

/** Inputs the soundscape reads each frame. */
export interface Listener {
  camera: THREE.Camera;
  forward: THREE.Vector3;
  up: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  onGround: boolean;
  inWater: boolean;
  flying: boolean;
  night: number;
  /** Day fraction 0..1 (0.5 = noon). */
  time: number;
  timeSpeed: number;
  sample: ColumnSample | null;
}

export class Soundscape {
  readonly engine = new AudioEngine();
  private music: Music;
  private active = 0;
  private built = false;
  private t = 0;
  // Beds.
  private wind!: { g: GainNode; bp: BiquadFilterNode[] };
  private leaves!: GainNode;
  private stream!: { g: GainNode; pan: StereoPannerNode };
  private ocean!: { g: GainNode; foam: GainNode; lp: BiquadFilterNode; pan: StereoPannerNode };
  private lava!: GainNode;
  private drone!: { g: GainNode; lp: BiquadFilterNode };
  private whisper!: { g: GainNode; bp: BiquadFilterNode[] };
  private fountain!: { g: GainNode; panner: PannerNode };
  private underwater!: GainNode;
  // Environment, refreshed a few times a second.
  private envTimer = 0;
  private env = { water: 0, lava: 0, leaves: 0, waterPan: 0, ocean: false, waterX: 0, waterZ: 0 };
  private lavaSpots: Array<[number, number, number]> = [];
  private townTimer = 0;
  private bells: Array<[number, number, number]> = [];
  private anvils: Array<[number, number, number]> = [];
  private fountainAt: [number, number, number] | null = null;
  private anvilT = 2;
  private hour = -1;
  // Player.
  private stepDist = 0;
  private lastVy = 0;
  private wasGround = true;
  private wasWater = false;
  // Creatures.
  private dragons = new Map<Creature, DragonAudio>();
  private crickets: Cricket[] = [];
  private burnTimer = 0;

  constructor(private world: World, private terrain: Terrain, private creatures: Creatures) {
    this.music = new Music(this.engine);
    creatures.onSound = (ev, c, text) => this.creatureEvent(ev, c, text);
  }

  /** Call from a user gesture. */
  start(): void { this.engine.start(); }

  // ------------------------------------------------------------ one-shots

  private play(at: [number, number, number] | null, bus: Bus, ref: number, wet: number, maxD: number, vol: number, fn: (out: AudioNode, t: number) => number): void {
    const e = this.engine;
    if (!e.ready || this.active > 72) return;
    let input: GainNode, panner: PannerNode | null = null;
    if (at) {
      if (e.dist(at[0], at[1], at[2]) > maxD) return;
      const s = e.spot(at[0], at[1], at[2], bus, ref, wet);
      input = s.input; panner = s.panner;
    } else input = e.flat(bus, wet);
    input.gain.value = vol;
    const t = e.now + 0.02;
    const end = fn(input, t);
    this.active++;
    setTimeout(() => { input.disconnect(); panner?.disconnect(); this.active--; }, (end - t) * 1000 + 500);
  }

  /** Discovery / rumour jingles. */
  jingle(kind: 'found' | 'rumor'): void {
    if (kind === 'found') this.play(null, 'sfx', 0, 0.5, 0, 0.9, (o, t) => X.chime(this.engine, o, t, [784, 988, 1175, 1568], 0.11));
    else this.play(null, 'sfx', 0, 0.5, 0, 0.7, (o, t) => X.chime(this.engine, o, t, [659, 880], 0.16, 0.16));
  }

  private creatureEvent(ev: string, c: Creature, text?: string): void {
    const e = this.engine;
    if (!e.ready) return;
    const at: [number, number, number] = [c.x, c.y + 1.2 * c.scale, c.z];
    if (ev === 'say' && c.npc && text) {
      const r = c.npc.role, k = (c.seed % 1000) / 1000;
      const f0 = r === 'kid' ? 290 + k * 70 : r === 'elder' ? 118 + k * 30 : r === 'guard' ? 98 + k * 25
        : r === 'merchant' ? 150 + k * 50 : k < 0.5 ? 108 + k * 70 : 175 + (k - 0.5) * 120;
      at[1] = c.y + 1.6 * c.scale;
      this.play(at, 'voice', 3, 0.1, 32, 0.9, (o, t) => X.babble(e, o, t, text, f0));
    } else if (ev === 'roar') {
      at[1] = c.y + 3 * c.scale;
      this.play(at, 'sfx', 30, 0.4, 500, 1, (o, t) => X.roar(e, o, t, c.scale));
    } else if (ev === 'kill') {
      this.play(at, 'sfx', 6, 0.15, 160, 1, (o, t) => X.squeal(e, o, t, this.creatures.nameOf(c)));
    } else if (ev === 'leap') {
      this.play(at, 'sfx', 3, 0.05, 40, 0.6, (o, t) => X.fishSplash(e, o, t, 0.7));
    } else if (ev === 'splash') {
      this.play(at, 'sfx', 3, 0.05, 40, 0.8, (o, t) => X.fishSplash(e, o, t, 1));
    }
  }

  // ------------------------------------------------------------ beds

  private loop(srcs: AudioScheduledSourceNode[], out: GainNode): Loop {
    for (const s of srcs) {
      if (s instanceof AudioBufferSourceNode) this.engine.startNoise(s, this.engine.now);
      else s.start();
    }
    return { srcs, out };
  }

  private build(): void {
    const e = this.engine, ctx = e.ctx!;
    const amb = (wet = 0) => e.flat('amb', wet);

    // Wind: two decorrelated pink noise bands, panned apart.
    const wg = amb(0.1); wg.gain.value = 0;
    const bp: BiquadFilterNode[] = [];
    for (const pan of [-0.7, 0.7]) {
      const s = e.noiseSrc('pink'), f = e.filter('bandpass', 400, 1.3), p = ctx.createStereoPanner();
      p.pan.value = pan;
      s.connect(f); f.connect(p); p.connect(wg);
      this.loop([s], wg); bp.push(f);
    }
    this.wind = { g: wg, bp };

    // Leaves rustling in the wind.
    this.leaves = amb(); this.leaves.gain.value = 0;
    { const s = e.noiseSrc('pink'), b = e.filter('bandpass', 2600, 0.6); s.connect(b); b.connect(this.leaves); this.loop([s], this.leaves); }

    // Brook: two noise bands with a jittery level.
    { const g = amb(0.05); g.gain.value = 0; const pan = ctx.createStereoPanner(); pan.connect(g);
      for (const [f, q] of [[500, 0.7], [1300, 1.1]]) { const s = e.noiseSrc('pink'), b = e.filter('bandpass', f, q); s.connect(b); b.connect(pan); this.loop([s], g); }
      this.stream = { g, pan }; }

    // Surf: brown noise whose brightness swells with each wave, plus foam.
    { const g = amb(0.1); g.gain.value = 0; const pan = ctx.createStereoPanner(); pan.connect(g);
      const s = e.noiseSrc('brown'), lp = e.filter('lowpass', 300, 0.6); s.connect(lp); lp.connect(pan); this.loop([s], g);
      const foam = e.gain(0); const s2 = e.noiseSrc('white'), hp = e.filter('highpass', 1800, 0.7); s2.connect(hp); hp.connect(foam); foam.connect(pan); this.loop([s2], g);
      this.ocean = { g, foam, lp, pan }; }

    // Lava: a deep rumble.
    this.lava = amb(); this.lava.gain.value = 0;
    { const s = e.noiseSrc('brown'), lp = e.filter('lowpass', 160, 0.8); s.connect(lp); lp.connect(this.lava); this.loop([s], this.lava); }

    // Dark tower drone.
    { const g = amb(0.3); g.gain.value = 0; const lp = e.filter('lowpass', 240, 1.5); lp.connect(g);
      for (const f of [55, 55.35, 82.6]) { const o = e.osc('sawtooth', f); o.connect(lp); this.loop([o], g); }
      this.drone = { g, lp }; }

    // Eldritch whispers: narrow formant-like noise bands that wander.
    { const g = amb(0.4); g.gain.value = 0; const bps: BiquadFilterNode[] = [];
      for (let i = 0; i < 2; i++) { const s = e.noiseSrc('white'), b = e.filter('bandpass', 900, 9); s.connect(b); b.connect(g); this.loop([s], g); bps.push(b); }
      this.whisper = { g, bp: bps }; }

    // City fountain (a positioned bed).
    { const sp = e.spot(0, -999, 0, 'amb', 3, 0.1); sp.input.gain.value = 0;
      for (const [f, q] of [[900, 0.6], [2200, 1]]) { const s = e.noiseSrc('pink'), b = e.filter('bandpass', f, q); s.connect(b); b.connect(sp.input); this.loop([s], sp.input); }
      this.fountain = { g: sp.input, panner: sp.panner }; }

    // Under water.
    this.underwater = amb(); this.underwater.gain.value = 0;
    { const s = e.noiseSrc('brown'), lp = e.filter('lowpass', 300, 0.7); s.connect(lp); lp.connect(this.underwater); this.loop([s], this.underwater); }

    this.built = true;
  }

  // ------------------------------------------------------------ update

  update(dt: number, L: Listener): void {
    const e = this.engine;
    if (!e.ready) return;
    if (!this.built) this.build();
    this.t += dt;
    const p = L.pos, cam = L.camera.position;
    const camBlock = this.world.getBlock(Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z));
    const submerged = camBlock >= 0 && KIND[camBlock] === KIND_WATER && camBlock !== B.LAVA;
    e.listen(cam.x, cam.y, cam.z, L.forward.x, L.forward.y, L.forward.z, L.up.x, L.up.y, L.up.z, submerged);

    this.envTimer -= dt;
    if (this.envTimer <= 0) { this.envTimer = 0.35; this.sampleEnv(p.x, p.y, p.z, L); }
    this.townTimer -= dt;
    if (this.townTimer <= 0) { this.townTimer = 3; this.findTowns(p.x, p.z); }

    this.beds(dt, L, submerged);
    this.player(dt, L);
    this.wildlife(dt, L);
    this.town(dt, L);
    this.dragonsUpdate(dt);
    const biome = L.sample?.biome ?? BIOME.PLAINS;
    const mood: Mood = biome === BIOME.ASHLANDS ? 'ash' : biome === BIOME.ELDRITCH_SEA || biome === BIOME.BLACK_BEACH ? 'eld' : L.night > 0.5 ? 'night' : 'day';
    this.music.update(dt, mood);
  }

  /** Rings of columns around the listener: how much water, lava and foliage is near. */
  private sampleEnv(px: number, py: number, pz: number, L: Listener): void {
    let water = 0, lava = 0, leaves = 0, total = 0, wx = 0, wz = 0;
    this.lavaSpots.length = 0;
    const rot = this.t * 0.7;
    for (const r of [3, 7, 12, 18, 26, 34]) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU + rot + r;
        const x = Math.floor(px + Math.cos(a) * r), z = Math.floor(pz + Math.sin(a) * r);
        const top = this.world.surfaceY(x, z);
        if (top < 0) continue;
        const b = this.world.getBlock(x, top, z);
        const w = (1 / (1 + r / 6)) / (1 + Math.max(0, py - top - 3) / 10);
        total += w;
        if (b === B.LAVA) { lava += w; if (this.lavaSpots.length < 12) this.lavaSpots.push([x + 0.5, top + 1, z + 0.5]); }
        else if (KIND[b] === KIND_WATER) { water += w; wx += (x - px) * w; wz += (z - pz) * w; }
        else if (KIND[b] === KIND_LEAVES) leaves += w;
      }
    }
    const env = this.env;
    env.water = total ? water / total : 0;
    env.waterX = water ? wx / water : 0; env.waterZ = water ? wz / water : 0;
    env.lava = total ? lava / total : 0;
    env.leaves = total ? leaves / total : 0;
    // Pan toward the water: dot with the listener's right vector.
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      const rx = -L.forward.z, rz = L.forward.x, rl = Math.hypot(rx, rz) || 1;
      env.waterPan = Math.max(-0.8, Math.min(0.8, ((wx / len) * rx + (wz / len) * rz) / rl));
    }
    const biome = L.sample?.biome ?? BIOME.PLAINS;
    // Open water reads as surf, a thin ribbon of it as a brook.
    env.ocean = SEASIDE.has(biome) || (biome !== BIOME.RIVER && env.water > 0.35);
  }

  private beds(dt: number, L: Listener, submerged: boolean): void {
    const now = this.engine.now, env = this.env, t = this.t;
    const biome = L.sample?.biome ?? BIOME.PLAINS;
    const set = (g: AudioParam, v: number, tc = 0.6) => g.setTargetAtTime(v, now, tc);
    const gust = 0.5 + 0.5 * (Math.sin(t * 0.13) * 0.5 + Math.sin(t * 0.31 + 1) * 0.3 + Math.sin(t * 0.071 + 2) * 0.2);
    const alt = Math.max(0, Math.min(1, (L.pos.y - 70) / 50));
    const speed = L.flying ? Math.min(1, L.vel.length() / 60) : 0;
    const exposed = HIGH.has(biome) || SEASIDE.has(biome) ? 0.1 : 0;
    // Gentle on the ground, gusty and fuller up high or in flight; mostly quiet between gusts.
    const windLvl = (0.05 + exposed + alt * 0.45 + speed * 0.7) * (0.2 + 0.8 * gust * gust) * (submerged ? 0.1 : 1);
    set(this.wind.g.gain, windLvl);
    this.wind.bp.forEach((f, i) => set(f.frequency, 220 + 380 * gust + 300 * speed + i * 110, 0.4));
    set(this.leaves.gain, Math.min(1, env.leaves * 2) * Math.max(0, gust - 0.45) * 0.12);

    const near = (v: number) => Math.min(1, v * 3);
    // Only real streams babble (a ditch beside a field stays quiet).
    set(this.stream.g.gain, env.ocean ? 0 : this.brook() * (0.45 + 0.15 * Math.sin(t * 1.3)) * 0.6, 0.3);
    set(this.stream.pan.pan, env.waterPan, 0.3);
    // Waves roll in every ~9 s.
    const ph = (t / 9) % 1, swell = Math.pow(Math.sin(Math.PI * Math.min(1, ph * 1.25)), 2);
    const surf = env.ocean ? near(env.water) : 0;
    set(this.ocean.g.gain, surf * (0.35 + 0.65 * swell) * 1.4, 0.3);
    set(this.ocean.lp.frequency, 220 + 900 * swell, 0.3);
    set(this.ocean.foam.gain, Math.pow(swell, 3) * 0.12, 0.2);
    set(this.ocean.pan.pan, env.waterPan, 0.3);

    set(this.lava.gain, Math.min(1, env.lava * 4 + (biome === BIOME.ASHLANDS ? 0.15 : 0)) * 1.2);
    const tw = this.terrain.tower;
    const td = tw ? Math.hypot(tw.x - L.pos.x, tw.z - L.pos.z) : 1e9;
    set(this.drone.g.gain, (1 - Math.min(1, Math.max(0, (td - 120) / 600))) * 0.12 * (0.6 + 0.4 * L.night), 1.5);
    set(this.drone.lp.frequency, 180 + 120 * Math.sin(t * 0.2), 1);
    const eld = L.sample ? Math.min(1, L.sample.eld * 1.5) : 0;
    set(this.whisper.g.gain, eld * 0.5 * (0.5 + 0.5 * Math.sin(t * 0.37)), 0.8);
    this.whisper.bp.forEach((f, i) => set(f.frequency, 700 + 900 * (0.5 + 0.5 * Math.sin(t * (0.9 + i * 0.6) + i * 2)), 0.15));
    set(this.underwater.gain, submerged ? 0.5 : 0, 0.1);

    const f = this.fountainAt;
    if (f && Math.hypot(f[0] - L.pos.x, f[2] - L.pos.z) < 60) {
      setPannerPos(this.fountain.panner, f[0], f[1], f[2], now);
      set(this.fountain.g.gain, 0.22, 0.3);
    } else set(this.fountain.g.gain, 0, 0.3);
    void dt;
  }

  /** How strongly a brook should be heard (0..1). */
  private brook(): number {
    const w = this.env.water;
    return this.env.ocean ? 0 : Math.max(0, Math.min(1, (w - 0.06) / 0.2));
  }

  private player(dt: number, L: Listener): void {
    const p = L.pos, v = L.vel, e = this.engine;
    const hs = Math.hypot(v.x, v.z);
    if (!L.flying) {
      if (L.onGround && !this.wasGround && this.lastVy < -9) {
        const s = Math.min(1, (-this.lastVy - 8) / 18) + 0.3;
        this.play(null, 'sfx', 0, 0, 0, 0.7, (o, t) => X.land(e, o, t, s));
        this.stepDist = 0;
      }
      if (L.inWater && !this.wasWater && this.lastVy < -4) {
        this.play(null, 'sfx', 0, 0.1, 0, 0.8, (o, t) => X.splash(e, o, t, Math.min(1, -this.lastVy / 15)));
      }
      if ((L.onGround || L.inWater) && hs > 0.6) {
        this.stepDist += hs * dt;
        const stride = L.inWater ? 1.3 : hs > 5.5 ? 2.2 : 1.65;
        if (this.stepDist >= stride) {
          this.stepDist = 0;
          let mat: X.Material = 'water';
          if (!L.inWater) {
            const fx = Math.floor(p.x), fz = Math.floor(p.z);
            const under = this.world.getBlock(fx, Math.floor(p.y - 0.05), fz);
            mat = under >= 0 ? MATS[MAT[under]] : 'stone';
            const feet = this.world.getBlock(fx, Math.floor(p.y + 0.1), fz);
            if (feet >= 0 && KIND[feet] === KIND_PLANT && (mat === 'dirt' || mat === 'grass')) mat = 'grass';
          }
          const k = 0.45 + Math.min(0.5, hs / 14);
          this.play(null, 'sfx', 0, 0.03, 0, 0.55, (o, t) => X.footstep(e, o, t, mat, k));
        }
      } else this.stepDist = Math.min(this.stepDist, 1.2);
    }
    this.lastVy = v.y;
    this.wasGround = L.onGround;
    this.wasWater = L.inWater;
  }

  private around(L: Listener, r0: number, r1: number, dy0: number, dy1: number): [number, number, number] {
    const a = Math.random() * TAU, r = rnd(r0, r1);
    return [L.pos.x + Math.cos(a) * r, L.pos.y + rnd(dy0, dy1), L.pos.z + Math.sin(a) * r];
  }

  private wildlife(dt: number, L: Listener): void {
    const e = this.engine, env = this.env;
    const biome = L.sample?.biome ?? BIOME.PLAINS;
    const day = 1 - L.night, chance = (rate: number) => Math.random() < dt * rate;

    // Songbirds by day, more of them among trees; nearby flocks chatter too.
    if (BIRDY.has(biome) && chance(day * (0.2 + env.leaves * 1.8))) {
      const v = Math.floor(Math.random() * 4), base = [3200, 2600, 3500, 4100][v] * rnd(0.88, 1.12);
      this.play(this.around(L, 8, 30, 2, 9), 'amb', 5, 0.2, 60, 0.6, (o, t) => X.chirp(e, o, t, v, base));
    }
    if (day > 0.3) {
      for (const b of this.creatures.live('bird')) {
        if (Math.random() < dt * 0.04 && Math.abs(b.x - L.pos.x) < 35 && Math.abs(b.z - L.pos.z) < 35) {
          const v = Math.floor(b.seed) % 4;
          this.play([b.x, b.y, b.z], 'amb', 4, 0.15, 45, 0.5, (o, t) => X.chirp(e, o, t, v, 3000 + (b.seed % 900)));
        }
      }
    }
    if (SEASIDE.has(biome) && biome !== BIOME.ELDRITCH_SEA && chance(day * 0.07)) this.play(this.around(L, 15, 45, 6, 20), 'amb', 8, 0.25, 90, 0.6, (o, t) => X.gull(e, o, t));
    if (HIGH.has(biome) && chance(day * 0.015)) this.play(this.around(L, 30, 70, 25, 45), 'amb', 15, 0.35, 150, 0.6, (o, t) => X.hawk(e, o, t));

    // Night: crickets in the grass, owls in the woods, frogs by the water, wolves far off.
    const cricketsOn = L.night > 0.45 && CRICKETS.has(biome);
    while (this.crickets.length < 6) this.crickets.push({ x: 0, z: 0, f: rnd(4200, 5200), next: -1 });
    for (const c of this.crickets) {
      if (c.next < 0 || Math.hypot(c.x - L.pos.x, c.z - L.pos.z) > 32) {
        const a = Math.random() * TAU, r = rnd(5, 22);
        c.x = L.pos.x + Math.cos(a) * r; c.z = L.pos.z + Math.sin(a) * r; c.next = this.t + rnd(0, 2);
      }
      if (cricketsOn && this.t >= c.next) {
        c.next = this.t + rnd(0.7, 1.5) + (Math.random() < 0.15 ? rnd(2, 5) : 0);
        const y = Math.max(0, this.world.surfaceY(Math.floor(c.x), Math.floor(c.z))) + 1;
        this.play([c.x, y, c.z], 'amb', 2, 0.04, 40, 0.5 * L.night, (o, t) => X.cricket(e, o, t, c.f));
      }
    }
    if (L.night > 0.5 && (WOODS.has(biome) || env.leaves > 0.15) && chance(0.02)) this.play(this.around(L, 20, 50, 6, 14), 'amb', 10, 0.35, 90, 0.7, (o, t) => X.owl(e, o, t));
    if (L.night > 0.3 && !env.ocean && env.water > 0.03 && chance(Math.min(0.35, env.water * 2))) this.play(this.around(L, 6, 22, -1, 1), 'amb', 4, 0.1, 40, 0.5, (o, t) => X.frog(e, o, t));
    if (L.night > 0.6 && WOLVES.has(biome) && chance(0.006)) this.play(this.around(L, 90, 160, 0, 20), 'amb', 40, 0.6, 250, 0.8, (o, t) => X.howl(e, o, t));

    // Townsfolk further off chatting among themselves (the near ones speak in bubbles).
    for (const c of this.creatures.allNpcs()) {
      if (Math.random() >= dt * 0.05) continue;
      const d = Math.hypot(c.x - L.pos.x, c.z - L.pos.z);
      if (d < 22 || d > 50 || c.npc?.task !== 'chat') continue;
      const k = (c.seed % 1000) / 1000, f0 = k < 0.5 ? 110 + k * 70 : 180 + (k - 0.5) * 110;
      const text = WALLA[Math.floor(Math.random() * WALLA.length)];
      this.play([c.x, c.y + 1.6, c.z], 'voice', 3, 0.15, 55, 0.6, (o, t) => X.babble(e, o, t, text, f0));
    }
    // Brook bubbles and fountain drops.
    const bk = this.brook();
    if (bk > 0 && chance(bk * 6)) {
      const at = this.around(L, 2, 10, -1, 0);
      at[0] = L.pos.x + this.env.waterX * 0.6 + rnd(-3, 3); at[2] = L.pos.z + this.env.waterZ * 0.6 + rnd(-3, 3);
      this.play(at, 'amb', 3, 0.05, 30, 0.25, (o, t) => X.drip(e, o, t, rnd(500, 1300), 0.3));
    }
    const fa = this.fountainAt;
    if (fa && chance(5) && e.dist(fa[0], fa[1], fa[2]) < 30) {
      this.play([fa[0] + rnd(-1.5, 1.5), fa[1], fa[2] + rnd(-1.5, 1.5)], 'amb', 2, 0.1, 30, 0.2, (o, t) => X.drip(e, o, t, rnd(800, 1800), 0.25));
    }

    // Lava bubbling.
    if (this.lavaSpots.length && chance(env.lava * 8)) {
      const s = this.lavaSpots[Math.floor(Math.random() * this.lavaSpots.length)];
      this.play(s, 'amb', 4, 0.1, 50, 0.6, (o, t) => X.lavaPop(e, o, t));
    }

    // Boars grunt now and then.
    for (const b of this.creatures.live('boar')) {
      if (b.dying === 0 && Math.random() < dt * 0.05 && Math.abs(b.x - L.pos.x) < 30 && Math.abs(b.z - L.pos.z) < 30) {
        this.play([b.x, b.y + 0.6, b.z], 'sfx', 3, 0.05, 35, 0.6, (o, t) => X.grunt(e, o, t));
      }
    }
    // Burning carcasses crackle.
    this.burnTimer -= dt;
    if (this.burnTimer <= 0) {
      this.burnTimer = 0.3;
      for (const name of ['deer', 'rabbit', 'boar']) {
        for (const c of this.creatures.live(name)) {
          if (c.dying <= 0 || c.dying > 6) continue;
          const k = 1 - c.dying / 6;
          this.play([c.x, c.y + 0.3, c.z], 'sfx', 4, 0.1, 60, 0.8, (o, t) => X.crackle(e, o, t, 0.32, 40 * k));
        }
      }
    }
  }

  private findTowns(px: number, pz: number): void {
    this.bells.length = 0; this.anvils.length = 0; this.fountainAt = null;
    for (const s of this.terrain.structures.sitesNear(px - 350, pz - 350, px + 350, pz + 350, 0)) {
      if (s.kind !== SITE_CITY && s.kind !== SITE_VILLAGE) continue;
      const L = villageLayout(this.terrain, s);
      if (s.kind === SITE_CITY) this.fountainAt = [s.x + 0.5, L.floorY + 2, s.z + 0.5];
      for (const h of L.houses) {
        if (h.kind === 'hall') this.bells.push([h.cx + 0.5, h.y + h.wallH + 8, h.cz + 0.5]);
        if (h.kind === 'smithy') this.anvils.push([h.doorX + 0.5, h.y + 1.2, h.doorZ + 0.5]);
      }
    }
  }

  private town(dt: number, L: Listener): void {
    const e = this.engine;
    // The town bell tolls every three hours by day (silent while time is fast-forwarded).
    const hour = Math.floor(L.time * 24);
    if (hour !== this.hour) {
      const prev = this.hour;
      this.hour = hour;
      if (prev >= 0 && L.timeSpeed === 1 && hour >= 6 && hour <= 21 && hour % 3 === 0) {
        const strikes = hour % 12 || 12;
        for (const b of this.bells) {
          for (let i = 0; i < strikes; i++) {
            setTimeout(() => this.play(b, 'sfx', 40, 0.5, 600, 1, (o, t) => X.bell(e, o, t, 196, 1)), i * 2300);
          }
        }
      }
    }
    // Smiths at work in daylight.
    this.anvilT -= dt;
    if (this.anvilT <= 0) {
      this.anvilT = rnd(4, 9);
      if (L.night < 0.3) {
        for (const a of this.anvils) {
          if (e.dist(a[0], a[1], a[2]) > 80) continue;
          const n = 2 + Math.floor(Math.random() * 4);
          for (let i = 0; i < n; i++) setTimeout(() => this.play(a, 'sfx', 4, 0.2, 80, 0.7, (o, t) => X.anvil(e, o, t)), i * 430);
        }
      }
    }
  }

  private dragonsUpdate(dt: number): void {
    const e = this.engine;
    const seen = new Set<Creature>();
    for (const c of this.creatures.live('dragon')) {
      seen.add(c);
      let d = this.dragons.get(c);
      if (!d) { d = { lastSin: 0, snore: rnd(1, 3), roar: rnd(30, 90), fire: null }; this.dragons.set(c, d); }
      const mode = this.creatures.dragonMode(c);
      const dist = e.dist(c.x, c.y, c.z);
      const at: [number, number, number] = [c.x, c.y + 2.5 * c.scale, c.z];
      if (mode === 'fly' || mode === 'breathe') {
        const s = Math.sin(c.flap);
        if (d.lastSin > 0 && s <= 0 && c.flapAmp > 0.25 && dist < 170) {
          const k = Math.min(1, c.flapAmp) * c.scale;
          this.play(at, 'sfx', 14, 0.2, 170, 0.9, (o, t) => X.wingFlap(e, o, t, k));
        }
        d.lastSin = s;
        d.roar -= dt;
        if (d.roar <= 0) { d.roar = rnd(45, 110); if (mode === 'fly' && dist < 350) this.creatureEvent('roar', c); }
      }
      if (mode === 'sleep') {
        d.snore -= dt;
        if (d.snore <= 0) { d.snore = rnd(4.2, 5.5); this.play(at, 'sfx', 8, 0.15, 90, 0.9, (o, t) => X.snore(e, o, t, c.scale)); }
      }
      // Fire breath: a roaring noise loop that follows the mouth.
      if (mode === 'breathe' && !d.fire && dist < 260) d.fire = this.startFire();
      if (d.fire) {
        const m = [c.x + Math.sin(c.yaw) * 5 * c.scale, c.y + 2 * c.scale, c.z + Math.cos(c.yaw) * 5 * c.scale];
        setPannerPos(d.fire.panner, m[0], m[1], m[2], e.now);
        if (mode !== 'breathe') { this.stopLoop(d.fire.loop, d.fire.panner); d.fire = null; }
      }
    }
    for (const [c, d] of this.dragons) {
      if (seen.has(c)) continue;
      if (d.fire) this.stopLoop(d.fire.loop, d.fire.panner);
      this.dragons.delete(c);
    }
  }

  private startFire(): { loop: Loop; panner: PannerNode } {
    const e = this.engine, now = e.now;
    const sp = e.spot(0, -999, 0, 'sfx', 14, 0.25);
    const g = sp.input;
    g.gain.setValueAtTime(0, now);
    g.gain.setValueAtTime(0, now + 0.4);
    g.gain.linearRampToValueAtTime(1.1, now + 0.7);
    const s1 = e.noiseSrc('pink'), b1 = e.filter('bandpass', 650, 0.5);
    const s2 = e.noiseSrc('white'), b2 = e.filter('bandpass', 2400, 0.8), g2 = e.gain(0.25);
    const s3 = e.noiseSrc('brown'), b3 = e.filter('lowpass', 180, 0.7);
    s1.connect(b1); b1.connect(g); s2.connect(b2); b2.connect(g2); g2.connect(g); s3.connect(b3); b3.connect(g);
    return { loop: this.loop([s1, s2, s3], g), panner: sp.panner };
  }

  private stopLoop(l: Loop, panner: PannerNode): void {
    const now = this.engine.now;
    l.out.gain.cancelScheduledValues(now);
    l.out.gain.setTargetAtTime(0, now, 0.15);
    for (const s of l.srcs) s.stop(now + 0.8);
    setTimeout(() => { l.out.disconnect(); panner.disconnect(); }, 1200);
  }

  /** Dev: plays one recipe in front of the listener. */
  demo(name: string): number {
    const e = this.engine;
    const R: Record<string, (o: AudioNode, t: number) => number> = {
      land: (o, t) => X.land(e, o, t, 1), splash: (o, t) => X.splash(e, o, t, 1),
      chirp0: (o, t) => X.chirp(e, o, t, 0, 3200), chirp1: (o, t) => X.chirp(e, o, t, 1, 2600), chirp2: (o, t) => X.chirp(e, o, t, 2, 3500), chirp3: (o, t) => X.chirp(e, o, t, 3, 4100),
      gull: (o, t) => X.gull(e, o, t), hawk: (o, t) => X.hawk(e, o, t), cricket: (o, t) => X.cricket(e, o, t, 4600), owl: (o, t) => X.owl(e, o, t),
      frog: (o, t) => X.frog(e, o, t), howl: (o, t) => X.howl(e, o, t), grunt: (o, t) => X.grunt(e, o, t), squeal: (o, t) => X.squeal(e, o, t, 'deer'),
      fish: (o, t) => X.fishSplash(e, o, t, 1), lava: (o, t) => X.lavaPop(e, o, t), crackle: (o, t) => X.crackle(e, o, t, 0.5, 40),
      roar: (o, t) => X.roar(e, o, t, 1), wing: (o, t) => X.wingFlap(e, o, t, 1), snore: (o, t) => X.snore(e, o, t, 1),
      bell: (o, t) => X.bell(e, o, t, 196, 1), anvil: (o, t) => X.anvil(e, o, t), voice: (o, t) => X.babble(e, o, t, 'Taze ekmek, sıcak sıcak!', 170),
      chime: (o, t) => X.chime(e, o, t, [784, 988, 1175, 1568], 0.11),
    };
    for (const m of ['grass', 'dirt', 'stone', 'wood', 'sand', 'snow', 'gravel', 'leaves', 'water', 'metal'] as X.Material[]) R['step-' + m] = (o, t) => X.footstep(e, o, t, m, 0.8);
    const fn = R[name];
    if (!fn) return -1;
    let end = 0;
    this.play(null, 'sfx', 0, 0.1, 0, 1, (o, t) => (end = fn(o, t)));
    return end - e.now;
  }

  /** Dev: a summary for tests. */
  stats(): string {
    return `ctx=${this.engine.ctx?.state ?? 'none'} active=${this.active} water=${this.env.water.toFixed(2)} lava=${this.env.lava.toFixed(2)} leaves=${this.env.leaves.toFixed(2)} ocean=${this.env.ocean} bells=${this.bells.length} anvils=${this.anvils.length} dragons=${this.dragons.size}` +
      (this.built ? ` | wind=${this.wind.g.gain.value.toFixed(3)} leaves=${this.leaves.gain.value.toFixed(3)} brook=${this.stream.g.gain.value.toFixed(3)} surf=${this.ocean.g.gain.value.toFixed(3)} lava=${this.lava.gain.value.toFixed(3)} drone=${this.drone.g.gain.value.toFixed(3)} whisper=${this.whisper.g.gain.value.toFixed(3)} fountain=${this.fountain.g.gain.value.toFixed(3)}` : '');
  }
}
