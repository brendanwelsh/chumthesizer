import type { DrumKit } from "../audio/drums";
import type { Instrument, Overlay } from "./instrument";

/** DRUMS — the trackpad becomes a finger-drum pad grid (4×2 = 8 cells). A tap in a cell
 *  triggers that pad's drum sound; pressure accents. This is the loopable trackpad drum
 *  surface (separate from the step-sequencer in DRUMS mode). */
const COLS = 4;
const ROWS = 2;

export class DrumInstrument implements Instrument {
  readonly id = "drums" as const;
  readonly name = "Drums";

  /** onHit(pad) lets the UI flash the on-surface grid cell. */
  constructor(
    private kit: DrumKit,
    private ctx: AudioContext,
    private onHit: (pad: number) => void = () => {},
  ) {}

  padAt(x: number, y: number): number {
    const c = Math.max(0, Math.min(COLS - 1, Math.floor(x * COLS)));
    const r = Math.max(0, Math.min(ROWS - 1, Math.floor(y * ROWS)));
    return r * COLS + c;
  }

  down(_id: string, x: number, y: number, pressure: number): void {
    const pad = this.padAt(x, y);
    this.kit.trigger(pad, this.ctx.currentTime, pressure > 0.6);
    this.onHit(pad);
  }
  move(): void { /* drums fire on tap only */ }
  up(): void { /* nothing to release */ }
  panic(): void { /* one-shots, nothing held */ }
  overlay(): Overlay {
    const labels = Array.from({ length: COLS * ROWS }, (_, i) => this.kit.soundOf(i).name);
    return { kind: "grid", cols: COLS, rows: ROWS, labels };
  }
}
