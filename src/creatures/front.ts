// The war front (world/front.ts): while the player is near, both field camps
// are manned (soldiers round the fire, orcs by their huts and drum). Every
// minute or two each side sends a few fighters out and they clash on the
// field. Each night the orc drums beat; at dawn the horn sounds and the big
// battle is fought, two lines of twenty-odd a side: volleys, then the charge.
// The winner's banner stands on the field until the next battle. Away from
// the front the battle is still fought (and announced), just not drawn.
// No gore: the fallen are knocked down, get up and limp back to their camp.

import * as THREE from 'three';
import { createPropMaterial, type EnvUniforms } from '../render/materials';
import { frontLayout, type FrontLayout } from '../world/front';
import type { Terrain } from '../world/terrain';
import type { Creature } from './creatures';
import { fighterStats, type FighterKind, type NightDirector } from './night';
import type { WarHost } from './war';
import { angleTo, pick, rand, TAU } from './util';

export interface FrontHost extends WarHost {
  announce(kicker: string, title: string, sub: string): void;
  shove(c: Creature, dx: number, dz: number): void;
}

/** 0: the castle's house, 1: the orcs. */
type Side = 0 | 1;
type Role = 'camp' | 'skirmish' | 'battle';

/** What a fighter at the front is doing (Fighter.front). */
export interface FrontOrder {
  side: Side;
  role: Role;
  /** Where to stand: the camp spot, the formation slot or the skirmish meeting point. */
  tx: number; tz: number;
  /** Facing once there. */
  yaw: number;
  /** Ranged fighters stay in the second rank. */
  ranged: boolean;
  /** Knocked down once: limping back to camp. */
  back: boolean;
  scan: number;
  /** Seconds walking into a wall (a ledge, a stake): such fighters try a way round, and are dropped in the end. */
  stuck: number;
  /** A way round: seconds left on it, and its heading. */
  detour: number; dyaw: number;
}

type Phase = 'none' | 'form' | 'volley' | 'charge' | 'won';

interface Battle {
  phase: Phase;
  t: number;
  /** Seconds left of a battle fought away from the player. */
  away: number;
  start: [number, number];
  winner: Side | null;
  /** The day's fortune: each side's blows count for a little more or less. */
  luck: [number, number];
}

/** Player distance from the field at which the front comes alive (and goes quiet again). */
const ON = 170, OFF = 210;
const CAMP_CREW: Array<[FighterKind, FighterKind]> = [['soldier', 'orc'], ['soldier', 'orc'], ['bowman', 'orcspear'], ['soldier', 'orc'], ['bowman', 'orcspear'], ['captain', 'wolf']];
const LINE: Record<Side, Array<[FighterKind, number]>> = {
  0: [['soldier', 14], ['bowman', 8], ['captain', 1]],
  1: [['orc', 14], ['orcspear', 6], ['wolf', 3], ['shaman', 1]],
};
/** Front fighters jump down steps this deep (camp pads and field edges can be steep). */
const DROP = 4.5;
/** Damage dealt in the big battle, against the usual. */
const BATTLE_DMG = 0.5;
const SKIRMISH: Record<Side, FighterKind[]> = { 0: ['soldier', 'soldier', 'bowman'], 1: ['orc', 'orc', 'orcspear', 'wolf'] };

const HUMAN_CAMP = ['Ateşi canlı tutun.', 'Orklar bu gece de davul çalıyor.', 'Şafakta ne olacak dersin?', 'Kalkanını sağlam tut.', 'Evde ekmek kokusu...', 'Nöbet sende.'];
const ORC_CAMP = ['Grakh, kurak taş.', 'Dur\'kal mor-ash!', 'Insan... yumuşak.', 'Zug zug. Bekle.', 'Ghor-tak! Davul!', 'Kemik çok. Yemek az.'];
const HUMAN_CHARGE = ['Hücum!', 'Sıraları koruyun!', 'Bozulmayın!', 'İleri!', 'Kalkanlar!'];
const ORC_CHARGE = ['GRAKH!', 'Dur\'kal!', 'Ghor-tak mor!', 'Kan-ash!', 'URRAGH!'];
const HUMAN_WIN = ['Ova bizim!', 'Geri çekiliyorlar!', 'Zafer!', 'Sancağı dikin!'];
const ORC_WIN = ['Ova ork!', 'Kaç insan, kaç!', 'Grakh-tor!', 'Sancak dik!'];
const LIMP = ['Geri... çekiliyorum.', 'Yaram var.', 'Kampa dönüyorum.'];

export class FrontDirector {
  readonly group = new THREE.Group();
  readonly L: FrontLayout | null;
  private active = false;
  private px = 0; private pz = 0;
  private time = 0;
  private side: Record<Side, Creature[]> = { 0: [], 1: [] };
  private campT = 0;
  private skirmishT = rand(40, 70);
  private skirmishLeft = 0;
  private wasNight = false;
  private drumT = 3;
  private talkT = 6;
  readonly battle: Battle = { phase: 'none', t: 0, away: 0, start: [0, 0], winner: null, luck: [1, 1] };
  /** Last battle's winner (saved per world), and the game day it was fought. */
  last: { winner: Side; day: number } | null = null;
  private storeKey: string;
  private banner: THREE.Group | null = null;
  private mats: THREE.Material[] = [];
  private env?: EnvUniforms;
  private shadows: boolean;
  /** Called with the winner when a battle ends (gossip, garrisons). */
  onResult: ((winner: Side) => void) | null = null;

  constructor(private terrain: Terrain, private host: FrontHost, private night: NightDirector, env?: EnvUniforms, shadows = false) {
    this.L = frontLayout(terrain);
    this.env = env;
    this.shadows = shadows;
    this.storeKey = `pixelia-front-${terrain.seed}`;
    try {
      const raw = localStorage.getItem(this.storeKey);
      if (raw) {
        const d = JSON.parse(raw) as { winner?: number; day?: number };
        if ((d.winner === 0 || d.winner === 1) && typeof d.day === 'number') this.last = { winner: d.winner, day: d.day };
      }
    } catch { /* storage blocked */ }
    if (this.last) this.plantBanner(this.last.winner);
  }

  /** Names for announcements: the house and the horde. */
  private names(): [string, string] {
    const L = this.L!;
    return [L.house.name, L.capital.name];
  }

  /** Battles fought so far (the day count saved with the result). */
  private day = 0;

  update(dt: number, px: number, pz: number, night: number): void {
    const L = this.L;
    if (!L) return;
    this.time += dt;
    this.px = px; this.pz = pz;
    const d = Math.hypot(L.x - px, L.z - pz);
    const was = this.active;
    this.active = this.active ? d < OFF : d < ON;
    for (const s of [0, 1] as Side[]) this.side[s] = this.side[s].filter((c) => !c.gone);

    // Night: the drums; dawn: the horn and the battle (once a night).
    if (night > 0.7) this.wasNight = true;
    if (this.wasNight && night < 0.3 && this.battle.phase === 'none') {
      this.wasNight = false;
      this.day = Math.max(this.day, this.last?.day ?? 0) + 1;
      this.startBattle();
    }
    if (night > 0.6 && this.active) {
      this.drumT -= dt;
      if (this.drumT <= 0) {
        this.drumT = rand(5, 9);
        const drummer = this.side[1].find((c) => c.fighter!.front!.role === 'camp' && c.dying === 0);
        if (drummer) { this.host.sound('drum', drummer); drummer.tail = 1.4; }
      }
    }
    this.runBattle(dt);
    if (this.active) this.spread(dt);
    if (!this.active) {
      if (was) this.skirmishLeft = 0;
      return;
    }
    // Camp fires (bigger at night).
    for (const s of [0, 1] as Side[]) {
      const C = this.campOf(s);
      this.host.fire.bonfire(C.fire[0] + 0.5, C.y + 1.1, C.fire[1] + 0.5, dt, night > 0.5 ? 1.3 : 0.9);
    }
    // Keep the camps manned.
    this.campT -= dt;
    if (this.campT <= 0) { this.campT = 1; this.manCamps(); }
    // Skirmishes between battles.
    if (this.battle.phase === 'none') {
      if (this.skirmishLeft > 0) {
        this.skirmishLeft -= dt;
        const out = (s: Side) => this.side[s].filter((c) => this.fighting(c, 'skirmish'));
        if (this.skirmishLeft <= 0 || !out(0).length || !out(1).length) this.endSkirmish();
      } else {
        this.skirmishT -= dt;
        if (this.skirmishT <= 0) { this.skirmishT = rand(60, 120); this.startSkirmish(); }
      }
    }
    // A word now and then round the fires.
    this.talkT -= dt;
    if (this.talkT <= 0) {
      this.talkT = rand(8, 15);
      const s: Side = Math.random() < 0.5 ? 0 : 1;
      const crew = this.side[s].filter((m) => m.fighter!.front!.role === 'camp' && m.fighter!.down <= 0);
      if (crew.length) this.say(pick(crew), pick(s ? ORC_CAMP : HUMAN_CAMP), 3);
    }
  }

  /** The castle or capital whose side lost the last battle (it keeps fewer fighters about until the next). */
  lost(site: { id: string }): boolean {
    const L = this.L;
    if (!L || !this.last) return false;
    return site.id === (this.last.winner ? L.castle.id : L.capital.id);
  }

  /** A line for the town crier about the last battle, or null. */
  news(): string | null {
    const L = this.L;
    if (!L || !this.last) return null;
    return this.last.winner
      ? `Cepheden kötü haber! ${L.capital.name} ${L.name}'nı aldı, ${L.house.name} geri çekildi!`
      : `Cepheden müjde! ${L.house.name} ${L.name}'nı tuttu, orklar kaçtı!`;
  }

  /** Map and compass marks: the field (lit up while a battle is on). */
  markers(): Array<{ x: number; z: number; label: string; done: boolean; icon: string }> {
    const L = this.L;
    if (!L) return [];
    // Between battles the field stays on the map, greyed (the compass skips it).
    const on = this.battle.phase !== 'none' && this.battle.phase !== 'won';
    return [{ x: L.x, z: L.z, label: on ? 'Büyük Savaş' : L.name, done: !on, icon: '⚔' }];
  }

  // ------------------------------------------------------------ camps and skirmishes

  private campOf(s: Side) { return s ? this.L!.orc : this.L!.human; }
  /** Unit vector from this side towards the enemy. */
  private ahead(s: Side): [number, number] {
    const A = this.L!.A;
    return s ? [-Math.cos(A), -Math.sin(A)] : [Math.cos(A), Math.sin(A)];
  }

  private fighting(c: Creature, role: Role): boolean {
    const o = c.fighter!.front!;
    return o.role === role && !o.back && c.dying === 0 && c.fighter!.down <= 0;
  }

  private spawn(kind: FighterKind, s: Side, role: Role, x: number, z: number, tx: number, tz: number, yaw: number): Creature | null {
    // On open ground at or near (x, z): not on a stake, a tent or a ledge.
    let c: Creature | null = null;
    for (let k = 0; k < 8 && !c; k++) {
      const a = k * 2.4, r = k === 0 ? 0 : 0.6 + k * 0.3;
      c = this.night.spawn(kind, x + Math.cos(a) * r, z + Math.sin(a) * r);
    }
    if (!c) return null;
    const f = c.fighter!;
    f.front = { side: s, role, tx, tz, yaw, ranged: fighterStats(kind).reach > 4, back: false, scan: rand(0, 0.5), stuck: 0, detour: 0, dyaw: 0 };
    this.side[s].push(c);
    return c;
  }

  private manCamps(): void {
    for (const s of [0, 1] as Side[]) {
      const C = this.campOf(s);
      const crew = this.side[s].filter((c) => c.fighter!.front!.role === 'camp');
      for (let i = crew.length; i < CAMP_CREW.length; i++) {
        const kind = CAMP_CREW[i][s];
        // Round the fire, facing it.
        const a = (i / CAMP_CREW.length) * TAU + (s ? 0.4 : 0);
        const tx = C.fire[0] + 0.5 + Math.cos(a) * 3, tz = C.fire[1] + 0.5 + Math.sin(a) * 3;
        if (!this.spawn(kind, s, 'camp', C.x + 0.5 + rand(-3, 3), C.z + 0.5 + rand(-3, 3), tx, tz, Math.atan2(C.fire[0] + 0.5 - tx, C.fire[1] + 0.5 - tz))) return;
      }
    }
  }

  private startSkirmish(): void {
    const L = this.L!;
    const ca = Math.cos(L.A), sa = Math.sin(L.A);
    // Somewhere on the field, a little off the middle.
    const along = rand(-10, 10), across = rand(-16, 16);
    const mx = L.x + ca * along - sa * across, mz = L.z + sa * along + ca * across;
    for (const s of [0, 1] as Side[]) {
      const C = this.campOf(s);
      const [ax, az] = this.ahead(s);
      const kinds = [...SKIRMISH[s]].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 3));
      kinds.forEach((k, i) => {
        const side = (i - (kinds.length - 1) / 2) * 2;
        const tx = mx - ax * 5 - az * side, tz = mz - az * 5 + ax * side;
        this.spawn(k, s, 'skirmish', C.gx + ax * 3 + rand(-2, 2), C.gz + az * 3 + rand(-2, 2), tx, tz, Math.atan2(ax, az));
      });
    }
    this.skirmishLeft = 100;
  }

  private endSkirmish(): void {
    this.skirmishLeft = 0;
    const standing = (s: Side) => this.side[s].filter((c) => this.fighting(c, 'skirmish'));
    const win = standing(0).length ? standing(1).length ? null : 0 : standing(1).length ? 1 : null;
    for (const s of [0, 1] as Side[]) for (const c of this.side[s]) {
      const o = c.fighter!.front!;
      if (o.role !== 'skirmish') continue;
      if (win === s && !o.back && Math.random() < 0.6) this.say(c, pick(s ? ORC_WIN : HUMAN_WIN), 2);
      o.back = true;
    }
  }

  // ------------------------------------------------------------ the battle

  private startBattle(): void {
    const [house, horde] = this.names();
    this.battle.phase = 'form';
    this.battle.t = 0;
    this.battle.winner = null;
    this.battle.luck = [rand(0.8, 1.2), rand(0.8, 1.2)];
    this.battle.away = this.active ? 0 : rand(120, 180);
    this.host.announce('BÜYÜK SAVAŞ', `${house} ile ${horde} çarpışıyor!`, `${this.L!.name} · haritada ⚔`);
    if (this.skirmishLeft > 0) this.endSkirmish();
    if (this.active) this.raiseLines();
  }

  /** Both lines march out from their camps to face each other across the field. */
  private raiseLines(): void {
    const L = this.L!;
    for (const s of [0, 1] as Side[]) {
      const C = this.campOf(s);
      const [ax, az] = this.ahead(s);
      const cx = L.x - ax * 13, cz = L.z - az * 13;
      let front = 0, rear = 0;
      for (const [kind, n] of LINE[s]) for (let i = 0; i < n; i++) {
        const ranged = fighterStats(kind).reach > 4 || kind === 'captain';
        const k = ranged ? rear++ : front++;
        const across = ((k % 2 ? 1 : -1) * Math.ceil(k / 2)) * 1.7;
        const back = ranged ? 3.2 : 0;
        const tx = cx - ax * back - az * across, tz = cz - az * back + ax * across;
        // From a little beyond the muster point (clear of the stakes), spread along the line.
        const sx = C.gx + ax * 3 - az * rand(-5, 5), sz = C.gz + az * 3 + ax * rand(-5, 5);
        const c = this.spawn(kind, s, 'battle', sx, sz, tx, tz, Math.atan2(ax, az));
        if (c) c.fighter!.cool = rand(0, 2);
      }
      const horn = this.side[s].find((c) => c.fighter!.front!.role === 'battle');
      if (horn) this.host.sound(s ? 'drum' : 'horn', horn);
    }
  }

  private runBattle(dt: number): void {
    const b = this.battle;
    if (b.phase === 'none') return;
    b.t += dt;
    // Fought away from the player: only the outcome.
    if (b.away > 0) {
      if (this.active && b.phase !== 'won') {
        // The player arrives while it is on: draw the rest of it.
        b.away = 0; b.phase = 'charge'; b.t = 0;
        this.raiseLines();
        return;
      }
      b.away -= dt;
      if (b.away <= 0) this.finish(Math.random() < this.odds() ? 0 : 1);
      return;
    }
    const line = (s: Side) => this.side[s].filter((c) => c.fighter!.front!.role === 'battle');
    const standing = (s: Side) => line(s).filter((c) => this.fighting(c, 'battle')).length;
    if (b.phase === 'form' && (b.t > 22 || (b.t > 8 && this.formed()))) {
      b.phase = 'volley'; b.t = 0;
    } else if (b.phase === 'volley' && b.t > 12) {
      b.phase = 'charge'; b.t = 0;
      for (const s of [0, 1] as Side[]) {
        const lead = line(s).find((c) => c.fighter!.kind === 'captain' || c.fighter!.kind === 'shaman') ?? line(s)[0];
        if (lead) { this.say(lead, pick(s ? ORC_CHARGE : HUMAN_CHARGE), 2.4, 140); this.host.sound(s ? 'drum' : 'horn', lead); }
        for (const c of line(s)) if (Math.random() < 0.25) this.say(c, pick(s ? ORC_CHARGE : HUMAN_CHARGE), 1.6, 80);
      }
    } else if (b.phase === 'charge') {
      const n0 = standing(0), n1 = standing(1);
      const t0 = line(0).length || 1, t1 = line(1).length || 1;
      if (n0 / t0 < 0.3 || n1 / t1 < 0.3 || b.t > 200 || !this.active) {
        this.finish(n0 / t0 >= n1 / t1 ? 0 : 1);
      }
    } else if (b.phase === 'won' && b.t > 25) {
      b.phase = 'none';
      for (const s of [0, 1] as Side[]) for (const c of line(s)) c.fighter!.front!.back = true;
    }
  }

  /** The house's chance in a battle fought out of sight: the loser of the last one is hungrier. */
  private odds(): number {
    return this.last ? (this.last.winner === 0 ? 0.42 : 0.58) : 0.5;
  }

  private formed(): boolean {
    for (const s of [0, 1] as Side[]) for (const c of this.side[s]) {
      const o = c.fighter!.front!;
      if (o.role === 'battle' && !o.back && Math.hypot(o.tx - c.x, o.tz - c.z) > 2.5) return false;
    }
    return true;
  }

  private finish(winner: Side): void {
    const day = this.day;
    const b = this.battle;
    b.phase = 'won'; b.t = 0; b.winner = winner;
    const [house, horde] = this.names();
    this.host.announce('SAVAŞ BİTTİ', winner ? `${horde} ovayı aldı!` : `${house} ovayı tuttu!`, `${this.L!.name} · ${winner ? 'ork sancağı dikildi' : 'hanedan sancağı dikildi'}`);
    for (const c of this.side[winner]) if (this.fighting(c, 'battle') && Math.random() < 0.5) this.say(c, pick(winner ? ORC_WIN : HUMAN_WIN), 2.4, 120);
    // The losers fall back to their camp.
    for (const c of this.side[(1 - winner) as Side]) if (c.fighter!.front!.role === 'battle') c.fighter!.front!.back = true;
    this.last = { winner, day };
    try { localStorage.setItem(this.storeKey, JSON.stringify(this.last)); } catch { /* storage blocked */ }
    this.plantBanner(winner);
    this.onResult?.(winner);
  }

  /** The winner's banner on a tall pole in the middle of the field. */
  private plantBanner(winner: Side): void {
    const L = this.L;
    if (!L || !this.env) return;
    if (this.banner) { this.group.remove(this.banner); this.banner = null; }
    for (const m of this.mats) m.dispose();
    const wood = createPropMaterial(this.env, { color: '#5a3e26', shadows: this.shadows });
    const cloth = createPropMaterial(this.env, { color: winner ? '#7a2018' : L.house.color, shadows: this.shadows });
    this.mats = [wood, cloth];
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 6, 0.16), wood);
    pole.position.y = 3;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 2.2), cloth);
    flag.position.set(0, 5.1, 1.15);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.4), wood);
    bar.position.set(0, 5.9, 1.15);
    g.add(pole, flag, bar);
    g.position.set(L.x + 0.5, Math.floor(this.terrain.sample(L.x + 0.5, L.z + 0.5).h) + 1, L.z + 0.5);
    g.rotation.y = L.A;
    this.banner = g;
    this.group.add(g);
  }

  // ------------------------------------------------------------ per fighter

  /** Returns false when the fighter should be removed. */
  step(c: Creature, dt: number): boolean {
    const f = c.fighter!, o = f.front!;
    if (!this.active) return false;
    f.flash = Math.max(0, f.flash - dt);
    f.cool -= dt;
    // Knocked down: lie there a while, then get up and limp back to camp.
    if (f.down > 0) {
      f.down -= dt;
      c.roll += (Math.PI / 2 - c.roll) * Math.min(1, dt * 5);
      c.bob += (-0.25 - c.bob) * Math.min(1, dt * 5);
      c.walkAmp = 0;
      this.host.idle(c, dt);
      if (f.down <= 0) {
        f.hp = f.max * 0.5;
        if (!o.back && Math.random() < 0.4) this.say(c, pick(LIMP), 2);
        o.back = true;
      }
      return true;
    }
    c.roll += (0 - c.roll) * Math.min(1, dt * 5);
    c.bob += (0 - c.bob) * Math.min(1, dt * 5);
    c.tail += (0 - c.tail) * Math.min(1, dt * 4);
    c.flapAmp += (0 - c.flapAmp) * Math.min(1, dt * 3);
    c.flap += dt * 10;
    c.glow = f.flash * 4;

    if (o.stuck > 12) return false;
    if (o.back) return this.goBack(c, o, dt);

    // Fight whoever of the other side is near (camp crews only defend their camp).
    o.scan -= dt;
    if (o.scan <= 0) {
      o.scan = 0.4;
      const b = this.battle.phase;
      // Out on the field they go looking for the enemy; ranged ones close in until in range.
      const seek = o.role === 'skirmish' || (o.role === 'battle' && b === 'charge');
      const reach = seek ? 70 : o.ranged ? fighterStats(f.kind).reach : o.role === 'camp' ? 8 : 16;
      const hold = o.role === 'battle' && (b === 'form' || (b === 'volley' && !o.ranged));
      f.foe = hold && !o.ranged ? null : this.nearestFoe(c, o.side, reach);
      if (hold && o.ranged && b === 'form') f.foe = null;
    }
    const foe = f.foe;
    if (foe && !foe.gone && foe.dying === 0 && foe.fighter!.down <= 0 && !foe.fighter!.front?.back) return this.fight(c, foe, dt);
    f.foe = null;

    // No one to fight: to the spot, then face the way ordered (or the fire).
    if (Math.hypot(o.tx - c.x, o.tz - c.z) > 0.7) {
      this.walk(c, o.tx, o.tz, o.role === 'camp' ? 1.2 : 1.7, dt);
      return true;
    }
    this.host.idle(c, dt);
    c.yaw += angleTo(c.yaw, o.yaw + (o.role === 'camp' ? Math.sin(this.time * 0.3 + c.seed) * 0.3 : 0)) * Math.min(1, dt * 4);
    return true;
  }

  private goBack(c: Creature, o: FrontOrder, dt: number): boolean {
    const C = this.campOf(o.side);
    // Through the gap at the muster point, then in among the tents.
    const atMuster = Math.hypot(C.gx - c.x, C.gz - c.z) < 2.5;
    if (!atMuster && Math.hypot(C.x - c.x, C.z - c.z) > Math.hypot(C.x - C.gx, C.z - C.gz)) {
      this.walk(c, C.gx, C.gz, 1.1, dt);
      return true;
    }
    if (o.role === 'camp') { o.back = false; return true; }
    return this.walk(c, C.x + 0.5, C.z + 0.5, 1.1, dt) === 'moving' || Math.hypot(C.x - c.x, C.z - c.z) > 3;
  }

  private nearestFoe(c: Creature, s: Side, r: number): Creature | null {
    let best: Creature | null = null, bd = r;
    for (const e of this.side[(1 - s) as Side]) {
      const ef = e.fighter!;
      if (e.gone || e.dying > 0 || ef.down > 0 || ef.front!.back) continue;
      const d = Math.hypot(e.x - c.x, e.z - c.z);
      // Nobody storms the other camp: its crew is fought only when it comes close.
      if (ef.front!.role === 'camp' && d > 10) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private fight(c: Creature, foe: Creature, dt: number): boolean {
    const f = c.fighter!, k = fighterStats(f.kind);
    const d = Math.hypot(foe.x - c.x, foe.z - c.z);
    // The big battle is a long grind, not a quick brawl.
    const o = f.front!;
    const dmg = k.dmg * (o.role === 'battle' ? BATTLE_DMG * this.battle.luck[o.side] : 1);
    if (k.reach > 4) {
      if (d < 4) {
        // Too close for a bow: step back.
        const ax = c.x - foe.x, az = c.z - foe.z, l = Math.hypot(ax, az) || 1;
        this.walk(c, c.x + (ax / l) * 3, c.z + (az / l) * 3, 2, dt);
        return true;
      }
      if (d > k.reach) { this.walk(c, foe.x, foe.z, 1.6, dt); return true; }
      this.face(c, foe, dt);
      if (f.cool <= 0) {
        f.cool = k.cool * rand(0.9, 1.3);
        c.tail = 1.4;
        this.night.cast(c, foe, f.kind === 'shaman' ? 'bolt' : 'arrow', dmg * rand(0.7, 1.1));
      }
      return true;
    }
    if (d > k.reach) { this.walk(c, foe.x, foe.z, f.kind === 'wolf' ? 3 : 2.2, dt); return true; }
    this.face(c, foe, dt);
    if (f.cool <= 0) {
      f.cool = k.cool * rand(0.85, 1.2);
      c.flap = 0; c.flapAmp = 1.3;
      this.host.sound('swing', c);
      this.night.hit(foe, dmg * rand(0.7, 1.2), c);
    }
    return true;
  }

  /** Fighters standing in one spot drift apart instead of sharing it. */
  private spread(dt: number): void {
    const all = [...this.side[0], ...this.side[1]].filter((c) => c.dying === 0);
    const R = 0.85, push = Math.min(1, dt * 4);
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j];
        let dx = a.x - b.x, dz = a.z - b.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2);
        if (d < 1e-3) { const t = Math.random() * Math.PI * 2; dx = Math.sin(t); dz = Math.cos(t); } else { dx /= d; dz /= d; }
        const k = (R - d) * 0.5 * push;
        this.host.shove(a, dx * k, dz * k);
        this.host.shove(b, -dx * k, -dz * k);
      }
    }
  }

  /** walkToward, counting the time spent stuck. */
  private walk(c: Creature, tx: number, tz: number, speed: number, dt: number): 'moving' | 'arrived' | 'blocked' {
    const o = c.fighter!.front!;
    // Off on a way round a ledge for a moment, then try straight again.
    if (o.detour > 0) {
      o.detour -= dt;
      const r = this.host.walkToward(c, c.x + Math.sin(o.dyaw) * 3, c.z + Math.cos(o.dyaw) * 3, speed, dt, DROP);
      if (r === 'blocked') { o.stuck += dt; o.dyaw += Math.PI / 2; }
      return 'moving';
    }
    const r = this.host.walkToward(c, tx, tz, speed, dt, DROP);
    if (r !== 'blocked') { if (r === 'moving' && o.stuck > 0) o.stuck = Math.max(0, o.stuck - dt * 0.5); return r; }
    o.stuck += dt;
    if (o.stuck > 0.6) {
      o.detour = rand(0.8, 1.8);
      o.dyaw = Math.atan2(tx - c.x, tz - c.z) + (Math.random() < 0.5 ? 1 : -1) * rand(1.6, 2.6);
    }
    return r;
  }

  private face(c: Creature, o: { x: number; z: number }, dt: number): void {
    this.host.idle(c, dt);
    c.yaw += angleTo(c.yaw, Math.atan2(o.x - c.x, o.z - c.z)) * Math.min(1, dt * 6);
  }

  private say(c: Creature, text: string, sec: number, r = 40): void {
    if (Math.hypot(c.x - this.px, c.z - this.pz) < r) this.host.say(c, text, sec);
  }

  // ------------------------------------------------------------ dev

  info(): string {
    const L = this.L;
    if (!L) return 'no front';
    const count = (s: Side, r: Role) => this.side[s].filter((c) => c.fighter!.front!.role === r).length;
    const up = (s: Side, r: Role) => this.side[s].filter((c) => this.fighting(c, r)).length;
    return `${L.name} @${L.x},${L.z} ${this.active ? 'active' : 'quiet'} d=${Math.round(Math.hypot(L.x - this.px, L.z - this.pz))} | camp ${count(0, 'camp')}/${count(1, 'camp')}`
      + ` skirmish ${up(0, 'skirmish')}/${count(0, 'skirmish')} v ${up(1, 'skirmish')}/${count(1, 'skirmish')} (${Math.round(this.skirmishLeft)}s, next ${Math.round(this.skirmishT)}s)`
      + ` | battle ${this.battle.phase} t=${Math.round(this.battle.t)} ${up(0, 'battle')}/${count(0, 'battle')} v ${up(1, 'battle')}/${count(1, 'battle')}`
      + ` | crowd ${this.crowd()}`
      + ` | last ${this.last ? (this.last.winner ? 'orcs' : 'house') + ' day ' + this.last.day : '-'}`
      + ` | out ${[0, 1].map((s) => this.side[s as Side].filter((c) => c.fighter!.front!.role !== 'camp').map((c) => `${c.fighter!.kind[0]}${Math.round(c.x)},${Math.round(c.z)}${c.fighter!.down > 0 ? 'v' : c.fighter!.front!.back ? '<' : ''}`).join(' ')).join(' | ')}`;
  }

  /** Pairs of standing fighters closer than half a block. */
  private crowd(): number {
    const all = [...this.side[0], ...this.side[1]].filter((c) => c.dying === 0);
    let n = 0;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) < 0.5) n++;
    return n;
  }

  /** Dev: 'skirmish' starts one now, 'battle' sounds the horn, 'tp' gives the camp and field spots. */
  dev(what: string): string {
    if (!this.L) return 'no front';
    if (what === 'skirmish') { this.skirmishT = 0; return 'ok'; }
    if (what === 'battle') {
      if (this.battle.phase === 'none') { this.day = Math.max(this.day, this.last?.day ?? 0) + 1; this.startBattle(); }
      return this.info();
    }
    return `field ${this.L.x},${this.L.z} house camp ${this.L.human.x},${this.L.human.z} orc camp ${this.L.orc.x},${this.L.orc.z}`;
  }
}
