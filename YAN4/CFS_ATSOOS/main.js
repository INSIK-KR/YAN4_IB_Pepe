"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { app, BrowserWindow, ipcMain, net, session, shell } = require("electron");
const { buildAtsOosBody } = require("./powerbi-export");
const { parseCutlines, buildOrderSearchBody, parseOrderIds, addDays } = require("./wms-order");
const { PAGING_BASES, PAGE_CAP, buildTransferUrl, parseTransferRows, pickTransferRow, hasNextPage } = require("./wms-transfer");

const APP_TITLE = "CFS ATSOOS";
// WMS 로그인 쿠키를 앱 재시작 후에도 유지하는 영구 세션 (다른 CFS 앱과 공유하지 않음)
const PARTITION = "persist:cfs-atsoos";
/** WMS가 Electron 기본 UA를 막는 경우 대비 (CFS IB LIVE와 같은 값) */
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const WMS_LOGIN_URL = "https://inbound.coupang.com/";
const WMS_CHANGE_CENTER_URL = "https://inbound.coupang.com/auth/changeCenter/";
const WMS_ORDER_DETAIL_URL = "https://outbound.coupang.com/order/detail/";
const WMS_ORDER_LIST_URL = "https://outbound.coupang.com/v2/orderPool/outbound/list";
const WMS_TRANSFER_REFERER = "https://inbound.coupang.com/transfer/admin/operation/list";
// 한 오더의 검색과 상세 요청 사이 간격 (WMS 서버 부담 완화)
const WMS_ORDER_STEP_GAP_MS = 100;
const WMS_HOSTS = ["inbound.coupang.com", "inventory.coupang.com", "outbound.coupang.com", "wms-front.coupang.com"];

const PBI_REPORT_URL =
  "https://app.powerbi.com/groups/me/reports/0e482212-d1b5-494d-b280-4e9f297f368d/9d7e55f9be66aa2608e5?ctid=9d9f74be-786b-48f6-8e18-83cf7a2eef7c&experience=power-bi";
const PBI_EXPORT_URL = "https://wabi-south-east-asia-d-primary-redirect.analysis.windows.net/export/xlsx";
const PBI_TOKEN_AUD = "https://analysis.windows.net/powerbi/api";
// 저장된 로그인으로 토큰을 조용히 받는 창이 기다리는 시간 (데이터 요청에는 시간 제한 없음)
const PBI_SILENT_WAIT_MS = 45000;
const PBI_TOKEN_MARGIN_MS = 5 * 60 * 1000;

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
      if (status !== 200) {
        if (status >= 500) resolve({ loggedIn: false, error: "HTTP " + status });
        else resolve({ loggedIn: false, detail: "HTTP " + status });
        req.abort();
        return;
      }
      // 로그인된 첫 화면에 현재 센터 ID가 들어 있다
      const chunks = [];
      res.on("data", function (chunk) {
        chunks.push(chunk);
      });
      res.on("end", function () {
        const m = Buffer.concat(chunks).toString("utf8").match(/centerId(?:=|&#x3D;|&#61;)(\d{2,6})/i);
        resolve({ loggedIn: true, centerId: m ? m[1] : undefined });
      });
      res.on("error", function () {
        resolve({ loggedIn: true });
      });
    });
    req.on("error", function (e) {
      resolve({ loggedIn: false, error: e && e.message ? e.message : String(e) });
    });
    req.end();
  });
}

/**
 * 출고 화면 요청. 페이지에 고객 정보가 있을 수 있어 HTML은 메인 프로세스에서만 다룬다.
 * SSO를 거쳐 돌아올 수 있어 이동은 따라가고, 마지막 주소로 로그인 여부를 판단한다. 시간 제한 없음
 */
function outboundRequest(url, formBody, extraHeaders) {
  return new Promise(function (resolve) {
    let lastUrl = url;
    const req = net.request({ method: formBody ? "POST" : "GET", url: url, session: getSes(), useSessionCookies: true, redirect: "manual" });
    req.setHeader("Accept", "text/html,application/xhtml+xml,*/*;q=0.8");
    // 없으면 서버가 표 제목을 다른 언어로 줄 수 있다
    req.setHeader("Accept-Language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7");
    req.setHeader("Referer", WMS_ORDER_LIST_URL);
    req.setHeader("User-Agent", CHROME_UA);
    if (formBody) {
      req.setHeader("Content-Type", "application/x-www-form-urlencoded");
      req.setHeader("Origin", "https://outbound.coupang.com");
    }
    Object.keys(extraHeaders || {}).forEach(function (k) {
      req.setHeader(k, extraHeaders[k]);
    });
    req.on("redirect", function (_status, _method, redirectUrl) {
      lastUrl = redirectUrl;
      req.followRedirect();
    });
    req.on("response", function (res) {
      if (!looksLoggedIn(lastUrl)) {
        resolve({ ok: false, needLogin: true, error: "WMS 로그인이 필요합니다" });
        req.abort();
        return;
      }
      if (res.statusCode !== 200) {
        resolve({ ok: false, error: "HTTP " + res.statusCode });
        req.abort();
        return;
      }
      const chunks = [];
      res.on("data", function (chunk) {
        chunks.push(chunk);
      });
      res.on("end", function () {
        resolve({ ok: true, html: Buffer.concat(chunks).toString("utf8"), lastUrl: lastUrl });
      });
      res.on("error", function (e) {
        resolve({ ok: false, error: e && e.message ? e.message : String(e) });
      });
    });
    req.on("error", function (e) {
      resolve({ ok: false, error: e && e.message ? e.message : String(e) });
    });
    req.end(formBody);
  });
}

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/** 오더넘버 → 주문 ID. 화면에서 쓰는 기간(OOS일~다음 날)에 없으면 하루 앞까지 넓혀 한 번 더 찾는다 */
async function findOrderIds(order, sku, date) {
  const ranges = [
    [date, addDays(date, 1)],
    [addDays(date, -1), addDays(date, 1)],
  ];
  let size = 0;
  for (let i = 0; i < ranges.length; i++) {
    if (i > 0) await wait(WMS_ORDER_STEP_GAP_MS);
    const res = await outboundRequest(WMS_ORDER_LIST_URL, buildOrderSearchBody(order, sku, ranges[i][0], ranges[i][1]));
    if (!res.ok) return res;
    const ids = parseOrderIds(res.html, order);
    if (ids.length) return { ok: true, ids: ids };
    size = res.html.length;
  }
  return { ok: true, ids: [], size: size };
}

/** 오더의 출고 커트라인. 화면에는 값과 고객 정보가 없는 진단 문구만 돌려준다 */
async function fetchOrderCutline(orderNumber, externalSku, date) {
  const order = String(orderNumber || "");
  const sku = String(externalSku || "");
  if (!/^\d{1,20}$/.test(order)) return { ok: false, error: "오더넘버 형식이 올바르지 않습니다" };
  if (!/^[A-Za-z0-9_-]{0,40}$/.test(sku)) return { ok: false, error: "외부 SKU ID 형식이 올바르지 않습니다" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return { ok: false, error: "날짜 형식이 올바르지 않습니다" };
  const search = await findOrderIds(order, sku, date);
  if (!search.ok) return search;
  if (!search.ids.length) return { ok: true, found: false, cutlines: [], diagnostic: "주문 ID를 찾지 못함 · 검색 응답 " + search.size + "자" };

  const cutlines = [];
  let found = false;
  let diagnostic;
  for (const id of search.ids) {
    await wait(WMS_ORDER_STEP_GAP_MS);
    const detail = await outboundRequest(WMS_ORDER_DETAIL_URL + id);
    if (!detail.ok) return detail;
    const parsed = parseCutlines(detail.html);
    found = found || parsed.found;
    parsed.values.forEach(function (value) {
      if (cutlines.indexOf(value) < 0) cutlines.push(value);
    });
    if (parsed.diagnostic && !diagnostic) diagnostic = parsed.diagnostic + " · " + hostAndPath(detail.lastUrl);
  }
  return { ok: true, found: found, cutlines: cutlines, diagnostic: found ? undefined : diagnostic };
}

/** GC의 이관 정보(상차·하차·진열완료·차량번호). 일반 이관 → 같은 센터 이관 순서로 찾는다 */
async function fetchTransferInfo(request) {
  const cart = String((request && request.cart) || "");
  const ct = String((request && request.ct) || "");
  const center = String((request && request.center) || "");
  const date = String((request && request.date) || "");
  if (!/^GC-[A-Z0-9-]+$/i.test(cart) || !/^[A-Z0-9-]*$/i.test(ct) || !/^[A-Z][A-Z0-9]*$/.test(center) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "조회 값 형식이 올바르지 않습니다" };
  }
  const headers = { Accept: "text/html, */*; q=0.01", Referer: WMS_TRANSFER_REFERER, "X-Requested-With": "XMLHttpRequest" };
  let cartOnly = null;
  let noStowLabels = null;
  let lastError = "";
  for (const base of PAGING_BASES) {
    for (let page = 0; page < PAGE_CAP; page++) {
      if (page > 0) await wait(WMS_ORDER_STEP_GAP_MS);
      const res = await outboundRequest(buildTransferUrl(base, cart, center, date, page), undefined, headers);
      if (!res.ok) {
        if (res.needLogin) return res;
        lastError = res.error;
        break;
      }
      const parsed = parseTransferRows(res.html);
      const picked = pickTransferRow(parsed.rows, cart, ct);
      if (picked.row && !parsed.hasStow) noStowLabels = parsed.labels;
      if (picked.row && picked.ctMatched) return transferResult(picked.row, true, noStowLabels);
      if (picked.row && !cartOnly) cartOnly = picked.row;
      if (!hasNextPage(res.html, page)) break;
    }
  }
  if (cartOnly) return transferResult(cartOnly, false, noStowLabels);
  if (lastError) return { ok: false, error: lastError };
  return { ok: true, found: false };
}

function transferResult(row, ctMatched, noStowLabels) {
  return {
    ok: true,
    found: true,
    ctMatched: ctMatched,
    load: row.load,
    unload: row.unload,
    stow: row.stow,
    vehicle: row.vehicle,
    diagnostic: noStowLabels ? "진열완료 열을 못 찾음 · 머리글 " + noStowLabels.join(", ").slice(0, 200) : undefined,
  };
}

/** 이 앱의 WMS 세션만 전환된다 (Chrome 등 다른 곳의 로그인에는 영향 없음) */
async function changeWmsCenter(centerId) {
  const want = String(centerId || "");
  if (!/^\d{2,6}$/.test(want)) return { ok: false, error: "센터 ID 형식이 올바르지 않습니다" };
  let body;
  try {
    const res = await getSes().fetch(WMS_CHANGE_CENTER_URL + want, {
      headers: { Accept: "*/*", Referer: WMS_LOGIN_URL, "User-Agent": CHROME_UA },
    });
    if (res.status < 200 || res.status >= 400) return { ok: false, error: "센터 전환 HTTP " + res.status };
    body = await res.text();
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
  let result = null;
  try {
    result = JSON.parse(body);
  } catch (_e) {
    return { ok: false, error: "센터 전환 응답 오류 (WMS 로그인을 확인해 주세요)" };
  }
  if (!result || result.success !== true) return { ok: false, error: (result && result.message) || "센터 전환에 실패했습니다" };
  // 성공 응답이어도 실제 세션 센터가 바뀌었는지 다시 확인한다
  const st = await wmsSessionStatus();
  if (st.centerId && st.centerId !== want) return { ok: false, error: "전환 후 확인된 센터가 다릅니다 (" + st.centerId + ")" };
  return { ok: true, verified: !!st.centerId };
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

// Power BI: 리포트 화면이 보내는 요청에서 토큰을 얻는다. 토큰은 메모리에만 두고 화면 쪽으로 넘기지 않는다
let pbiToken = null;
let pbiWindow = null;
let pbiWindowShown = false;
let pbiSilentTimer = null;
let pbiWaiters = [];

function readJwtClaims(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString("utf8"));
  } catch (_e) {
    return null;
  }
}

function pbiTokenValid(marginMs) {
  return !!pbiToken && pbiToken.expMs - Date.now() > marginMs;
}

function pbiStatus() {
  return { loggedIn: pbiTokenValid(0), checking: !!pbiWindow && !pbiWindowShown, loginOpen: !!pbiWindow && pbiWindowShown };
}

function sendPbiStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("cfs-atsoos-pbi-status", pbiStatus());
}

function settlePbiWaiters() {
  const waiters = pbiWaiters;
  pbiWaiters = [];
  waiters.forEach(function (done) {
    done(pbiTokenValid(0));
  });
}

function closePbiWindow() {
  if (pbiWindow && !pbiWindow.isDestroyed()) pbiWindow.close();
}

function rememberPbiToken(header) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(header || ""));
  if (!m) return;
  const claims = readJwtClaims(m[1]);
  if (!claims || claims.aud !== PBI_TOKEN_AUD) return;
  const expMs = Number(claims.exp) * 1000;
  if (!(expMs > Date.now())) return;
  const changed = !pbiToken || pbiToken.value !== m[1];
  pbiToken = { value: m[1], expMs: expMs };
  settlePbiWaiters();
  closePbiWindow();
  if (changed) sendPbiStatus();
}

function watchPbiToken() {
  getSes().webRequest.onBeforeSendHeaders({ urls: ["https://*.analysis.windows.net/*"] }, function (details, callback) {
    const headers = details.requestHeaders;
    const key = Object.keys(headers).find(function (k) {
      return k.toLowerCase() === "authorization";
    });
    const value = key ? headers[key] : null;
    callback({ requestHeaders: headers });
    if (value) rememberPbiToken(value);
  });
}

/** visible=false 는 저장된 로그인으로 토큰만 조용히 받는 숨은 창 */
function openPbiWindow(visible) {
  if (pbiWindow && !pbiWindow.isDestroyed()) {
    if (visible) {
      clearTimeout(pbiSilentTimer);
      pbiWindowShown = true;
      pbiWindow.show();
      pbiWindow.focus();
      sendPbiStatus();
    }
    return;
  }
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    show: visible,
    title: APP_TITLE + " — Power BI 로그인",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: PARTITION,
    },
  });
  pbiWindow = win;
  pbiWindowShown = visible;
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(function () {
    return { action: "deny" };
  });
  clearTimeout(pbiSilentTimer);
  if (!visible) pbiSilentTimer = setTimeout(closePbiWindow, PBI_SILENT_WAIT_MS);
  win.on("closed", function () {
    const wasShown = pbiWindowShown;
    clearTimeout(pbiSilentTimer);
    pbiWindow = null;
    pbiWindowShown = false;
    settlePbiWaiters();
    sendPbiStatus();
    if (wasShown && mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  win.loadURL(PBI_REPORT_URL).catch(function () {});
  sendPbiStatus();
}

function acquirePbiToken() {
  return new Promise(function (resolve) {
    pbiWaiters.push(resolve);
    openPbiWindow(false);
  });
}

/**
 * session.fetch 는 Origin 을 넣으면 CORS 검사를 해서, 서버가 답해도 net::ERR_FAILED 로 끝날 수 있다.
 * net.request 는 검사가 없어 오류 응답의 상태 코드까지 그대로 받는다.
 */
function pbiPost(url, headers, body) {
  return new Promise(function (resolve, reject) {
    const req = net.request({ method: "POST", url: url, session: getSes() });
    Object.keys(headers).forEach(function (k) {
      req.setHeader(k, headers[k]);
    });
    req.on("response", function (res) {
      const chunks = [];
      res.on("data", function (chunk) {
        chunks.push(chunk);
      });
      res.on("end", function () {
        resolve({ status: res.statusCode, contentType: String(res.headers["content-type"] || ""), buffer: Buffer.concat(chunks) });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end(body);
  });
}

/** 큰 자료일 수 있어 시간 제한을 두지 않는다 */
async function exportAtsOos(request) {
  let body;
  try {
    body = JSON.stringify(buildAtsOosBody((request && request.centers) || [], request && request.date));
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (!pbiTokenValid(PBI_TOKEN_MARGIN_MS) && !(await acquirePbiToken())) {
    return { ok: false, needLogin: true, error: "Power BI 로그인이 필요합니다" };
  }
  try {
    const res = await pbiPost(
      PBI_EXPORT_URL,
      {
        Accept: "application/json, text/plain, */*",
        Authorization: "Bearer " + pbiToken.value,
        "Content-Type": "application/json;charset=UTF-8",
        ActivityId: crypto.randomUUID(),
        RequestId: crypto.randomUUID(),
        Origin: "https://app.powerbi.com",
        Referer: "https://app.powerbi.com/",
        "User-Agent": CHROME_UA,
        "X-PowerBI-HostEnv": "Power BI Web App",
      },
      body
    );
    if (res.status === 401) {
      pbiToken = null;
      sendPbiStatus();
      return { ok: false, needLogin: true, error: "Power BI 로그인이 만료되었습니다" };
    }
    if (res.status === 403) return { ok: false, error: "이 계정에 리포트 내보내기 권한이 없습니다 (HTTP 403)" };
    if (res.status < 200 || res.status >= 300) return { ok: false, error: "Power BI 응답 오류 HTTP " + res.status };
    if (!/spreadsheetml/i.test(res.contentType)) {
      return { ok: false, error: "Power BI가 엑셀이 아닌 응답을 보냈습니다" };
    }
    return { ok: true, base64: res.buffer.toString("base64") };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    title: APP_TITLE,
    icon: path.join(__dirname, "build", "icon.png"),
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
    sendPbiStatus();
  });
  mainWindow.on("closed", function () {
    mainWindow = null;
    // 숨은 창이 남아 있으면 앱이 종료되지 않는다
    closePbiWindow();
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

ipcMain.handle("cfs-atsoos-wms-order-cutline", async function (_e, orderNumber, externalSku, date) {
  return fetchOrderCutline(orderNumber, externalSku, date);
});

ipcMain.handle("cfs-atsoos-wms-transfer-info", async function (_e, request) {
  return fetchTransferInfo(request);
});

ipcMain.handle("cfs-atsoos-wms-change-center", async function (_e, centerId) {
  return changeWmsCenter(centerId);
});

// 엑셀은 다운로드 폴더에 저장한다. 파일 이름에 시각이 들어가 이전 파일을 덮어쓰지 않는다
let lastSavedExcel = "";

ipcMain.handle("cfs-atsoos-save-excel", async function (_e, name, base64) {
  try {
    const safe = String(name || "ATS_OOS").replace(/[\\/:*?"<>|]/g, "_");
    const file = path.join(app.getPath("downloads"), safe + ".xlsx");
    fs.writeFileSync(file, Buffer.from(String(base64 || ""), "base64"));
    lastSavedExcel = file;
    return { ok: true, path: file };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle("cfs-atsoos-show-saved-excel", async function () {
  if (!lastSavedExcel) return false;
  shell.showItemInFolder(lastSavedExcel);
  return true;
});

ipcMain.handle("cfs-atsoos-pbi-status", async function () {
  return pbiStatus();
});

ipcMain.handle("cfs-atsoos-pbi-login", async function () {
  openPbiWindow(true);
  return { ok: true };
});

ipcMain.handle("cfs-atsoos-pbi-export", async function (_e, request) {
  return exportAtsOos(request);
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
    watchPbiToken();
    createMainWindow();
    void acquirePbiToken();
  });

  app.on("window-all-closed", function () {
    app.quit();
  });
}
