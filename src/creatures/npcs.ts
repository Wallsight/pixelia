// People of the villages and the city. Residents live in the houses of the
// settlement layout and follow a simple day: chatting on the square, buying at
// the stalls, working the fields, visiting neighbours; children play tag,
// guards patrol with lanterns, travellers walk the roads. They talk to each
// other (speech bubbles, overheard by the player) and gossip about places worth
// finding. Nobody reacts to the player.

import * as THREE from 'three';
import { hash01 } from '../engine/noise';
import { LM, SITE_CASTLE, SITE_CITY, SITE_ORC, SITE_VILLAGE, pointAlong, polylineLength, type Site } from '../world/structures';
import { castleHouse } from '../world/castle';
import { villageLayout, type House, type Layout, type Spot } from '../world/village';
import type { Terrain } from '../world/terrain';
import type { Creature } from './creatures';

export type Role = 'villager' | 'farmer' | 'merchant' | 'elder' | 'guard' | 'kid' | 'traveler' | 'bard' | 'crier';
type Task = 'idle' | 'walk' | 'chat' | 'work' | 'sell' | 'buy' | 'visit' | 'play' | 'patrol' | 'travel' | 'home' | 'perform' | 'listen' | 'announce' | 'fight';

export interface NpcState {
  role: Role;
  town: Town | null;
  res: Resident | null;
  route: number[];
  ri: number;
  task: Task;
  /** What to do once the route is walked. */
  next: Task;
  t: number;
  partner: Creature | null;
  /** Talk turn bookkeeping. */
  lines: string[];
  li: number;
  stall: Spot | null;
  stuck: number;
  remove: boolean;
  /** Stays out after dark (guards, a few chatty neighbours). */
  owl: boolean;
  /** Discovery id of the place the current gossip is about. */
  rumor?: string | null;
  /** Travellers: road polyline, distance, direction. */
  road: Float32Array | null;
  s: number;
  dir: number;
}

interface Resident {
  role: Role;
  home: House | null;
  seed: number;
  creature: Creature | null;
  asleep: boolean;
  wake: number;
  stall: Spot | null;
}

interface Gossip { text: string; id: string | null }
interface Town { site: Site; L: Layout; residents: Resident[]; ring: number; junctions: Array<{ ringS: number; street: number; s: number }>; active: boolean; gossip: Gossip[] }

export interface NpcHost {
  spawnNpc(role: Role, x: number, z: number, seed: number): Creature | null;
  walkToward(c: Creature, tx: number, tz: number, speed: number, dt: number): 'moving' | 'arrived' | 'blocked';
  idle(c: Creature, dt: number): void;
  allNpcs(): Creature[];
  /** Guards strike raiding monsters. */
  hit(target: Creature, dmg: number, from: Creature): void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** NpcState.li value marking the listening half of a conversation. */
const LISTENER = -99;
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

// ------------------------------------------------------------------ talk

const CHAT: string[][] = [
  ['Dün gece ejderhayı gördün mü?', 'Gördüm! Tepenin üstüne kondu.', 'Kuzularımı saklasam iyi olacak.'],
  ['Hasat bu yıl bereketli.', 'Değirmenci de öyle diyor.', 'Kışa hazırız desene!'],
  ['Hanın aşçısı yeni çorba yapmış.', 'Mercimekli mi?', 'Ejder biberli, dilini yakar!'],
  ['Yağmur yağacak gibi.', 'Bulutlar mor mor, hayra alamet değil.', 'Bence sadece yağmur.'],
  ['Demirci yine sabaha kadar çalıştı.', 'Kılıç mı dövüyormuş?', 'Nal! Atlar da şık olmak ister.'],
  ['Çocuklar meydanda yine koşturuyor.', 'Bırak koşsunlar, gün güzel.', 'Biz de böyleydik.'],
  ['Pazarda baharat fiyatları uçmuş.', 'Kervan gecikmiş diyorlar.', 'Yollarda ejderha var ya...'],
];
const SELL: string[][] = [
  ['Bu elmalar kaça?', 'Sana özel iki akçe!', 'Al bakalım, tatlı olsun.'],
  ['Taze ekmek var mı?', 'Fırından yeni çıktı.', 'Kokusu sokağa yayılmış!'],
  ['Şu kumaş ne güzel...', 'Doğudan geldi, ipek karışık.', 'Annem bayılır buna.'],
  ['Bir avuç kuru üzüm.', 'Bir avuç da benden hediye.', 'Eksik olma!'],
];
const CALLS = ['Taze ekmek, sıcak ekmek!', 'Kumaşlar, baharatlar!', 'Elmalar tatlı, armutlar ballı!', 'Gel vatandaş, gel!', 'Bugün indirim var!'];
const KIDS = ['Ebe sensin!', 'Yakalayamazsın!', 'Hahaha!', 'Bekle beni!', 'Sobe!'];
const GUARD = ['Her şey yolunda.', 'Gözüm üstünüzde.', 'Ejderha görünürse çanı çalın!'];
const GUARD_FIGHT = ['Geri çekil, yaratık!', 'Köyümüze giremezsin!', 'Herkes evine!'];
const FLEE = ['İmdat!', 'Canavar!', 'Eve, çabuk!'];
const SONGS: string[][] = [
  ['♪ Dağlardan indi kanatlı ejder ♪', '♫ Külkent\'in çanı çaldı derinden ♫', '♪ Kahraman yok, ama çorba sıcak! ♪'],
  ['♪ Kara kulede bir göz uyanmış ♪', '♫ Bakma ona, sakın bakma ♫', '♪ Sen yürü, yolun açık olsun ♪'],
  ['♫ Hanın ateşi, dostun sesi ♫', '♪ Bir türkü daha, bir kadeh daha ♪', '♫ Yarın yine yollardayız ♫'],
  ['♪ Taşa saplı ışıktan kılıç ♪', '♫ Çeken olmadı, çekecek kim? ♫', '♪ Belki sen, ey yolcu, belki sen ♪'],
];
const APPLAUSE = ['Bravo!', 'Bir daha!', 'Çok güzel!', 'Yaşa ozan!', '*alkış*'];
const CRIES = [
  ['Duyduk duymadık demeyin!', 'Pazar bugün meydanda kurulmuştur!'],
  ['Duyduk duymadık demeyin!', 'Ejderha görenler belediyeye bildirsin!'],
  ['Ahali, kulak verin!', 'Hasat şenliği bu akşam handa!'],
  ['Ahali, kulak verin!', 'Kayıp bir keçi aranmaktadır, adı Pamuk!'],
];

const LM_HINT: Record<number, string> = {
  [LM.GRAVEYARD]: 'eski bir mezarlık', [LM.PLATFORM]: 'duvara açılan gizli bir peron', [LM.WILLOW]: 'dalları kımıldayan bir söğüt',
  [LM.VAULT]: 'yere gömülü dev bir çelik kapı', [LM.SANDWORM]: 'devasa bir kum kurdunun iskeleti', [LM.MOISTURE_FARM]: 'çölde havadan su toplayan bir çiftlik',
  [LM.SABER_STONE]: 'taşa saplanmış ışıktan bir kılıç', [LM.CHAPEL]: 'terk edilmiş bir şapel', [LM.PENTAGRAM]: 'lavla çizilmiş bir şeytan yıldızı',
  [LM.MURLOC_HUTS]: 'kıyıda tuhaf sesler çıkaran kulübeler', [LM.PEON_CAMP]: 'işten bıkmış oduncuların kampı', [LM.DARK_TOWER]: 'ateşten bir gözü olan kara bir kule',
  [LM.MONOLITH]: 'kapkara, kusursuz bir anıt taş', [LM.HOBBIT_HOLE]: 'tepeye oyulmuş yuvarlak kapılı bir ev', [LM.PHONE_BOX]: 'içi dışından büyük mavi bir kulübe',
  [LM.SUNKEN_TEMPLE]: 'kara suların içinde, uyuyan bir şeyin yattığı batık bir tapınak',
  [LM.DRAGON_LAIR]: 'altın yığınının üstünde uyuyan, bir köy büyüklüğünde yaşlı bir ejder',
};

function direction(dx: number, dz: number): string {
  const names = ['doğuda', 'güneydoğuda', 'güneyde', 'güneybatıda', 'batıda', 'kuzeybatıda', 'kuzeyde', 'kuzeydoğuda'];
  const a = Math.atan2(dz, dx); // +z is south on the map
  return names[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}

function gossipFor(t: Terrain, site: Site): Gossip[] {
  const out: Gossip[] = [];
  const R = 1400;
  const lms = t.landmarks.near(site.x - R, site.z - R, site.x + R, site.z + R, 0)
    .sort((a, b) => Math.hypot(a.x - site.x, a.z - site.z) - Math.hypot(b.x - site.x, b.z - site.z));
  const seen = new Set<number>();
  for (const lm of lms) {
    if (seen.has(lm.kind) || out.length >= 6 || lm.kind === LM.DRAGON_LAIR) continue;
    seen.add(lm.kind);
    const d = Math.hypot(lm.x - site.x, lm.z - site.z);
    out.push({ text: `${direction(lm.x - site.x, lm.z - site.z)}, ${Math.round(d / 50) * 50} adım ötede ${LM_HINT[lm.kind]} varmış.`, id: `l:${lm.id}` });
  }
  if (t.tower) {
    const d = Math.hypot(t.tower.x - site.x, t.tower.z - site.z);
    const tl = t.landmarks.near(t.tower.x, t.tower.z, t.tower.x, t.tower.z, 1)[0];
    out.push({ text: `Çok uzaklarda, ${direction(t.tower.x - site.x, t.tower.z - site.z)}, ${Math.round(d / 100) * 100} adım ötede kara bir kule yükselirmiş.`, id: tl ? `l:${tl.id}` : null });
  }
  // The nearest garrisoned castle and its house.
  const keep = t.structures.sitesNear(site.x - 900, site.z - 900, site.x + 900, site.z + 900, 0)
    .filter((s) => s.kind === SITE_CASTLE && s.held)
    .sort((a, b) => Math.hypot(a.x - site.x, a.z - site.z) - Math.hypot(b.x - site.x, b.z - site.z))[0];
  if (keep) {
    const d = Math.hypot(keep.x - site.x, keep.z - site.z);
    out.push({ text: `${direction(keep.x - site.x, keep.z - site.z)}, ${Math.round(d / 50) * 50} adım ötede ${keep.name} var. ${castleHouse(keep, t.seed).name} askerleri her sabah talim yaparmış.`, id: `s:${keep.id}` });
  }
  // The orc capital is a legend everywhere; a nearby camp is talked about too.
  const cap = t.structures.capital();
  if (cap) {
    const [gx, gz, x, z] = cap, d = Math.hypot(x - site.x, z - site.z);
    const orda = t.structures.site(gx, gz);
    if (orda) out.push({ text: `${direction(x - site.x, z - site.z)}, kurak topraklarda, ${Math.round(d / 100) * 100} adım ötede ${orda.name} varmış: orkların başkenti. Geceleri savaş davulları duyulurmuş.`, id: `s:${orda.id}` });
  }
  const oba = t.structures.sitesNear(site.x - 700, site.z - 700, site.x + 700, site.z + 700, 0)
    .filter((s) => s.kind === SITE_ORC && !s.capital)
    .sort((a, b) => Math.hypot(a.x - site.x, a.z - site.z) - Math.hypot(b.x - site.x, b.z - site.z))[0];
  if (oba) {
    const d = Math.hypot(oba.x - site.x, oba.z - site.z);
    out.push({ text: `${direction(oba.x - site.x, oba.z - site.z)}, ${Math.round(d / 50) * 50} adım ötede bir ork obası var: ${oba.name}. Kurtları varmış, yaklaşma.`, id: `s:${oba.id}` });
  }
  // Everyone has heard of the great dragon.
  const lair = t.landmarks.lair();
  if (lair) {
    const d = Math.hypot(lair.x - site.x, lair.z - site.z);
    out.push({ text: `${direction(lair.x - site.x, lair.z - site.z)}, ${Math.round(d / 50) * 50} adım ötede Közhan uyurmuş: köy kadar büyük, yaşlı bir ejder. Konuşurmuş bile!`, id: `l:${lair.gx},${lair.gz}` });
  }
  return out;
}
const GOSSIP_REPLIES = ['Gerçekten mi? Bir gün gidip bakmalı.', 'Dedem de anlatırdı, inanmazdım.', 'Oraya gidenin aklı başından gidermiş!', 'Haritama işaretleyeyim.'];

// ------------------------------------------------------------------ bubbles

class Bubbles {
  readonly group = new THREE.Group();
  private cache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();
  private live = new Map<Creature, { sprite: THREE.Sprite; t: number }>();
  /** Fired for every line spoken (the soundscape gives it a voice). */
  onSay: ((c: Creature, text: string) => void) | null = null;

  private texture(text: string): { tex: THREE.CanvasTexture; aspect: number } {
    let hit = this.cache.get(text);
    if (hit) return hit;
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    const font = 'bold 30px "Cascadia Mono", Consolas, monospace';
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 36, h = 64;
    c.width = w; c.height = h + 14;
    g.font = font;
    g.fillStyle = 'rgba(255,250,240,0.95)';
    g.strokeStyle = '#2b1d33';
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(2, 2, w - 4, h - 4, 16);
    g.fill(); g.stroke();
    g.beginPath();
    g.moveTo(w / 2 - 10, h - 3); g.lineTo(w / 2, h + 12); g.lineTo(w / 2 + 10, h - 3);
    g.fill();
    g.beginPath(); g.moveTo(w / 2 - 10, h - 2); g.lineTo(w / 2, h + 12); g.lineTo(w / 2 + 10, h - 2); g.stroke();
    g.fillStyle = '#2b1d33';
    g.textBaseline = 'middle';
    g.fillText(text, 18, h / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    hit = { tex, aspect: c.width / c.height };
    if (this.cache.size > 80) {
      const [k, v] = this.cache.entries().next().value!;
      v.tex.dispose();
      this.cache.delete(k);
    }
    this.cache.set(text, hit);
    return hit;
  }

  say(c: Creature, text: string, sec = 3.2): void {
    this.clear(c);
    const { tex, aspect } = this.texture(text);
    // Drawn over everything (only within talking distance), so a passer-by never hides it.
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false, transparent: true, fog: false }));
    sprite.renderOrder = 10;
    const h = 0.55;
    sprite.scale.set(h * aspect, h, 1);
    this.group.add(sprite);
    this.live.set(c, { sprite, t: sec });
    this.onSay?.(c, text);
  }

  clear(c: Creature): void {
    const b = this.live.get(c);
    if (!b) return;
    this.group.remove(b.sprite);
    b.sprite.material.dispose();
    this.live.delete(c);
  }

  update(dt: number, cam: THREE.Vector3): void {
    for (const [c, b] of this.live) {
      b.t -= dt;
      const d = Math.hypot(c.x - cam.x, c.z - cam.z);
      if (b.t <= 0 || c.npc?.remove || c.gone) { this.clear(c); continue; }
      b.sprite.visible = d < (c.npc ? 24 : 50);
      b.sprite.position.set(c.x, c.y + (c.npc ? 2.25 : 6.8) * c.scale + 0.1, c.z);
      b.sprite.material.opacity = Math.min(1, b.t * 2);
    }
  }
}

// ------------------------------------------------------------------ director

export class NpcDirector {
  private towns = new Map<string, Town>();
  private scan = 0;
  private travelTimer = 2;
  readonly bubbles = new Bubbles();
  private player = new THREE.Vector3();
  /** Called when the player overhears gossip about a place (its discovery id). */
  onRumor: ((id: string) => void) | null = null;
  /** Live news for the town crier (e.g. how many legends the traveller has found). */
  news: (() => string | null) | null = null;

  constructor(private terrain: Terrain, private host: NpcHost) {}

  get group(): THREE.Group { return this.bubbles.group; }

  /** A raiding monster is near: guards close in to fight it, everyone else hurries home. */
  alarm(raider: Creature): void {
    for (const c of this.host.allNpcs()) {
      const n = c.npc;
      if (!n || !n.town || n.remove) continue;
      const d = Math.hypot(c.x - raider.x, c.z - raider.z);
      if (d > 30) continue;
      if (n.role === 'guard') {
        if (n.task === 'fight' && n.partner && !n.partner.gone && n.partner.dying === 0) continue;
        if (n.partner && n.partner.npc) this.endTalk(c);
        n.task = 'fight'; n.partner = raider; n.t = 0; n.route = [];
        if (this.near(c)) this.bubbles.say(c, pick(GUARD_FIGHT), 2.4);
      } else if (n.task !== 'home' && !(n.task === 'walk' && n.next === 'home')) {
        if (this.near(c) && Math.random() < 0.4) this.bubbles.say(c, pick(FLEE), 1.8);
        this.goHome(c);
      }
    }
  }

  update(dt: number, px: number, pz: number, night: number, cam: THREE.Vector3): void {
    this.player.set(px, 0, pz);
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 1;
      this.refreshTowns(px, pz);
    }
    for (const town of this.towns.values()) if (town.active) this.populate(town, night, dt);
    this.travelTimer -= dt;
    if (this.travelTimer <= 0) { this.travelTimer = 4; if (night < 0.5) this.spawnTraveler(px, pz); }
    this.bubbles.update(dt, cam);
  }

  private refreshTowns(px: number, pz: number): void {
    const near = this.terrain.structures.sitesNear(px - 220, pz - 220, px + 220, pz + 220, 0)
      .filter((s) => s.kind === SITE_VILLAGE || s.kind === SITE_CITY);
    for (const s of near) {
      if (!this.towns.has(s.id)) this.towns.set(s.id, this.makeTown(s));
    }
    for (const [id, town] of this.towns) {
      const d = Math.hypot(town.site.x - px, town.site.z - pz);
      const wasActive = town.active;
      town.active = d < (town.L.city ? 200 : 150);
      if (!town.active && wasActive) {
        for (const r of town.residents) { if (r.creature?.npc) r.creature.npc.remove = true; r.creature = null; }
      }
      if (d > 400) this.towns.delete(id);
    }
  }

  private makeTown(site: Site): Town {
    const L = villageLayout(this.terrain, site);
    const seed = this.terrain.seed;
    const residents: Resident[] = [];
    const add = (role: Role, home: House | null, k: number, stall: Spot | null = null) =>
      residents.push({ role, home, seed: hash01(site.gx * 7 + k, 3100, site.gz, seed) * 1e6, creature: null, asleep: false, wake: 0, stall });
    let k = 0;
    // Merchants at the stalls and in front of the shops, and the guards, come first.
    for (const st of L.stalls) add('merchant', pick(L.houses) ?? null, k++, st);
    for (const h of L.houses) {
      if (h.kind === 'shop' || h.kind === 'bakery' || h.kind === 'smithy') {
        add('merchant', h, k++, { x: h.doorX + h.fx - h.fz, z: h.doorZ + h.fz + h.fx, y: h.y, fx: h.fx, fz: h.fz });
      }
    }
    // Villages keep a pair of guards (the bowmen on the watch towers belong to the watch director).
    for (let i = 0; i < (L.city ? 6 : 2); i++) add('guard', null, k++);
    // The city has a bard on the square and a town crier.
    if (L.city) { add('bard', pick(L.houses) ?? null, k++); add('crier', pick(L.houses) ?? null, k++); }
    for (const h of L.houses) {
      if (h.kind === 'hall') continue;
      const n = h.kind === 'tall' || h.kind === 'inn' ? 2 : 1 + (hash01(h.cx, 3101, h.cz, seed) < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const r = hash01(h.cx + i, 3102, h.cz, seed);
        const role: Role = L.fields.length && r < 0.3 ? 'farmer' : r < 0.42 ? 'elder' : r < 0.6 ? 'kid' : 'villager';
        add(role, h, k++);
      }
    }
    // Cap the crowd.
    residents.splice(L.city ? 86 : 24);
    // Ring junctions (city): where the spokes cross the ring street.
    const ring = L.city ? L.streets.length - 1 : -1;
    const junctions: Town['junctions'] = [];
    if (ring >= 0) {
      const rp = L.streets[ring].pts;
      L.streets.forEach((st, si) => {
        if (si === ring) return;
        let best = 1e9, bs = 0;
        for (let s = 0; s < st.len; s += 1) {
          const [x, z] = pointAlong(st.pts, s);
          const d = Math.abs(Math.hypot(x - site.x, z - site.z) - 42);
          if (d < best) { best = d; bs = s; }
        }
        if (best > 6) return;
        const [jx, jz] = pointAlong(st.pts, bs);
        junctions.push({ ringS: nearestS(rp, jx, jz), street: si, s: bs });
      });
    }
    return { site, L, residents, ring, junctions, active: false, gossip: gossipFor(this.terrain, site) };
  }

  /** Wake, spawn and send home the residents of an active town. */
  private populate(town: Town, night: number, dt: number): void {
    const evening = night > 0.55, morning = night < 0.3;
    for (const r of town.residents) {
      if (r.creature && r.creature.npc?.remove) r.creature = null;
      const nightOwl = r.role === 'guard' || (r.role === 'villager' && Math.floor(r.seed) % 7 === 0);
      if (!r.creature) {
        if (r.asleep && morning) { r.wake -= dt; if (r.wake > 0) continue; r.asleep = false; }
        if (r.asleep || (evening && !nightOwl)) { r.asleep = true; r.wake = rand(0, 25); continue; }
        // Spawn: at home if the player is close (they step out), else somewhere on their way.
        const d = Math.hypot(town.site.x - this.player.x, town.site.z - this.player.z);
        let x: number, z: number;
        // The bard is already playing on the square when the player arrives.
        if (r.role === 'bard' && town.L.stage) { x = town.L.stage.x; z = town.L.stage.z; }
        else if (r.home && d < 60) { x = r.home.doorX + 0.5; z = r.home.doorZ + 0.5; }
        else {
          const st = pick(town.L.streets);
          const [sx, sz] = pointAlong(st.pts, rand(town.L.plazaR, Math.min(st.len, town.L.radius - 6)));
          x = sx + rand(-1, 1); z = sz + rand(-1, 1);
        }
        const c = this.host.spawnNpc(r.role, x, z, r.seed);
        if (!c) continue;
        c.npc = {
          role: r.role, town, res: r, route: [], ri: 0, task: 'idle', next: 'idle', t: rand(0.5, 3),
          partner: null, lines: [], li: 0, stall: r.stall, stuck: 0, remove: false, road: null, s: 0, dir: 1, owl: nightOwl,
        };
        r.creature = c;
      } else if (evening && !nightOwl && r.creature.npc && r.creature.npc.task !== 'home') {
        this.goHome(r.creature);
      }
    }
  }

  // ------------------------------------------------------------ travellers

  private spawnTraveler(px: number, pz: number): void {
    const host = this.host;
    if (host.allNpcs().filter((c) => c.npc?.role === 'traveler').length >= 4) return;
    const roads = this.terrain.structures.roadsNear(px - 90, pz - 90, px + 90, pz + 90, 0);
    if (!roads.length) return;
    const road = pick(roads);
    const len = polylineLength(road.pts);
    const s = rand(20, len - 20);
    const [x, z] = pointAlong(road.pts, s);
    const d = Math.hypot(x - px, z - pz);
    if (d < 35 || d > 95) return;
    if ([road.a, road.b].some((site) => Math.hypot(site.x - x, site.z - z) < (site.kind === SITE_CITY ? 100 : 55))) return;
    const c = host.spawnNpc('traveler', x, z, Math.random() * 1e6);
    if (!c) return;
    c.npc = {
      role: 'traveler', town: null, res: null, route: [], ri: 0, task: 'travel', next: 'travel', t: 0,
      partner: null, lines: [], li: 0, stall: null, stuck: 0, remove: false, road: road.pts, s, dir: Math.random() < 0.5 ? 1 : -1, owl: false,
    };
  }

  // ------------------------------------------------------------ routes

  /** Anchor of a point: its street and distance along it (street -1 = the square). */
  private anchor(town: Town, x: number, z: number): { street: number; s: number } {
    const L = town.L;
    if (Math.hypot(x - L.site.x, z - L.site.z) < L.plazaR + 1) return { street: -1, s: 0 };
    let best = 1e9, street = -1, s = 0;
    L.streets.forEach((st, i) => {
      const [d, ss] = distS(st.pts, x, z);
      if (d < best) { best = d; street = i; s = ss; }
    });
    return { street, s };
  }

  /** Waypoints (flat x,z pairs) from (ax, az) to (bx, bz) along the streets and round the square. */
  private routeTo(town: Town, ax: number, az: number, bx: number, bz: number): number[] {
    const L = town.L;
    const A = this.anchor(town, ax, az), Bn = this.anchor(town, bx, bz);
    const out: number[] = [];
    const along = (si: number, s0: number, s1: number) => {
      const st = L.streets[si];
      const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / 3));
      for (let i = 0; i <= n; i++) {
        const [x, z] = pointAlong(st.pts, s0 + ((s1 - s0) * i) / n);
        out.push(x, z);
      }
    };
    /** From an anchor to the square edge: returns the angle where it arrives. */
    const toSquare = (an: { street: number; s: number }, reverse: boolean): number => {
      if (an.street === -1) return NaN;
      const segs: Array<[number, number, number]> = [];
      let si = an.street, s = an.s;
      if (si === town.ring) {
        // Walk the ring to the nearest spoke junction first.
        let bj = town.junctions[0], bd = 1e9;
        for (const j of town.junctions) { const d = Math.abs(j.ringS - s); if (d < bd) { bd = d; bj = j; } }
        if (!bj) return NaN;
        segs.push([si, s, bj.ringS]);
        si = bj.street; s = bj.s;
      }
      segs.push([si, s, L.plazaR + 0.5]);
      if (reverse) for (const [a, b, c] of segs.reverse()) along(a, c, b);
      else for (const [a, b, c] of segs) along(a, b, c);
      const [ex, ez] = pointAlong(L.streets[si].pts, L.plazaR + 0.5);
      return Math.atan2(ez - L.site.z, ex - L.site.x);
    };
    out.push(ax, az);
    const sameStreet = A.street >= 0 && A.street === Bn.street && A.street !== town.ring;
    if (sameStreet) along(A.street, A.s, Bn.s);
    else {
      const a0 = toSquare(A, false);
      // Round the square at a safe radius (fountain, well and stalls stay clear).
      const r = L.city ? L.plazaR - 5.5 : 3.6;
      const angB = this.squareAngle(town, Bn);
      const angA = Number.isNaN(a0) ? Math.atan2(az - L.site.z, ax - L.site.x) : a0;
      const angEnd = Number.isNaN(angB) ? Math.atan2(bz - L.site.z, bx - L.site.x) : angB;
      let da = angEnd - angA;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const steps = Math.max(1, Math.ceil(Math.abs(da) / 0.4));
      for (let i = 0; i <= steps; i++) {
        const a = angA + (da * i) / steps;
        out.push(L.site.x + Math.cos(a) * r, L.site.z + Math.sin(a) * r);
      }
      toSquare(Bn, true);
    }
    out.push(bx, bz);
    return out;
  }

  private squareAngle(town: Town, an: { street: number; s: number }): number {
    const L = town.L;
    if (an.street === -1) return NaN;
    let si = an.street;
    if (si === town.ring) {
      let bj = town.junctions[0], bd = 1e9;
      for (const j of town.junctions) { const d = Math.abs(j.ringS - an.s); if (d < bd) { bd = d; bj = j; } }
      if (!bj) return NaN;
      si = bj.street;
    }
    const [ex, ez] = pointAlong(L.streets[si].pts, L.plazaR + 0.5);
    return Math.atan2(ez - L.site.z, ex - L.site.x);
  }

  private go(c: Creature, x: number, z: number, then: Task): void {
    const n = c.npc!;
    n.route = n.town ? this.routeTo(n.town, c.x, c.z, x, z) : [c.x, c.z, x, z];
    n.ri = 0;
    n.task = 'walk';
    n.next = then;
    n.stuck = 0;
  }

  private goHome(c: Creature): void {
    const n = c.npc!;
    if (n.partner) this.endTalk(c);
    const home = n.res?.home;
    if (!home) { n.remove = true; return; }
    this.go(c, home.doorX + 0.5, home.doorZ + 0.5, 'home');
  }

  // ------------------------------------------------------------ behaviour

  step(c: Creature, dt: number, night: number): boolean {
    const n = c.npc;
    if (!n) return false;
    if (n.remove) return false;
    const speed = n.role === 'kid' ? 2.9 : n.role === 'elder' ? 0.9 : n.role === 'guard' ? 1.1 : 1.35;
    // Arms rest by default; tasks below animate them.
    c.tail += (0 - c.tail) * Math.min(1, dt * 4);
    c.glow = n.role === 'guard' ? night * 0.6 : 0;

    switch (n.task) {
      case 'walk': {
        if (n.ri * 2 >= n.route.length) { n.task = n.next; n.t = 0; this.arrive(c); return true; }
        const tx = n.route[n.ri * 2], tz = n.route[n.ri * 2 + 1];
        const r = this.host.walkToward(c, tx, tz, speed, dt);
        if (r === 'arrived') n.ri++;
        else if (r === 'blocked') {
          n.stuck += dt;
          if (n.stuck > 2.5) { n.ri++; n.stuck = 0; }
        } else n.stuck = Math.max(0, n.stuck - dt);
        this.armsWalk(c);
        return true;
      }
      case 'travel': {
        const pts = n.road!, len = polylineLength(pts);
        n.s += n.dir * dt * 1.4;
        if (n.s < 2 || n.s > len - 2) { n.remove = true; return false; }
        const [x, z, dx, dz] = pointAlong(pts, n.s + n.dir * 2);
        // Keep to the right-hand side of the road.
        const side = n.dir;
        this.host.walkToward(c, x - dz * side * 0.9, z + dx * side * 0.9, 1.4, dt);
        this.armsWalk(c);
        return true;
      }
      case 'home':
        n.remove = true;
        if (n.res) { n.res.asleep = true; n.res.wake = rand(0, 25); }
        return false;
      case 'chat': return this.chat(c, dt);
      case 'buy': return this.buy(c, dt);
      case 'sell': return this.sell(c, dt);
      case 'work': {
        this.host.idle(c, dt);
        n.t -= dt;
        c.head += (0.75 - c.head) * Math.min(1, dt * 3);
        c.flap += dt * 4; c.flapAmp = 0.9; c.tail = 0.5;
        if (n.t <= 0) this.plan(c, night);
        return true;
      }
      case 'visit': {
        this.host.idle(c, dt);
        n.t -= dt;
        // Knock, knock.
        c.tail = n.t > 2 ? 0.9 + Math.sin(n.t * 18) * 0.2 : 0;
        if (n.t <= 0) this.plan(c, night);
        return true;
      }
      case 'play': return this.play(c, dt, night);
      case 'perform': return this.perform(c, dt, night);
      case 'listen': return this.listen(c, dt, night);
      case 'announce': return this.announce(c, dt, night);
      case 'fight': {
        const foe = n.partner;
        if (!foe || foe.gone || foe.dying > 0) { n.partner = null; this.plan(c, night); return true; }
        const d = Math.hypot(foe.x - c.x, foe.z - c.z);
        if (d > 40) { n.partner = null; this.plan(c, night); return true; }
        if (d > 1.7) { this.host.walkToward(c, foe.x, foe.z, 2.2, dt); this.armsWalk(c); return true; }
        this.host.idle(c, dt);
        this.face(c, foe, dt);
        n.t -= dt;
        if (n.t <= 0) { n.t = rand(1, 1.4); c.tail = 1.2; this.host.hit(foe, 2.5, c); }
        return true;
      }
      case 'patrol': {
        if (Math.random() < dt * 0.02 && this.near(c)) this.bubbles.say(c, pick(GUARD));
        this.plan(c, night);
        return true;
      }
      default: {
        this.host.idle(c, dt);
        c.head += (Math.sin(Date.now() * 0.0007 + c.seed) * 0.15 - c.head) * Math.min(1, dt * 2);
        n.t -= dt;
        if (n.t <= 0) this.plan(c, night);
        return true;
      }
    }
  }

  private near(c: Creature): boolean {
    return Math.hypot(c.x - this.player.x, c.z - this.player.z) < 24;
  }

  private armsWalk(c: Creature): void {
    c.flap = c.walk; c.flapAmp = c.walkAmp * 0.9;
  }

  /** Called when a route ends: set up the task that follows. */
  private arrive(c: Creature): void {
    const n = c.npc!;
    switch (n.task) {
      case 'chat': n.t = rand(8, 14); break;
      case 'work': n.t = rand(15, 30); break;
      case 'visit': n.t = 5; break;
      case 'sell': n.t = rand(60, 140); break;
      case 'buy': n.t = 11; n.lines = []; break;
      case 'idle': n.t = rand(2, 6); break;
      case 'play': n.t = rand(20, 40); break;
      case 'perform': n.t = rand(45, 75); n.lines = pick(SONGS).slice(); n.li = -1; n.s = 0; break;
      case 'listen': n.t = rand(20, 40); break;
      case 'announce': {
        n.lines = pick(CRIES).slice();
        const news = this.news?.();
        if (news) n.lines[1] = news;
        n.li = -1; n.s = 0; n.t = 4 + n.lines.length * 3;
        break;
      }
    }
  }

  /** Choose the next activity. */
  private plan(c: Creature, night: number): void {
    const n = c.npc!;
    const town = n.town;
    if (!town) { n.task = 'travel'; return; }
    const L = town.L;
    if (night > 0.55 && !n.owl) { this.goHome(c); return; }
    const sq = () => {
      const a = Math.random() * Math.PI * 2, r = L.city ? rand(L.plazaR - 5, L.plazaR - 1.5) : rand(3.4, L.plazaR + 1);
      return [L.site.x + Math.cos(a) * r, L.site.z + Math.sin(a) * r];
    };
    const r = Math.random();
    switch (n.role) {
      case 'guard': {
        // Next stop on a long loop: a point on some street, far from here.
        const st = pick(L.streets);
        const [x, z] = pointAlong(st.pts, rand(L.plazaR + 2, Math.min(st.len, L.radius - 4)));
        this.go(c, x, z, 'idle');
        return;
      }
      case 'merchant':
        if (n.stall) { const s = n.stall; this.go(c, s.x + 0.5 - s.fx * 1, s.z + 0.5 - s.fz * 1, 'sell'); return; }
        break;
      case 'kid': { const [x, z] = sq(); this.go(c, x, z, 'play'); return; }
      case 'bard':
        if (L.stage) { this.go(c, L.stage.x, L.stage.z, 'perform'); return; }
        break;
      case 'crier': {
        // Square edge or a busy street corner, then shout the news.
        const st = pick(L.streets);
        const [x, z] = r < 0.5 ? sq() : pointAlong(st.pts, rand(L.plazaR + 3, Math.min(st.len, 40)));
        this.go(c, x, z, 'announce');
        return;
      }
      case 'farmer':
        if (L.fields.length && r < 0.75) {
          const f = pick(L.fields);
          this.go(c, f.cx + 0.5 + Math.round(rand(-f.hw, f.hw)), f.cz + 0.5 + (Math.random() < 0.5 ? 1 : -1) * Math.round(rand(1, f.hd)), 'work');
          return;
        }
        break;
    }
    // Gather round the bard while a song is on.
    const bard = this.host.allNpcs().find((o) => o.npc?.task === 'perform' && o.npc.town === town);
    if (bard && r < 0.22 && n.role !== 'merchant') {
      const s = L.stage!;
      const a = Math.atan2(s.fz, s.fx) + rand(-0.9, 0.9), d = rand(2.2, 3.6);
      this.go(c, s.x + Math.cos(a) * d, s.z + Math.sin(a) * d, 'listen');
      return;
    }
    if (r < 0.4) { const [x, z] = sq(); this.go(c, x, z, 'chat'); return; }
    const shops = town.residents.filter((o) => o.role === 'merchant' && o.stall).map((o) => o.stall!);
    if (r < 0.62 && shops.length) {
      const s = pick(shops);
      n.stall = s;
      this.go(c, s.x + 0.5 + s.fx * 1.4, s.z + 0.5 + s.fz * 1.4, 'buy');
      return;
    }
    if (r < 0.8 && L.houses.length) {
      const h = pick(L.houses);
      this.go(c, h.doorX + 0.5 + h.fx, h.doorZ + 0.5 + h.fz, 'visit');
      return;
    }
    const st = pick(L.streets);
    const [x, z] = pointAlong(st.pts, rand(L.plazaR + 2, Math.min(st.len, L.radius - 4)));
    this.go(c, x, z, 'idle');
  }

  // ------------------------------------------------------------ interactions

  private face(c: Creature, o: { x: number; z: number }, dt: number): void {
    const want = Math.atan2(o.x - c.x, o.z - c.z);
    let d = (want - c.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    c.yaw += d * Math.min(1, dt * 5);
  }

  private endTalk(c: Creature): void {
    const p = c.npc!.partner;
    c.npc!.partner = null;
    if (p?.npc && p.npc.partner === c) { p.npc.partner = null; p.npc.t = Math.min(p.npc.t, 1); }
  }

  /** Two people on the square find each other and talk a few lines. */
  private chat(c: Creature, dt: number): boolean {
    const n = c.npc!;
    n.t -= dt;
    this.host.idle(c, dt);
    if (!n.partner) {
      // Look for someone else waiting to chat nearby; this one leads the talk.
      for (const o of this.host.allNpcs()) {
        if (o === c || !o.npc || o.npc.task !== 'chat' || o.npc.partner || Math.hypot(o.x - c.x, o.z - c.z) > 9) continue;
        n.partner = o; o.npc.partner = c;
        const town = n.town!;
        const g = town.gossip.length && Math.random() < 0.45 ? pick(town.gossip) : null;
        n.lines = g ? [g.text, pick(GOSSIP_REPLIES)] : pick(CHAT).slice();
        n.rumor = g?.id ?? null;
        n.li = -1; n.s = 0;
        n.t = 3 + n.lines.length * 2.6;
        o.npc.li = LISTENER; o.npc.t = n.t + 2;
        break;
      }
      if (n.t <= 0) this.plan(c, 0);
      return true;
    }
    const p = n.partner;
    if (n.li !== LISTENER && Math.hypot(p.x - c.x, p.z - c.z) > 1.9) {
      this.host.walkToward(c, p.x, p.z, 1.2, dt);
      this.armsWalk(c);
      return true;
    }
    this.face(c, p, dt);
    c.head = Math.sin(Date.now() * 0.004 + c.seed) * 0.08;
    if (n.li !== LISTENER) {
      n.s += dt;
      const turn = Math.floor(n.s / 2.6);
      if (turn !== n.li && turn < n.lines.length) {
        n.li = turn;
        const speaker = turn % 2 === 0 ? c : p;
        if (this.near(c)) {
          this.bubbles.say(speaker, n.lines[turn], 2.5);
          if (turn === 0 && n.rumor && Math.hypot(c.x - this.player.x, c.z - this.player.z) < 14) this.onRumor?.(n.rumor);
        }
        speaker.tail = 0.35;
      }
    }
    if (n.t <= 0) { this.endTalk(c); this.plan(c, 0); }
    return true;
  }

  /** A customer at a stall asks; the merchant answers if one stands there. */
  private buy(c: Creature, dt: number): boolean {
    const n = c.npc!;
    const s = n.stall;
    this.host.idle(c, dt);
    n.t -= dt;
    n.s += dt;
    if (s) this.face(c, { x: s.x + 0.5, z: s.z + 0.5 }, dt);
    const merchant = this.host.allNpcs().find((o) => o.npc?.task === 'sell' && o.npc.stall === s && Math.hypot(o.x - c.x, o.z - c.z) < 4);
    if (!n.lines.length) { n.lines = pick(SELL).slice(); n.li = -1; n.s = 0; }
    const turn = Math.floor(n.s / 3);
    if (turn !== n.li && turn < n.lines.length) {
      n.li = turn;
      const speaker = turn === 1 ? merchant : c;
      if (speaker) {
        if (this.near(c)) this.bubbles.say(speaker, n.lines[turn], 2.6);
        speaker.tail = 0.6;
      }
    }
    if (n.t <= 0) { n.lines = []; this.plan(c, 0); }
    return true;
  }

  private sell(c: Creature, dt: number): boolean {
    const n = c.npc!;
    this.host.idle(c, dt);
    n.t -= dt;
    const s = n.stall;
    if (s) this.face(c, { x: s.x + 0.5 + s.fx * 3, z: s.z + 0.5 + s.fz * 3 }, dt);
    if (Math.random() < dt * 0.05 && this.near(c)) { this.bubbles.say(c, pick(CALLS), 2.8); c.tail = 0.8; }
    if (n.t <= 0) { n.task = 'idle'; n.t = rand(3, 8); n.stall = n.res?.stall ?? null; }
    return true;
  }

  /** The bard plays the lute on the square and sings; listeners clap at the end. */
  private perform(c: Creature, dt: number, night: number): boolean {
    const n = c.npc!;
    this.host.idle(c, dt);
    n.t -= dt;
    n.s += dt;
    const s = n.town!.L.stage;
    if (s) this.face(c, { x: s.x + s.fx * 4, z: s.z + s.fz * 4 }, dt);
    // Strum: the right arm swings fast, the head bobs to the beat.
    c.flap += dt * 14; c.flapAmp = 0.45;
    c.head = Math.sin(n.s * 4.2) * 0.12;
    const turn = Math.floor(n.s / 4);
    if (turn !== n.li && n.lines.length) {
      n.li = turn;
      if (this.near(c)) this.bubbles.say(c, turn % 3 === 2 ? '♪ ♫ ♪' : n.lines[(turn - Math.floor(turn / 3)) % n.lines.length], 3.4);
    }
    if (n.t <= 0) {
      if (this.near(c)) {
        for (const o of this.host.allNpcs()) if (o.npc?.task === 'listen' && o.npc.town === n.town && Math.random() < 0.6) this.bubbles.say(o, pick(APPLAUSE), 2.2);
      }
      n.task = 'idle'; n.t = rand(8, 15);
      if (night > 0.55) this.goHome(c);
    }
    return true;
  }

  private listen(c: Creature, dt: number, night: number): boolean {
    const n = c.npc!;
    this.host.idle(c, dt);
    n.t -= dt;
    const bard = this.host.allNpcs().find((o) => o.npc?.task === 'perform' && o.npc.town === n.town);
    if (!bard) { this.plan(c, night); return true; }
    this.face(c, bard, dt);
    c.head = Math.sin(Date.now() * 0.004 + c.seed) * 0.1; // nodding along
    if (n.t <= 0) this.plan(c, night);
    return true;
  }

  /** The town crier rings a hand bell and calls out the news. */
  private announce(c: Creature, dt: number, night: number): boolean {
    const n = c.npc!;
    this.host.idle(c, dt);
    n.t -= dt;
    n.s += dt;
    const turn = Math.floor(n.s / 3);
    c.tail = turn === 0 ? 0.9 + Math.sin(n.s * 20) * 0.25 : 0.3; // ding-dong, then a raised hand
    if (turn !== n.li && turn < n.lines.length) {
      n.li = turn;
      if (this.near(c)) this.bubbles.say(c, n.lines[turn], 3);
    }
    if (n.t <= 0) this.plan(c, night);
    return true;
  }

  /** Children play tag: whoever is "it" chases the nearest other kid. */
  private play(c: Creature, dt: number, night: number): boolean {
    const n = c.npc!;
    n.t -= dt;
    const kids = this.host.allNpcs().filter((o) => o !== c && o.npc?.task === 'play' && o.npc.town === n.town);
    const it = n.lines[0] === 'it';
    let target: { x: number; z: number } | null = null;
    if (it && kids.length) {
      let best = 1e9;
      for (const o of kids) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < best) { best = d; target = o; } }
      if (best < 0.9) {
        const caught = target as Creature;
        n.lines = []; caught.npc!.lines = ['it'];
        if (this.near(c)) this.bubbles.say(c, pick(KIDS), 1.6);
      }
    } else if (kids.length) {
      // Run away from whoever is "it", within the square.
      const chaser = kids.find((o) => o.npc!.lines[0] === 'it');
      if (!chaser && Math.random() < dt * 0.3) n.lines = ['it'];
      const L = n.town!.L;
      if (chaser && Math.hypot(chaser.x - c.x, chaser.z - c.z) < 6) {
        const ax = c.x - chaser.x, az = c.z - chaser.z, l = Math.hypot(ax, az) || 1;
        target = { x: c.x + (ax / l) * 3, z: c.z + (az / l) * 3 };
        const dc = Math.hypot(target.x - L.site.x, target.z - L.site.z);
        const lim = L.plazaR + 3;
        if (dc > lim) target = { x: L.site.x + ((target.x - L.site.x) / dc) * lim * 0.7, z: L.site.z + ((target.z - L.site.z) / dc) * lim * 0.7 };
      }
    }
    if (target) { this.host.walkToward(c, target.x, target.z, it ? 3.1 : 2.9, dt); this.armsWalk(c); }
    else this.host.idle(c, dt);
    if (n.t <= 0) { n.lines = []; this.plan(c, night); }
    return true;
  }
}

function distS(pts: Float32Array, x: number, z: number): [number, number] {
  let best = 1e9, bs = 0, acc = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], az = pts[i + 1], ex = pts[i + 2] - ax, ez = pts[i + 3] - az;
    const l2 = ex * ex + ez * ez || 1, seg = Math.sqrt(l2);
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    const d = Math.hypot(x - ax - ex * t, z - az - ez * t);
    if (d < best) { best = d; bs = acc + seg * t; }
    acc += seg;
  }
  return [best, bs];
}
const nearestS = (pts: Float32Array, x: number, z: number) => distS(pts, x, z)[1];
