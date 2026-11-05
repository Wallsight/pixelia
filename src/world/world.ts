// Main-thread chunk manager: schedules generation on a worker pool, builds
// GPU meshes from the results and answers block queries for physics.

import * as THREE from 'three';
import { B, CHUNK, HEIGHT } from './blocks';
import type { ChunkResult, WorkerRequest } from './worker';
import type { MeshData } from './mesher';
import { createVoxelMaterial, type EnvUniforms } from '../render/materials';
import { LAYER_VOXEL_CASTER } from '../render/shadows';
import { SignFactory } from '../render/signs';

interface Chunk {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  group: THREE.Group;
  signs: THREE.Group[];
}

const key = (cx: number, cz: number) => `${cx},${cz}`;

export class World {
  readonly group = new THREE.Group();
  renderDistance: number;
  private chunks = new Map<string, Chunk>();
  private pending = new Set<string>();
  private workers: Worker[] = [];
  /** Chunk keys each worker is working on, with the time they were sent. */
  private busy: Array<Map<string, number>> = [];
  /** How often each chunk had to be re-requested (worker error or timeout). */
  private retries = new Map<string, number>();
  private queue: Array<[number, number]> = [];
  private materials: Record<'opaque' | 'plants' | 'water', THREE.ShaderMaterial>;
  private lastCenter = '';
  private maxInFlight: number;
  private signFactory: SignFactory;
  /** Called with a short message when chunk generation fails (shown on the loading screen). */
  onError: ((msg: string) => void) | null = null;

  constructor(seed: number, env: EnvUniforms, renderDistance: number, shadows: boolean) {
    this.renderDistance = renderDistance;
    this.materials = {
      opaque: createVoxelMaterial(env, 'opaque', shadows),
      plants: createVoxelMaterial(env, 'plants', shadows),
      water: createVoxelMaterial(env, 'water', shadows),
    };
    this.signFactory = new SignFactory(env, shadows);
    const n = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    this.maxInFlight = 2;
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<ChunkResult>) => {
        // A late answer for a chunk that was already re-requested elsewhere is dropped.
        if (!this.busy[i].delete(key(e.data.cx, e.data.cz))) return;
        this.onChunk(e.data);
      };
      w.onerror = (e) => {
        e.preventDefault();
        const msg = e.message || 'worker could not start';
        console.error('world worker error', msg);
        this.onError?.(msg);
        this.requeue(i);
      };
      const init: WorkerRequest = { type: 'init', seed };
      w.postMessage(init);
      this.workers.push(w);
      this.busy.push(new Map());
    }
  }

  /** Puts a worker's unfinished chunks back at the front of the queue (or only the stale ones). */
  private requeue(i: number, olderThan = -1): void {
    const now = performance.now();
    for (const [k, sent] of this.busy[i]) {
      if (olderThan >= 0 && now - sent < olderThan) continue;
      this.busy[i].delete(k);
      this.pending.delete(k);
      const n = (this.retries.get(k) ?? 0) + 1;
      this.retries.set(k, n);
      if (n > 4) { this.onError?.(`chunk ${k} failed ${n - 1} times`); continue; }
      const [cx, cz] = k.split(',').map(Number);
      this.queue.unshift([cx, cz]);
    }
  }

  get loadedCount(): number { return this.chunks.size; }
  get pendingCount(): number { return this.pending.size + this.queue.length; }

  isLoaded(x: number, z: number): boolean {
    return this.chunks.has(key(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
  }

  /** Block id at world coordinates, or -1 if the chunk is not loaded yet. */
  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(key(cx, cz));
    if (!c) return -1;
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    return c.blocks[(y * CHUNK + lz) * CHUNK + lx];
  }

  /** Highest non-air block in a column, or -1 if not loaded. */
  surfaceY(x: number, z: number): number {
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b === -1) return -1;
      if (b !== B.AIR) return y;
    }
    return 0;
  }

  update(px: number, pz: number): void {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    const center = key(pcx, pcz);
    const R = this.renderDistance;

    if (center !== this.lastCenter) {
      this.lastCenter = center;
      // Unload chunks well outside the view distance (hysteresis avoids thrash).
      for (const [k, c] of this.chunks) {
        if (Math.hypot(c.cx - pcx, c.cz - pcz) > R + 2) this.unload(k, c);
      }
      // Rebuild the request queue, nearest first.
      const wanted: Array<[number, number, number]> = [];
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.hypot(dx, dz);
          if (d > R + 0.5) continue;
          const cx = pcx + dx, cz = pcz + dz;
          const k = key(cx, cz);
          if (this.chunks.has(k) || this.pending.has(k)) continue;
          wanted.push([cx, cz, d]);
        }
      }
      wanted.sort((a, b) => a[2] - b[2]);
      this.queue = wanted.map(([cx, cz]) => [cx, cz]);
    }
    // A worker that went quiet (crashed or was killed by the browser) must not stall loading forever.
    for (let i = 0; i < this.workers.length; i++) this.requeue(i, 20000);
    this.dispatch();
  }

  private dispatch(): void {
    while (this.queue.length) {
      let best = -1;
      for (let i = 0; i < this.workers.length; i++) {
        const n = this.busy[i].size;
        if (n < this.maxInFlight && (best < 0 || n < this.busy[best].size)) best = i;
      }
      if (best < 0) return;
      const [cx, cz] = this.queue.shift()!;
      const k = key(cx, cz);
      if (this.chunks.has(k) || this.pending.has(k)) continue;
      this.pending.add(k);
      this.busy[best].set(k, performance.now());
      const req: WorkerRequest = { type: 'gen', cx, cz };
      this.workers[best].postMessage(req);
    }
  }

  private onChunk(r: ChunkResult): void {
    const k = key(r.cx, r.cz);
    this.pending.delete(k);
    this.retries.delete(k);
    // Dropped while in flight (player moved far away)?
    const [pcx, pcz] = this.lastCenter.split(',').map(Number);
    if (Math.hypot(r.cx - pcx, r.cz - pcz) > this.renderDistance + 2) { this.dispatch(); return; }

    const group = new THREE.Group();
    group.position.set(r.cx * CHUNK, 0, r.cz * CHUNK);
    group.matrixAutoUpdate = false;
    group.updateMatrix();
    for (const pass of ['opaque', 'plants', 'water'] as const) {
      const mesh = this.buildMesh(r[pass], this.materials[pass]);
      if (mesh) {
        if (pass === 'water') mesh.renderOrder = 1;
        if (pass === 'opaque') mesh.layers.enable(LAYER_VOXEL_CASTER);
        group.add(mesh);
      }
    }
    const signs = r.signs.map((s) => this.signFactory.build(s));
    for (const s of signs) this.group.add(s);
    this.group.add(group);
    this.chunks.set(k, { cx: r.cx, cz: r.cz, blocks: r.blocks, group, signs });
    this.dispatch();
  }

  private buildMesh(m: MeshData, material: THREE.Material): THREE.Mesh | null {
    if (m.index.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
    geo.setAttribute('data', new THREE.BufferAttribute(m.data, 4));
    geo.setIndex(new THREE.BufferAttribute(m.index, 1));
    // Positions are stored in 1/8 units, so set bounds explicitly for frustum culling.
    let maxY = 0;
    for (let i = 1; i < m.position.length; i += 3) if (m.position[i] > maxY) maxY = m.position[i];
    const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(CHUNK, maxY / 8 + 1, CHUNK));
    geo.boundingBox = box;
    geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geo, material);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  private unload(k: string, c: Chunk): void {
    for (const child of c.group.children) (child as THREE.Mesh).geometry.dispose();
    this.group.remove(c.group);
    for (const s of c.signs) { this.group.remove(s); this.signFactory.dispose(s); }
    this.chunks.delete(k);
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    for (const [k, c] of this.chunks) this.unload(k, c);
  }
}
