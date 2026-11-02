// Turns a generated region into compact vertex buffers for the inner chunk.
//
// Vertex layout (10 bytes, two attributes):
//   position: Uint16 x3, in 1/8 block units relative to the chunk origin
//   data:     Uint8  x4 = [tile layer, face (0-5, 6 = plant), ao (0-3) | emissive << 2, corner | crop << 2]
//   crop = visible height of a side face in eighths, so partial blocks show the
//   top of their texture (e.g. the grass fringe) instead of a squashed tile.

import {
  CHUNK, HEIGHT, KIND, KIND_AIR, KIND_PLANT, KIND_WATER,
  OCCLUDES, OPAQUE, TILE_BOTTOM, TILE_SIDE, TILE_TOP, HEIGHT8, KIND_SOLID, EMISSIVE, WATERLOGGED, B,
} from './blocks';
import { MARGIN, RW } from './biomes';

export interface MeshData {
  position: Uint16Array;
  data: Uint8Array;
  index: Uint32Array;
}

class Builder {
  position = new Uint16Array(4096 * 3);
  data = new Uint8Array(4096 * 4);
  index = new Uint32Array(4096 * 1.5);
  vc = 0;
  ic = 0;

  private grow(): void {
    const p = new Uint16Array(this.position.length * 2); p.set(this.position); this.position = p;
    const d = new Uint8Array(this.data.length * 2); d.set(this.data); this.data = d;
    const i = new Uint32Array(this.index.length * 2); i.set(this.index); this.index = i;
  }

  /** corners: 12 numbers (4 x xyz, in 1/8 units). */
  quad(c: ArrayLike<number>, ox: number, oy: number, oz: number, tile: number, face: number, ao: ArrayLike<number>, crop = 8, emit = 0): void {
    if ((this.vc + 4) * 3 > this.position.length || this.ic + 6 > this.index.length) this.grow();
    const v = this.vc;
    for (let k = 0; k < 4; k++) {
      const p = (v + k) * 3;
      this.position[p] = c[k * 3] + ox;
      this.position[p + 1] = c[k * 3 + 1] + oy;
      this.position[p + 2] = c[k * 3 + 2] + oz;
      const d = (v + k) * 4;
      this.data[d] = tile;
      this.data[d + 1] = face;
      this.data[d + 2] = ao[k] | (emit << 2);
      this.data[d + 3] = k | (crop << 2);
    }
    const i = this.ic;
    // Flip the diagonal so AO interpolates without the classic anisotropy artefact.
    if (ao[0] + ao[2] < ao[1] + ao[3]) {
      this.index[i] = v + 1; this.index[i + 1] = v + 2; this.index[i + 2] = v + 3;
      this.index[i + 3] = v + 1; this.index[i + 4] = v + 3; this.index[i + 5] = v;
    } else {
      this.index[i] = v; this.index[i + 1] = v + 1; this.index[i + 2] = v + 2;
      this.index[i + 3] = v; this.index[i + 4] = v + 2; this.index[i + 5] = v + 3;
    }
    this.vc += 4;
    this.ic += 6;
  }

  finish(): MeshData {
    return {
      position: this.position.slice(0, this.vc * 3),
      data: this.data.slice(0, this.vc * 4),
      index: this.index.slice(0, this.ic),
    };
  }
}

// Unit-cube corners per face, CCW seen from outside: BL, BR, TR, TL.
const FACE_CORNERS = [
  [1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1], // +X
  [0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0], // -X
  [0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0], // +Y
  [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1], // -Y
  [0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1], // +Z
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0], // -Z
];
const FACE_NORMAL = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
const PLANT_QUADS = [
  [1, 0, 1, 7, 0, 7, 7, 8, 7, 1, 8, 1],
  [7, 0, 1, 1, 0, 7, 1, 8, 7, 7, 8, 1],
];
const PLANT_AO = [1, 1, 3, 3];

export function meshRegion(blocks: Uint8Array): { opaque: MeshData; plants: MeshData; water: MeshData } {
  const SY = RW * RW, SZ = RW;
  const opaque = new Builder();
  const plants = new Builder();
  const water = new Builder();
  const corners = new Uint16Array(12);
  const ao = new Uint8Array(4);

  const at = (x: number, y: number, z: number): number => {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    return blocks[y * SY + z * SZ + x];
  };
  const occ = (x: number, y: number, z: number): number => OCCLUDES[at(x, y, z)];
  const tallerThan = (x: number, y: number, z: number, h: number): number => {
    const b = at(x, y, z);
    return OCCLUDES[b] && HEIGHT8[b] > h ? 1 : 0;
  };

  // Skip empty sky above the highest block of the inner area.
  let maxY = 0;
  for (let y = HEIGHT - 1; y > 0 && maxY === 0; y--) {
    for (let z = MARGIN; z < MARGIN + CHUNK && maxY === 0; z++) {
      for (let x = MARGIN; x < MARGIN + CHUNK; x++) {
        if (blocks[y * SY + z * SZ + x] !== B.AIR) { maxY = y; break; }
      }
    }
  }

  for (let y = 0; y <= maxY; y++) {
    for (let z = MARGIN; z < MARGIN + CHUNK; z++) {
      for (let x = MARGIN; x < MARGIN + CHUNK; x++) {
        const b = blocks[y * SY + z * SZ + x];
        const kind = KIND[b];
        if (kind === KIND_AIR) continue;
        const ox = (x - MARGIN) * 8, oy = y * 8, oz = (z - MARGIN) * 8;

        if (kind === KIND_PLANT) {
          // Sit on top of partial blocks instead of floating above them.
          const below = at(x, y - 1, z);
          const sink = KIND[below] === KIND_SOLID ? 8 - HEIGHT8[below] : 0;
          for (const q of PLANT_QUADS) plants.quad(q, ox, oy - sink, oz, TILE_SIDE[b], 6, PLANT_AO, 8, EMISSIVE[b]);
          continue;
        }

        if (kind === KIND_WATER) {
          const above = at(x, y + 1, z);
          const wet = (n: number) => KIND[n] === KIND_WATER || WATERLOGGED[n] === 1;
          const surface = !wet(above) && !OPAQUE[above];
          for (let f = 0; f < 6; f++) {
            const n = FACE_NORMAL[f];
            const nb = at(x + n[0], y + n[1], z + n[2]);
            if (wet(nb) || OPAQUE[nb]) continue;
            const fc = FACE_CORNERS[f];
            for (let k = 0; k < 12; k++) {
              const v = fc[k] * 8;
              corners[k] = k % 3 === 1 && surface && fc[k] === 1 ? 7 : v;
            }
            ao[0] = ao[1] = ao[2] = ao[3] = 3;
            water.quad(corners, ox, oy, oz, TILE_TOP[b], f, ao, 8, EMISSIVE[b]);
          }
          continue;
        }

        // Solid blocks (full or partial height) and leaves.
        const h = HEIGHT8[b];
        const partial = h < 8;
        for (let f = 0; f < 6; f++) {
          const n = FACE_NORMAL[f];
          const nx = x + n[0], ny = y + n[1], nz = z + n[2];
          const nb = at(nx, ny, nz);
          const nbPartial = KIND[nb] === KIND_SOLID && HEIGHT8[nb] < 8;
          if (partial && f === 2) {
            // The lowered top of a partial block is always exposed.
          } else if (OPAQUE[nb]) {
            continue;
          } else if (f === 2 && nbPartial) {
            continue; // a partial block sitting on this face covers it entirely
          } else if (partial && nbPartial && f !== 3 && HEIGHT8[nb] >= h) {
            continue; // side hidden behind an equal or taller partial neighbour
          }
          const fc = FACE_CORNERS[f];
          const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
          if (partial && f === 2) {
            // Lowered top: occluders are the taller blocks around it in its own layer.
            for (let c = 0; c < 4; c++) {
              const dx = fc[c * 3] ? 1 : -1, dz = fc[c * 3 + 2] ? 1 : -1;
              const s1 = tallerThan(x + dx, y, z, h), s2 = tallerThan(x, y, z + dz, h), cc = tallerThan(x + dx, y, z + dz, h);
              ao[c] = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
            }
            for (let k = 0; k < 12; k++) corners[k] = k % 3 === 1 ? fc[k] * h : fc[k] * 8;
            opaque.quad(corners, ox, oy, oz, TILE_TOP[b], f, ao);
            continue;
          }
          for (let c = 0; c < 4; c++) {
            const cx = fc[c * 3], cy = fc[c * 3 + 1], cz = fc[c * 3 + 2];
            // The two in-plane directions pointing away from the face centre.
            const dx = cx ? 1 : -1, dy = cy ? 1 : -1, dz = cz ? 1 : -1;
            let s1: number, s2: number, cc: number;
            if (axis === 0) {
              s1 = occ(nx, ny + dy, nz); s2 = occ(nx, ny, nz + dz); cc = occ(nx, ny + dy, nz + dz);
            } else if (axis === 1) {
              s1 = occ(nx + dx, ny, nz); s2 = occ(nx, ny, nz + dz); cc = occ(nx + dx, ny, nz + dz);
            } else {
              s1 = occ(nx + dx, ny, nz); s2 = occ(nx, ny + dy, nz); cc = occ(nx + dx, ny + dy, nz);
            }
            ao[c] = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
          }
          for (let k = 0; k < 12; k++) corners[k] = k % 3 === 1 ? fc[k] * h : fc[k] * 8;
          const tile = f === 2 ? TILE_TOP[b] : f === 3 ? TILE_BOTTOM[b] : TILE_SIDE[b];
          opaque.quad(corners, ox, oy, oz, tile, f, ao, f === 2 || f === 3 ? 8 : h, EMISSIVE[b]);
        }
      }
    }
  }

  return { opaque: opaque.finish(), plants: plants.finish(), water: water.finish() };
}

/** Copies the inner CHUNK x HEIGHT x CHUNK blocks (index (y*16+z)*16+x) for collision queries. */
export function extractInner(blocks: Uint8Array): Uint8Array {
  const out = new Uint8Array(CHUNK * CHUNK * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let z = 0; z < CHUNK; z++) {
      const src = y * RW * RW + (z + MARGIN) * RW + MARGIN;
      out.set(blocks.subarray(src, src + CHUNK), (y * CHUNK + z) * CHUNK);
    }
  }
  return out;
}

