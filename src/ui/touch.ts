// Touch controls for phones and tablets: a floating joystick on the left half,
// drag-to-look on the right half, and a few on-screen buttons. Movement is fed
// to the PlayerController as analog input so no pointer lock is needed.

import type { PlayerController } from '../player/controller';

/** True on devices whose main pointer is a finger (phones, tablets). */
export const IS_TOUCH = matchMedia('(pointer: coarse)').matches
  || (navigator.maxTouchPoints > 0 && !matchMedia('(hover: hover)').matches);

const STICK_R = 56;        // joystick travel radius (CSS px)
const LOOK_SENS = 0.0055;  // radians per CSS px dragged
const SPRINT_AT = 0.92;    // stick deflection that switches to running

export interface TouchActions {
  map(): void;
  pause(): void;
  sound(): void;
  time(): void;
}

export class TouchControls {
  readonly el: HTMLDivElement;
  private stickBase: HTMLDivElement;
  private stickKnob: HTMLDivElement;
  private stickId = -1;
  private stickX = 0;
  private stickY = 0;
  private lookId = -1;
  private lookX = 0;
  private lookY = 0;
  /** Map drag / pinch state while the map is open. */
  private mapTouches = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  onMapPan: ((dx: number, dy: number) => void) | null = null;
  onMapZoom: ((dir: number) => void) | null = null;

  constructor(private player: PlayerController, actions: TouchActions) {
    this.el = document.createElement('div');
    this.el.id = 'touch';
    this.el.className = 'hidden';
    this.stickBase = div('stick-base');
    this.stickKnob = div('stick-knob');
    this.stickBase.appendChild(this.stickKnob);
    this.el.appendChild(this.stickBase);

    const jump = button('t-jump', 'ZIPLA');
    const top = div('t-top');
    const mapBtn = button('t-btn', 'HARİTA');
    const timeBtn = button('t-btn', '»');
    const soundBtn = button('t-btn', '♪');
    const pauseBtn = button('t-btn', 'II');
    top.append(mapBtn, timeBtn, soundBtn, pauseBtn);
    this.el.append(jump, top);
    document.body.appendChild(this.el);

    // off(cancelled) runs on release; a touch the OS cancelled (edge swipe, notification) is not a tap.
    const hold = (b: HTMLElement, on: () => void, off: (cancelled: boolean) => void): void => {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); on(); }, { passive: false });
      const up = (cancelled: boolean) => (e: TouchEvent): void => { e.preventDefault(); b.classList.remove('down'); off(cancelled); };
      b.addEventListener('touchend', up(false), { passive: false });
      b.addEventListener('touchcancel', up(true), { passive: false });
    };
    const tap = (b: HTMLElement, fn: () => void): void => hold(b, () => {}, (cancelled) => { if (!cancelled) fn(); });
    hold(jump, () => { player.touchJump = true; }, () => { player.touchJump = false; });
    tap(mapBtn, () => actions.map());
    tap(timeBtn, () => actions.time());
    tap(soundBtn, () => actions.sound());
    tap(pauseBtn, () => actions.pause());

    // Joystick and look share one full-screen layer; the side of the first touch decides.
    const surface = document.getElementById('view')!;
    const opts = { passive: false } as const;
    surface.addEventListener('touchstart', (e) => this.start(e), opts);
    surface.addEventListener('touchmove', (e) => this.move(e), opts);
    surface.addEventListener('touchend', (e) => this.end(e), opts);
    surface.addEventListener('touchcancel', (e) => this.end(e), opts);
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.addEventListener('touchstart', (e) => this.mapStart(e), opts);
      mapEl.addEventListener('touchmove', (e) => this.mapMove(e), opts);
      mapEl.addEventListener('touchend', (e) => this.mapEnd(e), opts);
      mapEl.addEventListener('touchcancel', (e) => this.mapEnd(e), opts);
    }
  }

  show(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
    if (!on) this.reset();
  }

  reset(): void {
    this.stickId = this.lookId = -1;
    this.stickBase.classList.remove('active');
    this.player.setAnalog(0, 0, false);
    this.player.touchJump = false;
    this.mapTouches.clear();
    this.pinchDist = 0;
  }

  private start(e: TouchEvent): void {
    e.preventDefault();
    if (!this.player.locked || this.player.paused) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < window.innerWidth * 0.45 && this.stickId < 0) {
        this.stickId = t.identifier;
        this.stickX = t.clientX;
        this.stickY = t.clientY;
        this.stickBase.style.left = `${t.clientX}px`;
        this.stickBase.style.top = `${t.clientY}px`;
        this.stickKnob.style.transform = 'translate(-50%, -50%)';
        this.stickBase.classList.add('active');
      } else if (this.lookId < 0) {
        this.lookId = t.identifier;
        this.lookX = t.clientX;
        this.lookY = t.clientY;
      }
    }
  }

  private move(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        let dx = t.clientX - this.stickX, dy = t.clientY - this.stickY;
        const d = Math.hypot(dx, dy);
        if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
        this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        const mag = Math.min(1, d / STICK_R);
        // Small dead zone so a resting thumb does not creep.
        const k = mag < 0.12 ? 0 : 1;
        this.player.setAnalog((-dy / STICK_R) * k, (dx / STICK_R) * k, mag >= SPRINT_AT);
      } else if (t.identifier === this.lookId) {
        this.player.look((t.clientX - this.lookX) * LOOK_SENS, (t.clientY - this.lookY) * LOOK_SENS);
        this.lookX = t.clientX;
        this.lookY = t.clientY;
      }
    }
  }

  private end(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        this.stickId = -1;
        this.stickBase.classList.remove('active');
        this.player.setAnalog(0, 0, false);
      } else if (t.identifier === this.lookId) {
        this.lookId = -1;
      }
    }
  }

  private mapStart(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) this.mapTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    this.pinchDist = this.mapTouches.size === 2 ? this.spread() : 0;
  }

  private mapMove(e: TouchEvent): void {
    e.preventDefault();
    if (this.mapTouches.size === 1) {
      const t = e.changedTouches[0];
      const prev = this.mapTouches.get(t.identifier);
      if (prev) this.onMapPan?.(t.clientX - prev.x, t.clientY - prev.y);
    }
    for (const t of Array.from(e.changedTouches)) {
      if (this.mapTouches.has(t.identifier)) this.mapTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (this.mapTouches.size === 2 && this.pinchDist > 0) {
      const d = this.spread();
      // One zoom step per 1.6x change in finger spread.
      if (d > this.pinchDist * 1.6) { this.onMapZoom?.(-1); this.pinchDist = d; }
      else if (d < this.pinchDist / 1.6) { this.onMapZoom?.(1); this.pinchDist = d; }
    }
  }

  private mapEnd(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) this.mapTouches.delete(t.identifier);
    this.pinchDist = this.mapTouches.size === 2 ? this.spread() : 0;
  }

  private spread(): number {
    const [a, b] = Array.from(this.mapTouches.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function button(cls: string, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = cls;
  b.type = 'button';
  b.textContent = label;
  return b;
}
