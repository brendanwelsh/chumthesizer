import "./styles.css";
import type { Contact, SurfaceSink, DeviceStatus } from "./types";
import { params } from "./state";
import { Engine } from "./audio/engine";
import { DrumKit } from "./audio/drums";
import { Sequencer } from "./audio/sequencer";
import { MidiOut } from "./audio/midi";
import { Sampler } from "./audio/sampler";
import { SOUNDS, DIAL_SOUNDS } from "./audio/sounds";
import { SCALES, NOTE_NAMES } from "./audio/scales";

import { Looper, type LoopEvent } from "./loop/looper";
import { InstrumentRack } from "./instruments/rack";
import { MelodicInstrument } from "./instruments/melodic";
import { DrumInstrument } from "./instruments/drumpad";
import { SamplerInstrument } from "./instruments/sampler-inst";
import { TombolaInstrument } from "./instruments/tombola";
import { ArpInstrument } from "./instruments/arp";
import type { InstrumentId } from "./instruments/instrument";

import { initPad } from "./input/pad";
import { initTrackpadBridge } from "./input/trackpad-bridge";
import { initDialBridge } from "./input/dial-bridge";
import { initPedal } from "./input/pedal";
import { initPedalBridge } from "./input/pedal-bridge";
import { DialMap } from "./input/dial-map";

import { initDial } from "./ui/dial";
import { initPedalView } from "./ui/pedalview";
import { initShark } from "./ui/shark";
import { Visualizer } from "./ui/visualizer";
import { initScreen } from "./ui/screen";
import { initInstSwitch } from "./ui/instswitch";
import { initOverlay } from "./ui/overlay";
import { initLoopDeck } from "./ui/loopdeck";
import { initTransport } from "./ui/transport";
import { initKnob } from "./ui/knob";
import { initPanel } from "./ui/panel";
import { initSettings, type SettingsUI } from "./ui/settings";
import { initLegend } from "./ui/legend";
import { initGridView } from "./ui/gridview";
import { initVideoRecorder } from "./ui/recorder";
import { loopRgb } from "./ui/loop-colors";

// ── core audio ──────────────────────────────────────────────────────────────
const engine = new Engine();
const kit = new DrumKit(engine.ctx, engine.drumBus);
const seq = new Sequencer(engine.ctx, kit);
seq.clickFn = (t, accent) => engine.click(t, accent);   // metronome click source
const midi = new MidiOut();
const sampler = new Sampler(engine.ctx, engine.drumBus);
const contacts = new Map<string, Contact>();

// LATCH (sustain): while on, note releases are DEFERRED — every note you play keeps sounding, so a
// single mouse can stack one note at a time into a chord. Toggle latch off (or panic) to release them.
let latch = false;
const latched = new Set<string>();

const $ = (id: string) => document.getElementById(id)!;

// ── instruments: one surface, many voices ───────────────────────────────────
const overlay = initOverlay($("overlay"));
let viz: Visualizer | null = null;   // assigned once the canvas analyser is wired (forward ref for loop pulses)
const drumInst = new DrumInstrument(
  kit,
  engine.ctx,
  (pad, loop) => overlay.flash(pad, loop),               // flash the cell — loop colour when replayed
  (track, p) => seq.hit(track, p > 0.6),                 // live tap → sequencer (builds the beat when armed)
);
const tombola = new TombolaInstrument(engine);
// Family-grouped order (keyboards → mallet/plucked-synth → strings → brass → rhythmic → sampler).
// Synth stays first (the signature ribbon + the default); Sample is last. F1–F9 map to the first
// nine; the rest are reached via Tab, the 5×3 selector, or the dial keys. This is the single source
// of truth — the selector, grid view, Tab cycle, and F-keys all follow it.
const rack = new InstrumentRack([
  new MelodicInstrument(engine, "synth", "Synth", false, "ribbon"),        // pitch ribbon (the hero)
  new MelodicInstrument(engine, "keys", "Keys", true, "piano"),            // piano keyboard
  new MelodicInstrument(engine, "organ", "Organ", true, "lines-v", 9, 3),  // drawbars (thick columns)
  new MelodicInstrument(engine, "pad", "Pad", false, "lines-h", 5, 3),     // soft sustained bands
  new MelodicInstrument(engine, "bells", "Bells", true, "lattice"),        // bright struck bells
  new MelodicInstrument(engine, "pluck", "Pluck", true, "lines-v", 14, 1), // short plucks down key columns
  new MelodicInstrument(engine, "fm", "FM", true, "lattice"),              // metallic FM cross-lattice
  new MelodicInstrument(engine, "bass", "Bass", true, "strings", 4),       // 4 bass strings
  new MelodicInstrument(engine, "guitar", "Guitar", true, "strings", 6),   // 6 guitar strings
  new MelodicInstrument(engine, "strings", "Strings", false, "lines-h", 9, 1), // bowed orchestral lines
  new MelodicInstrument(engine, "brass", "Brass", true, "valves"),         // trumpet valves
  new ArpInstrument(engine, () => seq.bpm),                                // beat-locked arpeggiator
  drumInst,                                                                // drum kit + 16-step sequencer
  tombola,                                                                 // physics sequencer
  new SamplerInstrument(sampler),                                          // mic sampler — last
]);
// each melodic instrument remembers its OWN sound — switching loads it, switching away saves it.
const MELODIC: InstrumentId[] = ["synth", "keys", "bass", "guitar", "pluck", "pad", "fm", "organ", "strings", "brass", "bells"];
const INST_PRESETS: Partial<Record<InstrumentId, Partial<typeof params>>> = {
  bass:   { octave: -1, morph: 0.62, subLevel: 0.72, subWave: "square", brightness: 0.42, attack: 0.006, release: 0.3, detune: 1, resonance: 3, presetName: "Bass" },
  guitar: { octave: 0, morph: 0.46, subLevel: 0.2, brightness: 0.72, attack: 0.003, release: 0.5, filterEnv: 0.6, filterDecay: 0.18, detune: 6, resonance: 4, presetName: "Guitar" },
  pluck:  { octave: 0, morph: 0.44, subLevel: 0.18, brightness: 0.72, attack: 0.002, release: 0.22, filterEnv: 0.72, filterDecay: 0.12, detune: 3, resonance: 4, presetName: "Pluck" },
  pad:    { octave: 0, morph: 0.5, subLevel: 0.4, brightness: 0.55, attack: 0.28, release: 1.5, detune: 14, vibratoDepth: 0.6, resonance: 3, presetName: "Pad" },
  fm:     { octave: 0, morph: 0.3, fm: 0.55, fmRatio: 3, subLevel: 0.12, brightness: 0.74, attack: 0.003, release: 0.5, detune: 2, resonance: 2, presetName: "FM" },
  organ:  { octave: 0, morph: 0.12, subLevel: 0.3, brightness: 0.62, attack: 0.004, release: 0.12, filterEnv: 0.05, detune: 1, interval: 12, subWave: "sine", fm: 0, vibratoDepth: 0.2, resonance: 1.4, presetName: "Organ" },
  strings:{ octave: 0, morph: 0.55, subLevel: 0.34, brightness: 0.5, attack: 0.32, release: 1.3, detune: 12, subWave: "triangle", fm: 0, vibratoDepth: 0.5, resonance: 1.4, presetName: "Strings" },
  brass:  { octave: 0, morph: 0.52, subLevel: 0.2, brightness: 0.56, attack: 0.06, release: 0.4, detune: 8, interval: 0, subWave: "triangle", fm: 0.06, fmRatio: 1, vibratoDepth: 0.55, resonance: 1.7, presetName: "Brass" },
  bells:  { octave: 1, morph: 0.22, subLevel: 0.1, brightness: 0.82, attack: 0.002, release: 0.7, filterEnv: 0.3, filterDecay: 0.2, detune: 2, subWave: "sine", fm: 0.42, fmRatio: 3.5, vibratoDepth: 0.1, resonance: 2, presetName: "Bells" },
};
const instSounds: Partial<Record<InstrumentId, Record<string, unknown>>> = {};
let prevMelodic: InstrumentId = "synth";

// ── looper: replay routes back through the rack; each layer keeps its sound ──
const VOICE_KEYS = ["morph", "subLevel", "brightness", "attack", "release", "filterEnv", "filterDecay", "glide", "chord", "octave", "detune", "interval", "subOctave", "subWave", "fm", "fmRatio", "noise", "vibratoDepth", "resonance"] as const;
const soundIO = {
  get: (): Record<string, unknown> => Object.fromEntries(VOICE_KEYS.map((k) => [k, params[k]] as [string, unknown])),
  set: (s: Record<string, unknown>) => Object.assign(params, s),
};
// seed each melodic instrument's remembered sound (current params + its character preset)
const snapVoice = (): Record<string, unknown> => soundIO.get();
for (const id of MELODIC) instSounds[id] = { ...snapVoice(), ...(INST_PRESETS[id] ?? {}) };
const looper = new Looper(engine.ctx, () => seq.bpm, {
  fire: (inst, kind, pid, x, y, p) => {
    rack.fire(inst, kind, pid, x, y, p);
    // surface the replayed action on the pad in its LOOP's color (the visualizer colors by the
    // "lp{i}_" id prefix) — so you SEE which layer is playing what, in its own color, stacked.
    if (kind === "up") contacts.delete(pid);
    else contacts.set(pid, { id: pid, x, y, pressure: p });
    // pop a coloured loop-pulse on note onsets so EVERY layer is visible at once, no matter which
    // instrument is active (a drum loop still shows while you play Synth).
    if (kind === "down") { const m = /^lp(\d+)_/.exec(pid); if (m) viz?.loopHit(Number(m[1]), x, y, p); }
  },
  onPerf: (v) => setPerfVisual(v),   // replay a recorded knob sweep (moves the filter + dial, no re-record)
  onDialKey: (loopIdx, slot) => dialWidget.pressColor(slot, loopRgb(loopIdx)),   // replayed press = coloured dial flash
}, 8, soundIO, () => rack.active);   // 8 loop tracks; each remembers the instrument it was recorded with

// ── the surface sink: live play → active instrument + loop capture + MIDI ────
const sink: SurfaceSink = {
  start(c) {
    contacts.set(c.id, c);
    rack.down(c.id, c.x, c.y, c.pressure);
    midi.noteOn(c.id, engine.noteForX(c.x), c.pressure);
    looper.noteOn(c.id, c.x, c.y, c.pressure, rack.active);
  },
  move(c) {
    contacts.set(c.id, c);
    rack.move(c.id, c.x, c.y, c.pressure);
    midi.aftertouch(c.pressure);
    looper.noteMove(c.id, c.x, c.y, c.pressure);
  },
  end(id) {
    // latch holds live notes open (so you can stack a chord with one pointer); they release later
    if (latch && !/^lp\d+_/.test(id)) { latched.add(id); return; }
    contacts.delete(id);
    rack.up(id);
    midi.noteOff(id);
    looper.noteOff(id);
  },
};

// release everything latch is holding open (latch off, panic, or stop)
const releaseLatched = (): void => {
  for (const id of latched) { contacts.delete(id); rack.up(id); midi.noteOff(id); looper.noteOff(id); }
  latched.clear();
};

const panic = (): void => {
  rack.panicAll();
  sampler.releaseAll();
  midi.allOff();
  engine.silence();   // kill reverb/delay tails + any droning filter — a real "make it stop"
  contacts.clear();
  latched.clear();    // panic also drops anything latch was holding open
};

// ── restore the last session ─────────────────────────────────────────────────
loadState();
engine.applyParams();
engine.setBrightness(params.brightness);

// ── trackpad surface (helper bridge) + on-screen pad ────────────────────────
const mouseMode = true;      // a real mouse plays the pad (the default web experience — no trackpad needed).
                             // The trackpad's own "touch"-type pointer events are filtered out in pad.ts, and
                             // in PLAY mode the helper suppresses the cursor, so this only ever means: click to play.
let trackpadPlay = true;     // PLAY mode: the trackpad plays notes + the helper mutes the OS cursor.
                             // NAV mode (false): no notes + cursor freed, so the trackpad navigates the UI.
const canvas = $("pad") as HTMLCanvasElement;
const board = $("board");
// touch plays the pad as a real instrument (multitouch → chords) UNLESS the Magic Trackpad helper
// owns the device — its PTP driver fires phantom cursor-centred "touch" events. No helper running
// (a phone / tablet / the plain web) = touch is the real input, so allow it.
let trackpadConnected = false;
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;   // a touch-first device (phone / tablet)
initPad(canvas, sink, { mouseAllowed: () => mouseMode, touchAllowed: () => !trackpadConnected });

// ── keyboard dynamics: ↑/↓ set the vertical level keys play at (their substitute for the pad's
// up=loud/down=soft axis). The on-pad tick marks it; melodic instruments show the whole guide. ──
let kbdExpr = 0.62;           // 0 = soft/dark (bottom), 1 = loud/bright (top)
const yaTick = document.getElementById("ya-tick");
let exprTimer = 0;
const positionTick = (): void => { if (yaTick) yaTick.style.top = `${(1 - kbdExpr) * 100}%`; };
const setKbdExpr = (v: number): void => {
  kbdExpr = clamp(v, 0, 1);
  positionTick();
  board.classList.add("expr-active");                          // briefly highlight the tick so the change is visible
  window.clearTimeout(exprTimer);
  exprTimer = window.setTimeout(() => board.classList.remove("expr-active"), 900);
};
positionTick();

let settings: SettingsUI;    // forward decl (status callbacks can fire before it's built)
// always-visible top-bar status dots (red = not connected, green = connected) for the 3 devices
const statusDots: Record<string, HTMLElement> = {};
for (const dev of ["trackpad", "dial", "pedal"]) {
  const d = document.createElement("span");
  d.className = "sdot mini";
  $("dev-status").append(d);
  statusDots[dev] = d;
}
// web-only honesty: the Magic Trackpad's multitouch+pressure needs the desktop app + its helper.
// In a plain browser the helper can't connect, so show a subtle note under the trackpad telling
// people to play with mouse/keyboard/touch instead. Hidden in Electron and once the helper is up.
const isElectron = /electron/i.test(navigator.userAgent);
const tpNote = document.createElement("div");
tpNote.className = "tp-web-note";
tpNote.innerHTML = "Magic Trackpad pressure needs the <b>desktop app</b> — on the web, play with mouse, keyboard, or touch.";
document.querySelector(".surface-col .devlabel")?.insertAdjacentElement("afterend", tpNote);

const setDevStatus = (dev: "trackpad" | "dial" | "pedal", s: DeviceStatus): void => {
  settings?.setStatus(dev, s);
  const d = statusDots[dev];
  if (d) { d.className = "sdot mini" + (s.connected ? " on" : ""); d.title = `${dev[0].toUpperCase() + dev.slice(1)}: ${s.label}`; }
  if (dev === "trackpad") {
    trackpadConnected = s.connected;   // gates whether on-screen touch plays (helper present → mute the phantom touches)
    // the "needs the desktop app" note is only for desktop-browser users; hide it on touch devices, where touch just works
    tpNote.classList.toggle("show", !isElectron && !s.connected && !coarsePointer);
  }
};
const devStatus = (dev: "trackpad" | "dial" | "pedal") => (s: DeviceStatus) => setDevStatus(dev, s);
const tpBridge = initTrackpadBridge(sink, devStatus("trackpad"), { enabled: () => trackpadPlay });
// PLAY ↔ NAV: in NAV mode the helper stops eating the cursor so the trackpad works as a normal mouse
// (click the UI) — no second mouse needed. Toggle with the big PLAY/NAV button or F10.
const setPlayMode = (play: boolean): void => {
  trackpadPlay = play;
  if (!play) panic();
  tpBridge.send({ cmd: "suppress", on: play });
  const b = document.getElementById("playmode");
  if (b) { b.classList.toggle("nav", !play); b.textContent = play ? "PLAY" : "NAV (mouse)"; }
};
const playBtn = document.getElementById("playmode");
if (playBtn) playBtn.onclick = () => setPlayMode(!trackpadPlay);

// ── deck: transport + loop tape + context panel ─────────────────────────────
const panel = initPanel($("panel"), { engine, seq, kit, drumInst, sampler, looper, sounds: Object.keys(SOUNDS), onPickSound: (name: string) => pickSound(name), onChange: () => { engine.applyParams(); engine.setBrightness(params.brightness); engine.updateLiveTimbre(); syncChordBtn?.(); saveState(); }, onOverlay: () => overlay.set(rack.overlay()), onCaptureBeat: () => captureBeat() });
// press a loop: cycle it (record → play → mute) AND jump to ITS instrument + target it for sound edits,
// so building the song is loop-by-loop — loop 2 = drums, loop 3 = keys, click to hop between them.
const loopPress = (i: number): void => {
  looper.toggle(i);
  const inst = looper.instOf(i);
  if (inst) { rack.setActive(inst as InstrumentId); panel.setEditTarget(i); }
};
initLoopDeck($("loops"), looper, (i) => String(i + 1), loopPress);

let running = false;
const setRunning = (b: boolean): void => {
  running = b;
  if (b) { if (!seq.playing) seq.start(); looper.setPaused(false); }
  else { if (seq.playing) seq.stop(); looper.setPaused(true); panic(); } // Stop = full stop: groove off, loops frozen, notes + tails killed
  transport.setRunning(b);
};
const toggleRun = (): void => { void engine.resume(); setRunning(!running); };

const firstEmpty = (): number => { for (let i = 0; i < looper.count; i++) if (looper.stateOf(i) === "empty") return i; return -1; };
const lastNonEmpty = (): number => { for (let i = looper.count - 1; i >= 0; i--) if (looper.stateOf(i) !== "empty") return i; return -1; };
// clone the focused loop (the one you're editing, else the last recorded) into the next empty slot
const cloneLoop = (): void => {
  const tgt = panel.editTarget();
  const from = typeof tgt === "number" ? tgt : lastNonEmpty();
  const to = firstEmpty();
  if (from < 0 || to < 0) return;
  if (looper.clone(from, to)) saveState();
};
// turn the current drum STEP PATTERN into a real loop layer (mute / clone / stack it like any loop)
const captureBeat = (): void => {
  void engine.resume();
  const cols = drumInst.gridCols, rows = drumInst.gridRows, padN = cols * rows;
  const sixteenth = 60 / seq.bpm / 4;
  const reps = Math.max(1, Math.round(looper.loopLengthSec() / (seq.length * sixteenth)));
  const events: LoopEvent[] = [];
  let key = 0;
  for (let tr = 0; tr < seq.tracks; tr++) {
    if (tr >= padN) continue;   // no pad maps to this track in the current grid
    const col = tr % cols, row = Math.floor(tr / cols);
    const x = (col + 0.5) / cols, y = (row + 0.5) / rows;
    for (let step = 0; step < seq.length; step++) {
      if (!seq.pattern[tr][step]) continue;
      for (let r = 0; r < reps; r++) {
        const t = (r * seq.length + step) * sixteenth;
        events.push({ t, kind: "down", key, inst: "drums", x, y, p: 0.9 });
        events.push({ t: t + 0.04, kind: "up", key, inst: "drums", x: 0, y: 0, p: 0 });
        key++;
      }
    }
  }
  const slot = firstEmpty();
  if (events.length === 0 || slot < 0) return;
  if (!running) setRunning(true);
  looper.loadEvents(slot, events, "drums");
  saveState();
};
let countingIn = false;
const armRecord = (): void => {
  void engine.resume();
  if (countingIn) return;
  if (looper.recordingSlot() >= 0) { looper.stop(); return; }
  const slot = firstEmpty();
  if (slot < 0) return;
  // COUNT-IN: if you turn on the metronome (Click) and start from stopped, get a 1-bar count so you
  // record in time with the drums; otherwise record immediately (old behaviour).
  if (!running && seq.metronome) {
    setRunning(true);
    countingIn = true;
    window.setTimeout(() => { countingIn = false; if (looper.recordingSlot() < 0 && looper.stateOf(slot) === "empty") looper.record(slot); }, (60 / seq.bpm) * 4 * 1000);
    return;
  }
  if (!running) setRunning(true); // recording needs the clock rolling
  looper.record(slot);
};
const transport = initTransport($("transport"), { running, bpm: seq.bpm, onRun: toggleRun, onRec: armRecord, onTempo: (v) => { seq.bpm = v; saveState(); } });

// giant master VOLUME knob, prepended into the transport row
const volWrap = document.createElement("div");
initKnob(volWrap, { value: params.masterVolume, label: "Vol", size: 72, onChange: (val) => { params.masterVolume = val; engine.applyParams(); saveState(); } });
$("transport").prepend(volWrap);

// (device layout is fixed now: pedal groups with the loop tape; knob sits beside the trackpad.)

// MOBILE layout: the Sound/Mix sliders are a "set once" panel — on a phone you almost never touch
// them while playing, yet as the workspace's right-hand column they'd sit in the MIDDLE of the
// scroll and push the loop tape (the controls you actually use — record / re-record layers) to the
// very bottom. So on a touch device move that one panel to the END of the page; the trackpad, dial,
// and loop tape stay up top in the order you play them. Desktop keeps it as the right-hand column.
const appEl = $("app");
const workspaceEl = document.querySelector(".workspace");
const configEl = document.querySelector(".config");
const coarseMq = window.matchMedia("(pointer: coarse)");
const placeConfig = (): void => {
  if (!appEl || !workspaceEl || !configEl) return;
  if (coarseMq.matches) appEl.appendChild(configEl);     // phone: sliders to the bottom of the scroll
  else workspaceEl.appendChild(configEl);                // desktop: back to the workspace's right column
};
placeConfig();
coarseMq.addEventListener("change", placeConfig);

// ── reactive screen ─────────────────────────────────────────────────────────
let perf = 0;
initScreen($("screen"), () => ({
  instrument: rack.current().name,
  scale: SCALES[params.scaleIndex].name,
  root: NOTE_NAMES[params.root],
  bpm: seq.bpm,
  loops: Array.from({ length: looper.count }, (_, i) => looper.stateOf(i)),
  perf,
  recording: looper.recordingSlot() >= 0,
}));

// ── instrument switch (the headline control) ────────────────────────────────
const instSwitch = initInstSwitch(
  $("inst-switch"),
  rack.list().map((i) => ({ id: i.id, name: i.name })),
  {
    // Sample is always clickable: with no clip yet, selecting it RECORDS from the mic (click again
    // to stop); once a clip exists it plays pitched across the pad (the Purity-Ring vocal-chop move).
    onSelect: (id) => {
      if (id === "sampler") {
        if (sampler.isRecording) { sampler.stop(); instSwitch.setRecording(false); }
        else if (!sampler.hasSample()) { instSwitch.setRecording(true); void sampler.record().catch(() => instSwitch.setRecording(false)); }
      }
      rack.setActive(id);
    },
  },
);
let activeBefore: InstrumentId = rack.active;
rack.onActiveChange((id) => {
  // release any notes still held on the instrument you're LEAVING — otherwise a finger held across
  // a swap can't be released by the new instrument (its voice lived in the old one) → stuck note.
  rack.get(activeBefore)?.panic();
  sampler.releaseAll();
  for (const k of [...contacts.keys()]) if (!/^lp\d+_/.test(k)) contacts.delete(k);  // drop live fingerprints (keep loop ones)
  latched.clear();   // the old instrument's voices were just panicked; forget what latch held there
  activeBefore = id;
  // per-instrument sound memory: save the outgoing melodic voice, load the incoming one
  if (MELODIC.includes(prevMelodic)) instSounds[prevMelodic] = snapVoice();
  if (MELODIC.includes(id) && instSounds[id]) {
    Object.assign(params, instSounds[id]);
    engine.applyParams(); engine.setBrightness(params.brightness);
    prevMelodic = id;
  }
  // Tombola only runs (physics + plays + paints) while it's the active instrument
  tombola.setActive(id === "tombola");
  if (viz) viz.overlayPaint = id === "tombola" ? (ctx, w, h) => tombola.paint(ctx, w, h) : null;
  instSwitch.setActive(id); overlay.set(rack.overlay()); panel.setInstrument(id); panel.refresh(); saveState();
  board.classList.toggle("yaxis-on", MELODIC.includes(id));   // the up=loud/down=soft guide is meaningful for melodic voices
  syncChordBtn?.();   // params.chord is per-instrument — keep the CHORD button in sync after a swap
});
instSwitch.setActive(rack.active);
overlay.set(rack.overlay());
board.classList.toggle("yaxis-on", MELODIC.includes(rack.active));

// ── sound presets — 7 quick ones on the dial keys, the full library browsable in the panel ──
const SOUND_NAMES = DIAL_SOUNDS; // 7 — one per dial key
const setSound = (name: string): void => {
  const snd = SOUNDS[name];
  if (!snd) return;
  const tgt = panel.editTarget();
  if (tgt === "live") {
    Object.assign(params, snd);
    params.presetName = name;
    engine.applyParams();
    engine.setBrightness(params.brightness);
    engine.updateLiveTimbre();   // reshape the note you're holding, not just the next one
  } else {
    looper.editSound(tgt, snd as unknown as Record<string, unknown>);   // perfect THIS loop's sound (applies next pass)
  }
  panel.refresh();
  saveState();
};

// audition the current sound by ear — the dial's 7 keys call this so you can EXPLORE timbres while
// noodling (press a key → hear it instantly), instead of guessing what each one does.
let previewId = 0;
const previewSound = (): void => {
  void engine.resume();
  const id = `preview:${previewId++}`;
  engine.playDegree(id, 4, 0.7);                       // a mid note in the current key, current sound
  window.setTimeout(() => engine.release(id), 380);
};
const pickSound = (name: string): void => { setSound(name); previewSound(); };   // dial-key behaviour

// HOLD the sound keys: hold one and it's that sound; hold several at once and it BLENDS them into a
// new in-between voice (the "make more sounds" move). Release keeps the current sound.
const heldSoundKeys = new Set<number>();
const blendHeldSounds = (): void => {
  const names = [...heldSoundKeys].map((i) => SOUND_NAMES[i]).filter(Boolean);
  if (names.length === 0) return;
  if (names.length === 1) { pickSound(names[0]); return; }
  const sum: Record<string, number> = {}, cnt: Record<string, number> = {};
  for (const name of names) {
    const snd = SOUNDS[name] as unknown as Record<string, unknown>;
    for (const k in snd) { const v = snd[k]; if (typeof v === "number") { sum[k] = (sum[k] ?? 0) + v; cnt[k] = (cnt[k] ?? 0) + 1; } }
  }
  for (const k in sum) (params as unknown as Record<string, unknown>)[k] = sum[k] / cnt[k];
  params.presetName = names.join(" + ");
  engine.applyParams(); engine.setBrightness(params.brightness); engine.updateLiveTimbre();
  panel.refresh(); saveState(); previewSound();
};

// ── DICE — constrained-random re-roll for instant inspiration (always musical) ──
// curated grooves (step indices per track: kick/clap/hat/open/snare/…) so the beat is never garbage
const DICE_SEEDS: number[][][] = [
  [[0, 8], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14], [], [], [], [], []],            // trap
  [[0, 7, 10], [4, 12], [2, 6, 10, 14], [], [], [], [], []],                     // boom bap
  [[0, 4, 8, 12], [], [2, 6, 10, 14], [7, 15], [4, 12], [], [], []],             // four-on-the-floor
  [[0], [8], [0, 4, 8, 12], [], [8], [], [], []],                                // halftime
  [[0, 6, 10], [4, 12], [0, 1, 2, 4, 6, 8, 10, 12, 14], [14], [], [], [], []],   // skippy
];
const dice = (): void => {
  void engine.resume();
  params.scaleIndex = Math.floor(Math.random() * SCALES.length);
  params.root = Math.floor(Math.random() * 12);
  const names = Object.keys(SOUNDS);
  setSound(names[Math.floor(Math.random() * names.length)]);        // also applies params + refresh + save
  seq.setPattern(DICE_SEEDS[Math.floor(Math.random() * DICE_SEEDS.length)]);
  panel.refresh();
  saveState();
};

// ── dial: knob = FX macro + play/stop; 7 keys = the 7 sounds (canonical-mapped) ──
const dialMap = new DialMap();
// setPerfVisual moves the filter + dial WITHOUT recording (used by loop replay); applyPerf is the
// user-driven path that ALSO captures the sweep into the recording loop (knob automation).
const setPerfVisual = (v: number): void => { perf = clamp(v, -1, 1); engine.setPerformanceFilter(perf); dialWidget.setFx(perf); };
const applyPerf = (v: number): void => { setPerfVisual(v); if (looper.recordingSlot() >= 0) looper.recordPerf(perf); };

// hold-key + knob = tweak a SOUND parameter instead of the FX/filter warp. Hold while turning the
// dial: V = reverb, B = brightness, N = noise, M = mod (fm). No key held = the filter warp (default).
const KNOB_MODS: Record<string, { key: "reverb" | "brightness" | "noise" | "fm"; label: string }> = {
  KeyV: { key: "reverb", label: "Reverb" }, KeyB: { key: "brightness", label: "Bright" },
  KeyN: { key: "noise", label: "Noise" }, KeyM: { key: "fm", label: "Mod" },
};
const heldMods: string[] = [];

// PUSH the knob to cycle what TURNING it controls. "Filter" is the recorded DJ sweep;
// the rest are sound macros that reshape the held note live. Held V/B/N/M still override directly.
const KNOB_MODES = [
  { key: "filter", label: "Filter" },
  { key: "brightness", label: "Bright" },
  { key: "reverb", label: "Reverb" },
  { key: "fm", label: "Mod" },
  { key: "noise", label: "Noise" },
] as const;
let knobMode = 0;

// apply a delta to ONE sound param through the edit target, reshaping held notes live
const tweakParam = (key: string, delta: number): void => {
  const tgt = panel.editTarget();
  if (tgt === "live") {
    const v = clamp(Number(params[key as keyof typeof params] as number) + delta, 0, 1);
    (params as unknown as Record<string, unknown>)[key] = v;
    if (key === "brightness") engine.setBrightness(v);
    else if (key === "reverb") engine.applyParams();
    engine.updateLiveTimbre();
  } else {
    const cur = Number(looper.soundOf(tgt)?.[key] ?? params[key as keyof typeof params]);
    looper.editSound(tgt, { [key]: clamp(cur + delta, 0, 1) });
  }
  panel.refresh(); saveState();
};

const knobTurn = (delta: number): void => {
  dialWidget.spin(delta * 300);   // the on-screen knob spins freely with every turn (endless encoder — never stops)
  // held V/B/N/M (one or more) = direct override of those params (a big timbre move)
  if (heldMods.length) {
    const keys = [...new Set(heldMods.map((c) => KNOB_MODS[c]?.key).filter(Boolean))] as string[];
    for (const key of keys) tweakParam(key, delta);
    return;
  }
  // otherwise the knob does its current MODE (push to cycle)
  const m = KNOB_MODES[knobMode];
  if (m.key === "filter") applyPerf(perf + delta);
  else tweakParam(m.key, delta);
};
const cycleKnobMode = (): void => { knobMode = (knobMode + 1) % KNOB_MODES.length; dialWidget.setMode(KNOB_MODES[knobMode].label); };

// ── TAPE STOP whimsy — drag the whole machine to a halt (tempo grinds down, the DJ filter
// closes off, the dial visibly sweeps), then spin it back up. Hold the pedal's middle switch, or
// hold \ on the keyboard. The looper + groove both ride seq.bpm so EVERYTHING slows together. ──
let tapeStopping = false, savedBpm = 0, savedPerf = 0, tapeRAF = 0;
const tapeStop = (on: boolean): void => {
  if (on === tapeStopping) return;
  tapeStopping = on;
  cancelAnimationFrame(tapeRAF);
  if (on) { void engine.resume(); savedBpm = seq.bpm; savedPerf = perf; }
  const fromBpm = seq.bpm, fromPerf = perf;
  const toBpm = on ? Math.max(8, savedBpm * 0.06) : savedBpm;   // grind down to a crawl, then back
  const toPerf = on ? -1 : savedPerf;                            // ...muffling into a lowpass as it stops
  const dur = on ? 650 : 850, t0 = performance.now();
  const ease = on ? (u: number) => 1 - Math.pow(1 - u, 3) : (u: number) => 1 - Math.pow(1 - u, 2);
  const step = (): void => {
    const u = Math.min(1, (performance.now() - t0) / dur), e = ease(u);
    seq.bpm = fromBpm + (toBpm - fromBpm) * e;
    applyPerf(fromPerf + (toPerf - fromPerf) * e);
    transport.syncTempo(seq.bpm);
    if (u < 1) tapeRAF = requestAnimationFrame(step);
    else if (!on) { seq.bpm = savedBpm; applyPerf(savedPerf); transport.syncTempo(seq.bpm); saveState(); }
  };
  step();
};

const dialWidget = initDial($("dial"), {
  onButton: (i) => { if (!SOUND_NAMES[i]) return; heldSoundKeys.add(i); blendHeldSounds(); if (looper.recordingSlot() >= 0) looper.recordKey(i); },  // hold-to-blend + record the press
  onButtonUp: (i) => { heldSoundKeys.delete(i); },
  onPress: () => cycleKnobMode(),   // PUSH the knob = cycle what turning it does (Filter → Bright → …)
  onFx: applyPerf,
});
dialWidget.setLabels(SOUND_NAMES);
dialMap.onProgress = (slot) => dialWidget.learn(slot);
dialMap.onDone = () => dialWidget.learn(null);

const dialBridge = initDialBridge(
  {
    onRotate: (d) => knobTurn(d * 0.08),
    onPress: () => cycleKnobMode(),   // D100H knob press = cycle the knob mode
    onButton: (physical, pressed) => {
      if (dialMap.learning) { if (pressed) dialMap.feed(physical); return; }
      const slot = dialMap.canonical(physical);
      if (pressed) {
        if (SOUND_NAMES[slot]) { heldSoundKeys.add(slot); blendHeldSounds(); }
        if (looper.recordingSlot() >= 0) looper.recordKey(slot);   // capture the D100H press into the loop
        dialWidget.hold(slot, true);   // pressed = lit, and stays lit while you hold it
      } else {
        heldSoundKeys.delete(slot);   // hold-to-blend: release stops blending that key in
        dialWidget.hold(slot, false);
      }
    },
  },
  devStatus("dial"),
);

// ── pedal: hands-free loop control ──────────────────────────────────────────
const pedalView = initPedalView($("pedal"));
pedalView.setLabels(["Rec", "Play", "Undo"]);
// A simple, reliable loop-station — every switch fires on a clean TAP (no hold/tape-stop ambiguity,
// which was breaking play/stop). Foot flow like a Boss-style looper: tap REC to lay a layer, tap
// again to stop; REC auto-advances to the NEXT empty loop each time, so it's your "next" button.
// PLAY toggles everything; UNDO clears the last layer. (Tape-stop lives on the keyboard's \ now.)
const pedalAction = (i: number): void => {
  void engine.resume();
  if (i === 0) armRecord();                                                    // ● Rec / stop — auto-advances to the next layer
  else if (i === 1) toggleRun();                                               // ▶ Play / Stop all loops
  else { const s = lastNonEmpty(); if (s >= 0) looper.clear(s); }              // ⟲ Undo — clear the last layer
};
const pedalDown = (i: number): void => { void engine.resume(); pedalView.press(i); pedalAction(i); };
const pedalUp = (_i: number): void => { /* clean taps only — no hold behaviour */ };
let hidUp = false, sdUp = false;
const pedalCombined = (which: "usb" | "sd") => (s: DeviceStatus): void => {
  if (which === "usb") hidUp = s.connected; else sdUp = s.connected;
  const up = hidUp || sdUp;
  setDevStatus("pedal", { connected: up, label: up ? (sdUp ? "Stream Deck plugin" : "USB") : "not connected" });
};
const pedalHid = initPedal({ onPress: pedalDown, onRelease: pedalUp }, pedalCombined("usb"));
const pedalSd = initPedalBridge({ onPress: pedalDown, onRelease: pedalUp }, pedalCombined("sd"));

// ── settings sheet ──────────────────────────────────────────────────────────
settings = initSettings($("settings-body"), {
  reconnect: (dev) => {
    if (dev === "trackpad") tpBridge.reconnect();
    else if (dev === "dial") dialBridge.reconnect();
    else { pedalHid.reconnect(); pedalSd.reconnect(); }
  },
  dialMap,
  onLearnDial: () => dialMap.startLearn(),
  sampler,
  midi,
});
const settingsEl = $("settings");
const closeSettings = () => settingsEl.classList.remove("open");
$("gear").onclick = () => settingsEl.classList.add("open");
$("settings-close").onclick = closeSettings;
settingsEl.addEventListener("click", (e) => { if (e.target === settingsEl) closeSettings(); });

// enable the Sample instrument once a clip exists
sampler.onLoaded = () => { instSwitch.setRecording(false); instSwitch.setEnabled("sampler", true); rack.setActive("sampler"); };

// visible keybind legend (toggle with / or the KEYS button)
const legend = initLegend($("legend"));
const keysBtn = document.getElementById("keys-btn");
if (keysBtn) keysBtn.onclick = () => legend.toggle();

// GRID / MULTI view — watch every instrument play at once (open with 9 or the grid button; G/Esc close)
const gridView = initGridView($("gridview"), {
  contacts,
  instOfLoop: (i) => looper.instOf(i),
  activeInst: () => rack.active,
  instruments: rack.list().map((i) => ({ id: i.id, name: i.name })),
  beatStep: () => seq.visualStep(),
  loops: () => Array.from({ length: looper.count }, (_, i) => {
    const s = looper.stateOf(i);
    return { loop: i, inst: looper.instOf(i), active: s === "playing" || s === "recording" };
  }),
});
const gridBtn = document.getElementById("grid-btn");
if (gridBtn) gridBtn.onclick = () => gridView.toggle();

// ── save / load a song to a file (params, groove, drums, AND all loops incl. knob automation) ──
const saveProject = (): void => {
  const data = { v: 2, params, bpm: seq.bpm, pattern: seq.snapshot(), drums: kit.getAssignment(), instrument: rack.active, loops: looper.serialize() };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "chumthesizer-song.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const loadProject = (file: File): void => {
  void file.text().then((txt) => {
    try {
      const s = JSON.parse(txt);
      if (s.params && typeof s.params === "object") Object.assign(params, s.params);
      if (typeof s.bpm === "number") seq.bpm = clamp(s.bpm, 40, 240);
      if (Array.isArray(s.pattern)) seq.restore(s.pattern);
      if (Array.isArray(s.drums)) kit.setAssignment(s.drums);
      if (Array.isArray(s.loops)) looper.load(s.loops);
      if (typeof s.instrument === "string") rack.setActive(s.instrument as InstrumentId);
      engine.applyParams(); engine.setBrightness(params.brightness); panel.refresh(); saveState();
    } catch { /* ignore a bad file */ }
  });
};
const saveBtn = document.getElementById("save-btn");
if (saveBtn) saveBtn.onclick = saveProject;
// video export — record the trackpad canvas + audio to a .webm clip
const vidBtn = document.getElementById("vid-btn");
const videoRec = initVideoRecorder(canvas, engine.recordStream, (rec) => { if (vidBtn) vidBtn.classList.toggle("rec-on", rec); });
if (vidBtn) vidBtn.onclick = () => videoRec.toggle();
const loadBtn = document.getElementById("load-btn");
const loadFile = document.getElementById("load-file") as HTMLInputElement | null;
if (loadBtn && loadFile) { loadBtn.onclick = () => loadFile.click(); loadFile.onchange = () => { const f = loadFile.files && loadFile.files[0]; if (f) loadProject(f); loadFile.value = ""; }; }

// ── visuals: finger dots + analyser + the shark ─────────────────────────────
viz = new Visualizer(canvas, engine.analyserNode, contacts, seq, () => looper.recordingSlot());
let chordFindOn = false;   // "find chords" guide (0 or the CHORDS button) — melodic instruments only
const toggleChords = (): void => { chordFindOn = !chordFindOn; const b = document.getElementById("chords-btn"); if (b) b.classList.toggle("on", chordFindOn); };
const chordsBtn = document.getElementById("chords-btn");
if (chordsBtn) chordsBtn.onclick = toggleChords;

// CHORD mode — one note/click plays a full scale triad (engine.degreesFor reads params.chord). The
// button mirrors params.chord, which is per-instrument, so re-sync it whenever the instrument changes.
const chordBtn = document.getElementById("chord-btn");
const syncChordBtn = (): void => { if (chordBtn) chordBtn.classList.toggle("on", !!params.chord); };
const toggleChordMode = (): void => { params.chord = !params.chord; panel.refresh(); syncChordBtn(); saveState(); };
if (chordBtn) chordBtn.onclick = toggleChordMode;
syncChordBtn();

// LATCH — sustain notes so a single mouse can stack a chord; toggle off (or panic) to release them.
const latchBtn = document.getElementById("latch-btn");
const setLatch = (on: boolean): void => {
  latch = on;
  if (!on) releaseLatched();
  if (latchBtn) latchBtn.classList.toggle("on", on);
};
if (latchBtn) latchBtn.onclick = () => setLatch(!latch);
viz.chordFind = () => chordFindOn;
viz.melodicActive = () => MELODIC.includes(rack.active);
viz.start();
// the shark chases your LIVE fingers (visits each one); falls back to the cursor when idle
const shark = initShark({
  shark: $("shark"),
  tank: $("tank"),
  fingers: () => [...contacts.values()].filter((c) => !/^lp\d+_/.test(c.id)).map((c) => ({ x: c.x, y: c.y })),
  followCursor: true,
});

// light the overlay key/cell under every finger (live + replayed) — pressed = lit, held = stays lit
const litLoop = (): void => {
  overlay.setHeld([...contacts.values()].map((c) => ({ x: c.x, y: c.y })));
  requestAnimationFrame(litLoop);
};
requestAnimationFrame(litLoop);

// the shark DANCES on every downbeat (a little bob, via a CSS keyframe on the tank)
const tankEl = $("tank");
let lastBeat = -1;
const sharkDance = (): void => {
  const step = seq.visualStep();
  if (step < 0) lastBeat = -1;
  else if (step % 4 === 0 && step !== lastBeat) {
    lastBeat = step;
    tankEl.classList.remove("beat"); void tankEl.offsetWidth; tankEl.classList.add("beat");
  }
  requestAnimationFrame(sharkDance);
};
requestAnimationFrame(sharkDance);

// jaws easter egg
let egg = "";
window.addEventListener("keydown", (e) => {
  if (e.key.length !== 1) return;
  egg = (egg + e.key.toLowerCase()).slice(-4);
  if (egg === "jaws") shark.frenzy(8000);
});

// hidden easter egg: click the logo 5× → the shark breaks loose and swims the whole app
let logoClicks = 0, logoTimer = 0;
const logoEl = document.querySelector(".logo");
if (logoEl) logoEl.addEventListener("click", () => {
  logoClicks++;
  window.clearTimeout(logoTimer); logoTimer = window.setTimeout(() => { logoClicks = 0; }, 1200);
  if (logoClicks >= 5) { logoClicks = 0; document.body.classList.toggle("shark-loose"); requestAnimationFrame(() => shark.relayout()); }
});

// ── computer keyboard: play the active instrument + loop keys 1–8 ───────────
const KBD: Record<string, number> = {
  KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyG: 4, KeyH: 5, KeyJ: 6, KeyK: 7, KeyL: 8, Semicolon: 9,
  KeyQ: 10, KeyW: 11, KeyE: 12, KeyR: 13, KeyT: 14, KeyY: 15, KeyU: 16, KeyI: 17, KeyO: 18, KeyP: 19,
};
const MAXDEG = 19;
const heldKbd = new Set<string>();
// panic-on-blur kills the audio, but a key/mod physically released while we're unfocused never
// delivers its keyup — so forget what's "held" too, or that note key goes dead (heldKbd.has → return)
// and a stuck V/B/N/M keeps hijacking the dial. Pair this with panic() at every "make it stop" site.
const releaseHeld = (): void => { heldKbd.clear(); heldMods.length = 0; };
const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && !!e.target.closest("input, select, textarea");

window.addEventListener("keydown", (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey) return;
  if (e.code === "Escape") { closeSettings(); legend.close(); gridView.close(); return; }
  // G exits the grid view too (you're not playing the pad in grid view, so G is free to close it —
  // matches the "G" people expect from the tooltip/docs without stealing the G note key in normal play).
  if (e.code === "KeyG" && gridView.isOpen()) { e.preventDefault(); gridView.close(); return; }
  if (typing(e)) return;

  // loop keys 1–8 (Shift = clear that loop)
  if (/^Digit[1-8]$/.test(e.code)) { e.preventDefault(); const i = Number(e.code.slice(5)) - 1; if (e.shiftKey) looper.clear(i); else loopPress(i); return; }

  // note keys → the active instrument (records into the armed loop, like the trackpad)
  const deg = KBD[e.code];
  if (deg !== undefined) {
    e.preventDefault();
    if (heldKbd.has(e.code)) return;
    heldKbd.add(e.code);
    // play at the keyboard's expression level (↑/↓): high = loud/bright (top of the pad), low = soft/dark
    sink.start({ id: `kbd:${e.code}`, x: deg / MAXDEG, y: 1 - kbdExpr, pressure: 0.18 + kbdExpr * 0.8 });
    return;
  }

  // hold a knob-mod key (V/B/N/M); the dial knob then tweaks that param instead of the filter
  if (KNOB_MODS[e.code]) { e.preventDefault(); if (!heldMods.includes(e.code)) heldMods.push(e.code); return; }

  // F1…F9 — jump to the first nine instruments (Synth Keys Organ Pad Bells Pluck FM Bass Guitar);
  // the rest (Strings Brass Arp Drums Tombola Sample) are reached via Tab or the 5×3 selector.
  // This follows the rack order in main.ts — see KEYBINDS.md for the full, authoritative map.
  const fk = /^F([1-9])$/.exec(e.code);
  if (fk) { const inst = rack.list()[Number(fk[1]) - 1]; if (inst) { e.preventDefault(); rack.setActive(inst.id); } return; }

  switch (e.code) {
    case "Space": case "Enter": e.preventDefault(); toggleRun(); break;     // play / stop
    case "Backquote": e.preventDefault(); armRecord(); break;               // record next loop
    case "Backspace": e.preventDefault(); panic(); releaseHeld(); break;  // panic — all notes off
    case "Delete": e.preventDefault(); { const s = lastNonEmpty(); if (s >= 0) looper.clear(s); } break; // undo last loop (= pedal Undo)
    case "Tab": e.preventDefault(); rack.cycle(e.shiftKey ? -1 : 1); break; // next/prev instrument
    case "KeyX": dice(); break;                                             // re-roll
    case "KeyZ": applyPerf(perf - 0.1); break;                              // filter sweep down
    case "KeyC": applyPerf(perf + 0.1); break;                              // filter sweep up
    case "Backslash": e.preventDefault(); tapeStop(true); break;            // hold = tape-stop (release spins back up)
    case "Slash": e.preventDefault(); legend.toggle(); break;              // keybind legend
    case "BracketLeft": params.octave = Math.max(-3, params.octave - 1); panel.refresh(); saveState(); break;
    case "BracketRight": params.octave = Math.min(3, params.octave + 1); panel.refresh(); saveState(); break;
    case "Comma": params.scaleIndex = (params.scaleIndex - 1 + SCALES.length) % SCALES.length; panel.refresh(); saveState(); break;  // scale −
    case "Period": params.scaleIndex = (params.scaleIndex + 1) % SCALES.length; panel.refresh(); saveState(); break;                  // scale +
    case "Minus": params.root = (params.root + 11) % 12; panel.refresh(); saveState(); break;     // key −
    case "Equal": params.root = (params.root + 1) % 12; panel.refresh(); saveState(); break;       // key +
    case "Quote": cloneLoop(); break;                                       // clone the focused loop into the next empty slot
    case "ArrowUp": e.preventDefault(); setKbdExpr(kbdExpr + 0.12); break;   // keyboard dynamics: louder / brighter
    case "ArrowDown": e.preventDefault(); setKbdExpr(kbdExpr - 0.12); break; // keyboard dynamics: softer / darker
    case "Digit9": e.preventDefault(); gridView.toggle(); break;            // grid / multi view (also the grid button)
    case "Digit0": e.preventDefault(); toggleChords(); break;               // find-chords guide
    case "F10": e.preventDefault(); setPlayMode(!trackpadPlay); break;      // PLAY <-> NAV (free the mouse)
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Backslash") tapeStop(false);   // release the tape-stop → spin back up to tempo
  const mi = heldMods.indexOf(e.code); if (mi >= 0) heldMods.splice(mi, 1);
  if (KBD[e.code] === undefined) return;
  heldKbd.delete(e.code);
  sink.end(`kbd:${e.code}`);
});

// ── transport state mirror (rec arm light) ──────────────────────────────────
const syncDeck = (): void => {
  const rec = looper.recordingSlot();
  transport.setRec(rec >= 0);
  // ring the dial in the colour of the loop currently RECORDING, else the first PLAYING loop
  let colorSlot = rec;
  if (colorSlot < 0) { for (let i = 0; i < looper.count; i++) if (looper.stateOf(i) === "playing") { colorSlot = i; break; } }
  dialWidget.setLoopColor(colorSlot >= 0 ? loopRgb(colorSlot) : null);
  requestAnimationFrame(syncDeck);
};
requestAnimationFrame(syncDeck);

// ── self-test / automation control API (window.__chum) ───────────────────────
// Drive the app programmatically — every method takes the SAME path a real input would, so a
// headless instance can emulate presses + play + record and the result can be screenshotted /
// verified without a human. (Also the hook a future live control bridge would use.)
let ctlSeq = 0;
(window as unknown as Record<string, unknown>).__chum = {
  play: () => toggleRun(),
  stop: () => { if (running) setRunning(false); },
  setRunning: (b: boolean) => setRunning(b),
  rec: () => armRecord(),
  loop: (i: number) => looper.toggle(i),
  clearLoop: (i: number) => looper.clear(i),
  clearAll: () => looper.clearAll(),
  instrument: (id: string) => rack.setActive(id as InstrumentId),
  cycleInstrument: (d = 1) => rack.cycle(d),
  dialKey: (slot: number) => { const n = SOUND_NAMES[slot]; if (n) pickSound(n); if (looper.recordingSlot() >= 0) looper.recordKey(slot); dialWidget.press(slot); },
  pedal: (i: number) => pedalAction(i),
  captureBeat: () => captureBeat(),                 // bake the step pattern into a loop layer
  setStep: (tr: number, st: number) => seq.toggleStep(tr, st),
  tapeStop: (on: boolean) => tapeStop(on),
  sound: (name: string) => setSound(name),
  chord: (on: boolean) => { params.chord = !!on; panel.refresh(); syncChordBtn(); saveState(); },   // chord mode: one finger → a full chord
  latch: (on: boolean) => setLatch(on),                                              // sustain: stack a chord with one pointer
  chordGuide: () => toggleChords(),                                                   // the find-chords guide overlay
  grid: () => gridView.toggle(),
  dialTurn: (d: number) => applyPerf(perf + d),
  knobTurn: (d: number) => knobTurn(d),
  holdMod: (code: string, on: boolean) => { const i = heldMods.indexOf(code); if (on && i < 0) heldMods.push(code); else if (!on && i >= 0) heldMods.splice(i, 1); },
  setPerf: (v: number) => applyPerf(v),
  bpm: (v: number) => { seq.bpm = v; },
  // play a note at x (0..1) for ms — routes through the active instrument + the armed loop
  note: (x: number, ms = 220, p = 0.7) => { const id = `ctl:${ctlSeq++}`; sink.start({ id, x, y: 0.45, pressure: p }); window.setTimeout(() => sink.end(id), ms); },
  // tap at (x,y) — drums; short
  tap: (x: number, y: number, ms = 110, p = 0.85) => { const id = `ctl:${ctlSeq++}`; sink.start({ id, x, y, pressure: p }); window.setTimeout(() => sink.end(id), ms); },
  // gesture primitives for scripted holds/slides
  down: (key: string, x: number, y: number, p = 0.8) => sink.start({ id: `ctl:${key}`, x, y, pressure: p }),
  moveTo: (key: string, x: number, y: number, p = 0.8) => sink.move({ id: `ctl:${key}`, x, y, pressure: p }),
  release: (key: string) => sink.end(`ctl:${key}`),
  panic: () => panic(),
  contacts: () => [...contacts.values()].map((c) => ({ id: c.id, x: c.x, y: c.y, p: c.pressure })),   // live voices (for multitouch tests)
  dice: () => dice(),
  state: () => ({ running, instrument: rack.active, perf, bpm: seq.bpm, sound: params.presetName, rec: looper.recordingSlot(), loops: Array.from({ length: looper.count }, (_, i) => looper.stateOf(i)), loopInsts: Array.from({ length: looper.count }, (_, i) => looper.instOf(i)) }),
};

// ── drop held notes when the window loses focus / hides ─────────────────────
window.addEventListener("blur", () => { panic(); releaseHeld(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { panic(); releaseHeld(); } });

// ── start audio + clear the hint on first interaction ───────────────────────
const kick = (): void => {
  void engine.resume();
  document.body.classList.add("started");
  window.removeEventListener("pointerdown", kick);
  window.removeEventListener("keydown", kick);
};
window.addEventListener("pointerdown", kick);
window.addEventListener("keydown", kick);

// ── F12 debug overlay (live contacts) ─────────────────────────────────────────
const dbg = document.createElement("div");
dbg.id = "tpdebug";
document.body.append(dbg);
let debugOn = false;
window.addEventListener("keydown", (e) => { if (e.code === "F12") { debugOn = !debugOn; dbg.classList.toggle("on", debugOn); e.preventDefault(); } });
const paintDebug = (): void => {
  if (debugOn) {
    const rows = [...contacts.values()].map((c) => `${c.id}  x=${c.x.toFixed(3)} y=${c.y.toFixed(3)} p=${c.pressure.toFixed(2)}`);
    dbg.textContent = "F12 — live contacts:\n" + (rows.length ? rows.join("\n") : "(none)");
  }
  requestAnimationFrame(paintDebug);
};
requestAnimationFrame(paintDebug);

// ── persistence ──────────────────────────────────────────────────────────────
const STORE_KEY = "chumthesizer.v2"; // bumped: ship the clean defaults + new kit (old saved state is ignored)
function loadState(): void {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.params && typeof s.params === "object") Object.assign(params, s.params);
    if (typeof s.bpm === "number") seq.bpm = clamp(s.bpm, 40, 240);
    if (Array.isArray(s.pattern)) seq.restore(s.pattern);
    if (Array.isArray(s.drums)) kit.setAssignment(s.drums);
    if (typeof s.instrument === "string") queueMicrotask(() => rack.setActive(s.instrument as InstrumentId));
  } catch { /* ignore */ }
}
function saveState(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ params, bpm: seq.bpm, pattern: seq.snapshot(), drums: kit.getAssignment(), instrument: rack.active }));
  } catch { /* ignore */ }
}
setInterval(saveState, 2500);
window.addEventListener("beforeunload", saveState);

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
