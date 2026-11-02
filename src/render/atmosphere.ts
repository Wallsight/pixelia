// Regional atmosphere: tints fog, sky and ambient light near the Ashlands and
// the eldritch waters, and drifts glowing particles (embers / motes) there.

import * as THREE from 'three';
import type { DayNight } from './daynight';
import type { EnvUniforms } from './materials';
import type { ColumnSample } from '../world/terrain';

const ASH = { fog: new THREE.Color('#6e3a33'), horizon: new THREE.Color('#d0603e'), zenith: new THREE.Color('#4a2634'), amb: new THREE.Color('#e0a08c') };
const ELD = { fog: new THREE.Color('#1f4d48'), horizon: new THREE.Color('#4a8a78'), zenith: new THREE.Color('#1b3844'), amb: new THREE.Color('#8fc8b8') };

const particleVertex = /* glsl */ `
attribute float seed;
uniform float uTime;
uniform vec3 uBox;
uniform vec3 uDrift;
uniform float uSize;
varying float vFade;
varying float vSeed;
void main() {
  // Particles live in a box that wraps around the camera.
  vec3 p = position + uDrift * uTime * (0.6 + seed * 0.8);
  p.x += sin(uTime * 0.7 + seed * 40.0) * 1.2;
  p.z += cos(uTime * 0.5 + seed * 30.0) * 1.2;
  p = mod(p - cameraPosition + uBox * 0.5, uBox) + cameraPosition - uBox * 0.5;
  vec3 rel = (p - cameraPosition) / (uBox * 0.5);
  vFade = 1.0 - smoothstep(0.6, 1.0, max(max(abs(rel.x), abs(rel.y)), abs(rel.z)));
  vSeed = seed;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.6 + seed) * 300.0 / -mv.z;
}
`;

const particleFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
varying float vFade;
varying float vSeed;
void main() {
  // Square pixel particles, flickering.
  float flicker = 0.6 + 0.4 * sin(uTime * (3.0 + vSeed * 6.0) + vSeed * 50.0);
  gl_FragColor = vec4(uColor * flicker, vFade * uIntensity);
  #include <colorspace_fragment>
}
`;

function makeParticles(env: EnvUniforms, count: number, color: string, drift: THREE.Vector3, size: number): THREE.Points {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * 64;
    pos[i * 3 + 1] = Math.random() * 36;
    pos[i * 3 + 2] = Math.random() * 64;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: env.uTime,
      uBox: { value: new THREE.Vector3(64, 36, 64) },
      uDrift: { value: drift },
      uSize: { value: size },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: 0 },
    },
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  return pts;
}

export class Atmosphere {
  readonly group = new THREE.Group();
  /** Smoothed regional weights (0..1). */
  ash = 0;
  eld = 0;
  private embers: THREE.Points;
  private motes: THREE.Points;
  private tmp = new THREE.Color();

  constructor(private env: EnvUniforms, private daynight: DayNight) {
    this.embers = makeParticles(env, 700, '#ff9a4a', new THREE.Vector3(0.4, 1.6, 0.2), 0.09);
    this.motes = makeParticles(env, 500, '#7af0d0', new THREE.Vector3(0.3, 0.15, -0.25), 0.07);
    this.group.add(this.embers, this.motes);
  }

  /** target: the column sample under the player (sampled a few times per second). */
  update(dt: number, target: ColumnSample | null): void {
    const k = Math.min(1, dt * 0.8);
    const ashT = target ? target.ash : 0;
    const eldT = target ? target.eld * (1 - target.land * 0.75) : 0;
    this.ash += (ashT - this.ash) * k;
    this.eld += (eldT - this.eld) * k;

    const day = 1 - this.daynight.night * 0.7;
    const u = this.env;
    const blend = (c: THREE.Color, to: THREE.Color, w: number) => c.lerp(this.tmp.copy(to).multiplyScalar(day), w);
    for (const [region, w] of [[ASH, this.ash * 0.8], [ELD, this.eld * 0.75]] as const) {
      if (w <= 0.001) continue;
      blend(u.uFogColor.value, region.fog, w);
      blend(this.daynight.horizon, region.horizon, w);
      blend(this.daynight.zenith, region.zenith, w * 0.8);
      blend(u.uSkyAmbient.value, region.amb, w * 0.5);
    }
    (this.embers.material as THREE.ShaderMaterial).uniforms.uIntensity.value = this.ash;
    (this.motes.material as THREE.ShaderMaterial).uniforms.uIntensity.value = this.eld * (0.5 + 0.5 * this.daynight.night);
    this.embers.visible = this.ash > 0.01;
    this.motes.visible = this.eld > 0.01;
  }
}
