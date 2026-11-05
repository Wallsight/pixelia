// Gold lying about the world: coin pouches dropped along the roads (picked up
// by walking over them) and chests at landmarks and in ruined castles (opened
// with the interact key). Where they lie follows from the seed; what has been
// taken, and the purse, are kept per seed in the browser.

import * as THREE from 'three';
import { hash01 } from '../engine/noise';
import { B, COLLIDES, HEIGHT, HEIGHT8, KIND, KIND_LEAVES, KIND_PLANT, isLiquid } from '../world/blocks';
import { SITE_CASTLE, pointAlong } from '../world/structures';
import type { Terrain } from '../world/terrain';
import { createPropMaterial, type EnvUniforms } from '../render/materials';

export interface BlockReader { getBlock(x: number, y: number, z: number): number }

/** Standing height on (x, z): top of the highest solid with two free cells above; NaN for water/leaves; null if unloaded. */
export function standY(world: BlockReader, x: number, z: number): number | null {
  for (let y = HEIGHT - 2; y > 1; y--) {
    const b = world.getBlock(x, y, z);
    if (b < 0) return null;
    if (b === B.AIR || KIND[b] === KIND_PLANT) continue;
    if (KIND[b] === KIND_LEAVES || isLiquid(b) || !COLLIDES[b]) return NaN;
    const up = world.getBlock(x, y + 1, z), up2 = world.getBlock(x, y + 2, z);
    if ((up > 0 && COLLIDES[up]) || (up2 > 0 && COLLIDES[up2])) return NaN;
    return y + HEIGHT8[b] / 8;
  }
  return NaN;
}

type Kind = 'pouch' | 'chest';
interface Item {
  id: string;
  kind: Kind;
  x: number; z: number;
  value: number;
  /** Where on the map it comes from, for the chest's toast. */
  where: string;
  /** Set once placed on loaded ground. */
  y: number;
  obj: THREE.Group | null;
  lid: THREE.Group | null;
  open: number;
}

export interface GoldStats { gold: number; pouches: number; chests: number; quests: number }

const R = 90;
const PICK = 1.3;
const ROAD_STEP = 45;

export class GoldDirector {
  readonly group = new THREE.Group();
  private items = new Map<string, Item>();
  private taken = new Set<string>();
  readonly stats: GoldStats = { gold: 0, pouches: 0, chests: 0, quests: 0 };
  private key: string;
  private scan = 0;
  private time = 0;
  private mats: Record<string, THREE.Material>;
  private geo = {
    sack: new THREE.BoxGeometry(0.34, 0.3, 0.34), neck: new THREE.BoxGeometry(0.18, 0.1, 0.18), coin: new THREE.BoxGeometry(0.12, 0.04, 0.12),
    glint: new THREE.BoxGeometry(0.06, 0.06, 0.06),
    base: new THREE.BoxGeometry(0.9, 0.5, 0.6), band: new THREE.BoxGeometry(0.94, 0.08, 0.64), lid: new THREE.BoxGeometry(0.9, 0.22, 0.6), lock: new THREE.BoxGeometry(0.14, 0.16, 0.06),
    heap: new THREE.BoxGeometry(0.7, 0.12, 0.42),
  };
  /** Gold changed: amount added and the new total. */
  onGold: ((added: number, total: number, kind: Kind | 'quest', where: string) => void) | null = null;

  constructor(private terrain: Terrain, private world: BlockReader, env: EnvUniforms, shadows: boolean) {
    this.key = `pixelia-gold-${terrain.seed}`;
    this.mats = {
      sack: createPropMaterial(env, { color: '#8a6438', shadows }),
      tie: createPropMaterial(env, { color: '#c8a050', shadows }),
      gold: createPropMaterial(env, { color: '#ffd24a', emissive: 0.6, shadows }),
      wood: createPropMaterial(env, { color: '#6e4a2a', shadows }),
      iron: createPropMaterial(env, { color: '#3a3634', shadows }),
    };
    try {
      const d = JSON.parse(localStorage.getItem(this.key) ?? 'null') as { stats?: Partial<GoldStats>; taken?: string[] } | null;
      if (d?.taken) for (const id of d.taken) this.taken.add(id);
      if (d?.stats) Object.assign(this.stats, d.stats);
    } catch { /* storage blocked or bad data */ }
  }

  private save(): void {
    try { localStorage.setItem(this.key, JSON.stringify({ stats: this.stats, taken: [...this.taken] })); } catch { /* storage blocked */ }
  }

  /** Quest rewards and the like. */
  add(amount: number, where: string): void {
    this.stats.gold += amount;
    this.stats.quests++;
    this.save();
    this.onGold?.(amount, this.stats.gold, 'quest', where);
  }

  update(dt: number, px: number, py: number, pz: number): void {
    this.time += dt;
    this.scan -= dt;
    if (this.scan <= 0) { this.scan = 1; this.refresh(px, pz); }
    for (const it of this.items.values()) {
      if (!it.obj) { this.place(it); continue; }
      if (it.kind === 'pouch') {
        // Bob and turn; a glint now and then.
        it.obj.position.y = it.y + 0.05 + Math.sin(this.time * 2 + it.x) * 0.04;
        it.obj.rotation.y += dt * 0.8;
        const glint = it.obj.children[it.obj.children.length - 1];
        glint.visible = Math.sin(this.time * 3 + it.z) > 0.7;
        if (Math.hypot(it.x - px, it.z - pz) < PICK && Math.abs(it.y - py) < 2) this.take(it);
      } else if (it.lid) {
        const want = this.taken.has(it.id) ? 1 : 0;
        if (it.open !== want) { it.open = Math.min(want, it.open + dt * 2); it.lid.rotation.x = -it.open * 1.9; }
      }
    }
  }

  /** Closed chests within reach of the player (for the interact prompt). */
  chestNear(px: number, py: number, pz: number): { x: number; y: number; z: number; open: () => void } | null {
    for (const it of this.items.values()) {
      if (it.kind !== 'chest' || !it.obj || this.taken.has(it.id)) continue;
      if (Math.hypot(it.x - px, it.z - pz) < 2.8 && Math.abs(it.y - py) < 2.5) return { x: it.x, y: it.y + 0.5, z: it.z, open: () => this.take(it) };
    }
    return null;
  }

  private take(it: Item): void {
    if (this.taken.has(it.id)) return;
    this.taken.add(it.id);
    this.stats.gold += it.value;
    if (it.kind === 'pouch') { this.stats.pouches++; this.drop(it); this.items.delete(it.id); }
    else { this.stats.chests++; it.obj?.children.find((c) => c.name === 'heap')?.removeFromParent(); }
    this.save();
    this.onGold?.(it.value, this.stats.gold, it.kind, it.where);
  }

  private drop(it: Item): void {
    if (it.obj) this.group.remove(it.obj);
    it.obj = null;
  }

  /** Every pouch and chest around the player (chests stay, open, once emptied). */
  private refresh(px: number, pz: number): void {
    const want = new Map<string, Omit<Item, 'y' | 'obj' | 'lid' | 'open'>>();
    const t = this.terrain, seed = t.seed;
    // Pouches along the roads, now and then, at the verge.
    for (const road of t.structures.roadsNear(px - R, pz - R, px + R, pz + R, 0)) {
      for (let k = 1; k * ROAD_STEP < road.length - 20; k++) {
        const h = hash01(k, 7300, road.a.gx * 31 + road.b.gz, seed);
        if (h > 0.3) continue;
        const [x, z, dx, dz] = pointAlong(road.pts, k * ROAD_STEP + h * 30);
        if (Math.hypot(x - px, z - pz) > R) continue;
        const side = hash01(k, 7301, road.b.gx, seed) < 0.5 ? 1 : -1;
        const id = `p:${road.id}:${k}`;
        if (!this.taken.has(id)) want.set(id, { id, kind: 'pouch', x: x - dz * side * 2.4, z: z + dx * side * 2.4, value: 5 + Math.floor(h * 33), where: 'yol kenarı' });
      }
    }
    // A chest by every landmark.
    for (const lm of t.landmarks.near(px - R, pz - R, px + R, pz + R, 0)) {
      const a = hash01(lm.gx, 7310, lm.gz, seed) * Math.PI * 2, d = 7 + hash01(lm.gx, 7311, lm.gz, seed) * 4;
      const id = `c:l:${lm.id}`;
      want.set(id, { id, kind: 'chest', x: lm.x + Math.cos(a) * d, z: lm.z + Math.sin(a) * d, value: 25 + Math.floor(hash01(lm.gx, 7312, lm.gz, seed) * 26), where: 'eski bir yer' });
    }
    // And in the courtyard of every ruined castle.
    for (const s of t.structures.sitesNear(px - R, pz - R, px + R, pz + R, 0)) {
      if (s.kind !== SITE_CASTLE || s.held) continue;
      const id = `c:s:${s.id}`;
      want.set(id, { id, kind: 'chest', x: s.x + 2.5, z: s.z - 1.5, value: 40 + Math.floor(hash01(s.gx, 7320, s.gz, seed) * 41), where: s.name });
    }
    for (const [id, it] of this.items) if (!want.has(id)) { this.drop(it); this.items.delete(id); }
    for (const [id, w] of want) if (!this.items.has(id)) this.items.set(id, { ...w, y: NaN, obj: null, lid: null, open: this.taken.has(id) ? 1 : 0 });
  }

  /** Put an item on the ground once its chunk is in: the first open spot found round its point (never on a roof or a tree). */
  private place(it: Item): void {
    const natural = this.terrain.sample(it.x, it.z).h;
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4, r = k === 0 ? 0 : 1 + k * 0.6;
      const x = Math.floor(it.x + Math.cos(a) * r), z = Math.floor(it.z + Math.sin(a) * r);
      const y = this.ground(x, z);
      if (y === null) return; // not loaded yet
      if (Number.isNaN(y) || y > natural + 4) continue;
      it.x = x + 0.5; it.z = z + 0.5; it.y = y;
      this.build(it);
      return;
    }
    // Nowhere sensible: leave it out.
    this.items.delete(it.id);
  }

  private ground(x: number, z: number): number | null { return standY(this.world, x, z); }

  private build(it: Item): void {
    const g = new THREE.Group();
    const m = this.mats;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    };
    if (it.kind === 'pouch') {
      add(this.geo.sack, m.sack, 0, 0.15, 0);
      add(this.geo.neck, m.tie, 0, 0.34, 0);
      add(this.geo.coin, m.gold, 0.2, 0.02, 0.05);
      add(this.geo.coin, m.gold, -0.12, 0.02, 0.2);
      add(this.geo.glint, m.gold, 0.08, 0.5, 0.08);
    } else {
      add(this.geo.base, m.wood, 0, 0.25, 0);
      add(this.geo.band, m.iron, 0, 0.12, 0);
      add(this.geo.band, m.iron, 0, 0.42, 0);
      const heap = add(this.geo.heap, m.gold, 0, 0.47, 0);
      heap.name = 'heap';
      if (this.taken.has(it.id)) heap.removeFromParent();
      // The lid hinges at the back edge.
      const lid = new THREE.Group();
      lid.position.set(0, 0.5, -0.3);
      add(this.geo.lid, m.wood, 0, 0.11, 0.3, lid);
      add(this.geo.lock, m.gold, 0, 0.06, 0.61, lid);
      lid.rotation.x = -it.open * 1.9;
      g.add(lid);
      it.lid = lid;
      g.rotation.y = hash01(Math.floor(it.x), 7330, Math.floor(it.z), this.terrain.seed) * Math.PI * 2;
    }
    g.position.set(it.x, it.y, it.z);
    this.group.add(g);
    it.obj = g;
  }

  /** Dev: where the nearest items are. */
  info(px: number, pz: number): string {
    const list = [...this.items.values()].sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz)).slice(0, 6);
    return `gold ${this.stats.gold} (pouches ${this.stats.pouches}, chests ${this.stats.chests}) | ` + list.map((i) => `${i.kind} ${Math.round(i.x)},${Number.isNaN(i.y) ? '?' : i.y.toFixed(1)},${Math.round(i.z)}${this.taken.has(i.id) ? ' (open)' : ''}`).join(' | ');
  }
}
