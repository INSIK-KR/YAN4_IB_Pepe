"use strict";

const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain, session } = require("electron");

const APP_TITLE = "CFS HTP";
// MOS 로그인 쿠키 등을 앱 재시작 후에도 유지하기 위한 영구 세션
const PARTITION = "persist:cfs-htp";
/** MOS가 Electron 기본 UA를 막는 경우 대비 (CFS IB LIVE와 같은 값) */
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MOS_ORIGIN = "https://mos.coupang.net/";
const MOS_LOGIN_URL = "https://mos.coupang.net/kpi/gross-uph?resource=95";

let mainWindow = null;
let mosLoginWindow = null;

function getSes() {
  return session.fromPartition(PARTITION);
}

/** MOS 쿠키 개수로 로그인 여부를 본다 (CFS IB LIVE refreshSessionStatus 와 같은 기준) */
async function mosSessionStatus() {
  let count = 0;
  try {
    const cookies = await getSes().cookies.get({ url: MOS_ORIGIN });
    count = cookies ? cookies.length : 0;
  } catch (_e) {}
  const payload = { loggedIn: count > 0, cookieCount: count };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("cfs-htp-mos-session", payload);
  }
  return payload;
}

function looksLoggedIn(url) {
  const u = String(url || "");
  if (u.indexOf("https://mos.coupang.net") !== 0) return false;
  return !/\/(login|signin|sso|auth|idp)(\/|\?|$)/i.test(u);
}

function openMosLoginWindow() {
  if (mosLoginWindow && !mosLoginWindow.isDestroyed()) {
    mosLoginWindow.focus();
    return { ok: true, reused: true };
  }
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    title: "CFS HTP — MOS 로그인",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: PARTITION,
    },
  });
  mosLoginWindow = win;
  win.setMenu(null);
  win.webContents.setUserAgent(CHROME_UA);
  win.loadURL(MOS_LOGIN_URL);

  // 로그인 페이지도 같은 도메인일 수 있어 쿠키까지 확인한 뒤 자동으로 닫는다
  let closing = false;
  const maybeDone = async function () {
    if (closing || win.isDestroyed()) return;
    if (!looksLoggedIn(win.webContents.getURL())) return;
    const st = await mosSessionStatus();
    if (!st.loggedIn) return;
    closing = true;
    setTimeout(function () {
      if (!win.isDestroyed()) win.close();
    }, 800);
  };
  win.webContents.on("did-navigate", maybeDone);
  win.webContents.on("did-navigate-in-page", maybeDone);
  win.webContents.on("did-finish-load", maybeDone);
  win.on("closed", function () {
    mosLoginWindow = null;
    void mosSessionStatus();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  return { ok: true, reused: false };
}

function allowedMosUrl(url) {
  // 문자열 앞부분이 아니라 실제 호스트로 검사
  let u;
  try {
    u = new URL(String(url || ""));
  } catch (_e) {
    return false;
  }
  return u.protocol === "https:" && !u.username && !u.password && u.hostname.toLowerCase() === "mos.coupang.net";
}

/**
 * 로그인된 세션으로 MOS 요청. 큰 자료도 받을 수 있게 시간 제한을 두지 않는다.
 * message: { url, method, headers, body, contentType, referer, binary }
 */
async function mosFetch(message) {
  const url = String((message && message.url) || "");
  if (!allowedMosUrl(url)) return { ok: false, error: "허용되지 않은 URL" };
  const method = String((message && message.method) || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") return { ok: false, error: "GET/POST만 허용" };
  const headers = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent": CHROME_UA,
  };
  if (message.referer) headers.Referer = String(message.referer);
  if (message.headers && typeof message.headers === "object") {
    Object.keys(message.headers).forEach(function (k) {
      headers[k] = String(message.headers[k]);
    });
  }
  const opts = { method: method, headers: headers };
  if (method === "POST" && message.body != null) {
    if (message.contentType) headers["Content-Type"] = String(message.contentType);
    opts.body = typeof message.body === "string" ? message.body : JSON.stringify(message.body);
  }
  try {
    const res = await getSes().fetch(url, opts);
    const ok = res.status >= 200 && res.status < 400;
    if (message.binary) {
      const ab = await res.arrayBuffer();
      return { ok: ok, status: res.status, base64: Buffer.from(ab).toString("base64"), error: ok ? undefined : "HTTP " + res.status };
    }
    return { ok: ok, status: res.status, body: await res.text(), error: ok ? undefined : "HTTP " + res.status };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
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
  // npm run dev 로 띄운 Vite 서버가 있으면 그 화면을, 아니면 빌드된 dist 를 연다
  if (process.env.CFS_HTP_DEV_URL) mainWindow.loadURL(process.env.CFS_HTP_DEV_URL);
  else mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

ipcMain.handle("cfs-htp-app-info", async function () {
  return { name: APP_TITLE, version: app.getVersion() };
});

ipcMain.handle("cfs-htp-mos-status", async function () {
  return mosSessionStatus();
});

ipcMain.handle("cfs-htp-mos-login", async function () {
  return openMosLoginWindow();
});

ipcMain.handle("cfs-htp-mos-fetch", async function (_e, message) {
  return mosFetch(message || {});
});

// 입력값(Target, S&OP, H/C, 이관 차량)은 portable exe 옆이 아니라 사용자 데이터 폴더에 저장
function inputsPath() {
  return path.join(app.getPath("userData"), "inputs.json");
}

ipcMain.handle("cfs-htp-inputs-load", async function () {
  try {
    return JSON.parse(fs.readFileSync(inputsPath(), "utf8"));
  } catch (_e) {
    return null;
  }
});

ipcMain.handle("cfs-htp-inputs-save", async function (_e, inputs) {
  fs.mkdirSync(path.dirname(inputsPath()), { recursive: true });
  fs.writeFileSync(inputsPath(), JSON.stringify(inputs, null, 2), "utf8");
  return true;
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
