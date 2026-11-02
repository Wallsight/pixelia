// Day/night cycle. Drives every lighting uniform from the sun's elevation using
// pastel keyframes (dawn peach, day lavender-blue, dusk rose, night indigo).

import * as THREE from 'three';
import type { EnvUniforms } from './materials';

export const DAY_SECONDS = 20 * 60;

interface Key { e: number; c: THREE.Color }
const keys = (pairs: Array<[number, string]>): Key[] => pairs.map(([e, hex]) => ({ e, c: new THREE.Color(hex) }));

// Keyed on sun elevation (sin of altitude), ascending.
const ZENITH = keys([[-0.35, '#141a3f'], [-0.12, '#2c3170'], [0.0, '#6a6fb4'], [0.12, '#86abe4'], [0.35, '#7fb6ee']]);
const HORIZON = keys([[-0.35, '#232a58'], [-0.12, '#55497f'], [-0.02, '#d68fa8'], [0.06, '#ffc6aa'], [0.2, '#fbd9d0'], [0.4, '#fbe3df']]);
const FOG = keys([[-0.35, '#1f2550'], [-0.12, '#3d3c6c'], [0.0, '#c99fb6'], [0.1, '#f0d3cc'], [0.3, '#d6e3f6']]);
// Ambient colours are converted to linear on load, so these sRGB values are
// deliberately bright (day ~= linear 0.6 / 0.68 / 0.86).
const SKY_AMB = keys([[-0.35, '#4a5590'], [-0.1, '#6a6aa0'], [0.05, '#c9b8d6'], [0.25, '#cbd8f0']]);
const GROUND_AMB = keys([[-0.35, '#2a2c48'], [-0.1, '#463f5e'], [0.05, '#a8949c'], [0.25, '#aea6ab']]);
const SUN_LOW = new THREE.Color('#ffb48a');
const SUN_HIGH = new THREE.Color('#fff2e0');
const MOON = new THREE.Color('#9fb0e8');

function sampleKeys(k: Key[], e: number, out: THREE.Color): THREE.Color {
  if (e <= k[0].e) return out.copy(k[0].c);
  for (let i = 1; i < k.length; i++) {
    if (e <= k[i].e) {
      const t = (e - k[i - 1].e) / (k[i].e - k[i - 1].e);
      return out.copy(k[i - 1].c).lerp(k[i].c, t * t * (3 - 2 * t));
    }
  }
  return out.copy(k[k.length - 1].c);
}

export class DayNight {
  /** 0..1, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
  time: number;
  speed = 1;
  readonly sunDir = new THREE.Vector3();
  readonly moonDir = new THREE.Vector3();
  /** Direction of the dominant light (sun by day, moon by night). */
  readonly lightDir = new THREE.Vector3();
  readonly zenith = new THREE.Color();
  readonly horizon = new THREE.Color();
  sunElevation = 0;
  /** 0 by day, 1 in full night: drives stars and emissive glow. */
  night = 0;
  /** Strength of shadows from the current light (fades at the horizon). */
  shadowStrength = 1;

  constructor(private env: EnvUniforms, startTime = 0.3) {
    this.time = startTime;
    this.update(0);
  }

  update(dt: number): void {
    this.time = (this.time + (dt * this.speed) / DAY_SECONDS) % 1;
    const a = (this.time - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(a), Math.sin(a) * 0.94, 0.34).normalize();
    this.moonDir.copy(this.sunDir).negate();
    const e = (this.sunElevation = this.sunDir.y);

    const sunF = THREE.MathUtils.smoothstep(e, -0.04, 0.12);
    const moonF = THREE.MathUtils.smoothstep(-e, 0.02, 0.2);
    this.night = THREE.MathUtils.smoothstep(-e, -0.02, 0.22);

    this.lightDir.copy(e > -0.03 ? this.sunDir : this.moonDir);
    const lightElev = Math.max(this.lightDir.y, 0);
    this.shadowStrength = THREE.MathUtils.smoothstep(lightElev, 0.02, 0.15) * (e > -0.03 ? 1 : 0.55);

    const u = this.env;
    u.uSunDir.value.copy(this.lightDir);
    const sun = u.uSunColor.value.copy(SUN_LOW).lerp(SUN_HIGH, THREE.MathUtils.smoothstep(e, 0.05, 0.4));
    sun.multiplyScalar(sunF);
    sun.add(MOON.clone().multiplyScalar(moonF * 0.32));
    sampleKeys(SKY_AMB, e, u.uSkyAmbient.value);
    sampleKeys(GROUND_AMB, e, u.uGroundAmbient.value);
    sampleKeys(FOG, e, u.uFogColor.value);
    sampleKeys(ZENITH, e, this.zenith);
    sampleKeys(HORIZON, e, this.horizon);
  }

  /** "06:42" style clock for the HUD. */
  clock(): string {
    const minutes = Math.floor(this.time * 24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
}
