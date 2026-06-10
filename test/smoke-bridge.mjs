// End-to-end smoke test of the Trackpad Synth Bridge plugin — no real device or Studio needed.
//
//   fake Studio (WS server) ──connects── plugin/app.js ──broadcasts── synth client (WS)
//
// Stands up a fake Ulanzi Studio, launches the real plugin pointed at it, sends real-shaped
// dialrotate / dialdown / run frames, and asserts the synth client receives the correct bridge
// protocol. Run from the repo root:  npm run test:bridge
import { spawn } from "child_process";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.join(__dirname, "..", "ulanzi-plugin", "com.ulanzi.trackpadsynth.ulanziPlugin");
const require = createRequire(import.meta.url);
const { WebSocketServer, WebSocket } = require(path.join(PLUGIN_DIR, "node_modules", "ws"));

const STUDIO_PORT = 39906;
const BRIDGE_PORT = 48910; // non-default so it can't collide with a real install
const A = "com.ulanzi.ulanzistudio.trackpadsynth";

const received = [];
let child;
const fail = (m) => { console.error("FAIL:", m); cleanup(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const studio = new WebSocketServer({ host: "127.0.0.1", port: STUDIO_PORT });
studio.on("connection", (ws) => {
  ws.on("message", async (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.cmd !== "connected") return; // wait for the plugin handshake, then drive it
    const send = (o) => ws.send(JSON.stringify(o));
    await sleep(150); send({ cmd: "dialrotate", uuid: A + ".control", key: "0_2", actionid: "a-dial", rotateEvent: "right" });
    await sleep(120); send({ cmd: "dialrotate", uuid: A + ".control", key: "0_2", actionid: "a-dial", rotateEvent: "left" });
    await sleep(120); send({ cmd: "dialdown",   uuid: A + ".control", key: "0_2", actionid: "a-dial" });
    await sleep(120); send({ cmd: "run", uuid: A + ".pad", key: "0_0", actionid: "k0" });
    await sleep(120); send({ cmd: "run", uuid: A + ".pad", key: "0_1", actionid: "k1" });
    await sleep(120); send({ cmd: "run", uuid: A + ".pad", key: "0_0", actionid: "k0" }); // same key → same pad
    await sleep(700); assert();
  });
});

studio.on("listening", () => {
  child = spawn(process.execPath, ["plugin/app.js", "127.0.0.1", String(STUDIO_PORT), "en"], {
    cwd: PLUGIN_DIR,
    env: { ...process.env, TRACKPAD_SYNTH_PORT: String(BRIDGE_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", () => {}); // SDK logs to stderr; ignore
  connectSynth(0);
});

function connectSynth(attempt) {
  const c = new WebSocket(`ws://127.0.0.1:${BRIDGE_PORT}`);
  c.on("message", (raw) => { try { received.push(JSON.parse(raw.toString())); } catch {} });
  c.on("error", () => { if (attempt < 30) setTimeout(() => connectSynth(attempt + 1), 100); });
}

function assert() {
  const want = [
    { type: "hello" },
    { type: "rotate", dir: 1 },
    { type: "rotate", dir: -1 },
    { type: "press" },
    { type: "button", index: 0, pressed: true },
    { type: "button", index: 1, pressed: true },
  ];
  console.log("synth received:", JSON.stringify(received));
  const got = received.map((m) => ({ type: m.type, ...(m.dir !== undefined ? { dir: m.dir } : {}), ...(m.index !== undefined ? { index: m.index, pressed: m.pressed } : {}) }));
  const norm = (a) => JSON.stringify(a);
  for (const w of want) {
    if (!got.some((g) => norm(g) === norm(w))) return fail("missing expected message " + norm(w));
  }
  console.log("PASS — dial rotate (both dirs), press, and all key→pad mappings forwarded correctly.");
  cleanup(0);
}

function cleanup(code) {
  try { child && child.kill(); } catch {}
  try { studio.close(); } catch {}
  setTimeout(() => process.exit(code), 100);
}

setTimeout(() => fail("timeout — no assertion fired in 6s"), 6000);
