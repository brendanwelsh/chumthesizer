import type { SurfaceSink } from "../types";

/** On-screen XY pad driven by Pointer Events. Works with mouse, touchscreen,
 *  and pen — multitouch and real stylus pressure come through for free. The
 *  Magic Trackpad path (trackpad.ts) feeds the same sink. */
export function initPad(canvas: HTMLCanvasElement, sink: SurfaceSink): void {
  const norm = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    };
  };

  // mouse has no pressure (reports 0.5 while down); give it a lively default
  // and let vertical position drive timbre instead.
  const pressureOf = (e: PointerEvent) =>
    e.pointerType === "mouse" ? 0.7 : clamp01(e.pressure > 0 ? e.pressure : 0.5);

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = norm(e);
    sink.start({ id: `pad:${e.pointerId}`, x, y, pressure: pressureOf(e) });
  });

  canvas.addEventListener("pointermove", (e) => {
    if (e.buttons === 0 && e.pointerType === "mouse") return;
    const { x, y } = norm(e);
    sink.move({ id: `pad:${e.pointerId}`, x, y, pressure: pressureOf(e) });
  });

  const end = (e: PointerEvent) => sink.end(`pad:${e.pointerId}`);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse" && e.buttons === 0) return;
    end(e);
  });
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
