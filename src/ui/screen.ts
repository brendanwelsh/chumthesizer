import type { SlotState } from "../loop/looper";
import { loopColor } from "./loop-colors";

/** The reactive OP-1 screen — a small always-live LCD in the top bar. It mirrors the live
 *  state (active instrument, scale/root, tempo, loop activity, dial value) and is the one
 *  place to glance at while jamming. Read-only; driven by a getter polled each frame. */
export interface ScreenModel {
  instrument: string;
  scale: string;
  root: string;
  bpm: number;
  loops: SlotState[];
  perf: number;     // dial performance value, -1..1
  recording: boolean;
}

export function initScreen(root: HTMLElement, get: () => ScreenModel): void {
  root.innerHTML =
    '<div class="scr-l">' +
    '<div class="scr-main"></div>' +
    '<div class="scr-sub"></div>' +
    "</div>" +
    '<div class="scr-r"><div class="scr-dots"></div><div class="scr-bpm"></div></div>';
  const mainEl = root.querySelector(".scr-main") as HTMLElement;
  const subEl = root.querySelector(".scr-sub") as HTMLElement;
  const dotsEl = root.querySelector(".scr-dots") as HTMLElement;
  const bpmEl = root.querySelector(".scr-bpm") as HTMLElement;

  let last = "";
  const tick = (): void => {
    const m = get();
    const perfTxt =
      Math.abs(m.perf) < 0.04 ? "open" : m.perf < 0 ? `filter ${Math.round(-m.perf * 100)}%` : `bright ${Math.round(m.perf * 100)}%`;
    const key = `${m.instrument}|${m.scale}|${m.root}|${m.bpm}|${m.loops.join(",")}|${perfTxt}`;
    if (key !== last) {
      last = key;
      mainEl.textContent = m.instrument.toUpperCase();
      subEl.textContent = `${m.root} ${m.scale} · ${perfTxt}`;
      bpmEl.textContent = `${Math.round(m.bpm)}`;
      dotsEl.innerHTML = m.loops
        .map((s, i) => `<span class="scr-dot ${s === "playing" ? "play" : s === "recording" ? "rec" : s === "muted" ? "mute" : ""}" style="--lc:${loopColor(i)}"></span>`)
        .join("");
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
