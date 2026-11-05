// The interact key: things within reach (a chest, someone with a task, the
// notice board) offer an action; the nearest one is shown as a prompt and E
// (or the ETKİLEŞ button on touch screens) does it.

export interface Candidate {
  x: number; y: number; z: number;
  /** "Sandığı aç", "Konuş"... */
  label: string;
  act: () => void;
}

export type Provider = (px: number, py: number, pz: number) => Candidate | null;

export class Interact {
  private providers: Provider[] = [];
  private current: Candidate | null = null;
  private el = document.createElement('div');
  /** Touch: the button shown while something is in reach. */
  readonly button = document.createElement('button');

  constructor(touch: boolean) {
    this.el.id = 'interact';
    this.el.className = 'hidden';
    document.body.appendChild(this.el);
    this.button.className = 't-act hidden';
    this.button.textContent = 'ETKİLEŞ';
    if (touch) {
      const press = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.trigger(); };
      this.button.addEventListener('touchstart', press, { passive: false });
      this.button.addEventListener('click', press);
    }
    this.touch = touch;
  }

  private touch: boolean;

  add(p: Provider): void { this.providers.push(p); }

  /** What is on offer right now (dev). */
  get label(): string | null { return this.current?.label ?? null; }

  update(px: number, py: number, pz: number, active: boolean): void {
    let best: Candidate | null = null, bd = Infinity;
    if (active) for (const p of this.providers) {
      const c = p(px, py, pz);
      if (!c) continue;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < bd) { bd = d; best = c; }
    }
    if (best?.label !== this.current?.label || !best !== !this.current) {
      this.el.classList.toggle('hidden', !best);
      this.button.classList.toggle('hidden', !best);
      if (best) {
        this.el.innerHTML = this.touch ? '' : `<span class="key">E</span> ${best.label}`;
        this.button.textContent = best.label.toLocaleUpperCase('tr');
      }
      if (this.touch) this.el.classList.add('hidden');
    }
    this.current = best;
  }

  trigger(): void {
    const c = this.current;
    if (!c) return;
    this.current = null;
    this.el.classList.add('hidden');
    this.button.classList.add('hidden');
    c.act();
  }
}
