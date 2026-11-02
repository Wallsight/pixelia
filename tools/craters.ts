// Dev tool: finds volcano craters (columns with a lava lake) and eldritch shores.
import { Terrain } from '../src/world/terrain';
import { BIOME } from '../src/world/biomes';
const t = new Terrain(20261102);
const R = Number(process.argv[2] ?? 1500);
let best: Array<[number, number, number, number]> = [];
const shores: string[] = [];
for (let z = -R; z <= R; z += 6) for (let x = -R; x <= R; x += 6) {
  const s = t.sample(x, z);
  if (s.lavaY > 0) best.push([Math.hypot(x, z), x, z, s.lavaY]);
  if (s.biome === BIOME.BLACK_BEACH && shores.length < 5 && shores.every((p) => { const [a, b] = p.split(',').map(Number); return Math.hypot(a - x, b - z) > 200; })) shores.push(`${x},${z}`);
}
best.sort((a, b) => a[0] - b[0]);
const seen: Array<[number, number]> = [];
for (const [, x, z, l] of best) {
  if (seen.some(([a, b]) => Math.hypot(a - x, b - z) < 60)) continue;
  seen.push([x, z]);
  console.log(`crater near ${x},${z} lava=${l}`);
  if (seen.length >= 4) break;
}
console.log('black beaches:', shores.join('  '));
