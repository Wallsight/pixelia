// Dev tool: compare terrain.sample() with the generated column at points.
// Usage: node tools/run.mjs tools/column.ts seed x,z [x,z ...]
import { Terrain } from '../src/world/terrain';
import { extractInner } from '../src/world/mesher';
import { CHUNK, HEIGHT, BLOCK_NAMES } from '../src/world/blocks';
const t = new Terrain(Number(process.argv[2]) >>> 0);
for (const arg of process.argv.slice(3)) {
  const [x, z] = arg.split(',').map(Number);
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  const inner = extractInner(t.generateRegion(cx, cz).blocks);
  const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
  let top = -1, b = 0;
  for (let y = HEIGHT - 1; y >= 0; y--) { b = inner[(y * CHUNK + lz) * CHUNK + lx]; if (b) { top = y; break; } }
  const s = t.sample(x, z);
  console.log(`${x},${z} sample h=${s.h.toFixed(1)} biome=${s.biome} | generated top=${top} ${BLOCK_NAMES[b]}`, JSON.stringify(s, (k, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
}
