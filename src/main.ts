import "./styles.css";
import type { Contact, SurfaceSink, DeviceStatus } from "./types";
import { Engine } from "./audio/engine";
import { DrumKit } from "./audio/drums";
import { Sequencer } from "./audio/sequencer";
import { initPad } from "./input/pad";
import { initKeyboard } from "./input/keyboard";
import { Visualizer } from "./ui/visualizer";
import { initControls } from "./ui/controls";
import { initBeat } from "./ui/beat";
import { connectTrackpad, restoreTrackpad } from "./input/trackpad";
import { connectDial, restoreDial } from "./input/dial";

const engine = new Engine();
const kit = new DrumKit(engine.ctx, engine.drumBus);
const seq = new Sequencer(engine.ctx, kit);
const contacts = new Map<string, Contact>();

const sink: SurfaceSink = {
  start(c) { contacts.set(c.id, c); engine.playXY(c.id, c.x, c.y, c.pressure); },
  move(c) { contacts.set(c.id, c); engine.updateXY(c.id, c.x, c.y, c.pressure); },
  end(id) { contacts.delete(id); engine.release(id); },
};

const canvas = document.getElementById("pad") as HTMLCanvasElement;
initPad(canvas, sink);

const { refresh } = initControls(document.getElementById("controls")!, engine);
const beat = initBeat(document.getElementById("beat")!, seq);

const transport = () => { void engine.resume(); seq.toggle(); };

initKeyboard({
  engine,
  visualOn: (id, x, pressure) => contacts.set(id, { id, x, y: 0.4, pressure }),
  visualOff: (id) => contacts.delete(id),
  refresh,
  onPad: (i) => { void engine.resume(); beat.hit(i); },
  onTransport: transport,
});

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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
