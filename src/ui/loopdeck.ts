import type { Looper, SlotState } from "../loop/looper";
import { loopColor } from "./loop-colors";

/** The loop tape — one slot per loop. Tap to record a layer, tap again to play/mute;
 *  the speed badge cycles ½×/1×/2×; right-click clears. A keybind hint (1–8) shows the
 *  per-loop record shortcut. Motion thesis: a recording slot pulses red, a playing slot
 *  fills with a sweeping accent playhead — the chassis is still, the light moves. */
const SPEED_LABEL: Record<number, string> = { 0.5: "½×", 1: "1×", 2: "2×" };
// what a tap DOES from each state — "empty" told you nothing; "● record" tells you the action
const STATE_LABEL: Record<SlotState, string> = { empty: "● record", recording: "recording…", playing: "playing", muted: "muted" };
const INST_NAMES: Record<string, string> = { synth: "Synth", keys: "Keys", bass: "Bass", guitar: "Guitar", pluck: "Pluck", pad: "Pad", fm: "FM", drums: "Drums", sampler: "Sample", tombola: "Tombola", organ: "Organ", strings: "Strings", arp: "Arp", brass: "Brass", bells: "Bells" };

export function initLoopDeck(root: HTMLElement, looper: Looper, keyHint: (i: number) => string, onPress?: (i: number) => void, activeInst?: () => string): void {
  root.innerHTML = "";
  const slots: HTMLButtonElement[] = [];

  for (let i = 0; i < looper.count; i++) {
    const b = document.createElement("button");
    b.className = "loop empty";
    b.style.setProperty("--lc", loopColor(i));
    b.innerHTML =
      `<div class="loop-top"><span class="loop-num">${i + 1}</span><span class="loop-inst"></span><span class="loop-key">${keyHint(i)}</span></div>` +
      `<span class="loop-state">${STATE_LABEL.empty}</span>` +
      `<span class="loop-spd">1×</span>`;
    b.title = `Loop ${i + 1} — tap to record / play / mute. Speed badge = ½×/2×. Long-press (or right-click) to clear.`;
    b.oncontextmenu = (e) => { e.preventDefault(); looper.clear(i); };

    // TAP cycles the slot; LONG-PRESS clears it (the finger-friendly equivalent of right-click, so a
    // loop is removable on a phone where there's no right-click). A drag past a few px = a scroll,
    // which cancels the long-press AND the tap, so scrolling the page never fires a loop.
    let lpTimer = 0, cleared = false, sx = 0, sy = 0, moved = false;
    b.addEventListener("pointerdown", (e) => {
      cleared = false; moved = false; sx = e.clientX; sy = e.clientY;
      lpTimer = window.setTimeout(() => { cleared = true; looper.clear(i); }, 500);
    });
    const cancelLP = (): void => { window.clearTimeout(lpTimer); };
    b.addEventListener("pointermove", (e) => {
      if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) { moved = true; cancelLP(); }
    });
    b.addEventListener("pointerup", cancelLP);
    b.addEventListener("pointercancel", () => { moved = true; cancelLP(); });
    b.addEventListener("pointerleave", cancelLP);
    b.onclick = () => { if (cleared || moved) { cleared = false; return; } (onPress ? onPress(i) : looper.toggle(i)); };

    const spd = b.querySelector(".loop-spd") as HTMLElement;
    // the speed badge sits inside the slot button — keep its presses to itself so they never arm the
    // slot's long-press-to-clear timer (a slow tap / hold-to-read on the badge must NOT wipe the loop).
    spd.addEventListener("pointerdown", (e) => e.stopPropagation());
    spd.onclick = (e) => { e.stopPropagation(); const s = looper.cycleSpeed(i); spd.textContent = SPEED_LABEL[s] ?? `${s}×`; };

    slots.push(b);
    root.append(b);
  }

  const paint = (i: number, s: SlotState): void => {
    const b = slots[i];
    b.className = "loop " + s;
    (b.querySelector(".loop-state") as HTMLElement).textContent = STATE_LABEL[s];
    (b.querySelector(".loop-spd") as HTMLElement).textContent = SPEED_LABEL[looper.speedOf(i)] ?? `${looper.speedOf(i)}×`;
    const inst = looper.instOf(i);
    (b.querySelector(".loop-inst") as HTMLElement).textContent = inst ? INST_NAMES[inst] ?? inst : "";
  };
  looper.onSlotChange(paint);

  const tick = (): void => {
    const act = activeInst?.() ?? "";
    for (let i = 0; i < slots.length; i++) {
      const b = slots[i];
      if (b.classList.contains("playing") || b.classList.contains("recording")) {
        b.style.setProperty("--ph", String(looper.slotPhaseNorm(i)));
      }
      // whose layer is this? The ACTIVE instrument's loops stand out; other instruments' loops
      // sit back (still tappable — the tape is a mixer, not navigation).
      const inst = looper.instOf(i);
      b.classList.toggle("mine", !!inst && inst === act);
      b.classList.toggle("other", !!inst && inst !== act);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
