// Procedural terrain: landforms, biomes and per-chunk block generation.
// generateRegion() is fully local (no neighbour data needed): it produces the
// chunk plus a MARGIN of surrounding columns so that trees overlapping chunk
// borders and face culling at chunk edges are always consistent.

import { Simplex, hash01, smoothstep, lerp, clamp } from '../engine/noise';
import { B, CHUNK, HEIGHT, SEA, PARTIAL, BASE_OF, KIND, KIND_AIR, KIND_WATER } from './blocks';
import { placeTree, treeChoice, TREE_CACTUS, TREE_BOULDER } from './trees';
import { BIOME, MARGIN, RW } from './biomes';
import { StructureMap, LandmarkMap, LANDMARK_CELL } from './structures';
import { placeStructures, collectSigns, type SignRecord } from './stamp';
export { BIOME, BIOME_NAMES_TR, MARGIN, RW } from './biomes';

export interface ColumnSample {
  /** Base surface height (before 3D features). */
  h: number;
  temp: number;
  moist: number;
  land: number;
  mount: number;
  river: number;
  mesa: number;
  /** Weight of 3D craggy terrain (overhangs, arches). */
  crag: number;
  /** Weight of floating islands overhead. */
  isle: number;
  /** Weight of the scorched Ashlands. */
  ash: number;
  /** Weight of the eldritch waters. */
  eld: number;
  /** Lava surface level in a volcano crater, or -1. */
  lavaY: number;
  biome: number;
}

const ISLE_Y = 100;
const SNOWLINE = SEA + 52;

export class Terrain {
  readonly seed: number;
  readonly structures: StructureMap;
  readonly landmarks: LandmarkMap;
  private nCont: Simplex; private nEro: Simplex; private nRidge: Simplex; private nHills: Simplex;
  private nDetail: Simplex; private nTemp: Simplex; private nMoist: Simplex; private nRiver: Simplex;
  private nMesa: Simplex; private nCrag: Simplex; private nCrag3: Simplex; private nIsle: Simplex;
  private nIsle3: Simplex; private nGloom: Simplex; private nPatch: Simplex; private nKnoll: Simplex;
  private nAsh: Simplex; private nEld: Simplex; private nLava: Simplex;
  /** The one dark tower of the world (deep inside the nearest Ashlands), if any. */
  readonly tower: { x: number; z: number } | null;
  /** Its volcano companion, a little lower than the tower. */
  private doom: { x: number; z: number } | null;
  /** The city near the origin; the land around it is levelled into a broad plateau. */
  readonly city: { x: number; z: number; y: number } | null = null;

  constructor(seed: number) {
    this.seed = seed;
    const s = (k: number) => new Simplex((seed * 1013 + k * 7919) >>> 0);
    this.nCont = s(1); this.nEro = s(2); this.nRidge = s(3); this.nHills = s(4); this.nDetail = s(5);
    this.nTemp = s(6); this.nMoist = s(7); this.nRiver = s(8); this.nMesa = s(9); this.nCrag = s(10);
    this.nCrag3 = s(11); this.nIsle = s(12); this.nIsle3 = s(13); this.nGloom = s(14); this.nPatch = s(15); this.nKnoll = s(16);
    this.nAsh = s(17); this.nEld = s(18); this.nLava = s(19);
    this.tower = this.findTower();
    if (this.tower) {
      const a = hash01(this.tower.x, 77, this.tower.z, seed) * Math.PI * 2;
      this.doom = { x: this.tower.x + Math.cos(a) * 150, z: this.tower.z + Math.sin(a) * 150 };
    } else this.doom = null;
    this.city = this.findCity();
    this.structures = new StructureMap(this);
    this.landmarks = new LandmarkMap(this, this.structures);
  }

  /** Continentalness and Ashlands weight only (cheap, for site searches). */
  private ashAt(x: number, z: number): number {
    const wx = x + this.nDetail.noise2(x / 300, z / 300) * 40;
    const wz = z + this.nDetail.noise2(x / 300 + 31.7, z / 300 - 12.1) * 40;
    const cont = this.nCont.fbm2(wx / 1400, wz / 1400, 5) + 0.12;
    return smoothstep(0.42, 0.56, this.nAsh.fbm2(x / 950, z / 950, 2)) * smoothstep(0.15, 0.32, cont);
  }

  /** Nearest landmark-cell centre deep inside an Ashlands region (spiral from the origin). */
  private findTower(): { x: number; z: number } | null {
    for (let r = 0; r <= 32; r++) {
      for (let gz = -r; gz <= r; gz++) {
        for (let gx = -r; gx <= r; gx++) {
          if (Math.max(Math.abs(gx), Math.abs(gz)) !== r) continue;
          const x = Math.floor((gx + 0.5) * LANDMARK_CELL), z = Math.floor((gz + 0.5) * LANDMARK_CELL);
          if (this.ashAt(x, z) < 0.98) continue;
          let deep = true;
          for (let k = 0; k < 8 && deep; k++) {
            const a = (k / 8) * Math.PI * 2;
            deep = this.ashAt(x + Math.cos(a) * 90, z + Math.sin(a) * 90) > 0.9;
          }
          if (deep) return { x, z };
        }
      }
    }
    return null;
  }

  /** First calm, green, inland spot spiralling out from the origin. */
  private findCity(): { x: number; z: number; y: number } | null {
    const green = new Set<number>([BIOME.PLAINS, BIOME.FOREST, BIOME.BIRCH_FOREST]);
    for (let r = 0; r <= 1600; r += 80) {
      const n = Math.max(1, Math.round((2 * Math.PI * r) / 80));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        const s = this.sample(x, z);
        if (!green.has(s.biome) || s.mount > 0.15 || s.h < SEA + 3 || s.h > SEA + 18 || s.river > 0.01 || s.ash > 0.02 || s.eld > 0.05) continue;
        let wet = 0;
        for (const rr of [60, 110]) for (let k = 0; k < 8; k++) {
          const o = this.sample(x + Math.cos((k / 8) * Math.PI * 2) * rr, z + Math.sin((k / 8) * Math.PI * 2) * rr);
          if (o.h < SEA + 1 || o.ash > 0.1 || o.mount > 0.5) wet++;
        }
        if (wet <= 1) return { x, z, y: Math.max(SEA + 4, Math.round(s.h)) };
      }
    }
    return null;
  }

  sample(x: number, z: number): ColumnSample {
    // Domain warp gives coastlines and ridges a less grid-like shape.
    const wx = x + this.nDetail.noise2(x / 300, z / 300) * 40;
    const wz = z + this.nDetail.noise2(x / 300 + 31.7, z / 300 - 12.1) * 40;
    // Around the dark tower nothing may rise above it: mountains and volcanoes fade out.
    const tf = this.tower ? smoothstep(160, 420, Math.hypot(x - this.tower.x, z - this.tower.z)) : 1;
    // City plateau weight (1 inside the city, fading out over its outskirts).
    const cw = this.city ? 1 - smoothstep(100, 175, Math.hypot(x - this.city.x, z - this.city.z)) : 0;

    const cont = this.nCont.fbm2(wx / 1400, wz / 1400, 5) + 0.12;
    const ero = this.nEro.fbm2(wx / 800, wz / 800, 4);
    const ridgeN = this.nRidge.fbm2(wx / 460, wz / 460, 5);
    const ridge = 1 - Math.abs(ridgeN);
    const hills = this.nHills.fbm2(wx / 240, wz / 240, 4);
    const detail = this.nDetail.fbm2(x / 50, z / 50, 3);
    const temp = this.nTemp.fbm2(x / 1600, z / 1600, 3) * 1.6 + detail * 0.05;
    const moist = this.nMoist.fbm2(x / 1300, z / 1300, 3) * 1.6 + detail * 0.05;

    const land = smoothstep(-0.16, 0.02, cont);
    const inland = smoothstep(0.0, 0.32, cont);
    const mount = inland * smoothstep(0.12, -0.22, ero) * tf * (1 - cw);

    // Ocean floor -> coast -> rolling inland -> mountains.
    let h = SEA - 22 + land * 25;
    h += hills * (3 + 11 * inland) * (1 - mount * 0.6);
    h += detail * 2.2;
    h += mount * (ridge * ridge * ridge * 66 + 6);
    h += (1 - land) * this.nHills.fbm2(x / 90, z / 90, 2) * 6;

    // Mid-scale undulation so long slopes don't step in evenly spaced rows.
    const open = land * (1 - mount);
    h += this.nPatch.fbm2(x / 26, z / 26, 2) * 1.7 * open;
    // Knolls: isolated rounded hills; some regions are full of them.
    const knollRegion = smoothstep(-0.2, 0.25, this.nKnoll.fbm2(x / 650, z / 650, 2));
    if (knollRegion > 0) h += this.knolls(x, z) * knollRegion * inland * (1 - mount);

    // Badland mesas: hot + dry patches lifted and terraced into steps.
    const hot = smoothstep(0.18, 0.4, temp);
    const dry = smoothstep(0.0, -0.25, moist);
    const mesaPatch = smoothstep(0.0, 0.25, this.nMesa.fbm2(x / 520, z / 520, 2));
    let mesa = hot * dry * mesaPatch * inland * (1 - mount);
    // Wind-shaped dunes in the sandy (non-mesa) deserts.
    const sandy = hot * dry * (1 - mesaPatch) * inland * (1 - mount);
    if (sandy > 0) h += this.dunes(x, z) * sandy;

    // Ashlands: rare scorched regions of jagged ridges and lava-filled volcanoes.
    const ash = smoothstep(0.42, 0.56, this.nAsh.fbm2(x / 950, z / 950, 2)) * smoothstep(-0.05, 0.15, cont);
    let lavaY = -1;
    if (ash > 0) {
      const jag = 1 - Math.abs(this.nHills.noise2(x / 38, z / 38));
      const base = h;
      h += ash * (jag * jag * jag * jag * 12 + 3);
      const v = this.volcano(x, z, tf);
      h += v.h * ash;
      if (v.lava > 0 && ash > 0.6) lavaY = Math.floor(base + ash * (3 + v.lava));
      mesa *= 1 - ash;
      // Lava creeks: narrow channels cut along noise zero-lines, filled one block
      // below the (smooth) plain level so they read as glowing streams.
      if (ash > 0.55 && v.h < 4) {
        const n = Math.min(Math.abs(this.nLava.fbm2(x / 260, z / 260, 2)), Math.abs(this.nLava.fbm2(x / 140 + 40, z / 140 - 40, 2)) * 1.3);
        const cr = (1 - smoothstep(0.0, 0.03, n)) * smoothstep(0.55, 0.75, ash);
        if (cr > 0) {
          const level = base + ash * 3;
          const bed = level - 2 - cr * 2;
          if (h - level < 16) {
            h = lerp(h, Math.min(h, bed), smoothstep(0.0, 0.4, cr));
            if (cr > 0.35 && level > SEA + 1) lavaY = Math.max(lavaY, Math.floor(level) - 1);
          }
        }
      }
    }
    // Eldritch waters: dark, deep stretches of sea.
    const eld = smoothstep(0.3, 0.48, this.nEld.fbm2(x / 1100, z / 1100, 2));
    h -= eld * (1 - land) * 10;

    // Rivers: thin bands along zero-crossings of a low-frequency noise.
    const rv = Math.abs(this.nRiver.fbm2(wx / 900, wz / 900, 3));
    const riverW = 0.032 + 0.02 * (1 - inland);
    let river = land * (1 - smoothstep(0.0, riverW, rv)) * (1 - mount * 0.5);
    if (mesa > 0) {
      h += mesa * (16 + 10 * smoothstep(-0.2, 0.4, hills));
      const step = 7;
      const k = (h - SEA) / step;
      const terraced = SEA + (Math.floor(k) + smoothstep(0.42, 0.58, k - Math.floor(k))) * step;
      h = lerp(h, terraced, mesa);
    }
    if (river > 0) {
      const bed = SEA - 2.5 - river * 2.5;
      h = lerp(h, Math.min(h, bed), smoothstep(0.0, 0.7, river));
      mesa *= 1 - river;
    }

    if (cw > 0 && this.city) {
      const cy = this.city.y;
      h = lerp(h, cy + clamp((h - cy) * 0.15, -2, 3), cw);
      river *= 1 - cw;
      mesa *= 1 - cw;
    }
    const crag = smoothstep(0.32, 0.55, this.nCrag.fbm2(x / 340, z / 340, 2)) * land * (1 - river) * tf * (1 - cw);
    const isle = smoothstep(0.42, 0.62, this.nIsle.fbm2(x / 700, z / 700, 2)) * (1 - cw);

    h = clamp(h, 3, HEIGHT - 12);

    const sample: ColumnSample = { h, temp, moist, land, mount, river, mesa, crag, isle, ash, eld, lavaY, biome: 0 };
    sample.biome = this.classify(x, z, sample);
    return sample;
  }

  /**
   * Solid runs of a column before support filtering, as [start, end] pairs
   * (inclusive). The first run always starts at y = 0 (the grounded rock).
   */
  rockRuns(wx: number, wz: number, s: ColumnSample): Int16Array {
    const hi = Math.floor(s.h);
    if (s.crag <= 0) return Int16Array.of(0, hi);
    const out: number[] = [];
    const top = Math.min(hi + 20, HEIGHT - 1);
    let start = -1;
    for (let y = 0; y <= top + 1; y++) {
      let solid = false;
      if (y <= top) {
        if (y <= hi - 18) solid = true;
        else {
          // Overhangs and arches: perturb the surface with 3D noise.
          const n = this.nCrag3.fbm3(wx / 26, y / 15, wz / 26, 3);
          solid = (s.h + 0.5 - y) / 13 + n * 1.25 * s.crag - 0.08 * s.crag > 0;
        }
      }
      if (solid && start < 0) start = y;
      if (!solid && start >= 0) { out.push(start, y - 1); start = -1; }
    }
    if (out.length === 0 || out[0] !== 0) out.unshift(0, -1); // keep "ground run first" invariant
    return Int16Array.from(out);
  }

  isleSolid(wx: number, y: number, wz: number, isle: number): boolean {
    const dy = y - ISLE_Y;
    const fall = dy > 0 ? dy / 5 : -dy / 11;
    const n = this.nIsle3.fbm3(wx / 34, y / 18, wz / 34, 3);
    return n * 0.9 + isle * 0.75 - fall * 0.32 - 0.42 > 0;
  }

  /**
   * Volcano cones on a jittered grid. h = height added, lava = lava level
   * above the local base inside the crater (0 outside a crater).
   */
  private volcano(x: number, z: number, tf: number): { h: number; lava: number } {
    const C = 190, seed = this.seed;
    const cx = Math.floor(x / C), cz = Math.floor(z / C);
    let best = 0, lava = 0;
    // The tower's companion volcano: broad, smoking, lower than the tower.
    if (this.doom) {
      const d = Math.hypot(x - this.doom.x, z - this.doom.z) / 58;
      if (d < 1) {
        const height = 38, crater = 0.22, depth = 8, rim = height * Math.pow(1 - crater, 1.5);
        if (d > crater) best = height * Math.pow(1 - d, 1.5);
        else {
          best = rim - depth + depth * smoothstep(crater * 0.55, crater, d);
          lava = rim - depth * 0.55;
        }
      }
    }
    if (tf <= 0) return { h: best, lava };
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx, gz = cz + dz;
        if (hash01(gx, 41, gz, seed) < 0.35) continue;
        const px = (gx + 0.25 + hash01(gx, 42, gz, seed) * 0.5) * C;
        const pz = (gz + 0.25 + hash01(gx, 43, gz, seed) * 0.5) * C;
        const rad = 34 + hash01(gx, 44, gz, seed) * 26;
        const height = 26 + hash01(gx, 45, gz, seed) * 24;
        const crater = 0.2 + hash01(gx, 46, gz, seed) * 0.1;
        const depth = 7 + hash01(gx, 47, gz, seed) * 6;
        const d = Math.hypot(x - px, z - pz) / rad;
        if (d >= 1 || tf < 1) {
          // Faded out near the tower (crater lakes would float on a flattened cone).
          if (d < 1 && d > crater && tf > 0) best = Math.max(best, height * Math.pow(1 - d, 1.5) * tf * tf);
          continue;
        }
        const rim = height * Math.pow(1 - crater, 1.5);
        let v: number;
        if (d > crater) v = height * Math.pow(1 - d, 1.5);
        else {
          v = rim - depth + depth * smoothstep(crater * 0.55, crater, d);
          lava = Math.max(lava, rim - depth * 0.55);
        }
        best = Math.max(best, v);
      }
    }
    return { h: best, lava };
  }

  /** Max of rounded, slightly elliptical hills scattered on a jittered grid. */
  private knolls(x: number, z: number): number {
    const C = 72, seed = this.seed;
    const cx = Math.floor(x / C), cz = Math.floor(z / C);
    let best = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx, gz = cz + dz;
        if (hash01(gx, 11, gz, seed) < 0.4) continue;
        const px = (gx + 0.15 + hash01(gx, 12, gz, seed) * 0.7) * C;
        const pz = (gz + 0.15 + hash01(gx, 13, gz, seed) * 0.7) * C;
        const rad = 15 + hash01(gx, 14, gz, seed) * 26;
        const height = 4 + hash01(gx, 15, gz, seed) * 16;
        const ang = hash01(gx, 16, gz, seed) * Math.PI;
        const stretch = 0.6 + hash01(gx, 17, gz, seed) * 0.4;
        const ox = x - px, oz = z - pz;
        const u = ox * Math.cos(ang) + oz * Math.sin(ang);
        const v = (-ox * Math.sin(ang) + oz * Math.cos(ang)) / stretch;
        const d = Math.sqrt(u * u + v * v) / rad;
        if (d >= 1) continue;
        best = Math.max(best, height * (0.5 + 0.5 * Math.cos(Math.PI * d)));
      }
    }
    return best;
  }

  /** Asymmetric dune ridges: long windward slope, short steep lee side. */
  private dunes(x: number, z: number): number {
    const a = 0.6 + this.nPatch.noise2(x / 420, z / 420) * 0.5;
    const u = x * Math.cos(a) + z * Math.sin(a) + this.nDetail.noise2(x / 60, z / 60) * 14;
    const f = (((u / 26) % 1) + 1) % 1;
    const tri = f < 0.72 ? f / 0.72 : (1 - f) / 0.28;
    const crest = tri * tri * (3 - 2 * tri);
    const amp = 2.5 + 3.5 * (this.nPatch.noise2(x / 150 + 9.3, z / 150) * 0.5 + 0.5);
    return crest * amp;
  }

  private classify(x: number, z: number, s: ColumnSample): number {
    const { h, temp, moist } = s;
    if (s.ash > 0.5) return BIOME.ASHLANDS;
    if (h < SEA - 0.5) {
      if (s.eld > 0.5 && s.river < 0.4) return BIOME.ELDRITCH_SEA;
      if (s.river > 0.4 && s.land > 0.5) return temp < -0.45 ? BIOME.FROZEN_OCEAN : BIOME.RIVER;
      return temp < -0.45 ? BIOME.FROZEN_OCEAN : BIOME.OCEAN;
    }
    if (h > SNOWLINE - 6 || (s.mount > 0.45 && h > SEA + 34)) {
      return h > SNOWLINE - 10 || temp < 0.0 ? BIOME.SNOW_PEAKS : BIOME.MOUNTAINS;
    }
    if (h < SEA + 2.5 && s.land < 0.97 && s.river < 0.3) {
      if (s.eld > 0.35) return BIOME.BLACK_BEACH;
      return temp < -0.3 || s.mount > 0.3 ? BIOME.STONY_SHORE : BIOME.BEACH;
    }
    if (temp < -0.5) return BIOME.TUNDRA;
    if (temp < -0.25) return BIOME.TAIGA;
    if (temp > 0.22 && moist < 0.0) return s.mesa > 0.25 ? BIOME.BADLANDS : BIOME.DESERT;
    const gloom = this.nGloom.fbm2(x / 380, z / 380, 2);
    if (gloom > 0.32 && moist > 0.05) return BIOME.GLOOM;
    if (moist > 0.12) return temp < 0.0 ? BIOME.BIRCH_FOREST : BIOME.FOREST;
    return BIOME.PLAINS;
  }

  /**
   * Generates a (RW x HEIGHT x RW) block region for chunk (cx, cz).
   * Index: (y * RW + z) * RW + x, local x/z in [0, RW).
   */
  generateRegion(cx: number, cz: number): { blocks: Uint8Array; biomes: Uint8Array; signs: SignRecord[] } {
    const x0 = cx * CHUNK - MARGIN;
    const z0 = cz * CHUNK - MARGIN;
    const blocks = new Uint8Array(RW * RW * HEIGHT);
    const biomes = new Uint8Array(RW * RW);
    const heights = new Float32Array(RW * RW);
    const slopes = new Float32Array(RW * RW);
    const samples: ColumnSample[] = new Array(RW * RW);
    const seed = this.seed;

    for (let lz = 0; lz < RW; lz++) {
      for (let lx = 0; lx < RW; lx++) {
        const s = this.sample(x0 + lx, z0 + lz);
        samples[lz * RW + lx] = s;
        heights[lz * RW + lx] = s.h;
        biomes[lz * RW + lx] = s.biome;
      }
    }

    const idx = (x: number, y: number, z: number) => (y * RW + z) * RW + x;

    // Column samples and raw rock runs, also for a few columns outside the
    // region: everything below is a pure function of world position, so
    // neighbouring chunks always agree.
    const sampleAt = (wx: number, wz: number): ColumnSample => {
      const lx = wx - x0, lz = wz - z0;
      return lx >= 0 && lz >= 0 && lx < RW && lz < RW ? samples[lz * RW + lx] : this.sample(wx, wz);
    };
    const runCache = new Map<number, Int16Array>();
    const colRuns = (wx: number, wz: number): Int16Array => {
      const key = (wx - x0 + 64) * 1024 + (wz - z0 + 64);
      let r = runCache.get(key);
      if (!r) {
        r = this.rockRuns(wx, wz, sampleAt(wx, wz));
        runCache.set(key, r);
      }
      return r;
    };
    /** Does rock run [a, b] of column (wx, wz) lean on grounded rock within `depth` columns? */
    const attached = (wx: number, wz: number, a: number, b: number, depth: number): boolean => {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const r = colRuns(wx + dx, wz + dz);
          if (r[1] >= a) return true;
          if (depth > 1) {
            for (let k = 2; k < r.length; k += 2) {
              if (r[k] <= b && r[k + 1] >= a && attached(wx + dx, wz + dz, r[k], r[k + 1], depth - 1)) return true;
            }
          }
        }
      }
      return false;
    };

    // Legs (stone pillars) holding up floating islands, on a jittered grid.
    // Found for a wide area because island columns need a leg within reach.
    const PC = 11, LEG_REACH = 8;
    const legs: Array<{ px: number; pz: number; gx: number; gz: number; bottom: number; ground: number }> = [];
    const pad = MARGIN + LEG_REACH;
    for (let gz = Math.floor((z0 - pad) / PC); gz <= Math.floor((z0 + RW + pad) / PC); gz++) {
      for (let gx = Math.floor((x0 - pad) / PC); gx <= Math.floor((x0 + RW + pad) / PC); gx++) {
        const px = gx * PC + 2 + Math.floor(hash01(gx, 31, gz, seed) * (PC - 4));
        const pz = gz * PC + 2 + Math.floor(hash01(gx, 32, gz, seed) * (PC - 4));
        const sc = sampleAt(px, pz);
        if (sc.isle <= 0) continue;
        let bottom = -1;
        for (let y = ISLE_Y - 16; y <= ISLE_Y + 10 && bottom < 0; y++) if (this.isleSolid(px, y, pz, sc.isle)) bottom = y;
        if (bottom < 0 || !this.isleSolid(px, bottom + 3, pz, sc.isle)) continue; // too thin to rest on
        const ground = colRuns(px, pz)[1];
        if (ground >= bottom - 2) continue;
        legs.push({ px, pz, gx, gz, bottom, ground });
      }
    }

    for (let lz = 0; lz < RW; lz++) {
      for (let lx = 0; lx < RW; lx++) {
        const ci = lz * RW + lx;
        const s = samples[ci];
        const wx = x0 + lx, wz = z0 + lz;
        // Slope from neighbouring base heights (clamped at region border).
        const hl = heights[lz * RW + Math.max(0, lx - 1)];
        const hr = heights[lz * RW + Math.min(RW - 1, lx + 1)];
        const hd = heights[Math.max(0, lz - 1) * RW + lx];
        const hu = heights[Math.min(RW - 1, lz + 1) * RW + lx];
        const slope = Math.max(Math.abs(hr - hl), Math.abs(hu - hd)) * 0.5;
        slopes[ci] = slope;

        // 1) Solid / air. Craggy columns come from 3D noise, but a rock run
        // hanging over an air gap is only kept when it leans on grounded rock
        // in a neighbouring column (a real overhang), so nothing floats free.
        const runs = colRuns(wx, wz);
        for (let k = 0; k < runs.length; k += 2) {
          if (k > 0 && !attached(wx, wz, runs[k], runs[k + 1], 2)) continue;
          for (let y = runs[k]; y <= Math.min(runs[k + 1], HEIGHT - 1); y++) blocks[idx(lx, y, lz)] = B.STONE;
        }
        if (s.isle > 0 && legs.some((g) => (g.px - wx) ** 2 + (g.pz - wz) ** 2 <= LEG_REACH * LEG_REACH)) {
          // Islands only exist where they are thick and within reach of a leg.
          let thick = 0;
          for (let y = ISLE_Y - 16; y <= ISLE_Y + 10; y++) if (this.isleSolid(wx, y, wz, s.isle)) thick++;
          if (thick >= 4) {
            for (let y = ISLE_Y - 16; y <= ISLE_Y + 10; y++) {
              if (this.isleSolid(wx, y, wz, s.isle)) blocks[idx(lx, y, lz)] = B.STONE;
            }
          }
        }
        blocks[idx(lx, 0, lz)] = B.BEDROCK;
        if (hash01(wx, 1, wz, seed) < 0.5) blocks[idx(lx, 1, lz)] = B.BEDROCK;

        // 2) Surface layers: walk down, painting the top few blocks of each solid run.
        let depth = -1; // -1 = currently in air
        const surfaceNoise = hash01(wx, 7, wz, seed);
        for (let y = HEIGHT - 1; y > 1; y--) {
          const i = idx(lx, y, lz);
          if (blocks[i] === B.AIR) { depth = -1; continue; }
          if (blocks[i] !== B.STONE) continue;
          depth++;
          if (depth > 4) continue;
          blocks[i] = this.surfaceBlock(s, y, depth, slope, surfaceNoise);
        }

        // 3) Liquids: lava in the Ashlands, dark water in the eldritch sea, else water/ice.
        const liquid = s.ash > 0.5 ? B.LAVA : s.biome === BIOME.ELDRITCH_SEA ? B.DEEP_WATER : B.WATER;
        let floor = -1;
        for (let y = SEA; y > 0; y--) {
          const i = idx(lx, y, lz);
          if (blocks[i] !== B.AIR) { floor = y; break; }
          blocks[i] = liquid === B.WATER && y === SEA && s.temp < -0.48 && s.biome !== BIOME.RIVER ? B.ICE : liquid;
        }
        // Volcano craters hold a lava lake.
        if (s.lavaY > SEA) {
          for (let y = Math.min(s.lavaY, HEIGHT - 2); y > 0; y--) {
            const i = idx(lx, y, lz);
            if (blocks[i] !== B.AIR) break;
            blocks[i] = B.LAVA;
          }
        }
        // Glowing kelp forests sway in the eldritch deep.
        if (s.biome === BIOME.ELDRITCH_SEA && floor > 0 && hash01(wx, 9, wz, seed) < 0.14) {
          const len = 2 + Math.floor(hash01(wx, 10, wz, seed) * Math.max(1, SEA - floor - 3));
          for (let y = floor + 1; y <= Math.min(floor + len, SEA - 2); y++) blocks[idx(lx, y, lz)] = B.KELP;
        }
      }
    }

    // 3a) Legs under floating islands: stone pillars on a jittered grid, flared
    // at the ground and where they meet the island. Centres up to MARGIN
    // outside the region are included so wide pillars cross chunk borders.
    for (const { px, pz, gx, gz, bottom, ground } of legs) {
      {
        if (px < x0 - MARGIN || px >= x0 + RW + MARGIN || pz < z0 - MARGIN || pz >= z0 + RW + MARGIN) continue;
        const r0 = 1.1 + hash01(gx, 33, gz, seed) * 1.2;
        const phase = hash01(gx, 34, gz, seed) * 6.28;
        for (let y = Math.max(1, ground - 1); y <= bottom + 1; y++) {
          const t = (y - ground) / (bottom - ground);
          const r = r0 + Math.max(0, 1 - t * 5) * 2.0 + Math.max(0, t - 0.82) * 9 + Math.sin(y * 0.45 + phase) * 0.25;
          const R = Math.ceil(r);
          for (let dz = -R; dz <= R; dz++) {
            for (let dx = -R; dx <= R; dx++) {
              if (dx * dx + dz * dz > r * r) continue;
              const lx = px + dx - x0, lz = pz + dz - z0;
              if (lx < 0 || lz < 0 || lx >= RW || lz >= RW) continue;
              const i = idx(lx, y, lz);
              const k = KIND[blocks[i]];
              if (k !== KIND_AIR && k !== KIND_WATER) continue;
              const m = hash01(px + dx, y, pz + dz, seed);
              blocks[i] = m < 0.3 ? B.MOSS_STONE : m < 0.42 ? B.COBBLE : B.STONE;
            }
          }
        }
      }
    }

    // 3b) Roads, bridges, castles, crossroad lanterns. mask: 1 = road, 2 = built.
    const mask = new Uint8Array(RW * RW);
    placeStructures(this, blocks, x0, z0, mask);

    // 4) Trees. Ground is measured before any tree is placed and trees are
    // iterated in world order, so overlaps resolve identically in every chunk.
    const ground = new Int16Array(RW * RW);
    for (let i = 0; i < RW * RW; i++) ground[i] = topSolid(blocks, i % RW, (i / RW) | 0, idx);
    for (let lz = 0; lz < RW; lz++) {
      for (let lx = 0; lx < RW; lx++) {
        const s = samples[lz * RW + lx];
        const wx = x0 + lx, wz = z0 + lz;
        const choice = treeChoice(s.biome, wx, wz, seed);
        if (choice < 0 || mask[lz * RW + lx]) continue;
        const top = ground[lz * RW + lx];
        if (top < SEA || top > HEIGHT - 16) continue;
        const g = blocks[idx(lx, top, lz)];
        const ok = choice === TREE_BOULDER ? g !== B.SAND && g !== B.ICE
          : choice === TREE_CACTUS ? g === B.SAND
          : g === B.GRASS || g === B.SNOW_GRASS || g === B.GLOOM_GRASS || g === B.DIRT || g === B.ASH || g === B.BASALT;
        if (!ok) continue;
        placeTree(choice, blocks, lx, top + 1, lz, wx, wz, seed, idx);
      }
    }

    // 5) Gentle slopes: top the surface with a partial block so the ground rises
    // in quarter steps (a ramp) instead of full-block stairs. Cliffs, mesa
    // terraces and overhangs keep their sharp edges for contrast.
    for (let lz = 0; lz < RW; lz++) {
      for (let lx = 0; lx < RW; lx++) {
        const ci = lz * RW + lx;
        const s = samples[ci];
        if (slopes[ci] > 1.8 || s.mesa > 0.25 || s.crag > 0.05 || mask[ci] === 2) continue;
        const hi = Math.floor(s.h);
        if (hi + 1 <= SEA || hi + 1 >= HEIGHT) continue;
        // A small smooth wobble makes the quarter-step contours wavy instead of ruler-straight.
        const wobble = this.nPatch.noise2((x0 + lx) / 5.5, (z0 + lz) / 5.5) * 0.32;
        const k = Math.max(0, Math.min(4, Math.round((s.h + wobble - hi) * 4)));
        if (k === 0) continue;
        const topI = idx(lx, hi, lz), aboveI = idx(lx, hi + 1, lz);
        if (blocks[aboveI] !== B.AIR) continue;
        const top = blocks[topI];
        const cuts = PARTIAL.get(top);
        if (!cuts) continue;
        blocks[aboveI] = k === 4 ? top : cuts[k - 1];
        blocks[topI] = top === B.GRASS || top === B.SNOW_GRASS || top === B.GLOOM_GRASS ? B.DIRT : top;
      }
    }

    // 6) Small plants on free ground.
    for (let lz = 0; lz < RW; lz++) {
      for (let lx = 0; lx < RW; lx++) {
        const s = samples[lz * RW + lx];
        const wx = x0 + lx, wz = z0 + lz;
        const top = topSolid(blocks, lx, lz, idx);
        if (top < SEA || top >= HEIGHT - 2) continue;
        const above = idx(lx, top + 1, lz);
        if (blocks[above] !== B.AIR || mask[lz * RW + lx]) continue;
        const plant = this.plantFor(s, BASE_OF[blocks[idx(lx, top, lz)]], wx, wz);
        if (plant !== B.AIR) blocks[above] = plant;
      }
    }

    const signs = collectSigns(this, blocks, cx, cz, x0, z0);
    return { blocks, biomes, signs };
  }

  private surfaceBlock(s: ColumnSample, y: number, depth: number, slope: number, rnd: number): number {
    const b = s.biome;
    const underwater = y < SEA;
    const snowy = y > SNOWLINE + (rnd - 0.5) * 6;
    const steep = slope > 1.6 + rnd * 0.8;

    if (y > ISLE_Y - 20 && s.isle > 0 && y > s.h + 8) {
      // Floating islands get a lush grass cap regardless of the ground biome.
      return depth === 0 ? B.GRASS : depth < 3 ? B.DIRT : B.STONE;
    }
    if (b === BIOME.ASHLANDS) {
      if (depth > 3) return B.BASALT;
      if (steep) return rnd < 0.3 ? B.OBSIDIAN : B.BASALT;
      if (depth === 0) return rnd < 0.07 ? B.MAGMA : rnd < 0.3 ? B.BASALT : B.ASH;
      return rnd < 0.5 ? B.ASH : B.BASALT;
    }
    if (b === BIOME.ELDRITCH_SEA) {
      if (depth > 2) return B.STONE;
      return rnd < 0.55 ? B.ELDRITCH_STONE : rnd < 0.62 ? B.GLYPH : B.BLACK_SAND;
    }
    if (b === BIOME.BLACK_BEACH) return depth < 3 ? B.BLACK_SAND : B.STONE;
    if (b === BIOME.BADLANDS || (s.mesa > 0.3 && !underwater && b !== BIOME.RIVER)) {
      if (depth === 0 && !steep && rnd < 0.15) return B.SAND;
      const band = ((y * 7 + Math.floor(s.temp * 3)) % 11 + 11) % 11;
      return band < 3 ? B.CLAY_RED : band < 5 ? B.CLAY_ORANGE : band < 7 ? B.CLAY_TAN : band < 8 ? B.CLAY_BROWN : B.CLAY_ORANGE;
    }
    if (underwater) {
      if (depth > 2) return B.STONE;
      if (b === BIOME.RIVER) return rnd < 0.3 ? B.GRAVEL : B.SAND;
      if (b === BIOME.FROZEN_OCEAN || y < SEA - 12) return rnd < 0.5 ? B.GRAVEL : B.SAND;
      return rnd < 0.15 ? B.GRAVEL : rnd < 0.25 ? B.DIRT : B.SAND;
    }
    if (snowy || b === BIOME.SNOW_PEAKS) {
      if (steep && rnd < 0.85) return B.STONE;
      return depth === 0 ? B.SNOW : depth < 2 ? B.SNOW : B.STONE;
    }
    if (b === BIOME.MOUNTAINS || steep) {
      if (depth === 0 && !steep && rnd < 0.4) return B.GRASS;
      return rnd < 0.15 && depth === 0 ? B.GRAVEL : B.STONE;
    }
    switch (b) {
      case BIOME.BEACH:
      case BIOME.DESERT:
        return depth < 3 ? B.SAND : B.SANDSTONE;
      case BIOME.STONY_SHORE:
        return depth === 0 && rnd < 0.5 ? B.GRAVEL : B.STONE;
      case BIOME.TUNDRA:
        return depth === 0 ? B.SNOW_GRASS : depth < 3 ? B.DIRT : B.STONE;
      case BIOME.TAIGA:
        return depth === 0 ? (rnd < 0.25 ? B.SNOW_GRASS : B.GRASS) : depth < 3 ? B.DIRT : B.STONE;
      case BIOME.GLOOM:
        return depth === 0 ? (rnd < 0.08 ? B.MOSS_STONE : B.GLOOM_GRASS) : depth < 3 ? B.DIRT : B.STONE;
      case BIOME.RIVER:
        return depth < 2 ? B.SAND : B.STONE;
      default:
        return depth === 0 ? B.GRASS : depth < 3 ? B.DIRT : B.STONE;
    }
  }

  private plantFor(s: ColumnSample, ground: number, wx: number, wz: number): number {
    const r = hash01(wx, 3, wz, this.seed);
    if (s.biome === BIOME.ASHLANDS) {
      if (ground !== B.ASH && ground !== B.BASALT) return B.AIR;
      return r < 0.012 ? B.EMBER_FLOWER : r < 0.03 ? B.DEAD_BUSH : B.AIR;
    }
    const patch = this.nPatch.noise2(wx / 18, wz / 18);
    if (ground === B.GRASS) {
      switch (s.biome) {
        case BIOME.PLAINS:
          if (r < 0.30 + patch * 0.15) return B.TALL_GRASS;
          if (r < 0.36 && patch > 0.1) return patch > 0.45 ? B.FLOWER_RED : B.FLOWER_YELLOW;
          if (r < 0.38 && patch < -0.4) return B.FLOWER_BLUE;
          if (r < 0.39) return B.FLOWER_WHITE;
          return B.AIR;
        case BIOME.FOREST:
        case BIOME.BIRCH_FOREST:
          if (r < 0.22) return B.TALL_GRASS;
          if (r < 0.26) return B.FERN;
          if (r < 0.275) return patch > 0 ? B.FLOWER_WHITE : B.FLOWER_BLUE;
          if (r < 0.285) return B.MUSHROOM_BROWN;
          return B.AIR;
        case BIOME.TAIGA:
          if (r < 0.2) return B.FERN;
          if (r < 0.26) return B.TALL_GRASS;
          if (r < 0.27) return B.MUSHROOM_RED;
          return B.AIR;
        default:
          return r < 0.15 ? B.TALL_GRASS : r < 0.17 ? B.FLOWER_YELLOW : B.AIR;
      }
    }
    if (ground === B.GLOOM_GRASS) {
      if (r < 0.18) return B.GLOOM_WEED;
      if (r < 0.22) return B.MUSHROOM_RED;
      if (r < 0.25) return B.MUSHROOM_BROWN;
      return B.AIR;
    }
    if (ground === B.SNOW_GRASS) return r < 0.06 ? B.FERN : B.AIR;
    if (ground === B.SAND && (s.biome === BIOME.DESERT || s.biome === BIOME.BADLANDS)) return r < 0.02 ? B.DEAD_BUSH : B.AIR;
    if (ground >= B.CLAY_RED && ground <= B.CLAY_BROWN) return r < 0.015 ? B.DEAD_BUSH : B.AIR;
    return B.AIR;
  }
}

function topSolid(blocks: Uint8Array, lx: number, lz: number, idx: (x: number, y: number, z: number) => number): number {
  for (let y = HEIGHT - 1; y > 0; y--) {
    const b = blocks[idx(lx, y, lz)];
    if (b !== B.AIR && KIND[b] !== KIND_WATER && b !== B.KELP) return b === B.ICE ? -1 : y;
  }
  return -1;
}
