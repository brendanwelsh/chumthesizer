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

// Flip to false once the raw multitouch path is proven on hardware. While true,
// we log what's coming off the wire and show a live frame counter on the chip.
const DEBUG = true;

function hexHead(dv: DataView, n = 20): string {
  const len = Math.min(n, dv.byteLength);
  const out: string[] = [];
  for (let i = 0; i < len; i++) out.push(dv.getUint8(i).toString(16).padStart(2, "0"));
  return out.join(" ");
}

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
  const base = device.productName || "Magic Trackpad";
  let frames = 0;       // raw inputreports of ANY id
  let touchFrames = 0;  // reports with the multitouch id (0x02)
  let contacts = 0;     // decoded finger contacts
  let logged = 0;

  status({ connected: true, label: `${base} · waiting for frames…` });

  device.addEventListener("inputreport", (e: HIDInputReportEvent) => {
    frames++;
    if (DEBUG && logged < 8) {
      logged++;
      console.info(`[trackpad] report id=0x${e.reportId.toString(16)} len=${e.data.byteLength}  ${hexHead(e.data)}`);
    }
    if (e.reportId !== TOUCH_REPORT_ID) return;
    touchFrames++;
    const dv = e.data;
    const seen = new Set<number>();
    const count = Math.floor((dv.byteLength - TOUCH_OFFSET) / STRIDE);
    for (let i = 0; i < count; i++) {
      const f = decodeFinger(dv, TOUCH_OFFSET + i * STRIDE);
      if (!f) continue;
      contacts++;
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

  // Live counter on the chip tooltip so you can SEE whether raw frames arrive.
  setInterval(() => {
    status({ connected: true, label: `${base} · ${frames} raw / ${touchFrames} touch / ${contacts} contacts` });
  }, 300);

  // If nothing lands, the OS still owns the multitouch interface — the case DESIGN.md flagged.
  setTimeout(() => {
    if (frames === 0) {
      console.warn("[trackpad] No raw HID frames in 1.5s. The Windows Precision-Touchpad driver is probably still holding the multitouch interface (WebHID opened the device, but the OS keeps the input). Fallback: bind WinUSB with Zadig — DESIGN.md §1.");
      status({ connected: true, label: `${base} · 0 raw frames — OS owns it (see console)` });
    } else if (touchFrames === 0) {
      console.warn(`[trackpad] ${frames} raw frames but none with id 0x${TOUCH_REPORT_ID.toString(16)} — wrong collection, or not in multitouch mode. See the byte dumps above.`);
    }
  }, 1500);
}

async function enable(device: HIDDevice): Promise<void> {
  if (!device.opened) await device.open();
  if (DEBUG) {
    const cols = device.collections.map((c) => `0x${(c.usagePage ?? 0).toString(16)}/0x${(c.usage ?? 0).toString(16)}`);
    console.info(`[trackpad] opened "${device.productName}" — collections: ${cols.join(", ") || "(none reported)"}`);
  }
  try {
    // switch into raw multitouch mode: feature report 0x02, payload 0x01
    await device.sendFeatureReport(TOUCH_REPORT_ID, new Uint8Array([0x01]));
    if (DEBUG) console.info("[trackpad] multitouch-enable feature report sent OK");
  } catch (err) {
    // some stacks reject this or it's already enabled — keep going, we may
    // still get frames.
    if (DEBUG) console.warn(`[trackpad] enable feature report failed: ${(err as Error).message} (may already be enabled, or the interface is OS-held)`);
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
