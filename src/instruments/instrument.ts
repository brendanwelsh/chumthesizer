/** An *instrument* interprets the trackpad surface (x, y, pressure per finger) its own
 *  way and plays the shared audio engine. CHUM-1's headline: the one Magic-Trackpad
 *  surface becomes many instruments — a continuous Synth ribbon, a quantized Keys board,
 *  a Drums pad grid, a pitched mic Sampler — switchable live, and each is loopable.
 *
 *  The same Contact stream feeds (a) the live active instrument and (b) loop replay, which
 *  re-fires recorded events through whichever instrument recorded them. Keep these methods
 *  cheap + idempotent; ids are unique per finger (live) or per loop-note (replay). */

export type InstrumentId = "synth" | "keys" | "drums" | "sampler";

/** How to draw the on-surface guide for this instrument (key columns / pad grid / nothing). */
export type Overlay =
  | { kind: "none" }
  | { kind: "keys"; columns: number }            // vertical key columns across the pad
  | { kind: "grid"; cols: number; rows: number; labels: string[] }; // a pad grid

export interface Instrument {
  readonly id: InstrumentId;
  readonly name: string;
  /** a finger landed */
  down(id: string, x: number, y: number, pressure: number): void;
  /** a finger moved while held */
  move(id: string, x: number, y: number, pressure: number): void;
  /** a finger lifted */
  up(id: string): void;
  /** drop everything this instrument is sounding (its own ids only) */
  panic(): void;
  /** the surface guide to render for this instrument */
  overlay(): Overlay;
}
