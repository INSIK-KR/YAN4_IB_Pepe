"use strict";

const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  session,
  nativeTheme,
  shell,
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, execSync } = require("child_process");

const PARTITION = "persist:yan4-shell-desktop";
const STORAGE_FILE = "yan4-shell-storage.json";
/** SharePoint Modern UI가 Electron 기본 UA에서 빈 목록으로 깨지는 경우 대비 */
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SHAREPOINT_SLA_DEFAULT_URL =
  "https://coupangfsnam.sharepoint.com/sites/FreshFinanceR2/_layouts/15/download.aspx?UniqueId=c972c179-6a01-4f19-a943-c8f8cd790968";
const CHROME_DOWNLOAD_WAIT_MS = 90000;
const CHROME_DOWNLOAD_POLL_MS = 500;
const APP_EXPIRES_AT = Date.parse("2026-12-31T23:59:59+09:00");
const APP_EXPIRES_LABEL = "2026-12-31";
const CLOCK_FILE = "yan4-shell-clock.json";
const NET_TIME_URLS = [
  "https://inbound.coupang.com/",
  "https://www.coupang.com/",
];
const NET_TIME_TIMEOUT_MS = 4000;
const EXPIRY_RECHECK_MS = 30 * 60 * 1000;

const LOGIN_TARGETS = {
  coupang: {
    url: "https://inbound.coupang.com/",
    title: "YAN4 — Coupang 로그인",
  },
  sharepoint: {
    // 사이트 홈 → 문서 라이브러리 (Modern이 비면 좌측 Documents로 이동 가능)
    url: "https://coupangfsnam.sharepoint.com/sites/FreshFinanceR2",
    title: "YAN4 — SharePoint 로그인 (SLA)",
  },
  po: {
    url: "https://po-management.coupang.net/",
    title: "YAN4 — PO Management 로그인",
  },
  mos: {
    url: "https://mos.coupang.net/kpi/gross-uph?resource=95",
    title: "YAN4 — MOS 로그인 (Gross HTP / Need help)",
  },
};

(function configureUserData() {
  try {
    const local =
      process.env.LOCALAPPDATA ||
      path.join(os.homedir(), "AppData", "Local");
    const userDataDir = path.join(local, "YAN4ShellDesktop");
    fs.mkdirSync(userDataDir, { recursive: true });
    app.setPath("userData", userDataDir);
  } catch (e) {
    console.warn("[shell-desktop] userData:", e && e.message ? e.message : e);
  }
  try {
    // 캐시도 userData 아래 — TMP에 두면 정리/재시작 때 체감이 불안정해질 수 있음
    const cacheDir = path.join(app.getPath("userData"), "chromium-cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    app.commandLine.appendSwitch("disk-cache-dir", cacheDir);
  } catch (e2) {}
  // Low-spec friendly: limit renderer process count / background waste
  try {
    app.commandLine.appendSwitch("disable-renderer-backgrounding");
  } catch (e3) {}
})();

let mainWindow = null;
/** @type {Record<string, import('electron').BrowserWindow|null>} */
let loginWindows = Object.create(null);
let lastSessionAt = 0;
let lastCookieCount = 0;
let lastSessionDetail = { coupang: 0, sharepoint: 0, po: 0, mos: 0 };
let storageCache = null;

function getSes() {
  return session.fromPartition(PARTITION);
}

function applyChromeUserAgent() {
  try {
    getSes().setUserAgent(CHROME_UA);
  } catch (e) {
    console.warn("[shell-desktop] setUserAgent:", e && e.message ? e.message : e);
  }
}

function storagePath() {
  return path.join(app.getPath("userData"), STORAGE_FILE);
}

function loadStorage() {
  if (storageCache) return storageCache;
  try {
    const raw = fs.readFileSync(storagePath(), "utf8");
    storageCache = JSON.parse(raw) || {};
  } catch (e) {
    storageCache = {};
  }
  return storageCache;
}

function saveStorage() {
  try {
    fs.writeFileSync(
      storagePath(),
      JSON.stringify(storageCache || {}, null, 0),
      "utf8"
    );
  } catch (e) {
    console.warn("[shell-desktop] storage save:", e && e.message ? e.message : e);
  }
}

async function refreshSessionStatus() {
  const ses = getSes();
  let coupangN = 0;
  let sharepointN = 0;
  let poN = 0;
  let mosN = 0;
  try {
    const a = await ses.cookies.get({ url: "https://inbound.coupang.com/" });
    const b = await ses.cookies.get({ url: "https://inventory.coupang.com/" });
    coupangN = (a ? a.length : 0) + (b ? b.length : 0);
  } catch (e) {}
  try {
    const c = await ses.cookies.get({
      url: "https://coupangfsnam.sharepoint.com/",
    });
    sharepointN = c ? c.length : 0;
  } catch (e3) {}
  try {
    const d = await ses.cookies.get({
      url: "https://login.microsoftonline.com/",
    });
    if (d && d.length) sharepointN += d.length;
  } catch (e4) {}
  try {
    const e = await ses.cookies.get({
      url: "https://po-management.coupang.net/",
    });
    poN = e ? e.length : 0;
  } catch (e5) {}
  try {
    const m = await ses.cookies.get({ url: "https://mos.coupang.net/" });
    mosN = m ? m.length : 0;
  } catch (e6) {}

  lastSessionDetail = {
    coupang: coupangN,
    sharepoint: sharepointN,
    po: poN,
    mos: mosN,
  };
  lastCookieCount = coupangN + sharepointN + poN + mosN;
  if (lastCookieCount > 0) lastSessionAt = Date.now();
  const payload = {
    sessionAt: lastSessionAt,
    cookieCount: lastCookieCount,
    detail: lastSessionDetail,
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("yan4-shell-session-updated", payload);
  }
  return payload;
}

function looksLoggedIn(kind, url) {
  const u = String(url || "");
  if (!u || u.indexOf("http") !== 0) return false;
  if (/login\.microsoftonline\.com|login\.live\.com/i.test(u)) return false;
  if (/\/(login|signin|sso|auth|idp)(\/|\?|$)/i.test(u)) return false;

  if (kind === "coupang") {
    return (
      u.indexOf("inventory.coupang.com") >= 0 ||
      u.indexOf("outbound.coupang.com") >= 0 ||
      u.indexOf("inbound.coupang.com") >= 0 ||
      u.indexOf("wms-front.coupang.com") >= 0
    );
  }
  if (kind === "sharepoint") {
    return (
      u.indexOf("sharepoint.com") >= 0 &&
      !/login\.microsoftonline/i.test(u)
    );
  }
  if (kind === "po") {
    return u.indexOf("po-management.coupang.net") >= 0;
  }
  if (kind === "mos") {
    return u.indexOf("mos.coupang.net") >= 0;
  }
  return false;
}

function restoreMainAfterLoginClose() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  } catch (e) {}
}

function openLoginWindow(kind) {
  const key = LOGIN_TARGETS[kind] ? kind : "coupang";
  const target = LOGIN_TARGETS[key];
  const existing = loginWindows[key];
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return { ok: true, reused: true, kind: key };
  }

  /* parent를 붙이면 Windows에서 자식 닫힘/최소화 시 메인까지 같이 접히는 경우가 있음 */
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    title: target.title,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: PARTITION,
      backgroundThrottling: true,
    },
  });
  loginWindows[key] = win;
  try {
    win.webContents.setUserAgent(CHROME_UA);
  } catch (eUa) {}
  win.loadURL(target.url);

  let closedOnce = false;
  const maybeDone = async function () {
    try {
      const url = win.webContents.getURL();
      if (!looksLoggedIn(key, url)) return;
      await refreshSessionStatus();
      // Coupang·PO·MOS: 로그인 완료 후 자동 닫기 (SharePoint는 MFA 등으로 수동)
      if ((key === "coupang" || key === "po" || key === "mos") && !closedOnce) {
        // PO·MOS는 로그인 페이지도 같은 도메인일 수 있어 쿠키 확인 후 닫기
        if (key === "po" && !(lastSessionDetail && lastSessionDetail.po > 0)) {
          return;
        }
        if (key === "mos" && !(lastSessionDetail && lastSessionDetail.mos > 0)) {
          return;
        }
        closedOnce = true;
        setTimeout(function () {
          if (win && !win.isDestroyed()) win.close();
        }, key === "po" || key === "mos" ? 800 : 500);
      }
    } catch (e) {}
  };

  win.webContents.on("did-navigate", maybeDone);
  win.webContents.on("did-navigate-in-page", maybeDone);
  win.webContents.on("did-finish-load", maybeDone);
  win.on("closed", function () {
    loginWindows[key] = null;
    void refreshSessionStatus();
    setTimeout(restoreMainAfterLoginClose, 0);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("yan4-shell-login-closed", { kind: key });
    }
  });
  return { ok: true, reused: false, kind: key };
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
    u.indexOf("https://coupangfsnam.sharepoint.com/") === 0 ||
    /^https:\/\/[^/]*\.coupang\.com\//.test(u) ||
    /^https:\/\/[^/]*\.sharepoint\.com\//.test(u)
  );
}

async function sessionFetch(message) {
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
    if (message.contentType) {
      headers["Content-Type"] = String(message.contentType);
    } else if (!headers["Content-Type"]) {
      headers["Content-Type"] =
        "application/x-www-form-urlencoded;charset=UTF-8";
    }
    opts.body = String(message.body);
  }
  try {
    const ses = getSes();
    const res = await ses.fetch(url, opts);
    const status = res.status;
    if (
      message &&
      (message.responseType === "arraybuffer" ||
        message.binary === true ||
        message.asBinary === true)
    ) {
      const ab = await res.arrayBuffer();
      return {
        ok: status >= 200 && status < 400,
        status: status,
        base64: Buffer.from(ab).toString("base64"),
        byteLength: ab.byteLength,
        error:
          status >= 200 && status < 400
            ? undefined
            : "HTTP " + status,
      };
    }
    const text = await res.text();
    return { ok: true, status: status, body: text };
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
    };
  }
}

/** SharePoint SLA — EXE 직접 fetch 대신 Chrome으로 받고 Downloads에서 자동 수집 (안전) */
function findChromeExe() {
  const candidates = [
    path.join(
      process.env.LOCALAPPDATA || "",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe"
    ),
    path.join(
      process.env.PROGRAMFILES || "C:\\Program Files",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe"
    ),
    path.join(
      process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe"
    ),
  ];
  for (let i = 0; i < candidates.length; i++) {
    try {
      if (candidates[i] && fs.existsSync(candidates[i])) return candidates[i];
    } catch (e) {}
  }
  return null;
}

function isChromeRunning() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /NH', {
      encoding: "utf8",
      windowsHide: true,
      timeout: 4000,
    });
    return /chrome\.exe/i.test(String(out || ""));
  } catch (e) {
    return false;
  }
}

function openUrlInChrome(url) {
  const chrome = findChromeExe();
  if (chrome) {
    const running = isChromeRunning();
    const args = running
      ? ["--new-tab", url]
      : ["--start-minimized", "--new-tab", url];
    spawn(chrome, args, { detached: true, stdio: "ignore" }).unref();
    return { ok: true, via: "chrome", running: running };
  }
  shell.openExternal(url);
  return { ok: true, via: "default-browser" };
}

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

function getDownloadsDirOrEmpty() {
  let downloadsDir = "";
  try {
    downloadsDir = app.getPath("downloads");
  } catch (e) {
    downloadsDir = path.join(os.homedir(), "Downloads");
  }
  if (!downloadsDir || !fs.existsSync(downloadsDir)) return "";
  return downloadsDir;
}

function sanitizeDownloadFilename(name, fallback) {
  let base = path.basename(
    String(name || fallback || "download").replace(/\\/g, "/")
  );
  base = base.replace(/[<>:"|?*\x00-\x1f]/g, "_").replace(/^\.+/, "_");
  if (!base || base === "_" || base === ".") {
    base = fallback || "download";
  }
  return base;
}

function uniqueDownloadPath(dir, filename) {
  const base = sanitizeDownloadFilename(filename, "download");
  let dest = path.join(dir, base);
  if (!fs.existsSync(dest)) return dest;
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  let n = 1;
  while (fs.existsSync(dest) && n < 10000) {
    dest = path.join(dir, stem + " (" + n + ")" + ext);
    n += 1;
  }
  return dest;
}

function saveToDownloadsFolder(opts) {
  opts = opts || {};
  const dir = getDownloadsDirOrEmpty();
  if (!dir) {
    return { ok: false, error: "Downloads 폴더를 찾을 수 없습니다" };
  }
  const dest = uniqueDownloadPath(dir, opts.filename || "download");
  try {
    if (opts.buffer) {
      fs.writeFileSync(dest, opts.buffer);
    } else if (opts.base64 != null && String(opts.base64).length) {
      fs.writeFileSync(dest, Buffer.from(String(opts.base64), "base64"));
    } else {
      fs.writeFileSync(dest, String(opts.text || ""), "utf8");
    }
    return { ok: true, filename: path.basename(dest), fullPath: dest };
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
    };
  }
}

function isPdfDownloadItem(item) {
  try {
    const name = String(item.getFilename() || "");
    const mime = String(
      typeof item.getMimeType === "function" ? item.getMimeType() : ""
    ).toLowerCase();
    if (/\.pdf$/i.test(name)) return true;
    if (mime.indexOf("pdf") >= 0) return true;
  } catch (ePdf) {}
  return false;
}

async function withPrintMediaEmulation(wc, fn) {
  let didAttach = false;
  try {
    if (!wc.debugger.isAttached()) {
      wc.debugger.attach("1.3");
      didAttach = true;
    }
    await wc.debugger.sendCommand("Emulation.setEmulatedMedia", {
      media: "print",
    });
    return await fn();
  } finally {
    try {
      await wc.debugger.sendCommand("Emulation.setEmulatedMedia", {
        media: "",
      });
    } catch (eMedia) {}
    if (didAttach) {
      try {
        wc.debugger.detach();
      } catch (eDet) {}
    }
  }
}

async function printPageToPdfFile(opts) {
  opts = opts || {};
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: "창이 없습니다" };
  }
  const dir = getDownloadsDirOrEmpty();
  if (!dir) {
    return { ok: false, error: "Downloads 폴더를 찾을 수 없습니다" };
  }
  let filename = sanitizeDownloadFilename(opts.filename || "YAN4.pdf", "YAN4.pdf");
  if (!/\.pdf$/i.test(filename)) filename += ".pdf";
  const dest = uniqueDownloadPath(dir, filename);
  const wc = mainWindow.webContents;
  try {
    const buffer = await withPrintMediaEmulation(wc, function () {
      return wc.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { marginType: "none" },
      });
    });
    if (!buffer || !buffer.length) {
      return { ok: false, error: "PDF가 비어 있습니다" };
    }
    fs.writeFileSync(dest, buffer);
    notifyDownloadProgress("PDF 저장됨: " + path.basename(dest));
    if (opts.open !== false) {
      await sleep(400);
      try {
        await shell.openPath(dest);
      } catch (eOpen) {}
    }
    return { ok: true, filename: path.basename(dest), fullPath: dest };
  } catch (ePdf) {
    return {
      ok: false,
      error: ePdf && ePdf.message ? ePdf.message : String(ePdf),
    };
  }
}

function attachSilentDownloads() {
  try {
    getSes().on("will-download", function (_event, item) {
      try {
        // Print-to-PDF: 경로를 가로채면 파일이 덜 쓰인 채로 뷰어가 열려
        // "PDF 문서를 로드하지 못했습니다" → 새로고침하면 정상.
        if (isPdfDownloadItem(item)) return;
        const existing =
          typeof item.getSavePath === "function" ? item.getSavePath() : "";
        if (existing) return;
        const dir = getDownloadsDirOrEmpty();
        if (!dir) return;
        const dest = uniqueDownloadPath(dir, item.getFilename() || "download");
        item.setSavePath(dest);
      } catch (eWill) {}
    });
  } catch (eAttach) {
    console.warn(
      "[shell-desktop] silent downloads:",
      eAttach && eAttach.message ? eAttach.message : eAttach
    );
  }
}

function notifyDownloadProgress(text) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("yan4-shell-download-progress", {
      text: String(text || ""),
    });
  }
}

function isTempDownloadName(name) {
  return (
    /\.(crdownload|tmp|partial)$/i.test(name) ||
    /\.crdownload$/i.test(name) ||
    String(name).indexOf(".com.google.Chrome") >= 0
  );
}

function listCandidateDownloads(dir, startedAt, nameIncludes) {
  const needle = String(nameIncludes || "").normalize("NFC").toLowerCase();
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return [];
  }
  const out = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (isTempDownloadName(name)) continue;
    if (!/\.(xlsx|xls|xlsm)$/i.test(name)) continue;
    if (
      needle &&
      String(name).normalize("NFC").toLowerCase().indexOf(needle) < 0
    ) {
      continue;
    }
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (!st.isFile() || st.size < 400) continue;
      // 감시 시작 직전~이후 생성된/수정된 파일
      if (st.mtimeMs + 500 < startedAt) continue;
      out.push({ full: full, name: name, mtimeMs: st.mtimeMs, size: st.size });
    } catch (e2) {}
  }
  out.sort(function (a, b) {
    return b.mtimeMs - a.mtimeMs;
  });
  return out;
}

async function waitFileStable(filePath) {
  let last = -1;
  let stableHits = 0;
  for (let i = 0; i < 30; i++) {
    try {
      const sz = fs.statSync(filePath).size;
      if (sz > 400 && sz === last) {
        stableHits++;
        if (stableHits >= 2) return true;
      } else {
        stableHits = 0;
        last = sz;
      }
    } catch (e) {
      return false;
    }
    await sleep(250);
  }
  return last > 400;
}

async function fetchSharePointSlaViaChromeDownload(message) {
  const url = String(
    (message && message.url) || SHAREPOINT_SLA_DEFAULT_URL
  );
  if (url.indexOf("https://coupangfsnam.sharepoint.com/") !== 0) {
    return { ok: false, error: "SharePoint URL만 허용" };
  }

  const downloadsDir = getDownloadsDirOrEmpty();
  if (!downloadsDir) {
    return {
      ok: false,
      error: "Downloads 폴더를 찾을 수 없습니다",
    };
  }

  const label = String((message && message.label) || "SLA");
  const nameIncludes = String((message && message.nameIncludes) || "");
  const deleteAfterRead = !!(message && message.deleteAfterRead);

  const startedAt = Date.now();
  notifyDownloadProgress(
    "Chrome으로 " +
      label +
      " 다운로드 중… (Chrome에서 SharePoint 로그인 상태여야 함)"
  );
  openUrlInChrome(url);

  const deadline = startedAt + CHROME_DOWNLOAD_WAIT_MS;
  let lastHintAt = 0;
  while (Date.now() < deadline) {
    const now = Date.now();
    if (now - lastHintAt > 3000) {
      lastHintAt = now;
      const left = Math.max(0, Math.ceil((deadline - now) / 1000));
      notifyDownloadProgress(
        "Downloads에서 엑셀 대기 중… " + left + "s (Chrome 로그인·다운로드 확인)"
      );
    }
    const cands = listCandidateDownloads(downloadsDir, startedAt, nameIncludes);
    if (cands.length) {
      const hit = cands[0];
      const okStable = await waitFileStable(hit.full);
      if (!okStable) {
        await sleep(CHROME_DOWNLOAD_POLL_MS);
        continue;
      }
      try {
        const buf = fs.readFileSync(hit.full);
        if (!buf || buf.length < 400) {
          await sleep(CHROME_DOWNLOAD_POLL_MS);
          continue;
        }
        const peek = buf.subarray(0, Math.min(500, buf.length)).toString("utf8");
        const isHtml = /^[\s\S]{0,500}<\s*html/i.test(peek);
        let deleted = false;
        if (deleteAfterRead) {
          try {
            fs.unlinkSync(hit.full);
            deleted = true;
          } catch (eDel) {}
        }
        if (isHtml) {
          return {
            ok: false,
            error:
              "다운로드된 파일이 HTML입니다. Chrome에서 SharePoint 로그인 후 " +
              label +
              " 조회를 다시 실행하세요.",
          };
        }
        notifyDownloadProgress(
          label +
            " 파일 수집됨: " +
            hit.name +
            " (" +
            buf.length +
            " bytes)" +
            (deleted ? " · 원본 삭제" : "")
        );
        return {
          ok: true,
          base64: buf.toString("base64"),
          byteLength: buf.length,
          source: "chrome-download",
          filename: hit.name,
          deleted: deleted,
        };
      } catch (eRead) {
        await sleep(CHROME_DOWNLOAD_POLL_MS);
        continue;
      }
    }
    await sleep(CHROME_DOWNLOAD_POLL_MS);
  }

  notifyDownloadProgress("다운로드 대기 시간 초과");
  return {
    ok: false,
    error:
      "Chrome Downloads에서 " +
      label +
      " 엑셀을 찾지 못했습니다. Chrome에서 SharePoint 로그인·다운로드 허용 후 다시 시도하세요.",
  };
}

async function handleRuntimeMessage(message) {
  if (!message || !message.type) {
    return { ok: false, error: "message.type 없음" };
  }
  const t = message.type;

  if (t === "yan4Sleep") {
    const ms = Math.min(Math.max(Number(message.ms) || 0, 0), 120000);
    await new Promise(function (r) {
      setTimeout(r, ms);
    });
    return { ok: true };
  }

  if (t === "yan4SlaFetch") {
    // 안전 경로: Chrome 세션으로 다운로드 → Downloads 자동 수집
    return fetchSharePointSlaViaChromeDownload(message);
  }

  if (t === "yan4SharePointFileFetch") {
    if (!message.url) return { ok: false, error: "url 없음" };
    return fetchSharePointSlaViaChromeDownload({
      url: message.url,
      label: message.label || "SharePoint",
      nameIncludes: message.nameIncludes || "",
      deleteAfterRead: message.deleteAfterRead !== false,
    });
  }

  if (
    t === "yan4InventoryFetch" ||
    t === "yan4MosFetch" ||
    t === "yan4WmsFrontFetch" ||
    t === "yan4InboundFetch" ||
    t === "yan4PoManagementFetch"
  ) {
    return sessionFetch(message);
  }

  if (t === "yan4ExtensionResourceFetch") {
    const rel = String(message.path || message.resource || "").replace(
      /^\/+/,
      ""
    );
    const candidates = [
      path.join(__dirname, "renderer", "vendor", path.basename(rel)),
      path.join(__dirname, "renderer", rel),
    ];
    for (let i = 0; i < candidates.length; i++) {
      try {
        if (fs.existsSync(candidates[i])) {
          const body = fs.readFileSync(candidates[i], "utf8");
          return { ok: true, status: 200, body: body };
        }
      } catch (e) {}
    }
    return { ok: false, error: "resource not found: " + rel };
  }

  if (t === "yan4SaveToDownloads") {
    if (message.base64) {
      return saveToDownloadsFolder({
        filename: message.filename || "download",
        base64: message.base64,
      });
    }
    return saveToDownloadsFolder({
      filename: message.filename || "download",
      text: String(message.body || message.text || ""),
    });
  }

  if (t === "yan4SlaDownload") {
    const url = String(message.url || "");
    const wantName = sanitizeDownloadFilename(
      message.filename || "SLA.xlsx",
      "SLA.xlsx"
    );
    if (url.indexOf("https://coupangfsnam.sharepoint.com/") === 0) {
      const fetched = await fetchSharePointSlaViaChromeDownload(message);
      if (!fetched || !fetched.ok) return fetched;
      try {
        const dir = getDownloadsDirOrEmpty();
        const srcName = String(fetched.filename || "");
        const src = dir && srcName ? path.join(dir, srcName) : "";
        if (src && fs.existsSync(src) && srcName !== wantName) {
          const dest = uniqueDownloadPath(dir, wantName);
          try {
            fs.renameSync(src, dest);
          } catch (eRen) {
            fs.copyFileSync(src, dest);
          }
          return {
            ok: true,
            filename: path.basename(dest),
            source: "chrome-download",
          };
        }
        return {
          ok: true,
          filename: srcName || wantName,
          source: "chrome-download",
        };
      } catch (eSave) {
        return {
          ok: true,
          filename: fetched.filename || wantName,
          source: "chrome-download",
        };
      }
    }
    if (message.base64) {
      return saveToDownloadsFolder({
        filename: wantName,
        base64: message.base64,
      });
    }
    return saveToDownloadsFolder({
      filename: wantName,
      text: String(message.body || message.text || ""),
    });
  }

  if (t === "yan4SlaDownloadJson") {
    const jsonText =
      message.json != null
        ? typeof message.json === "string"
          ? message.json
          : JSON.stringify(message.json, null, 2)
        : String(message.body || message.text || "");
    return saveToDownloadsFolder({
      filename: message.filename || "yan4-sla.json",
      text: jsonText,
    });
  }

  if (t === "yan4SlaDownloadPng") {
    let b64 = String(message.dataUrl || message.png || "");
    const idx = b64.indexOf("base64,");
    if (idx >= 0) b64 = b64.slice(idx + 7);
    return saveToDownloadsFolder({
      filename: message.filename || "yan4-sla.png",
      base64: b64,
    });
  }

  if (t === "yan4SlaAutoNextRun" || t === "yan4SlaAutoScheduleUpdate") {
    // Desktop 1단계: 알람 자동실행은 미구현(수동 실행만)
    return { ok: true, scheduledTime: 0, periodInMinutes: 0 };
  }

  return { ok: false, error: "unsupported message: " + t };
}

function clockFilePath() {
  return path.join(app.getPath("userData"), CLOCK_FILE);
}

function readLastSeenAt() {
  try {
    const j = JSON.parse(fs.readFileSync(clockFilePath(), "utf8")) || {};
    const n = Number(j.lastSeenAt);
    return isFinite(n) && n > 0 ? n : 0;
  } catch (e) {
    return 0;
  }
}

function writeLastSeenAt(ms) {
  try {
    if (ms <= readLastSeenAt()) return;
    fs.writeFileSync(clockFilePath(), JSON.stringify({ lastSeenAt: ms }), "utf8");
  } catch (e) {}
}

async function fetchNetworkTime() {
  for (let i = 0; i < NET_TIME_URLS.length; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () {
      ctrl.abort();
    }, NET_TIME_TIMEOUT_MS);
    try {
      const res = await getSes().fetch(NET_TIME_URLS[i], {
        method: "HEAD",
        signal: ctrl.signal,
        cache: "no-store",
      });
      const t = Date.parse(res.headers.get("date") || "");
      if (isFinite(t) && t > 0) return t;
    } catch (e) {
    } finally {
      clearTimeout(timer);
    }
  }
  return 0;
}

async function resolveTrustedNow() {
  const netNow = await fetchNetworkTime();
  const now = Math.max(netNow || Date.now(), readLastSeenAt());
  writeLastSeenAt(now);
  return now;
}

async function isAppExpired() {
  return (await resolveTrustedNow()) > APP_EXPIRES_AT;
}

async function showExpiredAndQuit() {
  try {
    await dialog.showMessageBox({
      type: "warning",
      title: "YAN4 IB LIVE_by Pepe",
      message: "사용 기간이 만료되었습니다.",
      detail:
        "이 프로그램은 " +
        APP_EXPIRES_LABEL +
        "까지 사용할 수 있습니다.\n최신 버전을 받아 주세요.",
      buttons: ["확인"],
      noLink: true,
    });
  } catch (e) {}
  app.exit(0);
}

function startExpiryWatch() {
  setInterval(function () {
    isAppExpired().then(function (expired) {
      if (expired) void showExpiredAndQuit();
    });
  }, EXPIRY_RECHECK_MS);
}

function createWindow() {
  nativeTheme.themeSource = "light";
  const iconPath = path.join(__dirname, "build", "icon.ico");
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "YAN4 IB LIVE_by Pepe",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: "#f1f5f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: PARTITION,
      backgroundThrottling: true,
      spellcheck: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

ipcMain.handle("yan4-shell-session-status", async function () {
  return refreshSessionStatus();
});

ipcMain.handle("yan4-shell-open-login", async function (_e, kind) {
  return openLoginWindow(kind || "coupang");
});

ipcMain.handle("yan4-shell-open-url", async function (_e, url) {
  const u = String(url || "").trim();
  if (!/^https:\/\/inbound\.coupang\.com\//i.test(u)) {
    return { ok: false, error: "inbound.coupang.com URL만 허용" };
  }
  try {
    return openUrlInChrome(u);
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
    };
  }
});

ipcMain.handle("yan4-shell-fetch", async function (_e, message) {
  return sessionFetch(message);
});

ipcMain.handle("yan4-shell-runtime-message", async function (_e, message) {
  try {
    return await handleRuntimeMessage(message);
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
    };
  }
});

ipcMain.handle("yan4-shell-storage-get", async function (_e, keys) {
  const store = loadStorage();
  const out = {};
  const list = Array.isArray(keys) ? keys : keys != null ? [keys] : [];
  if (!list.length) return Object.assign({}, store);
  list.forEach(function (k) {
    const key = String(k);
    if (Object.prototype.hasOwnProperty.call(store, key)) out[key] = store[key];
  });
  return out;
});

ipcMain.handle("yan4-shell-storage-set", async function (_e, items) {
  const store = loadStorage();
  if (items && typeof items === "object") {
    Object.keys(items).forEach(function (k) {
      store[k] = items[k];
    });
  }
  storageCache = store;
  saveStorage();
  return { ok: true };
});

ipcMain.handle("yan4-shell-print-to-pdf", async function (_e, opts) {
  try {
    return await printPageToPdfFile(opts || {});
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
    };
  }
});

ipcMain.handle("yan4-shell-storage-remove", async function (_e, keys) {
  const store = loadStorage();
  const list = Array.isArray(keys) ? keys : [keys];
  list.forEach(function (k) {
    delete store[String(k)];
  });
  storageCache = store;
  saveStorage();
  return { ok: true };
});

app.whenReady().then(async function () {
  Menu.setApplicationMenu(null);
  applyChromeUserAgent();
  if (await isAppExpired()) {
    await showExpiredAndQuit();
    return;
  }
  attachSilentDownloads();
  createWindow();
  startExpiryWatch();
  void refreshSessionStatus();
});

app.on("before-quit", function () {
  try {
    const ses = getSes();
    if (ses && ses.cookies && typeof ses.cookies.flushStore === "function") {
      ses.cookies.flushStore(function () {});
    }
  } catch (e) {}
  try {
    saveStorage();
  } catch (e2) {}
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
