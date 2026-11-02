// Web Worker: generates and meshes chunks off the main thread.

import { Terrain } from './terrain';
import { meshRegion, extractInner, type MeshData } from './mesher';
import type { SignRecord } from './stamp';

export type WorkerRequest =
  | { type: 'init'; seed: number }
  | { type: 'gen'; cx: number; cz: number };

export interface ChunkResult {
  type: 'chunk';
  cx: number;
  cz: number;
  blocks: Uint8Array;
  opaque: MeshData;
  plants: MeshData;
  water: MeshData;
  signs: SignRecord[];
}

interface WorkerScope {
  onmessage: ((e: MessageEvent<unknown>) => void) | null;
  postMessage(msg: unknown, transfer: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

let terrain: Terrain | null = null;

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

scope.onmessage = (e) => {
  const msg = e.data as Partial<WorkerRequest> | null;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'init' && isInt(msg.seed)) {
    terrain = new Terrain(msg.seed >>> 0);
    return;
  }
  if (msg.type === 'gen' && terrain && isInt(msg.cx) && isInt(msg.cz)) {
    const { blocks, signs } = terrain.generateRegion(msg.cx, msg.cz);
    const meshes = meshRegion(blocks);
    const inner = extractInner(blocks);
    const result: ChunkResult = { type: 'chunk', cx: msg.cx, cz: msg.cz, blocks: inner, ...meshes, signs };
    const transfer: Transferable[] = [inner.buffer];
    for (const m of [meshes.opaque, meshes.plants, meshes.water]) {
      transfer.push(m.position.buffer, m.data.buffer, m.index.buffer);
    }
    scope.postMessage(result, transfer);
  }
};
