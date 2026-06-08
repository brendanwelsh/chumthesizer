import type { StatusCb } from "../types";

/** Ulanzi Stream Controller D200 dial + buttons over WebHID.
 *
 *  Input reports are framed:  0x7c 0x7c [cmd:u16 BE] [len:u32 LE] [payload…]
 *  IN_BUTTON cmd = 0x0101, payload: [state, index, type, action]
 *    type   0x02 = encoder (the dial), else a key
 *    action 0x01 = press, 0x02 = rotate left, 0x03 = rotate right, else release
 *  (Protocol per the Bitfocus Companion D200 surface project.) */

const ULANZI_VID = 0x2207;
const ULANZI_PID = 0x0019;
const IN_BUTTON = 0x0101;

export interface DialHandlers {
  onRotate: (delta: number) => void;
  onPress: () => void;
  onButton: (index: number, pressed: boolean) => void;
}

function attach(device: HIDDevice, h: DialHandlers, status: StatusCb): void {
  device.addEventListener("inputreport", (e: HIDInputReportEvent) => {
    const dv = e.data;
    if (dv.byteLength < 12) return;
    if (dv.getUint8(0) !== 0x7c || dv.getUint8(1) !== 0x7c) return;
    const cmd = (dv.getUint8(2) << 8) | dv.getUint8(3);
    if (cmd !== IN_BUTTON) return;

    const index = dv.getUint8(9);
    const type = dv.getUint8(10);
    const action = dv.getUint8(11);

    if (type === 0x02) {
      if (action === 0x02) h.onRotate(-1);
      else if (action === 0x03) h.onRotate(+1);
      else if (action === 0x01) h.onPress();
    } else {
      h.onButton(index, action === 0x01);
    }
  });
  status({ connected: true, label: device.productName || "Ulanzi D200" });
}

async function open(device: HIDDevice): Promise<void> {
  if (!device.opened) await device.open();
}

export async function restoreDial(h: DialHandlers, status: StatusCb): Promise<void> {
  if (!("hid" in navigator)) return;
  const devices = await navigator.hid.getDevices();
  const dial = devices.find((d) => d.vendorId === ULANZI_VID);
  if (!dial) return;
  await open(dial);
  attach(dial, h, status);
}

export async function connectDial(h: DialHandlers, status: StatusCb): Promise<void> {
  if (!("hid" in navigator)) {
    status({ connected: false, label: "WebHID unsupported — use Chrome/Edge or the Electron app" });
    return;
  }
  status({ connected: false, label: "choosing…" });
  let devices: HIDDevice[];
  try {
    devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: ULANZI_VID, productId: ULANZI_PID }, { vendorId: ULANZI_VID }],
    });
  } catch {
    status({ connected: false, label: "no device picked" });
    return;
  }
  const dial = devices[0];
  if (!dial) {
    status({ connected: false, label: "no device picked" });
    return;
  }
  try {
    await open(dial);
    attach(dial, h, status);
  } catch (err) {
    status({ connected: false, label: `couldn't open (${(err as Error).message})` });
  }
}
