const { app, BrowserWindow, Menu, screen, desktopCapturer } = require("electron");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");

// The trackpad IS the instrument, so the app launches the Raw-Input helper itself —
// end-user experience is: open Chumthesizer, the trackpad just works (multi-finger play
// + Windows 3/4-finger gestures auto-muted). No second window, no command line.
let helper = null;
function startHelper() {
  const exe = path.join(__dirname, "..", "trackpad-bridge", "bin", "Release", "net8.0-windows", "trackpad-bridge.exe");
  try {
    helper = spawn(exe, [], { windowsHide: true, stdio: "ignore" });
    helper.on("error", (e) => console.log("[chum] trackpad helper not started:", e.message, "(build it: npm run setup:trackpad)"));
  } catch (e) {
    console.log("[chum] trackpad helper spawn failed:", e.message);
  }
}
function stopHelperAndRestore() {
  if (helper) { try { helper.kill(); } catch (e) { /* ignore */ } helper = null; }
  // the helper can be hard-killed before it restores; bring the user's touchpad gestures back
  try {
    execFileSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "..", "scripts", "touchpad-gestures.ps1"), "on"],
      { windowsHide: true, timeout: 6000 },
    );
  } catch (e) { /* best effort */ }
}

// Let the renderer's WebHID reach the Magic Trackpad's multitouch collection.
// Chromium normally blocklists protected usage pages (pointer/digitizer); this
// is the key advantage of shipping in Electron over a stock browser.
app.commandLine.appendSwitch("disable-hid-blocklist");

function createWindow() {
  // Size to most of the work area and CENTER it — a normal, restorable window. We don't
  // maximize(): a maximized Electron window glitches its frame/content on minimize→restore,
  // and the user is fine with a big half/near-full window anyway.
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const w = Math.min(1600, Math.round(sw * 0.92));
  const h = Math.min(1000, Math.round(sh * 0.92));
  const win = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 900,
    minHeight: 640,
    center: true,
    backgroundColor: "#e7e8ee",   // matches the app's light chassis (no dark flash on launch/resize)
    title: "Chumthesizer",
    webPreferences: { sandbox: false },
  });

  // No app menu: the default File/Edit bar steals F10 (our PLAY↔NAV key) and Alt (menu focus)
  // from a keyboard-played instrument. DevTools stays reachable on Ctrl+Shift+I below.
  Menu.setApplicationMenu(null);
  win.webContents.on("before-input-event", (_ev, input) => {
    if (input.type === "keyDown" && input.control && input.shift && input.key.toLowerCase() === "i") {
      win.webContents.toggleDevTools();
    }
  });

  const ses = win.webContents.session;

  // approve HID + MIDI + microphone (media) for this local app — the mic sampler uses getUserMedia
  const allowed = (p) => p === "hid" || p === "midi" || p === "midiSysex" || p === "media";
  ses.setPermissionCheckHandler((_wc, permission) => allowed(permission));
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed(permission)));
  ses.setDevicePermissionHandler((details) => details.deviceType === "hid");

  // Desktop-audio sampling: when the renderer calls getDisplayMedia (the "Sample desktop audio"
  // button), grant a screen source with LOOPBACK audio so the sampler can grab whatever is playing
  // on the system (Spotify, a browser tab, etc.). The renderer keeps only the audio track.
  try {
    ses.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer.getSources({ types: ["screen"] })
        .then((sources) => callback({ video: sources[0], audio: "loopback" }))
        .catch(() => callback({}));
    });
  } catch (e) { /* older Electron — desktop-audio sampling just won't be offered */ }
  ses.on("select-hid-device", (event, details, callback) => {
    event.preventDefault();
    const list = details.deviceList || [];
    // The Elgato Stream Deck Pedal (vendor 0x0fd9) is a plain button device — pick it
    // directly when it's in the candidate list (its request filters by this vendor).
    const ELGATO_VID = 0x0fd9;
    const pedal = list.find((d) => d.vendorId === ELGATO_VID);
    // Apple's trackpad is a composite device: the raw multitouch + pressure frames
    // ride a VENDOR-defined collection (usagePage >= 0xff00), not the mouse/touchpad
    // one. Prefer that interface so we actually receive the 0x02 reports.
    const looksVendor = (d) =>
      (d.collections || []).some((c) => (c.usagePage || 0) >= 0xff00) || /vendor/i.test(d.name || "");
    const chosen = pedal || list.find(looksVendor) || list[0];
    console.log(
      "[hid] candidates:",
      list
        .map((d) => `${d.name}[${(d.collections || []).map((c) => "0x" + (c.usagePage || 0).toString(16)).join(",")}]`)
        .join(" | ")
    );
    console.log("[hid] chose:", chosen ? chosen.name : "(none)");
    callback(chosen ? chosen.deviceId : null);
  });

  const devURL = process.env.VITE_DEV_SERVER_URL;
  if (devURL) win.loadURL(devURL);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(() => {
  startHelper();   // launch the trackpad helper alongside the app
  createWindow();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("before-quit", stopHelperAndRestore);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
