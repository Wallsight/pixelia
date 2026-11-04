// Dev tool: the city and nearby villages, their layouts and plan build times.
// Usage: node tools/run.mjs tools/villages.ts [seed] [radius]
import { Terrain } from '../src/world/terrain';
import { SITE_CITY, SITE_VILLAGE } from '../src/world/structures';
import { villageLayout, buildVillagePlan } from '../src/world/village';

const t = new Terrain(Number(process.argv[2] ?? 20261102) >>> 0);
const R = Number(process.argv[3] ?? 1500);
const sites = t.structures.sitesNear(-R, -R, R, R, 0).filter((s) => s.kind === SITE_VILLAGE || s.kind === SITE_CITY)
  .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
for (const s of sites) {
  const t0 = performance.now();
  const L = villageLayout(t, s);
  const t1 = performance.now();
  const plan = buildVillagePlan(t, s);
  const t2 = performance.now();
  const kinds: Record<string, number> = {};
  for (const h of L.houses) kinds[h.kind] = (kinds[h.kind] ?? 0) + 1;
  console.log(`${s.kind === SITE_CITY ? 'ŞEHİR' : 'köy  '} ${s.name.padEnd(20)} ${s.x},${s.z} h=${s.h.toFixed(0)} style=${L.style} streets=${L.streets.length} houses=${L.houses.length} ${JSON.stringify(kinds)} fields=${L.fields.length} stalls=${L.stalls.length} lamps=${L.lamps.length} towers=${L.towers.length} texts=${plan.texts.length} layout=${(t1 - t0).toFixed(0)}ms plan=${(t2 - t1).toFixed(0)}ms`);
}
