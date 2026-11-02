import { Terrain } from '../src/world/terrain';
import { MARGIN, RW } from '../src/world/biomes';
import { B, CHUNK, HEIGHT, SEA } from '../src/world/blocks';
const t = new Terrain(20261102);
const [wx, wz] = (process.argv[2] ?? '48,-630').split(',').map(Number);
let lava = 0, high = 0, maxY = 0, samples = 0;
for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
  const cx = Math.floor(wx / CHUNK) + dx, cz = Math.floor(wz / CHUNK) + dz;
  const { blocks } = t.generateRegion(cx, cz);
  for (let y = 0; y < HEIGHT; y++) for (let z = MARGIN; z < MARGIN + CHUNK; z++) for (let x = MARGIN; x < MARGIN + CHUNK; x++) {
    if (blocks[(y * RW + z) * RW + x] === B.LAVA) { lava++; if (y > SEA) { high++; maxY = Math.max(maxY, y); } }
  }
}
for (let z = wz - 40; z <= wz + 40; z += 4) for (let x = wx - 40; x <= wx + 40; x += 4) if (t.sample(x, z).lavaY > 0) samples++;
console.log({ lava, craterLava: high, maxY, columnsWithLavaY: samples });
