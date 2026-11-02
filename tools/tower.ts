// Dev tool: where is the dark tower, how tall is it, and is anything around it taller?
// Usage: node tools/run.mjs tools/tower.ts [seed]
import { Terrain } from '../src/world/terrain';
import { darkTowerHeight } from '../src/world/landmarks';
import { LM } from '../src/world/structures';

const seed = Number(process.argv[2] ?? 20261102) >>> 0;
const t0 = performance.now();
const terrain = new Terrain(seed);
console.log(`init ${(performance.now() - t0).toFixed(0)} ms`);
const t = terrain.tower;
if (!t) { console.log('no tower'); process.exit(0); }
const s = terrain.sample(t.x, t.z);
const floor = Math.floor(s.h), H = darkTowerHeight(floor);
console.log(`tower at ${t.x},${t.z} floor=${floor} shaft=${H} top=${floor + H + 10} biome=${s.biome}`);
let max = 0, mx = 0, mz = 0;
for (let r = 20; r <= 400; r += 10) {
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2, x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
    const h = terrain.sample(x, z).h;
    if (h > max) { max = h; mx = Math.round(x); mz = Math.round(z); }
  }
}
console.log(`highest ground within 400: ${max.toFixed(1)} at ${mx},${mz} (dist ${Math.round(Math.hypot(mx - t.x, mz - t.z))})`);
// Uniqueness: count dark towers within 6 km.
let n = 0;
for (const lm of terrain.landmarks.near(-6000, -6000, 6000, 6000, 0)) if (lm.kind === LM.DARK_TOWER) n++;
console.log(`dark towers within 6 km: ${n}`);
// Lava creek columns in a 400 block window around the tower.
let creek = 0, ashCols = 0;
for (let z = t.z - 200; z < t.z + 200; z += 2) for (let x = t.x - 200; x < t.x + 200; x += 2) {
  const c = terrain.sample(x, z);
  if (c.ash > 0.55) ashCols++;
  if (c.lavaY > 0 && c.lavaY >= Math.floor(c.h)) creek++;
}
console.log(`lava columns sampled (step 2): ${creek} of ${ashCols} ashlands columns`);
// A creek spot near the tower for screenshots.
outer: for (let r = 30; r < 300; r += 6) {
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2, x = Math.round(t.x + Math.cos(a) * r), z = Math.round(t.z + Math.sin(a) * r);
    const c = terrain.sample(x, z);
    if (c.lavaY > 0 && c.lavaY >= Math.floor(c.h) && c.lavaY < c.h + 4) { console.log(`creek at ${x},${z} lavaY=${c.lavaY} h=${c.h.toFixed(1)}`); break outer; }
  }
}
