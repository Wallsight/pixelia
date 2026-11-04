// Dev tool: the orc capital and the orc camps near the city.
// Usage: node tools/run.mjs tools/orcs.ts [seed] [radius]
import { Terrain } from '../src/world/terrain';
import { SITE_ORC, SITE_CITY } from '../src/world/structures';
import { BIOME } from '../src/world/biomes';

const t = new Terrain(Number(process.argv[2] ?? 20261102) >>> 0);
const R = Number(process.argv[3] ?? 2500);
const city = t.structures.sitesNear(-R, -R, R, R, 0).find((s) => s.kind === SITE_CITY);
console.log('capital cell', t.structures.capital());
const biomeName = (b: number) => Object.entries(BIOME).find(([, v]) => v === b)?.[0];
const sites = t.structures.sitesNear(-R, -R, R, R, 0).filter((s) => s.kind === SITE_ORC)
  .sort((a, b) => Number(!!b.capital) - Number(!!a.capital) || Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
for (const s of sites) {
  const d = city ? Math.hypot(s.x - city.x, s.z - city.z) : 0;
  console.log(`${s.capital ? 'BAŞKENT' : 'oba    '} ${s.name.padEnd(18)} ${s.x},${s.z} h=${s.h.toFixed(0)} ${biomeName(t.sample(s.x, s.z).biome)} roads=${t.structures.roadsOf(s).length} dCity=${d.toFixed(0)}`);
}

// ASCII top view of the capital's plan (or of the camp named by argv[4]).
import { buildOrcPlan, orcLayout } from '../src/world/orcs';
import { B } from '../src/world/blocks';
import { C_AIR, C_FILL, C_KEEP, C_SURFACE } from '../src/world/castle';
const which = process.argv[4];
const target = sites.find((s) => (which ? s.name.startsWith(which) : s.capital));
if (target) {
  const t0 = performance.now();
  const L = orcLayout(t, target);
  const plan = buildOrcPlan(t, target);
  console.log(`${target.name}: huts=${L.huts.length} fires=${L.fires.length} totems=${L.totems.length} towers=${L.towers.length} racks=${L.racks.length} gate=${(L.gateA * 180 / Math.PI).toFixed(0)}° plan ${(performance.now() - t0).toFixed(0)}ms`);
  const ch: Record<number, string> = {
    [B.SPRUCE_LOG]: '#', [B.CHARRED_LOG]: '#', [B.HIDE]: 'h', [B.SKULL]: 'S', [B.WAR_BANNER]: 'W', [B.MAGMA]: '*', [B.COBBLE]: 'c',
    [B.DARK_PLANKS]: 'p', [B.STEEL]: 'A', [B.HAY]: 'y', [B.CRATE]: 'x', [B.BONE]: 'b', [B.PATH]: '.', [B.GRAVEL]: ',', [B.SAND]: ' ', [B.CLAY_TAN]: ' ', [B.DIRT]: ':',
  };
  for (let z = 0; z < plan.d; z++) {
    let row = '';
    for (let x = 0; x < plan.w; x++) {
      let c = '~';
      for (let y = plan.h - 1; y >= 0; y--) {
        const v = plan.cells[(y * plan.d + z) * plan.w + x];
        if (v === C_KEEP || v === C_AIR) continue;
        c = v === C_FILL ? 'f' : v === C_SURFACE ? ' ' : ch[v] ?? '?';
        break;
      }
      row += c;
    }
    console.log(row);
  }
  const mark = (name: string, x: number, z: number) => console.log(`  ${name} @ ${x - plan.ox},${z - plan.oz}`);
  if (L.throne) mark('throne', L.throne.x, L.throne.z);
  for (const d of L.drummers) mark('drummer', Math.round(d.x), Math.round(d.z));
  if (L.forge) mark('smith', L.forge.x, L.forge.z);
}
