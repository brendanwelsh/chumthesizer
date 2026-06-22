/** CHUM-1 LOOPER — a robust, OP-1-tape-style multitrack looper. You play the trackpad
 *  (any instrument); a slot captures the *note events* and replays them in sync, so you
 *  stack layers like a loop pedal. It records events (not audio) and re-fires them through
 *  the instrument RACK, so each layer keeps its own instrument + sound and stays live.
 *
 *  Robust feature set (the "build the looper part to be robust" ask):
 *   - record → playing → muted cycling per slot, plus dedicated OVERDUB (add to a live slot)
 *   - STACK any number of slots at once (independent firing)
 *   - per-slot SPEED: ½× (half-time, spans 2 bars), 1×, 2× (double-time) — all anchored to
 *     one master clock so everything re-aligns every 2 bars (true polymeter, never drifts)
 *   - global PAUSE that freezes the whole tape and resumes seamlessly
 *   - per-slot MUTE keeps its place (un-mute drops back in on the grid)
 *   - tempo-synced fixed length by default; `free` lets the first loop set the length
 *
 *  All slots share `loopStart` as the clock origin, so phase math stays drift-free. */

export type SlotState = "empty" | "recording" | "playing" | "muted";
export type LoopKind = "down" | "move" | "up";

export interface LoopEvent {
  t: number;      // position within the master loop, seconds (recorded at 1×)
  kind: LoopKind;
  key: number;    // unique per recorded note (one finger's life)
  inst: string;   // instrument id that recorded it (replay routes back to it)
  x: number;
  y: number;
  p: number;
}

/** Where the looper re-fires recorded events (the instrument rack). */
export interface LoopSink {
  fire(inst: string, kind: LoopKind, pid: string, x: number, y: number, p: number): void;
  /** apply a replayed knob/filter automation value (visual + audio, WITHOUT re-recording it). */
  onPerf?(v: number): void;
  /** a replayed dial-key press — flash the dial key `slot` in the loop's colour. */
  onDialKey?(loopIdx: number, slot: number): void;
}

/** Captures / restores the live per-voice "sound" so each layer keeps its timbre. */
export interface SoundIO {
  get(): Record<string, unknown>;
  set(s: Record<string, unknown>): void;
}

export const SPEEDS = [0.5, 1, 2] as const;

interface PerfEvent { t: number; v: number }   // knob (filter) automation: value v at master-time t

interface KeyEvent { t: number; slot: number }   // a dial sound-key press at master-time t

interface Slot {
  state: SlotState;
  events: LoopEvent[];
  perf: PerfEvent[];             // recorded knob/filter sweeps — replayed so the knob "moves" on playback
  keys: KeyEvent[];              // recorded dial-key presses — replayed as a coloured flash on the dial
  sound?: Record<string, unknown>;
  inst: string;                  // the instrument this loop was recorded with (its "type")
  speed: number;                 // 0.5 | 1 | 2
  active: Map<string, string>;   // live pid -> instrument id (to release the right instrument)
  lastPhase: number;
  overdub: boolean;              // currently overdubbing into this (already-populated) slot
}

export class Looper {
  readonly count: number;
  free = false;

  private slots: Slot[];
  private masterLen: number;
  private loopStart: number;
  private paused = false;
  private pausedAt = 0;

  private recSlot = -1;
  private recBuf: LoopEvent[] = [];
  private recActive = new Map<string, number>(); // live id -> event key
  private recInst = new Map<string, string>();   // live id -> instrument at noteOn
  private recMoveAt = new Map<string, number>(); // live id -> last recorded move time
  private recStart = 0;
  private recStopAt = 0;
  private recPerfBuf: PerfEvent[] = [];   // knob automation captured during this recording
  private recKeyBuf: KeyEvent[] = [];     // dial-key presses captured during this recording
  private keySeq = 0;

  private onChange: (i: number, s: SlotState) => void = () => {};

  constructor(
    private ctx: AudioContext,
    private bpmFn: () => number,
    private sink: LoopSink,
    count = 6,
    private soundIO: SoundIO = { get: () => ({}), set: () => {} },
    private currentInst: () => string = () => "synth",   // the active instrument, captured when a loop records
  ) {
    this.count = count;
    this.slots = Array.from({ length: count }, () => ({
      state: "empty" as SlotState,
      events: [],
      perf: [],
      keys: [],
      inst: "synth",
      speed: 1,
      active: new Map<string, string>(),
      lastPhase: 0,
      overdub: false,
    }));
    this.masterLen = this.barLen();
    this.loopStart = ctx.currentTime;
    window.setInterval(() => this.tick(), 16);
  }

  // ── queries ──
  onSlotChange(fn: (i: number, s: SlotState) => void): void { this.onChange = fn; }
  stateOf(i: number): SlotState { return this.slots[i].state; }
  /** the instrument this loop was recorded with (its "type"); empty slots report "". */
  instOf(i: number): string { return this.slots[i]?.events.length ? this.slots[i].inst : ""; }
  speedOf(i: number): number { return this.slots[i].speed; }
  hasContent(i: number): boolean { return this.slots[i]?.events.length > 0; }
  /** the per-voice sound snapshot a recorded layer plays with (for live editing after the fact). */
  soundOf(i: number): Record<string, unknown> | undefined { return this.slots[i]?.sound; }
  /** tweak a recorded layer's sound (e.g. noise / modulation) — takes effect on its next loop. */
  editSound(i: number, patch: Record<string, unknown>): void {
    const s = this.slots[i];
    if (!s || s.events.length === 0) return;
    s.sound = { ...(s.sound ?? {}), ...patch };
  }
  isPaused(): boolean { return this.paused; }
  recordingSlot(): number { return this.recSlot; }
  anyContent(): boolean { return this.slots.some((s) => s.events.length > 0); }
  /** 0..1 progress through the master loop (a shared playhead). */
  phaseNorm(): number {
    return this.masterLen > 0 ? this.masterPhase() / this.masterLen : 0;
  }
  /** 0..1 progress through one slot's own (speed-scaled) cycle. */
  slotPhaseNorm(i: number): number {
    const period = this.masterLen / this.slots[i].speed;
    return period > 0 ? (this.elapsed() % period) / period : 0;
  }

  // ── clock ──
  private barLen(): number { return (60 / this.bpmFn()) * 4 * 2; } // 2 bars
  private elapsed(): number { return (this.paused ? this.pausedAt : this.ctx.currentTime) - this.loopStart; }
  private masterPhase(): number {
    const m = this.masterLen;
    return (((this.elapsed() % m) + m) % m);
  }
  private anyActive(): boolean { return this.slots.some((s) => s.events.length > 0); }
  private set(i: number, st: SlotState): void {
    this.slots[i].state = st;
    this.onChange(i, st);
  }

  // ── live-play capture (called from the surface sink while you play) ──
  noteOn(id: string, x: number, y: number, p: number, inst: string): void {
    if (this.recSlot < 0) return;
    const key = this.keySeq++;
    this.recActive.set(id, key);
    this.recInst.set(id, inst);
    this.recMoveAt.set(id, 0);
    this.recBuf.push({ t: this.recPhase(), kind: "down", key, inst, x, y, p });
  }
  noteMove(id: string, x: number, y: number, p: number): void {
    if (this.recSlot < 0) return;
    const key = this.recActive.get(id);
    if (key === undefined) return;
    const now = this.ctx.currentTime;
    if (now - (this.recMoveAt.get(id) ?? 0) < 0.03) return; // ~33Hz cap
    this.recMoveAt.set(id, now);
    this.recBuf.push({ t: this.recPhase(), kind: "move", key, inst: this.recInst.get(id) ?? "synth", x, y, p });
  }
  noteOff(id: string): void {
    if (this.recSlot < 0) return;
    const key = this.recActive.get(id);
    if (key === undefined) return;
    const inst = this.recInst.get(id) ?? "synth";
    this.recActive.delete(id);
    this.recInst.delete(id);
    this.recMoveAt.delete(id);
    this.recBuf.push({ t: this.recPhase(), kind: "up", key, inst, x: 0, y: 0, p: 0 });
  }
  private recPhase(): number {
    return this.free ? this.ctx.currentTime - this.recStart : this.masterPhase();
  }
  /** capture a knob/filter value into the loop currently recording (called when you turn the dial). */
  recordPerf(v: number): void {
    if (this.recSlot < 0) return;
    this.recPerfBuf.push({ t: this.recPhase(), v });
  }
  /** capture a dial sound-key press into the loop currently recording. */
  recordKey(slot: number): void {
    if (this.recSlot < 0) return;
    this.recKeyBuf.push({ t: this.recPhase(), slot });
  }

  // ── slot control ──
  /** Cycle a slot: empty → record → playing → muted → playing … (overdub is a separate action). */
  toggle(i: number): void {
    if (i < 0 || i >= this.count) return;
    const st = this.slots[i].state;
    if (st === "empty") this.startRec(i, false);
    else if (st === "recording") this.stopRec();
    else if (st === "playing") this.mute(i);
    else this.unmute(i);
  }
  /** Record a slot: fresh if empty, else OVERDUB onto the existing layer. */
  record(i: number): void {
    if (i < 0 || i >= this.count) return;
    if (this.recSlot === i) { this.stopRec(); return; }
    this.startRec(i, this.slots[i].events.length > 0);
  }
  stop(): void { if (this.recSlot >= 0) this.stopRec(); }

  mute(i: number): void {
    if (this.slots[i].state !== "playing") return;
    this.releaseSlot(i);
    this.set(i, "muted");
  }
  unmute(i: number): void {
    if (this.slots[i].state !== "muted") return;
    this.slots[i].lastPhase = this.elapsed() % (this.masterLen / this.slots[i].speed); // drop in on the grid
    this.set(i, "playing");
  }
  toggleMute(i: number): void {
    const s = this.slots[i].state;
    if (s === "playing") this.mute(i);
    else if (s === "muted") this.unmute(i);
  }

  /** Cycle a slot's speed ½× → 1× → 2× → ½× (or set directly). */
  cycleSpeed(i: number): number {
    const cur = SPEEDS.indexOf(this.slots[i].speed as 0.5 | 1 | 2);
    return this.setSpeed(i, SPEEDS[(cur + 1) % SPEEDS.length]);
  }
  setSpeed(i: number, speed: number): number {
    this.releaseSlot(i); // drop held notes so nothing sticks across the tempo change
    this.slots[i].speed = speed;
    this.slots[i].lastPhase = this.elapsed() % (this.masterLen / speed);
    return speed;
  }

  clear(i: number): void {
    if (i < 0 || i >= this.count) return;
    if (this.recSlot === i) this.stopRec(true);
    this.releaseSlot(i);
    this.slots[i].events = [];
    this.slots[i].sound = undefined;
    this.slots[i].speed = 1;
    if (!this.anyActive()) this.masterLen = this.barLen();
    this.set(i, "empty");
  }
  clearAll(): void { for (let i = 0; i < this.count; i++) this.clear(i); }

  /** the loop length in seconds (one master cycle) — for building a beat loop that fills it. */
  loopLengthSec(): number { return this.anyActive() ? this.masterLen : this.barLen(); }

  /** Drop ready-made events into a slot (used to turn the drum step-pattern into a real loop layer). */
  loadEvents(slot: number, events: LoopEvent[], inst: string): void {
    if (slot < 0 || slot >= this.count || events.length === 0) return;
    if (!this.anyActive()) { this.masterLen = this.barLen(); this.loopStart = this.ctx.currentTime; }
    const s = this.slots[slot];
    this.releaseSlot(slot);
    s.events = events; s.perf = []; s.keys = []; s.sound = undefined; s.inst = inst; s.speed = 1; s.lastPhase = 0;
    this.set(slot, "playing");
  }

  /** Duplicate a recorded loop into another (empty) slot — same notes, sound, instrument, speed. */
  clone(from: number, to: number): boolean {
    const a = this.slots[from], b = this.slots[to];
    if (!a || !b || a.events.length === 0 || to === from) return false;
    this.releaseSlot(to);
    b.events = a.events.map((e) => ({ ...e }));
    b.perf = a.perf.map((e) => ({ ...e }));
    b.keys = a.keys.map((e) => ({ ...e }));
    b.sound = a.sound ? { ...a.sound } : undefined;
    b.inst = a.inst;
    b.speed = a.speed;
    b.lastPhase = this.elapsed() % (this.masterLen / b.speed);
    this.set(to, "playing");
    return true;
  }

  /** Serialize all recorded loops for saving a project to a file. */
  serialize(): unknown {
    return this.slots.map((s) => (s.events.length
      ? { events: s.events, perf: s.perf, keys: s.keys, sound: s.sound ?? null, inst: s.inst, speed: s.speed }
      : null));
  }
  /** Restore loops from a saved project (replaces current loops). */
  load(data: unknown): void {
    if (!Array.isArray(data)) return;
    for (let i = 0; i < this.count; i++) {
      this.releaseSlot(i);
      const d = data[i] as { events?: LoopEvent[]; perf?: PerfEvent[]; keys?: KeyEvent[]; sound?: Record<string, unknown> | null; inst?: string; speed?: number } | null;
      const s = this.slots[i];
      if (d && Array.isArray(d.events) && d.events.length) {
        s.events = d.events;
        s.perf = Array.isArray(d.perf) ? d.perf : [];
        s.keys = Array.isArray(d.keys) ? d.keys : [];
        s.sound = d.sound ?? undefined;
        s.inst = d.inst ?? "synth";
        s.speed = d.speed ?? 1;
        s.lastPhase = 0;
        this.set(i, "playing");
      } else {
        s.events = []; s.perf = []; s.keys = []; s.sound = undefined; s.speed = 1;
        this.set(i, "empty");
      }
    }
  }

  /** Global tape pause — freeze every loop in place; resume continues seamlessly. */
  setPaused(p: boolean): void {
    if (p === this.paused) return;
    if (p) {
      this.pausedAt = this.ctx.currentTime;
      for (let i = 0; i < this.count; i++) this.releaseSlot(i);
    } else {
      this.loopStart += this.ctx.currentTime - this.pausedAt; // shift the origin so phase is continuous
    }
    this.paused = p;
  }

  private releaseSlot(i: number): void {
    const s = this.slots[i];
    for (const [pid, inst] of s.active) this.sink.fire(inst, "up", pid, 0, 0, 0);
    s.active.clear();
  }

  private startRec(i: number, overdub: boolean): void {
    if (this.recSlot >= 0) this.stopRec();
    if (!overdub) {
      // a fresh layer; the very first loop (re)establishes the clock + length
      if (!this.anyActive()) { this.masterLen = this.barLen(); this.loopStart = this.ctx.currentTime; }
      this.slots[i].events = [];
      this.slots[i].sound = this.soundIO.get();
      this.slots[i].inst = this.currentInst();   // bind this loop to the instrument you're playing
      this.slots[i].speed = 1;
    }
    this.recSlot = i;
    this.recBuf = [];
    this.recPerfBuf = [];
    this.recKeyBuf = [];
    this.recActive.clear();
    this.recInst.clear();
    this.recMoveAt.clear();
    this.recStart = this.ctx.currentTime;
    this.recStopAt = this.ctx.currentTime + this.masterLen; // synced: auto-stop after one loop
    this.slots[i].overdub = overdub;
    this.set(i, "recording");
  }

  private stopRec(discard = false): void {
    const i = this.recSlot;
    if (i < 0) return;
    this.recSlot = -1;
    // close any notes still held so the loop never sticks on
    const endT = this.free ? this.ctx.currentTime - this.recStart : this.masterLen - 0.001;
    for (const [id, key] of this.recActive) {
      this.recBuf.push({ t: Math.max(0, endT), kind: "up", key, inst: this.recInst.get(id) ?? "synth", x: 0, y: 0, p: 0 });
    }
    this.recActive.clear();
    this.recInst.clear();
    this.recMoveAt.clear();

    if (this.free && !this.anyActive() && !discard && !this.slots[i].overdub) {
      this.masterLen = Math.max(0.25, this.ctx.currentTime - this.recStart);
      this.loopStart = this.recStart;
    }
    if (!discard) {
      if (this.slots[i].overdub) {
        this.slots[i].events = this.slots[i].events.concat(this.recBuf).sort((a, b) => a.t - b.t);
        if (this.recPerfBuf.length) this.slots[i].perf = this.slots[i].perf.concat(this.recPerfBuf).sort((a, b) => a.t - b.t);
      } else {
        this.slots[i].events = this.recBuf;
        this.slots[i].perf = this.recPerfBuf;
        this.slots[i].keys = this.recKeyBuf;
      }
      if (this.slots[i].overdub && this.recKeyBuf.length) this.slots[i].keys = this.slots[i].keys.concat(this.recKeyBuf).sort((a, b) => a.t - b.t);
      this.slots[i].lastPhase = this.elapsed() % (this.masterLen / this.slots[i].speed);
      this.set(i, this.slots[i].events.length ? "playing" : "empty");
    }
    this.recPerfBuf = [];
    this.recKeyBuf = [];
    this.slots[i].overdub = false;
    this.recBuf = [];
  }

  // ── the replay clock ──
  private tick(): void {
    if (this.paused) return;
    const now = this.ctx.currentTime;
    if (this.recSlot >= 0 && !this.free && now >= this.recStopAt) this.stopRec();

    const elapsed = now - this.loopStart;
    const live = this.soundIO.get();

    for (let i = 0; i < this.count; i++) {
      const s = this.slots[i];
      // fire when playing, OR while overdubbing so you HEAR the layer you're adding to
      const firing = s.state === "playing" || (i === this.recSlot && s.overdub && s.events.length > 0);
      if (s.events.length === 0) { s.lastPhase = 0; continue; }

      const period = this.masterLen / s.speed;
      const phase = ((elapsed % period) + period) % period;
      const prev = s.lastPhase;
      const wrapped = phase < prev;
      s.lastPhase = phase;
      if (!firing) continue;

      let applied = false;
      for (const e of s.events) {
        const fireT = e.t / s.speed; // map recorded master-time into this slot's period
        const due = wrapped ? (fireT > prev || fireT <= phase) : (fireT > prev && fireT <= phase);
        if (!due) continue;
        if (!applied && s.sound) { this.soundIO.set(s.sound); applied = true; } // this layer's timbre
        const pid = `lp${i}_${e.key}`;
        if (e.kind === "down") { this.sink.fire(e.inst, "down", pid, e.x, e.y, e.p); s.active.set(pid, e.inst); }
        else if (e.kind === "move") { this.sink.fire(e.inst, "move", pid, e.x, e.y, e.p); }
        else { this.sink.fire(e.inst, "up", pid, e.x, e.y, e.p); s.active.delete(pid); }
      }
      if (applied) this.soundIO.set(live); // restore the live sound after this layer

      // replay recorded knob/filter automation — the most recent value due this frame wins
      if (s.perf.length && this.sink.onPerf) {
        let lastV: number | null = null;
        for (const pe of s.perf) {
          const fireT = pe.t / s.speed;
          const due = wrapped ? (fireT > prev || fireT <= phase) : (fireT > prev && fireT <= phase);
          if (due) lastV = pe.v;
        }
        if (lastV !== null) this.sink.onPerf(lastV);
      }

      // replay recorded dial-key presses — flash the dial key in THIS loop's colour
      if (s.keys.length && this.sink.onDialKey) {
        for (const ke of s.keys) {
          const fireT = ke.t / s.speed;
          const due = wrapped ? (fireT > prev || fireT <= phase) : (fireT > prev && fireT <= phase);
          if (due) this.sink.onDialKey(i, ke.slot);
        }
      }
    }
  }
}
