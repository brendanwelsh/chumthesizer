import anime from "animejs";
import type { Contact } from "../types";
import type { Overlay } from "../instruments/instrument";
import { loopRgb } from "./loop-colors";
import { initShark, type SharkHandle } from "./shark";

/** GRID / MULTI view — you BUILD in the single (hero) view, then flip to this to watch the whole
 *  track PLAY at once: every instrument on screen, all the time, in one organized board. Each loop's
 *  fingerprints light up on its own instrument in that loop's colour; the live touch shows on the
 *  active instrument. Motion is choreographed by ONE clock — the cells stagger in from the centre on
 *  open, then breathe while idle and pulse together on every beat (downbeat = a bigger swell, rippling
 *  out from the middle). Built with Anime.js (grid staggers + timelines). Toggle with G / 9. */
export interface GridView {
  toggle(): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

interface Cell {
  inst: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  el: HTMLElement;
  pill: HTMLElement;
  shark: SharkHandle;     // a mini ASCII shark swimming this instrument's surface
  // last-applied visual state (only touch the DOM when it changes — no per-frame thrash)
  lit: boolean;
  active: boolean;
  glow: string;
}

interface LoopInfo { loop: number; inst: string; active: boolean }

function loopOf(id: string): number | null {
  const m = /^lp(\d+)_/.exec(id);
  return m ? Number(m[1]) : null;
}

export function initGridView(
  root: HTMLElement,
  deps: {
    contacts: Map<string, Contact>;
    instOfLoop: (loopIdx: number) => string;   // looper.instOf
    activeInst: () => string;
    instruments: { id: string; name: string }[];
    beatStep: () => number;                     // seq.visualStep(): -1 stopped, else 0..15
    loops: () => LoopInfo[];                    // every loop slot's instrument + whether it's sounding
    overlayOf: (inst: string) => Overlay;       // the instrument's REAL surface guide (mirrors the hero board)
  },
): GridView {
  root.innerHTML = "";
  root.className = "grid-view";

  let open = false;

  // ── header ───────────────────────────────────────────────────────────────
  const head = document.createElement("div");
  head.className = "gv-head";
  const back = document.createElement("button");
  back.className = "gv-back"; back.textContent = "← Back";
  back.onclick = () => setOpen(false);

  const titleWrap = document.createElement("div");
  titleWrap.className = "gv-titlewrap";
  const title = document.createElement("span"); title.className = "gv-title"; title.textContent = "All instruments";
  const sub = document.createElement("span"); sub.className = "gv-sub";
  sub.textContent = `${deps.instruments.length} voices · the whole rack, playing at once`;
  titleWrap.append(title, sub);

  // a live 4-dot beat indicator — the bar's pulse, mirrored from the sequencer
  const beat = document.createElement("div");
  beat.className = "gv-beat";
  const beatDots: HTMLElement[] = [];
  for (let i = 0; i < 4; i++) {
    const d = document.createElement("span");
    d.className = "gv-beat-dot" + (i === 0 ? " down" : "");
    beat.append(d); beatDots.push(d);
  }

  const hint = document.createElement("span"); hint.className = "gv-hint"; hint.textContent = "9 · grid · Esc";
  head.append(back, titleWrap, beat, hint);
  root.append(head);

  // ── board of cells (one per instrument) ───────────────────────────────────
  const board = document.createElement("div");
  board.className = "gv-board";
  root.append(board);

  // each contact, routed to the instrument it belongs to (loop replay → its loop's instrument,
  // live touch → the active instrument). Used by both the fingerprints and each cell's shark.
  const instOfContact = (ct: Contact, active: string): string => {
    const lp = loopOf(ct.id);
    return lp !== null ? deps.instOfLoop(lp) : active;
  };

  const cells: Cell[] = deps.instruments.map((it, i) => {
    const el = document.createElement("div");
    el.className = "gv-cell";
    el.style.setProperty("--i", String(i));          // per-cell phase offset for the idle breathe wave
    const canvas = document.createElement("canvas");
    canvas.className = "gv-canvas";
    const sharkPre = document.createElement("pre");
    sharkPre.className = "gv-shark";
    const lab = document.createElement("span");
    lab.className = "gv-label";
    lab.textContent = it.name;
    const pill = document.createElement("span");
    pill.className = "gv-pill";
    el.append(canvas, sharkPre, lab, pill);
    board.append(el);
    // a mini shark per board, chasing only the fingerprints playing on THIS instrument; asleep
    // until the grid opens (no cursor-follow — these are watch-only surfaces).
    const shark = initShark({
      shark: sharkPre,
      tank: el,
      paused: true,
      fingers: () => {
        const active = deps.activeInst();
        const out: { x: number; y: number }[] = [];
        for (const ct of deps.contacts.values()) if (instOfContact(ct, active) === it.id) out.push({ x: ct.x, y: ct.y });
        return out;
      },
    });
    return { inst: it.id, canvas, ctx: canvas.getContext("2d")!, el, pill, shark, lit: false, active: false, glow: "" };
  });
  const cellByInst = new Map(cells.map((c) => [c.inst, c]));
  const cellEls = cells.map((c) => c.el);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let entering = false;   // true during the open choreography — hold beat pulses so they can't strand a cell mid-fade

  // column count — 15 voices lay out as a balanced 5×3 (3×5 when narrow). Kept in sync with the
  // stagger grid so the "from centre" ripple stays true.
  const colsFor = (): number => {
    const w = window.innerWidth, h = window.innerHeight;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    // on a phone the CSS forces a vertical scroll-down board: 2 fat columns in
    // portrait, 4 in landscape — keep the stagger grid in sync so the "from centre"
    // ripple stays true. On desktop, JS drives the columns directly (3 narrow, 5 wide).
    const c = coarse ? (w > h ? 4 : 2) : (w < 760 ? 3 : 5);
    return Math.min(c, cells.length);
  };
  let cols = colsFor();
  const layout = (): void => {
    cols = colsFor();
    board.style.setProperty("--cols", String(cols));
  };
  layout();

  // size each canvas to its on-screen box (cells are 0×0 while display:none, so re-fit on open)
  const fit = (): void => {
    const dpr = window.devicePixelRatio || 1;
    for (const c of cells) {
      const r = c.canvas.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      c.canvas.width = Math.floor(r.width * dpr);
      c.canvas.height = Math.floor(r.height * dpr);
      c.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  };

  const rows = (): number => Math.ceil(cells.length / cols);

  // ── motion: entrance choreography (anime timeline, staggered from the centre) ──
  const entrance = (): void => {
    anime.remove([head, ...cellEls]);
    for (const el of cellEls) el.style.opacity = "";    // clear any inline opacity a pulse/close left behind
    if (reduce) { head.style.opacity = "1"; cellEls.forEach((el) => (el.style.opacity = "1")); return; }
    entering = true;
    anime.timeline({ easing: "easeOutQuad" })
      .add({ targets: head, opacity: [0, 1], translateY: [-14, 0], duration: 360 })
      .add({
        targets: cellEls,
        opacity: [0, 1],
        scale: [0.7, 1],
        duration: 540,
        easing: "easeOutBack",
        delay: anime.stagger(34, { grid: [cols, rows()], from: "center" }),
        complete: () => { entering = false; },
      }, "-=200");
    // rAF can be throttled or suspended (occluded / just-restored window) — if the entrance
    // hasn't COMPLETED by well past its full runtime, cancel it and show the board plainly,
    // so the whole grid can never sit stuck (or start late) at its invisible first keyframe.
    window.setTimeout(() => {
      if (!open || !entering) return;   // closed, or the entrance finished normally
      entering = false;
      anime.remove([head, ...cellEls]);
      head.style.opacity = "";
      for (const el of cellEls) { el.style.opacity = ""; el.style.transform = ""; }
    }, 1600);
  };

  // ── motion: one swell on every beat — a ripple out from the centre, bigger on the downbeat ──
  const pulse = (downbeat: boolean): void => {
    if (reduce || entering) return;
    anime.remove(cellEls);
    anime({
      targets: cellEls,
      scale: [1, downbeat ? 1.055 : 1.03, 1],
      duration: downbeat ? 520 : 360,
      easing: "easeOutQuad",
      delay: anime.stagger(downbeat ? 26 : 15, { grid: [cols, rows()], from: "center" }),
    });
  };

  const setOpen = (v: boolean): void => {
    if (v === open) return;
    open = v;
    root.classList.toggle("open", v);
    if (v) {
      // start exactly under the (possibly wrapped) top bar — a fixed 60px overlapped it
      const tb = document.querySelector(".topbar");
      if (tb && !window.matchMedia("(pointer: coarse)").matches) {
        root.style.top = `${Math.max(0, Math.ceil(tb.getBoundingClientRect().bottom) + 4)}px`;
      } else {
        root.style.top = "";
      }
      layout();
      requestAnimationFrame(() => {
        fit();
        for (const c of cells) { c.shark.relayout(); c.shark.setPaused(false); }   // wake the minis
        entrance();
      });
    } else {
      entering = false;
      anime.remove(cellEls);                              // drop any in-flight motion so reopening starts clean
      for (const c of cells) c.shark.setPaused(true);     // sleep the minis while hidden
    }
  };

  window.addEventListener("resize", () => { if (open) { layout(); fit(); for (const c of cells) c.shark.relayout(); } });

  // ── each cell draws its instrument's REAL surface guide (the same geometry as the hero
  //    board's overlay — piano keys, strings + frets, the live drum grid, drawbars…), so the
  //    grid is 15 truthful mini trackpads, not 15 approximations. ──
  const SHARP_AFTER = new Set([0, 1, 3, 4, 5]);   // classic piano: white keys with a black key to their right
  const line = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  const guide = (ctx: CanvasRenderingContext2D, w: number, h: number, inst: string): void => {
    const o = deps.overlayOf(inst);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    if (o.kind === "piano") {
      for (let i = 1; i < o.keys; i++) line(ctx, (i / o.keys) * w, 0, (i / o.keys) * w, h);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      for (let i = 0; i < o.keys - 1; i++) {
        if (!SHARP_AFTER.has(i % 7)) continue;
        const cx = ((i + 1) / o.keys) * w, bw = (0.62 / o.keys) * w;
        ctx.fillRect(cx - bw / 2, 0, bw, h * 0.62);
      }
    } else if (o.kind === "strings") {
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      for (let s = 0; s < o.strings; s++) {
        ctx.lineWidth = 0.8 + s * 0.35;   // lower strings thicker, like the hero
        const y = ((s + 0.5) / o.strings) * h;
        line(ctx, 0, y, w, y);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
      for (let f = 1; f < o.frets; f++) line(ctx, (f / o.frets) * w, h * 0.06, (f / o.frets) * w, h * 0.94);
    } else if (o.kind === "grid") {
      for (let c = 1; c < o.cols; c++) line(ctx, (c / o.cols) * w, 0, (c / o.cols) * w, h);
      for (let r = 1; r < o.rows; r++) line(ctx, 0, (r / o.rows) * h, w, (r / o.rows) * h);
    } else if (o.kind === "lines") {
      ctx.lineWidth = Math.max(1, o.weight * 0.75);
      for (let i = 0; i < o.count; i++) {
        const p = (i + 0.5) / o.count;
        if (o.orient === "v") line(ctx, p * w, h * 0.08, p * w, h * 0.92);
        else line(ctx, w * 0.06, p * h, w * 0.94, p * h);
      }
    } else if (o.kind === "ribbon" || o.kind === "wave") {
      line(ctx, 0, h / 2, w, h / 2);
      if (o.kind === "ribbon") for (let i = 1; i < 8; i++) line(ctx, (i / 8) * w, h * 0.42, (i / 8) * w, h * 0.58);
    } else if (o.kind === "lattice") {
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      for (let i = 1; i < 6; i++) line(ctx, (i / 6) * w, 0, (i / 6) * w, h);
      for (let i = 1; i < 4; i++) line(ctx, 0, (i / 4) * h, w, (i / 4) * h);
    } else if (o.kind === "valves") {
      for (let i = 0; i < 3; i++) {
        const cx = ((32 + i * 18) / 100) * w, r = 0.065 * w;
        ctx.beginPath(); ctx.ellipse(cx, h / 2, r, r, 0, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (inst === "tombola") {
      // tombola paints itself on the hero; here its arena outline stands in
      ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w * 0.4, h * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      line(ctx, 0, h / 2, w, h / 2);
    }
  };

  // ── per-frame: state classes + beat pulse + contact fingerprints ──────────
  let lastBeat = -2;
  const draw = (): void => {
    if (open) {
      // which instruments currently have a loop sounding → glow that cell in the loop's colour
      const litByInst = new Map<string, number>();      // inst → loop index (for colour)
      for (const lp of deps.loops()) {
        if (lp.active && lp.inst) litByInst.set(lp.inst, lp.loop);
      }
      const active = deps.activeInst();

      // apply state classes only when they change (no per-frame DOM thrash)
      for (const c of cells) {
        const loopIdx = litByInst.get(c.inst);
        const lit = loopIdx !== undefined;
        const glow = lit ? loopRgb(loopIdx!) : "";
        const isActive = c.inst === active;
        if (lit !== c.lit) { c.el.classList.toggle("lit", lit); c.lit = lit; }
        if (glow !== c.glow) { if (glow) c.el.style.setProperty("--gc", glow); else c.el.style.removeProperty("--gc"); c.glow = glow; }
        if (isActive !== c.active) { c.el.classList.toggle("active", isActive); c.active = isActive; }
        c.el.classList.remove("hot");
      }

      // beat indicator + the synchronized swell (one anime call drives every cell)
      const step = deps.beatStep();
      const q = step >= 0 ? Math.floor((step % 16) / 4) : -1;
      beatDots.forEach((d, i) => d.classList.toggle("on", i === q));
      if (step >= 0 && step % 4 === 0 && step !== lastBeat) { lastBeat = step; pulse(step % 16 === 0); }
      else if (step < 0) lastBeat = -2;

      // clear + faint guide, then route every contact to its instrument's cell
      for (const c of cells) {
        c.ctx.clearRect(0, 0, c.canvas.clientWidth, c.canvas.clientHeight);
        guide(c.ctx, c.canvas.clientWidth, c.canvas.clientHeight, c.inst);
      }
      for (const ct of deps.contacts.values()) {
        const cell = cellByInst.get(instOfContact(ct, active));
        if (!cell) continue;
        const lp = loopOf(ct.id);
        cell.el.classList.add("hot");
        const w = cell.canvas.clientWidth, h = cell.canvas.clientHeight;
        const x = ct.x * w, y = ct.y * h;
        const rgb = lp !== null ? loopRgb(lp) : "230,232,238";
        const r = 10 + ct.pressure * 30;
        const g = cell.ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${rgb},${0.5 + ct.pressure * 0.45})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        cell.ctx.fillStyle = g;
        cell.ctx.beginPath(); cell.ctx.arc(x, y, r, 0, Math.PI * 2); cell.ctx.fill();
        cell.ctx.strokeStyle = `rgba(${rgb},0.9)`; cell.ctx.lineWidth = 2;
        cell.ctx.beginPath(); cell.ctx.arc(x, y, 6 + ct.pressure * 8, 0, Math.PI * 2); cell.ctx.stroke();
      }
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  return {
    toggle() { setOpen(!open); },
    open() { setOpen(true); },
    close() { setOpen(false); },
    isOpen() { return open; },
  };
}
