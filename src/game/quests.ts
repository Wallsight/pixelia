// Tasks for the traveller. A few villagers in every settlement wear a yellow
// "!" and the square has a notice board; both hand out tasks:
//   explore: go and see a place (done the moment it is found),
//   collect: gather herbs, mushrooms or flowers in a patch and bring them back,
//   deliver: carry a letter to the square of another settlement.
// Up to three at once; gold is the reward. Kept per seed in the browser.

import * as THREE from 'three';
import { hash01 } from '../engine/noise';
import { SITE_CASTLE, SITE_CITY, SITE_ORC, SITE_VILLAGE, type Site } from '../world/structures';
import { villageLayout } from '../world/village';
import type { Terrain } from '../world/terrain';
import type { Creature } from '../creatures/creatures';
import { direction } from '../creatures/util';
import { LANDMARK_NAMES } from '../ui/discovery';
import { createPropMaterial, type EnvUniforms } from '../render/materials';
import { standY, type BlockReader } from './gold';

type Kind = 'explore' | 'collect' | 'deliver';

export interface Quest {
  id: number;
  kind: Kind;
  /** Who gave it: a resident (town site id + resident seed) or the town's board. */
  town: string; townName: string; giver: string; giverName: string;
  title: string;
  /** Where to go: the place, the patch, or the other square. */
  x: number; z: number; place: string;
  /** Explore: discovery id of the place. */
  placeId?: string;
  /** Collect: what, how many, how many so far, and which of the patch's items are picked. */
  item?: Item; need: number; have: number; picked: number[];
  reward: number;
  /** Collected enough: back to the giver. */
  ready: boolean;
}

type Item = 'herb' | 'mushroom' | 'flower';
const ITEM_NAME: Record<Item, [string, string]> = { herb: ['şifalı ot', 'Şifalı ot'], mushroom: ['kırmızı mantar', 'Kırmızı mantar'], flower: ['gece mavisi çiçek', 'Gece mavisi'] };
const NAMES = ['Ayşe', 'Mehmet', 'Fatma', 'Hasan', 'Elif', 'Yusuf', 'Zeynep', 'Kemal', 'Hatice', 'Osman', 'Emine', 'Murat', 'Gül', 'Rıza', 'Nermin', 'Cemal', 'Sevim', 'Halil', 'Dilek', 'Bekir'];
const EXPLORE_ASK = ['Gidip görür müsün? Doğru mu, masal mı, merak ediyorum.', 'Dedem anlatırdı. Biri gidip baksa...', 'Oraya gidebilecek kadar cesur musun?'];
const COLLECT_WHY: Record<Item, string[]> = {
  herb: ['Annem hasta, şifalı ota ihtiyacım var.', 'Ebe kadın merhem yapacakmış, ot lazım.'],
  mushroom: ['Akşama mantar çorbası yapacağım.', 'Pazarda kırmızı mantar çok para ediyor!'],
  flower: ['Sevdiğime gece mavisi çiçek götüreceğim. Kimseye söyleme!', 'Boya yapmak için çiçek lazım.'],
};
const MAX_ACTIVE = 3;
const REACH = 2.6;

interface Patch { q: Quest; items: Array<{ i: number; x: number; z: number; y: number; obj: THREE.Group | null }> }

export class QuestDirector {
  readonly group = new THREE.Group();
  active: Quest[] = [];
  done = 0;
  /** Tasks finished per giver (each gives the next one in their list). */
  private giverDone: Record<string, number> = {};
  private nextId = 1;
  private key: string;
  private patches = new Map<number, Patch>();
  private marks = new Map<Creature, THREE.Sprite>();
  private boards = new Map<string, { x: number; z: number; y: number; obj: THREE.Group; town: Site }>();
  private scan = 0;
  private time = 0;
  private px = 0; private pz = 0;
  private texBang: THREE.Texture; private texAsk: THREE.Texture;
  private mats: Record<string, THREE.Material>;
  /** The open offer, waiting for yes or no. */
  offer: Quest | null = null;
  private dialog = document.createElement('div');
  private tracker = document.createElement('div');
  /** Paid out: amount and where (the gold director adds it). */
  onReward: ((amount: number, title: string) => void) | null = null;
  onNotice: ((kicker: string, title: string) => void) | null = null;
  onSound: ((kind: 'found' | 'rumor' | 'coin') => void) | null = null;
  /** The giver turns to the player while talking. */
  onTalk: ((c: Creature) => void) | null = null;

  constructor(private terrain: Terrain, private world: BlockReader, private people: () => Creature[], private found: (id: string) => boolean,
    private rumor: (id: string) => void, env: EnvUniforms, shadows: boolean, touch: boolean) {
    this.key = `pixelia-quests-${terrain.seed}`;
    this.texBang = markTexture('!');
    this.texAsk = markTexture('?');
    this.mats = {
      stem: createPropMaterial(env, { color: '#4a8a3a', shadows }), leaf: createPropMaterial(env, { color: '#6ab84a', shadows }),
      cap: createPropMaterial(env, { color: '#d83a3a', shadows }), dot: createPropMaterial(env, { color: '#f2ecdc', shadows }),
      petal: createPropMaterial(env, { color: '#5a7aff', emissive: 0.5, shadows }), wood: createPropMaterial(env, { color: '#6e4a2a', shadows }),
      paper: createPropMaterial(env, { color: '#efe6cc', shadows }), board: createPropMaterial(env, { color: '#8a6438', shadows }),
    };
    try {
      const d = JSON.parse(localStorage.getItem(this.key) ?? 'null') as { active?: Quest[]; done?: number; giverDone?: Record<string, number>; nextId?: number } | null;
      if (d) { this.active = d.active ?? []; this.done = d.done ?? 0; this.giverDone = d.giverDone ?? {}; this.nextId = d.nextId ?? 1; }
    } catch { /* storage blocked or bad data */ }
    this.dialog.id = 'quest-dialog';
    this.dialog.className = 'hidden';
    document.body.appendChild(this.dialog);
    this.dialog.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.act === 'yes') this.accept();
      else if (b?.dataset.act === 'no') this.decline();
    });
    this.tracker.id = 'quests';
    document.body.appendChild(this.tracker);
    this.touch = touch;
    this.render();
  }

  private touch: boolean;

  private save(): void {
    try { localStorage.setItem(this.key, JSON.stringify({ active: this.active, done: this.done, giverDone: this.giverDone, nextId: this.nextId })); } catch { /* storage blocked */ }
  }

  // ------------------------------------------------------------ frame

  update(dt: number, px: number, py: number, pz: number): void {
    this.time += dt;
    this.px = px; this.pz = pz;
    this.scan -= dt;
    if (this.scan <= 0) { this.scan = 0.5; this.refresh(px, pz); }
    // Explore: done the moment the place is found.
    for (const q of [...this.active]) if (q.kind === 'explore' && q.placeId && this.found(q.placeId)) this.complete(q);
    // Collect: walk over the items.
    for (const p of this.patches.values()) for (const it of p.items) {
      if (!it.obj) { this.placeItem(p, it); continue; }
      it.obj.rotation.y += dt * 0.6;
      if (Math.hypot(it.x - px, it.z - pz) < 1.3 && Math.abs(it.y - py) < 2) this.pick(p, it);
    }
    // Givers' marks follow their heads.
    for (const [c, s] of this.marks) s.position.set(c.x, c.y + 2.35 * c.scale + Math.sin(this.time * 3) * 0.06, c.z);
    if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.render();
  }

  /** Something in reach to talk to: a giver, a board, a square to deliver to. */
  candidate(px: number, py: number, pz: number): { x: number; y: number; z: number; label: string; act: () => void } | null {
    if (this.offer) return null;
    for (const c of this.marks.keys()) {
      if (Math.hypot(c.x - px, c.z - pz) > REACH || Math.abs(c.y - py) > 2) continue;
      const key = this.giverKey(c);
      const mine = this.active.find((q) => q.giver === key && q.ready);
      return { x: c.x, y: c.y, z: c.z, label: mine ? 'Teslim et' : 'Konuş', act: () => (mine ? this.complete(mine) : this.talk(c)) };
    }
    for (const b of this.boards.values()) {
      if (Math.hypot(b.x - px, b.z - pz) > REACH) continue;
      const giver = `${b.town.id}:board`;
      const mine = this.active.find((q) => q.giver === giver && q.ready);
      return { x: b.x, y: b.y, z: b.z, label: mine ? 'Teslim et' : 'İlanlara bak', act: () => (mine ? this.complete(mine) : this.offerFrom(b.town, giver, 'İlan Panosu', null)) };
    }
    for (const q of this.active) {
      if (q.kind !== 'deliver' || Math.hypot(q.x - px, q.z - pz) > 7) continue;
      return { x: q.x, y: py, z: q.z, label: 'Mektubu teslim et', act: () => this.complete(q) };
    }
    return null;
  }

  /** Compass and map marks for the tasks on hand. */
  markers(): Array<{ x: number; z: number; label: string; done: boolean; icon: string }> {
    return this.active.map((q) => q.ready ? { x: this.giverPos(q)[0], z: this.giverPos(q)[1], label: `${q.giverName}: teslim`, done: false, icon: '?' }
      : { x: q.x, z: q.z, label: q.title, done: false, icon: '◆' });
  }

  // ------------------------------------------------------------ talk

  private giverKey(c: Creature): string { return `${c.npc!.town!.site.id}:${Math.floor(c.npc!.res!.seed)}`; }

  private talk(c: Creature): void {
    const key = this.giverKey(c);
    const name = NAMES[Math.floor(hash01(Math.floor(c.npc!.res!.seed), 7400, 1, this.terrain.seed) * NAMES.length)];
    this.onTalk?.(c);
    if (this.active.some((q) => q.giver === key)) { this.showLine(name, 'Hâlâ bekliyorum. Unutmadın, değil mi?'); return; }
    this.offerFrom(c.npc!.town!.site, key, name, c);
  }

  /** Make up the giver's next task and show it. */
  private offerFrom(town: Site, giver: string, giverName: string, c: Creature | null, only?: Kind): void {
    if (this.active.length >= MAX_ACTIVE) { this.showLine(giverName, 'Elin dolu görünüyor. Önce işlerini bitir, sonra gel.'); return; }
    if (c === null && this.active.some((q) => q.giver === giver)) { this.showLine(giverName, 'Panodaki ilanı zaten aldın.'); return; }
    const n = this.giverDone[giver] ?? 0;
    const r = (k: number) => hash01(n * 13 + k, 7410, hashStr(giver), this.terrain.seed);
    const kinds: Kind[] = ['explore', 'collect', 'deliver'];
    const order = kinds.slice().sort((a, b) => r(kinds.indexOf(a)) - r(kinds.indexOf(b)));
    for (const kind of only ? [only] : order) {
      const q = kind === 'explore' ? this.makeExplore(town, r) : kind === 'collect' ? this.makeCollect(town, r) : this.makeDeliver(town, r);
      if (!q) continue;
      Object.assign(q, { town: town.id, townName: town.name, giver, giverName });
      this.offer = q;
      this.showOffer(q);
      return;
    }
    this.showLine(giverName, 'Bugün bir işim yok. Sonra uğra.');
  }

  private base(kind: Kind): Quest {
    return { id: this.nextId, kind, town: '', townName: '', giver: '', giverName: '', title: '', x: 0, z: 0, place: '', need: 1, have: 0, picked: [], reward: 0, ready: false };
  }

  private makeExplore(town: Site, r: (k: number) => number): (Quest & { text: string }) | null {
    const t = this.terrain, R = 900;
    const cands: Array<{ id: string; x: number; z: number; name: string }> = [];
    for (const lm of t.landmarks.near(town.x - R, town.z - R, town.x + R, town.z + R, 0)) cands.push({ id: `l:${lm.id}`, x: lm.x, z: lm.z, name: LANDMARK_NAMES[lm.kind] ?? 'eski bir yer' });
    for (const s of t.structures.sitesNear(town.x - R, town.z - R, town.x + R, town.z + R, 0)) {
      if (s.kind === SITE_CASTLE || s.kind === SITE_ORC || s.kind === SITE_VILLAGE) cands.push({ id: `s:${s.id}`, x: s.x, z: s.z, name: s.name });
    }
    const ok = cands.filter((p) => !this.found(p.id) && !this.active.some((q) => q.placeId === p.id) && Math.hypot(p.x - town.x, p.z - town.z) > 120)
      .sort((a, b) => Math.hypot(a.x - town.x, a.z - town.z) - Math.hypot(b.x - town.x, b.z - town.z)).slice(0, 4);
    if (!ok.length) return null;
    const p = ok[Math.floor(r(3) * ok.length)];
    const d = Math.hypot(p.x - town.x, p.z - town.z);
    const q = this.base('explore') as Quest & { text: string };
    Object.assign(q, { title: `${acc(p.name)} bul`, x: p.x, z: p.z, place: p.name, placeId: p.id, reward: 25 + Math.round(d / 15) });
    q.text = `${direction(p.x - town.x, p.z - town.z, true)}, ${Math.round(d / 50) * 50} adım ötede ${p.name} varmış. ${EXPLORE_ASK[Math.floor(r(4) * EXPLORE_ASK.length)]}`;
    return q;
  }

  private makeCollect(town: Site, r: (k: number) => number): (Quest & { text: string }) | null {
    const items: Item[] = ['herb', 'mushroom', 'flower'];
    const item = items[Math.floor(r(5) * 3)];
    const a = r(6) * Math.PI * 2, d = 60 + r(7) * 80;
    const x = town.x + Math.cos(a) * d, z = town.z + Math.sin(a) * d;
    const s = this.terrain.sample(x, z);
    if (s.h < 53 || s.river > 0.05) return null;
    const need = 3 + Math.floor(r(8) * 3);
    const q = this.base('collect') as Quest & { text: string };
    Object.assign(q, { title: `${need} ${ITEM_NAME[item][0]} topla`, x, z, place: `${direction(x - town.x, z - town.z)} kırlar`, item, need, reward: 15 + need * 5 });
    q.text = `${COLLECT_WHY[item][Math.floor(r(9) * 2)]} ${direction(x - town.x, z - town.z, true)}, ${Math.round(d / 10) * 10} adım ötede bolca ${ITEM_NAME[item][0]} biter. Bana ${need} tane getirir misin?`;
    return q;
  }

  private makeDeliver(town: Site, r: (k: number) => number): (Quest & { text: string }) | null {
    const R = 700;
    const towns = this.terrain.structures.sitesNear(town.x - R, town.z - R, town.x + R, town.z + R, 0)
      .filter((s) => (s.kind === SITE_VILLAGE || s.kind === SITE_CITY) && s.id !== town.id && Math.hypot(s.x - town.x, s.z - town.z) > 150)
      .sort((a, b) => Math.hypot(a.x - town.x, a.z - town.z) - Math.hypot(b.x - town.x, b.z - town.z)).slice(0, 3);
    if (!towns.length) return null;
    const to = towns[Math.floor(r(10) * towns.length)];
    const d = Math.hypot(to.x - town.x, to.z - town.z);
    const q = this.base('deliver') as Quest & { text: string };
    Object.assign(q, { title: `Mektubu ${dat(to.name)} götür`, x: to.x, z: to.z, place: to.name, reward: 20 + Math.round(d / 20) });
    q.text = `Şu mektubu ${dat(to.name)} götürür müsün? ${direction(to.x - town.x, to.z - town.z, true)}, ${Math.round(d / 50) * 50} adım ötede. Meydandaki ${to.kind === SITE_CITY ? 'çeşmenin' : 'kuyunun'} başına bırakman yeter.`;
    return q;
  }

  private showOffer(q: Quest & { text?: string }): void {
    const keys = this.touch ? '' : ' <span class="key">E</span>';
    this.dialog.innerHTML = `<div class="who">${q.giverName}</div><p>${q.text ?? ''}</p><div class="reward">Ödül: <span class="coin"></span>${q.reward} altın</div>`
      + `<div class="row"><button data-act="yes">Kabul et${keys}</button><button data-act="no">Vazgeç${this.touch ? '' : ' <span class="key">Q</span>'}</button></div>`;
    this.dialog.classList.remove('hidden');
  }

  private showLine(who: string, text: string): void {
    this.offer = null;
    this.dialog.innerHTML = `<div class="who">${who}</div><p>${text}</p>`;
    this.dialog.classList.remove('hidden');
    window.setTimeout(() => { if (!this.offer) this.dialog.classList.add('hidden'); }, 3200);
  }

  /** Dialog open with an offer (E accepts, Q declines). */
  get asking(): boolean { return this.offer !== null; }

  accept(): void {
    const q = this.offer;
    if (!q) return;
    this.offer = null;
    this.dialog.classList.add('hidden');
    delete (q as Quest & { text?: string }).text;
    this.nextId++;
    this.active.push(q);
    if (q.placeId) this.rumor(q.placeId);
    this.save();
    this.onSound?.('rumor');
    this.onNotice?.('YENİ GÖREV', q.title);
    this.render();
  }

  decline(): void {
    this.offer = null;
    this.dialog.classList.add('hidden');
  }

  private complete(q: Quest): void {
    this.active = this.active.filter((o) => o !== q);
    this.giverDone[q.giver] = (this.giverDone[q.giver] ?? 0) + 1;
    this.done++;
    const p = this.patches.get(q.id);
    if (p) { for (const it of p.items) if (it.obj) this.group.remove(it.obj); this.patches.delete(q.id); }
    this.save();
    this.onReward?.(q.reward, q.title);
    this.render();
  }

  // ------------------------------------------------------------ the world side

  private giverPos(q: Quest): [number, number] {
    const c = this.people().find((p) => p.npc?.town && p.npc.res && this.giverKey(p) === q.giver);
    if (c) return [c.x, c.z];
    const b = this.boards.get(q.town);
    if (b && q.giver.endsWith(':board')) return [b.x, b.z];
    const town = this.townSite(q.town);
    return town ? [town.x, town.z] : [q.x, q.z];
  }

  private townSite(id: string): Site | null {
    const [gx, gz] = id.split(',').map(Number);
    return Number.isFinite(gx) && Number.isFinite(gz) ? this.terrain.structures.site(gx, gz) : null;
  }

  /** Givers among the people about, boards on the squares nearby, item patches of the tasks on hand. */
  private refresh(px: number, pz: number): void {
    // Givers: a few of each settlement's grown-ups, chosen by the seed.
    const keep = new Set<Creature>();
    for (const c of this.people()) {
      const n = c.npc;
      if (!n || !n.town || !n.res || n.remove || c.gone) continue;
      if (n.role !== 'villager' && n.role !== 'elder' && n.role !== 'farmer') continue;
      if (hash01(Math.floor(n.res.seed), 7420, 3, this.terrain.seed) > 0.14) continue;
      if (Math.hypot(c.x - px, c.z - pz) > 60) continue;
      keep.add(c);
      let s = this.marks.get(c);
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texBang, depthTest: false, transparent: true }));
        s.scale.set(0.5, 0.5, 1);
        s.renderOrder = 10;
        this.group.add(s);
        this.marks.set(c, s);
      }
      const key = this.giverKey(c);
      const mine = this.active.find((q) => q.giver === key);
      (s.material as THREE.SpriteMaterial).map = mine?.ready ? this.texAsk : this.texBang;
      s.visible = !mine || mine.ready;
    }
    for (const [c, s] of this.marks) if (!keep.has(c)) { this.group.remove(s); s.material.dispose(); this.marks.delete(c); }

    // Boards on the squares within reach.
    const near = this.terrain.structures.sitesNear(px - 120, pz - 120, px + 120, pz + 120, 0).filter((s) => s.kind === SITE_VILLAGE || s.kind === SITE_CITY);
    for (const town of near) if (!this.boards.has(town.id)) this.makeBoard(town);
    for (const [id, b] of this.boards) if (!near.some((s) => s.id === id)) { this.group.remove(b.obj); this.boards.delete(id); }

    // Collect patches for the tasks on hand, when close.
    for (const q of this.active) {
      if (q.kind !== 'collect' || q.ready || this.patches.has(q.id) || Math.hypot(q.x - px, q.z - pz) > 90) continue;
      const items: Patch['items'] = [];
      for (let i = 0; i < q.need + 2; i++) {
        if (q.picked.includes(i)) continue;
        const a = hash01(q.id, 7430 + i, 1, this.terrain.seed) * Math.PI * 2, d = 2 + hash01(q.id, 7440 + i, 2, this.terrain.seed) * 9;
        items.push({ i, x: q.x + Math.cos(a) * d, z: q.z + Math.sin(a) * d, y: NaN, obj: null });
      }
      this.patches.set(q.id, { q, items });
    }
    for (const [id, p] of this.patches) if (Math.hypot(p.q.x - px, p.q.z - pz) > 130) { for (const it of p.items) if (it.obj) this.group.remove(it.obj); this.patches.delete(id); }
  }

  private makeBoard(town: Site): void {
    const L = villageLayout(this.terrain, town);
    // At the square's edge, on the side away from the first street (city: beside the legends board).
    const a = L.board ? Math.atan2(L.board.z - town.z, L.board.x - town.x) + 0.35 : hash01(town.gx, 7450, town.gz, this.terrain.seed) * Math.PI * 2;
    const r = L.board ? Math.hypot(L.board.x - town.x, L.board.z - town.z) : L.plazaR - 1.2;
    const x = Math.floor(town.x + Math.cos(a) * r) + 0.5, z = Math.floor(town.z + Math.sin(a) * r) + 0.5;
    const y = standY(this.world, Math.floor(x), Math.floor(z));
    if (y === null || Number.isNaN(y)) return; // not loaded yet: next time
    const g = new THREE.Group();
    const add = (sx: number, sy: number, sz: number, px: number, py: number, pz: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); mesh.position.set(px, py, pz); g.add(mesh);
    };
    add(0.12, 2.2, 0.12, -0.7, 1.1, 0, this.mats.wood); add(0.12, 2.2, 0.12, 0.7, 1.1, 0, this.mats.wood);
    add(1.6, 1.0, 0.08, 0, 1.5, 0, this.mats.board);
    add(1.8, 0.12, 0.3, 0, 2.08, 0, this.mats.wood);
    for (const [px, py] of [[-0.45, 1.65], [0.05, 1.7], [0.5, 1.55], [-0.2, 1.3], [0.35, 1.25]]) add(0.32, 0.36, 0.02, px, py, 0.06, this.mats.paper);
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(town.x - x, town.z - z);
    this.group.add(g);
    this.boards.set(town.id, { x, z, y, obj: g, town });
  }

  private placeItem(p: Patch, it: Patch['items'][number]): void {
    for (let k = 0; k < 6; k++) {
      const x = Math.floor(it.x + Math.cos(k * 2.1) * k * 0.8), z = Math.floor(it.z + Math.sin(k * 2.1) * k * 0.8);
      const y = standY(this.world, x, z);
      if (y === null) return;
      if (Number.isNaN(y) || y > this.terrain.sample(x, z).h + 3) continue;
      it.x = x + 0.5; it.z = z + 0.5; it.y = y;
      it.obj = this.itemMesh(p.q.item ?? 'herb');
      it.obj.position.set(it.x, y, it.z);
      this.group.add(it.obj);
      return;
    }
    p.items = p.items.filter((o) => o !== it);
  }

  private itemMesh(item: Item): THREE.Group {
    const g = new THREE.Group(), m = this.mats;
    const add = (sx: number, sy: number, sz: number, px: number, py: number, pz: number, mat: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); mesh.position.set(px, py, pz); g.add(mesh);
    };
    if (item === 'mushroom') { add(0.1, 0.22, 0.1, 0, 0.11, 0, m.dot); add(0.34, 0.12, 0.34, 0, 0.26, 0, m.cap); add(0.06, 0.03, 0.06, 0.08, 0.33, 0.05, m.dot); }
    else if (item === 'flower') { add(0.05, 0.4, 0.05, 0, 0.2, 0, m.stem); add(0.24, 0.08, 0.24, 0, 0.42, 0, m.petal); add(0.16, 0.05, 0.08, 0.1, 0.18, 0, m.leaf); }
    else { add(0.05, 0.34, 0.05, 0, 0.17, 0, m.stem); add(0.26, 0.06, 0.1, 0.08, 0.26, 0, m.leaf); add(0.1, 0.06, 0.24, -0.04, 0.34, 0.06, m.leaf); add(0.18, 0.06, 0.18, 0, 0.12, 0, m.leaf); }
    g.scale.setScalar(1.4);
    return g;
  }

  private pick(p: Patch, it: Patch['items'][number]): void {
    const q = p.q;
    if (it.obj) this.group.remove(it.obj);
    p.items = p.items.filter((o) => o !== it);
    q.picked.push(it.i);
    q.have = Math.min(q.need, q.have + 1);
    this.onSound?.('coin');
    if (q.have >= q.need && !q.ready) {
      q.ready = true;
      this.onNotice?.('GÖREV', `${ITEM_NAME[q.item!][1]} tamam: ${dat(q.giverName)} götür`);
      for (const o of p.items) if (o.obj) this.group.remove(o.obj);
      this.patches.delete(q.id);
    }
    this.save();
    this.render();
  }

  // ------------------------------------------------------------ tracker

  private render(): void {
    if (!this.active.length) { this.tracker.classList.add('hidden'); return; }
    this.tracker.classList.remove('hidden');
    this.tracker.innerHTML = '<div class="head">GÖREVLER</div>' + this.active.map((q) => {
      const [tx, tz] = q.ready ? this.giverPos(q) : [q.x, q.z];
      const d = Math.round(Math.hypot(tx - this.px, tz - this.pz));
      const what = q.ready ? `${dat(q.giverName)} dön` : q.kind === 'collect' ? `${q.title} ${q.have}/${q.need}` : q.title;
      return `<div class="q${q.ready ? ' ready' : ''}"><span class="dot"></span>${what}<span class="far">${direction(tx - this.px, tz - this.pz)} · ${d} m</span></div>`;
    }).join('');
  }

  /** Dev: offer a task from the nearest town's board right away. */
  dev(px: number, pz: number, kind?: string): string {
    if (kind === 'givers') return [...this.marks.keys()].map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)}`).join(' ');
    if (kind === 'items') return [...this.patches.values()].flatMap((p) => p.items.map((it) => `${it.x.toFixed(1)},${it.y.toFixed(1)},${it.z.toFixed(1)}`)).join(' ');
    const town = this.terrain.structures.sitesNear(px - 200, pz - 200, px + 200, pz + 200, 0).filter((s) => s.kind === SITE_VILLAGE || s.kind === SITE_CITY)
      .sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz))[0];
    if (!town) return 'no town';
    this.offerFrom(town, `${town.id}:board`, 'İlan Panosu', null, kind === 'explore' || kind === 'collect' || kind === 'deliver' ? kind : undefined);
    return `${this.active.length} active; offer ${this.offer?.kind ?? '-'}: ${this.offer?.title ?? ''} | boards ${[...this.boards.values()].map((b) => `${b.x},${b.z}`).join(' ')} | givers ${[...this.marks.keys()].map((c) => `${Math.round(c.x)},${Math.round(c.z)}`).join(' ')}`;
  }
}

// Turkish case endings on a name, after an apostrophe: vowel harmony, a buffer y after a vowel,
// n after a possessive ending (Kızılyurt Köyü'ne, Dramok Ordası'nı, Ayşe'ye, Külkent'e).
const POSSESSIVE = /\s\S*(ü|u|ı|i|sı|si|su|sü)$/;
const POSS_WORDS = new Set(['Köyü', 'Ordası', 'Obası', 'Şatosu', 'Ovası', 'Panosu', 'Kulübeleri', 'İskeleti', 'Kafatası', 'Çiftliği', 'Kapısı', 'Evi', 'İni']);
function lastVowel(s: string): string { const m = s.toLocaleLowerCase('tr').match(/[aıoueiöü](?=[^aıoueiöü]*$)/); return m ? m[0] : 'e'; }
function buffer(name: string): string {
  const last = name.split(' ').pop() ?? name;
  if (POSS_WORDS.has(last) || (name.includes(' ') && POSSESSIVE.test(name) && /[aıoueiöü]$/.test(name))) return 'n';
  return /[aıoueiöüAIOUEİÖÜ]$/.test(name) ? 'y' : '';
}
/** Dative: Ayşe'ye, Külkent'e, Kızılyurt Köyü'ne. */
export function dat(name: string): string {
  const v = lastVowel(name), b = buffer(name);
  return `${name}'${b}${v === 'a' || v === 'ı' || v === 'o' || v === 'u' ? 'a' : 'e'}`;
}
/** Accusative: Kara Kule'yi, Tepe Evi'ni, Kılıçlardan Taht'ı. */
export function acc(name: string): string {
  const v = lastVowel(name), b = buffer(name);
  return `${name}'${b}${v === 'a' || v === 'ı' ? 'ı' : v === 'e' || v === 'i' ? 'i' : v === 'o' || v === 'u' ? 'u' : 'ü'}`;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function markTexture(ch: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = 'bold 54px "Cascadia Mono", Consolas, monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = '#000';
  g.strokeText(ch, 32, 34);
  g.fillStyle = '#ffd24a';
  g.fillText(ch, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

