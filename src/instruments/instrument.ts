/** An *instrument* interprets the trackpad surface (x, y, pressure per finger) its own
 *  way and plays the shared audio engine. The headline: the one Magic-Trackpad
 *  surface becomes many instruments — a continuous Synth ribbon, a quantized Keys board,
 *  a Drums pad grid, a pitched mic Sampler — switchable live, and each is loopable.
 *
 *  The same Contact stream feeds (a) the live active instrument and (b) loop replay, which
 *  re-fires recorded events through whichever instrument recorded them. Keep these methods
 *  cheap + idempotent; ids are unique per finger (live) or per loop-note (replay). */

export type InstrumentId = "synth" | "keys" | "bass" | "guitar" | "pluck" | "pad" | "fm" | "drums" | "sampler" | "tombola" | "organ" | "strings" | "arp" | "brass" | "bells";

/** How to draw the on-surface guide for this instrument. Every instrument gets a DISTINCT one;
 *  they render faint + dark (a backdrop behind your fingerprints), see styles.css. */
export type Overlay =
  | { kind: "none" }
  | { kind: "piano"; keys: number; labels: string[] }    // keys — white + black piano keys
  | { kind: "strings"; strings: number; frets: number }  // bass / guitar — plucked strings
  | { kind: "grid"; cols: number; rows: number; labels: string[] }  // drums / sampler slices
  | { kind: "lines"; orient: "h" | "v"; count: number; weight: number }  // organ drawbars · pad bands · arp steps · pluck columns · strings-bows
  | { kind: "ribbon" }    // synth — a pitch ribbon (centre line + degree ticks)
  | { kind: "lattice" }   // fm — a faint cross-grid
  | { kind: "valves" }    // brass — three valve circles
  | { kind: "wave" };     // sampler (un-sliced) — a faint waveform baseline

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
