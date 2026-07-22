/** On-screen Ulanzi D100H — gamepadviewer style (like the user's elite-series-2-white /
 *  playstation-ds5-white skins). Layers, bottom to top:
 *    1. base photo (background knocked out)
 *    2. a WHITE silhouette PNG per key — hidden, shown on press so the whole button goes white
 *    3. the knob as its own circular layer that actually rotates (and glows white while turning)
 *    4. invisible hit-areas over each key for click/tap
 *  Knob: drag = the current knob macro (warp the sound) + spins to match; click = cycle the macro.
 *  Keys: a press picks/blends a sound preset (recorded into the armed loop).
 *
 *  Geometry is in % of the cropped base image (see scripts that built public/ulanzi-dial.png).
 *  Relative URLs ("./…") — Electron loads the build over file://. */

export interface DialWidget {
  setFx(v: number): void;            // set the FX macro value (-1..1) + glow (rotation is via spin())
  spin(deltaDeg: number): void;      // turn the knob by a delta — UNBOUNDED, it never stops (endless encoder)
  setMode(label: string): void;      // show what the knob is currently controlling (push to cycle)
  setLoopColor(rgb: string | null): void;   // ring the dial in the colour of the loop currently looping/recording
  press(index: number): void;        // light a key white (transient flash)
  hold(index: number, on: boolean): void;   // latch a key lit while it's held down (released = off)
  pressColor(index: number, rgb: string): void; // light a key in a loop's colour (replayed press)
  setLabels(labels: string[]): void; // show what each key does, next to the key
  learn(slot: number | null): void;  // calibration: highlight the key to press next (null = off)
}

export interface DialOpts {
  onButton: (i: number) => void;     // a key was pressed
  onButtonUp?: (i: number) => void;  // a key was released (for hold-to-blend)
  onPress: () => void;               // knob click = play / stop
  onFx: (v: number) => void;         // knob drag = FX macro (-1..1)
}

const DIAL_IMG = "./ulanzi-dial.png";
const KNOB_IMG = "./ulanzi-knob.png";
const KNOB = { cx: 50.95, cy: 61.58, dia: 57.95 };
const clamp = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

// pad index order = the user's layout: 1 bottom-left, 2 above, 3/4/5 top, 6/7 right.
// file = the white-silhouette PNG; cx/cy/w/h = the clickable hit-area (% of the base image).
const KEYS = [
  { file: "1", cx: 3.0, cy: 62.6, w: 7.5, h: 21.8 },
  { file: "2", cx: 3.0, cy: 39.0, w: 7.5, h: 22.0 },
  { file: "3", cx: 16.4, cy: 11.0, w: 29.2, h: 22.1 },
  { file: "4", cx: 47.8, cy: 11.0, w: 32.6, h: 22.1 },
  { file: "5", cx: 81.3, cy: 10.9, w: 33.3, h: 22.0 },
  { file: "6", cx: 97.0, cy: 39.0, w: 7.5, h: 22.0 },
  { file: "7", cx: 97.0, cy: 63.3, w: 7.5, h: 23.2 },
];

export function initDial(root: HTMLElement, opts: DialOpts): DialWidget {
  root.innerHTML = "";
  root.classList.add("dial");

  const device = document.createElement("div");
  device.className = "dial-device";

  const base = document.createElement("img");
  base.className = "dial-img";
  base.src = DIAL_IMG;
  base.alt = "Ulanzi D100H dial";
  base.draggable = false;
  device.append(base);

  // white silhouettes (one per key), hidden until pressed
  const whites: HTMLImageElement[] = KEYS.map((k) => {
    const w = document.createElement("img");
    w.className = "dwhite";
    w.src = `./dial/white-${k.file}.png`;
    w.alt = "";
    w.draggable = false;
    device.append(w);
    return w;
  });

  // the knob: its own rotatable layer
  const knob = document.createElement("img");
  knob.className = "dial-knob";
  knob.src = KNOB_IMG;
  knob.alt = "";
  knob.draggable = false;
  knob.title = "Knob — drag to warp the sound · click = cycle what the knob controls (Filter → Bright → …)";
  knob.style.left = `${KNOB.cx}%`;
  knob.style.top = `${KNOB.cy}%`;
  knob.style.width = `${KNOB.dia}%`;
  device.append(knob);

  // invisible hit-areas for click/tap on each key
  const flash = (i: number): void => {
    const w = whites[i];
    if (!w) return;
    w.classList.add("on");
    setTimeout(() => w.classList.remove("on"), 160);
  };
  const labelEls: HTMLSpanElement[] = [];
  const keyEls: HTMLButtonElement[] = [];
  KEYS.forEach((k, i) => {
    const b = document.createElement("button");
    b.className = "dkey";
    b.style.left = `${k.cx}%`;
    b.style.top = `${k.cy}%`;
    b.style.width = `${k.w}%`;
    b.style.height = `${k.h}%`;
    // press-and-HOLD: fire on pointerdown and LATCH the key lit (so holding one — or several — at
    // once shows every held key); release un-lights it. "button pressed = button lit, that simple."
    const lift = (): void => { opts.onButtonUp?.(i); whites[i]?.classList.remove("held"); };
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); opts.onButton(i); whites[i]?.classList.add("held"); });
    b.addEventListener("pointerup", lift);
    b.addEventListener("pointerleave", lift);
    b.addEventListener("pointercancel", lift);
    keyEls.push(b);
    device.append(b);

    // a label OUTSIDE each key (in the padding around the device) so it never covers the button:
    // top keys label above, side keys label off the matching edge.
    const side = k.cx < 15 ? "left" : k.cx > 85 ? "right" : "top";
    const lx = side === "left" ? 0 : side === "right" ? 100 : k.cx;
    const ly = side === "top" ? 0 : k.cy;
    const lab = document.createElement("span");
    lab.className = `dkey-label ${side}`;
    lab.style.left = `${lx}%`;
    lab.style.top = `${ly}%`;
    labelEls.push(lab);
    device.append(lab);
  });

  root.append(device);

  // a plain-language caption + a live MODE badge (press the knob to cycle what the knob controls)
  const caption = document.createElement("div");
  caption.className = "dial-caption";
  const modeBadge = document.createElement("span");
  modeBadge.className = "dial-mode";
  modeBadge.textContent = "Filter";
  const capText = document.createElement("span");
  capText.innerHTML = ` · <b>press</b> = next mode · <b>keys</b> = sounds`;
  caption.append(document.createTextNode("turn = "), modeBadge, capText);
  root.append(caption);

  // The D100H is an *endless* rotary encoder — it has no stop. So the on-screen knob spins freely in
  // both directions forever: rotation is an UNBOUNDED accumulator (spinDeg), decoupled from the
  // bounded FX-macro value (fx, -1..1, which still drives the audio filter).
  let fx = 0;
  let spinDeg = 0;
  let spinT: number | undefined;
  const glow = (): void => {
    knob.classList.add("spin"); // glow while turning
    if (spinT) clearTimeout(spinT);
    spinT = window.setTimeout(() => knob.classList.remove("spin"), 220);
  };
  const spin = (deltaDeg: number): void => {
    spinDeg += deltaDeg;
    knob.style.transform = `translate(-50%, -50%) rotate(${spinDeg}deg)`;
    glow();
  };
  knob.style.transform = "translate(-50%, -50%)";

  // drag = spin the knob freely (both ways, never stops) + sweep the bounded FX for audio; tap = play/stop
  let dragging = false, startY = 0, lastY = 0;
  knob.addEventListener("pointerdown", (e) => {
    dragging = true; startY = lastY = e.clientY;
    knob.setPointerCapture(e.pointerId); e.preventDefault();
  });
  knob.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dy = lastY - e.clientY; lastY = e.clientY;
    spin(dy * 1.4);                          // keeps turning past the filter's min/max — no stopping point
    fx = clamp(fx + dy / 130); opts.onFx(fx);
  });
  const endDrag = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    try { knob.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (Math.abs(e.clientY - startY) < 5) opts.onPress();
  };
  knob.addEventListener("pointerup", endDrag);
  knob.addEventListener("pointercancel", endDrag);
  knob.addEventListener("dblclick", () => { fx = 0; opts.onFx(0); });   // reset the audio; the knob keeps its angle

  return {
    setFx(v: number) { fx = clamp(v); glow(); },   // value + glow only; rotation comes from spin()
    spin,
    setMode(label: string) { modeBadge.textContent = label; },
    setLoopColor(rgb: string | null) {
      if (rgb) { root.style.setProperty("--loop-color", `rgb(${rgb})`); root.classList.add("looping"); }
      else root.classList.remove("looping");
    },
    press(i: number) { flash(i); },
    hold(i: number, on: boolean) { whites[i]?.classList.toggle("held", on); },
    pressColor(i: number, rgb: string) {
      flash(i);
      const k = keyEls[i];
      if (!k) return;
      k.style.background = `rgba(${rgb},0.5)`;
      k.style.boxShadow = `0 0 16px rgba(${rgb},0.85)`;
      k.style.borderRadius = "8px";
      window.setTimeout(() => { k.style.background = ""; k.style.boxShadow = ""; }, 240);
    },
    setLabels(labels: string[]) { labelEls.forEach((el, i) => { el.textContent = labels[i] ?? ""; }); },
    learn(slot: number | null) {
      root.classList.toggle("learn", slot !== null);
      keyEls.forEach((el, i) => el.classList.toggle("next", slot === i));
    },
  };
}
