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

// ------------------------------------------------------------------ castle garrison
// TINT is the house colour (tabard, shield, plume), TINT2 the hose.

const STEEL = '#a8b0bc', MAIL = '#8a909a', TRIM = '#e2b84a';
const garrisonArm = (x: number): V3 => [x, 1.32, 0];

/** Spearman: nasal helm, mail sleeves, a tabard, a long spear and a kite shield. */
export function soldier(): Box[] {
  return [
    ...body({ hair: false }),
    { s: [0.44, 0.24, 0.42], at: [0, 1.8, 0], c: STEEL, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.05, 0.17, 0.04], at: [0, 1.62, 0.215], c: STEEL, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.17, 0.26, 0.19], at: [0.33, 1.22, 0], c: MAIL, t: SL.FIXED, part: PART.ARM_R, pivot: garrisonArm(0.33) },
    { s: [0.17, 0.26, 0.19], at: [-0.33, 1.22, 0], c: MAIL, t: SL.FIXED, part: PART.ARM_L, pivot: garrisonArm(-0.33) },
    { s: [0.53, 0.06, 0.29], at: [0, 1.34, 0], c: TRIM, t: SL.FIXED },
    { s: [0.5, 0.2, 0.28], at: [0, 0.66, 0], c: '#ffffff', t: SL.TINT }, // tabard skirt
    // Spear (upright at rest; level when the arms come forward) and kite shield.
    { s: [0.05, 2.3, 0.05], at: [0.42, 1.15, 0.1], c: '#6a4a2a', t: SL.FIXED, part: PART.ARM_R, pivot: garrisonArm(0.33) },
    { s: [0.08, 0.26, 0.08], at: [0.42, 2.42, 0.1], c: STEEL, t: SL.FIXED, part: PART.ARM_R, pivot: garrisonArm(0.33) },
    { s: [0.08, 0.64, 0.46], at: [-0.46, 0.98, 0.07], c: '#ffffff', t: SL.TINT, part: PART.ARM_L, pivot: garrisonArm(-0.33) },
    { s: [0.09, 0.52, 0.07], at: [-0.47, 0.98, 0.07], c: TRIM, t: SL.FIXED, part: PART.ARM_L, pivot: garrisonArm(-0.33) },
    { s: [0.09, 0.07, 0.36], at: [-0.47, 1.08, 0.07], c: TRIM, t: SL.FIXED, part: PART.ARM_L, pivot: garrisonArm(-0.33) },
  ];
}

/** Castle bowman: kettle hat, padded coat in the house colour, quiver and longbow. */
export function bowman(): Box[] {
  return [
    ...body({ hair: false }),
    { s: [0.62, 0.05, 0.62], at: [0, 1.8, 0], c: STEEL, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.42, 0.2, 0.42], at: [0, 1.91, 0], c: STEEL, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.53, 0.24, 0.3], at: [0, 0.68, 0], c: '#ffffff', t: SL.TINT },
    { s: [0.53, 0.06, 0.3], at: [0, 1.34, 0], c: TRIM, t: SL.FIXED },
    { s: [0.16, 0.5, 0.16], at: [0.14, 1.2, -0.24], c: '#7a5030', t: SL.FIXED },
    { s: [0.12, 0.1, 0.12], at: [0.14, 1.5, -0.24], c: '#f0f0e0', t: SL.FIXED },
    { s: [0.05, 1.4, 0.05], at: [-0.33, 0.95, 0.18], c: '#7a4a22', t: SL.FIXED, part: PART.ARM_L, pivot: garrisonArm(-0.33) },
    { s: [0.02, 1.3, 0.02], at: [-0.33, 0.95, 0.1], c: '#e8e8d8', t: SL.FIXED, part: PART.ARM_L, pivot: garrisonArm(-0.33) },
  ];
}

/** Captain: closed helm with a plume, breastplate and pauldrons, a cape and a sword. */
export function captain(): Box[] {
  return [
    ...body({ hair: false }),
    { s: [0.46, 0.32, 0.44], at: [0, 1.74, 0], c: STEEL, t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.3, 0.04, 0.02], at: [0, 1.7, 0.225], c: '#1a1a22', t: SL.FIXED, part: PART.HEAD, pivot: headPivot },
    { s: [0.08, 0.3, 0.34], at: [0, 2.02, -0.04], c: '#ffffff', t: SL.TINT, part: PART.HEAD, pivot: headPivot },
    { s: [0.55, 0.46, 0.32], at: [0, 1.1, 0], c: STEEL, t: SL.FIXED },
    { s: [0.53, 0.3, 0.29], at: [0, 0.66, 0], c: '#ffffff', t: SL.TINT },
    { s: [0.24, 0.12, 0.26], at: [0.34, 1.37, 0], c: STEEL, t: SL.FIXED, part: PART.ARM_R, pivot: garrisonArm(0.33) },
    { s: [0.24, 0.12, 0.26], at: [-0.34, 1.37, 0], c: STEEL, t: SL.FIXED, part: PART.ARM_L, pivot: garrisonArm(-0.33) },
    { s: [0.58, 1.0, 0.06], at: [0, 0.92, -0.19], c: '#ffffff', t: SL.TINT }, // cape
    { s: [0.6, 0.08, 0.1], at: [0, 1.36, -0.16], c: TRIM, t: SL.FIXED },
    { s: [0.06, 0.06, 0.95], at: [0.33, 0.78, 0.47], c: '#e6ecf2', t: SL.FIXED, part: PART.ARM_R, pivot: garrisonArm(0.33) },
    { s: [0.24, 0.05, 0.05], at: [0.33, 0.78, 0.02], c: TRIM, t: SL.FIXED, part: PART.ARM_R, pivot: garrisonArm(0.33) },
  ];
}

/** A hunched fish-man of the eldritch shore: big head, bulging eyes, fins and webbed claws. */
export function deepone(): Box[] {
  const scale = '#ffffff', belly = '#c8d8b0', eye = '#f0f0c0', fin = '#3a6a6a', hp: V3 = [0, 1.3, 0.05];
  const legP = (x: number): V3 => [x, 0.66, 0];
  const armP = (x: number): V3 => [x, 1.24, 0.05];
  return [
    { s: [0.2, 0.66, 0.22], at: [0.13, 0.33, 0], c: scale, part: PART.LEG_A, pivot: legP(0.13) },
    { s: [0.2, 0.66, 0.22], at: [-0.13, 0.33, 0], c: scale, part: PART.LEG_B, pivot: legP(-0.13) },
    { s: [0.26, 0.06, 0.36], at: [0.13, 0.03, 0.06], c: fin, t: SL.FIXED, part: PART.LEG_A, pivot: legP(0.13) }, // webbed feet
    { s: [0.26, 0.06, 0.36], at: [-0.13, 0.03, 0.06], c: fin, t: SL.FIXED, part: PART.LEG_B, pivot: legP(-0.13) },
    { s: [0.52, 0.62, 0.34], at: [0, 0.98, 0.04], c: scale },
    { s: [0.38, 0.5, 0.04], at: [0, 0.95, 0.22], c: belly, t: SL.FIXED },
    { s: [0.06, 0.5, 0.3], at: [0, 1.1, -0.24], c: fin, t: SL.FIXED }, // back fin
    // Long arms ending in webbed claws.
    { s: [0.14, 0.7, 0.16], at: [0.34, 0.92, 0.05], c: scale, part: PART.ARM_R, pivot: armP(0.34) },
    { s: [0.14, 0.7, 0.16], at: [-0.34, 0.92, 0.05], c: scale, part: PART.ARM_L, pivot: armP(-0.34) },
    { s: [0.2, 0.16, 0.06], at: [0.34, 0.52, 0.1], c: fin, t: SL.FIXED, part: PART.ARM_R, pivot: armP(0.34) },
    { s: [0.2, 0.16, 0.06], at: [-0.34, 0.52, 0.1], c: fin, t: SL.FIXED, part: PART.ARM_L, pivot: armP(-0.34) },
    // Head thrust forward: wide mouth, eyes on the sides, a crest fin.
    { s: [0.46, 0.4, 0.5], at: [0, 1.48, 0.18], c: scale, part: PART.HEAD, pivot: hp },
    { s: [0.38, 0.06, 0.04], at: [0, 1.36, 0.44], c: '#1a2a22', t: SL.FIXED, part: PART.HEAD, pivot: hp },
    { s: [0.08, 0.14, 0.14], at: [0.25, 1.56, 0.3], c: eye, t: SL.FIXED, part: PART.HEAD, pivot: hp },
    { s: [0.08, 0.14, 0.14], at: [-0.25, 1.56, 0.3], c: eye, t: SL.FIXED, part: PART.HEAD, pivot: hp },
    { s: [0.04, 0.07, 0.07], at: [0.29, 1.56, 0.33], c: '#111111', t: SL.FIXED, part: PART.HEAD, pivot: hp },
    { s: [0.04, 0.07, 0.07], at: [-0.29, 1.56, 0.33], c: '#111111', t: SL.FIXED, part: PART.HEAD, pivot: hp },
    { s: [0.05, 0.22, 0.4], at: [0, 1.78, 0.1], c: fin, t: SL.FIXED, part: PART.HEAD, pivot: hp },
    { s: [0.04, 0.2, 0.16], at: [0.25, 1.46, 0.08], c: fin, t: SL.FIXED, part: PART.HEAD, pivot: hp }, // gills
    { s: [0.04, 0.2, 0.16], at: [-0.25, 1.46, 0.08], c: fin, t: SL.FIXED, part: PART.HEAD, pivot: hp },
  ];
}

/**
 * The great dragon: the dragon body plan, older and heavier. Moss-bronze hide,
 * a crown of horns, a spiked jaw, plates down the back and gold crusted on the
 * belly from centuries asleep on the hoard. Its eyes are closed lids here;
 * the open, glowing eyes are drawn separately.
 */
export function greatDragon(): Box[] {
  const recolour: Record<string, string> = {
    '#7a3348': '#5e6e52', '#e2b56c': '#d2b070', '#5c2738': '#3c4838', '#eadfc4': '#efe3c0', '#3e1a28': '#28321f', '#ffd34a': '#4e5c44',
  };
  const out = dragon().map((b): Box => ({ ...b, c: recolour[String(b.c)] ?? b.c }));
  const hide = '#5e6e52', plate = '#28321f', horn = '#efe3c0', gold = '#ffd24a';
  const neckP: V3 = [0, 3.1, 2.2], tailP: V3 = [0, 2.9, -2.4];
  const head = (s: V3, at: V3, c: string): Box => ({ s, at, c, part: PART.HEAD, pivot: neckP });
  out.push(
    // Heavier shoulders and haunches.
    { s: [2.7, 1.5, 1.8], at: [0, 3.3, 1.3], c: hide },
    { s: [2.5, 1.4, 1.6], at: [0, 3.1, -1.5], c: hide },
    // Crown: two great swept-back horns and smaller ones around them.
    head([0.3, 0.3, 1.1], [0.72, 5.25, 4.5], horn), head([0.3, 0.3, 1.1], [-0.72, 5.25, 4.5], horn),
    head([0.24, 0.24, 0.9], [0.86, 5.5, 3.75], horn), head([0.24, 0.24, 0.9], [-0.86, 5.5, 3.75], horn),
    head([0.16, 0.16, 0.6], [0.95, 5.72, 3.15], horn), head([0.16, 0.16, 0.6], [-0.95, 5.72, 3.15], horn),
    head([0.14, 0.3, 0.14], [0.3, 5.35, 5.8], horn), head([0.14, 0.3, 0.14], [-0.3, 5.35, 5.8], horn),
    // Heavy brows over the eyes.
    head([0.34, 0.16, 0.62], [0.6, 5.12, 5.95], plate), head([0.34, 0.16, 0.62], [-0.6, 5.12, 5.95], plate),
    // Jaw spikes, like a beard.
    head([0.12, 0.42, 0.12], [0.5, 3.82, 5.5], horn), head([0.12, 0.42, 0.12], [-0.5, 3.82, 5.5], horn),
    head([0.1, 0.36, 0.1], [0.32, 3.8, 6.15], horn), head([0.1, 0.36, 0.1], [-0.32, 3.8, 6.15], horn),
    head([0.12, 0.5, 0.12], [0, 3.72, 5.85], horn),
    // Plates down the neck.
    head([0.5, 0.22, 0.42], [0, 4.2, 3.0], plate), head([0.44, 0.22, 0.4], [0, 4.6, 3.8], plate),
  );
  // Back plates, tall over the shoulders, smaller towards the tail.
  for (let k = 0; k < 6; k++) out.push({ s: [0.22, 0.9 - k * 0.08, 0.55], at: [0, 4.45 - k * 0.02, 2.0 - k * 0.8], c: plate });
  // Tail spikes.
  for (let k = 0; k < 5; k++) out.push({ s: [0.18, 0.5 - k * 0.06, 0.32], at: [0, 3.55 - k * 0.14, -3.2 - k * 1.5], c: plate, part: PART.TAIL, pivot: tailP });
  // Gold stuck to the belly and flanks.
  for (const [x, y, z] of [[0.6, 2.05, 1.2], [-0.5, 2.0, -0.4], [0.2, 1.98, -1.4], [-0.7, 2.1, 0.8], [1.05, 2.4, -0.9], [-1.05, 2.5, 1.6], [0.4, 2.0, 0.2]]) {
    out.push({ s: [0.32, 0.12, 0.32], at: [x, y, z], c: gold });
  }
  // Old scars: pale streaks on the flanks.
  out.push({ s: [0.06, 0.12, 1.4], at: [1.12, 3.4, 0.3], c: '#8a9a7a' }, { s: [0.06, 0.12, 1.0], at: [-1.12, 3.1, -0.6], c: '#8a9a7a' });
  return out;
}

// ------------------------------------------------------------------ orcs
// HAIR is the skin (olive, moss and ash greens per orc), TINT the leathers and
// hides, TINT2 the kilt. Broad, a little hunched, tusks up from a heavy jaw, a
// red war-paint band across the eyes and a black topknot.

const orcArm = (x: number): V3 => [x, 1.34, 0];
const orcHead: V3 = [0, 1.38, 0.06];
const OSK = SL.HAIR;
const oh = (s: V3, at: V3, c: string, t: number = SL.FIXED): Box => ({ s, at, c, t, part: PART.HEAD, pivot: orcHead });

function orcBody(opts: { knot?: boolean; paint?: string } = {}): Box[] {
  const legP = (x: number): V3 => [x, 0.72, 0];
  const out: Box[] = [
    // Thick legs, wrapped feet.
    { s: [0.26, 0.72, 0.26], at: [0.15, 0.38, 0], c: '#ffffff', t: OSK, part: PART.LEG_A, pivot: legP(0.15) },
    { s: [0.26, 0.72, 0.26], at: [-0.15, 0.38, 0], c: '#ffffff', t: OSK, part: PART.LEG_B, pivot: legP(-0.15) },
    { s: [0.29, 0.14, 0.34], at: [0.15, 0.07, 0.03], c: '#4a3626', t: SL.FIXED, part: PART.LEG_A, pivot: legP(0.15) },
    { s: [0.29, 0.14, 0.34], at: [-0.15, 0.07, 0.03], c: '#4a3626', t: SL.FIXED, part: PART.LEG_B, pivot: legP(-0.15) },
    // Kilt and belt with a bone buckle.
    { s: [0.6, 0.3, 0.36], at: [0, 0.66, 0], c: '#ffffff', t: SL.TINT2 },
    { s: [0.62, 0.08, 0.38], at: [0, 0.82, 0], c: '#3a2a1c', t: SL.FIXED },
    { s: [0.1, 0.1, 0.04], at: [0, 0.82, 0.2], c: '#e8dcc0', t: SL.FIXED },
    // Bare, broad chest; a leather strap across it.
    { s: [0.66, 0.6, 0.36], at: [0, 1.1, 0.02], c: '#ffffff', t: OSK },
    { s: [0.12, 0.66, 0.38], at: [0.08, 1.12, 0.02], c: '#5a3e28', t: SL.FIXED },
    // Hide pauldron on the left shoulder.
    { s: [0.32, 0.16, 0.4], at: [-0.38, 1.42, 0], c: '#ffffff', t: SL.TINT, part: PART.ARM_L, pivot: orcArm(-0.38) },
    // Arms: big upper arm, leather bracer, fist.
    { s: [0.2, 0.46, 0.22], at: [0.42, 1.12, 0], c: '#ffffff', t: OSK, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.2, 0.46, 0.22], at: [-0.42, 1.12, 0], c: '#ffffff', t: OSK, part: PART.ARM_L, pivot: orcArm(-0.42) },
    { s: [0.22, 0.18, 0.24], at: [0.42, 0.88, 0], c: '#5a3e28', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.22, 0.18, 0.24], at: [-0.42, 0.88, 0], c: '#5a3e28', t: SL.FIXED, part: PART.ARM_L, pivot: orcArm(-0.42) },
    { s: [0.18, 0.16, 0.2], at: [0.42, 0.74, 0], c: '#ffffff', t: OSK, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.18, 0.16, 0.2], at: [-0.42, 0.74, 0], c: '#ffffff', t: OSK, part: PART.ARM_L, pivot: orcArm(-0.42) },
    // Head: low skull, heavy brow, wide jaw with tusks, ears out to the sides.
    oh([0.44, 0.38, 0.42], [0, 1.58, 0.1], '#ffffff', OSK),
    oh([0.48, 0.1, 0.1], [0, 1.7, 0.3], '#ffffff', OSK),
    oh([0.46, 0.16, 0.16], [0, 1.42, 0.28], '#ffffff', OSK),
    oh([0.06, 0.13, 0.05], [0.16, 1.53, 0.38], '#f2e8cc'),
    oh([0.06, 0.13, 0.05], [-0.16, 1.53, 0.38], '#f2e8cc'),
    oh([0.16, 0.08, 0.06], [0.28, 1.62, 0.08], '#ffffff', OSK),
    oh([0.16, 0.08, 0.06], [-0.28, 1.62, 0.08], '#ffffff', OSK),
    oh([0.07, 0.05, 0.03], [0, 1.53, 0.33], '#2a1e16'),
    // Paint band and small dark eyes on it.
    oh([0.46, 0.08, 0.02], [0, 1.62, 0.315], opts.paint ?? '#a8322a'),
    oh([0.07, 0.05, 0.02], [0.1, 1.62, 0.33], '#1a120c'),
    oh([0.07, 0.05, 0.02], [-0.1, 1.62, 0.33], '#1a120c'),
  ];
  if (opts.knot !== false) out.push(oh([0.12, 0.1, 0.12], [0, 1.81, -0.04], '#1c1612'), oh([0.08, 0.26, 0.08], [0, 1.9, -0.12], '#1c1612'));
  return out;
}

/** Orc warrior: a broad cleaver and a round shield of planks with a hide boss. */
export function orc(): Box[] {
  return [
    ...orcBody(),
    { s: [0.07, 0.07, 0.62], at: [0.42, 0.74, 0.32], c: '#4a3424', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.05, 0.3, 0.38], at: [0.42, 0.82, 0.72], c: '#9aa2aa', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.06, 0.06, 0.38], at: [0.42, 0.98, 0.72], c: '#c8ccd2', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.1, 0.62, 0.62], at: [-0.56, 0.98, 0.08], c: '#7a5a38', t: SL.FIXED, part: PART.ARM_L, pivot: orcArm(-0.42) },
    { s: [0.12, 0.22, 0.22], at: [-0.6, 0.98, 0.08], c: '#ffffff', t: SL.TINT, part: PART.ARM_L, pivot: orcArm(-0.42) },
    { s: [0.11, 0.62, 0.06], at: [-0.57, 0.98, 0.08], c: '#3a2a1c', t: SL.FIXED, part: PART.ARM_L, pivot: orcArm(-0.42) },
  ];
}

/** Spear thrower: a javelin in hand, a bundle on the back, a bone necklace. */
export function orcspear(): Box[] {
  return [
    ...orcBody({ paint: '#2a2a2e' }),
    { s: [0.05, 2.0, 0.05], at: [0.5, 1.0, 0.12], c: '#6a4a2a', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.08, 0.24, 0.08], at: [0.5, 2.1, 0.12], c: '#d8d0bc', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.22, 0.2, 0.18], at: [0.12, 1.22, -0.26], c: '#ffffff', t: SL.TINT },
    { s: [0.04, 1.3, 0.04], at: [0.06, 1.4, -0.28], c: '#6a4a2a', t: SL.FIXED },
    { s: [0.04, 1.3, 0.04], at: [0.16, 1.45, -0.3], c: '#6a4a2a', t: SL.FIXED },
    { s: [0.04, 1.3, 0.04], at: [0.11, 1.5, -0.24], c: '#6a4a2a', t: SL.FIXED },
    { s: [0.5, 0.06, 0.06], at: [0, 1.36, 0.2], c: '#e8dcc0', t: SL.FIXED },
  ];
}

/** Shaman: hunched under a hide hood topped by a skull, feathers, a crooked staff with a green light. */
export function shaman(): Box[] {
  return [
    ...orcBody({ knot: false, paint: '#e8e0d0' }),
    { s: [0.68, 0.7, 0.4], at: [0, 0.62, 0], c: '#ffffff', t: SL.TINT },
    { s: [0.74, 0.26, 0.44], at: [0, 1.36, -0.02], c: '#ffffff', t: SL.TINT },
    oh([0.52, 0.3, 0.5], [0, 1.78, 0.02], '#ffffff', SL.TINT),
    oh([0.3, 0.24, 0.26], [0, 1.98, 0.08], '#e8e0cc'),
    oh([0.06, 0.06, 0.02], [0.07, 1.98, 0.215], '#1a120c'),
    oh([0.06, 0.06, 0.02], [-0.07, 1.98, 0.215], '#1a120c'),
    oh([0.04, 0.34, 0.06], [0.18, 2.12, -0.1], '#c84a2a'),
    oh([0.04, 0.3, 0.06], [-0.18, 2.1, -0.1], '#3a6aa0'),
    { s: [0.07, 2.1, 0.07], at: [0.46, 1.0, 0.2], c: '#5a3e22', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.22, 0.2, 0.2], at: [0.46, 2.1, 0.2], c: '#e8e0cc', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.12, 0.12, 0.12], at: [0.46, 2.28, 0.2], c: '#8af06a', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.42, 0.06, 0.06], at: [0, 1.32, 0.22], c: '#e8dcc0', t: SL.FIXED },
  ];
}

/** The chief: a horned bone helm, a fur mantle, iron on the shoulders, a great two-handed axe. */
export function chief(): Box[] {
  return [
    ...orcBody({ knot: false }),
    { s: [0.86, 0.3, 0.52], at: [0, 1.44, -0.02], c: '#ffffff', t: SL.TINT },
    { s: [0.72, 0.9, 0.08], at: [0, 0.98, -0.22], c: '#ffffff', t: SL.TINT },
    { s: [0.3, 0.12, 0.36], at: [0.44, 1.56, 0], c: '#5a5e66', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.3, 0.12, 0.36], at: [-0.44, 1.56, 0], c: '#5a5e66', t: SL.FIXED, part: PART.ARM_L, pivot: orcArm(-0.42) },
    oh([0.5, 0.18, 0.46], [0, 1.82, 0.1], '#e2d8c0'),
    oh([0.1, 0.1, 0.34], [0.3, 1.86, 0.06], '#e2d8c0'),
    oh([0.1, 0.1, 0.34], [-0.3, 1.86, 0.06], '#e2d8c0'),
    oh([0.08, 0.34, 0.08], [0.38, 2.06, 0.02], '#efe6cc'),
    oh([0.08, 0.34, 0.08], [-0.38, 2.06, 0.02], '#efe6cc'),
    oh([0.06, 0.16, 0.06], [0.36, 2.28, 0.08], '#efe6cc'),
    oh([0.06, 0.16, 0.06], [-0.36, 2.28, 0.08], '#efe6cc'),
    { s: [0.08, 1.9, 0.08], at: [0.42, 1.12, 0.18], c: '#4a3424', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.06, 0.6, 0.46], at: [0.42, 1.9, 0.38], c: '#8a929c', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.06, 0.6, 0.3], at: [0.42, 1.9, -0.06], c: '#8a929c', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.07, 0.62, 0.06], at: [0.42, 1.9, 0.62], c: '#c8ccd2', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.52, 0.08, 0.08], at: [0, 1.36, 0.22], c: '#d8b04a', t: SL.FIXED },
  ];
}

/** Camp worker: a leather apron, a hammer, a basket on the back. */
export function orcwork(): Box[] {
  return [
    ...orcBody({ knot: false, paint: '#7a5a3a' }),
    { s: [0.5, 0.7, 0.06], at: [0, 0.86, 0.22], c: '#ffffff', t: SL.TINT },
    { s: [0.36, 0.36, 0.26], at: [0, 1.2, -0.32], c: '#a07a48', t: SL.FIXED },
    { s: [0.38, 0.06, 0.28], at: [0, 1.38, -0.32], c: '#6a4a2a', t: SL.FIXED },
    { s: [0.06, 0.06, 0.5], at: [0.42, 0.74, 0.26], c: '#5a3e22', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
    { s: [0.16, 0.14, 0.2], at: [0.42, 0.74, 0.54], c: '#5a5e66', t: SL.FIXED, part: PART.ARM_R, pivot: orcArm(0.42) },
  ];
}

/** A big camp wolf: shaggy ruff, long muzzle, pale fangs. Tinted per wolf. */
export function wolf(): Box[] {
  const fur = '#ffffff', dark = '#3a3430', headP: V3 = [0, 0.86, 0.48];
  return [
    { s: [0.46, 0.46, 1.05], at: [0, 0.78, -0.05], c: fur },
    { s: [0.56, 0.54, 0.4], at: [0, 0.86, 0.32], c: fur },
    { s: [0.36, 0.1, 0.8], at: [0, 1.04, -0.1], c: dark },
    ...legs4(0.14, 0.58, 0.16, 0.34, -0.42, fur, 0.58),
    { s: [0.12, 0.12, 0.6], at: [0, 0.82, -0.82], c: fur, part: PART.TAIL, pivot: [0, 0.9, -0.55] },
    { s: [0.34, 0.32, 0.34], at: [0, 1.0, 0.66], c: fur, part: PART.HEAD, pivot: headP },
    { s: [0.2, 0.18, 0.3], at: [0, 0.92, 0.92], c: fur, part: PART.HEAD, pivot: headP },
    { s: [0.08, 0.07, 0.06], at: [0, 0.96, 1.08], c: '#1a1414', part: PART.HEAD, pivot: headP },
    { s: [0.04, 0.08, 0.04], at: [0.06, 0.82, 1.02], c: '#f2ead8', part: PART.HEAD, pivot: headP },
    { s: [0.04, 0.08, 0.04], at: [-0.06, 0.82, 1.02], c: '#f2ead8', part: PART.HEAD, pivot: headP },
    { s: [0.08, 0.16, 0.06], at: [0.12, 1.22, 0.6], c: fur, part: PART.HEAD, pivot: headP },
    { s: [0.08, 0.16, 0.06], at: [-0.12, 1.22, 0.6], c: fur, part: PART.HEAD, pivot: headP },
    { s: [0.05, 0.04, 0.02], at: [0.1, 1.06, 0.835], c: '#f0c040', part: PART.HEAD, pivot: headP },
    { s: [0.05, 0.04, 0.02], at: [-0.1, 1.06, 0.835], c: '#f0c040', part: PART.HEAD, pivot: headP },
  ];
}
