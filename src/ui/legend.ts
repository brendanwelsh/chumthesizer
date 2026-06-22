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

  const loopKeys = Array.from({ length: 8 }, (_, i) => `<span class="lg-key" style="--k:${loopColor(i)}">${i + 1}</span>`).join("");

  root.innerHTML =
    `<div class="lg-card">` +
    `<div class="lg-head"><span class="lg-title">chumthesizer — keys</span><span class="lg-hint">press / to close</span></div>` +
    `<div class="lg-cols">` +
    group("Instruments", [
      ["F1 … F9", "Synth Keys Bass Guitar Pluck Pad FM Drums Sample", "var(--accent)"],
      ["Tab  ⇧Tab", "cycle instruments (Tombola = Tab)"],
      ["9", "grid view — all instruments at once"],
      ["0", "find-chords guide"],
    ]) +
    group("Play", [
      ["A … ;   Q … P", "play notes — hold several at once for a chord"],
      ["↑   ↓", "louder / softer (keyboard dynamics)"],
      ["pad ↕", "drag up = loud/bright, down = soft/dark"],
      ["[   ]", "octave  −  /  +"],
      [",   .", "scale  −  /  +"],
      ["-   =", "key (root)  −  /  +"],
    ]) +
    group("Chords (no trackpad needed)", [
      ["hold A … P", "hold several note keys = a chord"],
      ["CHORD button", "one note / click plays a full chord"],
      ["LATCH button", "notes sustain — stack a chord with one mouse, toggle off to release"],
    ]) +
    group("Loops", [
      [loopKeys, "record → play → mute  (+ jump to its instrument)"],
      ["⇧ 1–6", "clear that loop"],
      ["`", "record the next empty loop", "var(--rec)"],
      ["Del", "clear the last loop"],
      ["'", "clone the focused loop"],
    ]) +
    group("Transport", [
      ["Space", "play / stop", "var(--accent)"],
      ["X", "dice — re-roll sound + groove", "var(--warn)"],
      ["Backspace", "panic — all notes off", "var(--rec)"],
    ]) +
    group("Knob (dial)", [
      ["Z   C", "filter sweep  −  /  +", "var(--accent)"],
      ["hold V / B / N / M", "+ knob = reverb · bright · noise · mod"],
      ["dial keys", "sound presets — lit while held, hold several to blend"],
    ]) +
    group("Whimsy", [
      ["\\", "tape-stop — hold to grind to a halt", "var(--warn)"],
      ["jaws", "type it — shark feeding frenzy"],
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
