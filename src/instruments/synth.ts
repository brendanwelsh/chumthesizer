import type { Engine } from "../audio/engine";
import type { Instrument, Overlay } from "./instrument";

/** SYNTH — the original expressive ribbon. X glides continuously across the scale, Y +
 *  pressure shape dynamics/brightness. The most "instrument-like, theremin" surface. */
export class SynthInstrument implements Instrument {
  readonly id = "synth" as const;
  readonly name = "Synth";
  private active = new Set<string>();

  constructor(private engine: Engine) {}

  down(id: string, x: number, y: number, pressure: number): void {
    this.active.add(id);
    this.engine.playXY(id, x, y, pressure);
  }
  move(id: string, x: number, y: number, pressure: number): void {
    this.engine.updateXY(id, x, y, pressure);
  }
  up(id: string): void {
    this.active.delete(id);
    this.engine.release(id);
  }
  panic(): void {
    for (const id of this.active) this.engine.release(id);
    this.active.clear();
  }
  overlay(): Overlay {
    return { kind: "none" };
  }
}
