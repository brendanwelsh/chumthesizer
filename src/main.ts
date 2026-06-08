import "./styles.css";
import type { Contact, SurfaceSink, DeviceStatus } from "./types";
import { params } from "./state";
import { Engine } from "./audio/engine";
import { DrumKit } from "./audio/drums";
import { Sequencer } from "./audio/sequencer";
import { PRESETS, applyPreset } from "./audio/presets";
import { initPad } from "./input/pad";
import { initKeyboard } from "./input/keyboard";
import { Visualizer } from "./ui/visualizer";
import { initControls } from "./ui/controls";
import { initBeat } from "./ui/beat";
import { connectTrackpad, restoreTrackpad } from "./input/trackpad";
import { connectDial, restoreDial } from "./input/dial";
import { MidiOut } from "./audio/midi";

const engine = new Engine();
const kit = new DrumKit(engine.ctx, engine.drumBus);
const seq = new Sequencer(engine.ctx, kit);
const midi = new MidiOut();
const contacts = new Map<string, Contact>();

// restore the last session (or fall back to the default preset + groove)
loadState();
engine.applyParams();
engine.setBrightness(params.brightness);

const sink: SurfaceSink = {
  start(c) { contacts.set(c.id, c); engine.playXY(c.id, c.x, c.y, c.pressure); midi.noteOn(c.id, engine.noteForX(c.x), c.pressure); },
  move(c) { contacts.set(c.id, c); engine.updateXY(c.id, c.x, c.y, c.pressure); midi.aftertouch(c.pressure); },
  end(id) { contacts.delete(id); engine.release(id); midi.noteOff(id); },
};

const panic = () => { engine.releaseAll(); midi.allOff(); };

const canvas = document.getElementById("pad") as HTMLCanvasElement;
initPad(canvas, sink);

const { refresh } = initControls(document.getElementById("controls")!, engine);
const beat = initBeat(document.getElementById("beat")!, seq);

const transport = () => { void engine.resume(); seq.toggle(); };

const cyclePreset = (dir: number) => {
  const idx = PRESETS.findIndex((p) => p.name === params.presetName);
  const next = (((idx < 0 ? 0 : idx) + dir) % PRESETS.length + PRESETS.length) % PRESETS.length;
  applyPreset(PRESETS[next]);
  engine.applyParams();
  engine.setBrightness(params.brightness);
  refresh();
};

initKeyboard({
  engine,
  visualOn: (id, x, pressure) => contacts.set(id, { id, x, y: 0.4, pressure }),
  visualOff: (id) => contacts.delete(id),
  refresh,
  onPad: (i) => { void engine.resume(); beat.hit(i); },
  onTransport: transport,
  onPreset: cyclePreset,
  onNoteOn: (id, note, pressure) => midi.noteOn(id, note, pressure),
  onNoteOff: (id) => midi.noteOff(id),
  onPanic: panic,
});

// ── MIDI-out controls (lazy: only asks for MIDI access when toggled on) ─────
buildMidiUi();

new Visualizer(canvas, engine.analyserNode, contacts).start();

// ── device connect buttons ────────────────────────────────────────────────
const tpBtn = document.getElementById("connect-trackpad") as HTMLButtonElement;
const dialBtn = document.getElementById("connect-dial") as HTMLButtonElement;

const chip = (btn: HTMLButtonElement, name: string) => (s: DeviceStatus) => {
  btn.classList.toggle("live", s.connected);
  btn.title = s.label;
  btn.querySelector(".dot")!.classList.toggle("on", s.connected);
  btn.lastChild!.textContent = s.connected ? ` ${name} ✓` : ` ${name}`;
};
const tpStatus = chip(tpBtn, "Trackpad");
const dialStatus = chip(dialBtn, "Dial");

tpBtn.onclick = () => connectTrackpad(sink, tpStatus);

// The dial sweeps a live DJ-style performance filter; pressing it starts/stops
// the beat; the device's buttons are drum pads.
let perfAmount = 0;
const dialHandlers = {
  onRotate: (delta: number) => {
    perfAmount = clamp(perfAmount + delta * 0.08, -1, 1);
    engine.setPerformanceFilter(perfAmount);
  },
  onPress: transport,
  onButton: (index: number, pressed: boolean) => {
    if (pressed) { void engine.resume(); beat.hit(index % seq.tracks); }
  },
};
dialBtn.onclick = () => connectDial(dialHandlers, dialStatus);

// silently re-grab devices the user already approved
void restoreTrackpad(sink, tpStatus);
void restoreDial(dialHandlers, dialStatus);

// ── start audio on first interaction (browser autoplay policy) ─────────────
const kick = () => {
  void engine.resume();
  document.body.classList.add("started");
  window.removeEventListener("pointerdown", kick);
  window.removeEventListener("keydown", kick);
};
window.addEventListener("pointerdown", kick);
window.addEventListener("keydown", kick);

// ── persistence ────────────────────────────────────────────────────────────
const STORE_KEY = "magic-trackpad-ulanzi-synth.v1";

function loadState(): void {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) { applyPreset(PRESETS[0]); return; }
    const s = JSON.parse(raw);
    if (s.params && typeof s.params === "object") Object.assign(params, s.params);
    if (typeof s.bpm === "number") seq.bpm = clamp(s.bpm, 40, 240);
    if (Array.isArray(s.pattern)) seq.restore(s.pattern);
  } catch {
    applyPreset(PRESETS[0]);
  }
}

function saveState(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ params, bpm: seq.bpm, pattern: seq.snapshot() }));
  } catch {
    /* storage unavailable — fine */
  }
}
setInterval(saveState, 2500);
window.addEventListener("beforeunload", saveState);

function buildMidiUi(): void {
  const controlsEl = document.getElementById("controls");
  if (!controlsEl) return;

  const group = document.createElement("label");
  group.className = "ctl";
  const span = document.createElement("span");
  span.textContent = "MIDI Out";
  const row = document.createElement("div");
  row.className = "midi-row";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  const select = document.createElement("select");
  select.disabled = true;
  row.append(toggle, select);
  group.append(span, row);
  controlsEl.insertBefore(group, controlsEl.querySelector(".panic"));

  const populate = (outs: MIDIOutput[]) => {
    select.innerHTML = "";
    for (const o of outs) select.append(new Option(o.name || o.id, o.id));
    if (midi.currentId) select.value = midi.currentId;
  };

  toggle.onchange = async () => {
    if (toggle.checked) {
      try {
        const outs = await midi.init();
        if (!outs.length) { toggle.checked = false; span.textContent = "MIDI Out (none found)"; return; }
        populate(outs);
        select.disabled = false;
        midi.enabled = true;
        span.textContent = "MIDI Out";
      } catch {
        toggle.checked = false;
        span.textContent = "MIDI Out (unavailable)";
      }
    } else {
      midi.enabled = false;
      midi.allOff();
      select.disabled = true;
    }
  };
  select.onchange = () => midi.select(select.value);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
