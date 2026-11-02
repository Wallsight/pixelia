// Dev tool: seam check + floating-rock census for chunks around given world coords.
// Usage: node tools/run.mjs tools/seam-at.ts x,z [x,z ...]
import { Terrain } from '../src/world/terrain';
import { MARGIN, RW } from '../src/world/biomes';
import { B, CHUNK, HEIGHT, KIND, KIND_SOLID } from '../src/world/blocks';
const t = new Terrain(20261102);
const idx = (x: number, y: number, z: number) => (y * RW + z) * RW + x;
let mism = 0, checked = 0, floating = 0, solids = 0;
for (const arg of process.argv.slice(2)) {
  const [wx, wz] = arg.split(',').map(Number);
  const ccx = Math.floor(wx / CHUNK), ccz = Math.floor(wz / CHUNK);
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    const cx = ccx + dx, cz = ccz + dz;
    const a = t.generateRegion(cx, cz).blocks;
    const b = t.generateRegion(cx + 1, cz).blocks;
    for (let d = -1; d <= 0; d++) for (let y = 0; y < HEIGHT; y++) for (let z = 0; z < RW; z++) {
      checked++;
      if (a[idx(MARGIN + CHUNK + d, y, z)] !== b[idx(MARGIN + d, y, z)]) mism++;
    }
    // Census: solid rock blocks of the inner chunk with no solid face-neighbour below/beside
    // that eventually... (cheap proxy: solid block whose 3x3 column below is all air for 3+ blocks)
    for (let z = MARGIN; z < MARGIN + CHUNK; z++) for (let x = MARGIN; x < MARGIN + CHUNK; x++) for (let y = 4; y < 95; y++) {
      const v = a[idx(x, y, z)];
      if (KIND[v] !== KIND_SOLID || v === B.BEDROCK) continue;
      solids++;
      let gap = true;
      for (let k = 1; k <= 3 && gap; k++) for (let oz = -1; oz <= 1 && gap; oz++) for (let ox = -1; ox <= 1 && gap; ox++) {
        if (KIND[a[idx(x + ox, y - k, z + oz)]] === KIND_SOLID) gap = false;
      }
      // also require no solid neighbour at the same level (i.e. not part of a wall)
      if (gap && ![a[idx(x + 1, y, z)], a[idx(x - 1, y, z)], a[idx(x, y, z + 1)], a[idx(x, y, z - 1)]].some((n) => KIND[n] === KIND_SOLID)) floating++;
    }
  }
}
console.log(`seam: ${mism}/${checked} mismatches; isolated hanging rock blocks (y<95): ${floating} of ${solids}`);
