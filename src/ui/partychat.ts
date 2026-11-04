// An MMO-style party chat box in the lower left: what nearby adventurers say
// to each other, with their nicknames. Lines fade out after a while.

const KEEP = 7;
const LIFE = 14;

export class PartyChat {
  private el: HTMLDivElement;
  private lines: Array<{ el: HTMLDivElement; t: number }> = [];

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'partychat';
    document.body.appendChild(this.el);
  }

  post(party: string, who: string, text: string): void {
    const row = document.createElement('div');
    row.className = 'pc-line';
    const tag = document.createElement('span'); tag.className = 'pc-party'; tag.textContent = `[${party}] `;
    const name = document.createElement('span'); name.className = 'pc-who'; name.textContent = `${who}: `;
    const body = document.createElement('span'); body.className = 'pc-text'; body.textContent = text;
    row.append(tag, name, body);
    this.el.appendChild(row);
    this.lines.push({ el: row, t: LIFE });
    while (this.lines.length > KEEP) this.lines.shift()!.el.remove();
  }

  update(dt: number): void {
    for (const l of this.lines) {
      l.t -= dt;
      if (l.t < 2) l.el.style.opacity = String(Math.max(0, l.t / 2));
    }
    while (this.lines.length && this.lines[0].t <= 0) this.lines.shift()!.el.remove();
  }
}
