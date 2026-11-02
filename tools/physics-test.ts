// Dev tool: deterministic checks of the walking physics against a tiny fake world.
// Usage: node tools/run.mjs tools/physics-test.ts
import * as THREE from 'three';
import { B, PARTIAL } from '../src/world/blocks';
import { PlayerController } from '../src/player/controller';
import type { World } from '../src/world/world';

const noop = () => {};
const g = globalThis as Record<string, unknown>;
g.window = { addEventListener: noop };
g.document = { addEventListener: noop, pointerLockElement: null };

type Shape = (x: number, y: number, z: number) => number;
function makePlayer(shape: Shape): PlayerController {
  const world = { getBlock: (x: number, y: number, z: number) => shape(x, y, z) } as unknown as World;
  const p = new PlayerController(new THREE.PerspectiveCamera(), world, {} as HTMLElement);
  p.locked = true;
  return p;
}
const keys = (p: PlayerController) => (p as unknown as { keys: Set<string> }).keys;
function run(p: PlayerController, seconds: number): void {
  for (let i = 0; i < seconds * 60; i++) p.update(1 / 60);
}

let failures = 0;
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
  if (!ok) failures++;
}

// Flat ground: top solid block at y=10, walking surface y=11.
const flat: Shape = (_x, y) => (y <= 10 ? B.STONE : B.AIR);

{ // falls onto ground and rests
  const p = makePlayer(flat);
  p.spawn(0.5, 20, 0.5);
  run(p, 2);
  check('lands on ground', Math.abs(p.position.y - 11) < 1e-3 && p.onGround, `y=${p.position.y.toFixed(3)}`);
}
{ // walking speed (yaw 0 = towards -Z)
  const p = makePlayer(flat);
  p.spawn(0.5, 11, 0.5);
  keys(p).add('KeyW');
  run(p, 3);
  const d = -(p.position.z - 0.5);
  check('walks forward ~4.4 m/s', d > 11 && d < 14, `moved ${d.toFixed(2)} in 3s`);
}
{ // auto step onto a 1-block ledge
  const ledge: Shape = (_x, y, z) => (y <= 10 || (y === 11 && z <= -3) ? B.STONE : B.AIR);
  const p = makePlayer(ledge);
  p.spawn(0.5, 11, 0.5);
  keys(p).add('KeyW');
  run(p, 2);
  check('steps up 1 block', Math.abs(p.position.y - 12) < 1e-3 && p.position.z < -4, `y=${p.position.y.toFixed(2)} z=${p.position.z.toFixed(2)}`);
}
{ // blocked by a 2-block wall
  const wall: Shape = (_x, y, z) => (y <= 10 || (y <= 12 && z <= -3) ? B.STONE : B.AIR);
  const p = makePlayer(wall);
  p.spawn(0.5, 11, 0.5);
  keys(p).add('KeyW');
  run(p, 2);
  check('stopped by 2-high wall', Math.abs(p.position.y - 11) < 1e-3 && p.position.z > -2.31, `z=${p.position.z.toFixed(3)}`);
}
{ // jump clears ~1.25 blocks
  const p = makePlayer(flat);
  p.spawn(0.5, 11, 0.5);
  run(p, 0.2); // settle so onGround is known
  keys(p).add('Space');
  let peak = 0;
  for (let i = 0; i < 40; i++) { p.update(1 / 60); peak = Math.max(peak, p.position.y - 11); keys(p).delete('Space'); }
  check('jump height', peak > 1.1 && peak < 1.5, `peak=${peak.toFixed(2)}`);
}
{ // diagonal walk into a corner does not tunnel
  const box: Shape = (x, y, z) => (y <= 10 || x < -3 || z < -3 ? B.STONE : B.AIR);
  const p = makePlayer(box);
  p.spawn(0.5, 11, 0.5);
  p.yaw = Math.PI / 4;
  keys(p).add('KeyW'); keys(p).add('ShiftLeft');
  run(p, 3);
  check('corner collision', p.position.x >= -2.7 && p.position.z >= -2.7, `x=${p.position.x.toFixed(2)} z=${p.position.z.toFixed(2)}`);
}
{ // unloaded chunk acts as a wall
  const unloaded: Shape = (_x, y, z) => (z < -5 ? -1 : y <= 10 ? B.STONE : B.AIR);
  const p = makePlayer(unloaded);
  p.spawn(0.5, 11, 0.5);
  keys(p).add('KeyW');
  run(p, 3);
  check('unloaded area blocks', Math.abs(p.position.z + 4.7) < 1e-3 && p.position.y === 11, `z=${p.position.z.toFixed(2)}`);
}
{ // walks up a quarter-step ramp without stopping (2/8, 4/8, 6/8, full, then repeat)
  const cuts = PARTIAL.get(B.GRASS)!;
  const ramp: Shape = (_x, y, z) => {
    if (y <= 10) return B.STONE;
    if (z > -2) return B.AIR;
    const step = Math.min(7, -z - 2); // 0..7 quarter steps
    const level = 11 + Math.floor(step / 4);
    const k = step % 4;
    if (y < level) return B.STONE;
    if (y === level) return k === 3 ? B.STONE : cuts[k];
    return B.AIR;
  };
  const p = makePlayer(ramp);
  p.spawn(0.5, 11, 0.5);
  keys(p).add('KeyW');
  run(p, 3);
  check('climbs slab ramp', Math.abs(p.position.y - 13) < 1e-3 && p.position.z < -9, `y=${p.position.y.toFixed(3)} z=${p.position.z.toFixed(2)}`);
}
{ // swimming: water above ground, space rises
  const pool: Shape = (_x, y) => (y <= 5 ? B.STONE : y <= 15 ? B.WATER : B.AIR);
  const p = makePlayer(pool);
  p.spawn(0.5, 6, 0.5);
  keys(p).add('Space');
  run(p, 3);
  check('swims up', p.position.y > 13, `y=${p.position.y.toFixed(2)} inWater=${p.inWater}`);
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
if (failures) process.exitCode = 1;
