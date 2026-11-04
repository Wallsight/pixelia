// Orc camps come alive when the player is near. In the orda (the capital) the
// chief stands on the dais before his hall and bellows at the camp, the shaman
// circles the great fire with a green light on her staff, two drummers beat
// the war drum, a pair of warriors fight bouts in the arena while a crowd
// roars them on, the smith hammers, workers haul wood and scrape hides,
// spear throwers practise at the range and wolves pace their pen. Guards stand
// at the gate and on the towers. After dark the camp gathers round the fire
// and the drum quickens. Small camps (obas) have a handful of the same.
// Like everyone else, the orcs ignore the player.

import { SITE_ORC, type Site } from '../world/structures';
import { orcLayout, type OrcLayout, type OrcSpot } from '../world/orcs';
import type { Terrain } from '../world/terrain';
import type { Creature } from './creatures';
import { fighterStats, type Fighter, type FighterKind, type NightDirector } from './night';
import type { WarHost } from './war';

export type JobKind = 'chief' | 'shaman' | 'drum' | 'guard' | 'tower' | 'arena' | 'crowd' | 'smith' | 'haul' | 'rack' | 'throw' | 'wolf' | 'fire' | 'loaf';

export interface OrcJob {
  camp: Camp;
  job: JobKind;
  kind: FighterKind;
  i: number;
  /** Home place, facing and the height of the feet there (towers, the dais). */
  hx: number; hz: number; hyaw: number; hy: number;
  shift: 'day' | 'night' | 'always';
  c: Creature | null;
  t: number;
  scan: number;
  leaving: boolean;
  /** Spare state: hauling leg, wander target, beat counter. */
  dir: number;
  tx: number; tz: number;
}

interface Camp {
  site: Site;
  L: OrcLayout;
  jobs: OrcJob[];
  active: boolean;
  night: boolean;
  spawnT: number;
  talkT: number;
  /** Drum: seconds to the next beat, position in the pattern, bars left before a rest. */
  drum: { t: number; step: number; bars: number; rest: number };
  /** The arena bout: who is down, when the next exchange comes. */
  bout: { t: number; down: OrcJob | null; downT: number; hits: number };
  chiefT: number;
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

// Orcish is invented for Pixelia; they also speak a rough Turkish.
const SHOUT = ['Gruh-dakh!', 'Vorr nak-ta!', 'Hrom! Hrom!', 'Ukh-zar mogra!', 'Dur-gakh!', 'Rakka-tul!', 'Zhar ka-mok!'];
const CHIEF_DAY = [
  'Kurr-ma! Vash dakh!', 'Davullar! Daha yüksek!', 'Kim zayıf? Kimse!', 'Taş kaleler... yakında bizim.',
  'Ghor-zul! Baltalar keskin olsun!', 'Ork yorulmaz!', 'İnsanlar duvar arkasında saklanır. Biz saklanmayız.',
];
const CHIEF_NIGHT = ['Ateş yüksek! Ruhlar baksın!', 'Hrom! Hrom! Hrom!', 'Yarın av. Bu gece şarkı.'];
const CHIEF_ARENA = ['Vur onu!', 'Kalk! Ork yerde kalmaz!', 'Güzel. Çok güzel.', 'Daha sert, kurt yavrusu!'];
const SHAMAN = ['Ka-veshh... ka-veshh...', 'Ruhlar konuşuyor...', 'Ateş görür. Ateş bilir.', 'Umm-zhar... umm-zhar...', 'Atalar burada.'];
const CROWD = ['Hrom!', 'Ez onu!', 'Vur!', 'Hrak! Hrak!', 'Daha sert!', 'Kalk!'];
const ARENA = ['Hrak!', 'Gel bakalım!', 'Zayıf!', 'Bu kadar mı?'];
const SMITH = ['Demir sıcak, çekiç ağır. İyi.', 'Bu balta kafa yarar.', 'Hrm.'];
const HAUL = ['Odun... yine odun.', 'Hrmf.', 'Taşı. Taşı. Taşı.'];
const FIRE_TALK = [
  ['Kurt aç.', 'Ork da aç.'],
  ['İnsan kalesini gördün mü?', 'Duvarları yüksek. Ama kapısı tahta.'],
  ['Şef bugün çok bağırdı.', 'Şef hep bağırır. Şef olmak bu.'],
  ['Büyük ejder... uyuyor mu?', 'Uyusun. Uyusun, iyi.'],
  ['Vorr nak-ta?', 'Nak-ta. Hrom.'],
];
const GATE_TALK = [['Yol boş.', 'Yol hep boş. Korkuyorlar.'], ['Rüzgâr kum getiriyor.', 'Kum iyi. Kum sertleştirir.']];
// Drum: 1 = beat, 0 = rest (each step 0.42 s by day, 0.3 s by night).
const DRUM = [1, 0, 1, 0, 1, 1, 1, 0];

const SKINS = ['#7a9a5a', '#6a8a4e', '#8a9a62', '#5e7a4a', '#7a8a6a', '#6e8e62', '#8aa070'];
const LEATHER = ['#8a6a4a', '#6a4e34', '#9a7a52', '#5a4a3a', '#7a5a3e'];
const KILT = ['#5a4232', '#4a3a2e', '#6a3a2a', '#3e3a30', '#7a2e24'];
const FUR = ['#7a7270', '#5a5450', '#8a8278', '#4a4442', '#9a8e80'];

export class OrcDirector {
  private camps = new Map<string, Camp>();
  private scanT = 0;
  private time = 0;
  private px = 0; private pz = 0; private nightV = 0;

  constructor(private terrain: Terrain, private host: WarHost, private night: NightDirector) {}

  update(dt: number, px: number, pz: number, night: number): void {
    this.time += dt;
    this.px = px; this.pz = pz; this.nightV = night;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 1; this.refresh(); }
    for (const g of this.camps.values()) if (g.active) this.run(g, dt);
  }

  private refresh(): void {
    const { px, pz } = this;
    for (const s of this.terrain.structures.sitesNear(px - 260, pz - 260, px + 260, pz + 260, 0)) {
      if (s.kind === SITE_ORC && !this.camps.has(s.id)) this.camps.set(s.id, this.make(s));
    }
    for (const [id, g] of this.camps) {
      const d = Math.hypot(g.site.x - px, g.site.z - pz);
      const on = g.L.capital ? 160 : 120;
      g.active = g.active ? d < on + 40 : d < on;
      if (d > 400) this.camps.delete(id);
    }
  }

  private make(site: Site): Camp {
    const L = orcLayout(this.terrain, site);
    const g: Camp = {
      site, L, jobs: [], active: false, night: this.nightV > 0.5, spawnT: 0, talkT: rand(10, 18),
      drum: { t: 2, step: 0, bars: 8, rest: 0 }, bout: { t: 3, down: null, downT: 0, hits: 0 }, chiefT: rand(6, 12),
    };
    const add = (job: JobKind, kind: FighterKind, s: OrcSpot | [number, number, number], shift: OrcJob['shift'] = 'always') => {
      const [hx, hz, hyaw] = Array.isArray(s) ? s : [s.x, s.z, s.yaw];
      const hy = (Array.isArray(s) ? L.floorY : s.y) + 1;
      const j: OrcJob = { camp: g, job, kind, i: g.jobs.filter((o) => o.job === job).length, hx, hz, hyaw, hy, shift, c: null, t: rand(1, 4), scan: rand(0, 0.5), leaving: false, dir: 0, tx: hx, tz: hz };
      g.jobs.push(j);
      return j;
    };
    const cx = site.x + 0.5, cz = site.z + 0.5;
    const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
    const centre = (x: number, z: number): [number, number, number] => [x, z, yawTo(x, z, cx, cz)];
    const ring = (x: number, z: number, r: number, a: number): [number, number, number] => centre(x + Math.cos(a) * r, z + Math.sin(a) * r);
    const sp = (s: OrcSpot): OrcSpot => ({ ...s, x: s.x + 0.5, z: s.z + 0.5 });

    L.guards.forEach((s) => add('guard', 'orcspear', sp(s)));
    L.towers.forEach((s) => add('tower', 'orcspear', sp(s)));
    L.drummers.forEach((s) => add('drum', 'orc', s));
    const seats = L.seats.slice(0, L.capital ? 9 : 4);
    if (L.capital) {
      if (L.throne) add('chief', 'chief', sp(L.throne)).t = rand(40, 70);
      add('shaman', 'shaman', ring(cx, cz, 4, 0));
      if (L.arena) {
        const A = L.arena;
        for (const s of [0, 1]) {
          const a = s * Math.PI;
          add('arena', 'orc', [A.x + 0.5 + Math.cos(a) * 1.6, A.z + 0.5 + Math.sin(a) * 1.6, 0], 'day');
        }
        const open = Math.atan2(cz - A.z, cx - A.x);
        for (let k = 0; k < 5; k++) {
          const a = open + 0.6 + k * ((TAU - 1.2) / 4);
          const x = A.x + 0.5 + Math.cos(a) * (A.r + 1.6), z = A.z + 0.5 + Math.sin(a) * (A.r + 1.6);
          add('crowd', k % 2 ? 'orcspear' : 'orc', [x, z, yawTo(x, z, A.x + 0.5, A.z + 0.5)], 'day');
        }
      }
      if (L.forge) add('smith', 'orcwork', sp(L.forge), 'day');
      if (L.woodpile) for (let k = 0; k < 2; k++) add('haul', 'orcwork', sp(L.woodpile), 'day');
      L.racks.forEach((s) => add('rack', 'orcwork', sp(s), 'day'));
      L.range?.throwers.forEach((s) => add('throw', 'orcspear', sp(s), 'day'));
      if (L.pen) for (let k = 0; k < 4; k++) add('wolf', 'wolf', [L.pen.x + 0.5, L.pen.z + 0.5, rand(0, TAU)]);
      seats.forEach((s, k) => add('fire', k % 3 === 2 ? 'orcspear' : k % 4 === 3 ? 'orcwork' : 'orc', s, 'night'));
      // A few more about the yard by day.
      for (let k = 0; k < 3; k++) add('loaf', k ? 'orc' : 'orcwork', ring(cx, cz, 7.5, L.gateA + 0.5 + k * 0.7), 'day');
    } else {
      if (Math.abs(Math.sin(site.gx * 12.9898 + site.gz * 78.233)) % 1 < 0.5) add('shaman', 'shaman', ring(cx, cz, 3, 0));
      if (L.woodpile) add('haul', 'orcwork', sp(L.woodpile), 'day');
      L.racks.forEach((s) => add('rack', 'orcwork', sp(s), 'day'));
      for (let k = 0; k < 2; k++) add('wolf', 'wolf', [cx, cz, rand(0, TAU)]);
      for (let k = 0; k < 2; k++) add('loaf', 'orc', ring(cx, cz, 5, L.gateA + 0.6 + k * 0.9), 'day');
      seats.forEach((s, k) => add('fire', k % 2 ? 'orcspear' : 'orc', s, 'night'));
    }
    return g;
  }

  // ------------------------------------------------------------ camp

  private onShift(g: Camp, j: OrcJob): boolean {
    return j.shift === 'always' || (j.shift === 'night') === g.night;
  }

  private run(g: Camp, dt: number): void {
    if (!g.night && this.nightV > 0.55) g.night = true;
    else if (g.night && this.nightV < 0.35) g.night = false;
    const dPlayer = Math.hypot(g.site.x - this.px, g.site.z - this.pz);
    g.spawnT -= dt;
    for (const j of g.jobs) {
      if (j.c && (j.c.gone || j.c.dying > 0)) j.c = null;
      if (j.c && !this.onShift(g, j) && !j.leaving) { j.leaving = true; j.t = 25; }
      if (!j.c && this.onShift(g, j) && g.spawnT <= 0) { g.spawnT = 0.2; this.spawn(g, j); }
    }
    // Fires burn day and night (bigger after dark).
    if (dPlayer < 140) {
      g.L.fires.forEach((f, i) => {
        const big = i === 0;
        if (!big && !g.night) return;
        // The great fire in the orda is three blocks wide and roars higher at night.
        const w = big ? (g.L.capital ? 2.6 : 1.5) * (g.night ? 1 : 0.75) : 1.1;
        this.host.fire.bonfire(f.x + (big && g.L.capital ? 0.9 : 0.5), f.y + 1.1, f.z + (big && g.L.capital ? 0.9 : 0.5), dt, w);
      });
    }
    this.runDrum(g, dt);
    this.runBout(g, dt);
    this.chatter(g, dt);
  }

  private spawn(g: Camp, j: OrcJob): void {
    const L = g.L;
    // Everyone appears at their place (a camp full of huts has no clear way across it).
    let x = j.hx, z = j.hz;
    if (j.job === 'wolf' && L.pen) { const a = rand(0, TAU), r = rand(0, L.pen.r - 2); x += Math.cos(a) * r; z += Math.sin(a) * r; }
    if (j.job === 'wolf' && !L.pen) { const a = rand(0, TAU); x += Math.cos(a) * 6; z += Math.sin(a) * 6; }
    const c = this.night.spawn(j.kind, x, z);
    if (!c) return;
    const f = c.fighter!;
    f.orc = j;
    c.yaw = j.hyaw;
    if (j.kind === 'wolf') {
      c.tint.set(pick(FUR));
    } else {
      c.tint.set(pick(LEATHER));
      c.tint2.set(pick(KILT));
      c.tint3.set(pick(SKINS));
      if (j.kind === 'chief') c.tint.set('#6a5a4e');
      if (j.kind === 'shaman') c.tint.set(pick(['#8a7a62', '#6a5e52', '#9a8a6a']));
    }
    // Stand on the ground (or the platform), not on a roof over the spot.
    if (j.job !== 'wolf') { c.y = j.hy; c.ground = j.hy; c.col = NaN; }
    j.c = c; j.leaving = false; j.dir = 0; j.tx = j.hx; j.tz = j.hz;
  }

  /** The war drum: a steady pattern by day, faster by night, a rest now and then. */
  private runDrum(g: Camp, dt: number): void {
    const d = g.drum;
    const drummers = g.jobs.filter((j) => j.job === 'drum' && j.c && !j.c.fighter!.foe && this.atHome(j));
    if (!drummers.length) return;
    if (d.rest > 0) { d.rest -= dt; return; }
    d.t -= dt;
    if (d.t > 0) return;
    d.t = g.night ? 0.3 : 0.42;
    const hit = DRUM[d.step % DRUM.length];
    if (hit) {
      const j = drummers[d.step % drummers.length];
      const c = j.c!;
      c.flap = 0; c.flapAmp = 1.1;
      if (this.near(c, 140)) this.host.sound('drum', c);
    }
    d.step++;
    if (d.step % DRUM.length === 0 && --d.bars <= 0) {
      d.bars = g.night ? 12 : 8;
      d.rest = g.night ? rand(6, 10) : rand(14, 24);
      // The camp answers the drum.
      const who = g.jobs.filter((j) => j.c && (j.job === 'fire' || j.job === 'crowd' || j.job === 'chief') && !j.leaving).map((j) => j.c!);
      for (let i = 0; i < Math.min(3, who.length); i++) {
        const c = pick(who);
        setTimeout(() => { if (!c.gone) { this.say(c, 'Hrom! Hrom!', 1.6, 60); c.tail = 1.4; } }, i * 400);
      }
    }
  }

  /** An arena bout: the two close in, trade blows, one goes down, the crowd roars. */
  private runBout(g: Camp, dt: number): void {
    const b = g.bout, A = g.L.arena;
    if (!A) return;
    const pair = g.jobs.filter((j) => j.job === 'arena');
    if (pair.length < 2 || !pair[0].c || !pair[1].c || pair.some((j) => j.leaving)) return;
    if (b.down) {
      b.downT -= dt;
      if (b.downT <= 0) {
        b.down = null; b.t = rand(4, 7);
        const ch = this.chiefOf(g);
        if (ch && Math.random() < 0.5) this.say(ch, pick(CHIEF_ARENA), 2.4, 60);
      }
      return;
    }
    b.t -= dt;
    if (b.t > 0) return;
    b.t = rand(0.9, 1.6);
    const [a, o] = Math.random() < 0.5 ? pair : [pair[1], pair[0]];
    const c = a.c!, foe = o.c!;
    if (Math.hypot(c.x - foe.x, c.z - foe.z) > 2.6) return;
    c.flap = 0; c.flapAmp = 1.3;
    if (this.near(c, 70)) {
      this.host.sound(Math.random() < 0.6 ? 'clang' : 'hit', c);
      const mx = (c.x + foe.x) / 2, mz = (c.z + foe.z) / 2;
      for (let n = 0; n < 5; n++) this.host.fire.spark(mx, c.y + 1.3, mz, 1, 0.85, 0.5, 1, 1.6);
    }
    if (Math.random() < 0.3) this.say(c, pick(ARENA), 1.4, 40);
    // The crowd reacts.
    const crowd = g.jobs.filter((j) => j.job === 'crowd' && j.c);
    for (const j of crowd) if (Math.random() < 0.35) j.c!.tail = 1.4;
    if (crowd.length && Math.random() < 0.4) this.say(pick(crowd).c!, pick(CROWD), 1.3, 45);
    if (++b.hits >= 6 + Math.floor(Math.random() * 5)) {
      b.hits = 0; b.down = o; b.downT = 3.5;
      if (crowd.length) this.say(pick(crowd).c!, 'HROOM!', 1.8, 60);
      for (const j of crowd) if (j.c) j.c.tail = 1.4;
    }
  }

  private chiefOf(g: Camp): Creature | null {
    const c = g.jobs.find((j) => j.job === 'chief')?.c;
    return c && !c.gone ? c : null;
  }

  private chatter(g: Camp, dt: number): void {
    g.talkT -= dt;
    if (g.talkT > 0) return;
    g.talkT = rand(18, 32);
    const live = (job: JobKind) => g.jobs.filter((j) => j.job === job && j.c && !j.leaving && this.near(j.c, 40) && this.atHome(j));
    const pair = (a: Creature, b: Creature, lines: string[]) => lines.forEach((l, i) => setTimeout(() => {
      const who = i % 2 ? b : a;
      if (!who.gone && !who.fighter!.foe) this.say(who, l, 2.8);
    }, i * 3000));
    const fire = live('fire'), gate = live('guard');
    if (g.night && fire.length >= 2) {
      const a = pick(fire), b = pick(fire.filter((j) => j !== a));
      pair(a.c!, b.c!, pick(FIRE_TALK));
    } else if (gate.length === 2 && Math.random() < 0.5) pair(gate[0].c!, gate[1].c!, pick(GATE_TALK));
    else {
      const any = g.jobs.filter((j) => j.c && !j.leaving && j.kind !== 'wolf' && j.job !== 'chief' && this.near(j.c, 30));
      if (any.length) this.say(pick(any).c!, pick(SHOUT), 1.8);
    }
  }

  // ------------------------------------------------------------ per orc

  /** Returns false when the orc should be removed. */
  step(c: Creature, dt: number): boolean {
    const f = c.fighter!, j = f.orc!;
    if (j.c !== c || !j.camp.active) return false;
    f.flash = Math.max(0, f.flash - dt);
    f.cool -= dt;
    c.glow = f.flash * 4;
    const down = f.down > 0 || j.camp.bout.down === j;
    if (down) {
      if (f.down > 0) {
        f.down -= dt;
        if (f.down <= 0) f.hp = f.max * 0.6;
      }
      c.roll += (Math.PI / 2 - c.roll) * Math.min(1, dt * 5);
      c.bob += (-0.25 - c.bob) * Math.min(1, dt * 5);
      this.host.idle(c, dt);
      c.walkAmp = 0;
      return true;
    }
    c.roll += (0 - c.roll) * Math.min(1, dt * 5);
    c.bob += (0 - c.bob) * Math.min(1, dt * 5);
    c.flapAmp += (0 - c.flapAmp) * Math.min(1, dt * 3);
    c.flap += dt * 10;
    c.tail += (0 - c.tail) * Math.min(1, dt * 2.5);

    if (this.fight(c, f, j, dt)) return true;

    if (j.leaving) {
      j.t -= dt;
      const h = this.hutOf(j);
      return this.walk(j, c, h[0], h[1], 1.4, dt) !== 'arrived' && j.t > 0;
    }
    switch (j.job) {
      case 'chief': return this.chief(c, j, dt);
      case 'shaman': return this.shaman(c, j, dt);
      case 'arena': return this.arena(c, j, dt);
      case 'haul': return this.haul(c, j, dt);
      case 'wolf': return this.wolf(c, j, dt);
      case 'loaf': return this.loaf(c, j, dt);
      default: break;
    }
    if (!this.goHome(c, j, dt, 1.4)) return true;
    const g = j.camp;
    switch (j.job) {
      case 'guard':
        j.t -= dt;
        if (j.t < -2.5) j.t = rand(6, 14);
        this.face(c, j.hyaw + (j.t < 0 ? (j.i ? 0.6 : -0.6) : 0), dt);
        if (g.night) this.torch(c, dt);
        break;
      case 'tower':
        this.face(c, j.hyaw + Math.sin(this.time * 0.25 + c.seed) * 0.8, dt);
        if (g.night) this.torch(c, dt);
        break;
      case 'drum': this.face(c, j.hyaw, dt); c.head = 0.15; break;
      case 'crowd': this.face(c, j.hyaw + Math.sin(this.time * 0.5 + c.seed) * 0.15, dt); break;
      case 'fire':
        this.face(c, j.hyaw, dt);
        c.head = 0.15 + Math.sin(this.time * 0.3 + c.seed) * 0.05;
        break;
      case 'smith': this.smith(c, j, dt); break;
      case 'rack': {
        this.face(c, j.hyaw, dt);
        j.t -= dt;
        if (j.t <= 0) { j.t = rand(0.6, 1.0); c.flap = 0; c.flapAmp = 0.5; }
        c.head = 0.35;
        break;
      }
      case 'throw': this.throwing(c, j, dt); break;
      default: this.face(c, j.hyaw, dt);
    }
    return true;
  }

  /** Monsters that wander into a camp are cut down (spears thrown from further off). */
  private fight(c: Creature, f: Fighter, j: OrcJob, dt: number): boolean {
    j.scan -= dt;
    if (j.scan <= 0) {
      j.scan = 0.5;
      const ranged = j.kind === 'orcspear' || j.kind === 'shaman';
      const foe = f.foe && !f.foe.gone && f.foe.dying === 0 ? f.foe : this.night.nearestMonster(c.x, c.z, ranged ? 20 : 14);
      const home = j.job === 'tower' ? 26 : 22;
      f.foe = foe && Math.hypot(foe.x - j.hx, foe.z - j.hz) < home ? foe : null;
      if (f.foe && Math.random() < 0.3) this.say(c, pick(SHOUT), 1.6, 50);
    }
    const foe = f.foe;
    if (!foe || foe.gone || foe.dying > 0) { f.foe = null; return false; }
    const k = fighterStats(j.kind);
    const d = Math.hypot(foe.x - c.x, foe.z - c.z);
    this.face(c, Math.atan2(foe.x - c.x, foe.z - c.z), dt);
    if (k.reach > 4) {
      if (f.cool <= 0 && d <= k.reach) {
        f.cool = k.cool * rand(0.85, 1.2);
        c.tail = 1.4;
        this.night.cast(c, foe, j.kind === 'shaman' ? 'bolt' : 'arrow', k.dmg * rand(0.8, 1.2));
      }
      return true;
    }
    if (d > k.reach) {
      if (j.job !== 'tower') this.walk(j, c, foe.x, foe.z, k.speed * 1.5, dt);
      return true;
    }
    if (f.cool <= 0) {
      f.cool = k.cool * rand(0.85, 1.15);
      c.flap = 0; c.flapAmp = 1.3;
      this.host.sound('swing', c);
      this.night.hit(foe, k.dmg * rand(0.8, 1.3), c);
    }
    return true;
  }

  private chief(c: Creature, j: OrcJob, dt: number): boolean {
    const g = j.camp;
    // By night: at the great fire with the others.
    const [hx, hz] = g.night ? [g.site.x + 0.5 + Math.cos(g.L.gateA + Math.PI) * 3.2, g.site.z + 0.5 + Math.sin(g.L.gateA + Math.PI) * 3.2] : [j.hx, j.hz];
    // Now and then by day: over to the arena (by way of the open ground at the fire) to watch a bout.
    if (g.L.arena && j.dir > 0) {
      const A = g.L.arena, cx = g.site.x + 0.5, cz = g.site.z + 0.5;
      const a = Math.atan2(A.z + 0.5 - cz, A.x + 0.5 - cx);
      const [vx, vz] = [cx + Math.cos(a) * 7, cz + Math.sin(a) * 7];
      const [wx, wz] = [A.x + 0.5 - Math.cos(a) * (A.r + 1.8), A.z + 0.5 - Math.sin(a) * (A.r + 1.8)];
      if (g.night && j.dir === 2) j.dir = 3;
      if (j.dir === 2) {
        if (this.walk(j, c, wx, wz, 1.3, dt) === 'arrived') this.face(c, Math.atan2(A.x + 0.5 - c.x, A.z + 0.5 - c.z), dt);
        j.t -= dt;
        if (j.t <= 0) j.dir = 3;
      } else if (this.walk(j, c, vx, vz, 1.3, dt) !== 'moving') {
        j.dir = j.dir === 1 ? 2 : 0;
        if (j.dir === 0) j.t = rand(70, 120);
      }
      return true;
    }
    if (Math.hypot(c.x - hx, c.z - hz) > 0.6) { this.walk(j, c, hx, hz, 1.3, dt); return true; }
    this.face(c, g.night ? Math.atan2(g.site.x + 0.5 - c.x, g.site.z + 0.5 - c.z) : j.hyaw + Math.sin(this.time * 0.3) * 0.2, dt);
    g.chiefT -= dt;
    if (g.chiefT <= 0) {
      g.chiefT = rand(14, 26);
      // A bellow, the axe raised high.
      c.tail = 1.5; c.flap = 0; c.flapAmp = 1.2;
      this.say(c, pick(g.night ? CHIEF_NIGHT : CHIEF_DAY), 3, 80);
      if (Math.random() < 0.5) this.host.sound('growl', c);
    }
    if (!g.night && j.dir === 0) {
      j.t -= dt;
      if (j.t <= 0 && g.L.arena) { j.dir = 1; j.t = rand(25, 40); }
    }
    return true;
  }

  private shaman(c: Creature, j: OrcJob, dt: number): boolean {
    const g = j.camp, cx = g.site.x + 0.5, cz = g.site.z + 0.5;
    // Slow circles round the fire (faster at night), pausing to chant with the staff raised.
    const r = g.L.capital ? 3.6 : 2.6;
    if (j.t > 0) {
      j.t -= dt;
      this.face(c, Math.atan2(cx - c.x, cz - c.z), dt);
      c.tail = 1.5;
      c.bob = Math.sin(this.time * 6) * 0.05;
      if (this.near(c, 70) && Math.random() < dt * 8) {
        const sx = c.x + Math.sin(c.yaw) * 0.3 + Math.cos(c.yaw) * 0.46, sz = c.z + Math.cos(c.yaw) * 0.3 - Math.sin(c.yaw) * 0.46;
        this.host.fire.spark(sx, c.y + 2.3 * c.scale, sz, 0.55, 1, 0.45, 1, 1.2);
      }
      if (g.night && this.near(c, 70) && Math.random() < dt * 6) this.host.fire.spark(cx + rand(-1, 1), c.y + 1.5, cz + rand(-1, 1), 0.5, 1, 0.5, 1, 2.5);
      return true;
    }
    j.dir += dt * (g.night ? 0.32 : 0.16);
    const a = j.dir;
    const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
    this.walk(j, c, tx, tz, g.night ? 1.1 : 0.7, dt);
    j.tx -= dt;
    if (j.tx <= 0) {
      j.tx = rand(8, 16);
      j.t = rand(4, 7);
      this.say(c, pick(SHAMAN), 3, 40);
    }
    return true;
  }

  private arena(c: Creature, j: OrcJob, dt: number): boolean {
    const g = j.camp, A = g.L.arena!;
    const other = g.jobs.find((o) => o.job === 'arena' && o !== j)?.c;
    if (!other || other.gone) return this.goHome(c, j, dt, 1.4) || true;
    // The two circle each other round the middle of the ring, closing and opening the gap.
    const a = this.time * 0.35 + j.i * Math.PI;
    const r = 1.2 + Math.sin(this.time * 0.9) * 0.3;
    const tx = A.x + 0.5 + Math.cos(a) * r, tz = A.z + 0.5 + Math.sin(a) * r;
    if (this.host.walkToward(c, tx, tz, 1.3, dt) === 'arrived' || Math.hypot(tx - c.x, tz - c.z) < 0.6) {
      this.face(c, Math.atan2(other.x - c.x, other.z - c.z), dt);
    } else c.yaw += angleTo(c.yaw, Math.atan2(other.x - c.x, other.z - c.z)) * Math.min(1, dt * 4);
    return true;
  }

  private smith(c: Creature, j: OrcJob, dt: number): void {
    const L = j.camp.L;
    this.face(c, j.hyaw, dt);
    j.t -= dt;
    if (j.t > 0) return;
    j.dir++;
    // Every dozen blows, a look at the work and a word.
    if (j.dir % 12 === 0) { j.t = rand(4, 7); c.head = 0.3; if (Math.random() < 0.5) this.say(c, pick(SMITH), 2.4); return; }
    j.t = rand(0.7, 1.0);
    c.flap = 0; c.flapAmp = 1.2;
    if (L.anvil && this.near(c, 60)) {
      const [x, y, z] = L.anvil;
      this.host.sound('anvil', c);
      for (let n = 0; n < 6; n++) this.host.fire.spark(x + 0.5, y + 1.05, z + 0.5, 1, 0.7, 0.3, 1, 1.8);
    }
  }

  private throwing(c: Creature, j: OrcJob, dt: number): void {
    const R = j.camp.L.range!;
    const [x, y, z] = R.target;
    this.face(c, Math.atan2(x + 0.5 - c.x, z + 0.5 - c.z), dt);
    j.t -= dt;
    if (j.t < 0.8) c.tail += (1.5 - c.tail) * Math.min(1, dt * 8); // arm back
    if (j.t > 0) return;
    j.t = rand(4, 7);
    c.flap = 0; c.flapAmp = 1.2;
    if (this.near(c, 90)) this.night.shootAt(c, x + 0.5 + rand(-0.3, 0.3), y + 0.5 + rand(-0.3, 0.3), z + 0.5 + rand(-0.3, 0.3));
    if (Math.random() < 0.2) this.say(c, pick(['Hrak!', 'Tam ortası!', 'Gruh.']), 1.6, 40);
  }

  /** Haulers carry wood from the pile to the great fire, stopping at each end. */
  private haul(c: Creature, j: OrcJob, dt: number): boolean {
    const L = j.camp.L;
    if (j.t > 0) {
      j.t -= dt;
      this.face(c, c.yaw, dt);
      c.head = 0.4;
      if (Math.random() < dt * 2) { c.flap = 0; c.flapAmp = 0.5; }
      return true;
    }
    if (this.walk(j, c, j.tx, j.tz, 1.1, dt) === 'arrived' || (Math.random() < dt * 0.05)) {
      j.dir = 1 - j.dir;
      j.t = rand(2.5, 5);
      if (j.dir === 1) {
        const cx = L.site.x + 0.5, cz = L.site.z + 0.5, a = Math.atan2(j.hz - cz, j.hx - cx), r = (L.capital ? 5 : 3.6) + j.i * 0.8;
        j.tx = cx + Math.cos(a) * r; j.tz = cz + Math.sin(a) * r;
      } else { j.tx = j.hx; j.tz = j.hz; }
      if (Math.random() < 0.15) this.say(c, pick(HAUL), 2);
    }
    return true;
  }

  /** Wolves: pace the pen (or the camp), lie down by the fire at night, howl now and then. */
  private wolf(c: Creature, j: OrcJob, dt: number): boolean {
    const g = j.camp, P = g.L.pen;
    const cx = P ? P.x + 0.5 : g.site.x + 0.5, cz = P ? P.z + 0.5 : g.site.z + 0.5;
    const R = P ? P.r - 1.6 : 9;
    if (j.t > 0) {
      j.t -= dt;
      this.host.idle(c, dt);
      const lie = g.night && j.dir === 1;
      c.bob += ((lie ? -0.3 : 0) - c.bob) * Math.min(1, dt * 3);
      c.head = lie ? 0.3 : Math.sin(this.time * 0.6 + c.seed) * 0.15;
      c.tail = Math.sin(this.time * (lie ? 1 : 4) + c.seed) * 0.5;
      return true;
    }
    const r = this.host.walkToward(c, j.tx, j.tz, j.dir === 2 ? 2.4 : 1.2, dt);
    if (r !== 'moving') {
      const a = rand(0, TAU), d = rand(P ? 0 : 4, R);
      j.tx = cx + Math.cos(a) * d; j.tz = cz + Math.sin(a) * d;
      j.dir = Math.random() < (g.night ? 0.5 : 0.1) ? 1 : Math.random() < 0.15 ? 2 : 0;
      j.t = j.dir === 1 ? rand(10, 25) : rand(1.5, 5);
      if (g.night && Math.random() < 0.08 && this.near(c, 120)) { this.host.sound('howl', c); c.head = -0.5; }
    }
    return true;
  }

  /** Orcs about the yard: stroll round the open ground by the fire and down the gate lane, stop, look about. */
  private loaf(c: Creature, j: OrcJob, dt: number): boolean {
    const L = j.camp.L, cx = L.site.x + 0.5, cz = L.site.z + 0.5;
    if (j.t > 0) {
      j.t -= dt;
      this.face(c, c.yaw + Math.sin(this.time * 0.4 + c.seed) * 0.02, dt);
      return true;
    }
    if (this.walk(j, c, j.tx, j.tz, 1.0, dt) !== 'moving') {
      j.t = rand(4, 10);
      if (Math.random() < 0.35) {
        const d = rand(7, L.R - 6), s = rand(-1.2, 1.2);
        j.tx = cx + Math.cos(L.gateA) * d - Math.sin(L.gateA) * s; j.tz = cz + Math.sin(L.gateA) * d + Math.cos(L.gateA) * s;
      } else {
        const a = rand(0, TAU), d = L.capital ? rand(6, 9) : rand(4.2, 6);
        j.tx = cx + Math.cos(a) * d; j.tz = cz + Math.sin(a) * d;
      }
    }
    return true;
  }

  // ------------------------------------------------------------ helpers

  /** The hut nearest the orc's place (where it turns in for the night, or the day). */
  private hutOf(j: OrcJob): [number, number] {
    const L = j.camp.L;
    if (!L.huts.length) return [L.site.x + 0.5, L.site.z + 0.5];
    let h = L.huts[0];
    for (const o of L.huts) if (Math.hypot(o.x - j.hx, o.z - j.hz) < Math.hypot(h.x - j.hx, h.z - j.hz)) h = o;
    return [h.x + 0.5 + Math.sin(h.yaw) * (h.r - 0.5), h.z + 0.5 + Math.cos(h.yaw) * (h.r - 0.5)];
  }

  /** Walk, but in and out of the palisade only through the gate. */
  private walk(j: OrcJob, c: Creature, tx: number, tz: number, speed: number, dt: number): 'moving' | 'arrived' | 'blocked' {
    const L = j.camp.L, cx = L.site.x + 0.5, cz = L.site.z + 0.5;
    const rc = Math.hypot(c.x - cx, c.z - cz), rt = Math.hypot(tx - cx, tz - cz);
    const inside = (r: number) => r < L.R - 0.8, outside = (r: number) => r > L.R + 0.8;
    if ((inside(rc) && outside(rt)) || (outside(rc) && inside(rt))) {
      const [gx, gz] = inside(rc) ? L.gateIn : L.gateOut;
      const [hx, hz] = inside(rc) ? L.gateOut : L.gateIn;
      // Line up with the gate on this side, then go straight through.
      const lined = Math.hypot(c.x - (gx + 0.5), c.z - (gz + 0.5)) < 1.2;
      const r = this.host.walkToward(c, lined ? hx + 0.5 : gx + 0.5, lined ? hz + 0.5 : gz + 0.5, speed, dt);
      return r === 'blocked' ? 'blocked' : 'moving';
    }
    return this.host.walkToward(c, tx, tz, speed, dt);
  }

  private atHome(j: OrcJob): boolean {
    return !!j.c && Math.hypot(j.c.x - j.hx, j.c.z - j.hz) < 0.9;
  }

  private goHome(c: Creature, j: OrcJob, dt: number, speed: number): boolean {
    if (Math.hypot(c.x - j.hx, c.z - j.hz) < 0.6) {
      const k = Math.min(1, dt * 3);
      c.x += (j.hx - c.x) * k; c.z += (j.hz - c.z) * k;
      return true;
    }
    return this.walk(j, c, j.hx, j.hz, speed, dt) === 'arrived';
  }

  private face(c: Creature, yaw: number, dt: number): void {
    this.host.idle(c, dt);
    c.yaw += angleTo(c.yaw, yaw) * Math.min(1, dt * 5);
  }

  private torch(c: Creature, dt: number): void {
    if (!this.near(c, 90)) return;
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
    const lx = -0.56, fz = 0.3;
    this.host.fire.torch(c.x + lx * co + fz * s, c.y + 1.55 * c.scale, c.z - lx * s + fz * co, dt);
  }

  private near(c: Creature, r: number): boolean {
    return Math.hypot(c.x - this.px, c.z - this.pz) < r;
  }

  private say(c: Creature, text: string, sec: number, r = 34): void {
    if (this.near(c, r)) this.host.say(c, text, sec);
  }

  // ------------------------------------------------------------ dev

  /** The orc capital and the nearest camp (for the dev teleport). */
  nearest(x: number, z: number, capital = false): { name: string; x: number; z: number; gate: number } | null {
    let best: Site | null = null, bd = Infinity;
    const cap = this.terrain.structures.capital();
    if (capital && cap) best = this.terrain.structures.site(cap[0], cap[1]);
    else for (const s of this.terrain.structures.sitesNear(x - 2500, z - 2500, x + 2500, z + 2500, 0)) {
      if (s.kind !== SITE_ORC) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return null;
    const L = orcLayout(this.terrain, best);
    return { name: best.name, x: best.x, z: best.z, gate: L.gateA };
  }

  /** Dev: the nearest live orc doing a job. */
  find(job: string, x: number, z: number): Creature | null {
    let best: Creature | null = null, bd = Infinity;
    for (const g of this.camps.values()) for (const j of g.jobs) {
      if (j.job !== job || !j.c || j.c.gone) continue;
      const d = Math.hypot(j.c.x - x, j.c.z - z);
      if (d < bd) { bd = d; best = j.c; }
    }
    return best;
  }

  info(): string {
    return [...this.camps.values()].filter((g) => g.active).map((g) => {
      const by: Record<string, number> = {};
      for (const j of g.jobs) if (j.c) by[j.job] = (by[j.job] ?? 0) + 1;
      // Orcs with a fixed place who are not at it (stuck on the way?).
      const fixed: JobKind[] = ['guard', 'tower', 'drum', 'crowd', 'fire', 'smith', 'rack', 'throw'];
      const away = g.jobs.filter((j) => j.c && !j.leaving && fixed.includes(j.job) && !this.atHome(j)).map((j) => `${j.job}${j.i}`);
      return `${g.site.name} ${g.night ? 'gece' : 'gündüz'} ${JSON.stringify(by)} davul=${g.drum.rest > 0 ? 'mola' : g.drum.step} away=[${away.join(',')}]`;
    }).join(' | ') || 'no orc camp active';
  }
}
