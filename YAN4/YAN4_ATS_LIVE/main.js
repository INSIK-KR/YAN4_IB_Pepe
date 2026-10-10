"use strict";

const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  nativeTheme,
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

const PARTITION = "persist:yan4-ats-live";
const LOGIN_URL = "https://inventory.coupang.com/";

(function configureUserData() {
  try {
    const local =
      process.env.LOCALAPPDATA ||
      path.join(os.homedir(), "AppData", "Local");
    const userDataDir = path.join(local, "YAN4AtsLiveDesktop");
    fs.mkdirSync(userDataDir, { recursive: true });
    app.setPath("userData", userDataDir);
  } catch (e) {
    console.warn("[ats-live] userData:", e && e.message ? e.message : e);
  }
  try {
    const cacheDir = path.join(os.tmpdir(), "yan4-ats-live-chromium-cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    app.commandLine.appendSwitch("disk-cache-dir", cacheDir);
  } catch (e2) {}
})();

let mainWindow = null;
let loginWindow = null;
let lastSessionAt = 0;
let lastCookieCount = 0;

function getSes() {
  return session.fromPartition(PARTITION);
}

async function refreshSessionStatus() {
  const ses = getSes();
  let all = [];
  try {
    const a = await ses.cookies.get({ domain: "coupang.com" });
    if (a && a.length) all = all.concat(a);
  } catch (e) {}
  try {
    const b = await ses.cookies.get({ domain: "coupang.net" });
    if (b && b.length) all = all.concat(b);
  } catch (e2) {}
  lastCookieCount = all.length;
  if (lastCookieCount > 0) lastSessionAt = Date.now();
  const payload = {
    sessionAt: lastSessionAt,
    cookieCount: lastCookieCount,
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("yan4-ats-session-updated", payload);
  }
  return payload;
}

function looksLoggedIn(url) {
  const u = String(url || "");
  if (!u || u.indexOf("http") !== 0) return false;
  if (/login|sso|auth|signin|idp/i.test(u)) return false;
  return (
    u.indexOf("inventory.coupang.com") >= 0 ||
    u.indexOf("outbound.coupang.com") >= 0 ||
    u.indexOf("inbound.coupang.com") >= 0 ||
    u.indexOf("wms-front.coupang.com") >= 0
  );
}

function openLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return { ok: true, reused: true };
  }
  loginWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    title: "YAN4 ATS Live — Coupang 로그인",
    parent: mainWindow || undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: PARTITION,
    },
  });
  loginWindow.loadURL(LOGIN_URL);

  const onNav = async function () {
    try {
      const url = loginWindow.webContents.getURL();
      if (!looksLoggedIn(url)) return;
      const st = await refreshSessionStatus();
      if (st.cookieCount > 0 && loginWindow && !loginWindow.isDestroyed()) {
        setTimeout(function () {
          if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
        }, 400);
      }
    } catch (e) {}
  };

  loginWindow.webContents.on("did-navigate", onNav);
  loginWindow.webContents.on("did-navigate-in-page", onNav);
  loginWindow.webContents.on("did-finish-load", onNav);
  loginWindow.on("closed", function () {
    loginWindow = null;
    void refreshSessionStatus();
  });
  return { ok: true, reused: false };
}

function allowedFetchUrl(url) {
  const u = String(url || "");
  return (
    u.indexOf("https://inventory.coupang.com/") === 0 ||
    u.indexOf("https://outbound.coupang.com/") === 0 ||
    u.indexOf("https://inbound.coupang.com/") === 0 ||
    u.indexOf("https://wms-front.coupang.com/") === 0 ||
    u.indexOf("https://mos.coupang.net/") === 0 ||
    u.indexOf("https://po-management.coupang.net/") === 0 ||
    /^https:\/\/[^/]*\.coupang\.com\//.test(u)
  );
}

function createWindow() {
  nativeTheme.themeSource = "light";
  const iconPath = path.join(__dirname, "build", "icon.ico");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "YAN4 ATS Live",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: PARTITION,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

ipcMain.handle("yan4-ats-session-status", async function () {
  return refreshSessionStatus();
});

ipcMain.handle("yan4-ats-open-login", async function () {
  return openLoginWindow();
});

ipcMain.handle("yan4-ats-fetch", async function (_evt, message) {
  const url = String((message && message.url) || "");
  if (!allowedFetchUrl(url)) {
    return { ok: false, error: "허용되지 않은 URL" };
  }
  const method = String((message && message.method) || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") {
    return { ok: false, error: "GET/POST만 허용" };
  }
  const headers = {
    Accept:
      (message && message.accept) ||
      "application/json, text/html, */*; q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "X-Requested-With": "XMLHttpRequest",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
  if (message && message.referer) headers.Referer = String(message.referer);
  if (message && message.origin) headers.Origin = String(message.origin);
  if (message && message.headers && typeof message.headers === "object") {
    Object.keys(message.headers).forEach(function (k) {
      headers[k] = String(message.headers[k]);
    });
  }
  const opts = { method: method, headers: headers };
  if (method === "POST" && message && message.body != null) {
    headers["Content-Type"] =
      (message && message.contentType) ||
      "application/x-www-form-urlencoded;charset=UTF-8";
    opts.body = String(message.body);
  }
  try {
    const ses = getSes();
    const res = await ses.fetch(url, opts);
    const text = await res.text();
    return { ok: true, status: res.status, body: text };
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
    };
  }
});

app.whenReady().then(function () {
  createWindow();
  void refreshSessionStatus();
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
