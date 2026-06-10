// Headless driver: load the built app, run a control sequence against window.__chum, screenshot.
// Usage: electron _drive.cjs [--seq=_drive_seq.js] [--out=drive.png] [--w=1440] [--h=900]
// The sequence file is JS with `c` (= window.__chum) and `sleep(ms)` in scope.
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const arg = (p) => { const a = process.argv.find((x) => x.startsWith(p)); return a ? a.slice(p.length) : null; };
const num = (p, d) => { const v = arg(p); return v ? Number(v) : d; };
const OUT = arg("--out=") || path.join(__dirname, "drive.png");
const SEQFILE = arg("--seq=") || path.join(__dirname, "_drive_seq.js");
const W = num("--w=", 1440), H = num("--h=", 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.commandLine.appendSwitch("disable-hid-blocklist");
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, show: false, backgroundColor: "#1c1c1e", webPreferences: { sandbox: false } });
  await win.loadFile(path.join(__dirname, "dist", "index.html"));
  await sleep(1000);
  await win.webContents.executeJavaScript(
    "window.dispatchEvent(new Event('pointerdown'));document.body.classList.add('started');" +
    "var h=document.getElementById('hint');if(h)h.remove();true",
  );
  const seq = fs.existsSync(SEQFILE) ? fs.readFileSync(SEQFILE, "utf8") : "";
  let result = null;
  try {
    result = await win.webContents.executeJavaScript(
      "(async()=>{const c=window.__chum;const sleep=ms=>new Promise(r=>setTimeout(r,ms));" +
      "if(!c)return 'NO __chum API';try{" + seq + "\nreturn c.state?c.state():'ok';}catch(e){return 'ERR '+e.message;}})()",
    );
  } catch (e) { result = "exec err " + e.message; }
  await sleep(700);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  console.log("DRIVE result:", JSON.stringify(result));
  console.log("DRIVE shot:", OUT, img.getSize());
  app.quit();
});
app.on("window-all-closed", () => app.quit());
