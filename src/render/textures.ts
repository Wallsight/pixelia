// Procedural 16x16 pixel-art tiles, packed into a texture array (one layer per tile).

import * as THREE from 'three';
import { mulberry32 } from '../engine/noise';
import { TILE_NAMES, type TileName } from '../world/blocks';

export const TILE = 16;

type RGB = readonly [number, number, number];
type Rng = () => number;

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const pal = (...hs: string[]): RGB[] => hs.map(hex);

class Canvas {
  readonly px = new Uint8ClampedArray(TILE * TILE * 4);
  constructor(readonly rng: Rng) {}

  set(x: number, y: number, c: RGB, a = 255): void {
    x = ((x % TILE) + TILE) % TILE;
    y = ((y % TILE) + TILE) % TILE;
    const i = (y * TILE + x) * 4;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = a;
  }
  get(x: number, y: number): RGB {
    x = ((x % TILE) + TILE) % TILE;
    y = ((y % TILE) + TILE) % TILE;
    const i = (y * TILE + x) * 4;
    return [this.px[i], this.px[i + 1], this.px[i + 2]];
  }
  alpha(x: number, y: number): number {
    return this.px[(y * TILE + x) * 4 + 3];
  }
  clear(): void { this.px.fill(0); }
  pick(p: RGB[]): RGB { return p[Math.floor(this.rng() * p.length)]; }

  /** Fill using a tileable smooth noise field mapped onto a palette (dark -> light). */
  field(p: RGB[], cell = 4, jitter = 0.35): void {
    const vn = valueNoise(this.rng, cell);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        let v = vn(x, y) + (this.rng() - 0.5) * jitter;
        v = Math.min(0.999, Math.max(0, v));
        this.set(x, y, p[Math.floor(v * p.length)]);
      }
    }
  }
  speckle(p: RGB[], chance: number): void {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (this.rng() < chance) this.set(x, y, this.pick(p));
  }
  shade(x: number, y: number, f: number): void {
    const c = this.get(x, y);
    this.set(x, y, [c[0] * f, c[1] * f, c[2] * f], this.alpha(((x % 16) + 16) % 16, ((y % 16) + 16) % 16));
  }
}

/** Tileable bilinear value noise on a (TILE/cell)^2 lattice, returns [0,1]. */
function valueNoise(rng: Rng, cell: number): (x: number, y: number) => number {
  const n = Math.max(1, Math.floor(TILE / cell));
  const g = Array.from({ length: n * n }, () => rng());
  return (x, y) => {
    const fx = x / cell, fy = y / cell;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const v = (i: number, j: number) => g[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

// ---------------------------------------------------------------- palettes
const DIRT = pal('#5a3d26', '#664630', '#714e35', '#7c573b', '#87613f');
const GRASS = pal('#3d7a3a', '#478843', '#52954c', '#5ea257', '#6caf63');
const STONE = pal('#5f6064', '#6b6c70', '#76777b', '#808186', '#8b8c91');
const SAND = pal('#c9b27a', '#d4bd86', '#dcc792', '#e3d09d', '#eadaab');
const SNOW = pal('#d5e0ea', '#e1e9f1', '#ebf1f7', '#f4f8fb', '#fcfdff');
const GLOOM_G = pal('#2f3a33', '#38433a', '#424a40', '#4b4f47', '#3a3444');

// ---------------------------------------------------------------- painters
const painters: Record<TileName, (c: Canvas) => void> = {
  dirt(c) {
    c.field(DIRT, 4, 0.5);
    c.speckle(pal('#4a3220', '#958068'), 0.05);
  },
  grass_top(c) {
    c.field(GRASS, 4, 0.55);
    c.speckle(pal('#7dbb4c', '#386b20'), 0.08);
  },
  grass_side(c) {
    painters.dirt(c);
    for (let x = 0; x < TILE; x++) {
      const d = 2 + Math.floor(c.rng() * 3) + (c.rng() < 0.2 ? 2 : 0);
      for (let y = 0; y < d; y++) c.set(x, y, GRASS[Math.min(4, Math.floor(c.rng() * 3) + (y < 2 ? 2 : 0))]);
      c.set(x, d, GRASS[0]);
    }
  },
  gloom_grass_top(c) {
    c.field(GLOOM_G, 4, 0.6);
    c.speckle(pal('#5b4a6b', '#26302a'), 0.07);
  },
  gloom_grass_side(c) {
    painters.dirt(c);
    for (let x = 0; x < TILE; x++) {
      const d = 2 + Math.floor(c.rng() * 3);
      for (let y = 0; y <= d; y++) c.set(x, y, c.pick(GLOOM_G));
    }
  },
  stone(c) {
    c.field(STONE, 4, 0.45);
    // A few short dark cracks.
    for (let k = 0; k < 3; k++) {
      let x = Math.floor(c.rng() * TILE), y = Math.floor(c.rng() * TILE);
      for (let s = 0; s < 4; s++) {
        c.set(x, y, hex('#4f5054'));
        x += c.rng() < 0.5 ? 1 : 0; y += c.rng() < 0.6 ? 1 : 0;
      }
    }
  },
  moss_stone(c) {
    painters.stone(c);
    const vn = valueNoise(c.rng, 4);
    const moss = pal('#3f6a2a', '#4d7a31', '#5a8a38');
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (vn(x, y) > 0.55) c.set(x, y, c.pick(moss));
  },
  cobble(c) {
    voronoiStones(c, STONE, hex('#45464a'), 9);
  },
  gravel(c) {
    voronoiStones(c, pal('#6a6460', '#7a746e', '#8a837b', '#5d5955', '#968e85'), hex('#4c4844'), 14);
  },
  bedrock(c) {
    c.field(pal('#1e1e22', '#2b2b30', '#3a3a40', '#4a4a50', '#5c5c62'), 2, 0.8);
  },
  sand(c) {
    c.field(SAND, 4, 0.5);
    c.speckle(pal('#b89f68', '#f1e3b9'), 0.06);
  },
  sandstone_top(c) {
    c.field(pal('#d2bb83', '#d8c28b', '#dcc792'), 8, 0.3);
    for (let i = 0; i < TILE; i++) {
      c.set(i, 0, hex('#c4ab72')); c.set(i, 15, hex('#c4ab72'));
      c.set(0, i, hex('#c4ab72')); c.set(15, i, hex('#c4ab72'));
    }
  },
  sandstone_side(c) {
    for (let y = 0; y < TILE; y++) {
      const band = y < 3 ? SAND[3] : y < 4 ? hex('#b69c64') : y < 11 ? SAND[1 + (y % 2)] : y < 12 ? hex('#b69c64') : SAND[0];
      for (let x = 0; x < TILE; x++) c.set(x, y, c.rng() < 0.15 ? SAND[Math.floor(c.rng() * 5)] : band);
    }
  },
  snow(c) {
    c.field(SNOW, 4, 0.4);
  },
  snow_side(c) {
    painters.dirt(c);
    for (let x = 0; x < TILE; x++) {
      const d = 3 + Math.floor(c.rng() * 3);
      for (let y = 0; y < d; y++) c.set(x, y, SNOW[1 + Math.floor(c.rng() * 4)]);
    }
  },
  ice(c) {
    c.field(pal('#8fb8e0', '#9cc3e8', '#a9cdef', '#b7d7f3'), 8, 0.2);
    for (let k = 0; k < 3; k++) {
      const off = Math.floor(c.rng() * TILE);
      for (let i = 0; i < 6; i++) c.set(off + i, off - i + 4, hex('#d6ebfb'));
    }
  },
  water(c) {
    c.field(pal('#1f4f94', '#255a9f', '#2b64aa', '#3270b6'), 8, 0.25);
    for (let k = 0; k < 5; k++) {
      const x = Math.floor(c.rng() * TILE), y = Math.floor(c.rng() * TILE);
      for (let i = 0; i < 3 + Math.floor(c.rng() * 3); i++) c.set(x + i, y, hex('#4c88c8'));
    }
  },
  clay_red(c) { clay(c, '#94402f', '#8a3a2a', '#a04a36'); },
  clay_orange(c) { clay(c, '#b8662f', '#ab5d2b', '#c47236'); },
  clay_tan(c) { clay(c, '#c49a6c', '#b88f62', '#d0a676'); },
  clay_brown(c) { clay(c, '#6b4a36', '#62432f', '#75523d'); },

  oak_log(c) { bark(c, pal('#3e2b19', '#4d3720', '#5b4128', '#6a4c2f')); },
  oak_log_top(c) { rings(c, pal('#9c7a49', '#ad8a55', '#8a6a3e'), hex('#4d3720')); },
  birch_log(c) {
    c.field(pal('#cfcabe', '#d9d4c8', '#e3dfd4', '#eeeae0'), 4, 0.3);
    for (let k = 0; k < 7; k++) {
      const x = Math.floor(c.rng() * TILE), y = Math.floor(c.rng() * TILE);
      const len = 1 + Math.floor(c.rng() * 4);
      for (let i = 0; i < len; i++) c.set(x + i, y, hex('#2e2b27'));
    }
  },
  birch_log_top(c) { rings(c, pal('#cdb985', '#dbc794', '#bea977'), hex('#e3dfd4')); },
  spruce_log(c) { bark(c, pal('#2a1d12', '#352517', '#40301e', '#4a3824')); },
  spruce_log_top(c) { rings(c, pal('#7a5c38', '#8a6a42', '#6c5030'), hex('#352517')); },
  gloom_log(c) { bark(c, pal('#241e29', '#2e2634', '#39303f', '#433849')); },
  gloom_log_top(c) { rings(c, pal('#5a4a5e', '#66556b', '#4e4052'), hex('#2e2634')); },

  oak_leaves(c) { leaves(c, pal('#2c5e30', '#346c37', '#3d7a3f', '#478948', '#539753')); },
  birch_leaves(c) { leaves(c, pal('#4f7a2c', '#5b8833', '#68963b', '#76a444', '#86b24f')); },
  spruce_leaves(c) { leaves(c, pal('#1c3d2a', '#224833', '#28533a', '#2f5e42', '#386a4b'), 0.12); },
  gloom_leaves(c) { leaves(c, pal('#3a3046', '#453852', '#50405e', '#5c466a', '#6b3f62'), 0.18); },

  cactus_side(c) {
    c.field(pal('#2f6b2a', '#377a31', '#3f8838'), 8, 0.25);
    for (let y = 0; y < TILE; y++) {
      for (const x of [3, 8, 12]) c.set(x, y, hex('#24561f'));
      if (y % 4 === 1) for (const x of [1, 6, 10, 14]) c.set(x, y, hex('#d9d6a0'));
    }
    for (let y = 0; y < TILE; y++) { c.set(0, y, hex('#24561f')); c.set(15, y, hex('#24561f')); }
  },
  cactus_top(c) {
    rings(c, pal('#3f8838', '#4a9642', '#377a31'), hex('#24561f'));
  },
  stone_bricks(c) { bricks(c, STONE, hex('#45464a'), false); },
  mossy_bricks(c) { bricks(c, STONE, hex('#45464a'), true); },
  planks(c) { planks(c, pal('#8a6a3e', '#977548', '#a38052', '#7c5f37')); },
  dark_planks(c) { planks(c, pal('#3e2c1c', '#4a3522', '#553e29', '#352517')); },
  path_top(c) {
    c.field(pal('#7d6142', '#8a6c4a', '#957652', '#a0815b'), 4, 0.4);
    c.speckle(pal('#6b6c70', '#5a4430'), 0.04);
  },
  path_side(c) {
    painters.dirt(c);
    for (let x = 0; x < TILE; x++) for (let y = 0; y < 2; y++) c.set(x, y, hex(c.rng() < 0.5 ? '#8a6c4a' : '#957652'));
  },

  window_lit(c) { windowTile(c, pal('#f6c46a', '#ffd98a', '#ffe9b0'), true); },
  window_dark(c) { windowTile(c, pal('#1c1f33', '#262a42', '#30354f'), false); },
  slate(c) {
    c.field(pal('#3d3a4c', '#464258', '#504b63', '#59546d'), 4, 0.35);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const off = Math.floor(y / 4) % 2 === 0 ? 0 : 2;
        if (y % 4 === 3) c.set(x, y, hex('#2b2938'));
        else if ((x + off) % 4 === 3) c.shade(x, y, 0.8);
      }
    }
  },
  cracked_bricks(c) {
    bricks(c, STONE, hex('#45464a'), false);
    for (let k = 0; k < 4; k++) {
      let x = Math.floor(c.rng() * TILE), y = Math.floor(c.rng() * TILE);
      for (let s = 0; s < 6; s++) { c.set(x, y, hex('#3a3b3f')); x += c.rng() < 0.5 ? 1 : -1; y += 1; }
    }
  },
  lantern(c) {
    c.field(pal('#2a2733', '#33303d'), 8, 0.2);
    for (let y = 3; y < 13; y++) for (let x = 4; x < 12; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      c.set(x, y, d < 2.5 ? hex('#fff1c2') : d < 4 ? hex('#ffd27a') : hex('#e8a14e'));
    }
    for (let i = 0; i < TILE; i++) { c.set(i, 0, hex('#1f1c26')); c.set(i, 15, hex('#1f1c26')); c.set(3, i, hex('#1f1c26')); c.set(12, i, hex('#1f1c26')); }
  },

  // ------------------------------------------------ ashlands
  ash(c) {
    c.field(pal('#4a4448', '#555055', '#615b60', '#6d676b', '#7a7478'), 4, 0.5);
    c.speckle(pal('#2e2a2d', '#8a8286'), 0.06);
    c.speckle(pal('#c2552e'), 0.008); // stray embers
  },
  basalt_top(c) {
    rings(c, pal('#2f2c33', '#38353d', '#2a272e'), hex('#1f1d24'));
  },
  basalt_side(c) {
    for (let x = 0; x < TILE; x++) {
      const col = pal('#26232a', '#2f2c33', '#38353d', '#413e47')[Math.floor(c.rng() * 4)];
      for (let y = 0; y < TILE; y++) c.set(x, y, c.rng() < 0.12 ? hex('#1c1a20') : col);
    }
    for (let y = 0; y < TILE; y++) { c.set(0, y, hex('#1c1a20')); c.set(7, y, hex('#1c1a20')); }
  },
  obsidian(c) {
    c.field(pal('#140f1c', '#1c1428', '#251a35', '#2e2042'), 4, 0.4);
    for (let k = 0; k < 5; k++) c.set(Math.floor(c.rng() * TILE), Math.floor(c.rng() * TILE), hex('#6a4c9c'));
  },
  magma(c) {
    c.field(pal('#3a2a2a', '#45302c', '#4f3530'), 4, 0.4);
    // glowing cracks
    for (let k = 0; k < 4; k++) {
      let x = Math.floor(c.rng() * TILE), y = Math.floor(c.rng() * TILE);
      for (let s = 0; s < 9; s++) {
        c.set(x, y, hex(s % 3 === 0 ? '#ffd27a' : '#ff8a3d'));
        x += c.rng() < 0.5 ? 1 : -1; y += c.rng() < 0.6 ? 1 : 0;
      }
    }
  },
  lava(c) {
    c.field(pal('#c8361c', '#e0521f', '#f07228', '#ff9a3a', '#ffc35c'), 4, 0.5);
    for (let k = 0; k < 4; k++) {
      const x = Math.floor(c.rng() * TILE), y = Math.floor(c.rng() * TILE);
      for (let i = 0; i < 4; i++) c.set(x + i, y, hex('#ffe08a'));
    }
  },
  charred_log(c) { bark(c, pal('#141114', '#1d181c', '#272026', '#33292f')); c.speckle(pal('#c2552e'), 0.02); },
  charred_log_top(c) { rings(c, pal('#2c2226', '#3a2c30', '#241c20'), hex('#141114')); },

  // ------------------------------------------------ eldritch waters
  eldritch_stone(c) {
    bricks(c, pal('#1f3a3a', '#254545', '#2c5050', '#335a58'), hex('#122626'), false);
    const vn = valueNoise(c.rng, 4);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (vn(x, y) > 0.66) c.set(x, y, hex(c.rng() < 0.5 ? '#3f6e4e' : '#4b7a52'));
  },
  glyph(c) {
    painters.eldritch_stone(c);
    // A strange hooked sigil.
    const g = hex('#7af0d0');
    for (let i = 3; i < 13; i++) c.set(8, i, g);
    for (let i = 5; i < 11; i++) { c.set(i, 5, g); c.set(i + 1, 10, g); }
    c.set(4, 6, g); c.set(4, 7, g); c.set(11, 9, g); c.set(12, 8, g); c.set(6, 12, g); c.set(10, 3, g);
  },
  black_sand(c) {
    c.field(pal('#24222a', '#2c2a33', '#35323c', '#3e3b46'), 4, 0.5);
    c.speckle(pal('#5a5768', '#1a1820'), 0.08);
  },
  deep_water(c) {
    // Alpha < 1 marks 'murky' water: the shader renders it nearly opaque.
    c.field(pal('#0d2427', '#102b2f', '#143236', '#18393c'), 8, 0.25);
    for (let k = 0; k < 4; k++) {
      const x = Math.floor(c.rng() * TILE), y = Math.floor(c.rng() * TILE);
      for (let i = 0; i < 3; i++) c.set(x + i, y, hex('#2c6f68'));
    }
    for (let i = 3; i < c.px.length; i += 4) c.px[i] = 128;
  },

  // ------------------------------------------------ landmarks
  bone(c) {
    c.field(pal('#d8cfb8', '#e2dac6', '#ece6d6', '#cbc1a8'), 4, 0.3);
    for (let y = 0; y < TILE; y += 5) for (let x = 0; x < TILE; x++) if (c.rng() < 0.4) c.set(x, y, hex('#b8ad92'));
  },
  steel(c) {
    c.field(pal('#6e747c', '#7a8088', '#868c94', '#9298a0'), 8, 0.2);
    for (let i = 0; i < TILE; i++) { c.set(i, 0, hex('#4e535a')); c.set(0, i, hex('#4e535a')); }
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) c.set(x, y, hex('#b4bac2'));
  },
  vault_gear(c) {
    painters.steel(c);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5), a = Math.atan2(y - 7.5, x - 7.5);
        const tooth = Math.cos(a * 8) > 0.3 ? 7.4 : 6.2;
        if (d < tooth && d > 5) c.set(x, y, hex('#c9a53a'));
        if (d < 2.2) c.set(x, y, hex('#3c5fa8'));
      }
    }
  },
  red_bricks(c) { bricks(c, pal('#8a3b2e', '#9a4535', '#a8503c', '#7c3428'), hex('#d8cfc0'), false); },
  gold(c) {
    c.field(pal('#c99a2e', '#dcae3a', '#ecc24c', '#f8da74'), 4, 0.3);
    for (let i = 0; i < 6; i++) c.set(2 + i, 2 + i, hex('#fff2b0'));
  },

  door_green(c) {
    planks(c, pal('#3f7a4a', '#4a8a55', '#56985f', '#2e5c38'));
    c.set(11, 8, hex('#e8c35a')); c.set(11, 9, hex('#c9a53a')); // brass knob
  },
  booth_blue(c) {
    c.field(pal('#1f3f7a', '#244888', '#2a5296'), 8, 0.2);
    for (let y = 2; y < 8; y++) for (let x = 3; x < 13; x++) {
      const pane = (x - 3) % 3 === 2 || y === 4;
      c.set(x, y, pane ? hex('#1a3266') : hex('#dfe8f2'));
    }
    for (let i = 0; i < TILE; i++) { c.set(0, i, hex('#16305f')); c.set(15, i, hex('#16305f')); }
  },

  // ------------------------------------------------ villages
  roof_red(c) { shingles(c, pal('#a8483a', '#b85444', '#c4614e', '#8e3a2f')); },
  roof_slate(c) { shingles(c, pal('#4a5a70', '#55667e', '#61738b', '#3c4a5e')); },
  thatch(c) {
    c.field(pal('#a8873e', '#b8964a', '#c8a656', '#d6b464'), 4, 0.6);
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(c.rng() * TILE), y = Math.floor(c.rng() * TILE);
      for (let i = 0; i < 4; i++) c.set(x, y + i, hex(c.rng() < 0.5 ? '#8e7032' : '#e0c272'));
    }
    for (let x = 0; x < TILE; x++) { c.set(x, 7, hex('#7e622a')); c.set(x, 15, hex('#7e622a')); }
  },
  plaster(c) {
    c.field(pal('#d8cdb6', '#e2d8c2', '#ebe2ce', '#f2ead8'), 8, 0.25);
    c.speckle(pal('#c8bca4', '#d0c4ac'), 0.05);
  },
  window_wood(c) {
    planks(c, pal('#8a6a3e', '#977548', '#a38052', '#7c5f37'));
    const frame = hex('#4a3522'), glass = pal('#f2c46a', '#ffd88a', '#ffe7a8');
    for (let y = 3; y < 14; y++) for (let x = 3; x < 13; x++) {
      const border = x === 3 || x === 12 || y === 3 || y === 13;
      const mullion = x === 7 || x === 8 || y === 8;
      c.set(x, y, border || mullion ? frame : glass[y > 8 ? 2 : Math.floor(c.rng() * 2)]);
    }
    for (let x = 2; x < 14; x++) c.set(x, 14, hex('#6b4a2a'));
    for (let x = 3; x < 13; x += 2) c.set(x, 13, hex(c.rng() < 0.5 ? '#e8606a' : '#f0d050'));
  },
  door_low(c) {
    planks(c, pal('#6e4a2a', '#7a5432', '#86603a', '#583a20'));
    for (let y = 0; y < TILE; y++) { c.set(1, y, hex('#3a2616')); c.set(14, y, hex('#3a2616')); }
    for (let x = 1; x < 15; x++) c.set(x, 4, hex('#3a2616'));
    c.set(11, 1, hex('#d8b04a')); c.set(11, 2, hex('#b08a30'));
  },
  door_top(c) {
    planks(c, pal('#6e4a2a', '#7a5432', '#86603a', '#583a20'));
    for (let y = 0; y < TILE; y++) { c.set(1, y, hex('#3a2616')); c.set(14, y, hex('#3a2616')); }
    for (let x = 1; x < 15; x++) { c.set(x, 0, hex('#3a2616')); c.set(x, 11, hex('#3a2616')); }
    for (let y = 3; y < 9; y++) for (let x = 5; x < 11; x++) c.set(x, y, (x === 7 || x === 8 || y === 5) ? hex('#3a2616') : hex('#f2c46a'));
  },
  farmland(c) {
    c.field(pal('#4a3020', '#553826', '#60402c', '#6a4832'), 4, 0.4);
    for (let y = 0; y < TILE; y += 4) for (let x = 0; x < TILE; x++) c.set(x, y, hex('#3a2416'));
  },
  wheat(c) {
    c.clear();
    const stalk = pal('#9a9a40', '#b0aa48'), ear = pal('#d8b04a', '#e8c25a', '#f2d070');
    for (let k = 0; k < 7; k++) {
      const x = 1 + k * 2 + Math.floor(c.rng() * 2), h = 10 + Math.floor(c.rng() * 5);
      for (let i = 0; i < h; i++) c.set(x, 15 - i, i > h - 5 ? c.pick(ear) : c.pick(stalk));
    }
  },
  carrots(c) {
    c.clear();
    const leaf = pal('#3f8a3a', '#4c9a42', '#5aaa4c');
    for (let k = 0; k < 4; k++) {
      const x = 2 + k * 4;
      c.set(x, 15, hex('#e8782a')); c.set(x, 14, hex('#f08a34'));
      for (let i = 0; i < 6; i++) { c.set(x + (i % 2 ? 1 : -1) * Math.floor(i / 2), 13 - i, c.pick(leaf)); c.set(x, 13 - i, c.pick(leaf)); }
    }
  },
  hay_top(c) {
    c.field(pal('#b8963e', '#c8a64a', '#d6b456', '#e2c262'), 4, 0.5);
    for (let k = 0; k < 6; k++) { const r = 2 + k; for (let a = 0; a < 24; a++) c.set(8 + Math.round(Math.cos(a / 3.82) * r), 8 + Math.round(Math.sin(a / 3.82) * r), hex('#a07c30')); }
  },
  hay_side(c) {
    c.field(pal('#b8963e', '#c8a64a', '#d6b456', '#e2c262'), 4, 0.5);
    for (let x = 0; x < TILE; x++) for (let y = 0; y < TILE; y++) if (c.rng() < 0.25) c.set(x, y, hex(c.rng() < 0.5 ? '#9a7a30' : '#ead27a'));
    for (const y of [3, 12]) for (let x = 0; x < TILE; x++) c.set(x, y, hex('#7a4e2a'));
  },
  cloth_red(c) { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) c.set(x, y, hex(Math.floor(x / 4) % 2 ? '#f2ead8' : '#d8545a')); },
  cloth_yellow(c) { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) c.set(x, y, hex(Math.floor(x / 4) % 2 ? '#f2ead8' : '#e8b840')); },
  banner_red(c) { banner(c, '#b8323a'); },
  banner_blue(c) { banner(c, '#2f5aa8'); },
  banner_green(c) { banner(c, '#2f7a44'); },
  banner_black(c) { banner(c, '#2c2832'); },
  banner_purple(c) { banner(c, '#6a3a8a'); },
  hide(c) {
    // Stretched, stitched leather.
    c.field(pal('#8a6a48', '#967452', '#a2805c', '#7c5e40'), 5, 0.4);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (c.rng() < 0.08) c.set(x, y, hex('#6a4e34'));
    for (let i = 1; i < TILE; i += 3) { c.set(i, 7, hex('#3e2c1c')); c.set(7, i, hex('#3e2c1c')); }
  },
  skull(c) {
    c.field(pal('#d8cfb8', '#e2dac6', '#ece6d6', '#cbc1a8'), 4, 0.3);
    const dark = hex('#2a201a');
    for (const [x0, y0] of [[3, 5], [10, 5]]) for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) c.set(x0 + x, y0 + y, dark);
    c.set(7, 9, dark); c.set(8, 9, dark); c.set(7, 10, dark);
    for (let x = 4; x <= 11; x++) { c.set(x, 12, hex('#b8ad92')); if (x % 2) c.set(x, 13, dark); }
  },
  war_banner(c) {
    // Dark red cloth, a black band, three white claw marks.
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) c.set(x, y, hex(c.rng() < 0.15 ? '#6a1a18' : '#8a2420'));
    for (let x = 0; x < TILE; x++) { c.set(x, 0, hex('#1e1614')); c.set(x, 1, hex('#1e1614')); c.set(x, 15, hex('#1e1614')); }
    for (const x0 of [4, 7, 10]) for (let y = 3; y <= 12; y++) c.set(x0 + Math.floor((y - 3) / 4), y, hex('#e8e0d0'));
  },
  crate(c) {
    planks(c, pal('#9a7848', '#a88452', '#b4905c', '#86663c'));
    for (let i = 0; i < TILE; i++) { c.set(i, 0, hex('#5a4024')); c.set(i, 15, hex('#5a4024')); c.set(0, i, hex('#5a4024')); c.set(15, i, hex('#5a4024')); c.set(i, i, hex('#6a4c2c')); }
  },

  // ------------------------------------------------ cut-out plant sprites
  saber_blade(c) {
    c.clear();
    for (let y = 0; y < TILE; y++) { c.set(7, y, hex('#e8fbff')); c.set(8, y, hex('#e8fbff')); c.set(6, y, hex('#6fd0ff')); c.set(9, y, hex('#6fd0ff')); }
  },
  saber_hilt(c) {
    c.clear();
    // Hilt on top, the start of the glowing blade below it.
    for (let y = 0; y < 8; y++) for (let x = 6; x < 10; x++) c.set(x, y, hex(y % 3 === 0 ? '#2c2c34' : '#a8aeb8'));
    c.set(5, 6, hex('#3a3a44')); c.set(10, 6, hex('#3a3a44'));
    for (let y = 8; y < 16; y++) { c.set(7, y, hex('#e8fbff')); c.set(8, y, hex('#e8fbff')); c.set(6, y, hex('#6fd0ff')); c.set(9, y, hex('#6fd0ff')); }
  },
  kelp(c) {
    c.clear();
    const g = pal('#1e5a4c', '#2a7a62', '#3fa682');
    for (let k = 0; k < 3; k++) {
      let x = 4 + k * 4;
      for (let y = 15; y >= 0; y--) {
        c.set(x, y, g[(y + k) % 3]);
        if (y % 4 === 1) { c.set(x + 1, y, g[2]); c.set(x - 1, y - 1, g[1]); }
        if (y % 5 === 0) x += c.rng() < 0.5 ? 1 : -1;
        if (y % 6 === 2) c.set(x, y, hex('#8ff5d6')); // luminous bulb
      }
    }
  },
  ember_flower(c) {
    c.clear();
    const stem = pal('#2a1f22', '#3a2a2c');
    for (let y = 8; y < 16; y++) c.set(7, y, stem[y % 2]);
    c.set(6, 12, stem[0]); c.set(8, 11, stem[1]);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > 3) continue;
      const d = Math.abs(dx) + Math.abs(dy);
      c.set(7 + dx, 5 + dy, hex(d === 0 ? '#fff0b0' : d === 1 ? '#ffb347' : '#e8552a'));
    }
  },
  tall_grass(c) {
    c.clear();
    for (let k = 0; k < 9; k++) {
      let x = 1 + Math.floor(c.rng() * 14);
      const h = 5 + Math.floor(c.rng() * 10);
      const lean = c.rng() < 0.5 ? -1 : 1;
      for (let i = 0; i < h; i++) {
        c.set(x, 15 - i, GRASS[Math.min(4, 1 + Math.floor((i / h) * 4))]);
        if (i > h * 0.5 && c.rng() < 0.3) x += lean;
      }
    }
  },
  fern(c) {
    c.clear();
    const g = pal('#2c5a22', '#356a28', '#3f7a2f');
    for (let k = 0; k < 4; k++) {
      const bx = 3 + k * 3;
      for (let i = 0; i < 12; i++) {
        const x = bx + Math.round(Math.sin(i * 0.4 + k) * 1.5);
        c.set(x, 15 - i, g[i % 3]);
        if (i > 2 && i % 2 === 0) { c.set(x - 1, 15 - i, g[2]); c.set(x + 1, 15 - i + 1, g[1]); }
      }
    }
  },
  flower_red(c) { flower(c, pal('#b0242a', '#d1333a', '#e8545a'), hex('#f2d04a')); },
  flower_yellow(c) { flower(c, pal('#d6a516', '#eec02a', '#f8d84e'), hex('#9a5a12')); },
  flower_blue(c) { flower(c, pal('#3c4fb8', '#5068d0', '#7088e4'), hex('#f2f0d0')); },
  flower_white(c) { flower(c, pal('#d8d8e0', '#ececf2', '#ffffff'), hex('#f2d04a')); },
  dead_bush(c) {
    c.clear();
    const b = pal('#6b4a28', '#7d5a32', '#5a3d20');
    const branch = (x: number, y: number, dx: number, len: number) => {
      for (let i = 0; i < len; i++) { c.set(x, y, b[i % 3]); y--; if (c.rng() < 0.5) x += dx; }
      return [x, y];
    };
    const [mx, my] = branch(8, 15, 0, 5);
    branch(mx, my, -1, 6); branch(mx, my, 1, 6); branch(mx, my - 2, 1, 4); branch(mx, my - 1, -1, 4);
  },
  mushroom_red(c) { mushroom(c, pal('#a3202a', '#c22c35', '#d9414a'), true); },
  mushroom_brown(c) { mushroom(c, pal('#7a5638', '#8d6644', '#a07752'), false); },
  gloom_weed(c) {
    c.clear();
    const g = pal('#3a2f48', '#4a3a5c', '#5a466e');
    for (let k = 0; k < 5; k++) {
      let x = 2 + Math.floor(c.rng() * 12);
      const h = 6 + Math.floor(c.rng() * 8);
      for (let i = 0; i < h; i++) {
        c.set(x, 15 - i, g[Math.min(2, Math.floor((i / h) * 3))]);
        if (i % 3 === 2) x += c.rng() < 0.5 ? -1 : 1;
      }
      c.set(x, 15 - h, hex('#8fe0c0')); // pale glowing tip
    }
  },
};

// ---------------------------------------------------------------- helpers
function clay(c: Canvas, base: string, dark: string, light: string): void {
  const p = pal(dark, base, base, light);
  c.field(p, 8, 0.3);
  for (let y = 0; y < TILE; y += 5) for (let x = 0; x < TILE; x++) if (c.rng() < 0.6) c.set(x, y, hex(dark));
}

function bark(c: Canvas, p: RGB[]): void {
  for (let x = 0; x < TILE; x++) {
    let v = Math.floor(c.rng() * p.length);
    for (let y = 0; y < TILE; y++) {
      if (c.rng() < 0.18) v = Math.max(0, Math.min(p.length - 1, v + (c.rng() < 0.5 ? -1 : 1)));
      c.set(x, y, p[v]);
    }
  }
  for (let k = 0; k < 4; k++) {
    const x = Math.floor(c.rng() * TILE), y = Math.floor(c.rng() * TILE);
    for (let i = 0; i < 3; i++) c.set(x, y + i, p[0]);
  }
}

function rings(c: Canvas, p: RGB[], border: RGB): void {
  const cx = 7.5 + (c.rng() - 0.5), cy = 7.5 + (c.rng() - 0.5);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const ring = Math.floor(d * 0.9 + c.rng() * 0.4) % 3;
      c.set(x, y, p[ring]);
      if (x === 0 || y === 0 || x === 15 || y === 15) c.set(x, y, border);
    }
  }
}

function leaves(c: Canvas, p: RGB[], holes = 0.16): void {
  c.field(p, 4, 0.4);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (c.rng() < holes) c.set(x, y, [0, 0, 0], 0);
      else if (c.rng() < 0.1) c.set(x, y, p[p.length - 1]);
    }
  }
}

function voronoiStones(c: Canvas, p: RGB[], mortar: RGB, count: number): void {
  const pts = Array.from({ length: count }, () => [c.rng() * TILE, c.rng() * TILE, Math.floor(c.rng() * p.length)]);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let best = 1e9, second = 1e9, col = 0;
      for (const [px, py, ci] of pts) {
        for (let oy = -16; oy <= 16; oy += 16) {
          for (let ox = -16; ox <= 16; ox += 16) {
            const d = (x - px - ox) ** 2 + (y - py - oy) ** 2;
            if (d < best) { second = best; best = d; col = ci; } else if (d < second) second = d;
          }
        }
      }
      const edge = Math.sqrt(second) - Math.sqrt(best) < 1.1;
      c.set(x, y, edge ? mortar : p[col]);
    }
  }
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (c.rng() < 0.12) c.shade(x, y, 1.1);
}

function bricks(c: Canvas, p: RGB[], mortar: RGB, mossy: boolean): void {
  c.field(p, 4, 0.5);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const row = Math.floor(y / 4);
      const off = row % 2 === 0 ? 0 : 4;
      if (y % 4 === 3 || (x + off) % 8 === 7) c.set(x, y, mortar);
      else if (y % 4 === 0) c.shade(x, y, 1.12);
    }
  }
  if (mossy) {
    const vn = valueNoise(c.rng, 4);
    const moss = pal('#3f6a2a', '#4d7a31', '#5a8a38', '#355c24');
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (vn(x, y) + c.rng() * 0.2 > 0.68) c.set(x, y, c.pick(moss));
  }
}

function windowTile(c: Canvas, glass: RGB[], lit: boolean): void {
  bricks(c, STONE, hex('#45464a'), false);
  const frame = hex('#2c2a33');
  for (let y = 2; y < 15; y++) {
    for (let x = 3; x < 13; x++) {
      const border = x === 3 || x === 12 || y === 2 || y === 14;
      const mullion = x === 7 || x === 8 || y === 8;
      if (border || mullion) c.set(x, y, frame);
      else {
        const arch = y < 4 && (x < 5 || x > 10);
        c.set(x, y, arch ? frame : glass[lit ? Math.min(2, Math.floor(c.rng() * 2) + (y > 8 ? 1 : 0)) : Math.floor(c.rng() * 3)]);
      }
    }
  }
}

function shingles(c: Canvas, p: RGB[]): void {
  for (let y = 0; y < TILE; y++) {
    const row = Math.floor(y / 4), off = row % 2 ? 2 : 0;
    for (let x = 0; x < TILE; x++) {
      let col = p[(row + Math.floor((x + off) / 4)) % 3];
      if (c.rng() < 0.15) col = p[Math.floor(c.rng() * 3)];
      if (y % 4 === 3 || (x + off) % 4 === 3) col = p[3];
      c.set(x, y, col);
    }
  }
}

function planks(c: Canvas, p: RGB[]): void {
  for (let y = 0; y < TILE; y++) {
    const board = Math.floor(y / 4);
    const base = p[(board * 2 + 1) % 3];
    for (let x = 0; x < TILE; x++) {
      let col = base;
      if (c.rng() < 0.25) col = p[Math.floor(c.rng() * 3)];
      if (y % 4 === 3) col = p[3];
      if (x === ((board * 5 + 3) % 16) && y % 4 !== 3) col = p[3];
      c.set(x, y, col);
    }
  }
}

/** House banner cloth: a woven field, gold side trims and a gold lozenge. */
function banner(c: Canvas, field: string): void {
  const f = hex(field);
  const dark: RGB = [Math.round(f[0] * 0.82), Math.round(f[1] * 0.82), Math.round(f[2] * 0.82)];
  const gold = hex('#e2b84a'), goldDark = hex('#b8902e');
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let col = (x + y) % 3 === 0 || c.rng() < 0.12 ? dark : f;
      if (x <= 1 || x >= 14) col = x === 0 || x === 15 ? goldDark : gold;
      if (Math.abs(x - 7.5) + Math.abs(y - 7.5) < 4.2) col = Math.abs(x - 7.5) + Math.abs(y - 7.5) < 2 ? f : gold;
      c.set(x, y, col);
    }
  }
}

function flower(c: Canvas, petals: RGB[], centre: RGB): void {
  c.clear();
  const stem = pal('#2f6a24', '#3a7a2c');
  for (let y = 7; y < 16; y++) c.set(7 + (y > 12 ? 1 : 0), y, stem[y % 2]);
  c.set(6, 11, stem[0]); c.set(5, 10, stem[1]); c.set(9, 13, stem[0]); c.set(10, 12, stem[1]);
  const cx = 7, cy = 5;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > 3) continue;
      c.set(cx + dx, cy + dy, petals[Math.min(2, 2 - Math.max(Math.abs(dx), Math.abs(dy)) + (c.rng() < 0.3 ? 1 : 0))]);
    }
  }
  c.set(cx, cy, centre);
}

function mushroom(c: Canvas, cap: RGB[], spots: boolean): void {
  c.clear();
  const stem = pal('#d8d0c0', '#c8bfae');
  for (let y = 10; y < 16; y++) { c.set(7, y, stem[0]); c.set(8, y, stem[1]); }
  for (let y = 6; y < 10; y++) {
    const w = y === 6 ? 2 : y === 7 ? 3 : 4;
    for (let x = 8 - w; x < 8 + w; x++) c.set(x, y, cap[y === 9 ? 0 : 1 + (c.rng() < 0.3 ? 1 : 0)]);
  }
  if (spots) for (const [x, y] of [[6, 7], [9, 8], [5, 8], [8, 6]]) c.set(x, y, hex('#f0ece0'));
}

// ---------------------------------------------------------------- pastel grade
/** Global art direction: softer saturation, lifted lightness, slightly warm. */
/** Tiles that keep more of their saturation (liquids, glowing things). */
const SOFT_PASTEL = new Set<string>(['water', 'deep_water', 'lava', 'magma', 'glyph', 'kelp', 'ember_flower', 'gold', 'saber_blade', 'saber_hilt', 'booth_blue', 'door_green', 'window_wood', 'cloth_red', 'cloth_yellow', 'roof_red', 'banner_red', 'banner_blue', 'banner_green', 'banner_black', 'banner_purple', 'war_banner']);

export const PASTEL = { saturation: 0.72, lift: 0.2, warmth: 0.02 };

function pastelize(px: Uint8ClampedArray, strength: number): void {
  const sat = 1 - (1 - PASTEL.saturation) * strength;
  const lift = PASTEL.lift * strength;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    let r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    s *= sat;
    const l2 = l + (1 - l) * lift;
    const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s;
    const p = 2 * l2 - q;
    const hue = (t: number) => {
      t = (t + 1) % 1;
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    };
    r = s === 0 ? l2 : hue(h + 1 / 3); g = s === 0 ? l2 : hue(h); b = s === 0 ? l2 : hue(h - 1 / 3);
    px[i] = Math.min(255, (r + PASTEL.warmth) * 255);
    px[i + 1] = g * 255;
    px[i + 2] = Math.max(0, (b - PASTEL.warmth * 0.5) * 255);
  }
}

// ---------------------------------------------------------------- build
/** Raw RGBA bytes of every tile (layer-major), also used to colour the map. */
export function buildTileData(seed: number): Uint8Array {
  const out = new Uint8Array(TILE * TILE * 4 * TILE_NAMES.length);
  TILE_NAMES.forEach((name, layer) => {
    let h = seed >>> 0;
    for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
    const c = new Canvas(mulberry32(h));
    c.px.fill(255);
    painters[name](c);
    pastelize(c.px, SOFT_PASTEL.has(name) ? 0.45 : 1);
    out.set(c.px, layer * TILE * TILE * 4);
  });
  return out;
}

export function createTileTexture(data: Uint8Array, maxAnisotropy: number): THREE.DataArrayTexture {
  const tex = new THREE.DataArrayTexture(data, TILE, TILE, TILE_NAMES.length);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
