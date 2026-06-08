"""
trackpad_pressure_spike.py — prove we can read per-finger PRESSURE from an Apple
Magic Trackpad 2 on Windows by reading its RAW HID reports directly.

Why this exists
---------------
Every Windows driver for the Magic Trackpad 2 (imbushuo mac-precision-touchpad,
Magic Utilities, Boot Camp) presents it as a normal Precision Touchpad and THROWS
THE FORCE DATA AWAY — you get a click, not a pressure value. But the force is right
there in the device's raw multitouch frames; Linux's hid-magicmouse driver decodes
it as byte 7 of each finger's 9-byte struct. This spike grabs those raw frames on
Windows and decodes the pressure ourselves. If pressure numbers stream when you
press, the whole magic-trackpad-synth project is unblocked.

This is the make-or-break feasibility test. It is UNTESTED on real hardware here
(no trackpad on this box) — run it and tell me what it prints.

Setup
-----
  1. Connect the Magic Trackpad 2 by USB CABLE (wired). Bluetooth raw access on
     Windows is unreliable; use the cable for this spike.
  2. pip install hidapi
  3. python trackpad_pressure_spike.py
  4. Rest fingers on the trackpad and press harder/softer.

Expected: lines like  finger 0  x=+0123 y=-0456  size= 42  PRESSURE= 88
with PRESSURE climbing as you press harder.

If it can't open the device, sees no 0x02 reports, or send_feature_report fails,
the Windows HID stack is holding the trackpad interface exclusively. Fallback:
install Zadig (https://zadig.akeo.ie), bind WinUSB to the trackpad interface, and
read raw interrupt transfers with pyusb instead (same decode below). See DESIGN.md.
"""

import sys
import time

try:
    import hid  # the `hidapi` package
except ImportError:
    sys.exit("Need hidapi:  pip install hidapi")

APPLE_VID = 0x05AC

# Switch the trackpad into raw multitouch mode. Report ID 0x02, payload 0x01.
# (Linux: feature_mt_trackpad2_usb[] = { 0x02, 0x01 } sent as a FEATURE report.)
ENABLE_MULTITOUCH_USB = [0x02, 0x01]

USB_REPORT_ID = 0x02   # raw touch frames arrive under this report id (USB)
TOUCH_OFFSET = 12      # per-finger structs start 12 bytes into the report (USB)
FINGER_STRIDE = 9      # each finger = 9 bytes


def signed32(v: int) -> int:
    """Interpret the low 32 bits of v as a C `int` (so >> is arithmetic)."""
    v &= 0xFFFFFFFF
    return v - 0x100000000 if v & 0x80000000 else v


def decode_finger(t: bytes) -> dict:
    """Decode one 9-byte finger struct. Byte layout from Linux
    drivers/hid/hid-magicmouse.c (Magic Trackpad 2)."""
    x = signed32((t[1] << 27) | (t[0] << 19)) >> 19
    y = -(signed32((t[3] << 30) | (t[2] << 22) | (t[1] << 14)) >> 19)
    return {
        "id": t[8] & 0x0F,
        "x": x,
        "y": y,
        "touch_major": t[4],
        "touch_minor": t[5],
        "size": t[6],
        "pressure": t[7],        # <-- the force value we came for
        "state": t[3] & 0xC0,    # 0x80 == finger down
    }


def find_candidates():
    """All Apple HID interfaces, vendor-usage ones first (raw multitouch lives
    on a vendor-defined usage page, ~0xFF00+)."""
    devs = [d for d in hid.enumerate() if d["vendor_id"] == APPLE_VID]
    devs.sort(key=lambda d: d.get("usage_page", 0), reverse=True)
    return devs


def main():
    cands = find_candidates()
    if not cands:
        sys.exit("No Apple HID device found. Is the Magic Trackpad 2 plugged in "
                 "by USB cable and powered on?")

    print("Apple HID interfaces found:")
    for d in cands:
        print(f"  pid=0x{d['vendor_id']:04x}:0x{d['product_id']:04x} "
              f"usage_page=0x{d.get('usage_page', 0):04x} "
              f"usage=0x{d.get('usage', 0):04x}  {d.get('product_string')!r}  "
              f"path={d['path']}")
    print()

    # Try each interface: open, flip to multitouch mode, look for 0x02 frames.
    for d in cands:
        try:
            dev = hid.Device(path=d["path"])
        except Exception as e:
            print(f"  skip {d['path']}: open failed ({e})")
            continue
        try:
            try:
                dev.send_feature_report(bytes(ENABLE_MULTITOUCH_USB))
            except Exception as e:
                print(f"  {d['path']}: feature report rejected ({e}) — trying reads anyway")
            dev.nonblocking = True

            print(f"  probing {d['path']} for raw multitouch frames (2s)...")
            deadline = time.time() + 2.0
            while time.time() < deadline:
                buf = dev.read(256, timeout=50)
                if buf and buf[0] == USB_REPORT_ID and len(buf) >= TOUCH_OFFSET + FINGER_STRIDE:
                    print(f"  >>> got raw multitouch on {d['path']} — streaming. "
                          f"Press the trackpad. Ctrl+C to stop.\n")
                    stream(dev)
                    return
            print("  no 0x02 frames here.")
        finally:
            dev.close()

    print("\nNo interface yielded raw multitouch frames. The Windows HID stack is "
          "probably holding the trackpad exclusively.\nFallback: bind WinUSB with "
          "Zadig and read via pyusb (see DESIGN.md).")


def stream(dev):
    while True:
        buf = dev.read(256, timeout=200)
        if not buf or buf[0] != USB_REPORT_ID:
            continue
        n = (len(buf) - TOUCH_OFFSET) // FINGER_STRIDE
        for i in range(n):
            off = TOUCH_OFFSET + i * FINGER_STRIDE
            t = buf[off:off + FINGER_STRIDE]
            if len(t) < FINGER_STRIDE or not any(t):
                continue
            f = decode_finger(t)
            if f["state"] != 0x80 and f["pressure"] == 0:
                continue  # not a live contact
            print(f"finger {f['id']}  x={f['x']:+05d} y={f['y']:+05d}  "
                  f"size={f['size']:3d}  PRESSURE={f['pressure']:3d}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nbye")
