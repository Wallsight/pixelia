// The great dragon: one in the world, the size of a village, asleep on its
// hoard in a ruined ring of pillars. It snores, smoke curling from its
// nostrils. Come close and it opens one great eye, lifts its head and talks:
// about itself, its gold, the world, the legends you have found, a riddle or
// two. Then it yawns a column of fire into the sky and goes back to sleep.
// It never moves from its bed and never harms anyone.

import * as THREE from 'three';
import { LM } from '../world/structures';
import type { Terrain } from '../world/terrain';
import { lairPose } from '../world/landmarks';
import type { Creature } from './creatures';
import type { FireFx } from '../render/fire';
import { greatDragon } from './models';
import { PART, type Box } from './rig';

export const GREAT_DRAGON = 'greatdragon';
/** How big the great dragon is next to an ordinary one. */
export const GREAT_SCALE = 5;
export const GREAT_NAME = 'Közhan';

export type WyrmSound = 'snore' | 'stir' | 'yawn' | 'voice' | 'burn';

export interface WyrmHost {
  spawnGreat(x: number, y: number, z: number, yaw: number): Creature | null;
  live(kind: string): readonly Creature[];
  readonly fire: FireFx;
  /** Nearest live wild animal on the ground within r. */
  nearestAnimal(x: number, z: number, r: number): Creature | null;
  /** Fells an animal (it chars and sinks away; the others bolt). */
  killAnimal(p: Creature): void;
}

/** What the dragon knows about the visitor (filled in by the game). */
export interface WyrmContext { found: number; flying: boolean }

const enum W { SLEEP, STIR, AWAKE, YAWN, SETTLE, BURN }

// Model-space points on the head (scale 1, before the head pitch).
const NECK: [number, number, number] = [0, 3.1, 2.2];
const EYES: Array<[number, number, number]> = [[0.67, 4.9, 5.9], [-0.67, 4.9, 5.9]];
const NOSE: [number, number, number] = [0, 4.6, 7.35];
const HEAD_SLEEP = 0.62, HEAD_AWAKE = 0.12, TAIL_CURL = 1.05;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const cellKey = (x: number, y: number, z: number) => ((x + 32768) * 65536 + (z + 32768)) * 512 + y;

type V = [number, number, number];
/** Rotations matching the creature shader (about a pivot). */
function rotAbout(p: V, piv: V, axis: 0 | 1 | 2, a: number): V {
  const x = p[0] - piv[0], y = p[1] - piv[1], z = p[2] - piv[2], c = Math.cos(a), s = Math.sin(a);
  if (axis === 0) return [p[0], piv[1] + c * y - s * z, piv[2] + s * y + c * z];
  if (axis === 1) return [piv[0] + c * x + s * z, p[1], piv[2] - s * x + c * z];
  return [piv[0] + c * x - s * y, piv[1] + s * x + c * y, p[2]];
}
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

function direction(dx: number, dz: number): string {
  const names = ['Doğuda', 'Güneydoğuda', 'Güneyde', 'Güneybatıda', 'Batıda', 'Kuzeybatıda', 'Kuzeyde', 'Kuzeydoğuda'];
  return names[(Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) + 8) % 8];
}

const SNACK_AWAKE = ['Pardon. Atıştırmalık.', 'Hıh. Kemikli çıktı.', 'Altınlarımın yanına izinsiz gelinmez.', 'Nerede kalmıştık?'];
const SNACK_ASLEEP = ['...hrrm... çıtır...', '...kim var orada... hmm...', '...altınlarım...'];
const SLEEP_TALK = ['...yedi yüz on iki... yedi yüz on üç...', '...hayır... o kupa benim...', '...üç ay... gökte üç ay vardı...', '...hrmm... şövalye... çok tuzlu...'];

export class WyrmDirector {
  readonly group = new THREE.Group();
  /** A line spoken aloud (asleep = mumbled in its sleep). */
  onSpeak: ((who: string, text: string, sec: number, asleep: boolean) => void) | null = null;
  onSound: ((ev: WyrmSound, at: [number, number, number], text?: string) => void) | null = null;
  context: () => WyrmContext = () => ({ found: 0, flying: false });

  private eyes: THREE.Mesh[] = [];
  /** The body as solid one-block cells (the player cannot walk through it, but can climb on it). */
  private cells = new Set<number>();
  private cellPose = { head: NaN, bob: NaN, tail: NaN, flapAmp: NaN, x: NaN, z: NaN };
  private boxes: Box[] = greatDragon();
  /** Bumped whenever the solid cells change. */
  solidVersion = 0;
  private open = 0;
  private blink = 0;
  private time = 0;
  private lines: string[] = [];
  private next = 0;
  private cooldown = 0;
  private wakes = 0;
  private buzzed = false;
  /** Fire at animals that wander into the lair. */
  private prey: Creature | null = null;
  private resume: number = W.SLEEP;
  private burnCool = 3;
  private scanT = 0;
  /** Spoke to the player since it last fell asleep (then it wants a long rest). */
  private talked = false;
  private met: boolean;
  private storeKey: string;
  private px = 0; private py = 0; private pz = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();

  constructor(private terrain: Terrain, private host: WyrmHost) {
    const geo = new THREE.BoxGeometry(0.24, 0.28, 0.44);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.18), fog: false });
    for (let i = 0; i < 2; i++) {
      const eye = new THREE.Mesh(geo, mat);
      // A dark slit pupil.
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), new THREE.MeshBasicMaterial({ color: '#120804', fog: false }));
      pupil.position.set(i === 0 ? 0.115 : -0.115, 0, 0.02);
      eye.add(pupil);
      eye.visible = false;
      this.eyes.push(eye);
      this.group.add(eye);
    }
    this.storeKey = `pixelia-wyrm-${terrain.seed}`;
    let met = false;
    try { met = localStorage.getItem(this.storeKey) === '1'; } catch { /* storage blocked */ }
    this.met = met;
  }

  update(dt: number, px: number, py: number, pz: number): void {
    this.time += dt;
    this.px = px; this.py = py; this.pz = pz;
    this.cooldown -= dt;
    const lair = this.terrain.landmarks.lair();
    const live = this.host.live(GREAT_DRAGON);
    if (lair && !live.length && Math.hypot(lair.x - px, lair.z - pz) < 300) {
      const lm = this.terrain.landmarks.at(lair.gx, lair.gz);
      if (lm && lm.kind === LM.DRAGON_LAIR) {
        const p = lairPose(lm);
        const c = this.host.spawnGreat(p.x, p.y, p.z, p.yaw);
        if (c) this.settleNow(c);
      }
    }
    const c = live[0];
    if (!c) {
      for (const e of this.eyes) e.visible = false;
      if (this.cells.size) { this.cells.clear(); this.cellPose.x = NaN; this.solidVersion++; }
      return;
    }
    this.placeEyes(c);
    this.voxelize(c);
  }

  // ------------------------------------------------------------ solidity

  /** True if the dragon's body fills block cell (x, y, z). */
  solid(x: number, y: number, z: number): boolean {
    return this.cells.size > 0 && this.cells.has(cellKey(x, y, z));
  }

  /**
   * Rebuilds the solid cells when the pose has moved enough to matter (the
   * slow breathing is ignored). Samples every box of the model in its posed
   * position at well under a block apart.
   */
  private voxelize(c: Creature): void {
    const p = this.cellPose;
    const bob = Math.round(c.bob / c.scale / 0.06) * 0.06 * c.scale;
    if (Math.abs(c.head - p.head) < 0.03 && Math.abs(bob - p.bob) < 0.25 && Math.abs(c.tail - p.tail) < 0.04
      && Math.abs(c.flapAmp - p.flapAmp) < 0.06 && c.x === p.x && c.z === p.z) return;
    p.head = c.head; p.bob = bob; p.tail = c.tail; p.flapAmp = c.flapAmp; p.x = c.x; p.z = c.z;
    this.cells.clear();
    this.e.set(-c.pitch, c.yaw, c.roll);
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(c.x, c.y + bob, c.z), this.q, this.sc.setScalar(c.scale));
    const w = new THREE.Vector3();
    const step = 0.6 / c.scale;
    const flapR = Math.sin(c.flap) * c.flapAmp;
    for (const b of this.boxes) {
      const nx = Math.max(1, Math.ceil(b.s[0] / step)), ny = Math.max(1, Math.ceil(b.s[1] / step)), nz = Math.max(1, Math.ceil(b.s[2] / step));
      const part = b.part ?? PART.STATIC, piv = (b.pivot ?? [0, 0, 0]) as V;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
        let q: V = [
          b.at[0] - b.s[0] / 2 + ((i + 0.5) / nx) * b.s[0],
          b.at[1] - b.s[1] / 2 + ((j + 0.5) / ny) * b.s[1],
          b.at[2] - b.s[2] / 2 + ((k + 0.5) / nz) * b.s[2],
        ];
        if (part === PART.HEAD) q = rotAbout(q, piv, 0, c.head);
        else if (part === PART.TAIL) q = rotAbout(q, piv, 1, c.tail);
        else if (part === PART.WING_R || part === PART.WING_L) q = rotAbout(q, piv, 2, flapR * (part === PART.WING_R ? 1 : -1));
        else if (part === PART.TIP_R || part === PART.TIP_L) {
          const side = part === PART.TIP_R ? 1 : -1;
          q = rotAbout(q, piv, 2, Math.sin(c.flap - 0.7) * c.flapAmp * 0.7 * side);
          q = rotAbout(q, (b.pivot2 ?? piv) as V, 2, flapR * side);
        }
        w.set(q[0], q[1], q[2]).applyMatrix4(this.m);
        this.cells.add(cellKey(Math.floor(w.x), Math.floor(w.y), Math.floor(w.z)));
      }
    }
    this.solidVersion++;
  }

  /**
   * If a box of height h standing at (x, y, z) is inside the dragon (it lifted
   * its head under the player), the height to lift it to; otherwise y.
   */
  liftOut(x0: number, x1: number, y: number, z0: number, z1: number, h: number): number {
    if (!this.cells.size) return y;
    const inside = (yy: number) => {
      for (let cy = Math.floor(yy); cy <= Math.floor(yy + h); cy++)
        for (let cz = Math.floor(z0); cz <= Math.floor(z1); cz++)
          for (let cx = Math.floor(x0); cx <= Math.floor(x1); cx++) if (this.cells.has(cellKey(cx, cy, cz))) return true;
      return false;
    };
    if (!inside(y)) return y;
    for (let up = 1; up < 60; up++) if (!inside(Math.floor(y) + up)) return Math.floor(y) + up + 0.001;
    return y;
  }

  private settleNow(c: Creature): void {
    c.state = W.SLEEP; c.timer = 0; c.aux = rand(1, 4);
    c.head = HEAD_SLEEP; c.tail = TAIL_CURL; c.flap = -Math.PI / 2; c.flapAmp = 1.1;
    c.bob = -1.45 * c.scale;
    this.open = 0;
  }

  /** A model-space point on the head, in world space. */
  private headPoint(c: Creature, p: readonly number[], out: THREE.Vector3): THREE.Vector3 {
    const y = p[1] - NECK[1], z = p[2] - NECK[2];
    const cs = Math.cos(c.head), sn = Math.sin(c.head);
    out.set(p[0], NECK[1] + cs * y - sn * z, NECK[2] + sn * y + cs * z);
    this.e.set(-c.pitch, c.yaw, c.roll);
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(c.x, c.y + c.bob, c.z), this.q, this.sc.setScalar(c.scale));
    return out.applyMatrix4(this.m);
  }

  private placeEyes(c: Creature): void {
    const lid = Math.max(0, this.open - this.blink);
    this.eyes.forEach((eye, i) => {
      eye.visible = lid > 0.02;
      if (!eye.visible) return;
      this.headPoint(c, EYES[i], eye.position);
      eye.quaternion.copy(this.q);
      // Tilt with the head.
      eye.rotateX(c.head);
      eye.scale.set(c.scale, c.scale * lid, c.scale);
    });
  }

  private headDist(c: Creature): number {
    const h = this.headPoint(c, [0, 4.7, 5.4], new THREE.Vector3());
    return Math.hypot(h.x - this.px, (h.y - this.py) * 0.7, h.z - this.pz);
  }

  private say(c: Creature, text: string, sec: number, asleep = false): void {
    this.onSpeak?.(GREAT_NAME, text, sec, asleep);
    const h = this.headPoint(c, NOSE, new THREE.Vector3());
    if (!asleep) this.onSound?.('voice', [h.x, h.y, h.z], text);
  }

  // ------------------------------------------------------------ behaviour

  /** Returns false when the creature should be removed (never: it only despawns far away). */
  step(c: Creature, dt: number): boolean {
    c.timer -= dt;
    // Near the head, or anywhere in the lair (coming in from the tail side).
    const headD = this.headDist(c);
    const d = Math.min(headD, Math.hypot(c.x - this.px, c.z - this.pz) - 12);
    const breath = Math.sin(this.time * ((Math.PI * 2) / 6.5));
    c.walkAmp = 0;
    // Blinks while awake.
    this.blink = Math.max(0, this.blink - dt * 5);
    if (this.open > 0.9 && Math.random() < dt * 0.15) this.blink = 1.4;

    let headWant = HEAD_SLEEP, bobWant = -1.45, openWant = 0, tailWant = TAIL_CURL + Math.sin(this.time * 0.15) * 0.05;
    this.burnCool -= dt;
    this.scanT -= dt;
    if (c.state !== W.BURN && this.burnCool <= 0 && this.scanT <= 0) {
      this.scanT = 0.5;
      const prey = this.preyInReach(c);
      if (prey) {
        this.prey = prey; this.resume = c.state; c.state = W.BURN; c.timer = 3.4;
        this.onSound?.('stir', this.at(c));
      }
    }
    switch (c.state) {
      case W.SLEEP: {
        // Snore: smoke out of the nostrils on every breath out, now and then mumbling.
        c.aux -= dt;
        if (c.aux <= 0) {
          c.aux = 6.5;
          const n = this.headPoint(c, NOSE, new THREE.Vector3());
          this.host.fire.plume(n.x, n.y, n.z, Math.sin(c.yaw) * 1.2, 0.6, Math.cos(c.yaw) * 1.2, 4, 1.6);
          if (d < 160) this.onSound?.('snore', [n.x, n.y, n.z]);
        }
        if (d < 70 && Math.random() < dt * 0.012) this.say(c, pick(SLEEP_TALK), 4, true);
        if (d < 50 && this.cooldown <= 0) { c.state = W.STIR; c.timer = 3.2; this.onSound?.('stir', this.at(c)); }
        break;
      }
      case W.STIR: {
        openWant = 1;
        headWant = c.timer > 1.6 ? HEAD_SLEEP : HEAD_AWAKE;
        bobWant = -1.25;
        if (c.timer <= 0) { c.state = W.AWAKE; this.lines = this.script(c); this.next = 0.6; this.buzzed = false; }
        break;
      }
      case W.AWAKE: {
        openWant = 1; bobWant = -1.2;
        // Look down at the visitor (only the head pitches; the body stays on its gold).
        const h = this.headPoint(c, NECK, new THREE.Vector3());
        const look = Math.atan2(h.y - this.py, Math.max(6, Math.hypot(h.x - this.px, h.z - this.pz)));
        headWant = Math.max(-0.3, Math.min(0.5, HEAD_AWAKE + look * 0.6)) + Math.sin(this.time * 0.4) * 0.04;
        tailWant = TAIL_CURL - 0.2 + Math.sin(this.time * 0.35) * 0.25;
        if (!this.buzzed && headD < 16 && this.context().flying) {
          this.buzzed = true; this.lines.unshift('Burnumun dibinde vızıldama, sinek.'); this.next = Math.min(this.next, 0.5);
        }
        this.next -= dt;
        if (d > 95) {
          this.say(c, 'Git o zaman. Ben yine uyurum.', 4);
          c.state = W.SETTLE; c.timer = 5;
        } else if (this.next <= 0) {
          const line = this.lines.shift();
          if (line) {
            const sec = Math.min(9, 3 + line.length * 0.06);
            this.say(c, line, sec);
            this.next = sec + 1.2;
            this.talked = true;
          } else {
            c.state = W.YAWN; c.timer = 5.5;
            this.onSound?.('yawn', this.at(c));
          }
        }
        break;
      }
      case W.YAWN: {
        // Head thrown back, a column of fire into the sky.
        openWant = c.timer > 2 ? 0.35 : 0.6; bobWant = -1.1;
        headWant = c.timer > 1.2 ? -0.42 : HEAD_AWAKE;
        if (c.timer < 4.8 && c.timer > 2.2) {
          const m = this.headPoint(c, NOSE, new THREE.Vector3());
          this.host.fire.breathe(m.x, m.y, m.z, Math.sin(c.yaw) * 0.25, 1, Math.cos(c.yaw) * 0.25, dt, 3.4);
        }
        if (c.timer <= 0) {
          this.say(c, pick(['Yeter. Ejderler uzun konuşmaz... uzun uyur.', 'Hrrm... uykum geldi. Altınlarıma dokunma.', 'Yine gel. Belki. Yüz yıl sonra.']), 4.5);
          c.state = W.SETTLE; c.timer = 5;
        }
        break;
      }
      case W.SETTLE: {
        openWant = c.timer > 3 ? 0.5 : 0;
        if (c.timer <= 0) {
          c.state = W.SLEEP; c.aux = 2;
          if (this.talked) this.cooldown = rand(80, 120);
          this.talked = false;
        }
        break;
      }
      case W.BURN: {
        // Eye open, head down at the animal, a long jet of fire.
        const p = this.prey;
        openWant = 1; bobWant = -1.25;
        if (p && !p.gone) {
          const n = this.headPoint(c, NECK, new THREE.Vector3());
          const look = Math.atan2(n.y - p.y, Math.max(4, Math.hypot(n.x - p.x, n.z - p.z)));
          headWant = Math.max(-0.2, Math.min(0.95, look * 0.9));
          if (c.timer < 2.7 && c.timer > 0.7) {
            const m = this.headPoint(c, NOSE, new THREE.Vector3());
            const dx = p.x - m.x, dy = p.y + 0.5 - m.y, dz = p.z - m.z, l = Math.hypot(dx, dy, dz) || 1;
            this.host.fire.breathe(m.x, m.y, m.z, dx / l, dy / l, dz / l, dt, Math.min(3, 0.8 + l / 18));
            if (c.timer < 2.2 && p.dying === 0) this.host.killAnimal(p);
          }
          if (c.timer < 2.6 && c.timer + dt >= 2.6) this.onSound?.('burn', this.at(c));
        } else headWant = HEAD_AWAKE;
        if (c.timer <= 0) {
          this.prey = null;
          this.burnCool = rand(5, 9);
          const r = this.resume;
          if (r === W.AWAKE) { c.state = W.AWAKE; this.lines.unshift(pick(SNACK_AWAKE)); this.next = 0.8; }
          else if (r === W.STIR) { c.state = W.STIR; c.timer = 1.6; }
          else {
            if (r === W.SLEEP && d < 70) this.say(c, pick(SNACK_ASLEEP), 3.5, true);
            c.state = W.SETTLE; c.timer = 4;
          }
        }
        break;
      }
    }
    const k = Math.min(1, dt * (c.state === W.YAWN ? 2.2 : 0.9));
    c.head += (headWant - c.head) * k;
    c.tail += (tailWant - c.tail) * Math.min(1, dt * 0.6);
    c.bob += ((bobWant + breath * 0.035) * c.scale - c.bob) * Math.min(1, dt * 0.8);
    this.open += (openWant - this.open) * Math.min(1, dt * (openWant > this.open ? 1.4 : 2));
    // Wings stay folded; they shrug a little when it yawns.
    c.flap += (-Math.PI / 2 - c.flap) * Math.min(1, dt * 2);
    c.flapAmp += ((c.state === W.YAWN ? 0.8 : 1.1) - c.flapAmp) * Math.min(1, dt);
    c.pitch = 0; c.roll = 0;
    return true;
  }

  /** A wild animal within fire reach in front of the head (not behind the body). */
  private preyInReach(c: Creature): Creature | null {
    const h = this.headPoint(c, NOSE, new THREE.Vector3());
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    // Look around a point ahead of the snout, so the whole front of the lair is covered.
    const p = this.host.nearestAnimal(h.x + fx * 14, h.z + fz * 14, 30);
    if (!p || p.dying > 0) return null;
    const dx = p.x - h.x, dz = p.z - h.z, l = Math.hypot(dx, dz) || 1;
    if ((dx * fx + dz * fz) / l < -0.15 || l > 42) return null;
    return p;
  }

  private at(c: Creature): [number, number, number] {
    const n = this.headPoint(c, NOSE, new THREE.Vector3());
    return [n.x, n.y, n.z];
  }

  /** What it says this time: a greeting, then three things from what it knows. */
  private script(c: Creature): string[] {
    this.wakes++;
    const out: string[] = [];
    if (this.wakes > 1) out.push(pick(['Hâlâ burada mısın?', 'Yine mi sen? Uyku nedir bilmez misin?']));
    else if (this.met) out.push('Yine sen. Ayak seslerini hatırlıyorum, küçük.', 'Közhan unutmaz.');
    else {
      out.push('Hmm... Bir ayak sesi. Yüz yıldır kimse bu kadar yaklaşmaya cesaret edemedi.', `Ben ${GREAT_NAME}. Bu dağlar daha tepeyken ben uyuyordum.`);
      this.met = true;
      try { localStorage.setItem(this.storeKey, '1'); } catch { /* storage blocked */ }
    }
    const ctx = this.context();
    const night = this.night;
    const pool: string[][] = [
      ['Altınlarıma bakma. Her birini sayarım... rüyamda bile.'],
      [night ? 'Ay yine geç kaldı. Benim gençliğimde gökte üç ay vardı.' : 'Güneş gözlerimi yakıyor. Gölgeme gel de yüzünü göreyim.'],
      [ctx.found === 0 ? 'Daha hiçbir efsaneye ayak basmamışsın. Dünya geniş, sen küçüksün. Git, gez.'
        : ctx.found < 7 ? `${ctx.found} efsane bulmuşsun. Bir ölümlü için fena değil.`
          : `${ctx.found} efsane! Benden sonra bu dünyayı en iyi tanıyan sen olabilirsin.`],
      ['Kara suların altında benden de büyük bir şey uyuyor. Ona benden selam söyleme.'],
      ['Gökte süzülen o kızıl kertenkeleler benim torunlarım. Hiç ziyarete gelmezler.'],
      ['Şehirdekiler hâlâ benim adımla çocuklarını korkutuyor mu? Güzel.'],
      ['Bir bilmece: Ağzı var, konuşmaz. Yatağı var, uyumaz.', '...Nehir, küçük. Nehir.'],
      ['Bilmece: Ne kadar çok yürürsen, ardında o kadar çoğunu bırakırsın.', '...Ayak izi. Hiç bilemezler.'],
      ['Geceleri iskeletler dolaşıyor. Benim kemiklerime göz dikmesinler.'],
      ['Uyumak güzel. Rüyamda yine gençtim; gök daha maviydi, altın daha parlaktı.'],
    ];
    const t = this.terrain.tower;
    if (t) pool.push([`${direction(t.x - c.x, t.z - c.z)} kara bir kule var. Tepesindeki göz hiç uyumaz. Ben de onu sevmem.`]);
    if (ctx.flying) pool.push(['Kanatsız uçuyorsun. Ne kaba bir büyü.']);
    // Things not yet said come first.
    pool.sort(() => Math.random() - 0.5);
    pool.sort((a, b) => Number(this.said.has(a[0])) - Number(this.said.has(b[0])));
    for (const p of pool.slice(0, 3)) { out.push(...p); this.said.add(p[0]); }
    return out;
  }

  private said = new Set<string>();
  /** Set by the game: how dark it is (0 day .. 1 night). */
  night = 0;

  // ------------------------------------------------------------ dev

  dev(what: string): string {
    const c = this.host.live(GREAT_DRAGON)[0];
    if (!c) return 'no great dragon nearby';
    if (what === 'wake') { this.cooldown = 0; c.state = W.STIR; c.timer = 3.2; return 'waking'; }
    if (what === 'yawn') { c.state = W.YAWN; c.timer = 5.5; return 'yawn'; }
    if (what === 'sleep') { this.settleNow(c); return 'asleep'; }
    if (what === 'prey') { this.burnCool = 0; this.scanT = 0; const p = this.preyInReach(c); return p ? `prey at ${Math.round(p.x)},${Math.round(p.z)}` : 'no animal in reach'; }
    return 'wake|yawn|sleep|prey';
  }

  info(): string {
    const lair = this.terrain.landmarks.lair();
    const c = this.host.live(GREAT_DRAGON)[0];
    return `lair=${lair ? `${lair.x},${lair.z}` : 'none'} dragon=${c ? `${Math.round(c.x)},${Math.round(c.y)},${Math.round(c.z)} state=${c.state} head=${c.head.toFixed(2)} open=${this.open.toFixed(2)} d=${Math.round(this.headDist(c))}` : 'none'} lines=${this.lines.length}`;
  }
}
