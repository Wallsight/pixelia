// Custom shaders. Lighting is computed per fragment from one shared set of
// environment uniforms (updated by the day/night cycle and the shadow pass),
// so voxels, props and creatures all light, shadow and fog identically.

import * as THREE from 'three';

export interface EnvUniforms {
  uTiles: { value: THREE.DataArrayTexture };
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSkyAmbient: { value: THREE.Color };
  uGroundAmbient: { value: THREE.Color };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  uNight: { value: number };
  uShadowMap: { value: THREE.DepthTexture | null };
  uShadowMatrix: { value: THREE.Matrix4 };
  uShadowStrength: { value: number };
  uShadowTexel: { value: number };
}

export function createEnvUniforms(tiles: THREE.DataArrayTexture): EnvUniforms {
  return {
    uTiles: { value: tiles },
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() },
    uSunColor: { value: new THREE.Color(1.0, 0.95, 0.88) },
    uSkyAmbient: { value: new THREE.Color(0.6, 0.68, 0.86) },
    uGroundAmbient: { value: new THREE.Color(0.42, 0.38, 0.4) },
    uFogColor: { value: new THREE.Color('#d6e3f6') },
    uFogNear: { value: 100 },
    uFogFar: { value: 180 },
    uNight: { value: 0 },
    uShadowMap: { value: null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uShadowStrength: { value: 1 },
    uShadowTexel: { value: 1 / 2048 },
  };
}

/** Shared lighting, shadow and fog functions (fragment stage). */
const LIGHTING = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
uniform vec3 uGroundAmbient;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uNight;

#ifdef USE_SHADOWS
precision highp sampler2DShadow;
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowStrength;
uniform float uShadowTexel;

float shadowFactor(vec3 world, vec3 n, float ndl) {
  vec3 p = (uShadowMatrix * vec4(world + n * 0.07, 1.0)).xyz;
  vec2 edge = abs(p.xy - 0.5);
  float fade = smoothstep(0.5, 0.4, max(edge.x, edge.y));
  if (fade <= 0.0 || p.z >= 1.0) return 1.0;
  float z = p.z - (0.00025 + 0.0007 * (1.0 - ndl));
  float t = uShadowTexel;
  float s = texture(uShadowMap, vec3(p.xy + vec2(-0.6, -0.6) * t, z))
          + texture(uShadowMap, vec3(p.xy + vec2( 0.6, -0.6) * t, z))
          + texture(uShadowMap, vec3(p.xy + vec2(-0.6,  0.6) * t, z))
          + texture(uShadowMap, vec3(p.xy + vec2( 0.6,  0.6) * t, z));
  return mix(1.0, s * 0.25, fade * uShadowStrength);
}
#else
float shadowFactor(vec3 world, vec3 n, float ndl) { return 1.0; }
#endif

/** albedo is linear; ao in [0,1]; ndl < 0 means "derive from normal". */
vec3 shade(vec3 albedo, vec3 n, vec3 world, float ao, float ndlOverride) {
  float ndl = ndlOverride >= 0.0 ? ndlOverride : max(dot(n, uSunDir), 0.0);
  float sh = ndl > 0.0 ? shadowFactor(world, n, max(dot(n, uSunDir), 0.0)) : 1.0;
  vec3 ambient = mix(uGroundAmbient, uSkyAmbient, n.y * 0.5 + 0.5);
  return albedo * (ambient * ao + uSunColor * ndl * sh * (0.55 + 0.45 * ao));
}

vec3 applyFog(vec3 col, vec3 world) {
  float dist = length(world.xz - cameraPosition.xz);
  float fog = smoothstep(uFogNear, uFogFar, dist);
  // Low-lying haze in valleys for depth.
  fog = max(fog, smoothstep(30.0, -10.0, world.y - 52.0) * smoothstep(uFogNear * 0.2, uFogFar, dist) * 0.25);
  return mix(col, uFogColor, fog);
}
`;

// ------------------------------------------------------------------ voxels

const voxelVertex = /* glsl */ `
attribute vec4 data;
uniform float uTime;
varying vec3 vUv;
varying float vAo;
varying float vEmit;
varying vec3 vNormal;
varying vec3 vWorld;

const vec3 NORMALS[7] = vec3[7](
  vec3(1.0, 0.0, 0.0), vec3(-1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0),
  vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0), vec3(0.0, 1.0, 0.0)
);

void main() {
  int face = int(data.y + 0.5);
  int packed = int(data.w + 0.5);
  int corner = packed & 3;
  float crop = float(packed >> 2) / 8.0;
  vec2 uv = vec2((corner == 1 || corner == 2) ? 1.0 : 0.0, corner >= 2 ? 1.0 : 0.0);
  // Side faces of partial blocks show the top part of the tile, not a squashed copy.
  if (face != 2 && face != 3 && corner < 2) uv.y = 1.0 - crop;
  vec4 world = modelMatrix * vec4(position / 8.0, 1.0);

#ifdef PLANT
  // Sway the upper edge of plant sprites in the wind.
  if (corner >= 2) {
    float t = uTime * 1.7 + world.x * 0.37 + world.z * 0.29;
    world.x += sin(t) * 0.09 + sin(t * 2.3) * 0.03;
    world.z += cos(t * 0.8) * 0.07;
  }
#endif
#ifdef WATER
  if (face == 2) {
    uv = world.xz * 0.5 + vec2(uTime * 0.03, uTime * 0.017);
    world.y += sin(uTime * 1.3 + world.x * 0.8 + world.z * 0.6) * 0.035 - 0.04;
  }
#endif

  int aoBits = int(data.z + 0.5);
  vUv = vec3(uv.x, 1.0 - uv.y, data.x);
  vAo = float(aoBits & 3) / 3.0;
  vEmit = float(aoBits >> 2);
  vNormal = NORMALS[face];
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const voxelFragment = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray uTiles;
uniform float uTime;
varying vec3 vUv;
varying float vAo;
varying float vEmit;
varying vec3 vNormal;
varying vec3 vWorld;
${LIGHTING}

void main() {
  vec4 tex = texture(uTiles, vUv);
#ifdef CUTOUT
  if (tex.a < 0.5) discard;
#endif
  vec3 albedo = pow(tex.rgb, vec3(2.2));
  vec3 n = vNormal;
  float ao = vAo * vAo * 0.45 + vAo * 0.1 + 0.45;
#ifdef PLANT
  vec3 col = shade(albedo, n, vWorld, ao, 0.35 + 0.45 * max(uSunDir.y, 0.0));
#else
  vec3 col = shade(albedo, n, vWorld, ao, -1.0);
#endif
  // Emissive blocks (lit windows, lanterns) glow, more strongly at night.
  col += albedo * vEmit * (0.6 + 1.6 * uNight);
  float alpha = 1.0;

#ifdef WATER
  if (vEmit > 0.5) {
    // Lava: opaque, self-lit, flowing. A pixelated, domain-warped pattern drifts
    // across the surface; dark crust plates float on bright molten rock. Side
    // faces (cascades between creek steps) pour downwards.
    bool top = vNormal.y > 0.5;
    vec3 wp = floor(vWorld * 16.0 + 0.001) / 16.0;
    vec2 p = top ? wp.xz : vec2(wp.x + wp.z, wp.y);
    float t = uTime;
    vec2 q = p * 0.55;
    if (top) {
      vec2 drift = normalize(vec2(sin(q.y * 0.21) + 0.6, cos(q.x * 0.17) + 0.4));
      q += drift * t * 0.55;
    } else q.y += t * 1.6;
    q += vec2(sin(q.y * 1.9 + t * 0.9), cos(q.x * 1.7 - t * 0.7)) * 0.5;
    float v = sin(q.x * 2.1) * sin(q.y * 2.3) * 0.6 + sin((q.x + q.y) * 3.7 + t * 1.3) * 0.4;
    vec3 yellow = vec3(1.0, 0.72, 0.12), orange = vec3(1.0, 0.2, 0.02), crust = vec3(0.09, 0.012, 0.006);
    vec3 molten = mix(yellow, orange, smoothstep(-0.6, 0.25, v));
    float plate = top ? smoothstep(0.32, 0.42, v) : smoothstep(0.55, 0.65, v);
    vec3 lava = mix(molten * 2.2, crust + orange * 0.25, plate);
    lava *= 0.8 + 0.4 * tex.r; // keep a little of the tile's grain
    col = lava * (0.9 + 0.1 * sin(t * 1.3 + vWorld.x * 0.3 + vWorld.z * 0.2));
  } else {
    vec3 view = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(view, n), 0.0), 3.0);
    vec3 h = normalize(view + uSunDir);
    float spec = pow(max(dot(n, h), 0.0), 120.0) * step(0.5, n.y) * shadowFactor(vWorld, n, 1.0);
    col = mix(col, uSkyAmbient * 0.9, fres * 0.6) + uSunColor * spec * 1.5;
    alpha = mix(0.68, 0.92, fres);
    if (tex.a < 0.9) alpha = 0.95; // murky eldritch water hides the deep
  }
#endif

  gl_FragColor = vec4(applyFog(col, vWorld), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export type VoxelPass = 'opaque' | 'plants' | 'water';

export function createVoxelMaterial(env: EnvUniforms, pass: VoxelPass, shadows: boolean): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (pass === 'opaque') defines.CUTOUT = '';
  if (pass === 'plants') { defines.CUTOUT = ''; defines.PLANT = ''; }
  if (pass === 'water') defines.WATER = '';
  if (shadows) defines.USE_SHADOWS = '';
  return new THREE.ShaderMaterial({
    uniforms: env as unknown as Record<string, THREE.IUniform>,
    vertexShader: voxelVertex,
    fragmentShader: voxelFragment,
    defines,
    side: pass === 'opaque' ? THREE.FrontSide : THREE.DoubleSide,
    transparent: pass === 'water',
    depthWrite: pass !== 'water',
  });
}

/** Depth-only material for chunk meshes in the shadow pass (handles cut-out leaves). */
export function createVoxelDepthMaterial(env: EnvUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTiles: env.uTiles },
    vertexShader: /* glsl */ `
      attribute vec4 data;
      varying vec3 vUv;
      void main() {
        int corner = int(data.w + 0.5) & 3;
        vec2 uv = vec2((corner == 1 || corner == 2) ? 1.0 : 0.0, corner >= 2 ? 1.0 : 0.0);
        vUv = vec3(uv.x, 1.0 - uv.y, data.x);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position / 8.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp sampler2DArray;
      uniform sampler2DArray uTiles;
      varying vec3 vUv;
      void main() {
        if (texture(uTiles, vUv).a < 0.5) discard;
        gl_FragColor = vec4(1.0);
      }`,
    side: THREE.DoubleSide,
    colorWrite: false,
  });
}

// ------------------------------------------------------------------ props

const propVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
#ifdef USE_INSTANCING
#endif
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
#endif
  vec4 world = m * vec4(position, 1.0);
  vUv = uv;
  vNormal = normalize(mat3(m) * normal);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const propFragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uEmissive;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
${LIGHTING}

void main() {
#ifdef USE_UMAP
  vec4 tex = texture2D(uMap, vUv);
  if (tex.a < 0.5) discard;
  vec3 albedo = pow(tex.rgb, vec3(2.2)) * uColor;
#else
  vec3 albedo = uColor;
#endif
  vec3 n = normalize(vNormal);
  vec3 col = shade(albedo, n, vWorld, 1.0, -1.0) + albedo * uEmissive * (0.6 + 1.6 * uNight);
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface PropMaterialOptions {
  map?: THREE.Texture;
  /** sRGB colour; multiplied with the map when both are given. */
  color?: THREE.ColorRepresentation;
  emissive?: number;
  shadows: boolean;
}

/** Lit material for non-voxel objects (signs, props, later creatures). */
export function createPropMaterial(env: EnvUniforms, o: PropMaterialOptions): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (o.map) defines.USE_UMAP = '';
  if (o.shadows) defines.USE_SHADOWS = '';
  const uniforms: Record<string, THREE.IUniform> = {
    ...(env as unknown as Record<string, THREE.IUniform>),
    uMap: { value: o.map ?? null },
    uColor: { value: new THREE.Color(o.color ?? '#ffffff') },
    uEmissive: { value: o.emissive ?? 0 },
  };
  return new THREE.ShaderMaterial({ uniforms, vertexShader: propVertex, fragmentShader: propFragment, defines });
}

// ------------------------------------------------------------------ creatures
// Creatures are instanced voxel-box rigs animated on the GPU. Every vertex
// carries its part id and pivot; per-instance attributes carry the animation
// phases, so a whole species draws in one call.
//   part 0 static, 1/2 legs (opposite swing about X), 3/4 right/left wing
//   (flap about Z), 5 tail (yaw swing), 6 head (pitch), 7/8 right/left wing
//   tip (extra flap about its own pivot, then follows the wing about aPivot2).

const creatureVertex = /* glsl */ `
attribute vec3 aColor;
attribute vec3 aPivot;
attribute vec3 aPivot2;
/** x part id, y colour slot. */
attribute vec2 aPart;
/** x walk phase, y leg swing amplitude, z flap phase, w flap amplitude. */
attribute vec4 aAnim;
/** x head pitch, y tail swing (arms: raise), z glow, w skin tone (0 light .. 1 dark). */
attribute vec4 aPose;
attribute vec3 aTint;
attribute vec3 aTint2;
attribute vec3 aTint3;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vGlow;

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

vec3 slotTint() {
  int s = int(aPart.y + 0.5);
  if (s == 0) return vec3(1.0);
  if (s == 2) return aTint2;
  if (s == 3) return mix(vec3(0.94, 0.70, 0.52), vec3(0.22, 0.11, 0.06), aPose.w); // linear skin tones
  if (s == 4) return aTint3;
  return aTint;
}

void main() {
  int part = int(aPart.x + 0.5);
  vec3 p = position;
  mat3 r = mat3(1.0);
  vec3 piv = aPivot;
  if (part == 1 || part == 2) {
    r = rotX(sin(aAnim.x) * aAnim.y * (part == 1 ? 1.0 : -1.0));
  } else if (part == 3 || part == 4) {
    r = rotZ(sin(aAnim.z) * aAnim.w * (part == 3 ? 1.0 : -1.0));
  } else if (part == 5) {
    r = rotY(aPose.y);
  } else if (part == 6) {
    r = rotX(aPose.x);
  } else if (part == 9 || part == 10) {
    r = rotX(sin(aAnim.z) * aAnim.w * (part == 9 ? 1.0 : -1.0) - aPose.y);
  } else if (part == 7 || part == 8) {
    float side = part == 7 ? 1.0 : -1.0;
    mat3 tip = rotZ(sin(aAnim.z - 0.7) * aAnim.w * 0.7 * side);
    p = tip * (p - aPivot) + aPivot;
    vec3 nn = tip * normal;
    r = rotZ(sin(aAnim.z) * aAnim.w * side);
    piv = aPivot2;
    p = r * (p - piv) + piv;
    vec4 w7 = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vNormal = normalize(mat3(modelMatrix * instanceMatrix) * (r * nn));
    vWorld = w7.xyz;
    vColor = aColor * slotTint();
    vGlow = aPose.z;
    gl_Position = projectionMatrix * viewMatrix * w7;
    return;
  }
  p = r * (p - piv) + piv;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 world = m * vec4(p, 1.0);
  vNormal = normalize(mat3(m) * (r * normal));
  vWorld = world.xyz;
  vColor = aColor * slotTint();
  vGlow = aPose.z;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const creatureFragment = /* glsl */ `
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vGlow;
${LIGHTING}

void main() {
#ifdef DEPTH_ONLY
  gl_FragColor = vec4(1.0);
#else
  vec3 albedo = vColor; // already linear (THREE.Color)
  vec3 n = normalize(vNormal);
  vec3 col = shade(albedo, n, vWorld, 1.0, -1.0) + albedo * vGlow * 2.5;
#ifdef TRANSLUCENT
  gl_FragColor = vec4(applyFog(col, vWorld), 0.5);
#else
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
#endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
#endif
}
`;

/** Lit, GPU-animated creature material; `depth` builds the shadow-pass variant, `translucent` a see-through one (ghosts). */
export function createCreatureMaterial(env: EnvUniforms, shadows: boolean, depth = false, translucent = false): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (shadows && !depth) defines.USE_SHADOWS = '';
  if (depth) defines.DEPTH_ONLY = '';
  if (translucent) defines.TRANSLUCENT = '';
  return new THREE.ShaderMaterial({
    uniforms: env as unknown as Record<string, THREE.IUniform>,
    vertexShader: creatureVertex,
    fragmentShader: creatureFragment,
    defines,
    side: depth ? THREE.DoubleSide : THREE.FrontSide,
    colorWrite: !depth,
    transparent: translucent,
    depthWrite: !translucent,
  });
}
