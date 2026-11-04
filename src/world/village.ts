// Villages and the city. A settlement is laid out once per site (houses along
// its streets, a square with a well or fountain, market stalls, fields, lamp
// posts) and turned into a voxel plan that is stamped like castles. The same
// deterministic layout is used on the main thread to guide villagers.

import { hash01 } from '../engine/noise';
import { B, PARTIAL, SEA } from './blocks';
import { BIOME } from './biomes';
import { C_AIR, C_FILL, C_KEEP, C_SURFACE, type CastlePlan } from './castle';
import { SITE_CITY, pointAlong, polylineLength, type Site } from './structures';
import type { SignRecord } from './stamp';
import type { Terrain } from './terrain';

export type HouseKind = 'home' | 'tall' | 'shop' | 'inn' | 'smithy' | 'bakery' | 'hall';
export type Style = 'oak' | 'spruce' | 'birch' | 'sand' | 'stone';

export interface Street {
  /** Polyline starting at the square, going outwards. */
  pts: Float32Array;
  len: number;
}

export interface House {
  kind: HouseKind;
  name?: string;
  cx: number; cz: number;
  /** Door direction (unit, axis aligned). */
  fx: number; fz: number;
  /** Half extents along the right axis (hw) and the door axis (hd). */
  hw: number; hd: number;
  wallH: number;
  y: number;
  style: Style;
  /** Cell just outside the door, and the street point it connects to. */
  doorX: number; doorZ: number;
  streetX: number; streetZ: number;
  street: number;
  /** Distance along the street of the connection. */
  s: number;
}

export interface Field { cx: number; cz: number; hw: number; hd: number; y: number; crop: number; street: number; s: number; entryX: number; entryZ: number }
export interface Spot { x: number; z: number; y: number; fx: number; fz: number }

export interface Layout {
  site: Site;
  city: boolean;
  floorY: number;
  radius: number;
  plazaR: number;
  style: Style;
  streets: Street[];
  houses: House[];
  fields: Field[];
  stalls: Spot[];
  lamps: Spot[];
  benches: Spot[];
  /** City only: the legends notice board on the square (faces the centre), banner poles, flower beds, the bard's spot. */
  board: Spot | null;
  banners: Spot[];
  flowers: Spot[];
  stage: Spot | null;
  /** Village watch towers by the roads in (y = ground under the tower; the lookout stands on y + TOWER_H + 1). */
  towers: Spot[];
}

export interface VillagePlan extends CastlePlan {
  texts: SignRecord[];
}

const DOWN = 14, UP = 30;
/** Height of a village watch tower's platform above the ground. */
export const TOWER_H = 8;
const SHOP_NAMES: Array<[HouseKind, string]> = [
  ['inn', 'Uykucu Ejder Hanı'], ['smithy', 'Demirci'], ['bakery', 'Fırın'], ['shop', 'Manav'],
  ['shop', 'Terzi'], ['shop', 'Baharatçı'], ['shop', 'Kitapçı'], ['shop', 'Çömlekçi'], ['shop', 'Şifacı'],
];

function styleFor(biome: number, city: boolean): Style {
  if (biome === BIOME.DESERT || biome === BIOME.BADLANDS) return 'sand';
  if (biome === BIOME.TAIGA || biome === BIOME.TUNDRA) return 'spruce';
  if (biome === BIOME.BIRCH_FOREST) return 'birch';
  return city ? 'stone' : 'oak';
}

// ------------------------------------------------------------------ layout

function segDist(px: number, pz: number, pts: Float32Array): [number, number] {
  let best = 1e9, bestS = 0, acc = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], az = pts[i + 1], ex = pts[i + 2] - ax, ez = pts[i + 3] - az;
    const l2 = ex * ex + ez * ez || 1, seg = Math.sqrt(l2);
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / l2));
    const d = Math.hypot(px - (ax + ex * t), pz - (az + ez * t));
    if (d < best) { best = d; bestS = acc + seg * t; }
    acc += seg;
  }
  return [best, bestS];
}

const layoutCache = new Map<string, Layout>();

export function villageLayout(t: Terrain, site: Site): Layout {
  const key = `${t.seed}:${site.id}`;
  const hit = layoutCache.get(key);
  if (hit) return hit;
  const layout = buildLayout(t, site);
  if (layoutCache.size > 32) layoutCache.delete(layoutCache.keys().next().value!);
  layoutCache.set(key, layout);
  return layout;
}

function buildLayout(t: Terrain, site: Site): Layout {
  const city = site.kind === SITE_CITY;
  const seed = t.seed;
  const rnd = (k: number) => hash01(site.gx * 131 + k, 2100 + k, site.gz * 71 - k, seed);
  const radius = city ? 78 : 40;
  const plazaR = city ? 11 : 5;
  const floorY = Math.floor(site.h);
  const style = styleFor(t.sample(site.x, site.z).biome, city);

  // Streets: the site's own roads, cut to the settlement radius...
  const streets: Street[] = [];
  for (const road of t.structures.roadsOf(site)) {
    const len = polylineLength(road.pts);
    const fromA = road.a === site;
    const n = Math.ceil(Math.min(len, radius + 6) / 3);
    const pts = new Float32Array((n + 1) * 2);
    for (let i = 0; i <= n; i++) {
      const d = (i / n) * Math.min(len, radius + 6);
      const [x, z] = pointAlong(road.pts, fromA ? d : len - d);
      pts[i * 2] = x; pts[i * 2 + 1] = z;
    }
    streets.push({ pts, len: Math.min(len, radius + 6) });
  }
  // ...plus side lanes (and in the city a ring street) so the blocks fill in.
  const ringR = city ? 42 : 0;
  const nRoads = streets.length;
  {
    const used = streets.map((s) => Math.atan2(s.pts[5] - s.pts[1], s.pts[4] - s.pts[0]));
    const want = city ? 6 : Math.max(0, 4 - streets.length);
    const slots = city ? 6 : 5;
    for (let k = 0, added = 0; k < slots && added < want; k++) {
      const a = (k / slots) * Math.PI * 2 + rnd(3) * 1.2;
      if (used.some((u) => Math.abs(Math.atan2(Math.sin(a - u), Math.cos(a - u))) < (city ? 0.45 : 0.9))) continue;
      const len = city ? radius : radius - 8;
      // Lanes stay on dry, gentle ground.
      let ok = true;
      for (let d = 10; d <= len && ok; d += 8) {
        const g = t.sample(site.x + Math.cos(a) * d, site.z + Math.sin(a) * d);
        ok = g.h > SEA + 1 && g.river < 0.05 && Math.abs(g.h - site.h) < 9;
      }
      if (!ok) continue;
      added++;
      used.push(a);
      const n = Math.ceil(len / 3);
      const pts = new Float32Array((n + 1) * 2);
      for (let i = 0; i <= n; i++) {
        const d = (i / n) * len, wob = Math.sin(d * 0.07 + k) * 3;
        pts[i * 2] = site.x + Math.cos(a) * d - Math.sin(a) * wob;
        pts[i * 2 + 1] = site.z + Math.sin(a) * d + Math.cos(a) * wob;
      }
      streets.push({ pts, len });
    }
  }
  if (city) {
    const n = 72;
    const pts = new Float32Array((n + 1) * 2);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, r = ringR + Math.sin(a * 3 + rnd(4) * 6) * 3;
      pts[i * 2] = site.x + Math.cos(a) * r; pts[i * 2 + 1] = site.z + Math.sin(a) * r;
    }
    streets.push({ pts, len: polylineLength(pts) });
  }

  const nearStreet = (x: number, z: number, minD: number): boolean => {
    if (Math.hypot(x - site.x, z - site.z) < plazaR + 2) return true;
    for (const s of streets) if (segDist(x, z, s.pts)[0] < minD) return true;
    return false;
  };
  const taken: Array<[number, number, number, number]> = []; // x0, z0, x1, z1
  const free = (x0: number, z0: number, x1: number, z1: number) =>
    !taken.some(([a, b, c, d]) => x0 <= c && x1 >= a && z0 <= d && z1 >= b);
  /** Ground range over a rectangle; null where wet or too steep. */
  const ground = (x0: number, z0: number, x1: number, z1: number, tol: number): number | null => {
    let lo = 1e9, hi = -1e9;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) {
      const s = t.sample(x, z);
      if (s.h < SEA + 1 || s.river > 0.03 || s.crag > 0.1) return null;
      lo = Math.min(lo, s.h); hi = Math.max(hi, s.h);
    }
    if (hi - lo > tol) return null;
    const y = Math.floor(t.sample((x0 + x1) / 2, (z0 + z1) / 2).h);
    return Math.abs(y - floorY) <= 10 ? y : null;
  };

  // --- houses along every street, both sides, doors facing the street
  const houses: House[] = [];
  const special = city ? SHOP_NAMES.slice() : rnd(5) < 0.5 ? [SHOP_NAMES[1]] : [SHOP_NAMES[2]];
  let k = 0;
  streets.forEach((st, si) => {
    for (let s = plazaR + 5; s < st.len - 3; s += city ? 7 : 8) {
      for (const side of [-1, 1]) {
        k++;
        if (!city && hash01(si * 31 + k, 2200, site.gz, seed) < 0.12) continue;
        const [px, pz, dx, dz] = pointAlong(st.pts, s);
        const nx = -dz * side, nz = dx * side; // outward normal on this side
        // Axis-aligned facing closest to "back towards the street".
        const fx0 = -nx, fz0 = -nz;
        const [fx, fz] = Math.abs(fx0) > Math.abs(fz0) ? [Math.sign(fx0), 0] : [0, Math.sign(fz0)];
        const r1 = hash01(si * 31 + k, 2201, site.gx, seed), r2 = hash01(si * 31 + k, 2202, site.gx, seed);
        const nearCentre = s < (city ? 52 : 18);
        let kind: HouseKind = 'home';
        if (special.length && nearCentre && r1 < 0.7) kind = special[0][0];
        else if (city && r1 < 0.45) kind = 'tall';
        const big = kind === 'inn' || kind === 'hall';
        const hw = big ? 4 : kind === 'home' ? 2 + Math.floor(r2 * 2) : 3;
        const hd = big ? 3 : 2 + Math.floor(r1 * 2);
        const off = 3.4 + Math.max(hw, hd) + 1;
        const cx = Math.round(px + nx * off), cz = Math.round(pz + nz * off);
        const ex = fx !== 0 ? hd : hw, ez = fx !== 0 ? hw : hd; // world half extents
        const x0 = cx - ex - 1, x1 = cx + ex + 1, z0 = cz - ez - 1, z1 = cz + ez + 1;
        if (Math.hypot(cx - site.x, cz - site.z) > radius - 4) continue;
        if (!free(x0 - 1, z0 - 1, x1 + 1, z1 + 1)) continue;
        // Footprint must stay off every street.
        let clash = false;
        for (const [qx, qz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx, cz], [(x0 + x1) / 2, z0], [(x0 + x1) / 2, z1], [x0, (z0 + z1) / 2], [x1, (z0 + z1) / 2]]) {
          if (nearStreet(qx, qz, 2.6)) { clash = true; break; }
        }
        if (clash) continue;
        const y = ground(x0, z0, x1, z1, 5);
        if (y === null) continue;
        const wallH = kind === 'home' ? 3 : kind === 'hall' ? 7 : 6;
        const doorX = cx + fx * (hd + 1), doorZ = cz + fz * (hd + 1);
        const [, sAlong] = segDist(doorX, doorZ, st.pts);
        const [qx, qz] = pointAlong(st.pts, sAlong);
        const name = kind !== 'home' && kind !== 'tall' ? special.shift()![1] : undefined;
        taken.push([x0, z0, x1, z1]);
        houses.push({ kind, name, cx, cz, fx, fz, hw, hd, wallH, y, style, doorX, doorZ, streetX: qx, streetZ: qz, street: si, s: sAlong });
      }
    }
  });
  // The city hall faces the square.
  if (city) {
    const a = rnd(6) * Math.PI * 2;
    for (let tries = 0; tries < 12; tries++) {
      const aa = a + tries * 0.52;
      const cx = Math.round(site.x + Math.cos(aa) * (plazaR + 8)), cz = Math.round(site.z + Math.sin(aa) * (plazaR + 8));
      const fx0 = site.x - cx, fz0 = site.z - cz;
      const [fx, fz] = Math.abs(fx0) > Math.abs(fz0) ? [Math.sign(fx0), 0] : [0, Math.sign(fz0)];
      const hw = 5, hd = 4, ex = fx !== 0 ? hd : hw, ez = fx !== 0 ? hw : hd;
      const x0 = cx - ex - 1, x1 = cx + ex + 1, z0 = cz - ez - 1, z1 = cz + ez + 1;
      if (!free(x0, z0, x1, z1)) continue;
      let clash = false;
      for (const [qx, qz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx, cz]]) {
        if (Math.hypot(qx - site.x, qz - site.z) < plazaR + 1) { clash = true; break; }
        for (const s of streets) if (segDist(qx, qz, s.pts)[0] < 2.6) clash = true;
      }
      const y = ground(x0, z0, x1, z1, 4);
      if (clash || y === null) continue;
      taken.push([x0, z0, x1, z1]);
      const doorX = cx + fx * (hd + 1), doorZ = cz + fz * (hd + 1);
      houses.push({ kind: 'hall', name: 'Belediye Konağı', cx, cz, fx, fz, hw, hd, wallH: 7, y, style: 'stone', doorX, doorZ, streetX: site.x, streetZ: site.z, street: -1, s: 0 });
      break;
    }
  }

  // --- fields on the outskirts (villages, and a few round the city)
  const fields: Field[] = [];
  if (style !== 'sand') {
    streets.forEach((st, si) => {
      if (city && si >= nRoads) return; // only along the real roads
      for (let s = st.len - 4; s > plazaR + 14; s -= 13) {
        for (const side of [-1, 1]) {
          if (fields.length >= (city ? 6 : 4)) return;
          const [px, pz, dx, dz] = pointAlong(st.pts, s);
          const nx = -dz * side, nz = dx * side;
          const hw = 4, hd = 3 + Math.floor(hash01(si, 2300 + s, side, seed) * 2);
          const cx = Math.round(px + nx * (4 + hd)), cz = Math.round(pz + nz * (4 + hd));
          const x0 = cx - hw - 1, x1 = cx + hw + 1, z0 = cz - hd - 1, z1 = cz + hd + 1;
          if (!free(x0 - 1, z0 - 1, x1 + 1, z1 + 1)) continue;
          let clash = false;
          for (const [qx, qz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) if (nearStreet(qx, qz, 2.4)) clash = true;
          const y = ground(x0, z0, x1, z1, 4);
          if (clash || y === null) continue;
          taken.push([x0, z0, x1, z1]);
          const [, sAlong] = segDist(cx, cz, st.pts);
          const [ex, ez] = pointAlong(st.pts, sAlong);
          fields.push({ cx, cz, hw, hd, y, crop: hash01(cx, 2301, cz, seed) < 0.6 ? B.WHEAT : B.CARROTS, street: si, s: sAlong, entryX: ex, entryZ: ez });
        }
      }
    });
  }

  // --- the city's farm belt: fields in a ring just outside the houses, clear of the roads
  if (city && style !== 'sand') {
    const roads = t.structures.roadsOf(site);
    const offRoad = (x: number, z: number, d: number) => !roads.some((rd) => segDist(x, z, rd.pts)[0] < d);
    for (const r of [radius + 8, radius + 18]) {
      for (let i = 0; i < 28 && fields.length < 10; i++) {
        const a = rnd(9) * 6.28 + (i / 28) * Math.PI * 2;
        const hw = 4, hd = 3 + Math.floor(hash01(i, 2310 + r, site.gx, seed) * 2);
        const cx = Math.round(site.x + Math.cos(a) * r), cz = Math.round(site.z + Math.sin(a) * r);
        const x0 = cx - hw - 1, x1 = cx + hw + 1, z0 = cz - hd - 1, z1 = cz + hd + 1;
        if (!free(x0 - 2, z0 - 2, x1 + 2, z1 + 2)) continue;
        if ([[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx, cz]].some(([qx, qz]) => nearStreet(qx, qz, 3) || !offRoad(qx, qz, 4))) continue;
        const y = ground(x0, z0, x1, z1, 3);
        if (y === null) continue;
        taken.push([x0, z0, x1, z1]);
        // Farmers walk in from the nearest street end.
        let best = 1e9, si = 0, sAlong = 0;
        streets.forEach((st, k) => { const [d, s] = segDist(cx, cz, st.pts); if (d < best) { best = d; si = k; sAlong = s; } });
        const [ex, ez] = pointAlong(streets[si].pts, sAlong);
        fields.push({ cx, cz, hw, hd, y, crop: hash01(cx, 2301, cz, seed) < 0.6 ? B.WHEAT : B.CARROTS, street: si, s: sAlong, entryX: ex, entryZ: ez });
      }
    }
  }

  // The legends board: north side of the square first, so it shows behind the fountain from the spawn.
  let board: Spot | null = null;
  if (city) {
    for (let k = 0; k < 32 && !board; k++) {
      const a = -Math.PI / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.19;
      const x = Math.round(site.x + Math.cos(a) * (plazaR - 1.5)), z = Math.round(site.z + Math.sin(a) * (plazaR - 1.5));
      const fx0 = site.x - x, fz0 = site.z - z;
      const [fx, fz] = Math.abs(fx0) > Math.abs(fz0) ? [Math.sign(fx0), 0] : [0, Math.sign(fz0)];
      const ok = (qx: number, qz: number, d: number) =>
        !streets.some((s) => segDist(qx, qz, s.pts)[0] < d);
      if (!ok(x, z, 3) || !ok(x - fz * 2, z + fx * 2, 2.6) || !ok(x + fz * 2, z - fx * 2, 2.6)) continue;
      // Keep clear of the city's junction signpost (stamp.ts puts it at +8, -8 from the centre).
      if (Math.hypot(x - site.x - 8, z - site.z + 8) < 4.5) continue;
      board = { x, z, y: floorY, fx, fz };
    }
  }
  // --- market stalls and benches around the square
  const stalls: Spot[] = [];
  const benches: Spot[] = [];
  const nStalls = city ? 8 : 2;
  for (let i = 0; i < nStalls * 3 && stalls.length < nStalls; i++) {
    const a = rnd(7) * 6.28 + i * 2.4;
    const r = plazaR - 2.5;
    const x = Math.round(site.x + Math.cos(a) * r), z = Math.round(site.z + Math.sin(a) * r);
    if (streets.some((s) => segDist(x, z, s.pts)[0] < 2.6)) continue;
    if (stalls.some((o) => Math.hypot(o.x - x, o.z - z) < 4)) continue;
    if (board && Math.hypot(board.x - x, board.z - z) < 4) continue;
    const fx0 = site.x - x, fz0 = site.z - z;
    const [fx, fz] = Math.abs(fx0) > Math.abs(fz0) ? [Math.sign(fx0), 0] : [0, Math.sign(fz0)];
    stalls.push({ x, z, y: floorY, fx, fz });
  }
  for (let i = 0; i < (city ? 6 : 2); i++) {
    const a = rnd(8) * 6.28 + i * 1.9;
    const x = Math.round(site.x + Math.cos(a) * (plazaR - 1)), z = Math.round(site.z + Math.sin(a) * (plazaR - 1));
    if (streets.some((s) => segDist(x, z, s.pts)[0] < 2.2) || stalls.some((o) => Math.hypot(o.x - x, o.z - z) < 3)) continue;
    if (board && Math.hypot(board.x - x, board.z - z) < 3.5) continue;
    benches.push({ x, z, y: floorY, fx: 0, fz: 0 });
  }

  // --- city square dressing: banner poles, flower beds and the bard's spot
  let stage: Spot | null = null;
  const banners: Spot[] = [], flowers: Spot[] = [];
  if (city) {
    const clearOf = (x: number, z: number, d: number) =>
      !streets.some((s) => segDist(x, z, s.pts)[0] < d) &&
      ![...stalls, ...benches, ...banners].some((o) => Math.hypot(o.x - x, o.z - z) < d);
    const facing = (x: number, z: number): [number, number] => {
      const fx0 = site.x - x, fz0 = site.z - z;
      return Math.abs(fx0) > Math.abs(fz0) ? [Math.sign(fx0), 0] : [0, Math.sign(fz0)];
    };
    for (let i = 0; i < 32 && banners.length < 6; i++) {
      const a = rnd(11) * 6.28 + i * 0.2;
      const x = Math.round(site.x + Math.cos(a) * (plazaR + 0.5)), z = Math.round(site.z + Math.sin(a) * (plazaR + 0.5));
      if (!clearOf(x, z, 2.6) || (board && Math.hypot(board.x - x, board.z - z) < 4.5)) continue;
      const [fx, fz] = facing(x, z);
      banners.push({ x, z, y: floorY, fx, fz });
    }
    // Flower beds (2x2) inside the square, clear of the paths through it.
    for (let k = 0; k < 48 && flowers.length < 4; k++) {
      const a = rnd(13) * 6.28 + k * 0.33, r = k % 2 ? 6.5 : 8.5;
      const x = Math.round(site.x + Math.cos(a) * r) - 1, z = Math.round(site.z + Math.sin(a) * r) - 1;
      const cells = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]];
      if (cells.some(([qx, qz]) => streets.some((s) => segDist(qx + 0.5, qz + 0.5, s.pts)[0] < 2.2))) continue;
      if ([...stalls, ...benches, ...flowers].some((o) => Math.hypot(o.x - x, o.z - z) < 3.2)) continue;
      if (board && Math.hypot(board.x - x, board.z - z) < 4) continue;
      flowers.push({ x, z, y: floorY, fx: 0, fz: 0 });
    }
    // The bard plays on the square, away from the stalls, the board and the spawn spot.
    for (let i = 0; i < 16 && !stage; i++) {
      const a = rnd(12) * 6.28 + i * 0.4;
      const x = site.x + Math.cos(a) * (plazaR - 3.2), z = site.z + Math.sin(a) * (plazaR - 3.2);
      if ([...stalls, ...flowers].some((o) => Math.hypot(o.x - x, o.z - z) < 3) || (board && Math.hypot(board.x - x, board.z - z) < 4)) continue;
      if (Math.hypot(x - site.x, z - site.z - 6.5) < 4) continue;
      const [fx, fz] = facing(x, z);
      stage = { x, z, y: floorY, fx, fz };
    }
  }

  // --- lamp posts along the streets
  const lamps: Spot[] = [];
  streets.forEach((st, si) => {
    for (let s = plazaR + 3; s < st.len; s += city ? 11 : 14) {
      const [px, pz, dx, dz] = pointAlong(st.pts, s);
      const side = (Math.floor(s / 11) + si) % 2 ? 1 : -1;
      const x = Math.round(px - dz * side * 2.9), z = Math.round(pz + dx * side * 2.9);
      if (!free(x, z, x, z) || streets.some((o, oi) => oi !== si && segDist(x, z, o.pts)[0] < 2.5)) continue;
      const g = t.sample(x, z);
      if (g.h < SEA + 1 || Math.abs(g.h - floorY) > 12) continue;
      lamps.push({ x, z, y: Math.floor(g.h), fx: 0, fz: 0 });
    }
  });

  // --- watch towers where the roads come in (villages only; placed last so nothing else moves)
  const towers: Spot[] = [];
  if (!city) {
    streets.slice(0, Math.max(1, nRoads)).forEach((st, si) => {
      if (towers.length >= 2) return;
      for (let s = Math.min(st.len - 2, radius - 4); s > plazaR + 10 && towers.length <= si; s -= 3) {
        for (const side of [1, -1]) {
          if (towers.length > si) break;
          const [px, pz, dx, dz] = pointAlong(st.pts, s);
          const x = Math.round(px - dz * side * 5), z = Math.round(pz + dx * side * 5);
          if (!free(x - 2, z - 2, x + 2, z + 2) || nearStreet(x, z, 3.6)) continue;
          if (lamps.some((l) => Math.abs(l.x - x) <= 2 && Math.abs(l.z - z) <= 2)) continue;
          const y = ground(x - 1, z - 1, x + 1, z + 1, 3);
          if (y === null) continue;
          taken.push([x - 1, z - 1, x + 1, z + 1]);
          towers.push({ x, z, y, fx: Math.round(-dz * side), fz: Math.round(dx * side) });
        }
      }
    });
  }

  return { site, city, floorY, radius, plazaR, style, streets, houses, fields, stalls, lamps, benches, board, banners, flowers, stage, towers };
}

// ------------------------------------------------------------------ voxels

function surfaceFor(biome: number): number {
  if (biome === BIOME.DESERT || biome === BIOME.BADLANDS) return B.SAND;
  if (biome === BIOME.TUNDRA) return B.SNOW_GRASS;
  return B.GRASS;
}

interface Mat { corner: number; wall: number; base: number; roof: number; flat: boolean }
function materials(style: Style, kind: HouseKind, n: number): Mat {
  switch (style) {
    case 'sand': return { corner: B.SANDSTONE, wall: n < 0.5 ? B.CLAY_TAN : B.SANDSTONE, base: B.SANDSTONE, roof: B.SANDSTONE, flat: true };
    case 'spruce': return { corner: B.SPRUCE_LOG, wall: B.DARK_PLANKS, base: B.COBBLE, roof: B.ROOF_SLATE, flat: false };
    case 'birch': return { corner: B.BIRCH_LOG, wall: B.PLASTER, base: B.COBBLE, roof: n < 0.5 ? B.ROOF_SLATE : B.ROOF_RED, flat: false };
    case 'stone': return {
      corner: n < 0.5 ? B.OAK_LOG : B.STONE_BRICKS, wall: kind === 'hall' ? B.STONE_BRICKS : n < 0.7 ? B.PLASTER : B.PLANKS,
      base: B.STONE_BRICKS, roof: kind === 'hall' ? B.ROOF_SLATE : n < 0.75 ? B.ROOF_RED : B.ROOF_SLATE, flat: false,
    };
    default: return { corner: B.OAK_LOG, wall: n < 0.7 ? B.PLASTER : B.PLANKS, base: B.COBBLE, roof: n < 0.6 ? B.ROOF_RED : B.THATCH, flat: false };
  }
}

class Grid {
  readonly cells: Uint8Array;
  readonly w: number;
  readonly h = DOWN + UP;
  readonly ox: number; readonly oz: number; readonly oy: number;
  constructor(readonly L: Layout, readonly reach: number) {
    this.w = reach * 2 + 1;
    this.cells = new Uint8Array(this.w * this.h * this.w);
    this.ox = L.site.x - reach; this.oz = L.site.z - reach; this.oy = L.floorY - DOWN;
  }
  /** World coordinates (block) -> cell. */
  set(x: number, y: number, z: number, b: number): void {
    const lx = x - this.ox, lz = z - this.oz, ly = y - this.oy;
    if (lx < 0 || lz < 0 || lx >= this.w || lz >= this.w || ly < 0 || ly >= this.h) return;
    this.cells[(ly * this.w + lz) * this.w + lx] = b;
  }
  get(x: number, y: number, z: number): number {
    const lx = x - this.ox, lz = z - this.oz, ly = y - this.oy;
    if (lx < 0 || lz < 0 || lx >= this.w || lz >= this.w || ly < 0 || ly >= this.h) return C_KEEP;
    return this.cells[(ly * this.w + lz) * this.w + lx];
  }
  /** Level a pad: fill below y, surface at y (if given), clear above up to y+clear. */
  pad(x: number, z: number, y: number, top: number, clear: number): void {
    for (let yy = y - 6; yy < y; yy++) if (this.get(x, yy, z) === C_KEEP) this.set(x, yy, z, C_FILL);
    this.set(x, y, z, top);
    for (let yy = y + 1; yy <= y + clear; yy++) if (this.get(x, yy, z) === C_KEEP) this.set(x, yy, z, C_AIR);
  }
}

export function buildVillagePlan(t: Terrain, site: Site): VillagePlan {
  const L = villageLayout(t, site);
  const reach = L.radius + (L.city ? 28 : 10);
  const g = new Grid(L, reach);
  const texts: SignRecord[] = [];
  const seed = t.seed;
  const n = (x: number, y: number, z: number, k = 0) => hash01(x, y * 7 + 2400 + k, z, seed);
  const half = (b: number) => PARTIAL.get(b)?.[1] ?? b; // 4/8 slab

  const cx0 = site.x, cz0 = site.z, Y = L.floorY;
  // Streets: paved along their whole length inside the settlement (cobbles in
  // the city, packed earth in villages), following the ground.
  for (const st of L.streets) {
    const p = st.pts;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], ex = p[i + 2] - ax, ez = p[i + 3] - az;
      const l2 = ex * ex + ez * ez || 1;
      for (let z = Math.floor(Math.min(az, az + ez) - 2.5); z <= Math.ceil(Math.max(az, az + ez) + 2.5); z++) {
        for (let x = Math.floor(Math.min(ax, ax + ex) - 2.5); x <= Math.ceil(Math.max(ax, ax + ex) + 2.5); x++) {
          const tt = Math.max(0, Math.min(1, ((x + 0.5 - ax) * ex + (z + 0.5 - az) * ez) / l2));
          const d = Math.hypot(x + 0.5 - ax - ex * tt, z + 0.5 - az - ez * tt);
          const r = n(x, 6, z);
          if (d > 2.3 || (d > 1.5 && r < 0.4)) continue;
          if (Math.hypot(x - cx0, z - cz0) > L.radius + 4) continue;
          const y = Math.floor(t.sample(x + 0.5, z + 0.5).h);
          if (y < SEA || g.get(x, y + 1, z) !== C_KEEP) continue;
          const top = L.city ? (r < 0.5 ? B.COBBLE : r < 0.8 ? B.STONE_BRICKS : B.GRAVEL) : r < 0.75 ? B.PATH : B.GRAVEL;
          g.pad(x, z, y, top, 4);
        }
      }
    }
  }
  // Square.
  for (let z = -L.plazaR - 1; z <= L.plazaR + 1; z++) for (let x = -L.plazaR - 1; x <= L.plazaR + 1; x++) {
    const d = Math.hypot(x, z);
    if (d > L.plazaR + 0.5) continue;
    const r = n(cx0 + x, 0, cz0 + z);
    const top = L.city ? (r < 0.55 ? B.STONE_BRICKS : r < 0.85 ? B.COBBLE : B.MOSS_STONE) : r < 0.5 ? B.PATH : r < 0.85 ? B.COBBLE : B.GRAVEL;
    g.pad(cx0 + x, cz0 + z, Y, top, 8);
  }
  if (L.city) {
    // Fountain: ring basin, water, a pillar with a lantern.
    for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) {
      const e = Math.max(Math.abs(x), Math.abs(z));
      if (e === 3) g.set(cx0 + x, Y + 1, cz0 + z, B.STONE_BRICKS);
      else g.set(cx0 + x, Y + 1, cz0 + z, B.WATER);
    }
    for (let y = 1; y <= 4; y++) g.set(cx0, Y + y, cz0, B.STONE_BRICKS);
    g.set(cx0, Y + 5, cz0, B.LANTERN);
  } else {
    // Well: cobble ring, water, two posts and a little roof.
    for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) {
      if (x === 0 && z === 0) { for (let y = -2; y <= 0; y++) g.set(cx0, Y + y, cz0, B.WATER); continue; }
      g.set(cx0 + x, Y + 1, cz0 + z, B.COBBLE);
    }
    for (let y = 2; y <= 3; y++) { g.set(cx0 - 1, Y + y, cz0, B.OAK_LOG); g.set(cx0 + 1, Y + y, cz0, B.OAK_LOG); }
    for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) g.set(cx0 + x, Y + 4, cz0 + z, half(B.PLANKS));
  }

  // Stalls: four posts, an awning, a counter with goods.
  for (const st of L.stalls) {
    const rx = -st.fz, rz = st.fx; // right axis
    const cloth = n(st.x, 1, st.z) < 0.5 ? B.CLOTH_RED : B.CLOTH_YELLOW;
    for (const a of [-1, 0, 1]) for (const b of [-1, 0]) {
      const x = st.x + rx * a + st.fx * b, z = st.z + rz * a + st.fz * b;
      g.set(x, Y + 3, z, cloth);
      if (Math.abs(a) === 1) { g.set(x, Y + 1, z, B.OAK_LOG); g.set(x, Y + 2, z, B.OAK_LOG); }
    }
    g.set(st.x, Y + 1, st.z, n(st.x, 2, st.z) < 0.5 ? B.CRATE : B.HAY);
  }
  for (const b of L.benches) g.set(b.x, Y + 1, b.z, half(B.PLANKS));
  // Legends board posts (the board itself is a live mesh drawn on the main thread).
  if (L.board) {
    const b = L.board;
    for (const side of [-2, 2]) for (let y = 1; y <= 5; y++) g.set(b.x - b.fz * side, Y + y, b.z + b.fx * side, B.DARK_PLANKS);
  }
  // Banner poles with a two-block flag hanging off the side.
  L.banners.forEach((p, i) => {
    for (let y = 1; y <= 6; y++) g.set(p.x, Y + y, p.z, B.OAK_LOG);
    g.set(p.x, Y + 7, p.z, B.LANTERN);
    const cloth = i % 2 ? B.CLOTH_RED : B.CLOTH_YELLOW;
    for (const y of [5, 6]) g.set(p.x - p.fz, Y + y, p.z + p.fx, cloth);
  });
  // Flower beds: a 2x2 patch of grass with mixed flowers.
  const blooms = [B.FLOWER_RED, B.FLOWER_YELLOW, B.FLOWER_BLUE, B.FLOWER_WHITE];
  for (const f of L.flowers) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    g.set(f.x + dx, Y, f.z + dz, B.GRASS);
    g.set(f.x + dx, Y + 1, f.z + dz, blooms[Math.floor(n(f.x + dx, 13, f.z + dz) * 4)]);
  }

  // Watch towers: a stone shaft, a plank platform with merlons at the corners, a banner, a lantern.
  for (const tw of L.towers) {
    const top = tw.y + TOWER_H;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = tw.x + dx, z = tw.z + dz, corner = dx !== 0 && dz !== 0;
      g.pad(x, z, tw.y, B.COBBLE, TOWER_H + 4);
      for (let y = tw.y + 1; y < top; y++) g.set(x, y, z, corner ? B.STONE_BRICKS : (y - tw.y) % 3 === 0 ? B.STONE_BRICKS : B.COBBLE);
      g.set(x, top, z, corner ? B.STONE_BRICKS : B.PLANKS);
      if (corner) { g.set(x, top + 1, z, B.STONE_BRICKS); g.set(x, top + 2, z, half(B.COBBLE)); }
    }
    g.set(tw.x + tw.fx * 2, tw.y + TOWER_H - 2, tw.z + tw.fz * 2, B.CLOTH_RED);
    g.set(tw.x + tw.fx * 2, tw.y + TOWER_H - 3, tw.z + tw.fz * 2, B.CLOTH_RED);
    g.set(tw.x - tw.fx * 2, tw.y + TOWER_H - 1, tw.z - tw.fz * 2, B.LANTERN);
  }

  // Lamps.
  for (const l of L.lamps) {
    g.set(l.x, l.y + 1, l.z, B.OAK_LOG);
    g.set(l.x, l.y + 2, l.z, B.OAK_LOG);
    g.set(l.x, l.y + 3, l.z, B.LANTERN);
  }

  // Fields: farmland rows with a water channel, crops on top, a log border.
  for (const f of L.fields) {
    for (let z = -f.hd - 1; z <= f.hd + 1; z++) for (let x = -f.hw - 1; x <= f.hw + 1; x++) {
      const wx = f.cx + x, wz = f.cz + z;
      const border = Math.abs(x) === f.hw + 1 || Math.abs(z) === f.hd + 1;
      if (border) { g.pad(wx, wz, f.y, B.OAK_LOG, 4); continue; }
      if (z === 0) { g.pad(wx, wz, f.y, B.WATER, 4); continue; }
      g.pad(wx, wz, f.y, B.FARMLAND, 4);
      if (n(wx, 3, wz) < 0.92) g.set(wx, f.y + 1, wz, f.crop);
    }
    // A hay bale or two at the corner.
    g.set(f.cx + f.hw + 2, f.y + 1, f.cz - f.hd, B.HAY);
    if (n(f.cx, 4, f.cz) < 0.5) g.set(f.cx + f.hw + 2, f.y + 2, f.cz - f.hd, B.HAY);
  }

  // Houses.
  for (const h of L.houses) buildHouse(g, h, n, half, texts);

  // Door paths: from each door to its street, painted on the ground.
  for (const h of L.houses) {
    const steps = Math.ceil(Math.hypot(h.streetX - h.doorX, h.streetZ - h.doorZ));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(h.doorX + ((h.streetX - h.doorX) * i) / Math.max(1, steps));
      const z = Math.round(h.doorZ + ((h.streetZ - h.doorZ) * i) / Math.max(1, steps));
      if (g.get(x, h.y + 1, z) !== C_KEEP && g.get(x, h.y + 1, z) !== C_AIR) continue;
      const y = i < 2 ? h.y : Math.floor(t.sample(x, z).h);
      if (Math.abs(y - h.y) > 3 && i >= 2) continue;
      if (g.get(x, y, z) === C_KEEP || g.get(x, y, z) === C_SURFACE) g.pad(x, z, y, n(x, 5, z) < 0.8 ? B.PATH : B.GRAVEL, 3);
    }
  }

  // Name boards where the streets leave the settlement (real roads only).
  const nRoads = t.structures.roadsOf(site).length;
  L.streets.slice(0, nRoads).forEach((st) => {
    const at = Math.min(st.len - 2, L.radius - 2);
    const [x, z, dx, dz] = pointAlong(st.pts, at);
    const sx = Math.floor(x - dz * 3.2), sz = Math.floor(z + dx * 3.2);
    const y = t.sample(sx, sz).h;
    texts.push({ x: sx + 0.5, y: Math.floor(y) + 1, z: sz + 0.5, boards: [{ text: site.name, dx: dx, dz: dz }, { text: site.name, dx: -dx, dz: -dz }] });
  });

  return {
    ox: g.ox, oy: g.oy, oz: g.oz, w: g.w, h: g.h, d: g.w, cells: g.cells,
    half: L.plazaR, cx: site.x, cz: site.z, floorY: Y, texts, surface: surfaceFor(t.sample(site.x, site.z).biome), clearMask: true,
  };
}

function buildHouse(g: Grid, h: House, n: (x: number, y: number, z: number, k?: number) => number, half: (b: number) => number, texts: SignRecord[]): void {
  const m = materials(h.style, h.kind, n(h.cx, 9, h.cz));
  const rx = -h.fz, rz = h.fx; // right axis in world
  const W = (lx: number, lz: number): [number, number] => [h.cx + lx * rx + lz * h.fx, h.cz + lx * rz + lz * h.fz];
  const Y = h.y, top = Y + h.wallH;
  // Pad: footprint + 2, cleared high enough for the roof.
  for (let lz = -h.hd - 2; lz <= h.hd + 2; lz++) for (let lx = -h.hw - 2; lx <= h.hw + 2; lx++) {
    const [x, z] = W(lx, lz);
    const inside = Math.abs(lx) <= h.hw && Math.abs(lz) <= h.hd;
    g.pad(x, z, Y, inside ? m.base : C_SURFACE, h.wallH + 8);
  }
  // Walls.
  for (let lz = -h.hd; lz <= h.hd; lz++) for (let lx = -h.hw; lx <= h.hw; lx++) {
    const edgeX = Math.abs(lx) === h.hw, edgeZ = Math.abs(lz) === h.hd;
    if (!edgeX && !edgeZ) continue;
    const [x, z] = W(lx, lz);
    for (let y = Y + 1; y <= top; y++) {
      const level = y - Y;
      let b = edgeX && edgeZ ? m.corner : level === 1 ? m.base : m.wall;
      // Floor beam between storeys on tall houses.
      if (!(edgeX && edgeZ) && h.wallH >= 6 && level === 4) b = m.corner === B.STONE_BRICKS ? B.DARK_PLANKS : m.corner;
      const winRow = level === 2 || (h.wallH >= 6 && level === 5);
      const along = edgeZ ? lx : lz, span = edgeZ ? h.hw : h.hd;
      if (winRow && !(edgeX && edgeZ) && Math.abs(along) < span && (along + span) % 2 === 1) b = B.WINDOW_WOOD;
      g.set(x, y, z, b);
    }
  }
  // Door (front wall, centre) and a doorstep.
  const [dx, dz] = W(0, h.hd);
  g.set(dx, Y + 1, dz, B.DOOR_LOW);
  g.set(dx, Y + 2, dz, B.DOOR_TOP);
  if (h.kind === 'hall' || h.kind === 'inn') {
    const [ex, ez] = W(1, h.hd); const [fx, fz] = W(-1, h.hd);
    g.set(ex, Y + 1, ez, B.DOOR_LOW); g.set(ex, Y + 2, ez, B.DOOR_TOP);
    g.set(fx, Y + 1, fz, B.DOOR_LOW); g.set(fx, Y + 2, fz, B.DOOR_TOP);
  }

  // Roof.
  if (m.flat) {
    for (let lz = -h.hd; lz <= h.hd; lz++) for (let lx = -h.hw; lx <= h.hw; lx++) {
      const [x, z] = W(lx, lz);
      g.set(x, top + 1, z, m.roof);
      const rim = Math.abs(lx) === h.hw || Math.abs(lz) === h.hd;
      if (rim && (lx + lz) % 2 === 0) g.set(x, top + 2, z, m.roof);
    }
  } else {
    const pitch = h.kind === 'hall' ? 1 : 0.85;
    for (let lz = -h.hd - 1; lz <= h.hd + 1; lz++) {
      const T = top + 0.5 + Math.round((h.hd + 1 - Math.abs(lz)) * pitch * 2) / 2; // roof surface height
      const full = Math.floor(T);
      for (let lx = -h.hw - 1; lx <= h.hw + 1; lx++) {
        const [x, z] = W(lx, lz);
        const inside = Math.abs(lx) <= h.hw && Math.abs(lz) <= h.hd;
        // Gable triangles in wall material; the interior under the roof stays solid (never seen).
        if (inside) for (let y = top + 1; y < full; y++) g.set(x, y, z, m.wall);
        if (T - full >= 0.5) {
          g.set(x, full, z, half(m.roof));
          if (full - 1 > top) g.set(x, full - 1, z, m.roof);
        } else g.set(x, full - 1, z, m.roof);
      }
    }
    // Chimney on homes.
    if ((h.kind === 'home' || h.kind === 'bakery' || h.kind === 'smithy') && n(h.cx, 10, h.cz) < 0.7) {
      const [x, z] = W(h.hw - 1, -h.hd + 1);
      const ridge = top + 1 + Math.ceil((h.hd + 1) * pitch);
      for (let y = top + 1; y <= ridge + 1; y++) g.set(x, y, z, B.COBBLE);
    }
    // Bell tower on the hall.
    if (h.kind === 'hall') {
      const ridge = top + 1 + Math.ceil(h.hd + 1);
      for (let y = top + 1; y <= ridge + 5; y++) for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
        const [x, z] = W(a, b);
        const shell = a !== 0 || b !== 0;
        const open = y >= ridge + 2 && y <= ridge + 3 && (a === 0 || b === 0);
        g.set(x, y, z, shell ? (open ? C_AIR : B.STONE_BRICKS) : y === ridge + 3 ? B.GOLD : C_AIR);
      }
      for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) { const [x, z] = W(a, b); g.set(x, ridge + 6, z, half(B.ROOF_SLATE)); }
    }
  }

  // Shop fronts: awning, goods, and a plaque with the trade.
  const front = (lx: number, lz: number, y: number, b: number) => { const [x, z] = W(lx, lz); g.set(x, y, z, b); };
  if (h.kind === 'shop' || h.kind === 'bakery' || h.kind === 'smithy' || h.kind === 'inn') {
    const cloth = n(h.cx, 11, h.cz) < 0.5 ? B.CLOTH_RED : B.CLOTH_YELLOW;
    for (let lx = -h.hw; lx <= h.hw; lx++) if (lx !== 0 || h.kind !== 'inn') front(lx, h.hd + 1, Y + 3, cloth);
    if (h.kind !== 'inn') { front(-2, h.hd + 1, Y + 1, B.CRATE); front(2, h.hd + 1, Y + 1, n(h.cx, 12, h.cz) < 0.5 ? B.HAY : B.CRATE); }
    if (h.kind === 'smithy') { front(h.hw + 1, 0, Y + 1, B.COBBLE); front(h.hw + 1, 1, Y + 1, B.MAGMA); front(h.hw + 1, -1, Y + 1, B.STEEL); }
  }
  if (h.name) {
    const [px, pz] = W(0, h.hd);
    texts.push({ x: px + 0.5 + h.fx * 0.56, y: Y + (h.wallH >= 6 ? 4.6 : 3.4), z: pz + 0.5 + h.fz * 0.56, boards: [{ text: h.name, dx: h.fx, dz: h.fz }], style: 'plaque' });
  }
}
