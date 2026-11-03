// Dev tool: where the great dragon's lair is for a seed.
// Usage: node tools/run.mjs tools/lair.ts [seed]
import { Terrain } from '../src/world/terrain';
import { BIOME } from '../src/world/biomes';

const t = new Terrain(Number(process.argv[2] ?? 20261102) >>> 0);
const t0 = performance.now();
const l = t.landmarks.lair();
const ms = performance.now() - t0;
if (!l) console.log('no lair');
else {
  const s = t.sample(l.x, l.z);
  const name = Object.entries(BIOME).find(([, v]) => v === s.biome)?.[0];
  const c = t.city ?? { x: 0, z: 0 };
  console.log(`lair ${l.x},${l.z} cell ${l.gx},${l.gz} biome=${name} h=${s.h.toFixed(1)} from city ${Math.round(Math.hypot(l.x - c.x, l.z - c.z))} (${ms.toFixed(0)}ms)`);
  console.log('cell landmark:', JSON.stringify(t.landmarks.at(l.gx, l.gz)));
}
