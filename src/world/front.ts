// The front: the orc capital and the nearest garrisoned castle are at war. On
// open ground between them each side keeps a field camp (the castle's house
// under its banners behind a line of stakes; the orcs among hide huts behind
// spiked logs, with a war drum), and the scarred field between the two is where
// they fight (creatures/front.ts). Laid out once per world from the seed.

import { hash01 } from '../engine/noise';
import { B, PARTIAL, SEA } from './blocks';
import { C_AIR, castleHouse, type CastleHouse } from './castle';
import { Grid, buildHut, surfaceFor, type OrcPlan } from './orcs';
import { LANDMARK_REACH } from './landmarks';
import { LM, SITE_CASTLE, SITE_CROSSROAD, type Site } from './structures';
import type { Terrain } from './terrain';

export interface FrontCamp {
  /** Centre, on the levelled ground (feet at y + 1). */
  x: number; z: number; y: number;
  /** Where the fighters gather to march out (towards the field). */
  gx: number; gz: number;
  /** Fire, tents (or huts) and banners, for the director. */
  fire: [number, number];
}

export interface FrontLayout {
  name: string;
  capital: Site;
  castle: Site;
  house: CastleHouse;
  /** Centre of the field. */
  x: number; z: number;
  /** Direction from the castle's camp towards the orcs' (x = cos, z = sin). */
  A: number;
  human: FrontCamp;
  orc: FrontCamp;
}

/** Camp radius (levelled ground) and how far its plan reaches. */
const CAMP_R = 11, CAMP_REACH = 23;
/** Each camp stands this far from the middle of the field. */
const CAMP_OFF = 46;
const FIELD_NAMES = ['Kızıl Ova', 'Kırık Mızrak Ovası', 'Kül Ovası', 'Yitik Ova', 'Kanlı Dere Ovası', 'Sessiz Ova'];

const cache = new Map<number, FrontLayout | null>();

/** The world's one front, or null when there is no capital or no garrisoned castle within reach of it. */
export function frontLayout(t: Terrain): FrontLayout | null {
  if (cache.has(t.seed)) return cache.get(t.seed)!;
  const L = build(t);
  cache.set(t.seed, L);
  return L;
}

function build(t: Terrain): FrontLayout | null {
  const st = t.structures;
  const cc = st.capital();
  const capital = cc && st.site(cc[0], cc[1]);
  if (!capital) return null;
  const castles = st.sitesNear(capital.x - 800, capital.z - 800, capital.x + 800, capital.z + 800, 0)
    .filter((s) => s.kind === SITE_CASTLE && s.held && Math.hypot(s.x - capital.x, s.z - capital.z) > 220)
    .sort((a, b) => Math.hypot(a.x - capital.x, a.z - capital.z) - Math.hypot(b.x - capital.x, b.z - capital.z))
    .slice(0, 3);
  // The flattest dry stretch between a castle and the capital, clear of everyone else's ground
  // (the nearest castle wins unless its ground is much worse).
  let castle: Site | null = null, best: [number, number] | null = null, bestScore = Infinity;
  for (const [ci, cs] of castles.entries()) {
    const dist = Math.hypot(cs.x - capital.x, cs.z - capital.z);
    const others = st.sitesNear(Math.min(cs.x, capital.x) - 200, Math.min(cs.z, capital.z) - 200, Math.max(cs.x, capital.x) + 200, Math.max(cs.z, capital.z) + 200, 0)
      .filter((s) => s !== cs && s !== capital && s.kind !== SITE_CROSSROAD);
    const ca0 = (capital.x - cs.x) / dist, sa0 = (capital.z - cs.z) / dist;
    for (let f = 0.3; f <= 0.71; f += 0.05) for (let side = -150; side <= 150; side += 25) {
      const x = cs.x + (capital.x - cs.x) * f - sa0 * side, z = cs.z + (capital.z - cs.z) * f + ca0 * side;
      if (Math.hypot(x - cs.x, z - cs.z) < CAMP_OFF + 70 || Math.hypot(x - capital.x, z - capital.z) < CAMP_OFF + 80) continue;
      if (others.some((s) => Math.hypot(s.x - x, s.z - z) < CAMP_OFF + 40)) continue;
      // Nor on a landmark: the field and both camps keep clear of their grounds.
      const spots = [[x, z, 32], [x + ca0 * CAMP_OFF, z + sa0 * CAMP_OFF, CAMP_REACH], [x - ca0 * CAMP_OFF, z - sa0 * CAMP_OFF, CAMP_REACH]];
      if (t.landmarks.near(x - 120, z - 120, x + 120, z + 120, 0).some((m) => spots.some(([sx, sz, r]) => Math.hypot(m.x - sx, m.z - sz) < r + (m.kind === LM.DRAGON_LAIR ? LANDMARK_REACH : 22)))) continue;
      const s0 = t.sample(x, z);
      let score = Math.abs(side) * 0.15 + ci * 60;
      for (const r of [0, 15, 30, CAMP_OFF]) for (let k = 0; k < (r ? 8 : 1); k++) {
        const a = (k / 8) * Math.PI * 2;
        const g = t.sample(x + Math.cos(a) * r, z + Math.sin(a) * r);
        if (g.h < SEA + 1.5 || g.river > 0.05 || g.isle > 0 || g.lavaY > 0) score += 50;
        score += Math.abs(g.h - s0.h) * (r === CAMP_OFF ? 0.5 : 1) + g.crag * 10 + g.mount * 20;
      }
      // The march from each camp's muster point to the field must be walkable: no steep steps on the way.
      let prev = NaN;
      for (let d = -(CAMP_OFF + CAMP_R + 4); d <= CAMP_OFF + CAMP_R + 4; d += 4) for (const w of [-6, 0, 6]) {
        const g = t.sample(x + ca0 * d - sa0 * w, z + sa0 * d + ca0 * w);
        if (w === 0) { if (prev === prev) score += Math.max(0, Math.abs(g.h - prev) - 1.2) * 5; prev = g.h; }
        else score += Math.max(0, Math.abs(g.h - t.sample(x + ca0 * d, z + sa0 * d).h) - 2) * 1.5;
      }
      if (score < bestScore) { bestScore = score; best = [x, z]; castle = cs; }
    }
  }
  if (!best || !castle || bestScore > 260) return null;
  const A = Math.atan2(capital.z - castle.z, capital.x - castle.x);
  const ca = Math.cos(A), sa = Math.sin(A);
  const [x, z] = [Math.round(best[0]), Math.round(best[1])];
  const camp = (dir: number): FrontCamp => {
    const cx = Math.round(x + ca * CAMP_OFF * dir), cz = Math.round(z + sa * CAMP_OFF * dir);
    const y = Math.floor(t.sample(cx + 0.5, cz + 0.5).h);
    // Fire a little ahead of the middle (the tents and huts stand behind it), muster point outside the line.
    return {
      x: cx, z: cz, y,
      gx: cx - ca * dir * (CAMP_R + 3), gz: cz - sa * dir * (CAMP_R + 3),
      fire: [Math.round(cx - ca * dir * 2), Math.round(cz - sa * dir * 2)],
    };
  };
  const name = FIELD_NAMES[Math.floor(hash01(capital.gx, 4100, castle.gz, t.seed) * FIELD_NAMES.length)];
  return { name, capital, castle, house: castleHouse(castle, t.seed), x, z, A, human: camp(-1), orc: camp(1) };
}

// ------------------------------------------------------------------ voxels

const planCache = new Map<number, OrcPlan[]>();

/** The camps and the scarred field, as plans stamped like villages. */
export function frontPlans(t: Terrain): OrcPlan[] {
  const hit = planCache.get(t.seed);
  if (hit) return hit;
  const L = frontLayout(t);
  const plans = L ? [campPlan(t, L, L.human, true), campPlan(t, L, L.orc, false), fieldPlan(t, L)] : [];
  planCache.set(t.seed, plans);
  return plans;
}

function campPlan(t: Terrain, L: FrontLayout, C: FrontCamp, human: boolean): OrcPlan {
  const { x: cx, z: cz, y: Y } = C;
  const g = new Grid(cx, cz, Y, CAMP_REACH);
  const n = (x: number, y: number, z: number, k = 0) => hash01(x, y * 7 + 4200 + k, z, t.seed);
  const half = (b: number) => PARTIAL.get(b)?.[1] ?? b;
  const surface = surfaceFor(t.sample(cx, cz).biome);
  // Towards the enemy: +1 along A for the castle's camp, -1 for the orcs'.
  const dir = human ? 1 : -1;
  const fx = Math.cos(L.A) * dir, fz = Math.sin(L.A) * dir;
  /** Camp-local: f towards the enemy, s to the side. */
  const W = (f: number, s: number): [number, number] => [Math.round(cx + fx * f - fz * s), Math.round(cz + fz * f + fx * s)];

  // --- ground: level inside, blended into the land around
  for (let z = cz - CAMP_REACH; z <= cz + CAMP_REACH; z++) for (let x = cx - CAMP_REACH; x <= cx + CAMP_REACH; x++) {
    const r = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (r > CAMP_REACH) continue;
    if (r <= CAMP_R + 1) {
      const k = n(x, 1, z);
      g.pad(x, z, Y, k < 0.55 ? surface : k < 0.85 ? B.PATH : B.GRAVEL, 20);
      continue;
    }
    // A ramp in quarter steps out to the land (columns follow the sample at their corner, as the terrain does).
    const hf = t.sample(x, z).h;
    if (hf < SEA) continue;
    const s = Math.min(1, (r - CAMP_R - 1) / (CAMP_REACH - CAMP_R - 1));
    const v = Y + (hf - Y) * s * s * (3 - 2 * s);
    const y = Math.floor(v), q = Math.round((v - y) * 4);
    g.pad(x, z, y, surface, Math.max(4, Math.floor(hf) - y + 3));
    if (q > 0) g.set(x, y + 1, z, q >= 4 ? surface : PARTIAL.get(surface)?.[q - 1] ?? C_AIR);
  }

  // --- the line facing the enemy: stakes (castle) or spiked logs (orcs), gaps to march out through
  for (let k = -9; k <= 9; k++) {
    if (Math.abs(k) === 2 || Math.abs(k) === 7) continue;
    const a = (k / 9) * 1.25;
    const [x, z] = [Math.round(cx + (fx * Math.cos(a) - fz * Math.sin(a)) * (CAMP_R - 0.5)), Math.round(cz + (fz * Math.cos(a) + fx * Math.sin(a)) * (CAMP_R - 0.5))];
    if (human) {
      g.set(x, Y + 1, z, B.OAK_LOG);
      g.set(x, Y + 2, z, k % 3 === 0 ? B.OAK_LOG : half(B.PLANKS));
    } else {
      g.set(x, Y + 1, z, B.CHARRED_LOG);
      g.set(x, Y + 2, z, B.SPRUCE_LOG);
      if (k % 4 === 0) g.set(x, Y + 3, z, B.SKULL);
    }
  }

  // --- fire
  const [ox, oz] = C.fire;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const d = Math.hypot(dx, dz);
    if (d <= 0.5) { g.set(ox, Y, oz, B.MAGMA); g.set(ox, Y + 1, oz, B.CHARRED_LOG); }
    else if (d <= 1.8) g.set(ox + dx, Y + 1, oz + dz, half(B.COBBLE));
  }

  if (human) {
    // Ridge tents in two rows behind the fire, the house banner along each ridge.
    for (const [f, s] of [[-4, -7], [-4, 0], [-4, 7], [-10, -3.5], [-10, 3.5]] as const) {
      const [tx, tz] = W(f, s);
      // An A-frame: canvas sloping in to a ridge in the house colour, open at the front end.
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        // a along the ridge (sideways), b across it.
        const x = Math.round(tx - fz * a + fx * b), z = Math.round(tz + fx * a + fz * b);
        const end = Math.abs(a) === 2, door = a === 2 && Math.abs(b) < 2;
        for (let k = 0; k < 3; k++) {
          const side = Math.abs(b) === 2 - k;
          const inside = Math.abs(b) < 2 - k;
          const ridge = a === 0 ? L.house.banner : end ? B.OAK_LOG : B.CLOTH_YELLOW;
          const v = k === 2 ? (b === 0 ? ridge : C_AIR) : side ? B.CLOTH_YELLOW : inside ? (end && !door ? B.CLOTH_YELLOW : C_AIR) : C_AIR;
          if (Math.abs(b) <= 2 - k || k === 2) g.set(x, Y + 1 + k, z, v);
        }
      }
      const [px, pz] = W(f, s);
      g.set(px, Y + 1, pz, n(px, 2, pz) < 0.5 ? B.HAY : B.CRATE);
    }
    // The house banner on two tall poles at the front corners, a wooden lookout behind.
    for (const s of [-8, 8]) {
      const [bx, bz] = W(4, s);
      for (let y = Y + 1; y <= Y + 7; y++) g.set(bx, y, bz, B.OAK_LOG);
      const [ax, az] = [Math.round(bx - fz * Math.sign(s)), Math.round(bz + fx * Math.sign(s))];
      for (let y = Y + 4; y <= Y + 6; y++) g.set(ax, y, az, L.house.banner);
    }
    const [lx, lz] = W(-3, 10);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const corner = a !== 0 && b !== 0;
      for (let y = Y + 1; y <= Y + 5; y++) g.set(lx + a, y, lz + b, corner ? B.OAK_LOG : C_AIR);
      g.set(lx + a, Y + 6, lz + b, B.PLANKS);
      if (corner) g.set(lx + a, Y + 7, lz + b, half(B.PLANKS));
    }
    g.set(lx, Y + 7, lz, L.house.banner);
  } else {
    // Hide huts at the back, a war drum and two banner totems by the line.
    for (const [f, s, r] of [[-6, -5, 2.6], [-6, 5, 2.6], [-1, -8, 2.2], [-1, 8, 2.2]] as const) {
      const [hx, hz] = W(f, s);
      buildHut(g, { x: hx, z: hz, r, yaw: Math.atan2(cx - hx, cz - hz), big: false }, Y, n);
    }
    const [dx, dz] = W(5, 0);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      g.set(dx + a, Y + 1, dz + b, B.SPRUCE_LOG);
      g.set(dx + a, Y + 2, dz + b, B.HIDE);
    }
    for (const s of [-6, 6]) {
      const [bx, bz] = W(6, s);
      for (let y = Y + 1; y <= Y + 6; y++) g.set(bx, y, bz, B.SPRUCE_LOG);
      g.set(bx, Y + 7, bz, B.SKULL);
      for (const side of [-1, 1]) g.set(Math.round(bx - fz * side), Y + 5, Math.round(bz + fx * side), B.WAR_BANNER);
    }
    for (let k = 0; k < 8; k++) {
      const [x, z] = W(-3 + n(k, 3, 0) * 8, -8 + n(k, 4, 0) * 16);
      if (g.get(x, Y + 1, z) === C_AIR) g.set(x, Y + 1, z, n(k, 5, 0) < 0.5 ? B.BONE : B.CRATE);
    }
  }
  return {
    ox: g.ox, oy: g.oy, oz: g.oz, w: g.w, h: g.h, d: g.w, cells: g.cells,
    half: CAMP_R, cx, cz, floorY: Y, texts: [], surface, clearMask: true,
  };
}

/** The ground fought over: scorched patches and broken spears left standing in the earth. */
function fieldPlan(t: Terrain, L: FrontLayout): OrcPlan {
  const R = 30, LANE = CAMP_OFF - CAMP_REACH + 3;
  const Y = Math.floor(t.sample(L.x + 0.5, L.z + 0.5).h);
  const g = new Grid(L.x, L.z, Y, LANE);
  const n = (x: number, y: number, z: number, k = 0) => hash01(x, y * 7 + 4300 + k, z, t.seed);
  // No trees on the field or the way out to it from either camp (a cell of air above the ground masks them).
  const ca = Math.cos(L.A), sa = Math.sin(L.A);
  for (let z = L.z - LANE; z <= L.z + LANE; z++) for (let x = L.x - LANE; x <= L.x + LANE; x++) {
    const dx = x + 0.5 - L.x, dz = z + 0.5 - L.z;
    const across = -dx * sa + dz * ca;
    if (Math.hypot(dx, dz) > R + 2 && Math.abs(across) > 16) continue;
    g.set(x, Math.floor(t.sample(x, z).h) + 3, z, C_AIR);
  }
  for (let k = 0; k < 26; k++) {
    const a = n(k, 1, 0) * Math.PI * 2, d = n(k, 2, 0) * (R - 3);
    const px = Math.round(L.x + Math.cos(a) * d * 1.1), pz = Math.round(L.z + Math.sin(a) * d * 0.8);
    const r = 1 + n(k, 3, 0) * 1.8;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.hypot(dx, dz) > r) continue;
      const x = px + dx, z = pz + dz;
      // Columns are generated from the sample at the block corner; keep their quarter-step top so the scar adds no pit.
      const s = t.sample(x, z);
      if (s.h < SEA + 1 || s.river > 0.05) continue;
      const h = Math.floor(s.h), q = Math.round((s.h - h) * 4);
      const top = n(x, 4, z) < 0.5 ? B.ASH : n(x, 4, z) < 0.8 ? B.DIRT : B.GRAVEL;
      g.set(x, h, z, top);
      g.set(x, h + 1, z, q <= 0 ? C_AIR : q >= 4 ? top : PARTIAL.get(top)![q - 1]);
    }
    // Now and then a spear (or a snapped banner pole) still stuck in the ground.
    if (n(k, 5, 0) < 0.45) {
      const s = t.sample(px, pz);
      if (s.h >= SEA + 1 && s.river <= 0.05) {
        const h = Math.floor(s.h);
        g.set(px, h + 1, pz, n(k, 6, 0) < 0.5 ? B.SPRUCE_LOG : B.OAK_LOG);
        if (n(k, 7, 0) < 0.35) g.set(px, h + 2, pz, n(k, 8, 0) < 0.5 ? B.WAR_BANNER : L.house.banner);
        else if (n(k, 7, 0) < 0.55) g.set(px, h + 2, pz, B.SKULL);
      }
    }
  }
  return {
    ox: g.ox, oy: g.oy, oz: g.oz, w: g.w, h: g.h, d: g.w, cells: g.cells,
    half: 0, cx: L.x, cz: L.z, floorY: Y, texts: [], clearMask: true,
  };
}

/** How far the front's plans reach from their centres (for the stamp filter). */
export const FRONT_REACH = CAMP_REACH + 2;
