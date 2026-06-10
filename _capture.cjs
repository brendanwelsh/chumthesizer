// One-shot screenshot of the built CHUM-1 app, rendered off-screen.
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const OUT = process.argv.find((a) => a.startsWith("--out="))?.slice(6) || path.join(__dirname, "shot.png");
const W = Number(process.argv.find((a) => a.startsWith("--w="))?.slice(4)) || 1600;
const H = Number(process.argv.find((a) => a.startsWith("--h="))?.slice(4)) || 1000;

app.commandLine.appendSwitch("disable-hid-blocklist");

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, show: false, backgroundColor: "#1c1c1e", webPreferences: { sandbox: false, offscreen: false } });
  await win.loadFile(path.join(__dirname, "dist", "index.html"));
  await new Promise((r) => setTimeout(r, 1200));
  try {
    await win.webContents.executeJavaScript(
      "document.body.classList.add('started');" +
      "var h=document.getElementById('hint'); if(h) h.remove();" +
      "var s=document.createElement('style');s.textContent='#hint,.hint{display:none!important}';document.head.appendChild(s);true",
    );
  } catch (e) { console.log("interact err", e.message); }
  await new Promise((r) => setTimeout(r, 1800));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  console.log("CAPTURED", OUT, img.getSize());
  app.quit();
});
app.on("window-all-closed", () => app.quit());
