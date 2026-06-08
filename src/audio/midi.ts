/** Optional WebMIDI output, so the instrument can double as a controller into a
 *  DAW / external synth (loopMIDI on Windows, IAC on macOS). MIDI 1.0 on one
 *  channel: note on/off with pressure-as-velocity, plus channel aftertouch.
 *  The internal Web Audio synth keeps playing too — turn its Volume down if you
 *  only want MIDI out. */
export class MidiOut {
  private access: MIDIAccess | null = null;
  private out: MIDIOutput | null = null;
  enabled = false;
  private channel = 0;
  private active = new Map<string, number>();

  /** Prompt for MIDI access (lazy — only when the user enables it). */
  async init(): Promise<MIDIOutput[]> {
    if (!navigator.requestMIDIAccess) throw new Error("WebMIDI not supported in this browser");
    if (!this.access) this.access = await navigator.requestMIDIAccess({ sysex: false });
    const outs = this.outputs();
    if (!this.out && outs.length) this.out = outs[0];
    return outs;
  }

  outputs(): MIDIOutput[] {
    return this.access ? Array.from(this.access.outputs.values()) : [];
  }

  select(id: string): void {
    this.out = this.access ? this.access.outputs.get(id) ?? null : null;
  }

  get currentId(): string | null {
    return this.out ? this.out.id : null;
  }

  noteOn(src: string, note: number, velocity: number): void {
    if (!this.enabled || !this.out) return;
    const n = note & 0x7f;
    const prev = this.active.get(src);
    if (prev !== undefined) this.out.send([0x80 | this.channel, prev, 0]);
    this.out.send([0x90 | this.channel, n, clampInt(Math.round(velocity * 127), 1, 127)]);
    this.active.set(src, n);
  }

  /** Channel aftertouch from pressure (global to the channel — fine for MIDI 1.0). */
  aftertouch(value: number): void {
    if (!this.enabled || !this.out) return;
    this.out.send([0xd0 | this.channel, clampInt(Math.round(value * 127), 0, 127)]);
  }

  noteOff(src: string): void {
    if (!this.out) return;
    const note = this.active.get(src);
    if (note === undefined) return;
    this.out.send([0x80 | this.channel, note, 0]);
    this.active.delete(src);
  }

  allOff(): void {
    if (!this.out) return;
    for (const note of this.active.values()) this.out.send([0x80 | this.channel, note, 0]);
    this.active.clear();
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
