// Block registry. Shared by the main thread and the world workers.

export const CHUNK = 16;
export const HEIGHT = 128;
export const SEA = 52;

/** Texture tiles, in atlas-layer order. textures.ts must provide a painter for each. */
export const TILE_NAMES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'sand', 'sandstone_side', 'sandstone_top', 'gravel',
  'snow', 'snow_side', 'ice', 'water', 'bedrock', 'clay_red', 'clay_orange', 'clay_tan', 'clay_brown',
  'oak_log', 'oak_log_top', 'oak_leaves', 'birch_log', 'birch_log_top', 'birch_leaves',
  'spruce_log', 'spruce_log_top', 'spruce_leaves',
  'gloom_grass_top', 'gloom_grass_side', 'gloom_log', 'gloom_log_top', 'gloom_leaves',
  'cactus_side', 'cactus_top',
  'cobble', 'stone_bricks', 'mossy_bricks', 'planks', 'dark_planks', 'path_top', 'path_side',
  'tall_grass', 'flower_red', 'flower_yellow', 'flower_blue', 'flower_white', 'dead_bush', 'fern',
  'mushroom_red', 'mushroom_brown', 'gloom_weed', 'moss_stone',
  'window_lit', 'window_dark', 'slate', 'cracked_bricks', 'lantern',
  'ash', 'basalt_side', 'basalt_top', 'obsidian', 'magma', 'lava', 'charred_log', 'charred_log_top',
  'eldritch_stone', 'glyph', 'black_sand', 'deep_water', 'kelp', 'bone', 'steel', 'vault_gear',
  'red_bricks', 'gold', 'ember_flower', 'saber_blade', 'saber_hilt', 'door_green', 'booth_blue',
  'roof_red', 'roof_slate', 'thatch', 'plaster', 'window_wood', 'door_low', 'door_top', 'farmland',
  'wheat', 'carrots', 'hay_top', 'hay_side', 'cloth_red', 'cloth_yellow', 'crate',
  'banner_red', 'banner_blue', 'banner_green', 'banner_black', 'banner_purple',
] as const;

export type TileName = (typeof TILE_NAMES)[number];
const T = (n: TileName) => TILE_NAMES.indexOf(n);

/** Render/physics behaviour of a block. */
export const KIND_AIR = 0;
export const KIND_SOLID = 1;
export const KIND_LEAVES = 2;
export const KIND_WATER = 3;
export const KIND_PLANT = 4;

export const MAX_BLOCKS = 256;
export const KIND = new Uint8Array(MAX_BLOCKS);
/** Fully hides neighbour faces. */
export const OPAQUE = new Uint8Array(MAX_BLOCKS);
/** Darkens neighbouring vertices (ambient occlusion). */
export const OCCLUDES = new Uint8Array(MAX_BLOCKS);
/** Blocks player movement. */
export const COLLIDES = new Uint8Array(MAX_BLOCKS);
export const TILE_TOP = new Uint8Array(MAX_BLOCKS);
export const TILE_BOTTOM = new Uint8Array(MAX_BLOCKS);
export const TILE_SIDE = new Uint8Array(MAX_BLOCKS);
/** Block height in eighths (8 = full cube). Partial blocks form smooth slopes. */
export const HEIGHT8 = new Uint8Array(MAX_BLOCKS).fill(8);
/** For partial blocks: the full block they are cut from (identity for others). */
export const BASE_OF = new Uint8Array(MAX_BLOCKS);
/** Glows by itself (shader adds light, stronger at night). */
export const EMISSIVE = new Uint8Array(MAX_BLOCKS);
/** Plants that sit inside liquid (kelp): liquid faces next to them are hidden. */
export const WATERLOGGED = new Uint8Array(MAX_BLOCKS);
export const BLOCK_NAMES: string[] = [];

let nextId = 0;
function def(name: string, kind: number, top: TileName | null, side?: TileName, bottom?: TileName): number {
  const id = nextId++;
  BLOCK_NAMES[id] = name;
  KIND[id] = kind;
  OPAQUE[id] = kind === KIND_SOLID ? 1 : 0;
  OCCLUDES[id] = kind === KIND_SOLID || kind === KIND_LEAVES ? 1 : 0;
  COLLIDES[id] = kind === KIND_SOLID || kind === KIND_LEAVES ? 1 : 0;
  BASE_OF[id] = id;
  if (top) {
    TILE_TOP[id] = T(top);
    TILE_SIDE[id] = T(side ?? top);
    TILE_BOTTOM[id] = T(bottom ?? top);
  }
  return id;
}

export const B = {
  AIR: def('air', KIND_AIR, null),
  BEDROCK: def('bedrock', KIND_SOLID, 'bedrock'),
  STONE: def('stone', KIND_SOLID, 'stone'),
  DIRT: def('dirt', KIND_SOLID, 'dirt'),
  GRASS: def('grass', KIND_SOLID, 'grass_top', 'grass_side', 'dirt'),
  SAND: def('sand', KIND_SOLID, 'sand'),
  SANDSTONE: def('sandstone', KIND_SOLID, 'sandstone_top', 'sandstone_side', 'sandstone_top'),
  GRAVEL: def('gravel', KIND_SOLID, 'gravel'),
  SNOW: def('snow', KIND_SOLID, 'snow'),
  SNOW_GRASS: def('snowy_grass', KIND_SOLID, 'snow', 'snow_side', 'dirt'),
  ICE: def('ice', KIND_SOLID, 'ice'),
  WATER: def('water', KIND_WATER, 'water'),
  CLAY_RED: def('clay_red', KIND_SOLID, 'clay_red'),
  CLAY_ORANGE: def('clay_orange', KIND_SOLID, 'clay_orange'),
  CLAY_TAN: def('clay_tan', KIND_SOLID, 'clay_tan'),
  CLAY_BROWN: def('clay_brown', KIND_SOLID, 'clay_brown'),
  OAK_LOG: def('oak_log', KIND_SOLID, 'oak_log_top', 'oak_log'),
  OAK_LEAVES: def('oak_leaves', KIND_LEAVES, 'oak_leaves'),
  BIRCH_LOG: def('birch_log', KIND_SOLID, 'birch_log_top', 'birch_log'),
  BIRCH_LEAVES: def('birch_leaves', KIND_LEAVES, 'birch_leaves'),
  SPRUCE_LOG: def('spruce_log', KIND_SOLID, 'spruce_log_top', 'spruce_log'),
  SPRUCE_LEAVES: def('spruce_leaves', KIND_LEAVES, 'spruce_leaves'),
  GLOOM_GRASS: def('gloom_grass', KIND_SOLID, 'gloom_grass_top', 'gloom_grass_side', 'dirt'),
  GLOOM_LOG: def('gloom_log', KIND_SOLID, 'gloom_log_top', 'gloom_log'),
  GLOOM_LEAVES: def('gloom_leaves', KIND_LEAVES, 'gloom_leaves'),
  CACTUS: def('cactus', KIND_SOLID, 'cactus_top', 'cactus_side'),
  COBBLE: def('cobblestone', KIND_SOLID, 'cobble'),
  STONE_BRICKS: def('stone_bricks', KIND_SOLID, 'stone_bricks'),
  MOSSY_BRICKS: def('mossy_bricks', KIND_SOLID, 'mossy_bricks'),
  MOSS_STONE: def('moss_stone', KIND_SOLID, 'moss_stone'),
  PLANKS: def('planks', KIND_SOLID, 'planks'),
  DARK_PLANKS: def('dark_planks', KIND_SOLID, 'dark_planks'),
  PATH: def('path', KIND_SOLID, 'path_top', 'path_side', 'dirt'),
  TALL_GRASS: def('tall_grass', KIND_PLANT, 'tall_grass'),
  FLOWER_RED: def('flower_red', KIND_PLANT, 'flower_red'),
  FLOWER_YELLOW: def('flower_yellow', KIND_PLANT, 'flower_yellow'),
  FLOWER_BLUE: def('flower_blue', KIND_PLANT, 'flower_blue'),
  FLOWER_WHITE: def('flower_white', KIND_PLANT, 'flower_white'),
  DEAD_BUSH: def('dead_bush', KIND_PLANT, 'dead_bush'),
  FERN: def('fern', KIND_PLANT, 'fern'),
  MUSHROOM_RED: def('mushroom_red', KIND_PLANT, 'mushroom_red'),
  MUSHROOM_BROWN: def('mushroom_brown', KIND_PLANT, 'mushroom_brown'),
  GLOOM_WEED: def('gloom_weed', KIND_PLANT, 'gloom_weed'),
  WINDOW_LIT: def('window_lit', KIND_SOLID, 'stone_bricks', 'window_lit'),
  WINDOW_DARK: def('window_dark', KIND_SOLID, 'stone_bricks', 'window_dark'),
  SLATE: def('slate', KIND_SOLID, 'slate'),
  CRACKED_BRICKS: def('cracked_bricks', KIND_SOLID, 'cracked_bricks'),
  LANTERN: def('lantern', KIND_SOLID, 'lantern'),
  ASH: def('ash', KIND_SOLID, 'ash'),
  BASALT: def('basalt', KIND_SOLID, 'basalt_top', 'basalt_side'),
  OBSIDIAN: def('obsidian', KIND_SOLID, 'obsidian'),
  MAGMA: def('magma', KIND_SOLID, 'magma'),
  LAVA: def('lava', KIND_WATER, 'lava'),
  CHARRED_LOG: def('charred_log', KIND_SOLID, 'charred_log_top', 'charred_log'),
  ELDRITCH_STONE: def('eldritch_stone', KIND_SOLID, 'eldritch_stone'),
  GLYPH: def('glyph', KIND_SOLID, 'eldritch_stone', 'glyph'),
  BLACK_SAND: def('black_sand', KIND_SOLID, 'black_sand'),
  DEEP_WATER: def('deep_water', KIND_WATER, 'deep_water'),
  KELP: def('kelp', KIND_PLANT, 'kelp'),
  BONE: def('bone', KIND_SOLID, 'bone'),
  STEEL: def('steel', KIND_SOLID, 'steel'),
  VAULT_GEAR: def('vault_gear', KIND_SOLID, 'steel', 'vault_gear'),
  RED_BRICKS: def('red_bricks', KIND_SOLID, 'red_bricks'),
  GOLD: def('gold', KIND_SOLID, 'gold'),
  EMBER_FLOWER: def('ember_flower', KIND_PLANT, 'ember_flower'),
  SABER_BLADE: def('saber_blade', KIND_PLANT, 'saber_blade'),
  SABER_HILT: def('saber_hilt', KIND_PLANT, 'saber_hilt'),
  DOOR_GREEN: def('door_green', KIND_SOLID, 'door_green'),
  BOOTH_BLUE: def('booth_blue', KIND_SOLID, 'booth_blue'),
  // Villages and the city.
  ROOF_RED: def('roof_red', KIND_SOLID, 'roof_red'),
  ROOF_SLATE: def('roof_slate', KIND_SOLID, 'roof_slate'),
  THATCH: def('thatch', KIND_SOLID, 'thatch'),
  PLASTER: def('plaster', KIND_SOLID, 'plaster'),
  WINDOW_WOOD: def('window_wood', KIND_SOLID, 'planks', 'window_wood'),
  DOOR_LOW: def('door_low', KIND_SOLID, 'planks', 'door_low'),
  DOOR_TOP: def('door_top', KIND_SOLID, 'planks', 'door_top'),
  FARMLAND: def('farmland', KIND_SOLID, 'farmland', 'dirt'),
  WHEAT: def('wheat', KIND_PLANT, 'wheat'),
  CARROTS: def('carrots', KIND_PLANT, 'carrots'),
  HAY: def('hay', KIND_SOLID, 'hay_top', 'hay_side'),
  CLOTH_RED: def('cloth_red', KIND_SOLID, 'cloth_red'),
  CLOTH_YELLOW: def('cloth_yellow', KIND_SOLID, 'cloth_yellow'),
  CRATE: def('crate', KIND_SOLID, 'crate'),
  // Heraldry of the garrisoned castles (one colour per noble house).
  BANNER_RED: def('banner_red', KIND_SOLID, 'banner_red'),
  BANNER_BLUE: def('banner_blue', KIND_SOLID, 'banner_blue'),
  BANNER_GREEN: def('banner_green', KIND_SOLID, 'banner_green'),
  BANNER_BLACK: def('banner_black', KIND_SOLID, 'banner_black'),
  BANNER_PURPLE: def('banner_purple', KIND_SOLID, 'banner_purple'),
} as const;
for (const b of [B.MAGMA, B.LAVA, B.GLYPH, B.KELP, B.EMBER_FLOWER, B.SABER_BLADE]) EMISSIVE[b] = 1;
WATERLOGGED[B.KELP] = 1;
EMISSIVE[B.WINDOW_LIT] = 1;
EMISSIVE[B.LANTERN] = 1;
EMISSIVE[B.WINDOW_WOOD] = 1;

/** Heights (in eighths) available for partial surface blocks. */
export const PARTIAL_HEIGHTS = [2, 4, 6] as const;

/**
 * PARTIAL.get(base)[k] = id of `base` cut to PARTIAL_HEIGHTS[k].
 * Partial blocks are solid but never hide neighbour faces.
 */
export const PARTIAL = new Map<number, number[]>();
for (const base of [B.GRASS, B.DIRT, B.SAND, B.SNOW, B.SNOW_GRASS, B.GLOOM_GRASS, B.STONE, B.GRAVEL, B.MOSS_STONE, B.PATH, B.COBBLE, B.ASH, B.BASALT, B.BLACK_SAND, B.ROOF_RED, B.ROOF_SLATE, B.THATCH, B.SANDSTONE, B.PLANKS]) {
  const ids = PARTIAL_HEIGHTS.map((h) => {
    const id = nextId++;
    BLOCK_NAMES[id] = `${BLOCK_NAMES[base]}_${h}`;
    KIND[id] = KIND_SOLID;
    OPAQUE[id] = 0;
    OCCLUDES[id] = h >= 4 ? 1 : 0;
    COLLIDES[id] = 1;
    TILE_TOP[id] = TILE_TOP[base];
    TILE_SIDE[id] = TILE_SIDE[base];
    TILE_BOTTOM[id] = TILE_BOTTOM[base];
    HEIGHT8[id] = h;
    BASE_OF[id] = base;
    return id;
  });
  PARTIAL.set(base, ids);
}

/** Any liquid (water, deep water, lava). */
export function isLiquid(b: number): boolean {
  return KIND[b] === KIND_WATER;
}

/** Surface type used for footstep sounds (later) and gameplay hints. */
export function isSoil(b: number): boolean {
  return b === B.GRASS || b === B.DIRT || b === B.SNOW_GRASS || b === B.GLOOM_GRASS || b === B.PATH;
}
