/** On-screen Ulanzi D100H — gamepadviewer style (like the user's elite-series-2-white /
 *  playstation-ds5-white skins). Layers, bottom to top:
 *    1. base photo (background knocked out)
 *    2. a WHITE silhouette PNG per key — hidden, shown on press so the whole button goes white
 *    3. the knob as its own circular layer that actually rotates (and glows white while turning)
 *    4. invisible hit-areas over each key for click/tap
 *  Knob: drag = FX macro (warp the sound) + spins to match; click = play/stop.
 *  Keys: a press plays a note that records into the armed loop.
 *
 *  Geometry is in % of the cropped base image (see scripts that built public/ulanzi-dial.png).
 *  Relative URLs ("./…") — Electron loads the build over file://. */

export interface DialWidget {
  setFx(v: number): void;            // spin the knob to match the FX macro (-1..1)
  press(index: number): void;        // light a key white (physical press)
  setLabels(labels: string[]): void; // show what each key does, next to the key
  learn(slot: number | null): void;  // calibration: highlight the key to press next (null = off)
}

export interface DialOpts {
  onButton: (i: number) => void;
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
  knob.title = "Knob — drag to warp the sound (FX) · click = play / stop";
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
    b.onclick = () => { opts.onButton(i); flash(i); };
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

  let fx = 0;
  let spinT: number | undefined;
  const renderFx = (): void => {
    knob.style.transform = `translate(-50%, -50%) rotate(${fx * 150}deg)`; // -1..1 -> -150°..150°
    knob.classList.add("spin"); // glow while turning
    if (spinT) clearTimeout(spinT);
    spinT = window.setTimeout(() => knob.classList.remove("spin"), 220);
  };
  knob.style.transform = "translate(-50%, -50%)";

  // drag = FX; tap (no drag) = play/stop
  let dragging = false, startY = 0, startV = 0;
  knob.addEventListener("pointerdown", (e) => {
    dragging = true; startY = e.clientY; startV = fx;
    knob.setPointerCapture(e.pointerId); e.preventDefault();
  });
  knob.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    fx = clamp(startV + (startY - e.clientY) / 130);
    renderFx(); opts.onFx(fx);
  });
  const endDrag = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    try { knob.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (Math.abs(e.clientY - startY) < 5) opts.onPress();
  };
  knob.addEventListener("pointerup", endDrag);
  knob.addEventListener("pointercancel", endDrag);
  knob.addEventListener("dblclick", () => { fx = 0; renderFx(); opts.onFx(0); });

  return {
    setFx(v: number) { fx = clamp(v); renderFx(); },
    press(i: number) { flash(i); },
    setLabels(labels: string[]) { labelEls.forEach((el, i) => { el.textContent = labels[i] ?? ""; }); },
    learn(slot: number | null) {
      root.classList.toggle("learn", slot !== null);
      keyEls.forEach((el, i) => el.classList.toggle("next", slot === i));
    },
  };
}
