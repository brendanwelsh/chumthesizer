import type { StatusCb } from "../types";

/** Elgato Stream Deck Pedal — a 3-switch USB foot pedal, read as raw HID over WebHID.
 *  No Elgato software needed; the Electron shell disables Chromium's HID blocklist.
 *
 *  Device: VID 0x0FD9 (Elgato) / PID 0x0086 (Stream Deck Pedal).
 *
 *  Input report (confirmed against python-elgato-streamdeck and node-elgato-stream-deck):
 *    raw report = [reportId=0x01][header ...][L][M][R]  — button states 1=pressed / 0=released.
 *    python reads `4 + KEY_COUNT` bytes and takes states from byte 4 onward; node uses
 *    KEY_DATA_OFFSET = 3 on a buffer that has already stripped the report-id byte. Both put
 *    the 3 states at raw bytes 4,5,6.
 *  WebHID strips the report-id from event.data (it's exposed as event.reportId), so in the
 *  inputreport DataView the 3 states are at offsets 3, 4, 5 → left, middle, right. */

const ELGATO_VID = 0x0fd9;
const PEDAL_PID = 0x0086;
const KEY_COUNT = 3;
// state offset inside the WebHID inputreport DataView (report-id already stripped).
const STATE_OFFSET = 3;

export interface PedalHandlers {
  onPress: (index: number) => void; // index 0,1,2 = left,middle,right
  onRelease: (index: number) => void;
}

export interface PedalDevice {
  reconnect(): void;
  close(): void;
}

function attach(device: HIDDevice, h: PedalHandlers, status: StatusCb): () => void {
  const prev = new Array<boolean>(KEY_COUNT).fill(false);

  const listener = (e: HIDInputReportEvent) => {
    const dv = e.data;
    // be robust to report-layout surprises: only read bytes we actually have
    for (let i = 0; i < KEY_COUNT; i++) {
      const off = STATE_OFFSET + i;
      if (off >= dv.byteLength) break;
      const pressed = dv.getUint8(off) !== 0;
      if (pressed === prev[i]) continue;
      prev[i] = pressed;
      if (pressed) h.onPress(i);
      else h.onRelease(i);
    }
  };

  device.addEventListener("inputreport", listener);
  status({ connected: true, label: device.productName || "Stream Deck Pedal" });
  return () => device.removeEventListener("inputreport", listener);
}

async function open(device: HIDDevice): Promise<void> {
  if (!device.opened) await device.open();
}

export function initPedal(h: PedalHandlers, status: StatusCb): PedalDevice {
  let detach: (() => void) | null = null;

  const wire = async (device: HIDDevice) => {
    try {
      await open(device);
      detach?.();
      detach = attach(device, h, status);
    } catch (err) {
      status({ connected: false, label: `couldn't open (${(err as Error).message})` });
    }
  };

  // try an already-permitted pedal on startup (no user gesture needed)
  void (async () => {
    if (!("hid" in navigator)) {
      status({ connected: false, label: "WebHID unsupported — use Chrome/Edge or the Electron app" });
      return;
    }
    try {
      const devices = await navigator.hid.getDevices();
      const pedal = devices.find((d) => d.vendorId === ELGATO_VID && d.productId === PEDAL_PID);
      if (pedal) await wire(pedal);
      else status({ connected: false, label: "Pedal" });
    } catch {
      status({ connected: false, label: "Pedal" });
    }
  })();

  return {
    // user gesture: prompt to grant + connect the pedal
    reconnect() {
      void (async () => {
        if (!("hid" in navigator)) {
          status({ connected: false, label: "WebHID unsupported — use Chrome/Edge or the Electron app" });
          return;
        }
        status({ connected: false, label: "choosing…" });
        let devices: HIDDevice[];
        try {
          devices = await navigator.hid.requestDevice({
            filters: [{ vendorId: ELGATO_VID, productId: PEDAL_PID }],
          });
        } catch {
          status({ connected: false, label: "no device picked" });
          return;
        }
        const pedal = devices[0];
        if (!pedal) {
          status({ connected: false, label: "no device picked" });
          return;
        }
        await wire(pedal);
      })();
    },
    close() {
      detach?.();
      detach = null;
      status({ connected: false, label: "Pedal" });
    },
  };
}
