// Far silhouette of the dark tower. Chunks only load ~190 blocks out, so the
// tower would pop in late; this low-poly stand-in sits just inside the voxel
// tower (hidden once the real one loads) and uses a much longer fog range, so
// the tower and its burning eye read from far across the land.

import * as THREE from 'three';
import { buildRig, type Box } from '../creatures/rig';
import { darkTowerHeight, darkTowerRadius } from '../world/landmarks';
import type { EnvUniforms } from './materials';

const vertex = /* glsl */ `
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

const fragment = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
uniform vec3 uFogColor;
uniform float uNight;
uniform float uGlow;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  vec3 col = vColor * (uSkyAmbient * 0.7 + uSunColor * max(dot(n, uSunDir), 0.0) * 0.6);
  col += vColor * uGlow * (1.2 + 1.5 * uNight);
  float dist = length(vWorld.xz - cameraPosition.xz);
  float fog = smoothstep(220.0, 1150.0, dist) * (0.8 - 0.5 * uGlow);
  gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function haloTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,200,90,1)');
  grad.addColorStop(0.25, 'rgba(255,110,30,0.6)');
  grad.addColorStop(1, 'rgba(255,60,10,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class TowerBeacon {
  readonly group = new THREE.Group();
  private halo: THREE.Sprite;
  private time = 0;

  constructor(private env: EnvUniforms, x: number, z: number, floorY: number) {
    const H = darkTowerHeight(floorY);
    const inset = 0.3;
    const cx = x + 0.5, cz = z + 0.5;
    const shell: Box[] = [];
    // Shaft: one box per run of equal radius (matches the voxel builder).
    let y0 = 0;
    for (let y = 1; y <= H + 1; y++) {
      if (y <= H && darkTowerRadius(y, H) === darkTowerRadius(y0, H)) continue;
      const r = darkTowerRadius(y0, H) + 0.5 - inset;
      shell.push({ s: [r * 2, y - y0, r * 2], at: [cx, floorY + (y0 + y) / 2, cz], c: '#1c1418' });
      y0 = y;
    }
    // Horns (local x axis; the tower is never rotated).
    for (let k = 0; k < 10; k++) {
      const inward = Math.floor(k / 4);
      for (const sx of [-1, 1]) {
        shell.push({ s: [1 - inset, 1 - inset, 1 - inset], at: [cx + sx * (3 - inward), floorY + H + 1 + k + 0.5, cz], c: '#140e12' });
      }
    }
    const eye: Box[] = [{ s: [3.6, 4.4, 1 - inset], at: [cx, floorY + H + 6.5, cz], c: '#ff6a18' }];
    this.group.add(this.mesh(buildRig(shell), 0));
    this.group.add(this.mesh(buildRig(eye), 1));

    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
    }));
    this.halo.position.set(cx, floorY + H + 6.5, cz);
    this.halo.scale.setScalar(18);
    this.group.add(this.halo);
  }

  private mesh(geo: THREE.BufferGeometry, glow: number): THREE.Mesh {
    const e = this.env;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: e.uSunDir, uSunColor: e.uSunColor, uSkyAmbient: e.uSkyAmbient, uFogColor: e.uFogColor,
        uNight: e.uNight, uGlow: { value: glow },
      },
      vertexShader: vertex,
      fragmentShader: fragment,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    return m;
  }

  update(dt: number, night: number, camera: THREE.Vector3): void {
    this.time += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 1.4);
    (this.halo.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.35 + 0.55 * night + 0.15 * pulse);
    // Grow with distance so the eye stays a readable beacon on the horizon.
    const far = Math.max(1, this.halo.position.distanceTo(camera) / 220);
    this.halo.scale.setScalar((16 + 4 * pulse + 12 * night) * far);
  }
}
