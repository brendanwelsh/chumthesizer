import type { Contact } from "../types";
import type { Sequencer } from "../audio/sequencer";
import { params } from "../state";
import { SCALES, NOTE_NAMES, degreeToMidi } from "../audio/scales";
import { loopRgb } from "./loop-colors";

interface Ripple { x: number; y: number; age: number; light: number; rgb?: string }
interface LoopPulse { x: number; y: number; age: number; rgb: string; p: number }

// a replayed loop note rides a contact id like "lp3_42" — pull the slot index for its color
function loopOf(id: string): number | null {
  const m = /^lp(\d+)_/.exec(id);
  return m ? Number(m[1]) : null;
}

/** Draws the play surface: a live waveform across the back, and a glowing blob
 *  per active contact — bigger and brighter the harder you press. */
export class Visualizer {
  private ctx: CanvasRenderingContext2D;
  private wave = new Uint8Array(0);
  private prevIds = new Set<string>();
  private ripples: Ripple[] = [];
  private loopPulses: LoopPulse[] = [];
  private lastStep = -1;
  private pulse = 0;

  /** "Find chords" mode — draw a guide from each finger to the nearest in-scale triad. */
  chordFind: () => boolean = () => false;
  melodicActive: () => boolean = () => false;
  /** an instrument can draw its own overlay on the surface (e.g. the Tombola arena + balls). */
  overlayPaint: ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | null = null;

  /** Every loop hit (any instrument) pops a coloured pulse on the surface so you SEE all the
   *  layers playing at once — a drum loop still shows while you're playing Synth. (x,y are 0..1.) */
  loopHit(loop: number, x: number, y: number, p: number): void {
    this.loopPulses.push({ x, y, age: 0, rgb: loopRgb(loop), p });
    if (this.loopPulses.length > 80) this.loopPulses.splice(0, this.loopPulses.length - 80);
  }

  constructor(
    private canvas: HTMLCanvasElement,
    private analyser: AnalyserNode,
    private contacts: Map<string, Contact>,
    private seq: Sequencer,
    private recSlot: () => number = () => -1,   // the loop being recorded → live touches glow in its colour
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.wave = new Uint8Array(analyser.fftSize);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(r.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start(): void {
    const loop = () => {
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private draw(): void {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // beat pulse: the whole pad brightens on each downbeat
    this.updatePulse();
    if (this.pulse > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${this.pulse * 0.06})`;
      ctx.fillRect(0, 0, w, h);
    }

    this.drawGuides(ctx, w, h);

    // back waveform
    this.analyser.getByteTimeDomainData(this.wave);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    const n = this.wave.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = h / 2 + ((this.wave[i] - 128) / 128) * (h * 0.42);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // touch ripples (spawn one when a new contact appears)
    this.spawnRipples(w, h);
    this.drawRipples(ctx);

    // loop-layer pulses — every layer's hits, in its loop colour, even when its instrument is idle
    this.drawLoopPulses(ctx, w, h);

    // "find chords" — a guide from each live finger to the nearest triad
    if (this.chordFind() && this.melodicActive()) this.drawChordGuide(ctx, w, h);

    // an instrument's own surface art (Tombola arena + bouncing note-balls)
    this.overlayPaint?.(ctx, w, h);

    // contacts — replayed loop notes glow in their loop's color so you can SEE which layer is
    // playing what; your own live touches stay white/grayscale.
    for (const c of this.contacts.values()) {
      const x = c.x * w;
      const y = c.y * h;
      const radius = 22 + c.pressure * 78;
      const light = 58 + c.x * 37; // grayscale: left = dimmer, right = brighter
      const alpha = 0.2 + c.pressure * 0.6;
      const loop = loopOf(c.id);
      // replayed layer → its loop colour; a LIVE touch while recording → the armed loop's colour
      const rec = this.recSlot();
      const rgb = loop !== null ? loopRgb(loop) : rec >= 0 ? loopRgb(rec) : null;

      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, rgb ? `rgba(${rgb},${alpha})` : `hsla(0, 0%, ${light}%, ${alpha})`);
      g.addColorStop(1, rgb ? `rgba(${rgb},0)` : `hsla(0, 0%, ${light}%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = rgb
        ? `rgba(${rgb},${0.65 + c.pressure * 0.35})`
        : `hsla(0, 0%, ${Math.min(100, light + 14)}%, ${0.5 + c.pressure * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 14 + c.pressure * 16, 0, Math.PI * 2);
      ctx.stroke();
    }

  }

  /** Faint per-degree columns + note names so you can see where pitches live;
   *  the root note of the scale is highlighted. */
  private drawGuides(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const scale = SCALES[params.scaleIndex];
    const base = 48 + params.octave * 12 + params.root;
    ctx.textAlign = "center";
    ctx.font = "10px Inter, system-ui, sans-serif";
    for (let d = 0; d < params.spread; d++) {
      const x0 = (d / params.spread) * w;
      const cx = ((d + 0.5) / params.spread) * w;
      const midi = degreeToMidi(scale, base, d);
      const pc = ((midi % 12) + 12) % 12;
      const isRoot = pc === params.root;

      if (isRoot) {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(x0, 0, w / params.spread, h);
      }
      ctx.fillStyle = "rgba(255,255,255,0.045)";
      ctx.fillRect(x0, 0, 1, h);
      ctx.fillStyle = isRoot ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.22)";
      ctx.fillText(NOTE_NAMES[pc], cx, h - 8);
    }
  }

  /** For each live finger, snap to the nearest scale degree and draw the triad it implies
   *  (root + third + fifth) with a dashed line from the finger to the chord root. */
  private drawChordGuide(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const spread = Math.max(1, params.spread);
    const midY = h * 0.5;
    // persistent: a small badge + faint chord-root dots so you can SEE the mode is on, untouched
    ctx.save();
    ctx.font = "700 10px Inter, system-ui, sans-serif"; ctx.textAlign = "left";
    ctx.fillStyle = "rgba(25,182,216,0.85)";
    ctx.fillText("◇ CHORDS", 10, 18);
    for (let d = 0; d < spread; d += 2) {
      const cx = ((d + 0.5) / spread) * w;
      ctx.fillStyle = "rgba(25,182,216,0.22)";
      ctx.beginPath(); ctx.arc(cx, midY, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    for (const c of this.contacts.values()) {
      if (/^lp\d+_/.test(c.id)) continue;             // live fingers only
      const root = Math.max(0, Math.min(spread - 1, Math.round(c.x * (spread - 1))));
      const fx = c.x * w, fy = c.y * h;
      const rootX = ((root + 0.5) / spread) * w;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(25,182,216,0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(rootX, midY); ctx.stroke();
      ctx.setLineDash([]);
      for (const interval of [0, 2, 4]) {             // triad: root, third, fifth (in scale degrees)
        const d = root + interval;
        if (d >= spread) continue;
        const cx = ((d + 0.5) / spread) * w;
        ctx.fillStyle = interval === 0 ? "rgba(25,182,216,0.95)" : "rgba(25,182,216,0.5)";
        ctx.beginPath(); ctx.arc(cx, midY, interval === 0 ? 6 : 4.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  private updatePulse(): void {
    const step = this.seq.visualStep();
    if (step !== this.lastStep) {
      this.lastStep = step;
      if (step >= 0 && step % 4 === 0) this.pulse = 1;
    }
    this.pulse *= 0.9;
  }

  private spawnRipples(w: number, h: number): void {
    for (const c of this.contacts.values()) {
      if (!this.prevIds.has(c.id)) {
        const loop = loopOf(c.id);
        const rec = this.recSlot();
        const rgb = loop !== null ? loopRgb(loop) : rec >= 0 ? loopRgb(rec) : undefined;
        this.ripples.push({ x: c.x * w, y: c.y * h, age: 0, light: 65 + c.x * 33, rgb });
      }
    }
    this.prevIds.clear();
    for (const c of this.contacts.values()) this.prevIds.add(c.id);
    if (this.ripples.length > 120) this.ripples.splice(0, this.ripples.length - 120);
  }

  private drawLoopPulses(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    for (let i = this.loopPulses.length - 1; i >= 0; i--) {
      const lp = this.loopPulses[i];
      lp.age += 1;
      const t = lp.age / 26;            // life ~26 frames
      if (t >= 1) { this.loopPulses.splice(i, 1); continue; }
      const x = lp.x * w, y = lp.y * h;
      const base = 20 + lp.p * 60;
      // soft colored blob, fading
      const a = (1 - t) * (0.35 + lp.p * 0.4);
      const g = ctx.createRadialGradient(x, y, 0, x, y, base);
      g.addColorStop(0, `rgba(${lp.rgb},${a})`);
      g.addColorStop(1, `rgba(${lp.rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, base, 0, Math.PI * 2); ctx.fill();
      // expanding ring
      ctx.strokeStyle = `rgba(${lp.rgb},${(1 - t) * 0.7})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 12 + t * 46, 0, Math.PI * 2); ctx.stroke();
    }
  }

  private drawRipples(ctx: CanvasRenderingContext2D): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += 1;
      const alpha = 0.5 - r.age * 0.022;
      if (alpha <= 0) { this.ripples.splice(i, 1); continue; }
      ctx.strokeStyle = r.rgb ? `rgba(${r.rgb},${alpha})` : `hsla(0, 0%, ${r.light}%, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 16 + r.age * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
