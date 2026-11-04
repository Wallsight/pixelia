// Dev tool: lists sites (castles, crossroads) and roads near the origin.
import { Terrain } from '../src/world/terrain';
import { SITE_CASTLE, polylineLength } from '../src/world/structures';
const t = new Terrain(Number(process.argv[2] ?? 20261102) >>> 0);
const R = Number(process.argv[3] ?? 1000);
const sites = t.structures.sitesNear(-R, -R, R, R, 0).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
for (const s of sites) {
  const roads = t.structures.roadsOf(s).map((r) => `${(r.a === s ? r.b : r.a).name} (${Math.round(polylineLength(r.pts))}m)`);
  console.log(`${s.kind === SITE_CASTLE ? (s.held ? 'KALE ' : 'ŞATO ') : 'kavşak'} ${s.name.padEnd(22)} ${String(s.x).padStart(6)},${String(s.z).padStart(6)} h=${s.h.toFixed(0)}  -> ${roads.join(', ')}`);
}
