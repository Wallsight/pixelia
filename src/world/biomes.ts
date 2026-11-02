import { CHUNK } from './blocks';

export const BIOME = {
  OCEAN: 0,
  FROZEN_OCEAN: 1,
  BEACH: 2,
  STONY_SHORE: 3,
  RIVER: 4,
  PLAINS: 5,
  FOREST: 6,
  BIRCH_FOREST: 7,
  TAIGA: 8,
  TUNDRA: 9,
  DESERT: 10,
  BADLANDS: 11,
  GLOOM: 12,
  MOUNTAINS: 13,
  SNOW_PEAKS: 14,
  ASHLANDS: 15,
  ELDRITCH_SEA: 16,
  BLACK_BEACH: 17,
} as const;

export const BIOME_NAMES_TR = [
  'Okyanus', 'Donmuş Okyanus', 'Kumsal', 'Taşlı Kıyı', 'Nehir', 'Çayır', 'Orman', 'Huş Ormanı',
  'Tayga', 'Tundra', 'Çöl', 'Kızıl Kanyonlar', 'Kasvetli Orman', 'Dağlar', 'Karlı Zirveler',
  'Kül Diyarı', 'Batık Derinlikler', 'Kara Kumsal',
];

/** Extra columns generated around each chunk so border features stay consistent. */
export const MARGIN = 5;
export const RW = CHUNK + MARGIN * 2;
