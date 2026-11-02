// Voxel-box rigs: a creature model is a list of axis-aligned boxes. Each box
// belongs to an animated part (see createCreatureMaterial for the part ids) and
// rotates about its pivot on the GPU. Units are blocks; origin at the feet,
// facing +Z.

import * as THREE from 'three';

export const PART = {
  STATIC: 0, LEG_A: 1, LEG_B: 2, WING_R: 3, WING_L: 4, TAIL: 5, HEAD: 6, TIP_R: 7, TIP_L: 8, ARM_R: 9, ARM_L: 10,
} as const;

/** Colour slots: which per-instance colour multiplies a box. */
export const SLOT = { FIXED: 0, TINT: 1, TINT2: 2, SKIN: 3, HAIR: 4 } as const;

export interface Box {
  /** Size (w, h, d). */
  s: [number, number, number];
  /** Centre. */
  at: [number, number, number];
  c: THREE.ColorRepresentation;
  part?: number;
  pivot?: [number, number, number];
  /** Wing-tip boxes: the shoulder pivot of the wing they hang off. */
  pivot2?: [number, number, number];
  /** Colour slot (default TINT). */
  t?: number;
}

// Face corner layout per axis direction (unit cube, centred).
const FACES: Array<{ n: [number, number, number]; v: Array<[number, number, number]> }> = [
  { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

export function buildRig(boxes: Box[]): THREE.BufferGeometry {
  const n = boxes.length * 24;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const piv = new Float32Array(n * 3), piv2 = new Float32Array(n * 3), part = new Float32Array(n * 2);
  const idx: number[] = [];
  const c = new THREE.Color();
  let v = 0;
  for (const b of boxes) {
    c.set(b.c);
    const p = b.pivot ?? b.at, p2 = b.pivot2 ?? p;
    for (const f of FACES) {
      // Slightly darker undersides read better than flat colour under soft light.
      const shade = f.n[1] < 0 ? 0.8 : 1;
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      for (const corner of f.v) {
        for (let k = 0; k < 3; k++) {
          pos[v * 3 + k] = b.at[k] + corner[k] * b.s[k] * 0.5;
          nor[v * 3 + k] = f.n[k];
          piv[v * 3 + k] = p[k];
          piv2[v * 3 + k] = p2[k];
        }
        col[v * 3] = c.r * shade; col[v * 3 + 1] = c.g * shade; col[v * 3 + 2] = c.b * shade;
        // Part id and colour slot share one attribute (WebGL has only 16 slots).
        part[v * 2] = b.part ?? PART.STATIC;
        part[v * 2 + 1] = b.t ?? SLOT.TINT;
        v++;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
  g.setAttribute('aPivot2', new THREE.BufferAttribute(piv2, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 2));
  g.setIndex(idx);
  return g;
}

/** Mirror a box across X (for symmetric limbs). */
export function mirror(b: Box, part?: number): Box {
  const m = (a?: [number, number, number]) => (a ? [-a[0], a[1], a[2]] as [number, number, number] : undefined);
  return { ...b, at: m(b.at)!, pivot: m(b.pivot), pivot2: m(b.pivot2), part: part ?? b.part };
}
