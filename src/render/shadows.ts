// Directional shadow map for the sun/moon, rendered around the player.
// Layer 1 = chunk geometry (packed positions, needs the voxel depth material);
// layer 2 = ordinary props (any depth-writing material works);
// layer 3 = creature shadow meshes that bring their own animated depth material.

import * as THREE from 'three';
import { createVoxelDepthMaterial, type EnvUniforms } from './materials';

export const LAYER_VOXEL_CASTER = 1;
export const LAYER_PROP_CASTER = 2;
export const LAYER_CREATURE_CASTER = 3;

const BIAS = new THREE.Matrix4().set(
  0.5, 0, 0, 0.5,
  0, 0.5, 0, 0.5,
  0, 0, 0.5, 0.5,
  0, 0, 0, 1,
);

export class ShadowSystem {
  readonly target: THREE.WebGLRenderTarget;
  private camera: THREE.OrthographicCamera;
  private voxelDepth: THREE.ShaderMaterial;
  private propDepth = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  private lightDir = new THREE.Vector3(0, 1, 0);
  private tmp = new THREE.Vector3();
  private texelWorld: number;
  private initialized = false;

  private frame = 0;
  private lastCenter = new THREE.Vector3(Infinity, 0, 0);

  /** every: redraw the map only every n-th frame while the player and the light stay put (phones: 2). */
  constructor(private env: EnvUniforms, readonly size = 2048, readonly radius = 90, readonly every = 1) {
    const depth = new THREE.DepthTexture(size, size);
    depth.type = THREE.UnsignedIntType;
    depth.compareFunction = THREE.LessEqualCompare;
    depth.minFilter = THREE.LinearFilter;
    depth.magFilter = THREE.LinearFilter;
    this.target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, depthTexture: depth });
    this.camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 1, 520);
    this.voxelDepth = createVoxelDepthMaterial(env);
    this.texelWorld = (radius * 2) / size;
    env.uShadowMap.value = depth;
    env.uShadowTexel.value = 1 / size;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, center: THREE.Vector3, lightDir: THREE.Vector3, strength: number): void {
    this.env.uShadowStrength.value = strength;
    if (strength <= 0.001) {
      // The depth texture must have storage before any shader samples it, or
      // every draw using it silently fails. Clear it once if never rendered.
      if (!this.initialized) {
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(this.target);
        renderer.clear(true, true, false);
        renderer.setRenderTarget(prev);
        this.initialized = true;
      }
      return;
    }
    this.initialized = true;
    // Only follow the light when it has moved noticeably: avoids shadow crawl.
    const turned = this.lightDir.angleTo(lightDir) > 0.003;
    if (this.every > 1 && ++this.frame % this.every !== 0 && !turned && center.distanceToSquared(this.lastCenter) < 1) return;
    this.lastCenter.copy(center);
    if (turned) this.lightDir.copy(lightDir);

    // Orient the camera, then snap its centre to whole shadow texels in light space.
    const cam = this.camera;
    cam.position.copy(center).addScaledVector(this.lightDir, 260);
    cam.up.set(0, 1, 0);
    if (Math.abs(this.lightDir.y) > 0.99) cam.up.set(0, 0, 1);
    cam.lookAt(center);
    cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const local = this.tmp.copy(center).applyMatrix4(inv);
    const t = this.texelWorld;
    const dx = Math.round(local.x / t) * t - local.x;
    const dy = Math.round(local.y / t) * t - local.y;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    cam.position.addScaledVector(right, dx).addScaledVector(up, dy);
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevOverride = scene.overrideMaterial;
    renderer.setRenderTarget(this.target);
    renderer.autoClear = false;
    renderer.clear(true, true, false);

    scene.overrideMaterial = this.voxelDepth;
    cam.layers.set(LAYER_VOXEL_CASTER);
    renderer.render(scene, cam);
    scene.overrideMaterial = this.propDepth;
    cam.layers.set(LAYER_PROP_CASTER);
    renderer.render(scene, cam);
    scene.overrideMaterial = null;
    cam.layers.set(LAYER_CREATURE_CASTER);
    renderer.render(scene, cam);

    scene.overrideMaterial = prevOverride;
    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevTarget);

    this.env.uShadowMatrix.value.copy(BIAS).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  }
}
