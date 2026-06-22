import type { Engine } from "../audio/engine";
import type { Instrument, InstrumentId, Overlay } from "./instrument";
import { NOTE_NAMES } from "../audio/scales";

/** A melodic engine instrument played from the trackpad. One class covers the family:
 *   - Synth  : continuous ribbon (X glides), no overlay — the expressive theremin.
 *   - Keys   : struck notes on a real piano keyboard overlay.
 *   - Bass   : ribbon, low + fat (its sound preset carries the octave/timbre).
 *   - Guitar : struck, plucky, on the piano overlay.
 *  The character of each comes from its per-instrument SOUND (main.ts swaps params on activate),
 *  so each "pad" remembers its own timbre. */
export class MelodicInstrument implements Instrument {
  private activeIds = new Set<string>();

  constructor(
    private engine: Engine,
    readonly id: InstrumentId,
    readonly name: string,
    private struck: boolean,
    private guide: string,        // "piano" | "strings" | "ribbon" | "lattice" | "valves" | "lines-v" | "lines-h" | "none"
    private n = 14,               // overlay count (keys / strings / lines)
    private weight = 1,           // overlay line weight
  ) {}

  private degreeAt(x: number): number {
    return Math.max(0, Math.min(13, Math.floor(x * 14)));
  }

  down(id: string, x: number, y: number, pressure: number): void {
    this.activeIds.add(id);
    if (this.struck) this.engine.playDegree(id, this.degreeAt(x), pressure);
    else this.engine.playXY(id, x, y, pressure);
  }
  move(id: string, x: number, y: number, pressure: number): void {
    if (!this.struck) this.engine.updateXY(id, x, y, pressure);   // struck = no slide (clean, no glissando pile-up)
  }
  up(id: string): void {
    this.activeIds.delete(id);
    this.engine.release(id);
  }
  panic(): void {
    for (const id of this.activeIds) this.engine.release(id);
    this.activeIds.clear();
  }
  overlay(): Overlay {
    switch (this.guide) {
      case "piano": {
        const labels = Array.from({ length: this.n }, (_, d) => NOTE_NAMES[((this.engine.noteForDegree(d) % 12) + 12) % 12]);
        return { kind: "piano", keys: this.n, labels };
      }
      case "strings": return { kind: "strings", strings: this.n, frets: 12 };
      case "lines-v": return { kind: "lines", orient: "v", count: this.n, weight: this.weight };
      case "lines-h": return { kind: "lines", orient: "h", count: this.n, weight: this.weight };
      case "ribbon": return { kind: "ribbon" };
      case "lattice": return { kind: "lattice" };
      case "valves": return { kind: "valves" };
      default: return { kind: "none" };
    }
  }
}
