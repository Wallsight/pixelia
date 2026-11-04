// Dev tool: runs the war director (and the night director's combat) headless
// against a mock world for the nearest held castle: a day of drill, the night
// shift change, then a few zombies at the gate. Prints the garrison state and
// everything said. Usage: node tools/run.mjs tools/war-sim.ts [seed]
import * as THREE from 'three';
import { Terrain } from '../src/world/terrain';
import { SITE_CASTLE } from '../src/world/structures';
import { buildCastle, castleLayout, castleWorld, C_AIR, C_FILL, C_KEEP } from '../src/world/castle';
import { gateSide } from '../src/world/stamp';
import { NightDirector, type FighterKind, type NightHost, type NightSound } from '../src/creatures/night';
import { WarDirector, type WarHost } from '../src/creatures/war';
import type { Creature } from '../src/creatures/creatures';
import { FireFx } from '../src/render/fire';

// Sim-time timers (the directors use setTimeout for delayed lines and orders).
let now = 0;
const timers: Array<{ at: number; fn: () => void }> = [];
(globalThis as unknown as { setTimeout: unknown }).setTimeout = (fn: () => void, ms: number) => { timers.push({ at: now + ms / 1000, fn }); return 0; };

const seed = Number(process.argv[2] ?? 20261102) >>> 0;
const t = new Terrain(seed);
const site = t.structures.sitesNear(-1500, -1500, 1500, 1500, 0).filter((s) => s.kind === SITE_CASTLE && s.held)
  .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
const gate = gateSide(t, site);
const L = castleLayout(site, seed, gate);
const P = buildCastle(site, seed, gate);
console.log(`${site.name} (${L.house!.name}) at ${site.x},${site.z}`);

/** Top of the plan's solid cells under a point (wall walks, floor), else terrain. */
const topAt = (x: number, z: number, below = 999): number => {
  const lx = Math.floor(x) - P.ox, lz = Math.floor(z) - P.oz;
  if (lx >= 0 && lz >= 0 && lx < P.w && lz < P.d) {
    for (let ly = P.h - 1; ly >= 0; ly--) {
      const v = P.cells[(ly * P.d + lz) * P.w + lx];
      if (v === C_KEEP || v === C_AIR || v === C_FILL) continue;
      if (P.oy + ly + 1 > below + 1.1) continue;
      return P.oy + ly + 1;
    }
  }
  return Math.floor(t.sample(x, z).h) + 1;
};

const lists = new Map<string, Creature[]>();
const said: string[] = [];
let seq = 0;
const fire = new FireFx();
const make = (kind: string, x: number, y: number, z: number): Creature => ({
  sp: 0, x, y, z, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, scale: 1, tint: new THREE.Color(), state: 0, timer: 0,
  tx: x, ty: y, tz: z, walk: 0, walkAmp: 0, flap: 0, flapAmp: 0, head: 0, tail: 0, glow: 0, bob: 0, seed: ++seq * 13.7,
  flock: null, col: 0, ground: y, dying: 0, gone: false, prey: null, intent: 0, aux: 0, held: false,
  tint2: new THREE.Color(), tint3: new THREE.Color(), skin: 0, name: kind,
} as unknown as Creature);

const host: NightHost & WarHost = {
  spawnFighter(kind: FighterKind, x: number, z: number) {
    const l = lists.get(kind) ?? []; lists.set(kind, l);
    const c = make(kind, x, z, 0);
    c.x = x; c.z = z; c.y = topAt(x, z);
    l.push(c);
    return c;
  },
  walkToward(c, tx, tz, speed, dt) {
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    if (d < 0.45) return 'arrived';
    const step = Math.min(d, speed * dt);
    const nx = c.x + (dx / d) * step, nz = c.z + (dz / d) * step;
    const ny = topAt(nx, nz, c.y);
    if (Math.abs(ny - c.y) > 1.05 && ny > c.y) return 'blocked';
    if (c.y - ny > 3) return 'blocked';
    c.x = nx; c.z = nz; c.y = ny; c.yaw = Math.atan2(dx, dz);
    return 'moving';
  },
  idle() {},
  columnAt: (x, z) => [topAt(x, z) - 1, false, false],
  live: (k) => lists.get(k) ?? [],
  scatter() {},
  nearestAnimal: () => null,
  say: (c, text) => { said.push(`${now.toFixed(1).padStart(6)}s ${(c as unknown as { name: string }).name.padEnd(8)} ${text}`); },
  sound: (_ev: NightSound) => {},
  alarm() {},
  fire,
};

const night = new NightDirector(t, host);
const war = new WarDirector(t, host, night);
const [gx, gz] = castleWorld(L, L.half + 3, 0);
let px = gx, pz = gz, nightV = 0;

const tick = (dt: number) => {
  now += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= now) { const f = timers[i].fn; timers.splice(i, 1); f(); }
  (night as unknown as { night: number }).night = nightV;
  war.update(dt, px, pz, nightV);
  for (const [, list] of lists) {
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      const alive = c.dying > 0 ? night.stepDying(c, dt) : c.fighter?.garrison ? war.step(c, dt) : night.step(c, dt);
      if (!alive) { c.gone = true; list.splice(i, 1); }
    }
  }
  // The night director's own update (shots); keep its spawner quiet with a far-away player.
  (night as unknown as { updateShots(dt: number): void }).updateShots(dt);
};
const count = () => [...lists].map(([k, l]) => `${k}=${l.length}`).join(' ');
const run = (sec: number, label: string) => {
  for (let s = 0; s < sec; s += 0.05) tick(0.05);
  console.log(`[${label}] t=${now.toFixed(0)}s ${count()}\n  ${war.info()}`);
};

run(2, 'arrive');
run(40, 'day');
run(60, 'day');
const drillSaid = said.filter((l) => l.includes('captain')).length;
nightV = 0.9;
run(40, 'dusk -> night');
run(30, 'night');
// Zombies at the gate.
for (let i = 0; i < 4; i++) { const [x, z] = castleWorld(L, L.half + 10, i * 1.5 - 2); night.spawn('zombie', x, z); }
run(10, 'attack 10s');
run(30, 'attack 40s');
nightV = 0;
run(60, 'dawn');
console.log(`\nlines said: ${said.length} (captain: ${drillSaid} in the day)`);
console.log(said.slice(0, 60).join('\n'));
console.log('...');
console.log(said.slice(-25).join('\n'));
