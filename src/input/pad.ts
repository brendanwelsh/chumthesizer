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

  // mouse/trackpad-as-cursor report no real pressure, so let vertical position
  // be the dynamics axis (higher = louder/brighter). Pen & touch use real force.
  const pressureFor = (e: PointerEvent, y: number) =>
    e.pointerType === "mouse" ? clamp01(0.25 + (1 - y) * 0.75) : clamp01(e.pressure > 0 ? e.pressure : 0.5);

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = norm(e);
    sink.start({ id: `pad:${e.pointerId}`, x, y, pressure: pressureFor(e, y) });
  });

  canvas.addEventListener("pointermove", (e) => {
    if (e.buttons === 0 && e.pointerType === "mouse") return;
    const { x, y } = norm(e);
    sink.move({ id: `pad:${e.pointerId}`, x, y, pressure: pressureFor(e, y) });
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
