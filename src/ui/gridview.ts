import anime from "animejs";
import type { Contact } from "../types";
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
    const c = window.innerWidth < 760 ? 3 : 5;
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

  // ── faint per-instrument surface guide so a cell never looks blank ─────────
  const guide = (ctx: CanvasRenderingContext2D, w: number, h: number, inst: string): void => {
    ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 1;
    if (inst === "keys" || inst === "pluck") {
      for (let i = 1; i < 8; i++) { const x = (i / 8) * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    } else if (inst === "bass" || inst === "guitar") {
      const n = inst === "bass" ? 4 : 6;
      for (let i = 0; i < n; i++) { const y = ((i + 0.5) / n) * h; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    } else if (inst === "drums") {
      for (let i = 1; i < 4; i++) { const x = (i / 4) * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    } else if (inst === "tombola") {
      ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w * 0.4, h * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();   // synth/pad/sample: a ribbon line
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
