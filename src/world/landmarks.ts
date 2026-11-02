// Landmark builders: graveyards and pop-culture homages. Each landmark is built
// once into a local voxel plan (like castles) plus a list of text records
// (signposts, tombstones, plaques), then stamped into every overlapping chunk.
// All designs are original pixel-art homages, not copies of any asset.

import { hash01 } from '../engine/noise';
import { B, HEIGHT } from './blocks';
import { C_AIR, C_FILL, C_KEEP, C_SURFACE, type CastlePlan } from './castle';
import { BIOME } from './biomes';
import { LM, type Landmark } from './structures';
import type { SignRecord } from './stamp';

export interface LandmarkPlan extends CastlePlan {
  texts: SignRecord[];
}

class PlanBuilder {
  readonly cells: Uint8Array;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly texts: SignRecord[] = [];
  readonly floorY: number;

  constructor(readonly lm: Landmark, private seed: number, readonly reach: number, up: number, private down = 10) {
    this.w = this.d = reach * 2 + 1;
    this.h = down + up;
    this.cells = new Uint8Array(this.w * this.h * this.d);
    this.floorY = Math.floor(lm.h);
  }

  rnd(k: number): number { return hash01(this.lm.gx * 131 + k, 1300 + k, this.lm.gz * 71 - k, this.seed); }
  noise(x: number, y: number, z: number, k = 0): number { return hash01(this.lm.x + x, y * 13 + k, this.lm.z + z, this.seed); }

  /** Local (unrotated) -> rotated offsets around the centre. */
  private rot(x: number, z: number): [number, number] {
    switch (this.lm.rot) {
      case 1: return [-z, x];
      case 2: return [-x, -z];
      case 3: return [z, -x];
      default: return [x, z];
    }
  }

  set(x: number, y: number, z: number, b: number): void {
    const [rx, rz] = this.rot(x, z);
    const lx = rx + this.reach, lz = rz + this.reach, ly = y + this.down;
    if (lx < 0 || lz < 0 || lx >= this.w || lz >= this.d || ly < 0 || ly >= this.h) return;
    this.cells[(ly * this.d + lz) * this.w + lx] = b;
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: number | ((x: number, y: number, z: number) => number)): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, typeof b === 'number' ? b : b(x, y, z));
  }

  /**
   * Level site: foundation fill below, air above, natural ground kept where solid.
   * Towards the edge the cut and the fill taper off into sloped banks, so sites on
   * hillsides look terraced rather than dug out as a pit.
   */
  level(radius: number, height: number): void {
    const core = Math.max(2, radius - 4);
    for (let z = -radius - 4; z <= radius + 4; z++) {
      for (let x = -radius - 4; x <= radius + 4; x++) {
        const d = Math.max(Math.abs(x), Math.abs(z));
        const over = Math.max(0, d - core);
        const cut = Math.max(0, height - over * 2);
        const fill = Math.max(0, this.down - over * 2);
        for (let y = -fill; y < 0; y++) this.set(x, y, z, C_FILL);
        this.set(x, 0, z, over === 0 ? C_SURFACE : C_FILL);
        for (let y = 1 + Math.max(0, over - 1); y <= cut; y++) this.set(x, y, z, C_AIR);
      }
    }
  }

  /** A text record at local (x, z), standing on the floor + y, facing local (dx, dz). */
  text(x: number, y: number, z: number, text: string, dx: number, dz: number, style: SignRecord['style'], extra?: string): void {
    const [rx, rz] = this.rot(x, z);
    const [rdx, rdz] = this.rot(dx, dz);
    const boards = [{ text, dx: rdx, dz: rdz }];
    if (extra) boards.push({ text: extra, dx: -rdx, dz: -rdz });
    this.texts.push({ x: this.lm.x + rx + 0.5, y: this.floorY + 1 + y, z: this.lm.z + rz + 0.5, boards, style });
  }

  plan(): LandmarkPlan {
    const ox = this.lm.x - this.reach, oz = this.lm.z - this.reach;
    return {
      ox, oy: this.floorY - this.down, oz, w: this.w, h: this.h, d: this.d, cells: this.cells,
      half: this.reach - 5, cx: this.lm.x, cz: this.lm.z, floorY: this.floorY, texts: this.texts,
      surface: topsoil(this.lm.biome),
    };
  }
}

function topsoil(biome: number): number {
  switch (biome) {
    case BIOME.DESERT: case BIOME.BADLANDS: case BIOME.BEACH: return B.SAND;
    case BIOME.BLACK_BEACH: return B.BLACK_SAND;
    case BIOME.STONY_SHORE: return B.GRAVEL;
    case BIOME.ASHLANDS: return B.ASH;
    case BIOME.TUNDRA: return B.SNOW_GRASS;
    case BIOME.GLOOM: return B.GLOOM_GRASS;
    default: return B.GRASS;
  }
}

// ------------------------------------------------------------------ epitaphs

const EPITAPHS = [
  'Burada yatıyor: Dobby, özgür bir elf',
  'Savaş... savaş hiç değişmez',
  'Korku, zihin öldürücüdür',
  'Han önce ateş etti',
  'Leeroy Jenkins: en azından tavuğu vardı',
  'Kal biraz ve dinle',
  'Zavallı Yorick, onu tanırdım',
  'Saygılarını sunmak için F\'ye bas',
  'Kaydetmeyi unuttu',
  'Bu mezar boş. Şimdilik.',
  'Sadece bir tur daha oynayacaktı',
  'Dizine bir ok yemişti',
  'İş iş... artık dinleniyor',
  'Geri döneceğim. — B.',
  'Mrglglgl (balık değildi)',
  'Kıyamet Dağı\'na yürüyerek gitti',
];
const NAMES = ['Ahmet Usta', 'Fatma Nine', 'Kör Rıza', 'Deli Dumrul', 'Topal Osman', 'Hasan Efendi', 'Gülizar', 'Murat Ağa', 'Elif Hatun', 'Bekçi Cemal', 'Değirmenci Ali', 'Şaşkın Necmi'];
const PLAIN = ['Huzur içinde uyu', 'Seni unutmadık', 'İksirlere fazla güvendi', 'Mantar olduğunu sandı', 'Gece yürüyüşünü severdi'];

function epitaph(pb: PlanBuilder, k: number): string {
  if (pb.rnd(k) < 0.55) return EPITAPHS[Math.floor(pb.rnd(k + 1) * EPITAPHS.length)];
  const year = 900 + Math.floor(pb.rnd(k + 2) * 400);
  return `${NAMES[Math.floor(pb.rnd(k + 3) * NAMES.length)]} (${year}-${year + 20 + Math.floor(pb.rnd(k + 4) * 60)}) ${PLAIN[Math.floor(pb.rnd(k + 5) * PLAIN.length)]}`;
}

// ------------------------------------------------------------------ builders

function graveyard(pb: PlanBuilder): void {
  const W = 10, D = 7;
  pb.level(W + 2, 9);
  // Low mossy wall with plank posts, gate on +z.
  for (let x = -W; x <= W; x++) {
    for (let z = -D; z <= D; z++) {
      const edge = Math.abs(x) === W || Math.abs(z) === D;
      if (!edge) continue;
      if (z === D && Math.abs(x) <= 1) continue;
      pb.set(x, 1, z, pb.noise(x, 1, z) < 0.4 ? B.MOSSY_BRICKS : B.COBBLE);
      if ((x + z) % 3 === 0) pb.set(x, 2, z, B.DARK_PLANKS);
    }
  }
  for (const side of [-2, 2]) { pb.set(side, 1, D, B.STONE_BRICKS); pb.set(side, 2, D, B.STONE_BRICKS); pb.set(side, 3, D, B.LANTERN); }
  pb.text(-3, 0, D + 2, 'Unutulmuşlar Mezarlığı', 0, 1, 'post');
  // Gravel path and graves.
  for (let z = -D + 1; z <= D; z++) pb.set(0, 0, z, B.GRAVEL);
  let k = 0;
  for (let z = -3; z <= D - 2; z += 3) {
    for (let x = -W + 2; x <= W - 2; x += 3) {
      if (Math.abs(x) <= 1) continue;
      k++;
      if (pb.noise(x, 0, z, 5) < 0.12) { pb.set(x, 0, z + 1, C_AIR); pb.set(x, -1, z + 1, C_AIR); pb.set(x + 1, 1, z + 1, B.DIRT); continue; }
      pb.set(x, 0, z + 1, B.DIRT);
      pb.text(x, 0, z, epitaph(pb, k * 10), 0, 1, 'tomb');
    }
  }
  // Mausoleum at the back.
  pb.box(-3, 1, -D + 1, 3, 4, -D + 4, (x, y, z) => (Math.abs(x) === 3 || z === -D + 1 || z === -D + 4 ? (pb.noise(x, y, z) < 0.3 ? B.CRACKED_BRICKS : B.STONE_BRICKS) : C_AIR));
  pb.box(-4, 5, -D, 4, 5, -D + 5, B.SLATE);
  pb.box(-2, 6, -D + 1, 2, 6, -D + 4, B.SLATE);
  pb.box(-1, 1, -D + 4, 1, 3, -D + 4, C_AIR);
  pb.set(0, 4, -D + 5, B.LANTERN);
  // Dead trees in the corners.
  for (const [tx, tz] of [[-W + 1, -D + 1], [W - 1, D - 2]]) {
    for (let y = 1; y <= 5; y++) pb.set(tx, y, tz, B.GLOOM_LOG);
    pb.set(tx + 1, 4, tz, B.GLOOM_LOG); pb.set(tx + 2, 5, tz, B.GLOOM_LOG); pb.set(tx - 1, 5, tz + 1, B.GLOOM_LOG);
  }
}

function platform(pb: PlanBuilder): void {
  pb.level(6, 7);
  pb.box(-4, 1, 0, 4, 5, 0, (x, y) => (Math.abs(x) === 4 || y === 5 ? B.STONE_BRICKS : B.RED_BRICKS));
  pb.box(-5, 0, 1, 5, 0, 3, B.COBBLE);
  pb.text(0, 2.6, 0.62, 'Peron 9¾', 0, 1, 'plaque');
  pb.text(3, 0, 3, 'Duvara koşarak geç', 0, 1, 'post');
  // Trolley with trunk and a little cage.
  pb.set(-2, 1, 2, B.STEEL); pb.set(-2, 2, 2, B.DARK_PLANKS); pb.set(-2, 3, 2, B.PLANKS);
  pb.set(4, 1, 3, B.COBBLE); pb.set(4, 2, 3, B.COBBLE); pb.set(4, 3, 3, B.LANTERN);
}

function willow(pb: PlanBuilder): void {
  pb.level(9, 16);
  // Twisting 2x2 trunk.
  let ox = 0, oz = 0;
  for (let y = 1; y <= 10; y++) {
    if (y === 4) ox = 1;
    if (y === 7) oz = -1;
    pb.box(ox, y, oz, ox + 1, y, oz + 1, B.OAK_LOG);
  }
  // Whipping branches.
  const arms: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
  arms.forEach(([dx, dz], i) => {
    const by = 6 + (i % 3);
    for (let s = 1; s <= 5; s++) pb.set(ox + dx * s, by + Math.floor(s / 2), oz + dz * s, B.OAK_LOG);
  });
  // Drooping crown with long hanging strands.
  for (let z = -6; z <= 6; z++) {
    for (let x = -6; x <= 6; x++) {
      const d = Math.hypot(x, z);
      if (d > 6.3) continue;
      const top = 13 - Math.floor(d * 0.5);
      pb.set(ox + x, top, oz + z, B.BIRCH_LEAVES);
      pb.set(ox + x, top - 1, oz + z, B.BIRCH_LEAVES);
      if (d > 3.5 && pb.noise(x, 0, z, 7) < 0.45) {
        const len = 3 + Math.floor(pb.noise(x, 1, z, 8) * 6);
        for (let k = 2; k < len; k++) pb.set(ox + x, top - k, oz + z, B.OAK_LEAVES);
      }
    }
  }
  pb.text(0, 0, 8, 'Şamarcı Söğüt: YAKLAŞMA!', 0, 1, 'post');
}

function vault(pb: PlanBuilder): void {
  pb.level(10, 12);
  // Grassy mound with the door set into its +z face.
  for (let z = -9; z <= 4; z++) {
    for (let x = -9; x <= 9; x++) {
      for (let y = 1; y <= 8; y++) {
        const d = Math.hypot(x / 9, (y - 0.5) / 8, Math.min(0, z) / 9);
        if (d > 1) continue;
        const top = Math.hypot(x / 9, (y + 0.5) / 8, Math.min(0, z) / 9) > 1;
        pb.set(x, y, z, top ? B.GRASS : B.DIRT);
      }
    }
  }
  pb.box(-4, 1, 4, 4, 8, 4, B.STEEL);
  // One big cog door: steel disc, yellow teeth around the rim, blue hub.
  for (let y = 1; y <= 8; y++) for (let x = -4; x <= 4; x++) {
    const d = Math.hypot(x, y - 4.5);
    if (d > 3.9) continue;
    const tooth = d > 2.9 && (Math.round(Math.atan2(y - 4.5, x) / (Math.PI / 6)) & 1) === 0;
    pb.set(x, y, 5, d < 1 ? B.VAULT_GEAR : tooth ? B.GOLD : d > 2.9 ? B.STEEL : B.STONE);
  }
  pb.set(5, 1, 5, B.STEEL); pb.set(5, 2, 5, B.LANTERN);
  pb.box(-3, 0, 5, 3, 0, 8, B.COBBLE);
  pb.text(0, 7.6, 5.62, 'SIĞINAK 101', 0, 1, 'plaque');
  pb.text(-5, 0, 7, 'Savaş... savaş hiç değişmez.', 0, 1, 'post');
}

function sandworm(pb: PlanBuilder): void {
  pb.level(18, 12);
  // Spine and arching ribs, half buried in the dunes.
  for (let x = -14; x <= 12; x++) pb.set(x, 0, 0, B.BONE);
  for (let x = -12; x <= 10; x += 3) {
    const r = 5 + Math.round(Math.sin((x + 14) / 26 * Math.PI) * 2);
    for (let a = 0; a <= 180; a += 3) {
      const rad = (a * Math.PI) / 180;
      pb.set(x, Math.round(Math.sin(rad) * r) - 1, Math.round(Math.cos(rad) * r), B.BONE);
    }
  }
  // Open maw ring with inward teeth.
  for (let a = 0; a < 360; a += 5) {
    const rad = (a * Math.PI) / 180;
    const y = Math.round(Math.sin(rad) * 6) + 4, z = Math.round(Math.cos(rad) * 6);
    if (y < 0) continue;
    pb.set(15, y, z, B.BONE);
    if (a % 30 === 0) pb.set(15, Math.round(Math.sin(rad) * 4.6) + 4, Math.round(Math.cos(rad) * 4.6), B.BONE);
  }
  // A thumper pole.
  for (let y = 1; y <= 4; y++) pb.set(-12, y, 9, B.STEEL);
  pb.set(-12, 5, 9, B.PLANKS);
  pb.text(-9, 0, 9, 'Baharat akmalı.', 0, 1, 'post', 'Ritimsiz yürü');
}

function moistureFarm(pb: PlanBuilder): void {
  pb.level(12, 9);
  // Sandstone dome homestead with a door facing +z.
  for (let z = -5; z <= 5; z++) for (let x = -5; x <= 5; x++) for (let y = 1; y <= 5; y++) {
    const d = Math.hypot(x, (y - 0.5) * 1.15, z);
    if (d > 5.2) continue;
    pb.set(x, y, z, d > 4.1 ? B.SANDSTONE : C_AIR);
  }
  pb.box(-1, 1, 4, 1, 3, 5, C_AIR);
  pb.set(0, 4, 5, B.LANTERN);
  // Moisture vaporators.
  for (const [vx, vz] of [[8, -3], [-8, 2], [6, 7]]) {
    for (let y = 1; y <= 6; y++) pb.set(vx, y, vz, B.STEEL);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { pb.set(vx + dx, 2, vz + dz, B.STEEL); pb.set(vx + dx, 5, vz + dz, B.STEEL); }
  }
  pb.text(3, 0, 8, 'Aradığın droid bu değil.', 0, 1, 'post', 'Nem çiftliği: izinsiz girmeyin');
}

function saberStone(pb: PlanBuilder): void {
  pb.level(5, 8);
  for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) for (let y = 1; y <= 2; y++) {
    if (Math.hypot(x, z) + y * 0.9 > 3.6) continue;
    pb.set(x, y, z, pb.noise(x, y, z) < 0.5 ? B.MOSS_STONE : B.STONE);
  }
  pb.set(0, 3, 0, B.SABER_BLADE);
  pb.set(0, 4, 0, B.SABER_HILT);
  pb.text(0, 0, 4, 'Taştaki Kılıç: Güç seninle olsun', 0, 1, 'post');
}

function chapel(pb: PlanBuilder): void {
  pb.level(11, 12);
  const wallB = (x: number, y: number, z: number) => (pb.noise(x, y, z) < 0.25 ? B.CRACKED_BRICKS : pb.noise(x, y, z, 1) < 0.3 ? B.COBBLE : B.STONE_BRICKS);
  for (let z = -6; z <= 6; z++) {
    for (let x = -4; x <= 4; x++) {
      const edge = Math.abs(x) === 4 || Math.abs(z) === 6;
      for (let y = 1; y <= 6; y++) {
        if (!edge) { pb.set(x, y, z, C_AIR); continue; }
        if (y > 2 + pb.noise(x, 0, z, 3) * 5) continue; // ruined upper walls
        const window = y === 3 && Math.abs(x) === 4 && z % 3 === 0;
        pb.set(x, y, z, window ? B.WINDOW_DARK : wallB(x, y, z));
      }
      // Half the roof has fallen in.
      if (x <= 0 || pb.noise(x, 9, z) < 0.3) pb.set(x, 7 - Math.floor(Math.abs(x) / 2), z, B.SLATE);
    }
  }
  pb.box(-1, 1, 6, 1, 3, 6, C_AIR); // doorway
  pb.box(-1, 1, -5, 1, 1, -5, B.STONE_BRICKS); // altar
  pb.set(0, 2, -5, B.GOLD);
  for (let z = -2; z <= 3; z += 2) { pb.box(-3, 1, z, -2, 1, z, B.DARK_PLANKS); pb.box(2, 1, z, 3, 1, z, B.DARK_PLANKS); }
  // Old well in front.
  for (let z = 8; z <= 10; z++) for (let x = -1; x <= 1; x++) {
    if (x === 0 && z === 9) { pb.set(0, 0, 9, B.WATER); pb.set(0, -1, 9, B.WATER); pb.set(0, -2, 9, B.WATER); }
    else pb.set(x, 1, z, B.COBBLE);
  }
  pb.set(-1, 2, 8, B.OAK_LOG); pb.set(-1, 3, 8, B.OAK_LOG); pb.set(1, 2, 10, B.OAK_LOG); pb.set(1, 3, 10, B.OAK_LOG);
  pb.box(-1, 4, 8, 1, 4, 10, B.PLANKS);
  pb.text(3, 0, 9, 'Kal biraz ve dinle!', 0, 1, 'post');
}

function pentagram(pb: PlanBuilder): void {
  pb.level(11, 6);
  const R = 9;
  for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) {
    const d = Math.hypot(x, z);
    if (d > R + 0.5) continue;
    pb.set(x, 0, z, Math.abs(d - (R - 1)) < 0.6 ? B.MAGMA : B.OBSIDIAN);
  }
  const pts = Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [Math.cos(a) * (R - 1.5), Math.sin(a) * (R - 1.5)];
  });
  for (let i = 0; i < 5; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 2) % 5];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 2);
    for (let s = 0; s <= n; s++) pb.set(Math.round(ax + ((bx - ax) * s) / n), 0, Math.round(az + ((bz - az) * s) / n), B.MAGMA);
    pb.set(Math.round(ax), 1, Math.round(az), B.LANTERN);
  }
  pb.text(0, 0, R + 1, 'Ahh... taze et!', 0, 1, 'post');
}

function murlocHuts(pb: PlanBuilder): void {
  pb.level(10, 7);
  const huts: Array<[number, number]> = [[0, 0], [-6, 3], [5, 4]];
  huts.forEach(([hx, hz], i) => {
    for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) for (let y = 1; y <= 4; y++) {
      const d = Math.hypot(x, (y - 1) * 1.1, z);
      if (d > 3.2) continue;
      const shell = d > 2.2;
      pb.set(hx + x, y, hz + z, !shell ? C_AIR : y >= 3 ? (i % 2 ? B.SPRUCE_LEAVES : B.OAK_LEAVES) : B.DARK_PLANKS);
    }
    pb.box(hx, 1, hz + 2, hx, 2, hz + 3, C_AIR);
  });
  // Fish drying rack.
  pb.set(-2, 1, -5, B.OAK_LOG); pb.set(2, 1, -5, B.OAK_LOG); pb.box(-2, 2, -5, 2, 2, -5, B.DARK_PLANKS);
  pb.text(1, 0, 7, 'Mrglglgl!', 0, 1, 'post', 'Mrrglglglgl...');
}

function peonCamp(pb: PlanBuilder): void {
  pb.level(10, 9);
  // Log piles.
  for (const [px, pz] of [[-6, -4], [-6, 1]]) pb.box(px, 1, pz, px + 3, 2, pz + 2, (x, y) => (y === 2 && x === px + 3 ? C_KEEP : B.OAK_LOG));
  // Stumps.
  for (const [sx, sz] of [[3, -6], [6, -2], [7, 4]]) pb.set(sx, 1, sz, B.OAK_LOG);
  // Spiky palisade arc and a hut.
  for (let a = 20; a <= 160; a += 9) {
    const rad = (a * Math.PI) / 180;
    const x = Math.round(Math.cos(rad) * 8), z = Math.round(-Math.sin(rad) * 8);
    const hgt = 2 + Math.floor(pb.noise(x, 0, z) * 3);
    for (let y = 1; y <= hgt; y++) pb.set(x, y, z, B.SPRUCE_LOG);
  }
  pb.box(1, 1, -4, 5, 3, -1, (x, _y, z) => (x === 1 || x === 5 || z === -4 || z === -1 ? B.DARK_PLANKS : C_AIR));
  pb.box(0, 4, -5, 6, 4, 0, B.SPRUCE_LEAVES);
  pb.box(3, 1, -1, 3, 2, -1, C_AIR);
  // Campfire.
  pb.set(-1, 0, 4, B.MAGMA);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pb.set(-1 + dx, 1, 4 + dz, B.COBBLE);
  pb.text(2, 0, 6, 'İş iş...', 0, 1, 'post', 'Bana mı dedin?');
}

/** Shaft height of the dark tower: horns and eye top out just under the world ceiling. */
export function darkTowerHeight(floorY: number): number {
  return Math.max(24, HEIGHT - 2 - 10 - floorY);
}

/** Shaft half-width at height y: broad base tapering towards the top. */
export function darkTowerRadius(y: number, H: number): number {
  return Math.round(7 - (y / H) * 4);
}

function darkTower(pb: PlanBuilder): void {
  const H = darkTowerHeight(pb.floorY);
  pb.level(12, H + 12);
  const shell = (x: number, y: number, z: number) => (pb.noise(x, y, z) < 0.35 ? B.OBSIDIAN : B.BASALT);
  for (let y = 0; y <= H; y++) {
    const r = darkTowerRadius(y, H);
    for (let z = -r - 2; z <= r + 2; z++) for (let x = -r - 2; x <= r + 2; x++) {
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge > r) {
        // Corner buttresses: wide at the foot, thinning to spikes up to 60% of the height.
        const ax = Math.abs(x), az = Math.abs(z);
        const reach = y < H * 0.25 ? 2 : y < H * 0.6 ? 1 : 0;
        if (reach && ax > r && az > r && ax <= r + reach && az <= r + reach) pb.set(x, y, z, shell(x, y, z));
        continue;
      }
      if (edge === r) {
        const lit = y % 7 === 4 && (x === 0 || z === 0) && pb.noise(x, y, z, 2) < 0.6;
        pb.set(x, y, z, lit ? B.WINDOW_LIT : shell(x, y, z));
      } else pb.set(x, y, z, y % 7 === 0 ? B.BASALT : C_AIR);
    }
  }
  // Spiked crown on the top ring.
  const rt = darkTowerRadius(H, H);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    for (let y = H + 1; y <= H + 3; y++) pb.set(sx * rt, y, sz * rt, B.OBSIDIAN);
  }
  // Two horns curling inwards and the burning eye between them.
  for (let k = 0; k < 10; k++) {
    const inward = Math.floor(k / 4);
    pb.set(-3 + inward, H + 1 + k, 0, B.OBSIDIAN);
    pb.set(3 - inward, H + 1 + k, 0, B.OBSIDIAN);
  }
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
    if ((x * x) / 4.4 + (y * y) / 6.5 > 1) continue;
    pb.set(x, H + 6 + y, 0, x === 0 ? B.OBSIDIAN : B.MAGMA);
  }
  pb.text(0, 0, 7, 'Gözcü Kule', 0, 1, 'post', 'Geri dön, yolcu');
  // The ring on its pedestal.
  pb.box(8, 1, 8, 8, 2, 8, B.BASALT);
  for (let a = 0; a < 360; a += 20) {
    const rad = (a * Math.PI) / 180;
    pb.set(8 + Math.round(Math.cos(rad) * 1.6), 4 + Math.round(Math.sin(rad) * 1.6), 8, B.GOLD);
  }
  pb.text(8, 0, 10, 'Kıymetlim...', 0, 1, 'post');
}

function monolith(pb: PlanBuilder): void {
  pb.level(4, 11);
  pb.box(-1, 1, 0, 2, 9, 0, B.OBSIDIAN);
}

function hobbitHole(pb: PlanBuilder): void {
  pb.level(10, 8);
  for (let z = -8; z <= 2; z++) for (let x = -8; x <= 8; x++) for (let y = 1; y <= 6; y++) {
    const d = Math.hypot(x / 8, (y - 0.5) / 6, Math.min(0, z + 1) / 8);
    if (d > 1) continue;
    pb.set(x, y, z, Math.hypot(x / 8, (y + 0.5) / 6, Math.min(0, z + 1) / 8) > 1 ? B.GRASS : B.DIRT);
  }
  // Round green door with a stone frame, round windows.
  for (let y = 1; y <= 4; y++) for (let x = -2; x <= 2; x++) {
    const d = Math.hypot(x, y - 2.2);
    if (d < 2.6) pb.set(x, y, 2, d < 1.8 ? B.DOOR_GREEN : B.STONE_BRICKS);
  }
  for (const wx of [-5, 5]) { pb.set(wx, 2, 1, B.WINDOW_LIT); pb.set(wx, 3, 1, B.WINDOW_LIT); }
  // Garden path, fence and flowers.
  for (let z = 3; z <= 8; z++) pb.set(0, 0, z, B.PATH);
  for (let x = -6; x <= 6; x++) if (Math.abs(x) > 1) { pb.set(x, 1, 8, B.PLANKS); if (pb.noise(x, 0, 6) < 0.6) pb.set(x, 1, 5 + (x & 1), pb.noise(x, 1, 6) < 0.5 ? B.FLOWER_YELLOW : B.FLOWER_RED); }
  pb.text(2, 0, 9, 'Parti dışında giriş yasak', 0, 1, 'post');
}

function phoneBox(pb: PlanBuilder): void {
  pb.level(4, 6);
  pb.box(0, 1, 0, 1, 3, 1, B.BOOTH_BLUE);
  pb.box(0, 4, 0, 1, 4, 1, B.SLATE);
  pb.set(0, 5, 0, B.LANTERN);
  pb.text(0, 0, 3, 'İçi dışından büyük', 0, 1, 'post');
}

const BUILDERS: Record<number, { reach: number; up: number; build: (pb: PlanBuilder) => void }> = {
  [LM.GRAVEYARD]: { reach: 13, up: 10, build: graveyard },
  [LM.PLATFORM]: { reach: 7, up: 8, build: platform },
  [LM.WILLOW]: { reach: 10, up: 17, build: willow },
  [LM.VAULT]: { reach: 11, up: 13, build: vault },
  [LM.SANDWORM]: { reach: 19, up: 13, build: sandworm },
  [LM.MOISTURE_FARM]: { reach: 13, up: 10, build: moistureFarm },
  [LM.SABER_STONE]: { reach: 6, up: 9, build: saberStone },
  [LM.CHAPEL]: { reach: 12, up: 13, build: chapel },
  [LM.PENTAGRAM]: { reach: 12, up: 7, build: pentagram },
  [LM.MURLOC_HUTS]: { reach: 11, up: 8, build: murlocHuts },
  [LM.PEON_CAMP]: { reach: 11, up: 10, build: peonCamp },
  [LM.DARK_TOWER]: { reach: 13, up: 90, build: darkTower },
  [LM.MONOLITH]: { reach: 5, up: 12, build: monolith },
  [LM.HOBBIT_HOLE]: { reach: 11, up: 9, build: hobbitHole },
  [LM.PHONE_BOX]: { reach: 5, up: 7, build: phoneBox },
};

/** Largest reach of any landmark: how far around a chunk to look for them. */
export const LANDMARK_REACH = 23;

export function buildLandmark(lm: Landmark, seed: number): LandmarkPlan {
  const spec = BUILDERS[lm.kind];
  // +4: room for the sloped banks that level() adds around the site.
  const pb = new PlanBuilder(lm, seed, spec.reach + 4, spec.up);
  spec.build(pb);
  return pb.plan();
}

