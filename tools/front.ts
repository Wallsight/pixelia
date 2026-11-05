// Dev tool: where the war front lies for a seed (field, camps, distances).
// Usage: node tools/run.mjs tools/front.ts [seed]
import { Terrain, BIOME_NAMES_TR } from '../src/world/terrain';
import { frontLayout, frontPlans } from '../src/world/front';

const seed = Number(process.argv[2] ?? 20261102);
const t = new Terrain(seed);
const t0 = performance.now();
const L = frontLayout(t);
if (!L) { console.log('no front for seed', seed); process.exit(0); }
const plans = frontPlans(t);
console.log(`${L.name}: field ${L.x},${L.z} (${BIOME_NAMES_TR[t.sample(L.x, L.z).biome]} h=${Math.round(t.sample(L.x, L.z).h)})  layout+plans ${(performance.now() - t0).toFixed(0)} ms`);
console.log(`  ${L.castle.name} ${L.castle.x},${L.castle.z} (${L.house.name})  vs  ${L.capital.name} ${L.capital.x},${L.capital.z}`);
for (const [k, c] of [['castle camp', L.human], ['orc camp', L.orc]] as const) {
  console.log(`  ${k} ${c.x},${c.z} y=${c.y} muster ${Math.round(c.gx)},${Math.round(c.gz)}  to castle ${Math.round(Math.hypot(c.x - L.castle.x, c.z - L.castle.z))}  to capital ${Math.round(Math.hypot(c.x - L.capital.x, c.z - L.capital.z))}`);
}
console.log(`  plans: ${plans.map((p) => `${p.w}x${p.h}`).join(', ')}`);
