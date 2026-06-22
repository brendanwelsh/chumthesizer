import type { DrumKit } from "../audio/drums";
import type { Instrument, Overlay } from "./instrument";

/** DRUMS — the WHOLE trackpad becomes a finger-drum grid (corner to corner). The grid is
 *  configurable from 1×1 up to 4×3; each cell triggers a kit sound, pressure accents.
 *
 *  Live taps route through the SEQUENCER (onLive → seq.hit), so when "Build" is armed and the
 *  groove is running, finger-drumming quantizes onto the nearest step and BUILDS a beat. Loop
 *  replay (ids like "lp3_…") just sounds the hit (never re-records) and flashes in the loop's
 *  colour, so every layer is visible no matter which instrument is active. */
function loopOf(id: string): number | null {
  const m = /^lp(\d+)_/.exec(id);
  return m ? Number(m[1]) : null;
}

export class DrumInstrument implements Instrument {
  readonly id = "drums" as const;
  readonly name = "Drums";
  private cols = 4;
  private rows = 2;

  /** onHit(pad, loop) → flash the on-surface cell (loop colour when replayed, null = live).
   *  onLive(track, pressure) → the live-play path (routed to the sequencer so taps build a beat). */
  constructor(
    private kit: DrumKit,
    private ctx: AudioContext,
    private onHit: (pad: number, loop: number | null) => void = () => {},
    private onLive: (track: number, pressure: number) => void = () => {},
  ) {}

  get gridCols(): number { return this.cols; }
  get gridRows(): number { return this.rows; }
  setGrid(cols: number, rows: number): void {
    this.cols = Math.max(1, Math.min(4, Math.round(cols)));
    this.rows = Math.max(1, Math.min(3, Math.round(rows)));
  }

  private padAt(x: number, y: number): number {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor(x * this.cols)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor(y * this.rows)));
    return r * this.cols + c;
  }
  /** more cells than kit tracks (e.g. 4×3) wrap around the 8 sounds. */
  private trackOf(pad: number): number { return pad % this.kit.padCount; }

  down(id: string, x: number, y: number, pressure: number): void {
    const pad = this.padAt(x, y);
    const track = this.trackOf(pad);
    const loop = loopOf(id);
    if (loop === null) this.onLive(track, pressure);                              // live → sequencer (builds beat)
    else this.kit.trigger(track, this.ctx.currentTime, pressure > 0.6);           // replay → just sound it
    this.onHit(pad, loop);
  }
  move(): void { /* drums fire on tap only */ }
  up(): void { /* one-shots, nothing held */ }
  panic(): void { /* one-shots, nothing held */ }
  overlay(): Overlay {
    const labels = Array.from({ length: this.cols * this.rows }, (_, i) => this.kit.soundOf(this.trackOf(i)).name);
    return { kind: "grid", cols: this.cols, rows: this.rows, labels };
  }
}
