import type { Engine } from "../audio/engine";
import type { Instrument, InstrumentId, Overlay } from "./instrument";
import { NOTE_NAMES } from "../audio/scales";
import { params } from "../state";

/** A melodic engine instrument played from the trackpad. One class covers the family:
 *   - Synth  : continuous ribbon (X glides), no overlay — the expressive theremin.
 *   - Keys   : struck notes on a real piano keyboard overlay.
 *   - Bass   : ribbon, low + fat (its sound preset carries the octave/timbre).
 *   - Guitar : struck, plucky, on the piano overlay.
 *  The character of each comes from its per-instrument SOUND (main.ts swaps params on activate),
 *  so each "pad" remembers its own timbre. */
export class MelodicInstrument implements Instrument {
  private activeIds = new Set<string>();
  private lastDeg = new Map<string, number>();   // struck: the key/string each finger last sounded (for drag re-pluck)

  constructor(
    private engine: Engine,
    readonly id: InstrumentId,
    readonly name: string,
    private struck: boolean,
    private guide: string,        // "piano" | "strings" | "ribbon" | "lattice" | "valves" | "lines-v" | "lines-h" | "none"
    private n = 14,               // overlay count (keys / strings / lines)
    private weight = 1,           // overlay line weight
  ) {}

  /** How many distinct pitch zones the surface offers. Column-style guides (piano keys,
   *  drawbar columns) play exactly what they DRAW — so Organ's 9 drawbars are 9 zones, not
   *  14 invisible ones. Continuous guides follow the engine's spread. */
  private degreeCount(): number {
    if (this.guide === "piano" || this.guide === "lines-v") return this.n;
    return this.struck ? 14 : params.spread;
  }

  private degreeAt(x: number): number {
    const n = this.degreeCount();
    return Math.max(0, Math.min(n - 1, Math.floor(x * n)));
  }

  // For the "strings" instruments (Guitar = 6, Bass = 4): you actually PLUCK a string. Y picks the
  // string (top = highest), X is the fret along it. Strings are stacked a third apart and overlap, so
  // you can play a melody up one string, a chord across several, or strum down the neck.
  private FRETS = 7;
  private stringDegree(x: number, y: number): number {
    const n = this.n;
    const fromTop = Math.max(0, Math.min(n - 1, Math.floor(y * n)));
    const fromBottom = n - 1 - fromTop;                                   // top string = highest pitch
    const fret = Math.max(0, Math.min(this.FRETS - 1, Math.floor(x * this.FRETS)));
    return fromBottom * 2 + fret;
  }

  down(id: string, x: number, y: number, pressure: number): void {
    this.activeIds.add(id);
    if (this.guide === "strings") { const d = this.stringDegree(x, y); this.lastDeg.set(id, d); this.engine.playDegree(id, d, pressure); }
    else if (this.struck) { const d = this.degreeAt(x); this.lastDeg.set(id, d); this.engine.playDegree(id, d, pressure); }
    else this.engine.playXY(id, x, y, pressure);
  }
  move(id: string, x: number, y: number, pressure: number): void {
    // ribbon / bands (non-struck): the note glides to follow your finger (theremin).
    if (!this.struck) { this.engine.updateXY(id, x, y, pressure); return; }
    // struck keys / strings: dragging onto a NEW key or string re-plucks it there — that's a
    // keyboard glissando, and on guitar/bass it's how you STRUM (drag across the strings).
    const d = this.guide === "strings" ? this.stringDegree(x, y) : this.degreeAt(x);
    if (this.lastDeg.get(id) === d) { this.engine.setPressureFor(id, pressure); return; }   // same key — just track dynamics
    this.lastDeg.set(id, d);
    this.engine.playDegree(id, d, pressure);   // re-fire at the new pitch (playDegree releases the old voice for this id first)
  }
  up(id: string): void {
    this.activeIds.delete(id);
    this.lastDeg.delete(id);
    this.engine.release(id);
  }
  panic(): void {
    for (const id of this.activeIds) this.engine.release(id);
    this.activeIds.clear();
  }
  keyPos(deg: number): { x: number; y?: number } {
    if (this.guide === "strings") {
      // pick the string (Y) + fret (X) that sound this degree — never the expression level
      const n = this.n;
      const fromBottom = Math.max(0, Math.min(n - 1, Math.floor(deg / 2)));
      const fret = Math.max(0, Math.min(this.FRETS - 1, deg - fromBottom * 2));
      return { x: (fret + 0.5) / this.FRETS, y: (n - 1 - fromBottom + 0.5) / n };
    }
    const count = this.degreeCount();
    return { x: (Math.max(0, Math.min(count - 1, deg)) + 0.5) / count };
  }
  pitchSpan(): number | null {
    return this.guide === "strings" ? null : this.degreeCount();   // frets aren't a left-to-right pitch ruler
  }
  overlay(): Overlay {
    switch (this.guide) {
      case "piano": {
        const labels = Array.from({ length: this.n }, (_, d) => NOTE_NAMES[((this.engine.noteForDegree(d) % 12) + 12) % 12]);
        return { kind: "piano", keys: this.n, labels };
      }
      case "strings": return { kind: "strings", strings: this.n, frets: this.FRETS };   // draw the frets that actually exist
      case "lines-v": return { kind: "lines", orient: "v", count: this.n, weight: this.weight };
      case "lines-h": return { kind: "lines", orient: "h", count: this.n, weight: this.weight };
      case "ribbon": return { kind: "ribbon" };
      case "lattice": return { kind: "lattice" };
      case "valves": return { kind: "valves" };
      default: return { kind: "none" };
    }
  }
}
