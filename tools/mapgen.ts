// Dev tool: renders a biome/height map PNG, benchmarks chunk generation and
// checks that neighbouring chunks agree on their shared border blocks.
// Usage: node tools/run.mjs tools/mapgen.ts <outDir> [seed]

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Terrain } from '../src/world/terrain';
import { BIOME_NAMES_TR, MARGIN, RW } from '../src/world/biomes';
import { CHUNK, HEIGHT, SEA } from '../src/world/blocks';
import { meshRegion } from '../src/world/mesher';

const outDir = process.argv[2] ?? '.';
const seed = Number(process.argv[3] ?? 20261102) >>> 0;
const t = new Terrain(seed);

const BIOME_COLORS: Array<[number, number, number]> = [
  [30, 60, 140], [150, 180, 220], [220, 205, 150], [130, 130, 130], [50, 100, 200], [110, 170, 70],
  [50, 120, 40], [120, 160, 80], [50, 90, 70], [200, 210, 220], [230, 200, 120], [180, 90, 50],
  [80, 60, 100], [120, 115, 110], [240, 245, 250], [96, 60, 56], [30, 80, 84], [60, 56, 70],
];

// ---- map
const SIZE = 512, STEP = 4;
const img = Buffer.alloc(SIZE * SIZE * 3);
const counts = new Array(BIOME_NAMES_TR.length).fill(0);
let maxH = 0;
for (let j = 0; j < SIZE; j++) {
  for (let i = 0; i < SIZE; i++) {
    const x = (i - SIZE / 2) * STEP, z = (j - SIZE / 2) * STEP;
    const s = t.sample(x, z);
    counts[s.biome]++;
    maxH = Math.max(maxH, s.h);
    const [r, g, b] = BIOME_COLORS[s.biome];
    const shade = s.h < SEA ? 0.6 + 0.4 * (s.h / SEA) : 0.75 + ((s.h - SEA) / (HEIGHT - SEA)) * 0.6;
    const e = t.sample(x + STEP, z).h - s.h; // hillshade
    const hs = Math.max(0.6, Math.min(1.3, 1 + e * 0.08));
    const k = (j * SIZE + i) * 3;
    img[k] = Math.min(255, r * shade * hs);
    img[k + 1] = Math.min(255, g * shade * hs);
    img[k + 2] = Math.min(255, b * shade * hs);
    if (s.crag > 0.3) img[k] = Math.min(255, img[k] + 40);
    if (s.isle > 0.2 && (i + j) % 6 === 0) { img[k] = 255; img[k + 1] = 255; img[k + 2] = 255; }
  }
}
writeFileSync(`${outDir}/map.png`, png(SIZE, SIZE, img));
console.log('map written; max height', maxH.toFixed(1));
const total = SIZE * SIZE;
console.log(BIOME_NAMES_TR.map((n, i) => `${n}: ${((counts[i] / total) * 100).toFixed(1)}%`).join('  '));

// ---- benchmark
let t0 = performance.now();
let verts = 0;
const N = 40;
for (let i = 0; i < N; i++) {
  const { blocks } = t.generateRegion(i * 3, i * 2);
  const m = meshRegion(blocks);
  verts += m.opaque.position.length / 3 + m.plants.position.length / 3 + m.water.position.length / 3;
}
console.log(`gen+mesh: ${((performance.now() - t0) / N).toFixed(1)} ms/chunk, avg ${Math.round(verts / N)} verts`);

// ---- seam check: chunk A's padding column must equal chunk B's inner column.
t0 = performance.now();
let mismatches = 0, checked = 0;
for (let k = 0; k < 30; k++) {
  const cx = k * 7 - 100, cz = k * 5 - 60;
  const a = t.generateRegion(cx, cz).blocks;
  const b = t.generateRegion(cx + 1, cz).blocks;
  // world x = (cx+1)*16 + d, d in [-1, MARGIN-1]  -> A index MARGIN+16+d, B index MARGIN+d
  for (let d = -1; d <= 0; d++) {
    for (let y = 0; y < HEIGHT; y++) {
      for (let z = 0; z < RW; z++) {
        const ia = (y * RW + z) * RW + MARGIN + CHUNK + d;
        const ib = (y * RW + z) * RW + MARGIN + d;
        checked++;
        if (a[ia] !== b[ib]) mismatches++;
      }
    }
  }
}
console.log(`seam check: ${mismatches} mismatches / ${checked} blocks (${(performance.now() - t0).toFixed(0)} ms)`);

function png(w: number, h: number, rgb: Buffer): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
