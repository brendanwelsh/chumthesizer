/** On-screen Elgato Stream Deck Pedal — gamepadviewer style (same splice treatment as the
 *  dial, see src/ui/dial.ts). Layers, bottom to top:
 *    1. base photo (background knocked out)  — ./pedal/base.png
 *    2. a WHITE silhouette PNG per pedal — hidden (opacity:0), shown on press so the whole
 *       pedal lights up white  — ./pedal/white-0..2.png
 *    3. a label BELOW each pedal (outside it) saying what that pedal does
 *
 *  Display-only: the physical foot pedal drives press() via main.ts. Optional click handlers
 *  fire onPress (if supplied) so the on-screen widget is also tappable.
 *
 *  Geometry is in % of the cropped base image (public/pedal/base.png, 1044×411, crop
 *  x 50..1094 / y 346..757 of the 1144px source). Each white-*.png is the matching pedal's
 *  real top-face polygon, inverted+brightened, so it lights that exact shape on press.
 *  Relative URLs ("./…") — Electron loads the build over file://. */

export interface PedalView {
  press(index: number): void;        // light a pedal white (physical press)
  setLabels(labels: string[]): void; // show what each pedal does, below the pedal
}

export interface PedalOpts {
  onPress?: (i: number) => void;     // optional: on-screen tap of a pedal (0=L, 1=C, 2=R)
}

const PEDAL_IMG = "./pedal/base.png";

// pedal index: 0 = left, 1 = center (Elgato logo), 2 = right.
// file = the white-silhouette PNG; cx = the label's center-x (% of the cropped base image).
const PEDALS = [
  { file: "0", cx: 14.5, cy: 0 },  // labels sit ABOVE each pedal (cy=0 + CSS lifts them)
  { file: "1", cx: 50.9, cy: 0 },
  { file: "2", cx: 84.9, cy: 0 },
];

const FLASH_MS = 160;

export function initPedalView(root: HTMLElement, opts: PedalOpts = {}): PedalView {
  root.innerHTML = "";

  const device = document.createElement("div");
  device.className = "pedal-device";

  const base = document.createElement("img");
  base.className = "pedal-img";
  base.src = PEDAL_IMG;
  base.alt = "Elgato Stream Deck Pedal";
  base.draggable = false;
  device.append(base);

  // white silhouettes (one per pedal), hidden until pressed
  const whites: HTMLImageElement[] = PEDALS.map((p) => {
    const w = document.createElement("img");
    w.className = "pwhite";
    w.src = `./pedal/white-${p.file}.png`;
    w.alt = "";
    w.draggable = false;
    device.append(w);
    return w;
  });

  const flash = (i: number): void => {
    const w = whites[i];
    if (!w) return;
    w.classList.add("on");
    setTimeout(() => w.classList.remove("on"), FLASH_MS);
  };

  // one chip ABOVE each pedal, anchored to it — the same outboard-label treatment as the
  // dial's keys, so the two controllers read as one family. Chips are buttons: tap = press.
  const labelEls: HTMLButtonElement[] = PEDALS.map((p, i) => {
    const lab = document.createElement("button");
    lab.type = "button";
    lab.className = "plabel";
    lab.style.left = `${p.cx}%`;
    lab.title = "Tap = press this pedal";
    if (opts.onPress) lab.onclick = () => { opts.onPress?.(i); };
    device.append(lab);
    return lab;
  });

  // on-screen taps work on the pedals themselves too
  if (opts.onPress) {
    whites.forEach((w, i) => {
      w.style.pointerEvents = "auto";
      w.addEventListener("click", () => {
        opts.onPress?.(i);
        flash(i);
      });
    });
  }

  root.append(device);

  return {
    press(i: number) {
      flash(i);
    },
    setLabels(labels: string[]) {
      labelEls.forEach((el, i) => {
        el.textContent = labels[i] ?? "";
      });
    },
  };
}
