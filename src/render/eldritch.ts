// Things of the eldritch sea. Near its dark water: giant tentacles rise, curl
// and sink back; pairs of glowing eyes open just under the surface; a vast
// shadow glides past beneath; and in each sunken temple a sleeper's eye opens
// now and then and follows the player. Out on the horizon a colossal,
// many-eyed tentacled thing rises from the sea, looms for a while and sinks.
// All designs are original.

import * as THREE from 'three';
import { buildRig, type Box } from '../creatures/rig';
import { BIOME } from '../world/biomes';
import { SEA } from '../world/blocks';
import { LM } from '../world/structures';
import { templeEye } from '../world/landmarks';
import type { ColumnSample, Terrain } from '../world/terrain';
import { createPropMaterial, type EnvUniforms } from './materials';
import type { FireFx } from './fire';

export type EldritchSound = 'tentacle' | 'colossus' | 'eye';

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** Top of the eldritch water (the water blocks fill up to SEA). */
const SURFACE = SEA + 1;
const UP = new THREE.Vector3(0, 1, 0);

interface Tentacle { x: number; z: number; yaw: number; t: number; life: number; rise: number; curl: number; seed: number; splash: number }
interface EyePair { x: number; z: number; yaw: number; t: number; life: number; blink: number }

// ------------------------------------------------------------------ far shader (colossus)

const farVertex = /* glsl */ `
attribute vec3 aColor;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vColor = aColor;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const farFragment = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
uniform vec3 uFogColor;
uniform float uNight;
uniform float uGlow;
uniform float uSea;
uniform float uFade;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  vec3 col = vColor * (uSkyAmbient * 0.75 + uSunColor * max(dot(n, uSunDir), 0.0) * 0.5);
  col += vColor * uGlow * (1.4 + 2.0 * uNight);
  float dist = length(vWorld.xz - cameraPosition.xz);
  // Distance haze, and the lower body dissolving into the sea mist.
  float fog = smoothstep(150.0, 900.0, dist) * (0.75 - 0.55 * uGlow);
  fog = max(fog, 1.0 - smoothstep(uSea - 2.0, uSea + 14.0, vWorld.y));
  fog = max(fog, uFade);
  gl_FragColor = vec4(mix(col, uFogColor, clamp(fog, 0.0, 1.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** The colossus: ~80 blocks tall, facing +z. Body, head, and hanging face tentacles. */
function colossusBody(): Box[] {
  const hide = '#22303a', dark = '#161e26', ridge = '#2e3a44', claw = '#b8b0a0';
  const out: Box[] = [
    { s: [30, 44, 22], at: [0, 22, 0], c: hide },
    { s: [26, 10, 18], at: [0, 46, -2], c: ridge },
    { s: [15, 13, 17], at: [-19, 40, -1], c: hide },
    { s: [15, 13, 17], at: [19, 40, -1], c: hide },
    // Head: a great dome with a heavy brow.
    { s: [20, 18, 18], at: [0, 58, 4], c: hide },
    { s: [16, 6, 14], at: [0, 69, 3], c: ridge },
    { s: [22, 3, 4], at: [0, 63, 13], c: dark },
    // Back spines.
    ...[0, 1, 2, 3].map((k): Box => ({ s: [2, 6 + k, 2], at: [0, 50 - k * 9, -12], c: dark })),
    // A crown of horns curving back from the dome.
    ...[-6, -2, 2, 6].map((x): Box => ({ s: [1.6, 9 - Math.abs(x) * 0.6, 1.6], at: [x, 72, -2 - Math.abs(x) * 0.4], c: claw })),
  ];
  // Pupils (slits) in front of the glowing eyes.
  for (const [x, y, s] of EYES) out.push({ s: [s * 0.22, s * 0.85, 0.4], at: [x, y, 13.4], c: '#0a0c08' });
  return out;
}

/** Five eyes of different sizes, scattered asymmetrically: [x, y, size]. */
const EYES: Array<[number, number, number]> = [[-5, 58, 4], [4.5, 59.5, 3.4], [0, 65, 2.4], [-8.5, 64, 2], [8, 54, 2.2]];

function colossusEyes(): Box[] {
  return EYES.map(([x, y, s]): Box => ({ s: [s, s * 0.9, 0.6], at: [x, y, 13.1], c: '#d8ff5a' }));
}

// ------------------------------------------------------------------ director

export class EldritchDirector {
  readonly group = new THREE.Group();
  /** Sound hook: at = null plays everywhere (the colossus is heard, not placed). */
  onSound: ((ev: EldritchSound, at: [number, number, number] | null) => void) | null = null;

  private time = 0;
  private scanT = 0;
  private spots: Array<[number, number]> = [];
  // Tentacles.
  private tentacles: Tentacle[] = [];
  private tentT = 6;
  private segs: THREE.InstancedMesh;
  private suckers: THREE.InstancedMesh;
  // Eyes in the water.
  private eyes: EyePair[] = [];
  private eyeT = 3;
  private eyeMesh: THREE.InstancedMesh;
  private pupils: THREE.InstancedMesh;
  // The passing shadow.
  private shadow: THREE.Group;
  private shadowState: { x: number; z: number; dx: number; dz: number; t: number } | null = null;
  private shadowT = 25;
  // Temple eye.
  private temple: THREE.Group;
  private lids: THREE.Mesh[] = [];
  private iris: THREE.Group;
  private templeT = 6;
  private templeOpen = 0;
  private templeState = 0; // 0 shut, 1 opening/open, 2 closing
  private templeHold = 0;
  // Colossus.
  private colossus: THREE.Group;
  private colMats: THREE.ShaderMaterial[] = [];
  private faceTentacles: THREE.Group[][] = [];
  private arms: THREE.Group[][] = [];
  private wings: THREE.Group[] = [];
  private colState: 'hidden' | 'rise' | 'loom' | 'sink' = 'hidden';
  private colT = 10;
  private colY = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(private env: EnvUniforms, shadows: boolean, private terrain: Terrain, private fire: FireFx) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.segs = new THREE.InstancedMesh(box, createPropMaterial(env, { color: '#3a2c48', shadows }), 3 * 18);
    this.suckers = new THREE.InstancedMesh(box, createPropMaterial(env, { color: '#c89ab4', shadows }), 3 * 18);
    const glowMat = new THREE.MeshBasicMaterial({ color: '#e0ff70' });
    this.eyeMesh = new THREE.InstancedMesh(box, glowMat, 16);
    this.pupils = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: '#101408' }), 16);
    for (const im of [this.segs, this.suckers, this.eyeMesh, this.pupils]) { im.count = 0; im.frustumCulled = false; this.group.add(im); }

    // A vast shape under the surface: body, head and trailing limbs, all dark and see-through.
    this.shadow = new THREE.Group();
    const shade = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.38, depthWrite: false });
    for (const [w, d, x, z] of [[9, 20, 0, 0], [13, 9, 0, 9], [3, 14, -5, -14], [3, 12, 5, -13], [2.5, 16, 0, -18], [12, 3, 0, -4]]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), shade);
      mesh.position.set(x, 0, z);
      this.shadow.add(mesh);
    }
    this.shadow.visible = false;
    this.group.add(this.shadow);

    // The sleeper's eye in the temple mound.
    this.temple = new THREE.Group();
    const sclera = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.2), createPropMaterial(env, { color: '#d8d0b0', shadows: false }));
    this.iris = new THREE.Group();
    const iris = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.12), new THREE.MeshBasicMaterial({ color: '#d8ff40' }));
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.25, 0.14), new THREE.MeshBasicMaterial({ color: '#080a04' }));
    iris.position.z = 0.1; slit.position.z = 0.12;
    this.iris.add(iris, slit);
    const lidMat = createPropMaterial(env, { color: '#2a2a32', shadows: false });
    for (const sy of [1, -1]) {
      const lid = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.9, 0.4), lidMat);
      lid.position.set(0, sy * 0.4, 0.2);
      lid.userData.sy = sy;
      this.lids.push(lid);
      this.temple.add(lid);
    }
    this.temple.add(sclera, this.iris);
    this.temple.visible = false;
    this.group.add(this.temple);

    // The colossus.
    this.colossus = new THREE.Group();
    this.colossus.add(this.farMesh(buildRig(colossusBody()), 0));
    this.colossus.add(this.farMesh(buildRig(colossusEyes()), 1));
    // Face tentacles: a thick beard of chains hanging from the lower face.
    for (let k = 0; k < 8; k++) {
      const x = (k - 3.5) * 2.5, w0 = 3.2 - Math.abs(k - 3.5) * 0.18;
      this.faceTentacles.push(this.chain(this.colossus, [x, 51, 12], 7, 6, w0, -1));
    }
    // Two vast tentacle arms rising from the shoulders and curling inwards.
    for (const sx of [-1, 1]) {
      const arm = this.chain(this.colossus, [sx * 22, 34, 4], 9, 7, 6, 1);
      arm[0].rotation.z = -sx * 0.5;
      this.arms.push(arm);
    }
    // Bat-like wings spread wide behind the shoulders: a bone with membrane panels.
    for (const sx of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(sx * 14, 50, -10);
      const boxes: Box[] = [{ s: [34, 2.4, 2.4], at: [sx * 17, 0, 0], c: '#2e3a44' }];
      for (let k = 0; k < 5; k++) {
        const x = sx * (6 + k * 6.5), h = 26 - k * 4;
        boxes.push({ s: [6, h, 0.8], at: [x, -h / 2, -0.5], c: k % 2 ? '#1a242c' : '#1e2a32' });
        boxes.push({ s: [1.2, h + 2, 1.2], at: [x + sx * 3, -h / 2, 0], c: '#2e3a44' });
      }
      wing.add(this.farMesh(buildRig(boxes), 0));
      wing.rotation.z = sx * 0.35;
      wing.rotation.y = -sx * 0.35;
      this.colossus.add(wing);
      this.wings.push(wing);
    }
    this.colossus.scale.setScalar(1.55);
    this.colossus.visible = false;
    this.group.add(this.colossus);
  }

  /** A jointed limb of `n` segments; dir -1 hangs down, +1 rises. */
  private chain(parent: THREE.Object3D, at: [number, number, number], n: number, len0: number, w0: number, dir: number): THREE.Group[] {
    const out: THREE.Group[] = [];
    for (let i = 0; i < n; i++) {
      const seg = new THREE.Group();
      const len = len0 * (1 - i * 0.06), w = w0 * (1 - (i / n) * 0.8);
      const prev = len0 * (1 - (i - 1) * 0.06);
      if (i === 0) seg.position.set(at[0], at[1], at[2]);
      else seg.position.set(0, dir * prev, 0);
      seg.add(this.farMesh(buildRig([{ s: [w, len, w], at: [0, (dir * len) / 2, 0], c: i % 2 ? '#2a3a44' : '#22303a' }]), 0));
      parent.add(seg);
      out.push(seg);
      parent = seg;
    }
    return out;
  }

  private farMesh(geo: THREE.BufferGeometry, glow: number): THREE.Mesh {
    const e = this.env;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: e.uSunDir, uSunColor: e.uSunColor, uSkyAmbient: e.uSkyAmbient, uFogColor: e.uFogColor,
        uNight: e.uNight, uGlow: { value: glow }, uSea: { value: SURFACE }, uFade: { value: 0 },
      },
      vertexShader: farVertex, fragmentShader: farFragment,
    });
    this.colMats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Deep eldritch water at (x, z)? */
  private deep(x: number, z: number, depth = 3): boolean {
    const s = this.terrain.sample(x, z);
    return s.biome === BIOME.ELDRITCH_SEA && s.h < SEA - depth;
  }

  update(dt: number, cam: THREE.Vector3, fwd: THREE.Vector3, night: number, sample: ColumnSample | null): void {
    this.time += dt;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 1.5;
      // Deep eldritch water around the listener (where tentacles, eyes and the shadow can appear).
      this.spots.length = 0;
      for (const r of [14, 24, 36, 50, 66]) for (let k = 0; k < 20; k++) {
        const a = (k / 20) * TAU + r;
        const x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
        if (this.deep(x, z)) this.spots.push([x, z]);
      }
    }
    const nearSea = this.spots.length > 3;
    this.updateTentacles(dt, nearSea);
    this.updateEyes(dt, nearSea, cam, night);
    this.updateShadow(dt, nearSea, cam);
    this.updateTemple(dt, cam, night);
    const inBiome = !!sample && (sample.biome === BIOME.ELDRITCH_SEA || sample.biome === BIOME.BLACK_BEACH || sample.eld > 0.35);
    this.updateColossus(dt, cam, fwd, inBiome);
  }

  // ------------------------------------------------------------ tentacles

  private updateTentacles(dt: number, nearSea: boolean): void {
    this.tentT -= dt;
    if (this.tentT <= 0 && nearSea && this.tentacles.length < 3) {
      this.tentT = rand(10, 24);
      const [x, z] = this.spots[Math.floor(Math.random() * this.spots.length)];
      // Sometimes two rise together.
      const n = Math.random() < 0.35 ? 2 : 1;
      for (let i = 0; i < n && this.tentacles.length < 3; i++) {
        const tx = x + (i ? rand(-6, 6) : 0), tz = z + (i ? rand(-6, 6) : 0);
        this.tentacles.push({ x: tx, z: tz, yaw: Math.random() * TAU, t: 0, life: rand(16, 30), rise: 0, curl: rand(0.18, 0.32) * (Math.random() < 0.5 ? 1 : -1), seed: Math.random() * 100, splash: 0 });
        this.onSound?.('tentacle', [tx, SURFACE, tz]);
      }
    }
    let n = 0, ns = 0;
    for (let k = this.tentacles.length - 1; k >= 0; k--) {
      const tc = this.tentacles[k];
      tc.t += dt;
      const sinking = tc.t > tc.life;
      tc.rise = Math.max(0, Math.min(1, tc.rise + dt * (sinking ? -0.22 : 0.3)));
      if (sinking && tc.rise <= 0) { this.tentacles.splice(k, 1); continue; }
      // Churn and spray where it breaks the surface.
      const moving = (!sinking && tc.rise < 1) || (sinking && tc.rise > 0);
      if (moving && Math.random() < dt * 30) this.fire.spark(tc.x + rand(-1, 1), SURFACE + 0.2, tc.z + rand(-1, 1), 0.55, 0.75, 0.7, 2, 1.6);
      const N = 18, total = N * 0.8;
      let px = tc.x, py = SURFACE - (1 - tc.rise) * (total + 1), pz = tc.z, phi = 0;
      const sway = Math.sin(this.time * 0.9 + tc.seed) * 0.12;
      const curl = tc.curl * (0.35 + 0.65 * tc.rise) * (1 + Math.sin(this.time * 0.5 + tc.seed) * 0.3);
      const sy = Math.sin(tc.yaw), cy = Math.cos(tc.yaw);
      for (let i = 0; i < N; i++) {
        const f = i / N;
        phi += curl * f * f * 2.2 + sway * f + Math.sin(this.time * 1.7 + i * 0.45 + tc.seed) * 0.05;
        const L = 1.1 - f * 0.45, w = 1.5 * (1 - f * 0.78);
        const dx = Math.sin(phi) * sy, dy = Math.cos(phi), dz = Math.sin(phi) * cy;
        this.v.set(dx, dy, dz);
        this.q.setFromUnitVectors(UP, this.v);
        this.m.compose(this.v.set(px + dx * L / 2, py + dy * L / 2, pz + dz * L / 2), this.q, this.s.set(w, L * 1.08, w));
        this.segs.setMatrixAt(n++, this.m);
        if (i % 2 === 0 && i < N - 2) {
          // Suckers on the inner side of the curl.
          const nx = -Math.cos(phi) * sy * Math.sign(tc.curl), ny = Math.sin(phi) * Math.sign(tc.curl), nz = -Math.cos(phi) * cy * Math.sign(tc.curl);
          this.m.compose(this.v.set(px + dx * L / 2 + nx * w * 0.5, py + dy * L / 2 + ny * w * 0.5, pz + dz * L / 2 + nz * w * 0.5), this.q, this.s.set(w * 0.45, L * 0.5, w * 0.45));
          this.suckers.setMatrixAt(ns++, this.m);
        }
        px += dx * L; py += dy * L; pz += dz * L;
      }
    }
    this.segs.count = n; this.suckers.count = ns;
    if (n) { this.segs.instanceMatrix.needsUpdate = true; this.suckers.instanceMatrix.needsUpdate = true; }
  }

  // ------------------------------------------------------------ eyes in the water

  private updateEyes(dt: number, nearSea: boolean, cam: THREE.Vector3, night: number): void {
    this.eyeT -= dt;
    if (this.eyeT <= 0 && nearSea && this.eyes.length < 6) {
      this.eyeT = rand(1.5, 5) * (1.5 - night);
      const near = this.spots.filter(([x, z]) => Math.hypot(x - cam.x, z - cam.z) < 40);
      if (near.length) {
        const [x, z] = near[Math.floor(Math.random() * near.length)];
        // Turned to look at the player.
        this.eyes.push({ x: x + rand(-3, 3), z: z + rand(-3, 3), yaw: Math.atan2(cam.x - x, cam.z - z), t: 0, life: rand(5, 12), blink: rand(1.5, 4) });
      }
    }
    let n = 0;
    for (let k = this.eyes.length - 1; k >= 0; k--) {
      const e = this.eyes[k];
      e.t += dt;
      if (e.t > e.life) { this.eyes.splice(k, 1); continue; }
      // Open slowly, blink now and then, close at the end.
      let open = Math.min(1, e.t / 1.2, (e.life - e.t) / 0.8);
      e.blink -= dt;
      if (e.blink < 0) { open *= Math.min(1, Math.abs(e.blink + 0.12) / 0.12); if (e.blink < -0.24) e.blink = rand(2, 5); }
      if (open <= 0.02) continue;
      const sy = Math.sin(e.yaw), cy = Math.cos(e.yaw);
      for (const side of [-1, 1]) {
        const x = e.x + cy * side * 0.55, z = e.z - sy * side * 0.55;
        this.q.setFromAxisAngle(UP, e.yaw);
        this.m.compose(this.v.set(x, SURFACE + 0.02, z), this.q, this.s.set(0.62, 0.04, 0.3 * open));
        this.eyeMesh.setMatrixAt(n, this.m);
        this.m.compose(this.v.set(x, SURFACE + 0.04, z), this.q, this.s.set(0.1, 0.04, 0.26 * open));
        this.pupils.setMatrixAt(n++, this.m);
      }
    }
    this.eyeMesh.count = n; this.pupils.count = n;
    if (n) { this.eyeMesh.instanceMatrix.needsUpdate = true; this.pupils.instanceMatrix.needsUpdate = true; }
  }

  // ------------------------------------------------------------ the shadow beneath

  private updateShadow(dt: number, nearSea: boolean, cam: THREE.Vector3): void {
    const st = this.shadowState;
    if (!st) {
      this.shadowT -= dt;
      if (this.shadowT > 0 || !nearSea) return;
      this.shadowT = rand(40, 90);
      // A path across deep water that passes near the player.
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * TAU, off = rand(8, 22);
        const cx = cam.x + Math.cos(a) * off, cz = cam.z + Math.sin(a) * off;
        const dir = a + Math.PI / 2 + rand(-0.4, 0.4);
        const dx = Math.cos(dir), dz = Math.sin(dir);
        if (!this.deep(cx, cz, 3) || !this.deep(cx - dx * 24, cz - dz * 24, 2) || !this.deep(cx + dx * 24, cz + dz * 24, 2)) continue;
        this.shadowState = { x: cx - dx * 32, z: cz - dz * 32, dx, dz, t: 0 };
        this.shadow.visible = true;
        return;
      }
      return;
    }
    st.t += dt;
    st.x += st.dx * 2.6 * dt; st.z += st.dz * 2.6 * dt;
    this.shadow.position.set(st.x, SURFACE + 0.05, st.z);
    this.shadow.rotation.y = Math.atan2(st.dx, st.dz);
    // Limbs ripple as it swims.
    this.shadow.children.forEach((c, i) => { if (i >= 2) c.rotation.y = Math.sin(this.time * 1.5 + i) * 0.2; });
    if (st.t > 26) { this.shadowState = null; this.shadow.visible = false; }
  }

  // ------------------------------------------------------------ the sleeper's eye

  private updateTemple(dt: number, cam: THREE.Vector3, night: number): void {
    const lm = this.terrain.landmarks.near(cam.x - 120, cam.z - 120, cam.x + 120, cam.z + 120, 0).find((l) => l.kind === LM.SUNKEN_TEMPLE);
    if (!lm) { this.temple.visible = false; return; }
    const at = templeEye(lm);
    this.temple.visible = true;
    this.temple.position.set(at.x, at.y, at.z);
    this.temple.rotation.y = Math.atan2(at.dx, at.dz);
    this.templeT -= dt;
    if (this.templeState === 0 && this.templeT <= 0) {
      this.templeState = 1; this.templeHold = rand(4, 9);
      this.onSound?.('eye', [at.x, at.y, at.z]);
    }
    if (this.templeState === 1) {
      this.templeOpen = Math.min(1, this.templeOpen + dt * 0.5);
      if (this.templeOpen >= 1) { this.templeHold -= dt; if (this.templeHold <= 0) this.templeState = 2; }
    } else if (this.templeState === 2) {
      this.templeOpen = Math.max(0, this.templeOpen - dt * 0.8);
      if (this.templeOpen <= 0) { this.templeState = 0; this.templeT = rand(14, 30) * (1.3 - night * 0.6); }
    }
    for (const lid of this.lids) lid.position.y = lid.userData.sy * (0.4 + this.templeOpen * 0.55);
    // The iris follows the player.
    this.temple.updateMatrixWorld();
    const local = this.temple.worldToLocal(this.v.copy(cam));
    this.iris.position.x = Math.max(-0.55, Math.min(0.55, local.x * 0.04));
    this.iris.position.y = Math.max(-0.2, Math.min(0.2, local.y * 0.03));
  }

  // ------------------------------------------------------------ the colossus on the horizon

  private updateColossus(dt: number, cam: THREE.Vector3, fwd: THREE.Vector3, inBiome: boolean): void {
    this.colT -= dt;
    if (this.colState === 'hidden') {
      if (this.colT > 0 || !inBiome) return;
      // Somewhere far out over deep eldritch water, preferably ahead of the player.
      const ahead = Math.atan2(fwd.z, fwd.x);
      for (let k = 0; k < 40; k++) {
        const a = ahead + rand(-1.2, 1.2) * (k < 25 ? 1 : 2.6), d = rand(270, 380);
        const x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d;
        if (!this.deep(x, z, 4)) continue;
        this.colossus.position.set(x, 0, z);
        this.colossus.rotation.y = Math.atan2(cam.x - x, cam.z - z);
        this.colState = 'rise'; this.colT = 16; this.colY = 0;
        this.colossus.visible = true;
        this.onSound?.('colossus', null);
        return;
      }
      this.colT = 15;
      return;
    }
    // Rises out of the sea, looms, and sinks back.
    if (this.colState === 'rise') { this.colY = Math.min(1, this.colY + dt / 16); if (this.colT <= 0) { this.colState = 'loom'; this.colT = rand(35, 60); } }
    else if (this.colState === 'loom') { if (this.colT <= 0) { this.colState = 'sink'; this.colT = 18; } }
    else if (this.colState === 'sink') {
      this.colY = Math.max(0, this.colY - dt / 18);
      if (this.colT <= 0) { this.colState = 'hidden'; this.colossus.visible = false; this.colT = rand(90, 180); }
    }
    const ease = this.colY * this.colY * (3 - 2 * this.colY);
    this.colossus.position.y = SURFACE - 125 + ease * 108 + Math.sin(this.time * 0.25) * 1.8;
    // Slowly turns its gaze; the face tentacles writhe.
    const want = Math.atan2(cam.x - this.colossus.position.x, cam.z - this.colossus.position.z);
    this.colossus.rotation.y += Math.atan2(Math.sin(want - this.colossus.rotation.y), Math.cos(want - this.colossus.rotation.y)) * Math.min(1, dt * 0.15);
    this.colossus.rotation.z = Math.sin(this.time * 0.13) * 0.03;
    this.faceTentacles.forEach((chain, k) => chain.forEach((seg, i) => {
      seg.rotation.x = Math.sin(this.time * 0.6 + k * 0.9 + i * 0.6) * (0.06 + i * 0.04) + (i === 0 ? -0.3 : -0.08);
      seg.rotation.z = Math.sin(this.time * 0.45 + k * 1.7 + i * 0.4) * (0.04 + i * 0.03);
    }));
    // The arms reach up and curl inwards, swaying slowly.
    this.arms.forEach((chain, k) => {
      const sx = k ? 1 : -1;
      chain.forEach((seg, i) => {
        if (i > 0) seg.rotation.z = sx * (0.16 + Math.sin(this.time * 0.35 + i * 0.5 + k) * 0.07);
        seg.rotation.x = 0.1 + Math.sin(this.time * 0.28 + i * 0.4 + k * 2) * 0.05;
      });
    });
    // Wings flex now and then.
    this.wings.forEach((w, k) => { const sx = k ? 1 : -1; w.rotation.z = sx * (0.35 + Math.sin(this.time * 0.2 + k) * 0.08); });
  }

  /** Dev helper: summon one of the eldritch things now. */
  dev(what: string): string {
    if (what === 'colossus') { this.colState = 'hidden'; this.colT = 0; return 'colossus queued'; }
    if (what === 'tentacle') { this.tentT = 0; return `tentacle queued (spots ${this.spots.length})`; }
    if (what === 'eyes') { this.eyeT = 0; return 'eyes queued'; }
    if (what === 'shadow') { this.shadowT = 0; return 'shadow queued'; }
    if (what === 'temple') { this.templeT = 0; return 'temple eye opens'; }
    return 'unknown';
  }

  info(): string {
    return `spots=${this.spots.length} tentacles=${this.tentacles.length} eyes=${this.eyes.length} shadow=${!!this.shadowState} colossus=${this.colState}@${this.colY.toFixed(2)} temple=${this.temple.visible ? this.templeOpen.toFixed(2) : 'none'}`;
  }
}
