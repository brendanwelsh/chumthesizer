/** Synthesized drum voices, 808-flavored — no samples. Sounds are
 *  organized into a small **library** grouped by category (Kick, Snare, Hat, Clap,
 *  Tom, Perc, FX) with **variants** in each. Every pad/track holds an *assignment*
 *  into that library, so you build a kit by dragging sounds onto pads — the
 *  sequencer just plays whatever each pad holds. */

export interface DrumSound {
  id: number;
  cat: string;
  name: string;
  icon: string;
}

interface Voice {
  synth: string;
  a?: number;
  b?: number;
  c?: number;
}

// category glyphs (monochrome)
const LIB: { cat: string; name: string; icon: string; v: Voice }[] = [
  { cat: "Kick",  name: "Kick A",  icon: "●", v: { synth: "kick", a: 140, b: 42, c: 0.5 } },
  { cat: "Kick",  name: "Kick B",  icon: "●", v: { synth: "kick", a: 160, b: 46, c: 0.32 } },
  { cat: "Kick",  name: "808",     icon: "⬤", v: { synth: "kick", a: 100, b: 30, c: 0.85 } },
  { cat: "Snare", name: "Snare A", icon: "▦", v: { synth: "snare", a: 185, b: 0.18, c: 0.12 } },
  { cat: "Snare", name: "Snare B", icon: "▦", v: { synth: "snare", a: 150, b: 0.26, c: 0.16 } },
  { cat: "Snare", name: "Rim",     icon: "▪", v: { synth: "rim", a: 1700 } },
  { cat: "Hat",   name: "Hat A",   icon: "▴", v: { synth: "hat", a: 0.045, b: 0.5 } },
  { cat: "Hat",   name: "Open",    icon: "▵", v: { synth: "hat", a: 0.32, b: 0.45 } },
  { cat: "Hat",   name: "Pedal",   icon: "˅", v: { synth: "hat", a: 0.025, b: 0.5 } },
  { cat: "Clap",  name: "Clap A",  icon: "✦", v: { synth: "clap", a: 4 } },
  { cat: "Clap",  name: "Clap B",  icon: "✧", v: { synth: "clap", a: 2 } },
  { cat: "Tom",   name: "Tom Lo",  icon: "◐", v: { synth: "tom", a: 150 } },
  { cat: "Tom",   name: "Tom Mid", icon: "◑", v: { synth: "tom", a: 220 } },
  { cat: "Tom",   name: "Tom Hi",  icon: "◒", v: { synth: "tom", a: 300 } },
  { cat: "Perc",  name: "Cowbell", icon: "▭", v: { synth: "cowbell" } },
  { cat: "Perc",  name: "Clave",   icon: "✚", v: { synth: "clave" } },
  { cat: "Perc",  name: "Shaker",  icon: "≋", v: { synth: "shaker" } },
  { cat: "Perc",  name: "Conga",   icon: "◔", v: { synth: "conga", a: 260 } },
  { cat: "FX",    name: "Zap",     icon: "↯", v: { synth: "zap" } },
  { cat: "FX",    name: "Blip",    icon: "·", v: { synth: "blip" } },
];

export const DRUM_SOUNDS: DrumSound[] = LIB.map((s, i) => ({ id: i, cat: s.cat, name: s.name, icon: s.icon }));

/** Category order for the palette UI (preserves first-seen order). */
export const DRUM_CATEGORIES: string[] = [...new Set(LIB.map((s) => s.cat))];

/** Selectable drum kits — options are always better. Each is 8 pad assignments (ids into
 *  DRUM_SOUNDS); the sequencer + finger pads play whatever each pad holds. Switch in the Drums panel. */
export const KITS: { name: string; pads: number[] }[] = [
  { name: "808 Trap",  pads: [2, 9, 6, 7, 3, 1, 16, 5] },   // deep 808, clap, crisp hats — the default
  { name: "Boom Bap",  pads: [0, 3, 6, 7, 9, 5, 11, 16] },  // classic hip-hop kick/snare
  { name: "House",     pads: [0, 9, 6, 7, 10, 14, 16, 15] }, // four-on-the-floor, cowbell + clave
  { name: "Lo-Fi",     pads: [1, 4, 8, 6, 5, 17, 16, 15] },  // soft kick, pedal hat, conga
  { name: "Pop",       pads: [0, 3, 6, 7, 9, 11, 12, 13] },  // clean kit + full tom fills
  { name: "Tribal",    pads: [2, 11, 12, 13, 17, 14, 15, 16] }, // toms + congas + perc
  { name: "Glitch FX", pads: [2, 18, 19, 6, 9, 15, 5, 16] }, // zaps, blips, weird
  { name: "Balkan",    pads: [1, 11, 12, 13, 17, 15, 16, 14] }, // Beirut-ish hand percussion: toms, conga, clave, shaker, cowbell
];

/** Default 8-pad kit = the first kit (808 Trap). */
export const DEFAULT_KIT = KITS[0].pads;

/** Back-compat: names of the default kit. */
export const DRUM_NAMES = DEFAULT_KIT.map((id) => DRUM_SOUNDS[id].name);

export class DrumKit {
  private noise: AudioBuffer;
  /** pad index → DRUM_SOUNDS id. */
  assignment: number[];

  constructor(private ctx: AudioContext, private dest: AudioNode, pads = 8) {
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.assignment = Array.from({ length: pads }, (_, i) => DEFAULT_KIT[i] ?? 0);
  }

  /** how many pads/tracks this kit holds (= sequencer tracks). */
  get padCount(): number { return this.assignment.length; }

  /** total hits triggered — a read-only counter for self-tests (how many drum voices have fired). */
  hitCount = 0;

  trigger(pad: number, time: number, accent = false): void {
    this.hitCount++;
    this.play(this.assignment[pad] ?? 0, time, accent ? 1.3 : 1);
  }

  audition(soundId: number): void {
    void this.ctx.resume();
    this.play(soundId, this.ctx.currentTime, 1);
  }

  // ── pad ↔ sound assignment ───────────────────────────────────────────────
  soundOf(pad: number): DrumSound {
    return DRUM_SOUNDS[this.assignment[pad]] ?? DRUM_SOUNDS[0];
  }
  assign(pad: number, soundId: number): void {
    if (pad >= 0 && pad < this.assignment.length && DRUM_SOUNDS[soundId]) this.assignment[pad] = soundId;
  }
  swap(a: number, b: number): void {
    const t = this.assignment[a];
    this.assignment[a] = this.assignment[b];
    this.assignment[b] = t;
  }
  getAssignment(): number[] {
    return this.assignment.slice();
  }
  setAssignment(arr: unknown): void {
    if (!Array.isArray(arr) || arr.length !== this.assignment.length) return;
    if (!arr.every((n) => Number.isInteger(n) && DRUM_SOUNDS[n as number])) return;
    this.assignment = (arr as number[]).slice();
  }

  // ── dispatch ───────────────────────────────────────────────────────────────
  private play(soundId: number, time: number, g: number): void {
    const v = LIB[soundId]?.v;
    if (!v) return;
    switch (v.synth) {
      case "kick": this.kick(time, g, v.a!, v.b!, v.c!); break;
      case "snare": this.snare(time, g, v.a!, v.b!, v.c!); break;
      case "hat": this.hat(time, v.a!, v.b! * g); break;
      case "clap": this.clap(time, g, v.a!); break;
      case "tom": this.tom(time, g, v.a!); break;
      case "rim": this.rim(time, g, v.a!); break;
      case "cowbell": this.cowbell(time, g); break;
      case "clave": this.clave(time, g); break;
      case "shaker": this.shaker(time, g); break;
      case "conga": this.conga(time, g, v.a!); break;
      case "zap": this.zap(time, g); break;
      case "blip": this.blip(time, g); break;
    }
  }

  private env(time: number, peak: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    g.connect(this.dest);
    return g;
  }

  private noiseSource(): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    return s;
  }

  private kick(time: number, g: number, f0: number, f1: number, decay: number): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(f0, time);
    osc.frequency.exponentialRampToValueAtTime(f1, time + 0.11);
    const amp = this.env(time, 0.95 * g, decay);
    osc.connect(amp);
    osc.start(time);
    osc.stop(time + decay + 0.05);
  }

  private snare(time: number, g: number, toneF: number, nDecay: number, tDecay: number): void {
    const n = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1400;
    const namp = this.env(time, 0.6 * g, nDecay);
    n.connect(hp).connect(namp);
    n.start(time);
    n.stop(time + nDecay + 0.05);

    const tone = this.ctx.createOscillator();
    tone.type = "triangle";
    tone.frequency.value = toneF;
    const tamp = this.env(time, 0.4 * g, tDecay);
    tone.connect(tamp);
    tone.start(time);
    tone.stop(time + tDecay + 0.02);
  }

  private hat(time: number, decay: number, peak: number): void {
    const n = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7200;
    const amp = this.env(time, peak, decay);
    n.connect(hp).connect(amp);
    n.start(time);
    n.stop(time + decay + 0.02);
  }

  private clap(time: number, g: number, taps: number): void {
    const hp = this.ctx.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.value = 1200;
    hp.Q.value = 1.2;
    hp.connect(this.dest);
    for (const off of [0, 0.012, 0.024, 0.04].slice(0, taps)) {
      const n = this.noiseSource();
      const amp = this.ctx.createGain();
      const t = time + off;
      amp.gain.setValueAtTime(0.5 * g, t);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      n.connect(amp).connect(hp);
      n.start(t);
      n.stop(t + 0.1);
    }
  }

  private tom(time: number, g: number, f0: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, time);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.42, time + 0.18);
    const amp = this.env(time, 0.7 * g, 0.3);
    osc.connect(amp);
    osc.start(time);
    osc.stop(time + 0.33);
  }

  private rim(time: number, g: number, f: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = f;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = 6;
    const amp = this.env(time, 0.5 * g, 0.04);
    osc.connect(bp).connect(amp);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  private cowbell(time: number, g: number): void {
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 620;
    bp.Q.value = 3;
    const amp = this.env(time, 0.4 * g, 0.22);
    bp.connect(amp);
    for (const f of [540, 800]) {
      const osc = this.ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = f;
      osc.connect(bp);
      osc.start(time);
      osc.stop(time + 0.25);
    }
  }

  private clave(time: number, g: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 2500;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2500;
    bp.Q.value = 8;
    const amp = this.env(time, 0.5 * g, 0.05);
    osc.connect(bp).connect(amp);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  private shaker(time: number, g: number): void {
    const n = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6000;
    const amp = this.env(time, 0.35 * g, 0.06);
    n.connect(hp).connect(amp);
    n.start(time);
    n.stop(time + 0.08);
  }

  private conga(time: number, g: number, f0: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, time);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.7, time + 0.1);
    const amp = this.env(time, 0.6 * g, 0.16);
    osc.connect(amp);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  private zap(time: number, g: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1800, time);
    osc.frequency.exponentialRampToValueAtTime(120, time + 0.14);
    const amp = this.env(time, 0.5 * g, 0.16);
    osc.connect(amp);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  private blip(time: number, g: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 880;
    const amp = this.env(time, 0.4 * g, 0.05);
    osc.connect(amp);
    osc.start(time);
    osc.stop(time + 0.06);
  }
}
