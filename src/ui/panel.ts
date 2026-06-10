import { params } from "../state";
import type { Engine } from "../audio/engine";
import type { Sequencer } from "../audio/sequencer";
import { KITS, type DrumKit } from "../audio/drums";
import type { Looper } from "../loop/looper";
import { SCALES, NOTE_NAMES } from "../audio/scales";

/** The deck's context panel: SOUND (timbre + musical key), DRUMS (pads + step sequencer),
 *  MIX (levels + space). Tabs swap the body; the loop tape above it stays pinned.
 *
 *  SOUND has an "Edit" target: Live (the surface sound) or a recorded loop — so you can dial in
 *  noise / modulation / timbre on a layer you ALREADY recorded. Loop edits take effect on that
 *  layer's next pass (the looper applies its snapshot each cycle). */
export interface PanelUI {
  refresh(): void;
  syncTempo(): void;
}

export function initPanel(
  root: HTMLElement,
  o: { engine: Engine; seq: Sequencer; kit: DrumKit; looper: Looper; onChange: () => void },
): PanelUI {
  root.innerHTML = "";
  const refreshers: Array<() => void> = [];
  const refresh = () => refreshers.forEach((fn) => fn());

  // which sound the SOUND controls edit: "live" (the surface) or a recorded loop index
  let editTarget: "live" | number = "live";
  const isLive = () => editTarget === "live";
  const tgtSound = () => (isLive() ? null : o.looper.soundOf(editTarget as number));
  const P = params as unknown as Record<string, unknown>;
  const getP = (k: string): unknown => (isLive() ? P[k] : tgtSound()?.[k] ?? P[k]);
  const setP = (k: string, v: unknown): void => { if (isLive()) P[k] = v; else o.looper.editSound(editTarget as number, { [k]: v }); };

  // ── tabs ──
  const tabsEl = document.createElement("div");
  tabsEl.className = "panel-tabs";
  const bodies: Record<string, HTMLElement> = {};
  const order = ["Sound", "Drums", "Mix"];
  const select = (name: string) => {
    for (const t of tabsEl.children) (t as HTMLElement).classList.toggle("on", (t as HTMLElement).dataset.tab === name);
    for (const k of order) bodies[k].classList.toggle("hidden", k !== name);
  };
  for (const name of order) {
    const t = document.createElement("button");
    t.className = "ptab";
    t.dataset.tab = name;
    t.textContent = name;
    t.onclick = () => select(name);
    tabsEl.append(t);
  }
  root.append(tabsEl);

  // ── helpers ──
  const body = (name: string): HTMLElement => {
    const el = document.createElement("div");
    el.className = "panel-body";
    bodies[name] = el;
    root.append(el);
    return el;
  };
  const ctl = (parent: HTMLElement, label: string, el: HTMLElement, check = false) => {
    const w = document.createElement("label");
    w.className = check ? "ctl check" : "ctl";
    const s = document.createElement("span");
    s.textContent = label;
    if (check) w.append(el, s); else w.append(s, el);
    parent.append(w);
    return w;
  };
  const sel = (parent: HTMLElement, label: string, options: string[], get: () => number, set: (n: number) => void) => {
    const e = document.createElement("select");
    options.forEach((o2, i) => e.append(new Option(o2, String(i))));
    e.onchange = () => set(Number(e.value));
    refreshers.push(() => (e.value = String(get())));
    ctl(parent, label, e);
  };
  const range = (parent: HTMLElement, label: string, get: () => number, set: (v: number) => void, min = 0, max = 1, step = 0.01) => {
    const e = document.createElement("input");
    e.type = "range"; e.min = String(min); e.max = String(max); e.step = String(step);
    e.oninput = () => set(Number(e.value));
    refreshers.push(() => (e.value = String(get())));
    ctl(parent, label, e);
  };
  // a control routed through the current edit target (Live or a recorded loop)
  const pRange = (parent: HTMLElement, label: string, key: string, min = 0, max = 1, step = 0.01) =>
    range(parent, label, () => Number(getP(key)), (v) => setP(key, v), min, max, step);
  const pCheck = (parent: HTMLElement, label: string, key: string) => {
    const e = document.createElement("input");
    e.type = "checkbox";
    e.onchange = () => setP(key, e.checked);
    refreshers.push(() => (e.checked = Boolean(getP(key))));
    ctl(parent, label, e, true);
  };

  // ── SOUND ──
  const sound = body("Sound");
  // edit-target row
  const tgtRow = document.createElement("div"); tgtRow.className = "ctl-row";
  const tgtWrap = document.createElement("label"); tgtWrap.className = "ctl";
  const tgtSpan = document.createElement("span"); tgtSpan.textContent = "Edit";
  const tgtSel = document.createElement("select");
  tgtWrap.append(tgtSpan, tgtSel); tgtRow.append(tgtWrap);
  const note = document.createElement("span"); note.className = "edit-note";
  tgtRow.append(note);
  sound.append(tgtRow);
  tgtSel.onchange = () => {
    editTarget = tgtSel.value === "live" ? "live" : Number(tgtSel.value);
    sound.classList.toggle("editing-loop", !isLive());
    note.textContent = isLive() ? "" : `editing Loop ${(editTarget as number) + 1} — applies on its next pass`;
    refresh();
  };

  const sr1 = document.createElement("div"); sr1.className = "ctl-row"; sound.append(sr1);
  sel(sr1, "Scale", SCALES.map((s) => s.name), () => params.scaleIndex, (n) => { params.scaleIndex = n; o.onChange(); });
  sel(sr1, "Root", NOTE_NAMES, () => params.root, (n) => { params.root = n; o.onChange(); });

  const sr2 = document.createElement("div"); sr2.className = "ctl-row"; sound.append(sr2);
  pRange(sr2, "Timbre", "morph");
  pRange(sr2, "Noise", "noise");
  pRange(sr2, "Mod", "fm");
  pRange(sr2, "Detune", "detune", 0, 50, 1);
  pRange(sr2, "Sub", "subLevel");
  pRange(sr2, "Attack", "attack", 0.002, 0.8, 0.002);
  pRange(sr2, "Release", "release", 0.05, 2.5, 0.01);
  pCheck(sr2, "Chord", "chord");
  pCheck(sr2, "Glide", "glide");

  // ── DRUMS (kit picker + pads + step grid) ──
  const drums = body("Drums");
  const kitRow = document.createElement("div"); kitRow.className = "ctl-row"; drums.append(kitRow);
  const kitWrap = document.createElement("label"); kitWrap.className = "ctl";
  const kitSpan = document.createElement("span"); kitSpan.textContent = "Kit";
  const kitSel = document.createElement("select");
  KITS.forEach((k, i) => kitSel.append(new Option(k.name, String(i))));
  kitSel.onchange = () => { o.kit.setAssignment(KITS[Number(kitSel.value)].pads.slice()); refreshDrums(); o.onChange(); };
  kitWrap.append(kitSpan, kitSel); kitRow.append(kitWrap);

  const padsEl = document.createElement("div"); padsEl.className = "pads"; drums.append(padsEl);
  const padEls: HTMLButtonElement[] = [];
  for (let i = 0; i < o.seq.tracks; i++) {
    const p = document.createElement("button");
    p.className = "dpad";
    p.onclick = () => { o.seq.hit(i); flashPad(i); };
    padEls.push(p);
    padsEl.append(p);
  }
  const seqEl = document.createElement("div"); seqEl.className = "seq"; drums.append(seqEl);
  const cells: HTMLDivElement[][] = [];
  const rowLabs: HTMLElement[] = [];
  for (let tr = 0; tr < o.seq.tracks; tr++) {
    const rowEl = document.createElement("div"); rowEl.className = "seq-row";
    const lab = document.createElement("span"); lab.className = "seq-lab"; rowLabs.push(lab); rowEl.append(lab);
    cells[tr] = [];
    for (let st = 0; st < o.seq.steps; st++) {
      const c = document.createElement("div");
      c.className = "cell" + (st % 4 === 0 ? " q" : "");
      c.onclick = () => { o.seq.toggleStep(tr, st); c.classList.toggle("on", o.seq.pattern[tr][st]); o.onChange(); };
      cells[tr][st] = c;
      rowEl.append(c);
    }
    seqEl.append(rowEl);
  }
  const flashPad = (i: number) => { padEls[i].classList.add("flash"); setTimeout(() => padEls[i].classList.remove("flash"), 110); };
  const refreshDrums = () => {
    padEls.forEach((p, i) => (p.innerHTML = `<span class="pn">${esc(o.kit.soundOf(i).name)}</span>`));
    rowLabs.forEach((l, tr) => (l.textContent = o.kit.soundOf(tr).name));
  };
  refreshers.push(refreshDrums);

  // ── MIX ──
  const mix = body("Mix");
  const mr = document.createElement("div"); mr.className = "ctl-row"; mix.append(mr);
  range(mr, "Volume", () => params.masterVolume, (v) => { params.masterVolume = v; o.engine.applyParams(); });
  range(mr, "Brightness", () => params.brightness, (v) => o.engine.setBrightness(v));
  range(mr, "Reverb", () => params.reverb, (v) => { params.reverb = v; o.engine.applyParams(); });
  range(mr, "Delay", () => params.delay, (v) => { params.delay = v; o.engine.applyParams(); });

  // keep the Edit-target dropdown in sync with which loops have content
  let tgtSig = "";
  const rebuildTargets = (): void => {
    const loops: number[] = [];
    for (let i = 0; i < o.looper.count; i++) if (o.looper.hasContent(i)) loops.push(i);
    if (editTarget !== "live" && !loops.includes(editTarget as number)) { editTarget = "live"; sound.classList.remove("editing-loop"); note.textContent = ""; refresh(); }
    const sig = loops.join(",");
    if (sig === tgtSig) return;
    tgtSig = sig;
    tgtSel.innerHTML = "";
    tgtSel.append(new Option("Live", "live"));
    for (const i of loops) tgtSel.append(new Option(`Loop ${i + 1}`, String(i)));
    tgtSel.value = isLive() ? "live" : String(editTarget);
  };

  select("Sound");
  rebuildTargets();
  refresh();

  // live step playhead + target-list upkeep
  let last = -1;
  const draw = () => {
    rebuildTargets();
    for (let tr = 0; tr < o.seq.tracks; tr++)
      for (let st = 0; st < o.seq.steps; st++) cells[tr][st].classList.toggle("on", o.seq.pattern[tr][st]);
    const step = o.seq.visualStep();
    if (step !== last) {
      for (let tr = 0; tr < o.seq.tracks; tr++) {
        if (last >= 0) cells[tr][last]?.classList.remove("head");
        if (step >= 0) cells[tr][step]?.classList.add("head");
      }
      last = step;
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  return { refresh, syncTempo: () => {} };
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}
