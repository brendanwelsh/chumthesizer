/** DIAL KEY MAP — single source of truth that reconciles the dial's THREE orderings
 *  (the physical index the plugin bridge emits, the on-screen key layout, and the
 *  sound/label assignment). The plugin allocates physical indices in first-press order,
 *  which has no fixed relation to key position — so a press lit the wrong key + played
 *  the wrong sound. This maps physical → canonical slot (0..6), default identity, and
 *  learns the real mapping in ~10 seconds: press the 7 keys in the on-screen order. */

const KEYS = 7;
const STORE = "chumthesizer.dialmap.v1";

export class DialMap {
  private m = new Map<number, number>(); // physical bridge index → canonical slot
  learning = false;
  private nextSlot = 0;
  /** fired during learn with the canonical slot to press next (0..6). */
  onProgress: ((slot: number) => void) | null = null;
  /** fired when all 7 keys are learned + saved. */
  onDone: (() => void) | null = null;

  constructor() { this.load(); }

  /** Translate a physical bridge index to the canonical slot (identity until learned). */
  canonical(physical: number): number {
    const c = this.m.get(physical);
    if (c !== undefined) return c;
    return physical >= 0 && physical < KEYS ? physical : 0;
  }

  isCalibrated(): boolean { return this.m.size >= KEYS; }
  /** during learn, the canonical slot to press next (0..6); -1 when not learning. */
  get learnSlot(): number { return this.learning ? this.nextSlot : -1; }
  readonly total = KEYS;

  startLearn(): void {
    this.learning = true;
    this.nextSlot = 0;
    this.m.clear();
    this.onProgress?.(0);
  }
  /** Feed a physical press during learn; binds it to the next canonical slot. */
  feed(physical: number): void {
    if (!this.learning) return;
    if (!this.m.has(physical)) { this.m.set(physical, this.nextSlot); this.nextSlot++; }
    if (this.nextSlot >= KEYS) { this.learning = false; this.save(); this.onDone?.(); }
    else this.onProgress?.(this.nextSlot);
  }
  cancelLearn(): void { this.learning = false; this.load(); }
  reset(): void { this.m.clear(); this.save(); }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) this.m = new Map(a as [number, number][]); }
    } catch { /* ignore */ }
  }
  private save(): void {
    try { localStorage.setItem(STORE, JSON.stringify([...this.m])); } catch { /* ignore */ }
  }
}
