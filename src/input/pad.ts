import type { SurfaceSink } from "../types";

/** On-screen XY pad driven by Pointer Events. Works with mouse, touchscreen,
 *  and pen — multitouch and real stylus pressure come through for free. The
 *  Magic Trackpad path (trackpad-bridge.ts) feeds the same sink.
 *
 *  IMPORTANT: on Windows the Magic Trackpad is ALSO the system pointer, and the Precision-Touchpad
 *  driver fires "touch"-type pointer events at the CURSOR position — which sits centered, not where
 *  your finger is. That's a phantom note. So while the trackpad helper owns the device we ignore
 *  "touch" events (real fingers come through the bridge instead) — opts.touchAllowed gates this.
 *  On a real touchscreen (phone/tablet) there's no helper, so touch is allowed and gives genuine
 *  multitouch — each finger is its own voice = chords. A real "mouse" plays only when Mouse mode is
 *  on (opts.mouseAllowed); pen/stylus is always allowed. */
export function initPad(canvas: HTMLCanvasElement, sink: SurfaceSink, opts: { mouseAllowed?: () => boolean; touchAllowed?: () => boolean } = {}): void {
  const mute = (e: PointerEvent): boolean =>
    e.pointerType === "touch" ? !(opts.touchAllowed?.() ?? true)
      : e.pointerType === "mouse" ? !opts.mouseAllowed?.()
        : false;

  const norm = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    };
  };

  // Most touchscreens report no usable force, so — like the mouse — vertical position is the
  // dynamics axis (higher = louder/brighter), which also matches the on-pad loud/soft guide. A real
  // pen/stylus DOES report force, so it keeps using it.
  const pressureFor = (e: PointerEvent, y: number) =>
    e.pointerType === "pen" ? clamp01(e.pressure > 0 ? e.pressure : 0.5)
      : clamp01(0.25 + (1 - y) * 0.75);

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
