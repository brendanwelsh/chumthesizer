import type { Instrument, InstrumentId, Overlay } from "./instrument";
import type { LoopKind } from "../loop/looper";

/** The instrument RACK — holds the loaded instruments, tracks which one the live trackpad
 *  surface is playing, and routes BOTH live play (to the active instrument) and loop replay
 *  (to whichever instrument a recorded event belongs to). One choke point for the surface. */
export class InstrumentRack {
  private map = new Map<InstrumentId, Instrument>();
  private order: InstrumentId[];
  active: InstrumentId;
  private onChange: (id: InstrumentId) => void = () => {};

  constructor(insts: Instrument[]) {
    for (const i of insts) this.map.set(i.id, i);
    this.order = insts.map((i) => i.id);
    this.active = this.order[0];
  }

  list(): Instrument[] {
    return this.order.map((id) => this.map.get(id)!);
  }
  get(id: InstrumentId): Instrument | undefined {
    return this.map.get(id);
  }
  current(): Instrument {
    return this.map.get(this.active)!;
  }
  onActiveChange(fn: (id: InstrumentId) => void): void {
    this.onChange = fn;
  }
  setActive(id: InstrumentId): void {
    if (this.map.has(id) && id !== this.active) {
      this.active = id;
      this.onChange(id);
    }
  }
  cycle(dir = 1): void {
    const i = this.order.indexOf(this.active);
    const n = (i + dir + this.order.length) % this.order.length;
    this.setActive(this.order[n]);
  }

  // ── live surface play → the active instrument ──
  down(id: string, x: number, y: number, p: number): void {
    this.current().down(id, x, y, p);
  }
  move(id: string, x: number, y: number, p: number): void {
    this.current().move(id, x, y, p);
  }
  up(id: string): void {
    this.current().up(id);
  }

  // ── loop replay → the specific instrument that recorded the event ──
  fire(inst: string, kind: LoopKind, pid: string, x: number, y: number, p: number): void {
    const i = this.map.get(inst as InstrumentId);
    if (!i) return;
    if (kind === "down") i.down(pid, x, y, p);
    else if (kind === "move") i.move(pid, x, y, p);
    else i.up(pid);
  }

  panicAll(): void {
    for (const i of this.map.values()) i.panic();
  }
  overlay(): Overlay {
    return this.current().overlay();
  }
}
