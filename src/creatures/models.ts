// Box models for every creature. Colours are sRGB and get multiplied with a
// per-instance tint, so white-ish parts take the tint and dark parts stay dark.

import { PART, SLOT, mirror, type Box } from './rig';

type V3 = [number, number, number];

function legs4(w: number, h: number, x: number, zf: number, zb: number, c: string, top: number): Box[] {
  const leg = (lx: number, lz: number, part: number): Box => ({ s: [w, h, w], at: [lx, top - h / 2, lz], c, part, pivot: [lx, top, lz] });
  // Diagonal gait: front-left with back-right.
  return [leg(x, zf, PART.LEG_A), leg(-x, zf, PART.LEG_B), leg(x, zb, PART.LEG_B), leg(-x, zb, PART.LEG_A)];
}

export function deer(): Box[] {
  const body = '#b58a66', belly = '#ecdcc2', dark = '#5a3a26', neckP: V3 = [0, 1.25, 0.45];
  return [
    { s: [0.46, 0.46, 1.05], at: [0, 1.0, 0], c: body },
    { s: [0.36, 0.12, 0.8], at: [0, 0.74, 0], c: belly },
    ...legs4(0.13, 0.8, 0.15, 0.38, -0.38, dark, 0.8),
    { s: [0.12, 0.16, 0.08], at: [0, 1.12, -0.55], c: '#f6efe2', part: PART.TAIL, pivot: [0, 1.2, -0.5] },
    // Head group pitches at the neck base (grazing).
    { s: [0.22, 0.55, 0.22], at: [0, 1.45, 0.5], c: body, part: PART.HEAD, pivot: neckP },
    { s: [0.26, 0.26, 0.4], at: [0, 1.72, 0.66], c: body, part: PART.HEAD, pivot: neckP },
    { s: [0.12, 0.1, 0.06], at: [0, 1.66, 0.88], c: '#2a1f1a', part: PART.HEAD, pivot: neckP },
    { s: [0.06, 0.14, 0.04], at: [0.16, 1.88, 0.56], c: body, part: PART.HEAD, pivot: neckP },
    { s: [0.06, 0.14, 0.04], at: [-0.16, 1.88, 0.56], c: body, part: PART.HEAD, pivot: neckP },
    // Small antlers.
    { s: [0.05, 0.32, 0.05], at: [0.09, 2.0, 0.6], c: '#e8dcc0', part: PART.HEAD, pivot: neckP },
    { s: [0.05, 0.32, 0.05], at: [-0.09, 2.0, 0.6], c: '#e8dcc0', part: PART.HEAD, pivot: neckP },
    { s: [0.05, 0.05, 0.18], at: [0.09, 2.08, 0.68], c: '#e8dcc0', part: PART.HEAD, pivot: neckP },
    { s: [0.05, 0.05, 0.18], at: [-0.09, 2.08, 0.68], c: '#e8dcc0', part: PART.HEAD, pivot: neckP },
    { s: [0.05, 0.05, 0.05], at: [0.135, 1.78, 0.8], c: '#111', part: PART.HEAD, pivot: neckP },
    { s: [0.05, 0.05, 0.05], at: [-0.135, 1.78, 0.8], c: '#111', part: PART.HEAD, pivot: neckP },
  ];
}

export function rabbit(): Box[] {
  const fur = '#ffffff', headP: V3 = [0, 0.32, 0.12];
  return [
    { s: [0.28, 0.26, 0.4], at: [0, 0.27, -0.02], c: fur },
    { s: [0.08, 0.1, 0.16], at: [0.1, 0.07, 0.12], c: fur, part: PART.LEG_A, pivot: [0, 0.14, 0.12] },
    { s: [0.08, 0.1, 0.16], at: [-0.1, 0.07, 0.12], c: fur, part: PART.LEG_A, pivot: [0, 0.14, 0.12] },
    { s: [0.1, 0.14, 0.24], at: [0.12, 0.08, -0.12], c: fur, part: PART.LEG_B, pivot: [0, 0.16, -0.12] },
    { s: [0.1, 0.14, 0.24], at: [-0.12, 0.08, -0.12], c: fur, part: PART.LEG_B, pivot: [0, 0.16, -0.12] },
    { s: [0.1, 0.1, 0.08], at: [0, 0.32, -0.25], c: '#f4f1ec' },
    { s: [0.2, 0.2, 0.22], at: [0, 0.44, 0.2], c: fur, part: PART.HEAD, pivot: headP },
    { s: [0.06, 0.24, 0.04], at: [0.05, 0.64, 0.16], c: fur, part: PART.HEAD, pivot: headP },
    { s: [0.06, 0.24, 0.04], at: [-0.05, 0.64, 0.16], c: fur, part: PART.HEAD, pivot: headP },
    { s: [0.04, 0.04, 0.03], at: [0, 0.42, 0.32], c: '#d48c9a', part: PART.HEAD, pivot: headP },
    { s: [0.04, 0.04, 0.04], at: [0.09, 0.48, 0.26], c: '#111', part: PART.HEAD, pivot: headP },
    { s: [0.04, 0.04, 0.04], at: [-0.09, 0.48, 0.26], c: '#111', part: PART.HEAD, pivot: headP },
  ];
}

export function boar(): Box[] {
  const hide = '#6e5040', dark = '#3b2a22', headP: V3 = [0, 0.7, 0.45];
  return [
    { s: [0.6, 0.55, 1.0], at: [0, 0.68, 0], c: hide },
    { s: [0.16, 0.14, 0.9], at: [0, 1.0, 0], c: dark },
    ...legs4(0.15, 0.42, 0.18, 0.32, -0.32, dark, 0.42),
    { s: [0.06, 0.2, 0.06], at: [0, 0.75, -0.53], c: dark, part: PART.TAIL, pivot: [0, 0.85, -0.5] },
    { s: [0.44, 0.42, 0.4], at: [0, 0.68, 0.66], c: hide, part: PART.HEAD, pivot: headP },
    { s: [0.24, 0.18, 0.14], at: [0, 0.6, 0.92], c: '#c99a8a', part: PART.HEAD, pivot: headP },
    { s: [0.05, 0.14, 0.05], at: [0.15, 0.6, 0.92], c: '#f2ead8', part: PART.HEAD, pivot: headP },
    { s: [0.05, 0.14, 0.05], at: [-0.15, 0.6, 0.92], c: '#f2ead8', part: PART.HEAD, pivot: headP },
    { s: [0.1, 0.12, 0.06], at: [0.16, 0.95, 0.6], c: dark, part: PART.HEAD, pivot: headP },
    { s: [0.1, 0.12, 0.06], at: [-0.16, 0.95, 0.6], c: dark, part: PART.HEAD, pivot: headP },
    { s: [0.05, 0.05, 0.05], at: [0.16, 0.78, 0.86], c: '#111', part: PART.HEAD, pivot: headP },
    { s: [0.05, 0.05, 0.05], at: [-0.16, 0.78, 0.86], c: '#111', part: PART.HEAD, pivot: headP },
  ];
}

export function bird(): Box[] {
  const wing: Box = { s: [0.38, 0.03, 0.2], at: [0.27, 0.02, 0], c: '#e8e8e8', part: PART.WING_R, pivot: [0.08, 0.02, 0] };
  return [
    { s: [0.16, 0.15, 0.32], at: [0, 0, 0], c: '#ffffff' },
    { s: [0.13, 0.13, 0.13], at: [0, 0.07, 0.2], c: '#ffffff' },
    { s: [0.05, 0.04, 0.08], at: [0, 0.05, 0.3], c: '#f0a040' },
    { s: [0.12, 0.03, 0.14], at: [0, 0.02, -0.22], c: '#d8d8d8' },
    wing, mirror(wing, PART.WING_L),
  ];
}

export function fish(): Box[] {
  return [
    { s: [0.12, 0.2, 0.42], at: [0, 0, 0], c: '#ffffff' },
    { s: [0.03, 0.18, 0.16], at: [0, 0, -0.28], c: '#e0e0e0', part: PART.TAIL, pivot: [0, 0, -0.2] },
    { s: [0.02, 0.08, 0.12], at: [0, 0.13, 0], c: '#e0e0e0' },
    { s: [0.03, 0.03, 0.03], at: [0.05, 0.04, 0.15], c: '#111' },
    { s: [0.03, 0.03, 0.03], at: [-0.05, 0.04, 0.15], c: '#111' },
  ];
}

export function butterfly(): Box[] {
  const wing: Box = { s: [0.17, 0.01, 0.2], at: [0.095, 0, 0.02], c: '#ffffff', part: PART.WING_R, pivot: [0.01, 0, 0] };
  const hind: Box = { s: [0.12, 0.01, 0.12], at: [0.07, 0, -0.1], c: '#e6e6e6', part: PART.WING_R, pivot: [0.01, 0, 0] };
  return [
    { s: [0.03, 0.03, 0.18], at: [0, 0, 0], c: '#2a2230' },
    wing, mirror(wing, PART.WING_L), hind, mirror(hind, PART.WING_L),
  ];
}

export function firefly(): Box[] {
  return [
    { s: [0.05, 0.05, 0.09], at: [0, 0, 0.04], c: '#3a3040' },
    { s: [0.07, 0.07, 0.08], at: [0, -0.01, -0.04], c: '#e6ff8a' },
  ];
}

/** A big dragon: ~11 blocks long, ~16 block wingspan at scale 1. */
export function dragon(): Box[] {
  const scale = '#7a3348', belly = '#e2b56c', wingC = '#5c2738', horn = '#eadfc4', spine = '#3e1a28';
  const neckP: V3 = [0, 3.1, 2.2];
  const tailP: V3 = [0, 2.9, -2.4];
  const shoulder: V3 = [1.0, 3.6, 1.0];
  const elbow: V3 = [4.6, 3.6, 1.0];
  const innerWing: Box = { s: [3.6, 0.16, 2.6], at: [2.8, 3.6, 0.0], c: wingC, part: PART.WING_R, pivot: shoulder };
  const armBone: Box = { s: [3.6, 0.3, 0.3], at: [2.8, 3.7, 1.15], c: scale, part: PART.WING_R, pivot: shoulder };
  const tip: Box = { s: [4.4, 0.12, 2.4], at: [6.8, 3.6, -0.3], c: wingC, part: PART.TIP_R, pivot: elbow, pivot2: shoulder };
  const tipBone: Box = { s: [4.4, 0.24, 0.24], at: [6.8, 3.68, 0.9], c: scale, part: PART.TIP_R, pivot: elbow, pivot2: shoulder };
  const claw: Box = { s: [0.3, 0.3, 0.6], at: [4.7, 3.8, 1.3], c: horn, part: PART.TIP_R, pivot: elbow, pivot2: shoulder };
  return [
    // Body and belly.
    { s: [2.2, 2.0, 4.6], at: [0, 3.0, 0], c: scale },
    { s: [1.8, 0.4, 4.0], at: [0, 1.95, 0.1], c: belly },
    { s: [0.3, 0.5, 4.0], at: [0, 4.2, 0], c: spine },
    // Legs.
    ...legs4(0.6, 2.0, 0.8, 1.4, -1.4, scale, 2.2),
    { s: [0.7, 0.3, 0.9], at: [0.8, 0.15, 1.6], c: scale, part: PART.LEG_A, pivot: [0.8, 2.2, 1.4] },
    { s: [0.7, 0.3, 0.9], at: [-0.8, 0.15, 1.6], c: scale, part: PART.LEG_B, pivot: [-0.8, 2.2, 1.4] },
    { s: [0.7, 0.3, 0.9], at: [0.8, 0.15, -1.2], c: scale, part: PART.LEG_B, pivot: [0.8, 2.2, -1.4] },
    { s: [0.7, 0.3, 0.9], at: [-0.8, 0.15, -1.2], c: scale, part: PART.LEG_A, pivot: [-0.8, 2.2, -1.4] },
    // Tail (swings as one piece, tapering).
    { s: [1.4, 1.3, 2.4], at: [0, 2.9, -3.5], c: scale, part: PART.TAIL, pivot: tailP },
    { s: [0.9, 0.8, 2.4], at: [0, 2.8, -5.8], c: scale, part: PART.TAIL, pivot: tailP },
    { s: [0.5, 0.5, 2.2], at: [0, 2.7, -7.9], c: scale, part: PART.TAIL, pivot: tailP },
    { s: [1.2, 0.12, 0.9], at: [0, 2.7, -9.1], c: wingC, part: PART.TAIL, pivot: tailP },
    { s: [0.2, 0.4, 4.2], at: [0, 3.65, -4.6], c: spine, part: PART.TAIL, pivot: tailP },
    // Neck and head.
    { s: [1.0, 1.0, 2.0], at: [0, 3.6, 2.9], c: scale, part: PART.HEAD, pivot: neckP },
    { s: [0.9, 0.9, 1.4], at: [0, 4.3, 4.2], c: scale, part: PART.HEAD, pivot: neckP },
    { s: [0.2, 0.4, 2.6], at: [0, 4.4, 3.3], c: spine, part: PART.HEAD, pivot: neckP },
    { s: [1.3, 1.0, 1.6], at: [0, 4.7, 5.4], c: scale, part: PART.HEAD, pivot: neckP },
    { s: [0.9, 0.5, 1.2], at: [0, 4.45, 6.6], c: scale, part: PART.HEAD, pivot: neckP },
    { s: [0.85, 0.25, 1.3], at: [0, 4.05, 6.4], c: belly, part: PART.HEAD, pivot: neckP },
    { s: [0.2, 0.2, 0.2], at: [0.66, 4.9, 5.9], c: '#ffd34a', part: PART.HEAD, pivot: neckP },
    { s: [0.2, 0.2, 0.2], at: [-0.66, 4.9, 5.9], c: '#ffd34a', part: PART.HEAD, pivot: neckP },
    { s: [0.22, 0.22, 1.2], at: [0.45, 5.35, 4.7], c: horn, part: PART.HEAD, pivot: neckP },
    { s: [0.22, 0.22, 1.2], at: [-0.45, 5.35, 4.7], c: horn, part: PART.HEAD, pivot: neckP },
    { s: [0.16, 0.16, 0.16], at: [0.2, 4.6, 7.2], c: '#1a0d12', part: PART.HEAD, pivot: neckP },
    { s: [0.16, 0.16, 0.16], at: [-0.2, 4.6, 7.2], c: '#1a0d12', part: PART.HEAD, pivot: neckP },
    // Wings: inner panel + bone, outer panel + bone + thumb claw.
    innerWing, mirror(innerWing, PART.WING_L), armBone, mirror(armBone, PART.WING_L),
    tip, mirror(tip, PART.TIP_L), tipBone, mirror(tipBone, PART.TIP_L), claw, mirror(claw, PART.TIP_L),
  ];
}

// ------------------------------------------------------------------ people
// Humanoids share one body plan. Colour slots: TINT shirt, TINT2 trousers,
// SKIN (per-instance tone), HAIR; FIXED parts keep their own colour.

function body(opts: { hair?: boolean; long?: boolean } = {}): Box[] {
  const S = SLOT;
  const legP = (x: number): V3 => [x, 0.74, 0];
  const armP = (x: number): V3 => [x, 1.32, 0];
  const headP: V3 = [0, 1.36, 0];
  const out: Box[] = [
    // Legs and boots.
    { s: [0.21, 0.74, 0.22], at: [0.12, 0.4, 0], c: '#ffffff', t: S.TINT2, part: PART.LEG_A, pivot: legP(0.12) },
    { s: [0.21, 0.74, 0.22], at: [-0.12, 0.4, 0], c: '#ffffff', t: S.TINT2, part: PART.LEG_B, pivot: legP(-0.12) },
    { s: [0.23, 0.12, 0.28], at: [0.12, 0.06, 0.03], c: '#4a3424', t: S.FIXED, part: PART.LEG_A, pivot: legP(0.12) },
    { s: [0.23, 0.12, 0.28], at: [-0.12, 0.06, 0.03], c: '#4a3424', t: S.FIXED, part: PART.LEG_B, pivot: legP(-0.12) },
    // Torso, belt.
    { s: [0.5, 0.62, 0.27], at: [0, 1.05, 0], c: '#ffffff', t: S.TINT },
    { s: [0.52, 0.08, 0.29], at: [0, 0.77, 0], c: '#5a3c24', t: S.FIXED },
    // Arms: sleeve + hand (right arm swings with the left leg).
    { s: [0.15, 0.42, 0.17], at: [0.33, 1.13, 0], c: '#ffffff', t: S.TINT, part: PART.ARM_R, pivot: armP(0.33) },
    { s: [0.15, 0.42, 0.17], at: [-0.33, 1.13, 0], c: '#ffffff', t: S.TINT, part: PART.ARM_L, pivot: armP(-0.33) },
    { s: [0.13, 0.2, 0.15], at: [0.33, 0.83, 0], c: '#ffffff', t: S.SKIN, part: PART.ARM_R, pivot: armP(0.33) },
    { s: [0.13, 0.2, 0.15], at: [-0.33, 0.83, 0], c: '#ffffff', t: S.SKIN, part: PART.ARM_L, pivot: armP(-0.33) },
    // Head with eyes, nose.
    { s: [0.4, 0.4, 0.38], at: [0, 1.57, 0], c: '#ffffff', t: S.SKIN, part: PART.HEAD, pivot: headP },
    { s: [0.07, 0.06, 0.02], at: [0.09, 1.6, 0.195], c: '#2a2030', t: S.FIXED, part: PART.HEAD, pivot: headP },
    { s: [0.07, 0.06, 0.02], at: [-0.09, 1.6, 0.195], c: '#2a2030', t: S.FIXED, part: PART.HEAD, pivot: headP },
    { s: [0.06, 0.08, 0.05], at: [0, 1.53, 0.21], c: '#e8e8e8', t: S.SKIN, part: PART.HEAD, pivot: headP },
  ];
  if (opts.long) out.push({ s: [0.52, 0.42, 0.29], at: [0, 0.6, 0], c: '#ffffff', t: S.TINT }); // robe skirt
  if (opts.hair !== false) {
    out.push(
      { s: [0.42, 0.12, 0.4], at: [0, 1.81, 0], c: '#ffffff', t: S.HAIR, part: PART.HEAD, pivot: headP },
      { s: [0.42, 0.3, 0.08], at: [0, 1.62, -0.18], c: '#ffffff', t: S.HAIR, part: PART.HEAD, pivot: headP },
      { s: [0.06, 0.18, 0.3], at: [0.2, 1.68, -0.02], c: '#ffffff', t: S.HAIR, part: PART.HEAD, pivot: headP },
      { s: [0.06, 0.18, 0.3], at: [-0.2, 1.68, -0.02], c: '#ffffff', t: S.HAIR, part: PART.HEAD, pivot: headP },
    );
  }
  return out;
}

const SL = SLOT;
const headPivot: V3 = [0, 1.36, 0];

export function villager(): Box[] { return body(); }

export function farmer(): Box[] {
  return [
    ...body(),
    { s: [0.66, 0.05, 0.66], at: [0, 1.84, 0], c: '#e2c46a', t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.36, 0.14, 0.36], at: [0, 1.93, 0], c: '#d8b85a', t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.38, 0.03, 0.04], at: [0, 1.88, 0.17], c: '#b0484a', t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
  ];
}

export function merchant(): Box[] {
  return [
    ...body(),
    { s: [0.44, 0.55, 0.03], at: [0, 0.82, 0.15], c: '#f2ead8', t: SL.FIXED }, // apron
    { s: [0.46, 0.16, 0.44], at: [0, 1.85, 0], c: '#ffffff', t: SL.TINT2, part: PART.HEAD, pivot: headPivot }, // cap
  ];
}

export function elder(): Box[] {
  return [
    ...body({ long: true }),
    { s: [0.3, 0.24, 0.06], at: [0, 1.4, 0.2], c: '#eeeeee', t: SL.FIXED, part: PART.HEAD, pivot: headPivot }, // beard
    { s: [0.05, 1.6, 0.05], at: [0.42, 0.8, 0.12], c: '#6a4a2a', t: SL.FIXED, part: PART.ARM_R, pivot: [0.33, 1.32, 0] }, // walking stick
  ];
}

export function guard(): Box[] {
  const steel = '#9aa0ac';
  return [
    ...body({ hair: false }),
    { s: [0.44, 0.22, 0.42], at: [0, 1.82, 0], c: steel, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.08, 0.14, 0.1], at: [0, 1.95, 0], c: '#c84a4a', t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.54, 0.4, 0.3], at: [0, 1.14, 0], c: steel, t: SL.FIXED }, // breastplate
    { s: [0.05, 2.2, 0.05], at: [0.42, 1.2, 0.1], c: '#6a4a2a', t: SL.FIXED, part: PART.ARM_R, pivot: [0.33, 1.32, 0] }, // spear
    { s: [0.1, 0.22, 0.1], at: [0.42, 2.38, 0.1], c: steel, t: SL.FIXED, part: PART.ARM_R, pivot: [0.33, 1.32, 0] },
    // Lantern on the left hand (glows at night).
    { s: [0.16, 0.2, 0.16], at: [-0.33, 0.66, 0.04], c: '#ffd27a', t: SL.FIXED, part: PART.ARM_L, pivot: [-0.33, 1.32, 0] },
  ];
}

export function kid(): Box[] { return body(); }

export function bard(): Box[] {
  return [
    ...body(),
    // Floppy cap with a feather.
    { s: [0.48, 0.14, 0.48], at: [0, 1.84, 0], c: '#ffffff', t: SL.TINT2, part: PART.HEAD, pivot: headPivot },
    { s: [0.04, 0.3, 0.1], at: [0.2, 2.0, -0.1], c: '#f2e8a0', t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    // Lute held across the chest: round body, neck, peg box.
    { s: [0.3, 0.34, 0.12], at: [-0.08, 0.98, 0.22], c: '#b07a40', t: SL.FIXED },
    { s: [0.1, 0.1, 0.13], at: [-0.08, 0.98, 0.29], c: '#4a3020', t: SL.FIXED },
    { s: [0.07, 0.07, 0.42], at: [-0.22, 1.18, 0.2], c: '#7a5030', t: SL.FIXED },
  ];
}

export function crier(): Box[] {
  return [
    ...body({ long: true }),
    // Tricorn hat and a hand bell in the right hand.
    { s: [0.56, 0.08, 0.52], at: [0, 1.82, 0], c: '#2a2430', t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.38, 0.16, 0.36], at: [0, 1.92, 0], c: '#2a2430', t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.06, 0.04, 0.4], at: [0, 1.87, 0], c: '#d8b04a', t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.05, 0.16, 0.05], at: [0.33, 0.62, 0.06], c: '#6a4a2a', t: SL.FIXED, part: PART.ARM_R, pivot: [0.33, 1.32, 0] },
    { s: [0.16, 0.16, 0.16], at: [0.33, 0.48, 0.06], c: '#e0b84a', t: SL.FIXED, part: PART.ARM_R, pivot: [0.33, 1.32, 0] },
  ];
}

export function traveler(): Box[] {
  return [
    ...body({ hair: false, long: true }),
    // Hood and cloak.
    { s: [0.46, 0.46, 0.34], at: [0, 1.62, -0.08], c: '#ffffff', t: SL.TINT2, part: PART.HEAD, pivot: headPivot },
    { s: [0.56, 0.9, 0.08], at: [0, 1.0, -0.17], c: '#ffffff', t: SL.TINT2 },
    // Backpack with bedroll.
    { s: [0.4, 0.46, 0.2], at: [0, 1.1, -0.27], c: '#7a5634', t: SL.FIXED },
    { s: [0.46, 0.14, 0.14], at: [0, 1.38, -0.3], c: '#b05a4a', t: SL.FIXED },
    { s: [0.05, 1.7, 0.05], at: [0.42, 0.85, 0.14], c: '#6a4a2a', t: SL.FIXED, part: PART.ARM_R, pivot: [0.33, 1.32, 0] },
  ];
}

// ------------------------------------------------------------------ night monsters
// Humanoid monsters reuse the people's part layout (legs 1/2, arms 9/10, head 6)
// so walking and swinging animate the same way. Arms raise with aPose.y.

function limbs(c: string, opts: { thin?: number; legH?: number } = {}): Box[] {
  const w = opts.thin ?? 0.21, legH = opts.legH ?? 0.74;
  const legP = (x: number): V3 => [x, legH, 0];
  const armP = (x: number): V3 => [x, 1.32, 0];
  return [
    { s: [w, legH, w], at: [0.12, legH / 2, 0], c, t: SL.FIXED, part: PART.LEG_A, pivot: legP(0.12) },
    { s: [w, legH, w], at: [-0.12, legH / 2, 0], c, t: SL.FIXED, part: PART.LEG_B, pivot: legP(-0.12) },
    { s: [w * 0.75, 0.62, w * 0.8], at: [0.33, 1.02, 0], c, t: SL.FIXED, part: PART.ARM_R, pivot: armP(0.33) },
    { s: [w * 0.75, 0.62, w * 0.8], at: [-0.33, 1.02, 0], c, t: SL.FIXED, part: PART.ARM_L, pivot: armP(-0.33) },
  ];
}

export function skeleton(): Box[] {
  const bone = '#e8e2d0', dark = '#2a2228';
  return [
    ...limbs(bone, { thin: 0.1 }),
    { s: [0.1, 0.62, 0.1], at: [0, 1.05, -0.04], c: bone, t: SL.FIXED }, // spine
    { s: [0.42, 0.06, 0.22], at: [0, 1.28, 0], c: bone, t: SL.FIXED }, // ribs
    { s: [0.38, 0.06, 0.2], at: [0, 1.16, 0], c: bone, t: SL.FIXED },
    { s: [0.34, 0.06, 0.18], at: [0, 1.04, 0], c: bone, t: SL.FIXED },
    { s: [0.36, 0.1, 0.18], at: [0, 0.78, 0], c: bone, t: SL.FIXED }, // pelvis
    { s: [0.38, 0.38, 0.36], at: [0, 1.57, 0], c: bone, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.1, 0.1, 0.02], at: [0.09, 1.6, 0.185], c: dark, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.1, 0.1, 0.02], at: [-0.09, 1.6, 0.185], c: dark, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.24, 0.04, 0.02], at: [0, 1.45, 0.185], c: dark, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    // A rusty blade in the right hand.
    { s: [0.05, 0.08, 0.5], at: [0.33, 0.72, 0.22], c: '#7a6a5a', t: SL.FIXED, part: PART.ARM_R, pivot: [0.33, 1.32, 0] },
    { s: [0.04, 0.06, 0.12], at: [0.33, 0.72, -0.06], c: '#4a3424', t: SL.FIXED, part: PART.ARM_R, pivot: [0.33, 1.32, 0] },
  ];
}

export function zombie(): Box[] {
  const skin = '#7a9a5a', rag = '#ffffff';
  return [
    ...limbs(skin),
    { s: [0.23, 0.42, 0.24], at: [0.12, 0.5, 0], c: '#4a4a5a', t: SL.FIXED, part: PART.LEG_A, pivot: [0.12, 0.74, 0] }, // torn trousers
    { s: [0.23, 0.42, 0.24], at: [-0.12, 0.5, 0], c: '#4a4a5a', t: SL.FIXED, part: PART.LEG_B, pivot: [-0.12, 0.74, 0] },
    { s: [0.5, 0.62, 0.27], at: [0, 1.05, 0], c: rag, t: SL.TINT },
    { s: [0.17, 0.3, 0.19], at: [0.33, 1.2, 0], c: rag, t: SL.TINT, part: PART.ARM_R, pivot: [0.33, 1.32, 0] },
    { s: [0.17, 0.3, 0.19], at: [-0.33, 1.2, 0], c: rag, t: SL.TINT, part: PART.ARM_L, pivot: [-0.33, 1.32, 0] },
    { s: [0.4, 0.4, 0.38], at: [0, 1.57, 0], c: skin, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.08, 0.06, 0.02], at: [0.09, 1.6, 0.195], c: '#d8e0a0', t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.08, 0.06, 0.02], at: [-0.09, 1.6, 0.195], c: '#d8e0a0', t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.18, 0.05, 0.02], at: [0, 1.47, 0.195], c: '#3a2a2a', t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.42, 0.1, 0.4], at: [0.03, 1.8, -0.02], c: '#3a3028', t: SL.FIXED, part: PART.HEAD, pivot: headPivot }, // matted hair
  ];
}

export function demon(): Box[] {
  const hide = '#a8382a', dark = '#3a1414', horn = '#e8d8b0', eye = '#ffd84a';
  const wing: Box = { s: [0.06, 0.7, 0.9], at: [0.42, 1.55, -0.45], c: '#5a1a1e', t: SL.FIXED, part: PART.WING_R, pivot: [0.2, 1.4, -0.15] };
  return [
    ...limbs(hide, { thin: 0.25 }),
    { s: [0.27, 0.16, 0.34], at: [0.12, 0.08, 0.04], c: dark, t: SL.FIXED, part: PART.LEG_A, pivot: [0.12, 0.74, 0] }, // hooves
    { s: [0.27, 0.16, 0.34], at: [-0.12, 0.08, 0.04], c: dark, t: SL.FIXED, part: PART.LEG_B, pivot: [-0.12, 0.74, 0] },
    { s: [0.6, 0.7, 0.34], at: [0, 1.1, 0], c: hide, t: SL.FIXED },
    { s: [0.44, 0.42, 0.4], at: [0, 1.66, 0.02], c: hide, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.08, 0.3, 0.08], at: [0.17, 1.98, 0], c: horn, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.08, 0.3, 0.08], at: [-0.17, 1.98, 0], c: horn, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.07, 0.07, 0.14], at: [0.17, 2.12, 0.08], c: horn, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.07, 0.07, 0.14], at: [-0.17, 2.12, 0.08], c: horn, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.1, 0.06, 0.02], at: [0.1, 1.7, 0.225], c: eye, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.1, 0.06, 0.02], at: [-0.1, 1.7, 0.225], c: eye, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.08, 0.08, 0.7], at: [0, 0.8, -0.5], c: hide, t: SL.FIXED, part: PART.TAIL, pivot: [0, 0.85, -0.17] },
    { s: [0.16, 0.16, 0.12], at: [0, 0.8, -0.86], c: dark, t: SL.FIXED, part: PART.TAIL, pivot: [0, 0.85, -0.17] },
    wing, mirror(wing, PART.WING_L),
  ];
}

export function spider(): Box[] {
  const shell = '#ffffff', eye = '#ff4a4a';
  const out: Box[] = [
    { s: [0.7, 0.42, 0.62], at: [0, 0.62, 0.2], c: shell },
    { s: [0.9, 0.62, 0.9], at: [0, 0.78, -0.55], c: shell },
    { s: [0.36, 0.08, 0.36], at: [0, 1.1, -0.55], c: '#a83a3a', t: SL.FIXED }, // red mark
    { s: [0.42, 0.34, 0.24], at: [0, 0.66, 0.6], c: shell, part: PART.HEAD, pivot: [0, 0.66, 0.48] },
  ];
  for (const [x, y] of [[0.1, 0.74], [-0.1, 0.74], [0.17, 0.66], [-0.17, 0.66]]) {
    out.push({ s: [0.06, 0.06, 0.02], at: [x, y, 0.725], c: eye, t: SL.FIXED, part: PART.HEAD, pivot: [0, 0.66, 0.48] });
  }
  // Four legs a side: a raised upper segment and a long lower one, alternating gait.
  [0.45, 0.2, -0.05, -0.3].forEach((z, i) => {
    for (const side of [1, -1]) {
      const part = (i + (side > 0 ? 0 : 1)) % 2 ? PART.LEG_A : PART.LEG_B;
      const piv: V3 = [side * 0.35, 0.7, z];
      out.push({ s: [0.5, 0.08, 0.08], at: [side * 0.6, 0.9, z], c: shell, part, pivot: piv });
      out.push({ s: [0.08, 0.86, 0.08], at: [side * 0.86, 0.47, z], c: shell, part, pivot: piv });
    }
  });
  return out;
}

export function ghost(): Box[] {
  const sheet = '#e8f0ff', face = '#1a1a2a', hp: V3 = [0, 1.5, 0];
  return [
    { s: [0.56, 0.9, 0.42], at: [0, 1.1, 0], c: sheet },
    { s: [0.66, 0.4, 0.5], at: [0, 0.5, -0.04], c: sheet, part: PART.TAIL, pivot: [0, 0.7, 0] }, // trailing hem
    { s: [0.48, 0.3, 0.38], at: [0, 0.18, -0.1], c: sheet, part: PART.TAIL, pivot: [0, 0.7, 0] },
    { s: [0.15, 0.5, 0.17], at: [0.36, 1.2, 0.08], c: sheet, part: PART.ARM_R, pivot: [0.36, 1.4, 0] },
    { s: [0.15, 0.5, 0.17], at: [-0.36, 1.2, 0.08], c: sheet, part: PART.ARM_L, pivot: [-0.36, 1.4, 0] },
    { s: [0.46, 0.44, 0.42], at: [0, 1.74, 0], c: sheet, part: PART.HEAD, pivot: hp },
    { s: [0.1, 0.14, 0.02], at: [0.1, 1.76, 0.215], c: face, t: SL.FIXED, part: PART.HEAD, pivot: hp },
    { s: [0.1, 0.14, 0.02], at: [-0.1, 1.76, 0.215], c: face, t: SL.FIXED, part: PART.HEAD, pivot: hp },
    { s: [0.12, 0.1, 0.02], at: [0, 1.6, 0.215], c: face, t: SL.FIXED, part: PART.HEAD, pivot: hp },
  ];
}

/** A big, slow troll of mossy stone (about 2.7 blocks tall). */
export function troll(): Box[] {
  const rock = '#ffffff', moss = '#6a8a4a', dark = '#2a2a2a', hp: V3 = [0, 2.2, 0.1];
  const legP = (x: number): V3 => [x, 1.0, 0];
  const armP = (x: number): V3 => [x, 2.15, 0];
  return [
    { s: [0.42, 1.0, 0.44], at: [0.26, 0.5, 0], c: rock, part: PART.LEG_A, pivot: legP(0.26) },
    { s: [0.42, 1.0, 0.44], at: [-0.26, 0.5, 0], c: rock, part: PART.LEG_B, pivot: legP(-0.26) },
    { s: [1.05, 1.15, 0.7], at: [0, 1.6, 0], c: rock },
    { s: [0.9, 0.18, 0.5], at: [0, 2.2, -0.1], c: moss, t: SL.FIXED },
    { s: [0.34, 1.25, 0.36], at: [0.72, 1.55, 0.05], c: rock, part: PART.ARM_R, pivot: armP(0.72) },
    { s: [0.34, 1.25, 0.36], at: [-0.72, 1.55, 0.05], c: rock, part: PART.ARM_L, pivot: armP(-0.72) },
    { s: [0.4, 0.3, 0.4], at: [0.72, 0.85, 0.05], c: rock, part: PART.ARM_R, pivot: armP(0.72) },
    { s: [0.4, 0.3, 0.4], at: [-0.72, 0.85, 0.05], c: rock, part: PART.ARM_L, pivot: armP(-0.72) },
    // Club in the right fist.
    { s: [0.16, 0.16, 1.1], at: [0.72, 0.8, 0.55], c: '#6a4a2a', t: SL.FIXED, part: PART.ARM_R, pivot: armP(0.72) },
    { s: [0.32, 0.32, 0.42], at: [0.72, 0.8, 1.05], c: '#5a3e22', t: SL.FIXED, part: PART.ARM_R, pivot: armP(0.72) },
    // Low head jutting forward, tusks, glowing eyes.
    { s: [0.6, 0.5, 0.55], at: [0, 2.32, 0.32], c: rock, part: PART.HEAD, pivot: hp },
    { s: [0.08, 0.16, 0.06], at: [0.16, 2.08, 0.62], c: '#efe6c8', t: SL.FIXED, part: PART.HEAD, pivot: hp },
    { s: [0.08, 0.16, 0.06], at: [-0.16, 2.08, 0.62], c: '#efe6c8', t: SL.FIXED, part: PART.HEAD, pivot: hp },
    { s: [0.1, 0.06, 0.02], at: [0.14, 2.4, 0.6], c: '#ffb84a', t: SL.FIXED, part: PART.HEAD, pivot: hp },
    { s: [0.1, 0.06, 0.02], at: [-0.14, 2.4, 0.6], c: '#ffb84a', t: SL.FIXED, part: PART.HEAD, pivot: hp },
    { s: [0.5, 0.1, 0.3], at: [0, 2.6, 0.2], c: moss, t: SL.FIXED, part: PART.HEAD, pivot: hp },
    { s: [0.12, 0.12, 0.12], at: [0.3, 2.3, -0.3], c: dark, t: SL.FIXED },
  ];
}

/** Will-o-the-wisp: a glowing core in a soft shell. */
export function wisp(): Box[] {
  return [
    { s: [0.32, 0.32, 0.32], at: [0, 0, 0], c: '#b8f0ff' },
    { s: [0.16, 0.16, 0.16], at: [0, 0, 0], c: '#ffffff' },
    { s: [0.1, 0.22, 0.1], at: [0, -0.25, -0.05], c: '#b8f0ff', part: PART.TAIL, pivot: [0, -0.1, 0] },
  ];
}

// ------------------------------------------------------------------ adventurers

export function warrior(): Box[] {
  const steel = '#b0b8c4', armP = (x: number): V3 => [x, 1.32, 0];
  return [
    ...body({ hair: false }),
    { s: [0.46, 0.3, 0.44], at: [0, 1.74, 0], c: steel, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.06, 0.24, 0.06], at: [0, 1.95, -0.05], c: '#ffffff', t: SL.TINT2, part: PART.HEAD, pivot: headPivot }, // plume
    { s: [0.54, 0.46, 0.31], at: [0, 1.1, 0], c: steel, t: SL.FIXED },
    { s: [0.6, 0.12, 0.33], at: [0, 1.36, 0], c: steel, t: SL.FIXED },
    // Sword (right) and round shield (left).
    { s: [0.06, 0.06, 0.9], at: [0.33, 0.78, 0.45], c: '#dfe6ee', t: SL.FIXED, part: PART.ARM_R, pivot: armP(0.33) },
    { s: [0.22, 0.05, 0.05], at: [0.33, 0.78, 0.02], c: '#c8a040', t: SL.FIXED, part: PART.ARM_R, pivot: armP(0.33) },
    { s: [0.08, 0.5, 0.5], at: [-0.45, 0.95, 0.06], c: '#ffffff', t: SL.TINT2, part: PART.ARM_L, pivot: armP(-0.33) },
    { s: [0.09, 0.16, 0.16], at: [-0.47, 0.95, 0.06], c: '#c8a040', t: SL.FIXED, part: PART.ARM_L, pivot: armP(-0.33) },
  ];
}

export function archer(): Box[] {
  const armP = (x: number): V3 => [x, 1.32, 0];
  return [
    ...body({ hair: false }),
    // Hood and short cape.
    { s: [0.46, 0.44, 0.44], at: [0, 1.66, -0.03], c: '#ffffff', t: SL.TINT2, part: PART.HEAD, pivot: headPivot },
    { s: [0.36, 0.16, 0.06], at: [0, 1.62, 0.21], c: '#ffffff', t: SL.SKIN, part: PART.HEAD, pivot: headPivot }, // face opening
    { s: [0.52, 0.7, 0.06], at: [0, 1.02, -0.17], c: '#ffffff', t: SL.TINT2 },
    // Quiver with feathers, longbow in the left hand.
    { s: [0.16, 0.5, 0.16], at: [0.14, 1.2, -0.24], c: '#7a5030', t: SL.FIXED },
    { s: [0.12, 0.1, 0.12], at: [0.14, 1.5, -0.24], c: '#f0f0e0', t: SL.FIXED },
    { s: [0.05, 1.3, 0.05], at: [-0.33, 0.95, 0.18], c: '#8a5a2a', t: SL.FIXED, part: PART.ARM_L, pivot: armP(-0.33) },
    { s: [0.02, 1.2, 0.02], at: [-0.33, 0.95, 0.1], c: '#e8e8d8', t: SL.FIXED, part: PART.ARM_L, pivot: armP(-0.33) },
  ];
}

export function mage(): Box[] {
  const armP = (x: number): V3 => [x, 1.32, 0];
  return [
    ...body({ long: true, hair: false }),
    // Pointed hat with a wide brim, a long beard, a staff with a glowing orb.
    { s: [0.66, 0.06, 0.66], at: [0, 1.8, 0], c: '#ffffff', t: SL.TINT2, part: PART.HEAD, pivot: headPivot },
    { s: [0.4, 0.26, 0.4], at: [0, 1.95, 0], c: '#ffffff', t: SL.TINT2, part: PART.HEAD, pivot: headPivot },
    { s: [0.24, 0.24, 0.24], at: [0, 2.18, -0.04], c: '#ffffff', t: SL.TINT2, part: PART.HEAD, pivot: headPivot },
    { s: [0.12, 0.16, 0.12], at: [0, 2.36, -0.1], c: '#ffffff', t: SL.TINT2, part: PART.HEAD, pivot: headPivot },
    { s: [0.32, 0.3, 0.06], at: [0, 1.38, 0.2], c: '#e8e8e8', t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.06, 1.9, 0.06], at: [0.33, 1.0, 0.16], c: '#6a4a2a', t: SL.FIXED, part: PART.ARM_R, pivot: armP(0.33) },
    { s: [0.18, 0.18, 0.18], at: [0.33, 1.98, 0.16], c: '#9ae8ff', t: SL.FIXED, part: PART.ARM_R, pivot: armP(0.33) },
  ];
}
