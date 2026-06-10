/** A draggable rotary knob (drag vertically to set). Used for the giant master VOLUME knob.
 *  Motion thesis: the cap is still; only the indicator + value move. */
export interface KnobOpts {
  value?: number;
  min?: number;
  max?: number;
  label?: string;
  size?: number;
  onChange: (v: number) => void;
}

export interface KnobUI { set(v: number): void; }

export function initKnob(root: HTMLElement, o: KnobOpts): KnobUI {
  const min = o.min ?? 0, max = o.max ?? 1, size = o.size ?? 72;
  let v = o.value ?? 0.8;
  root.classList.add("knob-wrap");
  root.innerHTML =
    `<div class="knob" style="width:${size}px;height:${size}px" title="${o.label ?? ""} — drag up/down">` +
    `<svg viewBox="0 0 100 100">` +
    `<circle class="knob-bg" cx="50" cy="50" r="42"/>` +
    `<circle class="knob-ring" cx="50" cy="50" r="42"/>` +
    `<line class="knob-ind" x1="50" y1="52" x2="50" y2="14"/>` +
    `</svg></div>` +
    (o.label ? `<span class="knob-label">${o.label}</span>` : "");
  const knob = root.querySelector(".knob") as HTMLElement;
  const ind = root.querySelector(".knob-ind") as SVGLineElement;
  const clamp = (x: number) => (x < min ? min : x > max ? max : x);
  const render = () => {
    const t = (v - min) / (max - min);
    ind.setAttribute("transform", `rotate(${-135 + t * 270} 50 50)`);
  };
  render();

  let drag = false, sy = 0, sv = 0;
  knob.addEventListener("pointerdown", (e) => { drag = true; sy = e.clientY; sv = v; knob.setPointerCapture(e.pointerId); e.preventDefault(); });
  knob.addEventListener("pointermove", (e) => { if (!drag) return; v = clamp(sv + ((sy - e.clientY) / 150) * (max - min)); render(); o.onChange(v); });
  const end = (e: PointerEvent) => { drag = false; try { knob.releasePointerCapture(e.pointerId); } catch { /* ignore */ } };
  knob.addEventListener("pointerup", end);
  knob.addEventListener("pointercancel", end);

  return { set(val: number) { v = clamp(val); render(); } };
}
