import type { Overlay } from "../instruments/instrument";

/** The on-surface guide drawn over the trackpad: faint key columns for Keys, a labelled
 *  pad grid for Drums, nothing for Synth/Sample. Updated when the instrument changes.
 *  flash(pad) lights a drum cell on hit. Motion thesis: the guide is printed-on, static;
 *  only a struck pad briefly glows. */
export interface SurfaceOverlay {
  set(o: Overlay): void;
  flash(pad: number): void;
}

export function initOverlay(root: HTMLElement): SurfaceOverlay {
  let cells: HTMLElement[] = [];

  const set = (o: Overlay): void => {
    root.innerHTML = "";
    cells = [];
    if (o.kind === "keys") {
      for (let i = 1; i < o.columns; i++) {
        const ln = document.createElement("div");
        ln.className = "kcol";
        ln.style.left = `${(i / o.columns) * 100}%`;
        root.append(ln);
      }
    } else if (o.kind === "grid") {
      const inset = 6;
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

  const flash = (pad: number): void => {
    const cell = cells[pad];
    if (!cell) return;
    cell.classList.add("flash");
    setTimeout(() => cell.classList.remove("flash"), 120);
  };

  return { set, flash };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}
