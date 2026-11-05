// Small helpers shared by the creature directors.

export const TAU = Math.PI * 2;

/** A random number in [a, b). */
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** A random element of a non-empty list. */
export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/** Signed shortest turn from angle `from` to angle `to`, in (-PI, PI]. */
export const angleTo = (from: number, to: number): number => {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

const DIRECTIONS = ['doğuda', 'güneydoğuda', 'güneyde', 'güneybatıda', 'batıda', 'kuzeybatıda', 'kuzeyde', 'kuzeydoğuda'];

/** Compass direction of the offset (dx, dz) in Turkish, e.g. "kuzeyde" (+z is south on the map). */
export function direction(dx: number, dz: number, capital = false): string {
  const s = DIRECTIONS[(Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) + 8) % 8];
  return capital ? s[0].toLocaleUpperCase('tr') + s.slice(1) : s;
}
