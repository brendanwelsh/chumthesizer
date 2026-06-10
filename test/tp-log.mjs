// Raw trackpad-helper logger — connects to the C# helper's WebSocket (:48808) and prints the
// contacts it reports, INDEPENDENT of the Electron app. If touching with one finger logs ONE
// contact here, the phantom is app-side (a pointer event); if it logs TWO, it's the helper.
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { WebSocket } = require(path.join(__dirname, "..", "ulanzi-plugin", "com.ulanzi.trackpadsynth.ulanziPlugin", "node_modules", "ws"));

const ws = new WebSocket("ws://127.0.0.1:48808");
let last = -1;
let lastLog = 0;
ws.on("open", () => console.log("[tp-log] connected to helper :48808 — TOUCH THE TRACKPAD WITH ONE FINGER now"));
ws.on("message", (raw) => {
  let m; try { m = JSON.parse(raw.toString()); } catch { return; }
  if (m.type !== "contacts") return;
  const n = m.points.length;
  const now = Date.now();
  // log whenever the contact count changes, plus a heartbeat sample at most ~3x/sec while held
  if (n !== last || (n > 0 && now - lastLog > 350)) {
    last = n; lastLog = now;
    const pts = m.points.map((p) => `(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`).join("  ");
    console.log(`${n} contact(s): ${pts}`);
  }
});
ws.on("error", (e) => console.log("[tp-log] error:", e.message));
ws.on("close", () => console.log("[tp-log] closed"));
