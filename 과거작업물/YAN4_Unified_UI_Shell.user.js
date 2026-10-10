// ==UserScript==
// @name         YAN4 IB 통합 UI Shell (UI만 · 단일 파일)
// @namespace    yna4-ui-shell
// @version      0.24.7
// @description  YAN4 IB 통합: 발주→SKU→검품 · Direct SLA · 워크플로우 · Transfer WMS Auto · Gross UPH · 그리드+고정열
// @match        https://inventory.coupang.com/
// @match        https://inbound.coupang.com/
// @match        https://outbound.coupang.com/workflow/nob/dashboard*
// @match        https://outbound.coupang.com/workflow/nob/v2/view/needToReplenish/detail/*
// @include      /^https:\/\/(inventory|inbound)\.coupang\.com\/?($|[?#])/
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @require      https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js
// @require      https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
// @connect      inbound.coupang.com
// @connect      inventory.coupang.com
// @connect      outbound.coupang.com
// @connect      coupangfsnam.sharepoint.com
// @connect      mos.coupang.net
// @connect      cdn.jsdelivr.net
// @run-at       document-end
// @noframes
// ==/UserScript==
﻿﻿(function () {
  "use strict";

  /** 페이지/구버전 스크립트와 id 충돌 시 패널이 영구히 안 뜰 수 있어 고유값 유지 */
  var ROOT_ID = "yna4UnifiedUiShell_v09";

  /**
   * 통합 패널 카드 슬롯 정의 (개수·순서 늘리려면 이 배열만 수정)
   * kind: poSkuCompare=발주내역 · unload · repl · needHelpTracking=Need help(XHR·IB 루트 패널 전용) · stowProblemWatch · todo/slot 참고
   */
  var UNIFIED_SHELL_PANE_SPECS = [
    {
      id: "po",
      label: "Direct Tracking (receiving)",
      kind: "poSkuCompare",
      gridRowSpan: 2,
    },
    { id: "unload", label: "Direct SLA (RPA)", kind: "unload", gridRowSpan: 2 },
    {
      id: "loc",
      label: "Transfer WMS Auto",
      kind: "transferOpExcel",
      gridRowSpan: 2,
    },
    { id: "repl", label: "워크플로우 보충 (RPA)", kind: "repl", gridRowSpan: 2 },
    {
      id: "slot05",
      label: "STOW Error Tracking",
      kind: "stowProblemWatch",
      gridRow: 1,
      gridColumn: 5,
    },
    {
      id: "slot11",
      label: "Tote-Move RCRT88(API)",
      kind: "toteMoveApi",
      gridRow: 2,
      gridColumn: 5,
    },
    {
      id: "slot12wide",
      label: "Gross UPH (YAN4 IB)",
      kind: "grossUphChart",
      gridRow: 3,
      gridColumn: "1 / 6",
    },
    {
      id: "slot06",
      label: "Need help Tracking",
      kind: "needHelpTracking",
      gridRow: "1 / 4",
      gridColumn: 6,
    },
  ];

  /** 2페이지 카드 — 12칸 · po와 동일 크기(gridRowSpan 2) */
  var UNIFIED_SHELL_PAGE2_PANE_SPECS = [
    {
      id: "p2recv",
      label: "입고내역 Excel (P/each)",
      kind: "receiveExport",
      gridRowSpan: 2,
    },
    { id: "p2slot02", label: "—", kind: "slot", gridRowSpan: 2 },
    { id: "p2slot03", label: "—", kind: "slot", gridRowSpan: 2 },
    { id: "p2slot04", label: "—", kind: "slot", gridRowSpan: 2 },
    { id: "p2slot05", label: "—", kind: "slot", gridRowSpan: 2 },
    { id: "p2slot06", label: "—", kind: "slot", gridRowSpan: 2 },
    { id: "p2slot07", label: "—", kind: "slot", gridRowSpan: 2 },
    { id: "p2slot08", label: "—", kind: "slot", gridRowSpan: 2 },
    { id: "p2slot09", label: "—", kind: "slot", gridRowSpan: 2 },
    { id: "p2slot10", label: "—", kind: "slot", gridRowSpan: 2 },
    { id: "p2slot11", label: "—", kind: "slot", gridRowSpan: 2 },
    { id: "p2slot12", label: "—", kind: "slot", gridRowSpan: 2 },
  ];

  /**
   * 통합 패널 카드 UI를 보여 줄 URL 여부
   * HTTPS + (inbound|inventory).coupang.com + IB 루트(/) 만 (하위 경로에서는 패널 숨김)
   */
  function inboundShellUrlAllowed() {
    try {
      if (location.protocol !== "https:") return false;
      var host = location.hostname || "";
      var panelHost =
        /^inbound\.coupang\.com$/i.test(host) ||
        /^inventory\.coupang\.com$/i.test(host);
      if (!panelHost) return false;
      var p = location.pathname || "";
      if (p.length > 1 && p.charAt(p.length - 1) === "/") {
        p = p.slice(0, -1);
      }
      return p === "" || p === "/";
    } catch (eIn) {
      return false;
    }
  }

  /** 일일 잠금(확장 전용): 아래 상수 비밀번호 · KST 기준 하루 1회. 새 패키지 올릴 때 상수만 바꾸면 됨. */
  var YAN4_GATE_DAILY_PASSWORD = "1007IB";
  var YAN4_GATE_SK_UNLOCK_KST = "yan4Gate_v2_unlock_kst";

  var yna4DailyGateOverlayEl = null;
  /** 일일 게이트 통과 전에는 tryMount·mount 금지 */
  var yna4ShellGatePassed = false;

  function yna4GateIsExtensionEnv() {
    try {
      return (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        typeof chrome.runtime.id === "string" &&
        chrome.runtime.id.length > 0 &&
        chrome.storage &&
        chrome.storage.local
      );
    } catch (eG) {
      return false;
    }
  }

  function yna4GateTodayKstYmd() {
    try {
      return String(
        new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) || ""
      ).replace(/-/g, "");
    } catch (eT) {
      var d = new Date();
      return (
        d.getFullYear() +
        (d.getMonth() < 9 ? "0" : "") +
        (d.getMonth() + 1) +
        (d.getDate() < 10 ? "0" : "") +
        d.getDate()
      );
    }
  }

  function yna4GateRemoveOverlay() {
    try {
      if (yna4DailyGateOverlayEl && yna4DailyGateOverlayEl.parentNode) {
        yna4DailyGateOverlayEl.parentNode.removeChild(yna4DailyGateOverlayEl);
      }
    } catch (eR) {}
    yna4DailyGateOverlayEl = null;
  }

  function yna4GateInjectOverlayStyles() {
    var sid = "yna4-daily-gate-style-v1";
    if (document.getElementById(sid)) return;
    var st = document.createElement("style");
    st.id = sid;
    st.textContent =
      "#yna4-daily-gate-v1{position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font:13px/1.45 system-ui,Segoe UI,Malgun Gothic,sans-serif;}" +
      "#yna4-daily-gate-v1 .yg-card{max-width:400px;width:100%;background:#fff;border-radius:12px;padding:18px 20px;box-shadow:0 22px 50px rgba(0,0,0,.28);border:1px solid #e2e8f0;}" +
      "#yna4-daily-gate-v1 h1{margin:0 0 6px;font-size:16px;font-weight:800;color:#0f172a;}" +
      "#yna4-daily-gate-v1 .yg-sub{margin:0 0 14px;font-size:11px;color:#64748b;line-height:1.45;}" +
      "#yna4-daily-gate-v1 label{display:block;font-size:11px;font-weight:700;color:#334155;margin:10px 0 4px;}" +
      "#yna4-daily-gate-v1 input[type=password],#yna4-daily-gate-v1 input[type=text]{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;}" +
      "#yna4-daily-gate-v1 .yg-row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;}" +
      "#yna4-daily-gate-v1 button{padding:8px 14px;border-radius:8px;font:inherit;font-weight:700;cursor:pointer;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;}" +
      "#yna4-daily-gate-v1 button.yg-primary{background:#1d4ed8;border-color:#1e40af;color:#fff;}" +
      "#yna4-daily-gate-v1 .yg-err{margin-top:10px;font-size:11px;color:#b91c1c;}" +
      "#yna4-daily-gate-v1 .yg-hint{margin-top:12px;font-size:10px;color:#94a3b8;line-height:1.4;}";
    (document.head || document.documentElement).appendChild(st);
  }

  function yna4GateEnsureUnlocked(doneFn) {
    if (typeof doneFn !== "function") return;
    if (!yna4GateIsExtensionEnv() || !inboundShellUrlAllowed()) {
      doneFn();
      return;
    }
    chrome.storage.local.get([YAN4_GATE_SK_UNLOCK_KST], function (got) {
      if (chrome.runtime.lastError) {
        doneFn();
        return;
      }
      if (got[YAN4_GATE_SK_UNLOCK_KST] === yna4GateTodayKstYmd()) {
        doneFn();
        return;
      }
      yna4GateShowDailyPassword(doneFn);
    });
  }

  function yna4GateShowDailyPassword(doneFn) {
    yna4GateInjectOverlayStyles();
    yna4GateRemoveOverlay();
    var ov = document.createElement("div");
    ov.id = "yna4-daily-gate-v1";
    yna4DailyGateOverlayEl = ov;
    var card = document.createElement("div");
    card.className = "yg-card";
    var h1 = document.createElement("h1");
    h1.textContent = "YAN4 IB Shell 잠금";
    var sub = document.createElement("p");
    sub.className = "yg-sub";
    sub.textContent =
      "KST 기준 오늘 하루 한 번 비밀번호를 입력해 주세요. (배포 문서에 안내된 값)";
    var err = document.createElement("div");
    err.className = "yg-err";
    err.style.display = "none";
    var lab = document.createElement("label");
    lab.textContent = "비밀번호";
    var inp = document.createElement("input");
    inp.type = "password";
    inp.autocomplete = "current-password";
    var row = document.createElement("div");
    row.className = "yg-row";
    var btnGo = document.createElement("button");
    btnGo.type = "button";
    btnGo.className = "yg-primary";
    btnGo.textContent = "잠금 해제 후 패널 열기";
    row.appendChild(btnGo);
    var hint = document.createElement("p");
    hint.className = "yg-hint";
    hint.textContent =
      "내부 통제용입니다. 비밀번호는 확장 패키지 버전에 따라 바뀔 수 있습니다.";
    card.appendChild(h1);
    card.appendChild(sub);
    card.appendChild(lab);
    card.appendChild(inp);
    card.appendChild(err);
    card.appendChild(row);
    card.appendChild(hint);
    ov.appendChild(card);
    document.body.appendChild(ov);
    btnGo.addEventListener("click", function () {
      err.style.display = "none";
      var pw = String(inp.value || "").trim();
      if (!pw.length) {
        err.textContent = "비밀번호를 입력하세요.";
        err.style.display = "block";
        return;
      }
      if (pw !== String(YAN4_GATE_DAILY_PASSWORD || "")) {
        err.textContent = "비밀번호가 올바르지 않습니다.";
        err.style.display = "block";
        return;
      }
      var pack = {};
      pack[YAN4_GATE_SK_UNLOCK_KST] = yna4GateTodayKstYmd();
      btnGo.disabled = true;
      chrome.storage.local.set(pack, function () {
        yna4GateRemoveOverlay();
        doneFn();
      });
    });
  }

  /** 직납하차내역 긁어오기 — 전체 복사는 GM_xmlhttpRequest 만 사용 (숨김 iframe 없음) */
  var unloadCopyRunning = false;
  var unloadCopyStopRequested = false;
  var poSkuPipelineRunning = false;
  var poSkuPipelineStopRequested = false;
  var unloadLastMergedText = "";
  var unloadLastMergedHtml = "";
  var unloadSlaTimer = null;
  var unloadSlaLastRows = [];
  var unloadSlaAllRows = [];
  var unloadSlaWorkerChoices = [];
  var unloadSlaHasWorkerCol = false;
  var unloadSlaLastEmptyBodyHtml = "";
  var unloadSlaModalVisible = false;
  var unloadGapApiRunning = false;
  var unloadGapLastRows = [];
  var UNLOAD_GAP_INVENTORY_LIST_URL = "https://inventory.coupang.com/inventory/list";
  var UNLOAD_GAP_INVENTORY_SEARCH_URL =
    "https://inventory.coupang.com/async/inventory/search";
  var UNLOAD_GAP_INVENTORY_REFERER = UNLOAD_GAP_INVENTORY_LIST_URL + "?searched=true";
  var UNLOAD_GAP_INVENTORY_PAGE_CAP = 40;
  var UNLOAD_GAP_REQ_TIMEOUT_MS = 45000;
  var shellUnloadRefreshHint = function () {};

  var UNLOAD_SLA_WORKER_NICK = Object.freeze({
    V7279297: "Stone",
    N7503080: "Teo",
    G4828831: "Judy",
    N8352146: "Han",
    S1997861: "Youngwoon",
    Q8121675: "Solin",
    R1684286: "Luca",
    J3866485: "Pepe",
    U6075063: "Aron",
    L7515480: "Diah",
    R7449799: "Eri",
    V6703574: "Wiz",
    S9779996: "민경두",
    U7058151: "조문희",
    H9228142: "강혜인",
    A9141217: "강보윤",
    G8398692: "Iru",
    G4216365: "이은주",
    Q1448448: "신도윤",
    X1193767: "박연순",
    M6743291: "박결",
    U3995226: "송태정",
    K7516127: "민윤경",
  });
  var unloadSlaSavedIbcLinks = Object.create(null);
  var UNLOAD_SLA_DEADLINE_HOURS = 12;
  var UNLOAD_SLA_MS_1H = 60 * 60 * 1000;
  var UNLOAD_SLA_MS_2H = 2 * UNLOAD_SLA_MS_1H;
  var UNLOAD_SLA_MS_3H = 3 * UNLOAD_SLA_MS_1H;

  function unloadSlaFormatWorkerLabel(raw) {
    var code = String(raw || "").trim();
    if (!code) return "";
    var upper = code.toUpperCase();
    var nick = UNLOAD_SLA_WORKER_NICK[upper];
    return nick ? upper + "(" + nick + ")" : code;
  }

  function unloadSlaEnsureModal() {
    var modalId = ROOT_ID + "-unload-sla-modal";
    var existing = document.getElementById(modalId);
    if (existing) return existing;
    var overlay = document.createElement("div");
    overlay.id = modalId;
    overlay.className = "yna4-sla-modal";
    overlay.style.display = "none";
    overlay.innerHTML =
      "<div class='yna4-sla-modal-backdrop' data-role='close'></div>" +
      "<div class='yna4-sla-modal-dialog' role='dialog' aria-modal='true' aria-label='직납 SLA 상세'>" +
      "<div class='yna4-sla-modal-head'>" +
      "<strong>급한 순 · 직납 SLA 상세</strong>" +
      "<button type='button' class='yna4-pane-btn' id='" +
      ROOT_ID +
      "-unload-sla-close'>닫기</button>" +
      "</div>" +
      "<div class='yna4-pane-sla-kpi' id='" +
      ROOT_ID +
      "-unload-sla-kpi'></div>" +
      "<p class='yna4-pane-sla-hint'>주황: 3시간 이내 · 노랑: 2시간 이내 · 빨강: 1시간 이내 · 검정줄: 데드라인 지남 · 초록: 여유 · 긴급도 1초마다 갱신</p>" +
      "<div class='yna4-pane-row yna4-pane-sla-filter' id='" +
      ROOT_ID +
      "-unload-sla-worker-bar' style='display:none'>" +
      "<span class='yna4-pane-k'>하차작업자</span>" +
      "<select id='" +
      ROOT_ID +
      "-unload-sla-worker' class='yna4-pane-inp'></select>" +
      "</div>" +
      "<div class='yna4-pane-sla-table-wrap'>" +
      "<table class='yna4-pane-sla-table'>" +
      "<thead><tr>" +
      "<th>긴급도(남은시간)</th><th>하차번호</th><th>업체명</th><th>하차작업자</th><th>하차일시</th><th>SLA (+12h)</th><th>입고</th><th>진열완료</th><th>진열오류</th><th>SKU 추적</th><th>남은 진열</th>" +
      "</tr></thead>" +
      "<tbody id='" +
      ROOT_ID +
      "-unload-sla-tbody'></tbody></table></div>" +
      "</div>";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-role") === "close") {
        unloadSlaCloseModal();
        return;
      }
      if (
        t &&
        t.classList &&
        t.classList.contains("yna4-gap-auto-btn") &&
        t.getAttribute
      ) {
        var to = t.getAttribute("data-gap-url") || "";
        if (to) unloadSlaOpenGapTraceTarget(to);
      }
    });
    var closeBtn = document.getElementById(ROOT_ID + "-unload-sla-close");
    if (closeBtn) closeBtn.addEventListener("click", unloadSlaCloseModal);
    var workerSel = document.getElementById(ROOT_ID + "-unload-sla-worker");
    if (workerSel) workerSel.addEventListener("change", unloadSlaApplyWorkerFilter);
    return overlay;
  }

  function unloadSlaOpenModal() {
    var modal = unloadSlaEnsureModal();
    if (!modal) return;
    modal.style.display = "block";
    unloadSlaModalVisible = true;
    if (unloadSlaLastRows.length) unloadSlaStartTimer();
  }

  function unloadSlaCloseModal() {
    var modal = document.getElementById(ROOT_ID + "-unload-sla-modal");
    if (modal) modal.style.display = "none";
    unloadSlaModalVisible = false;
    unloadSlaClearTimer();
  }

  function unloadSlaEscapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function unloadSlaOpenGapTraceTarget(rawUrl) {
    var target = String(rawUrl || "").trim();
    if (!target || unloadGapApiRunning) return;
    unloadGapApiRunning = true;
    unloadGapRunFromDetailUrl(target)
      .catch(function (eGap) {
        alert("[YAN4] Gap Trace(API) 실패: " + (eGap && eGap.message ? eGap.message : eGap));
      })
      .finally(function () {
        unloadGapApiRunning = false;
      });
  }

  function unloadGapNormKey(s) {
    return String(s || "").replace(/\s+/g, "").toLowerCase();
  }

  function unloadGapFindCol(headers, candidates) {
    var h = headers.map(function (x, i) {
      return { n: unloadGapNormKey(x), i: i };
    });
    var c;
    for (c = 0; c < candidates.length; c++) {
      var cn = unloadGapNormKey(candidates[c]);
      var j;
      for (j = 0; j < h.length; j++) {
        if (h[j].n === cn || h[j].n.indexOf(cn) >= 0 || cn.indexOf(h[j].n) >= 0) {
          return h[j].i;
        }
      }
    }
    return -1;
  }

  function unloadGapNum(v) {
    if (v == null || v === "") return NaN;
    return parseFloat(String(v).replace(/,/g, "").trim());
  }

  function unloadGapNormalizeInventorySkuId(sku) {
    var s = String(sku || "").replace(/\u00a0/g, " ").trim();
    if (!s) return "";
    var m = s.match(/\d{5,20}/);
    return m ? m[0] : s.replace(/\s+/g, "");
  }

  function unloadGapAbsUrl(raw, base) {
    try {
      return new URL(raw, base || location.origin).href;
    } catch (eU) {
      return String(raw || "");
    }
  }

  function unloadGapGmGet(url, headers) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        headers: Object.assign(
          { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
          headers || {}
        ),
        timeout: UNLOAD_GAP_REQ_TIMEOUT_MS,
        onload: function (r) {
          if (r.status >= 200 && r.status < 400) resolve(r.responseText);
          else reject(new Error("HTTP " + r.status + " " + url));
        },
        onerror: function () {
          reject(new Error("요청 실패 " + url));
        },
        ontimeout: function () {
          reject(new Error("타임아웃(GET " + UNLOAD_GAP_REQ_TIMEOUT_MS + "ms) " + url));
        },
      });
    });
  }

  /** 확장: background fetch 로 inventory 쿠키 사용(inbound 탭 fetch 보완). 실패 시 GM_xmlhttpRequest. */
  function unloadGapInventoryRequest(opts) {
    var o = opts && typeof opts === "object" ? opts : {};
    var url = String(o.url || "");
    var referer = String(o.referer || UNLOAD_GAP_INVENTORY_REFERER);
    var accept = String(o.accept || "application/json, text/html, */*; q=0.8");
    var method = String(o.method || "GET").toUpperCase();
    var fallback = function () {
      if (method === "POST" && o.body != null) {
        return new Promise(function (resolve, reject) {
          GM_xmlhttpRequest({
            method: "POST",
            url: url,
            headers: Object.assign(
              {
                Accept: accept,
                Referer: referer,
                "Content-Type":
                  o.contentType || "application/x-www-form-urlencoded;charset=UTF-8",
              },
              o.headers || {}
            ),
            data: String(o.body),
            timeout: UNLOAD_GAP_REQ_TIMEOUT_MS,
            onload: function (r) {
              if (r.status >= 200 && r.status < 400) resolve(r.responseText);
              else reject(new Error("HTTP " + r.status + " POST " + url));
            },
            onerror: function () {
              reject(new Error("POST 실패 " + url));
            },
            ontimeout: function () {
              reject(new Error("타임아웃(POST) " + url));
            },
          });
        });
      }
      return unloadGapGmGet(url, Object.assign({ Referer: referer, Accept: accept }, o.headers || {}));
    };
    if (
      typeof chrome === "undefined" ||
      !chrome.runtime ||
      typeof chrome.runtime.sendMessage !== "function"
    ) {
      return fallback();
    }
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(
        {
          type: "yan4InventoryFetch",
          url: url,
          method: method,
          referer: referer,
          accept: accept,
          body: o.body,
          contentType: o.contentType,
        },
        function (res) {
          if (chrome.runtime.lastError) {
            fallback().then(resolve, reject);
            return;
          }
          if (res && res.ok && res.status >= 200 && res.status < 400) {
            resolve(res.body);
            return;
          }
          if (res && res.ok) {
            reject(new Error("HTTP " + res.status + " " + url));
            return;
          }
          fallback().then(resolve, reject);
        }
      );
    });
  }

  function unloadGapBuildInventorySearchUrl(skuId, page) {
    var p = new URLSearchParams();
    p.set("searched", "true");
    p.set("locationType", "");
    p.set("zone", "");
    p.set("fromLocation", "");
    p.set("toLocation", "");
    p.set("locationBarcode", "");
    p.set("skuId", String(skuId || ""));
    p.set("externalSkuId", "");
    p.set("skuBarcode", "");
    p.set("lpnId", "");
    p.set("inventoryId", "");
    p.set("saleableChangeType", "");
    p.set("availableInventory", "true");
    p.set("page", String(page != null ? page : 0));
    p.set("pageSize", "20");
    return UNLOAD_GAP_INVENTORY_SEARCH_URL + "?" + p.toString();
  }

  function unloadGapParseRcrtFromInventoryJson(text) {
    var out = [];
    var seen = Object.create(null);
    var j;
    try {
      j = JSON.parse(String(text || ""));
    } catch (eJ) {
      return { locations: out, totalPages: 0 };
    }
    if (!j || j.success === false) return { locations: out, totalPages: 0 };
    var result = j.result;
    var content = result && result.content;
    if (!Array.isArray(content)) return { locations: out, totalPages: 0 };
    var i;
    for (i = 0; i < content.length; i++) {
      var row = content[i];
      var loc = String((row && row.locationBarcode) || "").trim();
      if (!loc || !/1007-RCRT[234]/.test(loc)) continue;
      if (seen[loc]) continue;
      seen[loc] = 1;
      out.push(loc);
    }
    var totalPages = result && result.totalPages != null ? Number(result.totalPages) : 1;
    if (!Number.isFinite(totalPages) || totalPages < 1) totalPages = 1;
    return { locations: out, totalPages: totalPages };
  }

  function unloadGapMergeRcrtLocations(merged, batch) {
    var i;
    for (i = 0; i < batch.length; i++) {
      if (merged.seen[batch[i]]) continue;
      merged.seen[batch[i]] = 1;
      merged.list.push(batch[i]);
    }
  }

  function unloadGapParsePoUrlsFromDetailHtml(detailHtml, detailUrl) {
    var doc = new DOMParser().parseFromString(String(detailHtml || ""), "text/html");
    var seen = Object.create(null);
    var out = [];
    var nodes = doc.querySelectorAll('a[href*="purchaseOrder/item"], a[href*="purchaseorder/item"]');
    var i;
    for (i = 0; i < nodes.length; i++) {
      var href = nodes[i].getAttribute("href") || "";
      if (!href) continue;
      var abs = unloadGapAbsUrl(href, detailUrl || location.origin);
      if (!/^https?:/i.test(abs)) continue;
      if (seen[abs]) continue;
      seen[abs] = true;
      out.push(abs);
    }
    return out;
  }

  function unloadGapTableToAoa(table) {
    var aoa = [];
    table.querySelectorAll("tr").forEach(function (tr) {
      var cells = tr.querySelectorAll("th,td");
      if (!cells.length) return;
      aoa.push(
        Array.prototype.map.call(cells, function (c) {
          return String(c.textContent != null ? c.textContent : "")
            .replace(/\u00a0/g, " ")
            .trim();
        })
      );
    });
    return aoa;
  }

  function unloadGapPadRows(aoa) {
    var max = 0;
    aoa.forEach(function (r) {
      if (r.length > max) max = r.length;
    });
    return aoa.map(function (r) {
      var x = r.slice();
      while (x.length < max) x.push("");
      return x;
    });
  }

  function unloadGapFindHeaderMap(aoa) {
    var r;
    for (r = 0; r < Math.min(25, aoa.length); r++) {
      var texts = aoa[r].map(function (c) {
        return String(c || "").trim();
      });
      var idxSku = unloadGapFindCol(texts, ["SKU ID", "SKUID"]);
      var idxRecv = unloadGapFindCol(texts, ["입고 수량", "입고수량", "입고"]);
      var idxDisp = unloadGapFindCol(texts, ["진열완료 수량", "진열완료수량", "진열완료"]);
      var idxErr = unloadGapFindCol(texts, ["진열오류 수량", "진열오류수량", "진열오류"]);
      if (idxSku < 0 || idxRecv < 0 || idxDisp < 0 || idxErr < 0) continue;
      return {
        headerRow: r,
        idxSku: idxSku,
        idxRecv: idxRecv,
        idxDisp: idxDisp,
        idxErr: idxErr,
        idxName: unloadGapFindCol(texts, ["상품명"]),
        idxStat: unloadGapFindCol(texts, ["상태"]),
      };
    }
    return null;
  }

  function unloadGapPurchaseOrderIdFromUrl(poUrl) {
    try {
      var u = new URL(poUrl, location.origin);
      var q = u.searchParams.get("purchaseOrderId") || u.searchParams.get("purchaseorderid");
      if (q) return String(q).trim();
      var m = (u.pathname || "").match(/(?:purchaseOrder\/item|purchaseorder\/item)\/(\d+)/i);
      return m ? m[1] : "";
    } catch (ePid) {
      return "";
    }
  }

  function unloadGapParseSkuRowsFromPoHtml(poHtml, poUrl) {
    var doc = new DOMParser().parseFromString(String(poHtml || ""), "text/html");
    var tables = doc.querySelectorAll('table[is="w-table"], table');
    var out = [];
    var t;
    for (t = 0; t < tables.length; t++) {
      var aoa = unloadGapPadRows(unloadGapTableToAoa(tables[t]));
      var map = unloadGapFindHeaderMap(aoa);
      if (!map) continue;
      var r;
      for (r = map.headerRow + 1; r < aoa.length; r++) {
        var c = aoa[r].map(function (x) {
          return String(x || "").trim();
        });
        var recv = unloadGapNum(c[map.idxRecv]);
        var disp = unloadGapNum(c[map.idxDisp]);
        var err = unloadGapNum(c[map.idxErr]);
        if (!isFinite(recv) || !isFinite(disp) || !isFinite(err)) continue;
        if (disp + err >= recv) continue;
        out.push({
          purchaseOrderId: unloadGapPurchaseOrderIdFromUrl(poUrl),
          poUrl: poUrl,
          sku: c[map.idxSku] || "",
          name: map.idxName >= 0 ? c[map.idxName] || "" : "",
          status: map.idxStat >= 0 ? c[map.idxStat] || "" : "",
          recv: recv,
          disp: disp,
          err: err,
          gap: recv - disp - err,
        });
      }
    }
    var seen = Object.create(null);
    var dedup = [];
    out.forEach(function (x) {
      var k = String(x.poUrl) + "\t" + String(x.sku);
      if (seen[k]) return;
      seen[k] = 1;
      dedup.push(x);
    });
    return dedup;
  }

  function unloadGapFindInventoryLocationColIndex(table) {
    var tr = table.querySelector("thead tr");
    if (!tr) return -1;
    var ths = tr.querySelectorAll("th");
    var i;
    for (i = 0; i < ths.length; i++) {
      var k = unloadGapNormKey(String(ths[i].textContent || ""));
      if (k === "로케이션" || (k.indexOf("로케이션") >= 0 && k.indexOf("시작") < 0 && k.indexOf("종료") < 0))
        return i;
    }
    return -1;
  }

  function unloadGapParseInventoryRcrtLocations(html) {
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    var table = doc.querySelector('table[is="w-table"]') || doc.querySelector("table");
    if (!table) return [];
    var idx = unloadGapFindInventoryLocationColIndex(table);
    if (idx < 0) return [];
    var out = [];
    var seen = Object.create(null);
    table.querySelectorAll("tbody tr").forEach(function (tr) {
      var tds = tr.querySelectorAll("td");
      if (tds.length <= idx) return;
      var loc = String(tds[idx].textContent || "").replace(/\u00a0/g, " ").trim();
      if (!loc) return;
      if (!/1007-RCRT[234]/.test(loc)) return;
      if (seen[loc]) return;
      seen[loc] = 1;
      out.push(loc);
    });
    return out;
  }

  async function unloadGapFetchRcrtForSku(sku) {
    var id = unloadGapNormalizeInventorySkuId(sku);
    if (!id) return "";
    var merged = { seen: Object.create(null), list: [] };
    var page;
    try {
      for (page = 0; page < UNLOAD_GAP_INVENTORY_PAGE_CAP; page++) {
        var searchUrl = unloadGapBuildInventorySearchUrl(id, page);
        var jsonText = await unloadGapInventoryRequest({
          url: searchUrl,
          referer: UNLOAD_GAP_INVENTORY_REFERER,
          accept: "application/json, text/javascript, */*; q=0.01",
        });
        var parsed = unloadGapParseRcrtFromInventoryJson(jsonText);
        unloadGapMergeRcrtLocations(merged, parsed.locations);
        if (page + 1 >= (parsed.totalPages || 1)) break;
      }
      if (merged.list.length) return merged.list.join(", ");
    } catch (eApi) {
      console.warn("[YAN4] inventory search API", id, eApi);
    }
    var q = "?searched=true&skuId=" + encodeURIComponent(id);
    try {
      var html = await unloadGapInventoryRequest({
        url: UNLOAD_GAP_INVENTORY_LIST_URL + q,
        referer: UNLOAD_GAP_INVENTORY_REFERER,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      });
      return unloadGapParseInventoryRcrtLocations(html).join(", ");
    } catch (eHtml) {
      console.warn("[YAN4] inventory list HTML", id, eHtml);
      return "";
    }
  }

  function unloadGapEnsureModal() {
    var id = ROOT_ID + "-gap-api-modal";
    var el = document.getElementById(id);
    if (el) return el;
    el = document.createElement("div");
    el.id = id;
    el.className = "yna4-gap-api-modal";
    el.style.display = "none";
    el.innerHTML =
      "<div class='yna4-gap-api-backdrop' data-role='close'></div>" +
      "<div class='yna4-gap-api-dialog'>" +
      "<div class='yna4-gap-api-head'><strong>PO-SKU Gap Trace (API)</strong>" +
      "<div class='yna4-gap-api-head-actions'>" +
      "<button type='button' class='yna4-pane-btn yna4-gap-api-copy' id='" +
      ROOT_ID +
      "-gap-api-copy'>팀즈용 표 복사</button>" +
      "<button type='button' class='yna4-pane-btn' id='" +
      ROOT_ID +
      "-gap-api-close'>닫기</button></div></div>" +
      "<div class='yna4-gap-api-status' id='" +
      ROOT_ID +
      "-gap-api-status'>준비</div>" +
      "<div class='yna4-gap-api-body' id='" +
      ROOT_ID +
      "-gap-api-body'></div></div>";
    document.body.appendChild(el);
    el.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-role") === "close") {
        el.style.display = "none";
      }
    });
    var c = document.getElementById(ROOT_ID + "-gap-api-close");
    if (c) {
      c.addEventListener("click", function () {
        el.style.display = "none";
      });
    }
    var cp = document.getElementById(ROOT_ID + "-gap-api-copy");
    if (cp) {
      cp.addEventListener("click", function () {
        unloadGapCopyTeamsTable(unloadGapLastRows || []);
      });
    }
    return el;
  }

  function unloadGapSetModalStatus(msg) {
    var s = document.getElementById(ROOT_ID + "-gap-api-status");
    if (s) s.textContent = String(msg || "");
  }

  function unloadGapRenderModalRows(rows) {
    unloadGapLastRows = Array.isArray(rows) ? rows.slice() : [];
    var body = document.getElementById(ROOT_ID + "-gap-api-body");
    if (!body) return;
    if (!rows || !rows.length) {
      body.innerHTML = "<div style='padding:10px;color:#64748b'>미달 SKU가 없습니다.</div>";
      return;
    }
    var html =
      "<table class='yna4-gap-api-table'><thead><tr>" +
      "<th>PO</th><th>SKU</th><th>상품명</th><th>상태</th><th>입고</th><th>진열완료</th><th>진열오류</th><th>미진열</th><th>RCRT</th>" +
      "</tr></thead><tbody>";
    rows.forEach(function (x) {
      html +=
        "<tr><td class='mono'>" +
        unloadSlaEscapeHtml(x.purchaseOrderId || "") +
        "</td><td class='mono'>" +
        unloadSlaEscapeHtml(x.sku || "") +
        "</td><td>" +
        unloadSlaEscapeHtml(x.name || "") +
        "</td><td>" +
        unloadSlaEscapeHtml(x.status || "") +
        "</td><td class='mono'>" +
        unloadSlaEscapeHtml(String(x.recv)) +
        "</td><td class='mono'>" +
        unloadSlaEscapeHtml(String(x.disp)) +
        "</td><td class='mono'>" +
        unloadSlaEscapeHtml(String(x.err)) +
        "</td><td class='mono' style='font-weight:800;color:#b91c1c'>" +
        unloadSlaEscapeHtml(String(x.gap)) +
        "</td><td>" +
        unloadSlaEscapeHtml(x.rcrt || "") +
        "</td></tr>";
    });
    html += "</tbody></table>";
    body.innerHTML = html;
  }

  function unloadGapBuildTeamsClipboard(rows) {
    var cols = ["발주ID", "SKU", "상품명", "상태", "입고", "진열완료", "진열오류", "미달", "로케이션 (RCRT2~4)"];
    var tsv = [cols.join("\t")];
    var html =
      '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:12px;color:#0f172a">' +
      '<thead><tr style="background:#f1f5f9;font-weight:bold">' +
      cols.map(function (h) {
        return "<th>" + unloadSlaEscapeHtml(h) + "</th>";
      }).join("") +
      "</tr></thead><tbody>";
    rows.forEach(function (x) {
      var cells = [
        x.purchaseOrderId || "",
        x.sku || "",
        x.name || "",
        x.status || "",
        x.recv != null ? x.recv : "",
        x.disp != null ? x.disp : "",
        x.err != null ? x.err : "",
        x.gap != null ? x.gap : "",
        x.rcrt || "",
      ];
      tsv.push(
        cells
          .map(function (v) {
            return String(v == null ? "" : v).replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
          })
          .join("\t")
      );
      html += "<tr>" +
        "<td>" + unloadSlaEscapeHtml(cells[0]) + "</td>" +
        "<td>" + unloadSlaEscapeHtml(cells[1]) + "</td>" +
        "<td>" + unloadSlaEscapeHtml(cells[2]) + "</td>" +
        "<td>" + unloadSlaEscapeHtml(cells[3]) + "</td>" +
        "<td style='text-align:right'>" + unloadSlaEscapeHtml(String(cells[4])) + "</td>" +
        "<td style='text-align:right'>" + unloadSlaEscapeHtml(String(cells[5])) + "</td>" +
        "<td style='text-align:right'>" + unloadSlaEscapeHtml(String(cells[6])) + "</td>" +
        "<td style='text-align:right;font-weight:800'>" + unloadSlaEscapeHtml(String(cells[7])) + "</td>" +
        "<td>" + unloadSlaEscapeHtml(cells[8]) + "</td>" +
        "</tr>";
    });
    html += "</tbody></table>";
    return { tsv: tsv.join("\n"), html: html };
  }

  function unloadGapCopyTeamsTable(rows) {
    if (!rows || !rows.length) {
      unloadGapSetModalStatus("복사할 행이 없습니다.");
      return;
    }
    var pack = unloadGapBuildTeamsClipboard(rows);
    var okTeams = function () {
      unloadGapSetModalStatus("팀즈용 표 복사 완료");
    };
    var okTsvOnly = function () {
      unloadGapSetModalStatus("복사 완료(텍스트만)");
    };
    var fail = function () {
      unloadGapSetModalStatus("복사 실패");
      alert("클립보드 복사 실패");
    };
    if (
      typeof ClipboardItem !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.write === "function"
    ) {
      navigator.clipboard
        .write([
          new ClipboardItem({
            "text/html": new Blob([pack.html], { type: "text/html;charset=utf-8" }),
            "text/plain": new Blob([pack.tsv], { type: "text/plain;charset=utf-8" }),
          }),
        ])
        .then(okTeams)
        .catch(function () {
          if (typeof GM_setClipboard === "function") {
            try {
              GM_setClipboard(pack.tsv, "text");
              okTsvOnly();
              return;
            } catch (eGm) {}
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(pack.tsv).then(okTsvOnly, fail);
            return;
          }
          fail();
        });
      return;
    }
    if (typeof GM_setClipboard === "function") {
      try {
        GM_setClipboard(pack.tsv, "text");
        okTsvOnly();
        return;
      } catch (eGm2) {}
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pack.tsv).then(okTsvOnly, fail);
      return;
    }
    fail();
  }

  async function unloadGapRunFromDetailUrl(detailUrl) {
    var modal = unloadGapEnsureModal();
    modal.style.display = "block";
    unloadGapSetModalStatus("상세 페이지 조회 중...");
    var detailHtml = await unloadGapGmGet(detailUrl);
    var poUrls = unloadGapParsePoUrlsFromDetailHtml(detailHtml, detailUrl);
    if (!poUrls.length) {
      unloadGapSetModalStatus("발주 링크를 찾지 못함");
      unloadGapRenderModalRows([]);
      return;
    }
    unloadGapSetModalStatus("발주 " + poUrls.length + "건 분석 중...");
    var all = [];
    var i;
    for (i = 0; i < poUrls.length; i++) {
      unloadGapSetModalStatus("발주 분석 " + (i + 1) + "/" + poUrls.length);
      var poHtml = await unloadGapGmGet(poUrls[i], { Referer: detailUrl });
      all = all.concat(unloadGapParseSkuRowsFromPoHtml(poHtml, poUrls[i]));
    }
    if (!all.length) {
      unloadGapSetModalStatus("미달 SKU 없음");
      unloadGapRenderModalRows([]);
      return;
    }
    var skuSeen = Object.create(null);
    var skus = [];
    all.forEach(function (x) {
      var s = String(x.sku || "").trim();
      if (!s || skuSeen[s]) return;
      skuSeen[s] = 1;
      skus.push(s);
    });
    var skuToRcrt = Object.create(null);
    for (i = 0; i < skus.length; i++) {
      unloadGapSetModalStatus("RCRT 조회 " + (i + 1) + "/" + skus.length);
      try {
        skuToRcrt[skus[i]] = await unloadGapFetchRcrtForSku(skus[i]);
      } catch (eSku) {
        skuToRcrt[skus[i]] = "";
      }
    }
    all.forEach(function (x) {
      x.rcrt = skuToRcrt[String(x.sku || "").trim()] || "";
    });
    all.sort(function (a, b) {
      return b.gap - a.gap;
    });
    unloadGapRenderModalRows(all);
    unloadGapSetModalStatus("완료 · " + all.length + "행");
  }

  function unloadSlaParseTime(v) {
    if (v == null || v === "") return null;
    var s = String(v).trim();
    var m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  function unloadSlaNum(v) {
    if (v == null || v === "") return NaN;
    var n = parseFloat(String(v).replace(/,/g, "").replace(/\s+출력\s*$/i, "").trim());
    return isNaN(n) ? NaN : n;
  }

  function unloadSlaFmtDT(d) {
    if (!d) return "";
    var y = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, "0");
    var da = String(d.getDate()).padStart(2, "0");
    var h = String(d.getHours()).padStart(2, "0");
    var mi = String(d.getMinutes()).padStart(2, "0");
    return y + "-" + mo + "-" + da + " " + h + ":" + mi;
  }

  function unloadSlaFormatRemain(ms) {
    if (ms <= 0) {
      var over = Math.abs(ms);
      var oh = Math.floor(over / 3600000);
      var om = Math.floor((over % 3600000) / 60000);
      var os = Math.floor((over % 60000) / 1000);
      return "초과 " + oh + "h " + om + "m " + os + "s";
    }
    var h = Math.floor(ms / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    var s = Math.floor((ms % 60000) / 1000);
    return h + "h " + m + "m " + s + "s";
  }

  function unloadSlaUrgency(deadline, now) {
    var ms = deadline.getTime() - now;
    if (ms <= 0) return { cls: "row-past", text: "⚫ " + unloadSlaFormatRemain(ms) };
    if (ms <= UNLOAD_SLA_MS_1H) return { cls: "row-warn-1h", text: "🔴 " + unloadSlaFormatRemain(ms) };
    if (ms <= UNLOAD_SLA_MS_2H) return { cls: "row-warn-2h", text: "🟡 " + unloadSlaFormatRemain(ms) };
    if (ms <= UNLOAD_SLA_MS_3H) return { cls: "row-warn-3h", text: "🟠 " + unloadSlaFormatRemain(ms) };
    return { cls: "row-ok", text: "🟢 " + unloadSlaFormatRemain(ms) };
  }

  function unloadSlaNormKey(s) {
    return String(s || "").replace(/\s+/g, "").toLowerCase();
  }

  function unloadSlaFindCol(headers, candidates) {
    var h = headers.map(function (x, i) {
      return { n: unloadSlaNormKey(x), i: i };
    });
    var ci;
    for (ci = 0; ci < candidates.length; ci++) {
      var cn = unloadSlaNormKey(candidates[ci]);
      var hi;
      for (hi = 0; hi < h.length; hi++) {
        if (
          h[hi].n === cn ||
          h[hi].n.indexOf(cn) >= 0 ||
          cn.indexOf(h[hi].n) >= 0
        ) {
          return h[hi].i;
        }
      }
    }
    return -1;
  }

  function unloadSlaFindHeaderMap(aoa) {
    var maxR = Math.min(15, aoa.length);
    var r;
    for (r = 0; r < maxR; r++) {
      var texts = aoa[r].map(function (c) {
        return String(c == null ? "" : c).trim();
      });
      var idxUnload = unloadSlaFindCol(texts, ["하차일시"]);
      var idxRecv = unloadSlaFindCol(texts, ["입고 수량", "입고수량", "입고"]);
      var idxDisp = unloadSlaFindCol(texts, ["진열완료 수량", "진열완료수량", "진열완료"]);
      if (idxUnload < 0 || idxRecv < 0 || idxDisp < 0) continue;
      if (unloadSlaParseTime(texts[idxUnload])) continue;
      return {
        headerRow: r,
        idxIbc: unloadSlaFindCol(texts, ["하차번호(ibc)", "하차번호ibc", "하차번호", "ibc"]),
        idxVendor: unloadSlaFindCol(texts, ["업체명", "업체"]),
        idxWorker: unloadSlaFindCol(texts, ["하차작업자", "하차 작업자"]),
        idxUnload: idxUnload,
        idxRecv: idxRecv,
        idxDisp: idxDisp,
        idxErr: unloadSlaFindCol(texts, ["진열오류 수량", "진열오류수량", "진열오류"]),
      };
    }
    return null;
  }

  function unloadSlaTsvToAoa(text) {
    if (!text || !String(text).trim()) return [];
    var aoa = [];
    String(text)
      .split(/\r?\n/)
      .forEach(function (line) {
        if (!line.trim()) return;
        if (line.indexOf("\t") >= 0) {
          aoa.push(
            line.split("\t").map(function (s) {
              return s.trim();
            })
          );
          return;
        }
        var parts = line
          .split(/\s{2,}/)
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean);
        aoa.push(parts.length >= 6 ? parts : [line.trim()]);
      });
    return aoa;
  }

  function unloadSlaPadRows(aoa) {
    var max = 0;
    aoa.forEach(function (r) {
      if (r.length > max) max = r.length;
    });
    return aoa.map(function (r) {
      var row = r.slice();
      while (row.length < max) row.push("");
      return row;
    });
  }

  function unloadSlaRememberLinksFromMergedHtml(html) {
    unloadSlaSavedIbcLinks = Object.create(null);
    if (!html || !String(html).trim()) return;
    try {
      var doc = new DOMParser().parseFromString(String(html), "text/html");
      var anchors = doc.querySelectorAll("a[href]");
      var i;
      for (i = 0; i < anchors.length; i++) {
        var a = anchors[i];
        var label = String(a.textContent || "").replace(/\u00a0/g, " ").trim();
        var href = String(a.getAttribute("href") || "").trim();
        if (!label || !href) continue;
        unloadSlaSavedIbcLinks[label] = href;
      }
    } catch (eSlaLink) {}
  }

  function unloadSlaProcessText(tsvText) {
    var aoa = unloadSlaPadRows(unloadSlaTsvToAoa(tsvText));
    if (!aoa.length) throw new Error("분석할 데이터가 없습니다.");
    var map = unloadSlaFindHeaderMap(aoa);
    if (!map) {
      throw new Error(
        '헤더 행을 찾지 못했습니다. "하차일시/입고/진열완료" 열이 포함된 원본 표를 먼저 수집하세요.'
      );
    }
    var out = [];
    var workerNames = Object.create(null);
    var parsed = 0;
    var r;
    for (r = map.headerRow + 1; r < aoa.length; r++) {
      var c = aoa[r].map(function (x) {
        return String(x == null ? "" : x).trim();
      });
      var unload = unloadSlaParseTime(c[map.idxUnload]);
      var recv = unloadSlaNum(c[map.idxRecv]);
      var disp = unloadSlaNum(c[map.idxDisp]);
      if (!unload || isNaN(recv) || isNaN(disp)) continue;
      parsed++;
      var errQty = 0;
      if (map.idxErr >= 0) {
        var eQty = unloadSlaNum(c[map.idxErr]);
        errQty = isNaN(eQty) ? 0 : eQty;
      }
      var remainQty = recv - disp - errQty;
      if (remainQty <= 0) continue;
      var worker = map.idxWorker >= 0 ? c[map.idxWorker] || "" : "";
      if (worker) workerNames[worker] = 1;
      var ibc = map.idxIbc >= 0 ? c[map.idxIbc] || "" : "";
      out.push({
        ibc: ibc,
        ibcUrl: unloadSlaSavedIbcLinks[String(ibc || "").trim()] || "",
        vendor: map.idxVendor >= 0 ? c[map.idxVendor] || "" : "",
        worker: worker,
        unload: unload,
        deadline: new Date(unload.getTime() + UNLOAD_SLA_DEADLINE_HOURS * 3600000),
        recv: recv,
        disp: disp,
        errQty: errQty,
        remainQty: remainQty,
      });
    }
    out.sort(function (a, b) {
      return a.deadline - b.deadline;
    });
    return {
      pending: out,
      parsed: parsed,
      dataLineCount: Math.max(0, aoa.length - (map.headerRow + 1)),
      hasWorkerCol: map.idxWorker >= 0,
      workerChoices: Object.keys(workerNames).sort(function (a, b) {
        return a.localeCompare(b, "ko");
      }),
    };
  }

  function unloadSlaClearTimer() {
    if (unloadSlaTimer != null) {
      clearInterval(unloadSlaTimer);
      unloadSlaTimer = null;
    }
  }

  function unloadSlaRenderKpi(rows, now) {
    var kpiEl = document.getElementById(ROOT_ID + "-unload-sla-kpi");
    if (!kpiEl) return;
    var past = 0;
    var in1h = 0;
    var in2h = 0;
    var in3h = 0;
    var ok = 0;
    var remainTotal = 0;
    rows.forEach(function (x) {
      var ms = x.deadline.getTime() - now;
      remainTotal += Number(x.remainQty || 0);
      if (ms <= 0) past++;
      else if (ms <= UNLOAD_SLA_MS_1H) in1h++;
      else if (ms <= UNLOAD_SLA_MS_2H) in2h++;
      else if (ms <= UNLOAD_SLA_MS_3H) in3h++;
      else ok++;
    });
    kpiEl.innerHTML =
      "<span>미진열 " +
      rows.length +
      "</span><span>초과 " +
      past +
      "</span><span>1h " +
      in1h +
      "</span><span>2h " +
      in2h +
      "</span><span>3h " +
      in3h +
      "</span><span>여유 " +
      ok +
      "</span><span>남은총량 " +
      remainTotal +
      "</span>";
  }

  function unloadSlaRenderRows(rows) {
    var tbody = document.getElementById(ROOT_ID + "-unload-sla-tbody");
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML =
        unloadSlaLastEmptyBodyHtml ||
        "<tr><td colspan='11' style='text-align:center;padding:12px;color:#64748b'>미진열 없음</td></tr>";
      return;
    }
    var now = Date.now();
    tbody.innerHTML = rows
      .map(function (x) {
        var urgency = unloadSlaUrgency(x.deadline, now);
        var ibcHtml = x.ibcUrl
          ? "<a class='ibc-link' href='" +
            unloadSlaEscapeHtml(x.ibcUrl) +
            "' target='_blank' rel='noopener noreferrer'>" +
            unloadSlaEscapeHtml(x.ibc) +
            "</a>"
          : unloadSlaEscapeHtml(x.ibc);
        var traceHtml = x.ibcUrl
          ? "<button type='button' class='yna4-gap-auto-btn' data-gap-url='" +
            unloadSlaEscapeHtml(x.ibcUrl) +
            "' title='클릭 시 Gap Trace(API) 실행'>추적</button>"
          : "<span style='color:#94a3b8'>-</span>";
        var remainQtyHtml =
          "<span class='yna4-gap-remain-qty'>" +
          unloadSlaEscapeHtml(String(x.remainQty)) +
          "</span>";
        return (
          "<tr class='yna4-sla-tr " +
          urgency.cls +
          "'>" +
          "<td class='urgency'>" +
          unloadSlaEscapeHtml(urgency.text) +
          "</td>" +
          "<td class='mono'>" +
          ibcHtml +
          "</td>" +
          "<td>" +
          unloadSlaEscapeHtml(x.vendor) +
          "</td>" +
          "<td>" +
          unloadSlaEscapeHtml(unloadSlaFormatWorkerLabel(x.worker)) +
          "</td>" +
          "<td class='mono'>" +
          unloadSlaFmtDT(x.unload) +
          "</td>" +
          "<td class='mono'>" +
          unloadSlaFmtDT(x.deadline) +
          "</td>" +
          "<td class='mono'>" +
          unloadSlaEscapeHtml(String(x.recv)) +
          "</td>" +
          "<td class='mono'>" +
          unloadSlaEscapeHtml(String(x.disp)) +
          "</td>" +
          "<td class='mono'>" +
          unloadSlaEscapeHtml(String(x.errQty)) +
          "</td>" +
          "<td class='mono'>" +
          traceHtml +
          "</td>" +
          "<td class='mono' style='font-weight:800'>" +
          remainQtyHtml +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    unloadSlaRenderKpi(rows, now);
  }

  function unloadSlaTickUrgency() {
    var tbody = document.getElementById(ROOT_ID + "-unload-sla-tbody");
    if (!tbody || !unloadSlaLastRows.length) {
      unloadSlaClearTimer();
      return;
    }
    var now = Date.now();
    var trs = tbody.querySelectorAll("tr.yna4-sla-tr");
    unloadSlaLastRows.forEach(function (x, i) {
      var tr = trs[i];
      if (!tr) return;
      var urgency = unloadSlaUrgency(x.deadline, now);
      tr.className = "yna4-sla-tr " + urgency.cls;
      var cell = tr.querySelector(".urgency");
      if (cell) cell.textContent = urgency.text;
    });
    unloadSlaRenderKpi(unloadSlaLastRows, now);
  }

  function unloadSlaStartTimer() {
    unloadSlaClearTimer();
    if (!unloadSlaLastRows.length) return;
    unloadSlaTickUrgency();
    unloadSlaTimer = setInterval(unloadSlaTickUrgency, 1000);
  }

  function unloadSlaPopulateWorkerFilter() {
    var bar = document.getElementById(ROOT_ID + "-unload-sla-worker-bar");
    var sel = document.getElementById(ROOT_ID + "-unload-sla-worker");
    if (!bar || !sel) return;
    var names = unloadSlaWorkerChoices.slice().sort(function (a, b) {
      return unloadSlaFormatWorkerLabel(a).localeCompare(unloadSlaFormatWorkerLabel(b), "ko");
    });
    var prev = sel.value;
    sel.innerHTML =
      "<option value=''>전체</option>" +
      names
        .map(function (w) {
          return (
            "<option value='" +
            unloadSlaEscapeHtml(w) +
            "'>" +
            unloadSlaEscapeHtml(unloadSlaFormatWorkerLabel(w)) +
            "</option>"
          );
        })
        .join("");
    sel.value = prev && names.indexOf(prev) >= 0 ? prev : "";
    bar.style.display = unloadSlaHasWorkerCol ? "flex" : "none";
  }

  function unloadSlaApplyWorkerFilter() {
    var sel = document.getElementById(ROOT_ID + "-unload-sla-worker");
    if (!sel) return;
    var v = sel.value;
    var filtered =
      v === ""
        ? unloadSlaAllRows.slice()
        : unloadSlaAllRows.filter(function (r) {
            return String(r.worker || "").trim() === v;
          });
    unloadSlaLastRows = filtered;
    unloadSlaClearTimer();
    if (!filtered.length && v) {
      var tbody0 = document.getElementById(ROOT_ID + "-unload-sla-tbody");
      if (tbody0) {
        tbody0.innerHTML =
          "<tr><td colspan='11' style='text-align:center;padding:12px;color:#64748b'>선택한 작업자 미진열 없음</td></tr>";
      }
      unloadSlaRenderKpi([], Date.now());
      return;
    }
    unloadSlaRenderRows(filtered);
    if (unloadSlaModalVisible) unloadSlaStartTimer();
  }

  function unloadSlaRunAnalysisFromText(tsvText, htmlText) {
    var statusEl = document.getElementById(ROOT_ID + "-unload-status");
    unloadSlaEnsureModal();
    unloadSlaRememberLinksFromMergedHtml(htmlText || "");
    var result = unloadSlaProcessText(tsvText || "");
    unloadSlaAllRows = result.pending || [];
    unloadSlaWorkerChoices = result.workerChoices || [];
    unloadSlaHasWorkerCol = !!result.hasWorkerCol;
    unloadSlaLastEmptyBodyHtml = "";
    if (!unloadSlaAllRows.length) {
      var msg = "미진열 없음";
      if (result.parsed === 0 && result.dataLineCount > 0) {
        msg = "데이터는 있으나 파싱 실패";
      } else if (result.parsed > 0) {
        msg = "미진열 없음 - 입고=진열완료+진열오류";
      }
      unloadSlaLastEmptyBodyHtml =
        "<tr><td colspan='11' style='text-align:center;padding:12px;color:#64748b'>" +
        unloadSlaEscapeHtml(msg) +
        "</td></tr>";
    }
    unloadSlaPopulateWorkerFilter();
    unloadSlaApplyWorkerFilter();
    if (statusEl) {
      statusEl.textContent = unloadCopyRunning
        ? statusEl.textContent
        : "통합 결과 완료 · 미진열 " + unloadSlaAllRows.length + "건";
    }
  }

  function getUnloadContextDoc() {
    return document;
  }

  function unload$(sel, root) {
    var r = root;
    if (!r) r = getUnloadContextDoc();
    if (!r || !r.querySelector) return null;
    try {
      return r.querySelector(sel);
    } catch (e) {
      return null;
    }
  }

  function unload$all(sel, root) {
    var r = root;
    if (!r) r = getUnloadContextDoc();
    if (!r || !r.querySelectorAll) return [];
    try {
      return Array.prototype.slice.call(r.querySelectorAll(sel));
    } catch (e2) {
      return [];
    }
  }

  function unloadSleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function unloadSleepInterruptible(ms) {
    var step = 100;
    var left = ms;
    while (left > 0) {
      if (unloadCopyStopRequested) return false;
      await unloadSleep(Math.min(step, left));
      left -= step;
    }
    return true;
  }

  function getUnloadPage() {
    return unload$("#unloadWorkPage");
  }

  function getUnloadTable() {
    var doc = getUnloadContextDoc();
    var path = "";
    try {
      path = doc.location && doc.location.pathname ? doc.location.pathname : "";
    } catch (eP) {
      path = typeof location !== "undefined" ? location.pathname || "" : "";
    }
    var t = unload$('#unloadWorkPage table[is="w-table"]', doc);
    if (t) return t;
    if (/\/unloadWork\//i.test(path)) {
      try {
        return doc.querySelector('table[is="w-table"]');
      } catch (eQ) {
        return null;
      }
    }
    return null;
  }

  function absolutizeLinks(root) {
    unload$all("a[href]", root).forEach(function (a) {
      try {
        a.setAttribute("href", a.href);
      } catch (eAbs) {}
    });
  }

  function buildTableHtml(table, includeHeader) {
    var clone = table.cloneNode(true);
    absolutizeLinks(clone);
    if (!includeHeader) {
      var thead = clone.querySelector("thead");
      if (thead) thead.remove();
    }
    return clone.outerHTML;
  }

  function buildTableText(table, includeHeader) {
    var lines = [];
    if (includeHeader) {
      unload$all("thead tr", table).forEach(function (tr) {
        var cells = unload$all("th,td", tr).map(function (cell) {
          return String(cell.textContent || "")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        });
        if (cells.length) lines.push(cells.join("\t"));
      });
    }
    unload$all("tbody tr", table).forEach(function (tr) {
      var cells = unload$all("th,td", tr).map(function (cell) {
        return String(cell.textContent || "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      });
      if (cells.length) lines.push(cells.join("\t"));
    });
    return lines.join("\n");
  }

  function mergeHtmlTables(tableHtmlList) {
    if (!tableHtmlList.length) return "";
    var parser = new DOMParser();
    var firstDoc = parser.parseFromString(tableHtmlList[0], "text/html");
    var firstTable = firstDoc.querySelector("table");
    if (!firstTable) return "";

    var firstTbody = firstTable.querySelector("tbody");
    if (!firstTbody) return firstTable.outerHTML;

    for (var i = 1; i < tableHtmlList.length; i++) {
      var doc = parser.parseFromString(tableHtmlList[i], "text/html");
      var table = doc.querySelector("table");
      if (!table) continue;
      var rows = table.querySelectorAll("tbody tr");
      for (var r = 0; r < rows.length; r++) {
        firstTbody.appendChild(rows[r].cloneNode(true));
      }
    }

    return firstTable.outerHTML;
  }

  /** Gap Trace 스타일: inbound 하차 목록 HTTP 수집 */
  var UNLOAD_LIST_URL = "https://inbound.coupang.com/unloadWork/list";
  var UNLOAD_REFERER = UNLOAD_LIST_URL;
  var UNLOAD_REQ_TIMEOUT_MS = 45000;
  var UNLOAD_PAGE_CAP = 80;

  /** 실패 알림에 표시되는 짧은 시도 로그 */
  var unloadLastHttpProbeLines = [];

  /** boot HTML 문자열 안의 CSRF 패턴(Inbound 페이지 JS/JSON)·HttpOnly 쿠키 대비 */
  var unloadXsrfOverrideFromBoot = "";

  function unloadXsrfFromHtmlBootSnippet(html) {
    if (!html || typeof html !== "string" || html.length < 80) return "";
    var pats = [
      /csrfToken["']\s*[:=]\s*["']([^'"]+)/i,
      /"csrf"\s*:\s*"([^"]+)/i,
      /X-XSRF-TOKEN["']\s*,\s*["']([^'"]+)/i,
      /_csrf["']\s*[:=]\s*["']([A-Za-z0-9/+._=-]{16,})["']/i,
    ];
    var i;
    for (i = 0; i < pats.length; i++) {
      var x = html.match(pats[i]);
      if (x && x[1] && String(x[1]).length >= 16) return String(x[1]).trim();
    }
    return "";
  }

  /** Spring 등: XSRF-TOKEN 쿠키 값을 X-XSRF-TOKEN 헤더로 (POST 405 환경은 GET 검색이라도 헤더 필요할 수 있음) */
  function unloadXsrfFromDocumentCookie() {
    try {
      var c =
        typeof document !== "undefined" ? String(document.cookie || "") : "";
      if (!c) return "";
      var names = ["XSRF-TOKEN", "xsrf-token", "Xsrf-Token"];
      var i;
      for (i = 0; i < names.length; i++) {
        var nm = names[i];
        var re = new RegExp(
          "(?:^|;\\s*)" + nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"
        );
        var m = c.match(re);
        if (m && m[1]) {
          return decodeURIComponent(String(m[1]).replace(/\+/g, " "))
            .replace(/^"|"$/g, "")
            .trim();
        }
      }
      var m2 = c.match(/(?:^|;\s*)csrf(?:token)?=([^;]+)/i);
      if (m2 && m2[1]) return decodeURIComponent(m2[1].trim()).replace(/^"|"$/g, "");
    } catch (eX) {}
    return "";
  }

  function unloadJoinUrlQuery(pathOrUrl, queryString) {
    var path = pathOrUrl;
    var q = String(queryString || "").replace(/^[?&]+/, "");
    if (!q) return path;
    return path.indexOf("?") >= 0 ? path + "&" + q : path + "?" + q;
  }

  /** API 가 JSON 으로 fragment 를 줄 때 HTML 로 올림 */
  function unloadCoerceFetchedBodyToHtmlString(raw) {
    if (raw == null) return "";
    var s = String(raw);
    var t = s.trim();
    if (!t.length) return "";
    var c0 = t.charAt(0);
    if (c0 !== "{" && c0 !== "[") return s;
    var j;
    try {
      j = JSON.parse(t);
    } catch (eJ) {
      return s;
    }
    function fromObj(obj, depth) {
      if (!obj || typeof obj !== "object" || depth > 6) return "";
      var keys = [
        "html",
        "htmlFragment",
        "fragment",
        "content",
        "body",
        "markup",
        "pageHtml",
        "renderedHtml",
        "unloadWorkPage",
      ];
      var i;
      for (i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = obj[k];
        if (typeof v === "string" && v.length > 600 && /<[a-z][\s\S]*>/i.test(v)) {
          return v;
        }
      }
      if (typeof obj.data === "string" && obj.data.length > 600) return obj.data;
      if (obj.data && typeof obj.data === "object") {
        var inner = fromObj(obj.data, depth + 1);
        if (inner) return inner;
      }
      if (obj.result && typeof obj.result === "object") {
        inner = fromObj(obj.result, depth + 1);
        if (inner) return inner;
      }
      if (obj.payload && typeof obj.payload === "object") {
        inner = fromObj(obj.payload, depth + 1);
        if (inner) return inner;
      }
      var model = obj.model;
      if (model && typeof model === "object") {
        inner = fromObj(model, depth + 1);
        if (inner) return inner;
      }
      return "";
    }
    if (typeof j === "string" && j.length > 600) return j;
    var ext = Array.isArray(j) ? "" : fromObj(j, 0);
    return ext || s;
  }

  /** 부트스트랩 번들에서 검색 가능한 inbound 경로만 추림 */
  function unloadMineInboundPathCandidates(html, maxN) {
    var out = [];
    var seen = Object.create(null);
    if (!html || html.length < 800) return out;
    var max = typeof maxN === "number" ? maxN : 24;
    var res = [
      /["'](\/unloadWork\/[^"'\\\s]{3,220})["']/gi,
      /["'](\/api\/[^\s"'\\]{0,80}unload[^\s"'\\]{0,120})["']/gi,
      /["'](\/wms\/[^"'\\\s]{3,200})["']/gi,
    ];
    var ri;
    for (ri = 0; ri < res.length; ri++) {
      var re = res[ri];
      var m;
      while ((m = re.exec(html)) !== null && out.length < max) {
        var p = m[1]
          .replace(/\\u002f/gi, "/")
          .replace(/\\\//g, "/");
        if (/\.(js|mjs|css|map|png|jpe?g|gif|svg|ico|woff2?)(\?|$)/i.test(p)) continue;
        if (seen[p]) continue;
        seen[p] = true;
        out.push(p);
      }
    }
    return out;
  }

  function unloadStandardSearchQuery(ymd, csrfToken) {
    var enc = encodeURIComponent(ymd);
    return unloadAppendCsrfToQueryString(
      "searched=true&startDate=" +
        enc +
        "&endDate=" +
        enc +
        "&dateRangeType=UNLOAD_DATE",
      csrfToken
    );
  }

  /** 고정 후보 경로(html+json) + 번들 채굴 경로(html+json) 시도 */
  function unloadBuildAltPathAndMinedSpecs(ymd, bootHtml, csrfToken) {
    var specs = [];
    var hdrJson = {
      Accept: "application/json, text/plain;q=0.96, text/html;q=0.85, */*;q=0.5",
    };
    function pushGet(url, tag) {
      specs.push({ kind: "get", tag: tag, url: url });
    }
    function pushGetJson(url, tag) {
      specs.push({
        kind: "get",
        tag: tag,
        url: url,
        acceptHdr: hdrJson,
      });
    }

    var stdQ = unloadStandardSearchQuery(ymd, csrfToken);
    var altBases = [
      "https://inbound.coupang.com/unloadWork/search",
      "https://inbound.coupang.com/unloadWork/list/search",
      "https://inbound.coupang.com/unloadWork/listData",
      "https://inbound.coupang.com/unloadWork/list.json",
      "https://inbound.coupang.com/api/wms/unloadWork/list",
      "https://inbound.coupang.com/wms/api/unloadWork/list",
      "https://inbound.coupang.com/wms/unloadWork/list",
    ];
    var i;
    for (i = 0; i < altBases.length; i++) {
      var bu = altBases[i];
      if (bu === UNLOAD_LIST_URL) continue;
      pushGet(unloadJoinUrlQuery(bu, stdQ), "alt-html-" + i);
      pushGetJson(unloadJoinUrlQuery(bu, stdQ), "alt-json-" + i);
    }

    var mined = unloadMineInboundPathCandidates(bootHtml || "", 18);
    for (i = 0; i < mined.length; i++) {
      var abs =
        mined[i].indexOf("http") === 0
          ? mined[i].split("#")[0]
          : "https://inbound.coupang.com" + mined[i];
      if (abs.replace(/[?#].*$/, "") === UNLOAD_LIST_URL) continue;
      pushGet(unloadJoinUrlQuery(abs, stdQ), "mine-h-" + i);
      pushGetJson(unloadJoinUrlQuery(abs, stdQ), "mine-j-" + i);
    }
    return specs;
  }

  function unloadReqHeaders() {
    var xsrf =
      unloadXsrfFromDocumentCookie() ||
      String(unloadXsrfOverrideFromBoot || "").trim();
    var h = {
      Referer: UNLOAD_REFERER,
      Origin: "https://inbound.coupang.com",
      "X-Requested-With": "XMLHttpRequest",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    };
    if (xsrf) h["X-XSRF-TOKEN"] = xsrf;
    return h;
  }

  function gmGet(url, extraHeaders) {
    var h = Object.assign(
      { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      extraHeaders || {}
    );
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        headers: h,
        anonymous: false,
        timeout: UNLOAD_REQ_TIMEOUT_MS,
        onload: function (r) {
          if (r.status >= 200 && r.status < 400) resolve(r.responseText);
          else reject(new Error("HTTP " + r.status + " " + url));
        },
        onerror: function () {
          reject(new Error("요청 실패 " + url));
        },
        ontimeout: function () {
          reject(new Error("타임아웃(GET " + UNLOAD_REQ_TIMEOUT_MS + "ms) " + url));
        },
      });
    });
  }

  function unloadPickTableFromDoc(doc) {
    if (!doc) return null;
    var t = doc.querySelector('#unloadWorkPage table[is="w-table"]');
    if (t) return t;
    t = doc.querySelector('table[is="w-table"]');
    if (t) return t;
    return doc.querySelector("table");
  }

  function unloadTableBodyRowCount(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var table = unloadPickTableFromDoc(doc);
    if (!table) return 0;
    return table.querySelectorAll("tbody tr").length;
  }

  function unloadFirstRowSig(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var table = unloadPickTableFromDoc(doc);
    if (!table) return "";
    var tr = table.querySelector("tbody tr");
    if (!tr) return "";
    return String(tr.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  }

  function unloadParseMaxPageFromHtml(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var pages = [];
    var nodes = doc.querySelectorAll("w-page-item[data-go-page]");
    for (var i = 0; i < nodes.length; i++) {
      var v = parseInt(nodes[i].getAttribute("data-go-page") || "", 10);
      if (isFinite(v) && v >= 1 && v <= UNLOAD_PAGE_CAP) pages.push(v);
    }
    if (!pages.length) {
      nodes = doc.querySelectorAll("w-page-item[data-page]");
      for (var j = 0; j < nodes.length; j++) {
        v = parseInt(nodes[j].getAttribute("data-page") || "", 10);
        if (isFinite(v) && v >= 1 && v <= UNLOAD_PAGE_CAP) pages.push(v);
      }
    }
    if (!pages.length && typeof html === "string") {
      var blockMatch = html.match(/<w-page-item-group\b[\s\S]*?<\/w-page-item-group>/i);
      var scan = blockMatch ? blockMatch[0] : "";
      var re = /data-go-page\s*=\s*"(\d+)"/gi;
      var m;
      while ((m = re.exec(scan)) !== null) {
        v = parseInt(m[1], 10);
        if (isFinite(v) && v >= 1 && v <= UNLOAD_PAGE_CAP) pages.push(v);
      }
    }
    if (!pages.length) return 1;
    return Math.max.apply(null, pages);
  }

  /** 테이블이 "조건 입력 후 조회" 상태(실제 검색 결과 아님)인지 — 예전 검증은 tbody tr≥1 만 봐서 통과했음 */
  function unloadTableShowsPreSearchPlaceholder(table) {
    if (!table) return true;
    var tb = table.querySelector("tbody");
    var probe = tb ? tb : table;
    var compact = String(probe.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (/조건 입력 후\s*조회\s*버튼을\s*눌러주세요/.test(compact)) return true;
    if (/조건 입력 후\s*조회/.test(compact)) {
      var trs = table.querySelectorAll("tbody tr");
      if (trs.length <= 1) return true;
    }
    return false;
  }

  function unloadBriefInvalidReason(html) {
    if (!html || String(html).length < 120) return "len=" + String(html && html.length);
    var low = html.slice(0, 80000).replace(/\s+/g, " ");
    if (/로그인|login\b|sso|Sign in/i.test(low) && /password|패스워드/i.test(low)) {
      return "login-ish";
    }
    var doc = new DOMParser().parseFromString(html, "text/html");
    var tbl = unloadPickTableFromDoc(doc);
    if (!tbl) return "no-table";
    if (unloadTableShowsPreSearchPlaceholder(tbl)) return "placeholder";
    var nr = tbl.querySelectorAll("tbody tr").length;
    if (nr > 0) return "unexpected-rows-" + nr;
    return "tbody0-has-thead?" + !!tbl.querySelector("thead");
  }

  function unloadExtractCsrfFromHtml(html) {
    if (!html) return "";
    var doc = new DOMParser().parseFromString(html, "text/html");
    var cand =
      doc.querySelector('input[name="_csrf"]') ||
      doc.querySelector('input[name="csrfToken"]') ||
      doc.querySelector('meta[name="_csrf"]');
    if (cand) {
      return String(
        cand.value != null ? cand.value : cand.getAttribute("content") || ""
      ).trim();
    }
    var m = html.match(
      /name=["']_csrf["']\s+(?:[^>]*?value=["']([^"']*)["']|value=["']([^"']*)["'])/i
    );
    if (m) return String(m[1] || m[2] || "").trim();
    m =
      typeof html === "string" &&
      html.match(/_csrf['"]\s*:\s*['"]([^'"]+)/i);
    if (m) return String(m[1] || "").trim();
    m =
      typeof html === "string" &&
      html.match(/\bcsrf["']?\s*content=["']([^'"]+)/i);
    if (m) return String(m[1] || "").trim();
    return "";
  }

  /** startDate/endDate·searched 표준화(대소문자 중복 파라미터 방지) */
  function unloadApplyStandardSearchParams(p, ymd) {
    ["startDate", "startdate", "endDate", "enddate", "searched"].forEach(
      function (k) {
        try {
          p.delete(k);
        } catch (eD) {}
      }
    );
    p.set("startDate", ymd);
    p.set("endDate", ymd);
    p.set("searched", "true");
    if (!String(p.get("dateRangeType") || "").trim()) {
      try {
        p.set("dateRangeType", "UNLOAD_DATE");
      } catch (eR) {}
    }
  }

  /** 히든만 선별 병합(전역 document.body 전체 금지) */
  function unloadMergeMinimalHiddenGlobals(doc, params) {
    if (!doc || !params) return;
    var nodes = [];
    try {
      nodes = doc.querySelectorAll("input[type='hidden'][name]");
    } catch (eN) {
      return;
    }
    var i;
    var namesUsed = {};
    try {
      params.forEach(function (_v, key) {
        namesUsed[key] = true;
      });
    } catch (eKu) {}

    var wantRe = /^_csrf|^csrf|[Dd]ate|[Rr]ange|[Ss]earch|[Pp]urchase|[Oo]rder/i;
    for (i = 0; i < nodes.length; i++) {
      var inp = nodes[i];
      var nm = inp.getAttribute("name");
      if (!nm || namesUsed[nm]) continue;
      if (/^csrf|^x-|^org\./i.test(nm) || wantRe.test(nm)) {
        try {
          var v =
            inp.value != null ? String(inp.value) : "";
          params.set(nm, v);
        } catch (eS) {}
      }
    }
  }

  /** GET list HTML 에서 검색 폼(+히든)·CSRF 를 수집한 뒤 오늘·searched 반영 (shadow 밖 light DOM 위주) */
  function unloadCollectSearchFormAsUrlEncoded(html, ymd) {
    if (!html) return "";
    var doc = new DOMParser().parseFromString(html, "text/html");
    var scope =
      doc.getElementById("unloadWorkSearchFormLayout") ||
      doc.getElementById("unloadWorkPage") ||
      doc.querySelector("form") ||
      doc.body;
    if (!scope) return "";

    function mergeFieldsInto(root, p) {
      if (!root || !p) return;
      var els = root.querySelectorAll(
        "input[name], select[name], textarea[name]"
      );
      var i;
      for (i = 0; i < els.length; i++) {
        var inp = els[i];
        var nm = inp.getAttribute("name");
        if (!nm) continue;
        var ty = String(inp.type || "text").toLowerCase();
        if (ty === "button" || ty === "submit") continue;
        if (ty === "checkbox" && !inp.checked) continue;
        if (ty === "radio" && !inp.checked) continue;
        var v =
          inp.value != null && inp.value !== undefined
            ? String(inp.value)
            : "";
        var nml = nm.toLowerCase();
        if (nml === "startdate") v = ymd;
        else if (nml === "enddate") v = ymd;
        try {
          p.set(nm, v);
        } catch (eSe) {}
      }
    }

    var p = new URLSearchParams();
    mergeFieldsInto(scope, p);
    if (p.toString().length < 24) {
      var wpOnly = doc.getElementById("unloadWorkPage");
      if (wpOnly && wpOnly !== scope) mergeFieldsInto(wpOnly, p);
    }
    if (p.toString().length < 12) {
      unloadMergeMinimalHiddenGlobals(doc, p);
    }
    unloadApplyStandardSearchParams(p, ymd);
    var s = p.toString();
    return s.length > 8 ? s : "";
  }

  function unloadResponseLooksValid(html) {
    if (!html || String(html).length < 200) return false;
    var doc = new DOMParser().parseFromString(html, "text/html");
    var tbl = unloadPickTableFromDoc(doc);
    if (!tbl) return false;
    if (unloadTableShowsPreSearchPlaceholder(tbl)) return false;
    var rows = tbl.querySelectorAll("tbody tr");
    if (rows.length > 0) return true;
    var full = String(tbl.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    if (/조건 입력 후\s*조회/.test(full)) return false;
    return !!tbl.querySelector("thead th, thead td");
  }

  function unloadAppendCsrfToQueryString(queryStr, csrfToken) {
    var q = String(queryStr || "");
    if (
      !csrfToken ||
      /(^|[&])_csrf=/.test(q) ||
      /(^|[&])csrf=/.test(q)
    )
      return q;
    return (
      q + (q.length ? "&" : "") + "_csrf=" + encodeURIComponent(csrfToken)
    );
  }

  /** /unloadWork/list GET 변형 폴백(alt·mine 이후 순서대로 실행) */
  function unloadBuildFirstPageSpecs(ymd, bootHtml, csrfToken) {
    var enc = encodeURIComponent(ymd);
    var u = UNLOAD_LIST_URL;
    var specs = [];
    function get(urlWithQueryMaybe, tag) {
      specs.push({ kind: "get", tag: tag, url: urlWithQueryMaybe });
    }
    function getQ(queryParams, tag) {
      var q = unloadAppendCsrfToQueryString(queryParams, csrfToken);
      get(unloadJoinUrlQuery(u, q), tag);
    }

    var fromForm = unloadCollectSearchFormAsUrlEncoded(bootHtml || "", ymd);
    if (fromForm) {
      get(
        unloadJoinUrlQuery(
          u,
          unloadAppendCsrfToQueryString(fromForm, csrfToken)
        ),
        "get-form-merge"
      );
    }

    getQ(
      "searched=true&startDate=" +
        enc +
        "&endDate=" +
        enc +
        "&dateRangeType=UNLOAD_DATE",
      "get-se-un-date"
    );
    getQ(
      "startDate=" +
        enc +
        "&endDate=" +
        enc +
        "&searched=true&dateRangeType=UNLOAD_DATE",
      "get-dates-first"
    );
    getQ(
      "searched=true&startDate=" +
        enc +
        "&endDate=" +
        enc +
        "&dateRangeType=UNLOAD_DATE&size=50&page=0",
      "get-size50-page0"
    );
    getQ(
      "searched=true&startDate=" +
        enc +
        "&endDate=" +
        enc +
        "&size=50&page=0&dateRangeType=UNLOAD_DATE",
      "get-reordered-keys"
    );
    getQ(
      "searched=true&page=0&startDate=" +
        enc +
        "&endDate=" +
        enc +
        "&dateRangeType=UNLOAD_DATE",
      "get-page0"
    );

    getQ(
      "searched=true&startDate=" +
        enc +
        "&endDate=" +
        enc,
      "get-no-range-type"
    );

    return specs;
  }

  function unloadDiagPush(line) {
    try {
      if (unloadLastHttpProbeLines.length > 88) unloadLastHttpProbeLines.shift();
      unloadLastHttpProbeLines.push(String(line || ""));
    } catch (eP) {}
  }

  function unloadFormatProbeForAlert(maxLen) {
    var lim = typeof maxLen === "number" ? maxLen : 1400;
    var s = unloadLastHttpProbeLines.join("\n");
    if (s.length <= lim) return s;
    return "…중략…\n" + s.slice(s.length - lim);
  }

  async function unloadHttpTryFirstPage(ymd) {
    unloadLastHttpProbeLines = [];
    unloadXsrfOverrideFromBoot = "";
    var hdr;
    var bootHtml = "";
    try {
      setUnloadStatus("HTTP: 초기 페이지 GET(폼·CSRF)…");
      bootHtml = await gmGet(UNLOAD_LIST_URL, unloadReqHeaders());
      unloadDiagPush("boot GET ok len=" + (bootHtml && bootHtml.length));
    } catch (eBoot) {
      bootHtml = "";
      unloadDiagPush(
        "boot GET 실패 — " +
          (eBoot && eBoot.message ? eBoot.message : eBoot)
      );
    }

    var csrf = unloadExtractCsrfFromHtml(bootHtml);
    unloadXsrfOverrideFromBoot = unloadXsrfFromHtmlBootSnippet(bootHtml);
    hdr = unloadReqHeaders();

    var xsrfCookie = unloadXsrfFromDocumentCookie();
    unloadDiagPush(
      "csrf=" +
        (csrf ? String(csrf.length) : "−") +
        " xsrf=" +
        (xsrfCookie
          ? "cookie"
          : unloadXsrfOverrideFromBoot
            ? "boot"
            : "−") +
        " · 검색 요청 전부 GET(POST list=405)·alt·mined 우선"
    );

    var specs = unloadBuildAltPathAndMinedSpecs(ymd, bootHtml, csrf).concat(
      unloadBuildFirstPageSpecs(ymd, bootHtml, csrf)
    );

    setUnloadStatus("HTTP: 하차 목록 검색 요청 시도 중…");
    for (var i = 0; i < specs.length; i++) {
      var s = specs[i];
      try {
        var mergeHdr =
          s.acceptHdr && typeof s.acceptHdr === "object"
            ? Object.assign({}, hdr, s.acceptHdr)
            : hdr;
        var raw = await gmGet(s.url, mergeHdr);
        var html = unloadCoerceFetchedBodyToHtmlString(raw);
        if (!unloadResponseLooksValid(html)) {
          unloadDiagPush(
            s.tag +
              " 무효 — " +
              unloadBriefInvalidReason(html) +
              " (rawLen=" +
              (raw ? String(raw).length : 0) +
              " htmlLen=" +
              (html ? String(html).length : 0) +
              ")"
          );
          continue;
        }
        var basePostBody = "";
        var listBaseNorm = UNLOAD_LIST_URL;
        try {
          var uSucc = new URL(s.url);
          basePostBody = new URLSearchParams(uSucc.search).toString();
          listBaseNorm = uSucc.origin + uSucc.pathname;
        } catch (eU2) {}

        unloadDiagPush("성공 태그: " + s.tag);
        return {
          html: html,
          basePostBody: basePostBody,
          listUrl: listBaseNorm,
          tag: s.tag,
        };
      } catch (e) {
        unloadDiagPush(
          s.tag + " 예외 — " + (e && e.message ? e.message : String(e))
        );
      }
    }
    return null;
  }

  async function unloadHttpFetchPageHtml(uiPg, basePostBody, listUrl, sigFirst) {
    var hdr = unloadReqHeaders();
    var zeroBased = uiPg - 1;
    var baseUrl = String(listUrl || "").replace(/\?[\s\S]*$/, "") || UNLOAD_LIST_URL;

    function pageAttempt(mutator) {
      return async function () {
        var params =
          basePostBody && basePostBody.length
            ? new URLSearchParams(basePostBody)
            : new URLSearchParams();
        mutator(params);
        return unloadCoerceFetchedBodyToHtmlString(
          await gmGet(unloadJoinUrlQuery(baseUrl, params.toString()), hdr)
        );
      };
    }

    var attempts = [
      pageAttempt(function (params) {
        params.set("page", String(zeroBased));
      }),
      pageAttempt(function (params) {
        params.set("page", String(uiPg));
      }),
      pageAttempt(function (params) {
        params.delete("page");
        params.set("page", String(zeroBased));
      }),
      pageAttempt(function (params) {
        params.delete("page");
        params.delete("pageNumber");
        params.set("pageNumber", String(uiPg));
      }),
    ];

    var ai;
    for (ai = 0; ai < attempts.length; ai++) {
      try {
        var html = await attempts[ai]();
        if (!unloadResponseLooksValid(html)) continue;
        var sig = unloadFirstRowSig(html);
        var dup =
          sigFirst &&
          sig === sigFirst &&
          unloadTableBodyRowCount(html) > 0;
        if (!dup) return html;
      } catch (eA) {}
    }
    try {
      var px = new URLSearchParams(basePostBody || "");
      px.set("page", String(zeroBased));
      var raw2 = await gmGet(unloadJoinUrlQuery(baseUrl, px.toString()), hdr);
      var html2 = unloadCoerceFetchedBodyToHtmlString(raw2);
      return unloadResponseLooksValid(html2) ? html2 : null;
    } catch (eF) {
      return null;
    }
  }

  function unloadTableFromHtmlString(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    return unloadPickTableFromDoc(doc);
  }

  async function unloadWriteClipboard(html, text) {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    }

    if (typeof GM_setClipboard === "function") {
      try {
        GM_setClipboard(html, { type: "text/html", mimetype: "text/html" });
        return;
      } catch (eGm) {}
    }

    var listener = function (e) {
      e.preventDefault();
      e.clipboardData.setData("text/html", html);
      e.clipboardData.setData("text/plain", text);
    };
    document.addEventListener("copy", listener, { once: true });
    document.execCommand("copy");
  }

  function setUnloadStatus(msg) {
    var el = document.getElementById(ROOT_ID + "-unload-status");
    if (el) el.textContent = msg;
  }

  function setProgressByStatusId(statusId, percent) {
    var p = Number(percent);
    if (!isFinite(p)) p = 0;
    if (p < 0) p = 0;
    if (p > 100) p = 100;
    var st = document.getElementById(statusId);
    if (!st) return;
    st.style.setProperty("--yna4-progress", p.toFixed(1) + "%");
    st.setAttribute("data-progress", String(Math.round(p)));
    if (p >= 55) st.classList.add("is-progress-heavy");
    else st.classList.remove("is-progress-heavy");
  }

  /** 스크린샷/알림 복사 곤란할 때 패널에서 쓸 전체 진단 문자열 */
  var unloadDiagnosticsFullText = "";

  function unloadBuildDiagnosticsFullText(extraProbeSnippet) {
    var probeLines = unloadLastHttpProbeLines.length
      ? unloadLastHttpProbeLines.join("\n")
      : String(extraProbeSnippet || "");
    return (
      "[YAN4 Unified UI — 하차 HTTP 진단]\n" +
      "time(ISO): " +
      new Date().toISOString() +
      "\n" +
      "url: " +
      String(typeof location !== "undefined" ? location.href : "") +
      "\n" +
      "host: " +
      String(typeof location !== "undefined" ? location.hostname : "") +
      "\n" +
      "userAgent:\n" +
      String(navigator.userAgent || "") +
      "\n---\n" +
      (probeLines || "(진단 줄 없음)") +
      "\n--- end ---\n"
    );
  }

  function unloadRevealDiagnosticsPanel(textPayload) {
    unloadDiagnosticsFullText = String(textPayload || "");
    var wrap = document.getElementById(ROOT_ID + "-unload-diag-wrap");
    var ta = document.getElementById(ROOT_ID + "-unload-diag-text");
    if (!String(unloadDiagnosticsFullText).trim()) {
      if (ta) ta.value = "";
      if (wrap) wrap.style.display = "none";
      return;
    }
    if (ta) {
      ta.value = unloadDiagnosticsFullText;
      try {
        ta.style.display = "block";
      } catch (eT) {}
    }
    if (wrap) wrap.style.display = "block";
  }

  /** GM_setClipboard 를 우선(탭별 클립보드 제한 회피) */
  function unloadCopyPlainViaBestEffort(fullText, onDone) {
    var t = String(fullText || "");
    var cb =
      typeof onDone === "function"
        ? onDone
        : function () {};
    Promise.resolve()
      .then(function () {
        if (typeof GM_setClipboard === "function") {
          try {
            GM_setClipboard(t, "text/plain");
            return "gm";
          } catch (eGm) {}
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(t).then(function () {
            return "api";
          });
        }
        return null;
      })
      .then(function (via) {
        if (via) {
          cb(via);
          return;
        }
        try {
          var taBox = document.createElement("textarea");
          taBox.value = t;
          taBox.style.cssText =
            "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;";
          document.body.appendChild(taBox);
          taBox.focus();
          taBox.select();
          var execOk = document.execCommand("copy");
          taBox.remove();
          cb(execOk ? "exec" : "fail");
        } catch (eEx) {
          cb("fail");
        }
      })
      .catch(function () {
        cb("fail");
      });
  }

  function unloadTodayYmd() {
    var d = new Date();
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function unloadYesterdayYmd() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function unloadYmdFromDate(d) {
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return (
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
    );
  }

  /** UI 라디오(없거나 오류 시 오늘) */
  function unloadSelectedSearchYmd() {
    try {
      var name = ROOT_ID + "-unload-date-scope";
      var radios = document.getElementsByName(name);
      var i;
      for (i = 0; i < radios.length; i++) {
        if (radios[i].checked && radios[i].value === "yesterday") {
          return unloadYesterdayYmd();
        }
      }
    } catch (eR) {}
    return unloadTodayYmd();
  }

  function unloadDateChoiceLabelSummary() {
    try {
      var name = ROOT_ID + "-unload-date-scope";
      var radios = document.getElementsByName(name);
      var i;
      for (i = 0; i < radios.length; i++) {
        if (radios[i].checked && radios[i].value === "yesterday") {
          return "어제";
        }
      }
    } catch (eL) {}
    return "오늘";
  }

  function unloadRequestStopCopyAll() {
    if (unloadCopyRunning) unloadCopyStopRequested = true;
  }

  async function unloadCopyAllPages() {
    if (unloadCopyRunning) return;

    if (typeof GM_xmlhttpRequest !== "function") {
      alert(
        "「전체 복사」에는 Tampermonkey의 GM_xmlhttpRequest 가 필요합니다.\n\n" +
          "스크립트 헤더에 // @grant GM_xmlhttpRequest 가 있는지 확인하세요."
      );
      return;
    }

    unloadCopyRunning = true;
    unloadCopyStopRequested = false;
    setProgressByStatusId(ROOT_ID + "-unload-status", 0);

    unloadDiagnosticsFullText = "";
    unloadRevealDiagnosticsPanel("");

    try {
      var ymd = unloadSelectedSearchYmd();
      var dayWord = unloadDateChoiceLabelSummary();
      setUnloadStatus("HTTP: 하차 목록(" + dayWord + " " + ymd + ") 조회…");

      var first = await unloadHttpTryFirstPage(ymd);
      if (!first || !first.html) {
        unloadRevealDiagnosticsPanel(
          unloadBuildDiagnosticsFullText(unloadFormatProbeForAlert(8888))
        );
        alert(
          "하차 목록을 가져오지 못했습니다.\n\n" +
            "통합 패널 아래쪽「HTTP 진단」칸 내용 전체 또는\n「진단 텍스트 복사」버튼을 눌러 메모장/채팅에 붙여 넣어 주세요."
        );
        setUnloadStatus(
          "실패 · 아래 진단 영역 또는 「진단 텍스트 복사」로 내용 저장"
        );
        return;
      }

      var firstTable = unloadTableFromHtmlString(first.html);
      if (!firstTable) {
        alert("응답에서 직납하차내역 표(table)를 찾지 못했습니다.");
        return;
      }

      var lastPage = unloadParseMaxPageFromHtml(first.html);
      lastPage = Math.min(Math.max(1, lastPage), UNLOAD_PAGE_CAP);
      var sigFirst = unloadFirstRowSig(first.html);

      var htmlParts = [];
      var textParts = [];
      htmlParts.push(buildTableHtml(firstTable, true));
      textParts.push(buildTableText(firstTable, true));

      setUnloadStatus("1/" + lastPage + " · 수집…");
      setProgressByStatusId(ROOT_ID + "-unload-status", (1 / Math.max(1, lastPage)) * 100);

      var stopped = false;
      var page;
      for (page = 2; page <= lastPage; page++) {
        if (unloadCopyStopRequested) {
          stopped = true;
          break;
        }

        setUnloadStatus(page + "/" + lastPage + " …");

        var slept = await unloadSleepInterruptible(350);
        if (!slept || unloadCopyStopRequested) {
          stopped = true;
          break;
        }

        var pageHtml = await unloadHttpFetchPageHtml(
          page,
          first.basePostBody,
          first.listUrl,
          sigFirst
        );
        if (!pageHtml) {
          alert(page + "페이지 HTTP 응답을 받지 못했습니다.");
          return;
        }

        var currentTable = unloadTableFromHtmlString(pageHtml);
        if (!currentTable) {
          alert(page + "페이지 표를 파싱하지 못했습니다.");
          return;
        }

        htmlParts.push(buildTableHtml(currentTable, false));
        textParts.push(buildTableText(currentTable, false));
        setProgressByStatusId(
          ROOT_ID + "-unload-status",
          (page / Math.max(1, lastPage)) * 100
        );
      }

      if (stopped) {
        if (htmlParts.length) {
          try {
            await unloadWriteClipboard(mergeHtmlTables(htmlParts), textParts.join("\n"));
            setUnloadStatus("중지 · " + htmlParts.length + "p 복사됨");
          } catch (eSt) {
            setUnloadStatus("중지(복사실패)");
          }
        } else {
          setUnloadStatus("중지됨");
        }
        return;
      }

      var mergedHtml = mergeHtmlTables(htmlParts);
      var mergedText = textParts.join("\n");
      await unloadWriteClipboard(mergedHtml, mergedText);
      unloadLastMergedHtml = String(mergedHtml || "");
      unloadLastMergedText = String(mergedText || "");
      try {
        unloadSlaRunAnalysisFromText(unloadLastMergedText, unloadLastMergedHtml);
      } catch (eSlaAuto) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 unload SLA] auto analyze failed", eSlaAuto);
        }
      }
      setUnloadStatus("완료 " + lastPage + "p · 복사됨");
      setProgressByStatusId(ROOT_ID + "-unload-status", 100);
      unloadDiagnosticsFullText = "";
      try {
        var wOk = document.getElementById(ROOT_ID + "-unload-diag-wrap");
        var tOk = document.getElementById(ROOT_ID + "-unload-diag-text");
        if (tOk) tOk.value = "";
        if (wOk) wOk.style.display = "none";
      } catch (eOk) {}
    } catch (e) {
      var errMsg =
        "[YAN4 하차 예외]\n" +
        (e && e.message ? e.message : String(e)) +
        "\n" +
        unloadBuildDiagnosticsFullText("");
      unloadRevealDiagnosticsPanel(errMsg);
      alert(
        "전체 복사 중 오류입니다.\n「진단 텍스트 복사」로 아래 블록을 저장해 알려 주세요."
      );
    } finally {
      unloadCopyRunning = false;
      unloadCopyStopRequested = false;
      if (typeof shellUnloadRefreshHint === "function") shellUnloadRefreshHint();
    }
  }

  function initUnloadCopierPane(hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.className = "yna4-pane-mod";

    var unloadDateScopeName = ROOT_ID + "-unload-date-scope";
    var dateRow = document.createElement("div");
    dateRow.className = "yna4-pane-row yna4-pane-row--unload-date";
    var radToday = document.createElement("input");
    radToday.type = "radio";
    radToday.name = unloadDateScopeName;
    radToday.value = "today";
    radToday.id = ROOT_ID + "-unload-date-today";
    radToday.checked = true;
    var radYesterday = document.createElement("input");
    radYesterday.type = "radio";
    radYesterday.name = unloadDateScopeName;
    radYesterday.value = "yesterday";
    radYesterday.id = ROOT_ID + "-unload-date-yesterday";

    radToday.style.display = "none";
    radYesterday.style.display = "none";

    var btnToday = document.createElement("button");
    btnToday.type = "button";
    btnToday.textContent = "오늘";
    btnToday.className = "yna4-pane-btn yna4-pane-btn--compact yna4-pane-toggle";
    btnToday.setAttribute("aria-pressed", "true");

    var btnYesterday = document.createElement("button");
    btnYesterday.type = "button";
    btnYesterday.textContent = "어제";
    btnYesterday.className = "yna4-pane-btn yna4-pane-btn--compact yna4-pane-toggle";
    btnYesterday.setAttribute("aria-pressed", "false");

    function refreshUnloadDateToggleUi() {
      var todayOn = !!radToday.checked;
      btnToday.classList.toggle("is-active", todayOn);
      btnYesterday.classList.toggle("is-active", !todayOn);
      btnToday.setAttribute("aria-pressed", todayOn ? "true" : "false");
      btnYesterday.setAttribute("aria-pressed", todayOn ? "false" : "true");
    }

    btnToday.addEventListener("click", function () {
      if (btnToday.disabled) return;
      radToday.checked = true;
      radYesterday.checked = false;
      refreshUnloadDateToggleUi();
    });
    btnYesterday.addEventListener("click", function () {
      if (btnYesterday.disabled) return;
      radToday.checked = false;
      radYesterday.checked = true;
      refreshUnloadDateToggleUi();
    });

    dateRow.appendChild(radToday);
    dateRow.appendChild(radYesterday);
    dateRow.appendChild(btnToday);
    dateRow.appendChild(btnYesterday);
    refreshUnloadDateToggleUi();

    var btnRow = document.createElement("div");
    btnRow.className = "yna4-pane-actions yna4-pane-actions--unload-main";

    var btnAll = document.createElement("button");
    btnAll.type = "button";
    btnAll.textContent = "작업 시작";
    btnAll.className = "yna4-pane-btn yna4-pane-btn--primary";

    var btnStop = document.createElement("button");
    btnStop.type = "button";
    btnStop.textContent = "작업 중지";
    btnStop.className = "yna4-pane-btn yna4-pane-btn--danger";

    var btnSla = document.createElement("button");
    btnSla.type = "button";
    btnSla.textContent = "통합 결과";
    btnSla.className = "yna4-pane-btn";

    var status = document.createElement("div");
    status.id = ROOT_ID + "-unload-status";
    status.className = "yna4-pane-status";
    status.textContent = "준비";

    var diagWrap = document.createElement("div");
    diagWrap.id = ROOT_ID + "-unload-diag-wrap";
    diagWrap.className = "yna4-pane-diag";

    var diagBtnRow = document.createElement("div");
    diagBtnRow.className = "yna4-pane-actions";

    var btnDiagCopy = document.createElement("button");
    btnDiagCopy.type = "button";
    btnDiagCopy.textContent = "진단 텍스트 복사";
    btnDiagCopy.className = "yna4-pane-btn yna4-pane-btn--warn";

    var btnDiagSel = document.createElement("button");
    btnDiagSel.type = "button";
    btnDiagSel.textContent = "칸 안 전체 선택";
    btnDiagSel.className = "yna4-pane-btn";

    diagBtnRow.appendChild(btnDiagCopy);
    diagBtnRow.appendChild(btnDiagSel);

    var diagTa = document.createElement("textarea");
    diagTa.id = ROOT_ID + "-unload-diag-text";
    diagTa.readOnly = true;
    diagTa.wrap = "off";
    diagTa.placeholder = "";
    diagTa.className = "yna4-pane-diag-log";
    diagTa.setAttribute("aria-label", "HTTP 진단");

    diagWrap.appendChild(diagBtnRow);
    diagWrap.appendChild(diagTa);

    btnRow.appendChild(btnAll);
    btnRow.appendChild(btnStop);
    btnRow.appendChild(btnSla);

    hostEl.appendChild(dateRow);
    hostEl.appendChild(btnRow);
    hostEl.appendChild(status);
    hostEl.appendChild(diagWrap);

    btnDiagCopy.addEventListener("click", function () {
      var taEl = document.getElementById(ROOT_ID + "-unload-diag-text");
      var body =
        (taEl && String(taEl.value || "").trim()) ||
        String(unloadDiagnosticsFullText || "");
      if (!body) {
        setUnloadStatus("진단 없음");
        return;
      }
      unloadCopyPlainViaBestEffort(body, function (how) {
        if (how === "fail") {
          setUnloadStatus("클립보드 실패 · 영역 선택 후 Ctrl+C");
        } else {
          setUnloadStatus("진단 복사됨");
        }
      });
    });
    btnDiagSel.addEventListener("click", function () {
      var taEl = document.getElementById(ROOT_ID + "-unload-diag-text");
      if (!taEl) return;
      try {
        diagWrap.style.display = "block";
        taEl.style.display = "block";
        taEl.focus();
        taEl.select();
        setUnloadStatus("선택됨");
      } catch (es) {}
    });

    function refreshUnloadHint() {
      var host = location.hostname || "";
      var isInbound = /^inbound\.coupang\.com$/i.test(host);
      var isInventory = /^inventory\.coupang\.com$/i.test(host);
      var hasSearchForm = !!document.getElementById("unloadWorkSearchFormLayout");
      var tableOk = !!getUnloadTable();
      var hasGmXhr = typeof GM_xmlhttpRequest === "function";
      var canStart =
        hasGmXhr &&
        (isInbound ||
          isInventory ||
          hasSearchForm ||
          (!!getUnloadPage() && tableOk));
      btnAll.disabled = unloadCopyRunning || !canStart;
      btnStop.disabled = !unloadCopyRunning;
      try {
        var dr = document.getElementsByName(unloadDateScopeName);
        var kj;
        for (kj = 0; kj < dr.length; kj++) {
          dr[kj].disabled = unloadCopyRunning;
        }
        btnToday.disabled = unloadCopyRunning;
        btnYesterday.disabled = unloadCopyRunning;
      } catch (eDr) {}
    }

    shellUnloadRefreshHint = refreshUnloadHint;
    refreshUnloadHint();

    var obsMo = new MutationObserver(function () {
      clearTimeout(obsMo._deb);
      obsMo._deb = setTimeout(function () {
        refreshUnloadHint();
      }, 300);
    });
    try {
      obsMo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (eMo) {}

    btnAll.addEventListener("click", function () {
      unloadCopyAllPages().catch(function (e) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 unload]", e);
        }
      });
    });
    btnStop.addEventListener("click", unloadRequestStopCopyAll);
    btnSla.addEventListener("click", function () {
      try {
        var srcText = String(unloadLastMergedText || "").trim();
        if (!srcText) {
          setUnloadStatus("먼저 작업 시작으로 하차표를 수집하세요");
          return;
        }
        unloadSlaRunAnalysisFromText(srcText, unloadLastMergedHtml || "");
        unloadSlaOpenModal();
      } catch (eSla) {
        setUnloadStatus("통합 결과 실패");
        alert("[YAN4] 통합 결과 오류: " + (eSla && eSla.message ? eSla.message : eSla));
      }
    });
  }

(function toteMoveApiCopier() {
  "use strict";

  var TOTE_SEARCH_URL = "https://inventory.coupang.com/async/tote-move/search";
  var TOTE_API_PAGE_SIZE = 200;
  var toteApiRunning = false;
  var toteApiStopRequested = false;
  var toteApiRunSeq = 0;

  function toteBarcodeMatchesInclude(barcode, token) {
    var t = String(token || "").trim();
    var s = String(barcode || "").trim();
    if (!s || !t) return false;
    if (s.indexOf(t) === 0) return true;
    return s.split("-").indexOf(t) !== -1;
  }

  function toteSleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function toteReqHeaders() {
    return {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Origin: "https://inventory.coupang.com",
      Referer: "https://inventory.coupang.com/tote-move/list",
      "X-Requested-With": "XMLHttpRequest",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    };
  }

  function gmPostJson(url, bodyObj, extraHeaders, timeoutMs) {
    var h = Object.assign({}, toteReqHeaders(), extraHeaders || {});
    var payload = JSON.stringify(bodyObj || {});
    var tmo = typeof timeoutMs === "number" ? timeoutMs : 20000;
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: "POST",
        url: url,
        headers: h,
        data: payload,
        anonymous: false,
        timeout: tmo,
        onload: function (r) {
          if (r.status >= 200 && r.status < 400) resolve(r.responseText);
          else reject(new Error("HTTP " + r.status + " " + url));
        },
        onerror: function () {
          reject(new Error("요청 실패 " + url));
        },
        ontimeout: function () {
          reject(new Error("타임아웃(POST " + tmo + "ms) " + url));
        },
      });
    });
  }

  function toteDefaultYmd(deltaDays) {
    var d = new Date();
    if (typeof deltaDays === "number") d.setDate(d.getDate() + deltaDays);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = "0" + m;
    if (day.length < 2) day = "0" + day;
    return y + "-" + m + "-" + day;
  }

  function toteSetStatus(msg) {
    var el = document.getElementById(ROOT_ID + "-tote-api-status");
    if (el) el.textContent = String(msg || "");
  }

  function toteToggleRunUi(isRunning) {
    var run = document.getElementById(ROOT_ID + "-tote-api-run");
    var stop = document.getElementById(ROOT_ID + "-tote-api-stop");
    if (run) run.disabled = !!isRunning;
    if (stop) stop.disabled = !isRunning;
  }

  function toteRequestStop() {
    if (!toteApiRunning) return;
    toteApiStopRequested = true;
    toteApiRunSeq++;
    toteSetStatus("중지 요청됨");
  }

  function toteBuildTsv(lines) {
    return (lines || []).join("\n");
  }

  function toteRowToTsvLine(row, colKeys) {
    var out = [];
    var i;
    for (i = 0; i < colKeys.length; i++) {
      var v = row && Object.prototype.hasOwnProperty.call(row, colKeys[i]) ? row[colKeys[i]] : "";
      out.push(String(v == null ? "" : v).replace(/\s+/g, " ").trim());
    }
    return out.join("\t");
  }

  async function toteFetchPage(payload, mySeq) {
    if (toteApiStopRequested || mySeq !== toteApiRunSeq) return null;
    var raw = await gmPostJson(TOTE_SEARCH_URL, payload, null, 25000);
    var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || parsed.success !== true) {
      throw new Error("응답 실패(success!=true)");
    }
    if (!parsed.result) throw new Error("응답 누락(result)");
    return parsed.result;
  }

  async function toteRunFromUi() {
    if (toteApiRunning) return;
    toteApiRunning = true;
    toteApiStopRequested = false;
    var mySeq = ++toteApiRunSeq;
    toteToggleRunUi(true);

    try {
      var startEl = document.getElementById(ROOT_ID + "-tote-api-start");
      var endEl = document.getElementById(ROOT_ID + "-tote-api-end");
      var tokenEl = document.getElementById(ROOT_ID + "-tote-api-token");

      var startDate = startEl ? String(startEl.value || "").trim() : "";
      var endDate = endEl ? String(endEl.value || "").trim() : "";
      var includeToken = tokenEl ? String(tokenEl.value || "").trim() : "RCRT88";
      if (!includeToken) includeToken = "RCRT88";

      if (!startDate) startDate = toteDefaultYmd(-2);
      if (!endDate) endDate = toteDefaultYmd(0);

      toteSetStatus("API 조회 준비…");
      setProgressByStatusId(ROOT_ID + "-tote-api-status", 0);

      var base = {
        searchDateType: "STOWING_COMPLETED",
        startDate: startDate,
        endDate: endDate,
        status: null,
        isProblemReport: null,
        moveUserLoginId: "",
        stowUserLoginId: "",
        toteBarcode: "",
        page: 0,
        pageSize: TOTE_API_PAGE_SIZE,
      };

      var colKeys = [
        "toteBarcode",
        "statusDesc",
        "moveQuantity",
        "moveUserLoginId",
        "movedAt",
        "moveCompletedAt",
        "stowQuantity",
        "stowUserLoginId",
        "stowCompletedAt",
      ];

      var allLines = [];
      var p = 0;
      var totalPagesGuess = null;

      while (!toteApiStopRequested && mySeq === toteApiRunSeq) {
        base.page = p;
        toteSetStatus("페이지 " + (p + 1) + " 요청…");

        var res = await toteFetchPage(base, mySeq);
        var content = Array.isArray(res.content) ? res.content : [];

        if (typeof res.totalPages === "number") totalPagesGuess = res.totalPages;

        var i;
        for (i = 0; i < content.length; i++) {
          var row = content[i] || {};
          if (!toteBarcodeMatchesInclude(row.toteBarcode, includeToken)) continue;
          allLines.push(toteRowToTsvLine(row, colKeys));
        }

        var last = !!res.last;
        if (totalPagesGuess && totalPagesGuess > 0) {
          setProgressByStatusId(
            ROOT_ID + "-tote-api-status",
            ((p + 1) / totalPagesGuess) * 100
          );
        } else {
          setProgressByStatusId(
            ROOT_ID + "-tote-api-status",
            Math.min(95, (p + 1) * 7)
          );
        }
        toteSetStatus(
          "페이지 " +
            (p + 1) +
            " 수집됨 · 누적 " +
            allLines.length +
            "행 (" +
            includeToken +
            "만)"
        );

        if (last) break;
        if (totalPagesGuess != null && p + 1 >= totalPagesGuess) break;

        p++;
        await toteSleep(120);
      }

      if (toteApiStopRequested || mySeq !== toteApiRunSeq) {
        toteSetStatus("중지됨");
        return;
      }

      var tsv = toteBuildTsv(allLines);
      try {
        if (typeof GM_setClipboard === "function") {
          GM_setClipboard(tsv, "text/plain");
          toteSetStatus("완료 · " + allLines.length + "행 복사됨");
          setProgressByStatusId(ROOT_ID + "-tote-api-status", 100);
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(tsv);
          toteSetStatus("완료 · " + allLines.length + "행 복사됨");
          setProgressByStatusId(ROOT_ID + "-tote-api-status", 100);
        } else {
          throw new Error("clipboard unavailable");
        }
      } catch (eCb) {
        toteSetStatus("복사 실패 · 콘솔 확인");
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 tote-move api] clipboard", eCb);
        }
        alert("[YAN4] 클립보드 복사 실패: " + (eCb && eCb.message ? eCb.message : eCb));
      }
    } catch (e) {
      toteSetStatus("오류");
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[YAN4 tote-move api]", e);
      }
      alert("[YAN4] Tote-Move API 오류: " + (e && e.message ? e.message : String(e)));
    } finally {
      toteApiRunning = false;
      toteApiStopRequested = false;
      toteToggleRunUi(false);
    }
  }

  function initToteMoveApiPane(hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.className = "yna4-pane-mod yna4-pane-mod--unload";

    var row1 = document.createElement("div");
    row1.className = "yna4-pane-row";
    var k1 = document.createElement("span");
    k1.className = "yna4-pane-k";
    k1.textContent = "기간";

    var start = document.createElement("input");
    start.type = "date";
    start.id = ROOT_ID + "-tote-api-start";
    start.value = toteDefaultYmd(-2);
    start.className = "yna4-pane-inp";

    var end = document.createElement("input");
    end.type = "date";
    end.id = ROOT_ID + "-tote-api-end";
    end.value = toteDefaultYmd(0);
    end.className = "yna4-pane-inp";

    row1.appendChild(k1);
    row1.appendChild(start);
    row1.appendChild(end);

    var row2 = document.createElement("div");
    row2.className = "yna4-pane-row";
    var k2 = document.createElement("span");
    k2.className = "yna4-pane-k";
    k2.textContent = "필터";

    var token = document.createElement("input");
    token.type = "text";
    token.id = ROOT_ID + "-tote-api-token";
    token.value = "RCRT88";
    token.placeholder = "예: RCRT88";
    token.className = "yna4-pane-inp";
    token.style.minWidth = "72px";

    row2.appendChild(k2);
    row2.appendChild(token);

    var btnRow = document.createElement("div");
    btnRow.className = "yna4-pane-actions";

    var btnRun = document.createElement("button");
    btnRun.type = "button";
    btnRun.id = ROOT_ID + "-tote-api-run";
    btnRun.textContent = "작업 시작";
    btnRun.className = "yna4-pane-btn yna4-pane-btn--primary";

    var btnStop = document.createElement("button");
    btnStop.type = "button";
    btnStop.id = ROOT_ID + "-tote-api-stop";
    btnStop.textContent = "작업 중지";
    btnStop.className = "yna4-pane-btn yna4-pane-btn--danger";
    btnStop.disabled = true;

    btnRow.appendChild(btnRun);
    btnRow.appendChild(btnStop);

    var status = document.createElement("div");
    status.id = ROOT_ID + "-tote-api-status";
    status.className = "yna4-pane-status";
    status.textContent = "준비";

    hostEl.appendChild(row1);
    hostEl.appendChild(row2);
    hostEl.appendChild(btnRow);
    hostEl.appendChild(status);

    btnRun.addEventListener("click", function () {
      toteRunFromUi();
    });
    btnStop.addEventListener("click", toteRequestStop);
  }

  window.__YAN4_INIT_TOTE_MOVE_API_PANE__ = initToteMoveApiPane;
})();


  /** IB 통합 패널 — 워크플로우: HTTP로 대시보드 목록 파싱 + 선택 수집 → 새 탭 상세 자동화 */
  function initReplenishLauncherPane(hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.className = "yna4-pane-mod";
    var dashUrl = "https://outbound.coupang.com/workflow/nob/dashboard";
    var NEED_DETAIL_PATH = "/workflow/nob/v2/view/needToReplenish/detail/";
    var CB_CLASS = ROOT_ID + "-repl-cut-cb";

    /** 보충 필요 칸 하이퍼링크의 표시 숫자만 (천 단위 콤마 등 제거) */
    function parseNeedCountFromAnchor(a) {
      var t = String((a && a.textContent) || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!t) return null;
      var digits = t.replace(/[^\d]/g, "");
      if (!digits) return null;
      var n = parseInt(digits, 10);
      return isFinite(n) ? n : null;
    }

    function parseCutlinesFromHtml(html) {
      var doc = new DOMParser().parseFromString(html, "text/html");
      var seen = Object.create(null);
      var list = [];
      var nodes = doc.querySelectorAll('a[href*="' + NEED_DETAIL_PATH + '"]');
      var i;
      for (i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        var raw = a.getAttribute("href") || "";
        if (!raw) continue;
        var abs;
        try {
          abs = new URL(raw, "https://outbound.coupang.com").href;
        } catch (eU) {
          abs = raw;
        }
        if (seen[abs]) continue;
        seen[abs] = true;
        var pathLabel = abs;
        try {
          var ix = abs.indexOf(NEED_DETAIL_PATH);
          if (ix !== -1) {
            pathLabel = decodeURIComponent(
              abs.substring(ix + NEED_DETAIL_PATH.length)
            ).trim();
          }
        } catch (eL) {}
        var needNum = parseNeedCountFromAnchor(a);
        list.push({
          url: abs,
          cutline: pathLabel,
          needCount: needNum,
          label:
            pathLabel +
            (needNum != null ? " " + String(needNum) : ""),
        });
      }
      return list;
    }

    function gmXhrOutbound(opt) {
      return new Promise(function (resolve, reject) {
        if (typeof GM_xmlhttpRequest !== "function") {
          reject(new Error("GM_xmlhttpRequest 필요"));
          return;
        }
        var hdr = Object.assign(
          {
            Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
            Referer: dashUrl,
            Origin: "https://outbound.coupang.com",
          },
          opt.headers || {}
        );
        GM_xmlhttpRequest({
          method: opt.method || "GET",
          url: opt.url,
          headers: hdr,
          data: opt.data != null ? opt.data : undefined,
          anonymous: false,
          timeout: opt.timeout || 45000,
          onload: function (r) {
            if (r.status >= 200 && r.status < 400) {
              resolve(String(r.responseText || ""));
            } else {
              reject(
                new Error("HTTP " + r.status + (opt.tag ? " · " + opt.tag : ""))
              );
            }
          },
          onerror: function () {
            reject(new Error("네트워크 오류" + (opt.tag ? " · " + opt.tag : "")));
          },
          ontimeout: function () {
            reject(new Error("타임아웃" + (opt.tag ? " · " + opt.tag : "")));
          },
        });
      });
    }

    function gmGetHtml(url) {
      return gmXhrOutbound({ method: "GET", url: url, tag: "대시보드 GET" });
    }

    /** class="btn-search" 조회 버튼이 속한 form */
    function findNobDashboardSearchForm(doc) {
      var btn =
        doc.querySelector("button.btn-search[type='submit']") ||
        doc.querySelector("button.btn-search") ||
        doc.querySelector("input.btn-search[type='submit']");
      if (!btn || !btn.closest) return null;
      return btn.closest("form");
    }

    function serializeOutboundDashboardForm(form) {
      var chunks = [];
      var els = form.querySelectorAll("input, select, textarea");
      var i;
      var el;
      var n;
      var type;
      var tag;
      var oi;
      var opts;
      for (i = 0; i < els.length; i++) {
        el = els[i];
        if (el.disabled) continue;
        n = el.getAttribute("name");
        if (!n) continue;
        tag = String(el.tagName || "").toUpperCase();
        if (tag === "INPUT") {
          type = String(el.getAttribute("type") || "text").toLowerCase();
          if (type === "submit" || type === "button" || type === "image") {
            continue;
          }
          if (type === "checkbox" || type === "radio") {
            if (!el.checked) continue;
          }
          chunks.push(encodeURIComponent(n) + "=" + encodeURIComponent(el.value || ""));
          continue;
        }
        if (tag === "SELECT") {
          opts =
            typeof el.selectedOptions !== "undefined" && el.selectedOptions.length
              ? el.selectedOptions
              : [];
          if (opts.length > 0) {
            for (oi = 0; oi < opts.length; oi++) {
              chunks.push(
                encodeURIComponent(n) +
                  "=" +
                  encodeURIComponent(String(opts[oi].value || ""))
              );
            }
          } else if (el.options && el.selectedIndex >= 0) {
            chunks.push(
              encodeURIComponent(n) +
                "=" +
                encodeURIComponent(
                  String(el.options[el.selectedIndex].value || "")
                )
            );
          }
          continue;
        }
        if (tag === "TEXTAREA") {
          chunks.push(
            encodeURIComponent(n) + "=" + encodeURIComponent(el.value || "")
          );
        }
      }
      var sb =
        form.querySelector("button.btn-search[type='submit']") ||
        form.querySelector("button.btn-search");
      if (sb) {
        n = sb.getAttribute("name");
        if (n) {
          chunks.push(
            encodeURIComponent(n) +
              "=" +
              encodeURIComponent(sb.getAttribute("value") || "")
          );
        }
      }
      return chunks.join("&");
    }

    function upsertUrlEncodedParam(body, key, value) {
      var k = encodeURIComponent(String(key || ""));
      var v = encodeURIComponent(String(value == null ? "" : value));
      var src = String(body || "");
      if (!k) return src;
      var parts = src ? src.split("&") : [];
      var out = [];
      var i;
      var seen = false;
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (!p) continue;
        var eq = p.indexOf("=");
        var pk = eq === -1 ? p : p.slice(0, eq);
        if (pk === k) {
          if (!seen) {
            out.push(k + "=" + v);
            seen = true;
          }
          continue;
        }
        out.push(p);
      }
      if (!seen) out.push(k + "=" + v);
      return out.join("&");
    }

    function outboundCsrfHeaderFromParsedDoc(doc) {
      try {
        var m = doc.querySelector('meta[name="_csrf"]');
        var tok = (m && m.getAttribute("content")) || "";
        if (!tok) {
          var inp = doc.querySelector('input[name="_csrf"], input[name="csrf-token"]');
          if (inp) tok = inp.value || "";
        }
        if (!tok) return {};
        return { "X-CSRF-TOKEN": tok, "X-XSRF-TOKEN": tok };
      } catch (eCs) {
        return {};
      }
    }

    /**
     * 1) GET 대시보드 → 링크 있으면 사용
     * 2) 없으면 btn-search 폼을 직렬화해 조회 재현(GET/POST)
     * SPA만 있고 폼 없으면 no-form 반환 — 그때는 XHR API 스펙 필요
     */
    function fetchNobDashboardHtmlWithSearch() {
      return gmGetHtml(dashUrl).then(function (html0) {
        var items0 = parseCutlinesFromHtml(html0);
        if (items0.length > 0) {
          return { html: html0, items: items0, note: "get-ready" };
        }
        var doc0 = new DOMParser().parseFromString(html0, "text/html");
        var form = findNobDashboardSearchForm(doc0);
        if (!form) {
          return { html: html0, items: [], note: "no-form" };
        }
        var method = String(form.method || form.getAttribute("method") || "get")
          .toUpperCase()
          .trim();
        var actRaw = form.getAttribute("action");
        var submitUrl =
          actRaw != null &&
          String(actRaw).trim().length > 0 &&
          String(actRaw).trim() !== "#"
            ? new URL(String(actRaw).trim(), dashUrl).href.split("#")[0]
            : dashUrl;
        var body = serializeOutboundDashboardForm(form);
        // Dashboard search submit should be treated as searched=true for stable results.
        body = upsertUrlEncodedParam(body, "searched", "true");
        var xh = outboundCsrfHeaderFromParsedDoc(doc0);

        if (method === "GET") {
          var uGet = submitUrl;
          if (body) {
            uGet += (uGet.indexOf("?") !== -1 ? "&" : "?") + body;
          }
          return gmXhrOutbound({
            method: "GET",
            url: uGet,
            headers: xh,
            tag: "조회 폼(GET)",
          }).then(function (html1) {
            var itGet = parseCutlinesFromHtml(html1);
            if (itGet.length > 0) {
              return {
                html: html1,
                items: itGet,
                note: "form-get",
              };
            }
            var postHdrFb = Object.assign(
              {
                "Content-Type":
                  "application/x-www-form-urlencoded; charset=UTF-8",
              },
              xh
            );
            return gmXhrOutbound({
              method: "POST",
              url: submitUrl,
              headers: postHdrFb,
              data: body,
              tag: "조회 폼(GET무응답→POST)",
            }).then(function (html2) {
              return {
                html: html2,
                items: parseCutlinesFromHtml(html2),
                note: "form-post-fallback",
              };
            });
          });
        }

        var postHdr = Object.assign(
          {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          },
          xh
        );
        return gmXhrOutbound({
          method: "POST",
          url: submitUrl,
          headers: postHdr,
          data: body,
          tag: "조회 폼(POST)",
        }).then(function (html1) {
          return {
            html: html1,
            items: parseCutlinesFromHtml(html1),
            note: "form-post",
          };
        });
      });
    }

    var btnRow = document.createElement("div");
    btnRow.className = "yna4-pane-actions";

    function mkBtn(txt, variant) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = txt;
      var cls =
        variant === "primary"
          ? "yna4-pane-btn yna4-pane-btn--primary"
          : variant === "compact"
            ? "yna4-pane-btn yna4-pane-btn--compact"
            : "yna4-pane-btn";
      b.className = cls;
      return b;
    }

    var btnLoad = mkBtn("워크플로우 조회");

    var listWrap = document.createElement("div");
    listWrap.id = ROOT_ID + "-repl-cutline-list";
    listWrap.className = "yna4-pane-scroll";
    listWrap.textContent = "";

    var selRow = document.createElement("div");
    selRow.className = "yna4-pane-actions";
    var btnAll = mkBtn("전체", "compact");
    var btnNone = mkBtn("해제", "compact");

    var btnStart = mkBtn("작업 시작", "primary");
    btnStart.className =
      "yna4-pane-btn yna4-pane-btn--primary";
    var btnStop = mkBtn("작업 중지", "danger");
    btnStop.className =
      "yna4-pane-btn yna4-pane-btn--danger";
    var workflowStopRequested = false;

    var st = document.createElement("div");
    st.id = ROOT_ID + "-repl-launcher-msg";
    st.className = "yna4-pane-status";

    st.textContent = "준비";

    function renderList(items) {
      listWrap.textContent = "";
      if (!items || !items.length) {
        listWrap.textContent = "0건";
        return;
      }
      var j;
      for (j = 0; j < items.length; j++) {
        (function (item) {
          var rowEl = document.createElement("div");
          rowEl.className = "yna4-pane-list-row";
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.className = CB_CLASS;
          cb.dataset.url = item.url;
          cb.dataset.label = item.label;
          var labWrap = document.createElement("span");
          labWrap.className = "yna4-pane-list-row-label";
          var labDate = document.createElement("span");
          labDate.textContent = item.cutline || "";
          labWrap.appendChild(labDate);
          if (item.needCount != null) {
            var labCnt = document.createElement("span");
            labCnt.className = "yna4-repl-need-count";
            labCnt.textContent = String(item.needCount) + "건";
            labWrap.appendChild(labCnt);
          }
          rowEl.appendChild(cb);
          rowEl.appendChild(labWrap);
          listWrap.appendChild(rowEl);
        })(items[j]);
      }
    }

    function normalizeCellText(s) {
      return String(s || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function parseDetailRowsFromHtml(html) {
      var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
      var table =
        doc.querySelector('table[is="w-table"]') ||
        doc.querySelector(
          "table.table.table-bordered.table-striped.table-hover.mb-0.w-100"
        ) ||
        doc.querySelector("table");
      if (!table) return [];
      var out = [];
      var trs = table.querySelectorAll("tbody tr");
      var i;
      for (i = 0; i < trs.length; i++) {
        var cells = trs[i].querySelectorAll("th,td");
        if (!cells || !cells.length) continue;
        var row = [];
        var j;
        for (j = 0; j < cells.length; j++) {
          row.push(normalizeCellText(cells[j].textContent || ""));
        }
        out.push(row.join("\t"));
      }
      return out;
    }

    function parseDetailMaxPageFromHtml(html) {
      var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
      var maxPage = 1;
      var nodes = doc.querySelectorAll("w-page-item-group w-page-item, w-page-item");
      var i;
      for (i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var v1 = parseInt(String(el.getAttribute("data-go-page") || "").trim(), 10);
        if (isFinite(v1) && v1 > maxPage) maxPage = v1;

        var v2 = parseInt(String(el.getAttribute("data-page") || "").trim(), 10);
        if (isFinite(v2)) {
          // data-page는 0-based 인 경우가 많음
          var ui2 = v2 >= 0 ? v2 + 1 : v2;
          if (isFinite(ui2) && ui2 > maxPage) maxPage = ui2;
        }

        var h = parseInt(String(el.getAttribute("href") || "").trim(), 10);
        if (isFinite(h) && h > maxPage) maxPage = h;

        var t = parseInt(String(el.textContent || "").replace(/[^\d]/g, ""), 10);
        if (isFinite(t) && t > maxPage) maxPage = t;
      }
      return maxPage;
    }

    function parseDetailActivePageFromHtml(html) {
      var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
      var active = doc.querySelector("w-page-item[active]");
      if (!active) return 1;
      var d1 = parseInt(String(active.getAttribute("data-go-page") || "").trim(), 10);
      if (isFinite(d1) && d1 > 0) return d1;
      var d2 = parseInt(String(active.getAttribute("data-page") || "").trim(), 10);
      if (isFinite(d2) && d2 >= 0) return d2 + 1;
      var h = parseInt(String(active.getAttribute("href") || "").trim(), 10);
      if (isFinite(h) && h > 0) return h;
      var t = parseInt(String(active.textContent || "").replace(/[^\d]/g, ""), 10);
      if (isFinite(t) && t > 0) return t;
      return 1;
    }

    function buildDetailPageUrl(base, key, val) {
      try {
        var u = new URL(base);
        u.searchParams.set(String(key || "page"), String(val));
        return u.href;
      } catch (eUrl) {
        return base;
      }
    }

    function pickDetailPagingForm(doc) {
      if (!doc) return null;
      var p = doc.querySelector("input[name='page']");
      if (p && p.form) return p.form;
      return doc.querySelector('form[action*="/workflow/nob/v2/view/"]');
    }

    async function fetchDetailPageHtmlByAttempts(detailUrl, uiPage, contextHtml) {
      var tryUrls = [
        buildDetailPageUrl(detailUrl, "page", Math.max(0, uiPage - 1)),
        buildDetailPageUrl(detailUrl, "page", uiPage),
        buildDetailPageUrl(detailUrl, "pageNumber", uiPage),
      ];
      var ai;
      for (ai = 0; ai < tryUrls.length; ai++) {
        try {
          var htmlGet = await gmXhrOutbound({
            method: "GET",
            url: tryUrls[ai],
            tag: "detail-get-p" + uiPage + "-" + ai,
          });
          var rowsGet = parseDetailRowsFromHtml(htmlGet);
          if (!rowsGet.length) continue;
          var activeGet = parseDetailActivePageFromHtml(htmlGet);
          if (activeGet === uiPage) return htmlGet;
        } catch (eGet) {}
      }

      try {
        var doc = new DOMParser().parseFromString(String(contextHtml || ""), "text/html");
        var form = pickDetailPagingForm(doc);
        if (!form) throw new Error("detail paging form not found");
        var actionRaw = form.getAttribute("action");
        var submitUrl =
          actionRaw && String(actionRaw).trim() && String(actionRaw).trim() !== "#"
            ? new URL(String(actionRaw).trim(), detailUrl).href
            : detailUrl;
        var body = serializeOutboundDashboardForm(form);
        body = upsertUrlEncodedParam(body, "page", String(Math.max(0, uiPage - 1)));
        body = upsertUrlEncodedParam(body, "searched", "true");
        var xh = Object.assign(
          { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
          outboundCsrfHeaderFromParsedDoc(doc)
        );
        var htmlPost = await gmXhrOutbound({
          method: "POST",
          url: submitUrl,
          data: body,
          headers: xh,
          tag: "detail-post-p" + uiPage,
        });
        var activePost = parseDetailActivePageFromHtml(htmlPost);
        if (activePost !== uiPage) {
          throw new Error("detail post moved to unexpected page " + activePost);
        }
        return htmlPost;
      } catch (ePost) {
        throw new Error("상세 페이지 이동 실패 p" + uiPage);
      }
    }

    async function collectOneDetailAllPages(detailUrl, detailLabel) {
      var merged = [];
      if (workflowStopRequested) return { label: detailLabel, lines: merged };
      var firstHtml = await gmXhrOutbound({
        method: "GET",
        url: detailUrl,
        tag: "detail-get",
      });
      var firstRows = parseDetailRowsFromHtml(firstHtml);
      merged = merged.concat(firstRows);
      var pageContextHtml = firstHtml;
      var maxPageHint = parseDetailMaxPageFromHtml(firstHtml);
      if (!isFinite(maxPageHint) || maxPageHint < 1) maxPageHint = 1;
      var HARD_MAX_PAGES = 500;
      var seenPageSig = Object.create(null);
      if (firstRows.length) {
        var firstSig =
          String(firstRows.length) +
          "|" +
          String(firstRows[0] || "") +
          "|" +
          String(firstRows[firstRows.length - 1] || "");
        seenPageSig[firstSig] = 1;
      }

      var p;
      for (p = 2; p <= HARD_MAX_PAGES; p++) {
        if (workflowStopRequested) break;
        var htmlP = "";
        try {
          htmlP = await fetchDetailPageHtmlByAttempts(detailUrl, p, pageContextHtml);
        } catch (eMove) {
          // 특정 페이지 이동 실패는 해당 컷타임의 마지막 페이지로 간주하고 종료
          break;
        }
        var rowsP = parseDetailRowsFromHtml(htmlP);
        if (!rowsP.length) break;
        var sig =
          String(rowsP.length) +
          "|" +
          String(rowsP[0] || "") +
          "|" +
          String(rowsP[rowsP.length - 1] || "");
        if (seenPageSig[sig]) break;
        seenPageSig[sig] = 1;
        merged = merged.concat(rowsP);
        pageContextHtml = htmlP;
        // 힌트 페이지를 넘긴 뒤 최소 1페이지는 더 시도해 과소추정(maxPageHint) 이슈를 완화
        if (p > maxPageHint + 1) {
          // 추가 페이지가 계속 나오면 루프 유지, 아니면 위 empty/dup guard에서 중단됨
        }
      }
      return {
        label: detailLabel,
        lines: merged,
      };
    }

    btnAll.addEventListener("click", function () {
      var cbs = listWrap.querySelectorAll("input." + CB_CLASS);
      var i;
      for (i = 0; i < cbs.length; i++) cbs[i].checked = true;
    });
    btnNone.addEventListener("click", function () {
      var cbs = listWrap.querySelectorAll("input." + CB_CLASS);
      var i;
      for (i = 0; i < cbs.length; i++) cbs[i].checked = false;
    });

    btnLoad.addEventListener("click", function () {
      st.textContent = "…";
      fetchNobDashboardHtmlWithSearch()
        .then(function (res) {
          renderList(res.items);
          var n = res.items.length;
          if (n > 0) {
            st.textContent = n + "건";
          } else {
            st.textContent = "0건";
          }
        })
        .catch(function (e) {
          st.textContent =
            "실패: " + (e && e.message ? e.message : String(e));
        });
    });

    btnStart.addEventListener("click", function () {
      var cbs = listWrap.querySelectorAll("input." + CB_CLASS + ":checked");
      var targets = [];
      var i;
      for (i = 0; i < cbs.length; i++) {
        targets.push({
          url: cbs[i].dataset.url,
          label: String(cbs[i].dataset.label || ""),
        });
      }
      if (!targets.length) {
        alert("먼저 워크플로우 조회 후 항목을 선택하세요.");
        return;
      }
      workflowStopRequested = false;
      btnStart.disabled = true;
      btnStop.disabled = false;
      btnLoad.disabled = true;
      st.textContent = "수집 시작…";
      setProgressByStatusId(ROOT_ID + "-repl-launcher-msg", 0);
      (async function () {
        try {
          var all = [];
          var ti;
          for (ti = 0; ti < targets.length; ti++) {
            if (workflowStopRequested) break;
            st.textContent =
              "수집 " + (ti + 1) + "/" + targets.length + " · " + targets[ti].label;
            var part = await collectOneDetailAllPages(
              targets[ti].url,
              targets[ti].label
            );
            if (part.lines && part.lines.length) {
              all = all.concat(part.lines);
            }
            setProgressByStatusId(
              ROOT_ID + "-repl-launcher-msg",
              ((ti + 1) / Math.max(1, targets.length)) * 100
            );
          }
          if (workflowStopRequested) {
            st.textContent = "작업 중지됨";
            return;
          }
          var text = all.join("\n");
          if (typeof GM_setClipboard === "function") {
            GM_setClipboard(text, "text/plain");
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            throw new Error("clipboard unavailable");
          }
          st.textContent = "완료 · " + all.length + "행 복사";
          setProgressByStatusId(ROOT_ID + "-repl-launcher-msg", 100);
        } catch (e) {
          st.textContent = "실패";
          alert(String(e && e.message ? e.message : e));
        } finally {
          btnStart.disabled = false;
          btnStop.disabled = true;
          btnLoad.disabled = false;
        }
      })();
    });

    btnStop.addEventListener("click", function () {
      workflowStopRequested = true;
      st.textContent = "작업 중지 요청됨…";
    });

    selRow.appendChild(btnLoad);
    selRow.appendChild(btnAll);
    selRow.appendChild(btnNone);
    btnRow.appendChild(btnStart);
    btnRow.appendChild(btnStop);
    btnStop.disabled = true;

    hostEl.appendChild(listWrap);
    hostEl.appendChild(selRow);
    hostEl.appendChild(btnRow);
    hostEl.appendChild(st);
  }



  /**
   * 패널 상단 = .wms-gnb 전체(센터 드롭다운 + 메뉴 행) 하단. 그 아래 콘텐츠 위에 겹쳐도 됨.
   * gapPx: GNB와 패널 사이 여백(0이면 맞닿음).
   */
  var LAYOUT = {
    /** 뷰포트 좌·우에만 남기는 여백(px). 0에 가까울수록 가로로 더 꽉 참 */
    sideMarginPx: 8,
    gapPx: 0,
    /** .wms-gnb 를 못 찾을 때만 사용 (폴백) */
    fallbackTopPx: 118,
    /** 화면 맨 아래 남기는 최소 여백(px). 작을수록 패널이 세로로 더 길어짐 */
    bottomMarginPx: 2,
    zIndex: "2147483646",
  };

  function measureTopPx() {
    var gnb = document.querySelector(".wms-gnb");
    if (gnb) {
      var b = gnb.getBoundingClientRect().bottom + LAYOUT.gapPx;
      if (isFinite(b)) return Math.max(0, b);
    }
    var topOnly = document.querySelector(".wms-top");
    if (topOnly) {
      var t = topOnly.getBoundingClientRect().bottom + LAYOUT.gapPx;
      if (isFinite(t)) return Math.max(0, t);
    }
    return LAYOUT.fallbackTopPx;
  }

  function positionPanel(wrap) {
    if (!wrap) return;
    try {
      var side = LAYOUT.sideMarginPx + "px";
      var vh = Math.max(
        200,
        window.innerHeight ||
          (document.documentElement && document.documentElement.clientHeight) ||
          600
      );
      var topPx = measureTopPx();
      if (!isFinite(topPx)) topPx = LAYOUT.fallbackTopPx;
      topPx = Math.max(0, Math.min(topPx, vh - 100));
      var bottomPx = LAYOUT.bottomMarginPx;

      wrap.style.top = topPx + "px";
      wrap.style.bottom = bottomPx + "px";
      wrap.style.left = side;
      wrap.style.right = side;
      wrap.style.height = "";
      wrap.style.minHeight = "";
      wrap.style.maxHeight = "";
    } catch (ePos) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[YAN4 Shell] positionPanel", ePos);
      }
    }
  }

  /** 6번은 그리드 6열 배치 — 별도 높이 동기화 불필요 */
  function syncNeedHelpColumnHeight() {}

  function applyWrapBase(el) {
    var side = LAYOUT.sideMarginPx + "px";
    el.setAttribute(
      "style",
      [
        "position:fixed",
        "left:" + side,
        "right:" + side,
        "width:auto",
        "z-index:" + LAYOUT.zIndex,
        "font:10px/1.45 system-ui,Segoe UI,Malgun Gothic,sans-serif",
        "color:#0f172a",
        "display:flex",
        "flex-direction:column",
        "box-sizing:border-box",
        "overflow:hidden",
      ].join(";")
    );
  }

  /** 발주 SKU 대조: 이 API 묶음은 **소스 B**(검품 작업 목록). A는 다른 화면에서 키 추출 → B 검색·상태 비교. */
  var INSPECT_WORK_LIST_REFERER = "https://inbound.coupang.com/inspect-work/list";
  var INSPECT_WORK_PAGE_CAP = 80;
  var INSPECT_WORK_REQ_GAP_MS = 350;

  function inspectWorkReqHeaders() {
    var xsrf =
      unloadXsrfFromDocumentCookie() || String(unloadXsrfOverrideFromBoot || "").trim();
    var h = {
      Referer: INSPECT_WORK_LIST_REFERER,
      Origin: "https://inbound.coupang.com",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "text/html, */*; q=0.01",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    };
    if (xsrf) h["X-XSRF-TOKEN"] = xsrf;
    return h;
  }

  function inspectWorkNormText(s) {
    return String(s || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function inspectWorkCellText(td) {
    if (!td) return "";
    var b = td.querySelector("w-badge");
    if (b) return inspectWorkNormText(b.textContent);
    var a = td.querySelector("a");
    if (a) return inspectWorkNormText(a.textContent);
    return inspectWorkNormText(td.textContent);
  }

  function inspectWorkQueryString(ymdStart, ymdEnd, inspectWorkStatus, skuIdOpt) {
    var skuIdVal =
      skuIdOpt != null && String(skuIdOpt).trim()
        ? String(skuIdOpt).replace(/\s+/g, "").trim()
        : "";
    var p = {
      complianceSearchType: "ALL",
      skuComplianceInspectionRequired: "",
      returnReasonCategoryCode: "",
      inspectWorkStatus: inspectWorkStatus != null ? String(inspectWorkStatus) : "",
      skuBarcode: "",
      skuExternalId: "",
      inspectionPriority: "",
      skuId: skuIdVal,
      vendorName: "",
      purchaseOrderExternalId: "",
      ibc: "",
      unloadedEndDate: ymdEnd || ymdStart,
      unloadedStartDate: ymdStart,
    };
    var parts = [];
    var k;
    for (k in p) {
      if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(p[k]));
    }
    return parts.join("&");
  }

  function inspectWorkPagingUrl(apiPage, queryString) {
    return (
      "https://inbound.coupang.com/inspect-work/paging?page=" +
      encodeURIComponent(String(apiPage)) +
      "&" +
      queryString
    );
  }

  /**
   * w-page 탭에는 보통 번호창 최대(~10 등)만 있어 unloadParseMaxPage가 실제 페이지 수보다 작을 수 있다.
   * nextPage부터 cap 전까지 추가 요청, 빈 tbody·첫 행 시그 같으면 종료.
   */
  async function wPagedHtmlExtendFetchMore(opts) {
    var extP = opts.nextPageZeroBased;
    var cap = opts.maxPageExclusive;
    var shouldStop =
      typeof opts.shouldStop === "function"
        ? opts.shouldStop
        : function () {
            return false;
          };
    var sleepFn = opts.sleepFn;
    var fetchHtml = opts.fetchHtml;
    var parseRows = opts.parseRows;
    var sigFromHtml = opts.sigFromHtml;
    var baselineSig = opts.baselineSig;
    var pushRow = opts.pushRow;
    var afterPage =
      opts.afterPage && typeof opts.afterPage === "function"
        ? opts.afterPage
        : null;

    while (extP < cap) {
      if (shouldStop()) break;
      if (sleepFn) {
        var slOk = await sleepFn();
        if (!slOk || shouldStop()) break;
      }
      var h = await fetchHtml(extP);
      if (!h) break;
      var pr = parseRows(h);
      if (!pr || !pr.length) break;
      var sg = sigFromHtml(h);
      if (
        baselineSig &&
        sg &&
        baselineSig === sg &&
        extP > 0
      )
        break;
      var i;
      for (i = 0; i < pr.length; i++) pushRow(pr[i]);
      if (afterPage)
        try {
          afterPage(extP, pr.length);
        } catch (eAp) {}
      extP++;
    }
  }

  /**
   * 검품 목록 페이지 전체(0..N). sleepFn 반환값 false 중단. shouldStop() true 시 중단.
   */
  async function inspectWorkGmFetchAllPagingRows(fullQs, cfg) {
    var gapMs =
      cfg && cfg.gapMs != null ? cfg.gapMs : INSPECT_WORK_REQ_GAP_MS;
    var hdr = inspectWorkReqHeaders();
    var shouldStop =
      cfg && typeof cfg.shouldStop === "function"
        ? cfg.shouldStop
        : function () {
            return false;
          };
    var sleepFn =
      cfg && typeof cfg.sleepFn === "function"
        ? cfg.sleepFn
        : async function () {
            await unloadSleep(gapMs);
            return true;
          };

    var html0 = await gmGet(inspectWorkPagingUrl(0, fullQs), hdr);
    if (!html0) return [];
    var lastUi = unloadParseMaxPageFromHtml(html0);
    lastUi = Math.min(Math.max(1, lastUi), INSPECT_WORK_PAGE_CAP);
    var totalApi = lastUi;
    var allRows = [];
    var page0rows = inspectWorkParseRowsFromHtml(html0);
    var i;
    for (i = 0; i < page0rows.length; i++) allRows.push(page0rows[i]);
    var firstSig = inspectWorkFirstRowSig(html0);

    var apiP;
    for (apiP = 1; apiP < totalApi; apiP++) {
      if (shouldStop()) break;
      var okSleep = await sleepFn();
      if (!okSleep || shouldStop()) break;

      var pageHtml = await gmGet(
        inspectWorkPagingUrl(apiP, fullQs),
        hdr
      );
      if (!pageHtml) break;

      var nextSig = inspectWorkFirstRowSig(pageHtml);
      if (
        firstSig &&
        nextSig &&
        firstSig === nextSig &&
        apiP > 0
      ) {
        break;
      }

      var pr = inspectWorkParseRowsFromHtml(pageHtml);
      for (i = 0; i < pr.length; i++) allRows.push(pr[i]);
    }

    await wPagedHtmlExtendFetchMore({
      nextPageZeroBased: totalApi,
      maxPageExclusive: INSPECT_WORK_PAGE_CAP,
      shouldStop: shouldStop,
      sleepFn: sleepFn,
      fetchHtml: function (pz) {
        return gmGet(inspectWorkPagingUrl(pz, fullQs), hdr);
      },
      parseRows: inspectWorkParseRowsFromHtml,
      sigFromHtml: inspectWorkFirstRowSig,
      baselineSig: firstSig,
      pushRow: function (rw) {
        allRows.push(rw);
      },
    });

    return allRows;
  }

  function inspectWorkParseRowsFromHtml(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var table = doc.querySelector('table[is="w-table"]');
    if (!table) return [];
    var trs = table.querySelectorAll("tbody tr");
    var rows = [];
    var r;
    var tr;
    var tds;
    for (r = 0; r < trs.length; r++) {
      tr = trs[r];
      tds = tr.querySelectorAll("td");
      if (tds.length < 17) continue;
      rows.push({
        inspectNo: inspectWorkCellText(tds[0]),
        unloadDt: inspectWorkCellText(tds[1]),
        ibc: inspectWorkCellText(tds[2]),
        poExt: inspectWorkCellText(tds[3]),
        vendor: inspectWorkCellText(tds[4]),
        skuId: inspectWorkCellText(tds[5]),
        priority: inspectWorkCellText(tds[6]),
        barcode: inspectWorkCellText(tds[7]),
        productName: inspectWorkCellText(tds[8]),
        status: inspectWorkCellText(tds[12]),
        inboundQty: inspectWorkCellText(tds[16]),
      });
    }
    return rows;
  }

  function inspectWorkFirstRowSig(html) {
    var rows = inspectWorkParseRowsFromHtml(html);
    if (!rows.length) return "";
    var o = rows[0];
    return [o.inspectNo, o.skuId, o.status].join("|");
  }

  function inspectWorkTsvEscape(s) {
    return String(s || "").replace(/\t/g, " ").replace(/\r|\n/g, " ");
  }

  /** 발주 SKU 소스 A: /purchaseOrder/list 의 v2/paging (dateType=RECEIVE_DATE, 입고예정일 start~end) */
  var PURCHASE_ORDER_LIST_REFERER = "https://inbound.coupang.com/purchaseOrder/list";
  var PURCHASE_ORDER_PAGE_CAP = 80;
  var PURCHASE_ORDER_ITEM_FETCH_CAP = 120;
  var SKU_INSPECT_LOOKUP_CAP = 200;

  function purchaseOrderReqHeaders() {
    var xsrf =
      unloadXsrfFromDocumentCookie() || String(unloadXsrfOverrideFromBoot || "").trim();
    var h = {
      Referer: PURCHASE_ORDER_LIST_REFERER,
      Origin: "https://inbound.coupang.com",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "text/html, */*; q=0.01",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    };
    if (xsrf) h["X-XSRF-TOKEN"] = xsrf;
    return h;
  }

  /** 전체 발주 목록 HTML — 드롭다운 value 파싱용(한글 라벨 ≠ API value) */
  function purchaseOrderListDocumentHeaders() {
    var xsrf =
      unloadXsrfFromDocumentCookie() || String(unloadXsrfOverrideFromBoot || "").trim();
    var h = {
      Referer: PURCHASE_ORDER_LIST_REFERER,
      Origin: "https://inbound.coupang.com",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    };
    if (xsrf) h["X-XSRF-TOKEN"] = xsrf;
    return h;
  }

  function purchaseOrderRegexOptionsFromSelectInner(innerHtml) {
    var out = [];
    var oprx = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    var om;
    while ((om = oprx.exec(innerHtml)) !== null) {
      var attr = om[1] || "";
      var vm = attr.match(/\bvalue\s*=\s*["']([^"']*)["']/i);
      var rawV = vm ? vm[1] : "";
      out.push({
        value: String(rawV),
        label: inspectWorkNormText(om[2] || ""),
      });
    }
    return out;
  }

  /** 목록 HTML 내 스크립트/JSON 유사 payload에서 purchaseOrderStatus 옵션 복구 */
  function purchaseOrderParseStatusOptionsFromJsPayload(html) {
    if (!html || typeof html !== "string") return [];
    var out = [];
    var seen = Object.create(null);
    function pushOne(vRaw, lRaw) {
      var v = vRaw == null ? "" : String(vRaw);
      var l = inspectWorkNormText(lRaw == null ? "" : String(lRaw));
      var key = v + "\u0000" + l;
      if (seen[key]) return;
      seen[key] = true;
      out.push({ value: v, label: l || v });
    }
    var blocks = [];
    var reBlock = /purchaseOrderStatus[\s\S]{0,3000}/gi;
    var bm;
    while ((bm = reBlock.exec(html)) !== null) {
      blocks.push(String(bm[0] || ""));
      if (blocks.length >= 24) break;
    }
    if (!blocks.length) blocks.push(html.slice(0, 120000));
    var bi;
    for (bi = 0; bi < blocks.length; bi++) {
      var blk = blocks[bi];
      var reLv =
        /(?:label|name|text)\s*["']?\s*:\s*["']([^"']{1,80})["'][\s\S]{0,120}?(?:value|code|id)\s*["']?\s*:\s*["']([^"']{0,80})["']/gi;
      var m1;
      while ((m1 = reLv.exec(blk)) !== null) pushOne(m1[2], m1[1]);
      var reVl =
        /(?:value|code|id)\s*["']?\s*:\s*["']([^"']{0,80})["'][\s\S]{0,120}?(?:label|name|text)\s*["']?\s*:\s*["']([^"']{1,80})["']/gi;
      var m2;
      while ((m2 = reVl.exec(blk)) !== null) pushOne(m2[1], m2[2]);
    }
    return out.length >= 2 ? out : [];
  }

  /** HTML 원문에서 select/w-select 블록을 직접 잘라 option 파싱(커스텀 요소 대비) */
  function purchaseOrderParseStatusOptionsRegexFromHtml(html) {
    if (!html || typeof html !== "string") return [];
    var best = [];
    var reSel =
      /<select\b([^>]*?\b(?:name|id)\s*=\s*["']([^"']+)["'][^>]*?)>([\s\S]*?)<\/select>/gi;
    var m;
    while ((m = reSel.exec(html)) !== null) {
      var key = String(m[2] || "").toLowerCase();
      var inner = m[3] || "";
      if (
        key.indexOf("purchaseorderstatus") >= 0 ||
        (key.indexOf("purchase") >= 0 && key.indexOf("status") >= 0) ||
        (key.indexOf("po") >= 0 && key.indexOf("status") >= 0)
      ) {
        var opts = purchaseOrderRegexOptionsFromSelectInner(inner);
        if (opts.length >= 2 && opts.length >= best.length) best = opts;
      }
    }
    if (!best.length) {
      var reWSelect =
        /<w-select\b[^>]*\bname\s*=\s*["']purchaseOrderStatus["'][^>]*>([\s\S]*?)<\/w-select>/gi;
      var wm;
      while ((wm = reWSelect.exec(html)) !== null) {
        var innerW = wm[1] || "";
        var optsW = [];
        var ow;
        var reWOption = /<w-option\b([^>]*)>([\s\S]*?)<\/w-option>/gi;
        while ((ow = reWOption.exec(innerW)) !== null) {
          var at = ow[1] || "";
          var vm = at.match(/\bvalue\s*=\s*["']([^"']*)["']/i);
          var rawV = vm ? vm[1] : "";
          optsW.push({
            value: String(rawV),
            label: inspectWorkNormText(ow[2] || ""),
          });
        }
        if (optsW.length >= 2 && optsW.length >= best.length) best = optsW;
      }
    }
    if (!best.length) {
      var reNarrow =
        /<select\b[^>]*\bname\s*=\s*["']purchaseOrderStatus["'][^>]*>([\s\S]*?)<\/select>/gi;
      var nm;
      while ((nm = reNarrow.exec(html)) !== null) {
        var o2 = purchaseOrderRegexOptionsFromSelectInner(nm[1] || "");
        if (o2.length >= 2 && o2.length >= best.length) best = o2;
      }
    }
    return best;
  }

  function purchaseOrderScoreSelectAsPoStatus(sel) {
    if (!sel || !sel.options || sel.options.length < 2) return 0;
    var blob = inspectWorkNormText(sel.textContent || "");
    var sc = sel.options.length;
    if (/하차/.test(blob)) sc += 2;
    if (/완료|입고중|대기|취소/.test(blob)) sc += 2;
    var nm = String(sel.getAttribute("name") || sel.id || "").toLowerCase();
    if (nm.indexOf("purchase") >= 0 && nm.indexOf("status") >= 0)
      sc += 20;
    if (nm === "purchaseorderstatus") sc += 28;
    var walk = sel;
    var d;
    for (d = 0; d < 10 && walk; d++) {
      var slab = inspectWorkNormText(walk.textContent || "").slice(0, 400);
      if (/발주상태|P\.?\s*O\.?\s*상태/i.test(slab)) sc += 8;
      walk = walk.parentElement;
    }
    return sc;
  }

  function purchaseOrderOptionsFromNativeSelect(sel) {
    var out = [];
    if (!sel || !sel.querySelectorAll) return out;
    var opts = sel.querySelectorAll("option");
    var j;
    for (j = 0; j < opts.length; j++) {
      var rawV = opts[j].getAttribute("value");
      if (rawV === null) rawV = "";
      out.push({
        value: String(rawV),
        label: inspectWorkNormText(opts[j].textContent),
      });
    }
    return out;
  }

  function purchaseOrderOptionsFromWSelect(sel) {
    var out = [];
    if (!sel || !sel.querySelectorAll) return out;
    var opts = sel.querySelectorAll("w-option");
    var j;
    for (j = 0; j < opts.length; j++) {
      var rawV = opts[j].getAttribute("value");
      if (rawV === null) rawV = "";
      out.push({
        value: String(rawV),
        label: inspectWorkNormText(opts[j].textContent),
      });
    }
    return out;
  }

  function purchaseOrderOptionsFromStatusWidget(sel) {
    if (!sel) return [];
    var tag = String(sel.tagName || "").toLowerCase();
    if (tag === "w-select") return purchaseOrderOptionsFromWSelect(sel);
    return purchaseOrderOptionsFromNativeSelect(sel);
  }

  /** 발주내역 페이지의 발주상태 위젯(select/w-select)만 (이름/id 일치 · shadow 순회). */
  function purchaseOrderQueryPoStatusSelectInSubtree(scope) {
    if (!scope || typeof scope.querySelector !== "function") return null;
    try {
      var s =
        scope.querySelector('select[name="purchaseOrderStatus"]') ||
        scope.querySelector('select[name="purchaseorderstatus"]') ||
        scope.querySelector('w-select[name="purchaseOrderStatus"]') ||
        scope.querySelector('w-select[name="purchaseorderstatus"]') ||
        scope.querySelector("#purchaseOrderStatus") ||
        scope.querySelector('[id="purchaseOrderStatus"]');
      if (s) return s;
      var els = scope.querySelectorAll("*");
      var ej;
      for (ej = 0; ej < els.length; ej++) {
        var shr = els[ej].shadowRoot;
        if (!shr) continue;
        var inner = purchaseOrderQueryPoStatusSelectInSubtree(shr);
        if (inner) return inner;
      }
    } catch (eQ) {}
    return null;
  }

  /** Document 한 개에서 발주상태 옵션(라벨·value 발주내역과 동일). 없으면 []. */
  function purchaseOrderHarvestPurchaseOrderStatusOptionsStrict(doc) {
    if (!doc) return [];
    var rootTry = [];
    try {
      if (doc.documentElement)
        rootTry.push(doc.documentElement);
    } catch (eR0) {}
    try {
      if (doc.body) rootTry.push(doc.body);
    } catch (eR1) {}
    var ri;
    var sel = null;
    for (ri = 0; ri < rootTry.length && !sel; ri++) {
      sel = purchaseOrderQueryPoStatusSelectInSubtree(rootTry[ri]);
    }
    if (!sel) return [];
    var parsed = purchaseOrderOptionsFromStatusWidget(sel);
    return parsed.length >= 1 ? parsed : [];
  }

  /** 현재 탭·top·iframe 문서 각각에서 purchaseOrderStatus select 스캔 · 옵션이 가장 많은 결과 채택 */
  function purchaseOrderHarvestAllContextsStrictPoStatus() {
    var best = [];
    function bumpFromDoc(d) {
      var opts = purchaseOrderHarvestPurchaseOrderStatusOptionsStrict(d);
      if (opts.length > best.length) best = opts;
    }
    try {
      bumpFromDoc(document);
    } catch (e0) {}
    try {
      if (typeof top !== "undefined" && top && top.document && top !== window)
        bumpFromDoc(top.document);
    } catch (e1) {}
    try {
      purchaseOrderHarvestWalkIframesRecursive(document, 0, 8, bumpFromDoc);
    } catch (e2) {}
    try {
      if (typeof top !== "undefined" && top && top.document)
        purchaseOrderHarvestWalkIframesRecursive(top.document, 0, 8, bumpFromDoc);
    } catch (e3) {}
    return best;
  }

  function purchaseOrderHarvestWalkIframesRecursive(doc, depth, maxD, visitor) {
    if (depth > maxD || !doc) return;
    var ifrs;
    try {
      ifrs = doc.querySelectorAll("iframe");
    } catch (eQ) {
      return;
    }
    var ij;
    for (ij = 0; ij < ifrs.length; ij++) {
      try {
        var cw = ifrs[ij].contentWindow;
        var cd = cw && cw.document;
        if (cd) {
          visitor(cd);
          purchaseOrderHarvestWalkIframesRecursive(cd, depth + 1, maxD, visitor);
        }
      } catch (eX) {}
    }
  }

  function purchaseOrderBestStatusSelectInDoc(doc) {
    var candidates = [];
    var all = doc.querySelectorAll("select");
    var ix;
    for (ix = 0; ix < all.length; ix++) {
      var s = all[ix];
      if (String(s.tagName || "").toLowerCase() !== "select") continue;
      var score = purchaseOrderScoreSelectAsPoStatus(s);
      if (score >= 4) candidates.push({ el: s, score: score });
    }
    candidates.sort(function (a, b) {
      return b.score - a.score;
    });
    return candidates.length ? candidates[0].el : null;
  }

  function purchaseOrderParseStatusOptionsFromListHtml(html) {
    if (!html || typeof html !== "string") return [];
    var fromRegexEarly = purchaseOrderParseStatusOptionsRegexFromHtml(html);
    var fromJsPayload = purchaseOrderParseStatusOptionsFromJsPayload(html);
    var doc = new DOMParser().parseFromString(html, "text/html");
    var sel = doc.querySelector('select[name="purchaseOrderStatus"]');
    if (!sel) sel = doc.querySelector('w-select[name="purchaseOrderStatus"]');
    if (!sel) sel = doc.querySelector("select#purchaseOrderStatus");
    if (!sel) sel = doc.querySelector("w-select#purchaseOrderStatus");
    if (!sel) {
      var all = doc.querySelectorAll("select");
      var ix;
      for (ix = 0; ix < all.length; ix++) {
        var nm = String(all[ix].getAttribute("name") || "").toLowerCase();
        if (
          nm === "purchaseorderstatus" ||
          (nm.indexOf("purchase") >= 0 && nm.indexOf("status") >= 0)
        ) {
          sel = all[ix];
          break;
        }
      }
    }
    if (!sel) sel = purchaseOrderBestStatusSelectInDoc(doc);

    var parsed = sel ? purchaseOrderOptionsFromStatusWidget(sel) : [];
    if (parsed.length >= 2) return parsed;
    if (fromJsPayload.length >= 2) return fromJsPayload;
    if (fromRegexEarly.length >= 2) return fromRegexEarly;

    parsed = purchaseOrderParseStatusOptionsRegexFromHtml(html);
    if (parsed.length >= 2) return parsed;
    parsed = purchaseOrderParseStatusOptionsFromJsPayload(html);
    return parsed.length >= 2 ? parsed : [];
  }

  function purchaseOrderQueryString(startYmd, endYmd, purchaseOrderStatusOpt) {
    var p = {
      onlyRejected: "",
      skuBarcode: "",
      skuExtId: "",
      skuId: "",
      purchaseOrderStatus:
        purchaseOrderStatusOpt != null ? String(purchaseOrderStatusOpt) : "",
      undeliveredReturnInvoiceNumber: "",
      vendorName: "",
      id: "",
      externalId: "",
      purchaseOrderType: "",
      transportType: "",
      dateType: "RECEIVE_DATE",
      start: startYmd,
      end: endYmd || startYmd,
    };
    var parts = [];
    var k;
    for (k in p) {
      if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(p[k]));
    }
    return parts.join("&");
  }

  function purchaseOrderStatusDisplayLabel(valueRaw, labelRaw) {
    var v = String(valueRaw == null ? "" : valueRaw).trim().toUpperCase();
    var l = inspectWorkNormText(labelRaw == null ? "" : labelRaw).trim();
    var m = {
      PENDING: "대기",
      CANCELED: "취소",
      UNSHIPPED: "하차",
      RECEIVING: "입고중",
      FINISHED: "완료",
      CLOSED: "마감",
    };
    if (m[v]) return m[v];
    if (l) return l;
    return v || "(라벨 없음)";
  }

  function purchaseOrderItemUrl(purchaseOrderId) {
    return (
      "https://inbound.coupang.com/purchaseOrder/item?purchaseOrderId=" +
      encodeURIComponent(String(purchaseOrderId || "").trim())
    );
  }

  function purchaseOrderIsLikelySkuId(s) {
    var t = String(s || "").replace(/\s+/g, "").trim();
    return /^\d{5,14}$/.test(t);
  }

  function purchaseOrderHeaderSkuIdColumnIndex(table) {
    if (!table) return -1;
    var trHead = table.querySelector("thead tr");
    if (
      !trHead &&
      table.rows &&
      table.rows.length
    )
      trHead = table.rows[0];
    if (!trHead) return -1;
    var ths = trHead.querySelectorAll("th");
    if (!ths.length)
      return -1;
    var ci;
    for (ci = 0; ci < ths.length; ci++) {
      var lbl = inspectWorkNormText(ths[ci].textContent)
        .replace(/\s+/g, " ")
        .trim();
      if (/^sku\s*id$/i.test(lbl)) return ci;
      if (/SKU/.test(lbl) && /ID/.test(lbl)) return ci;
    }
    return -1;
  }

  /** 발주 상세 HTML에서 SKU 후보/수량 추출(발주수량 != 회송수량+입고수량 인 SKU 우선) */
  function purchaseOrderParseSkuIdsFromItemHtml(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var uniq = {};
    var diffUniq = {};
    var qtyBySku = {};
    var nameBySku = {};
    var qtyRuleDetected = false;
    function addSku(raw) {
      var s = inspectWorkNormText(raw).replace(/\s+/g, "").trim();
      if (purchaseOrderIsLikelySkuId(s)) uniq[s] = true;
    }
    function addDiffSku(raw, orderQty, returnQty, inboundQty, productName) {
      var s = inspectWorkNormText(raw).replace(/\s+/g, "").trim();
      if (!purchaseOrderIsLikelySkuId(s)) return;
      diffUniq[s] = true;
      if (!qtyBySku[s]) qtyBySku[s] = { orderQty: 0, returnQty: 0, inboundQty: 0 };
      if (isFinite(orderQty)) qtyBySku[s].orderQty += Number(orderQty);
      if (isFinite(returnQty)) qtyBySku[s].returnQty += Number(returnQty);
      if (isFinite(inboundQty)) qtyBySku[s].inboundQty += Number(inboundQty);
      var nm = inspectWorkNormText(productName || "").trim();
      if (nm && !nameBySku[s]) nameBySku[s] = nm;
    }
    var aq = doc.querySelectorAll(
      'a[href*="/sku/"], a[href*="inventory.coupang.com"]'
    );
    var qi;
    for (qi = 0; qi < aq.length; qi++) {
      var href = String(aq[qi].getAttribute("href") || "");
      var m = href.match(/\/sku\/(\d{5,14})(?:\?|\/|$|\b)/i);
      if (m) addSku(m[1]);
    }
    var tables = doc.querySelectorAll('table[is="w-table"], table');
    var ti;
    for (ti = 0; ti < tables.length; ti++) {
      var tbl = tables[ti];
      var idx = purchaseOrderHeaderSkuIdColumnIndex(tbl);
      if (idx < 0) continue;
      var trs = tbl.querySelectorAll("tbody tr");
      var ri;
      for (ri = 0; ri < trs.length; ri++) {
        var tds = trs[ri].querySelectorAll("td");
        if (tds.length <= idx) continue;
        addSku(inspectWorkCellText(tds[idx]));
      }

      var aoa = unloadGapPadRows(unloadGapTableToAoa(tbl));
      var hr;
      for (hr = 0; hr < Math.min(20, aoa.length); hr++) {
        var headers = aoa[hr].map(function (c) {
          return inspectWorkNormText(c).replace(/\s+/g, "");
        });
        var idxSku = unloadGapFindCol(headers, ["SKUID", "SKU ID", "상품ID"]);
        var idxOrder = unloadGapFindCol(headers, ["발주수량", "발주"]);
        var idxReturn = unloadGapFindCol(headers, ["회송수량", "회송"]);
        var idxInbound = unloadGapFindCol(headers, ["입고수량", "입고"]);
        var idxName = unloadGapFindCol(headers, ["상품명", "상품"]);
        if (idxSku < 0 || idxOrder < 0 || idxReturn < 0 || idxInbound < 0)
          continue;
        qtyRuleDetected = true;
        var rr;
        for (rr = hr + 1; rr < aoa.length; rr++) {
          var row = aoa[rr];
          if (
            row.length <= idxSku ||
            row.length <= idxOrder ||
            row.length <= idxReturn ||
            row.length <= idxInbound
          )
            continue;
          var skuRaw = String(row[idxSku] || "").trim();
          if (!skuRaw) continue;
          var orderQty = unloadGapNum(row[idxOrder]);
          var returnQty = unloadGapNum(row[idxReturn]);
          var inboundQty = unloadGapNum(row[idxInbound]);
          var nameRaw = idxName >= 0 && row.length > idxName ? row[idxName] : "";
          if (!isFinite(orderQty) || !isFinite(returnQty) || !isFinite(inboundQty))
            continue;
          var diff = orderQty - (returnQty + inboundQty);
          if (Math.abs(diff) > 0.000001)
            addDiffSku(skuRaw, orderQty, returnQty, inboundQty, nameRaw);
        }
        break;
      }
    }
    var finalKeys = qtyRuleDetected ? Object.keys(diffUniq) : Object.keys(uniq);
    finalKeys.sort(function (a, b) {
      return Number(a) - Number(b);
    });
    return {
      skuIds: finalKeys,
      qtyBySku: qtyBySku,
      nameBySku: nameBySku,
      qtyRuleDetected: qtyRuleDetected,
    };
  }

  function purchaseOrderPagingUrl(apiPage, queryStringWithoutPage) {
    return (
      "https://inbound.coupang.com/purchaseOrder/v2/paging?page=" +
      encodeURIComponent(String(apiPage)) +
      "&" +
      queryStringWithoutPage
    );
  }

  function purchaseOrderParseRowsFromHtml(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var table = doc.querySelector('table[is="w-table"]');
    if (!table) return [];
    var trs = table.querySelectorAll("tbody tr");
    var rows = [];
    var r;
    var tr;
    var tds;
    for (r = 0; r < trs.length; r++) {
      tr = trs[r];
      tds = tr.querySelectorAll("td");
      if (tds.length < 14) continue;
      rows.push({
        externalPoId: inspectWorkCellText(tds[0]),
        purchaseOrderId: inspectWorkCellText(tds[1]),
        poType: inspectWorkCellText(tds[2]),
        vendor: inspectWorkCellText(tds[3]),
        poStatus: inspectWorkCellText(tds[4]),
        orderDate: inspectWorkCellText(tds[5]),
        transportType: inspectWorkCellText(tds[6]),
        receiveDue: inspectWorkCellText(tds[7]),
        skuKinds: inspectWorkCellText(tds[8]),
        orderQty: inspectWorkCellText(tds[9]),
        returnQty: inspectWorkCellText(tds[10]),
        inboundQty: inspectWorkCellText(tds[11]),
        displayOkQty: inspectWorkCellText(tds[12]),
        displayErrQty: inspectWorkCellText(tds[13]),
      });
    }
    return rows;
  }

  function purchaseOrderFirstRowSig(html) {
    var rows = purchaseOrderParseRowsFromHtml(html);
    if (!rows.length) return "";
    var o = rows[0];
    return [o.externalPoId, o.purchaseOrderId, o.poStatus].join("|");
  }

  /** 발주 목록 v2/paging 전 페이지(검색 쿼리 문자열 q는 page 제외 모든 파라미터) */
  async function purchaseOrderGmFetchAllListRows(qFull, cfg) {
    cfg = cfg || {};
    var shouldStop =
      typeof cfg.shouldStop === "function"
        ? cfg.shouldStop
        : function () {
            return false;
          };
    var sleepFn =
      typeof cfg.sleepFn === "function"
        ? cfg.sleepFn
        : async function () {
            await unloadSleep(INSPECT_WORK_REQ_GAP_MS);
            return true;
          };
    var hdr = purchaseOrderReqHeaders();

    var html0 = await gmGet(purchaseOrderPagingUrl(0, qFull), hdr);
    if (!html0) return [];
    var lastUi = unloadParseMaxPageFromHtml(html0);
    lastUi = Math.min(Math.max(1, lastUi), PURCHASE_ORDER_PAGE_CAP);
    var totalApi = lastUi;
    var out = [];
    var page0rows = purchaseOrderParseRowsFromHtml(html0);
    var i;
    for (i = 0; i < page0rows.length; i++) out.push(page0rows[i]);
    var firstSig = purchaseOrderFirstRowSig(html0);

    var apiP;
    for (apiP = 1; apiP < totalApi; apiP++) {
      if (shouldStop()) break;
      var ok = await sleepFn();
      if (!ok || shouldStop()) break;

      var pageHtml = await gmGet(
        purchaseOrderPagingUrl(apiP, qFull),
        hdr
      );
      if (!pageHtml) break;

      var nextSig = purchaseOrderFirstRowSig(pageHtml);
      if (
        firstSig &&
        nextSig &&
        firstSig === nextSig &&
        apiP > 0
      )
        break;

      var pr = purchaseOrderParseRowsFromHtml(pageHtml);
      for (i = 0; i < pr.length; i++) out.push(pr[i]);
    }

    await wPagedHtmlExtendFetchMore({
      nextPageZeroBased: totalApi,
      maxPageExclusive: PURCHASE_ORDER_PAGE_CAP,
      shouldStop: shouldStop,
      sleepFn: sleepFn,
      fetchHtml: function (pz) {
        return gmGet(purchaseOrderPagingUrl(pz, qFull), hdr);
      },
      parseRows: purchaseOrderParseRowsFromHtml,
      sigFromHtml: purchaseOrderFirstRowSig,
      baselineSig: firstSig,
      pushRow: function (rw) {
        out.push(rw);
      },
    });

    return out;
  }

  async function poSkuPipelineSleepInterruptible(ms) {
    var step = 100;
    var left = ms;
    while (left > 0) {
      if (poSkuPipelineStopRequested) return false;
      await unloadSleep(Math.min(step, left));
      left -= step;
    }
    return true;
  }

  function mergedPoSkuInspectRowsToTsv(mrows) {
    var header = [
      "SKU_ID조회값",
      "A_외부발주번호",
      "A_발주번호",
      "B_검품번호",
      "B_상태",
      "B_IBC",
      "B_외부발주번호",
      "B_업체",
      "B_입고수량",
      "B_하차일시",
      "B_상품명",
    ].join("\t");
    var lines = [header];
    var i;
    for (i = 0; i < mrows.length; i++) {
      var r = mrows[i];
      lines.push(
        [
          inspectWorkTsvEscape(r.skuQuery),
          inspectWorkTsvEscape(r.externalPoCsv),
          inspectWorkTsvEscape(r.poIdCsv),
          inspectWorkTsvEscape(r.inspectNo),
          inspectWorkTsvEscape(r.inspectStatus),
          inspectWorkTsvEscape(r.ibc),
          inspectWorkTsvEscape(r.poExtB),
          inspectWorkTsvEscape(r.vendorB),
          inspectWorkTsvEscape(r.inboundQty),
          inspectWorkTsvEscape(r.unloadDt),
          inspectWorkTsvEscape(r.productName),
        ].join("\t")
      );
    }
    return lines.join("\n");
  }

  /** 이관 엑셀(3종): 메인(/)에서 fetch — 목록 경로에는 패널 비표시 */
  function initTransferOpExcelPane(hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.className = "yna4-pane-mod yna4-pane-mod--transfer-excel";

    var statusId = ROOT_ID + "-transfer-excel-status";
    var running = false;
    var transferAllStopRequested = false;
    var transferAllInProgress = false;

    var UNLOAD_DATE_TYPE = "UNLOAD_COMPLETED_DATE";
    var UPLOAD_DATE_TYPE = "UPLOAD_COMPLETED_DATE";
    /** Network 캡처 기준 (이관 목록 엑셀) */
    var TRANSFER_EXCEL_STATUS = {
      stowWait: "UNLOAD",
      stowing: "STOW",
      moving: "LOAD",
    };
    /** SharePoint SLA 파일 — UniqueId 바뀌면 이 URL만 수정 */
    var SHAREPOINT_SLA_DOWNLOAD_URL =
      "https://coupangfsnam.sharepoint.com/sites/FreshFinanceR2/_layouts/15/download.aspx?UniqueId=c972c179-6a01-4f19-a943-c8f8cd790968";

    var TRANSFER_EXCEL_MAX_INCLUSIVE_DAYS = 3;
    /** zip(xlsx)이고 크기가 이 값 이하일 때만 ‘빈 템플릿’으로 보고 저장 생략. 그보다 크면 행이 적어도 저장(오인 방지) */
    var TRANSFER_EXCEL_EMPTY_ZIP_BYTES_MAX = 3200;

    function isInboundIbRoot() {
      try {
        if (location.protocol !== "https:") return false;
        if (!/^inbound\.coupang\.com$/i.test(location.hostname || "")) {
          return false;
        }
        var p = location.pathname || "";
        if (p.length > 1 && p.charAt(p.length - 1) === "/") {
          p = p.slice(0, -1);
        }
        return p === "" || p === "/";
      } catch (eR) {
        return false;
      }
    }

    function setStatus(msg) {
      var el = document.getElementById(statusId);
      if (el) el.textContent = msg;
    }

    function transferSleepInterruptible(ms) {
      ms = Math.max(0, Math.floor(Number(ms) || 0));
      var step = 120;
      return new Promise(function (resolve) {
        var elapsed = 0;
        var tick = function () {
          if (transferAllStopRequested) {
            resolve();
            return;
          }
          if (elapsed >= ms) {
            resolve();
            return;
          }
          var chunk = Math.min(step, ms - elapsed);
          elapsed += chunk;
          setTimeout(tick, chunk);
        };
        tick();
      });
    }

    function transferDefaultStartYmd() {
      var d = new Date();
      d.setDate(d.getDate() - 2);
      return unloadYmdFromDate(d);
    }

    function transferOpParseYmd(ymd) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
      if (!m) return null;
      var y = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10) - 1;
      var d = parseInt(m[3], 10);
      var dt = new Date(y, mo, d);
      if (
        dt.getFullYear() !== y ||
        dt.getMonth() !== mo ||
        dt.getDate() !== d
      ) {
        return null;
      }
      return dt;
    }

    /** 끝 날짜 기준으로 최대 maxInclusive일(포함)씩 잘라 구간 배열(시간순) */
    function transferOpSplitInclusiveRanges(startYmd, endYmd, maxInclusive) {
      var maxD = Math.max(1, Math.floor(Number(maxInclusive) || 3));
      var start = transferOpParseYmd(startYmd);
      var end = transferOpParseYmd(endYmd);
      if (!start || !end) return [];
      var t0 = start.getTime();
      var t1 = end.getTime();
      if (t1 < t0) return [];
      var out = [];
      var curEnd = new Date(t1);
      while (true) {
        var chunkEnd = new Date(curEnd.getTime());
        var chunkStart = new Date(chunkEnd.getTime());
        chunkStart.setDate(chunkStart.getDate() - (maxD - 1));
        if (chunkStart.getTime() < t0) {
          chunkStart = new Date(t0);
        }
        out.unshift({
          start: unloadYmdFromDate(chunkStart),
          end: unloadYmdFromDate(chunkEnd),
        });
        if (chunkStart.getTime() <= t0) break;
        curEnd = new Date(chunkStart.getTime());
        curEnd.setDate(curEnd.getDate() - 1);
      }
      return out;
    }

    async function transferOpBlobLooksEmptyExport(blob) {
      try {
        if (!blob || blob.size === 0) return true;
        if (blob.size > TRANSFER_EXCEL_EMPTY_ZIP_BYTES_MAX) return false;
        var head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
        var zip = head[0] === 0x50 && head[1] === 0x4b;
        if (!zip) return false;
        return true;
      } catch (e) {
        return false;
      }
    }

    function transferOpReadU16(u8, pos) {
      return (u8[pos] | (u8[pos + 1] << 8)) >>> 0;
    }

    function transferOpReadU32(u8, pos) {
      return (
        (u8[pos] |
          (u8[pos + 1] << 8) |
          (u8[pos + 2] << 16) |
          (u8[pos + 3] << 24)) >>>
        0
      );
    }

    function transferOpZipFindEocdPos(u8) {
      var lo = Math.max(0, u8.length - (65557 + 22));
      for (var p = u8.length - 22; p >= lo; p--) {
        if (
          u8[p] === 0x50 &&
          u8[p + 1] === 0x4b &&
          u8[p + 2] === 0x05 &&
          u8[p + 3] === 0x06
        ) {
          return p;
        }
      }
      return -1;
    }

    async function transferOpInflateRawDeflateBytes(comp) {
      try {
        var ds = new DecompressionStream("deflate-raw");
        var out = await new Response(
          new Blob([comp]).stream().pipeThrough(ds)
        ).arrayBuffer();
        return new Uint8Array(out);
      } catch (eRaw) {
        try {
          var ds2 = new DecompressionStream("deflate");
          var out2 = await new Response(
            new Blob([comp]).stream().pipeThrough(ds2)
          ).arrayBuffer();
          return new Uint8Array(out2);
        } catch (eZ) {
          return null;
        }
      }
    }

    async function transferOpZipExtractEntryBytes(u8, wantPath) {
      var eocd = transferOpZipFindEocdPos(u8);
      if (eocd < 0) return null;
      var cdSize = transferOpReadU32(u8, eocd + 12);
      var cdOff = transferOpReadU32(u8, eocd + 16);
      if (!cdSize || cdOff >= u8.length) return null;
      var endCd = cdOff + cdSize;
      var p = cdOff;
      while (p + 46 <= endCd && p + 46 <= u8.length) {
        if (transferOpReadU32(u8, p) !== 0x02014b50) break;
        var compSize = transferOpReadU32(u8, p + 20);
        var nameLen = transferOpReadU16(u8, p + 28);
        var extraLen = transferOpReadU16(u8, p + 30);
        var commentLen = transferOpReadU16(u8, p + 32);
        var localOff = transferOpReadU32(u8, p + 42);
        if (p + 46 + nameLen > u8.length) break;
        var nameBytes = u8.subarray(p + 46, p + 46 + nameLen);
        var name = "";
        try {
          name = new TextDecoder("utf-8").decode(nameBytes);
        } catch (eN) {
          name = "";
        }
        if (name === wantPath) {
          if (localOff + 30 > u8.length) return null;
          if (transferOpReadU32(u8, localOff) !== 0x04034b50) return null;
          var lm = transferOpReadU16(u8, localOff + 8);
          var lcompSize = transferOpReadU32(u8, localOff + 18);
          var lnameLen = transferOpReadU16(u8, localOff + 26);
          var lextLen = transferOpReadU16(u8, localOff + 28);
          var dataStart = localOff + 30 + lnameLen + lextLen;
          var useComp = lcompSize > 0 ? lcompSize : compSize;
          if (dataStart + useComp > u8.length) return null;
          var compData = u8.subarray(dataStart, dataStart + useComp);
          if (lm === 0) {
            return compData;
          }
          if (lm === 8) {
            return await transferOpInflateRawDeflateBytes(compData);
          }
          return null;
        }
        p += 46 + nameLen + extraLen + commentLen;
      }
      return null;
    }

    function transferOpSheetXmlLooksHeaderOnly(s) {
      if (!s || typeof s !== "string") return false;
      var m = /<sheetData[^>]*>([\s\S]*?)<\/sheetData>/i.exec(s);
      if (!m) return false;
      var inner = m[1].replace(/\s+/g, " ").trim();
      if (!inner) return true;
      var maxR = 0;
      var re = /<row[^>]*\br="(\d+)"/gi;
      var mm;
      while ((mm = re.exec(s)) !== null) {
        var n = parseInt(mm[1], 10);
        if (isFinite(n) && n > maxR) maxR = n;
      }
      if (maxR > 0) return maxR <= 1;
      var nRows = (s.match(/<row\b/gi) || []).length;
      return nRows <= 1;
    }

    async function transferOpXlsxLooksHeaderOnlyOrEmpty(blob) {
      try {
        var u8 = new Uint8Array(await blob.arrayBuffer());
        var dec = await transferOpZipExtractEntryBytes(
          u8,
          "xl/worksheets/sheet1.xml"
        );
        if (!dec || !dec.length) return false;
        var txt = new TextDecoder("utf-8").decode(dec);
        return transferOpSheetXmlLooksHeaderOnly(txt);
      } catch (e) {
        return false;
      }
    }

    function transferOpBuildExcelQueryString(opts) {
      var o = opts || {};
      var p = new URLSearchParams();
      p.set("skuBarcode", "");
      p.set("skuExternalId", "");
      p.set("skuId", "");
      p.set("vehicleNumber", "");
      p.set("status", o.status != null ? String(o.status) : "");
      p.set("containerBarcode", "");
      p.set("transferCartPriority", "");
      p.set("toCenterCode", o.toCenterCode || "");
      p.set("centerCode", "");
      p.set("transferAllocationType", "");
      p.set("transferPlanExternalId", "");
      p.set("cartBarcode", "");
      p.set("searchDateType", o.searchDateType || UNLOAD_DATE_TYPE);
      p.set("end", o.end || "");
      p.set("start", o.start || "");
      return p.toString();
    }

    function transferOpPad2(n) {
      var x = Math.floor(Number(n));
      if (!isFinite(x) || x < 0) x = 0;
      return (x < 10 ? "0" : "") + x;
    }

    /** 다운로드 요청 시각(로컬) — 파일명용, `:` 미사용 */
    function transferOpFormatRequestTimestamp(d) {
      var dt = d instanceof Date ? d : new Date();
      return (
        dt.getFullYear() +
        "-" +
        transferOpPad2(dt.getMonth() + 1) +
        "-" +
        transferOpPad2(dt.getDate()) +
        "_" +
        transferOpPad2(dt.getHours()) +
        transferOpPad2(dt.getMinutes()) +
        transferOpPad2(dt.getSeconds())
      );
    }

    function transferOpBuildDownloadFilename(blob, reqAt, downloadLabelKr) {
      var ext = ".xlsx";
      try {
        var ct = (blob && blob.type) || "";
        if (
          ct.indexOf("sheet") === -1 &&
          ct.indexOf("zip") === -1 &&
          ct.indexOf("excel") === -1 &&
          ct.indexOf("octet-stream") === -1
        ) {
          ext = ".bin";
        }
      } catch (eCt) {}
      return (
        transferOpFormatRequestTimestamp(reqAt) +
        "_" +
        String(downloadLabelKr || "").trim() +
        ext
      );
    }

    function transferOpSaveBlob(blob, filename) {
      var u = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = u;
      a.download = filename;
      a.style.cssText = "position:fixed;left:-99px;top:0;";
      document.body.appendChild(a);
      try {
        a.click();
      } catch (eA) {}
      setTimeout(function () {
        try {
          URL.revokeObjectURL(u);
        } catch (eR) {}
        try {
          a.remove();
        } catch (eR2) {}
      }, 2500);
    }

    async function transferOpFetchExcelOnce(queryString, downloadLabelKr, fetchOpt) {
      fetchOpt = fetchOpt || {};
      var reqAt = new Date();
      var origin = location.origin || "https://inbound.coupang.com";
      var apiPath = "/transfer/admin/operation/list/excel";
      var url = origin + apiPath + "?" + queryString;
      var res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) {
        throw new Error(apiPath + " → HTTP " + res.status);
      }
      var blob = await res.blob();
      if (blob && blob.size < 400) {
        var peek = await blob.slice(0, 500).text();
        if (/^[\s\S]{0,500}<\s*html/i.test(peek)) {
          throw new Error(apiPath + " → HTML 응답(권한·파라미터 확인)");
        }
      }
      var looksTiny = await transferOpBlobLooksEmptyExport(blob);
      if (looksTiny) {
        return { saved: false, reason: "tiny" };
      }
      if (fetchOpt.skipIfHeaderOnlySheet) {
        var headOnly = await transferOpXlsxLooksHeaderOnlyOrEmpty(blob);
        if (headOnly) {
          return { saved: false, reason: "headerOnly" };
        }
      }
      transferOpSaveBlob(
        blob,
        transferOpBuildDownloadFilename(blob, reqAt, downloadLabelKr)
      );
      return { saved: true };
    }

    function gmXhrSharePointSlaGet(url) {
      return new Promise(function (resolve, reject) {
        if (typeof GM_xmlhttpRequest !== "function") {
          reject(new Error("GM_xmlhttpRequest 필요"));
          return;
        }
        var referer =
          "https://coupangfsnam.sharepoint.com/sites/FreshFinanceR2/Shared%20Documents/Forms/AllItems.aspx";
        GM_xmlhttpRequest({
          method: "GET",
          url: url,
          anonymous: false,
          responseType: "arraybuffer",
          timeout: 120000,
          headers: {
            Accept:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8",
            Referer: referer,
          },
          onload: function (r) {
            if (r.status < 200 || r.status >= 400) {
              reject(new Error("SLA HTTP " + r.status));
              return;
            }
            var ab = r.response;
            if (!ab || !(ab instanceof ArrayBuffer) || ab.byteLength === 0) {
              reject(new Error("SLA 빈 응답"));
              return;
            }
            resolve({
              arrayBuffer: ab,
              responseHeaders: r.responseHeaders || "",
            });
          },
          onerror: function () {
            reject(new Error("SLA 네트워크 오류"));
          },
          ontimeout: function () {
            reject(new Error("SLA 타임아웃(120s)"));
          },
        });
      });
    }

    function spoParseContentTypeFromXhrHeaders(h) {
      if (!h) return "";
      var m = /content-type:\s*([^\r\n]+)/i.exec(h);
      return m && m[1] ? m[1].trim().split(";")[0] : "";
    }

    var rowDate = document.createElement("div");
    rowDate.className = "yna4-pane-row";
    var labDate = document.createElement("span");
    labDate.className = "yna4-pane-k";
    labDate.textContent = "기간";
    var inpStart = document.createElement("input");
    inpStart.type = "date";
    inpStart.id = ROOT_ID + "-transfer-excel-start";
    inpStart.className = "yna4-pane-inp";
    inpStart.style.maxWidth = "11em";
    inpStart.value = transferDefaultStartYmd();
    inpStart.style.marginRight = "6px";
    var inpEnd = document.createElement("input");
    inpEnd.type = "date";
    inpEnd.id = ROOT_ID + "-transfer-excel-end";
    inpEnd.className = "yna4-pane-inp";
    inpEnd.style.maxWidth = "11em";
    inpEnd.value = unloadTodayYmd();
    rowDate.appendChild(labDate);
    rowDate.appendChild(inpStart);
    rowDate.appendChild(inpEnd);

    var rowTo = document.createElement("div");
    rowTo.className = "yna4-pane-row";
    var labTo = document.createElement("span");
    labTo.className = "yna4-pane-k";
    labTo.textContent = "받는 센터";
    var toCenterInp = document.createElement("input");
    toCenterInp.type = "text";
    toCenterInp.id = ROOT_ID + "-transfer-excel-to-center";
    toCenterInp.className = "yna4-pane-inp";
    toCenterInp.style.flex = "1";
    toCenterInp.style.minWidth = "8em";
    toCenterInp.style.maxWidth = "14em";
    toCenterInp.placeholder = "센터코드 직접 입력";
    toCenterInp.value = "YAN4";
    rowTo.appendChild(labTo);
    rowTo.appendChild(toCenterInp);

    function getToCenterCode() {
      return String(toCenterInp.value || "").trim();
    }

    var btnRow = document.createElement("div");
    btnRow.className = "yna4-pane-actions";
    btnRow.style.flexWrap = "wrap";

    function mkBtn(label, primary) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.className =
        "yna4-pane-btn yna4-pane-btn--compact" +
        (primary ? " yna4-pane-btn--primary" : "");
      return b;
    }

    var b1 = mkBtn("① 진열대기", false);
    var b2 = mkBtn("② 진열중", false);
    var b3 = mkBtn("③ 이동중", false);
    var b4 = mkBtn("④ SLA파일", false);
    var bAll = mkBtn("전체다운로드", true);
    var bStop = mkBtn("작업 중지", false);
    bStop.classList.add("yna4-pane-btn--danger");
    bStop.disabled = true;

    var gateOk = isInboundIbRoot();
    if (!gateOk) {
      b1.disabled = true;
      b2.disabled = true;
      b3.disabled = true;
      b4.disabled = true;
      bAll.disabled = true;
      bStop.disabled = true;
    }

    btnRow.appendChild(b1);
    btnRow.appendChild(b2);
    btnRow.appendChild(b3);
    btnRow.appendChild(b4);
    btnRow.appendChild(bAll);
    btnRow.appendChild(bStop);

    var status = document.createElement("div");
    status.id = statusId;
    status.className = "yna4-pane-status";
    status.textContent = "대기";

    hostEl.appendChild(rowDate);
    hostEl.appendChild(rowTo);
    hostEl.appendChild(btnRow);
    hostEl.appendChild(status);

    async function runTransferExcelPreset(preset, opt) {
      opt = opt || {};
      if (!opt.skipGuard && running) return;
      if (!isInboundIbRoot()) {
        return;
      }
      var toCode = getToCenterCode();
      if (!toCode) {
        alert("받는 센터 코드를 입력하세요.");
        return;
      }
      var startY = inpStart.value;
      var endY = inpEnd.value;
      if (!startY || !endY) {
        alert("기간(시작·종료)을 입력하세요.");
        return;
      }

      var chunks = transferOpSplitInclusiveRanges(
        startY,
        endY,
        TRANSFER_EXCEL_MAX_INCLUSIVE_DAYS
      );
      if (!chunks.length) {
        alert("기간(날짜)이 올바르지 않거나 시작이 종료보다 늦습니다.");
        return;
      }

      var ownLock = !opt.skipUiLock;
      var prevDisabled = null;
      if (ownLock) {
        running = true;
        prevDisabled = [
          b1.disabled,
          b2.disabled,
          b3.disabled,
          b4.disabled,
          bAll.disabled,
        ];
        b1.disabled = true;
        b2.disabled = true;
        b3.disabled = true;
        b4.disabled = true;
        bAll.disabled = true;
      }

      var label = preset.label;

      try {
        var savedAny = false;
        var skippedAny = false;
        var ci;
        for (ci = 0; ci < chunks.length; ci++) {
          if (opt.respectStop && transferAllStopRequested) {
            return;
          }
          var ch = chunks[ci];
          var qs = transferOpBuildExcelQueryString({
            searchDateType: preset.searchDateType,
            start: ch.start,
            end: ch.end,
            toCenterCode: toCode,
            status: preset.statusEnum != null ? String(preset.statusEnum) : "",
          });
          var fnSuffix =
            chunks.length > 1 ? "_" + (ci + 1) : "";
          setStatus(
            label +
              " — 엑셀 요청…" +
              (chunks.length > 1
                ? " (" +
                  (ci + 1) +
                  "/" +
                  chunks.length +
                  " " +
                  ch.start +
                  "~" +
                  ch.end +
                  ")"
                : "")
          );
          var r = await transferOpFetchExcelOnce(
            qs,
            preset.downloadLabel + fnSuffix,
            { skipIfHeaderOnlySheet: true }
          );
          if (r && r.saved) {
            savedAny = true;
          } else {
            skippedAny = true;
            var skipPrefix =
              r && r.reason === "headerOnly"
                ? "헤더만(데이터 행 없음·저장 생략) · "
                : "데이터 없음(저장 생략) · ";
            setStatus(
              skipPrefix +
                label +
                (chunks.length > 1 ? " " + ch.start + "~" + ch.end : "")
            );
          }
        }
        if (opt.respectStop && transferAllStopRequested) {
          return;
        }
        if (!savedAny) {
          setStatus("저장 없음 · " + label + " (표 없음)");
        } else if (skippedAny) {
          setStatus("완료 · " + label + " (일부 구간 생략)");
        } else {
          setStatus("완료 · " + label);
        }
      } catch (eRun) {
        setStatus("오류");
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 transfer excel API]", eRun);
        }
        alert(String(eRun && eRun.message ? eRun.message : eRun));
      } finally {
        if (ownLock) {
          running = false;
          b1.disabled = prevDisabled[0];
          b2.disabled = prevDisabled[1];
          b3.disabled = prevDisabled[2];
          b4.disabled = prevDisabled[3];
          bAll.disabled = prevDisabled[4];
        }
      }
    }

    b1.addEventListener("click", function () {
      runTransferExcelPreset({
        label: "하차완료·진열대기",
        searchDateType: UNLOAD_DATE_TYPE,
        statusEnum: TRANSFER_EXCEL_STATUS.stowWait,
        downloadLabel: "진열대기",
      });
    });
    b2.addEventListener("click", function () {
      runTransferExcelPreset({
        label: "하차완료·진열중",
        searchDateType: UNLOAD_DATE_TYPE,
        statusEnum: TRANSFER_EXCEL_STATUS.stowing,
        downloadLabel: "진열중",
      });
    });
    b3.addEventListener("click", function () {
      runTransferExcelPreset({
        label: "상차완료·이동중",
        searchDateType: UPLOAD_DATE_TYPE,
        statusEnum: TRANSFER_EXCEL_STATUS.moving,
        downloadLabel: "이동중",
      });
    });
    bStop.addEventListener("click", function () {
      if (!transferAllInProgress) return;
      transferAllStopRequested = true;
      setStatus("작업 중지 요청…");
    });
    bAll.addEventListener("click", async function () {
      if (running) return;
      if (!isInboundIbRoot()) {
        return;
      }
      transferAllStopRequested = false;
      transferAllInProgress = true;
      running = true;
      var pd = [
        b1.disabled,
        b2.disabled,
        b3.disabled,
        b4.disabled,
        bAll.disabled,
        bStop.disabled,
      ];
      b1.disabled = true;
      b2.disabled = true;
      b3.disabled = true;
      b4.disabled = true;
      bAll.disabled = true;
      bStop.disabled = false;
      try {
        await runTransferExcelPreset(
          {
            label: "① 진열대기",
            searchDateType: UNLOAD_DATE_TYPE,
            statusEnum: TRANSFER_EXCEL_STATUS.stowWait,
            downloadLabel: "진열대기",
          },
          { skipGuard: true, skipUiLock: true, respectStop: true }
        );
        if (transferAllStopRequested) {
          setStatus("작업 중지됨 (①까지 완료)");
          return;
        }
        await transferSleepInterruptible(1200);
        if (transferAllStopRequested) {
          setStatus("작업 중지됨 (①까지 완료)");
          return;
        }
        await runTransferExcelPreset(
          {
            label: "② 진열중",
            searchDateType: UNLOAD_DATE_TYPE,
            statusEnum: TRANSFER_EXCEL_STATUS.stowing,
            downloadLabel: "진열중",
          },
          { skipGuard: true, skipUiLock: true, respectStop: true }
        );
        if (transferAllStopRequested) {
          setStatus("작업 중지됨 (②까지 완료)");
          return;
        }
        await transferSleepInterruptible(1200);
        if (transferAllStopRequested) {
          setStatus("작업 중지됨 (②까지 완료)");
          return;
        }
        await runTransferExcelPreset(
          {
            label: "③ 이동중",
            searchDateType: UPLOAD_DATE_TYPE,
            statusEnum: TRANSFER_EXCEL_STATUS.moving,
            downloadLabel: "이동중",
          },
          { skipGuard: true, skipUiLock: true, respectStop: true }
        );
        if (transferAllStopRequested) {
          setStatus("작업 중지됨 (③까지 완료)");
          return;
        }
        await transferSleepInterruptible(1200);
        if (transferAllStopRequested) {
          setStatus("작업 중지됨 (③까지 완료)");
          return;
        }
        await runSlaSharePointExcelDownload({ skipUiLock: true });
        if (!transferAllStopRequested) {
          setStatus("전체 다운로드 완료 (①②③④)");
        } else {
          setStatus("작업 중지 요청됨(SLA는 완료)");
        }
      } catch (eAll) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 transfer excel all]", eAll);
        }
      } finally {
        transferAllInProgress = false;
        transferAllStopRequested = false;
        running = false;
        b1.disabled = pd[0];
        b2.disabled = pd[1];
        b3.disabled = pd[2];
        b4.disabled = pd[3];
        bAll.disabled = pd[4];
        bStop.disabled = pd[5];
      }
    });

    async function runSlaSharePointExcelDownload(opt) {
      opt = opt || {};
      var ownLock = !opt.skipUiLock;
      var prevDis = null;
      if (ownLock) {
        running = true;
        prevDis = [
          b1.disabled,
          b2.disabled,
          b3.disabled,
          b4.disabled,
          bAll.disabled,
        ];
        b1.disabled = true;
        b2.disabled = true;
        b3.disabled = true;
        b4.disabled = true;
        bAll.disabled = true;
      }
      try {
        setStatus("④ SLA — 다운로드…");
        var reqAt = new Date();
        var baseFn = transferOpFormatRequestTimestamp(reqAt) + "_SLA.xlsx";
        var isChromeExt =
          typeof chrome !== "undefined" &&
          chrome.runtime &&
          typeof chrome.runtime.id === "string" &&
          typeof chrome.runtime.sendMessage === "function";
        if (isChromeExt) {
          await new Promise(function (resolve, reject) {
            chrome.runtime.sendMessage(
              {
                type: "yan4SlaDownload",
                url: SHAREPOINT_SLA_DOWNLOAD_URL,
                filename: baseFn,
              },
              function (resp) {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                  return;
                }
                if (resp && resp.ok) resolve();
                else
                  reject(
                    new Error((resp && resp.error) || "다운로드 시작 실패")
                  );
              }
            );
          });
        } else {
          if (typeof GM_xmlhttpRequest !== "function") {
            throw new Error(
              "GM_xmlhttpRequest 필요(Tampermonkey @grant·@connect)"
            );
          }
          var pack = await gmXhrSharePointSlaGet(SHAREPOINT_SLA_DOWNLOAD_URL);
          var ct =
            spoParseContentTypeFromXhrHeaders(pack.responseHeaders) ||
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          if (pack.arrayBuffer.byteLength < 800) {
            var peek = new TextDecoder("utf-8", { fatal: false }).decode(
              new Uint8Array(pack.arrayBuffer.slice(0, 500))
            );
            if (/^[\s\S]{0,500}<\s*html/i.test(peek)) {
              throw new Error("HTML 응답(SharePoint 로그인·권한 확인)");
            }
          }
          var blob = new Blob([pack.arrayBuffer], { type: ct });
          transferOpSaveBlob(blob, baseFn);
        }
        setStatus("완료 · ④ SLA");
      } catch (eSla) {
        setStatus("오류");
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 SLA SharePoint]", eSla);
        }
        alert("SLA: " + (eSla && eSla.message ? eSla.message : String(eSla)));
      } finally {
        if (ownLock) {
          running = false;
          b1.disabled = prevDis[0];
          b2.disabled = prevDis[1];
          b3.disabled = prevDis[2];
          b4.disabled = prevDis[3];
          bAll.disabled = prevDis[4];
        }
      }
    }

    b4.addEventListener("click", function () {
      runSlaSharePointExcelDownload({});
    });
  }
  /** 발주내역 카드 — 발주상태·입고예정일·소스 A/B·통합 파이프라인 */
  function initPoSkuComparePane(hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.className = "yna4-pane-mod yna4-pane-mod--po-sku";

    var statusId = ROOT_ID + "-po-sku-compare-status";

    function setStatus(msg) {
      var el = document.getElementById(statusId);
      if (el) el.textContent = msg;
    }


    var aRow = document.createElement("div");
    aRow.className = "yna4-pane-row";
    var aLab = document.createElement("span");
    aLab.className = "yna4-pane-k";
    aLab.textContent = "입고일자";
    var poDateInp = document.createElement("input");
    poDateInp.type = "date";
    poDateInp.id = ROOT_ID + "-po-sku-po-date";
    try {
      var y0 = unloadTodayYmd();
      poDateInp.value = y0;
    } catch (eP0) {}
    poDateInp.className = "yna4-pane-inp";
    poDateInp.style.maxWidth = "11em";
    poDateInp.title =
      "입고일자 기준으로 발주 목록 필터와 검품(B) 하차 조회에 동일하게 적용됩니다.";
    aRow.appendChild(aLab);
    aRow.appendChild(poDateInp);

    var aFilterRow = document.createElement("div");
    aFilterRow.className = "yna4-pane-row";
    var pfLab = document.createElement("span");
    pfLab.className = "yna4-pane-k";
    pfLab.textContent = "발주상태";
    var poStatSel = document.createElement("select");
    poStatSel.id = ROOT_ID + "-po-sku-po-status";
    poStatSel.className = "yna4-pane-inp";
    poStatSel.style.maxWidth = "16em";
    poStatSel.title =
      "발주내역 페이지와 동일한 항목·value → purchaseOrderStatus API 파라미터";
    var oLoad = document.createElement("option");
    oLoad.value = "";
    oLoad.textContent = "발주내역(/purchaseOrder/list) 기준 상태 불러오는 중…";
    poStatSel.appendChild(oLoad);

    var btnPipeline = document.createElement("button");
    btnPipeline.type = "button";
    btnPipeline.textContent = "작업 시작";
    btnPipeline.className = "yna4-pane-btn yna4-pane-btn--primary";
    btnPipeline.title =
      "발주 목록(상태필터)→발주별 상세에서 SKU 추출→B를 SKU별로 조회 후 아래 표/TSV";
    aFilterRow.appendChild(pfLab);
    aFilterRow.appendChild(poStatSel);

    function applyParsedPoStatuses(parsed, syncOpts) {
      syncOpts = syncOpts || {};
      var addSyntheticAll = syncOpts.addSyntheticAll !== false;

      var prev = "";
      try {
        prev = String(poStatSel.value || "");
      } catch (ePrev) {}

      poStatSel.textContent = "";

      if (!parsed || !parsed.length) {
        var oX = document.createElement("option");
        oX.value = "";
        oX.textContent =
          "(없음) 발주내역 탭을 먼저 연 뒤 새로고침";
        oX.disabled = true;
        poStatSel.appendChild(oX);
        poStatSel.selectedIndex = 0;
        return;
      }

      var seen = Object.create(null);
      var pi;
      var parsedHasEmpty = false;
      for (pi = 0; pi < parsed.length; pi++) {
        var pe = parsed[pi].value != null ? String(parsed[pi].value) : "";
        if (pe === "") parsedHasEmpty = true;
      }
      if (addSyntheticAll && !parsedHasEmpty) {
        seen[""] = true;
        var oz = document.createElement("option");
        oz.value = "";
        oz.textContent = "전체(상태 파라미터 비움)";
        poStatSel.appendChild(oz);
      }

      for (pi = 0; pi < parsed.length; pi++) {
        var pv = parsed[pi].value != null ? String(parsed[pi].value) : "";
        if (Object.prototype.hasOwnProperty.call(seen, pv)) continue;
        seen[pv] = true;
        var op = document.createElement("option");
        op.value = pv;
        var lab = purchaseOrderStatusDisplayLabel(pv, parsed[pi].label);
        op.textContent = lab;
        poStatSel.appendChild(op);
      }

      var pick = "";
      if (Object.prototype.hasOwnProperty.call(seen, prev)) pick = prev;
      if (pick === "") {
        for (pi = 0; pi < parsed.length; pi++) {
          if (/입고중/.test(parsed[pi].label || "")) {
            pick =
              parsed[pi].value != null ? String(parsed[pi].value) : "";
            break;
          }
        }
      }

      var ii;
      for (ii = 0; ii < poStatSel.options.length; ii++) {
        if (poStatSel.options[ii].value === pick) {
          poStatSel.selectedIndex = ii;
          return;
        }
      }
      poStatSel.selectedIndex = 0;
    }

    async function refreshPoStatusFromServer() {
      if (typeof GM_xmlhttpRequest !== "function") {
        applyParsedPoStatuses([]);
        return;
      }
      try {
        var strictOpts = [];
        try {
          strictOpts = purchaseOrderHarvestAllContextsStrictPoStatus();
        } catch (eSt) {}

        if (strictOpts.length) {
          try {
            applyParsedPoStatuses(strictOpts, { addSyntheticAll: false });
          } catch (eStrictAp) {
            applyParsedPoStatuses([]);
          }
        } else {
          var listHtml = await gmGet(
            PURCHASE_ORDER_LIST_REFERER,
            purchaseOrderListDocumentHeaders()
          );
          var parsed = purchaseOrderParseStatusOptionsFromListHtml(listHtml);
          var rxFetched = purchaseOrderParseStatusOptionsRegexFromHtml(listHtml);
          if (rxFetched.length > parsed.length) parsed = rxFetched;
          try {
            var pathNm = String(
              typeof location !== "undefined" ? location.pathname || "" : ""
            );
            if (/purchaseOrder\/list/i.test(pathNm) && document.documentElement) {
              var liveParse = purchaseOrderParseStatusOptionsFromListHtml(
                document.documentElement.outerHTML
              );
              if (liveParse.length > parsed.length) parsed = liveParse;
              var rxLive = purchaseOrderParseStatusOptionsRegexFromHtml(
                document.documentElement.outerHTML
              );
              if (rxLive.length > parsed.length) parsed = rxLive;
            }
          } catch (eLive) {}

          try {
            applyParsedPoStatuses(parsed, { addSyntheticAll: true });
          } catch (eAp) {
            applyParsedPoStatuses([]);
          }
        }
      } catch (eH) {
        applyParsedPoStatuses([]);
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 po-sku] PO list HTML for status options", eH);
        }
      } finally {
      }
    }
    setTimeout(function () {
      refreshPoStatusFromServer();
    }, 80);

    var statRow = document.createElement("div");
    statRow.className = "yna4-pane-row";
    var statLab = document.createElement("span");
    statLab.className = "yna4-pane-k";
    statLab.textContent = "검품상태";
    var statSel = document.createElement("select");
    statSel.id = ROOT_ID + "-po-sku-inspect-status";
    statSel.className = "yna4-pane-inp";
    statSel.style.maxWidth = "12em";
    function opt(val, label) {
      var o = document.createElement("option");
      o.value = val;
      o.textContent = label;
      statSel.appendChild(o);
    }
    opt("PASSED", "정상종료");
    opt("", "전체(빈 값)");
    statSel.value = "PASSED";
    statRow.appendChild(statLab);
    statRow.appendChild(statSel);

    var btnRow = document.createElement("div");
    btnRow.className = "yna4-pane-actions";

    var btnStop = document.createElement("button");
    btnStop.type = "button";
    btnStop.textContent = "작업 중지";
    btnStop.className = "yna4-pane-btn yna4-pane-btn--danger";
    btnStop.disabled = true;

    var btnPipelineView = document.createElement("button");
    btnPipelineView.type = "button";
    btnPipelineView.textContent = "통합 결과";
    btnPipelineView.className = "yna4-pane-btn";
    btnPipelineView.title = "마지막 통합 실행 결과를 팝업 페이지로 표시";
    btnPipelineView.disabled = true;

    var status = document.createElement("div");
    status.id = statusId;
    status.className = "yna4-pane-status";
    status.textContent =
      "작업 시작 후 결과 확인";

    function openPoSkuPipelinePopup() {
      var pl = null;
      try {
        pl = window.__YAN4_PO_SKU_PIPELINE_LAST__;
      } catch (ePlR) {}
      if (!pl || !pl.mergedRows || !pl.mergedRows.length) {
        alert("먼저 「작업 시작」으로 결과를 만드세요.");
        return;
      }
      var old = document.getElementById(ROOT_ID + "-po-pipeline-modal");
      if (old) {
        try {
          old.remove();
        } catch (eOld) {}
      }
      var overlay = document.createElement("div");
      overlay.id = ROOT_ID + "-po-pipeline-modal";
      overlay.className = "yna4-sla-modal";
      overlay.innerHTML =
        "<div class='yna4-sla-modal-backdrop' data-role='close'></div>" +
        "<div class='yna4-sla-modal-dialog' role='dialog' aria-modal='true' aria-label='통합 결과'>" +
        "<div class='yna4-sla-modal-head'><strong>통합 결과</strong><div style='display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:flex-end;max-width:72%;'>" +
        "<button type='button' class='yna4-pane-btn' id='" +
        ROOT_ID +
        "-po-pipeline-copy'>팀즈용 표 복사</button>" +
        "<button type='button' class='yna4-pane-btn yna4-pane-btn--compact' id='" +
        ROOT_ID +
        "-po-pipeline-copy-mimaeip'>미매입확정 복사</button>" +
        "<button type='button' class='yna4-pane-btn yna4-pane-btn--compact' id='" +
        ROOT_ID +
        "-po-pipeline-copy-suspect'>의심건 복사</button>" +
        "<button type='button' class='yna4-pane-btn yna4-pane-btn--compact' id='" +
        ROOT_ID +
        "-po-pipeline-copy-noinspect'>검품내역없음 복사</button>" +
        "<button type='button' class='yna4-pane-btn' data-role='close'>닫기</button></div></div>" +
        "<div class='yna4-pane-scroll' style='padding:8px 10px;max-height:none;line-height:1.35;background:#f8fafc;'>" +
        "<div id='" +
        ROOT_ID +
        "-po-pipeline-modal-summary' style='font-size:12px;color:#334155;margin:0 0 8px 0;'></div>" +
        "<div style='overflow:auto;max-height:62vh;border:1px solid #e5e7eb;background:#fff;border-radius:8px;'>" +
        "<table style='width:100%;border-collapse:collapse;font-size:12px;table-layout:auto;'>" +
        "<thead><tr style='position:sticky;top:0;background:#eff6ff;color:#1e3a8a;'>" +
        "<th style='padding:6px 8px;border:1px solid #e5e7eb;'>SKU</th>" +
        "<th style='padding:6px 8px;border:1px solid #e5e7eb;'>IBC</th>" +
        "<th style='padding:6px 8px;border:1px solid #e5e7eb;'>외부발주번호</th>" +
        "<th style='padding:6px 8px;border:1px solid #e5e7eb;'>발주번호</th>" +
        "<th style='padding:6px 8px;border:1px solid #e5e7eb;'>검품번호</th>" +
        "<th style='padding:6px 8px;border:1px solid #e5e7eb;'>검품상태</th>" +
        "<th style='padding:6px 8px;border:1px solid #e5e7eb;'>업체</th>" +
        "<th style='padding:6px 8px;border:1px solid #e5e7eb;'>발주수량</th>" +
        "<th style='padding:6px 8px;border:1px solid #e5e7eb;'>입고수량</th>" +
        "<th style='padding:6px 8px;border:1px solid #e5e7eb;'>회송수량</th>" +
        "<th style='padding:6px 8px;border:1px solid #e5e7eb;'>상품명</th>" +
        "<th style='padding:6px 8px;border:1px solid #e5e7eb;'>검품일시</th>" +
        "</tr></thead>" +
        "<tbody id='" +
        ROOT_ID +
        "-po-pipeline-modal-tbody'></tbody>" +
        "</table></div></div></div>";
      document.body.appendChild(overlay);
      function esc(s) {
        return String(s == null ? "" : s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }
      function valOrBadge(v) {
        var t = String(v == null ? "" : v).trim();
        if (t) return esc(t);
        return "<span style='display:inline-block;padding:1px 6px;border-radius:999px;background:#f3f4f6;color:#6b7280;font-size:11px;'>없음</span>";
      }
      function parseKoreanDateTime(v) {
        var s = String(v == null ? "" : v).trim();
        if (!s) return -1;
        var n = Date.parse(s);
        if (isFinite(n)) return n;
        var s2 = s
          .replace(/\./g, "-")
          .replace(/\//g, "-")
          .replace(/\s+/g, " ")
          .replace("T", " ")
          .trim();
        n = Date.parse(s2);
        if (isFinite(n)) return n;
        var m = s.match(
          /(\d{4})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})\s*(?:일)?\s*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?/
        );
        if (!m) return -1;
        var y = Number(m[1]);
        var mo = Number(m[2]) - 1;
        var d = Number(m[3]);
        var hh = Number(m[4] || 0);
        var mm = Number(m[5] || 0);
        var ss = Number(m[6] || 0);
        var t = new Date(y, mo, d, hh, mm, ss).getTime();
        return isFinite(t) ? t : -1;
      }
      function parseNumLike(v) {
        var n = unloadGapNum(v);
        return isFinite(n) ? n : NaN;
      }
      function rowHasInspectValue(r) {
        return (
          !!String((r && r.inspectNo) || "").trim() ||
          !!String((r && r.inspectStatus) || "").trim() ||
          !!String((r && r.ibc) || "").trim() ||
          !!String((r && r.unloadDt) || "").trim()
        );
      }
      function isNoInspectHistoryRow(r) {
        return (
          !String((r && r.inspectNo) || "").trim() &&
          !String((r && r.inspectStatus) || "").trim() &&
          !String((r && r.ibc) || "").trim()
        );
      }
      function isMimaeipRow(r) {
        if (!rowHasInspectValue(r)) return false;
        var inA = parseNumLike(r ? r.inboundQtyA : "");
        var reA = parseNumLike(r ? r.returnQty : "");
        return isFinite(inA) && isFinite(reA) && Math.abs(inA) < 0.000001 && Math.abs(reA) < 0.000001;
      }
      var rows = (pl.mergedRows || []).slice();
      rows.sort(function (a, b) {
        var ma = isMimaeipRow(a) ? 1 : 0;
        var mb = isMimaeipRow(b) ? 1 : 0;
        if (mb !== ma) return mb - ma;
        var ta = parseKoreanDateTime(a ? a.unloadDt : "");
        var tb = parseKoreanDateTime(b ? b.unloadDt : "");
        if (tb !== ta) return tb - ta;
        var sa = Number((a && a.skuQuery) || 0);
        var sb = Number((b && b.skuQuery) || 0);
        return sa - sb;
      });
      var rowsNoInspect = rows.filter(isNoInspectHistoryRow);
      var rowsMimaeipOnly = rows.filter(function (r) {
        return !isNoInspectHistoryRow(r) && isMimaeipRow(r);
      });
      var rowsSuspectOnly = rows.filter(function (r) {
        return !isNoInspectHistoryRow(r) && !isMimaeipRow(r);
      });
      function buildPoPipelineTeamsClipboard(sortedRows) {
        var cols = [
          "SKU",
          "IBC",
          "외부발주번호",
          "발주번호",
          "검품번호",
          "검품상태",
          "업체",
          "발주수량",
          "입고수량",
          "회송수량",
          "상품명",
          "검품일시",
        ];
        var tsv = [cols.join("\t")];
        var html =
          '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:12px;color:#0f172a">' +
          '<thead><tr style="background:#f1f5f9;font-weight:bold">' +
          cols.map(function (h) {
            return "<th>" + unloadSlaEscapeHtml(h) + "</th>";
          }).join("") +
          "</tr></thead><tbody>";
        var i;
        for (i = 0; i < sortedRows.length; i++) {
          var r = sortedRows[i] || {};
          var cellsRaw = [
            r.skuQuery || "",
            r.ibc || "",
            r.externalPoCsv || "",
            r.poIdCsv || "",
            r.inspectNo || "",
            r.inspectStatus || "",
            r.vendorB || "",
            r.orderQty || "",
            r.inboundQtyA || "",
            r.returnQty || "",
            r.productName || "",
            r.unloadDt || "",
          ];
          var cells = cellsRaw.map(function (v, idx) {
            var t = String(v == null ? "" : v).trim();
            if (t) return t;
            if (idx === 1) return "검품내역없음"; // IBC 열
            return "-";
          });
          tsv.push(
            cells
              .map(function (v) {
                return String(v == null ? "" : v)
                  .replace(/\t/g, " ")
                  .replace(/\r?\n/g, " ")
                  .trim();
              })
              .join("\t")
          );
          html +=
            "<tr>" +
            "<td>" + unloadSlaEscapeHtml(cells[0]) + "</td>" +
            "<td>" + unloadSlaEscapeHtml(cells[1]) + "</td>" +
            "<td>" + unloadSlaEscapeHtml(cells[2]) + "</td>" +
            "<td>" + unloadSlaEscapeHtml(cells[3]) + "</td>" +
            "<td>" + unloadSlaEscapeHtml(cells[4]) + "</td>" +
            "<td>" + unloadSlaEscapeHtml(cells[5]) + "</td>" +
            "<td>" + unloadSlaEscapeHtml(cells[6]) + "</td>" +
            "<td style='text-align:right'>" + unloadSlaEscapeHtml(String(cells[7])) + "</td>" +
            "<td style='text-align:right'>" + unloadSlaEscapeHtml(String(cells[8])) + "</td>" +
            "<td style='text-align:right'>" + unloadSlaEscapeHtml(String(cells[9])) + "</td>" +
            "<td>" + unloadSlaEscapeHtml(cells[10]) + "</td>" +
            "<td>" + unloadSlaEscapeHtml(cells[11]) + "</td>" +
            "</tr>";
        }
        html += "</tbody></table>";
        return { tsv: tsv.join("\n"), html: html };
      }
      var tr = [];
      var i;
      for (i = 0; i < rows.length; i++) {
        var r = rows[i] || {};
        var noB = isNoInspectHistoryRow(r);
        var isMimaeip = isMimaeipRow(r);
        var inspectStatusText =
          (String(r.inspectStatus || "").trim() || "") +
          (isMimaeip
            ? (String(r.inspectStatus || "").trim() ? " · " : "") + "미매입"
            : "");
        tr.push(
          "<tr style='" + (noB ? "background:#fafafa;" : isMimaeip ? "background:#fff7ed;" : "") + "'>" +
            "<td style='padding:7px 8px;border:1px solid #e5e7eb;white-space:nowrap;font-weight:700;text-align:center;font-variant-numeric:tabular-nums;'>" + valOrBadge(r.skuQuery) + "</td>" +
            "<td style='padding:7px 8px;border:1px solid #e5e7eb;white-space:nowrap;text-align:center;font-variant-numeric:tabular-nums;'>" + valOrBadge(r.ibc) + "</td>" +
            "<td style='padding:7px 8px;border:1px solid #e5e7eb;white-space:normal;word-break:break-all;min-width:120px;vertical-align:top;'>" + valOrBadge(r.externalPoCsv) + "</td>" +
            "<td style='padding:7px 8px;border:1px solid #e5e7eb;white-space:normal;word-break:break-all;min-width:100px;vertical-align:top;'>" + valOrBadge(r.poIdCsv) + "</td>" +
            "<td style='padding:7px 8px;border:1px solid #e5e7eb;white-space:nowrap;text-align:center;font-variant-numeric:tabular-nums;'>" + valOrBadge(r.inspectNo) + "</td>" +
            "<td style='padding:7px 8px;border:1px solid #e5e7eb;white-space:nowrap;text-align:center;'>" + valOrBadge(inspectStatusText) + "</td>" +
            "<td style='padding:7px 8px;border:1px solid #e5e7eb;white-space:normal;word-break:break-all;min-width:120px;vertical-align:top;'>" + valOrBadge(r.vendorB) + "</td>" +
            "<td style='padding:7px 8px;border:1px solid #e5e7eb;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;'>" + valOrBadge(r.orderQty) + "</td>" +
            "<td style='padding:7px 8px;border:1px solid #e5e7eb;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;'>" + valOrBadge(r.inboundQtyA) + "</td>" +
            "<td style='padding:7px 8px;border:1px solid #e5e7eb;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;'>" + valOrBadge(r.returnQty) + "</td>" +
            "<td style='padding:7px 8px;border:1px solid #e5e7eb;white-space:normal;word-break:break-word;min-width:220px;vertical-align:top;'>" + valOrBadge(r.productName) + "</td>" +
            "<td style='padding:7px 8px;border:1px solid #e5e7eb;white-space:nowrap;text-align:center;font-variant-numeric:tabular-nums;'>" + valOrBadge(r.unloadDt) + "</td>" +
          "</tr>"
        );
      }
      var sumEl = document.getElementById(ROOT_ID + "-po-pipeline-modal-summary");
      var bodyEl = document.getElementById(ROOT_ID + "-po-pipeline-modal-tbody");
      if (sumEl)
        sumEl.textContent =
          (pl.summary || "") +
          " · 전체 " +
          rows.length +
          "행 · 미매입확정 " +
          rowsMimaeipOnly.length +
          " · 의심건 " +
          rowsSuspectOnly.length +
          " · 검품내역없음 " +
          rowsNoInspect.length +
          (pl.fetchedAt ? " · " + pl.fetchedAt : "");
      if (bodyEl) bodyEl.innerHTML = tr.join("");
      function poPipelineWriteClipboard(pack, alertOkTeams, alertOkTsv) {
        var okTeams = function () {
          alert(alertOkTeams || "팀즈용 표 복사 완료");
        };
        var okTsvOnly = function () {
          alert(alertOkTsv || "복사 완료(텍스트만)");
        };
        var fail = function () {
          alert("클립보드 복사 실패");
        };
        if (
          typeof ClipboardItem !== "undefined" &&
          navigator.clipboard &&
          typeof navigator.clipboard.write === "function"
        ) {
          navigator.clipboard
            .write([
              new ClipboardItem({
                "text/html": new Blob([pack.html], { type: "text/html;charset=utf-8" }),
                "text/plain": new Blob([pack.tsv], { type: "text/plain;charset=utf-8" }),
              }),
            ])
            .then(okTeams)
            .catch(function () {
              if (typeof GM_setClipboard === "function") {
                try {
                  GM_setClipboard(pack.tsv, "text");
                  okTsvOnly();
                  return;
                } catch (eGm) {}
              }
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(pack.tsv).then(okTsvOnly, fail);
                return;
              }
              fail();
            });
          return;
        }
        if (typeof GM_setClipboard === "function") {
          try {
            GM_setClipboard(pack.tsv, "text");
            okTsvOnly();
            return;
          } catch (eGm2) {}
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(pack.tsv).then(okTsvOnly, fail);
          return;
        }
        fail();
      }
      function bindPoPipelineSubsetCopy(btnId, subset, emptyMsg, okPrefix) {
        var b = document.getElementById(btnId);
        if (!b) return;
        b.addEventListener("click", function () {
          if (!subset.length) {
            alert(emptyMsg);
            return;
          }
          var pack = buildPoPipelineTeamsClipboard(subset);
          var n = subset.length;
          poPipelineWriteClipboard(
            pack,
            okPrefix + "(" + n + "행) · 팀즈용 표 복사 완료",
            okPrefix + "(" + n + "행) · 텍스트만 복사됨"
          );
        });
      }
      var btnTeamsCopy = document.getElementById(ROOT_ID + "-po-pipeline-copy");
      if (btnTeamsCopy) {
        btnTeamsCopy.addEventListener("click", function () {
          if (!rows.length) {
            alert("복사할 결과 행이 없습니다.");
            return;
          }
          poPipelineWriteClipboard(buildPoPipelineTeamsClipboard(rows));
        });
      }
      bindPoPipelineSubsetCopy(
        ROOT_ID + "-po-pipeline-copy-mimaeip",
        rowsMimaeipOnly,
        "미매입확정에 해당하는 행이 없습니다.",
        "미매입확정 "
      );
      bindPoPipelineSubsetCopy(
        ROOT_ID + "-po-pipeline-copy-suspect",
        rowsSuspectOnly,
        "의심건에 해당하는 행이 없습니다.",
        "의심건 "
      );
      bindPoPipelineSubsetCopy(
        ROOT_ID + "-po-pipeline-copy-noinspect",
        rowsNoInspect,
        "검품내역없음에 해당하는 행이 없습니다.",
        "검품내역없음 "
      );
      function close() {
        try {
          overlay.remove();
        } catch (eRm) {}
      }
      overlay.addEventListener("click", function (e) {
        var t = e.target;
        if (t && t.getAttribute && t.getAttribute("data-role") === "close") close();
      });
    }

    function poSkuCompareAnyRunning() {
      return poSkuPipelineRunning;
    }

    function refreshButtons() {
      var run = poSkuCompareAnyRunning();
      btnPipeline.disabled = run;
      btnStop.disabled = !run;
      try {
        btnPipelineView.disabled =
          !window.__YAN4_PO_SKU_PIPELINE_LAST__ ||
          !window.__YAN4_PO_SKU_PIPELINE_LAST__.mergedRows ||
          !window.__YAN4_PO_SKU_PIPELINE_LAST__.mergedRows.length;
      } catch (eP) {
        btnPipelineView.disabled = true;
      }
    }

    async function runInboundPoSkuPipeline() {
      if (typeof GM_xmlhttpRequest !== "function") {
        alert(
          "Tampermonkey GM_xmlhttpRequest 필요.\n// @grant GM_xmlhttpRequest"
        );
        return;
      }
      if (poSkuCompareAnyRunning()) return;

      var startY = String(poDateInp.value || "").trim();
      var endY = startY;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startY)) {
        alert("날짜를 선택하세요.\n발주 목록과 검품(B) 조회에 동일하게 적용됩니다.");
        return;
      }

      var bY = startY;

      var poStatApi = String(poStatSel.value || "").trim();
      var qsPo = purchaseOrderQueryString(startY, endY, poStatApi);
      var bStVal = statSel.value;

      poSkuPipelineRunning = true;
      poSkuPipelineStopRequested = false;
      refreshButtons();
      setProgressByStatusId(statusId, 5);
      setStatus("통합 1단계 · 발주 목록…");

      var skuOrigin = {};
      try {
        var poListRows = await purchaseOrderGmFetchAllListRows(qsPo, {
          shouldStop: function () {
            return poSkuPipelineStopRequested;
          },
          sleepFn: async function () {
            return await poSkuPipelineSleepInterruptible(
              INSPECT_WORK_REQ_GAP_MS
            );
          },
        });

        if (!poListRows.length) {
          setStatus("통합 · 발주 목록이 비었습니다.");
          setProgressByStatusId(statusId, 0);
          return;
        }

        setProgressByStatusId(statusId, 15);
        setStatus(
          "통합 2단계 · 발주 상세(" +
            Math.min(poListRows.length, PURCHASE_ORDER_ITEM_FETCH_CAP) +
            "/" +
            poListRows.length +
            ")…"
        );

        var hdrPo = purchaseOrderReqHeaders();
        var itemIdx = 0;
        var capped = false;
        for (itemIdx = 0; itemIdx < poListRows.length; itemIdx++) {
          if (poSkuPipelineStopRequested) break;
          if (itemIdx >= PURCHASE_ORDER_ITEM_FETCH_CAP) {
            capped = true;
            break;
          }
          var prow = poListRows[itemIdx];
          var pid = String(prow.purchaseOrderId || "")
            .replace(/\s+/g, "")
            .trim();
          if (!/^\d+$/.test(pid)) continue;

          await poSkuPipelineSleepInterruptible(INSPECT_WORK_REQ_GAP_MS);
          if (poSkuPipelineStopRequested) break;

          setStatus(
            "통합 상세 · " +
              (itemIdx + 1) +
              "/" +
              Math.min(poListRows.length, PURCHASE_ORDER_ITEM_FETCH_CAP) +
              " (PO " +
              pid +
              ")"
          );

          try {
            var itemHtml = await gmGet(
              purchaseOrderItemUrl(pid),
              hdrPo
            );
            var itemParsed = purchaseOrderParseSkuIdsFromItemHtml(itemHtml);
            var skArr =
              itemParsed && itemParsed.skuIds ? itemParsed.skuIds : [];
            var qtyBySku =
              itemParsed && itemParsed.qtyBySku ? itemParsed.qtyBySku : {};
            var nameBySku =
              itemParsed && itemParsed.nameBySku ? itemParsed.nameBySku : {};
            var si;
            for (si = 0; si < skArr.length; si++) {
              var skid = skArr[si];
              if (!skuOrigin[skid]) {
                skuOrigin[skid] = {
                  ext: {},
                  pid: {},
                  vendorA: {},
                  productA: {},
                  orderQty: 0,
                  returnQty: 0,
                  inboundQtyA: 0,
                };
              }
              var extPart = inspectWorkNormText(prow.externalPoId || "")
                ? inspectWorkNormText(prow.externalPoId)
                : "";
              skuOrigin[skid].ext[extPart || "-"] = true;
              skuOrigin[skid].pid[String(pid)] = true;
              var vPart = inspectWorkNormText(prow.vendor || "").trim();
              if (vPart) skuOrigin[skid].vendorA[vPart] = true;
              var nPart = inspectWorkNormText(nameBySku[skid] || "").trim();
              if (nPart) skuOrigin[skid].productA[nPart] = true;
              var q = qtyBySku[skid];
              if (q) {
                if (isFinite(q.orderQty))
                  skuOrigin[skid].orderQty += Number(q.orderQty);
                if (isFinite(q.returnQty))
                  skuOrigin[skid].returnQty += Number(q.returnQty);
                if (isFinite(q.inboundQty))
                  skuOrigin[skid].inboundQtyA += Number(q.inboundQty);
              }
            }
          } catch (eIt) {
            if (typeof console !== "undefined" && console.warn) {
              console.warn("[YAN4 po pipeline] PO item fail", pid, eIt);
            }
          }

          var pctDetail =
            15 +
            (43 * (itemIdx + 1)) /
              Math.max(
                1,
                Math.min(poListRows.length, PURCHASE_ORDER_ITEM_FETCH_CAP)
              );
          setProgressByStatusId(statusId, Math.min(58, pctDetail));
        }

        var skuKeysUnsorted = Object.keys(skuOrigin);
        if (!skuKeysUnsorted.length) {
          setStatus("통합 · 상세에서 SKU ID를 하나도 추출하지 못했습니다.");
          setProgressByStatusId(statusId, 0);
          return;
        }

        skuKeysUnsorted.sort(function (a, b) {
          return Number(a) - Number(b);
        });
        var skuLookupCapReached = skuKeysUnsorted.length > SKU_INSPECT_LOOKUP_CAP;
        var skuIter = skuKeysUnsorted.slice(0, SKU_INSPECT_LOOKUP_CAP);

        var merged = [];
        var si2;
        for (si2 = 0; si2 < skuIter.length; si2++) {
          if (poSkuPipelineStopRequested) break;
          await poSkuPipelineSleepInterruptible(INSPECT_WORK_REQ_GAP_MS);
          if (poSkuPipelineStopRequested) break;

          var skuQ = skuIter[si2];
          var ori = skuOrigin[skuQ];
          var extCsv = Object.keys(ori.ext)
            .filter(function (x) {
              return x && x !== "-";
            })
            .join("|");
          if (!extCsv) extCsv = Object.keys(ori.ext).sort().join("|");
          var pidCsv = Object.keys(ori.pid).sort().join("|");
          function fmtQty(v) {
            if (!isFinite(v)) return "";
            var iv = Math.round(v);
            return Math.abs(v - iv) < 0.000001 ? String(iv) : String(v);
          }
          var orderQtyCsv = fmtQty(ori.orderQty);
          var returnQtyCsv = fmtQty(ori.returnQty);
          var inboundQtyACsv = fmtQty(ori.inboundQtyA);
          var vendorAFallback = Object.keys(ori.vendorA || {}).join("|");
          var productAFallback = Object.keys(ori.productA || {}).join("|");

          var fullQB = inspectWorkQueryString(bY, bY, bStVal, skuQ);
          setStatus(
            "통합 검품 SKU " +
              (si2 + 1) +
              "/" +
              skuIter.length +
              " · " +
              skuQ
          );

          var brList = await inspectWorkGmFetchAllPagingRows(fullQB, {
            shouldStop: function () {
              return poSkuPipelineStopRequested;
            },
            sleepFn: async function () {
              return await poSkuPipelineSleepInterruptible(
                INSPECT_WORK_REQ_GAP_MS
              );
            },
          });

          function pushMerged(br) {
            merged.push({
              skuQuery: skuQ,
              externalPoCsv: extCsv,
              poIdCsv: pidCsv,
              orderQty: orderQtyCsv,
              returnQty: returnQtyCsv,
              inboundQtyA: inboundQtyACsv,
              inspectNo: br ? br.inspectNo : "",
              inspectStatus: br ? br.status : "",
              ibc: br ? br.ibc : "",
              poExtB: br ? br.poExt : "",
              vendorB:
                br && inspectWorkNormText(br.vendor || "").trim()
                  ? br.vendor
                  : vendorAFallback,
              inboundQty: br ? br.inboundQty : "",
              unloadDt: br ? br.unloadDt : "",
              productName:
                br && inspectWorkNormText(br.productName || "").trim()
                  ? br.productName
                  : productAFallback,
            });
          }

          if (!brList.length) {
            pushMerged(null);
          } else {
            var bi;
            for (bi = 0; bi < brList.length; bi++)
              pushMerged(brList[bi]);
          }

          setProgressByStatusId(
            statusId,
            58 +
              (41 * (si2 + 1)) /
                Math.max(1, skuIter.length || 1)
          );
        }

        var tsvP = mergedPoSkuInspectRowsToTsv(merged);
        var summary =
          "발주 행 " +
          poListRows.length +
          " · 상세 처리 " +
          Math.min(poListRows.length, PURCHASE_ORDER_ITEM_FETCH_CAP) +
          (capped ? "+" : "") +
          " · SKU " +
          skuKeysUnsorted.length +
          (skuLookupCapReached
            ? "(조회 상한 " + SKU_INSPECT_LOOKUP_CAP + ")"
            : "");

        try {
          window.__YAN4_PO_SKU_PIPELINE_LAST__ = {
            tsv: tsvP,
            mergedRows: merged,
            summary: summary,
            poRowsCount: poListRows.length,
            skuCountDistinct: skuKeysUnsorted.length,
            fetchedAt: new Date().toISOString(),
          };
        } catch (eSav) {}

        await new Promise(function (resolve) {
          unloadCopyPlainViaBestEffort(tsvP, function () {
            resolve();
          });
        });

        var warnMsg = "";
        if (skuLookupCapReached || capped || poSkuPipelineStopRequested) {
          var warns = "";
          if (skuLookupCapReached)
            warns +=
              "SKU 수가 많아 검품 조회는 " +
              SKU_INSPECT_LOOKUP_CAP +
              "개까지 처리했습니다. ";
          if (capped)
            warns +=
              "발주 상세는 " +
              PURCHASE_ORDER_ITEM_FETCH_CAP +
              "건만 가져왔습니다. ";
          if (poSkuPipelineStopRequested) warns += "작업 중지됨.";
          warnMsg = warns.trim();
        }
        setStatus(
          "통합 완료 · " +
            summary +
            (warnMsg ? " · " + warnMsg : "") +
            " · 결과는 「통합 결과」"
        );

        setProgressByStatusId(statusId, 100);
      } catch (eP0) {
        var em = eP0 && eP0.message ? eP0.message : String(eP0);
        setStatus("통합 실패 · " + em);
        setProgressByStatusId(statusId, 0);
        alert("통합 파이프라인 오류: " + em);
      } finally {
        poSkuPipelineRunning = false;
        poSkuPipelineStopRequested = false;
        refreshButtons();
      }
    }

    btnStop.addEventListener("click", function () {
      poSkuPipelineStopRequested = true;
    });

    btnPipeline.addEventListener("click", function () {
      runInboundPoSkuPipeline();
    });

    btnPipelineView.addEventListener("click", openPoSkuPipelinePopup);

    btnRow.appendChild(btnPipeline);
    btnRow.appendChild(btnStop);
    btnRow.appendChild(btnPipelineView);

    hostEl.appendChild(aRow);
    hostEl.appendChild(aFilterRow);
    hostEl.appendChild(statRow);
    hostEl.appendChild(btnRow);
    hostEl.appendChild(status);

    refreshButtons();
  }

  /** 진열 문제보고 목록: 미처리 Total≥1 이면 매 주기 알림·표 갱신 · 영역 5 */
    function ensureChartJs() {
      if (typeof Chart !== "undefined") return Promise.resolve();
      if (window.__yna4ChartJsLoadPromise) {
        return window.__yna4ChartJsLoadPromise;
      }
      window.__yna4ChartJsLoadPromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src =
          "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js";
        s.onload = function () {
          resolve();
        };
        s.onerror = function () {
          reject(new Error("Chart.js 로드 실패"));
        };
        (document.head || document.documentElement).appendChild(s);
      });
      return window.__yna4ChartJsLoadPromise;
    }

    function parseGrossUphSeries(json) {
      var rangeList = json && json.rangeList ? json.rangeList.slice() : [];
      var center =
        json && json.centerUphList && json.centerUphList[0]
          ? json.centerUphList[0]
          : {};
      var today = center.uphList || [];
      var past = center.pastUphList || [];
      var target = Number(json && json.fixedTargetUph) || 200;
      var n = rangeList.length;
      if (!n) n = Math.max(today.length, past.length);
      var labels = [];
      var todayVals = [];
      var pastVals = [];
      var targetVals = [];
      var metaToday = [];
      var metaPast = [];
      var i;
      for (i = 0; i < n; i++) {
        var hr =
          rangeList[i] != null ? String(rangeList[i]) : pad2(7 + (i % 24));
        labels.push(hr + "시");
        var tRow = today[i] || {};
        var pRow = past[i] || {};
        var tUph = Number(tRow.uph);
        var pUph = Number(pRow.uph);
        todayVals.push(isFinite(tUph) ? tUph : null);
        pastVals.push(isFinite(pUph) ? pUph : null);
        targetVals.push(target);
        metaToday.push(tRow);
        metaPast.push(pRow);
      }
      return {
        labels: labels,
        todayVals: todayVals,
        pastVals: pastVals,
        targetVals: targetVals,
        metaToday: metaToday,
        metaPast: metaPast,
        target: target,
        n: n,
      };
    }

    function calcYMax(parsed) {
      var m = parsed.target;
      var i;
      for (i = 0; i < parsed.n; i++) {
        if (parsed.todayVals[i] != null && parsed.todayVals[i] > m) {
          m = parsed.todayVals[i];
        }
        if (parsed.pastVals[i] != null && parsed.pastVals[i] > m) {
          m = parsed.pastVals[i];
        }
      }
      m = Math.max(m, parsed.target) * 1.08;
      return Math.ceil(m / 50) * 50;
    }

    function buildGrossUphChart(canvasEl, json, chartStoreKey, hostForStore) {
      var parsed = parseGrossUphSeries(json);
      if (!parsed.n) return null;
      var yMax = calcYMax(parsed);
      var ctx = canvasEl.getContext("2d");
      if (hostForStore[chartStoreKey]) {
        try {
          hostForStore[chartStoreKey].destroy();
        } catch (eD) {}
        hostForStore[chartStoreKey] = null;
      }
      var tipMeta = { today: parsed.metaToday, past: parsed.metaPast };
      var chart = new Chart(ctx, {
        type: "line",
        data: {
          labels: parsed.labels,
          datasets: [
            {
              label: "1일 전",
              data: parsed.pastVals,
              borderColor: "#434348",
              backgroundColor: "rgba(67,67,72,0.04)",
              borderWidth: 2,
              borderDash: [6, 4],
              pointRadius: 2,
              pointHoverRadius: 5,
              pointBackgroundColor: "#434348",
              tension: 0.35,
              spanGaps: true,
              order: 2,
            },
            {
              label: "선택일",
              data: parsed.todayVals,
              borderColor: "#7cb5ec",
              backgroundColor: "rgba(124,181,236,0.18)",
              borderWidth: 2.5,
              fill: true,
              pointRadius: 3,
              pointHoverRadius: 6,
              pointBackgroundColor: "#7cb5ec",
              tension: 0.35,
              spanGaps: true,
              order: 1,
            },
            {
              label: "목표 " + parsed.target,
              data: parsed.targetVals,
              borderColor: "#DF5353",
              backgroundColor: "transparent",
              borderWidth: 2,
              borderDash: [8, 5],
              pointRadius: 0,
              pointHoverRadius: 0,
              tension: 0,
              order: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 280 },
          layout: { padding: { top: 2, right: 6, bottom: 12, left: 2 } },
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              padding: 10,
              titleFont: { size: 12, weight: "700" },
              bodyFont: { size: 11 },
              callbacks: {
                label: function (ctxTip) {
                  var dsLabel = ctxTip.dataset.label || "";
                  var v = ctxTip.parsed.y;
                  if (v == null || !isFinite(v)) return dsLabel + ": —";
                  var lines = [dsLabel + ": " + v.toFixed(1)];
                  var idx = ctxTip.dataIndex;
                  var row =
                    dsLabel.indexOf("1일") >= 0
                      ? tipMeta.past[idx]
                      : dsLabel.indexOf("목표") >= 0
                        ? null
                        : tipMeta.today[idx];
                  if (row && row.units != null) {
                    lines.push("Units: " + row.units);
                  }
                  if (row && row.hours != null) {
                    lines.push("Hours: " + Number(row.hours).toFixed(2));
                  }
                  return lines;
                },
              },
            },
          },
          scales: {
            x: {
              grid: { color: "rgba(200,200,200,0.35)" },
              ticks: {
                color: "#64748b",
                font: { size: 10 },
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 16,
              },
            },
            y: {
              min: 0,
              max: yMax,
              grid: { color: "rgba(200,200,200,0.35)" },
              ticks: {
                color: "#64748b",
                font: { size: 10 },
                stepSize: yMax <= 250 ? 50 : 100,
              },
              title: { display: false },
            },
          },
        },
      });
      hostForStore[chartStoreKey] = chart;
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function () {
          try {
            chart.resize();
          } catch (eR) {}
        });
      }
      return chart;
    }

    function mountGrossUphCanvas(boxEl) {
      boxEl.textContent = "";
      var canvas = document.createElement("canvas");
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "Gross UPH");
      boxEl.appendChild(canvas);
      return canvas;
    }

    async function renderGrossUphChart(chartBox, json, hostForStore, storeKey) {
      if (!chartBox) return;
      await ensureChartJs();
      var parsed = parseGrossUphSeries(json);
      if (!parsed.n) {
        chartBox.textContent =
          '<div style="font-size:11px;color:#64748b;padding:12px;">데이터 없음</div>';
        return;
      }
      var canvas = mountGrossUphCanvas(chartBox);
      buildGrossUphChart(canvas, json, storeKey, hostForStore);
    }

    function initGrossUphChartPane(hostEl) {
      if (!hostEl) return;
      hostEl.textContent = "";
      hostEl.className = "yna4-pane-mod yna4-pane-mod--gross-uph";

      var GROSS_UPH_URL = "https://mos.coupang.net/kpi/gross-uph/datas";
      var GROSS_UPH_REFERER =
        "https://mos.coupang.net/kpi/gross-uph?resource=95";

      function pad2(n) {
        return n < 10 ? "0" + n : String(n);
      }

      function ymdKey(d) {
        return (
          String(d.getFullYear()) +
          pad2(d.getMonth() + 1) +
          pad2(d.getDate())
        );
      }

      function buildPayload(dayOffset) {
        var anchor = new Date();
        anchor.setHours(0, 0, 0, 0);
        anchor.setDate(anchor.getDate() - (dayOffset || 0));
        var next = new Date(anchor);
        next.setDate(next.getDate() + 1);
        return {
          rangeType: "HOURLY",
          startHour: "7",
          endHour: "30",
          rangeStart: ymdKey(anchor) + "07",
          rangeEnd: ymdKey(next) + "06",
          centerIdList: ["1007"],
          processType: "IB_OVERALL",
          pickReceiveType: "ALL",
          isAgv: "",
          targetUphType: "FIXED",
          daysAgo: "1",
          weeksAgo: "1",
          fixedTargetUph: "200",
        };
      }

      async function postGrossUph(bodyObj) {
        var payload = JSON.stringify(bodyObj || {});
        if (
          typeof chrome !== "undefined" &&
          chrome.runtime &&
          chrome.runtime.id &&
          typeof chrome.runtime.sendMessage === "function"
        ) {
          return await new Promise(function (resolve, reject) {
            chrome.runtime.sendMessage(
              {
                type: "yan4MosFetch",
                url: GROSS_UPH_URL,
                referer: GROSS_UPH_REFERER,
                method: "POST",
                contentType: "application/json; charset=UTF-8",
                body: payload,
              },
              function (resp) {
                try {
                  var le = chrome.runtime.lastError;
                  if (le) {
                    reject(new Error(le.message));
                    return;
                  }
                  if (!resp || !resp.ok) {
                    reject(new Error((resp && resp.error) || "MOS fetch 실패"));
                    return;
                  }
                  if (resp.status < 200 || resp.status >= 400) {
                    reject(new Error("HTTP " + resp.status));
                    return;
                  }
                  resolve(JSON.parse(String(resp.body || "{}")));
                } catch (e0) {
                  reject(e0);
                }
              }
            );
          });
        }
        if (typeof GM_xmlhttpRequest === "function") {
          return await new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
              method: "POST",
              url: GROSS_UPH_URL,
              headers: {
                "Content-Type": "application/json; charset=UTF-8",
                Accept: "application/json, text/javascript, */*; q=0.01",
                "X-Requested-With": "XMLHttpRequest",
                Referer: GROSS_UPH_REFERER,
              },
              data: payload,
              anonymous: false,
              timeout: 28000,
              onload: function (r) {
                if (r.status < 200 || r.status >= 400) {
                  reject(new Error("HTTP " + r.status));
                  return;
                }
                try {
                  resolve(JSON.parse(String(r.responseText || "{}")));
                } catch (eParse) {
                  reject(new Error("JSON 파싱 실패"));
                }
              },
              onerror: function () {
                reject(new Error("네트워크 오류"));
              },
              ontimeout: function () {
                reject(new Error("요청 타임아웃"));
              },
            });
          });
        }
        throw new Error("MOS POST 불가 (확장/TM)");
      }

      var rowDate = document.createElement("div");
      rowDate.className = "yna4-pane-row yna4-gross-uph-toolbar";
      var dayToday = document.createElement("label");
      dayToday.className = "yna4-pane-choice";
      var inpToday = document.createElement("input");
      inpToday.type = "radio";
      inpToday.name = ROOT_ID + "-gross-uph-day";
      inpToday.value = "0";
      inpToday.checked = true;
      var txtToday = document.createElement("span");
      txtToday.className = "yna4-pane-choice-text";
      txtToday.textContent = "오늘";
      dayToday.appendChild(inpToday);
      dayToday.appendChild(txtToday);
      var dayYest = document.createElement("label");
      dayYest.className = "yna4-pane-choice";
      var inpYest = document.createElement("input");
      inpYest.type = "radio";
      inpYest.name = ROOT_ID + "-gross-uph-day";
      inpYest.value = "1";
      var txtYest = document.createElement("span");
      txtYest.className = "yna4-pane-choice-text";
      txtYest.textContent = "어제";
      dayYest.appendChild(inpYest);
      dayYest.appendChild(txtYest);
      var btnFetch = document.createElement("button");
      btnFetch.type = "button";
      btnFetch.className = "yna4-pane-btn yna4-pane-btn--primary";
      btnFetch.textContent = "조회";
      function addGrossUphLegendItem(parent, label, color, dashed) {
        var item = document.createElement("span");
        item.className = "yna4-gross-uph-legend-item";
        var sw = document.createElement("span");
        sw.className = "yna4-gross-uph-legend-swatch";
        sw.setAttribute("aria-hidden", "true");
        if (dashed) {
          sw.style.background = "transparent";
          sw.style.border = "2px dashed " + color;
        } else {
          sw.style.background = color;
          sw.style.border = "1px solid " + color;
        }
        var tx = document.createElement("span");
        tx.textContent = label;
        item.appendChild(sw);
        item.appendChild(tx);
        parent.appendChild(item);
      }

      var toolbarRight = document.createElement("div");
      toolbarRight.className = "yna4-gross-uph-toolbar-right";
      var legendWrap = document.createElement("div");
      legendWrap.className = "yna4-gross-uph-legend";
      legendWrap.setAttribute("aria-hidden", "true");
      addGrossUphLegendItem(legendWrap, "목표 200", "#DF5353", true);
      addGrossUphLegendItem(legendWrap, "선택일", "#7cb5ec", false);
      addGrossUphLegendItem(legendWrap, "1일 전", "#434348", true);
      toolbarRight.appendChild(legendWrap);
      rowDate.appendChild(dayToday);
      rowDate.appendChild(dayYest);
      rowDate.appendChild(btnFetch);
      rowDate.appendChild(toolbarRight);

      var chartWrap = document.createElement("div");
      chartWrap.className = "yna4-gross-uph-chart-wrap";
      var chartBox = document.createElement("div");
      chartBox.className = "yna4-gross-uph-canvas-box";
      chartWrap.appendChild(chartBox);

      hostEl.appendChild(rowDate);
      hostEl.appendChild(chartWrap);

      var lastJson = null;
      var fetching = false;
      btnFetch.addEventListener("click", async function () {
        if (fetching) return;
        fetching = true;
        btnFetch.disabled = true;
        var dayOff = inpYest.checked ? 1 : 0;
        var fetchLabel = btnFetch.textContent;
        btnFetch.textContent = "조회 중…";
        try {
          var reqBody = buildPayload(dayOff);
          var json = await postGrossUph(reqBody);
          lastJson = json;
          await renderGrossUphChart(chartBox, json, hostEl, "_yna4GrossChartCard");
        } catch (eFetch) {
          chartBox.textContent = "";
          lastJson = null;
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Gross UPH]", eFetch);
          }
          alert(
            "[Gross UPH] " +
              (eFetch && eFetch.message ? eFetch.message : String(eFetch))
          );
        } finally {
          fetching = false;
          btnFetch.disabled = false;
          btnFetch.textContent = fetchLabel;
        }
      });
    }


  function initStowProblemWatchPane(hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.className = "yna4-pane-mod yna4-pane-mod--stow-watch";

    var STOW_DEFAULT_ALARM_DATA_URL = "data:audio/wav;base64," +
      "UklGRgomAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YeYlAAAAABEAQACFANcAJQFiAX8BcwE3AcsANAB+/7j+" +
      "9/1N/c78i/yO/Nv8cf1F/kj/ZACBAYcCXwP1Az0EMQTTAywDTQJJATkAMv9K/pP9F/3c/N78Fv12/e/9cf7r/lP/of/U//D/" +
      "//8MACcAWwCzADEB1QGSAlkDEQSgBOoE1wRUBFcD5AEJAOT9nPtj+W/39PUl9SX1DPbc94P62v2nAaEFcwnJDFAPxRD2EMsP" +
      "Sg2TCeYEmv8X+s/0NPCt7I/qEupQ6zruofIz+IP+EwVbC9kQGBW9F4wYcheCFPcPLQqaA8f8P/aG8BDsM+kj6O7oeeuG77n0" +
      "n/q7AI8GpgujD0ISXhP4Ei4RPA5zCjEG1gG//Tr6f/ey9dn05fSx9Qv3uPh/+ir8lP2l/lr/wP/0/xoAWwDeAL0BBQOvBKEG" +
      "rQiWChgM7AzVDKULRgnBBTwB/vtp9vXwIOxq6ETmA+ba583rsvEv+cABvQpvExUb/iCTJGolTyNLHqgW6gzKASL24+r44DrZ" +
      "WtTN0sbUMNqq4pLtD/ooB84T/x7TJ5Itxy9ELiop5iAmFsoJ0fxH8CjlT9xj1s3Tq9TS2NbfD+mw89L+jwkTE6wa2x9ZIh8i" +
      "XR96GgIUmQztBJ/9P/c18sLu++zJ7PLtH/Dv8vr15vhr+179sv54/9z/GwB3ADIBfAJvBAcHHgpuDZoQNBPLFPcUaxP9D7EK" +
      "vwOP+7jy8OkC4rfbxte+1vfYhd4x53nymP+SDUsbmSdjMbo37DmaN8UwzCVvF7sG+PSQ4+/TZccIv5y7f72jxIjQSeCv8kQG" +
      "exnIKso4YELJRq9FLj/WM5kkuBKn/+7sCNxAzp3EyL8AwBrFhs5f24HqoPpsCqoYTiSRLP8wejE9Ls0n6x6AFIMJ4/5w9c/t" +
      "Zuhe5aLk6eW+6Jbs4fAX9c74wPvR/RH/tv8RAIAAYAH6AnsF5AgMDZsRFRblGXAcIh2IG14XnRCCB5D8ivBj5C7Z/8/XyYfH" +
      "lsky0CXb0ek8+xsO8iAwMk9A/kk7Tm5MfUTSNlUkXw6d9vDeRMllt92qyKTCpdStcLx+0HDoYgIjHKYzDUfTVOpb0VufVP1G" +
      "GDSHHSYF6+y/1lfECre9r9KuIbQCv2HO1uDG9I8IoRqqKag0/Tp6PFk5MjLqJ5cbZQ52Ac/1POxD5R/hwt/a4ObjQuhC7UXy" +
      "xfZq+gn9rf6M//7/bQBFAd8CcgULCYMNgxKGF+0bDB8+IAAf/holFK0KGv818gDlnNg2zubGkcPXxPTKvtWc5JP2TwpHHtYw" +
      "YUB+SxJRcVBuSWM8LyomFPn7juPdzMW53qtcpO6jtKoxuF7Lu+Jt/GgWmi4WQ0FS7Vp6XNtWmUrGOOMivwpP8oPbHsiPudew" +
      "eK5nshm8kMpz3DPwKAS/FpMmjTL6OY88cDoiNHkqgx5pEVMETfgy7pnm0OHW32ngEeMv5xnsKPHQ9az5iPxh/mb/6P9PAAYB" +
      "bQLFBCQIbwxaEWoWBBt8HisghB8nHPEVCQ3hATX1+edL21fQPcjwwyDEJMnn0uvgSfK/Bc4Z1CwwPWtJVVAmUZNL2D+2LmkZ" +
      "jwEG6cXRtL2ArnWlZKOMqJW0lcYm3X32lhBdKdk+WE+RWcNcvljrTT49IChUEMn3dOAlzGK8RrJyrvmwb7nsxirYouuw/7gS" +
      "SCM2MLY4ZTxQO+U16SxfIW0UPQfk+krwFuim4gzgFOBQ4ijm8uoG8ND04fj5+wv+Ov/R/zQA0AAIAiUESQdkCzQQSBUMGtUd" +
      "+R/lHysdmhdHD5QELPj56hDentLHyYrEqsOTx0nQZ90a7jcBRxWuKMk5EkdGT4ZRZk0FQwUzih4cB4/u19blwXSx7KY6o8Cm" +
      "SLEIwrXXlvCyCvQjWTobTNhXrFxHWu9QekE6LeAVVP2N5WnQgL8JtMCu268It3rD/tMZ5yr7kA7NH6MtMjf8O/Y7eDc3Lykk" +
      "bhczCpP9gvK36aLjZeDc36ThLeXP6eHux/MJ+Fz7qP0F/7f/HACiAK8BlAN7BmIKEQ8iFAYZFx2qHyIgCB4dGWURMAcZ+/3t" +
      "6eAI1YDLX8V0w0LG5s0S2gzqu/y3EGokLjZ1ROlNkFHmTudFGTeDI5oMI/QO3FHGt7S9qHCjUaVOrr29btLA6sMEZR6bNY5I" +
      "wlU1XHNbolN3RSsyXBvpAsrq5dTnwh62ZK8Nr+a0PsD0z5zim/ZLCiQc2CpuNVM7YTzaOGAx3SZpGjENVgDY9H3rxOTj4MPf" +
      "D+FA5LLoue208iT3svo5/cj+mf8GAHsAYQEQA7sFawn0DfoS9hdGHD4fPSDBHnwaYhOzCfj9AfHS45HXZ81rxn3DMcW/y/DW" +
      "IuZR+CQMDSBmMphBPkxHURFQfEjtOlEoAxK8+WTh9MpFuOiqBaRBpKmruLlZzQDlz/62GKUwtURTU15bQlwAVjBJ7TbCIIII" +
      "JPCV2ZPGg7hcsJKuDrM8vRLMMt4H8u0FURjWJ2wzaTqOPAc6YTN3KVkdNBAsA0v3Ze0M5oThyt+T4GTjnOeQ7JvxNPb6+b38" +
      "gf52//H/WgAeAZkCCAV/CN0M0RHdFmMbuR43IFQftRs9FRsMxwAD9MfmNdp4z63Hw8NixNbJA9Rg4v3zkgeaG3Mufj5ISqpQ" +
      "6FDBSn4+7SxSF1T/1ObKzxm8aK35pJCjXqn9tXjIXd/c+O0SeyuTQIxQKFqxXAhYoEx7OwwmGg6W9XXegco3u6qxaq6CsXi6" +
      "W8jd2XXtfAFZFJ8kLTE/OX48/To2NfMrPCA4ExEG2Plw73nnTOLy3zPgmuKQ5mjre/A49TT5NPwv/kz/2v8+AOUALwJjBJ8H" +
      "zgupEL0VcRoaHhEgwx/HHPQWZQ6CA/72xeny3LHRI8lFxNLDLMhO0cnew+8GAxgXWyosOwtIvE9qUbVMyEFTMYEc5QRW7MvU" +
      "MMA8sEumP6Ntp5Cy08Pd2fHyDw0jJi08cE2TWMFctVnET9A/NSuqExv7f+Otzji+S7OWrkSw9bfUxKXV6Oj6/D0QNyGyLtQ3" +
      "Ljy7O902Ty4OIzsWAgl+/JvxDOk54z3g79/m4Y/lQ+pX7zL0Yfid+9H9G//C/yYAtADRAcwDzAbICoUPmBRwGWYdzR8OILQd" +
      "hxiQECgG7/nI7MTfDdTKygPFgsPBxtPOYdun64T+ixIjJqU3iEV+TpZRVk7JRH81iyFqCubx9NmFxGCz+KdPo9ildK9tv4XU" +
      "E+0kB6MgiDcDSqJWcFwHW5hS50M2MCwZrACu6BPTgsE/tRivVq+4tYLBjdFm5G74AwygHf0rKjaeOz08UziIMMslORn9Czn/" +
      "5fPD6kvkrODJ30fhneQj6S/uI/OB9/j6Z/3i/qb/DwCKAH8BQwMGBswJZQ5wE2QYnBxtHzYgfB70GZsStQjU/Mzvp+KJ1p/M" +
      "+cVyw5fFlMwq2K/nE/r5Dc4h7jPEQvJMblGkT31HbTlrJtwPfvc+3xPJ0LYAqr6joqStrEu7W89K5zEBABunMkhGV1S/W/tb" +
      "GFW7Rww1nB5EBv3tr9cTxYS376+5rsKzaL6azfPf3POvB94ZEClBNM86gzyVOZkybyguHP8OCAJN9p7shOU/4cPfwuC64wro" +
      "Bu0M8pX2Rfrw/J/+hf/6/2cAOAHHAk4F3AhMDUcSThfAG/EePSAdHzwbgxQoC6r/z/KX5SPZoM4mx5/DrcSSyijV3OO19WUJ" +
      "ZB0MMMI/GkvzUJxQ4kkZPRsrNhUX/aTk1c2Jul6sjaTLoz6qcrdlypvhPftAFZItQ0KyUa9akFxDV0lLrznyI90LZvN93OfI" +
      "GboasXCuF7KLu9LJlttJ70UD9BXuJRoyvjmMPKE6gDT4KhcfAxLnBND4m+7j5vjh3t9W4Oni+ube6+/wnvWF+Wz8Uf5e/+T/" +
      "SQD7AFgCpAT3BzkMHxExFtMaXB4kIJsfXhxJFn4NbQLN9ZLo19vJ0IjICsQExM7IXdIz4HDx1gTnGAIshjz4SCVQQFH3S4BA" +
      "ly9zGqwCIOrG0oa+Ea+5pVSjKKjls6fFDNxO9WoPSyj4PbhOQFnGXBRZjE4bPikpcRHk+Hbh+8z7vJqyeq66sO64N8ZS17nq" +
      "yf7mEZkity9tOFY8djs5NmIt8CEHFdQHbPu58Gbo1eIb4AfgK+L05bjqzO+c9Lf42/v4/TD/zP8vAMYA9QEHBB8HMAv6Dw4V" +
      "2BmwHewf9B9aHeoXtg8cBcP4k+uh3hfTG8qwxJvDSsfKz7jcSO1QAF4U1icUOZFGB0+OUbpNnkPbM4wfNwis7+DXwsIVskKn" +
      "PaNvpqiwJ8Gj1mrvgwnaIms5a0t0V5xci1qAUUxCOy76FnH+l+ZK0SjAbbTarquvlbbQwizTMuZB+rcNFR8ZLdw24DsQPMM3" +
      "qS+1JAcYywof/vfyD+rZ43zg1d+E4fzklumm7pHz3Pc7+5P9+v6x/xgAmgCfAXgDVAYwCtgO5xPRGO8clx8qIDAeZxnOEbMH" +
      "rfuX7n3hh9Xey5DFccMGxnPNbdlB6dj7zQ+NI3A150OZTYhRKU9xRuI3fSSxDUH1Hd06x2e1JamGoxOlv63qvGbRmOmTA0Ud" +
      "ojTPR0xVElykWyJUO0YjM3IcBwTa69HVncOSto+v7q6CtJ+/Ks+54bH1bQlkG0IqDDUpO288GjnKMWQnABvLDeYAU/Xb6wLl" +
      "AOHC3/TgE+R66H3tffL19o76If27/pP/AgB0AFMB9wKWBTsJuw2+Er4XGhwmHz4g4R69GsQTMQqK/pvxaeQW2M7Np8aGwwPF" +
      "WMtW1l/lcfc6CyofnzH+QN9LLlFDUPZIqTtBKRUT2vp54ujLA7lhqy+kFqQtq/O4Wszd4579kBegL+dDy1InW2Bcb1bmSdo3" +
      "0yGgCTnxi9pXxwe5mLCDrrmyqbxQy1LdHfELBYkXNSf+MjM6kDw9OsIz+CnuHc4QvwPL98vtUuap4c/ffuA642bnVOxi8QL2" +
      "0/mj/HH+bv/t/1QAEgGDAuYEUQimDJYRpBY0G5seMiBtH+8bmBWSDFUBnPRg57/a58/0x9jDQMR7yXTTpeEi86gGtBqkLdg9" +
      "20mBUAlRLEssP9ItXhhyAOznxtDmvPOtNqV4o/OoR7WFx0HerPfCEW0qtz/zT95ZvFxlWEdNXTwXJzcPr/Z031LLy7v2sWyu" +
      "PLHyuaLHA9mL7JYAiRP0I7Mw/DhzPCg7jjVvLM4g0xOnBl763O/H53ji/98j4HXiXOYt60HwBPUL+Rf8Hf5D/9b/OQDaABsC" +
      "RAR0B5kLbxCDFT4a+B0GINQf+hxIF9cODASV91/qgd0n0nTJZ8S9w97Hy9AX3u7uHgIwFoUpezqPR4NPeVEPTWhCLTKGHQEG" +
      "cu3R1QnB17CapjujFKfqsezCyNjD8eELDCVEO8dMN1i4XABaW1CmQDgsxRQ3/IXkis/avqizqq4OsH23JsTR1ADoEvxnD4Mg" +
      "LC6ENxY82TssN8QunCPVFpoJCP0O8mHpbeNR4OXfxOFe5QnqHO/98zX4ffu9/RH/vP8hAKsAwAGwA6MGlQpLD10UOxk/Hbwf" +
      "GSDfHdMY+xCtBoT6Yu1W4IrUJMswxXrDgMZbzrja2eqf/aERRyXrNgBFNU6VUaBOWUVNNogiggsE8wHbasUKtFmoXaOTpd+u" +
      "lL550+nr9AWFH5M2Skk0VlRcP1sfU7BEMjFEGsoBu+n70zPCrbU8rzCvTrXfwMDQgeOF9ygL4xxsK801ejtQPJc49TBUJtEZ" +
      "lwzH/170H+uH5Mfgxd8r4W7k6uj07ezyU/fV+lD91f6f/wsAgwBwASkD4AWbCSwONRMtGHIcVh86IJ8eORr/EjUJZ/1n8Dzj" +
      "DNcCzTHGdsNjxSjMjNfo5jH5Dg3uICszL0KZTFxR3E/+Ry86XyfwEJ34UeADyom3cqrgo2+kKqyAulnOJeYAANsZpzGARdZT" +
      "kVsgXI5Vd0j9Na8fYwcQ76HY0cUCuCSwpK5ns9G91cwS3/LyzwYYGXQo2DOdOoo8zzn+MvQoxByZD5kCy/YB7cflYeHG36rg" +
      "juPT58vs1PFl9iD61/yQ/n3/9f9hACsBsAIrBa0IFA0MEhYXkhvVHjsgOR95G+EUogs5AGnzL+as2QvPaceww4bEM8qU1B3j" +
      "2PR7CH8cQC8hP7JK0FDEUFNKzT0FLEUWNv685c7OULvhrMGkrKPMqba2bcl74Az6FxSHLGxBIVFtWqNcp1f2S5Y6/yT8DH70" +
      "eN2zyae6YLFrrsuxALsVybnaX+5hAicVSCWlMYA5hjzQOtw0diuqH54SfAVT+QXvLech4uffRODB4sXmo+u18Gv1XflQ/ED+" +
      "Vf/f/0QA7wBDAoMEywcDDOQQ9xWiGjweGyCvH5McnxbyDfgCZvYr6WTcPNHUyCfE6sN8yNTRfd+Z8O4DABgvK9o7g0jyT1ZR" +
      "WEwmQXYwexvJAzvryNNav6WvAKZIo8mnObO8xPTaH/Q9DjgnFD0WTuxYxVxmWSlP9z4vKo4S//l64tPNmL3xsoeufbBxuIXF" +
      "e9bQ6eL9EhHpITUvIjhDPJk7jDbZLX8ioRVrCPT7KfG46AbjLOD63wjiwuV96pHvZ/SM+Lz75f0m/8f/KgC9AOMB6QP1BvwK" +
      "vw/TFKQZix3dHwEgiB05GCQQogVZ+S3sMt+R03LK2MSNwwTHTc8M3Hfsav91E/0mXjgORsROlFEKTjVErjSMIFEJyfDp2KPD" +
      "ubKbp0SjIqYNsEnAk9U+7lQIvyF7OLlKDVeIXMpaDVIaQzovFBiO/6LnLtLUwNS0965/ryW2KMJc0kzlWPneDFsejCyFNsA7" +
      "KDwMOBkwQSWgGGQLq/5u82jqEeST4M7fZeHM5Fzpau5a86/3Gvt9/e7+rP8TAJIAjwFdAy0G/gmeDqwTmhjGHIIfMSBXHq4Z" +
      "NRI1CEH8Mu8S4gjWPszDxXDDzcUCzcvYd+j1+uMOriKwNFdDR019UWhP+UapOHUlxw5g9i3eJsgatpGpoKPZpDWtGbxg0HDo" +
      "YgIjHKYzDUfTVOpb0VufVP1GGDSHHSYF6+y/1lfECre9r9KuIbQCv2HO1uDG9I8IoRqqKag0/Tp6PFk5MjLqJ5cbZQ52Ac/1" +
      "POxD5R/hwt/a4ObjQuhC7UXyxfZq+gn9rf6M//7/bQBFAd8CcgULCYMNgxKGF+0bDB8+IAAf/holFK0KGv818gDlnNg2zubG" +
      "kcPXxPTKvtWc5JP2TwpHHtYwYUB+SxJRcVBuSWM8LyomFPn7juPdzMW53qtcpO6jtKoxuF7Lu+Jt/GgWmi4WQ0FS7Vp6XNtW" +
      "mUrGOOMivwpP8oPbHsiPudeweK5nshm8kMpz3DPwKAS/FpMmjTL6OY88cDoiNHkqgx5pEVMETfgy7pnm0OHW32ngEeMv5xns" +
      "KPHQ9az5iPxh/mb/6P9PAAYBbQLFBCQIbwxaEWoWBBt8HisghB8nHPEVCQ3hATX1+edL21fQPcjwwyDEJMnn0uvgSfK/Bc4Z" +
      "1CwwPWtJVVAmUZNL2D+2LmkZjwEG6cXRtL2ArnWlZKOMqJW0lcYm3X32lhBdKdk+WE+RWcNcvljrTT49IChUEMn3dOAlzGK8" +
      "RrJyrvmwb7nsxirYouuw/7gSSCM2MLY4ZTxQO+U16SxfIW0UPQfk+krwFuim4gzgFOBQ4ijm8uoG8ND04fj5+wv+Ov/R/zQA" +
      "0AAIAiUESQdkCzQQSBUMGtUd+R/lHysdmhdHD5QELPj56hDentLHyYrEqsOTx0nQZ90a7jcBRxWuKMk5EkdGT4ZRZk0FQwUz" +
      "ih4cB4/u19blwXSx7KY6o8CmSLEIwrXXlvCyCvQjWTobTNhXrFxHWu9QekE6LeAVVP2N5WnQgL8JtMCu268It3rD/tMZ5yr7" +
      "kA7NH6MtMjf8O/Y7eDc3LykkbhczCpP9gvK36aLjZeDc36ThLeXP6eHux/MJ+Fz7qP0F/7f/HACiAK8BlAN7BmIKEQ8iFAYZ" +
      "Fx2qHyIgCB4dGWURMAcZ+/3t6eAI1YDLX8V0w0LG5s0S2gzqu/y3EGokLjZ1ROlNkFHmTudFGTeDI5oMI/QO3FHGt7S9qHCj" +
      "UaVOrr29btLA6sMEZR6bNY5IwlU1XHNbolN3RSsyXBvpAsrq5dTnwh62ZK8Nr+a0PsD0z5zim/ZLCiQc2CpuNVM7YTzaOGAx" +
      "3SZpGjENVgDY9H3rxOTj4MPfD+FA5LLoue208iT3svo5/cj+mf8GAHsAYQEQA7sFawn0DfoS9hdGHD4fPSDBHnwaYhOzCfj9" +
      "AfHS45HXZ81rxn3DMcW/y/DWIuZR+CQMDSBmMphBPkxHURFQfEjtOlEoAxK8+WTh9MpFuOiqBaRBpKmruLlZzQDlz/62GKUw" +
      "tURTU15bQlwAVjBJ7TbCIIIIJPCV2ZPGg7hcsJKuDrM8vRLMMt4H8u0FURjWJ2wzaTqOPAc6YTN3KVkdNBAsA0v3Ze0M5oTh" +
      "yt+T4GTjnOeQ7JvxNPb6+b38gf52//H/WgAeAZkCCAV/CN0M0RHdFmMbuR43IFQftRs9FRsMxwAD9MfmNdp4z63Hw8NixNbJ" +
      "A9Rg4v3zkgeaG3Mufj5ISqpQ6FDBSn4+7SxSF1T/1ObKzxm8aK35pJCjXqn9tXjIXd/c+O0SeyuTQIxQKFqxXAhYoEx7Owwm" +
      "Gg6W9XXegco3u6qxaq6CsXi6W8jd2XXtfAFZFJ8kLTE/OX48/To2NfMrPCA4ExEG2Plw73nnTOLy3zPgmuKQ5mjre/A49TT5" +
      "NPwv/kz/2v8+AOUALwJjBJ8HzgupEL0VcRoaHhEgwx/HHPQWZQ6CA/72xeny3LHRI8lFxNLDLMhO0cnew+8GAxgXWyosOwtI" +
      "vE9qUbVMyEFTMYEc5QRW7MvUMMA8sEumP6Ntp5Cy08Pd2fHyDw0jJi08cE2TWMFctVnET9A/NSuqExv7f+Otzji+S7OWrkSw" +
      "9bfUxKXV6Oj6/D0QNyGyLtQ3Ljy7O902Ty4OIzsWAgl+/JvxDOk54z3g79/m4Y/lQ+pX7zL0Yfid+9H9G//C/yYAtADRAcwD" +
      "zAbICoUPmBRwGWYdzR8OILQdhxiQECgG7/nI7MTfDdTKygPFgsPBxtPOYdun64T+ixIjJqU3iEV+TpZRVk7JRH81iyFqCubx" +
      "9NmFxGCz+KdPo9ildK9tv4XUE+0kB6MgiDcDSqJWcFwHW5hS50M2MCwZrACu6BPTgsE/tRivVq+4tYLBjdFm5G74AwygHf0r" +
      "KjaeOz08UziIMMslORn9Czn/5fPD6kvkrODJ30fhneQj6S/uI/OB9/j6Z/3i/qb/DwCKAH8BQwMGBswJZQ5wE2QYnBxtHzYg" +
      "fB70GZsStQjU/Mzvp+KJ1p/M+cVyw5fFlMwq2K/nE/r5Dc4h7jPEQvJMblGkT31HbTlrJtwPfvc+3xPJ0LYAqr6joqStrEu7" +
      "W89K5zEBABunMkhGV1S/W/tbGFW7Rww1nB5EBv3tr9cTxYS376+5rsKzaL6azfPf3POvB94ZEClBNM86gzyVOZkybyguHP8O" +
      "CAJN9p7shOU/4cPfwuC64wroBu0M8pX2Rfrw/J/+hf/6/2cAOAHHAk4F3AhMDUcSThfAG/EePSAdHzwbgxQoC6r/z/KX5SPZ" +
      "oM4mx5/DrcSSyijV3OO19WUJZB0MMMI/GkvzUJxQ4kkZPRsrNhUX/aTk1c2Jul6sjaTLoz6qcrdlypvhPftAFZItQ0KyUa9a" +
      "kFxDV0lLrznyI90LZvN93OfIGboasXCuF7KLu9LJlttJ70UD9BXuJRoyvjmMPKE6gDT4KhcfAxLnBND4m+7j5vjh3t9W4Oni" +
      "+ube6+/wnvWF+Wz8Uf5e/+T/SQD7AFgCpAT3BzkMHxExFtMaXB4kIJsfXhxJFn4NbQLN9ZLo19vJ0IjICsQExM7IXdIz4HDx" +
      "1gTnGAIshjz4SCVQQFH3S4BAly9zGqwCIOrG0oa+Ea+5pVSjKKjls6fFDNxO9WoPSyj4PbhOQFnGXBRZjE4bPikpcRHk+Hbh" +
      "+8z7vJqyeq66sO64N8ZS17nqyf7mEZkity9tOFY8djs5NmIt8CEHFdQHbPu58Gbo1eIb4AfgK+L05bjqzO+c9Lf42/v4/TD/" +
      "zP8vAMYA9QEHBB8HMAv6Dw4V2BmwHewf9B9aHeoXtg8cBcP4k+uh3hfTG8qwxJvDSsfKz7jcSO1QAF4U1icUOZFGB0+OUbpN" +
      "nkPbM4wfNwis7+DXwsIVskKnPaNvpqiwJ8Gj1mrvgwnaIms5a0t0V5xci1qAUUxCOy76FnH+l+ZK0SjAbbTarquvlbbQwizT" +
      "MuZB+rcNFR8ZLdw24DsQPMM3qS+1JAcYywof/vfyD+rZ43zg1d+E4fzklumm7pHz3Pc7+5P9+v6x/xgAmgCfAXgDVAYwCtgO" +
      "5xPRGO8clx8qIDAeZxnOEbMHrfuX7n3hh9Xey5DFccMGxnPNbdlB6dj7zQ+NI3A150OZTYhRKU9xRuI3fSSxDUH1Hd06x2e1" +
      "JamGoxOlv63qvGbRmOmTA0UdojTPR0xVElykWyJUO0YjM3IcBwTa69HVncOSto+v7q6CtJ+/Ks+54bH1bQlkG0IqDDUpO288" +
      "GjnKMWQnABvLDeYAU/Xb6wLlAOHC3/TgE+R66H3tffL19o76If27/pP/AgB0AFMB9wKWBTsJuw2+Er4XGhwmHz4g4R69GsQT" +
      "MQqK/pvxaeQW2M7Np8aGwwPFWMtW1l/lcfc6CyofnzH+QN9LLlFDUPZIqTtBKRUT2vp54ujLA7lhqy+kFqQtq/O4Wszd4579" +
      "kBegL+dDy1InW2Bcb1bmSdo30yGgCTnxi9pXxwe5mLCDrrmyqbxQy1LdHfELBYkXNSf+MjM6kDw9OsIz+CnuHc4QvwPL98vt" +
      "Uuap4c/ffuA642bnW+xr8Qz22/mo/HT+cP/t/1MADgF6AtMELghtDEERMBagGusdbh+kHjMbABU2DEoB9/Qt6AHcltH8yRrG" +
      "kMaqy0rV7+Ky81wGeBl5K9U6KkZhTMhMIUezOz8r+BZrAF7pq9MXwS6zHKuZqdOuarp6y6jgR/hzED4n3DrBSctSUVU2UedG" +
      "TzfEI+cNgPdX4g/QBMIuuRK2uLiwwCHN3dx97ocAiBE5IJYr7jLzNbk0qi99Jx0dkRHjBQX7wvGn6gPm4OMK5B3mkOnO7UPy" +
      "bvby+Zr8Xf5d/9v/MQC8ANABqwNmBvIJEg5kEmgWjBlCGw4bmBi7E48MawPm+Mft++J92UDSFs6bzSHRpNjF48/xwgFjElwi" +
      "UjAKO39BA0NJP3Q2FSkjGOcE4fCs3djMyL+Wt/m0MrgLwdXOeuCT9IUJpB1XLzs9Pka2SXBHrz8nM+8iYhAF/WXq9dnxzEPE" +
      "dMCkwYjHd9F63mbt9vzmCxMZjSOuKh4u3C01KrgjJxthEUwHv/1w9eTubeoe6NfnSekG7I7vYPMJ9zL6pfxS/k//zv8YAH4A" +
      "SgG2At8EwAcvC94OYxJHFQwXRRefFe8RQAzOBA/8pfJS6e3gRtoY1vTULdfR3KDlEPFT/mgMMBqDJk0wpjbnOL42MzCsJeoX" +
      "9QcL94Xmudffy/XDqcBJwrvIg9PH4WTyBgRGFcUkSjHdOdw9BT17N8QttyBvETABRvHz4krXIs//yhHLK8/P1jrheu1/+jkH" +
      "qxICHKMiNyatJjgkRR9vGG0Q/wfc/6T40vKx7l7sx+ux7MXumvHE9OD3n/rN/Ff+SP/F/wcAUADhAO4BlAPWBZgInwuZDiMR" +
      "1xJWE1YSqw9UC3oFdf7C9v7u1+f74Qregty23b3hcOhq8Q38jgcEE3wdDibzK5Quny0JKRchWBaXCdT7I+6h4VTXF9CGzPTM" +
      "XtFt2YHkt/EAADkOPxsNJswt5zEYMmouOScoHRIR+APr9vDq8uCq2ZPV4dSA1xbdE+W27in5jwMVDQkV5RpVHkEfxh0yGv0U" +
      "tQ70B1IBVPti9sLyk/DO70vwx/Hx83L29/g/+xn9cv5L/8D/+/8vAJEATgGAAjAESwaqCA0LKg2vDk8Pyw77DNcJeAUbAB36" +
      "9/Mt7kzp1OUu5KTkUecj7NLy7frZA+UMUhVpHIUhKiQLJBMhbRt6E9QJNv969HrqCeLY22zYEdjT2nzgmuiH8nf9igjeEqQb" +
      "LSL7JcommCSeH1AYTw9bBUT72PHO6b7jD+D23m3gOuT36Rfx+PjyAGIIug6ME5IWrhfwFowU1xA7DCsHGwJy/Yf5kfaw9OLz" +
      "D/QI9ZL2avhT+hb8jf2l/lz/wv/0/xgAVgDQAJ4ByQJIBP8FxQdjCZ8KPQsNC+4J1QfQBAUBtvw1+OXzKfBh7eDr3+t57abw" +
      "O/Xr+ksB3AcXDnQTehfIGSEabhjEFGMPsQgxAXz5LvLh6xfnNuR94/zklej/7cv0bPxFBLcLLBIiFzsaQBsmGg4XQhIuDFYF" +
      "SP6W98PxPu1U6jDp1ukk7NjvlfTt+Wz/oQQoCbAMBA8LEMsPYw4JDAMJoAUuAvX+M/wQ+qb49/f094L4efmt+vT7Kf0v/vf+" +
      "fv/M//L/CgAtAHIA6gCeAYoCnwPDBNUFrwYrBykHkgZcBY0DPAGO/rf78viB9p/0gfNO8xv05fWW+P/74f/xA9kHRgvsDY4P" +
      "AhA4DzcNJAo6BsUBIf2s+ML0tPHC7xPvtu+c8Zz0ePjf/HUB3QW+CcwMzA6dDzUPpA0SC7wH6gPu/xr8uvgN9kH0cfOf8730" +
      "pfYn+Qf8Bf/iAWcEZwbFB3EIbAjHB50GEwVTA4YB0/9a/jH9Z/z+++/7Lfyi/Dr93v17/gP/bf+1/+D/9v8CABAALABeAKoA" +
      "EAGJAQoChgLqAicDLgP1AnkCuwHFAKf/d/5O/Ub8efv6+tr6IPvL+9D8Hv6a/ycBpQL0A/cEmgXOBY8F4QTTA3sC9gBj/+P9" +
      "lPyR++z6sPrf+nL7WvyA/cv+HgBfAXQCSQPRAwUE5wN+A9cCBQIbATAAVf+c/hD+uP2Y/av96v1L/sL+Q/+//y8AiADIAOwA" +
      "9QDoAMoAoQBzAEcAIAADAPD/5//m/+z/9v8=";



    var STAT_URL = "/stowing/problem/statistic";
    var PAGE_URL = "/stowing/problem/paging";
    var LIST_REFERER = "https://inbound.coupang.com/stowing/problem/list";
    /** 처리상태·진열작업자 열만 골라도 페이지당 행 수는 유지 → 빈 필터 결과로 조기 종료하지 않도록 상한만 둠 */
    var MAX_PAGES = 500;

    var statusId = ROOT_ID + "-stow-problem-watch-status";
    var alertWrapId = ROOT_ID + "-stow-problem-watch-alert";

    var pollTimer = null;
    var running = false;
    var lastStowWatchToneAt = 0;
    var STOW_ALARM_CUSTOM_GM_KEY = ROOT_ID + "-stow-alarm-custom-dataurl";

    function stowWatchResolveAlarmSrc() {
      try {
        if (typeof GM_getValue === "function") {
          var gv = String(GM_getValue(STOW_ALARM_CUSTOM_GM_KEY, "") || "").trim();
          if (
            gv.indexOf("data:audio") === 0 ||
            (gv.indexOf("data:") === 0 && gv.indexOf("base64,") > 0)
          ) {
            return gv;
          }
        }
      } catch (eG) {}
      try {
        var ls = String(localStorage.getItem(STOW_ALARM_CUSTOM_GM_KEY) || "").trim();
        if (ls.indexOf("data:") === 0 && ls.indexOf("base64,") > 0) return ls;
      } catch (eL) {}
      try {
        if (
          typeof chrome !== "undefined" &&
          chrome.runtime &&
          typeof chrome.runtime.id === "string" &&
          chrome.runtime.id.length &&
          typeof chrome.runtime.getURL === "function"
        ) {
          return chrome.runtime.getURL("media/stow-watch-alarm.wav");
        }
      } catch (eC) {}
      return STOW_DEFAULT_ALARM_DATA_URL;
    }

    function ymdFromDelta(days) {
      var d = new Date();
      d.setDate(d.getDate() + (typeof days === "number" ? days : 0));
      return unloadYmdFromDate(d);
    }

    function buildFilterQs(startY, endY) {
      var p = new URLSearchParams();
      p.set("sourceType", "");
      p.set("stowType", "");
      p.set("cartBarcode", "");
      p.set("status", "");
      p.set("problemType", "");
      p.set("end", endY || "");
      p.set("start", startY || "");
      return p.toString();
    }

    async function fetchInboundHtml(pathWithQuery) {
      var url = "https://inbound.coupang.com" + pathWithQuery;
      if (typeof GM_xmlhttpRequest === "function") {
        return await new Promise(function (resolve, reject) {
          GM_xmlhttpRequest({
            method: "GET",
            url: url,
            anonymous: false,
            headers: {
              Accept: "text/html, */*;q=0.8",
              "X-Requested-With": "XMLHttpRequest",
              Referer: LIST_REFERER,
            },
            onload: function (r) {
              if (r.status >= 200 && r.status < 400) {
                resolve(String(r.responseText || ""));
              } else {
                reject(new Error(pathWithQuery.split("?")[0] + " HTTP " + r.status));
              }
            },
            onerror: function () {
              reject(new Error("네트워크 오류 · " + pathWithQuery.split("?")[0]));
            },
          });
        });
      }
      var res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "text/html, */*;q=0.8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: LIST_REFERER,
        },
      });
      if (!res.ok) throw new Error(pathWithQuery.split("?")[0] + " HTTP " + res.status);
      return String(await res.text() || "");
    }

    function parseStatisticUnhandledTotal(html) {
      var doc = new DOMParser().parseFromString(html, "text/html");
      var spans = doc.querySelectorAll("span");
      var i;
      for (i = 0; i < spans.length; i++) {
        var t = String(spans[i].textContent || "").replace(/\s+/g, " ").trim();
        if (/미처리\s*보고\s*건\s*수/i.test(t)) {
          var j;
          for (j = i; j < Math.min(i + 8, spans.length); j++) {
            var m = /Total\s*:\s*(\d+)/i.exec(
              String(spans[j].textContent || "")
            );
            if (m) return parseInt(m[1], 10);
          }
        }
      }
      var fallback = /미처리[\s\S]{0,400}?Total\s*:\s*(\d+)/i.exec(html);
      if (fallback) return parseInt(fallback[1], 10);
      return null;
    }

    function stowGetMainProblemTable(doc) {
      var tables = doc.querySelectorAll("table");
      var best = null;
      var bestScore = -1;
      var ti;
      for (ti = 0; ti < tables.length; ti++) {
        var tbl = tables[ti];
        var tbody = tbl.querySelector("tbody");
        if (!tbody) continue;
        var kids = tbody.children;
        var score = 0;
        var ci;
        for (ci = 0; ci < kids.length; ci++) {
          if (String(kids[ci].tagName || "").toLowerCase() !== "tr") continue;
          if (kids[ci].querySelector("a[href*='stowProblemId=']")) score++;
        }
        if (score > bestScore) {
          bestScore = score;
          best = tbl;
        }
      }
      return best;
    }

    /** 필터용 thead 행은 칸이 많아도 실제 컬럼명 행이 아닐 수 있음 → 키워드로 행 선택 */
    function stowProblemHeaderRowPickScore(texts) {
      if (!texts || !texts.length) return -1e9;
      var sem = 0;
      var empty = 0;
      var hi;
      for (hi = 0; hi < texts.length; hi++) {
        var raw = String(texts[hi] || "").trim();
        if (!raw) {
          empty++;
          continue;
        }
        var n = unloadSlaNormKey(raw);
        if (!n) continue;
        if (n.indexOf("진열") >= 0) sem += 3;
        if (n.indexOf("오류") >= 0) sem += 1;
        if (n.indexOf("작업자") >= 0 || n.indexOf("담당") >= 0) sem += 2;
        if (n.indexOf("문제") >= 0) sem += 1;
        if (n.indexOf("보고") >= 0) sem += 2;
        if (n.indexOf("사유") >= 0) sem += 2;
        if (n.indexOf("처리") >= 0 && n.indexOf("상태") >= 0) sem += 3;
      }
      if (empty / texts.length > 0.55) sem -= 5;
      return sem * 1000 + texts.length;
    }

    /** thead 가 2줄 이상일 때 컬럼명이 있는 행을 우선(필터 행보다 열 수 적을 수 있음) */
    function stowProblemHeaderTextsFromTable(tbl) {
      if (!tbl) return [];
      var thead = tbl.querySelector("thead");
      if (thead) {
        var rows = thead.querySelectorAll("tr");
        var best = [];
        var bestPick = -1e9;
        var ri;
        for (ri = 0; ri < rows.length; ri++) {
          var cells = rows[ri].querySelectorAll("th, td");
          if (!cells.length) continue;
          var texts = [];
          var hi;
          for (hi = 0; hi < cells.length; hi++) {
            texts.push(
              String(cells[hi].textContent || "").replace(/\s+/g, " ").trim()
            );
          }
          var pick = stowProblemHeaderRowPickScore(texts);
          if (pick > bestPick) {
            bestPick = pick;
            best = texts;
          }
        }
        if (best.length) return best;
      }
      var row = tbl.querySelector("thead tr") || tbl.querySelector("tr");
      if (!row) return [];
      var cells0 = row.querySelectorAll("th, td");
      if (!cells0 || !cells0.length) return [];
      var out0 = [];
      var hj;
      for (hj = 0; hj < cells0.length; hj++) {
        out0.push(
          String(cells0[hj].textContent || "").replace(/\s+/g, " ").trim()
        );
      }
      return out0;
    }

    /** STOW 전용: unloadSlaFindCol 의 cn.indexOf(hn) 때문에 "작업자"만 있는 열이 "진열작업자"에 먼저 매칭되는 문제 방지 */
    function stowProblemFindCol(headerTexts, candidates) {
      var h = headerTexts.map(function (x, i) {
        return { n: unloadSlaNormKey(x), i: i };
      });
      var ci;
      for (ci = 0; ci < candidates.length; ci++) {
        var cn = unloadSlaNormKey(candidates[ci]);
        if (!cn) continue;
        var hi;
        for (hi = 0; hi < h.length; hi++) {
          var hn = h[hi].n;
          if (hn === cn || hn.indexOf(cn) >= 0) return h[hi].i;
          if (hn.length >= 4 && cn.indexOf(hn) >= 0) return h[hi].i;
        }
      }
      return -1;
    }

    /** 동일 헤더가 여러 열에 걸릴 때 오류/진열 작업자는 보통 오른쪽 열이 맞는 경우가 많음 */
    function stowProblemFindColRightmost(headerTexts, candidates) {
      var h = headerTexts.map(function (x, i) {
        return { n: unloadSlaNormKey(x), i: i };
      });
      var bestI = -1;
      var ci;
      var hi;
      for (ci = 0; ci < candidates.length; ci++) {
        var cn = unloadSlaNormKey(candidates[ci]);
        if (!cn) continue;
        for (hi = 0; hi < h.length; hi++) {
          var hn = h[hi].n;
          var match =
            hn === cn ||
            hn.indexOf(cn) >= 0 ||
            (hn.length >= 4 && cn.indexOf(hn) >= 0);
          if (match && h[hi].i >= bestI) bestI = h[hi].i;
        }
      }
      return bestI;
    }

    function stowProblemColumnMap(headerTexts) {
      if (!headerTexts || !headerTexts.length) return null;
      return {
        worker: stowProblemFindColRightmost(headerTexts, [
          "진열작업자",
          "진열 작업자",
          "진열담당",
          "진열 담당",
        ]),
        reportAt: stowProblemFindCol(headerTexts, [
          "문제보고일시",
          "문제보고 일시",
          "보고일시",
          "보고 일시",
          "등록일시",
          "등록 일시",
        ]),
        reason: stowProblemFindCol(headerTexts, [
          "문제보고사유",
          "문제보고 사유",
          "보고사유",
          "보고 사유",
          "문제사유",
          "오류사유",
          "진열오류사유",
        ]),
        status: stowProblemFindCol(headerTexts, ["처리상태", "처리 상태"]),
      };
    }

    function stowProblemCellPlainText(td) {
      if (!td) return "";
      try {
        if (typeof td.innerText === "string" && td.innerText.length) {
          return String(td.innerText).replace(/\s+/g, " ").trim();
        }
      } catch (eIn) {}
      return String(td.textContent || "").replace(/\s+/g, " ").trim();
    }

    function stowProblemLooksLikeSingleKoName(token) {
      var t = String(token || "").replace(/\s/g, "");
      if (!t || t.length < 2 || t.length > 4) return false;
      return /^[가-힣]+$/.test(t);
    }

    /** 한 셀에 "전상훈 전소희"처럼 짧은 한글 이름만 나열된 경우 첫 이름만(오류 작업자 우선) */
    function stowProblemWorkerDisplayFromPlain(s) {
      s = String(s || "").replace(/\s+/g, " ").trim();
      if (!s) return "";
      var parts = s.split(/[\s\/|,·]+/).map(function (x) {
        return String(x || "").trim();
      }).filter(Boolean);
      if (parts.length < 2) return s;
      var pi;
      for (pi = 0; pi < parts.length; pi++) {
        if (!stowProblemLooksLikeSingleKoName(parts[pi])) return s;
      }
      return parts[0];
    }

    /** 처리상태 셀에 [오류보고] / 오류보고 포함 시 */
    function stowProblemStatusIsOgReport(statusRaw) {
      return unloadSlaNormKey(String(statusRaw || "")).indexOf("오류보고") >= 0;
    }

    /** 페이징 HTML에 데이터 행이 더 없는지(필터와 무관하게 stow 링크 행 수) */
    function stowPagingCountTbodyRowsWithStowLink(html) {
      var doc = new DOMParser().parseFromString(html, "text/html");
      var tblMain = stowGetMainProblemTable(doc) || doc.querySelector("table");
      var tbody = tblMain && tblMain.querySelector("tbody");
      if (!tbody) return 0;
      var ch = tbody.children;
      var n = 0;
      var ti;
      for (ti = 0; ti < ch.length; ti++) {
        if (String(ch[ti].tagName || "").toLowerCase() !== "tr") continue;
        if (ch[ti].querySelector('a[href*="stowProblemId="]')) n++;
      }
      return n;
    }

    function parseUnhandledRowsFromPagingHtml(html) {
      var doc = new DOMParser().parseFromString(html, "text/html");
      var tblMain = stowGetMainProblemTable(doc) || doc.querySelector("table");
      var cmap = stowProblemColumnMap(stowProblemHeaderTextsFromTable(tblMain));
      var iw = cmap && cmap.worker >= 0 ? cmap.worker : 3;
      var ireport = cmap && cmap.reportAt >= 0 ? cmap.reportAt : 5;
      var ireason = cmap && cmap.reason >= 0 ? cmap.reason : 6;
      var istatus = cmap && cmap.status >= 0 ? cmap.status : 8;
      var minCols = Math.max(
        3,
        iw + 1,
        ireport + 1,
        ireason + 1,
        istatus + 1
      );

      var tbody = tblMain && tblMain.querySelector("tbody");
      if (!tbody) return [];
      var out = [];
      var ch = tbody.children;
      var ti;
      for (ti = 0; ti < ch.length; ti++) {
        if (String(ch[ti].tagName || "").toLowerCase() !== "tr") continue;
        var tr = ch[ti];
        var tds = tr.querySelectorAll("td");
        if (tds.length < minCols) continue;
        var linkIdx = -1;
        var lj;
        for (lj = 0; lj < tds.length; lj++) {
          if (tds[lj].querySelector('a[href*="stowProblemId="]')) {
            linkIdx = lj;
            break;
          }
        }
        if (linkIdx < 0) continue;
        var a = tds[linkIdx].querySelector('a[href*="stowProblemId="]');
        var href = a ? a.getAttribute("href") || "" : "";
        var idm = /stowProblemId=(\d+)/.exec(href);
        var stowProblemId = idm ? idm[1] : "";
        var reportNo = String((a && a.textContent) || "")
          .replace(/\s+/g, " ")
          .trim();
        var statusText = stowProblemCellPlainText(tds[istatus]);
        if (!stowProblemStatusIsOgReport(statusText)) continue;
        var workerText = stowProblemWorkerDisplayFromPlain(
          stowProblemCellPlainText(tds[iw])
        );
        var reportAtText = stowProblemCellPlainText(tds[ireport]);
        var reasonText = stowProblemCellPlainText(tds[ireason]);
        if (!stowProblemId && !reportNo) continue;
        out.push({
          stowProblemId: stowProblemId || reportNo,
          workerText: workerText || "—",
          reportAtText: reportAtText || "—",
          reasonText: reasonText || "—",
        });
      }
      return out;
    }

    async function fetchAllUnhandledRows(startY, endY) {
      var qs = buildFilterQs(startY, endY);
      var merged = [];
      var seen = Object.create(null);
      var page;
      for (page = 0; page < MAX_PAGES; page++) {
        var html = await fetchInboundHtml(
          PAGE_URL + "?page=" + page + "&" + qs
        );
        var part = parseUnhandledRowsFromPagingHtml(html);
        var pi;
        for (pi = 0; pi < part.length; pi++) {
          var kRaw = String(part[pi].stowProblemId || "").trim();
          var k = kRaw.replace(/\s+/g, "");
          if (!k) {
            k =
              "FB:" +
              unloadSlaNormKey(part[pi].workerText) +
              "|" +
              unloadSlaNormKey(part[pi].reportAtText) +
              "|" +
              unloadSlaNormKey(part[pi].reasonText);
          }
          if (!seen[k]) {
            seen[k] = true;
            merged.push(part[pi]);
          }
        }
        if (stowPagingCountTbodyRowsWithStowLink(html) === 0) break;
      }
      return merged;
    }

    function setStatus(msg) {
      var el = document.getElementById(statusId);
      if (el) el.textContent = msg;
    }

    function renderAlertTable(rows, emptyMsg) {
      var wrap = document.getElementById(alertWrapId);
      if (!wrap) return;
      wrap.textContent = "";
      if (!rows || !rows.length) {
        wrap.textContent =
          emptyMsg != null && String(emptyMsg).length
            ? String(emptyMsg)
            : "미처리 없음";
        return;
      }
      var tbl = document.createElement("table");
      tbl.className = "yna4-pane-sla-table";
      tbl.style.fontSize = "11px";
      var thead = document.createElement("thead");
      var hr = document.createElement("tr");
      ["작업자", "일시", "문제보고값"].forEach(function (h) {
        var th = document.createElement("th");
        th.textContent = h;
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      tbl.appendChild(thead);
      var tb = document.createElement("tbody");
      var ri;
      for (ri = 0; ri < rows.length; ri++) {
        var r = rows[ri];
        var tr = document.createElement("tr");
        var d0 = document.createElement("td");
        d0.textContent = r.workerText || "—";
        var d1 = document.createElement("td");
        d1.textContent = r.reportAtText || "—";
        var d2 = document.createElement("td");
        d2.textContent = r.reasonText || "—";
        tr.appendChild(d0);
        tr.appendChild(d1);
        tr.appendChild(d2);
        tb.appendChild(tr);
      }
      tbl.appendChild(tb);
      wrap.appendChild(tbl);
    }

    function notifyBrowser(title, rows) {
      if (typeof Notification !== "function") return;
      if (Notification.permission !== "granted") return;
      var lines = [];
      var ri;
      for (ri = 0; ri < Math.min(rows.length, 8); ri++) {
        lines.push(
          (rows[ri].workerText || "—") +
            " | " +
            (rows[ri].reportAtText || "—") +
            " | " +
            (rows[ri].reasonText || "—")
        );
      }
      if (rows.length > 8) lines.push("… 외 " + (rows.length - 8) + "건");
      try {
        new Notification(title, {
          body:
            lines.length > 0
              ? lines.join("\n")
              : "목록 표시 없음 · statistic과 목록 불일치 가능",
          silent: false,
          tag: ROOT_ID + "-stow-problem-watch",
        });
      } catch (eN) {}
    }

    /** 미처리 알림: 내장 WAV 재생 실패 시 Web Audio 비프 */
    function playStowWatchWebBeeps() {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        var ctx = new AC();
        function runTones() {
          try {
            var g = ctx.createGain();
            g.gain.value = 0.78;
            g.connect(ctx.destination);
            function tone(freq, tStart, dur) {
              var o = ctx.createOscillator();
              o.type = "sine";
              o.frequency.value = freq;
              o.connect(g);
              o.start(tStart);
              o.stop(tStart + dur);
            }
            var t0 = ctx.currentTime + 0.03;
            tone(784, t0, 0.15);
            tone(1046, t0 + 0.19, 0.18);
            setTimeout(function () {
              try {
                ctx.close();
              } catch (eC) {}
            }, 700);
          } catch (eR) {}
        }
        if (ctx.state === "suspended" && typeof ctx.resume === "function") {
          ctx.resume().then(runTones).catch(runTones);
        } else {
          runTones();
        }
      } catch (eT) {}
    }

    function playStowWatchTone() {
      var now = Date.now();
      if (now - lastStowWatchToneAt < 2200) return;
      lastStowWatchToneAt = now;
      var src = stowWatchResolveAlarmSrc();
      try {
        var au = new Audio(src);
        au.volume = 0.95;
        var p = au.play();
        if (p && typeof p.then === "function") {
          p.catch(function () {
            playStowWatchWebBeeps();
          });
        }
      } catch (e3) {
        playStowWatchWebBeeps();
      }
    }

    var rowDate = document.createElement("div");
    rowDate.className = "yna4-pane-row";
    var lab = document.createElement("span");
    lab.className = "yna4-pane-k";
    lab.textContent = "기간";
    var inpStart = document.createElement("input");
    inpStart.type = "date";
    inpStart.id = ROOT_ID + "-stow-watch-start";
    inpStart.className = "yna4-pane-inp";
    inpStart.style.maxWidth = "11em";
    inpStart.value = ymdFromDelta(-1);
    inpStart.style.marginRight = "6px";
    var inpEnd = document.createElement("input");
    inpEnd.type = "date";
    inpEnd.id = ROOT_ID + "-stow-watch-end";
    inpEnd.className = "yna4-pane-inp";
    inpEnd.style.maxWidth = "11em";
    inpEnd.value = ymdFromDelta(0);

    rowDate.appendChild(lab);
    rowDate.appendChild(inpStart);
    rowDate.appendChild(inpEnd);

    var rowOpt = document.createElement("div");
    rowOpt.className = "yna4-pane-row";
    var labSec = document.createElement("span");
    labSec.className = "yna4-pane-k";
    labSec.textContent = "주기(s)";
    var inpSec = document.createElement("input");
    inpSec.type = "number";
    inpSec.min = "15";
    inpSec.step = "15";
    inpSec.value = "30";
    inpSec.className = "yna4-pane-inp";
    inpSec.style.maxWidth = "5em";
    inpSec.id = ROOT_ID + "-stow-watch-interval";
    rowOpt.appendChild(labSec);
    rowOpt.appendChild(inpSec);

    var rowSoundWrap = null;
    if (typeof GM_setValue === "function" && typeof GM_getValue === "function") {
      var rowSound = document.createElement("div");
      rowSound.className = "yna4-pane-row";
      rowSound.style.flexWrap = "wrap";
      rowSound.style.alignItems = "center";
      rowSound.style.gap = "6px";
      var labSound = document.createElement("span");
      labSound.className = "yna4-pane-k";
      labSound.textContent = "알림음(TM)";
      var inpSoundFile = document.createElement("input");
      inpSoundFile.type = "file";
      inpSoundFile.accept = "audio/*,.wav,.mp3,.ogg,.m4a,.aac";
      inpSoundFile.className = "yna4-pane-inp";
      inpSoundFile.style.fontSize = "10px";
      inpSoundFile.style.maxWidth = "220px";
      var btnSoundClr = document.createElement("button");
      btnSoundClr.type = "button";
      btnSoundClr.className = "yna4-pane-btn yna4-pane-btn--compact";
      btnSoundClr.textContent = "초기화";
      var soundHint = document.createElement("span");
      soundHint.style.fontSize = "9px";
      soundHint.style.color = "#64748b";
      soundHint.textContent = "";
      try {
        if (
          String(GM_getValue(STOW_ALARM_CUSTOM_GM_KEY, "") || "").trim()
            .length > 20
        ) {
          soundHint.textContent = "사용자 파일 사용 중";
        } else {
          soundHint.textContent = "미지정 시 내장음";
        }
      } catch (eH) {
        soundHint.textContent = "미지정 시 내장음";
      }
      rowSound.appendChild(labSound);
      rowSound.appendChild(inpSoundFile);
      rowSound.appendChild(btnSoundClr);
      rowSound.appendChild(soundHint);
      rowSoundWrap = rowSound;
      inpSoundFile.addEventListener("change", function () {
        var f = inpSoundFile.files && inpSoundFile.files[0];
        if (!f) return;
        if (f.size > 1800000) {
          setStatus("알림음 1.8MB 초과 · 짧은 파일 사용");
          inpSoundFile.value = "";
          return;
        }
        var r = new FileReader();
        r.onload = function () {
          var data = String(r.result || "");
          if (data.indexOf("data:") !== 0 || data.indexOf("base64,") < 0) {
            setStatus("알림음 읽기 형식 오류");
            inpSoundFile.value = "";
            return;
          }
          try {
            GM_setValue(STOW_ALARM_CUSTOM_GM_KEY, data);
          } catch (eGm) {
            setStatus("GM_setValue 저장 실패");
            inpSoundFile.value = "";
            return;
          }
          try {
            localStorage.setItem(STOW_ALARM_CUSTOM_GM_KEY, data);
          } catch (eLs) {}
          soundHint.textContent = "사용자 파일 사용 중";
          setStatus("STOW 알림음(TM) 저장됨");
          inpSoundFile.value = "";
        };
        r.onerror = function () {
          setStatus("알림음 파일 읽기 실패");
          inpSoundFile.value = "";
        };
        r.readAsDataURL(f);
      });
      btnSoundClr.addEventListener("click", function () {
        try {
          if (typeof GM_deleteValue === "function") {
            GM_deleteValue(STOW_ALARM_CUSTOM_GM_KEY);
          }
        } catch (eD) {}
        try {
          localStorage.removeItem(STOW_ALARM_CUSTOM_GM_KEY);
        } catch (eR) {}
        soundHint.textContent = "미지정 시 내장음";
        inpSoundFile.value = "";
        setStatus("STOW 알림음(TM) 사용자 지정 해제");
      });
    }

    var btnRow = document.createElement("div");
    btnRow.className = "yna4-pane-actions";
    var btnStart = document.createElement("button");
    btnStart.type = "button";
    btnStart.className = "yna4-pane-btn yna4-pane-btn--primary yna4-pane-btn--compact";
    btnStart.textContent = "감시 시작";
    var btnStop = document.createElement("button");
    btnStop.type = "button";
    btnStop.className = "yna4-pane-btn yna4-pane-btn--danger yna4-pane-btn--compact";
    btnStop.textContent = "감시 중지";
    btnStop.disabled = true;
    btnRow.appendChild(btnStart);
    btnRow.appendChild(btnStop);

    var st = document.createElement("div");
    st.id = statusId;
    st.className = "yna4-pane-status";
    st.textContent = "대기";

    var alertClamp = document.createElement("div");
    alertClamp.className = "yna4-stow-watch-alert-clamp";

    var alertBox = document.createElement("div");
    alertBox.id = alertWrapId;
    alertBox.className = "yna4-pane-scroll yna4-stow-watch-scroll";
    alertBox.textContent = "—";

    alertClamp.appendChild(alertBox);

    hostEl.appendChild(rowDate);
    hostEl.appendChild(rowOpt);
    if (rowSoundWrap) hostEl.appendChild(rowSoundWrap);
    hostEl.appendChild(btnRow);
    hostEl.appendChild(st);
    hostEl.appendChild(alertClamp);

    async function tick() {
      if (!running) return;
      var startY = String(inpStart.value || "").trim();
      var endY = String(inpEnd.value || "").trim();
      if (!startY || !endY) {
        setStatus("기간을 설정하세요.");
        return;
      }
      try {
        setStatus("조회 중(statistic)…");
        var qs = buildFilterQs(startY, endY);
        var statHtml = await fetchInboundHtml(STAT_URL + "?" + qs);
        var total = parseStatisticUnhandledTotal(statHtml);
        if (total == null || !isFinite(total)) {
          setStatus("미처리 건수 파싱 실패 · 응답 확인");
          return;
        }

        if (total < 1) {
          renderAlertTable([]);
          setStatus(
            "정상 · 미처리 0 · " + new Date().toLocaleTimeString()
          );
          return;
        }

        setStatus("미처리 " + total + "건 · 페이징(처리상태 오류보고만)…");
        var rows = await fetchAllUnhandledRows(startY, endY);
        if (rows.length) {
          renderAlertTable(rows);
        } else {
          renderAlertTable(
            [],
            "statistic 미처리 " +
              total +
              "건 · 처리상태 [오류보고] 행 없음 또는 열 매칭 실패"
          );
        }
        if (rows.length) {
          notifyBrowser(
            "STOW · 미처리 " + total + "건 · 오류보고 " + rows.length + "행",
            rows
          );
          playStowWatchTone();
        }
        setStatus(
          "미처리 Total " +
            total +
            " · 오류보고 " +
            rows.length +
            "행 · " +
            new Date().toLocaleTimeString()
        );
      } catch (e) {
        setStatus("오류 · " + (e && e.message ? e.message : String(e)));
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 stow problem watch]", e);
        }
      }
    }

    btnStart.addEventListener("click", async function () {
      if (running) return;
      if (typeof Notification === "function") {
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
      }
      running = true;
      btnStart.disabled = true;
      btnStop.disabled = false;
      setStatus("조회 중…");
      await tick();
      var sec = Math.max(15, parseInt(String(inpSec.value || "30"), 10) || 30);
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(tick, sec * 1000);
    });

    btnStop.addEventListener("click", function () {
      running = false;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      btnStart.disabled = false;
      btnStop.disabled = true;
      setStatus("중지됨");
    });
  }

  /**
   * MOS worker-history: workTypeCdList=INBOUND list + userLoginId 매칭 + startTs~endTs 시단위 Unit 배분.
   */
  function initNeedHelpTrackingPane(hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.className =
      "yna4-pane-mod yna4-pane-mod--transfer-excel yna4-pane-mod--nh-tracking";

    var MOS_LIST_URL = "https://mos.coupang.net/status/worker-history/list";
    var MOS_WORKER_CALL_CREATE_PREFIX =
      "https://mos.coupang.net/worker/call/v2/create/";
    var MOS_AUTOCOMPLETE_WORKER_URL =
      "https://mos.coupang.net/auto-complete/worker";
    /** UI 없음 — centerId·resource·list 꼬리는 여기서 수정 */
    var MOS_CENTER_ID = "1007";
    var MOS_PAGE_SIZE = 100;
    var MOS_REFERER_RESOURCE_DEFAULT = "38";
    /** Network: …/list?…&contractType=ALL&workTypeCdList=INBOUND&isAgv= (YAN4는 응답 centerCd) */
    var MOS_LIST_STATIC_TAIL = "contractType=ALL&workTypeCdList=INBOUND&isAgv=";

    function nhWorkerListStaticTail() {
      return String(MOS_LIST_STATIC_TAIL || "")
        .trim()
        .replace(/^[?&]+/, "")
        .replace(/&+$/, "");
    }

    var statusId = ROOT_ID + "-nh-tracking-status";
    var tableWrapId = ROOT_ID + "-nh-tracking-table";
    var MAX_PAGES = 80;
    var nhQueryBusy = false;
    var nhStopRequested = false;

    function nhYmdToday() {
      return unloadYmdFromDate(new Date());
    }

    function nhReferer(resource) {
      var r =
        String(resource == null ? "" : resource).trim() ||
        MOS_REFERER_RESOURCE_DEFAULT;
      return (
        "https://mos.coupang.net/status/worker-history?resource=" +
        encodeURIComponent(r)
      );
    }

    async function nhFetchMosText(url, refererFull) {
      var ref = String(refererFull || "").trim();
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.id &&
        typeof chrome.runtime.sendMessage === "function"
      ) {
        return await new Promise(function (resolve, reject) {
          try {
            chrome.runtime.sendMessage(
              { type: "yan4MosFetch", url: url, referer: ref },
              function (resp) {
                try {
                  var le = chrome.runtime.lastError;
                  if (le) {
                    reject(new Error(le.message));
                    return;
                  }
                  if (!resp || !resp.ok) {
                    reject(new Error((resp && resp.error) || "MOS fetch 실패"));
                    return;
                  }
                  if (resp.status < 200 || resp.status >= 400) {
                    reject(new Error("HTTP " + resp.status));
                    return;
                  }
                  resolve(String(resp.body || ""));
                } catch (e0) {
                  reject(e0);
                }
              }
            );
          } catch (e1) {
            reject(e1);
          }
        });
      }
      if (typeof GM_xmlhttpRequest === "function") {
        return await new Promise(function (resolve, reject) {
          GM_xmlhttpRequest({
            method: "GET",
            url: url,
            anonymous: false,
            headers: {
              Accept: "application/json, text/javascript, */*; q=0.01",
              "X-Requested-With": "XMLHttpRequest",
              Referer: ref,
            },
            onload: function (r) {
              if (r.status >= 200 && r.status < 400) {
                resolve(String(r.responseText || ""));
              } else {
                reject(new Error("HTTP " + r.status));
              }
            },
            onerror: function () {
              reject(new Error("네트워크 오류"));
            },
          });
        });
      }
      var res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
          Referer: ref,
        },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return String((await res.text()) || "");
    }

    async function nhPostMosEmpty(url, refererFull) {
      var ref = String(refererFull || "").trim();
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.id &&
        typeof chrome.runtime.sendMessage === "function"
      ) {
        return await new Promise(function (resolve, reject) {
          try {
            chrome.runtime.sendMessage(
              {
                type: "yan4MosFetch",
                url: url,
                referer: ref,
                method: "POST",
              },
              function (resp) {
                try {
                  var le = chrome.runtime.lastError;
                  if (le) {
                    reject(new Error(le.message));
                    return;
                  }
                  if (!resp || !resp.ok) {
                    reject(new Error((resp && resp.error) || "MOS 호출 실패"));
                    return;
                  }
                  if (resp.status < 200 || resp.status >= 400) {
                    reject(new Error("HTTP " + resp.status));
                    return;
                  }
                  resolve(String(resp.body || ""));
                } catch (e0) {
                  reject(e0);
                }
              }
            );
          } catch (e1) {
            reject(e1);
          }
        });
      }
      if (typeof GM_xmlhttpRequest === "function") {
        return await new Promise(function (resolve, reject) {
          GM_xmlhttpRequest({
            method: "POST",
            url: url,
            data: "",
            anonymous: false,
            headers: {
              Accept: "application/json, text/javascript, */*; q=0.01",
              "X-Requested-With": "XMLHttpRequest",
              Referer: ref,
            },
            onload: function (r) {
              if (r.status >= 200 && r.status < 400) {
                resolve(String(r.responseText || ""));
              } else {
                reject(new Error("HTTP " + r.status));
              }
            },
            onerror: function () {
              reject(new Error("네트워크 오류"));
            },
          });
        });
      }
      var res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
          Referer: ref,
        },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return String((await res.text()) || "");
    }

    function nhStatusFromCallResponse(txt, loginId) {
      var id = String(loginId || "").trim();
      try {
        var j = JSON.parse(String(txt || ""));
        var cr = j && j.callResult;
        if (Array.isArray(cr) && cr.length) {
          var c0 = cr[0];
          var ok = !!c0.success;
          var msg = c0.message != null ? String(c0.message) : "";
          return (
            (ok ? "호출 OK" : "호출 실패") +
            " · " +
            String(c0.loginId || id) +
            (msg ? " · " + msg : "")
          );
        }
      } catch (eJ) {}
      return "호출 응답 파싱 실패 · " + id;
    }

    async function nhPostMosWorkerCall(loginId) {
      var id = String(loginId || "").trim();
      if (!id) throw new Error("loginId 없음");
      var url = MOS_WORKER_CALL_CREATE_PREFIX + encodeURIComponent(id);
      var refFull = nhReferer(MOS_REFERER_RESOURCE_DEFAULT);
      return await nhPostMosEmpty(url, refFull);
    }

    async function nhFetchWorkerAutocomplete(term) {
      var q = String(term || "").trim();
      if (!q) return [];
      var url =
        MOS_AUTOCOMPLETE_WORKER_URL +
        "?userIdOrNameLike=" +
        encodeURIComponent(q);
      var refFull = nhReferer(MOS_REFERER_RESOURCE_DEFAULT);
      var txt = await nhFetchMosText(url, refFull);
      try {
        var j = JSON.parse(txt);
        return Array.isArray(j) ? j : [];
      } catch (eAc) {
        return [];
      }
    }

    function nhExtractArrayFromJson(root) {
      if (!root) return [];
      if (Array.isArray(root)) return root;
      if (typeof root !== "object") return [];
      var cand = [
        "content",
        "data",
        "records",
        "list",
        "items",
        "rows",
        "elements",
        "resultList",
      ];
      var i;
      for (i = 0; i < cand.length; i++) {
        var v = root[cand[i]];
        if (Array.isArray(v)) return v;
        if (v && typeof v === "object" && Array.isArray(v.content)) {
          return v.content;
        }
        if (v && typeof v === "object" && Array.isArray(v.list)) return v.list;
        if (v && typeof v === "object" && Array.isArray(v.data)) return v.data;
      }
      if (root.data && typeof root.data === "object") {
        var d = root.data;
        for (i = 0; i < cand.length; i++) {
          if (Array.isArray(d[cand[i]])) return d[cand[i]];
        }
      }
      return [];
    }

    function nhTotalElementsHint(root) {
      if (!root || typeof root !== "object") return null;
      if (typeof root.totalElements === "number") return root.totalElements;
      if (root.data && typeof root.data.totalElements === "number") {
        return root.data.totalElements;
      }
      if (typeof root.total === "number") return root.total;
      if (root.data && typeof root.data.total === "number") return root.data.total;
      return null;
    }

    function nhNormKey(s) {
      return String(s || "")
        .replace(/\s+/g, "")
        .toLowerCase();
    }

    function nhCellByAliases(row, aliases) {
      if (!row || typeof row !== "object") return "";
      var i;
      var k;
      var nk;
      var al = aliases || [];
      for (k in row) {
        if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
        nk = nhNormKey(k);
        for (i = 0; i < al.length; i++) {
          if (nk === nhNormKey(al[i])) {
            var v = row[k];
            if (v == null) return "";
            return typeof v === "object" ? JSON.stringify(v) : String(v);
          }
        }
      }
      for (k in row) {
        if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
        nk = nhNormKey(k);
        for (i = 0; i < al.length; i++) {
          if (nk.indexOf(nhNormKey(al[i])) >= 0) {
            v = row[k];
            if (v == null) return "";
            return typeof v === "object" ? JSON.stringify(v) : String(v);
          }
        }
      }
      return "";
    }

    function nhParseWorkerIds(text) {
      var raw = String(text || "");
      var parts = raw.split(/[\s,;\n\r\t]+/);
      var out = [];
      var seen = Object.create(null);
      var i;
      for (i = 0; i < parts.length; i++) {
        var p = String(parts[i] || "")
          .trim()
          .toUpperCase();
        if (!p) continue;
        if (!seen[p]) {
          seen[p] = true;
          out.push(p);
        }
      }
      return out;
    }

    function nhParseUnitQty(s) {
      if (typeof s === "number" && isFinite(s)) return s < 0 ? 0 : s;
      var t = String(s || "")
        .replace(/,/g, "")
        .trim();
      if (!t) return 0;
      var n = parseFloat(t);
      if (!isFinite(n) || n < 0) return 0;
      return n;
    }

    function nhCombineDateTime(workDateStr, timeStr) {
      var d = String(workDateStr || "").trim();
      var t = String(timeStr || "").trim();
      if (!d) return NaN;
      if (!t) return NaN;
      if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
        var ms0 = new Date(t.replace(" ", "T")).getTime();
        if (!isNaN(ms0)) return ms0;
      }
      var iso = d + "T" + t;
      var ms = new Date(iso).getTime();
      return ms;
    }

    function nhOverlapMs(a0, a1, b0, b1) {
      var s = Math.max(a0, b0);
      var e = Math.min(a1, b1);
      return Math.max(0, e - s);
    }

    function nhDayStartMs(dayYmd) {
      var ms = new Date(String(dayYmd).trim() + "T00:00:00").getTime();
      return ms;
    }

    function nhBuildListPageUrl(page, startY, endY, centerId, size, staticTail) {
      var tail = String(staticTail || "")
        .trim()
        .replace(/^[?&]+/, "");
      if (tail && tail.charAt(tail.length - 1) === "&") {
        tail = tail.slice(0, -1);
      }
      var q =
        "startDate=" +
        encodeURIComponent(startY) +
        "&endDate=" +
        encodeURIComponent(endY) +
        "&centerId=" +
        encodeURIComponent(String(centerId)) +
        (tail ? "&" + tail : "") +
        "&size=" +
        encodeURIComponent(String(size)) +
        "&page=" +
        encodeURIComponent(String(page));
      return MOS_LIST_URL + "?" + q;
    }

    function setStatus(msg) {
      var el = document.getElementById(statusId);
      if (el) el.textContent = msg;
    }

    function nhProg(pct) {
      if (typeof setProgressByStatusId === "function") {
        setProgressByStatusId(statusId, pct);
      }
    }

    function nhWorkerLastSlotMetrics(agg) {
      var lastH = -1;
      var h;
      for (h = 23; h >= 0; h--) {
        var u0 = agg.unitByHour[h] || 0;
        var m0 = agg.minByHour[h] || 0;
        if (u0 >= 0.0001 || m0 >= 0.0001) {
          lastH = h;
          break;
        }
      }
      if (lastH < 0) {
        return {
          lastH: -1,
          slotLabel: "—",
          uphNum: Infinity,
          uphDisplay: "—",
          cumAtLast: 0,
        };
      }
      var u = agg.unitByHour[lastH] || 0;
      var m = agg.minByHour[lastH] || 0;
      var uphRounded = m > 0.0001 ? Math.round((u * 60) / m) : null;
      var running = 0;
      for (h = 0; h <= lastH; h++) {
        running += agg.unitByHour[h] || 0;
      }
      return {
        lastH: lastH,
        slotLabel: String(lastH) + "시",
        uphNum: uphRounded == null ? Infinity : uphRounded,
        uphDisplay: uphRounded == null ? "—" : String(uphRounded),
        cumAtLast: Math.round(running * 10) / 10,
      };
    }

    function nhClearInlineDetailRows(tb) {
      var lst = tb.querySelectorAll("tr.nh-inline-detail");
      var i;
      for (i = 0; i < lst.length; i++) {
        try {
          lst[i].remove();
        } catch (eRm) {}
      }
    }

    function nhRenderHourlyDetailTable(host, wid, dispName, agg, dayY, inline) {
      if (inline == null) inline = false;
      host.textContent = "";
      var cap = document.createElement("div");
      cap.className =
        "yna4-nh-detail-cap" +
        (inline ? " yna4-nh-detail-cap--inline" : "");
      cap.textContent = inline
        ? "시간대별"
        : String(wid) + " · " + String(dispName) + " · " + String(dayY) + " 시간대별";
      host.appendChild(cap);
      var tbl = document.createElement("table");
      tbl.className =
        "yna4-pane-sla-table" +
        (inline ? " yna4-nh-detail-inner" : "");
      var thead = document.createElement("thead");
      var hr = document.createElement("tr");
      ["이름", "시간대", "진열량", "누적진열량"].forEach(function (hText) {
        var th = document.createElement("th");
        th.textContent = hText;
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      tbl.appendChild(thead);
      var tb = document.createElement("tbody");
      var h;
      var runningCum = 0;
      for (h = 0; h < 24; h++) {
        var u = agg.unitByHour[h] || 0;
        var m = agg.minByHour[h] || 0;
        runningCum += u;
        if (u < 0.0001 && m < 0.0001) continue;
        var tr = document.createElement("tr");
        var tdNm = document.createElement("td");
        tdNm.textContent = String(dispName);
        var tdSlot = document.createElement("td");
        tdSlot.textContent = String(h) + "시";
        var tdUph = document.createElement("td");
        tdUph.textContent =
          m > 0.0001 ? String(Math.round((u * 60) / m)) : "—";
        var tdCum = document.createElement("td");
        tdCum.textContent = String(Math.round(runningCum * 10) / 10);
        tr.appendChild(tdNm);
        tr.appendChild(tdSlot);
        tr.appendChild(tdUph);
        tr.appendChild(tdCum);
        tb.appendChild(tr);
      }
      if (!tb.children.length) {
        var tr0 = document.createElement("tr");
        var td = document.createElement("td");
        td.colSpan = 4;
        td.textContent = "startTs~endTs 없음 또는 unitQty 0만 존재";
        tr0.appendChild(td);
        tb.appendChild(tr0);
      }
      tbl.appendChild(tb);
      host.appendChild(tbl);
    }

    function renderHourlySections(wrap, dayY, byWorker, rawCount, nameByWorkerId) {
      nameByWorkerId = nameByWorkerId || {};
      wrap.textContent = "";
      var ids = Object.keys(byWorker || {});
      if (!ids.length) {
        wrap.textContent =
          "매칭된 작업자 없음 · list JSON의 userLoginId·employee와 입력 ID 대조";
        return;
      }

      var rows = [];
      var wi;
      for (wi = 0; wi < ids.length; wi++) {
        var wid0 = ids[wi];
        var agg0 = byWorker[wid0];
        var dispName0 =
          String(nameByWorkerId[wid0] || "").trim() || "?";
        var met0 = nhWorkerLastSlotMetrics(agg0);
        rows.push({
          wid: wid0,
          dispName: dispName0,
          agg: agg0,
          sortKey: met0.uphNum,
          met: met0,
        });
      }
      rows.sort(function (a, b) {
        var d = a.sortKey - b.sortKey;
        if (d !== 0) return d;
        return String(a.wid).localeCompare(String(b.wid));
      });

      var sumTbl = document.createElement("table");
      sumTbl.className = "yna4-pane-sla-table yna4-nh-sum-table";
      var sumThead = document.createElement("thead");
      var sumHr = document.createElement("tr");
      ["이름", "시간대", "진열량", "누적진열량", "호출"].forEach(function (
        hText
      ) {
        var th = document.createElement("th");
        th.textContent = hText;
        sumHr.appendChild(th);
      });
      sumThead.appendChild(sumHr);
      sumTbl.appendChild(sumThead);
      var sumTb = document.createElement("tbody");

      var ri;
      var redPlaced = 0;
      for (ri = 0; ri < rows.length; ri++) {
        (function () {
          var row = rows[ri];
          var tr = document.createElement("tr");
          tr.className = "nh-sum-row";
          tr.setAttribute("data-sum-wid", row.wid);
          if (redPlaced < 5 && row.sortKey < Infinity) {
            tr.style.backgroundColor = "#fde8e8";
            tr.style.color = "#8b1538";
            redPlaced++;
          }
          var tdNm = document.createElement("td");
          var btn = document.createElement("button");
          btn.type = "button";
          btn.setAttribute("data-wid", row.wid);
          btn.style.cssText =
            "border:0;background:none;padding:0;cursor:pointer;color:inherit;text-decoration:underline;font:inherit;";
          btn.textContent = row.dispName;
          btn.addEventListener("click", function (ev) {
            var btnEl = ev.currentTarget;
            var w = String(btnEl.getAttribute("data-wid") || "");
            var trSum = btnEl.closest
              ? btnEl.closest("tr")
              : null;
            if (!trSum) {
              var n = btnEl;
              while (n && String(n.tagName || "").toUpperCase() !== "TR") {
                n = n.parentNode;
              }
              trSum = n;
            }
            if (!trSum || !sumTb.contains(trSum)) return;
            var nx = trSum.nextSibling;
            if (
              nx &&
              nx.nodeType === 1 &&
              nx.classList &&
              nx.classList.contains("nh-inline-detail") &&
              String(nx.getAttribute("data-for-wid") || "") === w
            ) {
              nx.remove();
              return;
            }
            nhClearInlineDetailRows(sumTb);
            var detailTr = document.createElement("tr");
            detailTr.className = "nh-inline-detail";
            detailTr.setAttribute("data-for-wid", w);
            var tdCell = document.createElement("td");
            tdCell.colSpan = 5;
            tdCell.className = "yna4-nh-inline-detail-cell";
            var j;
            for (j = 0; j < rows.length; j++) {
              if (rows[j].wid === w) {
                nhRenderHourlyDetailTable(
                  tdCell,
                  rows[j].wid,
                  rows[j].dispName,
                  rows[j].agg,
                  dayY,
                  true
                );
                break;
              }
            }
            detailTr.appendChild(tdCell);
            trSum.parentNode.insertBefore(detailTr, trSum.nextSibling);
          });
          tdNm.appendChild(btn);
          var sub = document.createElement("div");
          sub.className = "yna4-nh-id-sub";
          sub.textContent = row.wid;
          tdNm.appendChild(sub);

          var tdSlot = document.createElement("td");
          tdSlot.textContent = row.met.slotLabel;
          var tdUph = document.createElement("td");
          tdUph.textContent = row.met.uphDisplay;
          var tdCum = document.createElement("td");
          tdCum.textContent =
            row.met.lastH >= 0 ? String(row.met.cumAtLast) : "—";

          var tdCall = document.createElement("td");
          var callBtn = document.createElement("button");
          callBtn.type = "button";
          callBtn.className = "yna4-nh-call-btn";
          callBtn.textContent = "호출";
          callBtn.addEventListener("click", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            if (callBtn.disabled) return;
            var widCall = String(row.wid || "").trim();
            if (!widCall) return;
            callBtn.disabled = true;
            var prev = callBtn.textContent;
            callBtn.textContent = "…";
            nhPostMosWorkerCall(widCall)
              .then(function (txt) {
                setStatus(nhStatusFromCallResponse(txt, widCall));
              })
              .catch(function (eC) {
                setStatus(
                  "호출 오류 · " +
                    widCall +
                    " · " +
                    (eC && eC.message ? eC.message : String(eC))
                );
              })
              .then(function () {
                callBtn.disabled = false;
                callBtn.textContent = prev;
              });
          });

          tdCall.appendChild(callBtn);

          tr.appendChild(tdNm);
          tr.appendChild(tdSlot);
          tr.appendChild(tdUph);
          tr.appendChild(tdCum);
          tr.appendChild(tdCall);
          sumTb.appendChild(tr);
        })();
      }

      sumTbl.appendChild(sumTb);
      wrap.appendChild(sumTbl);
    }

    /** Need help 집계: Process(Task)에 이 문자열이 포함된 행만 진열량·시간대에 반영 */
    var NH_STOW_PROCESS_SUBSTR = "STOW(STOW)";

    function nhRowProcessTaskText(row) {
      if (!row || typeof row !== "object") return "";
      if (row.processTask != null && String(row.processTask).trim() !== "") {
        return String(row.processTask).trim();
      }
      if (row.process != null && String(row.process).trim() !== "") {
        return String(row.process).trim();
      }
      return String(
        nhCellByAliases(row, [
          "Process(Task)",
          "processTask",
          "Process (Task)",
        ]) || ""
      ).trim();
    }

    function nhAccumulateRowsForWorkers(dayY, workerIds, mergedObjs) {
      var dayStart = nhDayStartMs(dayY);
      if (isNaN(dayStart)) return {};
      var dayEnd = dayStart + 86400000;
      var by = {};
      var wi;
      for (wi = 0; wi < workerIds.length; wi++) {
        var w = workerIds[wi];
        by[w] = {
          unitByHour: new Array(24),
          minByHour: new Array(24),
          totalQty: 0,
          totalHtpMin: 0,
          rowHits: 0,
        };
        var h;
        for (h = 0; h < 24; h++) {
          by[w].unitByHour[h] = 0;
          by[w].minByHour[h] = 0;
        }
      }
      var ri;
      for (ri = 0; ri < mergedObjs.length; ri++) {
        var row = mergedObjs[ri];
        if (!row || typeof row !== "object") continue;
        var loginU = String(
          row.userLoginId != null && row.userLoginId !== ""
            ? row.userLoginId
            : nhCellByAliases(row, ["userLoginId", "UserLoginId"])
        )
          .trim()
          .toUpperCase();
        var emp = nhCellByAliases(row, [
          "Employee",
          "employee",
          "Worker",
          "workerName",
        ]);
        var empU = String(emp || "").toUpperCase();
        var matched = [];
        for (wi = 0; wi < workerIds.length; wi++) {
          var idNeed = workerIds[wi];
          if (loginU === idNeed || empU.indexOf(idNeed) >= 0) {
            matched.push(idNeed);
          }
        }
        if (!matched.length) continue;

        if (nhRowProcessTaskText(row).indexOf(NH_STOW_PROCESS_SUBSTR) < 0) {
          continue;
        }

        var wd =
          (row.workDate != null && String(row.workDate).length
            ? String(row.workDate).trim()
            : "") ||
          nhCellByAliases(row, ["Work Date", "workDate", "workDt"]) ||
          dayY;
        var qtyRaw =
          row.unitQty != null && row.unitQty !== ""
            ? row.unitQty
            : nhCellByAliases(row, ["Unit Qty", "UnitQty", "unitQty"]);
        var qty = nhParseUnitQty(qtyRaw);
        var tStr0 =
          row.startTs != null && String(row.startTs).length
            ? String(row.startTs)
            : nhCellByAliases(row, ["startTs", "HTP Start", "htpStart"]);
        var tStr1 =
          row.endTs != null && String(row.endTs).length
            ? String(row.endTs)
            : nhCellByAliases(row, ["endTs", "HTP End", "htpEnd"]);
        var t0 = nhCombineDateTime(wd, tStr0);
        var t1 = nhCombineDateTime(wd, tStr1);
        if (isNaN(t0) || isNaN(t1)) continue;
        if (t1 <= t0) {
          t1 = t0 + 1000;
        }
        var dur = t1 - t0;
        if (dur <= 0) continue;
        if (qty <= 0) continue;

        var clip0 = Math.max(t0, dayStart);
        var clip1 = Math.min(t1, dayEnd);
        if (clip1 <= clip0) continue;
        var durClip = clip1 - clip0;
        var qtyClip = qty * (durClip / dur);

        var h;
        for (h = 0; h < 24; h++) {
          var hs = dayStart + h * 3600000;
          var he = hs + 3600000;
          var ov = nhOverlapMs(clip0, clip1, hs, he);
          if (ov <= 0) continue;
          var frac = ov / durClip;
          var addU = qtyClip * frac;
          var addM = ov / 60000;
          for (wi = 0; wi < matched.length; wi++) {
            var mid = matched[wi];
            if (!by[mid]) continue;
            by[mid].unitByHour[h] += addU;
            by[mid].minByHour[h] += addM;
            by[mid].totalQty += addU;
            by[mid].totalHtpMin += addM;
          }
        }
        for (wi = 0; wi < matched.length; wi++) {
          if (by[matched[wi]]) by[matched[wi]].rowHits += 1;
        }
      }
      return by;
    }

    var labW = document.createElement("div");
    labW.className = "yna4-pane-k";
    labW.textContent = "작업자 ID (한 줄에 하나 · 예 V6703574)";
    var taWorkers = document.createElement("textarea");
    taWorkers.rows = 4;
    taWorkers.className = "yna4-pane-inp";
    taWorkers.style.width = "100%";
    taWorkers.style.boxSizing = "border-box";
    taWorkers.style.fontSize = "11px";
    taWorkers.setAttribute("spellcheck", "false");
    taWorkers.placeholder = "V6703574\nN7503080";

    var rowDates = document.createElement("div");
    rowDates.className = "yna4-pane-row";
    var labD = document.createElement("span");
    labD.className = "yna4-pane-k";
    labD.textContent = "조회일";
    var inpDate = document.createElement("input");
    inpDate.type = "date";
    inpDate.className = "yna4-pane-inp";
    inpDate.style.maxWidth = "11em";
    inpDate.value = nhYmdToday();
    rowDates.appendChild(labD);
    rowDates.appendChild(inpDate);

    var btnRow = document.createElement("div");
    btnRow.className = "yna4-pane-actions";
    var btnQuery = document.createElement("button");
    btnQuery.type = "button";
    btnQuery.className =
      "yna4-pane-btn yna4-pane-btn--primary yna4-pane-btn--compact";
    btnQuery.textContent = "조회 시작";
    var btnStop = document.createElement("button");
    btnStop.type = "button";
    btnStop.className =
      "yna4-pane-btn yna4-pane-btn--danger yna4-pane-btn--compact";
    btnStop.textContent = "조회 중지";
    btnStop.disabled = true;
    btnRow.appendChild(btnQuery);
    btnRow.appendChild(btnStop);

    var st = document.createElement("div");
    st.id = statusId;
    st.className = "yna4-pane-status";
    st.textContent = "";

    var scrollBox = document.createElement("div");
    scrollBox.id = tableWrapId;
    scrollBox.className = "yna4-pane-scroll yna4-nh-scroll";
    scrollBox.textContent = "—";

    hostEl.appendChild(labW);
    hostEl.appendChild(taWorkers);
    hostEl.appendChild(rowDates);
    hostEl.appendChild(btnRow);
    hostEl.appendChild(st);
    hostEl.appendChild(scrollBox);

    async function runFetchMerged(
      dayY,
      centerId,
      size,
      refFull,
      staticTail,
      onPageDone
    ) {
      var mergedObjs = [];
      var dedupe = Object.create(null);
      var totalHint = null;
      var page;
      for (page = 0; page < MAX_PAGES; page++) {
        if (nhStopRequested) {
          return {
            rows: mergedObjs,
            totalHint: totalHint,
            stoppedEarly: true,
          };
        }
        var url = nhBuildListPageUrl(
          page,
          dayY,
          dayY,
          centerId,
          size,
          staticTail
        );
        var txt = await nhFetchMosText(url, refFull);
        if (nhStopRequested) {
          return {
            rows: mergedObjs,
            totalHint: totalHint,
            stoppedEarly: true,
          };
        }
        var json;
        try {
          json = JSON.parse(txt);
        } catch (eP) {
          throw new Error(
            "JSON 파싱 실패 · 응답 앞 120자: " + txt.slice(0, 120)
          );
        }
        if (totalHint == null) totalHint = nhTotalElementsHint(json);
        var chunk = nhExtractArrayFromJson(json);
        if (!chunk.length) {
          if (typeof onPageDone === "function") {
            try {
              onPageDone(page, totalHint, size);
            } catch (ePg) {}
          }
          break;
        }
        var ci;
        for (ci = 0; ci < chunk.length; ci++) {
          var item = chunk[ci];
          var key =
            typeof item === "object" && item
              ? JSON.stringify(item)
              : String(item);
          if (!dedupe[key]) {
            dedupe[key] = true;
            mergedObjs.push(item);
          }
        }
        if (typeof onPageDone === "function") {
          try {
            onPageDone(page, totalHint, size);
          } catch (ePg2) {}
        }
        if (chunk.length < size) break;
      }
      return {
        rows: mergedObjs,
        totalHint: totalHint,
        stoppedEarly: false,
      };
    }

    async function tick() {
      try {
        var dayY = String(inpDate.value || "").trim();
        if (!dayY) {
          setStatus("조회일을 지정하세요.");
          return;
        }
        var workerIds = nhParseWorkerIds(taWorkers.value);
        if (!workerIds.length) {
          setStatus("작업자 ID 목록을 입력하세요 (한 줄에 하나).");
          return;
        }
        nhProg(6);
        setStatus("조회 중…");
        var acParts = [];
        var acNameById = {};
        var aci;
        for (aci = 0; aci < workerIds.length; aci++) {
          if (nhStopRequested) {
            setStatus("");
            nhProg(0);
            return;
          }
          var widAc = workerIds[aci];
          var ac = await nhFetchWorkerAutocomplete(widAc);
          if (nhStopRequested) {
            setStatus("");
            nhProg(0);
            return;
          }
          var hitAc = null;
          var aiAc;
          for (aiAc = 0; aiAc < ac.length; aiAc++) {
            if (
              String(ac[aiAc].loginId || "")
                .trim()
                .toUpperCase() === widAc
            ) {
              hitAc = ac[aiAc];
              break;
            }
          }
          if (hitAc) {
            var nmAc = String(
              hitAc.name != null && String(hitAc.name).length
                ? hitAc.name
                : hitAc.loginId || widAc
            );
            acNameById[widAc] = nmAc;
            acParts.push(widAc + "→" + nmAc);
          } else {
            acNameById[widAc] = "";
            acParts.push(widAc + "→?");
          }
          nhProg(
            6 +
              Math.round(
                ((aci + 1) / Math.max(1, workerIds.length)) * 28
              )
          );
        }
        var centerId = MOS_CENTER_ID;
        var size = MOS_PAGE_SIZE;
        var refFull = nhReferer(MOS_REFERER_RESOURCE_DEFAULT);
        var staticTail = nhWorkerListStaticTail();

        var pack = await runFetchMerged(
          dayY,
          centerId,
          size,
          refFull,
          staticTail,
          function (page, totalHint, pageSize) {
            var base = 38;
            var span = 56;
            var pagesEst = MAX_PAGES;
            if (
              totalHint != null &&
              isFinite(totalHint) &&
              totalHint > 0 &&
              pageSize > 0
            ) {
              pagesEst = Math.min(
                MAX_PAGES,
                Math.ceil(totalHint / pageSize)
              );
              if (pagesEst < 1) pagesEst = 1;
            } else {
              pagesEst = Math.min(MAX_PAGES, Math.max(6, page + 3));
            }
            var frac = (page + 1) / pagesEst;
            if (frac > 1) frac = 1;
            nhProg(Math.min(94, Math.round(base + frac * span)));
          }
        );
        var mergedObjs = pack.rows;
        var byW = nhAccumulateRowsForWorkers(dayY, workerIds, mergedObjs);
        var wrap = document.getElementById(tableWrapId);
        if (wrap)
          renderHourlySections(wrap, dayY, byW, mergedObjs.length, acNameById);

        nhProg(100);
        setStatus("");
      } catch (e) {
        nhProg(0);
        setStatus("오류 · " + (e && e.message ? e.message : String(e)));
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 MOS hourly]", e);
        }
      }
    }

    btnQuery.addEventListener("click", async function () {
      if (nhQueryBusy) return;
      nhQueryBusy = true;
      nhStopRequested = false;
      btnQuery.disabled = true;
      btnStop.disabled = false;
      setStatus("조회 중…");
      nhProg(5);
      try {
        await tick();
      } finally {
        nhQueryBusy = false;
        nhStopRequested = false;
        btnQuery.disabled = false;
        btnStop.disabled = true;
        nhProg(0);
        setStatus("");
      }
    });

    btnStop.addEventListener("click", function () {
      if (!nhQueryBusy) return;
      nhStopRequested = true;
      setStatus("");
    });
  }

  /** 입고 내역 Excel (P/each) — 쉘 2페이지 */
  var RECV_LIST_REFERER = "https://inbound.coupang.com/receive/report/list";
  var RECV_PAGING_BASE = "https://inbound.coupang.com/receive/report/v2/paging";
  var RECV_PAGE_CAP = 500;
  var RECV_LIST_DELAY_MS = 200;
  var RECV_DETAIL_DELAY_MS = 120;
  var RECV_EXCEL_HEADERS = [
    "외부발주번호",
    "업체명",
    "외부 SKUID",
    "SKUID",
    "상품바코드",
    "입고수량",
    "입고작업자",
    "입고일시",
    "토트바코드",
    "상품명",
    "진열로케이션",
    "P/each",
  ];
  var recvExportRunning = false;
  var recvExportStop = false;

  function recvTodayYmd() {
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function recvSleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function recvParseHtml(html) {
    return new DOMParser().parseFromString(html, "text/html");
  }

  function recvCellText(td) {
    if (!td) return "";
    var a = td.querySelector("a");
    if (a && a.textContent.trim()) return a.textContent.trim();
    return String(td.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function recvGmGet(url, referer) {
    return gmGet(url, {
      Accept: "text/html, */*; q=0.01",
      Referer: referer || RECV_LIST_REFERER,
      "X-Requested-With": "XMLHttpRequest",
    });
  }

  function recvBuildPagingUrl(page, workerId, ymd) {
    var q = new URLSearchParams({
      page: String(page),
      cartBarcode: "",
      workerUserUserId: workerId || "",
      purchaseOrderExternalId: "",
      urgentStowPriority: "",
      inboundBarcode: "",
      searchInput: "",
      searchType: "SKU_EXT_ID",
      end: ymd,
      start: ymd,
    });
    return RECV_PAGING_BASE + "?" + q.toString();
  }

  function recvBuildDetailUrl(detailPath) {
    var p = String(detailPath || "").trim();
    if (!p) return "";
    if (/^https?:\/\//i.test(p)) return p;
    if (p.charAt(0) !== "/") p = "/" + p;
    return "https://inbound.coupang.com" + p;
  }

  function recvHeaderIndexMap(table) {
    var map = {};
    var ths = table.querySelectorAll("thead th");
    for (var i = 0; i < ths.length; i++) {
      map[
        String(ths[i].textContent || "")
          .replace(/\s+/g, "")
          .toLowerCase()
      ] = i;
    }
    return map;
  }

  function recvFindCol(map, candidates) {
    var c;
    for (c = 0; c < candidates.length; c++) {
      var norm = candidates[c].replace(/\s+/g, "").toLowerCase();
      if (map[norm] != null) return map[norm];
      var k;
      for (k in map) {
        if (
          Object.prototype.hasOwnProperty.call(map, k) &&
          (k.indexOf(norm) >= 0 || norm.indexOf(k) >= 0)
        ) {
          return map[k];
        }
      }
    }
    return -1;
  }

  function recvListRowSig(row) {
    return [
      row.poExternal,
      row.skuId,
      row.toteBarcode,
      row.detailPath,
      row.receivedAt,
    ].join("|");
  }

  function recvHasNextListPage(html) {
    var next = recvParseHtml(html).querySelector("w-page-next");
    return !!(next && !next.hasAttribute("disabled"));
  }

  function recvParseListRows(html) {
    var table = recvParseHtml(html).querySelector('table[is="w-table"]');
    if (!table) return [];
    var map = recvHeaderIndexMap(table);
    var iPo = recvFindCol(map, ["외부발주번호", "외부발주번호/itr번호"]);
    var iVendor = recvFindCol(map, ["업체명"]);
    var iExtSku = recvFindCol(map, ["외부skuid"]);
    var iSku = recvFindCol(map, ["skuid"]);
    var iBarcode = recvFindCol(map, ["상품바코드"]);
    var iQty = recvFindCol(map, ["입고수량"]);
    var iWorker = recvFindCol(map, ["입고작업자"]);
    var iAt = recvFindCol(map, ["입고일시"]);
    var iTote = recvFindCol(map, ["토트바코드"]);
    var rows = [];
    var trs = table.querySelectorAll("tbody tr");
    for (var r = 0; r < trs.length; r++) {
      var tds = trs[r].querySelectorAll("td");
      if (!tds.length) continue;
      var toteTd = iTote >= 0 ? tds[iTote] : null;
      var detailA = toteTd ? toteTd.querySelector('a[href*="/detail"]') : null;
      rows.push({
        poExternal: iPo >= 0 ? recvCellText(tds[iPo]) : "",
        vendor: iVendor >= 0 ? recvCellText(tds[iVendor]) : "",
        extSkuId: iExtSku >= 0 ? recvCellText(tds[iExtSku]) : "",
        skuId: iSku >= 0 ? recvCellText(tds[iSku]) : "",
        barcode: iBarcode >= 0 ? recvCellText(tds[iBarcode]) : "",
        qty: iQty >= 0 ? recvCellText(tds[iQty]) : "",
        worker: iWorker >= 0 ? recvCellText(tds[iWorker]) : "",
        receivedAt: iAt >= 0 ? recvCellText(tds[iAt]) : "",
        toteBarcode: toteTd ? recvCellText(toteTd) : "",
        detailPath: detailA ? detailA.getAttribute("href") || "" : "",
      });
    }
    return rows;
  }

  async function recvFetchAllListRows(workerId, ymd, onProgress) {
    var all = [];
    var page = 0;
    var firstSig = null;
    while (page < RECV_PAGE_CAP) {
      if (recvExportStop) break;
      if (onProgress) onProgress("목록 " + (page + 1) + "페이지…");
      var html = await recvGmGet(recvBuildPagingUrl(page, workerId, ymd));
      var rows = recvParseListRows(html);
      if (!rows.length) break;
      var sig = recvListRowSig(rows[0]);
      if (firstSig && sig === firstSig && page > 0) break;
      if (!firstSig) firstSig = sig;
      all = all.concat(rows);
      if (!recvHasNextListPage(html)) break;
      page++;
      await recvSleep(RECV_LIST_DELAY_MS);
    }
    return all;
  }

  function recvTableAfterHeading(doc, headingContains) {
    var heads = doc.querySelectorAll("h5");
    for (var i = 0; i < heads.length; i++) {
      if (String(heads[i].textContent || "").indexOf(headingContains) < 0) continue;
      var el = heads[i].nextElementSibling;
      while (el) {
        if (el.tagName === "TABLE") return el;
        el = el.nextElementSibling;
      }
    }
    return null;
  }

  function recvClassifyPeach(location) {
    var loc = String(location || "").trim();
    if (!loc) return { location: "미진열", peach: "미진열" };
    if (loc.indexOf("P") >= 0) return { location: loc, peach: "Pallet" };
    return { location: loc, peach: "each" };
  }

  function recvParseDetailHtml(html, listSkuId) {
    var doc = recvParseHtml(html);
    var stockTable = recvTableAfterHeading(doc, "토트 내 재고");
    var stowTable = recvTableAfterHeading(doc, "진열 내역");
    var productName = "";
    if (stockTable) {
      var smap = recvHeaderIndexMap(stockTable);
      var iName = recvFindCol(smap, ["상품명"]);
      var iSku = recvFindCol(smap, ["skuid"]);
      var trs = stockTable.querySelectorAll("tbody tr");
      var pick = null;
      for (var s = 0; s < trs.length; s++) {
        var tds = trs[s].querySelectorAll("td");
        if (!tds.length) continue;
        var skuText = iSku >= 0 ? recvCellText(tds[iSku]) : "";
        if (listSkuId && skuText && skuText.indexOf(listSkuId) >= 0) {
          pick = tds;
          break;
        }
        if (!pick) pick = tds;
      }
      if (pick && iName >= 0) productName = recvCellText(pick[iName]);
    }
    var stowLocation = "";
    if (stowTable) {
      var tmap = recvHeaderIndexMap(stowTable);
      var iLoc = recvFindCol(tmap, ["로케이션"]);
      var str = stowTable.querySelector("tbody tr");
      if (str) {
        var stds = str.querySelectorAll("td");
        if (iLoc >= 0 && stds[iLoc]) stowLocation = recvCellText(stds[iLoc]);
      }
    }
    var pe = recvClassifyPeach(stowLocation);
    return {
      productName: productName,
      stowLocation: pe.location,
      peach: pe.peach,
    };
  }

  async function recvEnrichRowsWithDetail(listRows, onProgress) {
    var out = [];
    var total = listRows.length;
    for (var i = 0; i < listRows.length; i++) {
      if (recvExportStop) break;
      var row = listRows[i];
      var detail = {
        productName: "",
        stowLocation: "미진열",
        peach: "미진열",
      };
      if (row.detailPath) {
        if (onProgress) onProgress("상세 " + (i + 1) + "/" + total + "…");
        try {
          var url = recvBuildDetailUrl(row.detailPath);
          detail = recvParseDetailHtml(await recvGmGet(url, url), row.skuId);
        } catch (eDet) {
          detail.peach = "미진열(오류)";
        }
        await recvSleep(RECV_DETAIL_DELAY_MS);
      }
      out.push(Object.assign({}, row, detail));
    }
    return out;
  }

  function recvDownloadExcel(rows, ymd, workerId) {
    if (typeof XLSX === "undefined") {
      throw new Error("XLSX 라이브러리 없음");
    }
    var data = [RECV_EXCEL_HEADERS.slice()];
    rows.forEach(function (r) {
      data.push([
        r.poExternal,
        r.vendor,
        r.extSkuId,
        r.skuId,
        r.barcode,
        r.qty,
        r.worker,
        r.receivedAt,
        r.toteBarcode,
        r.productName,
        r.stowLocation,
        r.peach,
      ]);
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "입고내역");
    var suffix = workerId ? "_" + workerId : "";
    XLSX.writeFile(wb, "입고내역_" + ymd + suffix + ".xlsx");
  }

  function initReceiveReportExportPane(paneBody) {
    if (!paneBody) return;
    paneBody.textContent = "";

    var mod = document.createElement("div");
    mod.className = "yna4-pane-mod";

    var rowWorker = document.createElement("div");
    rowWorker.className = "yna4-pane-row";
    var lblW = document.createElement("span");
    lblW.className = "yna4-pane-k";
    lblW.textContent = "입고작업자";
    var inpW = document.createElement("input");
    inpW.type = "text";
    inpW.id = ROOT_ID + "-recv-worker";
    inpW.className = "yna4-pane-inp";
    inpW.placeholder = "비우면 전체";
    inpW.style.flex = "1";
    rowWorker.appendChild(lblW);
    rowWorker.appendChild(inpW);

    var rowDate = document.createElement("div");
    rowDate.className = "yna4-pane-row";
    var lblD = document.createElement("span");
    lblD.className = "yna4-pane-k";
    lblD.textContent = "입고일시";
    var inpD = document.createElement("input");
    inpD.type = "date";
    inpD.id = ROOT_ID + "-recv-date";
    inpD.className = "yna4-pane-inp";
    inpD.value = recvTodayYmd();
    inpD.style.flex = "1";
    rowDate.appendChild(lblD);
    rowDate.appendChild(inpD);

    var actions = document.createElement("div");
    actions.className = "yna4-pane-actions";
    var btnRun = document.createElement("button");
    btnRun.type = "button";
    btnRun.id = ROOT_ID + "-recv-run";
    btnRun.className = "yna4-pane-btn yna4-pane-btn--primary";
    btnRun.textContent = "조회 · Excel";
    var btnStop = document.createElement("button");
    btnStop.type = "button";
    btnStop.id = ROOT_ID + "-recv-stop";
    btnStop.className = "yna4-pane-btn yna4-pane-btn--danger";
    btnStop.textContent = "중단";
    btnStop.disabled = true;
    actions.appendChild(btnRun);
    actions.appendChild(btnStop);

    var status = document.createElement("div");
    status.id = ROOT_ID + "-recv-status";
    status.className = "yna4-pane-status";
    status.textContent = "작업자 · 날짜 선택 후 조회";

    var hint = document.createElement("div");
    hint.className = "yna4-pane-sla-hint";
    hint.textContent =
      "목록 paging → 토트 상세 → 진열 1행 · P= Pallet / 없음= each / 없으면 미진열";

    mod.appendChild(rowWorker);
    mod.appendChild(rowDate);
    mod.appendChild(actions);
    mod.appendChild(status);
    mod.appendChild(hint);
    paneBody.appendChild(mod);

    function setRecvStatus(msg) {
      status.textContent = msg || "";
    }

    function setRecvRunning(on) {
      recvExportRunning = on;
      btnRun.disabled = on;
      btnStop.disabled = !on;
    }

    btnRun.addEventListener("click", async function () {
      if (recvExportRunning) return;
      var workerId = String(inpW.value || "").trim();
      var ymd = String(inpD.value || "").trim();
      if (!ymd) {
        alert("입고일시를 선택하세요.");
        return;
      }
      recvExportStop = false;
      setRecvRunning(true);
      setRecvStatus("시작…");
      try {
        var listRows = await recvFetchAllListRows(workerId, ymd, setRecvStatus);
        if (!listRows.length) {
          alert("조회 결과가 없습니다.");
          setRecvStatus("결과 없음");
          return;
        }
        if (recvExportStop) {
          setRecvStatus("중단됨 (목록 " + listRows.length + "행)");
          return;
        }
        setRecvStatus("목록 " + listRows.length + "행 · 상세 조회…");
        var enriched = await recvEnrichRowsWithDetail(listRows, setRecvStatus);
        if (recvExportStop) {
          setRecvStatus("중단됨");
          return;
        }
        recvDownloadExcel(enriched, ymd, workerId);
        setRecvStatus("완료 · " + enriched.length + "행 Excel 저장");
      } catch (eRun) {
        setRecvStatus("오류: " + (eRun && eRun.message ? eRun.message : String(eRun)));
        alert("실패: " + (eRun && eRun.message ? eRun.message : String(eRun)));
      } finally {
        setRecvRunning(false);
        recvExportStop = false;
      }
    });

    btnStop.addEventListener("click", function () {
      recvExportStop = true;
      setRecvStatus("중단 요청…");
    });
  }

  function mount() {
    if (!document.body) return;
    var taken = document.getElementById(ROOT_ID);
    if (taken && document.body.contains(taken)) return;
    if (taken) {
      try {
        taken.remove();
      } catch (eRem) {}
    }
    var fabTaken = document.getElementById(ROOT_ID + "-fab-restore");
    if (fabTaken) {
      try {
        fabTaken.remove();
      } catch (eFab) {}
    }

    try {
    var wrap = document.createElement("div");
    wrap.id = ROOT_ID;
    applyWrapBase(wrap);

    var card = document.createElement("div");
    card.setAttribute(
      "style",
      [
        "flex:1 1 auto",
        "display:flex",
        "flex-direction:column",
        "min-height:0",
        "height:auto",
        "background:#fff",
        "border:1px solid #ccc",
        "border-radius:0",
        "box-shadow:none",
        "overflow:hidden",
        "box-sizing:border-box",
      ].join(";")
    );

    var skinId = ROOT_ID + "-skin";
    if (!document.getElementById(skinId) && document.head) {
      var skin = document.createElement("style");
      skin.id = skinId;
      var sel = "#" + ROOT_ID;
      skin.textContent = [
        sel + "{--yna4-sp-1:3px;--yna4-sp-2:5px;--yna4-sp-3:6px;--yna4-sp-4:8px;--yna4-r-1:5px;--yna4-r-2:6px;--yna4-fs-sm:8px;--yna4-fs-md:9px;--yna4-fs-lg:11px;--yna4-lh-1:1.35;--yna4-btn-h:23px;--yna4-btn-px:8px;}",
        sel + " .yna4-title-wrap{display:flex;align-items:center;gap:7px;min-width:0;flex:1;}",
        sel +
          " .yna4-title-badge{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:20px;padding:0 5px;font-size:8px;font-weight:800;letter-spacing:-0.02em;color:#fff;background:linear-gradient(155deg,#1e3a8a,#2563eb);border:1px solid #1d4ed8;border-radius:5px;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 2px 6px rgba(37,99,235,.28);cursor:default;transition:transform .2s ease;flex-shrink:0;}",
        sel + " .yna4-title-badge:hover{transform:rotate(-5deg) scale(1.07);}",
        sel + " .yna4-title-col{display:flex;flex-direction:column;min-width:0;gap:1px;}",
        sel + " .yna4-title-line1{font-size:11px;font-weight:800;color:#111;line-height:1.2;letter-spacing:-0.03em;}",
        sel + " .yna4-title-line1 .yna4-title-em{font-style:normal;color:#2563eb;font-weight:800;}",
        sel + " .yna4-title-line2{font-size:8px;font-weight:600;color:#64748b;line-height:1.25;}",
        sel +
          " .yna4-shell-page-nav{display:flex;align-items:center;gap:4px;flex-shrink:0;margin-right:6px;}",
        sel +
          " .yna4-shell-page-nav button{width:28px;height:23px;padding:0;border:1px solid #93c5fd;background:#fff;color:#1e40af;font-size:11px;font-weight:800;cursor:pointer;border-radius:4px;line-height:1;}",
        sel +
          " .yna4-shell-page-nav button.is-active{background:#2563eb;color:#fff;border-color:#2563eb;}",
        sel +
          " .yna4-shell-page{display:flex;flex:1 1 auto;min-height:0;min-width:0;flex-direction:column;overflow:auto;}",
        sel +
          " .yna4-pane-shell-layout{display:block;flex:1 1 auto;min-height:0;min-width:0;width:100%;height:100%;box-sizing:border-box;overflow-x:auto;overflow-y:auto;scrollbar-gutter:stable;background:#eff6ff;padding:var(--yna4-sp-3);}",
        sel +
          " .yna4-pane-grid--shell > .yna4-pane-card > .yna4-pane-card-body{overflow:hidden;}",
        sel +
          " .yna4-pane-grid--shell > .yna4-pane-card > .yna4-pane-card-body--tools{overflow:hidden;}",
        sel +
          " .yna4-pane-shell-main{flex:1 1 auto;min-width:0;min-height:0;align-self:stretch;box-sizing:border-box;}",
        sel +
          " .yna4-pane-grid{display:grid;gap:var(--yna4-sp-3);align-content:start;padding:0;box-sizing:border-box;}",
        sel +
          " .yna4-pane-grid--shell{grid-template-columns:repeat(4,minmax(0,1fr)) minmax(min(100%,195px),1fr) clamp(186px,30vw,360px);grid-auto-rows:minmax(96px,auto);width:100%;}",
        sel +
          " .yna4-pane-grid--shell .yna4-pane-card[data-grid-row-span='2']{grid-row:span 2;min-height:min(240px,32vh);}",
        sel +
          " .yna4-pane-grid--shell .yna4-pane-card[data-grid-row-span='2'] .yna4-pane-card-body{flex:1 1 auto;min-height:0;overflow:hidden;}",
        sel +
          " .yna4-pane-card[data-pane='slot06']{grid-row:1 / 4;grid-column:6;min-height:0;display:flex;flex-direction:column;}",
        sel +
          " .yna4-pane-card[data-pane='slot06'] .yna4-pane-card-body{flex:1 1 auto;min-height:0;overflow:auto;}",
        sel +
          " .yna4-pane-card[data-pane='slot06'] .yna4-pane-card-body--tools{overflow:auto;}",
        sel +
          " .yna4-pane-grid--shell-page2{grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(96px,auto);width:100%;}",
        sel +
          " .yna4-pane-grid--shell-page2 > .yna4-pane-card{grid-row:span 2;min-height:min(240px,32vh);}",
        sel +
          " .yna4-pane-grid--shell-page2 > .yna4-pane-card .yna4-pane-card-body{flex:1 1 auto;min-height:0;overflow:hidden;}",
        sel +
          " .yna4-pane-grid--shell-page2 > .yna4-pane-card .yna4-pane-card-body--tools{overflow:hidden;}",
        sel +
          " .yna4-pane-card{display:flex;flex-direction:column;min-width:0;min-height:102px;background:#fff;border:1px solid #bfdbfe;border-radius:var(--yna4-r-2);box-shadow:0 1px 3px rgba(30,64,175,.1);overflow:hidden;}",
        sel +
          " .yna4-pane-card-hdr{flex-shrink:0;box-sizing:border-box;display:flex;align-items:center;min-height:33px;padding:5px var(--yna4-sp-4);font-size:var(--yna4-fs-md);font-weight:800;color:#1e3a8a;letter-spacing:-0.02em;background:linear-gradient(180deg,#eff6ff 0%,#dbeafe 100%);border-bottom:1px solid #bfdbfe;}",
        sel +
          " .yna4-pane-hdr-title{flex:1;min-width:0;line-height:1.25;word-break:break-word;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;}",
        sel +
          " .yna4-pane-card-body{flex:1;min-height:72px;padding:var(--yna4-sp-3) var(--yna4-sp-4);font-size:var(--yna4-fs-md);color:#334155;line-height:var(--yna4-lh-1);overflow:auto;}",
        sel +
          " .yna4-pane-card-body--tools{overflow:visible;}",
        sel +
          " .yna4-pane-mod{display:flex;flex-direction:column;gap:var(--yna4-sp-2);font-size:var(--yna4-fs-md);color:#334155;line-height:var(--yna4-lh-1);min-height:0;background:transparent;box-sizing:border-box;padding:var(--yna4-sp-2);}",
        sel +
          " .yna4-pane-mod--unload{gap:2px;}",
        sel +
          " .yna4-pane-mod.yna4-pane-mod--po-sku{gap:2px;padding:var(--yna4-sp-1) var(--yna4-sp-2);}",
        sel +
          " .yna4-pane-mod.yna4-pane-mod--po-sku > .yna4-pane-row," +
          sel +
          " .yna4-pane-mod.yna4-pane-mod--po-sku > .yna4-pane-actions{min-height:0;}",
        sel +
          " .yna4-pane-mod.yna4-pane-mod--po-sku > .yna4-pane-row{gap:var(--yna4-sp-1);min-height:0;}",
        sel +
          " .yna4-pane-mod.yna4-pane-mod--po-sku > .yna4-pane-actions{gap:var(--yna4-sp-1);}",
        sel +
          " .yna4-pane-mod.yna4-pane-mod--po-sku select.yna4-pane-inp{appearance:auto;-webkit-appearance:auto;cursor:pointer;font-family:inherit;font-size:var(--yna4-fs-md);line-height:1;border:1px solid #cbd5e1;border-radius:var(--yna4-r-1);background:#fff;color:#0f172a;height:20px;min-height:20px;padding:0 5px;box-sizing:border-box;}",
        sel +
          " .yna4-pane-mod > .yna4-pane-row, " +
          sel +
          " .yna4-pane-mod > .yna4-pane-actions{margin:0;min-height:var(--yna4-btn-h);align-items:center;}",
        sel +
          " .yna4-pane-mod--unload .yna4-pane-row--unload-date{margin-bottom:0;}",
        sel +
          " .yna4-pane-mod--unload .yna4-pane-actions--unload-main{margin-top:0;}",
        sel +
          " .yna4-pane-mod > .yna4-pane-row > *, " +
          sel +
          " .yna4-pane-mod > .yna4-pane-actions > *{box-sizing:border-box;}",
        sel +
          " .yna4-pane-row{display:flex;flex-wrap:wrap;align-items:center;gap:var(--yna4-sp-2);}",
        sel + " .yna4-pane-k{font-weight:700;white-space:nowrap;font-size:var(--yna4-fs-sm);}",
        sel + " .yna4-pane-k--soft{font-weight:600;color:#475569;}",
        sel + " .yna4-pane-k--box{display:inline-flex;align-items:center;justify-content:center;height:var(--yna4-btn-h);padding:0 8px;border:1px solid #cbd5e1;border-radius:var(--yna4-r-1);background:#fff;color:#334155;font-weight:600;font-size:var(--yna4-fs-md);line-height:1.2;box-sizing:border-box;}",
        sel + " .yna4-pane-inp{height:20px;border:1px solid #cbd5e1;border-radius:var(--yna4-r-1);padding:0 5px;background:#fff;color:#0f172a;font-size:var(--yna4-fs-md);box-sizing:border-box;min-width:81px;}",
        sel +
          " select.yna4-pane-inp{min-height:20px;padding-top:0;padding-bottom:0;}",
        sel +
          " .yna4-pane-choice{display:inline-flex;align-items:center;height:var(--yna4-btn-h);cursor:pointer;white-space:nowrap;font:inherit;color:#334155;}",
        sel + " .yna4-pane-choice input[type='radio']{position:absolute;opacity:0;pointer-events:none;width:0;height:0;}",
        sel + " .yna4-pane-choice .yna4-pane-choice-text{display:inline-flex;align-items:center;justify-content:center;height:100%;padding:0 var(--yna4-btn-px);border:1px solid #cbd5e1;border-radius:var(--yna4-r-1);background:#fff;font-size:var(--yna4-fs-md);font-weight:600;line-height:1.2;box-sizing:border-box;transition:.12s ease;}",
        sel + " .yna4-pane-choice:hover .yna4-pane-choice-text{border-color:#93c5fd;background:#f8fbff;}",
        sel + " .yna4-pane-choice input[type='radio']:checked + .yna4-pane-choice-text{border-color:#16a34a;background:#16a34a;color:#fff;}",
        sel +
          " .yna4-pane-actions{display:flex;flex-wrap:wrap;gap:var(--yna4-sp-2);align-items:center;}",
        sel +
          " .yna4-pane-actions--stack{flex-direction:column;align-items:stretch;}",
        sel +
          " .yna4-pane-actions--stack .yna4-pane-btn{width:100%;justify-content:center;}",
        sel +
          " .yna4-pane-btn{border:1px solid #cbd5e1;background:#fff;color:#334155;height:var(--yna4-btn-h);padding:0 var(--yna4-btn-px);font-size:var(--yna4-fs-md);font-weight:600;cursor:pointer;border-radius:var(--yna4-r-1);font-family:inherit;line-height:1.2;}",
        sel + " .yna4-pane-btn:disabled{opacity:.52;cursor:not-allowed;}",
        sel +
          " .yna4-pane-btn--primary{border-color:#2563eb;background:#2563eb;color:#fff;font-size:var(--yna4-fs-md);font-weight:700;}",
        sel +
          " .yna4-pane-btn--danger{border-color:#fca5a5;background:#fecaca;color:#7f1d1d;font-size:var(--yna4-fs-md);font-weight:700;}",
        sel +
          " .yna4-pane-btn--warn{border-color:#ca8a04;background:#fcd34d;color:#422006;font-weight:700;}",
        sel + " .yna4-pane-btn--compact{padding:5px 8px;font-size:9px;font-weight:600;}",
        sel + " .yna4-pane-toggle{min-width:39px;}",
        sel + " .yna4-pane-toggle.is-active{border-color:#16a34a;background:#16a34a;color:#fff;}",
        sel + " .yna4-pane-btn--block{width:100%;box-sizing:border-box;}",
        sel +
          " .yna4-pane-status{--yna4-progress:0%;font-size:var(--yna4-fs-sm);color:#1f2937;line-height:var(--yna4-lh-1);word-break:break-word;padding:var(--yna4-sp-2) var(--yna4-sp-3);background:linear-gradient(90deg,#bef264 var(--yna4-progress),#f8fafc var(--yna4-progress));border:1px solid #d9f99d;border-radius:var(--yna4-r-1);min-height:1.8em;box-sizing:border-box;transition:background .18s ease,color .18s ease;}",
        sel + " .yna4-pane-status.is-progress-heavy{color:#14532d;}",
        sel +
          " .yna4-pane-scroll{max-height:132px;overflow:auto;padding:5px 6px;border:1px solid #e2e8f0;border-radius:5px;background:#fff;font-size:9px;color:#334155;box-sizing:border-box;}",
        sel +
          " .yna4-pane-list-row{display:flex;align-items:center;gap:5px;padding:4px 0;border-bottom:1px solid #f1f5f9;}",
        sel +
          " .yna4-pane-list-row > input[type='checkbox']{flex-shrink:0;margin:0;position:relative;top:1px;}",
        sel + " .yna4-pane-list-row:last-child{border-bottom:0;padding-bottom:2px;}",
        sel +
          " .yna4-pane-list-row-label{flex:1;min-width:0;word-break:break-word;line-height:1.35;display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;}",
        sel +
          " .yna4-repl-need-count{display:inline-flex;align-items:center;flex-shrink:0;padding:2px 6px;border-radius:999px;font-weight:800;font-size:9px;line-height:1.2;letter-spacing:-0.02em;color:#9a3412;background:linear-gradient(180deg,#fff7ed,#ffedd5);border:1px solid #fb923c;box-shadow:0 1px 0 rgba(15,23,42,.06);font-variant-numeric:tabular-nums;}",
        sel +
          " .yna4-pane-diag{display:none;padding:8px;background:#fefce8;border:1px solid #eab308;border-radius:5px;box-sizing:border-box;}",
        sel +
          ' .yna4-pane-diag-log{display:block;width:100%;height:126px;margin:6px 0 0 0;box-sizing:border-box;font-family:Consolas,Menlo,monospace;font-size:8px;line-height:1.35;padding:6px;border:1px solid #cbd5e1;border-radius:5px;resize:vertical;background:#fff;color:#0f172a;}',
        sel +
          " .yna4-pane-sla{border:1px solid #dbeafe;border-radius:5px;background:#ffffff;overflow:hidden;}",
        sel +
          " .yna4-pane-sla-head{padding:5px 6px;font-weight:700;font-size:8px;color:#1e3a8a;background:#eff6ff;border-bottom:1px solid #dbeafe;}",
        sel +
          " .yna4-pane-sla-summary{padding:6px;font-size:8px;color:#334155;background:#fff;line-height:1.4;}",
        sel +
          " .yna4-pane-sla-kpi{display:flex;flex-wrap:wrap;gap:5px;padding:5px 6px;border-bottom:1px solid #eef2ff;font-size:8px;color:#334155;}",
        sel + " .yna4-pane-sla-hint{margin:0;padding:5px 6px;font-size:8px;line-height:1.35;color:#64748b;border-bottom:1px solid #eef2ff;background:#fff;}",
        sel +
          " .yna4-pane-sla-kpi span{display:inline-flex;align-items:center;height:17px;padding:0 5px;border:1px solid #e2e8f0;border-radius:4px;background:#f8fafc;font-variant-numeric:tabular-nums;}",
        sel + " .yna4-pane-sla-filter{padding:0 6px 5px 6px;}",
        sel +
          " .yna4-pane-sla-table-wrap{max-height:180px;overflow:auto;border-top:1px solid #eef2ff;}",
        sel + " .yna4-pane-sla-table{width:100%;border-collapse:collapse;font-size:8px;background:#fff;}",
        sel +
          " .yna4-pane-sla-table th{position:sticky;top:0;background:#0f4c8a;color:#fff;padding:5px;text-align:left;white-space:nowrap;z-index:1;}",
        sel +
          " .yna4-pane-sla-table td{padding:5px;border-bottom:1px solid #eef2ff;vertical-align:middle;white-space:nowrap;}",
        sel + " .yna4-pane-sla-table tr:hover td{background:#f8fbff;}",
        sel +
          " .yna4-stow-watch-scroll{overflow-x:hidden!important;overflow-y:auto;min-width:0;width:100%;max-width:100%;box-sizing:border-box;-webkit-overflow-scrolling:touch;}",
        sel +
          " .yna4-stow-watch-scroll .yna4-pane-sla-table{table-layout:fixed;width:100%!important;max-width:100%;}",
        sel +
          " .yna4-stow-watch-scroll .yna4-pane-sla-table th{white-space:normal!important;word-break:keep-all;overflow-wrap:anywhere;line-height:1.15;padding:3px 4px;font-size:8px;}",
        sel +
          " .yna4-stow-watch-scroll .yna4-pane-sla-table td{white-space:normal!important;word-break:break-word;overflow-wrap:anywhere;line-height:1.25;padding:3px 4px;font-size:8px;vertical-align:top;}",
        sel +
          " .yna4-stow-watch-scroll .yna4-pane-sla-table th:nth-child(1),.yna4-stow-watch-scroll .yna4-pane-sla-table td:nth-child(1){width:22%;}",
        sel +
          " .yna4-stow-watch-scroll .yna4-pane-sla-table th:nth-child(2),.yna4-stow-watch-scroll .yna4-pane-sla-table td:nth-child(2){width:30%;}",
        sel +
          " .yna4-stow-watch-scroll .yna4-pane-sla-table th:nth-child(3),.yna4-stow-watch-scroll .yna4-pane-sla-table td:nth-child(3){width:48%;}",
        sel +
          " .yna4-pane-mod--stow-watch{display:flex;flex-direction:column;align-items:stretch;gap:5px;min-height:0;flex:1 1 auto;}",
        sel +
          " .yna4-pane-mod--stow-watch > .yna4-pane-row," +
          sel +
          " .yna4-pane-mod--stow-watch > .yna4-pane-actions{flex-shrink:0;}",
        sel +
          " .yna4-pane-mod--stow-watch > .yna4-pane-status{flex-shrink:0;}",
        sel +
          " .yna4-pane-mod--stow-watch > .yna4-pane-actions{position:relative;z-index:2;background:#fff;}",
        sel +
          " .yna4-pane-mod--stow-watch .yna4-stow-watch-alert-clamp{flex:1 1 auto;min-height:0;max-height:min(200px,42vh);display:flex;flex-direction:column;overflow:hidden;}",
        sel +
          " .yna4-pane-mod--stow-watch .yna4-stow-watch-scroll{flex:1 1 auto;min-height:0!important;max-height:100%!important;margin-top:0!important;}",
        sel + " .yna4-pane-sla-table .mono{font-variant-numeric:tabular-nums;}",
        sel + " .yna4-pane-sla-table td .ibc-link{color:#1d4ed8;text-decoration:underline;text-underline-offset:2px;font-weight:700;}",
        sel + " .yna4-pane-sla-table tr.row-past td{background:#f4f4f5;color:#18181b;}",
        sel + " .yna4-pane-sla-table tr.row-warn-3h td{background:#fff7ed;}",
        sel + " .yna4-pane-sla-table tr.row-warn-2h td{background:#fffbeb;}",
        sel + " .yna4-pane-sla-table tr.row-warn-1h td{background:#fef2f2;}",
        sel + " .yna4-pane-sla-table tr.row-ok td{background:#f0fdf4;}",
        sel +
          " .yna4-pane-mod--nh-tracking{font-size:10px;line-height:1.45;color:#0f172a;flex:1 1 auto;min-height:0;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-pane-k{font-size:9px;font-weight:700;color:#334155;}",
        sel +
          " .yna4-pane-mod--nh-tracking textarea.yna4-pane-inp{font-size:9px;line-height:1.35;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-pane-status{font-size:9px;font-weight:600;min-height:2.1em;padding:6px 8px;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-nh-scroll{border:1px solid #93c5fd;border-radius:8px;background:linear-gradient(180deg,#fafbff 0%,#fff 42%);padding:8px 9px;margin-top:6px;max-height:min(560px,68vh);box-shadow:inset 0 1px 0 rgba(255,255,255,.9);overflow-x:auto;overflow-y:auto;min-width:0;flex:1 1 auto;min-height:0;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-pane-sla-table{width:100%;border-collapse:separate;border-spacing:0;font-size:10px;background:#fff;border:1px solid #60a5fa;border-radius:8px;overflow:hidden;margin:0 0 11px 0;box-shadow:0 2px 6px rgba(37,99,235,.1);}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-pane-sla-table:last-child{margin-bottom:0;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-pane-sla-table th{font-size:9px;font-weight:800;padding:8px 8px;text-align:center;letter-spacing:-0.02em;border-right:1px solid rgba(255,255,255,.28);}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-pane-sla-table th:first-child{text-align:left;padding-left:9px;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-pane-sla-table th:last-child{border-right:0;padding-right:9px;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-pane-sla-table td{padding:8px 8px;border-bottom:1px solid #e2e8f0;border-right:1px solid #eef2ff;font-weight:650;text-align:center;vertical-align:middle;font-variant-numeric:tabular-nums;line-height:1.35;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-pane-sla-table td:last-child{border-right:0;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-pane-sla-table td:first-child{text-align:left;padding-left:9px;font-weight:750;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-pane-sla-table tbody tr:hover td{background:#eff6ff;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-nh-id-sub{font-size:8px;font-weight:600;color:#64748b;margin-top:3px;line-height:1.2;}",
        sel +
          " .yna4-pane-mod--nh-tracking tr.nh-inline-detail > td.yna4-nh-inline-detail-cell{border-top:2px solid #3b82f6;padding:9px 11px 11px 11px;vertical-align:top;background:linear-gradient(180deg,#eff6ff 0%,#f8fafc 38%);}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-nh-detail-cap{font-size:9px;font-weight:800;color:#1e40af;margin-bottom:6px;letter-spacing:-0.02em;}",
        sel +
          " .yna4-pane-card[data-pane='slot05'],.yna4-pane-card[data-pane='slot11']{min-height:min(118px,16vh);}",
        sel +
          " .yna4-pane-card[data-pane='slot12wide']{grid-column:1 / 6;grid-row:3;min-height:min(280px,34vh);}",
        sel +
          " .yna4-pane-card[data-pane='slot12wide'] .yna4-pane-card-body{display:flex;flex-direction:column;min-height:0;overflow:hidden;padding:var(--yna4-sp-2) var(--yna4-sp-3);}",
        sel +
          " .yna4-pane-mod--gross-uph{flex:1 1 auto;min-height:0;gap:var(--yna4-sp-2);padding:var(--yna4-sp-1) var(--yna4-sp-2);box-sizing:border-box;}",
        sel +
          " .yna4-pane-mod--gross-uph .yna4-gross-uph-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:var(--yna4-sp-2);flex-shrink:0;margin:0;min-height:var(--yna4-btn-h);padding:0 2px;}",
        sel +
          " .yna4-pane-mod--gross-uph .yna4-gross-uph-toolbar .yna4-pane-choice," +
          sel +
          " .yna4-pane-mod--gross-uph .yna4-gross-uph-toolbar .yna4-pane-btn{height:var(--yna4-btn-h);min-height:var(--yna4-btn-h);max-height:var(--yna4-btn-h);margin:0;flex-shrink:0;align-self:center;}",
        sel +
          " .yna4-pane-mod--gross-uph .yna4-gross-uph-toolbar-right{display:flex;flex-wrap:wrap;align-items:center;gap:var(--yna4-sp-2);margin-left:auto;flex-shrink:0;padding-left:var(--yna4-sp-2);}",
        sel +
          " .yna4-pane-mod--gross-uph .yna4-gross-uph-legend{display:flex;flex-wrap:wrap;align-items:center;gap:var(--yna4-sp-2);font-size:9px;font-weight:700;color:#334155;line-height:1;}",
        sel +
          " .yna4-pane-mod--gross-uph .yna4-gross-uph-legend-item{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;}",
        sel +
          " .yna4-pane-mod--gross-uph .yna4-gross-uph-legend-swatch{display:inline-block;width:14px;height:8px;border-radius:2px;box-sizing:border-box;flex-shrink:0;}",
        sel +
          " .yna4-pane-mod--gross-uph .yna4-gross-uph-chart-wrap{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden;border:1px solid #bfdbfe;border-radius:8px;background:#fff;padding:3px 5px 6px 3px;box-sizing:border-box;}",
        sel +
          " .yna4-pane-mod--gross-uph .yna4-gross-uph-canvas-box{position:relative;flex:1 1 auto;min-height:152px;width:100%;height:100%;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-nh-detail-cap--inline{font-size:8px;font-weight:800;color:#334155;margin-bottom:5px;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-nh-detail-inner{font-size:9px;border-radius:6px;border:1px solid #93c5fd;box-shadow:0 1px 3px rgba(15,23,42,.07);}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-nh-detail-inner th{font-size:8px;padding:6px 7px;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-nh-detail-inner td{padding:5px 7px;font-weight:600;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-nh-call-btn{font:inherit;font-size:9px;font-weight:800;padding:5px 9px;border-radius:6px;border:1px solid #2563eb;background:linear-gradient(180deg,#eff6ff 0%,#dbeafe 100%);color:#1e3a8a;cursor:pointer;line-height:1.2;white-space:nowrap;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-nh-call-btn:hover:not(:disabled){background:linear-gradient(180deg,#dbeafe 0%,#bfdbfe 100%);border-color:#1d4ed8;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-nh-call-btn:disabled{opacity:.55;cursor:default;}",
        sel +
          " .yna4-pane-mod--nh-tracking .yna4-nh-sum-table th:last-child," +
          sel +
          " .yna4-pane-mod--nh-tracking .yna4-nh-sum-table td:last-child{min-width:57px;width:1%;white-space:nowrap;}",
        ".yna4-sla-modal{position:fixed;inset:0;z-index:2147483647;}",
        ".yna4-sla-modal-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.45);}",
        ".yna4-sla-modal-dialog{position:absolute;left:2vw;right:2vw;top:4vh;bottom:4vh;background:#fff;border-radius:10px;border:1px solid #cbd5e1;display:flex;flex-direction:column;overflow:hidden;}",
        ".yna4-sla-modal-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:linear-gradient(180deg,#eff6ff 0%,#dbeafe 100%);border-bottom:1px solid #bfdbfe;color:#1e3a8a;}",
        ".yna4-sla-modal .yna4-pane-sla-kpi{display:flex;flex-wrap:wrap;gap:6px;padding:6px 8px;border-bottom:1px solid #eef2ff;font-size:11px;color:#334155;}",
        ".yna4-sla-modal .yna4-pane-sla-kpi span{display:inline-flex;align-items:center;height:22px;padding:0 6px;border:1px solid #e2e8f0;border-radius:5px;background:#f8fafc;font-variant-numeric:tabular-nums;}",
        ".yna4-sla-modal .yna4-pane-sla-hint{margin:0;padding:6px 8px;font-size:11px;line-height:1.35;color:#64748b;border-bottom:1px solid #eef2ff;background:#fff;}",
        ".yna4-sla-modal .yna4-pane-sla-filter{padding:0 8px 6px 8px;display:flex;align-items:center;gap:6px;}",
        ".yna4-sla-modal .yna4-pane-sla-table-wrap{flex:1;max-height:none;overflow:auto;border-top:1px solid #eef2ff;}",
        ".yna4-sla-modal .yna4-pane-sla-table{width:100%;border-collapse:collapse;font-size:12px;background:#fff;}",
        ".yna4-sla-modal .yna4-pane-sla-table th{position:sticky;top:0;background:#0f4c8a;color:#fff;padding:8px;text-align:left;white-space:nowrap;z-index:1;}",
        ".yna4-sla-modal .yna4-pane-sla-table td{padding:8px;border-bottom:1px solid #eef2ff;vertical-align:middle;white-space:nowrap;}",
        ".yna4-sla-modal .yna4-pane-sla-table tr:hover td{background:#f8fbff;}",
        ".yna4-sla-modal .yna4-pane-sla-table .mono{font-variant-numeric:tabular-nums;}",
        ".yna4-sla-modal .yna4-pane-sla-table td .ibc-link{color:#1d4ed8;text-decoration:underline;text-underline-offset:2px;font-weight:700;}",
        ".yna4-sla-modal .yna4-pane-sla-table .yna4-gap-remain-wrap{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:120px;width:100%;}",
        ".yna4-sla-modal .yna4-pane-sla-table .yna4-gap-remain-qty{font-weight:800;color:#111827;}",
        ".yna4-sla-modal .yna4-pane-sla-table .yna4-gap-auto-btn{border:1px solid #93c5fd;background:#eff6ff;padding:2px 7px;margin:0;color:#1e40af;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;line-height:1.2;}",
        ".yna4-sla-modal .yna4-pane-sla-table .yna4-gap-auto-btn:hover{background:#dbeafe;border-color:#60a5fa;}",
        ".yna4-sla-modal .yna4-pane-sla-table tr.row-past td{background:#f4f4f5;color:#18181b;}",
        ".yna4-sla-modal .yna4-pane-sla-table tr.row-warn-3h td{background:#fff7ed;}",
        ".yna4-sla-modal .yna4-pane-sla-table tr.row-warn-2h td{background:#fffbeb;}",
        ".yna4-sla-modal .yna4-pane-sla-table tr.row-warn-1h td{background:#fef2f2;}",
        ".yna4-sla-modal .yna4-pane-sla-table tr.row-ok td{background:#f0fdf4;}",
        ".yna4-gap-api-modal{position:fixed;inset:0;z-index:2147483647;}",
        ".yna4-gap-api-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.55);}",
        ".yna4-gap-api-dialog{position:absolute;left:4vw;right:4vw;top:6vh;bottom:6vh;background:#fff;border-radius:10px;border:1px solid #cbd5e1;display:flex;flex-direction:column;overflow:hidden;}",
        ".yna4-gap-api-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:linear-gradient(180deg,#eff6ff 0%,#dbeafe 100%);border-bottom:1px solid #bfdbfe;color:#1e3a8a;}",
        ".yna4-gap-api-head-actions{display:flex;align-items:center;gap:8px;}",
        ".yna4-gap-api-copy{background:#0d9488;border-color:#0d9488;color:#fff;}",
        ".yna4-gap-api-status{padding:8px 12px;font-size:12px;color:#334155;border-bottom:1px solid #e2e8f0;background:#f8fafc;}",
        ".yna4-gap-api-body{flex:1;overflow:auto;}",
        ".yna4-gap-api-table{width:100%;border-collapse:collapse;font-size:12px;background:#fff;}",
        ".yna4-gap-api-table th{position:sticky;top:0;background:#0f4c8a;color:#fff;padding:8px;text-align:left;white-space:nowrap;z-index:1;}",
        ".yna4-gap-api-table td{padding:8px;border-bottom:1px solid #eef2ff;vertical-align:middle;}",
        ".yna4-gap-api-table td.mono{font-variant-numeric:tabular-nums;}",
      ].join("");
      document.head.appendChild(skin);
    } else if (!document.head && typeof console !== "undefined" && console.warn) {
      console.warn("[YAN4 Shell] document.head 없음 — 스킨 스킵");
    }

    var hdr = document.createElement("div");
    hdr.setAttribute(
      "style",
      [
        "flex-shrink:0",
        "display:flex",
        "align-items:center",
        "justify-content:space-between",
        "gap:10px",
        "padding:10px 12px",
        "font-weight:700",
        "font-size:14px",
        "background:linear-gradient(180deg,#eff6ff 0%,#dbeafe 70%)",
        "color:#1e293b",
        "border-bottom:1px solid #bfdbfe",
      ].join(";")
    );

    var titleWrap = document.createElement("div");
    titleWrap.className = "yna4-title-wrap";
    var badge = document.createElement("span");
    badge.className = "yna4-title-badge";
    badge.textContent = "IB";
    badge.setAttribute("aria-hidden", "true");

    var titleCol = document.createElement("div");
    titleCol.className = "yna4-title-col";

    var line1 = document.createElement("div");
    line1.className = "yna4-title-line1";
    line1.appendChild(document.createTextNode("YAN4 IB "));
    var em = document.createElement("em");
    em.className = "yna4-title-em";
    em.textContent = "통합";
    line1.appendChild(em);

    titleCol.appendChild(line1);
    titleWrap.appendChild(badge);
    titleWrap.appendChild(titleCol);

    var pageNav = document.createElement("div");
    pageNav.className = "yna4-shell-page-nav";
    pageNav.setAttribute("aria-label", "쉘 페이지");
    var btnShellPage1 = document.createElement("button");
    btnShellPage1.type = "button";
    btnShellPage1.textContent = "1";
    btnShellPage1.title = "통합 카드 (기본)";
    btnShellPage1.className = "is-active";
    var btnShellPage2 = document.createElement("button");
    btnShellPage2.type = "button";
    btnShellPage2.textContent = "2";
    btnShellPage2.title = "입고내역 Excel";
    pageNav.appendChild(btnShellPage1);
    pageNav.appendChild(btnShellPage2);

    var btnFold = document.createElement("button");
    btnFold.type = "button";
    btnFold.setAttribute("aria-label", "패널 접기");
    btnFold.textContent = "−";
    btnFold.setAttribute(
      "style",
      "flex-shrink:0;border:1px solid #bbb;background:#fff;color:#333;width:23px;height:23px;font-size:12px;line-height:1;cursor:pointer;font-weight:700;border-radius:0;padding:0;"
    );

    hdr.appendChild(titleWrap);
    hdr.appendChild(pageNav);
    hdr.appendChild(btnFold);

    var fabRestore = document.createElement("button");
    fabRestore.type = "button";
    fabRestore.id = ROOT_ID + "-fab-restore";
    fabRestore.setAttribute("aria-label", "YAN4 IB 패널 다시 열기");
    fabRestore.textContent = "IB";
    fabRestore.setAttribute(
      "style",
      [
        "display:none",
        "position:fixed",
        "right:9px",
        "bottom:9px",
        "z-index:" + LAYOUT.zIndex,
        "width:33px",
        "height:33px",
        "padding:0",
        "border:1px solid #2563eb",
        "border-radius:999px",
        "background:linear-gradient(155deg,#1e3a8a,#2563eb)",
        "color:#fff",
        "font:700 8px/1 system-ui,Segoe UI,sans-serif",
        "cursor:pointer",
        "box-shadow:0 4px 14px rgba(37,99,235,.38)",
        "align-items:center",
        "justify-content:center",
      ].join(";")
    );

    var body = document.createElement("div");
    body.id = ROOT_ID + "-body";
    body.className = "yna4-pane-shell-layout";
    body.setAttribute(
      "style",
      "flex:1 1 auto;min-height:0;min-width:0;height:100%;display:flex;flex-direction:column;"
    );

    var shellPage1 = document.createElement("div");
    shellPage1.id = ROOT_ID + "-shell-page-1";
    shellPage1.className = "yna4-shell-page";

    var shellPage2 = document.createElement("div");
    shellPage2.id = ROOT_ID + "-shell-page-2";
    shellPage2.className = "yna4-shell-page";
    shellPage2.style.display = "none";

    var paneMain = document.createElement("div");
    paneMain.className =
      "yna4-pane-shell-main yna4-pane-grid yna4-pane-grid--shell";

    shellPage1.appendChild(paneMain);

    var paneMain2 = document.createElement("div");
    paneMain2.className =
      "yna4-pane-shell-main yna4-pane-grid yna4-pane-grid--shell-page2";

    shellPage2.appendChild(paneMain2);
    body.appendChild(shellPage1);
    body.appendChild(shellPage2);

    UNIFIED_SHELL_PAGE2_PANE_SPECS.forEach(function (spec, idx) {
      var id = spec.id;
      var label = spec.label;
      var kind = spec.kind || "slot";
      var span = spec.gridRowSpan && spec.gridRowSpan > 1 ? spec.gridRowSpan : 2;

      var card = document.createElement("div");
      card.className = "yna4-pane-card";
      card.dataset.pane = id;

      var paneHdr = document.createElement("div");
      paneHdr.className = "yna4-pane-card-hdr";
      var hdrTitle = document.createElement("span");
      hdrTitle.className = "yna4-pane-hdr-title";
      hdrTitle.textContent = label;
      paneHdr.appendChild(hdrTitle);

      var paneBody = document.createElement("div");
      paneBody.className = "yna4-pane-card-body";

      card.appendChild(paneHdr);
      card.appendChild(paneBody);

      card.style.gridColumn = String((idx % 4) + 1);
      card.style.gridRow =
        String(Math.floor(idx / 4) * span + 1) + " / span " + span;
      card.dataset.gridRowSpan = String(span);

      if (kind === "receiveExport") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          initReceiveReportExportPane(paneBody);
        } catch (eRecvPane) {
          paneBody.textContent = "초기화 실패(입고 Excel)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] receive export pane failed", eRecvPane);
          }
        }
      } else {
        paneBody.textContent = "—";
      }

      paneMain2.appendChild(card);
    });

    function setShellPage(pageNum) {
      var on1 = pageNum === 1;
      shellPage1.style.display = on1 ? "flex" : "none";
      shellPage2.style.display = on1 ? "none" : "flex";
      btnShellPage1.classList.toggle("is-active", on1);
      btnShellPage2.classList.toggle("is-active", !on1);
      try {
        GM_setValue(ROOT_ID + "_shell_page", pageNum);
      } catch (eSp) {}
      if (on1) syncNeedHelpColumnHeight(wrap);
    }

    btnShellPage1.addEventListener("click", function () {
      setShellPage(1);
    });
    btnShellPage2.addEventListener("click", function () {
      setShellPage(2);
    });

    try {
      var savedPage = GM_getValue(ROOT_ID + "_shell_page", 1);
      if (savedPage === 2) setShellPage(2);
    } catch (eSp2) {}

    UNIFIED_SHELL_PANE_SPECS.forEach(function (spec) {
      var id = spec.id;
      var label = spec.label;
      var kind = spec.kind || "slot";

      var card = document.createElement("div");
      card.className = "yna4-pane-card";
      card.dataset.pane = id;

      var paneHdr = document.createElement("div");
      paneHdr.className = "yna4-pane-card-hdr";
      var hdrTitle = document.createElement("span");
      hdrTitle.className = "yna4-pane-hdr-title";
      hdrTitle.textContent = label;
      paneHdr.appendChild(hdrTitle);

      var paneBody = document.createElement("div");
      paneBody.className = "yna4-pane-card-body";

      card.appendChild(paneHdr);
      card.appendChild(paneBody);

      var gridRowSpan = spec.gridRowSpan;
      if (spec.gridRow != null) {
        card.style.gridRow = String(spec.gridRow);
      } else if (gridRowSpan && gridRowSpan > 1) {
        card.style.gridRow = "span " + gridRowSpan;
        card.dataset.gridRowSpan = String(gridRowSpan);
      }
      if (spec.gridColumn != null) {
        card.style.gridColumn = String(spec.gridColumn);
      } else if (spec.gridColumnFull) {
        card.style.gridColumn = "1 / -1";
      } else {
        var gridSpan = spec.gridSpan;
        if (gridSpan && gridSpan > 1) {
          card.style.gridColumn = "span " + gridSpan;
        }
      }

      if (kind === "unload") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          initUnloadCopierPane(paneBody);
        } catch (eUnload) {
          paneBody.textContent = "초기화 실패(unload)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] unload pane init failed", eUnload);
          }
        }
      } else if (kind === "repl") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          initReplenishLauncherPane(paneBody);
        } catch (eRepl) {
          paneBody.textContent = "초기화 실패(repl)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] repl pane init failed", eRepl);
          }
        }
      } else if (kind === "toteMoveApi") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          if (typeof window.__YAN4_INIT_TOTE_MOVE_API_PANE__ === "function") {
            window.__YAN4_INIT_TOTE_MOVE_API_PANE__(paneBody);
          } else {
            paneBody.textContent = "모듈 로드 실패";
          }
        } catch (eTm) {
          paneBody.textContent = "초기화 실패";
        }
      } else if (kind === "poSkuCompare") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          initPoSkuComparePane(paneBody);
        } catch (ePo) {
          paneBody.textContent = "초기화 실패(발주내역)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] poSkuCompare pane init failed", ePo);
          }
        }
      } else if (kind === "transferOpExcel") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          initTransferOpExcelPane(paneBody);
        } catch (eTr) {
          paneBody.textContent = "초기화 실패(이관 엑셀)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] transferOpExcel pane init failed", eTr);
          }
        }
      } else if (kind === "stowProblemWatch") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          initStowProblemWatchPane(paneBody);
        } catch (eSw) {
          paneBody.textContent = "초기화 실패(문제보고 감시)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] stowProblemWatch pane init failed", eSw);
          }
        }
      } else if (kind === "needHelpTracking") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          initNeedHelpTrackingPane(paneBody);
        } catch (eNh) {
          paneBody.textContent = "초기화 실패(Need help Tracking)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] needHelpTracking pane init failed", eNh);
          }
        }
      } else if (kind === "grossUphChart") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          initGrossUphChartPane(paneBody);
        } catch (eGu) {
          paneBody.textContent = "초기화 실패(Gross UPH)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] grossUphChart pane init failed", eGu);
          }
        }
      } else if (kind === "todo") {
        paneBody.textContent = "—";
      } else {
        paneBody.textContent = "—";
      }

      paneMain.appendChild(card);
    });

    if (typeof ResizeObserver !== "undefined") {
      try {
        var paneMainRo = new ResizeObserver(function () {
          syncNeedHelpColumnHeight(wrap);
        });
        paneMainRo.observe(paneMain);
        wrap.__yna4PaneMainRo = paneMainRo;
      } catch (eRo) {
        /* ignore */
      }
    }

    function setMinimized(min) {
      if (min) {
        wrap.setAttribute("data-yna4-minimized", "1");
        wrap.style.display = "none";
        fabRestore.style.display = "inline-flex";
      } else {
        wrap.removeAttribute("data-yna4-minimized");
        wrap.style.display = "flex";
        fabRestore.style.display = "none";
        positionPanel(wrap);
        syncNeedHelpColumnHeight(wrap);
      }
    }

    btnFold.addEventListener("click", function () {
      setMinimized(true);
    });

    fabRestore.addEventListener("click", function () {
      setMinimized(false);
    });

    card.appendChild(hdr);
    card.appendChild(body);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    document.body.appendChild(fabRestore);
    wrap.style.setProperty("visibility", "visible");
    wrap.style.setProperty("opacity", "1");
    wrap.style.setProperty("pointer-events", "auto");

    if (typeof console !== "undefined" && console.info) {
      console.info("[YAN4 Shell] 패널 마운트됨 #" + ROOT_ID);
    }

    var scrollFollowPending = false;
    function followGnbOnScroll() {
      if (wrap.getAttribute("data-yna4-minimized") === "1") return;
      if (scrollFollowPending) return;
      scrollFollowPending = true;
      var run = function () {
        scrollFollowPending = false;
        try {
          positionPanel(wrap);
          syncNeedHelpColumnHeight(wrap);
        } catch (eSc) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] followGnbOnScroll", eSc);
          }
        }
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(run);
      } else {
        run();
      }
    }

    function relayout() {
      try {
        if (wrap.getAttribute("data-yna4-minimized") === "1") return;
        positionPanel(wrap);
        syncNeedHelpColumnHeight(wrap);
      } catch (eLay) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 Shell] relayout", eLay);
        }
      }
    }

    relayout();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        relayout();
      });
    }
    window.addEventListener("resize", relayout);
    window.addEventListener("scroll", followGnbOnScroll, true);
    setTimeout(relayout, 0);
    setTimeout(relayout, 400);
    setTimeout(relayout, 1500);
    setTimeout(function () {
      syncNeedHelpColumnHeight(wrap);
    }, 2200);
    } catch (e) {
      if (typeof console !== "undefined" && console.error) {
        console.error("[YAN4 Unified UI Shell]", e);
      }
    }
  }

  function tryMount() {
    if (!yna4ShellGatePassed) return;
    if (!inboundShellUrlAllowed()) return;
    mount();
  }

  function removeShellNodesIfPresent() {
    var elRm = document.getElementById(ROOT_ID);
    var fabRm = document.getElementById(ROOT_ID + "-fab-restore");
    try {
      if (elRm) elRm.remove();
    } catch (eR) {}
    try {
      if (fabRm) fabRm.remove();
    } catch (eF) {}
  }

  function bootShell() {
    tryMount();
    setTimeout(tryMount, 0);
    setTimeout(tryMount, 50);
    setTimeout(tryMount, 200);
    setTimeout(tryMount, 600);
  }

  function yna4GateStartShell() {
    yna4ShellGatePassed = true;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootShell, { once: true });
    } else {
      bootShell();
    }
  }

  yna4GateEnsureUnlocked(yna4GateStartShell);

  function onLocationMaybeChange() {
    if (inboundShellUrlAllowed()) return;
    removeShellNodesIfPresent();
  }
  window.addEventListener("popstate", onLocationMaybeChange);
  window.addEventListener("hashchange", onLocationMaybeChange);

  /**
   * SPA·레이아웃 깨짐 시 재시도
   * - 노드 없음 → 마운트
   * - 노드는 있는데 크기 거의 0 → 제거 후 마운트 (flex/높이 계산 실패 등)
   */
  setInterval(function () {
    try {
      if (!document.body) return;
      if (!inboundShellUrlAllowed()) {
        removeShellNodesIfPresent();
        return;
      }
      var el = document.getElementById(ROOT_ID);
      if (!el) {
        tryMount();
        return;
      }
      if (!document.body.contains(el)) return;
      if (el.getAttribute("data-yna4-minimized") === "1") return;
      var r = el.getBoundingClientRect();
      if (r.width < 4 && r.height < 4) {
        try {
          el.remove();
        } catch (eZ) {}
        tryMount();
      }
    } catch (ignore) {}
  }, 3000);
})();
