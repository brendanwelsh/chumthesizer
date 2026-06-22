import type { Sampler } from "../audio/sampler";
import type { Instrument, Overlay } from "./instrument";

/** SAMPLE — the mic Sampler as a trackpad instrument: your recorded clip, pitched across
 *  X like the Synth ribbon. Only sounds once a clip has been recorded (Settings → Mic). */
export class SamplerInstrument implements Instrument {
  readonly id = "sampler" as const;
  readonly name = "Sample";
  private active = new Set<string>();

  constructor(private sampler: Sampler) {}

  down(id: string, x: number, y: number, pressure: number): void {
    if (!this.sampler.hasSample()) return;
    this.active.add(id);
    if (this.sampler.slices > 0) this.sampler.playSlice(id, Math.floor(x * this.sampler.slices), pressure);
    else this.sampler.play(id, x, y, pressure);   // pitched across X
  }
  move(id: string, x: number, y: number, pressure: number): void {
    if (this.sampler.slices <= 0) this.sampler.update(id, x, y, pressure);   // slices are struck, no slide
  }
  up(id: string): void {
    this.active.delete(id);
    this.sampler.release(id);
  }
  panic(): void {
    for (const id of this.active) this.sampler.release(id);
    this.active.clear();
  }
  overlay(): Overlay {
    const n = this.sampler.slices;
    if (n > 0) return { kind: "grid", cols: n, rows: 1, labels: Array.from({ length: n }, (_, i) => String(i + 1)) };
    return { kind: "wave" };   // un-sliced: a faint waveform baseline (distinct from synth's ribbon)
  }
}
