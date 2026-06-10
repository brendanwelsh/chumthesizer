// One-shot screenshot: load the built app off-screen, dismiss the start hint so the
// live visual shows, capture the page to PNG, quit. No trackpad helper, no side effects.
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const OUT = process.argv.find((a) => a.startsWith("--out="))?.slice(6)
  || path.join(__dirname, "..", "screenshot.png");
const W = 1600, H = 1000;

app.commandLine.appendSwitch("disable-hid-blocklist");

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W, height: H, show: false,
    backgroundColor: "#262626",
    webPreferences: { sandbox: false, offscreen: false },
  });
  await win.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  // let it lay out, then simulate the "click to start" so the hint clears + visuals run
  await new Promise((r) => setTimeout(r, 1200));
  try {
    await win.webContents.executeJavaScript(
      "window.dispatchEvent(new Event('pointerdown'));" +   // trips the autoplay 'kick' -> body.started
      "document.body.classList.add('started');" +
      "var s=document.createElement('style');s.textContent='#hint,.hint{display:none!important}';document.head.appendChild(s);" +
      "true"
    );
  } catch (e) { console.log("interact err", e.message); }
  await new Promise((r) => setTimeout(r, 2500)); // let the shark/visualizer animate a few frames
  const img = await win.webContents.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  console.log("CAPTURED", OUT, img.getSize());
  app.quit();
});
app.on("window-all-closed", () => app.quit());
