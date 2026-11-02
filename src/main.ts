import * as THREE from 'three';
import { buildTileData, createTileTexture } from './render/textures';
import { createEnvUniforms } from './render/materials';
import { Sky } from './render/sky';
import { Clouds } from './render/clouds';
import { DayNight } from './render/daynight';
import { ShadowSystem } from './render/shadows';
import { Atmosphere } from './render/atmosphere';
import { World } from './world/world';
import { Terrain, BIOME, BIOME_NAMES_TR, type ColumnSample } from './world/terrain';
import { SEA } from './world/blocks';
import { PlayerController } from './player/controller';
import { WorldMap } from './ui/map';
import { Discovery } from './ui/discovery';
import { Creatures } from './creatures/creatures';
import { TowerBeacon } from './render/beacon';
import { Soundscape } from './audio/soundscape';

// ------------------------------------------------------------ settings
const params = new URLSearchParams(location.search);
const intParam = (name: string, fallback: number, lo: number, hi: number): number => {
  const raw = params.get(name);
  if (raw === null || !/^-?\d{1,10}$/.test(raw)) return fallback;
  return Math.min(hi, Math.max(lo, parseInt(raw, 10)));
};
const SEED = intParam('seed', 20261102, -2147483648, 2147483647) >>> 0;
const RENDER_DISTANCE = intParam('rd', 12, 4, 24);
const SHADOWS = intParam('shadows', 1, 0, 1) === 1;
/** Start hour of the day (0-23). */
const START_HOUR = intParam('hour', 8, 0, 23);

// ------------------------------------------------------------ renderer
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping; // keeps pastel hues intact
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 1200);

const tiles = createTileTexture(buildTileData(SEED), renderer.capabilities.getMaxAnisotropy());
const env = createEnvUniforms(tiles);
const viewFar = RENDER_DISTANCE * 16 - 8;
env.uFogFar.value = viewFar;
env.uFogNear.value = viewFar * 0.55;

const daynight = new DayNight(env, START_HOUR / 24);
const sky = new Sky(env, daynight);
scene.add(sky.mesh);
const clouds = new Clouds(env);
scene.add(clouds.mesh);
const shadows = SHADOWS ? new ShadowSystem(env) : null;
const atmosphere = new Atmosphere(env, daynight);
scene.add(atmosphere.group);
let focusSample: ColumnSample | null = null;

const world = new World(SEED, env, RENDER_DISTANCE, SHADOWS);
scene.add(world.group);

const player = new PlayerController(camera, world, canvas);
const terrain = new Terrain(SEED);
const discovery = new Discovery(terrain);
const worldMap = new WorldMap(SEED, terrain, discovery);
const creatures = new Creatures(env, SHADOWS, world, terrain);
scene.add(creatures.group);
creatures.npcs.onRumor = (id) => discovery.rumor(id);
const beacon = terrain.tower
  ? new TowerBeacon(env, terrain.tower.x, terrain.tower.z, Math.floor(terrain.sample(terrain.tower.x, terrain.tower.z).h))
  : null;
if (beacon) scene.add(beacon.group);
const sound = new Soundscape(world, terrain, creatures);
discovery.onSound = (k) => sound.jingle(k);
const camFwd = new THREE.Vector3(), camUp = new THREE.Vector3();

// ------------------------------------------------------------ spawn
function findSpawn(): [number, number] {
  // Start in the city square, beside the fountain.
  const cc = terrain.structures.city();
  const city = cc && terrain.structures.site(cc[0], cc[1]);
  if (city) return [city.x + 0.5, city.z + 6.5];
  const good = new Set<number>([BIOME.PLAINS, BIOME.FOREST, BIOME.BIRCH_FOREST]);
  for (let r = 0; r < 4000; r += 24) {
    const steps = Math.max(1, Math.floor((2 * Math.PI * r) / 24));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
      const s = terrain.sample(x, z);
      if (!good.has(s.biome) || s.h < SEA + 3 || s.crag > 0.05 || s.isle > 0 || s.mount > 0.1) continue;
      // Require a calm neighbourhood: same kind of land, gentle slopes, no cliffs nearby.
      let calm = true;
      for (let k = 0; k < 12 && calm; k++) {
        const ang = (k / 12) * Math.PI * 2;
        const n = terrain.sample(x + Math.cos(ang) * 28, z + Math.sin(ang) * 28);
        calm = good.has(n.biome) && Math.abs(n.h - s.h) < 7 && n.mount < 0.15;
      }
      if (calm) return [x + 0.5, z + 0.5];
    }
  }
  return [0.5, 0.5];
}
// Dev-only camera hooks for automated screenshots: ?shot&tp=x,z&yaw=deg&pitch=deg
const DEV_SHOT = import.meta.env.DEV && params.has('shot');
const devTp = import.meta.env.DEV ? /^(-?\d{1,7}),(-?\d{1,7})$/.exec(params.get('tp') ?? '') : null;
const [spawnX, spawnZ] = devTp ? [Number(devTp[1]) + 0.5, Number(devTp[2]) + 0.5] : findSpawn();
camera.position.set(spawnX, terrain.sample(spawnX, spawnZ).h + 3, spawnZ);
let spawned = false;

// ------------------------------------------------------------ UI
const overlay = document.getElementById('overlay')!;
const status = document.getElementById('status')!;
const startBtn = document.getElementById('start') as HTMLButtonElement;
const debug = document.getElementById('debug')!;
let showDebug = true;

startBtn.addEventListener('click', () => { sound.start(); player.requestLock(); });
document.addEventListener('pointerlockchange', () => {
  overlay.classList.toggle('hidden', player.locked);
  if (player.locked) sound.start(); else sound.engine.suspend();
  if (!player.locked && spawned) {
    status.textContent = 'Duraklatıldı';
    startBtn.textContent = 'Devam Et';
  }
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') { e.preventDefault(); showDebug = !showDebug; debug.classList.toggle('hidden', !showDebug); }
  // T: fast-forward time (1x -> 60x -> 1x) to watch sunsets and nights.
  if (e.code === 'KeyT' && player.locked) daynight.speed = daynight.speed === 1 ? 60 : 1;
  if (e.code === 'KeyM' && (player.locked || worldMap.open)) { worldMap.toggle(); player.paused = worldMap.open; }
  if (e.code === 'KeyC' && worldMap.open) worldMap.recenter();
  // N: sound on/off, B: music on/off.
  if (e.code === 'KeyN' && player.locked) {
    sound.engine.setMuted(!sound.engine.muted);
    discovery.notice('SES', sound.engine.muted ? 'Kapalı' : 'Açık');
  }
  if (e.code === 'KeyB' && player.locked) {
    sound.engine.setMusic(!sound.engine.musicOn);
    discovery.notice('MÜZİK', sound.engine.musicOn ? 'Açık' : 'Kapalı');
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

// ------------------------------------------------------------ loop
let lastTime = performance.now();
let frames = 0, fpsTime = 0, fps = 0, biomeName = '', biomeTimer = 0;

function frame(): void {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  env.uTime.value += dt;
  daynight.update(dt);
  env.uNight.value = daynight.night;
  atmosphere.update(dt, focusSample);
  beacon?.update(dt, daynight.night, camera.position);

  const focus = spawned ? player.position : camera.position;
  world.update(focus.x, focus.z);

  if (!spawned) {
    const sy = world.surfaceY(Math.floor(spawnX), Math.floor(spawnZ));
    const ready = world.loadedCount;
    const target = Math.round(Math.PI * 9);
    status.textContent = `Dünya oluşturuluyor… ${Math.min(100, Math.round((ready / target) * 100))}%`;
    if (sy >= 0 && ready >= target) {
      player.spawn(spawnX, sy + 1, spawnZ);
      spawned = true;
      status.textContent = `Tohum: ${SEED}`;
      startBtn.disabled = false;
      if (DEV_SHOT) {
        player.yaw = (intParam('yaw', 0, -360, 360) * Math.PI) / 180;
        player.pitch = (intParam('pitch', -10, -89, 89) * Math.PI) / 180;
        player.position.y += intParam('up', 0, 0, 200);
        player.flying = params.has('fly');
        if (params.has('walk')) player.locked = true; // lets the tool inject keys without pointer lock
        overlay.classList.add('hidden');
        // Expose a frame benchmark for the dev screenshot tool (dev builds only).
        (window as unknown as Record<string, unknown>).__bench = (n: number) => {
          const gl = renderer.getContext();
          const t0 = performance.now();
          for (let i = 0; i < n; i++) {
            shadows?.render(renderer, scene, camera.position, daynight.lightDir, daynight.shadowStrength);
            renderer.render(scene, camera);
          }
          gl.finish();
          return ((performance.now() - t0) / n).toFixed(2) + ' ms/frame';
        };
        (window as unknown as Record<string, unknown>).__dragon = () => creatures.dragonPos()?.toArray().map(Math.round);
        (window as unknown as Record<string, unknown>).__perch = () => creatures.forcePerch();
        (window as unknown as Record<string, unknown>).__dragonCmd = (cmd: string) => creatures.dragonCmd(cmd);
        (window as unknown as Record<string, unknown>).__lookTask = (task: string, dist = 4, up = 1.2) => {
          const c = creatures.findTask(task, player.position.x, player.position.z);
          if (!c) return 'none';
          const a = Math.random() * Math.PI * 2;
          player.flying = true;
          player.position.set(c.x + Math.cos(a) * dist, c.y + up, c.z + Math.sin(a) * dist);
          player.yaw = Math.atan2(Math.cos(a), Math.sin(a));
          player.pitch = -Math.atan2(up - 1, dist) * 0.8;
          return c.toArray().map(Math.round);
        };
        (window as unknown as Record<string, unknown>).__dinfo = () => creatures.dragonInfo();
        (window as unknown as Record<string, unknown>).__counts = () => creatures.counts();
        (window as unknown as Record<string, unknown>).__sound = () => { sound.start(); return sound.stats(); };
        (window as unknown as Record<string, unknown>).__meter = () => sound.engine.meter();
        (window as unknown as Record<string, unknown>).__sfx = (n: string) => sound.demo(n);
        // Fly next to the nearest creature of a species and look at it.
        (window as unknown as Record<string, unknown>).__look = (name: string, dist = 4, up = 1.5) => {
          const c = creatures.nearest(name, player.position.x, player.position.z);
          if (!c) return 'none';
          const a = Math.random() * Math.PI * 2;
          player.flying = true;
          player.position.set(c.x + Math.cos(a) * dist, c.y + up, c.z + Math.sin(a) * dist);
          player.yaw = Math.atan2(Math.cos(a), Math.sin(a));
          player.pitch = -Math.atan2(up, dist) * 0.8;
          return c.toArray().map(Math.round);
        };
        document.title = 'READY';
      }
    } else {
      camera.rotation.y += dt * 0.15;
    }
  }
  player.update(dt);
  if (spawned && !worldMap.open) creatures.update(dt, player.position.x, player.position.z, daynight.night, camera.position);
  if (spawned) discovery.update(dt, player.position.x, player.position.z);
  if (spawned) {
    camera.getWorldDirection(camFwd);
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    sound.update(dt, {
      camera, forward: camFwd, up: camUp, pos: player.position, vel: player.velocity,
      onGround: player.onGround, inWater: player.inWater, flying: player.flying,
      night: daynight.night, time: daynight.time, timeSpeed: daynight.speed, sample: focusSample,
    });
  }
  sky.update(camera);
  clouds.update(camera);

  shadows?.render(renderer, scene, camera.position, daynight.lightDir, daynight.shadowStrength);
  renderer.render(scene, camera);
  worldMap.draw(player.position.x, player.position.z, player.yaw);

  frames++;
  fpsTime += dt;
  biomeTimer -= dt;
  if (biomeTimer <= 0) {
    biomeTimer = 0.25;
    focusSample = terrain.sample(focus.x, focus.z);
    biomeName = BIOME_NAMES_TR[focusSample.biome];
  }
  if (fpsTime >= 0.5) { fps = Math.round(frames / fpsTime); frames = 0; fpsTime = 0; }
  if (showDebug) {
    const p = player.position;
    const info = renderer.info.render;
    debug.textContent =
      `${fps} FPS\n` +
      `XYZ  ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}\n` +
      `Biyom  ${biomeName}   Saat ${daynight.clock()}${daynight.speed > 1 ? ' (hızlı)' : ''}\n` +
      `Chunk  ${world.loadedCount} (+${world.pendingCount})  çizim ${info.calls}  üçgen ${(info.triangles / 1000).toFixed(0)}k\n` +
      `Canlı  ${creatures.total}   Keşif ${discovery.total}\n` +
      (player.flying ? 'UÇMA MODU\n' : '') +
      (player.inWater ? 'Suda\n' : '');
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
