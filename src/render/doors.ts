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
  root: THREE.Group;
  /** Turns about the hinge: 0 shut, -90 degrees open (into the house). */
  swing: THREE.Group;
  /** Cell centre, to measure the player's distance. */
  x: number; z: number;
  angle: number;
}

const NEAR = 70;
const OPEN_AT = 2.4;

export class DoorDirector {
  readonly group = new THREE.Group();
  private doors = new Map<string, Door>();
  private scan = 0;
  private leafGeo = new THREE.BoxGeometry(0.86, 1.94, 0.1);
  private bandGeo = new THREE.BoxGeometry(0.88, 0.08, 0.12);
  private knobGeo = new THREE.BoxGeometry(0.08, 0.08, 0.16);
  private wood: THREE.Material;
  private iron: THREE.Material;
  private brass: THREE.Material;

  constructor(private terrain: Terrain, env: EnvUniforms, shadows: boolean) {
    this.wood = createPropMaterial(env, { color: '#7a5432', shadows });
    this.iron = createPropMaterial(env, { color: '#3a2a1c', shadows });
    this.brass = createPropMaterial(env, { color: '#d8b04a', shadows });
  }

  /** others: villagers about (they open doors too). */
  update(dt: number, px: number, pz: number, others: ReadonlyArray<{ x: number; z: number }> = []): void {
    this.scan -= dt;
    if (this.scan <= 0) { this.scan = 1; this.refresh(px, pz); }
    for (const d of this.doors.values()) {
      const near = (o: { x: number; z: number }) => Math.abs(d.x - o.x) < 1.6 && Math.abs(d.z - o.z) < 1.6;
      const want = Math.hypot(d.x - px, d.z - pz) < OPEN_AT || others.some(near) ? 1 : 0;
      if (d.angle === want) continue;
      d.angle = want > d.angle ? Math.min(want, d.angle + dt * 3) : Math.max(want, d.angle - dt * 2);
      d.swing.rotation.y = -d.angle * (Math.PI / 2) * 0.95;
    }
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
          if (!this.doors.has(key)) this.doors.set(key, this.make(x, h.y + 1, z, rx, rz));
        }
      }
    }
    for (const [key, d] of this.doors) if (!keep.has(key)) { this.group.remove(d.root); this.doors.delete(key); }
  }

  /** A leaf hinged at one edge of the doorway, swinging into the house. */
  private make(x: number, y: number, z: number, rx: number, rz: number): Door {
    // Root: at the hinge, local +x along the wall (the house's right), local +z into the house.
    const root = new THREE.Group();
    root.position.set(x + 0.5 - rx * 0.45, y, z + 0.5 - rz * 0.45);
    root.rotation.y = Math.atan2(-rz, rx);
    const swing = new THREE.Group();
    const board = new THREE.Mesh(this.leafGeo, this.wood);
    board.position.set(0.44, 0.97, 0);
    const b1 = new THREE.Mesh(this.bandGeo, this.iron); b1.position.set(0.44, 0.4, 0);
    const b2 = new THREE.Mesh(this.bandGeo, this.iron); b2.position.set(0.44, 1.55, 0);
    const knob = new THREE.Mesh(this.knobGeo, this.brass); knob.position.set(0.76, 0.95, 0);
    swing.add(board, b1, b2, knob);
    root.add(swing);
    this.group.add(root);
    return { root, swing, x: x + 0.5, z: z + 0.5, angle: 0 };
  }
}
