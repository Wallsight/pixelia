// Dev tool: how many sites of each kind lie within R of the origin, for several seeds.
// Usage: node tools/run.mjs tools/sitecount.ts [R]
import { Terrain } from '../src/world/terrain';
const R = Number(process.argv[2] ?? 3000);
const names = ['castle', 'crossroad', 'village', 'city', 'orc'];
for (const seed of [20261102, 1, 3, 42, 777]) {
  const t = new Terrain(seed >>> 0);
  const by: Record<string, number> = {};
  for (const s of t.structures.sitesNear(-R, -R, R, R, 0)) by[names[s.kind - 1] ?? s.kind] = (by[names[s.kind - 1] ?? s.kind] ?? 0) + 1;
  console.log(seed, JSON.stringify(by));
}
