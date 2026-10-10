const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const {
  SESSION_PARTITION,
  fetchAllCapacity,
} = require("./location-capacity-api");

(function configureStableUserDataAndCache() {
  try {
    const local =
      process.env.LOCALAPPDATA ||
      path.join(os.homedir(), "AppData", "Local");
    const userDataDir = path.join(local, "YNA4MinimapDesktop");
    fs.mkdirSync(userDataDir, { recursive: true });
    app.setPath("userData", userDataDir);
  } catch (e) {
    console.warn("[yna4-minimap] userData:", e && e.message ? e.message : e);
  }
  try {
    const cacheDir = path.join(os.tmpdir(), "yna4-minimap-chromium-cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    app.commandLine.appendSwitch("disk-cache-dir", cacheDir);
  } catch (e2) {}
})();

let mainWin = null;
let inventoryLoginWin = null;

function resolveWindowIconPath() {
  var png = path.join(__dirname, "build", "icon.png");
  if (fs.existsSync(png)) return png;
  var ico = path.join(__dirname, "build", "icon.ico");
  if (fs.existsSync(ico)) return ico;
  return undefined;
}

function chamberLayoutPath() {
  return path.join(__dirname, "chamber-layout.json");
}

function readChamberLayoutFile() {
  const p = chamberLayoutPath();
  if (!fs.existsSync(p)) {
    return { ok: false, error: "chamber-layout.json 없음" };
  }
  try {
    const layout = JSON.parse(fs.readFileSync(p, "utf8"));
    return { ok: true, layout, fileName: path.basename(p), path: p };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "YAN4 1챔ber 미니맵",
    icon: resolveWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWin.loadFile(path.join(__dirname, "index.html"));
  mainWin.on("closed", function () {
    mainWin = null;
  });
}

ipcMain.handle("yna4-minimap:read-chamber-layout", async function () {
  return readChamberLayoutFile();
});

ipcMain.handle("yna4-minimap:save-chamber-layout", async function (_ev, layout) {
  try {
    const p = chamberLayoutPath();
    fs.writeFileSync(p, JSON.stringify(layout, null, 2), "utf8");
    return { ok: true, path: p };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle("yna4-minimap:open-login", async function () {
  const listUrl =
    "https://inventory.coupang.com/storagecapacity/bin?zone=1C&aisle=2";
  if (inventoryLoginWin && !inventoryLoginWin.isDestroyed()) {
    inventoryLoginWin.focus();
    return { ok: true, reused: true };
  }
  inventoryLoginWin = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    title: "inventory 로그인 (미니맵 API)",
    webPreferences: {
      partition: SESSION_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  inventoryLoginWin.on("closed", function () {
    inventoryLoginWin = null;
  });
  try {
    await inventoryLoginWin.loadURL(listUrl);
  } catch (e) {
    try {
      if (inventoryLoginWin && !inventoryLoginWin.isDestroyed()) {
        inventoryLoginWin.destroy();
      }
    } catch (e2) {}
    inventoryLoginWin = null;
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
  return { ok: true };
});

ipcMain.handle("yna4-minimap:fetch-capacity", async function (event, boxes) {
  try {
    const sender = event.sender;
    if (!Array.isArray(boxes) || !boxes.length) {
      return {
        ok: false,
        error: "apiBoxes가 비어 있습니다. chamber-layout.json에 1007- 항목을 추가하세요.",
      };
    }
    const pack = await fetchAllCapacity(boxes, function (cur, total, name, range) {
      if (sender && !sender.isDestroyed()) {
        sender.send("yna4-minimap:fetch-progress", {
          cur,
          total,
          name,
          range,
        });
      }
    });
    return {
      ok: true,
      usageMap: pack.usageMap,
      bayCount: pack.bayCount,
      lotCount: pack.lotCount,
      aisleCount: pack.aisleCount,
    };
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
    };
  }
});

app.whenReady().then(function () {
  createWindow();
  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

