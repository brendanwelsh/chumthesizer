import { params } from "../state";
import type { Engine } from "../audio/engine";
import type { Sequencer } from "../audio/sequencer";
import { KITS, DRUM_SOUNDS, type DrumKit } from "../audio/drums";
import type { DrumInstrument } from "../instruments/drumpad";
import type { InstrumentId } from "../instruments/instrument";
import type { Looper } from "../loop/looper";
import type { Sampler } from "../audio/sampler";
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
  /** show the config page for the active instrument (called when the instrument changes). */
  setInstrument(id: InstrumentId): void;
  /** which sound the dial/knob should edit: "live" or a recorded loop index (per-loop sound design). */
  editTarget(): "live" | number;
  /** point the editor at a loop (or "live") — e.g. when you select a loop to perfect its sound. */
  setEditTarget(t: "live" | number): void;
}

export function initPanel(
  root: HTMLElement,
  o: { engine: Engine; seq: Sequencer; kit: DrumKit; drumInst: DrumInstrument; sampler: Sampler; looper: Looper; sounds: string[]; onPickSound: (name: string) => void; onChange: () => void; onOverlay: () => void; onCaptureBeat: () => void },
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
  const order = ["Sound", "Drums", "Sample", "Mix"];
  const tabBtns: Record<string, HTMLButtonElement> = {};
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
    tabBtns[name] = t;
    tabsEl.append(t);
  }
  root.append(tabsEl);
  // DRUMS + SAMPLE are per-instrument config, so their tabs only appear when that instrument is
  // active — otherwise "Drums"/"Sample" doubled the instrument names and showed in two places.
  const showContextTabs = (id: InstrumentId): void => {
    tabBtns["Drums"].classList.toggle("gone", id !== "drums");
    tabBtns["Sample"].classList.toggle("gone", id !== "sampler");
  };
  showContextTabs("synth" as InstrumentId);   // default: melodic — hide Drums/Sample until they're active

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
  // a control routed through the current edit target (Live or a recorded loop). onChange pushes the
  // value to the engine immediately → it reshapes the note you're holding, not just the next one.
  const pRange = (parent: HTMLElement, label: string, key: string, min = 0, max = 1, step = 0.01) =>
    range(parent, label, () => Number(getP(key)), (v) => { setP(key, v); o.onChange(); }, min, max, step);
  const pCheck = (parent: HTMLElement, label: string, key: string) => {
    const e = document.createElement("input");
    e.type = "checkbox";
    e.onchange = () => { setP(key, e.checked); o.onChange(); };
    refreshers.push(() => (e.checked = Boolean(getP(key))));
    ctl(parent, label, e, true);
  };

  // ── SOUND ──
  const sound = body("Sound");
  // sound browser — pick from the whole library (the 7 dial keys are just quick access)
  const presetRow = document.createElement("div"); presetRow.className = "ctl-row"; sound.append(presetRow);
  const presetSel = document.createElement("select");
  o.sounds.forEach((n) => presetSel.append(new Option(n, n)));
  presetSel.onchange = () => o.onPickSound(presetSel.value);
  refreshers.push(() => { presetSel.value = String(params.presetName); });
  ctl(presetRow, "Sound", presetSel);
  // edit-target row
  const tgtRow = document.createElement("div"); tgtRow.className = "ctl-row";
  const tgtWrap = document.createElement("label"); tgtWrap.className = "ctl";
  const tgtSpan = document.createElement("span"); tgtSpan.textContent = "Edit";
  const tgtSel = document.createElement("select");
  tgtWrap.append(tgtSpan, tgtSel); tgtRow.append(tgtWrap);
  const note = document.createElement("span"); note.className = "edit-note";
  tgtRow.append(note);
  sound.append(tgtRow);
  const applyTargetUI = (): void => {
    sound.classList.toggle("editing-loop", !isLive());
    note.textContent = isLive() ? "" : `editing Loop ${(editTarget as number) + 1} — dial + knob perfect THIS loop`;
    refresh();
  };
  tgtSel.onchange = () => {
    editTarget = tgtSel.value === "live" ? "live" : Number(tgtSel.value);
    applyTargetUI();
  };

  const sr1 = document.createElement("div"); sr1.className = "ctl-row"; sound.append(sr1);
  sel(sr1, "Scale", SCALES.map((s) => s.name), () => params.scaleIndex, (n) => { params.scaleIndex = n; o.onChange(); });
  sel(sr1, "Root", NOTE_NAMES, () => params.root, (n) => { params.root = n; o.onChange(); });

  const sr2 = document.createElement("div"); sr2.className = "ctl-row"; sound.append(sr2);
  pRange(sr2, "Timbre", "morph");
  pRange(sr2, "Bright", "brightness");
  pRange(sr2, "Mod", "fm");
  pRange(sr2, "FM ratio", "fmRatio", 0.5, 8, 0.1);
  pRange(sr2, "Noise", "noise");
  pRange(sr2, "Detune", "detune", 0, 50, 1);
  pRange(sr2, "Sub", "subLevel");
  // a second row of deeper shaping controls
  const sr3 = document.createElement("div"); sr3.className = "ctl-row"; sound.append(sr3);
  pRange(sr3, "Attack", "attack", 0.002, 0.8, 0.002);
  pRange(sr3, "Release", "release", 0.05, 2.5, 0.01);
  pRange(sr3, "Snap", "filterEnv");
  pRange(sr3, "Reso", "resonance", 0.7, 8, 0.1);
  pRange(sr3, "Vibrato", "vibratoDepth", 0, 2, 0.05);
  pCheck(sr3, "Chord", "chord");
  pCheck(sr3, "Glide", "glide");

  // ── DRUMS (kit picker + pads + step grid) ──
  const drums = body("Drums");
  const kitRow = document.createElement("div"); kitRow.className = "ctl-row"; drums.append(kitRow);
  const kitWrap = document.createElement("label"); kitWrap.className = "ctl";
  const kitSpan = document.createElement("span"); kitSpan.textContent = "Kit";
  const kitSel = document.createElement("select");
  KITS.forEach((k, i) => kitSel.append(new Option(k.name, String(i))));
  kitSel.onchange = () => { o.kit.setAssignment(KITS[Number(kitSel.value)].pads.slice()); refreshDrums(); o.onChange(); };
  kitWrap.append(kitSpan, kitSel); kitRow.append(kitWrap);

  // whole-surface pad grid: 1×1 up to 4×3 (corner to corner)
  sel(kitRow, "Pads ⇄", ["1", "2", "3", "4"], () => o.drumInst.gridCols - 1, (n) => { o.drumInst.setGrid(n + 1, o.drumInst.gridRows); o.onOverlay(); refreshDrums(); });
  sel(kitRow, "Pads ⇅", ["1", "2", "3"], () => o.drumInst.gridRows - 1, (n) => { o.drumInst.setGrid(o.drumInst.gridCols, n + 1); o.onOverlay(); refreshDrums(); });
  // how many steps the beat loops over (4 / 8 / 16)
  const STEP_OPTS = [4, 8, 16];
  sel(kitRow, "Steps", ["4", "8", "16"], () => Math.max(0, STEP_OPTS.indexOf(o.seq.length)), (n) => { o.seq.length = STEP_OPTS[n]; o.onChange(); });
  // BUILD: while running, finger-drumming quantizes onto the beat (builds the groove as you play)
  const buildChk = document.createElement("input");
  buildChk.type = "checkbox";
  buildChk.onchange = () => { o.seq.recording = buildChk.checked; };
  refreshers.push(() => { buildChk.checked = o.seq.recording; });
  ctl(kitRow, "Build", buildChk, true);
  // metronome — a click on the quarter notes so you can finger-drum / record in time
  const clickChk = document.createElement("input");
  clickChk.type = "checkbox";
  clickChk.onchange = () => { o.seq.metronome = clickChk.checked; };
  refreshers.push(() => { clickChk.checked = o.seq.metronome; });
  ctl(kitRow, "Click", clickChk, true);
  // BEAT → LOOP: bake the current step pattern into a loop slot so you can mute/stack/clone it
  // like any other layer (the beat becomes one of the colored loops).
  const capBtn = document.createElement("button");
  capBtn.className = "sbtn"; capBtn.textContent = "Beat → Loop";
  capBtn.title = "Bake the step pattern into a loop slot (stack it like any layer)";
  capBtn.onclick = () => o.onCaptureBeat();
  kitRow.append(capBtn);

  const padsEl = document.createElement("div"); padsEl.className = "pads"; drums.append(padsEl);
  const padEls: HTMLButtonElement[] = [];
  for (let i = 0; i < o.seq.tracks; i++) {
    const p = document.createElement("button");
    p.className = "dpad";
    p.title = "Tap to play · right-click to change this pad's sound";
    p.onclick = () => { o.seq.hit(i); flashPad(i); };
    p.oncontextmenu = (e) => {                        // right-click cycles the pad's sound
      e.preventDefault();
      const next = ((o.kit.assignment[i] ?? 0) + 1) % DRUM_SOUNDS.length;
      o.kit.assign(i, next);
      o.kit.trigger(i, o.engine.ctx.currentTime);
      refreshDrums();
      o.onChange();
    };
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
      c.onclick = () => {
        o.seq.toggleStep(tr, st);
        const on = o.seq.pattern[tr][st];
        c.classList.toggle("on", on);
        if (on) o.kit.trigger(tr, o.engine.ctx.currentTime);   // audition the hit you just placed
        o.onChange();
      };
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

  // ── SAMPLE (the OP-1 sampler: record / load, then play it pitched across the pad) ──
  const sample = body("Sample");
  const smRow1 = document.createElement("div"); smRow1.className = "ctl-row"; sample.append(smRow1);
  const recBtn = document.createElement("button"); recBtn.className = "sbtn"; recBtn.textContent = "● Record";
  recBtn.onclick = () => { if (o.sampler.isRecording) o.sampler.stop(); else void o.sampler.record().catch(() => {}); };
  const loadBtn = document.createElement("label"); loadBtn.className = "sbtn"; loadBtn.textContent = "Load file";
  const fileIn = document.createElement("input"); fileIn.type = "file"; fileIn.accept = "audio/*"; fileIn.style.display = "none";
  fileIn.onchange = () => { const f = fileIn.files && fileIn.files[0]; if (f) void o.sampler.loadFile(f).catch(() => {}); fileIn.value = ""; };
  loadBtn.append(fileIn);
  const deskBtn = document.createElement("button"); deskBtn.className = "sbtn"; deskBtn.textContent = "Desktop audio";
  deskBtn.title = "Sample whatever's playing on your computer (Spotify, a tab…)";
  deskBtn.onclick = () => { if (o.sampler.isRecording) o.sampler.stop(); else void o.sampler.recordDesktop().catch(() => {}); };
  const smStat = document.createElement("span"); smStat.className = "sstatus";
  smRow1.append(recBtn, loadBtn, deskBtn, smStat);

  const wave = document.createElement("canvas"); wave.className = "wave"; wave.width = 300; wave.height = 58;
  sample.append(wave);
  const wctx = wave.getContext("2d");

  const smRow2 = document.createElement("div"); smRow2.className = "ctl-row"; sample.append(smRow2);
  range(smRow2, "Start", () => o.sampler.trimStart, (v) => o.sampler.setTrim(v, o.sampler.trimEnd), 0, 1, 0.005);
  range(smRow2, "End", () => o.sampler.trimEnd, (v) => o.sampler.setTrim(o.sampler.trimStart, v), 0, 1, 0.005);
  const revChk = document.createElement("input"); revChk.type = "checkbox";
  revChk.onchange = () => o.sampler.setReverse(revChk.checked);
  refreshers.push(() => { revChk.checked = o.sampler.reversed; });
  ctl(smRow2, "Reverse", revChk, true);
  const loopChk = document.createElement("input"); loopChk.type = "checkbox";
  loopChk.onchange = () => o.sampler.setLoop(loopChk.checked);
  refreshers.push(() => { loopChk.checked = o.sampler.loopOn; });
  ctl(smRow2, "Loop", loopChk, true);
  // CHOP: split the trimmed region into pads across the surface (MPC-style), instead of pitched play
  const SLICE_OPTS = [0, 4, 8, 16];
  sel(smRow2, "Slices", ["Off", "4", "8", "16"], () => Math.max(0, SLICE_OPTS.indexOf(o.sampler.slices)), (n) => { o.sampler.slices = SLICE_OPTS[n]; o.onOverlay(); });

  const drawSample = (): void => {
    recBtn.textContent = o.sampler.isRecording ? "■ Stop" : o.sampler.hasSample() ? "● Re-record" : "● Record";
    recBtn.classList.toggle("danger", o.sampler.isRecording);
    smStat.textContent = o.sampler.isRecording ? "recording…" : o.sampler.hasSample() ? "play it across the pad" : "record or load a file";
    if (!wctx) return;
    const w = wave.width, h = wave.height;
    wctx.clearRect(0, 0, w, h);
    if (o.sampler.hasSample()) {
      const peaks = o.sampler.peaks(w);
      const s = o.sampler.trimStart * w, e = o.sampler.trimEnd * w;
      wctx.fillStyle = "rgba(25,182,216,0.16)"; wctx.fillRect(s, 0, e - s, h);
      wctx.fillStyle = "rgba(27,28,34,0.5)";
      for (let i = 0; i < w; i++) { const ph = peaks[i] * (h * 0.46); wctx.fillRect(i, h / 2 - ph, 1, Math.max(1, ph * 2)); }
      wctx.fillStyle = "#19b6d8"; wctx.fillRect(Math.max(0, s - 1), 0, 2, h); wctx.fillRect(Math.min(w - 2, e - 1), 0, 2, h);
    } else {
      wctx.fillStyle = "rgba(20,22,30,0.22)"; wctx.font = "11px Inter, system-ui, sans-serif"; wctx.textAlign = "center";
      wctx.fillText("record or load a sample", w / 2, h / 2 + 4);
    }
  };

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
      for (let st = 0; st < o.seq.steps; st++) {
        cells[tr][st].classList.toggle("on", o.seq.pattern[tr][st]);
        cells[tr][st].classList.toggle("off-len", st >= o.seq.length);   // dim steps past the chosen length
      }
    const step = o.seq.visualStep();
    if (step !== last) {
      for (let tr = 0; tr < o.seq.tracks; tr++) {
        if (last >= 0) cells[tr][last]?.classList.remove("head");
        if (step >= 0) cells[tr][step]?.classList.add("head");
      }
      last = step;
    }
    drawSample();
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  return {
    refresh,
    syncTempo: () => {},
    setInstrument(id: InstrumentId) { showContextTabs(id); select(id === "drums" ? "Drums" : id === "sampler" ? "Sample" : "Sound"); },
    editTarget() { return editTarget; },
    setEditTarget(t: "live" | number) {
      editTarget = t;
      tgtSel.value = t === "live" ? "live" : String(t);
      applyTargetUI();
    },
  };
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}
