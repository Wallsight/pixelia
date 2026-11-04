// Dev tool: prints a top-down map of the nearest held castle's plan (highest
// block per column) with the garrison spots on top.
// Usage: node tools/run.mjs tools/castle.ts [seed] [x] [z]
import { Terrain } from '../src/world/terrain';
import { SITE_CASTLE } from '../src/world/structures';
import { buildCastle, castleLayout, castleWorld, C_AIR, C_FILL, C_KEEP } from '../src/world/castle';
import { gateSide } from '../src/world/stamp';
import { B, BLOCK_NAMES } from '../src/world/blocks';

const seed = Number(process.argv[2] ?? 20261102) >>> 0;
const qx = Number(process.argv[3] ?? 0), qz = Number(process.argv[4] ?? 0);
const t = new Terrain(seed);
const site = t.structures.sitesNear(qx - 1500, qz - 1500, qx + 1500, qz + 1500, 0)
  .filter((s) => s.kind === SITE_CASTLE && s.held)
  .sort((a, b) => Math.hypot(a.x - qx, a.z - qz) - Math.hypot(b.x - qx, b.z - qz))[0];
if (!site) { console.log('no held castle'); process.exit(0); }
const gate = gateSide(t, site);
const L = castleLayout(site, seed, gate);
const P = buildCastle(site, seed, gate);
console.log(`${site.name} at ${site.x},${site.z} h=${site.h.toFixed(1)} gate=${gate} half=${L.half} wallH=${L.wallH} house=${L.house?.name} banner=${BLOCK_NAMES[L.house!.banner]}`);

const CH: Record<number, string> = {
  [B.STONE_BRICKS]: '#', [B.COBBLE]: '#', [B.MOSSY_BRICKS]: '#', [B.CRACKED_BRICKS]: '#', [B.SLATE]: '^', [B.WINDOW_LIT]: '#', [B.WINDOW_DARK]: '#',
  [B.PATH]: '.', [B.GRAVEL]: '.', [B.HAY]: 'h', [B.OAK_LOG]: 'o', [B.STEEL]: 'B', [B.CRATE]: 'c', [B.LANTERN]: 'l', [B.DARK_PLANKS]: 'p',
  [B.CLOTH_YELLOW]: 't', [L.house!.banner]: 'F',
};
const grid: string[][] = [];
for (let lz = 0; lz < P.d; lz++) {
  const row: string[] = [];
  for (let lx = 0; lx < P.w; lx++) {
    let ch = ' ', top = -1;
    for (let ly = P.h - 1; ly >= 0; ly--) {
      const v = P.cells[(ly * P.d + lz) * P.w + lx];
      if (v === C_KEEP || v === C_AIR || v === C_FILL) continue;
      top = ly; ch = CH[v] ?? '?';
      break;
    }
    // Wall-walk height marker: digits for heights above the floor.
    if (ch === '#' && top - 12 >= L.wallH && top - 12 <= L.wallH + 1) ch = '=';
    row.push(ch);
  }
  grid.push(row);
}
const mark = (u: number, v: number, c: string) => {
  const [wx, wz] = castleWorld(L, u, v);
  const lx = Math.floor(wx) - P.ox, lz = Math.floor(wz) - P.oz;
  if (grid[lz]?.[lx] !== undefined) grid[lz][lx] = c;
};
for (const s of L.gatePosts) mark(s.u, s.v, 'G');
for (const s of L.watch) mark(s.u, s.v, 'W');
for (const s of L.drill) mark(s.u, s.v, 'S');
mark(L.captain.u, L.captain.v, 'K');
for (const s of L.strikers) mark(s.u, s.v, 'x');
for (const s of L.shooters) mark(s.u, s.v, 'A');
for (const [u0, v0, u1, v1] of L.patrols) { mark(u0, v0, 'P'); mark(u1, v1, 'P'); }
mark(L.stairs[0].u, L.stairs[0].v, '1'); mark(L.stairs[1].u, L.stairs[1].v, '2');
console.log(grid.map((r) => r.join('')).join('\n'));
// Stair profile.
const prof: string[] = [];
for (let k = -1; k <= L.wallH; k++) {
  const [wx, wz] = castleWorld(L, L.stairs[0].u, L.stairs[0].v + k);
  const lx = Math.floor(wx) - P.ox, lz = Math.floor(wz) - P.oz;
  let top = 0;
  for (let ly = P.h - 1; ly >= 0; ly--) { const v = P.cells[(ly * P.d + lz) * P.w + lx]; if (v !== C_KEEP && v !== C_AIR && v !== C_FILL) { top = ly - 12; break; } }
  prof.push(String(top));
}
console.log('stairs tops:', prof.join(' '));
