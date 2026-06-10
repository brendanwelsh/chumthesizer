import type { SurfaceSink } from "../types";

/** On-screen XY pad driven by Pointer Events. Works with mouse, touchscreen,
 *  and pen — multitouch and real stylus pressure come through for free. The
 *  Magic Trackpad path (trackpad-bridge.ts) feeds the same sink.
 *
 *  IMPORTANT: the Magic Trackpad is ALSO the system pointer, and the Precision-Touchpad driver
 *  fires "touch"-type pointer events at the CURSOR position — which sits centered, not where your
 *  finger is. That was the phantom note. So we ALWAYS ignore "touch" pointer events here (fingers
 *  come through the helper bridge instead). A real "mouse" plays only when Mouse mode is on
 *  (opts.mouseAllowed); pen/stylus is always allowed. */
export function initPad(canvas: HTMLCanvasElement, sink: SurfaceSink, opts: { mouseAllowed?: () => boolean } = {}): void {
  const mute = (e: PointerEvent): boolean =>
    e.pointerType === "touch" ? true
      : e.pointerType === "mouse" ? !opts.mouseAllowed?.()
        : false;

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
    if (mute(e)) return; // the helper owns the trackpad while it's live
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = norm(e);
    sink.start({ id: `pad:${e.pointerId}`, x, y, pressure: pressureFor(e, y) });
  });

  canvas.addEventListener("pointermove", (e) => {
    if (e.buttons === 0 && e.pointerType === "mouse") return;
    if (mute(e)) return;
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
