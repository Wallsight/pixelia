// Village watch towers. A bowman keeps each one while the player is about:
// he scans the road, carries a torch after dark and shoots at monsters that
// come near the village. Now and then a dragon comes to harry a tower: it
// circles close and breathes fire at the top, the bowman shouts the alarm and
// looses arrow after arrow until the beast has had enough and flees.

import { SITE_VILLAGE, type Site } from '../world/structures';
import { villageLayout, TOWER_H, type Spot } from '../world/village';
import type { Terrain } from '../world/terrain';
import type { Creature } from './creatures';
import { fighterStats, type NightDirector } from './night';
import type { WarHost } from './war';

export interface WatchHost extends WarHost {
  dragonRaid(x: number, y: number, z: number): Creature | null;
  dragonFlee(c: Creature): void;
  raiding(c: Creature): boolean;
}

export interface WatchPost {
  site: Site;
  x: number; z: number;
  /** Feet height on the platform, facing (out from the road). */
  y: number; yaw: number;
  c: Creature | null;
  active: boolean;
  t: number;
  /** The dragon harrying this tower, the arrows that struck it and how many it takes. */
  raid: Creature | null;
  hits: number;
  need: number;
  shoutT: number;
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

const ALARM = ['EJDERHA! EJDERHA!', 'Gökyüzünde ejder var! Saklanın!', 'Ejderha kuleye geliyor!'];
const SHOOTING = ['Al bunu!', 'Bir ok daha!', 'Gel bakalım, kertenkele!', 'Kanatlarına nişan alıyorum!', 'Sıcak! Çok sıcak!', 'Kulem yanıyor!'];
const DRIVEN_OFF = ['Kaçıyor! Kaçıyor!', 'Bir daha gelme!', 'Köyümüze dokunamazsın!', 'Hah! Kuyruğunu kıstı gitti.'];
const IDLE = ['Yol sakin.', 'Uzakta bir yolcu...', 'Hava açık, her yer görünüyor.', 'Bu kulede üşüyorum.'];
const COATS = ['#3a5a8a', '#8a3a32', '#4a6a3a', '#7a5a2a'];
const TROUSERS = ['#3a3a4a', '#4a3a2e', '#2e3440'];
const HAIR = ['#2a1e16', '#4a3020', '#7a5030', '#1a1a1a', '#9a9a9a'];

export class WatchDirector {
  private posts = new Map<string, WatchPost[]>();
  private scanT = 0;
  private raidT = rand(150, 300);
  private px = 0; private pz = 0; private night = 0;

  constructor(private terrain: Terrain, private host: WatchHost, private nightDir: NightDirector) {}

  update(dt: number, px: number, pz: number, night: number): void {
    this.px = px; this.pz = pz; this.night = night;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 1; this.refresh(); }
    for (const list of this.posts.values()) for (const p of list) {
      if (p.c && (p.c.gone || p.c.dying > 0)) p.c = null;
      if (p.active && !p.c) this.spawn(p);
      p.shoutT -= dt;
      if (p.raid && !this.host.raiding(p.raid)) p.raid = null;
    }
    // Every few minutes a dragon picks on a tower near the player.
    this.raidT -= dt;
    if (this.raidT <= 0) {
      this.raidT = rand(180, 420);
      this.startRaid();
    }
  }

  private refresh(): void {
    const { px, pz } = this;
    for (const s of this.terrain.structures.sitesNear(px - 220, pz - 220, px + 220, pz + 220, 0)) {
      if (s.kind !== SITE_VILLAGE || this.posts.has(s.id)) continue;
      this.posts.set(s.id, villageLayout(this.terrain, s).towers.map((t: Spot) => ({
        site: s, x: t.x + 0.5, z: t.z + 0.5, y: t.y + TOWER_H + 1, yaw: Math.atan2(t.fx, t.fz),
        c: null, active: false, t: rand(4, 10), raid: null, hits: 0, need: 6, shoutT: 0,
      })));
    }
    for (const [id, list] of this.posts) {
      const d = Math.hypot(list[0]?.site.x - px, list[0]?.site.z - pz);
      for (const p of list) p.active = p.active ? d < 170 : d < 130;
      if (!list.length || d > 400) this.posts.delete(id);
    }
  }

  private spawn(p: WatchPost): void {
    const c = this.nightDir.spawn('bowman', p.x, p.z);
    if (!c) return;
    // Up on the platform, whatever the column top says.
    c.y = p.y; c.ground = p.y; c.col = NaN;
    c.fighter!.watch = p;
    c.yaw = p.yaw;
    const k = Math.abs(Math.floor(p.site.gx * 7 + p.site.gz * 13)) % COATS.length;
    c.tint.set(COATS[k]);
    c.tint2.set(pick(TROUSERS));
    c.tint3.set(pick(HAIR));
    c.skin = Math.random() * 0.85;
    p.c = c;
  }

  private startRaid(): void {
    const city = this.terrain.city;
    const ready = [...this.posts.values()].flat().filter((p) => p.c && p.active && !p.raid
      && Math.hypot(p.x - this.px, p.z - this.pz) < 110 && (!city || Math.hypot(p.x - city.x, p.z - city.z) > 200));
    const p = ready.length ? pick(ready) : null;
    if (!p) return;
    this.raidAt(p);
  }

  private raidAt(p: WatchPost): boolean {
    const d = this.host.dragonRaid(p.x, p.y + 1, p.z);
    if (!d) return false;
    p.raid = d; p.hits = 0; p.need = 6 + Math.floor(Math.random() * 4);
    if (p.c) {
      this.host.sound('horn', p.c);
      this.say(p.c, pick(ALARM), 3, 120);
    }
    return true;
  }

  /** Returns false when the bowman should be removed. */
  step(c: Creature, dt: number): boolean {
    const f = c.fighter!, p = f.watch!;
    if (p.c !== c || !p.active) return false;
    f.cool -= dt;
    f.flash = Math.max(0, f.flash - dt);
    c.glow = f.flash * 4;
    c.roll += (0 - c.roll) * Math.min(1, dt * 5);
    c.tail += (0 - c.tail) * Math.min(1, dt * 3);
    // Stay on the platform.
    c.x += (p.x - c.x) * Math.min(1, dt * 3); c.z += (p.z - c.z) * Math.min(1, dt * 3);
    const d = p.raid;
    if (d && this.host.raiding(d)) {
      this.face(c, Math.atan2(d.x - c.x, d.z - c.z), dt);
      c.head = -Math.atan2(d.y - c.y, Math.hypot(d.x - c.x, d.z - c.z)) * 0.6;
      const dist = Math.hypot(d.x - c.x, d.y - c.y, d.z - c.z);
      if (f.cool <= 0 && dist < 60) {
        f.cool = rand(1.3, 2.0);
        c.tail = 1.4;
        this.nightDir.shootAt(c, d.x, d.y + 1.5 * d.scale, d.z);
        // Most arrows find the beast; it flinches.
        if (Math.random() < 0.75) setTimeout(() => {
          if (!this.host.raiding(d)) return;
          for (let n = 0; n < 6; n++) this.host.fire.spark(d.x, d.y + 1.5 * d.scale, d.z, 1, 0.9, 0.6, 1, 2);
          d.roll += (Math.random() - 0.5) * 0.4;
          if (++p.hits >= p.need) {
            this.host.dragonFlee(d);
            p.raid = null;
            if (!c.gone) this.say(c, pick(DRIVEN_OFF), 3, 120);
          }
        }, dist / 22 * 1000);
      }
      if (p.shoutT <= 0) { p.shoutT = rand(5, 9); this.say(c, pick(SHOOTING), 2, 80); }
      if (this.night > 0.5) this.torch(c, dt);
      return true;
    }
    // Monsters near the village: shoot them from the tower.
    const foe = this.nightDir.nearestMonster(p.x, p.z, 26);
    if (foe) {
      this.face(c, Math.atan2(foe.x - c.x, foe.z - c.z), dt);
      if (f.cool <= 0) {
        const k = fighterStats('bowman');
        f.cool = k.cool * rand(0.9, 1.2);
        c.tail = 1.4;
        this.nightDir.cast(c, foe, 'arrow', k.dmg * rand(0.8, 1.2));
      }
    } else {
      this.face(c, p.yaw + Math.sin(performance.now() / 4000 + c.seed) * 1.2, dt);
      c.head = 0;
      p.t -= dt;
      if (p.t <= 0) { p.t = rand(40, 80); this.say(c, pick(IDLE), 2.4); }
    }
    if (this.night > 0.5) this.torch(c, dt);
    return true;
  }

  private face(c: Creature, yaw: number, dt: number): void {
    this.host.idle(c, dt);
    c.yaw += angleTo(c.yaw, yaw) * Math.min(1, dt * 5);
  }

  private torch(c: Creature, dt: number): void {
    if (Math.hypot(c.x - this.px, c.z - this.pz) > 90) return;
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
    this.host.fire.torch(c.x + 0.48 * co + 0.3 * s, c.y + 1.55 * c.scale, c.z - 0.48 * s + 0.3 * co, dt);
  }

  private say(c: Creature, text: string, sec: number, r = 40): void {
    if (Math.hypot(c.x - this.px, c.z - this.pz) < r) this.host.say(c, text, sec);
  }

  // ------------------------------------------------------------ dev

  /** Dev: a dragon raid on the nearest manned tower now. */
  devRaid(): string {
    let best: WatchPost | null = null, bd = Infinity;
    for (const p of [...this.posts.values()].flat()) {
      const dd = Math.hypot(p.x - this.px, p.z - this.pz);
      if (p.c && dd < bd) { bd = dd; best = p; }
    }
    if (!best) return 'no manned tower near';
    return this.raidAt(best) ? `raid on ${best.site.name} tower at ${Math.round(best.x)},${Math.round(best.y)},${Math.round(best.z)}` : 'no dragon free';
  }

  info(): string {
    const all = [...this.posts.values()].flat().filter((p) => p.active);
    return all.map((p) => `${p.site.name}@${Math.round(p.x)},${Math.round(p.z)} ${p.c ? 'nöbetçi' : 'boş'}${p.raid ? ` BASKIN isabet=${p.hits}/${p.need}` : ''}`).join(' | ') || 'no tower active';
  }
}
