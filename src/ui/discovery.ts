// Exploration: remembers where the player has been (fog of war on the map),
// which places they have found (toast + counter) and which ones they have only
// heard about from villagers (shown as "?" on the map). Saved per world seed in
// localStorage; everything still works if storage is unavailable.

import { LM, SITE_CASTLE, SITE_CITY, SITE_ORC, SITE_VILLAGE, type Landmark, type Site } from '../world/structures';
import type { Terrain } from '../world/terrain';

export const FOG_CELL = 32;
const REVEAL = 140;

export const LANDMARK_NAMES: Record<number, string> = {
  [LM.GRAVEYARD]: 'Eski Mezarlık', [LM.PLATFORM]: 'Gizli Peron', [LM.WILLOW]: 'Huysuz Söğüt', [LM.VAULT]: 'Sığınak Kapısı',
  [LM.SANDWORM]: 'Kum Kurdu İskeleti', [LM.MOISTURE_FARM]: 'Nem Çiftliği', [LM.SABER_STONE]: 'Taştaki Işın Kılıcı',
  [LM.CHAPEL]: 'Terk Edilmiş Şapel', [LM.PENTAGRAM]: 'Lav Yıldızı', [LM.MURLOC_HUTS]: 'Mırıl Kulübeleri',
  [LM.PEON_CAMP]: 'Oduncu Kampı', [LM.DARK_TOWER]: 'Kara Kule', [LM.MONOLITH]: 'Kara Anıt', [LM.HOBBIT_HOLE]: 'Tepe Evi',
  [LM.PHONE_BOX]: 'Mavi Kulübe', [LM.SUNKEN_TEMPLE]: 'Batık Tapınak', [LM.DRAGON_LAIR]: 'Közhan\'ın İni',
  [LM.SWORD_THRONE]: 'Kılıçlardan Taht', [LM.ICE_WALL]: 'Buz Duvar', [LM.FACE_TREE]: 'Yüzlü Ağaç', [LM.DRAGON_SKULL]: 'Ejder Kafatası',
};

const key = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);

export class Discovery {
  /** Explored fog cells. */
  readonly seen = new Set<number>();
  /** Found places (site / landmark ids). */
  readonly found = new Set<string>();
  /** Places villagers told us about. */
  readonly rumors = new Set<string>();
  /** Bumped whenever the explored area grows (the map redraws its fog). */
  version = 0;
  private timer = 0;
  private saveTimer = 0;
  private dirty = false;
  private toastEl: HTMLDivElement;
  private toastTimer = 0;
  /** Toasts waiting: title, sub line, kicker, and whether it is a short notice. */
  private queue: Array<[string, string, string, boolean]> = [];
  /** The toast on screen now. */
  private current: [string, string, string, boolean] | null = null;
  private storeKey: string;
  /** Sound hook for discoveries and rumours. */
  onSound: ((kind: 'found' | 'rumor') => void) | null = null;

  constructor(private terrain: Terrain) {
    this.storeKey = `pixelia:${terrain.seed}:discovery`;
    this.toastEl = document.createElement('div');
    this.toastEl.id = 'toast';
    document.body.appendChild(this.toastEl);
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(this.storeKey);
      if (!raw) return;
      const d = JSON.parse(raw) as { seen?: number[]; found?: string[]; rumors?: string[] };
      for (const k of d.seen ?? []) if (Number.isFinite(k)) this.seen.add(k);
      for (const k of d.found ?? []) if (typeof k === 'string') this.found.add(k);
      for (const k of d.rumors ?? []) if (typeof k === 'string') this.rumors.add(k);
    } catch { /* storage unavailable or corrupt: start fresh */ }
  }

  private save(): void {
    try {
      localStorage.setItem(this.storeKey, JSON.stringify({ seen: [...this.seen], found: [...this.found], rumors: [...this.rumors] }));
    } catch { /* ignore */ }
  }

  isSeen(x: number, z: number): boolean {
    return this.seen.has(key(Math.floor(x / FOG_CELL), Math.floor(z / FOG_CELL)));
  }

  seenCell(cx: number, cz: number): boolean { return this.seen.has(key(cx, cz)); }

  /** A villager mentioned this landmark within earshot. */
  rumor(id: string): void {
    if (this.found.has(id) || this.rumors.has(id)) return;
    this.rumors.add(id);
    this.dirty = true;
    this.onSound?.('rumor');
    this.toast('Duyduğun bir söylenti', 'Haritaya işaretlendi (?)', '', 'SÖYLENTİ');
  }

  get total(): number { return this.found.size; }

  /** Lift the fog in a circle (a bought map piece). */
  reveal(x: number, z: number, r: number): void {
    const c0 = Math.floor(x / FOG_CELL), cz0 = Math.floor(z / FOG_CELL), n = Math.ceil(r / FOG_CELL);
    for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) {
      if ((dx * dx + dz * dz) * FOG_CELL * FOG_CELL > r * r) continue;
      const k = key(c0 + dx, cz0 + dz);
      if (!this.seen.has(k)) { this.seen.add(k); this.version++; this.dirty = true; }
    }
  }

  update(dt: number, px: number, pz: number): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.5;
      // Reveal the fog around the player.
      const c0 = Math.floor(px / FOG_CELL), r = Math.ceil(REVEAL / FOG_CELL);
      const cz0 = Math.floor(pz / FOG_CELL);
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if ((dx * dx + dz * dz) * FOG_CELL * FOG_CELL > REVEAL * REVEAL) continue;
        const k = key(c0 + dx, cz0 + dz);
        if (!this.seen.has(k)) { this.seen.add(k); this.version++; this.dirty = true; }
      }
      this.checkPlaces(px, pz);
    }
    this.saveTimer -= dt;
    if (this.saveTimer <= 0 && this.dirty) { this.saveTimer = 5; this.dirty = false; this.save(); }
    // Toast queue.
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) { this.toastEl.classList.remove('show'); this.current = null; }
    } else if (this.queue.length) {
      this.current = this.queue.shift()!;
      const [title, sub, kick] = this.current;
      this.toastEl.replaceChildren();
      const k = document.createElement('div'); k.className = 'kicker'; k.textContent = kick;
      const t = document.createElement('div'); t.className = 'title'; t.textContent = title;
      const c = document.createElement('div'); c.className = 'count'; c.textContent = sub;
      this.toastEl.append(k, t, c);
      this.toastEl.classList.add('show');
      this.toastTimer = 3.5;
    }
  }

  private toast(title: string, sub: string, _id: string, kicker = sub ? 'KEŞFEDİLDİ' : 'SÖYLENTİ'): void {
    this.queue.push([title, sub, kicker, false]);
  }

  /** A big world notice (a rare creature, a victory): queued like a discovery. */
  announce(kicker: string, title: string, sub: string): void {
    this.onSound?.('found');
    this.toast(title, sub, '', kicker);
  }

  /** A short notice in the same toast slot (e.g. sound settings). */
  notice(kicker: string, title: string): void {
    // Shown at once and replacing older notices; a discovery or announcement it cuts short comes back after it.
    this.queue = this.queue.filter((q) => !q[3]);
    if (this.current && !this.current[3]) this.queue.unshift(this.current);
    this.queue.unshift([title, '', kicker, true]);
    this.current = null;
    this.toastTimer = 0;
  }

  private discover(id: string, name: string): void {
    if (this.found.has(id)) return;
    this.found.add(id);
    this.rumors.delete(id);
    this.dirty = true;
    this.onSound?.('found');
    this.toast(name, `${this.found.size}. keşif`, id);
  }

  private checkPlaces(px: number, pz: number): void {
    const st = this.terrain.structures;
    for (const s of st.sitesNear(px - 100, pz - 100, px + 100, pz + 100, 0)) {
      const r = s.kind === SITE_CITY ? 90 : s.kind === SITE_VILLAGE ? 45 : s.kind === SITE_CASTLE ? 35 : s.kind === SITE_ORC ? (s.capital ? 60 : 32) : 12;
      if (Math.hypot(s.x - px, s.z - pz) < r) this.discover(`s:${s.id}`, siteTitle(s));
    }
    for (const lm of this.terrain.landmarks.near(px - 60, pz - 60, px + 60, pz + 60, 0)) {
      const r = lm.kind === LM.DARK_TOWER ? 60 : lm.kind === LM.DRAGON_LAIR ? 45 : 24;
      if (Math.hypot(lm.x - px, lm.z - pz) < r) this.discover(landmarkId(lm), LANDMARK_NAMES[lm.kind]);
    }
  }
}

export const landmarkId = (lm: Landmark) => `l:${lm.id}`;
export const siteId = (s: Site) => `s:${s.id}`;
function siteTitle(s: Site): string {
  return s.name;
}
