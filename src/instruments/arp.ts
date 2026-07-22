import type { Engine } from "../audio/engine";
import type { Instrument, Overlay } from "./instrument";

/** ARP — the fun one. Hold a chord (one or more fingers) on the keyboard and it ARPEGGIATES the held
 *  notes in time with the groove (eighth notes). Lift fingers to change the chord; it keeps rolling.
 *  A tiny generative sequencer you play with your hands — locks to the beat so it always grooves. */
const COLUMNS = 14;

export class ArpInstrument implements Instrument {
  readonly id = "arp" as const;
  readonly name = "Arp";
  private held = new Map<string, number>();   // finger id -> scale degree
  private order: number[] = [];
  private idx = 0;
  private voiceId = "arp_v";
  private alive = true;
  private nextAt = 0;   // audio-clock time of the next step — self-correcting (setTimeout alone drifts audibly)

  constructor(private engine: Engine, private bpmFn: () => number) {
    this.nextAt = engine.ctx.currentTime;
    const pump = (): void => {
      if (!this.alive) return;
      const now = this.engine.ctx.currentTime;
      if (now >= this.nextAt) {
        this.playStep();
        const stepLen = 60 / Math.max(40, this.bpmFn()) / 2;   // eighth notes
        this.nextAt = Math.max(this.nextAt + stepLen, now + stepLen * 0.25);  // catch up, never machine-gun
      }
      window.setTimeout(pump, 8);
    };
    pump();
  }

  private degreeAt(x: number): number {
    return Math.max(0, Math.min(COLUMNS - 1, Math.floor(x * COLUMNS)));
  }
  private rebuild(): void {
    this.order = [...new Set(this.held.values())].sort((a, b) => a - b);
    if (this.idx >= this.order.length) this.idx = 0;
    if (this.order.length === 0) this.engine.release(this.voiceId);   // lift = stop NOW, not next step
  }
  private playStep(): void {
    if (this.order.length === 0) return;
    this.idx = (this.idx + 1) % this.order.length;
    this.engine.release(this.voiceId);
    this.engine.playDegree(this.voiceId, this.order[this.idx], 0.72);
  }

  down(id: string, x: number, _y: number, _p: number): void {
    const wasIdle = this.order.length === 0;
    this.held.set(id, this.degreeAt(x));
    this.rebuild();
    if (wasIdle) this.nextAt = this.engine.ctx.currentTime;   // first touch answers immediately
  }
  move(): void { /* the chord changes by lifting/adding fingers, not sliding */ }
  up(id: string): void { this.held.delete(id); this.rebuild(); }
  panic(): void { this.held.clear(); this.order = []; this.engine.release(this.voiceId); }
  overlay(): Overlay { return { kind: "lines", orient: "v", count: COLUMNS, weight: 1 }; }   // one line per real column
  keyPos(deg: number): { x: number } {
    return { x: (Math.max(0, Math.min(COLUMNS - 1, deg)) + 0.5) / COLUMNS };
  }
  pitchSpan(): number | null { return COLUMNS; }
}
