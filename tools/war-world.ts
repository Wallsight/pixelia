// Dev tool: runs the real creature system (Creatures + war + night directors,
// real walking and collision) on real generated chunks around the nearest held
// castle, headless. Checks that every soldier reaches their post, that the
// rampart bowmen climb the stairs, and that the lowered portcullis blocks.
// Usage: node tools/run.mjs tools/war-world.ts [seed]
import * as THREE from 'three';
import { Terrain } from '../src/world/terrain';
import { extractInner } from '../src/world/mesher';
import { CHUNK, HEIGHT, B, COLLIDES } from '../src/world/blocks';
import { SITE_CASTLE } from '../src/world/structures';
import { castleLayout, castleWorld } from '../src/world/castle';
import { gateSide } from '../src/world/stamp';
import { Creatures } from '../src/creatures/creatures';
import { createEnvUniforms } from '../src/render/materials';

// Minimal browser stand-ins: bubbles draw text on a canvas, fire reads the viewport.
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}) });
(globalThis as unknown as Record<string, unknown>).window = { innerHeight: 720, devicePixelRatio: 1 };
(globalThis as unknown as Record<string, unknown>).document = { createElement: () => ({ getContext: () => ctx2d, width: 0, height: 0 }) };
let now = 0;
const timers: Array<{ at: number; fn: () => void }> = [];
(globalThis as unknown as { setTimeout: unknown }).setTimeout = (fn: () => void, ms: number) => { timers.push({ at: now + ms / 1000, fn }); return 0; };


const seed = Number(process.argv[2] ?? 20261102) >>> 0;
const t = new Terrain(seed);
const site = t.structures.sitesNear(-1500, -1500, 1500, 1500, 0).filter((s) => s.kind === SITE_CASTLE && s.held)
  .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
const L = castleLayout(site, seed, gateSide(t, site));
console.log(`${site.name} (${L.house!.name}) at ${site.x},${site.z} half=${L.half} wallH=${L.wallH} floorY=${L.floorY}`);

// Real chunks for a square around the castle.
const chunks = new Map<string, Uint8Array>();
const R = L.half + 60;
const c0x = Math.floor((site.x - R) / CHUNK), c1x = Math.floor((site.x + R) / CHUNK);
const c0z = Math.floor((site.z - R) / CHUNK), c1z = Math.floor((site.z + R) / CHUNK);
const t0 = Date.now();
for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) chunks.set(`${cx},${cz}`, extractInner(t.generateRegion(cx, cz).blocks));
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
const said: string[] = [];
creatures.npcs.bubbles.say = (c: { fighter?: { kind: string } }, text: string) => { said.push(`${now.toFixed(1).padStart(6)}s ${(c.fighter?.kind ?? 'npc').padEnd(8)} ${text}`); };
const cam = new THREE.Vector3();
// The player stands just outside the gate.
const [px, pz] = castleWorld(L, L.half + 6, 4);
let nightV = 0;

const tick = (dt: number) => {
  now += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= now) { const f = timers[i].fn; timers.splice(i, 1); f(); }
  cam.set(px, L.floorY + 2, pz);
  creatures.update(dt, px, pz, nightV, cam);
};
const posts = () => (creatures.war as unknown as { garrisons: Map<string, { posts: Array<{ duty: string; i: number; c: { x: number; y: number; z: number; fighter: { foe: unknown } } | null; hx: number; hz: number; leaving: boolean; route: unknown[] | null; ri: number }> }> }).garrisons;
const report = (label: string) => {
  console.log(`[${label}] t=${now.toFixed(0)}s  ${creatures.war.info()}`);
  for (const g of posts().values()) {
    const away = g.posts.filter((p) => p.c && !p.leaving && p.duty !== 'patrol' && Math.hypot(p.c.x - p.hx, p.c.z - p.hz) > 1.2 && !p.c.fighter.foe);
    for (const p of away) console.log(`   NOT AT POST ${p.duty}#${p.i} at ${p.c!.x.toFixed(1)},${p.c!.y.toFixed(1)},${p.c!.z.toFixed(1)} -> home ${p.hx.toFixed(1)},${p.hz.toFixed(1)}${p.route ? ` route ${p.ri}/${p.route.length}` : ''}`);
  }
};
// Invariants checked twice a second.
const anomalies = new Set<string>();
const check = () => {
  for (const g of posts().values()) {
    const gg = g as unknown as { gate: { drop: number; broken: boolean; solid: boolean }; siege: { foes: unknown[] } | null };
    for (const k of ['zombie', 'skeleton', 'spider', 'troll', 'demon']) for (const c of creatures.live(k)) {
      if (c.dying > 0) continue;
      const dx = c.x - (L.cx + 0.5), dz = c.z - (L.cz + 0.5);
      const u = L.gx * dx + L.gz * dz, v = L.px * dx + L.pz * dz;
      if (c.fighter!.siege && !gg.siege?.foes.includes(c)) anomalies.add(`t=${now.toFixed(0)} STALE ORDER ${k} u=${u.toFixed(1)} v=${v.toFixed(1)}`);
      if (Math.abs(u) < L.half - 0.5 && Math.abs(v) < L.half && !gg.gate.broken && gg.gate.drop > 0.9) anomalies.add(`t=${now.toFixed(0)} INSIDE CLOSED CASTLE ${k} u=${u.toFixed(1)} v=${v.toFixed(1)} y=${c.y.toFixed(1)}`);
      if (Math.abs(u - L.half) < 0.5 && Math.abs(v) < 1.5 && gg.gate.solid) anomalies.add(`t=${now.toFixed(0)} IN GATE CELL ${k} y=${c.y.toFixed(1)}`);
    }
  }
};
let frame = 0;
const run = (sec: number, label: string) => { for (let s = 0; s < sec; s += 1 / 30) { tick(1 / 30); if (++frame % 15 === 0) check(); } report(label); };

// Day: close by, so courtyard soldiers walk out of the keep.
run(5, 'day 5s');
run(55, 'day 60s');
// Heights: wall posts must be up on the wall walk.
for (const g of posts().values()) for (const p of g.posts) if (p.c && (p.duty === 'patrol' || p.duty === 'watch')) {
  const up = p.c.y - L.floorY;
  if (up < L.wallH) console.log(`   ${p.duty}#${p.i} is NOT on the wall (y+${up.toFixed(1)})`);
}
nightV = 0.9;
run(40, 'night 40s');
console.log('siege:', creatures.war.devSiege());
run(15, 'siege 15s');
{
  const sieged = () => ['zombie', 'skeleton', 'troll', 'spider'].flatMap((k) => creatures.live(k)).filter((c) => c.fighter!.siege);
  let c = sieged()[0];
  for (let i = 0; i < 40; i++) {
    for (let s = 0; s < 1; s += 1 / 30) { tick(1 / 30); if (++frame % 15 === 0) check(); }
    if (!c || c.gone || c.dying > 0 || !c.fighter!.siege) c = sieged().filter((x) => x.dying === 0)[0];
    if (!c) { console.log('  trace: none'); continue; }
    const f = c.fighter!, s = f.siege;
    console.log(`  trace ${f.kind} ${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)} yaw=${c.yaw.toFixed(2)} walkAmp=${c.walkAmp.toFixed(2)} order=${s ? `${s.x.toFixed(1)},${s.z.toFixed(1)}` : '-'} foe=${f.foe ? 'y' : 'n'} gone=${c.gone} dying=${c.dying.toFixed(1)} t=${f.t.toFixed(1)}`);
  }
}
// Gate: blocked cells while down.
const [gx, gz] = castleWorld(L, L.half, 0);
console.log(`gate cell solid for walkers: ${creatures.war.solid(Math.floor(gx), L.floorY + 2, Math.floor(gz))}, open block there: ${COLLIDES[world.getBlock(Math.floor(gx), L.floorY + 2, Math.floor(gz))] === 0}`);
const foes = () => {
  for (const g of posts().values()) { const gg = g as unknown as { gate: { drop: number; broken: boolean; solid: boolean; hp: number }; siege: { phase: string; foes: unknown[] } | null }; console.log(`   gate drop=${gg.gate.drop.toFixed(2)} broken=${gg.gate.broken} solid=${gg.gate.solid} hp=${gg.gate.hp} siege=${gg.siege?.phase ?? 'none'} foes=${gg.siege?.foes.length ?? '-'}`); }
  for (const k of ['zombie', 'skeleton', 'spider', 'troll', 'demon']) for (const c of creatures.live(k)) {
    const dx = c.x - (L.cx + 0.5), dz = c.z - (L.cz + 0.5);
    const u = L.gx * dx + L.gz * dz, v = L.px * dx + L.pz * dz;
    const s = c.fighter!.siege;
    if (!c.fighter!.siege) continue;
    console.log(`   ${k.padEnd(8)} u=${u.toFixed(1)} v=${v.toFixed(1)} y=${c.y.toFixed(1)} ground=${Math.floor(t.sample(c.x, c.z).h)} order=${s ? `${s.x.toFixed(0)},${s.z.toFixed(0)}${s.pound ? ' POUND' : ''}` : 'none'} foe=${c.fighter!.foe ? 'yes' : 'no'}`);
  }
};
for (let i = 0; i < 9; i++) { run(15, `siege ${30 + i * 15}s`); if (i === 1 || i === 4 || i === 8) foes(); }
for (const g of posts().values()) for (const p of g.posts) if (p.c && p.duty === 'rampart') console.log(`   rampart#${p.i} y+${(p.c.y - L.floorY).toFixed(1)} route ${p.ri}/${p.route!.length}`);
nightV = 0;
run(60, 'dawn');
console.log(said.filter((l) => !l.includes('npc')).slice(-30).join('\n'));
console.log(`ANOMALIES (${anomalies.size}):\n` + [...anomalies].slice(0, 30).join('\n'));
console.log('SIEGE LINES:\n' + said.filter((l) => /Kuşatma|Troll|Kapı düştü|Zafer|Kapıyı açın/.test(l)).join('\n'));
