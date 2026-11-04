// The legends notice board on the city square: a parchment listing the
// pop-culture homages hidden in the world. Each line gets a tick once the
// player has found one of its kind, and a "?" once they have heard a rumour
// about it. The parchment is a canvas texture redrawn whenever that changes.

import * as THREE from 'three';
import { createPropMaterial, type EnvUniforms } from './materials';
import { LAYER_PROP_CASTER } from './shadows';
import { LM } from '../world/structures';
import type { Terrain } from '../world/terrain';
import type { Spot } from '../world/village';
import { LANDMARK_NAMES, type Discovery } from '../ui/discovery';

/** Board line for the orc capital (a site, not a landmark). */
const ORDA = 100;
/** Board lines: landmark kind and the work it tips its hat to. */
const ENTRIES: Array<[number, string]> = [
  [LM.PLATFORM, 'Harry Potter'],
  [LM.WILLOW, 'Harry Potter'],
  [LM.VAULT, 'Fallout'],
  [LM.SANDWORM, 'Dune'],
  [LM.MOISTURE_FARM, 'Star Wars'],
  [LM.SABER_STONE, 'Star Wars'],
  [LM.CHAPEL, 'Diablo'],
  [LM.PENTAGRAM, 'Diablo'],
  [LM.MURLOC_HUTS, 'Warcraft'],
  [LM.PEON_CAMP, 'Warcraft'],
  [LM.DARK_TOWER, 'Yüzüklerin Efendisi'],
  [LM.HOBBIT_HOLE, 'Hobbit'],
  [LM.MONOLITH, '2001: Uzay Destanı'],
  [LM.PHONE_BOX, 'Doctor Who'],
  [LM.SUNKEN_TEMPLE, 'Lovecraft'],
  [LM.DRAGON_LAIR, 'Pixelia efsanesi'],
  [LM.SWORD_THRONE, 'Game of Thrones'],
  [LM.ICE_WALL, 'Game of Thrones'],
  [LM.FACE_TREE, 'Game of Thrones'],
  [LM.DRAGON_SKULL, 'House of the Dragon'],
  [ORDA, 'Pixelia efsanesi'],
];

const W = 360, H = 544;
const BOARD_W = 3.2, BOARD_H = BOARD_W * (H / W);

export class LegendBoard {
  readonly group = new THREE.Group();
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private key = '';
  private timer = 0;
  /** How many board entries are ticked (the town crier announces it). */
  foundCount = 0;

  constructor(env: EnvUniforms, shadows: boolean, private terrain: Terrain, private discovery: Discovery, spot: Spot) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.colorSpace = THREE.NoColorSpace; // the shader linearises colours itself
    this.redraw(new Set(), new Set());

    const wood = createPropMaterial(env, { color: '#6e4f31', shadows });
    const face = createPropMaterial(env, { map: this.tex, shadows });
    // Framed panel between the two plank posts the voxel plan places, with a little roof.
    const panel = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, BOARD_H, 0.1), [wood, wood, wood, wood, face, wood]);
    panel.position.y = 1.0 + BOARD_H / 2;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 0.2, BOARD_H + 0.2, 0.06), wood);
    frame.position.set(0, panel.position.y, -0.06);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 1.6, 0.14, 0.7), createPropMaterial(env, { color: '#8a3a32', shadows }));
    roof.position.set(0, panel.position.y + BOARD_H / 2 + 0.3, 0.1);
    this.group.add(panel, frame, roof);
    this.group.position.set(spot.x + 0.5, spot.y + 1, spot.z + 0.5);
    this.group.rotation.y = Math.atan2(spot.fx, spot.fz); // front (+z) faces the square
    this.group.traverse((o) => o.layers.enable(LAYER_PROP_CASTER));
  }

  /** Re-reads the discovery state now and then and redraws when it changed. */
  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1;
    const d = this.discovery;
    const key = `${d.found.size}/${d.rumors.size}`;
    if (key === this.key) return;
    this.key = key;
    this.redraw(this.kinds(d.found), this.kinds(d.rumors));
  }

  /** Landmark kinds behind a set of discovery ids ("l:gx,gz"; the orda is "s:gx,gz"). */
  private kinds(ids: Set<string>): Set<number> {
    const out = new Set<number>();
    const cap = this.terrain.structures.capital();
    for (const id of ids) {
      if (cap && id === `s:${cap[0]},${cap[1]}`) { out.add(ORDA); continue; }
      const m = /^l:(-?\d+),(-?\d+)$/.exec(id);
      if (!m) continue;
      const lm = this.terrain.landmarks.at(Number(m[1]), Number(m[2]));
      if (lm) out.add(lm.kind);
    }
    return out;
  }

  private redraw(found: Set<number>, heard: Set<number>): void {
    const g = this.canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    // Parchment with darker speckles and a burnt edge.
    g.fillStyle = '#e9d9b0';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#dcc89a';
    for (let i = 0; i < 220; i++) g.fillRect((i * 97) % W, (i * 53 + i * i) % H, 3, 2);
    g.strokeStyle = '#8a6a3a';
    g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, H - 6);

    g.textBaseline = 'middle';
    g.fillStyle = '#5a2e1e';
    g.font = 'bold 26px "Cascadia Mono", Consolas, monospace';
    g.textAlign = 'center';
    g.fillText('EFSANELER', W / 2, 30);
    const n = ENTRIES.filter(([k]) => found.has(k)).length;
    this.foundCount = n;
    g.font = 'bold 15px "Cascadia Mono", Consolas, monospace';
    g.fillStyle = '#7a4a2a';
    g.fillText(`Bulunan: ${n} / ${ENTRIES.length}`, W / 2, 56);
    g.fillRect(24, 70, W - 48, 2);

    g.textAlign = 'left';
    ENTRIES.forEach(([kind, source], i) => {
      const y = 90 + i * 21.5;
      const got = found.has(kind), rumour = !got && heard.has(kind);
      // Check box.
      g.fillStyle = '#5a3a22';
      g.fillRect(18, y - 8, 16, 16);
      g.fillStyle = '#f4ead0';
      g.fillRect(20, y - 6, 12, 12);
      if (got) {
        // Pixel tick in green.
        g.fillStyle = '#2f7a2a';
        for (const [px, py] of [[22, 0], [24, 2], [26, 4], [28, 2], [30, 0], [32, -2], [34, -4], [36, -6]]) g.fillRect(px - 1, y + py - 1, 3, 3);
      } else if (rumour) {
        g.fillStyle = '#b06a1a';
        g.font = 'bold 14px "Cascadia Mono", Consolas, monospace';
        g.fillText('?', 22, y + 1);
      }
      // Unfound places stay hidden: the name only appears once found or rumoured.
      g.font = 'bold 14px "Cascadia Mono", Consolas, monospace';
      g.fillStyle = got ? '#2e2118' : rumour ? '#5a4030' : '#9a8460';
      g.fillText(got || rumour ? (kind === ORDA ? 'Ork Ordası' : LANDMARK_NAMES[kind]) : '? ? ? ? ?', 44, y + 1);
      g.font = '12px "Cascadia Mono", Consolas, monospace';
      g.fillStyle = got ? '#6a3a6a' : '#a8946c';
      g.textAlign = 'right';
      g.fillText(source, W - 16, y + 1);
      g.textAlign = 'left';
    });
    this.tex.needsUpdate = true;
  }
}
