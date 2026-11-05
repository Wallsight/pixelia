// Doors of the village and city houses: the doorways in the voxel plan are
// open, and a plank leaf on a hinge stands in each. A door swings inwards when
// the player (or a villager) comes close and closes again behind them. Only the doors of the
// settlements around the player exist.

import * as THREE from 'three';
import { SITE_CITY, SITE_VILLAGE } from '../world/structures';
import { doorCells, villageLayout } from '../world/village';
import type { Terrain } from '../world/terrain';
import { createPropMaterial, type EnvUniforms } from './materials';

interface Door {
  /** Hinge post position and the leaf's yaw when shut (local +x along the wall, +z into the house). */
  hx: number; hy: number; hz: number; yaw: number;
  /** Cell centre, to measure the player's distance. */
  x: number; z: number;
  /** 0 shut .. 1 open. */
  angle: number;
}

const NEAR = 70;
const OPEN_AT = 2.4;
const MAX = 320;
/** Parts of a leaf, in leaf space (x from the hinge along the leaf). */
const PARTS: Array<{ mesh: 0 | 1 | 2; at: [number, number, number] }> = [
  { mesh: 0, at: [0.44, 0.97, 0] }, { mesh: 1, at: [0.44, 0.4, 0] }, { mesh: 1, at: [0.44, 1.55, 0] }, { mesh: 2, at: [0.76, 0.95, 0] },
];

/** Every door is drawn by three instanced meshes (planks, iron bands, brass knob): a few draw calls for a whole town. */
export class DoorDirector {
  readonly group = new THREE.Group();
  private doors = new Map<string, Door>();
  private scan = 0;
  private meshes: THREE.InstancedMesh[];
  private dirty = true;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);

  constructor(private terrain: Terrain, env: EnvUniforms, shadows: boolean) {
    const mats = [
      createPropMaterial(env, { color: '#7a5432', shadows }), createPropMaterial(env, { color: '#3a2a1c', shadows }), createPropMaterial(env, { color: '#d8b04a', shadows }),
    ];
    const geos = [new THREE.BoxGeometry(0.86, 1.94, 0.1), new THREE.BoxGeometry(0.88, 0.08, 0.12), new THREE.BoxGeometry(0.08, 0.08, 0.16)];
    this.meshes = geos.map((g, i) => {
      const mesh = new THREE.InstancedMesh(g, mats[i], i === 1 ? MAX * 2 : MAX);
      mesh.count = 0;
      mesh.frustumCulled = false; // instances spread over a whole town
      this.group.add(mesh);
      return mesh;
    });
  }

  /** others: villagers about (they open doors too). */
  update(dt: number, px: number, pz: number, others: ReadonlyArray<{ x: number; z: number }> = []): void {
    this.scan -= dt;
    if (this.scan <= 0) { this.scan = 1; this.refresh(px, pz); }
    for (const d of this.doors.values()) {
      // Cheap first: only doors near the player or with someone right at them move.
      let want = Math.abs(d.x - px) < OPEN_AT && Math.abs(d.z - pz) < OPEN_AT && Math.hypot(d.x - px, d.z - pz) < OPEN_AT ? 1 : 0;
      if (!want && Math.abs(d.x - px) < NEAR && Math.abs(d.z - pz) < NEAR) {
        for (const o of others) if (Math.abs(d.x - o.x) < 1.6 && Math.abs(d.z - o.z) < 1.6) { want = 1; break; }
      }
      if (d.angle === want) continue;
      d.angle = want > d.angle ? Math.min(want, d.angle + dt * 3) : Math.max(want, d.angle - dt * 2);
      this.dirty = true;
    }
    if (this.dirty) this.write();
  }

  /** Doors of every house within reach; the rest are dropped. */
  private refresh(px: number, pz: number): void {
    const keep = new Set<string>();
    const sites = this.terrain.structures.sitesNear(px - 260, pz - 260, px + 260, pz + 260, 0).filter((s) => s.kind === SITE_VILLAGE || s.kind === SITE_CITY);
    for (const site of sites) {
      const L = villageLayout(this.terrain, site);
      if (Math.hypot(site.x - px, site.z - pz) > L.radius + NEAR) continue;
      for (const h of L.houses) {
        if (Math.hypot(h.doorX - px, h.doorZ - pz) > NEAR) continue;
        const rx = -h.fz, rz = h.fx;
        for (const lx of doorCells(h)) {
          const x = h.cx + lx * rx + h.hd * h.fx, z = h.cz + lx * rz + h.hd * h.fz;
          const key = `${x},${z}`;
          keep.add(key);
          if (!this.doors.has(key) && this.doors.size < MAX) {
            this.doors.set(key, { hx: x + 0.5 - rx * 0.45, hy: h.y + 1, hz: z + 0.5 - rz * 0.45, yaw: Math.atan2(-rz, rx), x: x + 0.5, z: z + 0.5, angle: 0 });
            this.dirty = true;
          }
        }
      }
    }
    for (const key of this.doors.keys()) if (!keep.has(key)) { this.doors.delete(key); this.dirty = true; }
  }

  /** Instance matrices: hinge, then the leaf turned by its swing, then each part along the leaf. */
  private write(): void {
    this.dirty = false;
    const counts = [0, 0, 0];
    for (const d of this.doors.values()) {
      const yaw = d.yaw - d.angle * (Math.PI / 2) * 0.95;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      this.q.setFromAxisAngle(this.up, yaw);
      for (const p of PARTS) {
        // Rotate the part's offset about Y by yaw (three.js: x' = x cos + z sin, z' = -x sin + z cos).
        const [ox, oy, oz] = p.at;
        this.v.set(d.hx + ox * c + oz * s, d.hy + oy, d.hz - ox * s + oz * c);
        this.m.compose(this.v, this.q, this.one);
        this.meshes[p.mesh].setMatrixAt(counts[p.mesh]++, this.m);
      }
    }
    this.meshes.forEach((mesh, i) => { mesh.count = counts[i]; mesh.instanceMatrix.needsUpdate = true; });
  }
}
