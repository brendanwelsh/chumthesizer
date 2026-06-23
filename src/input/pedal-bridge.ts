import type { StatusCb } from "../types";

/** Elgato Stream Deck Pedal over the Stream Deck plugin bridge.
 *
 *  When the Elgato Stream Deck software is running it owns the Pedal, so Chumthesizer can't read it
 *  directly over WebHID. Instead we run a tiny Stream Deck plugin (plugins/streamdeck-plugin/) that hosts
 *  the device inside the Stream Deck software and re-broadcasts every pedal press/release over a
 *  localhost WebSocket. This client connects to that socket and drives `PedalHandlers`.
 *
 *  (Same shape as src/input/dial-bridge.ts, which does this for the Ulanzi D100H.)
 *
 *  Bridge messages (plugin → synth):
 *    { type: "hello" }                         handshake on connect
 *    { type: "press",   index: number }        pedal pressed  (0-based: 0/1/2)
 *    { type: "release", index: number }        pedal released (0-based: 0/1/2)
 */

const DEFAULT_PORT = 48909;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 15000; // back off to 15s so the hosted (no-Stream-Deck) site isn't hammering
                            // localhost forever; the Settings "reconnect" button forces a retry.

export interface PedalHandlers {
  onPress: (i: number) => void;
  onRelease: (i: number) => void;
}

export interface PedalBridge {
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
  | { type: "press"; index: number }
  | { type: "release"; index: number };

export function initPedalBridge(h: PedalHandlers, status: StatusCb, opts: BridgeOpts = {}): PedalBridge {
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
      case "press":
        if (typeof msg.index === "number") h.onPress(msg.index);
        break;
      case "release":
        if (typeof msg.index === "number") h.onRelease(msg.index);
        break;
      // "hello" — nothing to do; the open handler already flagged us connected
    }
  }

  function connect(): void {
    if (stopped) return;
    clearTimer();
    // tear down any half-open socket before retrying
    if (ws) { try { ws.onclose = null; ws.close(); } catch { /* ignore */ } ws = null; }

    status({ connected: false, label: "connecting to pedal bridge…" });
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleRetry();
      return;
    }

    ws.onopen = () => {
      retry = RETRY_MIN_MS;
      status({ connected: true, label: "Stream Deck Pedal (via Stream Deck)" });
    };
    ws.onmessage = (ev) => {
      let msg: BridgeMsg;
      try { msg = JSON.parse(ev.data as string); } catch { return; }
      handle(msg);
    };
    ws.onclose = () => {
      ws = null;
      status({ connected: false, label: "pedal bridge offline — start the plugin + Stream Deck" });
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
      status({ connected: false, label: "pedal bridge stopped" });
    },
  };
}
