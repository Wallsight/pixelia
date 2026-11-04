// The night: monsters roam the wild after dark (each biome has its own), now
// and then a small band raids a village, and parties of adventurers (warrior,
// archer, mage) travel the roads by day and camp by a fire at night, fighting
// whatever comes near. Nobody reacts to the player. No gore: monsters fall
// into bones, smoke or fading light; heroes are knocked down and get up again.

import * as THREE from 'three';
import { BIOME } from '../world/biomes';
import { LM, SITE_CITY, SITE_VILLAGE, pointAlong, polylineLength, type Site } from '../world/structures';
import type { Terrain } from '../world/terrain';
import type { Creature } from './creatures';
import type { FireFx } from '../render/fire';
import type { Post } from './war';

export type FighterKind = 'skeleton' | 'zombie' | 'demon' | 'spider' | 'ghost' | 'troll' | 'wisp' | 'deepone' | 'warrior' | 'archer' | 'mage'
  | 'soldier' | 'bowman' | 'captain';
export const MONSTERS: FighterKind[] = ['skeleton', 'zombie', 'demon', 'spider', 'ghost', 'troll', 'wisp', 'deepone'];
export const HEROES: FighterKind[] = ['warrior', 'archer', 'mage'];
/** Castle garrisons (run by the war director). */
export const GARRISON: FighterKind[] = ['soldier', 'bowman', 'captain'];
/** Everyone the monsters go for. */
export const ALLIES: FighterKind[] = [...HEROES, ...GARRISON];

/** Night sounds the soundscape plays. */
export type NightSound = 'groan' | 'rattle' | 'growl' | 'hiss' | 'wail' | 'swing' | 'hit' | 'clang' | 'twang' | 'zap' | 'poof' | 'heal' | 'gurgle';

type Death = 'bones' | 'burn' | 'fade' | 'flip' | 'topple' | 'smoke' | 'sink';

export interface Fighter {
  kind: FighterKind;
  hero: boolean;
  hp: number;
  max: number;
  foe: Creature | null;
  /** Attack cooldown and a general timer. */
  cool: number;
  t: number;
  /** Seconds left lying down (heroes only). */
  down: number;
  flash: number;
  /** Trolls turn to stone by day. */
  stone: boolean;
  party: Party | null;
  /** Castle soldiers: their post in the garrison. */
  garrison: Post | null;
  slot: number;
  raid: { x: number; z: number; r: number } | null;
  death: Death;
  /** Next idle noise. */
  voice: number;
}

interface Party {
  name: string;
  members: Creature[];
  road: Float32Array;
  len: number;
  s: number;
  dir: number;
  mode: 'travel' | 'camp';
  camp: { x: number; y: number; z: number } | null;
  fighting: boolean;
  talk: number;
}

/** A missile homing on a creature, or (target null) flying at a fixed point (practice shots). */
interface Shot { kind: 'arrow' | 'bolt' | 'heal'; x: number; y: number; z: number; vx: number; vy: number; vz: number; target: Creature | null; tx: number; ty: number; tz: number; dmg: number; life: number }

export interface NightHost {
  spawnFighter(kind: FighterKind, x: number, z: number): Creature | null;
  walkToward(c: Creature, tx: number, tz: number, speed: number, dt: number): 'moving' | 'arrived' | 'blocked';
  idle(c: Creature, dt: number): void;
  columnAt(x: number, z: number): [number, boolean, boolean] | null;
  live(kind: string): readonly Creature[];
  /** Wild animals within r of (x, z) bolt away from it. */
  scatter(x: number, z: number, r: number): void;
  nearestAnimal(x: number, z: number, r: number): Creature | null;
  say(c: Creature, text: string, sec?: number): void;
  sound(ev: NightSound, c: Creature): void;
  /** Townsfolk near a raider: guards turn to fight it, the others hurry home. */
  alarm(raider: Creature): void;
  readonly fire: FireFx;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const TAU = Math.PI * 2;
const angleTo = (from: number, to: number) => {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

// ------------------------------------------------------------------ tables

interface KindDef { hp: number; speed: number; dmg: number; cool: number; reach: number; death: Death; chase: boolean; voice: NightSound | null }
const KINDS: Record<FighterKind, KindDef> = {
  skeleton: { hp: 8, speed: 1.25, dmg: 2, cool: 1.1, reach: 1.4, death: 'bones', chase: false, voice: 'rattle' },
  zombie: { hp: 10, speed: 0.85, dmg: 2, cool: 1.4, reach: 1.3, death: 'smoke', chase: true, voice: 'groan' },
  demon: { hp: 18, speed: 1.4, dmg: 3, cool: 1.2, reach: 1.5, death: 'burn', chase: true, voice: 'growl' },
  spider: { hp: 8, speed: 2.6, dmg: 1.5, cool: 0.9, reach: 1.5, death: 'flip', chase: true, voice: 'hiss' },
  ghost: { hp: 8, speed: 1.1, dmg: 1.5, cool: 1.5, reach: 1.3, death: 'fade', chase: false, voice: 'wail' },
  troll: { hp: 30, speed: 0.8, dmg: 5, cool: 2.3, reach: 2.4, death: 'topple', chase: true, voice: 'growl' },
  wisp: { hp: 3, speed: 1.4, dmg: 0, cool: 9, reach: 0, death: 'fade', chase: false, voice: null },
  deepone: { hp: 10, speed: 1.15, dmg: 2, cool: 1.2, reach: 1.4, death: 'sink', chase: false, voice: 'gurgle' },
  warrior: { hp: 30, speed: 1.5, dmg: 3, cool: 0.9, reach: 2.1, death: 'smoke', chase: false, voice: null },
  archer: { hp: 18, speed: 1.5, dmg: 2.5, cool: 1.6, reach: 20, death: 'smoke', chase: false, voice: null },
  mage: { hp: 16, speed: 1.4, dmg: 4, cool: 2.4, reach: 17, death: 'smoke', chase: false, voice: null },
  soldier: { hp: 26, speed: 1.5, dmg: 3, cool: 1.1, reach: 2.4, death: 'smoke', chase: false, voice: null },
  bowman: { hp: 18, speed: 1.5, dmg: 2.5, cool: 1.7, reach: 24, death: 'smoke', chase: false, voice: null },
  captain: { hp: 34, speed: 1.6, dmg: 3.5, cool: 1.0, reach: 2.2, death: 'smoke', chase: false, voice: null },
};

/** Combat numbers of a fighter kind (for the war director). */
export const fighterStats = (k: FighterKind): Readonly<KindDef> => KINDS[k];

const SPAWNS: Array<{ kind: FighterKind; biomes: number[]; w: number; group: [number, number] }> = [
  { kind: 'skeleton', biomes: [BIOME.PLAINS, BIOME.TUNDRA, BIOME.DESERT, BIOME.BADLANDS, BIOME.GLOOM, BIOME.ASHLANDS, BIOME.TAIGA], w: 3, group: [1, 3] },
  { kind: 'zombie', biomes: [BIOME.PLAINS, BIOME.FOREST, BIOME.BIRCH_FOREST, BIOME.TAIGA, BIOME.GLOOM, BIOME.BEACH], w: 3, group: [2, 3] },
  { kind: 'demon', biomes: [BIOME.ASHLANDS], w: 5, group: [1, 2] },
  { kind: 'demon', biomes: [BIOME.BADLANDS], w: 0.4, group: [1, 1] },
  { kind: 'spider', biomes: [BIOME.FOREST, BIOME.TAIGA, BIOME.BIRCH_FOREST, BIOME.GLOOM], w: 2, group: [1, 2] },
  { kind: 'ghost', biomes: [BIOME.GLOOM, BIOME.TUNDRA, BIOME.PLAINS, BIOME.SNOW_PEAKS], w: 1.2, group: [1, 2] },
  { kind: 'troll', biomes: [BIOME.MOUNTAINS, BIOME.TAIGA, BIOME.TUNDRA, BIOME.STONY_SHORE, BIOME.SNOW_PEAKS], w: 1.6, group: [1, 1] },
  { kind: 'wisp', biomes: [BIOME.GLOOM, BIOME.RIVER, BIOME.FOREST, BIOME.BIRCH_FOREST, BIOME.BLACK_BEACH], w: 1.4, group: [2, 4] },
  { kind: 'deepone', biomes: [BIOME.BLACK_BEACH], w: 8, group: [3, 5] },
];
const CHANT = ['Ia... Ia...', 'Glub... glub...', 'Uyanacak...', 'Derinlerden...', 'Ia!'];

const PARTY_NAMES = ['Üç Fener', 'Gümüş Kalkan', 'Kuzey Rüzgârı', 'Kırık Ok', 'Son Işık', 'Kül Yürüyenler', 'Ay Muhafızları', 'Demir Yemin'];
const PARTY_TALK = [
  ['Yol uzun, ayaklarım şişti.', 'Şikâyet etme, büyücü taşıyor seni!', 'Asamı taşıyorum, o da bir şey.'],
  ['Bu gece canavar çıkar mı?', 'Çıksın, kılıcım paslandı.', 'Oklarımı saydım, yirmi iki.'],
  ['Hanın çorbasını özledim.', 'Bir köye varınca ısmarlarım.', 'Ejder biberli olsun ama!'],
  ['Kara kule hakkında bir şey duydun mu?', 'Sakın oraya gitmeyelim.', 'Bir gün gideceğiz, biliyorsun.'],
];
const CAMP_TALK = ['Nöbet sırası sende.', 'Ateşi canlı tut.', 'Yıldızlar ne güzel...', 'Bir şey mi kıpırdadı?', 'Uyu biraz, ben bakarım.'];
const BATTLE = ['Arkamda durun!', 'Şimdi!', 'Bu da sana!', 'Dikkat, sağında!', 'Işık bizimle!'];
const VICTORY = ['Bir tane daha az.', 'Temiz!', 'Kimse yaralanmadı mı?', 'Hepsi bu kadar mı?'];
const DOWN = ['Ahh!', 'Dizim!', 'Biraz... nefes...'];
const UP = ['Hâlâ ayaktayım!', 'Daha bitmedi!', 'Sağ ol büyücü.'];

export class NightDirector {
  private parties: Party[] = [];
  private shots: Shot[] = [];
  private spawnT = 2;
  private partyT = 3;
  private raidT = rand(90, 180);
  private scanT = 0;
  private time = 0;
  private px = 0; private pz = 0; private night = 0;
  readonly group = new THREE.Group();
  private arrows: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private fwd = new THREE.Vector3(0, 0, 1);

  constructor(private terrain: Terrain, private host: NightHost) {
    this.arrows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 0.75), new THREE.MeshBasicMaterial({ color: '#cbb48a' }), 48);
    this.arrows.count = 0;
    this.arrows.frustumCulled = false;
    this.group.add(this.arrows);
  }

  // ------------------------------------------------------------ world

  private monsters(): Creature[] {
    const out: Creature[] = [];
    for (const k of MONSTERS) for (const c of this.host.live(k)) if (c.dying === 0 && !c.fighter!.stone) out.push(c);
    return out;
  }

  private settlementNear(x: number, z: number, pad: number): Site | null {
    for (const s of this.terrain.structures.sitesNear(x - 160, z - 160, x + 160, z + 160, 0)) {
      if (s.kind !== SITE_VILLAGE && s.kind !== SITE_CITY) continue;
      const r = (s.kind === SITE_CITY ? 100 : 45) + pad;
      if (Math.hypot(s.x - x, s.z - z) < r) return s;
    }
    return null;
  }

  update(dt: number, px: number, pz: number, night: number): void {
    this.time += dt;
    this.px = px; this.pz = pz; this.night = night;
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 1.2; if (night > 0.6) this.spawnMonsters(); }
    this.partyT -= dt;
    if (this.partyT <= 0) { this.partyT = 6; this.spawnParty(); }
    this.raidT -= dt;
    if (this.raidT <= 0) { this.raidT = rand(150, 300); if (night > 0.65) this.startRaid(); }
    this.scanT -= dt;
    const scan = this.scanT <= 0;
    if (scan) this.scanT = 0.5;
    for (const p of this.parties) this.updateParty(p, dt, scan);
    this.parties = this.parties.filter((p) => p.members.some((m) => !m.gone));
    this.updateShots(dt);
  }

  // ------------------------------------------------------------ spawning

  private spawnMonsters(): void {
    if (this.monsters().length >= 16) return;
    const a = Math.random() * TAU, d = rand(42, 80);
    const x = this.px + Math.cos(a) * d, z = this.pz + Math.sin(a) * d;
    if (this.settlementNear(x, z, 25)) return;
    const s = this.terrain.sample(x, z);
    let opts = SPAWNS.filter((o) => o.biomes.includes(s.biome));
    if (!opts.length) return;
    // Ghosts gather round graveyards and ruined chapels.
    const haunted = this.terrain.landmarks.near(x - 60, z - 60, x + 60, z + 60, 0).some((l) => l.kind === LM.GRAVEYARD || l.kind === LM.CHAPEL);
    if (haunted) opts = [...opts, { kind: 'ghost', biomes: [], w: 6, group: [2, 3] }, { kind: 'skeleton', biomes: [], w: 3, group: [2, 3] }];
    let r = Math.random() * opts.reduce((n, o) => n + o.w, 0);
    let o = opts[0];
    for (const c of opts) { r -= c.w; if (r <= 0) { o = c; break; } }
    const n = Math.round(rand(o.group[0], o.group[1]));
    for (let i = 0; i < n; i++) this.spawn(o.kind, x + rand(-3, 3), z + rand(-3, 3));
  }

  spawn(kind: FighterKind, x: number, z: number): Creature | null {
    const col = this.host.columnAt(x, z);
    if (!col || col[1]) return null;
    const c = this.host.spawnFighter(kind, x, z);
    if (!c) return null;
    const k = KINDS[kind];
    c.fighter = {
      kind, hero: ALLIES.includes(kind), hp: k.hp, max: k.hp, foe: null, cool: rand(0, 1), t: rand(0, 3), down: 0, flash: 0,
      stone: false, party: null, garrison: null, slot: 0, raid: null, death: k.death, voice: rand(3, 12),
    };
    if (kind === 'wisp' || kind === 'ghost') { c.y = col[0] + (kind === 'wisp' ? rand(0.8, 2) : 0.3); c.ground = col[0]; }
    return c;
  }

  private startRaid(): void {
    const s = this.settlementNear(this.px, this.pz, 100);
    if (!s || (s.kind === SITE_CITY && Math.random() < 0.6)) return;
    const R = s.kind === SITE_CITY ? 92 : 48;
    // Approach from the side the player is not on, so the band is seen coming.
    const a = Math.atan2(this.pz - s.z, this.px - s.x) + Math.PI + rand(-0.8, 0.8);
    const x = s.x + Math.cos(a) * (R + 14), z = s.z + Math.sin(a) * (R + 14);
    const kind: FighterKind = Math.random() < 0.6 ? 'zombie' : 'skeleton';
    const n = Math.round(rand(3, 4));
    for (let i = 0; i < n; i++) {
      const c = this.spawn(kind, x + rand(-3, 3), z + rand(-3, 3));
      if (c) c.fighter!.raid = { x: s.x, z: s.z, r: s.kind === SITE_CITY ? 12 : 6 };
    }
  }

  private spawnParty(): void {
    if (this.parties.length >= 2 || this.host.live('warrior').length >= 3) return;
    if (Math.random() < 0.5) return;
    const roads = this.terrain.structures.roadsNear(this.px - 110, this.pz - 110, this.px + 110, this.pz + 110, 0);
    if (!roads.length) return;
    const road = pick(roads);
    const len = polylineLength(road.pts);
    if (len < 60) return;
    for (let tries = 0; tries < 6; tries++) {
      const s = rand(15, len - 15);
      const [x, z] = pointAlong(road.pts, s);
      const d = Math.hypot(x - this.px, z - this.pz);
      if (d < 45 || d > 100 || this.settlementNear(x, z, 10)) continue;
      const party: Party = {
        name: pick(PARTY_NAMES), members: [], road: road.pts, len, s, dir: Math.random() < 0.5 ? 1 : -1,
        mode: 'travel', camp: null, fighting: false, talk: rand(20, 40),
      };
      HEROES.forEach((kind, i) => {
        const c = this.spawn(kind, x + rand(-1.5, 1.5), z + rand(-1.5, 1.5));
        if (!c) return;
        c.fighter!.party = party; c.fighter!.slot = i;
        party.members.push(c);
      });
      if (party.members.length === 3) this.parties.push(party);
      else for (const c of party.members) c.fighter!.party = null; // removed on their next step
      return;
    }
  }

  // ------------------------------------------------------------ per creature

  /** Returns false when the creature should be removed. */
  step(c: Creature, dt: number): boolean {
    const f = c.fighter!;
    f.flash = Math.max(0, f.flash - dt);
    f.cool -= dt;
    f.t -= dt;
    if (f.hero) return this.stepHero(c, f, dt);
    return this.stepMonster(c, f, dt);
  }

  private glow(c: Creature, f: Fighter, base: number): void {
    c.glow = base + f.flash * 4;
  }

  private stepMonster(c: Creature, f: Fighter, dt: number): boolean {
    const k = KINDS[f.kind];
    // Dawn: the undead burn, spirits fade, spiders slink off, trolls turn to stone.
    if (this.night < 0.35 && !f.stone) {
      if (f.kind === 'troll') {
        f.stone = true; c.walkAmp = 0; c.flapAmp = 0; c.tint.set('#8a8a86'); this.host.sound('poof', c);
        this.host.fire.puff(c.x, c.y + 1.5, c.z, 10);
      } else {
        f.death = f.kind === 'skeleton' || f.kind === 'zombie' || f.kind === 'demon' ? 'burn' : f.kind === 'deepone' ? 'sink' : 'fade';
        c.dying = 1e-4;
        return true;
      }
    }
    if (f.stone) {
      if (this.night > 0.6) { f.stone = false; c.tint.set('#c8c8b8'); }
      this.glow(c, f, 0);
      return true;
    }
    if (f.kind === 'wisp') return this.stepWisp(c, f, dt);
    if (f.kind === 'deepone' && !f.foe && this.ritual(c, f, dt)) return true;

    // Pick a foe now and then: the nearest standing hero, or a guard when raiding.
    if (f.cool < 0.3 && (!f.foe || f.foe.gone || f.foe.dying > 0 || (f.foe.fighter && f.foe.fighter.down > 0))) f.foe = this.nearestHero(c, f.raid ? 10 : 12);
    if (f.voice <= 0) { f.voice = rand(6, 16); if (k.voice) this.host.sound(k.voice, c); }
    f.voice -= dt;

    const ghost = f.kind === 'ghost';
    let tx = c.tx, tz = c.tz, speed = k.speed, moving = true;
    const foe = f.foe;
    if (foe) {
      const d = Math.hypot(foe.x - c.x, foe.z - c.z);
      if (d > 20) f.foe = null;
      else if (d <= k.reach + 0.3) {
        moving = false;
        c.yaw += angleTo(c.yaw, Math.atan2(foe.x - c.x, foe.z - c.z)) * Math.min(1, dt * 6);
        if (f.cool <= 0) {
          f.cool = k.cool * rand(0.85, 1.15);
          c.flap = 0; c.flapAmp = 1.2; c.tail = 1.6;
          this.host.sound('swing', c);
          this.hit(foe, k.dmg * rand(0.8, 1.2), c);
        }
      } else { tx = foe.x; tz = foe.z; speed *= 1.35; }
    } else if (f.raid) {
      tx = f.raid.x + Math.sin(c.seed) * f.raid.r; tz = f.raid.z + Math.cos(c.seed) * f.raid.r;
      if (Math.random() < dt) this.host.alarm(c);
    } else {
      // Wander; the hungry ones lumber after animals (which run away).
      const prey = k.chase && f.t < 0 ? this.host.nearestAnimal(c.x, c.z, 13) : null;
      if (prey) { c.tx = prey.x; c.tz = prey.z; f.t = 1; speed *= 1.3; }
      else if (f.t < 0 || Math.hypot(c.tx - c.x, c.tz - c.z) < 0.8) {
        f.t = rand(4, 9);
        const a = Math.random() * TAU, r = rand(4, 12);
        c.tx = c.x + Math.cos(a) * r; c.tz = c.z + Math.sin(a) * r;
      }
      tx = c.tx; tz = c.tz;
      if (Math.random() < dt * 0.7) this.host.scatter(c.x, c.z, 9);
    }

    if (ghost) this.floatToward(c, tx, tz, moving ? speed : 0, dt, 0.3);
    else if (moving) {
      const r = this.host.walkToward(c, tx, tz, speed, dt);
      if (r === 'blocked' && !foe) f.t = -1;
    } else this.host.idle(c, dt);

    // Poses: zombies reach forward, skeletons rattle their heads, spiders bob, ghosts sway.
    const armsUp = f.kind === 'zombie' ? 1.35 : ghost ? 1.0 + Math.sin(this.time * 2 + c.seed) * 0.2 : 0;
    if (c.flapAmp > 0.5) c.tail += (armsUp - c.tail) * Math.min(1, dt * 4);
    else c.tail = armsUp;
    c.flapAmp += (0 - c.flapAmp) * Math.min(1, dt * 3);
    c.flap += dt * 9;
    if (f.kind === 'skeleton') c.head = Math.sin(this.time * 7 + c.seed) * 0.05;
    else if (f.kind === 'demon') { c.flap += dt * 2; c.flapAmp = Math.max(c.flapAmp, 0.25); c.tail = Math.sin(this.time * 2 + c.seed) * 0.4; }
    else c.head = Math.sin(this.time * 0.8 + c.seed) * 0.1;
    this.glow(c, f, f.kind === 'ghost' ? 0.55 : f.kind === 'demon' ? 0.12 : 0);
    return true;
  }

  /**
   * Deep ones stop now and then on the shore, face the water, raise their arms
   * and chant. Returns true while the ritual runs.
   */
  private ritual(c: Creature, f: Fighter, dt: number): boolean {
    if (c.state !== 1) {
      if (f.t > 0 || Math.random() > dt * 0.25) return false;
      // Find the sea: the nearest wet column in eight directions.
      let best = -1, bd = 1e9;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        for (const r of [4, 8, 12]) {
          const col = this.host.columnAt(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r);
          if (col && col[1] && r < bd) { bd = r; best = a; }
        }
      }
      if (best < 0) { f.t = rand(4, 8); return false; }
      c.state = 1; c.aux = best; f.t = rand(12, 22);
    }
    if (f.t <= 0 || this.nearestHero(c, 10)) { c.state = 0; f.t = rand(8, 16); return false; }
    this.host.idle(c, dt);
    c.yaw += angleTo(c.yaw, Math.atan2(Math.cos(c.aux), Math.sin(c.aux))) * Math.min(1, dt * 3);
    c.tail = 2.3 + Math.sin(this.time * 2.2 + c.seed) * 0.25; // arms raised to the sea
    c.head = -0.35 + Math.sin(this.time * 2.2 + c.seed) * 0.15;
    if (Math.random() < dt * 0.15 && Math.hypot(c.x - this.px, c.z - this.pz) < 30) this.host.say(c, pick(CHANT), 2.4);
    if (f.voice <= 0) { f.voice = rand(5, 10); this.host.sound('gurgle', c); }
    f.voice -= dt;
    this.glow(c, f, 0);
    return true;
  }

  /** Spirits glide over the ground (through anything) at a hover height. */
  private floatToward(c: Creature, tx: number, tz: number, speed: number, dt: number, hover: number): void {
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    if (d > 0.3 && speed > 0) {
      c.yaw += angleTo(c.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 3);
      c.x += Math.sin(c.yaw) * speed * dt; c.z += Math.cos(c.yaw) * speed * dt;
    }
    const col = this.host.columnAt(c.x, c.z);
    if (col) c.ground = col[0];
    const want = c.ground + hover + Math.sin(this.time * 1.6 + c.seed) * 0.15;
    c.y += (want - c.y) * Math.min(1, dt * 2);
    c.walkAmp = 0;
  }

  /** Will-o-the-wisps drift, pulse and slip away from anyone who comes close. */
  private stepWisp(c: Creature, f: Fighter, dt: number): boolean {
    let tx = c.tx, tz = c.tz;
    const near = this.nearestHero(c, 7);
    if (near) {
      const dx = c.x - near.x, dz = c.z - near.z, d = Math.hypot(dx, dz) || 1;
      tx = c.x + (dx / d) * 6; tz = c.z + (dz / d) * 6;
    } else if (f.t < 0) {
      f.t = rand(2, 5);
      const a = Math.random() * TAU;
      c.tx = c.x + Math.cos(a) * rand(2, 6); c.tz = c.z + Math.sin(a) * rand(2, 6);
      tx = c.tx; tz = c.tz;
    }
    this.floatToward(c, tx, tz, near ? 2.4 : KINDS.wisp.speed, dt, 1.4 + Math.sin(c.seed) * 0.5);
    c.tail = Math.sin(this.time * 5 + c.seed) * 0.6;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.3 + c.seed * 3);
    this.glow(c, f, 0.9 + pulse * 1.2);
    return true;
  }

  private nearestHero(c: Creature, r: number): Creature | null {
    let best: Creature | null = null, bd = r;
    for (const k of ALLIES) for (const h of this.host.live(k)) {
      if (h.dying > 0 || h.fighter!.down > 0) continue;
      const d = Math.hypot(h.x - c.x, h.z - c.z);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  nearestMonster(x: number, z: number, r: number): Creature | null {
    let best: Creature | null = null, bd = r;
    for (const m of this.monsters()) {
      if (m.fighter!.kind === 'wisp') continue;
      const d = Math.hypot(m.x - x, m.z - z);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  // ------------------------------------------------------------ heroes

  private updateParty(p: Party, dt: number, scan: boolean): void {
    const alive = p.members.filter((m) => !m.gone);
    if (!alive.length) return;
    const lead = alive[0];
    if (scan) {
      const foe = this.nearestMonster(lead.x, lead.z, 24);
      const was = p.fighting;
      p.fighting = !!foe;
      if (p.fighting && !was && this.near(lead)) this.host.say(pick(alive), pick(BATTLE), 2.2);
      if (!p.fighting && was && this.near(lead)) this.host.say(pick(alive), pick(VICTORY), 2.6);
    }
    if (p.mode === 'travel') {
      if (this.night > 0.55 && !p.fighting) this.makeCamp(p);
      else if (!p.fighting) {
        // The leader sets the pace along the road; the others follow in file.
        const slow = alive.some((m) => Math.hypot(m.x - lead.x, m.z - lead.z) > 6);
        p.s += p.dir * dt * (slow ? 0.6 : 1.45);
        if (p.s < 6 || p.s > p.len - 6) { p.dir *= -1; p.s = Math.max(6, Math.min(p.len - 6, p.s)); }
      }
    } else if (p.mode === 'camp' && this.night < 0.35 && !p.fighting) {
      if (p.camp) this.host.fire.puff(p.camp.x, p.camp.y + 0.3, p.camp.z, 10);
      p.mode = 'travel'; p.camp = null;
    }
    if (p.camp && Math.hypot(p.camp.x - this.px, p.camp.z - this.pz) < 140) this.host.fire.burn(p.camp.x, p.camp.y + 0.1, p.camp.z, dt, 0.9);
    p.talk -= dt;
    if (p.talk <= 0 && !p.fighting) {
      p.talk = rand(25, 50);
      if (this.near(lead)) {
        const lines = p.mode === 'camp' ? [pick(CAMP_TALK)] : pick(PARTY_TALK);
        lines.forEach((l, i) => setTimeout(() => { const m = alive[i % alive.length]; if (!m.gone) this.host.say(m, l, 2.8); }, i * 2900));
      }
    }
  }

  private makeCamp(p: Party): void {
    const [x, z, dx, dz] = pointAlong(p.road, p.s);
    for (const side of [1, -1]) {
      const cx = x - dz * side * 5, cz = z + dx * side * 5;
      const col = this.host.columnAt(cx, cz);
      if (!col || col[1] || col[2]) continue;
      p.camp = { x: cx, y: col[0], z: cz };
      p.mode = 'camp';
      return;
    }
    p.s += p.dir * 8; // no room here: walk on a bit
  }

  private near(c: Creature): boolean {
    return Math.hypot(c.x - this.px, c.z - this.pz) < 26;
  }

  private stepHero(c: Creature, f: Fighter, dt: number): boolean {
    const p = f.party;
    if (!p) return false;
    const k = KINDS[f.kind];
    // Knocked down: lie there, then get up.
    if (f.down > 0) {
      f.down -= dt;
      c.roll += (Math.PI / 2 - c.roll) * Math.min(1, dt * 5);
      c.bob += (-0.25 - c.bob) * Math.min(1, dt * 5);
      this.host.idle(c, dt);
      c.walkAmp = 0;
      if (f.down <= 0) { f.hp = f.max * 0.6; if (this.near(c)) this.host.say(c, pick(UP), 2.2); }
      this.glow(c, f, 0);
      return true;
    }
    c.roll += (0 - c.roll) * Math.min(1, dt * 5);
    c.bob += (0 - c.bob) * Math.min(1, dt * 5);
    c.tail += (0 - c.tail) * Math.min(1, dt * 4);
    c.flapAmp += (0 - c.flapAmp) * Math.min(1, dt * 3);
    c.flap += dt * 10;

    const lead = p.members[0];
    let foe: Creature | null = null;
    if (p.fighting) {
      foe = f.foe && !f.foe.gone && f.foe.dying === 0 ? f.foe : null;
      if (!foe || f.cool < 0.2) foe = f.foe = this.nearestMonster(c.x, c.z, 26);
    } else f.foe = null;

    // The mage first helps anyone lying down.
    if (f.kind === 'mage' && f.cool <= 0) {
      const hurt = p.members.find((m) => !m.gone && m !== c && m.fighter!.down > 0);
      if (hurt && Math.hypot(hurt.x - c.x, hurt.z - c.z) < 16) {
        f.cool = 3;
        this.cast(c, hurt, 'heal', 0);
        return this.face(c, hurt, dt);
      }
    }

    if (foe) {
      const d = Math.hypot(foe.x - c.x, foe.z - c.z);
      if (f.kind === 'warrior') {
        if (d > k.reach) this.host.walkToward(c, foe.x, foe.z, 2.4, dt);
        else {
          this.face(c, foe, dt);
          if (f.cool <= 0) {
            f.cool = k.cool * rand(0.85, 1.15);
            c.flap = 0; c.flapAmp = 1.3;
            this.host.sound('swing', c);
            this.hit(foe, k.dmg * rand(0.8, 1.3), c);
          }
        }
      } else {
        // Ranged: keep a few steps back, shoot when in range.
        if (d < 5) {
          const ax = c.x - foe.x, az = c.z - foe.z, l = Math.hypot(ax, az) || 1;
          this.host.walkToward(c, c.x + (ax / l) * 3, c.z + (az / l) * 3, 2.2, dt);
        } else if (d > k.reach - 2) this.host.walkToward(c, foe.x, foe.z, 1.8, dt);
        else {
          this.face(c, foe, dt);
          if (f.cool <= 0) {
            f.cool = k.cool * rand(0.85, 1.2);
            c.tail = 1.4;
            this.cast(c, foe, f.kind === 'archer' ? 'arrow' : 'bolt', k.dmg * rand(0.8, 1.2));
          }
        }
      }
      this.glow(c, f, f.kind === 'mage' ? 0.08 : 0);
      return true;
    }

    // Peace: follow the road in file, or gather round the campfire.
    if (p.mode === 'camp' && p.camp) {
      const a = (f.slot / 3) * TAU + 0.5;
      const sx = p.camp.x + Math.cos(a) * 2.1, sz = p.camp.z + Math.sin(a) * 2.1;
      if (this.host.walkToward(c, sx, sz, 1.4, dt) === 'arrived') {
        this.face(c, { x: p.camp.x, z: p.camp.z }, dt);
        c.head = 0.25 + Math.sin(this.time * 0.5 + c.seed) * 0.08;
      }
    } else {
      const back = c === lead ? -2 : f.slot * 2.2;
      const [x, z, dx, dz] = pointAlong(p.road, p.s - p.dir * back);
      const side = f.slot === 1 ? 0.8 : f.slot === 2 ? -0.8 : 0;
      const tx = x - dz * side, tz = z + dx * side;
      const far = Math.hypot(tx - c.x, tz - c.z);
      this.host.walkToward(c, tx, tz, far > 4 ? 2.4 : 1.5, dt);
    }
    this.glow(c, f, 0);
    return true;
  }

  private face(c: Creature, o: { x: number; z: number }, dt: number): boolean {
    this.host.idle(c, dt);
    c.yaw += angleTo(c.yaw, Math.atan2(o.x - c.x, o.z - c.z)) * Math.min(1, dt * 6);
    return true;
  }

  // ------------------------------------------------------------ combat

  hit(target: Creature, dmg: number, from: Creature): void {
    const f = target.fighter;
    if (!f || target.dying > 0 || f.down > 0) return;
    f.hp -= dmg;
    f.flash = 0.2;
    // A little knockback.
    const dx = target.x - from.x, dz = target.z - from.z, l = Math.hypot(dx, dz) || 1;
    if (f.kind !== 'troll') { target.x += (dx / l) * 0.25; target.z += (dz / l) * 0.25; }
    this.host.sound(f.hero && (f.kind === 'warrior' || f.kind === 'soldier' || f.kind === 'captain') ? 'clang' : 'hit', target);
    if (f.hp > 0) return;
    if (f.hero) {
      f.down = 7;
      if (this.near(target)) this.host.say(target, pick(f.garrison ? ['Ahh!', 'Kalkanım...', 'Yaralandım!'] : DOWN), 2);
      return;
    }
    target.dying = 1e-4;
    this.host.sound('poof', target);
    if (from.fighter?.hero && Math.random() < 0.35 && this.near(from)) this.host.say(from, pick(['Bir tane!', 'Yere!', 'Geri dönme!']), 1.8);
    // Whoever was fighting it looks for the next one.
    for (const k of ALLIES) for (const h of this.host.live(k)) if (h.fighter!.foe === target) h.fighter!.foe = null;
  }

  cast(from: Creature, target: Creature, kind: Shot['kind'], dmg: number): void {
    const y0 = from.y + 1.4 * from.scale;
    const dx = target.x - from.x, dy = target.y + 1 - y0, dz = target.z - from.z, l = Math.hypot(dx, dy, dz) || 1;
    const sp = kind === 'arrow' ? 22 : kind === 'bolt' ? 12 : 8;
    this.shots.push({ kind, x: from.x + (dx / l) * 0.6, y: y0, z: from.z + (dz / l) * 0.6, vx: (dx / l) * sp, vy: (dy / l) * sp + (kind === 'arrow' ? 1.5 : 0), vz: (dz / l) * sp, target, tx: 0, ty: 0, tz: 0, dmg, life: 0 });
    this.host.sound(kind === 'arrow' ? 'twang' : kind === 'bolt' ? 'zap' : 'heal', from);
    from.fighter!.foe = kind === 'heal' ? from.fighter!.foe : target;
    // Remember who shot it, for the kill line.
    this.shooter.set(this.shots[this.shots.length - 1], from);
  }

  private shooter = new Map<Shot, Creature>();

  /** Practice: an arrow at a fixed point (an archery butt). */
  shootAt(from: Creature, tx: number, ty: number, tz: number): void {
    const y0 = from.y + 1.4 * from.scale;
    const dx = tx - from.x, dy = ty - y0, dz = tz - from.z, l = Math.hypot(dx, dy, dz) || 1;
    this.shots.push({ kind: 'arrow', x: from.x + (dx / l) * 0.6, y: y0, z: from.z + (dz / l) * 0.6, vx: (dx / l) * 22, vy: (dy / l) * 22 + 1.5, vz: (dz / l) * 22, target: null, tx, ty, tz, dmg: 0, life: 0 });
    this.host.sound('twang', from);
  }

  private updateShots(dt: number): void {
    const fx = this.host.fire;
    let arrows = 0;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life += dt;
      const t = s.target;
      const ty = t ? t.y + (t.fighter?.kind === 'troll' ? 1.6 : t.fighter?.kind === 'wisp' ? 0 : 1) : s.ty;
      // Homing: steer towards the target's chest (or the butt).
      const dx = (t ? t.x : s.tx) - s.x, dy = ty - s.y, dz = (t ? t.z : s.tz) - s.z, d = Math.hypot(dx, dy, dz) || 1;
      const sp = Math.hypot(s.vx, s.vy, s.vz);
      const k = Math.min(1, dt * (s.kind === 'arrow' ? 3 : 5));
      s.vx += ((dx / d) * sp - s.vx) * k; s.vy += ((dy / d) * sp - s.vy) * k; s.vz += ((dz / d) * sp - s.vz) * k;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.kind === 'bolt') fx.spark(s.x, s.y, s.z, 0.6, 0.4, 1.0, 3);
      else if (s.kind === 'heal') fx.spark(s.x, s.y, s.z, 0.5, 1.0, 0.5, 2);
      const done = d < 0.7 || s.life > 3 || !!t?.gone;
      if (done && !t) {
        // Thunk into the straw.
        if (d < 0.9) for (let n = 0; n < 5; n++) fx.spark(s.x, s.y, s.z, 0.9, 0.8, 0.45, 1, 1.2);
        this.shots.splice(i, 1);
        continue;
      }
      if (done && t) {
        if (d < 0.9 && !t.gone) {
          if (s.kind === 'heal') {
            const f = t.fighter!;
            f.down = Math.min(f.down, 0.5);
            for (let n = 0; n < 16; n++) fx.spark(t.x, t.y + 0.6, t.z, 0.5, 1.0, 0.5, 1, 2.5);
          } else {
            if (s.kind === 'bolt') for (let n = 0; n < 18; n++) fx.spark(s.x, s.y, s.z, 0.6, 0.4, 1.0, 1, 4);
            this.hit(t, s.dmg, this.shooter.get(s) ?? t);
          }
        }
        this.shooter.delete(s);
        this.shots.splice(i, 1);
        continue;
      }
      if (s.kind === 'arrow' && arrows < 48) {
        this.v.set(s.vx, s.vy, s.vz).normalize();
        this.q.setFromUnitVectors(this.fwd, this.v);
        this.m.compose(this.v.set(s.x, s.y, s.z), this.q, new THREE.Vector3(1, 1, 1));
        this.arrows.setMatrixAt(arrows++, this.m);
      }
    }
    this.arrows.count = arrows;
    if (arrows) this.arrows.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ deaths

  /** Monster deaths and dawn exits. Returns false when the body is gone. */
  stepDying(c: Creature, dt: number): boolean {
    const f = c.fighter!;
    c.dying += dt;
    const t = c.dying;
    c.walkAmp = 0; c.flapAmp = 0;
    const fx = this.host.fire;
    switch (f.death) {
      case 'bones': {
        // The skeleton clatters into a heap, then sinks away.
        c.roll += ((Math.PI / 2) * (c.seed > 50 ? 1 : -1) - c.roll) * Math.min(1, dt * 7);
        c.bob += (-0.35 - c.bob) * Math.min(1, dt * 6);
        if (t > 0.5 && c.aux === 0) { c.aux = 1; fx.puff(c.x, c.y + 0.4, c.z, 8); this.host.sound('rattle', c); }
        if (t > 3) { c.y -= dt * 0.4; c.scale *= Math.max(0, 1 - dt * 0.8); }
        return t < 5;
      }
      case 'burn': {
        // Dawn light: smoke and flames, then ash.
        c.tint.lerp(new THREE.Color(0.08, 0.06, 0.05), Math.min(1, dt * 1.2));
        fx.burn(c.x, c.y + 0.8 * c.scale, c.z, dt, 1.2);
        if (t > 1.5) c.roll += ((Math.PI / 2) - c.roll) * Math.min(1, dt * 3);
        if (t > 3.5) { if (c.aux === 0) { c.aux = 1; fx.puff(c.x, c.y + 0.4, c.z, 12); } c.y -= dt * 0.5; c.scale *= Math.max(0, 1 - dt * 1.2); }
        return t < 6;
      }
      case 'fade': {
        c.glow = 1 + t * 3;
        c.y += dt * 0.6;
        c.scale *= Math.max(0, 1 - dt * 1.4);
        if (c.aux === 0) { c.aux = 1; for (let n = 0; n < 14; n++) fx.spark(c.x, c.y + 0.8, c.z, 0.7, 0.9, 1.0, 1, 2); }
        return t < 1.8;
      }
      case 'flip': {
        c.roll += (Math.PI - c.roll) * Math.min(1, dt * 6);
        c.bob += (0.4 - c.bob) * Math.min(1, dt * 6);
        if (t > 2) { if (c.aux === 0) { c.aux = 1; fx.puff(c.x, c.y + 0.4, c.z, 8); } c.y -= dt * 0.5; c.scale *= Math.max(0, 1 - dt); }
        return t < 4;
      }
      case 'topple': {
        c.pitch += (-Math.PI / 2 - c.pitch) * Math.min(1, dt * 1.6);
        if (t > 1.2 && c.aux === 0) { c.aux = 1; fx.puff(c.x + Math.sin(c.yaw) * 2, c.y + 0.3, c.z + Math.cos(c.yaw) * 2, 18); this.host.sound('hit', c); }
        if (t > 4) { c.y -= dt * 0.4; c.scale *= Math.max(0, 1 - dt * 0.6); }
        return t < 6.5;
      }
      case 'sink': {
        // Slips down into the dark like into water, in a spray of droplets.
        if (c.aux === 0) { c.aux = 1; for (let n = 0; n < 14; n++) fx.spark(c.x, c.y + 0.3, c.z, 0.45, 0.7, 0.65, 1, 1.5); }
        c.y -= dt * 0.9;
        c.tail = 2.2;
        return t < 2.4;
      }
      default: {
        c.roll += ((Math.PI / 2) - c.roll) * Math.min(1, dt * 5);
        if (t > 1 && c.aux === 0) { c.aux = 1; fx.puff(c.x, c.y + 0.4, c.z, 12); }
        if (t > 1.6) { c.y -= dt * 0.5; c.scale *= Math.max(0, 1 - dt * 1.2); }
        return t < 3.5;
      }
    }
  }

  // ------------------------------------------------------------ dev

  /** Dev helper: spawn a monster or a party next to the player. */
  devSpawn(what: string): string {
    if (what === 'party') {
      const was = this.parties.length;
      for (let i = 0; i < 20 && this.parties.length === was; i++) { this.partyT = 0; this.spawnPartyNear(); }
      return this.parties.length > was ? `party ${this.parties[this.parties.length - 1].name}` : 'no road nearby';
    }
    if (what === 'raid') { this.startRaid(); return 'raid?'; }
    if (!MONSTERS.includes(what as FighterKind)) return 'unknown';
    const a = Math.random() * TAU;
    const c = this.spawn(what as FighterKind, this.px + Math.cos(a) * 8, this.pz + Math.sin(a) * 8);
    return c ? `${what} at ${Math.round(c.x)},${Math.round(c.z)}` : 'failed';
  }

  private spawnPartyNear(): void {
    const roads = this.terrain.structures.roadsNear(this.px - 60, this.pz - 60, this.px + 60, this.pz + 60, 0);
    if (!roads.length) return;
    const road = pick(roads);
    const len = polylineLength(road.pts);
    let best = 0, bd = 1e9;
    for (let s = 5; s < len - 5; s += 2) { const [x, z] = pointAlong(road.pts, s); const d = Math.hypot(x - this.px, z - this.pz); if (d < bd) { bd = d; best = s; } }
    const [x, z] = pointAlong(road.pts, best);
    const party: Party = { name: pick(PARTY_NAMES), members: [], road: road.pts, len, s: best, dir: 1, mode: 'travel', camp: null, fighting: false, talk: 5 };
    HEROES.forEach((kind, i) => {
      const c = this.spawn(kind, x + rand(-1.5, 1.5), z + rand(-1.5, 1.5));
      if (!c) return;
      c.fighter!.party = party; c.fighter!.slot = i;
      party.members.push(c);
    });
    if (party.members.length === 3) this.parties.push(party);
    else for (const c of party.members) c.fighter!.party = null;
  }

  info(): string {
    const m = this.monsters().map((c) => c.fighter!.kind);
    const counts: Record<string, number> = {};
    for (const k of m) counts[k] = (counts[k] ?? 0) + 1;
    const heroes = HEROES.flatMap((k) => this.host.live(k)).map((h) => {
      const f = h.fighter!, d = f.foe ? Math.round(Math.hypot(f.foe.x - h.x, f.foe.z - h.z)) : -1;
      return `${f.kind}[hp${Math.round(f.hp)} foe${d} cd${f.cool.toFixed(1)}${f.down > 0 ? ' DOWN' : ''}]`;
    });
    return `monsters=${JSON.stringify(counts)} parties=${this.parties.map((p) => `${p.name}:${p.mode}${p.fighting ? '!' : ''}`).join(',')} shots=${this.shots.length} ${heroes.join(' ')}`;
  }
}
