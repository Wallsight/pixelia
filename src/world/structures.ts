// World-scale structure layout: points of interest ("sites") on a jittered
// grid, their names, and meandering roads between neighbouring sites.
// Pure + deterministic, shared by chunk workers (to build blocks) and the
// main thread (map, signs).

import { Simplex, hash01 } from '../engine/noise';
import { SEA } from './blocks';
import { BIOME } from './biomes';
import type { Terrain } from './terrain';

export const SITE_CELL = 320;

export const SITE_CASTLE = 1;
export const SITE_CROSSROAD = 2;
export const SITE_VILLAGE = 3;
/** The one city of the world, near the origin; the player starts there. */
export const SITE_CITY = 4;

const VILLAGE_BIOMES: number[] = [BIOME.PLAINS, BIOME.FOREST, BIOME.BIRCH_FOREST, BIOME.TAIGA, BIOME.TUNDRA, BIOME.DESERT, BIOME.BADLANDS];


export interface Site {
  id: string;
  gx: number;
  gz: number;
  x: number;
  z: number;
  kind: number;
  name: string;
  /** Ground height at the site centre. */
  h: number;
}

export interface Road {
  id: string;
  a: Site;
  b: Site;
  /** Polyline in world XZ, from a to b. */
  pts: Float32Array;
  length: number;
}

const PREFIX = ['Kuzgun', 'Sis', 'Kara', 'Gölge', 'Ayaz', 'Kızıl', 'Mor', 'Yaban', 'Çam', 'Taş', 'Kurt', 'Ay', 'Bulut', 'Rüzgâr', 'Gece', 'Fener', 'Baykuş', 'Kül', 'Duman', 'Yosun'];
const SUFFIX = ['kaya', 'tepe', 'göl', 'dere', 'yurt', 'pınar', 'ova', 'koru', 'bel', 'yaka', 'vadi', 'han', 'eli', 'köprü'];
const CASTLE_SUFFIX = ['kale', 'hisar', 'burç', 'kule'];

export class StructureMap {
  private sites = new Map<string, Site | null>();
  private roads = new Map<string, Road | null>();
  private nMeander: Simplex;
  private cityCell: [number, number] | null | undefined;

  constructor(private terrain: Terrain) {
    this.nMeander = new Simplex((terrain.seed ^ 0x51ed) >>> 0);
  }

  /** Ground around (x, z) out to radius r is mostly dry and rolls by less than tol. */
  private flatAround(x: number, z: number, r: number, tol: number): boolean {
    const h0 = this.terrain.sample(x, z).h;
    let bad = 0;
    for (const rr of [r * 0.5, r]) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const s = this.terrain.sample(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
        if (s.h < SEA + 1.5 || s.river > 0.05 || s.crag > 0.15 || s.mount > 0.3 || Math.abs(s.h - h0) > tol) bad++;
      }
    }
    return bad <= 4;
  }

  /** Candidate centre of a cell (before choosing its kind). */
  private candidate(gx: number, gz: number, attempt: number): [number, number] {
    const seed = this.terrain.seed;
    return [
      Math.round((gx + 0.2 + hash01(gx, 300 + attempt, gz, seed) * 0.6) * SITE_CELL),
      Math.round((gz + 0.2 + hash01(gx, 400 + attempt, gz, seed) * 0.6) * SITE_CELL),
    ];
  }

  /** The cell holding the city (the terrain picks and levels the spot). */
  city(): [number, number] | null {
    if (this.cityCell !== undefined) return this.cityCell;
    const c = this.terrain.city;
    this.cityCell = c ? [Math.floor(c.x / SITE_CELL), Math.floor(c.z / SITE_CELL)] : null;
    return this.cityCell;
  }

  /** The site of grid cell (gx, gz), or null if the cell has none (ocean, etc.). */
  site(gx: number, gz: number): Site | null {
    const id = `${gx},${gz}`;
    const cached = this.sites.get(id);
    if (cached !== undefined) return cached;
    const seed = this.terrain.seed;
    let result: Site | null = null;
    // Try a few jittered spots so most land cells get a site.
    const cc = this.city();
    if (cc && cc[0] === gx && cc[1] === gz && this.terrain.city) {
      const { x, z } = this.terrain.city;
      result = { id, gx, gz, x, z, kind: SITE_CITY, name: this.makeName(gx, gz, SITE_CITY), h: this.terrain.sample(x, z).h };
      this.sites.set(id, result);
      return result;
    }
    for (let attempt = 0; attempt < 4 && !result; attempt++) {
      const [x, z] = this.candidate(gx, gz, attempt);
      const s = this.terrain.sample(x, z);
      if (s.h < SEA + 2 || s.mount > 0.35 || s.crag > 0.2 || s.mesa > 0.4 || s.river > 0.05) continue;
      if (s.biome === BIOME.OCEAN || s.biome === BIOME.FROZEN_OCEAN || s.biome === BIOME.RIVER) continue;
      const r = hash01(gx, 500, gz, seed);
      const gloomy = s.biome === BIOME.GLOOM;
      const castle = gloomy ? r < 0.85 : r < 0.18;
      let kind = castle ? SITE_CASTLE : SITE_CROSSROAD;
      if (!castle && r < 0.62 && VILLAGE_BIOMES.includes(s.biome) && this.flatAround(x, z, 34, 9)) kind = SITE_VILLAGE;
      result = { id, gx, gz, x, z, kind, name: this.makeName(gx, gz, kind), h: s.h };
    }
    this.sites.set(id, result);
    return result;
  }

  private makeName(gx: number, gz: number, kind: number): string {
    const seed = this.terrain.seed;
    // (3gx + 8gz) mod 20 never repeats within a 5x5 block of cells, so nearby
    // places never share a prefix; the seed rotates the assignment per world.
    const rot = Math.floor(hash01(0, 600, 0, seed) * PREFIX.length);
    const p = PREFIX[(((3 * gx + 8 * gz + rot) % PREFIX.length) + PREFIX.length) % PREFIX.length];
    if (kind === SITE_CASTLE) {
      const s = CASTLE_SUFFIX[Math.floor(hash01(gx, 601, gz, seed) * CASTLE_SUFFIX.length)];
      return `${p}${s} Şatosu`;
    }
    if (kind === SITE_CITY) return `${p}kent`;
    if (kind === SITE_VILLAGE) return `${p}${SUFFIX[Math.floor(hash01(gx, 602, gz, seed) * SUFFIX.length)]} Köyü`;
    return p + SUFFIX[Math.floor(hash01(gx, 602, gz, seed) * SUFFIX.length)];
  }

  /** Road from cell (gx,gz) to its +X (dir 0) or +Z (dir 1) neighbour, or null. */
  road(gx: number, gz: number, dir: 0 | 1): Road | null {
    const id = `${gx},${gz},${dir}`;
    const cached = this.roads.get(id);
    if (cached !== undefined) return cached;
    const result = this.buildRoad(id, gx, gz, dir);
    this.roads.set(id, result);
    return result;
  }

  private buildRoad(id: string, gx: number, gz: number, dir: 0 | 1): Road | null {
    const a = this.site(gx, gz);
    const b = dir === 0 ? this.site(gx + 1, gz) : this.site(gx, gz + 1);
    if (!a || !b) return null;
    if (hash01(gx * 2 + dir, 700, gz, this.terrain.seed) > 0.8) return null; // some links missing
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len, nz = dx / len;
    const amp = Math.min(38, len * 0.1);
    const n = Math.max(2, Math.ceil(len / 6));
    const pts = new Float32Array((n + 1) * 2);
    let deep = 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const env = Math.sin(Math.PI * t);
      const off = this.nMeander.fbm2(t * len / 140 + gx * 13.7, gz * 7.3 + dir * 31.1, 3) * amp * env;
      const x = a.x + dx * t + nx * off;
      const z = a.z + dz * t + nz * off;
      pts[i * 2] = x;
      pts[i * 2 + 1] = z;
      if (i % 4 === 0) {
        const s = this.terrain.sample(x, z);
        if (s.h < SEA - 5) deep++; // open water: no road
        if (s.h > SEA + 58) deep++; // over the high peaks: no road
      }
    }
    if (deep > 0) return null;
    return { id, a, b, pts, length: len };
  }

  /** Sites whose cells touch the square [x0,x1]x[z0,z1] expanded by `pad`. */
  sitesNear(x0: number, z0: number, x1: number, z1: number, pad: number): Site[] {
    const out: Site[] = [];
    for (let gz = Math.floor((z0 - pad) / SITE_CELL) - 1; gz <= Math.floor((z1 + pad) / SITE_CELL) + 1; gz++) {
      for (let gx = Math.floor((x0 - pad) / SITE_CELL) - 1; gx <= Math.floor((x1 + pad) / SITE_CELL) + 1; gx++) {
        const s = this.site(gx, gz);
        if (s && s.x >= x0 - pad && s.x <= x1 + pad && s.z >= z0 - pad && s.z <= z1 + pad) out.push(s);
      }
    }
    return out;
  }

  /** Roads whose bounding box (expanded by pad) overlaps the square. */
  roadsNear(x0: number, z0: number, x1: number, z1: number, pad: number): Road[] {
    const out: Road[] = [];
    const gx0 = Math.floor(x0 / SITE_CELL) - 2, gx1 = Math.floor(x1 / SITE_CELL) + 1;
    const gz0 = Math.floor(z0 / SITE_CELL) - 2, gz1 = Math.floor(z1 / SITE_CELL) + 1;
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        for (const dir of [0, 1] as const) {
          const r = this.road(gx, gz, dir);
          if (!r) continue;
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          for (let i = 0; i < r.pts.length; i += 2) {
            minX = Math.min(minX, r.pts[i]); maxX = Math.max(maxX, r.pts[i]);
            minZ = Math.min(minZ, r.pts[i + 1]); maxZ = Math.max(maxZ, r.pts[i + 1]);
          }
          if (maxX + pad < x0 || minX - pad > x1 || maxZ + pad < z0 || minZ - pad > z1) continue;
          out.push(r);
        }
      }
    }
    return out;
  }

  /** All roads touching a site. */
  roadsOf(s: Site): Road[] {
    const list = [
      this.road(s.gx, s.gz, 0), this.road(s.gx, s.gz, 1),
      this.road(s.gx - 1, s.gz, 0), this.road(s.gx, s.gz - 1, 1),
    ];
    return list.filter((r): r is Road => r !== null);
  }
}

// ------------------------------------------------------------------ landmarks

export const LANDMARK_CELL = 230;

export const LM = {
  GRAVEYARD: 0,
  PLATFORM: 1, // Harry Potter
  WILLOW: 2, // Harry Potter
  VAULT: 3, // Fallout
  SANDWORM: 4, // Dune
  MOISTURE_FARM: 5, // Star Wars
  SABER_STONE: 6, // Star Wars x Arthur
  CHAPEL: 7, // Diablo
  PENTAGRAM: 8, // Diablo
  MURLOC_HUTS: 9, // Warcraft
  PEON_CAMP: 10, // Warcraft
  DARK_TOWER: 11, // Mordor
  MONOLITH: 12, // 2001
  HOBBIT_HOLE: 13, // Tolkien
  PHONE_BOX: 14, // Doctor Who
  SUNKEN_TEMPLE: 15, // Lovecraft
} as const;

const GREEN = [BIOME.PLAINS, BIOME.FOREST, BIOME.BIRCH_FOREST];
const COLD = [BIOME.TAIGA, BIOME.TUNDRA];
/** Which landmark kinds may appear in which biomes (with relative weights). */
const LANDMARK_TABLE: Array<{ kind: number; biomes: number[]; weight: number }> = [
  { kind: LM.GRAVEYARD, biomes: [...GREEN, ...COLD, BIOME.GLOOM], weight: 5 },
  { kind: LM.PLATFORM, biomes: [...GREEN], weight: 1 },
  { kind: LM.WILLOW, biomes: [...GREEN, BIOME.GLOOM], weight: 1.5 },
  { kind: LM.VAULT, biomes: [...GREEN, ...COLD, BIOME.DESERT], weight: 1.5 },
  { kind: LM.SANDWORM, biomes: [BIOME.DESERT], weight: 3 },
  { kind: LM.MOISTURE_FARM, biomes: [BIOME.DESERT, BIOME.BADLANDS], weight: 2.5 },
  { kind: LM.SABER_STONE, biomes: [...GREEN, ...COLD], weight: 1 },
  { kind: LM.CHAPEL, biomes: [BIOME.GLOOM, BIOME.PLAINS, BIOME.ASHLANDS], weight: 2 },
  { kind: LM.PENTAGRAM, biomes: [BIOME.ASHLANDS], weight: 3 },
  { kind: LM.MURLOC_HUTS, biomes: [BIOME.BLACK_BEACH, BIOME.BEACH, BIOME.STONY_SHORE], weight: 4 },
  { kind: LM.PEON_CAMP, biomes: [BIOME.FOREST, BIOME.TAIGA, BIOME.BIRCH_FOREST], weight: 1.5 },
  { kind: LM.DARK_TOWER, biomes: [BIOME.ASHLANDS], weight: 2 },
  { kind: LM.MONOLITH, biomes: [BIOME.DESERT, BIOME.PLAINS, BIOME.TUNDRA], weight: 0.8 },
  { kind: LM.HOBBIT_HOLE, biomes: [...GREEN], weight: 1.2 },
  { kind: LM.PHONE_BOX, biomes: [...GREEN, BIOME.TUNDRA], weight: 0.7 },
  // Half drowned in the eldritch shallows (the only landmark allowed in water).
  { kind: LM.SUNKEN_TEMPLE, biomes: [BIOME.ELDRITCH_SEA, BIOME.BLACK_BEACH], weight: 8 },
];

export interface Landmark {
  id: string;
  gx: number;
  gz: number;
  x: number;
  z: number;
  kind: number;
  /** Quarter turns (0-3). */
  rot: number;
  h: number;
  biome: number;
}

/** Selects landmarks on their own jittered grid, away from sites and steep ground. */
export class LandmarkMap {
  private cache = new Map<string, Landmark | null>();
  constructor(private terrain: Terrain, private sites: StructureMap) {}

  at(gx: number, gz: number): Landmark | null {
    const id = `${gx},${gz}`;
    const hit = this.cache.get(id);
    if (hit !== undefined) return hit;
    this.cache.set(id, (this.pick(id, gx, gz)));
    return this.cache.get(id)!;
  }

  private pick(id: string, gx: number, gz: number): Landmark | null {
    const seed = this.terrain.seed;
    // The single dark tower of the world sits at its cell centre.
    const t = this.terrain.tower;
    if (t && Math.floor(t.x / LANDMARK_CELL) === gx && Math.floor(t.z / LANDMARK_CELL) === gz) {
      const s = this.terrain.sample(t.x, t.z);
      return { id, gx, gz, x: t.x, z: t.z, kind: LM.DARK_TOWER, rot: 0, h: s.h, biome: s.biome };
    }
    if (hash01(gx, 1200, gz, seed) < 0.25) return null;
    // Several jittered spots per cell, so narrow shores and rugged Ashlands still get some.
    for (let attempt = 0; attempt < 4; attempt++) {
      const x = Math.round((gx + 0.2 + hash01(gx, 1201 + attempt * 7, gz, seed) * 0.6) * LANDMARK_CELL);
      const z = Math.round((gz + 0.2 + hash01(gx, 1202 + attempt * 7, gz, seed) * 0.6) * LANDMARK_CELL);
      const lm = this.tryAt(id, gx, gz, x, z);
      if (lm) return lm;
    }
    return null;
  }

  private tryAt(id: string, gx: number, gz: number, x: number, z: number): Landmark | null {
    const seed = this.terrain.seed;
    const s = this.terrain.sample(x, z);
    // Dry land only, except the sunken temple, which stands in the eldritch shallows.
    const wet = s.h < SEA + 1;
    if ((wet && !(s.biome === BIOME.ELDRITCH_SEA && s.h > SEA - 14)) || s.crag > 0.05 || s.river > 0.05 || s.isle > 0) return null;
    // Fairly level ground only (the Ashlands are jagged everywhere, so be lenient there).
    const tol = s.biome === BIOME.ASHLANDS ? 10 : wet ? 7 : 5;
    for (const [dx, dz] of [[9, 0], [-9, 0], [0, 9], [0, -9]]) {
      if (Math.abs(this.terrain.sample(x + dx, z + dz).h - s.h) > tol) return null;
    }
    if (this.sites.sitesNear(x - 70, z - 70, x + 70, z + 70, 0).length) return null;
    // Settlements spread further than castles.
    if (this.sites.sitesNear(x - 125, z - 125, x + 125, z + 125, 0).some((o) => o.kind >= SITE_VILLAGE && Math.hypot(o.x - x, o.z - z) < (o.kind === SITE_CITY ? 125 : 75))) return null;
    const options = LANDMARK_TABLE.filter((o) => o.kind !== LM.DARK_TOWER && o.biomes.includes(s.biome as never) && (!wet || o.kind === LM.SUNKEN_TEMPLE));
    if (!options.length) return null;
    let r = hash01(gx, 1203, gz, seed) * options.reduce((a, o) => a + o.weight, 0);
    let kind = options[0].kind;
    for (const o of options) { r -= o.weight; if (r <= 0) { kind = o.kind; break; } }
    const rot = Math.floor(hash01(gx, 1204, gz, seed) * 4);
    return { id, gx, gz, x, z, kind, rot, h: s.h, biome: s.biome };
  }

  near(x0: number, z0: number, x1: number, z1: number, pad: number): Landmark[] {
    const out: Landmark[] = [];
    for (let gz = Math.floor((z0 - pad) / LANDMARK_CELL); gz <= Math.floor((z1 + pad) / LANDMARK_CELL); gz++) {
      for (let gx = Math.floor((x0 - pad) / LANDMARK_CELL); gx <= Math.floor((x1 + pad) / LANDMARK_CELL); gx++) {
        const l = this.at(gx, gz);
        if (l && l.x >= x0 - pad && l.x <= x1 + pad && l.z >= z0 - pad && l.z <= z1 + pad) out.push(l);
      }
    }
    return out;
  }
}

/** Point at distance d along a polyline (clamped). Returns [x, z, dirX, dirZ]. */
export function pointAlong(pts: Float32Array, d: number): [number, number, number, number] {
  let acc = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
    const seg = Math.hypot(bx - ax, bz - az);
    if (acc + seg >= d || i + 4 >= pts.length) {
      const t = seg > 0 ? Math.min(1, Math.max(0, (d - acc) / seg)) : 0;
      return [ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / (seg || 1), (bz - az) / (seg || 1)];
    }
    acc += seg;
  }
  return [pts[0], pts[1], 1, 0];
}

export function polylineLength(pts: Float32Array): number {
  let len = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) len += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
  return len;
}
