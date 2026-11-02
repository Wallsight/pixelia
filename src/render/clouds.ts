// A drifting layer of blocky pastel clouds high above the terrain.

import * as THREE from 'three';
import type { EnvUniforms } from './materials';

export const CLOUD_Y = 158;

const vertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const fragment = /* glsl */ `
uniform float uTime;
uniform vec3 uFogColor;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
varying vec3 vWorld;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float clouds(vec2 cell) {
  return vnoise(cell * 0.11) * 0.6 + vnoise(cell * 0.27 + 19.1) * 0.3 + vnoise(cell * 0.6 - 7.3) * 0.1;
}

void main() {
  vec2 w = vWorld.xz + vec2(uTime * 2.2, uTime * 0.8);
  vec2 cell = floor(w / 12.0);
  float n = clouds(cell);
  if (n < 0.58) discard;
  // Cells on the cloud rim are a little darker: reads as thickness from below.
  float rim = min(min(clouds(cell + vec2(1, 0)), clouds(cell - vec2(1, 0))), min(clouds(cell + vec2(0, 1)), clouds(cell - vec2(0, 1))));
  float edge = rim < 0.58 ? 0.88 : 1.0;
  vec3 base = vec3(1.0, 0.96, 0.98);
  vec3 col = base * (uSkyAmbient * 0.9 + uSunColor * 0.55) * edge;
  float dist = length(vWorld.xz - cameraPosition.xz);
  col = mix(col, uFogColor, smoothstep(150.0, 600.0, dist) * 0.7);
  float alpha = 0.85 * (1.0 - smoothstep(380.0, 640.0, dist));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Clouds {
  readonly mesh: THREE.Mesh;

  constructor(env: EnvUniforms) {
    const geo = new THREE.PlaneGeometry(1400, 1400);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: env.uTime, uFogColor: env.uFogColor, uSunColor: env.uSunColor, uSkyAmbient: env.uSkyAmbient },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  update(camera: THREE.Camera): void {
    this.mesh.position.set(Math.round(camera.position.x / 12) * 12, CLOUD_Y, Math.round(camera.position.z / 12) * 12);
  }
}
