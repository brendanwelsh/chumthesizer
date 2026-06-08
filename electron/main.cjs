const { app, BrowserWindow } = require("electron");
const path = require("node:path");

// Let the renderer's WebHID reach the Magic Trackpad's multitouch collection.
// Chromium normally blocklists protected usage pages (pointer/digitizer); this
// is the key advantage of shipping in Electron over a stock browser.
app.commandLine.appendSwitch("disable-hid-blocklist");

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    backgroundColor: "#0a0c14",
    title: "Ulanzi MagicPad",
    webPreferences: { sandbox: false },
  });

  const ses = win.webContents.session;

  // approve HID for this local app
  ses.setPermissionCheckHandler((_wc, permission) => permission === "hid");
  ses.setDevicePermissionHandler((details) => details.deviceType === "hid");
  ses.on("select-hid-device", (event, details, callback) => {
    event.preventDefault();
    const device = details.deviceList[0];
    callback(device ? device.deviceId : null);
  });

  const devURL = process.env.VITE_DEV_SERVER_URL;
  if (devURL) win.loadURL(devURL);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(createWindow);
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
