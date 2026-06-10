import type { StatusCb, DialHandlers } from "../types";

/** Ulanzi D100H over the UlanziDeck plugin bridge (the clean, all-7-keys path).
 *
 *  The real hardware is a D100H, which can't be reprogrammed and whose 4 side keys ride the
 *  Keyboard HID collection that Windows blocks apps from reading (see DESIGN.md). So instead of
 *  reading raw HID, we run a tiny UlanziDeck plugin (ulanzi-plugin/) that consumes the device
 *  while Ulanzi Studio is running and re-broadcasts every dial + key event over a localhost
 *  WebSocket. This client connects to that socket and drives the SAME `DialHandlers` the raw-HID
 *  path used — so the engine/mapping in main.ts doesn't change.
 *
 *  Bridge messages (plugin → synth):
 *    { type: "hello" }                                 handshake on connect
 *    { type: "rotate", dir: -1 | 1 }                   dial rotate (DJ filter sweep)
 *    { type: "press" }                                 dial push (play / stop)
 *    { type: "button", index: number, pressed: true }  a key → drum pad hit
 */

const DEFAULT_PORT = 48907;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 5000;

export interface DialBridge {
  /** force an immediate (re)connect attempt */
  reconnect(): void;
  /** stop connecting and close the socket */
  close(): void;
}

interface BridgeOpts {
  port?: number;
  host?: string;
}

type BridgeMsg =
  | { type: "hello" }
  | { type: "rotate"; dir: number }
  | { type: "press" }
  | { type: "button"; index: number; pressed: boolean };

export function initDialBridge(h: DialHandlers, status: StatusCb, opts: BridgeOpts = {}): DialBridge {
  const url = `ws://${opts.host ?? "127.0.0.1"}:${opts.port ?? DEFAULT_PORT}`;
  let ws: WebSocket | null = null;
  let retry = RETRY_MIN_MS;
  let timer: number | undefined;
  let stopped = false;

  const clearTimer = () => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
  };

  const scheduleRetry = () => {
    if (stopped) return;
    clearTimer();
    timer = window.setTimeout(connect, retry);
    retry = Math.min(retry * 1.6, RETRY_MAX_MS);
  };

  function handle(msg: BridgeMsg): void {
    switch (msg.type) {
      case "rotate":
        if (typeof msg.dir === "number") h.onRotate(msg.dir);
        break;
      case "press":
        h.onPress();
        break;
      case "button":
        if (typeof msg.index === "number") h.onButton(msg.index, !!msg.pressed);
        break;
      // "hello" — nothing to do; the open handler already flagged us connected
    }
  }

  function connect(): void {
    if (stopped) return;
    clearTimer();
    // tear down any half-open socket before retrying
    if (ws) { try { ws.onclose = null; ws.close(); } catch { /* ignore */ } ws = null; }

    status({ connected: false, label: "connecting to dial bridge…" });
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleRetry();
      return;
    }

    ws.onopen = () => {
      retry = RETRY_MIN_MS;
      status({ connected: true, label: "Ulanzi D100H (via Studio)" });
    };
    ws.onmessage = (ev) => {
      let msg: BridgeMsg;
      try { msg = JSON.parse(ev.data as string); } catch { return; }
      handle(msg);
    };
    ws.onclose = () => {
      ws = null;
      status({ connected: false, label: "dial bridge offline — start the plugin + Ulanzi Studio" });
      scheduleRetry();
    };
    ws.onerror = () => {
      // onclose fires right after; let it handle the retry
    };
  }

  connect();

  return {
    reconnect() { retry = RETRY_MIN_MS; connect(); },
    close() {
      stopped = true;
      clearTimer();
      if (ws) { try { ws.onclose = null; ws.close(); } catch { /* ignore */ } ws = null; }
      status({ connected: false, label: "dial bridge stopped" });
    },
  };
}
