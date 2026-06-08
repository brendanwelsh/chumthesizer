import type { Engine } from "../audio/engine";
import { params } from "../state";
import { SCALES, NOTE_NAMES } from "../audio/scales";
import { PRESETS, applyPreset } from "../audio/presets";

/** Builds the bottom control bar and keeps it in sync. Returns a `refresh` you
 *  call whenever params change from elsewhere (keyboard shortcuts, the dial,
 *  loading a preset). */
export function initControls(root: HTMLElement, engine: Engine): { refresh: () => void } {
  root.innerHTML = "";

  const refreshers: Array<() => void> = [];
  const refresh = () => refreshers.forEach((fn) => fn());

  const group = (label: string, el: HTMLElement) => {
    const wrap = document.createElement("label");
    wrap.className = "ctl";
    const span = document.createElement("span");
    span.textContent = label;
    wrap.append(span, el);
    root.append(wrap);
    return wrap;
  };

  // preset — applies a whole patch at once
  const preset = document.createElement("select");
  preset.className = "preset-sel";
  PRESETS.forEach((p, i) => preset.append(new Option(p.name, String(i))));
  preset.onchange = () => {
    applyPreset(PRESETS[Number(preset.value)]);
    engine.applyParams();
    engine.setBrightness(params.brightness);
    refresh();
  };
  refreshers.push(() => {
    const idx = PRESETS.findIndex((p) => p.name === params.presetName);
    preset.value = String(idx < 0 ? 0 : idx);
  });
  group("Preset", preset);

  // scale
  const scale = document.createElement("select");
  SCALES.forEach((s, i) => scale.append(new Option(s.name, String(i))));
  scale.onchange = () => { params.scaleIndex = Number(scale.value); };
  refreshers.push(() => (scale.value = String(params.scaleIndex)));
  group("Scale", scale);

  // root
  const root_ = document.createElement("select");
  NOTE_NAMES.forEach((nm, i) => root_.append(new Option(nm, String(i))));
  root_.onchange = () => { params.root = Number(root_.value); };
  refreshers.push(() => (root_.value = String(params.root)));
  group("Root", root_);

  // octave
  const oct = document.createElement("input");
  oct.type = "number"; oct.min = "-3"; oct.max = "3"; oct.step = "1";
  oct.onchange = () => { params.octave = clampInt(Number(oct.value), -3, 3); };
  refreshers.push(() => (oct.value = String(params.octave)));
  group("Octave", oct);

  // waveform
  const wave = document.createElement("select");
  (["sawtooth", "square", "triangle", "sine"] as OscillatorType[]).forEach((w) =>
    wave.append(new Option(w, w)),
  );
  wave.onchange = () => { params.waveform = wave.value as OscillatorType; };
  refreshers.push(() => (wave.value = params.waveform));
  group("Wave", wave);

  // sliders
  const slider = (
    label: string,
    get: () => number,
    set: (v: number) => void,
    min = 0, max = 1, step = 0.01,
  ) => {
    const s = document.createElement("input");
    s.type = "range"; s.min = String(min); s.max = String(max); s.step = String(step);
    s.oninput = () => { set(Number(s.value)); };
    refreshers.push(() => (s.value = String(get())));
    group(label, s);
  };

  slider("Volume", () => params.masterVolume, (v) => { params.masterVolume = v; engine.applyParams(); });
  slider("Brightness", () => params.brightness, (v) => engine.setBrightness(v));
  slider("Reverb", () => params.reverb, (v) => { params.reverb = v; engine.applyParams(); });
  slider("Delay", () => params.delay, (v) => { params.delay = v; engine.applyParams(); });

  // glide
  const glide = document.createElement("input");
  glide.type = "checkbox";
  glide.onchange = () => { params.glide = glide.checked; };
  refreshers.push(() => (glide.checked = params.glide));
  group("Glide", glide);

  // panic
  const panic = document.createElement("button");
  panic.textContent = "Panic";
  panic.className = "panic";
  panic.onclick = () => engine.releaseAll();
  root.append(panic);

  refresh();
  return { refresh };
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}
