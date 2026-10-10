"use strict";

const { BrowserWindow, app } = require("electron");

let invWin = null;
let beforeQuitHooked = false;

function getListUrl(cfg) {
  return String(
    (cfg && cfg.coupangInventoryListUrl) || "https://inventory.coupang.com/inventory/list"
  ).trim();
}

function assertInventoryHost(u) {
  let h = "";
  try {
    h = new URL(u).hostname.toLowerCase();
  } catch (e) {
    return false;
  }
  return h === "inventory.coupang.com";
}

function ensureBeforeQuit() {
  if (beforeQuitHooked) return;
  beforeQuitHooked = true;
  try {
    app.on("before-quit", function () {
      try {
        if (invWin && !invWin.isDestroyed()) invWin.destroy();
      } catch (e) {}
      invWin = null;
    });
  } catch (e) {}
}

function getOrCreateWindow(cfg) {
  ensureBeforeQuit();
  if (invWin && !invWin.isDestroyed()) return invWin;
  invWin = new BrowserWindow({
    show: cfg.coupangInventoryShowWindow === true,
    width: 1280,
    height: 900,
    webPreferences: {
      partition: "persist:yna4-coupang-inventory",
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  invWin.on("closed", function () {
    invWin = null;
  });
  return invWin;
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function buildPageScript(barcode, settleMs) {
  const b = JSON.stringify(String(barcode || ""));
  const ms = Math.min(120000, Math.max(2000, Number(settleMs) || 12000));
  return `(() => {
  const barcode = ${b};
  const settleMs = ${ms};
  return new Promise((resolve) => {
    function norm(t) { return String(t || "").replace(/\\s+/g, " "); }
    function hasEmptyMsg() {
      const el = document.body;
      if (!el) return false;
      const s = norm(el.innerText);
      return s.indexOf("조회 결과가 없습니다") >= 0 || s.indexOf("[조회 결과가 없습니다.]") >= 0;
    }
    function countDataRows() {
      const tables = document.querySelectorAll("table");
      let n = 0;
      for (let ti = 0; ti < tables.length; ti++) {
        const trs = tables[ti].querySelectorAll("tbody tr");
        for (let ri = 0; ri < trs.length; ri++) {
          const tr = trs[ri];
          const txt = norm(tr.textContent || "");
          if (txt.indexOf("조회 결과가 없습니다") >= 0) continue;
          if (txt.indexOf("[조회 결과가 없습니다.]") >= 0) continue;
          const tds = tr.querySelectorAll("td");
          let filled = 0;
          for (let di = 0; di < tds.length; di++) {
            if (String(tds[di].textContent || "").trim()) filled++;
          }
          if (filled >= 2) n++;
        }
      }
      return n;
    }
    function finish(obj) { resolve(obj); }
    try {
      const input = document.querySelector("input.input-location-barcode");
      if (!input) {
        finish({ error: "input.input-location-barcode 없음", markComplete: false });
        return;
      }
      input.focus();
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.value = barcode;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      let clicked = false;
      const btns = document.querySelectorAll('button, [role="button"], input[type="submit"]');
      for (let i = 0; i < btns.length; i++) {
        const t = (btns[i].innerText || btns[i].textContent || btns[i].value || "")
          .replace(/\\s+/g, "")
          .trim();
        if (t === "조회" || t.indexOf("조회") >= 0) {
          btns[i].click();
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
      }
      const start = Date.now();
      function tick() {
        const dr = countDataRows();
        const he = hasEmptyMsg();
        if (dr > 0) {
          finish({ markComplete: false });
          return;
        }
        if (he && dr === 0) {
          finish({ markComplete: true });
          return;
        }
        if (Date.now() - start >= settleMs) {
          if (he && dr === 0) finish({ markComplete: true });
          else if (dr > 0) finish({ markComplete: false });
          else finish({ error: "결과 판별 불가(로그인·UI변경·타임아웃)", markComplete: false });
          return;
        }
        setTimeout(tick, 250);
      }
      setTimeout(tick, 300);
    } catch (e) {
      finish({ error: String(e && e.message ? e.message : e), markComplete: false });
    }
  });
})()`;
}

/**
 * @param {string} barcode
 * @param {object} cfg
 * @param {import('electron').BrowserWindow} win
 */
async function lookupOneDom(barcode, cfg, win) {
  const settleMs = Number(cfg.coupangSettleMs) || 12000;
  const hardCap = Math.min(180000, Math.max(settleMs + 5000, Number(cfg.timeoutMs) || 60000));
  const script = buildPageScript(barcode, settleMs);
  const p = win.webContents.executeJavaScript(script, true);
  const raced = await Promise.race([
    p,
    sleep(hardCap).then(function () {
      return { error: "DOM 조회 타임아웃", markComplete: false };
    }),
  ]);
  if (!raced || typeof raced !== "object") {
    return { barcode: barcode, error: "DOM 응답 형식 오류", markComplete: false };
  }
  if (raced.error) {
    return { barcode: barcode, error: String(raced.error), markComplete: false };
  }
  return {
    barcode: barcode,
    markComplete: !!raced.markComplete,
  };
}

/**
 * @param {string[]} barcodes
 * @param {object} cfg merged gloc config
 */
async function runBatch(barcodes, cfg) {
  const listUrl = getListUrl(cfg);
  if (!assertInventoryHost(listUrl)) {
    return {
      ok: false,
      error: "coupangInventoryListUrl 은 inventory.coupang.com 만 허용됩니다.",
    };
  }
  const win = getOrCreateWindow(cfg);
  const readyMs = Math.min(60000, Math.max(500, Number(cfg.coupangListReadyMs) || 3500));
  try {
    await win.loadURL(listUrl, { waitUntil: "domcontentloaded" });
  } catch (e) {
    return {
      ok: false,
      error: "재고 목록 페이지 로드 실패: " + (e && e.message ? e.message : String(e)),
    };
  }
  await sleep(readyMs);

  const results = [];
  let noDataCount = 0;
  const delay = Math.min(5000, Math.max(0, Number(cfg.delayMsBetweenRequests) || 0));
  let i;
  for (i = 0; i < barcodes.length; i++) {
    if (i > 0 && delay > 0) await sleep(delay);
    const one = await lookupOneDom(barcodes[i], cfg, win);
    results.push(one);
    if (!one.error && one.markComplete) noDataCount += 1;
  }
  return {
    ok: true,
    results: results,
    noDataCount: noDataCount,
    lookupEngine: "coupang_inventory_dom",
  };
}

module.exports = {
  runBatch: runBatch,
};
