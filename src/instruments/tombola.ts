import type { Engine } from "../audio/engine";
import type { Instrument, Overlay } from "./instrument";

/** TOMBOLA — the OP-1 toy. Tap the surface to drop bouncing note-balls into a spinning arena;
 *  every wall hit plucks a note (pitch from the hit angle). A generative, hypnotic sequencer you
 *  steer by where + how often you drop balls. It draws itself on the surface via the Visualizer's
 *  overlayPaint hook, and only runs while it's the active instrument. */
interface Ball { x: number; y: number; vx: number; vy: number; flash: number }

const CX = 0.5, CY = 0.5, R = 0.42;   // arena (normalized 0..1 surface coords)

export class TombolaInstrument implements Instrument {
  readonly id = "tombola" as const;
  readonly name = "Tombola";
  private balls: Ball[] = [];
  private angle = 0;
  private spin = 0.012;
  private seq = 0;
  private isActive = false;

  constructor(private engine: Engine) {
    window.setInterval(() => this.tick(), 16);
  }

  setActive(on: boolean): void { this.isActive = on; if (!on) this.panic(); }

  down(_id: string, x: number, y: number, p: number): void {
    if (this.balls.length > 22) this.balls.shift();
    this.balls.push({ x, y, vx: (x - CX) * 0.004, vy: -0.002 - p * 0.004, flash: 0 });
  }
  move(): void { /* balls fly free */ }
  up(): void { /* nothing held */ }
  panic(): void { this.balls = []; }
  overlay(): Overlay { return { kind: "none" }; }   // it paints itself on the canvas

  private tick(): void {
    if (!this.isActive) return;
    this.angle += this.spin;
    const G = 0.00052;
    for (const b of this.balls) {
      b.vy += G;
      b.x += b.vx; b.y += b.vy;
      if (b.flash > 0) b.flash -= 0.08;
      const dx = b.x - CX, dy = b.y - CY;
      const dist = Math.hypot(dx, dy) || 1e-6;
      if (dist > R) {
        const nx = dx / dist, ny = dy / dist;
        const dot = b.vx * nx + b.vy * ny;
        b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
        b.vx *= 0.9; b.vy *= 0.9;             // a little energy loss so it settles, not forever
        b.x = CX + nx * R; b.y = CY + ny * R; // snap back to the wall
        const ang = (Math.atan2(ny, nx) + Math.PI) / (2 * Math.PI); // 0..1 around the ring
        const degree = Math.floor(ang * 8);
        b.flash = 1;
        const id = `tomb:${this.seq++}`;
        this.engine.playDegree(id, degree, 0.45 + Math.min(0.45, dist));
        window.setTimeout(() => this.engine.release(id), 200);
      }
    }
  }

  /** Draw the spinning arena + balls onto the surface (called by the Visualizer when active). */
  paint(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cx = CX * w, cy = CY * h, rw = R * w, rh = R * h;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = this.angle + (i * Math.PI) / 3;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * rw, cy + Math.sin(a) * rh); ctx.stroke();
    }
    for (const b of this.balls) {
      const x = b.x * w, y = b.y * h, r = 5 + b.flash * 6;
      ctx.fillStyle = b.flash > 0 ? `rgba(25,182,216,${0.55 + b.flash * 0.45})` : "rgba(255,255,255,0.78)";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
