// Spending gold: whoever works behind a counter sells a thing or two.
//   shop: a map piece (an unknown landmark is put on the map),
//   bakery / inn: bread or soup (well fed: faster on foot for a while),
//   inn: a room (sleep till morning),
//   smithy: hobnailed boots (faster on foot for good),
//   hall: a treasure map (the nearest unopened chest is marked on the compass).
// What is owned is kept per seed.

import type { HouseKind } from '../world/village';

export interface Ware { id: string; name: string; text: string; price: number }

const WARES: Partial<Record<HouseKind, Ware[]>> = {
  shop: [{ id: 'map', name: 'Harita parçası', text: 'Bilinmeyen bir yeri haritana işler.', price: 40 }],
  bakery: [{ id: 'bread', name: 'Taze ekmek', text: 'Tok karın: 3 dakika daha hızlı yürürsün.', price: 6 }],
  inn: [
    { id: 'soup', name: 'Sıcak çorba', text: 'Tok karın: 6 dakika daha hızlı yürürsün.', price: 8 },
    { id: 'room', name: 'Han odası', text: 'Sabaha kadar uyu (yalnızca akşam ve gece).', price: 15 },
  ],
  smithy: [{ id: 'boots', name: 'Nallı çizme', text: 'Kalıcı: her zaman biraz daha hızlı yürürsün.', price: 150 }],
  hall: [{ id: 'treasure', name: 'Hazine haritası', text: 'En yakın açılmamış sandık pusulanda işaretlenir.', price: 30 }],
};

const TRADER: Partial<Record<HouseKind, string>> = { shop: 'Dükkâncı', bakery: 'Fırıncı', inn: 'Hancı', smithy: 'Demirci', hall: 'Muhtar' };

export interface ShopHost {
  gold(): number;
  spend(n: number): void;
  /** Put an unknown place on the map; its name, or null if none is left nearby. */
  mapPiece(): string | null;
  night(): number;
  sleep(): void;
  /** The nearest unopened chest, or null. */
  treasure(): { id: string; x: number; z: number } | null;
  notice(kicker: string, title: string): void;
  sound(): void;
}

export class Shop {
  private el = document.createElement('div');
  private kind: HouseKind | null = null;
  boots = false;
  /** Seconds of being well fed left. */
  fed = 0;
  /** The chest the treasure map points to. */
  chest: { id: string; x: number; z: number } | null = null;
  private key: string;

  constructor(seed: number, private host: ShopHost, private touch: boolean) {
    this.key = `pixelia-shop-${seed}`;
    try {
      const d = JSON.parse(localStorage.getItem(this.key) ?? 'null') as { boots?: boolean; chest?: { id: string; x: number; z: number } | null } | null;
      if (d) { this.boots = !!d.boots; this.chest = d.chest ?? null; }
    } catch { /* storage blocked */ }
    this.el.id = 'shop';
    this.el.className = 'hidden';
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.i === 'x') this.close(); else this.buy(Number(b.dataset.i));
    });
  }

  private save(): void {
    try { localStorage.setItem(this.key, JSON.stringify({ boots: this.boots, chest: this.chest })); } catch { /* storage blocked */ }
  }

  get open(): boolean { return this.kind !== null; }

  /** Does someone at this kind of place sell anything? */
  sells(kind: HouseKind): boolean { return !!WARES[kind]?.length; }

  show(kind: HouseKind): void {
    this.kind = kind;
    this.render('');
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.kind = null;
    this.el.classList.add('hidden');
  }

  private render(line: string): void {
    const wares = WARES[this.kind!] ?? [];
    const g = this.host.gold();
    this.el.innerHTML = `<div class="who">${TRADER[this.kind!] ?? ''}</div>`
      + wares.map((w, i) => {
        const owned = w.id === 'boots' && this.boots;
        const can = !owned && g >= w.price;
        return `<div class="ware${can ? '' : ' off'}"><button data-i="${i}"${can ? '' : ' disabled'}>${this.touch ? '' : `<span class="key">${i + 1}</span>`}${w.name}</button>`
          + `<span class="price"><span class="coin"></span>${owned ? 'alındı' : w.price}</span><div class="text">${w.text}</div></div>`;
      }).join('')
      + `<div class="say">${line || `Kesende <span class="coin"></span>${g} altın var.`}</div>`
      + `<div class="row"><button data-i="x">Kapat${this.touch ? '' : ' <span class="key">Q</span>'}</button></div>`;
  }

  /** Number keys while open. */
  key1(n: number): void { if (this.open) this.buy(n); }

  buy(i: number): void {
    const w = WARES[this.kind!]?.[i];
    if (!w) return;
    if (w.id === 'boots' && this.boots) return;
    if (this.host.gold() < w.price) { this.render('Kesen yetmiyor, yolcu.'); return; }
    let line = '';
    switch (w.id) {
      case 'map': {
        const name = this.host.mapPiece();
        if (!name) { this.render('Bu yörenin bütün haritaları sende zaten.'); return; }
        line = `Al bakalım: ${name}. Haritana işledim.`;
        break;
      }
      case 'bread': this.fed = Math.max(this.fed, 180); line = 'Afiyet olsun! Sıcacık.'; break;
      case 'soup': this.fed = Math.max(this.fed, 360); line = 'Mercimek çorbası, bol limonlu.'; break;
      case 'room':
        if (this.host.night() < 0.4) { this.render('Odalar akşam açılır, yolcu.'); return; }
        this.host.spend(w.price);
        this.host.sound();
        this.close();
        this.host.sleep();
        this.host.notice('HAN', 'Deliksiz bir uyku... Sabah oldu.');
        return;
      case 'boots': this.boots = true; line = 'Bu çizmelerle dağ taş yürürsün!'; break;
      case 'treasure': {
        const c = this.host.treasure();
        if (!c) { this.render('Bu yörede bilinen bir hazine kalmadı.'); return; }
        this.chest = c;
        line = 'Haritadaki çarpıyı görüyor musun? Pusulan oraya götürür.';
        break;
      }
    }
    this.host.spend(w.price);
    this.host.sound();
    this.save();
    this.render(line);
  }

  /** Speed multiplier on foot. */
  get speed(): number { return (this.boots ? 1.15 : 1) * (this.fed > 0 ? 1.25 : 1); }

  update(dt: number): void {
    if (this.fed > 0) this.fed = Math.max(0, this.fed - dt);
  }

  /** The chest was opened (or is gone): forget it. */
  chestTaken(): void { this.chest = null; this.save(); }
}
