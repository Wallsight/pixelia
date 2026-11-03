// Pixel particles for dragon fire, smoke and magic: square points (matching the
// voxel look), additive for flames and sparks, alpha-blended for smoke.
// CPU-simulated pools.

import * as THREE from 'three';

const vertex = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
uniform float uHalfH;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * projectionMatrix[1][1] * uHalfH / max(0.1, -mv.z);
  vColor = aColor;
}`;
const fragment = /* glsl */ `
varying vec4 vColor;
void main() {
  if (vColor.a <= 0.01) discard;
  gl_FragColor = vColor;
}`;

type PoolKind = 'fire' | 'smoke' | 'spark';

class Pool {
  readonly points: THREE.Points;
  private pos: Float32Array; private col: Float32Array; private size: Float32Array;
  private vel: Float32Array; private life: Float32Array; private max: Float32Array; private grow: Float32Array;
  /** Spark pools: each particle's own colour. */
  private base: Float32Array;
  private n = 0;
  private smoke: boolean;
  constructor(readonly cap: number, additive: boolean, private kind: PoolKind, halfH: { value: number }) {
    this.smoke = kind === 'smoke';
    this.base = new Float32Array(kind === 'spark' ? cap * 3 : 0);
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.grow = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: { uHalfH: halfH }, vertexShader: vertex, fragmentShader: fragment,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, r = 1, g = 1, b = 1): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = 0; this.max[i] = life; this.size[i] = size; this.grow[i] = grow;
    if (this.kind === 'spark') this.base.set([r, g, b], i * 3);
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) {
        // Swap-remove with the last live particle.
        const j = --this.n;
        this.pos.copyWithin(i * 3, j * 3, j * 3 + 3); this.vel.copyWithin(i * 3, j * 3, j * 3 + 3);
        this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size[i] = this.size[j]; this.grow[i] = this.grow[j];
        if (this.kind === 'spark') this.base.copyWithin(i * 3, j * 3, j * 3 + 3);
        i--;
        continue;
      }
      const k = this.life[i] / this.max[i];
      const drag = this.smoke ? 0.6 : 1.8;
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a] *= Math.max(0, 1 - drag * dt);
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      }
      this.vel[i * 3 + 1] += (this.smoke ? 1.2 : this.kind === 'spark' ? 0.6 : 2.5) * dt; // hot air rises
      this.size[i] += this.grow[i] * dt;
      const c = i * 4;
      if (this.kind === 'spark') {
        const w = 1 - k;
        this.col[c] = this.base[i * 3] * w; this.col[c + 1] = this.base[i * 3 + 1] * w; this.col[c + 2] = this.base[i * 3 + 2] * w; this.col[c + 3] = w;
      } else if (this.smoke) {
        const g = 0.25 + 0.2 * k;
        this.col[c] = g; this.col[c + 1] = g; this.col[c + 2] = g * 1.05; this.col[c + 3] = 0.55 * (1 - k);
      } else {
        // white-yellow -> orange -> deep red, fading.
        this.col[c] = 1.0;
        this.col[c + 1] = Math.max(0.1, 0.95 - k * 1.1);
        this.col[c + 2] = Math.max(0, 0.55 - k * 1.6);
        this.col[c + 3] = (1 - k) * 0.95;
      }
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }
}

export class FireFx {
  readonly group = new THREE.Group();
  private halfH = { value: 400 };
  private fire: Pool;
  private smoke: Pool;
  private sparks: Pool;

  constructor() {
    this.fire = new Pool(900, true, 'fire', this.halfH);
    this.smoke = new Pool(500, false, 'smoke', this.halfH);
    this.sparks = new Pool(600, true, 'spark', this.halfH);
    this.group.add(this.smoke.points, this.fire.points, this.sparks.points);
  }

  /** Coloured magic sparks drifting out from (x, y, z). */
  spark(x: number, y: number, z: number, r: number, g: number, b: number, n = 1, speed = 0.6): void {
    for (let i = 0; i < n; i++) {
      this.sparks.emit(x, y, z, (Math.random() - 0.5) * speed * 2, (Math.random() - 0.3) * speed * 2, (Math.random() - 0.5) * speed * 2,
        0.35 + Math.random() * 0.4, 0.14 + Math.random() * 0.12, -0.1, r, g, b);
    }
  }

  /** A cone of flame from (x,y,z) towards direction (dx,dy,dz). */
  breathe(x: number, y: number, z: number, dx: number, dy: number, dz: number, dt: number, power = 1): void {
    const n = Math.ceil(dt * 380);
    for (let i = 0; i < n; i++) {
      const sp = (13 + Math.random() * 10) * power, s = 0.5;
      this.fire.emit(x, y, z, (dx + (Math.random() - 0.5) * s) * sp, (dy + (Math.random() - 0.5) * s) * sp, (dz + (Math.random() - 0.5) * s) * sp,
        0.6 + Math.random() * 0.5, (0.35 + Math.random() * 0.3) * power, 1.9 * power);
    }
    if (Math.random() < dt * 30) this.smoke.emit(x + dx * 6 * power, y + dy * 6 * power, z + dz * 6 * power, dx * 3, 1, dz * 3, 2.5, 0.6 * power, 0.9 * power);
  }

  /** Big, slow smoke from a huge nostril or chimney, drifting along (vx, vy, vz). */
  plume(x: number, y: number, z: number, vx: number, vy: number, vz: number, n: number, size: number): void {
    for (let i = 0; i < n; i++) {
      this.smoke.emit(x + (Math.random() - 0.5) * size * 0.4, y, z + (Math.random() - 0.5) * size * 0.4,
        vx + (Math.random() - 0.5) * 0.6, vy + Math.random() * 0.5, vz + (Math.random() - 0.5) * 0.6, 3 + Math.random() * 1.5, size, size * 0.8);
    }
  }

  /** Burning on the ground (a felled animal): small flames and smoke. */
  burn(x: number, y: number, z: number, dt: number, strength = 1): void {
    if (Math.random() < dt * 40 * strength) this.fire.emit(x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.8, 0, 1.5, 0, 0.5, 0.18, 0.2);
    if (Math.random() < dt * 8 * strength) this.smoke.emit(x + (Math.random() - 0.5) * 0.6, y + 0.4, z + (Math.random() - 0.5) * 0.6, 0, 0.8, 0, 3, 0.35, 0.5);
  }

  puff(x: number, y: number, z: number, n = 8): void {
    for (let i = 0; i < n; i++) this.smoke.emit(x, y, z, (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, 1.6, 0.3, 0.7);
  }

  update(dt: number, viewportHalfHeight: number): void {
    this.halfH.value = viewportHalfHeight;
    this.fire.update(dt);
    this.smoke.update(dt);
    this.sparks.update(dt);
  }
}
