// Trackpad Synth Bridge — Ulanzi Deck plugin main service (Node.js v20, run by UlanziStudio).
//
// Why this exists: the Ulanzi D100H can't store a custom layout (see DESIGN.md). Standalone it
// only ever emits fixed system codes — and its 4 side keys ride the Keyboard HID collection,
// which Windows won't let an app read. The ONLY way to get all 7 keys cleanly, with no system
// volume/media side effects, is to consume the device *while Ulanzi Studio runs* via a plugin.
//
// This service connects to UlanziStudio (which receives the BLE-HID input and dispatches our
// action), and re-broadcasts every dial + key event to the synth over a localhost WebSocket.
// The synth's src/input/dial-bridge.ts connects here and drives the existing DialHandlers.
//
//   Filter & Transport action (Encoder, the dial): rotate = DJ filter sweep, push = play/stop.
//   Drum Pad action (Keypad, the keys):            press = hit a drum pad. Place it on all 7 keys.
//
// All customization is online-only: it works while Studio is running. Nothing is written to the
// device.

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import UlanziApi from "../ulanzi-api/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.join(__dirname, "..");

const PLUGIN_UUID = "com.ulanzi.ulanzistudio.trackpadsynth";

// Fixed localhost port the synth connects to. Override with TRACKPAD_SYNTH_PORT if it ever clashes.
const BRIDGE_PORT = Number(process.env.TRACKPAD_SYNTH_PORT) || 48907;

const $UD = new UlanziApi();
const LOGFILE = path.join(PLUGIN_ROOT, "trackpad-synth.log");
const log = (m) => {
  try { $UD.logMessage("[trackpad-synth] " + m); } catch (e) {}
  try { fs.appendFileSync(LOGFILE, new Date().toISOString() + " " + m + "\n"); } catch (e) {}
};

const paramOf = (m) => m.param || m.payload || m.settings || {};

// ── localhost WebSocket server: the synth (browser / Electron) connects here ──────────────────
const clients = new Set();
let wss = null;

function startServer() {
  wss = new WebSocketServer({ host: "127.0.0.1", port: BRIDGE_PORT });
  wss.on("listening", () => log(`bridge WebSocket listening on ws://127.0.0.1:${BRIDGE_PORT}`));
  wss.on("connection", (ws) => {
    clients.add(ws);
    log(`synth connected (${clients.size} client(s))`);
    try { ws.send(JSON.stringify({ type: "hello", from: "trackpad-synth-bridge", port: BRIDGE_PORT })); } catch (e) {}
    ws.on("close", () => { clients.delete(ws); log(`synth disconnected (${clients.size} client(s))`); });
    ws.on("error", () => { clients.delete(ws); });
  });
  wss.on("error", (e) => {
    log(`bridge server error: ${e.message}` + (e.code === "EADDRINUSE" ? " (port already in use — another instance running?)" : ""));
  });
}

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  // log discrete dial/key events so the .log doubles as a live probe: turn the dial and
  // watch — lines here mean Studio IS seeing the device; "0 client(s)" means the synth
  // (Chumthesizer) isn't connected; silence means no action is placed / device unpaired.
  log(`event ${msg} → ${clients.size} client(s)`);
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      try { ws.send(msg); } catch (e) {}
    }
  }
}

// ── pad-index mapping: each Drum Pad instance → a synth pad (0-based) ──────────────────────────
// Default is "Auto": pads are handed out in first-seen order, so dropping the action on all 7
// keys gives 7 distinct pads with zero config. The Property Inspector can pin an explicit pad.
const explicitPad = new Map(); // context -> 0-based pad index
const autoIndex = new Map();   // host key slot -> 0-based pad index
let nextAuto = 0;

function rememberPad(message) {
  const raw = paramOf(message).pad;
  if (raw !== undefined && raw !== null && String(raw) !== "") {
    const idx = Number(raw) - 1; // PI offers 1..8; store 0-based
    if (Number.isFinite(idx) && idx >= 0) {
      explicitPad.set(message.context, idx);
      $UD.setStateIcon(message.context, 0, "PAD " + (idx + 1));
      return;
    }
  }
  explicitPad.delete(message.context);
  $UD.setStateIcon(message.context, 0, "PAD");
}

function resolvePad(message) {
  if (explicitPad.has(message.context)) return explicitPad.get(message.context);
  const key = $UD.decodeContext(message.context).key; // stable per physical placement
  if (!autoIndex.has(key)) autoIndex.set(key, nextAuto++);
  return autoIndex.get(key);
}

// ── connect to UlanziStudio ───────────────────────────────────────────────────────────────────
startServer();
$UD.connect(PLUGIN_UUID);

$UD.onConnected(() => {
  log(`connected to UlanziStudio; bridging to ws://127.0.0.1:${BRIDGE_PORT}`);
});

$UD.onAdd((message) => {
  // A Drum Pad carries a (possibly empty) pad setting; the dial action does not.
  if ("pad" in paramOf(message) || message.uuid === PLUGIN_UUID + ".pad") rememberPad(message);
  else $UD.setStateIcon(message.context, 0, "FILTER");
});

$UD.onParamFromApp(rememberPad);
$UD.onParamFromPlugin(rememberPad);

$UD.onClear((message) => {
  if (Array.isArray(message.param)) for (const it of message.param) explicitPad.delete(it.context);
});

// ── dial (Filter & Transport / Encoder) ─────────────────────────────────────────────────────────
// rotateEvent is 'left' | 'right' | 'hold-left' | 'hold-right'; treat hold-rotate the same as rotate.
$UD.onDialRotate((message) => {
  const dir = String(message.rotateEvent || "").includes("left") ? -1 : 1;
  broadcast({ type: "rotate", dir });
});

$UD.onDialDown(() => {
  broadcast({ type: "press" }); // play / stop
});

// ── keys (Drum Pad / Keypad) ──────────────────────────────────────────────────────────────────
// onRun is the confirmed single-press trigger for a keypad action. A drum hit is one-shot, so we
// forward a single button-down; the synth's onButton only acts on pressed === true.
$UD.onRun((message) => {
  const index = resolvePad(message);
  broadcast({ type: "button", index, pressed: true });
  $UD.setStateIcon(message.context, 0, "PAD " + (index + 1));
});
