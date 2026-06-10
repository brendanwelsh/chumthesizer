import { loopColor } from "./loop-colors";

/** A visible keyboard legend, grouped + color-coded so it reads at a glance. Toggle with `/`.
 *  Loop keys are tinted with their loop color; transport/whimsy get accent/amber. */
export interface Legend {
  toggle(): void;
  close(): void;
  isOpen(): boolean;
}

type Row = [keys: string, what: string, tint?: string];

export function initLegend(root: HTMLElement): Legend {
  const group = (title: string, rows: Row[]): string =>
    `<div class="lg-group"><div class="lg-h">${title}</div>` +
    rows.map(([k, w, t]) => `<div class="lg-row"><span class="lg-key"${t ? ` style="--k:${t}"` : ""}>${k}</span><span class="lg-what">${w}</span></div>`).join("") +
    `</div>`;

  const loopKeys = Array.from({ length: 6 }, (_, i) => `<span class="lg-key" style="--k:${loopColor(i)}">${i + 1}</span>`).join("");

  root.innerHTML =
    `<div class="lg-card">` +
    `<div class="lg-head"><span class="lg-title">Keys</span><span class="lg-hint">press / to close</span></div>` +
    `<div class="lg-cols">` +
    group("Play", [
      ["A … ;  Q … P", "play notes (the active instrument)"],
      ["Tab  ⇧Tab", "next / prev instrument"],
      ["[   ]", "octave down / up"],
    ]) +
    group("Loops", [
      [loopKeys, "record → play → mute that loop"],
      ["⇧ 1–6", "clear that loop"],
      ["⌫", "undo — clear the last loop"],
    ]) +
    group("Transport", [
      ["Space", "play / stop", "var(--accent)"],
      ["`", "record the next loop", "var(--rec)"],
      ["X", "dice — re-roll sound + groove", "var(--warn)"],
    ]) +
    group("FX", [
      ["Z   C", "filter sweep  −  /  +", "var(--accent)"],
      ["Backspace", "panic — all notes off", "var(--rec)"],
    ]) +
    `</div></div>`;

  const close = () => root.classList.remove("open");
  root.addEventListener("click", (e) => { if (e.target === root) close(); });

  return {
    toggle() { root.classList.toggle("open"); },
    close,
    isOpen() { return root.classList.contains("open"); },
  };
}
