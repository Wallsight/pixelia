// Dev tool: prints a sample coordinate for each biome / landform near the origin.
import { Terrain } from '../src/world/terrain';
import { BIOME_NAMES_TR } from '../src/world/biomes';
const t = new Terrain(Number(process.argv[2] ?? 20261102) >>> 0);
const R = Number(process.argv[3] ?? 3000);
const found = new Map<string, string>();
for (let r = 0; r < R && found.size < BIOME_NAMES_TR.length + 3; r += 16) {
  for (let a = 0; a < 96; a++) {
    const x = Math.round(Math.cos((a / 96) * Math.PI * 2) * r), z = Math.round(Math.sin((a / 96) * Math.PI * 2) * r);
    const s = t.sample(x, z);
    const name = BIOME_NAMES_TR[s.biome];
    if (!found.has(name)) found.set(name, `${x},${z} h=${s.h.toFixed(0)}`);
    if (s.crag > 0.6 && !found.has('crag')) found.set('crag', `${x},${z} h=${s.h.toFixed(0)}`);
    if (s.isle > 0.6 && !found.has('isle')) found.set('isle', `${x},${z} h=${s.h.toFixed(0)}`);
    if (s.lavaY > 0 && !found.has('volcano crater')) found.set('volcano crater', `${x},${z} h=${s.h.toFixed(0)} lava=${s.lavaY}`);
  }
}
for (const [k, v] of found) console.log(k.padEnd(18), v);
