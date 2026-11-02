// Sky dome: horizon gradient, square pixel sun and moon, twinkling pixel stars.

import * as THREE from 'three';
import type { DayNight } from './daynight';
import type { EnvUniforms } from './materials';

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always on the far plane
}
`;

const fragment = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uFogColor;
uniform float uNight;
uniform float uTime;
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

// Pixel-grid coordinates of d inside a square body centred on dir (size = half-width).
vec2 bodyUV(vec3 d, vec3 dir, float size, out float inside) {
  vec3 r = normalize(cross(dir, vec3(0.0, 1.0, 0.0001)));
  vec3 u = cross(r, dir);
  float facing = dot(d, dir);
  vec2 q = vec2(dot(d, r), dot(d, u)) / max(facing, 1e-4);
  inside = step(0.0, facing) * step(max(abs(q.x), abs(q.y)), size);
  return q / size * 0.5 + 0.5; // 0..1 across the body
}

void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.5));
  col = mix(col, uFogColor, smoothstep(0.16, -0.02, up));
  col = mix(col, uFogColor * 0.85, smoothstep(0.0, -0.4, up));

  // Stars: one hashed cell per pixel-sized patch of a cube-mapped sky.
  if (uNight > 0.01 && up > -0.05) {
    vec3 a = abs(d);
    vec2 f = a.x > a.y && a.x > a.z ? d.yz / a.x : a.y > a.z ? d.xz / a.y : d.xy / a.z;
    float face = a.x > a.y && a.x > a.z ? sign(d.x) : a.y > a.z ? 2.0 * sign(d.y) : 3.0 * sign(d.z);
    vec2 cell = floor(f * 260.0);
    float h = hash(vec3(cell, face));
    if (h > 0.9965) {
      float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 40.0) + h * 100.0);
      vec3 tint = mix(vec3(1.0, 0.85, 0.95), vec3(0.8, 0.9, 1.0), fract(h * 977.0));
      col += tint * tw * uNight * smoothstep(-0.05, 0.25, up) * 1.4;
    }
  }

  // Sun: 8x8 pixel square with a soft glow.
  float inSun;
  vec2 su = bodyUV(d, uSunDir, 0.06, inSun);
  vec2 sp = floor(su * 8.0);
  float sunEdge = (sp.x == 0.0 || sp.x == 7.0 || sp.y == 0.0 || sp.y == 7.0) ? 0.75 : 1.0;
  col = mix(col, vec3(1.0, 0.93, 0.78) * 2.6 * sunEdge, inSun);
  col += vec3(1.0, 0.8, 0.65) * pow(max(dot(d, uSunDir), 0.0), 18.0) * 0.35 * (1.0 - uNight);

  // Moon: 8x8 pixel square with darker crater pixels.
  float inMoon;
  vec2 mu = bodyUV(d, uMoonDir, 0.045, inMoon);
  vec2 mp = floor(mu * 8.0);
  float crater = hash(vec3(mp, 7.0)) > 0.78 ? 0.72 : 1.0;
  col = mix(col, vec3(0.92, 0.92, 1.0) * 1.6 * crater, inMoon);
  col += vec3(0.6, 0.65, 1.0) * pow(max(dot(d, uMoonDir), 0.0), 40.0) * 0.25 * uNight;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  private uniforms: Record<string, THREE.IUniform>;

  constructor(env: EnvUniforms, private daynight: DayNight) {
    this.uniforms = {
      uSunDir: { value: daynight.sunDir },
      uMoonDir: { value: daynight.moonDir },
      uZenith: { value: daynight.zenith },
      uHorizon: { value: daynight.horizon },
      uFogColor: env.uFogColor,
      uNight: { value: 0 },
      uTime: env.uTime,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  update(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
    this.uniforms.uNight.value = this.daynight.night;
  }
}
