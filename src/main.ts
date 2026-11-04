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
import { PlayerController, canPointerLock } from './player/controller';
import { WorldMap } from './ui/map';
import { Discovery } from './ui/discovery';
import { Creatures } from './creatures/creatures';
import { TowerBeacon } from './render/beacon';
import { Soundscape } from './audio/soundscape';
import { LegendBoard } from './render/legend-board';
import { EldritchDirector } from './render/eldritch';
import { Subtitle } from './ui/subtitle';
import { villageLayout } from './world/village';
import { IS_TOUCH, TouchControls } from './ui/touch';

// ------------------------------------------------------------ settings
const params = new URLSearchParams(location.search);
const intParam = (name: string, fallback: number, lo: number, hi: number): number => {
  const raw = params.get(name);
  if (raw === null || !/^-?\d{1,10}$/.test(raw)) return fallback;
  return Math.min(hi, Math.max(lo, parseInt(raw, 10)));
};
/** ?touch forces touch controls, even when Start is clicked with a mouse (for testing on desktop). */
const FORCE_TOUCH = params.has('touch');
/** Phones and tablets get touch controls and lighter defaults; browsers without pointer lock need them too. */
const TOUCH = IS_TOUCH || !canPointerLock() || FORCE_TOUCH;
const SEED = intParam('seed', 20261102, -2147483648, 2147483647) >>> 0;
const RENDER_DISTANCE = intParam('rd', TOUCH ? 8 : 12, 4, 24);
const SHADOWS = intParam('shadows', 1, 0, 1) === 1;
/** Start hour of the day (0-23). */
const START_HOUR = intParam('hour', 8, 0, 23);

// ------------------------------------------------------------ renderer
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH ? 1 : 1.5));
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
// The legends board on the city square ticks off the pop-culture places the player has found.
const legendBoard = (() => {
  const cc = terrain.structures.city();
  const city = cc && terrain.structures.site(cc[0], cc[1]);
  const spot = city && villageLayout(terrain, city).board;
  if (!spot) return null;
  const b = new LegendBoard(env, SHADOWS, terrain, discovery, spot);
  scene.add(b.group);
  return b;
})();
creatures.npcs.news = () => {
  const n = legendBoard?.foundCount ?? 0;
  if (Math.random() < 0.5) return null;
  return n ? `Bir gezgin ${n} efsaneyi buldu! Panoya bakın!` : 'Efsaneler panosu meydanda, gezginler buyursun!';
};
const sound = new Soundscape(world, terrain, creatures);
// Tentacles, eyes and the horizon colossus of the eldritch sea.
const eldritch = new EldritchDirector(env, SHADOWS, terrain, creatures.fire);
scene.add(eldritch.group);
eldritch.onSound = (ev, at) => sound.eldritch(ev, at);
discovery.onSound = (k) => sound.jingle(k);
// The great dragon talks in subtitles and knows how many legends the player has found.
const subtitle = new Subtitle();
creatures.wyrm.onSpeak = (who, text, sec, asleep) => subtitle.show(who, text, sec, asleep);
creatures.wyrm.onSound = (ev, at, text) => sound.wyrm(ev, at, text);
creatures.wyrm.context = () => ({ found: legendBoard?.foundCount ?? 0, flying: player.flying });
// Its body is solid: no walking through it, but you can climb onto its back.
player.extraSolid = (x, y, z) => creatures.wyrm.solid(x, y, z) || creatures.war.solid(x, y, z);
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
let showDebug = !TOUCH;
debug.classList.toggle('hidden', !showDebug);

/** Shows or hides the pause overlay once the player starts, pauses or resumes. */
function setActive(active: boolean): void {
  overlay.classList.toggle('hidden', active);
  touch?.show(active && touchMode);
  if (active) sound.start(); else sound.engine.suspend();
  if (!active && worldMap.open) toggleMap();
  if (!active && spawned) {
    status.textContent = 'Duraklatıldı';
    startBtn.textContent = 'Devam Et';
  }
}
function toggleMap(): void {
  worldMap.toggle();
  player.paused = worldMap.open;
  touch?.reset();
  document.body.classList.toggle('map-open', worldMap.open);
}
function toggleSound(): void {
  sound.engine.setMuted(!sound.engine.muted);
  discovery.notice('SES', sound.engine.muted ? 'Kapalı' : 'Açık');
}
function toggleTime(): void {
  daynight.speed = daynight.speed === 1 ? 60 : 1;
  discovery.notice('ZAMAN', daynight.speed > 1 ? 'Hızlı' : 'Normal');
}

/** Leaves play without a pointer-lock change (touch pause, app sent to the background). */
function pauseUnlocked(): void {
  player.locked = false;
  player.clearInput();
  setActive(false);
}

// Touch devices have no pointer lock: the start button simply activates play.
const touch = TOUCH
  ? new TouchControls(player, { map: toggleMap, time: toggleTime, sound: toggleSound, pause: pauseUnlocked })
  : null;
/** True while playing with touch controls (false when a touch-capable device starts with a mouse). */
let touchMode = false;
/** Pointer type of the last press on the Start button ('' for keyboard activation). */
let startPointer = '';
/** The `touch` body class picks touch or keyboard hints and layout; it follows the mode actually in use. */
const setTouchLayout = (on: boolean): void => {
  document.body.classList.toggle('touch', on);
  worldMap.setTouch(on);
};
if (touch) {
  touch.onMapPan = (dx, dy) => worldMap.pan(dx, dy);
  touch.onMapZoom = (dir) => worldMap.zoom(dir);
  setTouchLayout(true);
  // Pause when the app goes to the background (tab switch, screen off).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && player.locked && touchMode) pauseUnlocked();
  });
}

function requestFullscreen(): void {
  // Fullscreen hides the browser bars on Android; iOS Safari does not support it for pages.
  if (document.fullscreenElement) return;
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  try {
    const p = root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen?.();
    if (p) p.catch(() => {});
  } catch { /* fullscreen is optional */ }
}

/** Starts play without pointer lock: touch controls, or plain mouse movement if the lock was refused. */
function startUnlocked(): void {
  if (touchMode) requestFullscreen();
  player.locked = true;
  setActive(true);
}

startBtn.addEventListener('pointerdown', (e) => { startPointer = e.pointerType; });
startBtn.addEventListener('click', () => {
  sound.start();
  // Only a finger (or pen) picks touch controls; a mouse, trackpad or keyboard press on a
  // touch-capable device still gets pointer-lock mouse look when the browser supports it.
  const byFinger = startPointer === 'touch' || startPointer === 'pen';
  startPointer = '';
  touchMode = !!touch && (FORCE_TOUCH || byFinger || !canPointerLock());
  if (touch) setTouchLayout(touchMode);
  if (touchMode) startUnlocked();
  else player.requestLock(startUnlocked);
});
document.addEventListener('pointerlockchange', () => setActive(player.locked));
window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') { e.preventDefault(); showDebug = !showDebug; debug.classList.toggle('hidden', !showDebug); }
  // T: fast-forward time (1x -> 60x -> 1x) to watch sunsets and nights.
  if (e.code === 'KeyT' && player.locked) toggleTime();
  if (e.code === 'KeyM' && (player.locked || worldMap.open)) toggleMap();
  if (e.code === 'KeyC' && worldMap.open) worldMap.recenter();
  // N: sound on/off, B: music on/off.
  if (e.code === 'KeyN' && player.locked) toggleSound();
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
        (window as unknown as Record<string, unknown>).__night = (what: string) => creatures.nightDir.devSpawn(what);
        (window as unknown as Record<string, unknown>).__ninfo = () => creatures.nightDir.info();
        (window as unknown as Record<string, unknown>).__hour = (h: number) => { daynight.time = (h / 24) % 1; return daynight.clock(); };
        (window as unknown as Record<string, unknown>).__eld = (what: string) => eldritch.dev(what);
        (window as unknown as Record<string, unknown>).__einfo = () => eldritch.info();
        (window as unknown as Record<string, unknown>).__wyrm = (what: string) => creatures.wyrm.dev(what);
        (window as unknown as Record<string, unknown>).__winfo = () => creatures.wyrm.info();
        (window as unknown as Record<string, unknown>).__war = () => creatures.war.info();
        (window as unknown as Record<string, unknown>).__castle = () => creatures.war.nearestCastle(player.position.x, player.position.z);
        (window as unknown as Record<string, unknown>).__siege = () => creatures.war.devSiege();
        // Dev: put the camera somewhere (degrees; fly keeps it there).
        (window as unknown as Record<string, unknown>).__cam = (x: number, y: number, z: number, yaw = 0, pitch = 0, fly = true) => {
          player.position.set(x, y, z);
          player.yaw = (yaw * Math.PI) / 180; player.pitch = (pitch * Math.PI) / 180;
          player.flying = fly;
          return [x, y, z];
        };
        // Dev: hear the dragon rumour and stand in front of the legends board.
        (window as unknown as Record<string, unknown>).__board = () => {
          const l = terrain.landmarks.lair();
          if (l) discovery.rumor(`l:${l.gx},${l.gz}`);
          if (!legendBoard) return 'no board';
          const g = legendBoard.group, r = g.rotation.y;
          player.flying = true;
          player.position.set(g.position.x + Math.sin(r) * 5, g.position.y + 2.2, g.position.z + Math.cos(r) * 5);
          player.yaw = r; player.pitch = -0.05;
          return 'ok';
        };
        (window as unknown as Record<string, unknown>).__role = (role: string) => creatures.allNpcs().filter((c) => c.npc?.role === role)
          .map((c) => ({ task: c.npc!.task, next: c.npc!.next, ri: c.npc!.ri, route: c.npc!.route.length / 2, at: [Math.round(c.x), Math.round(c.z)] }));
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
  if (touchMode) touch?.syncFly();
  if (spawned && !worldMap.open) {
    creatures.update(dt, player.position.x, player.position.z, daynight.night, camera.position);
    // The great dragon lifting its head under the player carries them up.
    const p = player.position, ly = creatures.wyrm.liftOut(p.x - 0.3, p.x + 0.3, p.y, p.z - 0.3, p.z + 0.3, 1.8);
    if (ly !== p.y) { p.y = ly; player.velocity.y = Math.max(0, player.velocity.y); }
  }
  if (spawned) discovery.update(dt, player.position.x, player.position.z);
  legendBoard?.update(dt);
  subtitle.update(dt);
  if (spawned) {
    camera.getWorldDirection(camFwd);
    eldritch.update(dt, camera.position, camFwd, daynight.night, focusSample);
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
