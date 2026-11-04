// Writes world structures (roads, bridges, castles, crossroad lanterns) into a
// generated region, and lists the signposts that stand inside a chunk.

import { hash01 } from '../engine/noise';
import { B, CHUNK, HEIGHT, HEIGHT8, KIND, KIND_AIR, KIND_PLANT, KIND_LEAVES, KIND_WATER, SEA } from './blocks';
import { RW } from './biomes';
import { buildCastle, C_AIR, C_FILL, C_KEEP, C_SURFACE, type CastlePlan } from './castle';
import { buildVillagePlan, type VillagePlan } from './village';
import { SITE_CASTLE, SITE_CITY, SITE_CROSSROAD, SITE_VILLAGE, pointAlong, polylineLength, type Landmark, type Road, type Site } from './structures';
import { buildLandmark, LANDMARK_REACH, type LandmarkPlan } from './landmarks';
import type { Terrain } from './terrain';

export interface SignBoard {
  text: string;
  /** Direction the board points to (world XZ, normalised). */
  dx: number;
  dz: number;
}

export interface SignRecord {
  x: number;
  y: number;
  z: number;
  boards: SignBoard[];
  /** post = signpost (default), tomb = gravestone, plaque = plank without post. */
  style?: 'post' | 'tomb' | 'plaque';
}

const idx = (x: number, y: number, z: number) => (y * RW + z) * RW + x;

const castleCache = new Map<string, CastlePlan>();
function castleFor(t: Terrain, site: Site): CastlePlan {
  const key = `${t.seed}:${site.id}`;
  let plan = castleCache.get(key);
  if (!plan) {
    plan = buildCastle(site, t.seed, gateSide(t, site));
    if (castleCache.size > 48) castleCache.delete(castleCache.keys().next().value!);
    castleCache.set(key, plan);
  }
  return plan;
}

const villageCache = new Map<string, VillagePlan>();
function villageFor(t: Terrain, site: Site): VillagePlan {
  const key = `${t.seed}:${site.id}`;
  let plan = villageCache.get(key);
  if (!plan) {
    plan = buildVillagePlan(t, site);
    if (villageCache.size > 12) villageCache.delete(villageCache.keys().next().value!);
    villageCache.set(key, plan);
  }
  return plan;
}
const isSettlement = (s: Site) => s.kind === SITE_VILLAGE || s.kind === SITE_CITY;
/** How far a settlement's plan reaches from its centre. */
const SETTLEMENT_REACH = 110;

const landmarkCache = new Map<string, LandmarkPlan>();
function landmarkFor(t: Terrain, lm: Landmark): LandmarkPlan {
  const key = `${t.seed}:${lm.id}`;
  let plan = landmarkCache.get(key);
  if (!plan) {
    plan = buildLandmark(lm, t.seed);
    if (landmarkCache.size > 64) landmarkCache.delete(landmarkCache.keys().next().value!);
    landmarkCache.set(key, plan);
  }
  return plan;
}

/** Face the gate towards where the first road arrives from. */
export function gateSide(t: Terrain, site: Site): number {
  const road = t.structures.roadsOf(site)[0];
  if (!road) return Math.floor(hash01(site.gx, 900, site.gz, t.seed) * 4);
  const len = polylineLength(road.pts);
  const [px, pz] = road.a === site ? pointAlong(road.pts, 40) : pointAlong(road.pts, len - 40);
  const dx = px - site.x, dz = pz - site.z;
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 1) : dz > 0 ? 2 : 3;
}

function topSolid(blocks: Uint8Array, lx: number, lz: number): number {
  for (let y = HEIGHT - 1; y > 0; y--) {
    const b = blocks[idx(lx, y, lz)];
    if (b !== B.AIR && KIND[b] !== KIND_WATER && KIND[b] !== KIND_PLANT && KIND[b] !== KIND_LEAVES) return y;
  }
  return -1;
}

export function placeStructures(t: Terrain, blocks: Uint8Array, x0: number, z0: number, mask: Uint8Array): void {
  const x1 = x0 + RW, z1 = z0 + RW;
  const sites = t.structures.sitesNear(x0, z0, x1, z1, SETTLEMENT_REACH);
  const castles = sites.filter((s) => s.kind === SITE_CASTLE && Math.max(s.x - x1, x0 - s.x, s.z - z1, z0 - s.z) < 32).map((s) => castleFor(t, s));
  const inCastle = (wx: number, wz: number) => castles.some((c) => Math.max(Math.abs(wx - c.cx), Math.abs(wz - c.cz)) <= c.half);

  // --- roads: distance field from every nearby road polyline
  const dist = new Float32Array(RW * RW).fill(99);
  for (const road of t.structures.roadsNear(x0, z0, x1, z1, 4)) rasterRoad(road, dist, x0, z0);

  for (let lz = 0; lz < RW; lz++) {
    for (let lx = 0; lx < RW; lx++) {
      const ci = lz * RW + lx;
      const d = dist[ci];
      if (d > 3.2) continue;
      const wx = x0 + lx, wz = z0 + lz;
      if (inCastle(wx, wz)) continue;
      mask[ci] = 1; // keep trees and plants off the verge
      const core = d < 1.45;
      const edge = !core && d < 2.3 && hash01(wx, 77, wz, t.seed) < 0.65;
      if (!core && !edge) continue;
      const top = topSolid(blocks, lx, lz);
      if (top < 0) continue;
      const over = blocks[idx(lx, top + 1, lz)];
      if (KIND[over] === KIND_WATER || over === B.ICE || over === B.KELP) {
        // Bridge: deck just above the liquid (stone over lava), piles on the centre line.
        const lava = over === B.LAVA;
        if (SEA - top > 9) continue;
        blocks[idx(lx, SEA + 1, lz)] = lava ? B.BASALT : B.PLANKS;
        if (d < 0.7 && (wx * 7 + wz * 13) % 6 === 0) for (let y = top + 1; y <= SEA; y++) blocks[idx(lx, y, lz)] = lava ? B.OBSIDIAN : B.OAK_LOG;
        if (d > 1.9) blocks[idx(lx, SEA + 2, lz)] = lava ? B.OBSIDIAN : B.DARK_PLANKS; // low railing
        continue;
      }
      const n = hash01(wx, 78, wz, t.seed);
      blocks[idx(lx, top, lz)] = core ? (n < 0.12 ? B.GRAVEL : B.PATH) : n < 0.5 ? B.GRAVEL : B.PATH;
      for (let y = top + 1; y <= Math.min(HEIGHT - 1, top + 3); y++) {
        const b = blocks[idx(lx, y, lz)];
        if (b !== B.WATER) blocks[idx(lx, y, lz)] = B.AIR;
      }
    }
  }

  // --- castles and landmarks
  for (const c of castles) stampCastle(c, blocks, x0, z0, mask);
  for (const s of sites) if (isSettlement(s)) stampCastle(villageFor(t, s), blocks, x0, z0, mask);
  for (const lm of t.landmarks.near(x0, z0, x1, z1, LANDMARK_REACH)) stampCastle(landmarkFor(t, lm), blocks, x0, z0, mask);

  // --- crossroads: a stone lantern post beside the junction
  for (const s of sites) {
    if (s.kind !== SITE_CROSSROAD) continue;
    const lx = s.x - 3 - x0, lz = s.z - 3 - z0;
    if (lx < 0 || lz < 0 || lx >= RW || lz >= RW) continue;
    const top = topSolid(blocks, lx, lz);
    if (top < SEA || top > HEIGHT - 5) continue;
    blocks[idx(lx, top + 1, lz)] = B.STONE_BRICKS;
    blocks[idx(lx, top + 2, lz)] = B.STONE_BRICKS;
    blocks[idx(lx, top + 3, lz)] = B.LANTERN;
    mask[lz * RW + lx] = 2;
  }
}

function rasterRoad(road: Road, dist: Float32Array, x0: number, z0: number): void {
  const pts = road.pts;
  const W = 3.2;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - W) - x0), maxX = Math.min(RW - 1, Math.ceil(Math.max(ax, bx) + W) - x0);
    const minZ = Math.max(0, Math.floor(Math.min(az, bz) - W) - z0), maxZ = Math.min(RW - 1, Math.ceil(Math.max(az, bz) + W) - z0);
    if (minX > maxX || minZ > maxZ) continue;
    const ex = bx - ax, ez = bz - az;
    const len2 = ex * ex + ez * ez || 1;
    for (let lz = minZ; lz <= maxZ; lz++) {
      for (let lx = minX; lx <= maxX; lx++) {
        const px = x0 + lx + 0.5, pz = z0 + lz + 0.5;
        const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / len2));
        const d = Math.hypot(px - (ax + ex * t), pz - (az + ez * t));
        const ci = lz * RW + lx;
        if (d < dist[ci]) dist[ci] = d;
      }
    }
  }
}

function stampCastle(c: CastlePlan, blocks: Uint8Array, x0: number, z0: number, mask: Uint8Array): void {
  const lx0 = Math.max(0, c.ox - x0), lx1 = Math.min(RW - 1, c.ox + c.w - 1 - x0);
  const lz0 = Math.max(0, c.oz - z0), lz1 = Math.min(RW - 1, c.oz + c.d - 1 - z0);
  if (lx0 > lx1 || lz0 > lz1) return;
  for (let lz = lz0; lz <= lz1; lz++) {
    for (let lx = lx0; lx <= lx1; lx++) {
      const cx = lx + x0 - c.ox, cz = lz + z0 - c.oz;
      let touched = false;
      let any = false;
      for (let cy = 0; cy < c.h; cy++) {
        const y = c.oy + cy;
        if (y <= 1 || y >= HEIGHT) continue;
        const v = c.cells[(cy * c.d + cz) * c.w + cx];
        if (v === C_KEEP) continue;
        any = true;
        const i = idx(lx, y, lz);
        if (v === C_AIR) {
          if (y > SEA || blocks[i] !== B.WATER) blocks[i] = B.AIR;
        } else if (v === C_SURFACE) {
          blocks[i] = c.surface ?? B.GRASS;
        } else if (v === C_FILL) {
          const k = KIND[blocks[i]];
          if (k === KIND_AIR || k === KIND_PLANT || k === KIND_LEAVES || k === KIND_WATER) blocks[i] = cy % 3 === 0 ? B.COBBLE : B.STONE;
        } else if (v === B.GLOOM_LEAVES) {
          if (blocks[i] === B.AIR) blocks[i] = v;
        } else {
          blocks[i] = v;
          touched = true;
        }
      }
      if (touched || Math.max(Math.abs(lx + x0 - c.cx), Math.abs(lz + z0 - c.cz)) <= c.half) mask[lz * RW + lx] = 2;
      else if (any && c.clearMask && !mask[lz * RW + lx]) mask[lz * RW + lx] = 1;
      // Landmark cuts expose stone and dirt on their banks: give them topsoil again.
      if (c.surface !== undefined) {
        const top = topSolid(blocks, lx, lz);
        if (top > 0 && top < HEIGHT - 1 && blocks[idx(lx, top + 1, lz)] === B.AIR) {
          const b = blocks[idx(lx, top, lz)];
          if (b === B.STONE || b === B.DIRT || b === B.SANDSTONE || b === B.BASALT) blocks[idx(lx, top, lz)] = c.surface;
        }
      }
    }
  }
}

/** Signposts whose post stands inside chunk (cx, cz). */
export function collectSigns(t: Terrain, blocks: Uint8Array, cx: number, cz: number, x0: number, z0: number): SignRecord[] {
  const ix0 = cx * CHUNK, iz0 = cz * CHUNK;
  const inside = (x: number, z: number) => x >= ix0 && x < ix0 + CHUNK && z >= iz0 && z < iz0 + CHUNK;
  const out: SignRecord[] = [];
  const surface = (x: number, z: number): number => {
    const lx = x - x0, lz = z - z0;
    const top = topSolid(blocks, lx, lz);
    return top < 0 ? -1 : top + HEIGHT8[blocks[idx(lx, top, lz)]] / 8;
  };
  const meters = (m: number) => `${Math.max(10, Math.round(m / 10) * 10)}m`;

  // Junction signs at crossroads and village squares: one board per road leaving.
  for (const s of t.structures.sitesNear(ix0, iz0, ix0 + CHUNK, iz0 + CHUNK, 16)) {
    if (s.kind !== SITE_CROSSROAD && !isSettlement(s)) continue;
    const off = s.kind === SITE_CITY ? 8 : s.kind === SITE_VILLAGE ? 3 : 3;
    const px = s.x + off, pz = s.z + (s.kind === SITE_CROSSROAD ? 3 : -off);
    if (!inside(px, pz)) continue;
    const boards: SignBoard[] = [];
    for (const road of t.structures.roadsOf(s)) {
      const len = polylineLength(road.pts);
      const fromA = road.a === s;
      const [qx, qz] = fromA ? pointAlong(road.pts, 16) : pointAlong(road.pts, len - 16);
      const dl = Math.hypot(qx - s.x, qz - s.z) || 1;
      const other = fromA ? road.b : road.a;
      boards.push({ text: `${other.name} ${meters(len)}`, dx: (qx - s.x) / dl, dz: (qz - s.z) / dl });
    }
    const y = surface(px, pz);
    if (boards.length && y > 0) out.push({ x: px + 0.5, y, z: pz + 0.5, boards });
  }

  // Waymarks a short way out from each end of every road.
  for (const road of t.structures.roadsNear(ix0, iz0, ix0 + CHUNK, iz0 + CHUNK, 4)) {
    const len = polylineLength(road.pts);
    if (len < 110) continue;
    for (const atA of [true, false]) {
      const along = atA ? 34 : len - 34;
      const [x, z, dx, dz] = pointAlong(road.pts, along);
      // Stand on the right-hand verge (relative to the a -> b direction).
      const sx = Math.floor(x - dz * 2.8), sz = Math.floor(z + dx * 2.8);
      if (!inside(sx, sz)) continue;
      const y = surface(sx, sz);
      if (y < 0) continue;
      out.push({
        x: sx + 0.5, y, z: sz + 0.5,
        boards: [
          { text: `${road.b.name} ${meters(len - along)}`, dx, dz },
          { text: `${road.a.name} ${meters(along)}`, dx: -dx, dz: -dz },
        ],
      });
    }
  }
  // Settlement texts (shop plaques, name boards).
  for (const s of t.structures.sitesNear(ix0, iz0, ix0 + CHUNK, iz0 + CHUNK, SETTLEMENT_REACH)) {
    if (!isSettlement(s)) continue;
    for (const rec of villageFor(t, s).texts) if (inside(Math.floor(rec.x), Math.floor(rec.z))) out.push(rec);
  }
  // Landmark texts (tombstones, plaques, their own signposts).
  for (const lm of t.landmarks.near(ix0, iz0, ix0 + CHUNK, iz0 + CHUNK, LANDMARK_REACH)) {
    for (const rec of landmarkFor(t, lm).texts) if (inside(Math.floor(rec.x), Math.floor(rec.z))) out.push(rec);
  }
  return out;
}
