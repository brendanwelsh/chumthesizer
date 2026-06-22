import type { Overlay } from "../instruments/instrument";
import { loopRgb } from "./loop-colors";

/** The on-surface guide drawn over the trackpad: a real piano keyboard for Keys, a labelled
 *  pad grid for Drums (corner to corner), nothing for Synth/Sample/Tombola. Updated when the
 *  instrument changes. flash(pad, loop) lights a key/cell on hit — in the LOOP's colour when a
 *  loop layer triggered it (so every layer is visible), neutral white for a live tap. */
export interface SurfaceOverlay {
  set(o: Overlay): void;
  flash(pad: number, loop?: number | null): void;
  /** light the keys/cells currently under a finger (held), clearing the rest. */
  setHeld(positions: { x: number; y: number }[]): void;
}

// classic piano: which white-key indices (mod 7) have a black key to their right
const SHARP_AFTER = new Set([0, 1, 3, 4, 5]);

export function initOverlay(root: HTMLElement): SurfaceOverlay {
  let cells: HTMLElement[] = [];
  let current: Overlay = { kind: "none" };

  const set = (o: Overlay): void => {
    current = o;
    root.innerHTML = "";
    cells = [];
    root.className = "overlay";
    if (o.kind === "lines") {
      const wrap = document.createElement("div"); wrap.className = "g-lines";
      for (let i = 0; i < o.count; i++) {
        const ln = document.createElement("div"); ln.className = "g-line " + o.orient;
        const pos = ((i + 0.5) / o.count) * 100;
        if (o.orient === "h") { ln.style.top = `${pos}%`; ln.style.height = `${o.weight}px`; }
        else { ln.style.left = `${pos}%`; ln.style.width = `${o.weight}px`; }
        wrap.append(ln);
      }
      root.append(wrap);
    } else if (o.kind === "ribbon") {
      const wrap = document.createElement("div"); wrap.className = "g-ribbon";
      const line = document.createElement("div"); line.className = "g-ribbon-line"; wrap.append(line);
      for (let i = 1; i < 8; i++) { const t = document.createElement("div"); t.className = "g-ribbon-tick"; t.style.left = `${(i / 8) * 100}%`; wrap.append(t); }
      root.append(wrap);
    } else if (o.kind === "lattice") {
      const wrap = document.createElement("div"); wrap.className = "g-lattice";
      for (let i = 1; i < 6; i++) { const v = document.createElement("div"); v.className = "g-lat v"; v.style.left = `${(i / 6) * 100}%`; wrap.append(v); }
      for (let i = 1; i < 4; i++) { const h = document.createElement("div"); h.className = "g-lat h"; h.style.top = `${(i / 4) * 100}%`; wrap.append(h); }
      root.append(wrap);
    } else if (o.kind === "valves") {
      const wrap = document.createElement("div"); wrap.className = "g-valves";
      for (let i = 0; i < 3; i++) { const c = document.createElement("div"); c.className = "g-valve"; c.style.left = `${32 + i * 18}%`; wrap.append(c); }
      root.append(wrap);
    } else if (o.kind === "wave") {
      const wrap = document.createElement("div"); wrap.className = "g-wave"; root.append(wrap);
    } else if (o.kind === "piano") {
      root.classList.add("piano-mode");
      const wrap = document.createElement("div");
      wrap.className = "piano";
      for (let i = 0; i < o.keys; i++) {
        const k = document.createElement("div");
        k.className = "pkey white";
        k.innerHTML = `<span class="pl">${escapeHtml(o.labels[i] ?? "")}</span>`;
        wrap.append(k);
        cells.push(k);
      }
      // decorative black keys at the classic positions
      for (let i = 0; i < o.keys - 1; i++) {
        if (!SHARP_AFTER.has(i % 7)) continue;
        const b = document.createElement("div");
        b.className = "pkey black";
        b.style.left = `${((i + 1) / o.keys) * 100}%`;
        b.style.width = `${(1 / o.keys) * 62}%`;
        wrap.append(b);
      }
      root.append(wrap);
    } else if (o.kind === "strings") {
      const wrap = document.createElement("div");
      wrap.className = "strings";
      for (let s = 0; s < o.strings; s++) {
        const str = document.createElement("div");
        str.className = "gstring";
        str.style.top = `${((s + 0.5) / o.strings) * 100}%`;
        str.style.height = `${1 + s * 0.6}px`;   // lower strings thicker
        wrap.append(str);
      }
      for (let f = 1; f < o.frets; f++) {
        const fr = document.createElement("div");
        fr.className = "gfret";
        fr.style.left = `${(f / o.frets) * 100}%`;
        wrap.append(fr);
      }
      root.append(wrap);
    } else if (o.kind === "grid") {
      const inset = 4;
      for (let r = 0; r < o.rows; r++) {
        for (let c = 0; c < o.cols; c++) {
          const i = r * o.cols + c;
          const cell = document.createElement("div");
          cell.className = "dcell";
          cell.style.left = `calc(${(c / o.cols) * 100}% + ${inset}px)`;
          cell.style.top = `calc(${(r / o.rows) * 100}% + ${inset}px)`;
          cell.style.width = `calc(${(1 / o.cols) * 100}% - ${inset * 2}px)`;
          cell.style.height = `calc(${(1 / o.rows) * 100}% - ${inset * 2}px)`;
          cell.innerHTML = `<span class="dl">${escapeHtml(o.labels[i] ?? "")}</span>`;
          cells.push(cell);
          root.append(cell);
        }
      }
    }
  };

  const flash = (pad: number, loop?: number | null): void => {
    const cell = cells[pad];
    if (!cell) return;
    if (loop != null) cell.style.setProperty("--fc", `rgb(${loopRgb(loop)})`);
    else cell.style.removeProperty("--fc");
    cell.classList.add(loop != null ? "flash-loop" : "flash");
    setTimeout(() => cell.classList.remove("flash", "flash-loop"), 150);
  };

  // light the key/cell under each held finger; held keys stay lit until the finger lifts
  let lit: HTMLElement[] = [];
  const setHeld = (positions: { x: number; y: number }[]): void => {
    const next: HTMLElement[] = [];
    if (current.kind === "piano") {
      for (const p of positions) { const el = cells[Math.max(0, Math.min(current.keys - 1, Math.floor(p.x * current.keys)))]; if (el) next.push(el); }
    } else if (current.kind === "grid") {
      for (const p of positions) {
        const col = Math.max(0, Math.min(current.cols - 1, Math.floor(p.x * current.cols)));
        const row = Math.max(0, Math.min(current.rows - 1, Math.floor(p.y * current.rows)));
        const el = cells[row * current.cols + col]; if (el) next.push(el);
      }
    }
    for (const el of lit) if (!next.includes(el)) el.classList.remove("held");
    for (const el of next) el.classList.add("held");
    lit = next;
  };

  return { set, flash, setHeld };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}
