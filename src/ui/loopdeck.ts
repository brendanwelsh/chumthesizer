import type { Looper, SlotState } from "../loop/looper";
import { loopColor } from "./loop-colors";

/** The loop tape — one slot per loop. Tap to record a layer, tap again to play/mute;
 *  the speed badge cycles ½×/1×/2×; right-click clears. A keybind hint (1–6) shows the
 *  per-loop record shortcut. Motion thesis: a recording slot pulses red, a playing slot
 *  fills with a sweeping accent playhead — the chassis is still, the light moves. */
const SPEED_LABEL: Record<number, string> = { 0.5: "½×", 1: "1×", 2: "2×" };
const INST_NAMES: Record<string, string> = { synth: "Synth", keys: "Keys", bass: "Bass", guitar: "Guitar", pluck: "Pluck", pad: "Pad", fm: "FM", drums: "Drums", sampler: "Sample", tombola: "Tombola", organ: "Organ", strings: "Strings", arp: "Arp", brass: "Brass" };

export function initLoopDeck(root: HTMLElement, looper: Looper, keyHint: (i: number) => string, onPress?: (i: number) => void): void {
  root.innerHTML = "";
  const slots: HTMLButtonElement[] = [];

  for (let i = 0; i < looper.count; i++) {
    const b = document.createElement("button");
    b.className = "loop empty";
    b.style.setProperty("--lc", loopColor(i));
    b.innerHTML =
      `<div class="loop-top"><span class="loop-num">${i + 1}</span><span class="loop-inst"></span><span class="loop-key">${keyHint(i)}</span></div>` +
      `<span class="loop-state">empty</span>` +
      `<span class="loop-spd">1×</span>`;
    b.title = `Loop ${i + 1} — tap to record / play / mute and jump to its instrument. Speed badge = ½×/2×. Right-click to clear.`;
    b.onclick = () => (onPress ? onPress(i) : looper.toggle(i));
    b.oncontextmenu = (e) => { e.preventDefault(); looper.clear(i); };

    const spd = b.querySelector(".loop-spd") as HTMLElement;
    spd.onclick = (e) => { e.stopPropagation(); const s = looper.cycleSpeed(i); spd.textContent = SPEED_LABEL[s] ?? `${s}×`; };

    slots.push(b);
    root.append(b);
  }

  const paint = (i: number, s: SlotState): void => {
    const b = slots[i];
    b.className = "loop " + s;
    (b.querySelector(".loop-state") as HTMLElement).textContent = s;
    (b.querySelector(".loop-spd") as HTMLElement).textContent = SPEED_LABEL[looper.speedOf(i)] ?? `${looper.speedOf(i)}×`;
    const inst = looper.instOf(i);
    (b.querySelector(".loop-inst") as HTMLElement).textContent = inst ? INST_NAMES[inst] ?? inst : "";
  };
  looper.onSlotChange(paint);

  const tick = (): void => {
    for (let i = 0; i < slots.length; i++) {
      const b = slots[i];
      if (b.classList.contains("playing") || b.classList.contains("recording")) {
        b.style.setProperty("--ph", String(looper.slotPhaseNorm(i)));
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
