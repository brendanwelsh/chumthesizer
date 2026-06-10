import "./styles.css";
import type { Contact, SurfaceSink, DeviceStatus } from "./types";
import { params } from "./state";
import { Engine } from "./audio/engine";
import { DrumKit } from "./audio/drums";
import { Sequencer } from "./audio/sequencer";
import { MidiOut } from "./audio/midi";
import { Sampler } from "./audio/sampler";
import { SOUNDS } from "./audio/sounds";
import { SCALES, NOTE_NAMES } from "./audio/scales";

import { Looper } from "./loop/looper";
import { InstrumentRack } from "./instruments/rack";
import { SynthInstrument } from "./instruments/synth";
import { KeysInstrument } from "./instruments/keys";
import { DrumInstrument } from "./instruments/drumpad";
import { SamplerInstrument } from "./instruments/sampler-inst";
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

// ── core audio ──────────────────────────────────────────────────────────────
const engine = new Engine();
const kit = new DrumKit(engine.ctx, engine.drumBus);
const seq = new Sequencer(engine.ctx, kit);
const midi = new MidiOut();
const sampler = new Sampler(engine.ctx, engine.drumBus);
const contacts = new Map<string, Contact>();

const $ = (id: string) => document.getElementById(id)!;

// ── instruments: one surface, many voices ───────────────────────────────────
const overlay = initOverlay($("overlay"));
const drumInst = new DrumInstrument(kit, engine.ctx, (pad) => overlay.flash(pad));
const rack = new InstrumentRack([
  new SynthInstrument(engine),
  new KeysInstrument(engine),
  drumInst,
  new SamplerInstrument(sampler),
]);

// ── looper: replay routes back through the rack; each layer keeps its sound ──
const VOICE_KEYS = ["morph", "subLevel", "brightness", "attack", "release", "filterEnv", "filterDecay", "glide", "chord", "octave", "detune", "interval", "subOctave", "subWave", "fm", "fmRatio", "noise", "vibratoDepth", "resonance"] as const;
const soundIO = {
  get: (): Record<string, unknown> => Object.fromEntries(VOICE_KEYS.map((k) => [k, params[k]] as [string, unknown])),
  set: (s: Record<string, unknown>) => Object.assign(params, s),
};
const looper = new Looper(engine.ctx, () => seq.bpm, {
  fire: (inst, kind, pid, x, y, p) => {
    rack.fire(inst, kind, pid, x, y, p);
    // surface the replayed action on the pad in its LOOP's color (the visualizer colors by the
    // "lp{i}_" id prefix) — so you SEE which layer is playing what, in its own color, stacked.
    if (kind === "up") contacts.delete(pid);
    else contacts.set(pid, { id: pid, x, y, pressure: p });
  },
}, 6, soundIO);

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
    contacts.delete(id);
    rack.up(id);
    midi.noteOff(id);
    looper.noteOff(id);
  },
};

const panic = (): void => {
  rack.panicAll();
  sampler.releaseAll();
  midi.allOff();
  engine.silence();   // kill reverb/delay tails + any droning filter — a real "make it stop"
  contacts.clear();
};

// ── restore the last session ─────────────────────────────────────────────────
loadState();
engine.applyParams();
engine.setBrightness(params.brightness);

// ── trackpad surface (helper bridge) + on-screen pad ────────────────────────
let mouseMode = false;       // a real mouse can play the pad (off by default)
const trackpadPlay = true;   // the trackpad plays notes (the helper also mutes the OS mouse)
const canvas = $("pad") as HTMLCanvasElement;
initPad(canvas, sink, { mouseAllowed: () => mouseMode });

let settings: SettingsUI;    // forward decl (status callbacks can fire before it's built)
const devStatus = (dev: "trackpad" | "dial" | "pedal") => (s: DeviceStatus) => settings?.setStatus(dev, s);
const tpBridge = initTrackpadBridge(sink, devStatus("trackpad"), { enabled: () => trackpadPlay });

// ── deck: transport + loop tape + context panel ─────────────────────────────
const panel = initPanel($("panel"), { engine, seq, kit, looper, onChange: () => { engine.applyParams(); engine.setBrightness(params.brightness); saveState(); } });
initLoopDeck($("loops"), looper, (i) => String(i + 1));

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
const armRecord = (): void => {
  void engine.resume();
  if (looper.recordingSlot() >= 0) { looper.stop(); return; }
  const slot = firstEmpty();
  if (slot < 0) return;
  if (!running) setRunning(true); // recording needs the clock rolling
  looper.record(slot);
};
const transport = initTransport($("transport"), { running, bpm: seq.bpm, onRun: toggleRun, onRec: armRecord, onTempo: (v) => { seq.bpm = v; saveState(); } });

// giant master VOLUME knob, prepended into the transport row
const volWrap = document.createElement("div");
initKnob(volWrap, { value: params.masterVolume, label: "Vol", size: 72, onChange: (val) => { params.masterVolume = val; engine.applyParams(); saveState(); } });
$("transport").prepend(volWrap);

// device REORDER — rotate the 3 device columns' positions (persisted). All 3 are equal-sized.
const DEVICE_COLS = ["dial-col", "surface-col", "pedal-col"];
let deviceOrder: number[] = loadDeviceOrder();
const applyDeviceOrder = (): void => {
  deviceOrder.forEach((devIdx, pos) => {
    const el = document.querySelector("." + DEVICE_COLS[devIdx]) as HTMLElement | null;
    if (el) el.style.order = String(pos);
  });
};
applyDeviceOrder();
const reorderBtn = document.getElementById("reorder");
if (reorderBtn) reorderBtn.onclick = () => { deviceOrder = [deviceOrder[2], deviceOrder[0], deviceOrder[1]]; applyDeviceOrder(); saveDeviceOrder(); };
function loadDeviceOrder(): number[] {
  try { const r = localStorage.getItem("chum-1.devorder"); if (r) { const a = JSON.parse(r); if (Array.isArray(a) && a.length === 3) return a as number[]; } } catch { /* ignore */ }
  return [0, 1, 2];
}
function saveDeviceOrder(): void { try { localStorage.setItem("chum-1.devorder", JSON.stringify(deviceOrder)); } catch { /* ignore */ } }

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
  { onSelect: (id) => rack.setActive(id), enabled: (id) => id !== "sampler" || sampler.hasSample() },
);
rack.onActiveChange((id) => { instSwitch.setActive(id); overlay.set(rack.overlay()); saveState(); });
instSwitch.setActive(rack.active);
overlay.set(rack.overlay());

// ── sound presets (the 7 dial keys) ─────────────────────────────────────────
const SOUND_NAMES = Object.keys(SOUNDS); // 7 — one per dial key
const setSound = (name: string): void => {
  const snd = SOUNDS[name];
  if (!snd) return;
  Object.assign(params, snd);
  params.presetName = name;
  engine.applyParams();
  engine.setBrightness(params.brightness);
  panel.refresh();
  saveState();
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
const applyPerf = (v: number): void => { perf = clamp(v, -1, 1); engine.setPerformanceFilter(perf); dialWidget.setFx(perf); };
const dialWidget = initDial($("dial"), {
  onButton: (i) => { const name = SOUND_NAMES[i]; if (name) setSound(name); },  // on-screen click = canonical slot
  onPress: toggleRun,
  onFx: applyPerf,
});
dialWidget.setLabels(SOUND_NAMES);
dialMap.onProgress = (slot) => dialWidget.learn(slot);
dialMap.onDone = () => dialWidget.learn(null);

const dialBridge = initDialBridge(
  {
    onRotate: (d) => applyPerf(perf + d * 0.08),
    onPress: toggleRun,
    onButton: (physical, pressed) => {
      if (!pressed) return;
      if (dialMap.learning) { dialMap.feed(physical); return; }
      const slot = dialMap.canonical(physical);
      const name = SOUND_NAMES[slot];
      if (name) setSound(name);
      dialWidget.press(slot);
    },
  },
  devStatus("dial"),
);

// ── pedal: hands-free loop control ──────────────────────────────────────────
const pedalView = initPedalView($("pedal"));
pedalView.setLabels(["Record", "Play", "Undo"]);
const pedalPress = (i: number): void => {
  void engine.resume();
  pedalView.press(i);
  if (i === 0) armRecord();
  else if (i === 1) toggleRun();
  else if (i === 2) { const s = lastNonEmpty(); if (s >= 0) looper.clear(s); }
};
let hidUp = false, sdUp = false;
const pedalCombined = (which: "usb" | "sd") => (s: DeviceStatus): void => {
  if (which === "usb") hidUp = s.connected; else sdUp = s.connected;
  const up = hidUp || sdUp;
  settings?.setStatus("pedal", { connected: up, label: up ? (sdUp ? "Stream Deck plugin" : "USB") : "not connected" });
};
const pedalHid = initPedal({ onPress: pedalPress, onRelease: () => {} }, pedalCombined("usb"));
const pedalSd = initPedalBridge({ onPress: pedalPress, onRelease: () => {} }, pedalCombined("sd"));

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
sampler.onLoaded = () => { instSwitch.setEnabled("sampler", true); };

// visible keybind legend (toggle with /)
const legend = initLegend($("legend"));

// ── visuals: finger dots + analyser + the shark ─────────────────────────────
new Visualizer(canvas, engine.analyserNode, contacts, seq).start();
const shark = initShark();

// jaws easter egg
let egg = "";
window.addEventListener("keydown", (e) => {
  if (e.key.length !== 1) return;
  egg = (egg + e.key.toLowerCase()).slice(-4);
  if (egg === "jaws") shark.frenzy(8000);
});

// ── computer keyboard: play the active instrument + loop keys 1–6 ───────────
const KBD: Record<string, number> = {
  KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyG: 4, KeyH: 5, KeyJ: 6, KeyK: 7, KeyL: 8, Semicolon: 9,
  KeyQ: 10, KeyW: 11, KeyE: 12, KeyR: 13, KeyT: 14, KeyY: 15, KeyU: 16, KeyI: 17, KeyO: 18, KeyP: 19,
};
const MAXDEG = 19;
const heldKbd = new Set<string>();
const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest("input, select, textarea");

window.addEventListener("keydown", (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey) return;
  if (e.code === "Escape") { closeSettings(); legend.close(); return; }
  if (typing(e)) return;

  // loop keys 1–6 (Shift = clear that loop)
  if (/^Digit[1-6]$/.test(e.code)) { e.preventDefault(); const i = Number(e.code.slice(5)) - 1; if (e.shiftKey) looper.clear(i); else looper.toggle(i); return; }

  // note keys → the active instrument (records into the armed loop, like the trackpad)
  const deg = KBD[e.code];
  if (deg !== undefined) {
    e.preventDefault();
    if (heldKbd.has(e.code)) return;
    heldKbd.add(e.code);
    sink.start({ id: `kbd:${e.code}`, x: deg / MAXDEG, y: 0.45, pressure: 0.72 });
    return;
  }

  switch (e.code) {
    case "Space": case "Enter": e.preventDefault(); toggleRun(); break;     // play / stop
    case "Backquote": e.preventDefault(); armRecord(); break;               // record next loop
    case "Backspace": e.preventDefault(); panic(); heldKbd.clear(); break;  // panic
    case "Tab": e.preventDefault(); rack.cycle(e.shiftKey ? -1 : 1); break; // next/prev instrument
    case "KeyX": dice(); break;                                             // re-roll
    case "KeyZ": applyPerf(perf - 0.1); break;                              // filter sweep down
    case "KeyC": applyPerf(perf + 0.1); break;                              // filter sweep up
    case "Slash": e.preventDefault(); legend.toggle(); break;              // keybind legend
    case "BracketLeft": params.octave = Math.max(-3, params.octave - 1); panel.refresh(); saveState(); break;
    case "BracketRight": params.octave = Math.min(3, params.octave + 1); panel.refresh(); saveState(); break;
  }
});
window.addEventListener("keyup", (e) => {
  if (KBD[e.code] === undefined) return;
  heldKbd.delete(e.code);
  sink.end(`kbd:${e.code}`);
});

// ── transport state mirror (rec arm light) ──────────────────────────────────
const syncDeck = (): void => {
  transport.setRec(looper.recordingSlot() >= 0);
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
  dialKey: (slot: number) => { const n = SOUND_NAMES[slot]; if (n) setSound(n); dialWidget.press(slot); },
  pedal: (i: number) => pedalPress(i),
  sound: (name: string) => setSound(name),
  dialTurn: (d: number) => applyPerf(perf + d),
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
  dice: () => dice(),
  state: () => ({ running, instrument: rack.active, perf, bpm: seq.bpm, sound: params.presetName, loops: Array.from({ length: looper.count }, (_, i) => looper.stateOf(i)) }),
};

// ── drop held notes when the window loses focus / hides ─────────────────────
window.addEventListener("blur", panic);
document.addEventListener("visibilitychange", () => { if (document.hidden) panic(); });

// ── start audio + clear the hint on first interaction ───────────────────────
const kick = (): void => {
  void engine.resume();
  document.body.classList.add("started");
  window.removeEventListener("pointerdown", kick);
  window.removeEventListener("keydown", kick);
};
window.addEventListener("pointerdown", kick);
window.addEventListener("keydown", kick);

// ── F2 debug overlay ─────────────────────────────────────────────────────────
const dbg = document.createElement("div");
dbg.id = "tpdebug";
document.body.append(dbg);
let debugOn = false;
window.addEventListener("keydown", (e) => { if (e.code === "F2") { debugOn = !debugOn; dbg.classList.toggle("on", debugOn); e.preventDefault(); } });
const paintDebug = (): void => {
  if (debugOn) {
    const rows = [...contacts.values()].map((c) => `${c.id}  x=${c.x.toFixed(3)} y=${c.y.toFixed(3)} p=${c.pressure.toFixed(2)}`);
    dbg.textContent = "F2 — live contacts:\n" + (rows.length ? rows.join("\n") : "(none)");
  }
  requestAnimationFrame(paintDebug);
};
requestAnimationFrame(paintDebug);

// ── persistence ──────────────────────────────────────────────────────────────
const STORE_KEY = "chum-1.v2"; // bumped: ship the clean defaults + new kit (old saved state is ignored)
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
