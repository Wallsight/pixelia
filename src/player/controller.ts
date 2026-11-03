// First-person walker: mouse look, WASD, sprint, jump, swim, voxel collision
// and automatic one-block step-up so free roaming never gets stuck on ledges.

import * as THREE from 'three';
import { COLLIDES, HEIGHT8, KIND, KIND_WATER } from '../world/blocks';
import type { World } from '../world/world';

const HALF_W = 0.3;
const HEIGHT = 1.8;
const EYE = 1.62;
const GRAVITY = 30;
const JUMP_V = 8.8;
const WALK = 4.4;
const SPRINT = 7.2;
const FLY = 24;
const EPS = 1e-4;
const NO_KEYS: ReadonlySet<string> = new Set();

export class PlayerController {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  inWater = false;
  flying = false;
  locked = false;
  /** True while an overlay (map) owns the mouse and keyboard. */
  paused = false;
  sensitivity = 0.0022;
  /** Held by the on-screen jump button. */
  touchJump = false;

  private keys = new Set<string>();
  /** Analog stick input (forward, strafe in -1..1) from touch controls. */
  private analogFwd = 0;
  private analogStrafe = 0;
  private analogSprint = false;
  private bobPhase = 0;
  private bobAmount = 0;
  private stepSmooth = 0;
  private frozen = true;
  /** Extent of the solid cells found by the last collides() call. */
  private hitTop = 0;
  private hitBottom = 0;

  constructor(private camera: THREE.PerspectiveCamera, private world: World, private dom: HTMLElement) {
    camera.rotation.order = 'YXZ';
    window.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      this.keys.add(e.code);
      if (e.code === 'KeyF') this.flying = !this.flying;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this.paused) return;
      // Guard against occasional huge spikes some browsers report on lock.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.look(e.movementX * this.sensitivity, e.movementY * this.sensitivity);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) this.keys.clear();
    });
  }

  /** True if this browser has the Pointer Lock API at all (phones usually do not). */
  get canLock(): boolean {
    return typeof (this.dom as { requestPointerLock?: unknown }).requestPointerLock === 'function';
  }

  /** Drops held keys and stick input, e.g. when play is paused without a pointer-lock change. */
  clearInput(): void {
    this.keys.clear();
    this.setAnalog(0, 0, false);
    this.touchJump = false;
  }

  /** Asks for pointer lock; returns false if the API is missing so the caller can fall back. */
  requestLock(): boolean {
    const el = this.dom as HTMLElement & { requestPointerLock?(o?: { unadjustedMovement?: boolean }): Promise<void> | void };
    if (!this.canLock) return false;
    const fallback = (): void => {
      try {
        const p = el.requestPointerLock!();
        if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
      } catch { /* pointer lock unavailable */ }
    };
    try {
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(fallback);
    } catch {
      fallback();
    }
    return true;
  }

  /** Touch joystick input; values are clamped to the unit circle. */
  setAnalog(fwd: number, strafe: number, sprint: boolean): void {
    const l = Math.hypot(fwd, strafe);
    const k = l > 1 ? 1 / l : 1;
    this.analogFwd = fwd * k;
    this.analogStrafe = strafe * k;
    this.analogSprint = sprint;
  }

  /** Rotates the view by a delta in radians (mouse or touch look). */
  look(dYaw: number, dPitch: number): void {
    if (this.paused) return;
    this.yaw -= dYaw;
    this.pitch -= dPitch;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  spawn(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.frozen = false;
  }

  /** Top of the solid part of a cell, or -Infinity if passable. Unloaded cells act as full walls. */
  private cellTop(x: number, y: number, z: number): number {
    const b = this.world.getBlock(x, y, z);
    if (b === -1) return y + 1;
    if (COLLIDES[b] !== 1) return -Infinity;
    return y + HEIGHT8[b] / 8;
  }

  /** True if the player box at (px, py, pz) overlaps solid geometry; records hitTop / hitBottom. */
  private collides(px: number, py: number, pz: number): boolean {
    const x0 = Math.floor(px - HALF_W), x1 = Math.floor(px + HALF_W);
    const y0 = Math.floor(py), y1 = Math.floor(py + HEIGHT);
    const z0 = Math.floor(pz - HALF_W), z1 = Math.floor(pz + HALF_W);
    let hit = false;
    this.hitTop = -Infinity;
    this.hitBottom = Infinity;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const top = this.cellTop(x, y, z);
      if (top > py + 1e-6 && y < py + HEIGHT) {
        hit = true;
        if (top > this.hitTop) this.hitTop = top;
        if (y < this.hitBottom) this.hitBottom = y;
      }
    }
    return hit;
  }

  /** Moves along one axis and resolves penetration. Returns true if blocked. */
  private moveAxis(axis: 0 | 1 | 2, d: number): boolean {
    if (d === 0) return false;
    const p = this.position;
    if (axis === 0) p.x += d; else if (axis === 1) p.y += d; else p.z += d;
    if (!this.collides(p.x, p.y, p.z)) return false;
    if (axis === 0) p.x = d > 0 ? Math.floor(p.x + HALF_W) - HALF_W - EPS : Math.floor(p.x - HALF_W) + 1 + HALF_W + EPS;
    else if (axis === 2) p.z = d > 0 ? Math.floor(p.z + HALF_W) - HALF_W - EPS : Math.floor(p.z - HALF_W) + 1 + HALF_W + EPS;
    else p.y = d > 0 ? this.hitBottom - HEIGHT - EPS : this.hitTop;
    return true;
  }

  private moveHorizontal(axis: 0 | 2, d: number): void {
    const p = this.position;
    const before = axis === 0 ? p.x : p.z;
    if (!this.moveAxis(axis, d)) return;
    // Step up onto anything up to one block high (partial slopes or full blocks) if there is room.
    if (!this.onGround || this.flying) return;
    const tx = axis === 0 ? before + d : p.x;
    const tz = axis === 2 ? before + d : p.z;
    if (!this.collides(tx, p.y, tz)) return;
    const stepY = this.hitTop;
    if (stepY - p.y > 1.01) return;
    if (!this.collides(tx, stepY, tz)) {
      this.stepSmooth -= stepY - p.y;
      p.set(tx, stepY, tz);
    }
  }

  update(dt: number): void {
    if (this.frozen) return;
    const p = this.position, v = this.velocity;
    const k = this.paused ? NO_KEYS : this.keys;

    const live = !this.paused;
    let fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight') || (live && this.analogSprint);
    const jump = k.has('Space') || (live && this.touchJump);
    // Keys give full-speed digital input; the touch stick may ask for less.
    let mag = 1;
    if (fwd === 0 && strafe === 0 && live) {
      fwd = this.analogFwd;
      strafe = this.analogStrafe;
      mag = Math.min(1, Math.hypot(fwd, strafe));
    }

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * strafe;
    let wz = -cos * fwd - sin * strafe;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx *= mag / wl; wz *= mag / wl; }

    const feet = this.world.getBlock(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z));
    this.inWater = feet >= 0 && KIND[feet] === KIND_WATER;

    if (this.flying) {
      const speed = sprint ? FLY * 2.5 : FLY;
      const up = (jump ? 1 : 0) - (k.has('KeyC') || k.has('ControlLeft') ? 1 : 0);
      v.set(wx * speed, up * speed, wz * speed);
      this.onGround = false;
      if (this.collides(p.x, p.y, p.z)) {
        // Already inside terrain (e.g. after a teleport): float straight up out of it.
        p.y += Math.max(speed, 8) * dt;
      } else {
        // Flying still collides with the world, so the camera never slips under the map.
        const steps = Math.max(1, Math.ceil((speed * dt) / 0.4));
        const h = dt / steps;
        for (let s = 0; s < steps; s++) {
          this.moveAxis(1, v.y * h);
          this.moveAxis(0, v.x * h);
          this.moveAxis(2, v.z * h);
        }
      }
    } else {
      const speed = this.inWater ? WALK * 0.6 : sprint ? SPRINT : WALK;
      const accel = this.onGround ? 14 : this.inWater ? 6 : 3.5;
      const blend = Math.min(1, accel * dt);
      v.x += (wx * speed - v.x) * blend;
      v.z += (wz * speed - v.z) * blend;

      if (this.inWater) {
        v.y -= GRAVITY * 0.18 * dt;
        v.y *= Math.pow(0.15, dt);
        if (jump) v.y = Math.min(v.y + 22 * dt, 3.6);
      } else {
        v.y -= GRAVITY * dt;
        if (jump && this.onGround) v.y = JUMP_V;
      }
      v.y = Math.max(v.y, -55);

      // Sub-step so no single move crosses more than ~0.4 blocks.
      const steps = Math.max(1, Math.ceil((Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt) / 0.4));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        const falling = v.y <= 0;
        const blockedY = this.moveAxis(1, v.y * h);
        if (blockedY) {
          this.onGround = falling;
          v.y = 0;
        } else {
          this.onGround = falling && this.collides(p.x, p.y - 0.05, p.z);
        }
        this.moveHorizontal(0, v.x * h);
        this.moveHorizontal(2, v.z * h);
      }
    }

    // Camera: smoothed step-up, gentle head bob while walking.
    this.stepSmooth *= Math.pow(0.0005, dt);
    const hs = Math.hypot(v.x, v.z);
    const walking = this.onGround && hs > 0.5;
    this.bobAmount += ((walking ? Math.min(1, hs / SPRINT) : 0) - this.bobAmount) * Math.min(1, dt * 8);
    if (walking) this.bobPhase += dt * hs * 1.9;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.07 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.035 * this.bobAmount;

    this.camera.position.set(
      p.x + Math.cos(this.yaw) * bobX,
      p.y + EYE + this.stepSmooth + bobY,
      p.z - Math.sin(this.yaw) * bobX,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
