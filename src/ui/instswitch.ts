import type { InstrumentId } from "../instruments/instrument";

/** The instrument switch above the trackpad — the headline control. Picks what the one
 *  Magic-Trackpad surface plays: Synth / Keys / Drums / Sample. Motion thesis: the active
 *  pill snaps to white instantly (a struck key), the rest stay quiet ink. */
export interface InstSwitch {
  setActive(id: InstrumentId): void;
  setEnabled(id: InstrumentId, on: boolean): void;
  /** show the Sample tab as recording (red "Rec…") vs its name. */
  setRecording(on: boolean): void;
}

export function initInstSwitch(
  root: HTMLElement,
  items: { id: InstrumentId; name: string }[],
  opts: { onSelect: (id: InstrumentId) => void; enabled?: (id: InstrumentId) => boolean },
): InstSwitch {
  root.innerHTML = "";
  const tabs = new Map<InstrumentId, HTMLButtonElement>();
  const names = new Map<InstrumentId, HTMLSpanElement>();
  items.forEach((it, idx) => {
    const b = document.createElement("button");
    b.className = "inst-tab";
    const name = document.createElement("span");
    name.className = "it-name";
    name.textContent = it.name;
    const kb = document.createElement("kbd");        // every tab shows its direct keybind: F1…F9 (10th = Tab)
    kb.className = "tkey";
    kb.textContent = idx < 9 ? `F${idx + 1}` : "⇥";
    b.append(name, kb);
    b.title = idx < 9 ? `Play ${it.name} (F${idx + 1} · Tab cycles)` : `Play ${it.name} (Tab cycles)`;
    b.onclick = () => { if (!b.disabled) opts.onSelect(it.id); };
    if (opts.enabled && !opts.enabled(it.id)) b.disabled = true;
    tabs.set(it.id, b);
    names.set(it.id, name);
    root.append(b);
  });
  return {
    setActive(id) { for (const [k, b] of tabs) b.classList.toggle("on", k === id); },
    setEnabled(id, on) { const b = tabs.get(id); if (b) b.disabled = !on; },
    setRecording(on) {
      const b = tabs.get("sampler" as InstrumentId), n = names.get("sampler" as InstrumentId);
      if (!b || !n) return;
      b.classList.toggle("rec", on);
      n.textContent = on ? "Rec…" : "Sample";
    },
  };
}
