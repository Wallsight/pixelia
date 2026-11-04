// Castle garrisons. Each held castle near the player fills with soldiers of
// its noble house: sentries at the gate, bowmen watching from the walls,
// patrols on the wall walk, spearmen drilling on the parade ground under the
// captain's shouted orders, archery and dummy practice by day, braziers and
// torches by night. They fight monsters that come close (using the night
// director's combat) and ignore the player, like everyone else.
//
// Some nights a castle is besieged: the horn sounds, the portcullis drops,
// bowmen line the gate wall and spearmen lock shields in the gate passage
// while three waves of monsters march on the gate and pound at it (trolls
// hardest). If the gate breaks the fight moves inside. Dawn ends it either way;
// the soldiers talk about it the next day.

import * as THREE from 'three';
import { BIOME } from '../world/biomes';
import { SITE_CASTLE, type Site } from '../world/structures';
import { castleLayout, castleWorld, castleYaw, type CastleLayout, type Spot } from '../world/castle';
import { gateSide } from '../world/stamp';
import type { Terrain } from '../world/terrain';
import type { Creature } from './creatures';
import { fighterStats, type Fighter, type FighterKind, type NightDirector, type NightSound } from './night';
import type { FireFx } from '../render/fire';
import { createPropMaterial, type EnvUniforms } from '../render/materials';
import { LAYER_PROP_CASTER } from '../render/shadows';

export type Duty = 'gate' | 'watch' | 'patrol' | 'drill' | 'spar' | 'archery' | 'captain' | 'fire' | 'shield' | 'rampart';

export interface Post {
  g: Garrison;
  duty: Duty;
  kind: FighterKind;
  /** Index within its duty. */
  i: number;
  spot: Spot;
  /** Home position and facing in world space (switches to the siege place during a siege). */
  hx: number; hz: number; hyaw: number;
  base: [number, number, number];
  siegeHome: [number, number, number] | null;
  /** Waypoints from the keep door to the post (up the wall stairs), and progress along them. */
  route: Array<[number, number]> | null;
  ri: number;
  /** Wall-walk leg (patrols), world space. */
  leg: [number, number, number, number] | null;
  shift: 'day' | 'night' | 'always' | 'siege';
  c: Creature | null;
  /** Patrol direction, strike counter. */
  dir: number;
  t: number;
  scan: number;
  leaving: boolean;
  /** Drill pose: spear levelled, lunge timer, quarter turn, marching in place. */
  level: boolean; lunge: number; turn: number; march: number;
}

interface Garrison {
  site: Site;
  L: CastleLayout;
  posts: Post[];
  active: boolean;
  night: boolean;
  /** Drill: seconds to the next order, index in the order list, break left. */
  drill: { t: number; step: number; rest: number; inspect: Post | null; said: boolean };
  spawnT: number;
  talkT: number;
  shoutT: number;
  fighting: boolean;
  gate: Gate;
  siege: Siege | null;
  /** This night's siege roll, and when it starts. */
  rolled: boolean;
  siegeAt: number;
  /** How the last siege went (for the next day's talk). */
  last: { broke: boolean; trolls: number } | null;
}

interface Gate {
  mesh: THREE.Group | null;
  /** 0 = raised, 1 = down. */
  drop: number;
  want: number;
  hp: number;
  broken: boolean;
  shake: number;
  solid: boolean;
  boomT: number;
}

interface Siege {
  phase: 'alarm' | 'fight' | 'over';
  t: number;
  wave: number;
  nextWave: number;
  foes: Creature[];
  orderT: number;
  shoutT: number;
  trolls: number;
}

export interface WarHost {
  walkToward(c: Creature, tx: number, tz: number, speed: number, dt: number): 'moving' | 'arrived' | 'blocked';
  idle(c: Creature, dt: number): void;
  say(c: Creature, text: string, sec?: number): void;
  sound(ev: NightSound, c: Creature): void;
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

/** Orders on the parade ground and what the ranks do. */
type Act = 'form' | 'level' | 'lunge' | 'raise' | 'right' | 'front' | 'march' | 'halt';
const ORDERS: Array<[string, Act]> = [
  ['Sıraya geç!', 'form'], ['Mızrak indir!', 'level'], ['Hamle!', 'lunge'], ['Hamle!', 'lunge'], ['Hamle!', 'lunge'],
  ['Mızrak kaldır!', 'raise'], ['Sağa dön!', 'right'], ['Önüne dön!', 'front'], ['Yerinde say!', 'march'], ['Dur!', 'halt'],
  ['Mızrak indir!', 'level'], ['Hamle!', 'lunge'], ['Hamle!', 'lunge'], ['Mızrak kaldır!', 'raise'],
];
const BREAK = ['Mola! Su için.', 'Dinlenin. Sonra yine başlıyoruz.', 'Fena değil. Mola!'];
const BREAK_TALK = ['Kolum koptu...', 'Su! Biri su versin.', 'Bir tur daha mı?', 'Kaptan hiç yorulmaz mı?', 'Mızrağım benden ağır.'];
const INSPECT = ['Dik dur, asker!', 'Mızrağını parlat.', 'Gözünüzü dört açın.', 'Aferin, böyle devam.', 'Bu kalkan neden çizik?'];
const GATE_TALK = [
  ['Bugün de sakin.', 'Sakin günlere şükür.'],
  ['Akşam yemeği ne?', 'Yine mercimek, ne olacak.'],
  ['Ejderhayı gördün mü dün?', 'Sus, adını anma!'],
  ['Kaptan bugün sinirli.', 'Her gün sinirli.'],
  ['Güneyde orklar toplanıyormuş.', 'Hikâye bunlar. Hikâye.'],
];
const DAY_GATE_TALK = [['Nöbet ne zaman biter?', 'Gün batınca. Sonra gece nöbeti.'], ['Okçular bugün iyi atıyor.', 'Kaptan duymasın, şımarırlar.']];
const FIRE_TALK = [
  ['Ateş iyi geldi.', 'Ellerim dondu.'],
  ['Gece uzun.', 'Uyuma sakın, kaptan görürse yandık.'],
  ['Duvarların ötesinde bir şey kıpırdadı mı?', 'Rüzgârdır.'],
  ['Annem bana asker olma demişti.', 'Benimki de.'],
];
const WATCH_TALK = ['Ufuk temiz.', 'Kimse yok.', 'Uzakta kuşlar...', 'Yol boş.'];
const NIGHT_ROUND = ['Gözünüzü dört açın!', 'Uyumak yok!', 'Meşaleler yansın.', 'Her şey yolunda mı?'];
const BATTLE = ['Düşman! Silah başına!', 'Kapıyı tutun!', 'Mızraklar ileri!', 'Oklar, ateş!'];
const VICTORY = ['Defolup gittiler.', 'Yerlerinize!', 'Kimse yaralı mı?'];
const SIEGE_SHOUT = ['Tutun!', 'Kalkanlar kenetlensin!', 'Okçular, kapının önü!', 'Geri adım yok!', 'Bir dalga daha geliyor!'];
const CHEER = ['Zafer!', 'Hurraa!', 'Kaçın bakalım!', 'Bir gece daha bizim!'];
const WAVE_SIGHT = ['Yolda meşale yok... gözler var!', 'Geliyorlar!', 'Bir sürü daha!'];
const AFTER_SIEGE = [
  ['Dün gece kapıya dayandılar.', 'Okçular hepsini indirdi ama.'],
  ['Hâlâ boru sesi kulağımda.', 'Benim de. Uyuyamadım.'],
];
const AFTER_TROLL = ['Kapının önündeki taş troll...', 'Güneş doğunca taş kesildi. Hâlâ orada duruyor.'];
const AFTER_BREACH = ['Kapıyı kırdılar, gördün mü?', 'Sabaha kadar yeniden kurduk. Ellerim hâlâ titriyor.'];
const GATE_HP = 110;

const TROUSERS = ['#3a3a4a', '#4a3a2e', '#2e3440', '#4a4a4a'];
const HAIR = ['#2a1e16', '#4a3020', '#7a5030', '#1a1a1a', '#9a9a9a'];

export class WarDirector {
  private garrisons = new Map<string, Garrison>();
  private scanT = 0;
  private time = 0;
  private px = 0; private pz = 0; private nightV = 0;
  readonly group = new THREE.Group();
  private wood: THREE.Material | null = null;
  private iron: THREE.Material | null = null;

  constructor(private terrain: Terrain, private host: WarHost, private night: NightDirector, env?: EnvUniforms, shadows = false) {
    if (env) {
      this.wood = createPropMaterial(env, { color: '#5a3e26', shadows });
      this.iron = createPropMaterial(env, { color: '#4a4e56', shadows });
    }
  }

  /** A lowered, unbroken portcullis blocks its cells (for the player and walkers). */
  solid(x: number, y: number, z: number): boolean {
    for (const g of this.garrisons.values()) {
      if (!g.gate.solid) continue;
      const L = g.L, dx = x - L.cx, dz = z - L.cz;
      if (L.gx * dx + L.gz * dz !== L.half) continue;
      const v = L.px * dx + L.pz * dz;
      if (v >= -1 && v <= 1 && y > L.floorY && y <= L.floorY + 4) return true;
    }
    return false;
  }

  update(dt: number, px: number, pz: number, night: number): void {
    this.time += dt;
    this.px = px; this.pz = pz; this.nightV = night;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 1; this.refresh(); }
    for (const g of this.garrisons.values()) if (g.active) this.run(g, dt);
  }

  private refresh(): void {
    const { px, pz } = this;
    for (const s of this.terrain.structures.sitesNear(px - 260, pz - 260, px + 260, pz + 260, 0)) {
      if (s.kind === SITE_CASTLE && s.held && !this.garrisons.has(s.id)) this.garrisons.set(s.id, this.make(s));
    }
    for (const [id, g] of this.garrisons) {
      const d = Math.hypot(g.site.x - px, g.site.z - pz);
      g.active = g.active ? d < 190 : d < 150;
      if (!g.active && g.siege) this.endSiege(g);
      if (g.gate.mesh) g.gate.mesh.visible = g.active || d < 260;
      if (d > 400) {
        if (g.gate.mesh) this.group.remove(g.gate.mesh);
        this.garrisons.delete(id);
      }
    }
  }

  private make(site: Site): Garrison {
    const L = castleLayout(site, this.terrain.seed, gateSide(this.terrain, site));
    const g: Garrison = {
      site, L, posts: [], active: false, night: this.nightV > 0.5,
      drill: { t: 4, step: 0, rest: 0, inspect: null, said: false }, spawnT: 0, talkT: rand(8, 16), shoutT: 0, fighting: false,
      gate: { mesh: null, drop: 0, want: 0, hp: GATE_HP, broken: false, shake: 0, solid: false, boomT: 0 },
      siege: null, rolled: false, siegeAt: -1, last: null,
    };
    const add = (duty: Duty, kind: FighterKind, i: number, spot: Spot, shift: Post['shift'], leg: Post['leg'] = null) => {
      const [hx, hz] = castleWorld(L, spot.u, spot.v);
      const hyaw = castleYaw(L, spot.fu, spot.fv);
      const p: Post = {
        g, duty, kind, i, spot, hx, hz, hyaw, base: [hx, hz, hyaw], siegeHome: null, route: null, ri: 0, leg, shift, c: null,
        dir: 1, t: rand(1, 4), scan: rand(0, 0.5), leaving: false, level: false, lunge: 0, turn: 0, march: 0,
      };
      g.posts.push(p);
      return p;
    };
    const at = (u: number, v: number, fu = 1, fv = 0): [number, number, number] => [...castleWorld(L, u, v), castleYaw(L, fu, fv)];
    const half = L.half;
    // In a siege the gate sentries fall back behind the shield wall.
    L.gatePosts.forEach((s, i) => { add('gate', 'soldier', i, s, 'always').siegeHome = at(half - 3, i ? 1 : -1); });
    L.watch.forEach((s, i) => add('watch', 'bowman', i, s, 'always'));
    L.patrols.forEach(([u0, v0, u1, v1], i) => {
      const [ax, az] = castleWorld(L, u0, v0), [bx, bz] = castleWorld(L, u1, v1);
      // Facing out over the wall from the middle of the leg.
      const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
      const out = Math.abs(mu) > Math.abs(mv) ? [Math.sign(mu), 0] : [0, Math.sign(mv)];
      add('patrol', 'soldier', i, { u: u0, v: v0, y: L.wallH + 1, fu: out[0], fv: out[1] }, 'always', [ax, az, bx, bz]);
    });
    add('captain', 'captain', 0, L.captain, 'always').siegeHome = at(half - 6, 0);
    L.drill.forEach((s, i) => add('drill', 'soldier', i, s, 'day'));
    L.strikers.slice(0, 3).forEach((s, i) => add('spar', 'soldier', i, s, 'day'));
    L.shooters.forEach((s, i) => add('archery', 'bowman', i, s, 'day'));
    // Night: two soldiers warm themselves at the braziers by the gate.
    const inner = L.inner;
    add('fire', 'soldier', 0, { u: inner - 2.4, v: 3, y: 1, fu: 1, fv: 0 }, 'night').siegeHome = at(half - 3, 0);
    add('fire', 'soldier', 1, { u: inner - 2.4, v: -3, y: 1, fu: 1, fv: 0 }, 'night').siegeHome = at(half - 4.5, 0);
    // Siege: a shield wall in the gate passage, bowmen up the stairs onto the gate wall.
    for (const v of [-1, 0, 1]) add('shield', 'soldier', v + 1, { u: half - 2, v, y: 1, fu: 1, fv: 0 }, 'siege');
    const [foot, head] = L.stairs;
    [8, -8, half - 5, -(half - 5)].forEach((v, i) => {
      const s = Math.sign(v);
      const p = add('rampart', 'bowman', i, { u: half - 1, v, y: L.wallH + 1, fu: 1, fv: 0 }, 'siege');
      p.route = [castleWorld(L, foot.u, s * foot.v), castleWorld(L, foot.u, s * head.v), castleWorld(L, head.u, s * head.v)];
    });
    return g;
  }

  // ------------------------------------------------------------ garrison

  private onShift(g: Garrison, p: Post): boolean {
    if (p.shift === 'siege') return !!g.siege && g.siege.phase !== 'over';
    return p.shift === 'always' || (p.shift === 'night') === g.night;
  }

  private run(g: Garrison, dt: number): void {
    // Day and night shifts, with some slack around dusk and dawn.
    if (!g.night && this.nightV > 0.55) g.night = true;
    else if (g.night && this.nightV < 0.35) g.night = false;
    const dPlayer = Math.hypot(g.site.x - this.px, g.site.z - this.pz);

    // Fill empty posts one at a time; send the off-shift ones inside.
    g.spawnT -= dt;
    for (const p of g.posts) {
      if (p.c && (p.c.gone || p.c.dying > 0)) p.c = null;
      if (p.c && !this.onShift(g, p) && !p.leaving) { p.leaving = true; p.t = 30; }
      if (!p.c && this.onShift(g, p) && g.spawnT <= 0) {
        g.spawnT = 0.25;
        this.spawn(g, p, dPlayer);
      }
    }

    // Braziers burn after dark.
    if (g.night && dPlayer < 130) {
      for (const b of g.L.braziers) {
        const [x, z] = castleWorld(g.L, b.u, b.v);
        this.host.fire.burn(x, g.L.floorY + b.y, z, dt, 0.75);
      }
    }

    // When the last monster falls, someone says so (a siege has its own ending).
    const fighting = g.posts.some((p) => p.c && p.c.fighter!.foe);
    if (g.fighting && !fighting && !g.siege) {
      const who = g.posts.find((p) => p.duty === 'captain' && p.c)?.c ?? g.posts.find((p) => p.c)?.c;
      if (who) this.say(who, pick(VICTORY), 2.4, 50);
    }
    g.fighting = fighting;

    this.runSiege(g, dt);
    this.runGate(g, dt);
    this.runDrill(g, dt);
    this.chatter(g, dt);
    g.shoutT -= dt;
  }

  // ------------------------------------------------------------ siege

  private runSiege(g: Garrison, dt: number): void {
    // Dawn: whatever is left burns or turns to stone; the gate is mended and raised.
    if (!g.night) {
      if (g.siege) this.endSiege(g);
      g.rolled = false; g.siegeAt = -1;
      if (g.gate.broken || g.gate.hp < GATE_HP) { g.gate.broken = false; g.gate.hp = GATE_HP; }
      g.gate.want = 0;
      return;
    }
    // Once a night, maybe.
    if (!g.rolled && this.nightV > 0.7) {
      g.rolled = true;
      g.siegeAt = Math.random() < 0.5 ? this.time + rand(15, 90) : -1;
    }
    if (!g.siege && g.siegeAt > 0 && this.time >= g.siegeAt) { g.siegeAt = -1; this.startSiege(g); }
    const s = g.siege;
    if (!s) return;
    s.t -= dt;
    s.foes = s.foes.filter((c) => !c.gone && c.dying === 0 && !c.fighter!.stone);
    if (s.phase === 'alarm') {
      if (s.t < 3) g.gate.want = 1;
      if (s.t <= 0) { s.phase = 'fight'; s.nextWave = this.time; }
      return;
    }
    if (s.phase === 'over') {
      if (s.t <= 0) {
        if (!g.gate.broken) { g.gate.want = 0; const cap = this.captainOf(g); if (cap) this.say(cap, 'Kapıyı açın!', 2.2, 60); }
        g.siege = null;
      }
      return;
    }
    // Waves: the next one comes on a timer, sooner when the last is nearly gone.
    if (s.wave < 3 && s.foes.length <= 1) s.nextWave = Math.min(s.nextWave, this.time + 8);
    if (s.wave < 3 && this.time >= s.nextWave) {
      this.spawnWave(g, s.wave++);
      s.nextWave = this.time + 50;
    }
    if (s.wave >= 3 && s.foes.length === 0) {
      s.phase = 'over'; s.t = 25;
      g.last = { broke: g.gate.broken, trolls: s.trolls };
      const who = g.posts.filter((p) => p.c && !p.leaving).map((p) => p.c!);
      const cap = this.captainOf(g);
      if (cap) this.say(cap, `Zafer! ${g.L.house!.name} için!`, 3, 80);
      for (let i = 0; i < Math.min(4, who.length); i++) {
        const c = pick(who);
        setTimeout(() => { if (!c.gone) this.say(c, pick(CHEER), 2.2, 60); }, 900 + i * 700);
      }
      this.siegeHomes(g, false);
      return;
    }
    // Orders for the besiegers, and the captain's shouts.
    s.orderT -= dt;
    if (s.orderT <= 0) { s.orderT = 0.5; this.order(g, s); }
    s.shoutT -= dt;
    if (s.shoutT <= 0) {
      s.shoutT = rand(7, 12);
      const cap = this.captainOf(g);
      if (cap && s.foes.length) this.say(cap, pick(SIEGE_SHOUT), 2, 60);
    }
  }

  private captainOf(g: Garrison): Creature | null {
    const c = g.posts.find((p) => p.duty === 'captain')?.c;
    return c && !c.gone ? c : null;
  }

  private startSiege(g: Garrison): void {
    g.siege = { phase: 'alarm', t: 6, wave: 0, nextWave: 0, foes: [], orderT: 0, shoutT: 4, trolls: 0 };
    this.siegeHomes(g, true);
    // The horn from the gate tower, then the captain.
    const hornist = g.posts.find((p) => p.duty === 'watch' && p.c)?.c ?? this.captainOf(g);
    if (hornist) this.host.sound('horn', hornist);
    const cap = this.captainOf(g);
    if (cap) setTimeout(() => { if (!cap.gone) this.say(cap, 'Kuşatma! Herkes yerine! Kapıyı indirin!', 3, 90); }, 1800);
  }

  private endSiege(g: Garrison): void {
    if (g.siege) for (const c of g.siege.foes) if (c.fighter) c.fighter.siege = null;
    g.siege = null;
    this.siegeHomes(g, false);
  }

  /** Swap posts between their usual place and their siege place. */
  private siegeHomes(g: Garrison, siege: boolean): void {
    for (const p of g.posts) {
      if (!p.siegeHome) continue;
      [p.hx, p.hz, p.hyaw] = siege ? p.siegeHome : p.base;
    }
  }

  private spawnWave(g: Garrison, wave: number): void {
    const s = g.siege!, L = g.L;
    const b = this.terrain.sample(L.cx, L.cz).biome;
    const woods = b === BIOME.FOREST || b === BIOME.TAIGA || b === BIOME.BIRCH_FOREST;
    const hot = b === BIOME.ASHLANDS || b === BIOME.BADLANDS;
    const kinds: FighterKind[] = wave === 0 ? ['zombie', 'zombie', 'skeleton', 'skeleton', 'zombie']
      : wave === 1 ? ['skeleton', 'zombie', woods ? 'spider' : 'skeleton', woods ? 'spider' : 'zombie', hot ? 'demon' : 'skeleton', 'zombie']
      : ['troll', Math.random() < 0.5 ? 'troll' : 'skeleton', 'skeleton', 'zombie', hot ? 'demon' : 'skeleton'];
    // They come up the road the gate faces, out of the dark.
    const v0 = rand(-6, 6);
    for (const kind of kinds) {
      let c: Creature | null = null;
      for (const dist of [42, 32, 24]) {
        const [x, z] = castleWorld(L, L.half + dist + rand(-3, 3), v0 + rand(-3, 3));
        c = this.night.spawn(kind, x, z);
        if (c) break;
      }
      if (!c) continue;
      if (kind === 'troll') { this.night.toughen(c, 110); s.trolls++; }
      c.fighter!.siege = { x: c.x, z: c.z, fx: c.x, fz: c.z, pound: null };
      s.foes.push(c);
    }
    const watcher = g.posts.find((p) => p.duty === 'watch' && p.i === 0)?.c;
    if (watcher) this.say(watcher, wave === 2 && s.trolls ? 'Troll! Trol geliyor!' : pick(WAVE_SIGHT), 2.4, 80);
  }

  /** Three may pound the closed gate at once; the rest wait their turn. Through a broken gate, on to the keep. */
  private order(g: Garrison, s: Siege): void {
    const L = g.L, gate = g.gate;
    const closed = gate.drop > 0.9 && !gate.broken;
    const [gx, gz] = castleWorld(L, L.half, 0);
    const [kx, kz] = castleWorld(L, L.keepDoor.u, L.keepDoor.v);
    const slots = [-1, 0, 1].map((v) => castleWorld(L, L.half + 1, v));
    const taken = new Set<number>();
    // Trolls first at the gate, then whoever is closest.
    const order = [...s.foes].sort((a, b) => (b.fighter!.kind === 'troll' ? 1 : 0) - (a.fighter!.kind === 'troll' ? 1 : 0)
      || Math.hypot(a.x - gx, a.z - gz) - Math.hypot(b.x - gx, b.z - gz));
    for (const c of order) {
      const f = c.fighter!;
      if (!f.siege) continue;
      if (!closed) { f.siege.x = kx; f.siege.z = kz; f.siege.fx = kx; f.siege.fz = kz; f.siege.pound = null; continue; }
      let slot = -1, bd = 1e9;
      slots.forEach(([x, z], i) => { const d = Math.hypot(x - c.x, z - c.z); if (!taken.has(i) && d < bd) { bd = d; slot = i; } });
      if (slot >= 0 && Math.hypot(c.x - gx, c.z - gz) < 30) {
        taken.add(slot);
        const [x, z] = slots[slot];
        f.siege.x = x; f.siege.z = z; f.siege.fx = gx; f.siege.fz = gz;
        f.siege.pound = (who, dmg) => this.poundGate(g, who, dmg);
      } else {
        // Mill about in front of the gate.
        const a = (c.seed * 7.3) % TAU;
        const [x, z] = castleWorld(L, L.half + 5 + Math.abs(Math.sin(a)) * 3, Math.cos(a) * 4);
        f.siege.x = x; f.siege.z = z; f.siege.fx = gx; f.siege.fz = gz; f.siege.pound = null;
      }
    }
  }

  private poundGate(g: Garrison, c: Creature, dmg: number): void {
    const gate = g.gate, L = g.L;
    if (gate.broken) return;
    const troll = c.fighter!.kind === 'troll';
    gate.hp -= troll ? dmg * 2.5 : dmg;
    gate.shake = troll ? 0.5 : 0.25;
    const [x, z] = castleWorld(L, L.half, 0);
    if (this.time - gate.boomT > 0.3 && Math.hypot(x - this.px, z - this.pz) < 170) {
      gate.boomT = this.time;
      this.host.sound('boom', c);
      for (let n = 0; n < (troll ? 10 : 4); n++) this.host.fire.spark(c.x + (x - c.x) * 0.6, L.floorY + rand(1.5, 3), c.z + (z - c.z) * 0.6, 0.55, 0.38, 0.2, 1, 2.2);
    }
    if (gate.hp > 0) return;
    gate.broken = true;
    gate.solid = false;
    this.host.fire.puff(x, L.floorY + 2, z, 24);
    this.host.sound('boom', c);
    const cap = this.captainOf(g);
    if (cap) this.say(cap, 'Kapı düştü! Kalkanlar! Kimse geri çekilmesin!', 3, 90);
    if (g.siege) this.order(g, g.siege);
  }

  /** The portcullis: drops and rises, shakes when struck, falls when broken. */
  private runGate(g: Garrison, dt: number): void {
    const gate = g.gate, L = g.L;
    if (!gate.mesh && this.wood) {
      gate.mesh = this.buildGate();
      this.group.add(gate.mesh);
    }
    gate.drop += Math.sign(gate.want - gate.drop) * Math.min(Math.abs(gate.want - gate.drop), dt / 3);
    gate.shake = Math.max(0, gate.shake - dt * 1.5);
    // Solid only once fully down and nobody (player or soldier) stands under it.
    if (gate.drop > 0.95 && !gate.broken) {
      if (!gate.solid) {
        const under = (x: number, z: number) => {
          const dx = Math.floor(x) - L.cx, dz = Math.floor(z) - L.cz;
          return L.gx * dx + L.gz * dz === L.half && Math.abs(L.px * dx + L.pz * dz) <= 1;
        };
        gate.solid = !under(this.px, this.pz) && !g.posts.some((p) => p.c && under(p.c.x, p.c.z));
      }
    } else gate.solid = false;
    const m = gate.mesh;
    if (!m) return;
    const [x, z] = castleWorld(L, L.half, 0);
    const out = 0.32;
    m.rotation.set(0, castleYaw(L, 1, 0), 0);
    if (gate.broken) {
      // Torn down and lying in the mud outside.
      m.position.set(x + L.gx * (out + 0.3), L.floorY + 1.15, z + L.gz * (out + 0.3));
      m.rotation.x = 1.45;
      return;
    }
    const j = gate.shake * 0.12;
    const wear = 1 - gate.hp / GATE_HP;
    m.position.set(x + L.gx * out + rand(-j, j), L.floorY + 1 + (1 - gate.drop) * 4.3, z + L.gz * out + rand(-j, j));
    m.rotation.z = wear * 0.05;
    m.rotation.x = -wear * 0.06;
  }

  private buildGate(): THREE.Group {
    const grp = new THREE.Group();
    const box = (w: number, h: number, d: number, x: number, y: number, mat: THREE.Material) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(x, y, 0);
      b.layers.enable(LAYER_PROP_CASTER);
      grp.add(b);
    };
    for (const x of [-1.25, -0.62, 0, 0.62, 1.25]) {
      box(0.17, 4.0, 0.17, x, 2.0, this.wood!);
      box(0.09, 0.28, 0.09, x, -0.1, this.iron!); // spikes at the foot
    }
    for (const y of [0.55, 1.55, 2.55, 3.55]) box(3.0, 0.12, 0.22, 0, y, this.iron!);
    return grp;
  }


  private spawn(g: Garrison, p: Post, dPlayer: number): void {
    const L = g.L;
    // Wall posts and a far-away player: appear in place. Otherwise step out of the keep.
    const inPlace = p.duty === 'watch' || p.duty === 'patrol' || dPlayer > 70;
    p.ri = inPlace ? p.route?.length ?? 0 : 0;
    const [dx, dz] = castleWorld(L, L.keepDoor.u, L.keepDoor.v);
    const c = this.night.spawn(p.kind, inPlace ? p.hx : dx, inPlace ? p.hz : dz);
    if (!c) return;
    const f = c.fighter!;
    f.garrison = p;
    c.yaw = p.hyaw;
    c.tint.set(L.house!.color);
    c.tint2.set(TROUSERS[Math.floor(Math.random() * TROUSERS.length)]);
    c.tint3.set(HAIR[Math.floor(Math.random() * HAIR.length)]);
    c.skin = Math.random() * 0.85;
    p.c = c; p.leaving = false; p.level = false; p.lunge = 0; p.turn = 0; p.march = 0; p.dir = 1;
  }

  /** The captain calls the drill; the ranks follow each order a moment later. */
  private runDrill(g: Garrison, dt: number): void {
    const d = g.drill;
    const cap = g.posts.find((p) => p.duty === 'captain')?.c;
    const ranks = g.posts.filter((p) => p.duty === 'drill' && p.c && !p.leaving && this.atHome(p));
    const ready = !g.night && cap && cap.fighter!.foe === null && cap.fighter!.down <= 0 && ranks.length >= 3;
    if (!ready) { d.t = 3; if (g.night) { d.step = 0; d.rest = 0; } return; }
    if (d.rest > 0) {
      d.rest -= dt;
      if (d.rest <= 0) { d.step = 0; d.t = 2; }
      return;
    }
    if (!this.atHome(g.posts.find((p) => p.duty === 'captain')!)) return;
    d.t -= dt;
    if (d.t > 0) return;
    if (d.step >= ORDERS.length) {
      // A break: water, a few words, the captain looks round the yard.
      d.rest = rand(16, 24);
      d.inspect = pick(g.posts.filter((p) => p.c && !p.leaving && (p.duty === 'gate' || p.duty === 'archery' || p.duty === 'spar'))) ?? null;
      d.said = false;
      this.say(cap, pick(BREAK), 2.4);
      for (const p of ranks) { p.level = false; p.turn = 0; p.march = 0; }
      const talker = pick(ranks).c!;
      setTimeout(() => { if (!talker.gone) this.say(talker, pick(BREAK_TALK), 2.6); }, 2600);
      return;
    }
    const [text, act] = ORDERS[d.step++];
    d.t = act === 'march' ? 4.5 : rand(2.6, 3.4);
    this.say(cap, text, 1.6, 45);
    cap.flap = 0; cap.flapAmp = 0.8; // a sweep of the sword arm
    setTimeout(() => {
      for (const p of ranks) {
        if (act === 'level') p.level = true;
        else if (act === 'raise' || act === 'form') { p.level = false; p.turn = 0; }
        else if (act === 'lunge' && p.level) p.lunge = 0.55 + Math.random() * 0.08;
        else if (act === 'right') p.turn = -Math.PI / 2;
        else if (act === 'front') p.turn = 0;
        else if (act === 'march') p.march = 3.2;
        else if (act === 'halt') p.march = 0;
      }
      if (act === 'lunge' && ranks[0]?.c) this.host.sound('swing', ranks[0].c);
    }, 450);
  }

  private chatter(g: Garrison, dt: number): void {
    g.talkT -= dt;
    if (g.talkT > 0 || g.siege) return;
    g.talkT = rand(22, 40);
    const near = (p: Post) => p.c && !p.leaving && this.near(p.c, 34);
    const pairTalk = (a: Creature, b: Creature, lines: string[]) => lines.forEach((l, i) => setTimeout(() => {
      const who = i % 2 ? b : a;
      if (!who.gone && who.fighter!.foe === null) this.say(who, l, 2.8);
    }, i * 3000));
    const gate = g.posts.filter((p) => p.duty === 'gate' && near(p));
    const fire = g.posts.filter((p) => p.duty === 'fire' && near(p));
    const watch = g.posts.filter((p) => p.duty === 'watch' && near(p));
    if (fire.length === 2 && Math.random() < 0.6) pairTalk(fire[0].c!, fire[1].c!, pick(FIRE_TALK));
    else if (gate.length === 2 && g.last && !g.night && Math.random() < 0.6) {
      pairTalk(gate[0].c!, gate[1].c!, g.last.broke ? AFTER_BREACH : g.last.trolls ? pick([AFTER_TROLL, ...AFTER_SIEGE]) : pick(AFTER_SIEGE));
    } else if (gate.length === 2) pairTalk(gate[0].c!, gate[1].c!, pick(g.night ? GATE_TALK : [...GATE_TALK, ...DAY_GATE_TALK]));
    else if (watch.length) this.say(watch[0].c!, pick(WATCH_TALK), 2.4);
  }

  // ------------------------------------------------------------ per soldier

  /** Returns false when the soldier should be removed. */
  step(c: Creature, dt: number): boolean {
    const f = c.fighter!, p = f.garrison!;
    if (p.c !== c || !p.g.active) return false;
    f.flash = Math.max(0, f.flash - dt);
    f.cool -= dt;
    f.t -= dt;
    c.glow = f.flash * 4;
    // Knocked down: lie there, then get up.
    if (f.down > 0) {
      f.down -= dt;
      c.roll += (Math.PI / 2 - c.roll) * Math.min(1, dt * 5);
      c.bob += (-0.25 - c.bob) * Math.min(1, dt * 5);
      this.host.idle(c, dt);
      c.walkAmp = 0;
      if (f.down <= 0) { f.hp = f.max * 0.6; this.say(c, pick(['Hâlâ ayaktayım!', 'Daha bitmedi!']), 2); }
      return true;
    }
    c.roll += (0 - c.roll) * Math.min(1, dt * 5);
    c.bob += (0 - c.bob) * Math.min(1, dt * 5);
    c.flapAmp += (0 - c.flapAmp) * Math.min(1, dt * 3);
    c.flap += dt * 10;

    if (this.fight(c, f, p, dt)) return true;
    const braced = p.duty === 'shield' || (!!p.g.siege && (p.duty === 'gate' || p.duty === 'fire'));
    c.tail += ((p.duty === 'drill' && p.level ? 1.45 : braced ? 0.75 : p.duty === 'fire' ? 0.55 : 0) - c.tail) * Math.min(1, dt * 6);

    if (p.leaving) {
      p.t -= dt;
      const L = p.g.L;
      // Back down the stairs first.
      if (p.route && p.ri > 0) {
        const [x, z] = p.route[p.ri - 1];
        if (this.host.walkToward(c, x, z, 1.4, dt) === 'arrived') p.ri--;
        return p.t > 0;
      }
      const [x, z] = castleWorld(L, L.keepDoor.u, L.keepDoor.v);
      return this.host.walkToward(c, x, z, 1.4, dt) !== 'arrived' && p.t > 0;
    }

    switch (p.duty) {
      case 'patrol': return this.patrol(c, p, dt);
      case 'captain': return this.captain(c, p, dt);
      default: break;
    }
    if (!this.goHome(c, p, dt, 1.5)) return true;
    switch (p.duty) {
      case 'gate': {
        // Looks out along the road; now and then glances aside. A torch at night.
        p.t -= dt;
        if (p.t < -2.5) p.t = rand(6, 14);
        this.face(c, p.hyaw + (p.t < 0 ? (p.i ? 0.7 : -0.7) : 0), dt);
        if (p.g.night) this.torch(c, dt);
        break;
      }
      case 'watch':
        this.face(c, p.hyaw + Math.sin(this.time * 0.25 + c.seed) * 0.7, dt);
        c.head = Math.sin(this.time * 0.4 + c.seed) * 0.08 - 0.08;
        if (p.g.night) this.torch(c, dt);
        break;
      case 'fire':
        this.face(c, p.hyaw, dt);
        c.head = p.g.siege ? 0 : 0.2;
        break;
      case 'shield':
        this.face(c, p.hyaw, dt);
        break;
      case 'rampart':
        this.face(c, p.hyaw + Math.sin(this.time * 0.3 + c.seed) * 0.3, dt);
        this.torch(c, dt);
        break;
      case 'drill': this.drill(c, p, dt); break;
      case 'spar': this.spar(c, p, dt); break;
      case 'archery': this.archery(c, p, dt); break;
      default: break;
    }
    return true;
  }

  /** Monsters near the post: spearmen close in, bowmen shoot, patrols hold the wall. */
  private fight(c: Creature, f: Fighter, p: Post, dt: number): boolean {
    p.scan -= dt;
    if (p.scan <= 0) {
      p.scan = 0.5;
      const wall = p.duty === 'patrol' || p.duty === 'watch';
      const bow = p.kind === 'bowman';
      const r = bow ? 24 : wall ? 16 : 14;
      const foe = f.foe && !f.foe.gone && f.foe.dying === 0 ? f.foe : this.night.nearestMonster(c.x, c.z, r);
      // Stay near the post (the castle is the point, not the chase).
      f.foe = foe && Math.hypot(foe.x - p.hx, foe.z - p.hz) < (bow ? 28 : 22) ? foe : null;
      if (f.foe && p.g.shoutT <= 0) { p.g.shoutT = 25; this.say(c, pick(BATTLE), 2.2, 60); }
    }
    const foe = f.foe;
    if (!foe || foe.gone || foe.dying > 0) { f.foe = null; return false; }
    const k = fighterStats(p.kind);
    const d = Math.hypot(foe.x - c.x, foe.z - c.z);
    c.tail += ((p.kind === 'soldier' ? 1.3 : 0) - c.tail) * Math.min(1, dt * 6); // spear levelled
    if (p.kind === 'bowman') {
      this.face(c, Math.atan2(foe.x - c.x, foe.z - c.z), dt);
      if (f.cool <= 0 && d <= k.reach) {
        f.cool = k.cool * rand(0.85, 1.2);
        c.tail = 1.4;
        this.night.cast(c, foe, 'arrow', k.dmg * rand(0.8, 1.2));
      }
      return true;
    }
    // In a siege the gate passage is held: spears reach through the bars, nobody chases.
    const g = p.g, hold = !!g.siege && (p.duty === 'shield' || p.duty === 'gate' || p.duty === 'fire' || p.duty === 'captain');
    const reach = hold && g.gate.drop > 0.9 && !g.gate.broken ? 3.4 : k.reach;
    if (d > reach) {
      const chase = !hold || (g.gate.broken && Math.hypot(foe.x - p.hx, foe.z - p.hz) < 7);
      // Patrols cannot leave the wall walk: they shout and watch.
      if (p.duty === 'patrol' || !chase || this.host.walkToward(c, foe.x, foe.z, 2.4, dt) === 'blocked') {
        if (hold && !chase) this.goHome(c, p, dt, 1.6);
        this.face(c, Math.atan2(foe.x - c.x, foe.z - c.z), dt);
      }
      return true;
    }
    this.face(c, Math.atan2(foe.x - c.x, foe.z - c.z), dt);
    if (f.cool <= 0) {
      f.cool = k.cool * rand(0.85, 1.15);
      c.flap = 0; c.flapAmp = 1.3;
      this.host.sound('swing', c);
      this.night.hit(foe, k.dmg * rand(0.8, 1.3), c);
    }
    return true;
  }

  private patrol(c: Creature, p: Post, dt: number): boolean {
    const [ax, az, bx, bz] = p.leg!;
    if (p.t > 0) {
      // Pause at the end of the leg, looking out over the battlements.
      p.t -= dt;
      this.face(c, p.hyaw + Math.sin(this.time * 0.5 + c.seed) * 0.4, dt);
      if (p.g.night) this.torch(c, dt);
      return true;
    }
    const tx = p.dir > 0 ? bx : ax, tz = p.dir > 0 ? bz : az;
    const r = this.host.walkToward(c, tx, tz, 1.05, dt);
    if (r === 'arrived' || (r === 'blocked' && Math.random() < dt)) { p.dir = -p.dir; p.t = rand(3, 7); }
    if (p.g.night) this.torch(c, dt);
    return true;
  }

  private captain(c: Creature, p: Post, dt: number): boolean {
    const g = p.g, d = g.drill;
    // In a siege: behind the shield wall, facing the gate.
    if (g.siege && g.siege.phase !== 'over') {
      if (this.goHome(c, p, dt, 2)) this.face(c, p.hyaw, dt);
      this.torch(c, dt);
      return true;
    }
    // By night: rounds between the braziers, the gate and the keep.
    if (g.night) {
      const stops = g.posts.filter((q) => (q.duty === 'fire' || q.duty === 'gate') && q.c);
      if (p.t <= 0 || !p.leg) {
        const q = pick(stops);
        if (!q) return this.goHome(c, p, dt, 1.3) || true;
        p.leg = [q.hx + Math.sin(q.hyaw) * -1.6, q.hz + Math.cos(q.hyaw) * -1.6, q.hx, q.hz];
        p.t = 40; p.dir = 0;
      }
      p.t -= dt;
      const [tx, tz, lx, lz] = p.leg;
      if (this.host.walkToward(c, tx, tz, 1.2, dt) === 'arrived') {
        this.face(c, Math.atan2(lx - c.x, lz - c.z), dt);
        if (p.dir === 0) { p.dir = 1; p.t = rand(8, 14); this.say(c, pick(NIGHT_ROUND), 2.4); }
      }
      this.torch(c, dt);
      return true;
    }
    p.leg = null;
    // During a drill break: walk over to inspect someone, then back.
    if (d.rest > 4 && d.inspect?.c && !d.inspect.c.gone) {
      const q = d.inspect.c;
      const tx = q.x + Math.sin(q.yaw) * 1.8, tz = q.z + Math.cos(q.yaw) * 1.8;
      if (this.host.walkToward(c, tx, tz, 1.4, dt) === 'arrived') {
        this.face(c, Math.atan2(q.x - c.x, q.z - c.z), dt);
        if (!d.said) { d.said = true; this.say(c, pick([...INSPECT, `${g.L.house!.name} için!`]), 2.6); }
      }
      return true;
    }
    if (this.goHome(c, p, dt, 1.4)) {
      // Pacing a little in front of the ranks while they work.
      this.face(c, p.hyaw + Math.sin(this.time * 0.6 + c.seed) * 0.25, dt);
    }
    return true;
  }

  private drill(c: Creature, p: Post, dt: number): void {
    const fx = Math.sin(p.hyaw), fz = Math.cos(p.hyaw);
    if (p.lunge > 0) {
      // A step and a thrust, then back into line.
      p.lunge = Math.max(0, p.lunge - dt);
      const k = Math.sin(Math.PI * (1 - p.lunge / 0.6));
      c.x = p.hx + fx * k * 0.5; c.z = p.hz + fz * k * 0.5;
      if (p.lunge < 0.4 && p.lunge + dt >= 0.4) { c.flap = 0; c.flapAmp = 0.6; }
    }
    this.face(c, p.hyaw + p.turn, dt);
    if (p.march > 0) {
      p.march -= dt;
      c.walk += dt * 6;
      c.walkAmp = 0.6;
    }
    const resting = p.g.drill.rest > 0;
    c.head = resting ? Math.sin(this.time * 0.7 + c.seed) * 0.2 : 0;
  }

  private spar(c: Creature, p: Post, dt: number): void {
    const L = p.g.L, dmy = L.dummies[p.i];
    const [x, z] = castleWorld(L, dmy.u, dmy.v);
    this.face(c, Math.atan2(x - c.x, z - c.z), dt);
    p.t -= dt;
    if (p.t > 0) return;
    // Every eighth blow, a breather.
    p.dir++;
    if (p.dir % 8 === 0) { p.t = rand(5, 9); return; }
    p.t = rand(1.0, 2.0);
    c.flap = 0; c.flapAmp = 1.3;
    if (this.near(c, 50)) {
      this.host.sound('hit', c);
      for (let n = 0; n < 4; n++) this.host.fire.spark(x, L.floorY + 2.5, z, 0.9, 0.8, 0.45, 1, 1.4);
    }
  }

  private archery(c: Creature, p: Post, dt: number): void {
    const L = p.g.L, butt = L.butts[p.i];
    const [x, z] = castleWorld(L, butt.u, butt.v);
    this.face(c, Math.atan2(x - c.x, z - c.z), dt);
    p.t -= dt;
    if (p.t < 0.9) c.tail += (1.4 - c.tail) * Math.min(1, dt * 8); // draw
    if (p.t > 0) return;
    p.t = rand(3.5, 6);
    if (this.near(c, 90)) this.night.shootAt(c, x + rand(-0.35, 0.35), L.floorY + 2.5 + rand(-0.3, 0.3), z + rand(-0.35, 0.35));
  }

  // ------------------------------------------------------------ helpers

  private atHome(p: Post): boolean {
    return !!p.c && Math.hypot(p.c.x - p.hx, p.c.z - p.hz) < 0.9;
  }

  /** Walk to the post; true once there. */
  private goHome(c: Creature, p: Post, dt: number, speed: number): boolean {
    if (p.route && p.ri < p.route.length) {
      const [x, z] = p.route[p.ri];
      if (this.host.walkToward(c, x, z, speed, dt) === 'arrived') p.ri++;
      return false;
    }
    if (Math.hypot(c.x - p.hx, c.z - p.hz) < 0.6) return true;
    if (p.lunge > 0) return true;
    return this.host.walkToward(c, p.hx, p.hz, speed, dt) === 'arrived';
  }

  private face(c: Creature, yaw: number, dt: number): void {
    this.host.idle(c, dt);
    c.yaw += angleTo(c.yaw, yaw) * Math.min(1, dt * 5);
  }

  /** A torch in the left hand. */
  private torch(c: Creature, dt: number): void {
    if (!this.near(c, 90)) return;
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
    const lx = -0.48, fz = 0.3;
    this.host.fire.torch(c.x + lx * co + fz * s, c.y + 1.55 * c.scale, c.z - lx * s + fz * co, dt);
  }

  private near(c: Creature, r: number): boolean {
    return Math.hypot(c.x - this.px, c.z - this.pz) < r;
  }

  private say(c: Creature, text: string, sec: number, r = 34): void {
    if (this.near(c, r)) this.host.say(c, text, sec);
  }

  // ------------------------------------------------------------ dev

  /** Dev: besiege the active castle now (it must be night). */
  devSiege(): string {
    const g = [...this.garrisons.values()].find((x) => x.active);
    if (!g) return 'no garrison active';
    if (!g.night) return 'not night (try __hour(22))';
    if (g.siege) return 'already besieged';
    g.rolled = true;
    this.startSiege(g);
    return `siege at ${g.site.name}`;
  }

  /** Nearest held castle (for the dev teleport). */
  nearestCastle(x: number, z: number): { name: string; house: string; x: number; z: number; gate: number } | null {
    let best: Site | null = null, bd = Infinity;
    for (const s of this.terrain.structures.sitesNear(x - 2000, z - 2000, x + 2000, z + 2000, 0)) {
      if (s.kind !== SITE_CASTLE || !s.held) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return null;
    const L = castleLayout(best, this.terrain.seed, gateSide(this.terrain, best));
    return { name: best.name, house: L.house!.name, x: best.x, z: best.z, gate: L.gate };
  }

  info(): string {
    return [...this.garrisons.values()].filter((g) => g.active).map((g) => {
      const on = g.posts.filter((p) => p.c);
      const by: Record<string, number> = {};
      for (const p of on) by[p.duty] = (by[p.duty] ?? 0) + 1;
      const fighting = on.filter((p) => p.c!.fighter!.foe).length;
      const s = g.siege, gate = g.gate;
      const siege = s ? ` KUŞATMA ${s.phase} dalga=${s.wave} düşman=${s.foes.length} kapı=${gate.broken ? 'KIRIK' : Math.round(gate.hp)}${gate.solid ? ' kapalı' : ''}` : '';
      return `${g.site.name} (${g.L.house!.name}) ${g.night ? 'gece' : 'gündüz'} drill=${g.drill.rest > 0 ? 'mola' : g.drill.step} ${JSON.stringify(by)} fighting=${fighting}${siege}`;
    }).join(' | ') || 'no garrison active';
  }
}
