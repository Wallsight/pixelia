// Adventurers talk like players in an online game's party chat: nicknames,
// slang, ribbing each other on the road and calling out in a fight. Lines are
// spoken as bubbles and, near the player, also show in the party chat box.

import type { Creature } from './creatures';
import type { FighterKind } from './night';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

const NICKS: Partial<Record<FighterKind, string[]>> = {
  warrior: ['KılıçBaba', 'xXDemirYumrukXx', 'TankEmre', 'KalkanlıKaya', 'Barbar_Bora', 'AggroKral'],
  archer: ['OkçuNaz', 'Gölge_Ok', 'ElfDeğilim', 'NişancıCan', 'Kirpi1907', 'SessizAdım'],
  mage: ['AteşTopu42', 'ŞifacıEce', 'BüyücüFırtına', 'ManaYok', 'Kıvılcım_Su', 'KitapKurdu'],
};

/** Road talk: short exchanges, spoken in turn round the party. */
export const ROAD_BANTER: string[][] = [
  ['brb 2 dk, annem yemeğe çağırıyor', 'yolun ortasında afk olunmaz!', 'tamam bekliyoruz, çabuk gel'],
  ['tank kim bu grupta?', 'kalkan bende, tabii ki ben', 'geçen sefer de öyle demiştin, wipe olduk'],
  ['mana %12', 'pot iç', 'pot kalmadı, hepsini satmışım :('],
  ['geçen haftaki loot neredeydi?', 'ninja looter biri vardı...', '*ıslık çalar*'],
  ['kim buff atmadı?', 'atıyorum atıyorum', 'Işık bizimle! +5 cesaret'],
  ['bu yol daha ne kadar?', 'haritaya bak, M tuşu', 'M tuşu ne?'],
  ['dps meter açın bakalım', 'okçu yine birinci', 'tabii, oklar bedava'],
  ['lag var mı bende mi?', 'sende', 'ping 300 kardeşim, köy interneti'],
  ['lfg ejder avı, biri gelir mi?', 'zaten gruptayız...', 'ha doğru, afk kafa'],
  ['bu zırh bana yakışmış mı?', 'transmog berbat olmuş', 'stat iyi ama!'],
  ['questi kim okudu?', 'okumadım, ünlemi gördüm tıkladım', 'klasik'],
  ['gece canavar farmlayalım mı?', 'xp iyi ama ölürsek ben suçlanmam', 'healer sensin zaten'],
  ['gg wp herkes', 'daha bir şey yapmadık', 'olsun, moral olsun'],
];
/** Round the camp fire. */
export const CAMP_BANTER: string[][] = [
  ['ateşi kim yaktı?', 'büyücü, tek işe yarar spelli', 'duydum onu!'],
  ['nöbeti kim tutuyor?', '/roll', '1 attım... tamam ben tutarım'],
  ['log out yapmadan önce tamir edin', 'tamirci 200 altın istiyor', 'soygun bu'],
];
export const BATTLE_CALLS = ['aggro bende!', 'heal lazım!!', 'pull ettim, hazır olun', 'kim pull etti?!', 'kite et kite!', 'cc at cc!', 'odaklan şuna!', 'arkasına geç!', 'mana bitti!'];
export const DOWN_CALLS = ['öldüm', 'res pls', 'lag yüzünden öldüm', 'tank nerede?!', 'bir saniye, yerdeyim'];
export const UP_CALLS = ['res için sağ ol', 'geri döndüm!', 'tamam tamam, buradayım'];
export const VICTORY_CALLS = ['gg', 'gg wp', 'need/greed atın', 'need atıyorum!', 'o kılıç benim class için!', 'ninja looter!!', 'lvl atladım!!', 'bir dahakine wipe olmayalım'];

const nicks = new WeakMap<Creature, string>();

/** A creature's party nickname (made up the first time it is asked for). */
export function nick(c: Creature, kind: FighterKind): string {
  let n = nicks.get(c);
  if (!n) { n = pick(NICKS[kind] ?? ['Maceracı']); nicks.set(c, n); }
  return n;
}

/** Speak an exchange in turn round the members (skipping anyone gone). */
export function exchange(members: Creature[], lines: string[], say: (c: Creature, text: string) => void, gap = 2900): void {
  const start = Math.floor(rand(0, members.length));
  lines.forEach((l, i) => setTimeout(() => {
    const live = members.filter((m) => !m.gone && m.dying === 0);
    if (live.length) say(live[(start + i) % live.length], l);
  }, i * gap));
}

export { pick as pickLine };
