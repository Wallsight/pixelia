// Rare creatures. Every so often a named beast appears somewhere out on the
// roads, a few hundred steps from the player: a notice goes up on screen and
// a skull marks the place on the map. Go there and a band of adventurers turns
// up to fight it, calling to each other like players in a party chat. The
// beast knocks them about; the mage heals, the archer keeps her distance, the
// warrior holds its attention, and in the end it falls and they share out the
// loot. Unvisited, it wanders off after a while.

import { SEA } from '../world/blocks';
import { SITE_CITY, SITE_CROSSROAD, pointAlong, polylineLength } from '../world/structures';
import type { Terrain } from '../world/terrain';
import type { Creature } from './creatures';
import { fighterStats, type FighterKind, type NightDirector } from './night';
import type { WarHost } from './war';
import { BATTLE_CALLS, ROAD_BANTER, UP_CALLS, VICTORY_CALLS, exchange } from './banter';
import { angleTo, direction, pick, rand, TAU } from './util';

export interface RareHost extends WarHost {
  partySay(c: Creature, party: string, text: string): void;
  announce(kicker: string, title: string, sub: string): void;
  dragonDuel(x: number, y: number, z: number): [Creature, Creature] | null;
  dueling(c: Creature): boolean;
}

interface RareDef {
  name: string;
  kind: FighterKind;
  scale: number;
  hp: number;
  dmg: number;
  tint?: string;
  glow: number;
  roar: string[];
}

const DEFS: RareDef[] = [
  { name: 'Kemik Kral', kind: 'skeleton', scale: 2.3, hp: 170, dmg: 7, tint: '#f4e8c8', glow: 0.3, roar: ['Kemiklerinizi tacıma dizeceğim!', 'Toprağa dönün!'] },
  { name: 'Taş Dev Gorlu', kind: 'troll', scale: 1.8, hp: 230, dmg: 9, tint: '#a8b098', glow: 0, roar: ['GORLU EZER!', 'Küçük... insanlar...'] },
  { name: 'Kül Şeytanı', kind: 'demon', scale: 1.9, hp: 200, dmg: 8, glow: 0.6, roar: ['Yanın!', 'Külünüzü rüzgâra savuracağım!'] },
  { name: 'Örümcek Ana', kind: 'spider', scale: 2.6, hp: 160, dmg: 6, tint: '#4a3048', glow: 0, roar: ['Sssss...', 'Yavrularım aç...'] },
  { name: 'Soluk Şövalye', kind: 'ghost', scale: 2.0, hp: 160, dmg: 7, glow: 0.8, roar: ['Yeminim bitmedi...', 'Kimse geçemez...'] },
];
/** Seconds between rare events. */
const RARE_EVERY = 15 * 60;
/** Seconds from the start of play to the first rare event. */
const RARE_FIRST = 5 * 60;
const PARTY_NAMES = ['Kayıp Loot', 'Gece Farmcıları', 'AFK Olmayanlar', 'Son Pot', 'Wipe Yok', 'Kritik Vuruş', 'Taze Respawn', 'Altın Kalkan'];

export interface RareEvent {
  def: RareDef;
  x: number; z: number;
  /** Seconds before an unvisited beast wanders off; after the kill, before the party leaves. */
  t: number;
  state: 'waiting' | 'fight' | 'won';
  hp: number;
  boss: Creature | null;
  party: Creature[];
  partyName: string;
  talkT: number;
  slamT: number;
  roarT: number;
  /** Wait before trying again after the beast or its party could not be spawned. */
  retryT: number;
}

export class RareDirector {
  private events: RareEvent[] = [];
  /** The dance of dragons over (x, z), while the riders fight. */
  private duels: Array<{ x: number; z: number; a: Creature; b: Creature; t: number }> = [];
  private nextT = RARE_FIRST;
  private px = 0; private pz = 0;

  constructor(private terrain: Terrain, private host: RareHost, private night: NightDirector) {}

  /** Seconds until the next rare event. */
  get nextIn(): number { return Math.max(0, this.nextT); }

  /** Map marks: where the beasts are (and whether they are still about). */
  markers(): Array<{ x: number; z: number; label: string; done: boolean }> {
    return [
      ...this.events.map((e) => ({ x: e.x, z: e.z, label: e.def.name, done: e.state === 'won' })),
      ...this.duels.map((d) => ({ x: d.x, z: d.z, label: 'Ejderhaların Dansı', done: false })),
    ];
  }

  update(dt: number, px: number, pz: number): void {
    this.px = px; this.pz = pz;
    this.nextT -= dt;
    if (this.nextT <= 0) {
      this.nextT = RARE_EVERY;
      // Now and then (or while a beast is still about) the sky event instead: two riders on their dragons.
      const busy = this.events.some((e) => e.state !== 'won');
      const ok = busy || Math.random() < 0.3 ? this.startDuel() : this.start();
      // Nowhere fitting just now (out at sea, say): try again shortly.
      if (!ok) this.nextT = 30;
    }
    for (const d of this.duels) d.t -= dt;
    this.duels = this.duels.filter((d) => d.t > 0 && (this.host.dueling(d.a) || this.host.dueling(d.b)));
    for (const e of this.events) {
      e.t -= dt;
      e.retryT -= dt;
      const d = Math.hypot(e.x - px, e.z - pz);
      if (e.state !== 'won' && d < 110 && !e.boss && e.retryT <= 0) this.materialise(e);
      // Check for the kill before the far check below, which would drop a dying beast unrewarded.
      if (e.boss && (e.boss.dying > 0 || e.boss.fighter!.hp <= 0) && e.state !== 'won') this.victory(e);
      if (e.boss && (e.boss.gone || d > 230)) {
        // The player went away: the fight pauses (the beast keeps its wounds).
        if (!e.boss.gone && e.boss.dying === 0) e.hp = e.boss.fighter!.hp;
        e.boss = null;
        if (e.state === 'fight') e.state = 'waiting';
      }
      e.party = e.party.filter((c) => !c.gone);
      if (e.state !== 'won' && e.party.length === 0 && e.boss && d < 110 && e.retryT <= 0) this.spawnParty(e);
      this.chatter(e, dt);
    }
    this.events = this.events.filter((e) => e.t > 0 || (e.boss && !e.boss.gone && e.state !== 'won'));
  }

  private start(): boolean {
    const spot = this.findSpot();
    if (!spot) return false;
    const def = pick(DEFS);
    const e: RareEvent = {
      def, x: spot[0], z: spot[1], t: 600, state: 'waiting', hp: def.hp, boss: null, party: [],
      partyName: pick(PARTY_NAMES), talkT: rand(6, 10), slamT: rand(8, 12), roarT: 4, retryT: 0,
    };
    this.events.push(e);
    const d = Math.hypot(e.x - this.px, e.z - this.pz);
    this.host.announce('NADİR YARATIK', `${def.name} göründü!`, `${direction(e.x - this.px, e.z - this.pz)}, ${Math.round(d / 50) * 50} adım ötede · haritada ☠`);
    return true;
  }

  /** The dance of dragons: in the sky 100-170 steps away (anywhere outside the city). */
  private startDuel(): boolean {
    const city = this.terrain.city;
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * TAU, r = rand(100, 170);
      const x = this.px + Math.cos(a) * r, z = this.pz + Math.sin(a) * r;
      if (city && Math.hypot(x - city.x, z - city.z) < 200) continue;
      const y = Math.max(SEA, this.terrain.sample(x, z).h);
      const pair = this.host.dragonDuel(x, y, z);
      if (!pair) return false;
      this.duels.push({ x: Math.round(x), z: Math.round(z), a: pair[0], b: pair[1], t: 150 });
      this.host.announce('EJDERHALARIN DANSI', 'İki ejder süvarisi gökyüzünde çarpışıyor!', `${direction(x - this.px, z - this.pz)}, ${Math.round(r / 10) * 10} adım ötede · Yeşiller ve Siyahlar`);
      return true;
    }
    return false;
  }

  /** A place on a road 220-520 steps away, clear of towns, camps and water. */
  private findSpot(): [number, number] | null {
    const { px, pz } = this;
    const st = this.terrain.structures;
    const roads = st.roadsNear(px - 560, pz - 560, px + 560, pz + 560, 0);
    const city = this.terrain.city;
    for (let tries = 0; tries < 40 && roads.length; tries++) {
      const r = pick(roads), len = polylineLength(r.pts);
      const [x, z] = pointAlong(r.pts, rand(30, Math.max(31, len - 30)));
      const d = Math.hypot(x - px, z - pz);
      if (d < 220 || d > 520) continue;
      if (city && Math.hypot(x - city.x, z - city.z) < 220) continue;
      if (st.guarded(x, z, 30)) continue;
      if (st.sitesNear(x - 70, z - 70, x + 70, z + 70, 0).some((s) => s.kind !== SITE_CROSSROAD && Math.hypot(s.x - x, s.z - z) < (s.kind === SITE_CITY ? 200 : 70))) continue;
      const g = this.terrain.sample(x, z);
      if (g.h < SEA + 2 || g.river > 0.05 || g.isle > 0) continue;
      return [Math.round(x), Math.round(z)];
    }
    return null;
  }

  private materialise(e: RareEvent): void {
    const c = this.spawnNear(e.def.kind, e.x + 0.5, e.z + 0.5);
    if (!c) { e.retryT = 2; return; }
    const f = c.fighter!;
    f.rare = e;
    f.hp = e.hp; f.max = e.def.hp;
    c.scale = e.def.scale;
    if (e.def.tint) c.tint.set(e.def.tint);
    e.boss = c;
    e.roarT = 2;
  }

  /** The adventurers walk up the road towards the beast. */
  private spawnParty(e: RareEvent): void {
    const boss = e.boss!;
    const kinds: FighterKind[] = ['warrior', 'archer', 'mage'];
    if (Math.random() < 0.5) kinds.push(Math.random() < 0.5 ? 'warrior' : 'archer');
    // From the side the player comes from, about 40 steps out.
    const a = Math.atan2(this.pz - boss.z, this.px - boss.x) + rand(-0.6, 0.6);
    const sx = boss.x + Math.cos(a) * 38, sz = boss.z + Math.sin(a) * 38;
    for (const k of kinds) {
      const c = this.spawnNear(k, sx + rand(-2, 2), sz + rand(-2, 2));
      if (!c) continue;
      c.fighter!.rare = e;
      e.party.push(c);
    }
    // No room for adventurers just now (night parties fill the slots): each try scans many columns.
    if (!e.party.length) e.retryT = 3;
    e.talkT = 3;
  }

  /** Spawn on open ground at or near (x, z) (not on a tree top or in water). */
  private spawnNear(kind: FighterKind, x: number, z: number): Creature | null {
    for (let k = 0; k < 16; k++) {
      const a = k * 2.4, r = k === 0 ? 0 : 1.5 + k * 0.7;
      const c = this.night.spawn(kind, x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (c) return c;
    }
    return null;
  }

  private victory(e: RareEvent): void {
    e.state = 'won';
    e.t = 70;
    const b = e.boss!;
    for (let n = 0; n < 40; n++) this.host.fire.spark(b.x, b.y + 1, b.z, 1, 0.85, 0.3, 1, 2.5);
    if (Math.hypot(b.x - this.px, b.z - this.pz) < 150) this.host.announce('ZAFER', `${e.def.name} yenildi!`, `[${e.partyName}] grubu işi bitirdi`);
    const live = e.party.filter((c) => !c.gone);
    const calls = [...VICTORY_CALLS].sort(() => Math.random() - 0.5).slice(0, 3);
    setTimeout(() => exchange(live, [...calls, 'loot dağıtıldı, herkes mutlu mu?', pick(['ben değilim', 'evet!', 'yine bana bir şey çıkmadı'])], (c, l) => this.host.partySay(c, e.partyName, l), 2600), 1200);
  }

  private chatter(e: RareEvent, dt: number): void {
    if (!e.party.length) return;
    e.talkT -= dt;
    if (e.talkT > 0) return;
    if (e.state === 'waiting') {
      e.talkT = rand(16, 24);
      const lines = Math.random() < 0.4 ? [`${e.def.name} buralarda bir yerde`, 'loot iyi diyorlar', 'ben tankım, önden gidiyorum', 'acele etme, pot alayım'] : pick(ROAD_BANTER);
      exchange(e.party, lines, (c, l) => this.host.partySay(c, e.partyName, l));
    } else if (e.state === 'fight') {
      e.talkT = rand(4, 7);
      const c = pick(e.party.filter((m) => m.fighter!.down <= 0));
      if (c) this.host.partySay(c, e.partyName, pick(BATTLE_CALLS));
    } else e.talkT = 999;
  }

  // ------------------------------------------------------------ per creature

  step(c: Creature, dt: number): boolean {
    const f = c.fighter!, e = f.rare!;
    f.flash = Math.max(0, f.flash - dt);
    f.cool -= dt;
    return f.hero ? this.stepHero(c, e, dt) : this.stepBoss(c, e, dt);
  }

  private stepBoss(c: Creature, e: RareEvent, dt: number): boolean {
    if (e.boss !== c) return false;
    const f = c.fighter!;
    c.glow = e.def.glow + f.flash * 4;
    c.flapAmp += (0 - c.flapAmp) * Math.min(1, dt * 3);
    c.flap += dt * 10;
    e.roarT -= dt;
    if (e.roarT <= 0) {
      e.roarT = rand(14, 22);
      this.host.sound('growl', c);
      if (Math.hypot(c.x - this.px, c.z - this.pz) < 60) this.host.say(c, pick(e.def.roar), 3);
    }
    // The nearest adventurer still standing.
    let foe: Creature | null = null, bd = 30;
    for (const h of e.party) {
      if (h.gone || h.fighter!.down > 0) continue;
      const d = Math.hypot(h.x - c.x, h.z - c.z);
      if (d < bd) { bd = d; foe = h; }
    }
    if (!foe) {
      // Prowl round its spot.
      const a = performance.now() / 6000 + c.seed;
      if (this.host.walkToward(c, e.x + Math.cos(a) * 5, e.z + Math.sin(a) * 5, 0.8, dt) === 'arrived') this.host.idle(c, dt);
      return true;
    }
    if (e.state === 'waiting') { e.state = 'fight'; e.talkT = 1; this.host.partySay(foe, e.partyName, pick(['pull ettim, hazır olun!', 'aggro bende!', 'kim pull etti?!'])); }
    const k = fighterStats(e.def.kind);
    const reach = 1.4 + c.scale * 0.8;
    // A ground slam now and then: everyone close is thrown back.
    e.slamT -= dt;
    if (e.slamT <= 0 && bd < 6) {
      e.slamT = rand(10, 15);
      c.flap = 0; c.flapAmp = 1.6;
      this.host.sound('boom', c);
      for (let n = 0; n < 24; n++) { const a = (n / 24) * TAU; this.host.fire.spark(c.x + Math.cos(a) * 2, c.y + 0.3, c.z + Math.sin(a) * 2, 0.9, 0.8, 0.6, 1, 3); }
      for (const h of e.party) if (!h.gone && Math.hypot(h.x - c.x, h.z - c.z) < 5.5) this.night.hit(h, e.def.dmg * 0.6, c);
      return true;
    }
    if (bd > reach) {
      if (this.host.walkToward(c, foe.x, foe.z, k.speed * 0.9, dt) === 'blocked') this.face(c, foe, dt);
      return true;
    }
    this.face(c, foe, dt);
    if (f.cool <= 0) {
      f.cool = rand(1.5, 2.1);
      c.flap = 0; c.flapAmp = 1.3;
      this.host.sound('swing', c);
      this.night.hit(foe, e.def.dmg * rand(0.8, 1.2), c);
    }
    return true;
  }

  private stepHero(c: Creature, e: RareEvent, dt: number): boolean {
    if (!e.party.includes(c)) return false;
    const f = c.fighter!;
    c.glow = f.flash * 4;
    // Knocked down: lie there a while, then get up.
    if (f.down > 0) {
      f.down -= dt;
      c.roll += (Math.PI / 2 - c.roll) * Math.min(1, dt * 5);
      c.bob += (-0.25 - c.bob) * Math.min(1, dt * 5);
      this.host.idle(c, dt);
      if (f.down <= 0) { f.hp = f.max * 0.6; if (Math.random() < 0.6) this.host.partySay(c, e.partyName, pick(UP_CALLS)); }
      return true;
    }
    c.roll += (0 - c.roll) * Math.min(1, dt * 5);
    c.bob += (0 - c.bob) * Math.min(1, dt * 5);
    c.flapAmp += (0 - c.flapAmp) * Math.min(1, dt * 3);
    c.flap += dt * 10;
    c.tail += (0 - c.tail) * Math.min(1, dt * 3);
    const boss = e.boss;
    // The beast is gone from here without a fight (the player walked away): so are they.
    if (!boss && e.state !== 'won') return false;
    if (e.state === 'won' || !boss || boss.dying > 0) {
      // Gather where it fell, then head off down the road and away.
      if (e.t > 40) {
        if (this.host.walkToward(c, e.x + Math.cos(c.seed) * 2.5, e.z + Math.sin(c.seed) * 2.5, 1.2, dt) === 'arrived') {
          this.host.idle(c, dt);
          if (Math.random() < dt * 0.5) { c.tail = 1.4; c.flap = 0; c.flapAmp = 0.8; }
        }
        return true;
      }
      const a = Math.atan2(e.z - this.pz, e.x - this.px);
      this.host.walkToward(c, e.x + Math.cos(a) * 80, e.z + Math.sin(a) * 80, 1.4, dt);
      return e.t > 0;
    }
    const kind = f.kind;
    const k = fighterStats(kind);
    const d = Math.hypot(boss.x - c.x, boss.z - c.z);
    if (kind === 'warrior') {
      const reach = 1.6 + boss.scale * 0.6;
      if (d > reach) { this.host.walkToward(c, boss.x, boss.z, k.speed * 1.4, dt); return true; }
      this.face(c, boss, dt);
      if (f.cool <= 0) {
        f.cool = k.cool * rand(0.85, 1.15);
        c.flap = 0; c.flapAmp = 1.3;
        this.host.sound('swing', c);
        this.night.hit(boss, k.dmg * rand(0.8, 1.3), c);
      }
      return true;
    }
    // Archer and mage keep their distance and shoot; the mage heals whoever is hurt.
    const want = kind === 'mage' ? 9 : 12;
    if (d > want + 5) { this.host.walkToward(c, boss.x, boss.z, k.speed * 1.3, dt); return true; }
    if (d < want - 4) {
      const ax = c.x - boss.x, az = c.z - boss.z, l = Math.hypot(ax, az) || 1;
      if (this.host.walkToward(c, c.x + (ax / l) * 4, c.z + (az / l) * 4, k.speed * 1.2, dt) !== 'blocked') return true;
    }
    this.face(c, boss, dt);
    if (f.cool > 0) return true;
    if (kind === 'mage') {
      const hurt = e.party.find((h) => !h.gone && h !== c && h.fighter!.down <= 0 && h.fighter!.hp < h.fighter!.max * 0.55);
      if (hurt) { f.cool = 2.2; c.tail = 1.4; this.night.cast(c, hurt, 'heal', 0); return true; }
    }
    f.cool = k.cool * rand(0.85, 1.2);
    c.tail = 1.4;
    this.night.cast(c, boss, kind === 'mage' ? 'bolt' : 'arrow', k.dmg * rand(0.8, 1.2));
    return true;
  }

  private face(c: Creature, t: Creature, dt: number): void {
    this.host.idle(c, dt);
    c.yaw += angleTo(c.yaw, Math.atan2(t.x - c.x, t.z - c.z)) * Math.min(1, dt * 5);
  }

  // ------------------------------------------------------------ dev

  /** Dev: start a rare-creature event now (optionally right next to the player). */
  devStart(near: boolean | 'duel' = false, hp = 0): string {
    if (near === 'duel') return this.startDuel() ? `duel at ${this.duels[this.duels.length - 1].x},${this.duels[this.duels.length - 1].z}` : 'no duel';
    if (near) {
      const def = pick(DEFS);
      const a = Math.random() * TAU;
      this.events.push({ def, x: Math.round(this.px + Math.cos(a) * 30), z: Math.round(this.pz + Math.sin(a) * 30), t: 600, state: 'waiting', hp: hp || def.hp, boss: null, party: [], partyName: pick(PARTY_NAMES), talkT: 5, slamT: 10, roarT: 3, retryT: 0 });
      this.host.announce('NADİR YARATIK', `${def.name} göründü!`, 'hemen yanında!');
      return `${def.name} near`;
    }
    return this.start() ? `${this.events[this.events.length - 1].def.name} at ${this.events[this.events.length - 1].x},${this.events[this.events.length - 1].z}` : 'no spot';
  }

  info(): string {
    const duels = this.duels.map((d) => `dans@${d.x},${d.z} ${[d.a, d.b].map((c) => `${Math.round(c.x)},${Math.round(c.y)},${Math.round(c.z)}`).join(' / ')}`);
    return [...duels, ...this.events.map((e) => `${e.def.name} ${e.state} @${e.x},${e.z} hp=${e.boss ? Math.round(e.boss.fighter!.hp) : Math.round(e.hp)}/${e.def.hp} parti=${e.party.map((c) => `${c.fighter!.kind}${c.fighter!.down > 0 ? '(yerde)' : ''}`).join(',')} t=${Math.round(e.t)}`)].join(' | ') || 'no rare event';
  }
}
