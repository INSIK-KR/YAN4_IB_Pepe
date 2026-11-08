"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain, net, session } = require("electron");

const APP_TITLE = "CFS ATSOOS";
// WMS 로그인 쿠키를 앱 재시작 후에도 유지하는 영구 세션 (다른 CFS 앱과 공유하지 않음)
const PARTITION = "persist:cfs-atsoos";
/** WMS가 Electron 기본 UA를 막는 경우 대비 (CFS IB LIVE와 같은 값) */
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const WMS_LOGIN_URL = "https://inbound.coupang.com/";
const WMS_HOSTS = ["inbound.coupang.com", "inventory.coupang.com", "outbound.coupang.com", "wms-front.coupang.com"];

let mainWindow = null;
let wmsLoginWindow = null;

function getSes() {
  return session.fromPartition(PARTITION);
}

function looksLoggedIn(url) {
  let u;
  try {
    u = new URL(String(url || ""));
  } catch (_e) {
    return false;
  }
  if (u.protocol !== "https:" || WMS_HOSTS.indexOf(u.hostname.toLowerCase()) < 0) return false;
  return !/\/(login|signin|sso|auth|idp)(\/|$)/i.test(u.pathname);
}

function hostAndPath(url) {
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch (_e) {
    return String(url);
  }
}

/**
 * 세션이 끝나도 쿠키는 남으므로 WMS 화면이 실제로 열리는지 요청해 본다.
 * 큰 자료 요청과 마찬가지로 WMS 요청에는 시간 제한을 두지 않는다.
 */
function probeWmsLogin() {
  return new Promise(function (resolve) {
    const req = net.request({ url: WMS_LOGIN_URL, session: getSes(), useSessionCookies: true, redirect: "manual" });
    req.setHeader("Accept", "text/html,application/xhtml+xml,*/*;q=0.8");
    req.setHeader("User-Agent", CHROME_UA);
    req.on("redirect", function (_status, _method, redirectUrl) {
      if (looksLoggedIn(redirectUrl)) {
        req.followRedirect();
        return;
      }
      resolve({ loggedIn: false, detail: hostAndPath(redirectUrl) });
      req.abort();
    });
    req.on("response", function (res) {
      const status = res.statusCode;
      if (status >= 500) resolve({ loggedIn: false, error: "HTTP " + status });
      else resolve({ loggedIn: status === 200, detail: status === 200 ? undefined : "HTTP " + status });
      req.abort();
    });
    req.on("error", function (e) {
      resolve({ loggedIn: false, error: e && e.message ? e.message : String(e) });
    });
    req.end();
  });
}

let sessionCheckSeq = 0;

async function wmsSessionStatus() {
  const seq = ++sessionCheckSeq;
  const payload = await probeWmsLogin();
  // 늦게 끝난 이전 확인이 최신 결과를 덮지 않게 한다
  if (seq === sessionCheckSeq && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("cfs-atsoos-wms-session", payload);
  }
  return payload;
}

function openWmsLoginWindow() {
  if (wmsLoginWindow && !wmsLoginWindow.isDestroyed()) {
    wmsLoginWindow.focus();
    return { ok: true, reused: true };
  }
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    title: APP_TITLE + " — WMS 로그인",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: PARTITION,
    },
  });
  wmsLoginWindow = win;
  win.setMenu(null);
  win.webContents.setUserAgent(CHROME_UA);
  win.loadURL(WMS_LOGIN_URL);

  // 주소만 보면 로그인 전 화면일 수 있어 실제 요청까지 통과해야 자동으로 닫는다
  let closing = false;
  const maybeDone = async function () {
    if (closing || win.isDestroyed()) return;
    if (!looksLoggedIn(win.webContents.getURL())) return;
    const st = await wmsSessionStatus();
    if (!st.loggedIn || closing) return;
    closing = true;
    setTimeout(function () {
      if (!win.isDestroyed()) win.close();
    }, 800);
  };
  win.webContents.on("did-navigate", maybeDone);
  win.webContents.on("did-navigate-in-page", maybeDone);
  win.webContents.on("did-finish-load", maybeDone);
  win.on("closed", function () {
    wmsLoginWindow = null;
    void wmsSessionStatus();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  return { ok: true, reused: false };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    title: APP_TITLE,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      partition: PARTITION,
    },
  });
  mainWindow.setMenu(null);
  // 앱 기능이 붙은 창은 다른 페이지로 넘어가거나 새 창을 열지 못하게 한다
  mainWindow.webContents.on("will-navigate", function (ev) {
    ev.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(function () {
    return { action: "deny" };
  });
  // npm run dev 로 띄운 Vite 서버가 있으면 그 화면을, 아니면 빌드된 dist 를 연다
  if (process.env.CFS_ATSOOS_DEV_URL) mainWindow.loadURL(process.env.CFS_ATSOOS_DEV_URL);
  else mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  // 세션이 끝났을 수 있어 창으로 돌아올 때마다 다시 확인
  mainWindow.on("focus", function () {
    void wmsSessionStatus();
  });
  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

ipcMain.handle("cfs-atsoos-app-info", async function () {
  return { name: APP_TITLE, version: app.getVersion() };
});

ipcMain.handle("cfs-atsoos-wms-status", async function () {
  return wmsSessionStatus();
});

ipcMain.handle("cfs-atsoos-wms-login", async function () {
  return openWmsLoginWindow();
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", function () {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(function () {
    getSes().setUserAgent(CHROME_UA);
    createMainWindow();
  });

  app.on("window-all-closed", function () {
    app.quit();
  });
}
