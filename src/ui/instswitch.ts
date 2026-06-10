import type { InstrumentId } from "../instruments/instrument";

/** The instrument switch above the trackpad — the headline control. Picks what the one
 *  Magic-Trackpad surface plays: Synth / Keys / Drums / Sample. Motion thesis: the active
 *  pill snaps to white instantly (a struck key), the rest stay quiet ink. */
export interface InstSwitch {
  setActive(id: InstrumentId): void;
  setEnabled(id: InstrumentId, on: boolean): void;
}

export function initInstSwitch(
  root: HTMLElement,
  items: { id: InstrumentId; name: string }[],
  opts: { onSelect: (id: InstrumentId) => void; enabled?: (id: InstrumentId) => boolean },
): InstSwitch {
  root.innerHTML = "";
  const tabs = new Map<InstrumentId, HTMLButtonElement>();
  for (const it of items) {
    const b = document.createElement("button");
    b.className = "inst-tab";
    b.textContent = it.name;
    b.title = `Play ${it.name} on the trackpad`;
    b.onclick = () => { if (!b.disabled) opts.onSelect(it.id); };
    if (opts.enabled && !opts.enabled(it.id)) b.disabled = true;
    tabs.set(it.id, b);
    root.append(b);
  }
  return {
    setActive(id) { for (const [k, b] of tabs) b.classList.toggle("on", k === id); },
    setEnabled(id, on) { const b = tabs.get(id); if (b) b.disabled = !on; },
  };
}
