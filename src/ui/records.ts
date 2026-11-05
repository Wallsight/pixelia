// Records: what the traveller has done in this world (gold, tasks, places,
// ground covered, time) and a table of every world played in this browser,
// best purse first. Shown on the pause screen. Kept only in this browser.

export interface RecordRow { seed: number; gold: number; quests: number; found: number; area: number; time: number; at: number }

const KEY = 'pixelia-records';

export class Records {
  private el = document.createElement('div');
  private rows: Record<string, RecordRow> = {};
  /** Seconds played in this world (loaded, then counted up while playing). */
  time = 0;

  constructor(private seed: number, parent: HTMLElement, before: Element | null) {
    this.el.id = 'records';
    this.el.className = 'hidden';
    parent.insertBefore(this.el, before);
    try { this.rows = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, RecordRow>; } catch { this.rows = {}; }
    this.time = this.rows[seed]?.time ?? 0;
  }

  /** Store this world's row (and keep the table). */
  save(now: Omit<RecordRow, 'seed' | 'time' | 'at'>): void {
    this.rows[this.seed] = { seed: this.seed, ...now, time: Math.round(this.time), at: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(this.rows)); } catch { /* storage blocked */ }
  }

  show(on: boolean, now: () => Omit<RecordRow, 'seed' | 'time' | 'at'>): void {
    if (on) this.save(now());
    this.el.classList.toggle('hidden', !on);
    if (!on) return;
    const me = this.rows[this.seed];
    const t = Math.round(this.time / 60);
    const stat = (label: string, v: string) => `<div class="stat"><span>${label}</span><b>${v}</b></div>`;
    const table = Object.values(this.rows).sort((a, b) => b.gold - a.gold).slice(0, 5);
    this.el.innerHTML = '<h2>KAYITLAR</h2>'
      + `<div class="stats">${stat('Altın', String(me.gold))}${stat('Biten görev', String(me.quests))}${stat('Keşfedilen yer', String(me.found))}`
      + `${stat('Gezilen alan', `${me.area.toFixed(2)} km²`)}${stat('Süre', t >= 60 ? `${Math.floor(t / 60)} sa ${t % 60} dk` : `${t} dk`)}</div>`
      + (table.length > 1 ? '<table class="board"><tr><th>#</th><th>Dünya</th><th>Altın</th><th>Görev</th><th>Keşif</th></tr>'
        + table.map((r, i) => `<tr${r.seed === this.seed ? ' class="me"' : ''}><td>${i + 1}</td><td>${r.seed}</td><td>${r.gold}</td><td>${r.quests}</td><td>${r.found}</td></tr>`).join('')
        + '</table>' : '')
      + '<p class="hint">Kayıtlar yalnızca bu tarayıcıda tutulur.</p>';
  }
}
