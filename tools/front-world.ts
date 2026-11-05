// Dev tool: fights the dawn battle at the front over and over with the real
// creature system on real generated chunks, headless, and prints how each one
// went: winner, length, who was left standing and who got stuck and dropped.
// Usage: node tools/run.mjs tools/front-world.ts [seed] [battles]
import * as THREE from 'three';
import { Terrain } from '../src/world/terrain';
import { extractInner } from '../src/world/mesher';
import { CHUNK, HEIGHT, B } from '../src/world/blocks';
import { frontLayout } from '../src/world/front';
import { Creatures } from '../src/creatures/creatures';
import type { Creature } from '../src/creatures/creatures';
import { createEnvUniforms } from '../src/render/materials';

// Minimal browser stand-ins: bubbles draw text on a canvas, fire reads the viewport.
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}) });
(globalThis as unknown as Record<string, unknown>).window = { innerHeight: 720, devicePixelRatio: 1 };
(globalThis as unknown as Record<string, unknown>).document = { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0 }) };
let now = 0;
const timers: Array<{ at: number; fn: () => void }> = [];
(globalThis as unknown as { setTimeout: unknown }).setTimeout = (fn: () => void, ms: number) => { timers.push({ at: now + ms / 1000, fn }); return 0; };

const seed = Number(process.argv[2] ?? 20261102) >>> 0;
const battles = Number(process.argv[3] ?? 6);
const t = new Terrain(seed);
const L = frontLayout(t);
if (!L) { console.log('no front for this seed'); process.exit(0); }
console.log(`${L.name} at ${L.x},${L.z}: ${L.house.name} v ${L.capital.name}`);

// Real chunks over the field and both camps.
const chunks = new Map<string, Uint8Array>();
const R = 110;
const t0 = Date.now();
for (let cz = Math.floor((L.z - R) / CHUNK); cz <= Math.floor((L.z + R) / CHUNK); cz++)
  for (let cx = Math.floor((L.x - R) / CHUNK); cx <= Math.floor((L.x + R) / CHUNK); cx++)
    chunks.set(`${cx},${cz}`, extractInner(t.generateRegion(cx, cz).blocks));
console.log(`generated ${chunks.size} chunks in ${Date.now() - t0} ms`);
const world = {
  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = chunks.get(`${cx},${cz}`);
    if (!c) return -1;
    return c[(y * CHUNK + (z - cz * CHUNK)) * CHUNK + (x - cx * CHUNK)];
  },
};

const env = createEnvUniforms(new THREE.DataArrayTexture(new Uint8Array(4), 1, 1, 1));
const creatures = new Creatures(env, false, world as never, t);
creatures.npcs.bubbles.say = () => {};
const front = creatures.front as unknown as {
  battle: { phase: string; t: number; winner: number | null };
  skirmishT: number;
  side: Record<0 | 1, Creature[]>;
  info(): string;
  dev(what: string): string;
};
const cam = new THREE.Vector3();
// The player watches from the side of the field.
const px = L.x + Math.cos(L.A) * 30, pz = L.z + Math.sin(L.A) * 30;
const tick = (dt: number) => {
  now += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= now) { const f = timers[i].fn; timers.splice(i, 1); f(); }
  cam.set(px, 80, pz);
  front.skirmishT = 999; // battles only
  creatures.update(dt, px, pz, 0, cam);
};
const run = (sec: number, until?: () => boolean) => { for (let s = 0; s < sec; s += 1 / 30) { tick(1 / 30); if (until?.()) return; } };

run(10); // camps man up
const line = (s: 0 | 1) => front.side[s].filter((c) => c.fighter!.front!.role === 'battle');
const wins = [0, 0];
for (let n = 0; n < battles; n++) {
  front.dev('battle');
  const start = now;
  const raised = [line(0).length, line(1).length];
  const phases: string[] = [];
  let phase = '';
  // Fighters that vanish while still on their feet were dropped as stuck.
  const seen = new Map<Creature, 0 | 1>();
  let dropped = [0, 0];
  run(300, () => {
    if (front.battle.phase !== phase) { phase = front.battle.phase; phases.push(`${phase}@${Math.round(now - start)}`); }
    for (const s of [0, 1] as const) for (const c of line(s)) seen.set(c, s);
    for (const [c, s] of seen) if (c.gone) {
      if (c.dying === 0 && c.fighter!.down <= 0) {
        dropped[s]++;
        if (process.env.WHY) {
          const o = c.fighter!.front!, foe = c.fighter!.foe;
          const col = (x: number, z: number) => { const y = Math.floor(c.y); return [-1, 0, 1, 2].map((dy) => world.getBlock(Math.floor(x), y + dy, Math.floor(z))).join('/'); };
          const ax = c.x + Math.sin(c.yaw) * 0.45, az = c.z + Math.cos(c.yaw) * 0.45;
          console.log(`   drop ${c.fighter!.kind} @${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)} back=${o.back} to ${foe ? `foe ${foe.x.toFixed(1)},${foe.z.toFixed(1)}` : `spot ${o.tx.toFixed(1)},${o.tz.toFixed(1)}`} here ${col(c.x, c.z)} ahead ${col(ax, az)} h=${Math.floor(t.sample(c.x, c.z).h)}`);
        }
      }
      seen.delete(c);
    }
    return phase === 'won';
  });
  const up = (s: 0 | 1) => line(s).filter((c) => c.dying === 0 && c.fighter!.down <= 0 && !c.fighter!.front!.back).length;
  const w = front.battle.winner;
  if (w === 0 || w === 1) wins[w]++;
  console.log(`battle ${n + 1}: ${w === 0 ? 'HOUSE' : w === 1 ? 'ORCS ' : '???  '} in ${Math.round(now - start)}s | raised ${raised[0]} v ${raised[1]} | standing ${up(0)} v ${up(1)} | dropped ${dropped[0]} v ${dropped[1]} | ${phases.join(' ')}`);
  dropped = [0, 0];
  // Let the field clear before the next one.
  run(120, () => front.battle.phase === 'none' && line(0).length + line(1).length === 0);
}
console.log(`house ${wins[0]} - orcs ${wins[1]}`);
