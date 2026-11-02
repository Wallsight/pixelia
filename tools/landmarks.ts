// Dev tool: nearest landmark of each kind.
import { Terrain } from '../src/world/terrain';
import { LM } from '../src/world/structures';
const t = new Terrain(20261102);
const R = Number(process.argv[2] ?? 2500);
const names = Object.fromEntries(Object.entries(LM).map(([k, v]) => [v, k]));
const best = new Map<number, string>();
const all = t.landmarks.near(-R, -R, R, R, 0).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
for (const l of all) if (!best.has(l.kind)) best.set(l.kind, `${l.x},${l.z} h=${l.h.toFixed(0)} rot=${l.rot}`);
for (const [k, v] of [...best].sort((a, b) => a[0] - b[0])) console.log(String(names[k]).padEnd(14), v);
console.log('total within', R, ':', all.length);
