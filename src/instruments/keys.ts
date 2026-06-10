import type { Engine } from "../audio/engine";
import type { Instrument, Overlay } from "./instrument";

/** KEYS — the trackpad becomes a quantized scale keyboard, like the drum grid but melodic.
 *  X is split into `COLUMNS` key-cells (each a scale degree); pressing a cell strikes that
 *  note. Sliding across cells glissandos (re-strikes) — a fun ribbon-piano. Y is free head-
 *  room; pressure = velocity. Notes are struck, not bent (that's what Synth is for). */
const COLUMNS = 15; // ~2 octaves of a pentatonic across the pad

export class KeysInstrument implements Instrument {
  readonly id = "keys" as const;
  readonly name = "Keys";
  private active = new Map<string, number>(); // finger id -> degree currently held

  constructor(private engine: Engine) {}

  private degreeAt(x: number): number {
    return Math.max(0, Math.min(COLUMNS - 1, Math.floor(x * COLUMNS)));
  }

  down(id: string, x: number, _y: number, pressure: number): void {
    const d = this.degreeAt(x);
    this.active.set(id, d);
    this.engine.playDegree(id, d, pressure);
  }
  // KEYS are STRUCK, not slid — once a key sounds it holds that pitch; sliding does nothing
  // (lift + press for a new note). This is what makes Keys clean + punchy and distinct from the
  // Synth ribbon, and it stops the glissando voice-pileup that caused the never-ending "whaw".
  move(): void { /* struck: no re-trigger, no slide */ }
  up(id: string): void {
    this.active.delete(id);
    this.engine.release(id);
  }
  panic(): void {
    for (const id of this.active.keys()) this.engine.release(id);
    this.active.clear();
  }
  overlay(): Overlay {
    return { kind: "keys", columns: COLUMNS };
  }
}
