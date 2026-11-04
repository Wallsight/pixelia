// Living world: spawns animals around the player by biome, runs their simple
// behaviours and streams the poses into one instanced mesh per species.
// Creatures ignore the player entirely.

import * as THREE from 'three';
import { createCreatureMaterial, type EnvUniforms } from '../render/materials';
import { LAYER_CREATURE_CASTER } from '../render/shadows';
import { B, COLLIDES, HEIGHT, HEIGHT8, KIND, KIND_LEAVES, KIND_PLANT, SEA, isLiquid } from '../world/blocks';
import { BIOME } from '../world/biomes';
import type { Terrain } from '../world/terrain';
import type { World } from '../world/world';
import { buildRig, type Box } from './rig';
import * as M from './models';
import { NpcDirector, type NpcHost, type NpcState, type Role } from './npcs';
import { FireFx } from '../render/fire';
import { hash01 } from '../engine/noise';
import { NightDirector, type Fighter, type FighterKind, type NightHost, type NightSound } from './night';
import { GREAT_DRAGON, GREAT_SCALE, WyrmDirector, type WyrmHost } from './wyrm';
import { WarDirector, type WarHost } from './war';
import { OrcDirector } from './orcs';
import { WatchDirector } from './watch';
import { RareDirector } from './rare';
import { nick } from './banter';

const TAU = Math.PI * 2;
const DESPAWN = 104;
/** Ridden war dragons (the dance of dragons). */
const RIDER_DRAGON = 'riderdragon';

type Habitat = 'ground' | 'air' | 'water' | 'flutter' | 'dragon' | 'npc' | 'monster' | 'hero' | 'wyrm' | 'orc';

interface SpeciesDef {
  name: string;
  model: () => Box[];
  max: number;
  habitat: Habitat;
  biomes: number[];
  group: [number, number];
  speed: number;
  scale: [number, number];
  tints: string[];
  shadow: boolean;
  /** Only spawn in daylight (1), at night (-1) or always (0). */
  time: number;
  /** Drawn see-through (ghosts). */
  translucent?: boolean;
}

const GREEN = [BIOME.PLAINS, BIOME.FOREST, BIOME.BIRCH_FOREST];
const SPECIES: SpeciesDef[] = [
  { name: 'deer', model: M.deer, max: 12, habitat: 'ground', biomes: [...GREEN, BIOME.TAIGA], group: [2, 4], speed: 1.6, scale: [0.85, 1.1], tints: ['#ffffff', '#f2e4d6', '#e8dccc'], shadow: true, time: 0 },
  { name: 'rabbit', model: M.rabbit, max: 14, habitat: 'ground', biomes: [...GREEN, BIOME.TAIGA, BIOME.TUNDRA, BIOME.DESERT], group: [1, 3], speed: 2.4, scale: [0.9, 1.1], tints: ['#b89a7e', '#9c8470', '#d8c8b4'], shadow: true, time: 0 },
  { name: 'boar', model: M.boar, max: 8, habitat: 'ground', biomes: [BIOME.FOREST, BIOME.TAIGA, BIOME.BIRCH_FOREST, BIOME.GLOOM], group: [2, 3], speed: 1.4, scale: [0.9, 1.15], tints: ['#ffffff', '#d8ccc4'], shadow: true, time: 0 },
  { name: 'bird', model: M.bird, max: 30, habitat: 'air', biomes: [...GREEN, BIOME.TAIGA, BIOME.BEACH, BIOME.STONY_SHORE, BIOME.OCEAN, BIOME.RIVER, BIOME.MOUNTAINS, BIOME.DESERT, BIOME.BADLANDS, BIOME.TUNDRA, BIOME.GLOOM], group: [6, 10], speed: 7, scale: [0.9, 1.2], tints: ['#f4f4f0', '#6a6a78', '#3c3640', '#c8a688'], shadow: true, time: 1 },
  { name: 'fish', model: M.fish, max: 24, habitat: 'water', biomes: [BIOME.OCEAN, BIOME.RIVER, BIOME.BEACH, BIOME.STONY_SHORE, BIOME.ELDRITCH_SEA, BIOME.FROZEN_OCEAN], group: [3, 6], speed: 1.3, scale: [1.1, 1.6], tints: ['#ff7a3a', '#5ab0f0', '#ffd030', '#ff6a8a', '#e8f0f8'], shadow: false, time: 0 },
  { name: 'butterfly', model: M.butterfly, max: 16, habitat: 'flutter', biomes: [...GREEN], group: [2, 4], speed: 1.2, scale: [1, 1.3], tints: ['#ffb0c8', '#ffe07a', '#a8d8ff', '#ffffff', '#ff9a5a'], shadow: false, time: 1 },
  { name: 'firefly', model: M.firefly, max: 48, habitat: 'flutter', biomes: [...GREEN, BIOME.TAIGA, BIOME.GLOOM, BIOME.RIVER], group: [6, 12], speed: 0.6, scale: [1.5, 1.8], tints: ['#ffffff'], shadow: false, time: -1 },
  { name: 'dragon', model: M.dragon, max: 3, habitat: 'dragon', biomes: [], group: [1, 1], speed: 16, scale: [0.8, 1.15], tints: ['#ffffff', '#a8c4ff', '#c8f0a8', '#ffd08a'], shadow: true, time: 0 },
  // Ridden war dragons: only in the sky duels (never spawned on their own).
  { name: RIDER_DRAGON, model: M.riderDragon, max: 2, habitat: 'dragon', biomes: [], group: [1, 1], speed: 17, scale: [1.05, 1.15], tints: ['#ffffff'], shadow: true, time: 0 },
  // The one great dragon, asleep in its lair (placed by the wyrm director).
  { name: GREAT_DRAGON, model: M.greatDragon, max: 1, habitat: 'wyrm', biomes: [], group: [1, 1], speed: 0, scale: [GREAT_SCALE, GREAT_SCALE], tints: ['#ffffff'], shadow: true, time: 0 },
  // People (spawned by the NPC director, not by biome).
  ...([['villager', M.villager, 40], ['farmer', M.farmer, 16], ['merchant', M.merchant, 20], ['elder', M.elder, 12],
    ['guard', M.guard, 14], ['kid', M.kid, 20], ['traveler', M.traveler, 6], ['bard', M.bard, 2], ['crier', M.crier, 2]] as Array<[Role, () => Box[], number]>).map(([name, model, max]): SpeciesDef => ({
    name, model, max, habitat: 'npc', biomes: [], group: [1, 1], speed: 1.3, scale: [1, 1], tints: ['#ffffff'], shadow: true, time: 0,
  })),
  // Night monsters and adventurers (spawned by the night director).
  ...([['skeleton', M.skeleton, 12, ['#ffffff']], ['zombie', M.zombie, 12, ['#5a6a7a', '#6a5a4a', '#4a5a4a', '#7a6a6a']],
    ['demon', M.demon, 6, ['#ffffff']], ['spider', M.spider, 8, ['#3a3038', '#2a2a2e', '#4a3a2e']], ['ghost', M.ghost, 8, ['#ffffff']],
    ['troll', M.troll, 4, ['#c8c8b8', '#b8c0a8']], ['wisp', M.wisp, 10, ['#ffffff', '#c8ffd8']],
    ['deepone', M.deepone, 10, ['#5a8a7a', '#4a7a6a', '#6a8a6a', '#5a7a8a']],
    ['warrior', M.warrior, 6, ['#ffffff']], ['archer', M.archer, 6, ['#ffffff']], ['mage', M.mage, 5, ['#ffffff']],
    // Castle garrisons (spawned by the war director).
    ['soldier', M.soldier, 24, ['#ffffff']], ['bowman', M.bowman, 14, ['#ffffff']], ['captain', M.captain, 3, ['#ffffff']],
  ] as Array<[FighterKind, () => Box[], number, string[]]>).map(([name, model, max, tints]): SpeciesDef => ({
    name, model, max, habitat: ['warrior', 'archer', 'mage', 'soldier', 'bowman', 'captain'].includes(name) ? 'hero' : 'monster', biomes: [], group: [1, 1], speed: 1,
    scale: name === 'demon' ? [1.15, 1.3] : name === 'spider' ? [0.9, 1.2] : name === 'troll' ? [1, 1.15] : [0.95, 1.05],
    tints, shadow: name !== 'ghost' && name !== 'wisp', time: 0, translucent: name === 'ghost',
  })),
  // Orc camps and their wolves (spawned by the orc director).
  ...([['orc', M.orc, 26, [1.08, 1.16]], ['orcspear', M.orcspear, 12, [1.04, 1.12]], ['shaman', M.shaman, 3, [0.98, 1.04]],
    ['chief', M.chief, 1, [1.3, 1.3]], ['orcwork', M.orcwork, 12, [0.96, 1.04]], ['wolf', M.wolf, 8, [1.0, 1.15]],
  ] as Array<[FighterKind, () => Box[], number, [number, number]]>).map(([name, model, max, scale]): SpeciesDef => ({
    name, model, max, habitat: 'orc', biomes: [], group: [1, 1], speed: 1, scale, tints: ['#ffffff'], shadow: true, time: 0,
  })),
];

const SHIRTS = ['#c85a5a', '#5a8ac8', '#6aa86a', '#d8b04a', '#9a6ac0', '#e08a50', '#4aa8a0', '#d07090', '#f0e8d8', '#7a8a9a'];
const TROUSERS = ['#5a4a3a', '#3a4a6a', '#6a5a4a', '#4a4a4a', '#7a6a50', '#2e3a4a'];
const HAIR = ['#2a1e16', '#4a3020', '#7a5030', '#c8a060', '#e0d0b0', '#a03a20', '#1a1a1a', '#9a9a9a'];

export interface Creature {
  sp: number;
  x: number; y: number; z: number;
  yaw: number; pitch: number; roll: number;
  vx: number; vy: number; vz: number;
  scale: number;
  tint: THREE.Color;
  state: number;
  timer: number;
  tx: number; ty: number; tz: number;
  walk: number; walkAmp: number;
  flap: number; flapAmp: number;
  head: number; tail: number; glow: number; bob: number;
  seed: number;
  flock: Flock | null;
  /** Cached ground under the creature. */
  col: number; ground: number;
  /** People only. */
  npc?: NpcState;
  /** Monsters and adventurers only. */
  fighter?: Fighter;
  /** Seconds since death (0 = alive). */
  dying: number;
  /** Removed from the world (stale references must let go). */
  gone: boolean;
  /** Dragons: their quarry, what to do after landing, a spare timer. Prey: being eaten. */
  prey: Creature | null;
  intent: number;
  aux: number;
  held: boolean;
  tint2: THREE.Color; tint3: THREE.Color; skin: number;
}

interface Flock { x: number; y: number; z: number; tx: number; tz: number; alt: number; timer: number; members: number }

interface SpeciesRuntime {
  def: SpeciesDef;
  mesh: THREE.InstancedMesh;
  depth: THREE.InstancedMesh | null;
  anim: THREE.InstancedBufferAttribute;
  pose: THREE.InstancedBufferAttribute;
  tint: THREE.InstancedBufferAttribute;
  tint2: THREE.InstancedBufferAttribute;
  tint3: THREE.InstancedBufferAttribute;
  list: Creature[];
}

/** Dragons circle and land no closer than this to the city centre. */
const CITY_AIRSPACE = 185;

const enum S { IDLE, WALK, GRAZE, CIRCLE, DESCEND, PERCH, CLIMB, LEAP, SLEEP, HUNT, BREATHE, FEED, FLEE, RAID, ESCAPE, DUEL }

/** Things the soundscape wants to hear about. */
export type SoundEvent = 'roar' | 'kill' | 'say' | 'leap' | 'splash';
export type DragonMode = 'fly' | 'breathe' | 'sleep' | 'ground';
/** What a landing dragon does once down. */
const enum I { PERCH, SLEEP, FEED }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pickOf = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const CHAR = new THREE.Color(0.06, 0.05, 0.05);
const angleTo = (from: number, to: number) => {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

export class Creatures implements NpcHost, NightHost, WyrmHost, WarHost {
  readonly group = new THREE.Group();
  readonly npcs: NpcDirector;
  readonly nightDir: NightDirector;
  readonly wyrm: WyrmDirector;
  readonly war: WarDirector;
  readonly orcs: OrcDirector;
  readonly watch: WatchDirector;
  readonly rare: RareDirector;
  /** Party chat (set by main): a line from an adventurer near the player. */
  onPartyChat: ((party: string, who: string, text: string) => void) | null = null;
  /** Big on-screen notices (set by main). */
  onAnnounce: ((kicker: string, title: string, sub: string) => void) | null = null;
  readonly fire = new FireFx();
  private species: SpeciesRuntime[] = [];
  private spawnTimer = 0;
  private spawnCursor = 0;
  private time = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private dragonCooldown = 0;
  private px = 0; private pz = 0; private night = 0;
  private npcCache: Creature[] | null = null;
  /** Sound hook (set by the soundscape). */
  onSound: ((ev: SoundEvent | NightSound, c: Creature, text?: string) => void) | null = null;

  constructor(env: EnvUniforms, shadows: boolean, private world: World, private terrain: Terrain) {
    const mat = createCreatureMaterial(env, shadows);
    const depthMat = createCreatureMaterial(env, false, true);
    const glassMat = createCreatureMaterial(env, false, false, true);
    for (const def of SPECIES) {
      const geo = buildRig(def.model());
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(def.max * 4), 4).setUsage(THREE.DynamicDrawUsage);
      const pose = new THREE.InstancedBufferAttribute(new Float32Array(def.max * 4), 4).setUsage(THREE.DynamicDrawUsage);
      const tint = new THREE.InstancedBufferAttribute(new Float32Array(def.max * 3), 3).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aAnim', anim);
      geo.setAttribute('aPose', pose);
      geo.setAttribute('aTint', tint);
      const tint2 = new THREE.InstancedBufferAttribute(new Float32Array(def.max * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
      const tint3 = new THREE.InstancedBufferAttribute(new Float32Array(def.max * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aTint2', tint2);
      geo.setAttribute('aTint3', tint3);
      const mesh = new THREE.InstancedMesh(geo, def.translucent ? glassMat : mat, def.max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
      let depth: THREE.InstancedMesh | null = null;
      if (shadows && def.shadow) {
        depth = new THREE.InstancedMesh(geo, depthMat, def.max);
        depth.instanceMatrix = mesh.instanceMatrix;
        depth.frustumCulled = false;
        depth.count = 0;
        depth.layers.set(LAYER_CREATURE_CASTER);
        this.group.add(depth);
      }
      this.species.push({ def, mesh, depth, anim, pose, tint, tint2, tint3, list: [] });
    }
    this.npcs = new NpcDirector(terrain, this);
    this.npcs.bubbles.onSay = (c, text) => this.onSound?.('say', c, text);
    this.nightDir = new NightDirector(terrain, this);
    this.wyrm = new WyrmDirector(terrain, this);
    this.war = new WarDirector(terrain, this, this.nightDir, env, shadows);
    this.orcs = new OrcDirector(terrain, this, this.nightDir);
    this.watch = new WatchDirector(terrain, this, this.nightDir);
    this.rare = new RareDirector(terrain, this, this.nightDir);
    this.group.add(this.npcs.group, this.fire.group, this.nightDir.group, this.wyrm.group, this.war.group);
  }

  /** Live creatures of one species (read-only; for the soundscape). */
  live(name: string): readonly Creature[] {
    return this.species.find((s) => s.def.name === name)?.list ?? [];
  }

  /** Species name of a creature. */
  nameOf(c: Creature): string { return SPECIES[c.sp].name; }

  dragonMode(c: Creature): DragonMode {
    if (c.state === S.BREATHE) return 'breathe';
    if (c.state === S.SLEEP) return 'sleep';
    if (c.state === S.PERCH || c.state === S.FEED) return 'ground';
    return 'fly';
  }

  /** Counts per species, for the debug overlay. */
  get total(): number { return this.species.reduce((n, s) => n + s.list.length, 0); }

  update(dt: number, px: number, pz: number, night: number, cam: THREE.Vector3): void {
    this.time += dt;
    this.px = px; this.pz = pz; this.night = night;
    this.npcCache = null;
    this.npcs.update(dt, px, pz, night, cam);
    this.nightDir.update(dt, px, pz, night);
    this.war.update(dt, px, pz, night);
    this.orcs.update(dt, px, pz, night);
    this.watch.update(dt, px, pz, night);
    this.rare.update(dt, px, pz);
    this.wyrm.night = night;
    this.wyrm.update(dt, px, cam.y, pz);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.2;
      this.trySpawn(px, pz, night);
    }
    for (const rt of this.species) {
      const list = rt.list;
      for (let i = list.length - 1; i >= 0; i--) {
        const c = list[i];
        const h = rt.def.habitat;
        const far = Math.hypot(c.x - px, c.z - pz) > (h === 'wyrm' ? 340 : h === 'dragon' ? (rt.def.name === RIDER_DRAGON ? 420 : 260) : h === 'npc' ? 240 : h === 'hero' || h === 'orc' ? 200 : h === 'monster' ? (c.fighter?.rare ? 260 : 120) : DESPAWN);
        const wrongTime = (rt.def.time === -1 && night < 0.3) || (rt.def.time === 1 && night > 0.75);
        const alive = c.dying > 0 ? (c.fighter ? this.nightDir.stepDying(c, dt) : this.stepDying(c, dt))
          : !(far || (wrongTime && Math.random() < dt * 0.2) || !this.step(rt.def, c, dt, night));
        if (!alive) {
          c.gone = true;
          if (c.npc) c.npc.remove = true;
          if (c.npc || c.fighter) this.npcs.bubbles.clear(c);
          if (c.flock) c.flock.members--;
          if (rt.def.habitat === 'dragon') { this.dragonCooldown = this.time + 45; if (c.prey) c.prey.held = false; }
          list[i] = list[list.length - 1];
          list.pop();
        }
      }
      this.write(rt);
    }
    this.fire.update(dt, (window.innerHeight * Math.min(window.devicePixelRatio, 1.5)) / 2);
  }

  /** Death: keel over, char and smoulder, then sink into the ground in a puff of smoke. */
  private stepDying(c: Creature, dt: number): boolean {
    c.dying += dt;
    const t = c.held ? Math.min(c.dying, 9) : c.dying;
    if (c.held) c.dying = t;
    c.walkAmp = 0; c.flapAmp = 0; c.bob = 0;
    c.roll += ((Math.PI / 2) * (c.seed > 50 ? 1 : -1) - c.roll) * Math.min(1, dt * 5);
    c.head += (0.5 - c.head) * Math.min(1, dt * 3);
    if (t < 2) c.tint.lerp(CHAR, Math.min(1, dt * 1.5));
    if (t < 6) this.fire.burn(c.x, c.y + 0.4 * c.scale, c.z, dt, 1 - t / 6);
    if (t > 9.5) {
      if (c.aux === 0) { this.fire.puff(c.x, c.y + 0.4, c.z, 14); c.aux = 1; }
      c.y -= dt * 0.35;
      c.scale *= Math.max(0, 1 - dt * 0.9);
    }
    return t < 12;
  }

  // ------------------------------------------------------------ world queries

  private solid(x: number, y: number, z: number): number {
    const b = this.world.getBlock(x, y, z);
    if (b >= 0 && !COLLIDES[b] && this.war.solid(x, y, z)) return 1; // a lowered portcullis
    return b < 0 ? -1 : COLLIDES[b];
  }

  /**
   * Standable surface height for a walker whose feet are at y, or NaN when the
   * column is a wall, a drop, liquid, tree tops or not loaded.
   */
  private walkable(x: number, z: number, y: number): number {
    const ix = Math.floor(x), iz = Math.floor(z), f = Math.floor(y + 0.01);
    const a = this.solid(ix, f, iz);
    if (a < 0) return NaN;
    if (a) {
      if (this.solid(ix, f + 1, iz)) return NaN;
      return this.surfaceOf(ix, f, iz);
    }
    for (let yy = f - 1; yy >= f - 3; yy--) {
      const b = this.world.getBlock(ix, yy, iz);
      if (b < 0 || isLiquid(b)) return NaN;
      if (COLLIDES[b]) return this.surfaceOf(ix, yy, iz);
    }
    return NaN;
  }

  private surfaceOf(ix: number, y: number, iz: number): number {
    const b = this.world.getBlock(ix, y, iz);
    if (KIND[b] === KIND_LEAVES || b === B.CACTUS || b === B.LAVA || b === B.MAGMA) return NaN;
    return y + HEIGHT8[b] / 8;
  }

  /** Top of the column: [height, isLiquid, isLeaves], or null if unloaded. */
  private column(x: number, z: number): [number, boolean, boolean] | null {
    const ix = Math.floor(x), iz = Math.floor(z);
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const b = this.world.getBlock(ix, y, iz);
      if (b < 0) return null;
      if (b === B.AIR || KIND[b] === KIND_PLANT) continue;
      return [y + HEIGHT8[b] / 8, isLiquid(b), KIND[b] === KIND_LEAVES];
    }
    return [0, false, false];
  }

  private waterDepth(x: number, z: number): [number, number] | null {
    const ix = Math.floor(x), iz = Math.floor(z);
    let top = -1;
    for (let y = SEA + 8; y >= 1; y--) {
      const b = this.world.getBlock(ix, y, iz);
      if (b < 0) return null;
      if (b === B.WATER || b === B.DEEP_WATER) { if (top < 0) top = y; continue; }
      if (KIND[b] === KIND_PLANT) continue; // kelp and friends
      if (b === B.AIR) { if (top >= 0) return null; continue; }
      return top >= 0 ? [y + 1, top + 1] : null;
    }
    return null;
  }

  // ------------------------------------------------------------ spawning

  private trySpawn(px: number, pz: number, night: number): void {
    for (let k = 0; k < this.species.length; k++) {
      const idx = (this.spawnCursor + k) % this.species.length;
      const rt = this.species[idx];
      const def = rt.def;
      if (rt.list.length >= def.max || def.habitat === 'npc' || def.habitat === 'monster' || def.habitat === 'hero' || def.habitat === 'wyrm' || def.habitat === 'orc' || def.name === RIDER_DRAGON) continue;
      if ((def.time === 1 && night > 0.6) || (def.time === -1 && night < 0.5)) continue;
      this.spawnCursor = idx + 1;
      if (def.habitat === 'dragon') { this.spawnDragon(rt, px, pz); return; }
      const a = Math.random() * TAU;
      const d = def.habitat === 'flutter' ? rand(14, 48) : rand(28, 72);
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      const s = this.terrain.sample(x, z);
      if (!def.biomes.includes(s.biome)) return;
      // Wild animals keep out of the city.
      const city = this.terrain.city;
      if (city && def.habitat === 'ground' && Math.hypot(x - city.x, z - city.z) < 110) return;
      // ...and out of garrisoned castles (and off their walls) and orc camps.
      if (def.habitat === 'ground' && this.terrain.structures.guarded(x, z, 3)) return;
      const n = Math.min(def.max - rt.list.length, Math.round(rand(def.group[0], def.group[1])));
      const tint = new THREE.Color(def.tints[Math.floor(Math.random() * def.tints.length)]);
      // Snowy hares.
      if (def.name === 'rabbit' && (s.biome === BIOME.TUNDRA || s.biome === BIOME.TAIGA)) tint.set('#ffffff');
      if (def.name === 'rabbit' && s.biome === BIOME.DESERT) tint.set('#e2c49a');
      if (def.name === 'fish' && s.biome === BIOME.ELDRITCH_SEA) tint.set('#5cc8a8');
      if (def.name === 'bird' && s.biome === BIOME.GLOOM) tint.set('#2c2630');
      let flock: Flock | null = null;
      if (def.habitat === 'air') {
        const col = this.terrain.sample(x, z);
        const alt = Math.max(SEA, col.h) + rand(16, 30);
        flock = { x, y: alt, z, tx: x, tz: z, alt: rand(16, 30), timer: 0, members: 0 };
      }
      for (let i = 0; i < n; i++) {
        const cx = x + rand(-3, 3), cz = z + rand(-3, 3);
        let y: number;
        if (def.habitat === 'ground') {
          const col = this.column(cx, cz);
          if (!col || col[1]) continue;
          y = this.walkable(cx, cz, col[0]);
          if (!Number.isFinite(y)) continue;
        } else if (def.habitat === 'water') {
          const w = this.waterDepth(cx, cz);
          if (!w || w[1] - w[0] < 2) continue;
          y = rand(Math.max(w[0] + 0.4, w[1] - 1.6), w[1] - 0.45);
        } else if (def.habitat === 'flutter') {
          const col = this.column(cx, cz);
          if (!col || col[1]) continue;
          y = col[0] + rand(0.6, 2.4);
        } else {
          y = flock!.y + rand(-2, 2);
        }
        const c = this.make(idx, cx, y, cz, tint, def);
        if (def.habitat === 'water') { c.flap = rand(4, 45); c.glow = 0.12; }
        c.flock = flock;
        if (flock) flock.members++;
        rt.list.push(c);
      }
      return;
    }
  }

  private make(sp: number, x: number, y: number, z: number, tint: THREE.Color, def: SpeciesDef): Creature {
    const t = tint.clone().offsetHSL(rand(-0.02, 0.02), 0, rand(-0.04, 0.04));
    return {
      sp, x, y, z, yaw: Math.random() * TAU, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0,
      scale: rand(def.scale[0], def.scale[1]), tint: t, state: S.IDLE, timer: rand(0.5, 4),
      tx: x, ty: y, tz: z, walk: 0, walkAmp: 0, flap: Math.random() * TAU, flapAmp: 0,
      head: 0, tail: 0, glow: 0, bob: 0, tint2: new THREE.Color(1, 1, 1), tint3: new THREE.Color(1, 1, 1), skin: 0,
      dying: 0, gone: false, prey: null, intent: I.PERCH, aux: 0, held: false, seed: Math.random() * 100, flock: null, col: NaN, ground: y,
    };
  }

  private spawnDragon(rt: SpeciesRuntime, px: number, pz: number): void {
    if (this.dragonCooldown > this.time) return;
    // Appear far out, then sweep in to circle somewhere the player can see.
    const a = Math.random() * TAU;
    const x = px + Math.cos(a) * 200, z = pz + Math.sin(a) * 200;
    const y = Math.max(SEA, this.terrain.sample(x, z).h) + 50;
    const c = this.make(this.species.indexOf(rt), x, y, z, new THREE.Color(pickOf(rt.def.tints)), rt.def);
    this.dragonCooldown = this.time + rand(20, 40);
    c.state = S.CIRCLE;
    c.timer = rand(40, 70);
    // Circle centre between the player and somewhere further out.
    c.tx = px + Math.cos(a + rand(-1, 1)) * rand(40, 90);
    c.tz = pz + Math.sin(a + rand(-1, 1)) * rand(40, 90);
    rt.list.push(c);
  }

  // ------------------------------------------------------------ behaviours

  /** Returns false when the creature should be removed. */
  private step(def: SpeciesDef, c: Creature, dt: number, night: number): boolean {
    switch (def.habitat) {
      case 'ground': return this.stepGround(def, c, dt, night);
      case 'air': return this.stepBird(def, c, dt);
      case 'water': return this.stepFish(def, c, dt);
      case 'flutter': return this.stepFlutter(def, c, dt, night);
      case 'dragon': return this.stepDragon(def, c, dt);
      case 'npc': return this.npcs.step(c, dt, night);
      case 'monster': return c.fighter?.rare ? this.rare.step(c, dt) : this.nightDir.step(c, dt);
      case 'hero': return c.fighter?.garrison ? this.war.step(c, dt) : c.fighter?.watch ? this.watch.step(c, dt) : c.fighter?.rare ? this.rare.step(c, dt) : this.nightDir.step(c, dt);
      case 'wyrm': return this.wyrm.step(c, dt);
      case 'orc': return this.orcs.step(c, dt);
    }
  }

  private stepGround(def: SpeciesDef, c: Creature, dt: number, night: number): boolean {
    const hop = def.name === 'rabbit';
    c.timer -= dt;
    if (c.timer <= 0) {
      const r = Math.random();
      if (c.state === S.FLEE) { /* keep running until the timer runs out */ } else if (c.state !== S.WALK && r < (night > 0.5 ? 0.3 : 0.55)) {
        c.state = S.WALK;
        const a = Math.random() * TAU, d = rand(4, hop ? 8 : 14);
        c.tx = c.x + Math.cos(a) * d; c.tz = c.z + Math.sin(a) * d;
        c.timer = 12;
      } else if (r < 0.8 && !hop) {
        c.state = S.GRAZE; c.timer = rand(3, 8);
      } else {
        c.state = S.IDLE; c.timer = rand(2, 6);
      }
    }
    let speed = 0;
    if (c.state === S.FLEE && c.timer <= 0) { c.state = S.IDLE; c.timer = rand(1, 3); }
    if (c.state === S.WALK || c.state === S.FLEE) {
      const dx = c.tx - c.x, dz = c.tz - c.z, dist = Math.hypot(dx, dz);
      if (dist < 0.4) { c.state = S.IDLE; c.timer = rand(1, 4); }
      else {
        const want = Math.atan2(dx, dz);
        c.yaw += angleTo(c.yaw, want) * Math.min(1, dt * 4);
        speed = def.speed * Math.max(0, Math.cos(angleTo(c.yaw, want))) * (c.state === S.FLEE ? 2.6 : 1);
        // Rabbits move in bursts.
        if (hop) speed *= Math.max(0, Math.sin(c.walk * 0.5)) * 1.8;
        const nx = c.x + Math.sin(c.yaw) * speed * dt, nz = c.z + Math.cos(c.yaw) * speed * dt;
        // Probe slightly ahead so the body does not clip into walls.
        const probe = this.groundAt(c, c.x + Math.sin(c.yaw) * 0.6, c.z + Math.cos(c.yaw) * 0.6);
        if (Number.isFinite(probe) && probe - c.y <= 1.05 && c.y - probe <= 2.5) {
          c.x = nx; c.z = nz;
        } else {
          c.state = S.IDLE; c.timer = rand(0.5, 2);
          speed = 0;
        }
      }
    }
    const g = this.groundAt(c, c.x, c.z);
    if (!Number.isFinite(g)) return Math.abs(c.ground - c.y) < 50; // unloaded: hold position
    c.ground = g;
    if (g > c.y) c.y = Math.min(g, c.y + dt * 6);
    else { c.vy -= 20 * dt; c.y = Math.max(g, c.y + c.vy * dt); if (c.y === g) c.vy = 0; }

    c.walk += speed * dt * (hop ? 9 : 5.5) / c.scale;
    if (hop) c.walk += c.state === S.WALK && speed <= 0 ? dt * 6 : 0;
    c.bob = hop && speed > 0 ? Math.abs(Math.sin(c.walk * 0.5)) * 0.35 : 0;
    c.walkAmp += ((speed > 0.05 ? 0.6 : 0) - c.walkAmp) * Math.min(1, dt * 8);
    c.head += ((c.state === S.GRAZE ? 0.95 : Math.sin(this.time * 0.7 + c.seed) * 0.1) - c.head) * Math.min(1, dt * 3);
    c.tail = Math.sin(this.time * (def.name === 'deer' ? 9 : 4) + c.seed) * (def.name === 'deer' ? 0.25 : 0.4);
    c.pitch = 0;
    if (hop) c.vy = 0;
    return true;
  }

  /** Ground height under (x, z), cached per column. */
  private groundAt(c: Creature, x: number, z: number): number {
    const key = Math.floor(x) * 73856093 ^ Math.floor(z) * 19349663;
    if (x === c.x && z === c.z && key === c.col) return c.ground;
    const g = this.walkable(x, z, c.y);
    if (x === c.x && z === c.z) c.col = Number.isFinite(g) ? key : NaN;
    return g;
  }

  private stepBird(def: SpeciesDef, c: Creature, dt: number): boolean {
    const f = c.flock!;
    // The first member to update each frame moves the flock target.
    if (f.timer <= this.time) {
      f.timer = this.time + rand(6, 12);
      const a = Math.random() * TAU;
      f.tx = f.x + Math.cos(a) * 60; f.tz = f.z + Math.sin(a) * 60;
      const h = Math.max(SEA, this.terrain.sample(f.tx, f.tz).h, this.terrain.sample(f.x, f.z).h);
      f.y = h + f.alt;
    }
    // Flock anchor drifts toward its target.
    const fx = f.tx - f.x, fz = f.tz - f.z, fd = Math.hypot(fx, fz) || 1;
    f.x += (fx / fd) * def.speed * 0.8 * dt / Math.max(1, f.members);
    f.z += (fz / fd) * def.speed * 0.8 * dt / Math.max(1, f.members);

    // Steering: seek a loose orbit around the anchor, plus a little noise.
    const ox = f.x + Math.cos(this.time * 0.6 + c.seed) * 5 - c.x;
    const oz = f.z + Math.sin(this.time * 0.6 + c.seed) * 5 - c.z;
    const oy = f.y + Math.sin(this.time * 0.9 + c.seed * 3) * 2 - c.y;
    c.vx += (ox * 0.6 - c.vx) * dt * 1.2;
    c.vz += (oz * 0.6 - c.vz) * dt * 1.2;
    c.vy += (oy * 0.5 - c.vy) * dt * 1.5;
    const sp = Math.hypot(c.vx, c.vz);
    const max = def.speed;
    if (sp > max) { c.vx *= max / sp; c.vz *= max / sp; }
    if (sp < 2.5) { const k = 2.5 / (sp || 1); c.vx = (c.vx || Math.sin(c.yaw)) * k; c.vz = (c.vz || Math.cos(c.yaw)) * k; }
    c.vy = Math.max(-3, Math.min(3, c.vy));
    c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    const want = Math.atan2(c.vx, c.vz);
    const turn = angleTo(c.yaw, want);
    c.yaw += turn * Math.min(1, dt * 5);
    c.roll += (-turn * 1.2 - c.roll) * Math.min(1, dt * 4);
    c.pitch = Math.atan2(c.vy, Math.hypot(c.vx, c.vz)) * 0.6;
    // Flap in bursts, glide in between.
    const gliding = Math.sin(this.time * 0.8 + c.seed) > 0.3 && c.vy < 0.5;
    c.flapAmp += ((gliding ? 0.08 : 0.9) - c.flapAmp) * Math.min(1, dt * 5);
    c.flap += dt * (gliding ? 2 : 16);
    return true;
  }

  private stepFish(def: SpeciesDef, c: Creature, dt: number): boolean {
    if (c.state === S.LEAP) {
      // Ballistic arc out of the water, nose following the velocity.
      c.vy -= 14 * dt;
      c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
      c.pitch = Math.atan2(c.vy, Math.hypot(c.vx, c.vz));
      c.tail = Math.sin(this.time * 30) * 0.6;
      if (c.vy < 0 && c.y <= c.ty) {
        this.onSound?.('splash', c);
        c.state = S.IDLE; c.pitch = 0; c.timer = 0; c.vx = c.vz = c.vy = 0;
        c.y = c.ty;
      }
      return true;
    }
    c.flap -= dt; // reused as the leap cooldown
    if (c.flap <= 0) {
      c.flap = rand(15, 45);
      const w = this.waterDepth(c.x, c.z);
      if (w && w[1] - w[0] >= 1.5) {
        c.state = S.LEAP;
        c.ty = w[1] - 0.6;
        c.y = Math.max(c.y, w[1] - 0.8);
        const sp = rand(2, 3);
        c.vx = Math.sin(c.yaw) * sp; c.vz = Math.cos(c.yaw) * sp; c.vy = rand(4.5, 6);
        this.onSound?.('leap', c);
        return true;
      }
    }
    c.timer -= dt;
    if (c.timer <= 0) {
      c.timer = rand(2, 6);
      const a = c.yaw + rand(-1.6, 1.6), d = rand(2, 6);
      c.tx = c.x + Math.sin(a) * d; c.tz = c.z + Math.cos(a) * d;
      const w = this.waterDepth(c.tx, c.tz);
      if (!w || w[1] - w[0] < 1.5) { c.tx = c.x - Math.sin(c.yaw) * 3; c.tz = c.z - Math.cos(c.yaw) * 3; c.ty = c.y; }
      // Stay in the upper water so they show through the surface.
      else c.ty = rand(Math.max(w[0] + 0.4, w[1] - 1.6), w[1] - 0.45);
    }
    const dx = c.tx - c.x, dz = c.tz - c.z, dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    c.yaw += angleTo(c.yaw, want) * Math.min(1, dt * 2.5);
    const sp = dist > 0.3 ? def.speed * (0.6 + 0.4 * Math.sin(this.time * 2 + c.seed)) : 0;
    const nx = c.x + Math.sin(c.yaw) * sp * dt, nz = c.z + Math.cos(c.yaw) * sp * dt;
    const b = this.world.getBlock(Math.floor(nx), Math.floor(c.y), Math.floor(nz));
    if (b === B.WATER || b === B.DEEP_WATER) { c.x = nx; c.z = nz; }
    else if (b === -1) return true;
    else c.timer = 0;
    c.y += (c.ty - c.y) * Math.min(1, dt * 0.8);
    c.tail = Math.sin(this.time * (6 + sp * 6) + c.seed) * 0.5;
    return true;
  }

  private stepFlutter(def: SpeciesDef, c: Creature, dt: number, night: number): boolean {
    const fly = def.name === 'firefly';
    c.timer -= dt;
    if (c.timer <= 0) {
      c.timer = rand(1, fly ? 4 : 2.5);
      const a = Math.random() * TAU;
      c.tx = c.x + Math.cos(a) * rand(1, 4); c.tz = c.z + Math.sin(a) * rand(1, 4);
      const col = this.column(c.tx, c.tz);
      if (!col) { c.tx = c.x; c.tz = c.z; }
      else c.ty = col[0] + rand(0.5, fly ? 3 : 2.2);
    }
    c.vx += ((c.tx - c.x) * 0.8 - c.vx) * dt * 2 + rand(-1, 1) * dt * 3;
    c.vz += ((c.tz - c.z) * 0.8 - c.vz) * dt * 2 + rand(-1, 1) * dt * 3;
    c.vy += ((c.ty - c.y) * 1.2 - c.vy) * dt * 2 + rand(-1, 1) * dt * (fly ? 1 : 4);
    const sp = Math.hypot(c.vx, c.vz);
    if (sp > def.speed) { c.vx *= def.speed / sp; c.vz *= def.speed / sp; }
    c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    if (sp > 0.05) c.yaw += angleTo(c.yaw, Math.atan2(c.vx, c.vz)) * Math.min(1, dt * 6);
    if (fly) {
      const pulse = Math.max(0, Math.sin(this.time * 1.7 + c.seed * 5));
      c.glow = night * (0.25 + 1.4 * pulse * pulse);
    } else {
      c.flap += dt * 22;
      c.flapAmp = 1.1;
    }
    return true;
  }

  /** Dragons keep out of the city's airspace: push a circle centre clear of it. */
  private clearOfCity(c: Creature): void {
    const city = this.terrain.city;
    if (!city) return;
    const dx = c.tx - city.x, dz = c.tz - city.z, d = Math.hypot(dx, dz);
    if (d >= CITY_AIRSPACE) return;
    const a = d > 1 ? Math.atan2(dz, dx) : Math.random() * TAU;
    c.tx = city.x + Math.cos(a) * CITY_AIRSPACE; c.tz = city.z + Math.sin(a) * CITY_AIRSPACE;
  }

  private stepDragon(def: SpeciesDef, c: Creature, dt: number): boolean {
    c.timer -= dt;
    const t = this.time;
    if (c.state === S.CIRCLE) {
      this.clearOfCity(c);
      // Banking orbit around (tx, tz) with a slowly wandering radius.
      const r = 42 + Math.sin(t * 0.13 + c.seed) * 14;
      const ang = Math.atan2(c.z - c.tz, c.x - c.tx) + 0.6;
      const gx = c.tx + Math.cos(ang) * r, gz = c.tz + Math.sin(ang) * r;
      const ground = Math.max(SEA, this.terrain.sample(c.x, c.z).h, this.terrain.sample(gx, gz).h);
      this.fly(c, gx, ground + 38 + Math.sin(t * 0.3) * 8, gz, def.speed, dt);
      if (c.timer <= 0) {
        const r = Math.random();
        const prey = r < 0.45 ? this.findPrey(c) : null;
        if (prey) { c.prey = prey; c.state = S.HUNT; c.timer = 40; this.onSound?.('roar', c); }
        else { c.intent = r < 0.75 || this.night > 0.5 ? I.SLEEP : I.PERCH; this.pickPerch(c); }
      }
    } else if (c.state === S.HUNT) {
      const p = c.prey;
      if (!p || p.gone || p.dying > 0 || c.timer <= 0) { c.prey = null; c.state = S.CIRCLE; c.timer = rand(30, 60); return true; }
      const dx = p.x - c.x, dz = p.z - c.z, hd = Math.hypot(dx, dz) || 1;
      // Swoop in low, slowing as it closes.
      this.fly(c, p.x - (dx / hd) * 14, p.y + 11, p.z - (dz / hd) * 14, Math.max(7, Math.min(def.speed, hd * 0.5)), dt);
      if (hd < 24 && c.y - p.y < 18) { c.state = S.BREATHE; c.timer = 2.8; }
    } else if (c.state === S.BREATHE) {
      const p = c.prey;
      // Hover, nose down, and breathe fire at the quarry.
      c.flapAmp += (1.0 - c.flapAmp) * Math.min(1, dt * 4);
      c.flap += dt * 5;
      c.pitch += (-0.25 - c.pitch) * Math.min(1, dt * 2);
      c.roll += (0 - c.roll) * Math.min(1, dt * 3);
      if (p && !p.gone) {
        c.yaw += angleTo(c.yaw, Math.atan2(p.x - c.x, p.z - c.z)) * Math.min(1, dt * 3);
        const m = this.mouth(c);
        const fx = p.x - m.x, fy = p.y + 0.4 - m.y, fz = p.z - m.z, fd = Math.hypot(fx, fy, fz) || 1;
        c.head += (Math.min(1.1, Math.max(-0.2, Math.atan2(-fy, Math.hypot(fx, fz)) + c.pitch)) - c.head) * Math.min(1, dt * 3);
        if (c.timer < 2.3) this.fire.breathe(m.x, m.y, m.z, fx / fd, fy / fd, fz / fd, dt);
        if (c.timer < 1.5 && p.dying === 0 && fd < 30) this.kill(p);
      }
      c.x += Math.sin(c.yaw) * 2 * dt; c.z += Math.cos(c.yaw) * 2 * dt;
      if (c.timer <= 0) {
        if (p && p.dying > 0 && this.landBeside(c, p)) { c.intent = I.FEED; p.held = true; }
        else { c.prey = null; c.state = S.CLIMB; c.timer = 5; c.ty = c.y; }
      }
    } else if (c.state === S.SLEEP) {
      // Curled up: wings folded, head on the ground, slow breathing, the odd puff of smoke.
      c.flapAmp += (1.1 - c.flapAmp) * Math.min(1, dt * 2);
      c.flap += (-Math.PI / 2 - c.flap) * Math.min(1, dt * 2);
      c.head += (0.62 - c.head) * Math.min(1, dt * 1.5);
      c.tail += (0.55 - c.tail) * Math.min(1, dt);
      c.pitch += (0 - c.pitch) * Math.min(1, dt * 3);
      c.roll += (0 - c.roll) * Math.min(1, dt * 3);
      // Lie down: the body settles onto the ground (the legs fold away under it).
      c.bob += ((-1.45 + Math.sin(t * 1.1) * 0.08) * c.scale - c.bob) * Math.min(1, dt * 1.2);
      c.aux -= dt;
      if (c.aux <= 0) {
        c.aux = rand(4, 7);
        const m = this.mouth(c);
        this.fire.puff(m.x, m.y, m.z, 5);
        if (Math.hypot(c.x - this.px, c.z - this.pz) < 45) this.npcs.bubbles.say(c, 'Zzz...', 3);
      }
      if (c.timer <= 0) { c.state = S.CLIMB; c.timer = 5; c.flap = 0; if (Math.random() < 0.6) this.onSound?.('roar', c); }
    } else if (c.state === S.FEED) {
      const p = c.prey;
      c.flapAmp += (1.0 - c.flapAmp) * Math.min(1, dt * 2);
      c.flap += (-Math.PI / 2 - c.flap) * Math.min(1, dt * 2);
      c.pitch += (0.1 - c.pitch) * Math.min(1, dt * 3);
      c.roll += (0 - c.roll) * Math.min(1, dt * 3);
      if (p) c.yaw += angleTo(c.yaw, Math.atan2(p.x - c.x, p.z - c.z)) * Math.min(1, dt * 2);
      c.head = 0.75 + Math.sin(t * 5) * 0.2;
      c.tail = Math.sin(t * 0.9) * 0.3;
      if (c.timer <= 0 || !p || p.gone) {
        if (p) p.held = false;
        c.prey = null; c.state = S.CLIMB; c.timer = 5; c.flap = 0;
      }
    } else if (c.state === S.DESCEND) {
      const d = Math.hypot(c.tx - c.x, c.tz - c.z);
      const ty = d > 25 ? c.ty + 12 : c.ty;
      this.fly(c, c.tx, ty, c.tz, Math.max(4, Math.min(def.speed, d * 0.6)), dt);
      if (d < 2 && Math.abs(c.y - c.ty) < 1.5) {
        c.state = c.intent === I.SLEEP ? S.SLEEP : c.intent === I.FEED ? S.FEED : S.PERCH;
        c.timer = c.intent === I.SLEEP ? rand(45, 90) : c.intent === I.FEED ? rand(9, 14) : rand(18, 35);
        c.aux = 2;
        c.flap = Math.atan2(Math.sin(c.flap), Math.cos(c.flap)); // unwrap before folding
        c.vx = c.vz = c.vy = 0; c.y = c.ty;
      } else if (c.timer <= 0) { c.state = S.CLIMB; c.timer = 6; }
    } else if (c.state === S.PERCH) {
      // Fold wings, look around, swish the tail.
      c.flapAmp += (1.0 - c.flapAmp) * Math.min(1, dt * 2);
      c.flap += (-Math.PI / 2 - c.flap) * Math.min(1, dt * 2);
      c.head = -0.25 + Math.sin(t * 0.5) * 0.25;
      c.yaw += Math.sin(t * 0.21) * dt * 0.25;
      c.pitch += (0 - c.pitch) * Math.min(1, dt * 3);
      c.roll += (0 - c.roll) * Math.min(1, dt * 3);
      c.tail = Math.sin(t * 0.8) * 0.3;
      c.walkAmp = 0;
      if (c.timer <= 0) { c.state = S.CLIMB; c.timer = 5; c.flap = 0; }
    } else if (c.state === S.RAID) {
      // Harrying a watch tower: circle it close, now and then hang in the air and breathe fire at the top.
      const d = Math.hypot(c.x - c.tx, c.z - c.tz);
      c.aux -= dt;
      if (d < 30 && c.aux < 2.4 && c.aux > 0) {
        c.flapAmp += (1.0 - c.flapAmp) * Math.min(1, dt * 4);
        c.flap += dt * 5;
        c.pitch += (-0.2 - c.pitch) * Math.min(1, dt * 2);
        c.roll += (0 - c.roll) * Math.min(1, dt * 3);
        c.yaw += angleTo(c.yaw, Math.atan2(c.tx - c.x, c.tz - c.z)) * Math.min(1, dt * 3);
        const m = this.mouth(c);
        const fx = c.tx - m.x, fy = c.ty + 1 - m.y, fz = c.tz - m.z, fd = Math.hypot(fx, fy, fz) || 1;
        c.head += (Math.min(1.1, Math.max(-0.2, Math.atan2(-fy, Math.hypot(fx, fz)) + c.pitch)) - c.head) * Math.min(1, dt * 3);
        if (c.aux < 2.0) this.fire.breathe(m.x, m.y, m.z, fx / fd, fy / fd, fz / fd, dt, 0.8);
        c.y += (c.ty + 9 - c.y) * Math.min(1, dt * 0.8);
      } else {
        if (c.aux <= 0) c.aux = rand(6, 10);
        const ang = Math.atan2(c.z - c.tz, c.x - c.tx) + 0.5;
        const r = d > 40 ? 18 : 17 + Math.sin(this.time * 0.4 + c.seed) * 3;
        this.fly(c, c.tx + Math.cos(ang) * r, c.ty + 10 + Math.sin(this.time * 0.7) * 2, c.tz + Math.sin(ang) * r, d > 40 ? def.speed : 7, dt);
      }
      if (c.timer <= 0) this.dragonFlee(c);
    } else if (c.state === S.DUEL) {
      // The dance: both riders wheel round the same point, each chasing the other's tail;
      // now and then one turns in and breathes fire across the other's path.
      const o = c.prey;
      const ang = Math.atan2(c.z - c.tz, c.x - c.tx) + 0.45;
      const r = 30 + Math.sin(this.time * 0.37 + c.intent * 2) * 9;
      const y = c.ty + 26 + Math.sin(this.time * 0.5 + c.intent * 3) * 7;
      c.aux -= dt;
      if (o && !o.gone && c.aux < 1.8 && c.aux > 0) {
        // Breath: bank towards the other and let fly.
        this.fly(c, o.x, o.y + 1, o.z, def.speed * 0.8, dt);
        const m = this.mouth(c);
        const fx = o.x - m.x, fy = o.y + 3 - m.y, fz = o.z - m.z, fd = Math.hypot(fx, fy, fz) || 1;
        if (fd < 45) this.fire.breathe(m.x, m.y, m.z, fx / fd, fy / fd, fz / fd, dt, 0.9);
        if (fd < 30 && Math.random() < dt * 2) o.glow = 1.5;
      } else {
        if (c.aux <= 0) {
          c.aux = rand(5, 9);
          if (Math.hypot(c.x - this.px, c.z - this.pz) < 160) this.npcs.bubbles.say(c, Math.random() < 0.6 ? 'Dracarys!' : c.intent ? 'Siyahlar için!' : 'Yeşiller için!', 2.4);
          if (Math.random() < 0.4) this.onSound?.('roar', c);
        }
        this.fly(c, c.tx + Math.cos(ang) * r, y, c.tz + Math.sin(ang) * r, def.speed, dt);
      }
      c.glow *= Math.max(0, 1 - dt * 2);
      if (c.timer <= 0) {
        // The dance ends: one breaks off, wounded; the other roars and follows it away.
        c.state = S.ESCAPE; c.timer = 16;
        if (o && o.state === S.DUEL) { o.timer = 4; this.onSound?.('roar', o); }
      }
    } else if (c.state === S.ESCAPE) {
      // Driven off: away from the tower, climbing hard; then it circles far off.
      const ax = c.x - c.tx, az = c.z - c.tz, l = Math.hypot(ax, az) || 1;
      this.fly(c, c.x + (ax / l) * 60, c.ty + 55, c.z + (az / l) * 60, def.speed * 1.2, dt);
      if (c.timer <= 0) {
        if (def.name === RIDER_DRAGON) return false; // the riders fly home, out of sight
        c.state = S.CIRCLE; c.timer = rand(40, 70); c.tx = c.x + (ax / l) * 160; c.tz = c.z + (az / l) * 160;
      }
    } else if (c.state === S.CLIMB) {
      this.fly(c, c.x + Math.sin(c.yaw) * 30, c.ty + 40, c.z + Math.cos(c.yaw) * 30, def.speed * 0.7, dt);
      if (c.timer <= 0) {
        c.state = S.CIRCLE; c.timer = rand(45, 80);
        c.tx = c.x + rand(-60, 60); c.tz = c.z + rand(-60, 60);
      }
    }
    return true;
  }

  private fly(c: Creature, gx: number, gy: number, gz: number, speed: number, dt: number): void {
    const dx = gx - c.x, dy = gy - c.y, dz = gz - c.z;
    const want = Math.atan2(dx, dz);
    const turn = angleTo(c.yaw, want);
    c.yaw += Math.max(-0.9, Math.min(0.9, turn * 1.5)) * dt;
    c.roll += (-Math.max(-0.7, Math.min(0.7, turn * 1.2)) - c.roll) * Math.min(1, dt * 1.5);
    const h = Math.hypot(dx, dz) || 1;
    const climb = Math.max(-0.5, Math.min(0.6, dy / Math.max(8, h)));
    c.pitch += (climb - c.pitch) * Math.min(1, dt * 1.5);
    const sp = speed * (1 - Math.min(0.5, Math.abs(turn) * 0.3));
    c.x += Math.sin(c.yaw) * Math.cos(c.pitch) * sp * dt;
    c.z += Math.cos(c.yaw) * Math.cos(c.pitch) * sp * dt;
    c.y += Math.sin(c.pitch) * sp * dt + Math.max(-1, Math.min(1, dy * 0.2)) * dt * 3;
    // Slow, heavy wingbeats; stronger while climbing, gliding when diving.
    const effort = c.pitch > 0.1 ? 1 : c.pitch < -0.15 ? 0.15 : 0.55;
    c.flapAmp += (effort * 0.75 - c.flapAmp) * Math.min(1, dt * 2);
    c.flap += dt * (2.2 + effort * 1.4);
    c.head += (-c.pitch * 0.6 - c.head) * Math.min(1, dt * 2);
    c.tail = Math.sin(this.time * 1.1) * 0.12 - c.roll * 0.3;
    c.walk += dt * 0.5;
    c.walkAmp = 0.15;
    c.bob *= Math.max(0, 1 - dt * 2); // stand up again after sleeping
  }

  /**
   * Landing height for the dragon at (x, z): the highest ground under its
   * body (radius ~4.5, any heading), so nothing pokes through it. NaN when
   * the footprint is too uneven, wet, wooded or unloaded, or when terrain
   * around it would swallow the tail or neck while it turns on the spot.
   */
  private perchHeight(x: number, z: number): [number, number] | null {
    let lo = Infinity, hi = -Infinity;
    for (let ox = -4.5; ox <= 4.5; ox += 1.5) {
      for (let oz = -4.5; oz <= 4.5; oz += 1.5) {
        const r2 = ox * ox + oz * oz;
        if (r2 > 4.6 * 4.6) continue;
        const n = this.column(x + ox, z + oz);
        if (!n || n[1]) return null;
        // Leaves near the edge are fine (folded wings brush them); not under the body.
        if (n[2]) { if (r2 <= 3 * 3) return null; continue; }
        lo = Math.min(lo, n[0]); hi = Math.max(hi, n[0]);
      }
    }
    if (hi - lo > 2.5) return null;
    // Tail and neck sweep a ring further out at ~2-4 blocks above the feet.
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      for (const r of [6.5, 9]) {
        const n = this.column(x + Math.cos(a) * r, z + Math.sin(a) * r);
        if (!n) return null;
        if (!n[2] && n[0] > hi + 1.8) return null; // tree crowns may brush the tail
      }
    }
    return [hi, hi - lo];
  }

  /** A grazing animal near the dragon's circle, out in the open. */
  private findPrey(c: Creature): Creature | null {
    let best: Creature | null = null, bd = 1e9;
    const city = this.terrain.city;
    for (const rt of this.species) {
      if (rt.def.habitat !== 'ground') continue;
      for (const a of rt.list) {
        if (a.dying > 0 || (city && Math.hypot(a.x - city.x, a.z - city.z) < 140)) continue;
        const d = Math.hypot(a.x - c.tx, a.z - c.tz);
        if (d < 110 && d < bd) { bd = d; best = a; }
      }
    }
    return best;
  }

  private kill(p: Creature): void {
    p.dying = 1e-4;
    this.onSound?.('kill', p);
    p.state = S.IDLE;
    // Everything nearby bolts.
    for (const rt of this.species) {
      if (rt.def.habitat !== 'ground') continue;
      for (const a of rt.list) {
        if (a === p || a.dying > 0) continue;
        const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz);
        if (d > 22) continue;
        a.state = S.FLEE; a.timer = rand(5, 8);
        a.tx = a.x + (dx / (d || 1)) * 25; a.tz = a.z + (dz / (d || 1)) * 25;
      }
    }
  }

  /** Land a few blocks from a felled animal, if there is room. */
  private landBeside(c: Creature, p: Creature): boolean {
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * TAU, r = 6 + c.scale * 2;
      const x = Math.floor(p.x + Math.cos(a) * r) + 0.5, z = Math.floor(p.z + Math.sin(a) * r) + 0.5;
      const h = this.perchHeight(x, z);
      if (!h) continue;
      c.state = S.DESCEND; c.tx = x; c.tz = z; c.ty = h[0]; c.timer = 30;
      return true;
    }
    return false;
  }

  /** World position of the dragon's mouth (follows head pitch and body pose). */
  private mouth(c: Creature): THREE.Vector3 {
    const ly = 4.45 - 3.1, lz = 7.3 - 2.2, ch = Math.cos(c.head), sh = Math.sin(c.head);
    this.e.set(-c.pitch, c.yaw, c.roll);
    return new THREE.Vector3(0, ly * ch - lz * sh + 3.1, ly * sh + lz * ch + 2.2).multiplyScalar(c.scale).applyEuler(this.e).add(this.v.set(c.x, c.y + c.bob, c.z));
  }

  /** Pick a high, dry, loaded spot near the circle to land on. */
  private pickPerch(c: Creature): void {
    // Cheap pass ranks candidates by height; the full footprint check runs on the best few.
    const cands: Array<[number, number, number]> = [];
    for (let i = 0; i < 48; i++) {
      const a = Math.random() * TAU, d = rand(10, 70);
      const x = Math.floor(c.tx + Math.cos(a) * d) + 0.5, z = Math.floor(c.tz + Math.sin(a) * d) + 0.5;
      const city = this.terrain.city;
      if (city && Math.hypot(x - city.x, z - city.z) < CITY_AIRSPACE - 40) continue;
      const col = this.column(x, z);
      if (col && !col[1] && !col[2]) cands.push([col[0], x, z]);
    }
    cands.sort((p, q) => q[0] - p[0]);
    // Of the highest few, take the flattest (least leg dangling).
    let pick: [number, number, number] | null = null, bestUneven = Infinity;
    for (const [, x, z] of cands.slice(0, 10)) {
      const p = this.perchHeight(x, z);
      if (p && p[1] < bestUneven) { bestUneven = p[1]; pick = [p[0], x, z]; }
    }
    if (!pick) {
      // Nothing here (dense forest, water): drift the circle and try again soon.
      const a = Math.random() * TAU;
      c.tx += Math.cos(a) * 35; c.tz += Math.sin(a) * 35;
      c.timer = 3;
      return;
    }
    c.state = S.DESCEND;
    c.ty = pick[0]; c.tx = pick[1]; c.tz = pick[2];
    c.timer = 40;
  }

  // ------------------------------------------------------------ GPU upload

  private write(rt: SpeciesRuntime): void {
    const { list } = rt;
    const anim = rt.anim.array as Float32Array, pose = rt.pose.array as Float32Array, tint = rt.tint.array as Float32Array;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      this.e.set(-c.pitch, c.yaw, c.roll);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(c.x, c.y + c.bob, c.z), this.q, this.sc.setScalar(c.scale));
      rt.mesh.setMatrixAt(i, this.m);
      anim[i * 4] = c.walk; anim[i * 4 + 1] = c.walkAmp; anim[i * 4 + 2] = c.flap; anim[i * 4 + 3] = c.flapAmp;
      pose[i * 4] = c.head; pose[i * 4 + 1] = c.tail; pose[i * 4 + 2] = c.glow;
      tint[i * 3] = c.tint.r; tint[i * 3 + 1] = c.tint.g; tint[i * 3 + 2] = c.tint.b;
      pose[i * 4 + 3] = c.skin;
      const t2 = rt.tint2.array as Float32Array, t3 = rt.tint3.array as Float32Array;
      t2[i * 3] = c.tint2.r; t2[i * 3 + 1] = c.tint2.g; t2[i * 3 + 2] = c.tint2.b;
      t3[i * 3] = c.tint3.r; t3[i * 3 + 1] = c.tint3.g; t3[i * 3 + 2] = c.tint3.b;
    }
    rt.mesh.count = list.length;
    if (rt.depth) rt.depth.count = list.length;
    if (list.length) {
      rt.mesh.instanceMatrix.needsUpdate = true;
      rt.anim.needsUpdate = true;
      rt.pose.needsUpdate = true;
      rt.tint.needsUpdate = true;
      rt.tint2.needsUpdate = true;
      rt.tint3.needsUpdate = true;
    }
  }

  /** Dev helper: nearest creature of a species to (x, z). */
  nearest(name: string, x: number, z: number): THREE.Vector3 | null {
    const rt = this.species.find((s) => s.def.name === name);
    let best: Creature | null = null, bd = Infinity;
    for (const c of rt?.list ?? []) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best ? new THREE.Vector3(best.x, best.y, best.z) : null;
  }

  // ------------------------------------------------------------ people (NpcHost)

  spawnNpc(role: Role, x: number, z: number, seed: number): Creature | null {
    const idx = this.species.findIndex((s) => s.def.name === role);
    const rt = this.species[idx];
    if (!rt || rt.list.length >= rt.def.max) return null;
    // Scan down from just above the natural ground (not from the sky: eaves and roofs).
    const y = this.walkable(x, z, Math.floor(this.terrain.sample(x, z).h) + 1.5);
    if (!Number.isFinite(y)) return null;
    const r = (k: number) => hash01(Math.floor(seed), 3200 + k, 7, 99);
    const c = this.make(idx, x, y, z, new THREE.Color(SHIRTS[Math.floor(r(1) * SHIRTS.length)]), rt.def);
    c.tint.set(SHIRTS[Math.floor(r(1) * SHIRTS.length)]);
    c.tint2.set(TROUSERS[Math.floor(r(2) * TROUSERS.length)]);
    c.tint3.set(role === 'elder' ? '#d8d8d8' : HAIR[Math.floor(r(3) * HAIR.length)]);
    if (role === 'traveler') c.tint2.set(['#5a6a4a', '#6a4a3a', '#4a5a6a', '#7a6a5a'][Math.floor(r(4) * 4)]);
    if (role === 'guard') { c.tint.set('#5a6aa0'); c.tint2.set('#3a3a4a'); }
    if (role === 'bard') { c.tint.set('#8a4ab0'); c.tint2.set('#3a8a5a'); }
    if (role === 'crier') { c.tint.set('#b03a3a'); c.tint2.set('#2a2430'); }
    c.skin = r(5) * 0.85;
    c.scale = role === 'kid' ? 0.6 + r(6) * 0.08 : 0.94 + r(6) * 0.1;
    rt.list.push(c);
    this.npcCache = null;
    return c;
  }

  /** Everyone, gathered once per frame. */
  allNpcs(): Creature[] {
    if (this.npcCache) return this.npcCache;
    const out: Creature[] = [];
    for (const rt of this.species) if (rt.def.habitat === 'npc') out.push(...rt.list);
    this.npcCache = out;
    return out;
  }

  /** Ground following (step up, fall) without moving sideways. */
  private follow(c: Creature, dt: number): void {
    const g = this.groundAt(c, c.x, c.z);
    if (!Number.isFinite(g)) return;
    c.ground = g;
    if (g > c.y) c.y = Math.min(g, c.y + dt * 6);
    else { c.vy -= 20 * dt; c.y = Math.max(g, c.y + c.vy * dt); if (c.y === g) c.vy = 0; }
  }

  idle(c: Creature, dt: number): void {
    this.follow(c, dt);
    c.walkAmp += (0 - c.walkAmp) * Math.min(1, dt * 8);
    c.flapAmp += (0 - c.flapAmp) * Math.min(1, dt * 6);
  }

  walkToward(c: Creature, tx: number, tz: number, speed: number, dt: number): 'moving' | 'arrived' | 'blocked' {
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    if (d < 0.45) { this.idle(c, dt); return 'arrived'; }
    let want = Math.atan2(dx, dz);
    // Keep a little personal space.
    for (const o of this.allNpcs()) {
      if (o === c) continue;
      const ox = c.x - o.x, oz = c.z - o.z, od = ox * ox + oz * oz;
      if (od < 0.64 && od > 1e-4) want += angleTo(want, Math.atan2(ox, oz)) * 0.15;
    }
    let moved = false;
    for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
      const yaw = c.yaw + angleTo(c.yaw, want + off) * Math.min(1, dt * 6);
      const probe = this.groundAt(c, c.x + Math.sin(yaw) * 0.45, c.z + Math.cos(yaw) * 0.45);
      if (!Number.isFinite(probe) || probe - c.y > 1.05 || c.y - probe > 3) continue;
      c.yaw = yaw;
      const step = Math.min(d, speed * dt * Math.max(0.2, Math.cos(angleTo(c.yaw, want))));
      c.x += Math.sin(c.yaw) * step; c.z += Math.cos(c.yaw) * step;
      c.walk += (step * 5.5) / c.scale;
      moved = true;
      break;
    }
    this.follow(c, dt);
    c.walkAmp += ((moved ? 0.65 : 0) - c.walkAmp) * Math.min(1, dt * 8);
    return moved ? 'moving' : 'blocked';
  }

  // ------------------------------------------------------------ night (NightHost)

  spawnFighter(kind: FighterKind, x: number, z: number): Creature | null {
    const idx = this.species.findIndex((s) => s.def.name === kind);
    const rt = this.species[idx];
    if (!rt || rt.list.length >= rt.def.max) return null;
    const col = this.column(x, z);
    if (!col || col[1]) return null;
    const y = this.walkable(x, z, col[0]);
    if (!Number.isFinite(y) && kind !== 'ghost' && kind !== 'wisp') return null;
    const c = this.make(idx, x, Number.isFinite(y) ? y : col[0], z, new THREE.Color(pickOf(rt.def.tints)), rt.def);
    if (rt.def.habitat === 'hero') {
      // Each adventurer gets their own colours; the mage's hat and robe match.
      const r = Math.random;
      c.tint.set(pickOf(SHIRTS)); c.tint2.set(pickOf(kind === 'archer' ? ['#4a7a3a', '#5a6a3a', '#3a5a4a'] : kind === 'mage' ? ['#4a4aa0', '#7a3a9a', '#3a6a9a'] : ['#b03a3a', '#3a5ab0', '#d8b04a']));
      if (kind === 'mage') c.tint.copy(c.tint2);
      c.tint3.set(pickOf(HAIR)); c.skin = r() * 0.85;
    }
    rt.list.push(c);
    return c;
  }

  columnAt(x: number, z: number): [number, boolean, boolean] | null { return this.column(x, z); }

  /** The great dragon, placed on its bed of gold (no ground check: the lair plan sets the height). */
  spawnGreat(x: number, y: number, z: number, yaw: number): Creature | null {
    const idx = this.species.findIndex((s) => s.def.name === GREAT_DRAGON);
    const rt = this.species[idx];
    if (!rt || rt.list.length >= rt.def.max) return null;
    const c = this.make(idx, x, y, z, new THREE.Color('#ffffff'), rt.def);
    c.tint.set('#ffffff');
    c.yaw = yaw;
    rt.list.push(c);
    return c;
  }

  scatter(x: number, z: number, r: number): void {
    for (const rt of this.species) {
      if (rt.def.habitat !== 'ground') continue;
      for (const a of rt.list) {
        if (a.dying > 0 || a.state === S.FLEE) continue;
        const dx = a.x - x, dz = a.z - z, d = Math.hypot(dx, dz);
        if (d > r) continue;
        a.state = S.FLEE; a.timer = rand(4, 7);
        a.tx = a.x + (dx / (d || 1)) * 22; a.tz = a.z + (dz / (d || 1)) * 22;
      }
    }
  }

  nearestAnimal(x: number, z: number, r: number): Creature | null {
    let best: Creature | null = null, bd = r;
    for (const rt of this.species) {
      if (rt.def.habitat !== 'ground') continue;
      for (const a of rt.list) {
        const d = Math.hypot(a.x - x, a.z - z);
        if (a.dying === 0 && d < bd) { bd = d; best = a; }
      }
    }
    return best;
  }

  say(c: Creature, text: string, sec?: number): void { this.npcs.bubbles.say(c, text, sec); }
  killAnimal(p: Creature): void { this.kill(p); }
  sound(ev: NightSound, c: Creature): void { this.onSound?.(ev, c); }

  partySay(c: Creature, party: string, text: string): void {
    this.say(c, text, 2.8);
    if (c.fighter && Math.hypot(c.x - this.px, c.z - this.pz) < 48) this.onPartyChat?.(party, nick(c, c.fighter.kind), text);
  }

  announce(kicker: string, title: string, sub: string): void { this.onAnnounce?.(kicker, title, sub); }
  alarm(raider: Creature): void { this.npcs.alarm(raider); }
  hit(target: Creature, dmg: number, from: Creature): void { this.nightDir.hit(target, dmg, from); }

  /** Dev helper: fly to an NPC doing a task (chat, buy, sell, play, work...). */
  findTask(task: string, x: number, z: number): THREE.Vector3 | null {
    let best: Creature | null = null, bd = 1e9;
    for (const c of this.allNpcs()) {
      if (c.npc?.task !== task) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best ? new THREE.Vector3(best.x, best.y, best.z) : null;
  }

  /** Dev helper: live counts per species. */
  counts(): string {
    return this.species.map((s) => `${s.def.name}:${s.list.length}`).join(' ');
  }

  /** Dev helper: order the nearest dragon to hunt or sleep now. */
  dragonCmd(cmd: string): string {
    const list = this.species.find((s) => s.def.habitat === 'dragon')!.list;
    const d = list.sort((a, b) => Math.hypot(a.x - this.px, a.z - this.pz) - Math.hypot(b.x - this.px, b.z - this.pz))[0];
    if (!d) return 'no dragon';
    if (cmd === 'hunt') {
      d.tx = d.x; d.tz = d.z;
      const p = this.findPrey(d);
      if (!p) return 'no prey';
      d.prey = p; d.state = S.HUNT; d.timer = 40;
      return `hunting ${Math.round(p.x)},${Math.round(p.z)}`;
    }
    d.intent = I.SLEEP; d.tx = d.x; d.tz = d.z; this.pickPerch(d);
    return `state=${d.state}`;
  }

  /**
   * A dragon comes to harry the watch tower whose top is at (x, y, z): one already
   * in the air nearby, or a new one sweeping in from afar. Null if none can.
   */
  dragonRaid(x: number, y: number, z: number): Creature | null {
    const rt = this.species.find((s) => s.def.habitat === 'dragon')!;
    let d = rt.list.find((c) => (c.state === S.CIRCLE || c.state === S.CLIMB) && Math.hypot(c.x - x, c.z - z) < 300) ?? null;
    if (!d) {
      if (rt.list.length >= rt.def.max) return null;
      const a = Math.random() * TAU;
      const sx = x + Math.cos(a) * 170, sz = z + Math.sin(a) * 170;
      d = this.make(this.species.indexOf(rt), sx, y + 40, sz, new THREE.Color(pickOf(rt.def.tints)), rt.def);
      rt.list.push(d);
    }
    if (d.prey) { d.prey.held = false; d.prey = null; }
    d.state = S.RAID; d.timer = rand(45, 70); d.aux = rand(4, 7);
    d.tx = x; d.ty = y; d.tz = z;
    this.onSound?.('roar', d);
    return d;
  }

  /** Arrows drove it off (or it lost interest): it flees the tower. */
  dragonFlee(c: Creature): void {
    if (c.state !== S.RAID) return;
    c.state = S.ESCAPE; c.timer = 14;
    this.onSound?.('roar', c);
  }

  /**
   * The dance of dragons: two ridden war dragons, one for each side, sweep in and fight
   * in the sky over (x, z) for a minute or so. Returns them, or null if they cannot come.
   */
  dragonDuel(x: number, y: number, z: number): [Creature, Creature] | null {
    const rt = this.species.find((s) => s.def.name === RIDER_DRAGON)!;
    if (rt.list.length) return null;
    const a = Math.random() * TAU, out: Creature[] = [];
    for (const side of [0, 1]) {
      const sx = x + Math.cos(a + side * Math.PI) * 70, sz = z + Math.sin(a + side * Math.PI) * 70;
      const c = this.make(this.species.indexOf(rt), sx, y + 45, sz, new THREE.Color(side ? '#6a5a66' : '#ffe2a0'), rt.def);
      c.tint2.set(side ? '#1c1418' : '#2f7a44');
      c.skin = 0.1;
      c.state = S.DUEL; c.intent = side; c.tx = x; c.ty = y; c.tz = z; c.aux = rand(4, 8);
      rt.list.push(c);
      out.push(c);
    }
    const [p, q] = out;
    p.prey = q; q.prey = p;
    p.timer = q.timer = rand(60, 80);
    this.onSound?.('roar', p);
    return [p, q];
  }

  /** Are the riders still fighting? */
  dueling(c: Creature): boolean { return !c.gone && c.state === S.DUEL; }

  /** Is this dragon still harrying its tower? */
  raiding(c: Creature): boolean { return !c.gone && c.state === S.RAID; }

  /** Dev helper: make the dragon land at the next chance. */
  forcePerch(): void {
    const d = this.species.find((s) => s.def.habitat === 'dragon')!.list[0];
    if (d && d.state === S.CIRCLE) d.timer = 0;
  }

  /** Dev helper: the dragon's position, if one is around. */
  dragonPos(): THREE.Vector3 | null {
    const d = this.species.find((s) => s.def.habitat === 'dragon')!.list[0];
    return d ? new THREE.Vector3(d.x, d.y, d.z) : null;
  }

  /** Dev helper: dragon state summary. */
  dragonInfo(): string {
    const d = this.species.find((s) => s.def.habitat === 'dragon')!.list[0];
    if (!d) return 'none';
    const r = (v: number) => Math.round(v);
    return `state=${d.state} t=${r(d.timer)} pos=${r(d.x)},${r(d.y)},${r(d.z)} target=${r(d.tx)},${r(d.ty)},${r(d.tz)}`;
  }

}
