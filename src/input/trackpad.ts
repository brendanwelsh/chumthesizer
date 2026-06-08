import type { SurfaceSink, StatusCb } from "../types";

/** Read raw multitouch + PRESSURE from an Apple Magic Trackpad 2 in the browser
 *  via WebHID. The Windows drivers throw the force away; we bypass them, put the
 *  device into raw multitouch mode, and decode the frames ourselves — exactly
 *  like the Linux hid-magicmouse driver. Each finger's force is byte 7.
 *
 *  This runs the same in Chrome/Edge and inside Electron. If the OS won't let
 *  the browser claim the device, we fall back to node-hid in Electron's main
 *  process (see DESIGN.md) — the decode below is identical either way. */

const APPLE_VID = 0x05ac;
const TOUCH_REPORT_ID = 0x02;
// per-finger 9-byte structs start at offset 12 in the FULL report; WebHID's
// event.data excludes the 1-byte report id, so subtract 1.
const TOUCH_OFFSET = 11;
const STRIDE = 9;

// logical coordinate range of the Magic Trackpad 2 (from hid-magicmouse).
const X_MIN = -3678, X_MAX = 3934;
const Y_MIN = -2479, Y_MAX = 2587;

interface Finger {
  id: number;
  x: number; // 0..1
  y: number; // 0..1, 0 = top
  pressure: number; // 0..1
}

function decodeFinger(dv: DataView, off: number): Finger | null {
  const t = (i: number) => dv.getUint8(off + i);
  const t0 = t(0), t1 = t(1), t2 = t(2), t3 = t(3), t7 = t(7), t8 = t(8);

  // 32-bit signed bit math, identical to the kernel driver
  const xr = (t1 << 27 | t0 << 19) >> 19;
  const yr = -((t3 << 30 | t2 << 22 | t1 << 14) >> 19);
  const down = (t3 & 0xc0) === 0x80;
  if (!down && t7 < 4) return null;

  return {
    id: t8 & 0x0f,
    x: clamp01((xr - X_MIN) / (X_MAX - X_MIN)),
    y: 1 - clamp01((yr - Y_MIN) / (Y_MAX - Y_MIN)),
    pressure: clamp01(t7 / 160), // light ~0.15, firm ~0.8+
  };
}

function attach(device: HIDDevice, sink: SurfaceSink, status: StatusCb): void {
  const prev = new Set<number>();

  device.addEventListener("inputreport", (e: HIDInputReportEvent) => {
    if (e.reportId !== TOUCH_REPORT_ID) return;
    const dv = e.data;
    const seen = new Set<number>();
    const count = Math.floor((dv.byteLength - TOUCH_OFFSET) / STRIDE);
    for (let i = 0; i < count; i++) {
      const f = decodeFinger(dv, TOUCH_OFFSET + i * STRIDE);
      if (!f) continue;
      seen.add(f.id);
      const id = `tp:${f.id}`;
      const c = { id, x: f.x, y: f.y, pressure: f.pressure };
      if (prev.has(f.id)) sink.move(c);
      else sink.start(c);
    }
    for (const id of prev) if (!seen.has(id)) sink.end(`tp:${id}`);
    prev.clear();
    for (const id of seen) prev.add(id);
  });

  status({ connected: true, label: device.productName || "Magic Trackpad" });
}

async function enable(device: HIDDevice): Promise<void> {
  if (!device.opened) await device.open();
  try {
    // switch into raw multitouch mode: feature report 0x02, payload 0x01
    await device.sendFeatureReport(TOUCH_REPORT_ID, new Uint8Array([0x01]));
  } catch {
    // some stacks reject this or it's already enabled — keep going, we may
    // still get frames.
  }
}

/** Reconnect a previously-granted trackpad silently (call on load). */
export async function restoreTrackpad(sink: SurfaceSink, status: StatusCb): Promise<void> {
  if (!("hid" in navigator)) return;
  const devices = await navigator.hid.getDevices();
  const tp = devices.find((d) => d.vendorId === APPLE_VID);
  if (!tp) return;
  await enable(tp);
  attach(tp, sink, status);
}

/** Prompt the user to pick the trackpad (must be from a click). */
export async function connectTrackpad(sink: SurfaceSink, status: StatusCb): Promise<void> {
  if (!("hid" in navigator)) {
    status({ connected: false, label: "WebHID unsupported — use Chrome/Edge or the Electron app" });
    return;
  }
  status({ connected: false, label: "choosing…" });
  let devices: HIDDevice[];
  try {
    devices = await navigator.hid.requestDevice({ filters: [{ vendorId: APPLE_VID }] });
  } catch {
    status({ connected: false, label: "no device picked" });
    return;
  }
  const tp = devices[0];
  if (!tp) {
    status({ connected: false, label: "no device picked" });
    return;
  }
  try {
    await enable(tp);
    attach(tp, sink, status);
  } catch (err) {
    status({ connected: false, label: `couldn't open (${(err as Error).message})` });
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
