// Film-style subtitles at the bottom of the screen, for voices too big for a
// speech bubble (the great dragon). Text types itself out; mumbles are italic.

export class Subtitle {
  private el: HTMLDivElement;
  private who: HTMLDivElement;
  private line: HTMLDivElement;
  private text = '';
  private shown = 0;
  private left = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'subtitle';
    this.who = document.createElement('div');
    this.who.className = 'who';
    this.line = document.createElement('div');
    this.line.className = 'line';
    this.el.append(this.who, this.line);
    document.body.appendChild(this.el);
  }

  show(who: string, text: string, sec: number, mumble = false): void {
    this.who.textContent = mumble ? `${who} (uykusunda)` : who;
    this.text = text;
    this.shown = 0;
    this.left = sec;
    this.line.textContent = '';
    this.el.classList.toggle('mumble', mumble);
    this.el.classList.add('show');
  }

  update(dt: number): void {
    if (this.left <= 0) return;
    this.left -= dt;
    if (this.shown < this.text.length) {
      this.shown = Math.min(this.text.length, this.shown + dt * 38);
      this.line.textContent = this.text.slice(0, Math.floor(this.shown));
    }
    if (this.left <= 0) this.el.classList.remove('show');
  }
}
