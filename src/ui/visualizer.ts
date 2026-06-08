import type { Contact } from "../types";
import { params } from "../state";
import { SCALES, NOTE_NAMES, degreeToMidi } from "../audio/scales";

/** Draws the play surface: a live waveform across the back, and a glowing blob
 *  per active contact — bigger and brighter the harder you press. */
export class Visualizer {
  private ctx: CanvasRenderingContext2D;
  private wave = new Uint8Array(0);

  constructor(
    private canvas: HTMLCanvasElement,
    private analyser: AnalyserNode,
    private contacts: Map<string, Contact>,
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

    this.drawGuides(ctx, w, h);

    // back waveform
    this.analyser.getByteTimeDomainData(this.wave);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(120,170,255,0.22)";
    ctx.beginPath();
    const n = this.wave.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = h / 2 + ((this.wave[i] - 128) / 128) * (h * 0.42);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // contacts
    for (const c of this.contacts.values()) {
      const x = c.x * w;
      const y = c.y * h;
      const radius = 22 + c.pressure * 78;
      const hue = 200 + c.x * 140;
      const alpha = 0.18 + c.pressure * 0.6;

      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, `hsla(${hue}, 90%, 66%, ${alpha})`);
      g.addColorStop(1, `hsla(${hue}, 90%, 66%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `hsla(${hue}, 95%, 78%, ${0.5 + c.pressure * 0.5})`;
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
        ctx.fillStyle = "rgba(110,168,255,0.07)";
        ctx.fillRect(x0, 0, w / params.spread, h);
      }
      ctx.fillStyle = "rgba(255,255,255,0.045)";
      ctx.fillRect(x0, 0, 1, h);
      ctx.fillStyle = isRoot ? "rgba(174,203,255,0.85)" : "rgba(255,255,255,0.22)";
      ctx.fillText(NOTE_NAMES[pc], cx, h - 8);
    }
  }
}
