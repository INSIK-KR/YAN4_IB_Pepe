(function () {
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
      id: "avail",
      label: "가용화내역조회",
      kind: "availHistory",
      gridRowSpan: 2,
    },
    {
      id: "prepack",
      label: "Prepack&SR Daily Patrol",
      kind: "prepackDaily",
      gridRowSpan: 2,
    },
    {
      id: "slot05",
      label: "STOW Error Tracking",
      kind: "stowProblemWatch",
      gridRow: "1 / 3",
      gridColumn: 5,
    },
    {
      id: "slot12wide",
      label: "Gross HTP",
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

  /** 2페이지 카드 잠금 — 세션(sessionStorage) 동안 해제 유지 */
  var PANE_LOCK_SK_PREFIX = "yna4_pane_unlock_v1_";

  function paneLockStorageKey(lockId) {
    return PANE_LOCK_SK_PREFIX + String(lockId || "");
  }

  function isPaneLockOpen(lockId) {
    try {
      return sessionStorage.getItem(paneLockStorageKey(lockId)) === "1";
    } catch (eSk) {
      return false;
    }
  }

  function setPaneLockOpen(lockId) {
    try {
      sessionStorage.setItem(paneLockStorageKey(lockId), "1");
    } catch (eSk) {}
  }

  function paneCardTitleForSpec(spec) {
    if (!spec) return "";
    if (!spec.paneLock || !spec.paneLock.lockId) return spec.label || "";
    return isPaneLockOpen(spec.paneLock.lockId) ? spec.label : "—";
  }

  /**
   * @param {HTMLElement} hostEl
   * @param {{ lockId: string, password: string, initFn: function(HTMLElement), titleEl?: HTMLElement, revealedTitle?: string }} opts
   */
  function mountPasswordLockedPane(hostEl, opts) {
    if (!hostEl || !opts || typeof opts.initFn !== "function") return;

    function finishUnlock() {
      if (opts.titleEl && opts.revealedTitle != null) {
        opts.titleEl.textContent = opts.revealedTitle;
      }
      opts.initFn(hostEl);
    }

    if (isPaneLockOpen(opts.lockId)) {
      finishUnlock();
      return;
    }
    hostEl.textContent = "";
    hostEl.className = "yna4-pane-mod yna4-pane-mod--locked";

    var hint = document.createElement("div");
    hint.className = "yna4-pane-lock-hint";
    hint.textContent = "테스트 중";

    var row = document.createElement("div");
    row.className = "yna4-pane-row yna4-pane-row--lock";

    var inp = document.createElement("input");
    inp.type = "password";
    inp.className = "yna4-pane-inp yna4-pane-lock-inp";
    inp.autocomplete = "off";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "yna4-pane-btn yna4-pane-btn--primary";
    btn.textContent = "확인";

    var err = document.createElement("div");
    err.className = "yna4-pane-lock-err";
    err.style.display = "none";

    function tryUnlock() {
      if (String(inp.value || "") === String(opts.password || "")) {
        setPaneLockOpen(opts.lockId);
        finishUnlock();
        return;
      }
      err.textContent = "비밀번호가 올바르지 않습니다.";
      err.style.display = "";
      inp.select();
    }

    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      tryUnlock();
    });
    inp.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        tryUnlock();
      }
    });

    row.appendChild(inp);
    row.appendChild(btn);
    hostEl.appendChild(hint);
    hostEl.appendChild(row);
    hostEl.appendChild(err);
  }

  /** 2페이지 카드 — 12칸 · po와 동일 크기(gridRowSpan 2) */
  var UNIFIED_SHELL_PAGE2_PANE_SPECS = [
    {
      id: "p2recv",
      label: "입고내역 RWA (RPA)",
      kind: "receiveExport",
      gridRowSpan: 2,
    },
    {
      id: "p2workerScan",
      label: "STOW SCAN TRACKING",
      kind: "workerScanTrace",
      gridRowSpan: 2,
    },
    {
      id: "p2rcrt",
      label: "RCRT QR 출력",
      kind: "rcrtLabelPrint",
      gridRowSpan: 2,
    },
    {
      id: "p2bipyo",
      label: "수박비표 출력",
      kind: "bipyoLabelPrint",
      gridRowSpan: 2,
    },
    {
      id: "p2dmg",
      label: "IB 오류처리",
      kind: "damageVerify",
      gridRowSpan: 2,
      paneLock: { lockId: "ib-error", password: "pepepe" },
    },
    {
      id: "p2tote",
      label: "Tote-Move RCRT88 (RPA)",
      kind: "toteMoveApi",
      gridRowSpan: 2,
      paneLock: { lockId: "tote-move", password: "pepepe" },
    },
    {
      id: "p2loc",
      label: "Location CONSOL",
      kind: "locationConsolidation",
      gridRowSpan: 2,
      paneLock: { lockId: "loc-consol", password: "hanhan" },
    },
    {
      id: "barcode128",
      label: "바코드 생성",
      kind: "barcode128",
      gridRowSpan: 2,
    },
    { id: "p2slot11", label: "—", kind: "slot", gridRowSpan: 2 },
    { id: "p2slot12", label: "—", kind: "slot", gridRowSpan: 2 },
    { id: "p2slot13", label: "—", kind: "slot", gridRowSpan: 2 },
    { id: "p2slot14", label: "—", kind: "slot", gridRowSpan: 2 },
  ];

  /** 3페이지 — 카드 그리드 없이 전체 1면(단일 작업 화면) */

  /** ATS 페이지 — 3페이지와 동일하게 전체 1면(단일 작업 화면) */

  /** 4페이지 — STOW Error Tracking 월별 (3페이지와 동일 전체 1면) */

  /**
   * 통합 패널 카드 UI를 보여 줄 URL 여부
   * HTTPS + inbound.coupang.com 루트(/) 만 (inventory·하위 경로에서는 카드 UI 숨김)
   */
  function cfsAppIsPs() {
    try {
      return window.__CFS_APP_EDITION__ === "ps";
    } catch (ePs) {
      return false;
    }
  }

  function inboundShellUrlAllowed() {
    try {
      if (typeof window !== "undefined" && window.__CFS_RECEIVING_APP__) {
        return false;
      }
      /* Desktop EXE — 로컬 호스트에서도 통합 패널 마운트 */
      if (typeof window !== "undefined" && window.__YAN4_DESKTOP_SHELL__) {
        return true;
      }
      if (location.protocol !== "https:") return false;
      var host = location.hostname || "";
      if (!/^inbound\.coupang\.com$/i.test(host)) return false;
      var p = location.pathname || "";
      if (p.length > 1 && p.charAt(p.length - 1) === "/") {
        p = p.slice(0, -1);
      }
      return p === "" || p === "/";
    } catch (eIn) {
      return false;
    }
  }

  /** wms-front /receiving · /receivingq — 우측 IBC 바코드 드로어 */
  function receivingqUrlAllowed() {
    try {
      /* CFS IB LIVE(대시보드)에서는 제외 · CFS Receiving 앱에서만 사용 */
      if (
        typeof window !== "undefined" &&
        window.__YAN4_DESKTOP_SHELL__ &&
        !window.__CFS_RECEIVING_APP__
      ) {
        return false;
      }
      if (location.protocol !== "https:") return false;
      if (!/^wms-front\.coupang\.com$/i.test(location.hostname || "")) return false;
      var p = location.pathname || "";
      if (p.length > 1 && p.charAt(p.length - 1) === "/") {
        p = p.slice(0, -1);
      }
      return /^\/receiving(q)?$/i.test(p);
    } catch (eRq) {
      return false;
    }
  }

  function yna4GatePageNeedsTier() {
    return inboundShellUrlAllowed() || receivingqUrlAllowed();
  }

  function yna4GateApplyTier(tier) {
    yna4GateTier = tier;
    yna4ShellGatePassed = tier === "full";
    yna4ShellPage3GatePassed = tier === "full" || tier === "recvq";
    yna4RecvqGatePassed = tier === "full" || tier === "recvq";
  }

  /** 일일 잠금(확장 전용): KST 기준 하루 1회 · full=1·2·3·SLA·ATS / IB(recvq)=3페이지+ATS+receivingq */
  var YAN4_GATE_DAILY_PASSWORD = "1007IB";
  var YAN4_GATE_RECVQ_PASSWORD = "IB";
  var YAN4_GATE_SK_UNLOCK_KST = "yan4Gate_v2_unlock_kst";
  var YAN4_GATE_SK_RECVQ_UNLOCK_KST = "yan4Gate_recvq_unlock_kst";

  var yna4DailyGateOverlayEl = null;
  /** full 티어 — 통합 쉘 1·2·3·SLA·ATS 페이지 */
  var yna4ShellGatePassed = false;
  /** full 또는 IB(recvq) — 통합 쉘 3페이지 + ATS */
  var yna4ShellPage3GatePassed = false;
  /** full 또는 recvq 티어 — receivingq 드로어 */
  var yna4RecvqGatePassed = false;
  var yna4GateTier = null;

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
    /* Desktop: Coupang 로그인만 사용 · 일일 게이트 생략 */
    if (typeof window !== "undefined" && window.__YAN4_DESKTOP_SHELL__) {
      doneFn("full");
      return;
    }
    if (!yna4GateIsExtensionEnv()) {
      doneFn("full");
      return;
    }
    if (!yna4GatePageNeedsTier()) {
      doneFn(null);
      return;
    }
    chrome.storage.local.get(
      [YAN4_GATE_SK_UNLOCK_KST, YAN4_GATE_SK_RECVQ_UNLOCK_KST],
      function (got) {
        if (chrome.runtime.lastError) {
          doneFn(null);
          return;
        }
        var today = yna4GateTodayKstYmd();
        if (got[YAN4_GATE_SK_UNLOCK_KST] === today) {
          doneFn("full");
          return;
        }
        if (
          yna4GatePageNeedsTier() &&
          got[YAN4_GATE_SK_RECVQ_UNLOCK_KST] === today
        ) {
          doneFn("recvq");
          return;
        }
        yna4GateShowDailyPassword(doneFn);
      }
    );
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
    h1.textContent = receivingqUrlAllowed()
      ? "YAN4 receiving 잠금"
      : "YAN4 IB Shell 잠금";
    var sub = document.createElement("p");
    sub.className = "yg-sub";
    sub.textContent = receivingqUrlAllowed()
      ? "KST 기준 오늘 하루 한 번 비밀번호를 입력해 주세요."
      : "KST 기준 오늘 하루 한 번 비밀번호를 입력해 주세요. (배포 문서에 안내된 값)";
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
    btnGo.textContent = receivingqUrlAllowed()
      ? "잠금 해제"
      : "잠금 해제 후 패널 열기";
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
      var today = yna4GateTodayKstYmd();
      var pack = {};
      var tier = null;
      if (pw === String(YAN4_GATE_DAILY_PASSWORD || "")) {
        pack[YAN4_GATE_SK_UNLOCK_KST] = today;
        tier = "full";
      } else if (pw === String(YAN4_GATE_RECVQ_PASSWORD || "")) {
        pack[YAN4_GATE_SK_RECVQ_UNLOCK_KST] = today;
        tier = "recvq";
      } else {
        err.textContent = "비밀번호가 올바르지 않습니다.";
        err.style.display = "block";
        return;
      }
      btnGo.disabled = true;
      chrome.storage.local.set(pack, function () {
        yna4GateRemoveOverlay();
        doneFn(tier);
      });
    });
  }

  /** 직납하차내역 긁어오기 — HTTP 수집만 (GM_xmlhttpRequest, 클립보드 미사용) */
  var unloadCopyRunning = false;
  var unloadCopyStopRequested = false;
  var poSkuPipelineRunning = false;
  var poSkuPipelineStopRequested = false;
  var unloadLastMergedText = "";
  var unloadLastMergedHtml = "";
  var unloadSlaTimer = null;
  var unloadSlaLastRows = [];
  var unloadSlaAllRows = [];
  /** 하차 파싱 직후·일자 필터 전 원본 (SLA 직납 운영일 재필터용) */
  var unloadSlaAllRowsRaw = [];
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
  var unloadSlaCachedYmd = "";
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

  function unloadGapFindProductNameCol(headers) {
    var candidates = [
      "상품명",
      "sku이름",
      "sku명",
      "skuname",
      "productname",
      "상품",
    ];
    var exact = unloadGapFindColExact(headers, candidates);
    if (exact >= 0) return exact;
    return unloadGapFindCol(headers, ["상품명", "sku 이름", "sku명"]);
  }

  function unloadGapFindColExact(headers, candidates) {
    var h = headers.map(function (x, i) {
      return { n: unloadGapNormKey(x), i: i };
    });
    var c, cn, j;
    for (c = 0; c < candidates.length; c++) {
      cn = unloadGapNormKey(candidates[c]);
      for (j = 0; j < h.length; j++) {
        if (h[j].n === cn) return h[j].i;
      }
    }
    return -1;
  }

  /** 내부 SKU ID — 하차 상세 상품정보 표 1열 (exact only, 외부 SKU ID 제외) */
  function unloadGapFindInternalSkuCol(headers) {
    return unloadGapFindColExact(headers, ["SKU ID", "SKUID"]);
  }

  /** 외부 SKU ID — 'SKU ID'(내부)와 부분매칭 혼동 방지 (exact only) */
  function unloadGapFindExternalSkuCol(headers) {
    var candidates = [
      "외부 SKU ID",
      "외부 SKUID",
      "External SKUID",
      "External SKU ID",
    ];
    var h = headers.map(function (x, i) {
      return { n: unloadGapNormKey(x), i: i };
    });
    var c, cn, j;
    for (c = 0; c < candidates.length; c++) {
      cn = unloadGapNormKey(candidates[c]);
      for (j = 0; j < h.length; j++) {
        if (h[j].n === cn) return h[j].i;
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

  /** Desktop(file://)에서는 location.origin 이 inbound 가 아님 — 항상 inbound 기준 */
  function unloadInboundOrigin() {
    try {
      if (
        typeof window !== "undefined" &&
        window.__YAN4_DESKTOP_SHELL__
      ) {
        return "https://inbound.coupang.com";
      }
      if (/^inbound\.coupang\.com$/i.test(location.hostname || "")) {
        return location.origin || "https://inbound.coupang.com";
      }
    } catch (eOrig) {}
    return "https://inbound.coupang.com";
  }

  function unloadAbsInboundHref(raw, base) {
    var h = String(raw || "").trim();
    if (!h || h.charAt(0) === "#") return "";
    if (/^https?:\/\/inbound\.coupang\.com\//i.test(h)) return h;
    if (/^https?:\/\//i.test(h)) return h;
    /* Desktop 잘못 절대화된 file://…/unloadWork/… 복구 */
    var mFile = h.match(/^(?:file:|app:)[\s\S]*?(\/(?:unloadWork|purchaseOrder)\/[\s\S]*)$/i);
    if (mFile) {
      return unloadInboundOrigin() + mFile[1].replace(/^\/+/, "/");
    }
    try {
      return new URL(h, base || unloadInboundOrigin() + "/").href;
    } catch (eU) {
      return h;
    }
  }

  function unloadGapAbsUrl(raw, base) {
    return unloadAbsInboundHref(raw, base || unloadInboundOrigin() + "/");
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

  function unloadGapBuildInventoryExternalSkuSearchUrl(externalSkuId, page) {
    var p = new URLSearchParams();
    p.set("searched", "true");
    p.set("locationType", "");
    p.set("zone", "");
    p.set("fromLocation", "");
    p.set("toLocation", "");
    p.set("locationBarcode", "");
    p.set("skuId", "");
    p.set("externalSkuId", String(externalSkuId || ""));
    p.set("skuBarcode", "");
    p.set("lpnId", "");
    p.set("inventoryId", "");
    p.set("saleableChangeType", "");
    p.set("availableInventory", "true");
    p.set("page", String(page != null ? page : 0));
    p.set("pageSize", "20");
    return UNLOAD_GAP_INVENTORY_SEARCH_URL + "?" + p.toString();
  }

  /** 직납 RCRT 로케이션 폴백 (YAN4) — 센터별 기준은 yan4-sla-page.js 의 __YAN4_DIRECT_RCRT__ */
  var UNLOAD_GAP_DIRECT_RCRT_RE = /^1007-RCRT(2|3|4|22|44)-/i;

  function unloadGapIsDirectRcrtLoc(loc) {
    var api = window.__YAN4_DIRECT_RCRT__;
    if (api && typeof api.isDirect === "function") return api.isDirect(loc);
    return UNLOAD_GAP_DIRECT_RCRT_RE.test(String(loc || "").trim());
  }

  /** 로그인 풀림 — HTTP 401/403 오류 */
  function unloadGapIsLoginError(e) {
    return /^HTTP (401|403)\b/.test(String((e && e.message) || ""));
  }

  /** 로그인 풀림 — JSON 대신 로그인 화면 HTML 이 온 경우 */
  function unloadGapLooksLikeLoginPage(text) {
    var s = String(text || "").slice(0, 2000).toLowerCase();
    return s.indexOf("<html") >= 0 || s.indexOf("<!doctype") >= 0;
  }

  function unloadGapBuildInventoryLocationSearchUrl(locationBarcode, page) {
    var p = new URLSearchParams();
    p.set("searched", "true");
    p.set("locationType", "");
    p.set("zone", "");
    p.set("fromLocation", "");
    p.set("toLocation", "");
    p.set("locationBarcode", String(locationBarcode || ""));
    p.set("skuId", "");
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

  /**
   * 직납 드릴 — SLA RCRT 를 로케이션 바코드로 재고조회(SKU 조건 없음).
   * { ok, qty, qtyBySku, hasSkuIds, login }
   * qty 는 그 로케이션 전체 quantity 합계, qtyBySku 는 skuDto.skuId(숫자) 별 합계.
   * ok=false 면 조회 실패, login=true 면 로그인 풀림(401·로그인 화면)
   */
  async function unloadGapFetchLocationStock(loc) {
    var want = String(loc || "").replace(/ /g, " ").trim().toUpperCase();
    if (!want || !unloadGapIsDirectRcrtLoc(want)) return { ok: false, qty: 0, login: false };
    var qty = 0;
    var qtyBySku = Object.create(null);
    var hasSkuIds = false;
    var page, j, content, i, row, rowLoc, q, totalPages, sid;
    try {
      for (page = 0; page < UNLOAD_GAP_INVENTORY_PAGE_CAP; page++) {
        var text = await unloadGapInventoryRequest({
          url: unloadGapBuildInventoryLocationSearchUrl(want, page),
          referer: UNLOAD_GAP_INVENTORY_REFERER,
          accept: "application/json, text/javascript, */*; q=0.01",
        });
        try {
          j = JSON.parse(String(text || ""));
        } catch (eJ) {
          return { ok: false, qty: 0, login: unloadGapLooksLikeLoginPage(text) };
        }
        content = j && j.success !== false && j.result && j.result.content;
        if (!Array.isArray(content)) return { ok: false, qty: 0, login: false };
        for (i = 0; i < content.length; i++) {
          row = content[i];
          rowLoc = String((row && row.locationBarcode) || "").trim().toUpperCase();
          // 로케이션 검색이 앞부분 일치로 넓게 잡혀도 정확히 같은 로케이션만 합산
          if (rowLoc !== want) continue;
          q = Number(row.quantity);
          if (!Number.isFinite(q)) continue;
          qty += q;
          sid = unloadGapNormalizeInventorySkuId(row.skuDto && row.skuDto.skuId);
          if (sid) {
            hasSkuIds = true;
            qtyBySku[sid] = (qtyBySku[sid] || 0) + q;
          }
        }
        totalPages = Number(j.result.totalPages);
        if (!Number.isFinite(totalPages) || page + 1 >= totalPages) break;
      }
      return { ok: true, qty: qty, qtyBySku: qtyBySku, hasSkuIds: hasSkuIds, login: false };
    } catch (eLoc) {
      console.warn("[YAN4] inventory location API", want, eLoc);
      return { ok: false, qty: 0, login: unloadGapIsLoginError(eLoc) };
    }
  }

  async function unloadGapFetchRcrtMergedFromApi(buildUrlFn) {
    var merged = unloadGapNewRcrtMerged();
    var page;
    for (page = 0; page < UNLOAD_GAP_INVENTORY_PAGE_CAP; page++) {
      var searchUrl = buildUrlFn(page);
      var jsonText = await unloadGapInventoryRequest({
        url: searchUrl,
        referer: UNLOAD_GAP_INVENTORY_REFERER,
        accept: "application/json, text/javascript, */*; q=0.01",
      });
      var parsed = unloadGapParseRcrtFromInventoryJson(jsonText);
      if (parsed.valid) merged.valid = true;
      else if (unloadGapLooksLikeLoginPage(jsonText)) merged.loginPage = true;
      unloadGapMergeRcrtLocations(merged, parsed.locations, parsed.qtyByLoc);
      if (page + 1 >= (parsed.totalPages || 1)) break;
    }
    return merged;
  }

  function unloadGapParseRcrtFromInventoryJson(text) {
    var out = [];
    var seen = Object.create(null);
    var qtyByLoc = Object.create(null);
    var j;
    try {
      j = JSON.parse(String(text || ""));
    } catch (eJ) {
      return { locations: out, qtyByLoc: qtyByLoc, totalPages: 0 };
    }
    if (!j || j.success === false) {
      return { locations: out, qtyByLoc: qtyByLoc, totalPages: 0 };
    }
    var result = j.result;
    var content = result && result.content;
    if (!Array.isArray(content)) {
      return { locations: out, qtyByLoc: qtyByLoc, totalPages: 0 };
    }
    var i;
    for (i = 0; i < content.length; i++) {
      var row = content[i];
      var loc = String((row && row.locationBarcode) || "").trim();
      if (!loc || !unloadGapIsDirectRcrtLoc(loc)) continue;
      // 같은 로케이션 여러 행(LPN 등)은 quantity 합계
      var q = Number(row.quantity);
      if (Number.isFinite(q)) qtyByLoc[loc] = (qtyByLoc[loc] || 0) + q;
      if (seen[loc]) continue;
      seen[loc] = 1;
      out.push(loc);
    }
    var totalPages = result && result.totalPages != null ? Number(result.totalPages) : 1;
    if (!Number.isFinite(totalPages) || totalPages < 1) totalPages = 1;
    // valid: 응답이 정상 JSON(content 배열) — 로그인 만료 HTML 등은 false
    return { locations: out, qtyByLoc: qtyByLoc, totalPages: totalPages, valid: true };
  }

  function unloadGapNewRcrtMerged() {
    return {
      seen: Object.create(null),
      list: [],
      qtyByLoc: Object.create(null),
      valid: false,
    };
  }

  function unloadGapMergeRcrtLocations(merged, batch, qtyByLoc) {
    var i, loc;
    for (i = 0; i < batch.length; i++) {
      loc = batch[i];
      if (qtyByLoc && qtyByLoc[loc] != null) {
        merged.qtyByLoc[loc] = (merged.qtyByLoc[loc] || 0) + qtyByLoc[loc];
      }
      if (merged.seen[loc]) continue;
      merged.seen[loc] = 1;
      merged.list.push(loc);
    }
  }

  /** [{ loc, qty }] · qty 를 모르면 null */
  function unloadGapRcrtMergedToEntries(merged) {
    return merged.list.map(function (loc) {
      var q = merged.qtyByLoc[loc];
      return { loc: loc, qty: q != null && Number.isFinite(q) ? q : null };
    });
  }

  /** IBC 하차 상세 — 상품정보(또는 SKU ID 열) 표 첫 데이터 행의 내부 SKU ID */
  function unloadGapParseFirstProductSkuFromDetailHtml(detailHtml) {
    var doc = new DOMParser().parseFromString(String(detailHtml || ""), "text/html");
    var tables = doc.querySelectorAll('table[is="w-table"], table');
    var t, aoa, r, texts, idxSku, idxName, dr, c, sku, name;
    for (t = 0; t < tables.length; t++) {
      aoa = unloadGapPadRows(unloadGapTableToAoa(tables[t]));
      for (r = 0; r < Math.min(12, aoa.length); r++) {
        texts = aoa[r].map(function (x) {
          return String(x || "").trim();
        });
        idxSku = unloadGapFindInternalSkuCol(texts);
        if (idxSku < 0) continue;
        idxName = unloadGapFindProductNameCol(texts);
        for (dr = r + 1; dr < aoa.length; dr++) {
          c = aoa[dr].map(function (x) {
            return String(x || "").trim();
          });
          sku = unloadGapNormalizeInventorySkuId(c[idxSku] || "");
          if (!sku) continue;
          name = idxName >= 0 ? String(c[idxName] || "").trim() : "";
          return { sku: sku, name: name };
        }
      }
    }
    return null;
  }

  async function unloadGapCollectGapSkusFromDetailHtml(detailHtml, detailUrl) {
    var poUrls = unloadGapParsePoUrlsFromDetailHtml(detailHtml, detailUrl);
    if (!poUrls.length) return [];
    var all = [];
    var i;
    for (i = 0; i < poUrls.length; i++) {
      var poHtml = await unloadGapGmGet(poUrls[i], { Referer: detailUrl });
      all = all.concat(unloadGapParseSkuRowsFromPoHtml(poHtml, poUrls[i]));
    }
    var poIds = poUrls.map(function (u) {
      return unloadGapPurchaseOrderIdFromUrl(u) || u;
    });
    if (!all.length) {
      var empty = [];
      empty.poIds = poIds;
      return empty;
    }
    var gapRows = all.filter(function (x) {
      return (Number(x.gap) || 0) > 0;
    });
    gapRows.sort(function (a, b) {
      return (Number(b.gap) || 0) - (Number(a.gap) || 0);
    });
    var picked = gapRows.length ? gapRows : all;
    picked.poIds = poIds;
    return picked;
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
      var abs = unloadGapAbsUrl(
        href,
        detailUrl || unloadInboundOrigin() + "/"
      );
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
      var idxSku = unloadGapFindExternalSkuCol(texts);
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
        idxName: unloadGapFindProductNameCol(texts),
        idxStat: unloadGapFindCol(texts, ["상태", "발주상태", "스큐상태"]),
      };
    }
    return null;
  }

  function unloadGapPurchaseOrderIdFromUrl(poUrl) {
    try {
      var u = new URL(poUrl, unloadInboundOrigin());
      var q = u.searchParams.get("purchaseOrderId") || u.searchParams.get("purchaseorderid");
      if (q) return String(q).trim();
      var m = (u.pathname || "").match(/(?:purchaseOrder\/item|purchaseorder\/item)\/(\d+)/i);
      return m ? m[1] : "";
    } catch (ePid) {
      return "";
    }
  }

  function unloadGapParsePoTemperatureFromHtml(poHtml) {
    var raw = String(poHtml || "");
    var doc = new DOMParser().parseFromString(raw, "text/html");
    var nodes = doc.querySelectorAll("dt,th,label,td,span");
    var i, lab, next, row, tds, j, val;
    for (i = 0; i < nodes.length; i++) {
      lab = String(nodes[i].textContent || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (lab !== "온도" && lab.indexOf("온도") < 0) continue;
      if (lab.length > 16) continue;
      next = nodes[i].nextElementSibling;
      if (next) {
        val = String(next.textContent || "").trim();
        if (val) return val;
      }
      row = nodes[i].closest ? nodes[i].closest("tr") : null;
      if (row) {
        tds = row.querySelectorAll("td,th");
        for (j = 0; j < tds.length; j++) {
          if (tds[j] === nodes[i]) continue;
          val = String(tds[j].textContent || "").trim();
          if (val && val !== lab) return val;
        }
      }
    }
    var m = raw.match(
      /냉동\s*[-−]?\s*18\s*℃?|냉장\s*\+\s*1\s*℃?|냉장\s*\+\s*10\s*℃?|상온/i
    );
    return m ? m[0] : "";
  }

  function unloadGapParseSkuRowsFromPoHtml(poHtml, poUrl) {
    var poTemperature = unloadGapParsePoTemperatureFromHtml(poHtml);
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
        var sku = c[map.idxSku] || "";
        if (!sku) continue;
        if (!isFinite(recv) || !isFinite(disp) || !isFinite(err)) continue;
        var gap = Math.max(0, recv - disp - err);
        out.push({
          purchaseOrderId: unloadGapPurchaseOrderIdFromUrl(poUrl),
          poUrl: poUrl,
          sku: sku,
          name: map.idxName >= 0 ? c[map.idxName] || "" : "",
          status: map.idxStat >= 0 ? c[map.idxStat] || "" : "",
          poTemperature: poTemperature,
          recv: recv,
          disp: disp,
          err: err,
          gap: gap,
        });
      }
    }
    var seen = Object.create(null);
    var dedup = [];
    out.forEach(function (x) {
      var k = String(x.poUrl) + "\t" + String(x.sku);
      if (seen[k]) {
        var prev = seen[k];
        if (
          String(x.name || "").trim().length >
          String(prev.name || "").trim().length
        ) {
          var pi;
          for (pi = 0; pi < dedup.length; pi++) {
            if (dedup[pi] === prev) {
              dedup[pi] = x;
              break;
            }
          }
          seen[k] = x;
        }
        return;
      }
      seen[k] = x;
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

  function unloadGapFindInventoryQtyColIndex(table) {
    var tr = table.querySelector("thead tr");
    if (!tr) return -1;
    var ths = tr.querySelectorAll("th");
    var i, k, partial = -1;
    for (i = 0; i < ths.length; i++) {
      k = unloadGapNormKey(String(ths[i].textContent || ""));
      if (k === "수량") return i;
      if (partial < 0 && k.indexOf("수량") >= 0) partial = i;
    }
    return partial;
  }

  /** inventory 목록 HTML → [{ loc, qty }] (수량 열 없으면 qty null) */
  function unloadGapParseInventoryRcrtEntries(html) {
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    var table = doc.querySelector('table[is="w-table"]') || doc.querySelector("table");
    if (!table) return [];
    var idx = unloadGapFindInventoryLocationColIndex(table);
    if (idx < 0) return [];
    var qtyIdx = unloadGapFindInventoryQtyColIndex(table);
    var merged = unloadGapNewRcrtMerged();
    table.querySelectorAll("tbody tr").forEach(function (tr) {
      var tds = tr.querySelectorAll("td");
      if (tds.length <= idx) return;
      var loc = String(tds[idx].textContent || "").replace(/\u00a0/g, " ").trim();
      if (!loc) return;
      if (!unloadGapIsDirectRcrtLoc(loc)) return;
      var qtyMap = null;
      if (qtyIdx >= 0 && tds.length > qtyIdx) {
        var q = Number(String(tds[qtyIdx].textContent || "").replace(/[^\d.\-]/g, ""));
        if (Number.isFinite(q)) {
          qtyMap = Object.create(null);
          qtyMap[loc] = q;
        }
      }
      unloadGapMergeRcrtLocations(merged, [loc], qtyMap);
    });
    return unloadGapRcrtMergedToEntries(merged);
  }

  function unloadGapParseInventoryRcrtLocations(html) {
    return unloadGapParseInventoryRcrtEntries(html).map(function (e) {
      return e.loc;
    });
  }

  async function unloadGapFetchRcrtForSku(sku) {
    var entries = await unloadGapFetchRcrtEntriesForSku(sku);
    return entries
      .map(function (e) {
        return e.loc;
      })
      .join(", ");
  }

  /**
   * 직납 드릴 실시간 재고 — inventory API 만 조회(skuid → 없으면 externalid).
   * { ok, entries:[{ loc, qty }], login } · ok=false 면 조회 실패(로그인 만료·네트워크 등)
   * login=true 면 로그인 풀림(401·로그인 화면)
   */
  async function unloadGapFetchRcrtLiveForSku(sku) {
    var id = unloadGapNormalizeInventorySkuId(sku);
    if (!id) return { ok: false, entries: [], login: false };
    try {
      var merged = await unloadGapFetchRcrtMergedFromApi(function (page) {
        return unloadGapBuildInventorySearchUrl(id, page);
      });
      if (merged.loginPage) return { ok: false, entries: [], login: true };
      if (!merged.list.length) {
        var byExt = await unloadGapFetchRcrtMergedFromApi(function (page) {
          return unloadGapBuildInventoryExternalSkuSearchUrl(id, page);
        });
        if (byExt.list.length || !merged.valid) merged = byExt;
      }
      return {
        ok: merged.valid,
        entries: unloadGapRcrtMergedToEntries(merged),
        login: !merged.valid && !!merged.loginPage,
      };
    } catch (eApi) {
      console.warn("[YAN4] inventory live API", id, eApi);
      return { ok: false, entries: [], login: unloadGapIsLoginError(eApi) };
    }
  }

  /** 직납 드릴용 — inventory 재고조회 RCRT 로케이션 + 로케이션별 quantity */
  async function unloadGapFetchRcrtEntriesForSku(sku) {
    var id = unloadGapNormalizeInventorySkuId(sku);
    if (!id) return [];
    var merged = unloadGapNewRcrtMerged();
    try {
      merged = await unloadGapFetchRcrtMergedFromApi(function (page) {
        return unloadGapBuildInventorySearchUrl(id, page);
      });
      if (!merged.list.length) {
        merged = await unloadGapFetchRcrtMergedFromApi(function (page) {
          return unloadGapBuildInventoryExternalSkuSearchUrl(id, page);
        });
      }
      if (merged.list.length) return unloadGapRcrtMergedToEntries(merged);
    } catch (eApi) {
      console.warn("[YAN4] inventory search API", id, eApi);
    }
    var queries = [
      "?searched=true&skuId=" + encodeURIComponent(id),
      "?searched=true&externalSkuId=" + encodeURIComponent(id) + "&skuId=",
    ];
    var qi, q, html, locs;
    for (qi = 0; qi < queries.length; qi++) {
      q = queries[qi];
      try {
        html = await unloadGapInventoryRequest({
          url: UNLOAD_GAP_INVENTORY_LIST_URL + q,
          referer: UNLOAD_GAP_INVENTORY_REFERER,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        });
        locs = unloadGapParseInventoryRcrtEntries(html);
        if (locs.length) return locs;
      } catch (eHtml) {
        console.warn("[YAN4] inventory list HTML", id, q, eHtml);
      }
    }
    return [];
  }

  async function unloadGapRcrtListForSku(sku) {
    var raw = await unloadGapFetchRcrtForSku(sku);
    if (!raw) return [];
    return String(raw)
      .split(/\s*,\s*/)
      .map(function (s) {
        return String(s || "").trim();
      })
      .filter(Boolean);
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
    var cols = ["발주ID", "SKU", "상품명", "상태", "입고", "진열완료", "진열오류", "미달", "로케이션 (직납 RCRT)"];
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
        var href = unloadAbsInboundHref(
          String(a.getAttribute("href") || "").trim()
        );
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
        ibcUrl: unloadAbsInboundHref(
          unloadSlaSavedIbcLinks[String(ibc || "").trim()] || ""
        ),
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

  window.__YAN4_UNLOAD_SLA_BRIDGE__ = {
    getRows: function () {
      return (unloadSlaAllRows || []).slice();
    },
    getCachedYmd: function () {
      return unloadSlaCachedYmd || "";
    },
    ibcUrlFor: function (ibc) {
      return unloadAbsInboundHref(
        unloadSlaSavedIbcLinks[String(ibc || "").trim()] || ""
      );
    },
    /** SLA 직납 — 운영일(07:00~) 하차내역 (캐시 없으면 inbound 하차 목록 수집) */
    ensureForYmd: async function (ymd, opts) {
      var want = String(ymd || unloadOperationalYmd()).trim();
      var force = !!(opts && opts.forceRefresh);
      if (
        !force &&
        unloadSlaAllRowsRaw.length &&
        unloadSlaCachedYmd === want
      ) {
        return unloadFilterRowsForOperationalDay(
          unloadSlaAllRowsRaw.slice(),
          want
        );
      }
      await unloadCopyAllPages(want, "operational", { quiet: true });
      return unloadFilterRowsForOperationalDay(
        unloadSlaAllRowsRaw || [],
        want
      );
    },
    operationalYmd: unloadOperationalYmd,
  };

  /** IBC 상세 → 발주 SKU 중 미진열(gap) 전건 (gap 내림차순, sku=외부 SKU ID) */
  async function unloadGapCollectSkusFromDetailUrl(detailUrl) {
    var url = String(detailUrl || "").trim();
    if (!url) return [];
    var detailHtml = await unloadGapGmGet(url);
    return unloadGapCollectGapSkusFromDetailHtml(detailHtml, url);
  }

  /** IBC 상세 → 상품정보 표 1행 SKU ID(inventory용) + 발주 gap 메타 */
  async function unloadGapTopSkuFromDetailUrl(detailUrl) {
    var url = String(detailUrl || "").trim();
    if (!url) return null;
    var detailHtml = await unloadGapGmGet(url);
    var product = unloadGapParseFirstProductSkuFromDetailHtml(detailHtml);
    if (!product || !product.sku) return null;
    var out = {
      sku: String(product.sku).trim(),
      name: String(product.name || "").trim(),
      gap: 0,
      purchaseOrderId: "",
    };
    var gapRows = await unloadGapCollectGapSkusFromDetailHtml(detailHtml, url);
    if (gapRows.length) {
      out.gap = Number(gapRows[0].gap) || 0;
      out.purchaseOrderId = String(gapRows[0].purchaseOrderId || "").trim();
      out.poTemperature = String(gapRows[0].poTemperature || "").trim();
      out.status = String(gapRows[0].status || "").trim();
      if (!out.name && gapRows[0].name) {
        out.name = String(gapRows[0].name || "").trim();
      }
    }
    return out;
  }

  window.__YAN4_UNLOAD_GAP_BRIDGE__ = {
    topSkuForDetailUrl: unloadGapTopSkuFromDetailUrl,
    gapSkusForDetailUrl: unloadGapCollectSkusFromDetailUrl,
    rcrtListForSku: unloadGapRcrtListForSku,
    rcrtEntriesForSku: unloadGapFetchRcrtEntriesForSku,
    rcrtLiveForSku: unloadGapFetchRcrtLiveForSku,
    locationStock: unloadGapFetchLocationStock,
  };

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
    var base = unloadInboundOrigin() + "/";
    unload$all("a[href]", root).forEach(function (a) {
      try {
        var raw = String(a.getAttribute("href") || "").trim();
        var abs = unloadAbsInboundHref(raw, base);
        if (abs) a.setAttribute("href", abs);
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

  function unloadStandardSearchQuery(operYmd, csrfToken) {
    var encStart = encodeURIComponent(operYmd);
    var encEnd = encodeURIComponent(unloadOperationalSearchEndYmd(operYmd));
    return unloadAppendCsrfToQueryString(
      "searched=true&startDate=" +
        encStart +
        "&endDate=" +
        encEnd +
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

  /** startDate/endDate·searched 표준화 — 운영일 operYmd 07:00~익일 06:59 */
  function unloadApplyStandardSearchParams(p, operYmd) {
    var endYmd = unloadOperationalSearchEndYmd(operYmd);
    ["startDate", "startdate", "endDate", "enddate", "searched"].forEach(
      function (k) {
        try {
          p.delete(k);
        } catch (eD) {}
      }
    );
    p.set("startDate", operYmd);
    p.set("endDate", endYmd);
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
  function unloadBuildFirstPageSpecs(operYmd, bootHtml, csrfToken) {
    var encStart = encodeURIComponent(operYmd);
    var encEnd = encodeURIComponent(unloadOperationalSearchEndYmd(operYmd));
    var u = UNLOAD_LIST_URL;
    var specs = [];
    function get(urlWithQueryMaybe, tag) {
      specs.push({ kind: "get", tag: tag, url: urlWithQueryMaybe });
    }
    function getQ(queryParams, tag) {
      var q = unloadAppendCsrfToQueryString(queryParams, csrfToken);
      get(unloadJoinUrlQuery(u, q), tag);
    }

    var fromForm = unloadCollectSearchFormAsUrlEncoded(bootHtml || "", operYmd);
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
        encStart +
        "&endDate=" +
        encEnd +
        "&dateRangeType=UNLOAD_DATE",
      "get-se-un-date"
    );
    getQ(
      "startDate=" +
        encStart +
        "&endDate=" +
        encEnd +
        "&searched=true&dateRangeType=UNLOAD_DATE",
      "get-dates-first"
    );
    getQ(
      "searched=true&startDate=" +
        encStart +
        "&endDate=" +
        encEnd +
        "&dateRangeType=UNLOAD_DATE&size=50&page=0",
      "get-size50-page0"
    );
    getQ(
      "searched=true&startDate=" +
        encStart +
        "&endDate=" +
        encEnd +
        "&size=50&page=0&dateRangeType=UNLOAD_DATE",
      "get-reordered-keys"
    );
    getQ(
      "searched=true&page=0&startDate=" +
        encStart +
        "&endDate=" +
        encEnd +
        "&dateRangeType=UNLOAD_DATE",
      "get-page0"
    );

    getQ(
      "searched=true&startDate=" +
        encStart +
        "&endDate=" +
        encEnd,
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

  var UNLOAD_OPERATIONAL_DAY_START_HOUR = 7;

  /** KST 달력일 (자정 기준) — PO·하차내역·WMS AUTO 등 */
  function unloadCalendarYmdNow(d) {
    return unloadSeoulWallClock(d || new Date()).ymd;
  }

  function unloadSeoulWallClock(d) {
    var base = d instanceof Date ? d : new Date();
    var ymd = base.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(base);
    var hour = 0;
    var minute = 0;
    parts.forEach(function (p) {
      if (p.type === "hour") hour = parseInt(p.value, 10) || 0;
      if (p.type === "minute") minute = parseInt(p.value, 10) || 0;
    });
    return { ymd: ymd, hour: hour, minute: minute };
  }

  function unloadParseYmdLocal(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
    if (!m) return null;
    var y = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10) - 1;
    var da = parseInt(m[3], 10);
    var dt = new Date(y, mo, da);
    if (
      dt.getFullYear() !== y ||
      dt.getMonth() !== mo ||
      dt.getDate() !== da
    ) {
      return null;
    }
    return dt;
  }

  function unloadYmdAddDays(ymd, delta) {
    var dt = unloadParseYmdLocal(ymd);
    if (!dt) return String(ymd || "");
    dt.setDate(dt.getDate() + (Number(delta) || 0));
    return unloadYmdFromDate(dt);
  }

  /** SLA 직납 전용 운영일 — 07:00~익일 06:59 구간의 기준 일자 (KST) */
  function unloadOperationalYmd(d) {
    var sc = unloadSeoulWallClock(d || new Date());
    if (sc.hour < UNLOAD_OPERATIONAL_DAY_START_HOUR) {
      return unloadYmdAddDays(sc.ymd, -1);
    }
    return sc.ymd;
  }

  function unloadOperationalSearchEndYmd(operYmd) {
    return unloadYmdAddDays(operYmd, 1);
  }

  function unloadOperationalDayBoundsMs(operYmd) {
    var endYmd = unloadOperationalSearchEndYmd(operYmd);
    return {
      startMs: Date.parse(String(operYmd) + "T07:00:00+09:00"),
      endMs: Date.parse(String(endYmd) + "T06:59:59.999+09:00"),
    };
  }

  function unloadCalendarDayBoundsMs(calYmd) {
    return {
      startMs: Date.parse(String(calYmd) + "T00:00:00+09:00"),
      endMs: Date.parse(String(calYmd) + "T23:59:59.999+09:00"),
    };
  }

  function unloadInstantInOperationalDay(instant, operYmd) {
    if (!instant || !operYmd) return false;
    var t =
      instant instanceof Date
        ? instant.getTime()
        : new Date(instant).getTime();
    if (!isFinite(t)) return false;
    var b = unloadOperationalDayBoundsMs(operYmd);
    return t >= b.startMs && t <= b.endMs;
  }

  function unloadInstantInCalendarDay(instant, calYmd) {
    if (!instant || !calYmd) return false;
    var t =
      instant instanceof Date
        ? instant.getTime()
        : new Date(instant).getTime();
    if (!isFinite(t)) return false;
    var b = unloadCalendarDayBoundsMs(calYmd);
    return t >= b.startMs && t <= b.endMs;
  }

  function unloadFilterRowsForOperationalDay(rows, operYmd) {
    var out = [];
    var i;
    for (i = 0; i < (rows || []).length; i++) {
      if (unloadInstantInOperationalDay(rows[i] && rows[i].unload, operYmd)) {
        out.push(rows[i]);
      }
    }
    return out;
  }

  function unloadFilterRowsForCalendarDay(rows, calYmd) {
    var out = [];
    var i;
    for (i = 0; i < (rows || []).length; i++) {
      if (unloadInstantInCalendarDay(rows[i] && rows[i].unload, calYmd)) {
        out.push(rows[i]);
      }
    }
    return out;
  }

  function unloadFilterRowsByDayMode(rows, ymd, dayMode) {
    if (dayMode === "operational") {
      return unloadFilterRowsForOperationalDay(rows, ymd);
    }
    return unloadFilterRowsForCalendarDay(rows, ymd);
  }

  /** PO·하차내역·WMS AUTO 등 — KST 달력 오늘 */
  function unloadTodayYmd() {
    return unloadCalendarYmdNow();
  }

  function unloadYesterdayYmd() {
    return unloadYmdAddDays(unloadCalendarYmdNow(), -1);
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

  async function unloadCopyAllPages(optYmd, optDayMode, optFlags) {
    if (unloadCopyRunning) return;
    var quiet = !!(optFlags && optFlags.quiet);

    if (typeof GM_xmlhttpRequest !== "function") {
      if (!quiet) {
        alert(
          "「작업 시작」에는 GM_xmlhttpRequest 가 필요합니다.\n\n" +
            "스크립트 헤더에 // @grant GM_xmlhttpRequest 가 있는지 확인하세요."
        );
      }
      return;
    }

    unloadCopyRunning = true;
    unloadCopyStopRequested = false;
    setProgressByStatusId(ROOT_ID + "-unload-status", 0);

    unloadDiagnosticsFullText = "";
    unloadRevealDiagnosticsPanel("");

    try {
      var explicitYmd = optYmd != null && String(optYmd).trim();
      var ymd = explicitYmd ? String(optYmd).trim() : unloadSelectedSearchYmd();
      var dayMode =
        optDayMode === "operational" || optDayMode === "calendar"
          ? optDayMode
          : explicitYmd
            ? "operational"
            : "calendar";
      var dayWord =
        explicitYmd
          ? ymd === unloadTodayYmd()
            ? "오늘"
            : ymd === unloadYesterdayYmd()
              ? "어제"
              : ymd
          : unloadDateChoiceLabelSummary();
      setUnloadStatus("HTTP: 하차 목록(" + dayWord + " " + ymd + ") 조회…");

      var first = await unloadHttpTryFirstPage(ymd);
      if (!first || !first.html) {
        unloadRevealDiagnosticsPanel(
          unloadBuildDiagnosticsFullText(unloadFormatProbeForAlert(8888))
        );
        if (!quiet) {
          alert(
            "하차 목록을 가져오지 못했습니다.\n\n" +
              "통합 패널 아래쪽「HTTP 진단」칸에서 「칸 안 전체 선택」 후\n내용을 메모장/채팅에 붙여 넣어 주세요."
          );
        }
        setUnloadStatus(
          "실패 · 아래 진단 영역에서 「칸 안 전체 선택」으로 내용 저장"
        );
        return;
      }

      var firstTable = unloadTableFromHtmlString(first.html);
      if (!firstTable) {
        if (!quiet) {
          alert("응답에서 직납하차내역 표(table)를 찾지 못했습니다.");
        }
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
          if (!quiet) {
            alert(page + "페이지 HTTP 응답을 받지 못했습니다.");
          }
          return;
        }

        var currentTable = unloadTableFromHtmlString(pageHtml);
        if (!currentTable) {
          if (!quiet) {
            alert(page + "페이지 표를 파싱하지 못했습니다.");
          }
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
          unloadLastMergedHtml = String(mergeHtmlTables(htmlParts) || "");
          unloadLastMergedText = String(textParts.join("\n") || "");
          setUnloadStatus("중지 · " + htmlParts.length + "p 수집됨");
        } else {
          setUnloadStatus("중지됨");
        }
        return;
      }

      var mergedHtml = mergeHtmlTables(htmlParts);
      var mergedText = textParts.join("\n");
      unloadLastMergedHtml = String(mergedHtml || "");
      unloadLastMergedText = String(mergedText || "");
      try {
        unloadSlaRunAnalysisFromText(unloadLastMergedText, unloadLastMergedHtml);
        unloadSlaAllRowsRaw = (unloadSlaAllRows || []).slice();
        unloadSlaAllRows = unloadFilterRowsByDayMode(
          unloadSlaAllRowsRaw,
          ymd,
          dayMode
        );
        unloadSlaCachedYmd = ymd;
      } catch (eSlaAuto) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 unload SLA] auto analyze failed", eSlaAuto);
        }
      }
      setUnloadStatus("완료 " + lastPage + "p · 수집됨");
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
      if (!quiet) {
        alert(
          "하차 수집 중 오류입니다.\n아래 HTTP 진단 칸에서 「칸 안 전체 선택」 후 내용을 저장해 알려 주세요."
        );
      }
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

    var btnDiagSel = document.createElement("button");
    btnDiagSel.type = "button";
    btnDiagSel.textContent = "칸 안 전체 선택";
    btnDiagSel.className = "yna4-pane-btn";

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
      var isDesktop =
        typeof window !== "undefined" && !!window.__YAN4_DESKTOP_SHELL__;
      /* Desktop: 로컬 페이지라 inbound 호스트가 없어도 세션 fetch로 하차 수집 가능 */
      var canStart =
        hasGmXhr &&
        (isDesktop ||
          isInbound ||
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
  /** WMS 가 긴 기간을 거부하므로 이 일수로 쪼개 조회 */
  var TOTE_WINDOW_DAYS = 3;
  /** 이동완료·진열완료 둘 다 기간에 잡히도록 각각 조회 후 병합 */
  var TOTE_SEARCH_DATE_TYPES = [
    "MOVING_COMPLETED",
    "MOVE_COMPLETED",
    "STOWING_COMPLETED",
  ];
  var toteApiRunning = false;
  var toteApiStopRequested = false;
  var toteApiRunSeq = 0;
  var toteLastRows = [];
  var toteLastMeta = null;

  function toteSetChartBtnEnabled(on) {
    var btn = document.getElementById(ROOT_ID + "-tote-api-chart");
    if (btn) btn.disabled = !on;
  }

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

  function gmPostJson(url, bodyObj, extraHeaders, timeoutMs) {
    void extraHeaders;
    void timeoutMs;
    var payload = JSON.stringify(bodyObj || {});
    return unloadGapInventoryRequest({
      url: url,
      method: "POST",
      referer: "https://inventory.coupang.com/tote-move/list",
      accept: "application/json, text/plain, */*",
      body: payload,
      contentType: "application/json",
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

  function toteYmdToDate(ymd) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(ymd || "").trim());
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function toteDateToYmd(d) {
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  /** tote-move/search 는 기간이 길면 success=false — N일 단위로 끊어 조회 */
  function toteSplitRangeWindows(startYmd, endYmd, days) {
    var span = Math.max(1, Number(days) || TOTE_WINDOW_DAYS);
    var start = toteYmdToDate(startYmd);
    var end = toteYmdToDate(endYmd);
    if (!start || !end) return [{ start: startYmd, end: endYmd }];
    if (start.getTime() > end.getTime()) {
      var swap = start;
      start = end;
      end = swap;
    }
    var out = [];
    var cur = new Date(start.getTime());
    while (cur.getTime() <= end.getTime()) {
      var winEnd = new Date(cur.getTime());
      winEnd.setDate(winEnd.getDate() + span - 1);
      if (winEnd.getTime() > end.getTime()) winEnd = new Date(end.getTime());
      out.push({ start: toteDateToYmd(cur), end: toteDateToYmd(winEnd) });
      cur = new Date(winEnd.getTime());
      cur.setDate(cur.getDate() + 1);
    }
    return out.length ? out : [{ start: startYmd, end: endYmd }];
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

  var toteChartInstance = null;

  /** "2026-08-31 05:12:33" · ISO · epoch 모두 허용 */
  function toteParseDateTime(raw) {
    if (raw == null || raw === "") return null;
    if (typeof raw === "number" && isFinite(raw)) {
      var dNum = new Date(raw);
      return isNaN(dNum.getTime()) ? null : dNum;
    }
    var s = String(raw).trim();
    if (!s) return null;
    var m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})[T ](\d{1,2}):(\d{1,2})/.exec(s);
    if (m) {
      return new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5])
      );
    }
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function toteHourBucketKey(d) {
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0") +
      " " +
      String(d.getHours()).padStart(2, "0")
    );
  }

  /**
   * 진열 조 구분 (진열완료 시각의 시(hour) 기준)
   *  0 주간조     08:00-16:59
   *  1 오후심야조 17:00-01:59(익일)
   *  2 심야조     02:00-07:59
   */
  var TOTE_SHIFTS = [
    {
      name: "주간조",
      span: "08:00-17:00",
      bg: "rgba(124,181,236,0.85)",
      border: "#4f9bd9",
      moveBg: "rgba(59,130,246,0.88)",
      stowBg: "rgba(147,197,253,0.85)",
    },
    {
      name: "오후심야조",
      span: "17:00-02:00",
      bg: "rgba(247,163,92,0.85)",
      border: "#e08339",
      moveBg: "rgba(234,88,12,0.88)",
      stowBg: "rgba(253,186,116,0.85)",
    },
    {
      name: "심야조",
      span: "02:00-08:00",
      bg: "rgba(144,133,222,0.85)",
      border: "#6c5fc7",
      moveBg: "rgba(109,40,217,0.88)",
      stowBg: "rgba(196,181,253,0.85)",
    },
  ];

  var TOTE_DOW_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

  function toteShiftIndex(d) {
    var h = d.getHours();
    if (h >= 8 && h < 17) return 0;
    if (h >= 17 || h < 2) return 1;
    return 2;
  }

  /** 근무일자: 08:00 시작 기준 — 00:00~07:59 은 전일로 귀속 */
  function toteBusinessDayKey(d) {
    var b = new Date(d.getTime());
    if (b.getHours() < 8) b.setDate(b.getDate() - 1);
    return (
      b.getFullYear() +
      "-" +
      String(b.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(b.getDate()).padStart(2, "0")
    );
  }

  function toteEmptyShiftCell() {
    return { moveTotes: 0, stowTotes: 0, moveQty: 0, stowQty: 0 };
  }

  function toteMoveCompletedAt(row) {
    return (
      toteParseDateTime(row && row.moveCompletedAt) ||
      toteParseDateTime(row && row.movedAt)
    );
  }

  function toteRowMergeKey(row) {
    return [
      String((row && row.toteBarcode) || "").trim(),
      String((row && row.moveCompletedAt) || (row && row.movedAt) || "").trim(),
      String((row && row.stowCompletedAt) || "").trim(),
      String((row && row.moveUserLoginId) || "").trim(),
      String((row && row.stowUserLoginId) || "").trim(),
      String((row && row.moveQuantity) || ""),
      String((row && row.stowQuantity) || ""),
    ].join("\x1e");
  }

  function toteEnsureDayCell(byDay, dayOrder, day) {
    if (!byDay[day]) {
      byDay[day] = TOTE_SHIFTS.map(toteEmptyShiftCell);
      dayOrder.push(day);
    }
  }

  function toteDayInRange(dayKey, startYmd, endYmd) {
    if (!dayKey) return false;
    if (!startYmd && !endYmd) return true;
    if (startYmd && dayKey < startYmd) return false;
    if (endYmd && dayKey > endYmd) return false;
    return true;
  }

  /**
   * 이동완료·진열완료 이중 집계 (조회 영업일 범위 안만)
   * - 이동완료: 영업일 기준 이동완료 시각이 조회기간인 수량만 (moveQuantity)
   * - 진열완료: 영업일 기준 진열완료 시각이 조회기간인 수량만 (stowQuantity)
   * - 진열만 있고 이동시각 없으면 이동에도 진열시각으로 포함(같은 영업일)
   */
  function toteAggregateStowByHour(rows, rangeOpt) {
    rangeOpt = rangeOpt || {};
    var startYmd = String(rangeOpt.startDate || "").trim();
    var endYmd = String(rangeOpt.endDate || "").trim();
    var byDay = Object.create(null);
    var dayOrder = [];
    var i, s, row, moveAt, stowAt, day, si, qty;
    var skipped = 0;
    var shiftTotals = TOTE_SHIFTS.map(function (sh) {
      return {
        name: sh.name,
        span: sh.span,
        moveTotes: 0,
        stowTotes: 0,
        moveQty: 0,
        stowQty: 0,
      };
    });
    rows = rows || [];
    for (i = 0; i < rows.length; i++) {
      row = rows[i] || {};
      stowAt = toteParseDateTime(row.stowCompletedAt);
      moveAt = toteMoveCompletedAt(row);
      if (!moveAt && !stowAt) {
        skipped++;
        continue;
      }
      /* 이동: 이동완료 영업일이 조회기간일 때만 */
      if (moveAt) {
        day = toteBusinessDayKey(moveAt);
        if (toteDayInRange(day, startYmd, endYmd)) {
          si = toteShiftIndex(moveAt);
          toteEnsureDayCell(byDay, dayOrder, day);
          qty = Number(row.moveQuantity);
          if (!isFinite(qty) || qty < 0) qty = 0;
          if (qty <= 0) {
            qty = Number(row.stowQuantity);
            if (!isFinite(qty) || qty < 0) qty = 0;
          }
          byDay[day][si].moveTotes += 1;
          byDay[day][si].moveQty += qty;
          shiftTotals[si].moveTotes += 1;
          shiftTotals[si].moveQty += qty;
        }
      } else if (stowAt) {
        /* 이동시각 없고 진열만 있음 → 진열 영업일이 조회기간이면 이동에도 포함 */
        day = toteBusinessDayKey(stowAt);
        if (toteDayInRange(day, startYmd, endYmd)) {
          si = toteShiftIndex(stowAt);
          toteEnsureDayCell(byDay, dayOrder, day);
          qty = Number(row.stowQuantity);
          if (!isFinite(qty) || qty < 0) qty = 0;
          byDay[day][si].moveTotes += 1;
          byDay[day][si].moveQty += qty;
          shiftTotals[si].moveTotes += 1;
          shiftTotals[si].moveQty += qty;
        }
      }
      /* 진열: 진열완료 영업일이 조회기간일 때만 */
      if (stowAt) {
        day = toteBusinessDayKey(stowAt);
        if (toteDayInRange(day, startYmd, endYmd)) {
          si = toteShiftIndex(stowAt);
          toteEnsureDayCell(byDay, dayOrder, day);
          qty = Number(row.stowQuantity);
          if (!isFinite(qty) || qty < 0) qty = 0;
          byDay[day][si].stowTotes += 1;
          byDay[day][si].stowQty += qty;
          shiftTotals[si].stowTotes += 1;
          shiftTotals[si].stowQty += qty;
        }
      }
    }
    dayOrder.sort();

    var totalMoveTotes = 0;
    var totalStowTotes = 0;
    var totalMoveQty = 0;
    var totalStowQty = 0;
    for (s = 0; s < shiftTotals.length; s++) {
      totalMoveTotes += shiftTotals[s].moveTotes;
      totalStowTotes += shiftTotals[s].stowTotes;
      totalMoveQty += shiftTotals[s].moveQty;
      totalStowQty += shiftTotals[s].stowQty;
    }

    var multiDay = dayOrder.length > 1;
    var labels = [];
    var labelColors = [];
    var datasets = [];
    if (multiDay) {
      for (i = 0; i < dayOrder.length; i++) {
        var dParts = dayOrder[i].split("-");
        var dow = new Date(
          Number(dParts[0]),
          Number(dParts[1]) - 1,
          Number(dParts[2])
        ).getDay();
        labels.push(
          dayOrder[i].slice(5).replace("-", "/") +
            "(" +
            TOTE_DOW_NAMES[dow] +
            ")"
        );
        labelColors.push(
          dow === 6 ? "#1d4ed8" : dow === 0 ? "#dc2626" : "#475569"
        );
      }
      for (s = 0; s < TOTE_SHIFTS.length; s++) {
        var moveArr = [];
        var stowArr = [];
        var moveToteArr = [];
        var stowToteArr = [];
        for (i = 0; i < dayOrder.length; i++) {
          moveArr.push(byDay[dayOrder[i]][s].moveQty);
          stowArr.push(byDay[dayOrder[i]][s].stowQty);
          moveToteArr.push(byDay[dayOrder[i]][s].moveTotes);
          stowToteArr.push(byDay[dayOrder[i]][s].stowTotes);
        }
        datasets.push({
          label: TOTE_SHIFTS[s].name + " 이동",
          metric: "move",
          qty: moveArr,
          totes: moveToteArr,
          bg: TOTE_SHIFTS[s].moveBg,
          border: TOTE_SHIFTS[s].border,
        });
        datasets.push({
          label: TOTE_SHIFTS[s].name + " 진열",
          metric: "stow",
          qty: stowArr,
          totes: stowToteArr,
          bg: TOTE_SHIFTS[s].stowBg,
          border: TOTE_SHIFTS[s].border,
        });
      }
    } else {
      var moveOne = [];
      var stowOne = [];
      var moveToteOne = [];
      var stowToteOne = [];
      for (s = 0; s < TOTE_SHIFTS.length; s++) {
        labels.push(TOTE_SHIFTS[s].name + " (" + TOTE_SHIFTS[s].span + ")");
        labelColors.push("#475569");
        moveOne.push(shiftTotals[s].moveQty);
        stowOne.push(shiftTotals[s].stowQty);
        moveToteOne.push(shiftTotals[s].moveTotes);
        stowToteOne.push(shiftTotals[s].stowTotes);
      }
      datasets.push({
        label: "이동완료",
        metric: "move",
        qty: moveOne,
        totes: moveToteOne,
        bg: TOTE_SHIFTS.map(function (sh) {
          return sh.moveBg;
        }),
        border: TOTE_SHIFTS.map(function (sh) {
          return sh.border;
        }),
      });
      datasets.push({
        label: "진열완료",
        metric: "stow",
        qty: stowOne,
        totes: stowToteOne,
        bg: TOTE_SHIFTS.map(function (sh) {
          return sh.stowBg;
        }),
        border: TOTE_SHIFTS.map(function (sh) {
          return sh.border;
        }),
      });
    }

    return {
      multiDay: multiDay,
      labels: labels,
      labelColors: labelColors,
      datasets: datasets,
      byDay: byDay,
      shiftTotals: shiftTotals,
      days: dayOrder,
      totalQty: totalStowQty,
      totalTotes: totalStowTotes,
      totalMoveTotes: totalMoveTotes,
      totalStowTotes: totalStowTotes,
      totalMoveQty: totalMoveQty,
      totalStowQty: totalStowQty,
      skipped: skipped,
      rowCount: rows.length,
      buckets: dayOrder.length,
      rangeStart: startYmd,
      rangeEnd: endYmd,
    };
  }

  function toteEnsureChartModal() {
    var id = ROOT_ID + "-tote-chart-modal";
    var existing = document.getElementById(id);
    if (existing) return existing;
    var overlay = document.createElement("div");
    overlay.id = id;
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "display:none",
      "background:rgba(15,23,42,.55)",
      "align-items:center",
      "justify-content:center",
      "padding:24px",
      "box-sizing:border-box",
      "font:13px/1.45 system-ui,Segoe UI,Malgun Gothic,sans-serif",
    ].join(";");
    var dialog = document.createElement("div");
    dialog.style.cssText = [
      "background:#fff",
      "border-radius:14px",
      "box-shadow:0 24px 64px rgba(15,23,42,.35)",
      "width:min(1080px,96vw)",
      "max-height:92vh",
      "display:flex",
      "flex-direction:column",
      "overflow:hidden",
    ].join(";");
    var head = document.createElement("div");
    head.style.cssText = [
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      "gap:12px",
      "padding:14px 18px",
      "border-bottom:1px solid #e2e8f0",
    ].join(";");
    var title = document.createElement("div");
    title.id = id + "-title";
    title.textContent = "Tote-Move 조별 이동/진열 유닛수";
    title.style.cssText = "font-weight:800;font-size:15px;color:#0f172a";
    var headRight = document.createElement("div");
    headRight.style.cssText = "display:flex;align-items:center;gap:8px";
    function mkTab(label, mode) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.id = id + "-tab-" + mode;
      b.style.cssText = [
        "border:1px solid #cbd5e1",
        "background:#fff",
        "border-radius:8px",
        "padding:6px 12px",
        "font-weight:700",
        "cursor:pointer",
      ].join(";");
      b.addEventListener("click", function () {
        toteChartViewMode = mode;
        toteApplyChartView();
      });
      return b;
    }
    headRight.appendChild(mkTab("막대그래프", "chart"));
    headRight.appendChild(mkTab("캘린더", "cal"));
    var close = document.createElement("button");
    close.type = "button";
    close.textContent = "닫기";
    close.style.cssText = [
      "border:1px solid #cbd5e1",
      "background:#f8fafc",
      "border-radius:8px",
      "padding:6px 14px",
      "font-weight:700",
      "cursor:pointer",
    ].join(";");
    headRight.appendChild(close);
    head.appendChild(title);
    head.appendChild(headRight);
    var body = document.createElement("div");
    body.style.cssText = "padding:16px 18px 20px;overflow:auto";
    var sub = document.createElement("div");
    sub.id = id + "-sub";
    sub.style.cssText =
      "margin-bottom:10px;font-size:12px;font-weight:700;color:#475569";
    var box = document.createElement("div");
    box.id = id + "-chartbox";
    box.style.cssText = "position:relative;height:min(60vh,460px)";
    var canvas = document.createElement("canvas");
    canvas.id = id + "-canvas";
    box.appendChild(canvas);
    var cal = document.createElement("div");
    cal.id = id + "-cal";
    cal.style.cssText = "display:none";
    body.appendChild(sub);
    body.appendChild(box);
    body.appendChild(cal);
    dialog.appendChild(head);
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    // 쉘 패널(z 2147483646)보다 뒤에 깔리지 않도록 body 마지막에 유지
    (document.body || document.documentElement).appendChild(overlay);

    function hide() {
      overlay.style.display = "none";
    }
    close.addEventListener("click", hide);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) hide();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.style.display === "flex") hide();
    });
    return overlay;
  }

  var toteChartViewMode = "chart";
  var toteLastAgg = null;

  function toteEscHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /** 근무일자별 조 실적(이동·진열 건수)을 월별 캘린더 격자로 렌더 */
  function toteRenderShiftCalendar(agg) {
    var host = document.getElementById(
      ROOT_ID + "-tote-chart-modal-cal"
    );
    if (!host) return;
    var days = (agg && agg.days) || [];
    if (!days.length) {
      host.innerHTML =
        '<div style="padding:24px;text-align:center;color:#64748b;font-weight:700">표시할 이동·진열 실적이 없습니다.</div>';
      return;
    }
    var byDay = agg.byDay || {};
    var months = [];
    var seenMonth = Object.create(null);
    var i, s;
    for (i = 0; i < days.length; i++) {
      var ym = days[i].slice(0, 7);
      if (!seenMonth[ym]) {
        seenMonth[ym] = 1;
        months.push(ym);
      }
    }
    months.sort();

    var shiftColors = TOTE_SHIFTS.map(function (sh) {
      return sh.border;
    });
    var html = "";
    for (var mi = 0; mi < months.length; mi++) {
      var ymStr = months[mi];
      var yNum = Number(ymStr.slice(0, 4));
      var mNum = Number(ymStr.slice(5, 7));
      var first = new Date(yNum, mNum - 1, 1);
      var lastDate = new Date(yNum, mNum, 0).getDate();
      var lead = first.getDay();

      var monthMove = 0;
      var monthStow = 0;
      for (i = 1; i <= lastDate; i++) {
        var kAll = ymStr + "-" + String(i).padStart(2, "0");
        if (byDay[kAll]) {
          for (s = 0; s < TOTE_SHIFTS.length; s++) {
            monthMove += byDay[kAll][s].moveQty || 0;
            monthStow += byDay[kAll][s].stowQty || 0;
          }
        }
      }

      html +=
        '<div style="margin:0 0 6px;font-weight:800;font-size:14px;color:#0f172a">' +
        yNum +
        "년 " +
        mNum +
        "월" +
        '<span style="margin-left:8px;font-size:12px;font-weight:700;color:#475569">이동 ' +
        monthMove.toLocaleString("en-US") +
        " · 진열 " +
        monthStow.toLocaleString("en-US") +
        "</span></div>";
      html +=
        '<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:18px">';
      html += "<thead><tr>";
      for (i = 0; i < 7; i++) {
        var hc = i === 6 ? "#1d4ed8" : i === 0 ? "#dc2626" : "#334155";
        html +=
          '<th style="width:14.28%;border:1px solid #e2e8f0;background:#f8fafc;padding:5px;font-size:12px;color:' +
          hc +
          '">' +
          TOTE_DOW_NAMES[i] +
          "</th>";
      }
      html += "</tr></thead><tbody><tr>";

      var col = 0;
      for (i = 0; i < lead; i++) {
        html +=
          '<td style="border:1px solid #e2e8f0;background:#fbfcfe;min-height:148px;height:148px"></td>';
        col++;
      }
      for (var dnum = 1; dnum <= lastDate; dnum++) {
        if (col === 7) {
          html += "</tr><tr>";
          col = 0;
        }
        var key = ymStr + "-" + String(dnum).padStart(2, "0");
        var dow = new Date(yNum, mNum - 1, dnum).getDay();
        var dayColor =
          dow === 6 ? "#1d4ed8" : dow === 0 ? "#dc2626" : "#0f172a";
        var cell = byDay[key];
        var dayMove = 0;
        var dayStow = 0;
        if (cell) {
          for (s = 0; s < TOTE_SHIFTS.length; s++) {
            dayMove += cell[s].moveQty || 0;
            dayStow += cell[s].stowQty || 0;
          }
        }
        html +=
          '<td style="border:1px solid #e2e8f0;vertical-align:top;min-height:148px;height:148px;padding:5px 5px 4px;background:' +
          (cell ? "#fff" : "#fbfcfe") +
          '">';
        html +=
          '<div style="font-weight:800;font-size:13px;color:' +
          dayColor +
          ';margin-bottom:4px;line-height:1.2">' +
          dnum +
          "</div>";
        if (cell && (dayMove || dayStow)) {
          for (s = 0; s < TOTE_SHIFTS.length; s++) {
            if (!cell[s].moveQty && !cell[s].stowQty) continue;
            html +=
              '<div style="margin:0 0 5px;padding:3px 4px;border-radius:5px;background:#f8fafc;border-left:3px solid ' +
              shiftColors[s] +
              '" title="' +
              toteEscHtml(
                TOTE_SHIFTS[s].name +
                  " · 이동완료 " +
                  cell[s].moveQty +
                  " · 진열완료 " +
                  cell[s].stowQty
              ) +
              '">' +
              '<div style="font-size:10px;font-weight:800;color:#0f172a;line-height:1.25;margin-bottom:1px">' +
              toteEscHtml(TOTE_SHIFTS[s].name) +
              "</div>" +
              '<div style="font-size:10px;font-weight:600;color:#1d4ed8;line-height:1.3">이동 ' +
              cell[s].moveQty.toLocaleString("en-US") +
              "</div>" +
              '<div style="font-size:10px;font-weight:600;color:#15803d;line-height:1.3">진열 ' +
              cell[s].stowQty.toLocaleString("en-US") +
              "</div>" +
              "</div>";
          }
        }
        html += "</td>";
        col++;
      }
      while (col < 7) {
        html +=
          '<td style="border:1px solid #e2e8f0;background:#fbfcfe;min-height:148px;height:148px"></td>';
        col++;
      }
      html += "</tr></tbody></table>";
    }
    host.innerHTML = html;
  }

  function toteApplyChartView() {
    var id = ROOT_ID + "-tote-chart-modal";
    var box = document.getElementById(id + "-chartbox");
    var cal = document.getElementById(id + "-cal");
    var tabChart = document.getElementById(id + "-tab-chart");
    var tabCal = document.getElementById(id + "-tab-cal");
    var isCal = toteChartViewMode === "cal";
    if (box) box.style.display = isCal ? "none" : "block";
    if (cal) cal.style.display = isCal ? "block" : "none";
    function paint(btn, active) {
      if (!btn) return;
      btn.style.background = active ? "#0f4c8a" : "#fff";
      btn.style.color = active ? "#fff" : "#334155";
      btn.style.borderColor = active ? "#0f4c8a" : "#cbd5e1";
    }
    paint(tabChart, !isCal);
    paint(tabCal, isCal);
    if (isCal) toteRenderShiftCalendar(toteLastAgg);
  }

  async function toteShowStowHourChart(agg, meta) {
    toteLastAgg = agg;
    var overlay = toteEnsureChartModal();
    var id = overlay.id;
    try {
      (document.body || document.documentElement).appendChild(overlay);
    } catch (eMove) {}
    overlay.style.display = "flex";
    var sub = document.getElementById(id + "-sub");
    if (sub) {
      sub.textContent =
        (meta && meta.token ? meta.token + " · " : "") +
        (meta && meta.range ? meta.range + " · " : "") +
        "수집 " +
        (agg.rowCount || 0) +
        "행 · 이동 " +
        (agg.totalMoveQty || 0).toLocaleString("en-US") +
        " · 진열 " +
        (agg.totalStowQty || 0).toLocaleString("en-US") +
        (agg.days && agg.days.length ? " · 근무일자 " + agg.days.length + "일" : "") +
        (agg.skipped ? " · 시각없음 " + agg.skipped + "건 제외" : "") +
        "\n" +
        (agg.shiftTotals || [])
          .map(function (t) {
            return (
              t.name +
              " 이동 " +
              (t.moveQty || 0).toLocaleString("en-US") +
              " / 진열 " +
              (t.stowQty || 0).toLocaleString("en-US")
            );
          })
          .join("  |  ") +
        "\n※ 조회기간 영업일만 · 이동=이동완료시각 · 진열=진열완료시각 · 08:00 시작";
      sub.style.whiteSpace = "pre-line";
    }
    var titleEl = document.getElementById(id + "-title");
    if (titleEl) {
      titleEl.textContent = agg.multiDay
        ? "Tote-Move 근무일자·조별 이동/진열 유닛수"
        : "Tote-Move 조별 이동/진열 유닛수";
    }
    if (!agg.buckets) {
      if (sub) {
        sub.textContent += " — 그릴 데이터 없음 (이동·진열 완료일시가 모두 비어 있음)";
      }
      toteApplyChartView();
      return;
    }
    await ensureChartJs();
    var canvas = document.getElementById(id + "-canvas");
    if (!canvas) return;
    if (toteChartInstance) {
      try {
        toteChartInstance.destroy();
      } catch (eD) {}
      toteChartInstance = null;
    }
    var chartDatasets = agg.datasets.map(function (d) {
      return {
        label: d.label,
        data: d.qty,
        toteData: d.totes,
        backgroundColor: d.bg,
        borderColor: d.border,
        borderWidth: 1,
        borderRadius: 4,
      };
    });
    toteChartInstance = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: { labels: agg.labels, datasets: chartDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", display: true },
          tooltip: {
            callbacks: {
              label: function (c) {
                var v = Number(c.parsed.y) || 0;
                var totes =
                  c.dataset.toteData && c.dataset.toteData[c.dataIndex];
                return (
                  c.dataset.label +
                  " " +
                  v.toLocaleString("en-US") +
                  (totes != null
                    ? " · 토트 " + Number(totes).toLocaleString("en-US") + "건"
                    : "")
                );
              },
            },
          },
        },
        scales: {
          x: {
            stacked: false,
            grid: { display: false },
            ticks: {
              color: function (c) {
                var colors = agg.labelColors || [];
                return colors[c.index] || "#475569";
              },
              font: function (c) {
                var colors = agg.labelColors || [];
                var isWeekend = colors[c.index] && colors[c.index] !== "#475569";
                return { weight: isWeekend ? "700" : "400" };
              },
            },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "유닛수" },
            ticks: { precision: 0 },
          },
        },
      },
    });
    toteApplyChartView();
  }

  async function toteFetchPage(payload, mySeq) {
    if (toteApiStopRequested || mySeq !== toteApiRunSeq) return null;
    var raw = await gmPostJson(TOTE_SEARCH_URL, payload, null, 25000);
    var parsed;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (eParse) {
      throw new Error("응답 파싱 실패 — inventory 로그인 확인");
    }
    if (!parsed || parsed.success !== true) {
      var msg = String(
        (parsed && (parsed.message || parsed.errorMessage)) || ""
      ).trim();
      throw new Error(
        "조회 거부 (" +
          payload.startDate +
          "~" +
          payload.endDate +
          ")" +
          (msg ? " — " + msg : " — 기간을 더 짧게")
      );
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

      var windows = toteSplitRangeWindows(
        startDate,
        endDate,
        TOTE_WINDOW_DAYS
      );
      var allRows = [];
      var seenSig = Object.create(null);
      var wi;
      var typeCount = TOTE_SEARCH_DATE_TYPES.length;
      var totalSteps = windows.length * typeCount;

      for (wi = 0; wi < windows.length; wi++) {
        if (toteApiStopRequested || mySeq !== toteApiRunSeq) break;
        var win = windows[wi];
        var ti;
        for (ti = 0; ti < typeCount; ti++) {
          if (toteApiStopRequested || mySeq !== toteApiRunSeq) break;
          var dateType = TOTE_SEARCH_DATE_TYPES[ti];
          var base = {
            searchDateType: dateType,
            startDate: win.start,
            endDate: win.end,
            status: null,
            isProblemReport: null,
            moveUserLoginId: "",
            stowUserLoginId: "",
            toteBarcode: "",
            page: 0,
            pageSize: TOTE_API_PAGE_SIZE,
          };
          var winLabel =
            "구간 " +
            (wi + 1) +
            "/" +
            windows.length +
            " · " +
            dateType +
            " (" +
            win.start +
            "~" +
            win.end +
            ") ";
          var p = 0;
          var totalPagesGuess = null;
          var stepBase = wi * typeCount + ti;

          while (!toteApiStopRequested && mySeq === toteApiRunSeq) {
            base.page = p;
            toteSetStatus(winLabel + "페이지 " + (p + 1) + " 요청…");

            var res = null;
            try {
              res = await toteFetchPage(base, mySeq);
            } catch (eFetch) {
              if (typeof console !== "undefined" && console.warn) {
                console.warn(
                  "[YAN4 tote-move] " + dateType + " 조회 실패",
                  eFetch
                );
              }
              toteSetStatus(
                winLabel +
                  "건너뜀 — " +
                  (eFetch && eFetch.message ? eFetch.message : eFetch)
              );
              break;
            }
            if (!res) break;
            var content = Array.isArray(res.content) ? res.content : [];

            if (typeof res.totalPages === "number") totalPagesGuess = res.totalPages;

            var i;
            for (i = 0; i < content.length; i++) {
              var row = content[i] || {};
              if (!toteBarcodeMatchesInclude(row.toteBarcode, includeToken)) {
                continue;
              }
              var sig = toteRowMergeKey(row);
              if (seenSig[sig]) continue;
              seenSig[sig] = 1;
              allRows.push(row);
            }

            var last = !!res.last;
            var pageFrac =
              totalPagesGuess && totalPagesGuess > 0
                ? (p + 1) / totalPagesGuess
                : Math.min(0.95, (p + 1) * 0.07);
            setProgressByStatusId(
              ROOT_ID + "-tote-api-status",
              ((stepBase + pageFrac) / totalSteps) * 100
            );
            toteSetStatus(
              winLabel +
                "페이지 " +
                (p + 1) +
                " · 누적 " +
                allRows.length +
                "행 (" +
                includeToken +
                ")"
            );

            if (last) break;
            if (totalPagesGuess != null && p + 1 >= totalPagesGuess) break;

            p++;
            await toteSleep(120);
          }

          if (ti + 1 < typeCount) await toteSleep(120);
        }

        if (wi + 1 < windows.length) await toteSleep(180);
      }

      if (toteApiStopRequested || mySeq !== toteApiRunSeq) {
        toteSetStatus("중지됨");
        return;
      }

      toteLastRows = allRows;
      toteLastMeta = {
        token: includeToken,
        range: startDate + " ~ " + endDate,
        startDate: startDate,
        endDate: endDate,
      };
      setProgressByStatusId(ROOT_ID + "-tote-api-status", 100);
      var agg = toteAggregateStowByHour(allRows, {
        startDate: startDate,
        endDate: endDate,
      });
      toteSetStatus(
        "완료 · " +
          allRows.length +
          "행 · 근무일자 " +
          agg.buckets +
          "일 · 이동 " +
          (agg.totalMoveQty || 0).toLocaleString("en-US") +
          " · 진열 " +
          (agg.totalStowQty || 0).toLocaleString("en-US") +
          " · " +
          (agg.shiftTotals || [])
            .map(function (t) {
              return (
                t.name +
                " 이" +
                (t.moveQty || 0).toLocaleString("en-US") +
                "/진" +
                (t.stowQty || 0).toLocaleString("en-US")
              );
            })
            .join(" / ")
      );
      toteSetChartBtnEnabled(allRows.length > 0);
      if (!allRows.length) return;
      try {
        await toteShowStowHourChart(agg, toteLastMeta);
      } catch (eChart) {
        toteSetStatus(
          "그래프 실패 — " + (eChart && eChart.message ? eChart.message : eChart)
        );
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 tote-move chart]", eChart, allRows[0]);
        }
        alert(
          "[YAN4] 그래프 실패: " +
            (eChart && eChart.message ? eChart.message : eChart)
        );
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

    var btnChart = document.createElement("button");
    btnChart.type = "button";
    btnChart.id = ROOT_ID + "-tote-api-chart";
    btnChart.textContent = "그래프";
    btnChart.title = "시간대별 진열수량 그래프 다시 보기";
    btnChart.className = "yna4-pane-btn";
    btnChart.disabled = true;

    btnRow.appendChild(btnRun);
    btnRow.appendChild(btnStop);
    btnRow.appendChild(btnChart);

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
    btnChart.addEventListener("click", function () {
      if (!toteLastRows.length) {
        toteSetStatus("먼저 작업 시작으로 조회하세요");
        return;
      }
      toteShowStowHourChart(
        toteAggregateStowByHour(toteLastRows, {
          startDate: toteLastMeta && toteLastMeta.startDate,
          endDate: toteLastMeta && toteLastMeta.endDate,
        }),
        toteLastMeta
      ).catch(function (eChart) {
        toteSetStatus(
          "그래프 실패 — " + (eChart && eChart.message ? eChart.message : eChart)
        );
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 tote-move chart]", eChart, toteLastRows[0]);
        }
        alert(
          "[YAN4] 그래프 실패: " +
            (eChart && eChart.message ? eChart.message : eChart)
        );
      });
    });
    toteSetChartBtnEnabled(toteLastRows.length > 0);
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
    if (typeof window !== "undefined" && window.__YAN4_DESKTOP_SHELL__) {
      return 0;
    }
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
  /** @deprecated 페이지 일괄 수집 대신 /inspect-work/list/excel 사용 */
  var INSPECT_WORK_DAY_PAGE_CAP = 200;
  var INSPECT_WORK_REQ_GAP_MS = 350;
  /** 정상종료 전체 엑셀 다운로드(네트워크 버튼과 동일) */
  var INSPECT_WORK_EXCEL_STATUS = "PASSED";
  var INSPECT_WORK_EXCEL_TIMEOUT_MS = 180000;

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

  function inspectWorkExcelUrl(ymdStart, ymdEnd, inspectWorkStatus) {
    return (
      "https://inbound.coupang.com/inspect-work/list/excel?" +
      inspectWorkQueryString(
        ymdStart,
        ymdEnd,
        inspectWorkStatus != null ? inspectWorkStatus : INSPECT_WORK_EXCEL_STATUS,
        ""
      )
    );
  }

  function inspectWorkBase64ToUint8Array(b64) {
    var bin = atob(String(b64 || ""));
    var bytes = new Uint8Array(bin.length);
    var i;
    for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  /**
   * 「해당일자 정상종료 전체 엑셀」과 동일 GET → ArrayBuffer (디스크 저장 없음).
   * Desktop/비-inbound: yan4InboundFetch · inbound 탭: fetch credentials.
   */
  async function inspectWorkFetchExcelArrayBuffer(ymdStart, ymdEnd, statusOpt) {
    var st =
      statusOpt != null && String(statusOpt).trim() !== ""
        ? String(statusOpt).trim()
        : INSPECT_WORK_EXCEL_STATUS;
    var url = inspectWorkExcelUrl(ymdStart, ymdEnd, st);
    var accept =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8";

    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function" &&
      (window.__YAN4_DESKTOP_SHELL__ ||
        !(
          location &&
          location.hostname &&
          String(location.hostname).indexOf("inbound.coupang.com") >= 0
        ))
    ) {
      return await new Promise(function (resolve, reject) {
        chrome.runtime.sendMessage(
          {
            type: "yan4InboundFetch",
            url: url,
            method: "GET",
            referer: INSPECT_WORK_LIST_REFERER,
            accept: accept,
            responseType: "arraybuffer",
          },
          function (msg) {
            if (chrome.runtime.lastError) {
              reject(
                new Error(chrome.runtime.lastError.message || "검품 엑셀 fetch 실패")
              );
              return;
            }
            if (!msg || msg.ok === false || (msg.status && msg.status >= 400)) {
              reject(
                new Error(
                  "검품 엑셀 HTTP " +
                    ((msg && msg.status) || "?") +
                    " — Coupang 로그인 확인"
                )
              );
              return;
            }
            try {
              var bytes = inspectWorkBase64ToUint8Array(msg.base64);
              if (!bytes || !bytes.byteLength) {
                reject(new Error("검품 엑셀 빈 응답"));
                return;
              }
              resolve(bytes.buffer);
            } catch (eDec) {
              reject(eDec);
            }
          }
        );
      });
    }

    if (typeof GM_xmlhttpRequest === "function" && !window.__YAN4_DESKTOP_SHELL__) {
      /* Tampermonkey 등: arraybuffer 지원 시 */
      try {
        var abGm = await new Promise(function (resolve, reject) {
          GM_xmlhttpRequest({
            method: "GET",
            url: url,
            anonymous: false,
            responseType: "arraybuffer",
            timeout: INSPECT_WORK_EXCEL_TIMEOUT_MS,
            headers: {
              Accept: accept,
              Referer: INSPECT_WORK_LIST_REFERER,
              "X-Requested-With": "XMLHttpRequest",
            },
            onload: function (r) {
              if (r.status < 200 || r.status >= 400) {
                reject(new Error("검품 엑셀 HTTP " + r.status));
                return;
              }
              var ab = r.response;
              if (!ab || !(ab instanceof ArrayBuffer) || ab.byteLength === 0) {
                reject(new Error("검품 엑셀 빈 응답"));
                return;
              }
              resolve(ab);
            },
            onerror: function () {
              reject(new Error("검품 엑셀 네트워크 오류"));
            },
            ontimeout: function () {
              reject(
                new Error(
                  "검품 엑셀 타임아웃(" + INSPECT_WORK_EXCEL_TIMEOUT_MS + "ms)"
                )
              );
            },
          });
        });
        return abGm;
      } catch (eGm) {
        /* fall through to fetch */
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4] inspect excel GM_xhr fallback → fetch", eGm);
        }
      }
    }

    var httpRes = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: accept,
        "X-Requested-With": "XMLHttpRequest",
        Referer: INSPECT_WORK_LIST_REFERER,
      },
    });
    if (!httpRes.ok) {
      throw new Error("검품 엑셀 HTTP " + httpRes.status);
    }
    var abFetch = await httpRes.arrayBuffer();
    if (!abFetch || !abFetch.byteLength) {
      throw new Error("검품 엑셀 빈 응답");
    }
    var peekHead = "";
    try {
      peekHead = new TextDecoder("utf-8").decode(
        abFetch.slice(0, Math.min(200, abFetch.byteLength))
      );
    } catch (ePk) {}
    if (/^\s*</.test(peekHead) && /html/i.test(peekHead)) {
      throw new Error("검품 엑셀 → HTML 응답(권한·로그인 확인)");
    }
    return abFetch;
  }

  function inspectWorkExcelHeaderKey(s) {
    return String(s == null ? "" : s)
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, "")
      .trim()
      .toLowerCase();
  }

  function inspectWorkFindExcelColMap(headerRow) {
    if (!headerRow || !headerRow.length) return null;
    var idx = {
      inspectNo: -1,
      unloadDt: -1,
      ibc: -1,
      poExt: -1,
      vendor: -1,
      skuId: -1,
      barcode: -1,
      productName: -1,
      status: -1,
      inboundQty: -1,
      priority: -1,
    };
    var c, key;
    for (c = 0; c < headerRow.length; c++) {
      key = inspectWorkExcelHeaderKey(headerRow[c]);
      if (!key) continue;
      if (key === "검품번호" || key === "inspectworkno" || key === "inspectno")
        idx.inspectNo = c;
      else if (key === "하차일시" || key.indexOf("하차") === 0)
        idx.unloadDt = c;
      else if (key === "ibc") idx.ibc = c;
      else if (key === "외부발주번호" || key.indexOf("외부발주") >= 0)
        idx.poExt = c;
      else if (key === "업체" || key === "vendor") idx.vendor = c;
      else if (
        key === "skuid" ||
        key === "sku" ||
        key === "sku아이디" ||
        key.replace(/[^a-z0-9가-힣]/g, "") === "skuid"
      )
        idx.skuId = c;
      else if (key === "상품바코드" || key.indexOf("바코드") >= 0)
        idx.barcode = c;
      else if (key === "상품명" || key === "productname") idx.productName = c;
      else if (key === "상태" || key === "status") idx.status = c;
      else if (key === "입고수량") idx.inboundQty = c;
      else if (key === "우선순위" || key === "priority") idx.priority = c;
    }
    if (idx.skuId < 0 && idx.inspectNo < 0) return null;
    return idx;
  }

  function inspectWorkExcelCell(row, colIdx) {
    if (colIdx == null || colIdx < 0 || !row) return "";
    return inspectWorkNormText(row[colIdx]);
  }

  /** InspectWorkList.xlsx → HTML 파싱과 동일 shape 행 배열 */
  function inspectWorkParseRowsFromExcelBuffer(buf) {
    if (typeof XLSX === "undefined") {
      throw new Error("XLSX 라이브러리 없음(vendor/xlsx)");
    }
    var u8 =
      buf instanceof ArrayBuffer
        ? new Uint8Array(buf)
        : buf instanceof Uint8Array
          ? buf
          : null;
    if (!u8 || !u8.length) return [];
    var wb = XLSX.read(u8, { type: "array", cellText: true, cellDates: true });
    var sn = wb.SheetNames && wb.SheetNames[0];
    if (!sn) return [];
    var sh = wb.Sheets[sn];
    if (!sh) return [];
    var aoa = XLSX.utils.sheet_to_json(sh, {
      header: 1,
      defval: "",
      raw: false,
    });
    if (!aoa || !aoa.length) return [];

    var headerRowIdx = 0;
    var colMap = null;
    var hi;
    for (hi = 0; hi < Math.min(8, aoa.length); hi++) {
      colMap = inspectWorkFindExcelColMap(aoa[hi]);
      if (colMap) {
        headerRowIdx = hi;
        break;
      }
    }
    if (!colMap) {
      throw new Error(
        "검품 엑셀 헤더를 찾지 못함(검품번호/SKU ID). 시트 형식 확인"
      );
    }

    var rows = [];
    var r, row, sku;
    for (r = headerRowIdx + 1; r < aoa.length; r++) {
      row = aoa[r];
      if (!row || !row.length) continue;
      sku = inspectWorkExcelCell(row, colMap.skuId);
      if (!sku && !inspectWorkExcelCell(row, colMap.inspectNo)) continue;
      rows.push({
        inspectNo: inspectWorkExcelCell(row, colMap.inspectNo),
        unloadDt: inspectWorkExcelCell(row, colMap.unloadDt),
        ibc: inspectWorkExcelCell(row, colMap.ibc),
        poExt: inspectWorkExcelCell(row, colMap.poExt),
        vendor: inspectWorkExcelCell(row, colMap.vendor),
        skuId: sku,
        priority: inspectWorkExcelCell(row, colMap.priority),
        barcode: inspectWorkExcelCell(row, colMap.barcode),
        productName: inspectWorkExcelCell(row, colMap.productName),
        status: inspectWorkExcelCell(row, colMap.status),
        inboundQty: inspectWorkExcelCell(row, colMap.inboundQty),
      });
    }
    return rows;
  }

  async function inspectWorkFetchDayRowsViaExcel(ymdStart, ymdEnd, statusOpt) {
    var ab = await inspectWorkFetchExcelArrayBuffer(
      ymdStart,
      ymdEnd,
      statusOpt
    );
    return inspectWorkParseRowsFromExcelBuffer(ab);
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
    var pageCap =
      cfg && cfg.pageCap != null
        ? Math.max(1, Number(cfg.pageCap) || INSPECT_WORK_PAGE_CAP)
        : INSPECT_WORK_PAGE_CAP;
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
    lastUi = Math.min(Math.max(1, lastUi), pageCap);
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
      var pr = inspectWorkParseRowsFromHtml(pageHtml);
      var j;
      for (j = 0; j < pr.length; j++) allRows.push(pr[j]);
      if (cfg && typeof cfg.afterPage === "function") {
        try {
          cfg.afterPage(apiP, pr.length, allRows.length);
        } catch (eAp0) {}
      }
    }

    await wPagedHtmlExtendFetchMore({
      nextPageZeroBased: totalApi,
      maxPageExclusive: pageCap,
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
      afterPage:
        cfg && typeof cfg.afterPage === "function"
          ? function (pz, n) {
              cfg.afterPage(pz, n, allRows.length);
            }
          : null,
    });

    if (cfg) {
      cfg._fetchedPageHint = totalApi;
      cfg._pageCap = pageCap;
      cfg._hitPageCap = allRows.length > 0 && totalApi >= pageCap;
    }
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
  /** @deprecated 통합은 날짜 일괄 검품+조인으로 대체 · 상수만 호환용 */
  var SKU_INSPECT_LOOKUP_CAP = 200;

  function inspectWorkNormalizeSkuKey(s) {
    return String(s || "").replace(/\s+/g, "").trim();
  }

  function inspectWorkBuildSkuRowMap(rows) {
    var map = Object.create(null);
    var i, row, k;
    for (i = 0; i < (rows || []).length; i++) {
      row = rows[i];
      k = inspectWorkNormalizeSkuKey(row && row.skuId);
      if (!k) continue;
      if (!map[k]) map[k] = [];
      map[k].push(row);
    }
    return map;
  }

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

  function purchaseOrderPoStatusIsCanceled(statusRaw) {
    var t = inspectWorkNormText(statusRaw == null ? "" : statusRaw).trim();
    if (!t) return false;
    var u = t.toUpperCase();
    if (u === "CANCELED" || u === "CANCEL" || u === "CANCELLED") return true;
    if (t === "취소") return true;
    return /취소/.test(t);
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
    var statusBySku = {};
    var qtyRuleDetected = false;
    function addSku(raw) {
      var s = inspectWorkNormText(raw).replace(/\s+/g, "").trim();
      if (purchaseOrderIsLikelySkuId(s)) uniq[s] = true;
    }
    function addDiffSku(
      raw,
      orderQty,
      returnQty,
      inboundQty,
      productName,
      lineStatus
    ) {
      var s = inspectWorkNormText(raw).replace(/\s+/g, "").trim();
      if (!purchaseOrderIsLikelySkuId(s)) return;
      diffUniq[s] = true;
      if (!qtyBySku[s]) qtyBySku[s] = { orderQty: 0, returnQty: 0, inboundQty: 0 };
      if (isFinite(orderQty)) qtyBySku[s].orderQty += Number(orderQty);
      if (isFinite(returnQty)) qtyBySku[s].returnQty += Number(returnQty);
      if (isFinite(inboundQty)) qtyBySku[s].inboundQty += Number(inboundQty);
      var nm = inspectWorkNormText(productName || "").trim();
      if (nm && !nameBySku[s]) nameBySku[s] = nm;
      var st = inspectWorkNormText(lineStatus == null ? "" : lineStatus).trim();
      if (st) statusBySku[s] = st;
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
        var idxStatus = unloadGapFindCol(headers, ["상태", "발주상태"]);
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
          var statusRaw =
            idxStatus >= 0 && row.length > idxStatus ? row[idxStatus] : "";
          if (!isFinite(orderQty) || !isFinite(returnQty) || !isFinite(inboundQty))
            continue;
          var diff = orderQty - (returnQty + inboundQty);
          if (Math.abs(diff) > 0.000001)
            addDiffSku(
              skuRaw,
              orderQty,
              returnQty,
              inboundQty,
              nameRaw,
              statusRaw
            );
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
      statusBySku: statusBySku,
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

  /**
   * 목록 합계 기준 — 상세/검품 생략 대상
   * - 발주 − (회송+입고) = 0 또는
   * - 발주 − 진열완료 = 0
   * 수량 파싱 실패 시 false(상세 유지)
   */
  function purchaseOrderListRowQtySettled(prow) {
    var orderQty = unloadGapNum(prow && prow.orderQty);
    var returnQty = unloadGapNum(prow && prow.returnQty);
    var inboundQty = unloadGapNum(prow && prow.inboundQty);
    var displayOkQty = unloadGapNum(prow && prow.displayOkQty);
    if (!isFinite(orderQty)) return false;
    var inboundSettled =
      isFinite(returnQty) &&
      isFinite(inboundQty) &&
      Math.abs(orderQty - (returnQty + inboundQty)) <= 0.000001;
    var displaySettled =
      isFinite(displayOkQty) &&
      Math.abs(orderQty - displayOkQty) <= 0.000001;
    return inboundSettled || displaySettled;
  }

  function purchaseOrderListRowNeedsDetail(prow) {
    return !purchaseOrderListRowQtySettled(prow);
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
          inspectWorkTsvEscape(
            r.poCanceled ? "취소건" : r.inspectStatus
          ),
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

    var btnPipeline = document.createElement("button");
    btnPipeline.type = "button";
    btnPipeline.textContent = "작업 시작";
    btnPipeline.className = "yna4-pane-btn yna4-pane-btn--primary";
    btnPipeline.title =
      "발주 목록→수량 차이 발주만 상세→검품(정상종료 엑셀 1회) 조인→통합 결과\n제외: 발주=(회송+입고) 또는 발주=진열완료";

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
      function isPoCanceledPipelineRow(r) {
        return !!(r && r.poCanceled);
      }
      function isMimaeipRow(r) {
        if (isPoCanceledPipelineRow(r)) return false;
        if (!rowHasInspectValue(r)) return false;
        var inA = parseNumLike(r ? r.inboundQtyA : "");
        var reA = parseNumLike(r ? r.returnQty : "");
        return isFinite(inA) && isFinite(reA) && Math.abs(inA) < 0.000001 && Math.abs(reA) < 0.000001;
      }
      function pipelineInspectStatusLabel(r) {
        if (isPoCanceledPipelineRow(r)) return "취소건";
        var isMimaeip = isMimaeipRow(r);
        return (
          (String(r.inspectStatus || "").trim() || "") +
          (isMimaeip
            ? (String(r.inspectStatus || "").trim() ? " · " : "") + "미매입"
            : "")
        );
      }
      var rows = (pl.mergedRows || []).slice();
      rows.sort(function (a, b) {
        var ca = isPoCanceledPipelineRow(a) ? 1 : 0;
        var cb = isPoCanceledPipelineRow(b) ? 1 : 0;
        if (ca !== cb) return ca - cb;
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
      var rowsCanceledOnly = rows.filter(isPoCanceledPipelineRow);
      var rowsSuspectOnly = rows.filter(function (r) {
        return (
          !isNoInspectHistoryRow(r) &&
          !isPoCanceledPipelineRow(r) &&
          !isMimaeipRow(r)
        );
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
            pipelineInspectStatusLabel(r),
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
        var poCanceled = isPoCanceledPipelineRow(r);
        var inspectStatusText = pipelineInspectStatusLabel(r);
        tr.push(
          "<tr style='" +
            (poCanceled
              ? "background:#f1f5f9;color:#64748b;"
              : noB
                ? "background:#fafafa;"
                : isMimaeip
                  ? "background:#fff7ed;"
                  : "") +
            "'>" +
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
          " · 취소 " +
          rowsCanceledOnly.length +
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

      /* 검품: 정상종료(PASSED) 전체 엑셀 1회 · 발주상태 필터 없음 */
      var poStatApi = "";
      var qsPo = purchaseOrderQueryString(startY, endY, poStatApi);
      var bStVal = INSPECT_WORK_EXCEL_STATUS;

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

        var poListRowsAllCount = poListRows.length;
        var poListRowsGap = [];
        var poSkipIdx;
        for (poSkipIdx = 0; poSkipIdx < poListRows.length; poSkipIdx++) {
          if (purchaseOrderListRowNeedsDetail(poListRows[poSkipIdx])) {
            poListRowsGap.push(poListRows[poSkipIdx]);
          }
        }
        var poListSkippedSettled = poListRowsAllCount - poListRowsGap.length;
        poListRows = poListRowsGap;

        if (!poListRows.length) {
          setStatus(
            "통합 · 수량 차이 발주 없음 (목록 " +
              poListRowsAllCount +
              "건 · 완료로 판단 " +
              poListSkippedSettled +
              "건 제외)"
          );
          setProgressByStatusId(statusId, 0);
          return;
        }

        setProgressByStatusId(statusId, 15);
        setStatus(
          "통합 2단계 · 발주 상세(" +
            Math.min(poListRows.length, PURCHASE_ORDER_ITEM_FETCH_CAP) +
            "/" +
            poListRows.length +
            ")" +
            (poListSkippedSettled
              ? " · 목록 " +
                poListRowsAllCount +
                "→차이 " +
                poListRows.length
              : "") +
            "…"
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
            var statusBySku =
              itemParsed && itemParsed.statusBySku ? itemParsed.statusBySku : {};
            var si;
            for (si = 0; si < skArr.length; si++) {
              var skid = skArr[si];
              if (!skuOrigin[skid]) {
                skuOrigin[skid] = {
                  ext: {},
                  pid: {},
                  pidStatus: {},
                  itemStatus: {},
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
              skuOrigin[skid].pidStatus[String(pid)] = inspectWorkNormText(
                prow.poStatus || ""
              );
              var stLine = inspectWorkNormText(
                statusBySku[skid] == null ? "" : statusBySku[skid]
              ).trim();
              if (stLine) skuOrigin[skid].itemStatus[String(pid)] = stLine;
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
        var skuIter = skuKeysUnsorted;

        setProgressByStatusId(statusId, 58);
        setStatus(
          "통합 3단계 · 검품 엑셀(정상종료 " +
            bY +
            ") 다운로드·파싱… · 발주 SKU " +
            skuIter.length
        );

        var dayInspectRows = await inspectWorkFetchDayRowsViaExcel(
          bY,
          bY,
          bStVal
        );
        var inspectBySku = inspectWorkBuildSkuRowMap(dayInspectRows);
        var inspectDayRowCount = dayInspectRows.length;

        setProgressByStatusId(statusId, 72);
        setStatus(
          "통합 3단계 · 검품 엑셀 " +
            inspectDayRowCount +
            "건 ↔ SKU " +
            skuIter.length +
            " 조인…"
        );

        var merged = [];
        var si2;
        for (si2 = 0; si2 < skuIter.length; si2++) {
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
          var poCanceledSku = false;
          var poKeys = Object.keys(ori.pid || {});
          var pki;
          var psMap = ori.pidStatus || {};
          var isMap = ori.itemStatus || {};
          for (pki = 0; pki < poKeys.length; pki++) {
            var pk = poKeys[pki];
            if (
              purchaseOrderPoStatusIsCanceled(psMap[pk]) ||
              purchaseOrderPoStatusIsCanceled(isMap[pk])
            ) {
              poCanceledSku = true;
              break;
            }
          }

          var brList =
            inspectBySku[inspectWorkNormalizeSkuKey(skuQ)] || [];

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
              poCanceled: poCanceledSku,
            });
          }

          if (!brList.length) {
            pushMerged(null);
          } else {
            var bi;
            for (bi = 0; bi < brList.length; bi++)
              pushMerged(brList[bi]);
          }

          if (si2 % 40 === 0 || si2 + 1 === skuIter.length) {
            setProgressByStatusId(
              statusId,
              72 +
                (26 * (si2 + 1)) /
                  Math.max(1, skuIter.length || 1)
            );
          }
        }

        var tsvP = mergedPoSkuInspectRowsToTsv(merged);
        var summary =
          "발주 목록 " +
          poListRowsAllCount +
          "→차이 " +
          poListRows.length +
          (poListSkippedSettled
            ? "(완료제외 " + poListSkippedSettled + ")"
            : "") +
          " · 상세 처리 " +
          Math.min(poListRows.length, PURCHASE_ORDER_ITEM_FETCH_CAP) +
          (capped ? "+" : "") +
          " · SKU " +
          skuKeysUnsorted.length +
          " · 검품엑셀 " +
          inspectDayRowCount +
          "건";

        try {
          window.__YAN4_PO_SKU_PIPELINE_LAST__ = {
            tsv: tsvP,
            mergedRows: merged,
            summary: summary,
            poRowsCount: poListRows.length,
            poRowsListCount: poListRowsAllCount,
            poRowsSkippedSettled: poListSkippedSettled,
            skuCountDistinct: skuKeysUnsorted.length,
            inspectDayRowCount: inspectDayRowCount,
            inspectSource: "excel-PASSED",
            fetchedAt: new Date().toISOString(),
          };
        } catch (eSav) {}

        await new Promise(function (resolve) {
          unloadCopyPlainViaBestEffort(tsvP, function () {
            resolve();
          });
        });

        var warnMsg = "";
        if (capped || poSkuPipelineStopRequested) {
          var warns = "";
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
    hostEl.appendChild(btnRow);
    hostEl.appendChild(status);

    refreshButtons();
  }

  /** Gross HTP 차트: Chart.js는 manifest vendor/chart.umd.min.js (MV3 원격 CDN 로드 금지). */
  function ensureChartJs() {
    if (typeof Chart !== "undefined") return Promise.resolve();
    return Promise.reject(
      new Error("Chart.js 없음 — 확장 vendor/chart.umd.min.js 확인")
    );
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
      canvas.setAttribute("aria-label", "Gross HTP");
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

      function ymdKeyFromYmd(ymd) {
        return String(ymd || "").replace(/-/g, "");
      }

      function buildPayload(dayOffset) {
        var ymd = unloadYmdAddDays(
          unloadCalendarYmdNow(),
          -(dayOffset || 0)
        );
        var nextYmd = unloadYmdAddDays(ymd, 1);
        return {
          rangeType: "HOURLY",
          startHour: "7",
          endHour: "30",
          rangeStart: ymdKeyFromYmd(ymd) + "07",
          rangeEnd: ymdKeyFromYmd(nextYmd) + "06",
          centerIdList: [cfsActiveCenterId("1007")],
          processType: "IB_OVERALL",
          pickReceiveType: "ALL",
          isAgv: "",
          targetUphType: "FIXED",
          daysAgo: "1",
          weeksAgo: "1",
          fixedTargetUph: String(readTarget()),
        };
      }

      var TARGET_STORAGE_KEY = "yna4_gross_htp_target_v1";
      var TARGET_DEFAULT = 200;
      function normalizeTarget(v) {
        var n = Number(String(v == null ? "" : v).trim());
        if (!isFinite(n) || n <= 0) return null;
        return Math.min(Math.round(n), 9999);
      }
      function readTarget() {
        try {
          var n = normalizeTarget(localStorage.getItem(TARGET_STORAGE_KEY));
          if (n != null) return n;
        } catch (eT) {}
        return TARGET_DEFAULT;
      }
      function centerLabelText() {
        var id = cfsActiveCenterId("1007");
        var api = window.__CFS_CENTER__;
        var name = api && typeof api.name === "function" ? api.name(id) : id;
        return name === id ? id : name + " (" + id + ")";
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
        return tx;
      }

      var toolbarRight = document.createElement("div");
      toolbarRight.className = "yna4-gross-uph-toolbar-right";
      var legendWrap = document.createElement("div");
      legendWrap.className = "yna4-gross-uph-legend";
      legendWrap.setAttribute("aria-hidden", "true");
      var legendTargetText = addGrossUphLegendItem(
        legendWrap,
        "목표 " + readTarget(),
        "#DF5353",
        true
      );
      addGrossUphLegendItem(legendWrap, "선택일", "#7cb5ec", false);
      addGrossUphLegendItem(legendWrap, "1일 전", "#434348", true);
      toolbarRight.appendChild(legendWrap);
      var centerTag = document.createElement("span");
      centerTag.className = "yna4-gross-uph-center";
      centerTag.textContent = centerLabelText();
      centerTag.title = "상단 센터 전환 기준";

      var targetWrap = document.createElement("label");
      targetWrap.className = "yna4-gross-uph-target";
      targetWrap.title = "목표 HTP (빨간 점선). 바꾸면 바로 반영";
      var targetLab = document.createElement("span");
      targetLab.textContent = "목표";
      var inpTarget = document.createElement("input");
      inpTarget.type = "number";
      inpTarget.min = "1";
      inpTarget.max = "9999";
      inpTarget.step = "10";
      inpTarget.className = "yna4-gross-uph-target-input";
      inpTarget.value = String(readTarget());
      targetWrap.appendChild(targetLab);
      targetWrap.appendChild(inpTarget);

      rowDate.appendChild(dayToday);
      rowDate.appendChild(dayYest);
      rowDate.appendChild(btnFetch);
      rowDate.appendChild(centerTag);
      rowDate.appendChild(targetWrap);
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
      var refetchAfter = false;

      /** 응답의 목표값 대신 사용자가 정한 목표로 그림 */
      async function drawWithTarget(json) {
        var target = readTarget();
        legendTargetText.textContent = "목표 " + target;
        await renderGrossUphChart(
          chartBox,
          Object.assign({}, json, { fixedTargetUph: target }),
          hostEl,
          "_yna4GrossChartCard"
        );
      }

      async function runFetch(auto) {
        if (fetching) {
          if (auto) refetchAfter = true;
          return;
        }
        fetching = true;
        btnFetch.disabled = true;
        var dayOff = inpYest.checked ? 1 : 0;
        var fetchLabel = "조회";
        btnFetch.textContent = "조회 중…";
        centerTag.textContent = centerLabelText();
        try {
          var reqBody = buildPayload(dayOff);
          var json = await postGrossUph(reqBody);
          lastJson = json;
          await drawWithTarget(json);
        } catch (eFetch) {
          chartBox.textContent = "";
          lastJson = null;
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Gross UPH]", eFetch);
          }
          var msg = eFetch && eFetch.message ? eFetch.message : String(eFetch);
          if (auto) {
            chartBox.textContent = "센터 전환 후 조회 실패 · " + msg;
          } else {
            alert("[Gross UPH] " + msg);
          }
        } finally {
          fetching = false;
          btnFetch.disabled = false;
          btnFetch.textContent = fetchLabel;
          if (refetchAfter) {
            refetchAfter = false;
            runFetch(true);
          }
        }
      }

      btnFetch.addEventListener("click", function () {
        runFetch(false);
      });

      inpTarget.addEventListener("change", function () {
        var n = normalizeTarget(inpTarget.value);
        if (n == null) n = readTarget();
        inpTarget.value = String(n);
        try {
          localStorage.setItem(TARGET_STORAGE_KEY, String(n));
        } catch (eSv) {}
        legendTargetText.textContent = "목표 " + n;
        if (lastJson) drawWithTarget(lastJson);
      });

      // 상단 센터 전환 → 새 센터 기준으로 다시 조회 (이미 그래프를 본 경우)
      window.addEventListener("cfs-center-changed", function () {
        centerTag.textContent = centerLabelText();
        if (lastJson || fetching) {
          runFetch(true);
        } else {
          chartBox.textContent = "";
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
      if (yna4GateIsExtensionEnv()) {
        try {
          return chrome.runtime.getURL("media/stow-watch-alarm.wav");
        } catch (eExt) {}
      }
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
    inpStart.value = ymdFromDelta(-1);
    inpStart.style.marginRight = "3px";
    var inpEnd = document.createElement("input");
    inpEnd.type = "date";
    inpEnd.id = ROOT_ID + "-stow-watch-end";
    inpEnd.className = "yna4-pane-inp";
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
    if (
      !yna4GateIsExtensionEnv() &&
      typeof GM_setValue === "function" &&
      typeof GM_getValue === "function"
    ) {
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

  /** Page3 tote barcode viewer: Q=prev, E=next (not while typing in inputs). */
  var SHELL_PAGE3_BARCODE_KEY_PREV = "q";
  var SHELL_PAGE3_BARCODE_KEY_NEXT = "e";

  function shellPage3BarcodeNavKeyActive(e) {
    var t = e && e.target;
    if (!t) return true;
    var tag = String(t.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
    if (t.isContentEditable) return false;
    return true;
  }

  /** 재고이관 현황 GC → 토트바코드 (page 3) */
  var XFER_OP_LIST_REFERER =
    "https://inbound.coupang.com/transfer/admin/operation/list";
  var XFER_OP_PAGING_BASE =
    "https://inbound.coupang.com/transfer/admin/operation/paging";
  var XFER_OP_SAME_CENTER_PAGING_BASE =
    "https://inbound.coupang.com/transfer/admin/operation/same-center/paging";
  var XFER_OP_TO_CENTER = "YAN4";
  function cfsActiveCenterCode(fallback) {
    var api = window.__CFS_CENTER__;
    if (api && typeof api.activeId === "function") {
      var name = api.name(api.activeId());
      if (name && !/^\d+$/.test(name)) return name;
    }
    return fallback;
  }
  function cfsActiveCenterId(fallback) {
    var api = window.__CFS_CENTER__;
    var id = api && typeof api.activeId === "function" ? api.activeId() : "";
    return /^\d+$/.test(String(id || "")) ? String(id) : fallback;
  }
  var XFER_OP_SEARCH_DATE_TYPE = "PICKING_START_DATE";
  var XFER_OP_DATE_LOOKBACK_DAYS = 31;
  var XFER_OP_PAGE_CAP = 40;
  /** 이관현황 paging 응답 — UI 2페이지 = API page=1 (0-based) */
  var XFER_OP_ROWS_PER_PAGE = 20;
  var XFER_OP_DELAY_MS = 140;
  var XFER_SKU_SEARCH_URL =
    "https://inventory.coupang.com/async/sku/search";
  var XFER_SKU_LIST_REFERER = "https://inventory.coupang.com/sku/list";
  /** 자동화센터도우미.html drawBarcode 와 동일 (토트·상품 공통) */
  var PAGE3_JSBARCODE_OPTS = {
    format: "CODE128",
    displayValue: false,
    width: 3,
    height: 130,
    margin: 10,
  };
  var PAGE3_BARCODE_SVG_HEIGHT_PX = 130;

  function page3NormalizeBarcodeSvg(svgEl) {
    if (!svgEl) return;
    svgEl.style.height = PAGE3_BARCODE_SVG_HEIGHT_PX + "px";
    svgEl.style.width = "auto";
    svgEl.style.maxWidth = "100%";
    svgEl.style.display = "block";
    svgEl.setAttribute("height", String(PAGE3_BARCODE_SVG_HEIGHT_PX));
  }
  var xferGcPipelineStop = false;
  var xferGcPipelineBusy = false;

  function xferOpBuildSkuSearchBody(barcode) {
    var p = new URLSearchParams();
    p.set("skuId", "");
    p.set("externalSkuId", "");
    p.set("barcode", String(barcode || "").trim());
    p.set("unitDescription", "");
    p.set("vendorName", "");
    p.set("standAlone", "");
    p.set("skuPrep", "");
    p.set("andonSku", "");
    p.set("startAt", "");
    p.set("endAt", "");
    p.set("page", "0");
    p.set("fixCharacter", "false");
    p.set("agentType", "");
    p.set("size", "20");
    return p.toString();
  }

  async function xferOpFetchSkuFromInventory(barcode) {
    var bc = String(barcode || "").trim();
    if (!bc) return { productName: "" };
    var text = await unloadGapInventoryRequest({
      url: XFER_SKU_SEARCH_URL,
      method: "POST",
      referer: XFER_SKU_LIST_REFERER,
      accept: "*/*",
      body: xferOpBuildSkuSearchBody(bc),
      contentType: "application/x-www-form-urlencoded;charset=UTF-8",
    });
    var data = JSON.parse(text);
    if (
      !data ||
      !data.success ||
      !data.result ||
      !data.result.content ||
      !data.result.content.length
    ) {
      return { productName: "" };
    }
    var item = data.result.content[0];
    return {
      productName: String(item.name || item.unitDescription || "").trim(),
    };
  }

  function xferOpDefaultDateRange() {
    var end = new Date();
    var start = new Date(end.getTime());
    start.setDate(start.getDate() - XFER_OP_DATE_LOOKBACK_DAYS);
    return { startYmd: unloadYmdFromDate(start), endYmd: unloadYmdFromDate(end) };
  }

  function xferOpGmGet(url) {
    var hdr = {
      Accept: "text/html, */*; q=0.01",
      Referer: XFER_OP_LIST_REFERER,
      "X-Requested-With": "XMLHttpRequest",
    };
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    ) {
      return new Promise(function (resolve, reject) {
        chrome.runtime.sendMessage(
          {
            type: "yan4InboundFetch",
            url: url,
            method: "GET",
            referer: hdr.Referer,
            accept: hdr.Accept,
          },
          function (res) {
            if (chrome.runtime.lastError) {
              gmGet(url, hdr).then(resolve, reject);
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
            gmGet(url, hdr).then(resolve, reject);
          }
        );
      });
    }
    return gmGet(url, hdr);
  }

  function xferOpBuildPagingUrl(base, page, fields) {
    var dr = xferOpDefaultDateRange();
    var f = fields || {};
    var p = new URLSearchParams();
    p.set("page", String(page == null ? 0 : page));
    p.set("skuBarcode", f.skuBarcode != null ? String(f.skuBarcode) : "");
    p.set("skuExternalId", f.skuExternalId != null ? String(f.skuExternalId) : "");
    p.set("skuId", f.skuId != null ? String(f.skuId) : "");
    p.set("vehicleNumber", "");
    p.set("status", "");
    p.set(
      "containerBarcode",
      f.containerBarcode != null ? String(f.containerBarcode) : ""
    );
    p.set("transferCartPriority", "");
    p.set("toCenterCode", cfsActiveCenterCode(XFER_OP_TO_CENTER));
    p.set("centerCode", "");
    p.set("transferAllocationType", "");
    p.set("transferPlanExternalId", "");
    p.set("cartBarcode", f.cartBarcode != null ? String(f.cartBarcode) : "");
    p.set("searchDateType", XFER_OP_SEARCH_DATE_TYPE);
    p.set("end", f.endYmd || dr.endYmd);
    p.set("start", f.startYmd || dr.startYmd);
    return base + "?" + p.toString();
  }

  /**
   * 이관현황 페이저 — 응답 HTML 기준.
   * UI: w-page-item data-page="N" 클릭 시 loadPage(N-1) → API query page 는 0-based.
   * 예) UI 2페이지 요청 URL page=1, w-page-next data-page="11" → 다음 API page=10.
   */
  function xferOpHasNextPage(html, currentApiPage) {
    var doc = recvParseHtml(html);
    var next = doc.querySelector("w-page-next");
    if (next) {
      if (next.hasAttribute("disabled")) return false;
      var dp = next.getAttribute("data-page");
      if (dp != null && String(dp).trim() !== "") {
        var uiNext = parseInt(String(dp).trim(), 10);
        if (isFinite(uiNext)) {
          var apiNext = uiNext - 1;
          var cur = isFinite(currentApiPage) ? currentApiPage : 0;
          return apiNext > cur;
        }
      }
      return true;
    }
    return false;
  }

  function xferOpPageLooksFull(rows) {
    return (rows || []).length >= XFER_OP_ROWS_PER_PAGE;
  }

  function xferOpParseListRows(html) {
    var table = recvParseHtml(html).querySelector('table[is="w-table"]');
    if (!table) return [];
    var map = recvHeaderIndexMap(table);
    var iTote = recvFindCol(map, ["토트바코드"]);
    var iContainer = recvFindCol(map, ["컨테이너바코드", "컨테이너 바코드"]);
    var iFrom = recvFindCol(map, [
      "보내는센터",
      "보내는 센터",
      "보내는 센터코드",
      "centercode",
    ]);
    var iPickDone = recvFindCol(map, [
      "집품/분배완료일시",
      "집품/분배 완료 일시",
      "집품분배완료일시",
      "집품완료일시",
      "집품완료 일시",
      "집품완료시간",
      "집품완료 시간",
      "분배완료일시",
      "분배완료 일시",
    ]);
    if (iPickDone < 0) {
      iPickDone = recvFindCol(map, [
        "집품시작일",
        "집품시작일시",
        "집품시작",
        "분배일",
        "분배일자",
        "pickingstart",
      ]);
    }
    var iUnload = recvFindCol(map, [
      "하차완료일시",
      "하차 완료 일시",
      "하차일시",
      "하차 일시",
      "하차일",
      "하차일자",
      "Unload",
      "unloadedAt",
    ]);
    var iQty = recvFindCol(map, [
      "수량",
      "요청수량",
      "이관수량",
      "유닛수",
      "유닛",
      "Unit Qty",
      "UnitQty",
      "quantity",
    ]);
    var rows = [];
    var trs = table.querySelectorAll("tbody tr");
    for (var r = 0; r < trs.length; r++) {
      var tds = trs[r].querySelectorAll("td");
      if (!tds.length) continue;
      if (tds[0] && tds[0].getAttribute("colspan")) continue;
      var toteTd = iTote >= 0 ? tds[iTote] : tds[0];
      var detailA = toteTd
        ? toteTd.querySelector('a[href*="/transfer/admin/operation/detail"]')
        : null;
      var toteText = toteTd ? recvCellText(toteTd) : "";
      if (!toteText && !detailA) continue;
      var qtyRaw = iQty >= 0 ? recvCellText(tds[iQty]) : "";
      var qtyMatch = String(qtyRaw || "").match(/(\d+)/);
      rows.push({
        toteBarcode: toteText,
        containerBarcode:
          iContainer >= 0 ? recvCellText(tds[iContainer]) : "",
        fromCenter: iFrom >= 0 ? recvCellText(tds[iFrom]) : "",
        distDate: iPickDone >= 0 ? recvCellText(tds[iPickDone]) : "",
        unloadDate: iUnload >= 0 ? recvCellText(tds[iUnload]) : "",
        quantity: qtyMatch ? parseInt(qtyMatch[1], 10) : 0,
        detailPath: detailA ? detailA.getAttribute("href") || "" : "",
      });
    }
    return rows;
  }

  function xferOpBuildDetailUrl(path) {
    var p = String(path || "").trim();
    if (!p) return "";
    if (/^https?:\/\//i.test(p)) return p;
    return "https://inbound.coupang.com" + (p.charAt(0) === "/" ? p : "/" + p);
  }

  /**
   * 재고이관 현황 상세 → 「이관 계획별 진열내역」표.
   * 수량: 3열 SKU ID 일치 행의 6열 수량 합 (숏/오버 동일).
   */
  function xferOpFindStowPlanTable(doc) {
    if (!doc) return null;
    var nodes = doc.querySelectorAll(
      "h1,h2,h3,h4,h5,h6,div,span,p,strong,b,legend,caption,label"
    );
    var i, n, t, el, tables;
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      t = String(n.textContent || "").replace(/\s+/g, "");
      if (t.indexOf("이관계획별진열내역") < 0) continue;
      el = n.nextElementSibling;
      while (el) {
        if (el.tagName === "TABLE") return el;
        tables = el.querySelectorAll ? el.querySelectorAll("table") : [];
        if (tables && tables.length) return tables[0];
        el = el.nextElementSibling;
      }
      el = n.parentElement;
      if (el) {
        tables = el.querySelectorAll("table");
        if (tables && tables.length) return tables[0];
      }
    }
    tables = doc.querySelectorAll('table[is="w-table"], table');
    for (i = 0; i < tables.length; i++) {
      var map = recvHeaderIndexMap(tables[i]);
      if (recvFindCol(map, ["SKU ID", "SKUID", "skuId"]) >= 0) {
        return tables[i];
      }
    }
    return tables.length ? tables[0] : null;
  }

  /**
   * 「SKU ID」열 찾기. recvFindCol("SKU ID")가 「외부 SKU ID」에
   * 먼저 매칭되면 내부 SKU 수량이 0으로 떨어져 숏 전산이 붙여넣기 수량으로 바뀜.
   */
  function xferOpFindInternalSkuCol(map) {
    var keys = Object.keys(map || {});
    var i, k;
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (k === "skuid" || k === "내부sku" || k === "내부skuid") return map[k];
    }
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (k.indexOf("외부") >= 0 || k.indexOf("external") >= 0) continue;
      if (
        k === "상품skuid" ||
        k.indexOf("내부sku") >= 0 ||
        (k.indexOf("sku") >= 0 && k.indexOf("id") >= 0)
      ) {
        return map[k];
      }
    }
    return -1;
  }

  /** 수량 열 — 일시/완료 등 제외, 「수량」정확 매칭 우선 */
  function xferOpFindQtyCol(map) {
    if (!map) return -1;
    if (map["수량"] != null) return map["수량"];
    var prefer = [
      "요청수량",
      "이관수량",
      "진열수량",
      "유닛수",
      "유닛",
      "unitqty",
      "quantity",
    ];
    var i, k, cand;
    for (i = 0; i < prefer.length; i++) {
      cand = prefer[i].replace(/\s+/g, "").toLowerCase();
      if (map[cand] != null) return map[cand];
    }
    for (k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      if (/일시|완료|시간|날짜|date|time|작업자|상태|이름|바코드/.test(k)) {
        continue;
      }
      if (k.indexOf("수량") >= 0 || k === "유닛" || k.indexOf("qty") >= 0) {
        return map[k];
      }
    }
    return -1;
  }

  function xferOpHeaderMapFromTable(table) {
    var map = recvHeaderIndexMap(table);
    if (Object.keys(map).length) {
      return { map: map, bodyStart: 0 };
    }
    var first = table.querySelector("tbody tr") || table.querySelector("tr");
    if (!first) return { map: {}, bodyStart: 0 };
    var cells = first.querySelectorAll("th, td");
    var i, t;
    var looksHeader = false;
    map = {};
    for (i = 0; i < cells.length; i++) {
      t = String(cells[i].textContent || "")
        .replace(/\s+/g, "")
        .toLowerCase();
      if (!t) continue;
      map[t] = i;
      if (/sku|수량|바코드|상품명|유닛/.test(t)) looksHeader = true;
    }
    return { map: map, bodyStart: looksHeader ? 1 : 0 };
  }

  function xferOpParseProductsFromTable(table, colOpt) {
    var out = [];
    if (!table) return out;
    var hdr = xferOpHeaderMapFromTable(table);
    var map = hdr.map;
    colOpt = colOpt || {};
    /* 사용자 지정: 진열내역 3열=SKU ID, 6열=수량 (1-based → 2, 5) */
    var iSku =
      colOpt.iSku != null
        ? colOpt.iSku
        : colOpt.forceFixed
          ? 2
          : xferOpFindInternalSkuCol(map);
    if (iSku < 0) iSku = 2;
    var iQty =
      colOpt.iQty != null
        ? colOpt.iQty
        : colOpt.forceFixed
          ? 5
          : xferOpFindQtyCol(map);
    if (iQty < 0) iQty = 5;
    var iBc = recvFindCol(map, ["상품바코드", "sku바코드", "바코드"]);
    var iName = recvFindCol(map, ["상품명"]);
    var iExt = recvFindCol(map, [
      "외부 SKU ID",
      "외부SKU ID",
      "외부SKU",
      "External SKU",
    ]);
    if (iExt < 0) iExt = 1;
    var trs = table.querySelectorAll("tbody tr");
    if (!trs.length) trs = table.querySelectorAll("tr");
    var r, c, tds, cellTxt, digs, idHits;
    for (r = hdr.bodyStart; r < trs.length; r++) {
      tds = trs[r].querySelectorAll("td");
      if (!tds.length) tds = trs[r].querySelectorAll("th, td");
      if (!tds.length || (tds[0] && tds[0].getAttribute("colspan"))) continue;
      if (tds.length <= Math.max(iSku, iQty, 2)) continue;
      idHits = [];
      for (c = 0; c < tds.length; c++) {
        cellTxt = recvCellText(tds[c]);
        digs = String(cellTxt || "").replace(/\D/g, "");
        if (digs.length >= 6 && digs.length <= 14) idHits.push(digs);
      }
      var skuRaw = tds[iSku] ? recvCellText(tds[iSku]) : "";
      var skuId = String(skuRaw || "").replace(/\D/g, "");
      var bc =
        iBc >= 0 && tds[iBc]
          ? String(recvCellText(tds[iBc]) || "")
              .trim()
              .toUpperCase()
          : "";
      if (!bc) {
        for (c = 0; c < tds.length; c++) {
          cellTxt = String(recvCellText(tds[c]) || "")
            .trim()
            .toUpperCase();
          if (/^R\d{6,}$/i.test(cellTxt)) {
            bc = cellTxt;
            break;
          }
        }
      }
      if (!skuId && !bc && !idHits.length) continue;
      var qtyRaw = tds[iQty] ? recvCellText(tds[iQty]) : "";
      var qtyMatch = String(qtyRaw || "").match(/^[\s]*(\d+)[\s]*$/);
      if (!qtyMatch) qtyMatch = String(qtyRaw || "").match(/(\d+)/);
      var qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
      /* 수량열이 날짜(2026…)로 잡히면 버린 뒤, 짧고 합리적인 숫자 셀 재탐색 */
      if (qty >= 100000 || (qtyMatch && String(qtyMatch[1]).length >= 5)) {
        qty = 0;
        for (c = 0; c < tds.length; c++) {
          if (c === iSku || c === iExt || c === iBc || c === iName) continue;
          cellTxt = String(recvCellText(tds[c]) || "").trim();
          qtyMatch = cellTxt.match(/^(\d{1,5})$/);
          if (!qtyMatch) continue;
          qty = parseInt(qtyMatch[1], 10);
          break;
        }
      }
      out.push({
        productName:
          iName >= 0 && tds[iName] ? recvCellText(tds[iName]) : "",
        skuBarcode: bc,
        skuId: skuId,
        externalSkuId:
          iExt >= 0 && tds[iExt]
            ? recvCellText(tds[iExt]).replace(/\D/g, "")
            : "",
        idHits: idHits,
        quantity: qty,
      });
    }
    return out;
  }

  function xferOpScoreProductRows(list) {
    var s = 0;
    var i, p;
    for (i = 0; i < (list || []).length; i++) {
      p = list[i];
      if (p.skuId && String(p.skuId).length >= 6) s += 2;
      if (p.quantity > 0 && p.quantity < 100000) s += 4;
      if (p.skuBarcode) s += 1;
      if (p.externalSkuId) s += 1;
    }
    return s;
  }

  function xferOpParseDetailProducts(html) {
    var doc = recvParseHtml(html);
    var table = xferOpFindStowPlanTable(doc);
    var candidates = [];
    var i, rows, best, bestScore, sc;
    if (table) {
      /* 헤더 오인식 대비: 고정 3/6열 · 오프셋 · 헤더매칭 모두 시도 후 최선 선택 */
      candidates.push(xferOpParseProductsFromTable(table, { forceFixed: true }));
      candidates.push(
        xferOpParseProductsFromTable(table, { iSku: 3, iQty: 6 })
      );
      candidates.push(xferOpParseProductsFromTable(table, {}));
    }
    var tables = doc.querySelectorAll('table[is="w-table"], table');
    for (i = 0; i < tables.length; i++) {
      if (table && tables[i] === table) continue;
      candidates.push(
        xferOpParseProductsFromTable(tables[i], { forceFixed: true })
      );
      candidates.push(xferOpParseProductsFromTable(tables[i], {}));
    }
    best = [];
    bestScore = -1;
    for (i = 0; i < candidates.length; i++) {
      rows = candidates[i] || [];
      sc = xferOpScoreProductRows(rows);
      if (sc > bestScore || (sc === bestScore && rows.length > best.length)) {
        bestScore = sc;
        best = rows;
      }
    }
    return best;
  }

  /** 재고이관 상세 「토트 안의 SKU 정보」 표 → [{ skuId, productName, skuBarcode }] */
  function xferOpParseToteSkuInfo(html) {
    var doc = recvParseHtml(html);
    var table = null;
    var heads = doc.querySelectorAll("h1,h2,h3,h4,h5,h6,legend,caption");
    var i, t, el;
    for (i = 0; i < heads.length && !table; i++) {
      t = String(heads[i].textContent || "").replace(/\s+/g, "").toLowerCase();
      if (t.indexOf("토트안의sku") < 0) continue;
      el = heads[i].nextElementSibling;
      while (el && !table) {
        if (el.tagName === "TABLE") table = el;
        else if (el.querySelector) table = el.querySelector("table");
        el = el.nextElementSibling;
      }
    }
    if (!table) {
      var tables = doc.querySelectorAll("table");
      for (i = 0; i < tables.length; i++) {
        var m = recvHeaderIndexMap(tables[i]);
        if (m["skuid"] != null && m["상품바코드"] != null && m["토트바코드"] == null) {
          table = tables[i];
          break;
        }
      }
    }
    if (!table) return [];
    var map = recvHeaderIndexMap(table);
    var iSku = map["skuid"] != null ? map["skuid"] : -1;
    var iName = recvFindCol(map, ["상품명"]);
    var iBc = map["상품바코드"] != null ? map["상품바코드"] : -1;
    var out = [];
    var trs = table.querySelectorAll("tbody tr");
    var r, tds, skuId, bc;
    for (r = 0; r < trs.length; r++) {
      tds = trs[r].querySelectorAll("td");
      if (!tds.length || tds[0].getAttribute("colspan")) continue;
      skuId = iSku >= 0 && tds[iSku] ? recvCellText(tds[iSku]).replace(/\D/g, "") : "";
      bc = iBc >= 0 && tds[iBc] ? recvCellText(tds[iBc]).trim().toUpperCase() : "";
      if (!skuId && !bc) continue;
      out.push({
        skuId: skuId,
        skuBarcode: bc,
        productName: iName >= 0 && tds[iName] ? recvCellText(tds[iName]) : "",
      });
    }
    return out;
  }

  /** 동일 SKU ID(또는 외부SKU/바코드) 행만 수량 합산. 없으면 0 (전체 GC 합산 금지). */
  function xferOpPickDetailQuantity(products, fields) {
    var list = products || [];
    if (!list.length) return 0;
    var bc = String((fields && fields.skuBarcode) || "")
      .trim()
      .toUpperCase();
    var skuId = String((fields && fields.skuId) || "").replace(/\D/g, "");
    var extId = String((fields && fields.skuExternalId) || "").replace(
      /\D/g,
      ""
    );
    var i, p, hit, hits, h;

    function rowHasId(row, id) {
      if (!id) return false;
      if (String(row.skuId || "").replace(/\D/g, "") === id) return true;
      if (String(row.externalSkuId || "").replace(/\D/g, "") === id) {
        return true;
      }
      hits = row.idHits || [];
      for (h = 0; h < hits.length; h++) {
        if (String(hits[h]) === id) return true;
      }
      return false;
    }

    function sumMatching(pred) {
      var s = 0;
      var any = false;
      for (i = 0; i < list.length; i++) {
        p = list[i];
        if (!pred(p)) continue;
        any = true;
        s += Number(p.quantity) || 0;
      }
      return any ? s : -1;
    }

    if (skuId || extId) {
      hit = sumMatching(function (row) {
        if (skuId && rowHasId(row, skuId)) return true;
        if (extId && rowHasId(row, extId)) return true;
        return false;
      });
      if (hit >= 0) return hit;
      if (bc) {
        hit = sumMatching(function (row) {
          return (
            String(row.skuBarcode || "")
              .trim()
              .toUpperCase() === bc
          );
        });
        if (hit >= 0) return hit;
      }
      return 0;
    }
    if (bc) {
      hit = sumMatching(function (row) {
        return (
          String(row.skuBarcode || "")
            .trim()
            .toUpperCase() === bc
        );
      });
      if (hit >= 0) return hit;
      return 0;
    }
    return 0;
  }

  function xferOpListRowSig(row) {
    return [row.toteBarcode, row.containerBarcode, row.detailPath].join("|");
  }

  async function xferOpFetchListAllPages(pagingBase, fields, onStatus) {
    var all = [];
    var seenSig = {};
    var page = 0;
    var firstPageSig = null;
    while (page < XFER_OP_PAGE_CAP) {
      if (xferGcPipelineStop) break;
      if (onStatus) {
        onStatus("목록 " + (page + 1) + "p (API page=" + page + ")…");
      }
      var url = xferOpBuildPagingUrl(pagingBase, page, fields);
      var html = await xferOpGmGet(url);
      var rows = xferOpParseListRows(html);
      if (!rows.length) break;
      if (page > 0) {
        var headSig = xferOpListRowSig(rows[0]);
        if (firstPageSig && headSig === firstPageSig) break;
      } else {
        firstPageSig = xferOpListRowSig(rows[0]);
      }
      var beforeLen = all.length;
      var i;
      for (i = 0; i < rows.length; i++) {
        var sig = xferOpListRowSig(rows[i]);
        if (seenSig[sig]) continue;
        seenSig[sig] = true;
        all.push(rows[i]);
      }
      if (page > 0 && all.length === beforeLen) break;
      var hasNext = xferOpHasNextPage(html, page);
      if (!hasNext && !xferOpPageLooksFull(rows)) break;
      if (!hasNext && xferOpPageLooksFull(rows)) {
        page++;
        await recvSleep(XFER_OP_DELAY_MS);
        continue;
      }
      if (!hasNext) break;
      page++;
      await recvSleep(XFER_OP_DELAY_MS);
    }
    return all;
  }

  async function xferOpFetchGcSeedRows(gcBarcode, onStatus) {
    var gc = String(gcBarcode || "").trim();
    var fields = { cartBarcode: gc };
    var main = await xferOpFetchListAllPages(
      XFER_OP_PAGING_BASE,
      fields,
      onStatus
    );
    if (main.length) return main;
    return xferOpFetchListAllPages(
      XFER_OP_SAME_CENTER_PAGING_BASE,
      fields,
      onStatus
    );
  }

  async function xferOpCollectToteBarcodesFromPipeline(gcBarcode, onStatus) {
    var seeds = await xferOpFetchGcSeedRows(gcBarcode, onStatus);
    if (xferGcPipelineStop) {
      return { toteBarcodes: [], productName: "", skuBarcode: "", totalUnits: 0 };
    }
    if (!seeds.length) {
      throw new Error("GC 조회 결과 없음");
    }
    var toteOut = [];
    var toteSeen = {};
    var toteQty = Object.create(null);
    var productName = "";
    var skuBarcode = "";
    var diag = {
      seeds: seeds.length,
      noContainer: 0,
      details: 0,
      detailFail: 0,
      products: 0,
      noKey: 0,
      requery: 0,
      requeryFail: 0,
      seedTotes: 0,
      extraTotes: 0,
    };
    var queried = {};
    function pushTote(code, qty) {
      var t = String(code || "").trim();
      if (!t) return false;
      var q = Number(qty) || 0;
      if (!toteSeen[t]) {
        toteSeen[t] = true;
        toteOut.push(t);
        toteQty[t] = q;
        return true;
      }
      if (!toteQty[t] && q) toteQty[t] = q;
      return false;
    }
    function sumToteUnits() {
      var s = 0;
      var k;
      for (k in toteQty) {
        if (Object.prototype.hasOwnProperty.call(toteQty, k)) {
          s += Number(toteQty[k]) || 0;
        }
      }
      return s;
    }
    var si;
    for (si = 0; si < seeds.length; si++) {
      if (xferGcPipelineStop) break;
      var seed = seeds[si];
      if (pushTote(seed.toteBarcode, seed.quantity)) diag.seedTotes++;
      var container = String(seed.containerBarcode || "").trim();
      if (!container) {
        diag.noContainer++;
        continue;
      }
      var products = [];
      if (seed.detailPath) {
        if (onStatus) {
          onStatus(
            "상세 " + (si + 1) + "/" + seeds.length + "…"
          );
        }
        diag.details++;
        try {
          var detHtml = await xferOpGmGet(
            xferOpBuildDetailUrl(seed.detailPath)
          );
          products = xferOpParseToteSkuInfo(detHtml);
          if (!products.length) {
            products = xferOpParseDetailProducts(detHtml).filter(function (p) {
              var b = String(p.skuBarcode || "").trim().toUpperCase();
              if (/^GC-/.test(b) || b === String(seed.toteBarcode || "").trim().toUpperCase()) {
                p.skuBarcode = "";
              }
              return !!(p.skuBarcode || p.skuId);
            });
          }
          if (products.length && !productName && !skuBarcode) {
            productName = products[0].productName || "";
            skuBarcode = products[0].skuBarcode || "";
          }
        } catch (eDet) {
          diag.detailFail++;
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 xfer] detail", eDet);
          }
        }
        await recvSleep(XFER_OP_DELAY_MS);
      }
      if (!products.length) continue;
      diag.products += products.length;
      var sk;
      for (sk = 0; sk < products.length; sk++) {
        if (xferGcPipelineStop) break;
        // 상세 표에 상품바코드 열이 없으면 SKU ID 로 재조회 (이관현황 paging 은 skuId 도 지원)
        var sku = String(products[sk].skuBarcode || "").trim();
        var skuIdKey = sku ? "" : String(products[sk].skuId || "").replace(/\D/g, "");
        if (!sku && !skuIdKey) {
          diag.noKey++;
          continue;
        }
        var qKey = container + "|" + (sku || "id:" + skuIdKey);
        if (queried[qKey]) continue;
        queried[qKey] = true;
        if (onStatus) {
          onStatus(
            "SKU " + (sk + 1) + "/" + products.length + " · " + container
          );
        }
        diag.requery++;
        try {
          var skuRows = await xferOpFetchListAllPages(XFER_OP_PAGING_BASE, {
            cartBarcode: "",
            containerBarcode: container,
            skuBarcode: sku,
            skuId: skuIdKey,
          });
          var sr;
          for (sr = 0; sr < skuRows.length; sr++) {
            if (pushTote(skuRows[sr].toteBarcode, skuRows[sr].quantity)) {
              diag.extraTotes++;
            }
          }
        } catch (eSku) {
          diag.requeryFail++;
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 xfer] requery", qKey, eSku);
          }
        }
        await recvSleep(XFER_OP_DELAY_MS);
      }
    }
    if (skuBarcode && !xferGcPipelineStop) {
      if (onStatus) onStatus("상품명…");
      try {
        var skuInv = await xferOpFetchSkuFromInventory(skuBarcode);
        if (!productName && skuInv.productName) {
          productName = skuInv.productName;
        }
      } catch (eSku) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 xfer] sku lookup", eSku);
        }
      }
    }
    return {
      toteBarcodes: toteOut,
      productName: productName,
      skuBarcode: skuBarcode,
      totalUnits: sumToteUnits(),
      diag: diag,
    };
  }

  function xferOpDiagText(d) {
    if (!d) return "";
    var parts = [
      "GC행 " + d.seeds,
      "GC토트 " + d.seedTotes,
      "재조회 " + d.requery + "회 +" + d.extraTotes + "토트",
      "상세 " + d.details + " · 상품 " + d.products,
    ];
    if (d.noContainer) parts.push("컨테이너없음 " + d.noContainer);
    if (d.noKey) parts.push("바코드·SKU없음 " + d.noKey);
    if (d.detailFail) parts.push("상세실패 " + d.detailFail);
    if (d.requeryFail) parts.push("재조회실패 " + d.requeryFail);
    return parts.join(" · ");
  }

  async function xferOpSearchErrorReport(fields) {
    var f = fields || {};
    var matchFields = {
      cartBarcode: String(f.cartBarcode || "").trim(),
      skuBarcode: String(f.skuBarcode || "").trim(),
      skuId: String(f.skuId || "").replace(/\D/g, ""),
      skuExternalId: String(f.skuExternalId || "").replace(/\D/g, ""),
    };
    if (
      !matchFields.cartBarcode &&
      !matchFields.skuBarcode &&
      !matchFields.skuId &&
      !matchFields.skuExternalId
    ) {
      return {
        found: false,
        status: "검색조건없음",
        fromCenter: "",
        distDate: "",
        quantity: 0,
        products: [],
      };
    }
    /*
     * 목록 조회는 GC(토트)만 사용.
     * SKU 필터를 넣으면 다중 SKU GC(오버숏)에서 상세/매칭이 어긋날 수 있음.
     * 수량은 상세 진열내역에서 matchFields SKU로 집계.
     */
    var listFields = matchFields.cartBarcode
      ? { cartBarcode: matchFields.cartBarcode }
      : {
          cartBarcode: "",
          skuBarcode: matchFields.skuBarcode,
          skuId: matchFields.skuId,
          skuExternalId: matchFields.skuExternalId,
        };
    var html = await xferOpGmGet(
      xferOpBuildPagingUrl(XFER_OP_PAGING_BASE, 0, listFields)
    );
    var rows = xferOpParseListRows(html);
    if (!rows.length) {
      html = await xferOpGmGet(
        xferOpBuildPagingUrl(XFER_OP_SAME_CENTER_PAGING_BASE, 0, listFields)
      );
      rows = xferOpParseListRows(html);
    }
    if (!rows.length) {
      return {
        found: false,
        status: "WMS없음",
        fromCenter: "",
        distDate: "",
        quantity: 0,
        products: [],
      };
    }
    var gcKey = matchFields.cartBarcode.toUpperCase();
    var row = rows[0];
    var i;
    if (gcKey) {
      for (i = 0; i < rows.length; i++) {
        if (
          String(rows[i].toteBarcode || "")
            .toUpperCase()
            .indexOf(gcKey) >= 0
        ) {
          row = rows[i];
          break;
        }
      }
    }
    /* 수량은 상세「이관 계획별 진열내역」에서 해당 SKU만 합산 */
    var quantity = 0;
    var detailParsed = false;
    var products = [];
    if (row.detailPath) {
      try {
        var detailUrl = xferOpBuildDetailUrl(row.detailPath);
        if (detailUrl) {
          await recvSleep(XFER_OP_DELAY_MS);
          var detailHtml = await xferOpGmGet(detailUrl);
          products = xferOpParseDetailProducts(detailHtml);
          detailParsed = true;
          quantity = xferOpPickDetailQuantity(products, matchFields);
        }
      } catch (eQty) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 xfer] detail qty", eQty);
        }
      }
    }
    /* 상세를 읽었으면(해당 SKU 0 포함) 목록 전체수량으로 대체하지 않음 */
    if (!detailParsed && (!quantity || quantity < 1)) {
      quantity = Number(row.quantity) || 0;
    }
    return {
      found: true,
      status: "WMS OK",
      fromCenter: row.fromCenter || "",
      distDate: row.distDate || "",
      unloadDate: row.unloadDate || row.distDate || "",
      toteBarcode: row.toteBarcode || "",
      quantity: quantity > 0 ? quantity : 0,
      skuMatched: detailParsed,
      matchSkuId: matchFields.skuId || "",
      productCount: products.length,
      products: products,
    };
  }

  window.__YAN4_XFER_OP_BRIDGE__ = {
    searchErrorReport: xferOpSearchErrorReport,
    pickDetailQuantity: xferOpPickDetailQuantity,
  };

  /** 진열 작업 오류보고 내역 — 숏테이지 전산/문제보고 수량 */
  var STOW_PROB_LIST_REFERER =
    "https://inbound.coupang.com/stowing/problem/list";
  var STOW_PROB_PAGING =
    "https://inbound.coupang.com/stowing/problem/paging";
  var STOW_PROB_LOOKBACK_DAYS = 31;
  var STOW_PROB_DELAY_MS = 140;

  function stowProbYmd(d) {
    return unloadYmdFromDate(d);
  }

  function stowProbDateRange() {
    var end = new Date();
    var start = new Date(end.getTime());
    start.setDate(start.getDate() - STOW_PROB_LOOKBACK_DAYS);
    return { startYmd: stowProbYmd(start), endYmd: stowProbYmd(end) };
  }

  function stowProbGmGet(url) {
    var hdr = {
      Accept: "text/html, */*; q=0.01",
      Referer: STOW_PROB_LIST_REFERER,
      "X-Requested-With": "XMLHttpRequest",
    };
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    ) {
      return new Promise(function (resolve, reject) {
        chrome.runtime.sendMessage(
          {
            type: "yan4InboundFetch",
            url: url,
            method: "GET",
            referer: hdr.Referer,
            accept: hdr.Accept,
          },
          function (res) {
            if (chrome.runtime.lastError) {
              gmGet(url, hdr).then(resolve, reject);
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
            gmGet(url, hdr).then(resolve, reject);
          }
        );
      });
    }
    return gmGet(url, hdr);
  }

  function stowProbBuildPagingUrl(page, cartBarcode) {
    var dr = stowProbDateRange();
    var p = new URLSearchParams();
    p.set("page", String(page == null ? 0 : page));
    p.set("sourceType", "");
    p.set("stowType", "");
    p.set("cartBarcode", String(cartBarcode || "").trim());
    p.set("status", "");
    p.set("problemType", "");
    p.set("end", dr.endYmd);
    p.set("start", dr.startYmd);
    return STOW_PROB_PAGING + "?" + p.toString();
  }

  function stowProbParseQty(raw) {
    var s = String(raw || "")
      .replace(/,/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!s || s === "-" || s === "—") return null;
    var m = /(-?\d+(?:\.\d+)?)/.exec(s);
    if (!m) return null;
    var n = Number(m[1]);
    return isFinite(n) ? n : null;
  }

  function stowProbMainTable(doc) {
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
        if (kids[ci].querySelector('a[href*="stowProblemId="]')) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = tbl;
      }
    }
    return best;
  }

  function stowProbParseListRows(html) {
    var doc = recvParseHtml(html);
    var table = stowProbMainTable(doc) || doc.querySelector("table");
    if (!table) return [];
    var map = recvHeaderIndexMap(table);
    var iReason = recvFindCol(map, [
      "문제보고사유",
      "문제보고 사유",
      "보고사유",
      "오류사유",
    ]);
    var iSys = recvFindCol(map, ["전산수량", "전산 수량"]);
    var iProb = recvFindCol(map, ["문제보고수량", "문제보고 수량", "보고수량"]);
    var iDone = recvFindCol(map, ["진열완료수량", "진열완료 수량", "진열완료"]);
    var rows = [];
    var trs = table.querySelectorAll("tbody tr");
    var r;
    for (r = 0; r < trs.length; r++) {
      var tds = trs[r].querySelectorAll("td");
      if (!tds.length || (tds[0] && tds[0].getAttribute("colspan"))) continue;
      var a = trs[r].querySelector('a[href*="stowProblemId="]');
      if (!a) continue;
      var href = a.getAttribute("href") || "";
      var idm = /stowProblemId=(\d+)/.exec(href);
      var reason = iReason >= 0 ? recvCellText(tds[iReason]) : "";
      rows.push({
        stowProblemId: idm ? idm[1] : "",
        detailHref: href,
        reason: reason,
        sysQty: iSys >= 0 ? stowProbParseQty(recvCellText(tds[iSys])) : null,
        problemQty:
          iProb >= 0 ? stowProbParseQty(recvCellText(tds[iProb])) : null,
        stowDoneQty:
          iDone >= 0 ? stowProbParseQty(recvCellText(tds[iDone])) : null,
        isShortage: /shortage|숏\s*테이지|부족|결품/i.test(reason),
      });
    }
    return rows;
  }

  function stowProbDetailUrl(href, stowProblemId) {
    var h = String(href || "").trim();
    if (/^https?:\/\//i.test(h)) return h;
    if (h.charAt(0) === "/") return "https://inbound.coupang.com" + h;
    if (h) return "https://inbound.coupang.com/" + h.replace(/^\.\//, "");
    var id = String(stowProblemId || "").trim();
    if (!id) return "";
    return (
      "https://inbound.coupang.com/stowing/problem/list?stowProblemId=" +
      encodeURIComponent(id)
    );
  }

  function stowProbLabeledQty(doc, labels) {
    var body = doc && doc.body ? doc.body : null;
    var text = body
      ? String(body.innerText || body.textContent || "")
      : String((doc && doc.documentElement && doc.documentElement.textContent) || "");
    text = text.replace(/\u00a0/g, " ");
    var i, lit, re, m, n;
    for (i = 0; i < labels.length; i++) {
      lit = String(labels[i] || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      re = new RegExp(lit + "\\s*[:：]?\\s*(-?\\d+(?:[.,]\\d+)?)", "i");
      m = re.exec(text);
      if (!m) continue;
      n = stowProbParseQty(m[1]);
      if (n != null) return n;
    }
    return null;
  }

  /** 상세 진열내역 — SKU 일치 행 수량 합(보조) */
  function stowProbParseStowHistoryQty(doc, fields) {
    var skuId = String((fields && fields.skuId) || "").replace(/\D/g, "");
    var extId = String((fields && fields.skuExternalId) || "").replace(
      /\D/g,
      ""
    );
    var bc = String((fields && fields.skuBarcode) || "")
      .trim()
      .toUpperCase();
    if (!skuId && !extId && !bc) return null;
    var tables = doc.querySelectorAll("table");
    var t, map, iSku, iQty, iBc, trs, r, tds, rowSku, rowBc, q, sum, hit;
    sum = 0;
    hit = false;
    for (t = 0; t < tables.length; t++) {
      map = recvHeaderIndexMap(tables[t]);
      iSku = xferOpFindInternalSkuCol(map);
      if (iSku < 0) {
        iSku = recvFindCol(map, ["SKU ID", "SKUID", "skuId", "내부SKU"]);
      }
      iQty = recvFindCol(map, ["수량", "진열수량", "진열완료", "유닛"]);
      iBc = recvFindCol(map, ["상품바코드", "sku바코드", "바코드"]);
      if (iSku < 0 && iBc < 0) continue;
      if (iQty < 0) continue;
      trs = tables[t].querySelectorAll("tbody tr");
      for (r = 0; r < trs.length; r++) {
        tds = trs[r].querySelectorAll("td");
        if (!tds.length || tds.length <= Math.max(iSku, iQty, iBc)) continue;
        rowSku =
          iSku >= 0
            ? String(recvCellText(tds[iSku]) || "").replace(/\D/g, "")
            : "";
        rowBc =
          iBc >= 0
            ? String(recvCellText(tds[iBc]) || "")
                .trim()
                .toUpperCase()
            : "";
        var match = false;
        if (skuId && rowSku && rowSku === skuId) match = true;
        if (extId && rowSku && rowSku === extId) match = true;
        if (bc && rowBc && rowBc === bc) match = true;
        if (!match) continue;
        q = stowProbParseQty(recvCellText(tds[iQty]));
        if (q == null) continue;
        hit = true;
        sum += q;
      }
    }
    return hit ? sum : null;
  }

  function stowProbParseDetail(html, fields) {
    var doc = recvParseHtml(html);
    var sysQty = stowProbLabeledQty(doc, ["전산수량", "전산 수량"]);
    var problemQty = stowProbLabeledQty(doc, [
      "문제보고수량",
      "문제보고 수량",
      "보고수량",
    ]);
    var stowDoneQty = stowProbLabeledQty(doc, [
      "진열완료수량",
      "진열완료 수량",
      "진열완료",
    ]);
    var hist = stowProbParseStowHistoryQty(doc, fields);
    if (hist != null && (sysQty == null || !isFinite(sysQty))) {
      sysQty = hist;
    }
    return {
      sysQty: sysQty != null ? sysQty : null,
      problemQty: problemQty != null ? problemQty : null,
      stowDoneQty: stowDoneQty != null ? stowDoneQty : null,
      historyQty: hist,
    };
  }

  function stowProbPickRow(rows, fields) {
    var list = rows || [];
    if (!list.length) return null;
    var i;
    var shortRows = [];
    for (i = 0; i < list.length; i++) {
      if (list[i].isShortage) shortRows.push(list[i]);
    }
    var pool = shortRows.length ? shortRows : list;
    return pool[0];
  }

  async function stowProbSearchErrorReport(fields) {
    var f = fields || {};
    var cart = String(f.cartBarcode || "").trim();
    if (!cart) {
      return {
        found: false,
        status: "토트없음",
        sysQty: 0,
        problemQty: 0,
        stowDoneQty: 0,
      };
    }
    var html = await stowProbGmGet(stowProbBuildPagingUrl(0, cart));
    var rows = stowProbParseListRows(html);
    if (!rows.length) {
      return {
        found: false,
        status: "오류보고없음",
        sysQty: 0,
        problemQty: 0,
        stowDoneQty: 0,
      };
    }
    var row = stowProbPickRow(rows, f);
    var sysQty = row.sysQty;
    var problemQty = row.problemQty;
    var stowDoneQty = row.stowDoneQty;
    var detailUrl = stowProbDetailUrl(row.detailHref, row.stowProblemId);
    if (detailUrl) {
      try {
        await recvSleep(STOW_PROB_DELAY_MS);
        var detailHtml = await stowProbGmGet(detailUrl);
        var det = stowProbParseDetail(detailHtml, f);
        if (det.sysQty != null) sysQty = det.sysQty;
        if (det.problemQty != null) problemQty = det.problemQty;
        if (det.stowDoneQty != null) stowDoneQty = det.stowDoneQty;
      } catch (eDet) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 stow-problem] detail", eDet);
        }
      }
    }
    return {
      found: true,
      status: "오류보고 OK",
      stowProblemId: row.stowProblemId || "",
      sysQty: sysQty != null && isFinite(sysQty) ? Number(sysQty) : 0,
      problemQty:
        problemQty != null && isFinite(problemQty) ? Number(problemQty) : 0,
      stowDoneQty:
        stowDoneQty != null && isFinite(stowDoneQty) ? Number(stowDoneQty) : 0,
    };
  }

  window.__YAN4_STOW_PROBLEM_BRIDGE__ = {
    searchErrorReport: stowProbSearchErrorReport,
  };

  function initUnifiedShellPage3(hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.className = "yna4-shell-page3-inner yna4-page3-mod";
    if (typeof window.__YAN4_INIT_SHELL_PAGE3__ === "function") {
      try {
        window.__YAN4_INIT_SHELL_PAGE3__(hostEl);
        return;
      } catch (eP3) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 Shell] shell page3 init failed", eP3);
        }
      }
    }

    var statusId = ROOT_ID + "-page3-status";
    var toteList = [];
    var toteIndex = 0;
    var page3ProductName = "";
    var page3SkuBarcode = "";
    var page3TotalUnits = 0;
    var keyHandlerBound = false;

    function setStatus(msg) {
      var el = document.getElementById(statusId);
      if (el) el.textContent = String(msg || "");
    }

    function drawProductName() {
      var nameEl = document.getElementById(ROOT_ID + "-page3-product-name");
      if (nameEl) nameEl.textContent = page3ProductName || "—";
      var unitsEl = document.getElementById(ROOT_ID + "-page3-total-units");
      if (unitsEl) {
        unitsEl.textContent =
          page3TotalUnits > 0
            ? "총 유닛 " + page3TotalUnits.toLocaleString("en-US")
            : "총 유닛 —";
      }
    }

    function page3RenderBarcode(svgEl, textEl, value) {
      var clean = String(value || "").trim();
      if (!svgEl || !textEl) return;
      svgEl.innerHTML = "";
      if (!clean) {
        textEl.textContent = "값 없음";
        return;
      }
      if (typeof JsBarcode === "undefined") {
        textEl.textContent = clean + " (JsBarcode 없음)";
        return;
      }
      try {
        JsBarcode(svgEl, clean, PAGE3_JSBARCODE_OPTS);
        page3NormalizeBarcodeSvg(svgEl);
        textEl.textContent = clean;
      } catch (eBc) {
        textEl.textContent = "생성 불가";
      }
    }

    function drawSkuBarcode() {
      page3RenderBarcode(
        document.getElementById(ROOT_ID + "-page3-product-barcode-svg"),
        document.getElementById(ROOT_ID + "-page3-product-barcode-text"),
        page3SkuBarcode
      );
    }

    function drawToteBarcode() {
      var svg = document.getElementById(ROOT_ID + "-page3-barcode-svg");
      var txt = document.getElementById(ROOT_ID + "-page3-barcode-text");
      var prog = document.getElementById(ROOT_ID + "-page3-barcode-prog");
      if (!svg || !txt || !prog) return;
      if (!toteList.length) {
        page3RenderBarcode(svg, txt, "");
        prog.textContent = "0 / 0";
        return;
      }
      page3RenderBarcode(svg, txt, toteList[toteIndex]);
      prog.textContent = toteIndex + 1 + " / " + toteList.length;
    }

    function drawPage3Panels() {
      drawToteBarcode();
      drawSkuBarcode();
      drawProductName();
    }

    function toteNext() {
      if (!toteList.length || toteIndex >= toteList.length - 1) return;
      toteIndex++;
      drawToteBarcode();
    }

    function totePrev() {
      if (!toteList.length || toteIndex <= 0) return;
      toteIndex--;
      drawToteBarcode();
    }

    if (!keyHandlerBound) {
      keyHandlerBound = true;
      document.addEventListener("keydown", function (eKd) {
        if (!shellPage3BarcodeNavKeyActive(eKd)) return;
        var k = eKd.key;
        if (k === SHELL_PAGE3_BARCODE_KEY_NEXT || k === "E") {
          eKd.preventDefault();
          toteNext();
        } else if (k === SHELL_PAGE3_BARCODE_KEY_PREV || k === "Q") {
          eKd.preventDefault();
          totePrev();
        }
      });
    }

    var toolbar = document.createElement("div");
    toolbar.className = "yna4-page3-toolbar";

    var inpGc = document.createElement("input");
    inpGc.type = "text";
    inpGc.className = "yna4-pane-inp";
    inpGc.placeholder = "GC바코드 입력";
    inpGc.style.flex = "1 1 12em";
    inpGc.style.minWidth = "10em";

    var btnStart = document.createElement("button");
    btnStart.type = "button";
    btnStart.className = "yna4-pane-btn yna4-pane-btn--primary";
    btnStart.textContent = "조회";

    var btnStop = document.createElement("button");
    btnStop.type = "button";
    btnStop.className = "yna4-pane-btn";
    btnStop.textContent = "중지";
    btnStop.disabled = true;

    var statusEl = document.createElement("div");
    statusEl.id = statusId;
    statusEl.className = "yna4-pane-status";
    statusEl.style.flex = "1 1 100%";

    toolbar.appendChild(inpGc);
    toolbar.appendChild(btnStart);
    toolbar.appendChild(btnStop);
    toolbar.appendChild(statusEl);

    function page3MakeCol(titleText, bodyClass) {
      var col = document.createElement("div");
      col.className = "yna4-page3-col";
      var lbl = document.createElement("div");
      lbl.className = "yna4-page3-col-lbl";
      lbl.textContent = titleText;
      var body = document.createElement("div");
      body.className = "yna4-page3-col-body " + (bodyClass || "");
      col.appendChild(lbl);
      col.appendChild(body);
      return { col: col, body: body };
    }

    var grid = document.createElement("div");
    grid.className = "yna4-page3-grid";

    function page3AppendBarcodeBlock(body, svgId, textId) {
      var core = document.createElement("div");
      core.className = "yna4-page3-bc-core";
      var slot = document.createElement("div");
      slot.className = "yna4-page3-bc-slot";
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.id = svgId;
      var txt = document.createElement("div");
      txt.id = textId;
      txt.className = "yna4-page3-bc-text";
      slot.appendChild(svg);
      core.appendChild(slot);
      core.appendChild(txt);
      body.appendChild(core);
      return { svg: svg, text: txt, core: core };
    }

    var colTote = page3MakeCol(
      "토트바코드",
      "yna4-page3-col-body--barcode yna4-page3-barcode-pane"
    );
    var toteBc = page3AppendBarcodeBlock(
      colTote.body,
      ROOT_ID + "-page3-barcode-svg",
      ROOT_ID + "-page3-barcode-text"
    );
    var toteFoot = document.createElement("div");
    toteFoot.className = "yna4-page3-bc-foot";
    var toteProg = document.createElement("div");
    toteProg.id = ROOT_ID + "-page3-barcode-prog";
    toteProg.className = "yna4-page3-bc-prog";
    var toteNav = document.createElement("div");
    toteNav.id = ROOT_ID + "-page3-tote-nav";
    toteNav.className = "yna4-page3-tote-nav";
    toteNav.innerHTML =
      '<span class="yna4-page3-key">Q</span> 이전 · <span class="yna4-page3-key">E</span> 다음';
    toteFoot.appendChild(toteProg);
    toteFoot.appendChild(toteNav);
    colTote.body.appendChild(toteFoot);

    var colSku = page3MakeCol(
      "상품바코드",
      "yna4-page3-col-body--barcode yna4-page3-barcode-pane"
    );
    page3AppendBarcodeBlock(
      colSku.body,
      ROOT_ID + "-page3-product-barcode-svg",
      ROOT_ID + "-page3-product-barcode-text"
    );
    var skuFoot = document.createElement("div");
    skuFoot.className = "yna4-page3-bc-foot yna4-page3-bc-foot--spacer";
    colSku.body.appendChild(skuFoot);

    var colNotice = page3MakeCol("확인", "yna4-page3-col-body--notice");
    var noticeEl = document.createElement("div");
    noticeEl.className = "yna4-page3-qty-notice";
    noticeEl.textContent = "실물수량확인!";
    colNotice.body.appendChild(noticeEl);

    grid.appendChild(colTote.col);
    grid.appendChild(colSku.col);
    grid.appendChild(colNotice.col);

    var nameFoot = document.createElement("div");
    nameFoot.className = "yna4-page3-name-foot";
    var nameHead = document.createElement("div");
    nameHead.className = "yna4-page3-name-head";
    var nameLbl = document.createElement("div");
    nameLbl.className = "yna4-page3-name-lbl";
    nameLbl.textContent = "상품명";
    var unitsEl = document.createElement("div");
    unitsEl.id = ROOT_ID + "-page3-total-units";
    unitsEl.className = "yna4-page3-total-units";
    unitsEl.textContent = "총 유닛 —";
    nameHead.appendChild(nameLbl);
    nameHead.appendChild(unitsEl);
    var nameEl = document.createElement("div");
    nameEl.id = ROOT_ID + "-page3-product-name";
    nameEl.className = "yna4-page3-name-val";
    nameFoot.appendChild(nameHead);
    nameFoot.appendChild(nameEl);

    hostEl.appendChild(toolbar);
    hostEl.appendChild(nameFoot);
    hostEl.appendChild(grid);
    drawPage3Panels();

    function setBusy(on) {
      xferGcPipelineBusy = on;
      btnStart.disabled = on;
      btnStop.disabled = !on;
      inpGc.disabled = on;
    }

    btnStop.addEventListener("click", function () {
      if (!xferGcPipelineBusy) return;
      xferGcPipelineStop = true;
      setStatus("중지 요청…");
    });

    btnStart.addEventListener("click", async function () {
      if (xferGcPipelineBusy) return;
      var gc = String(inpGc.value || "").trim();
      if (!gc) {
        setStatus("GC 바코드를 입력하세요");
        return;
      }
      xferGcPipelineStop = false;
      setBusy(true);
      toteList = [];
      toteIndex = 0;
      page3ProductName = "";
      page3SkuBarcode = "";
      page3TotalUnits = 0;
      drawPage3Panels();
      setStatus("조회 중…");
      try {
        var pipeResult = await xferOpCollectToteBarcodesFromPipeline(gc, setStatus);
        toteList = (pipeResult && pipeResult.toteBarcodes) || [];
        page3ProductName =
          (pipeResult && pipeResult.productName) || "";
        page3SkuBarcode = (pipeResult && pipeResult.skuBarcode) || "";
        page3TotalUnits =
          pipeResult && pipeResult.totalUnits > 0
            ? Number(pipeResult.totalUnits)
            : 0;
        drawPage3Panels();
        var unitsTxt =
          page3TotalUnits > 0
            ? " · 총 유닛 " + page3TotalUnits.toLocaleString("en-US")
            : "";
        if (xferGcPipelineStop) {
          setStatus("중지됨 · 토트 " + toteList.length + "건" + unitsTxt);
        } else if (!toteList.length) {
          setStatus("토트바코드 없음");
        } else {
          setStatus(
            "완료 · 토트 " +
              toteList.length +
              "건" +
              unitsTxt +
              (page3SkuBarcode ? " · 상품 1" : "") +
              " (" +
              xferOpDiagText(pipeResult && pipeResult.diag) +
              ")"
          );
        }
        toteIndex = 0;
        drawToteBarcode();
      } catch (eRun) {
        setStatus(
          "오류: " + (eRun && eRun.message ? eRun.message : String(eRun))
        );
      } finally {
        setBusy(false);
        xferGcPipelineStop = false;
      }
    });

    inpGc.addEventListener("keydown", function (eIn) {
      if (eIn.key === "Enter" && !xferGcPipelineBusy) btnStart.click();
    });
  }

  function initUnifiedShellPageSla(hostEl) {
    if (!hostEl) return;
    hostEl.removeAttribute("data-yna4-sla-ready");
    hostEl.textContent = "";
    hostEl.className = "yna4-shell-page-sla-inner";
    if (typeof window.__YAN4_INIT_SHELL_PAGE_SLA__ === "function") {
      try {
        window.__YAN4_INIT_SHELL_PAGE_SLA__(hostEl);
        return;
      } catch (eSla) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 Shell] shell SLA init failed", eSla);
        }
      }
    }
    var placeholderSla = document.createElement("div");
    placeholderSla.className = "yna4-shell-page-sla-placeholder";
    placeholderSla.textContent = "SLA — 준비 중";
    hostEl.appendChild(placeholderSla);
  }

  function initUnifiedShellPageAts(hostEl) {
    if (!hostEl) return;
    hostEl.removeAttribute("data-yna4-ats-ready");
    hostEl.textContent = "";
    hostEl.className = "yna4-shell-page-ats-inner";
    if (typeof window.__YAN4_INIT_SHELL_PAGE_ATS__ === "function") {
      try {
        window.__YAN4_INIT_SHELL_PAGE_ATS__(hostEl);
        return;
      } catch (eAts) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 Shell] shell ATS init failed", eAts);
        }
      }
    }
    var placeholder = document.createElement("div");
    placeholder.className = "yna4-shell-page-ats-placeholder";
    placeholder.textContent = "ATS — 준비 중";
    hostEl.appendChild(placeholder);
  }

  function initUnifiedShellPage4(hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.className = "yna4-shell-page-sla-inner";
    if (typeof window.__YAN4_INIT_SHELL_PAGE4__ === "function") {
      try {
        window.__YAN4_INIT_SHELL_PAGE4__(hostEl);
        return;
      } catch (eP4) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 Shell] shell page4 init failed", eP4);
        }
      }
    }
    var placeholder = document.createElement("div");
    placeholder.className = "yna4-shell-page-sla-placeholder";
    placeholder.textContent = "4페이지 — STOW Error Tracking 로드 실패";
    hostEl.appendChild(placeholder);
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

    /** MOS HTTP — Tampermonkey와 동일: GM(확장=gm-bridge) → 탭 fetch → background 보조 */
    async function nhMosHttpRequest(method, url, refererFull, postData) {
      var ref = String(refererFull || "").trim();
      var m = String(method || "GET").toUpperCase();
      var mosHeaders = {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        Referer: ref,
      };

      if (typeof GM_xmlhttpRequest === "function") {
        return await new Promise(function (resolve, reject) {
          var gmOpts = {
            method: m,
            url: url,
            anonymous: false,
            headers: mosHeaders,
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
          };
          if (m === "POST") gmOpts.data = postData == null ? "" : String(postData);
          GM_xmlhttpRequest(gmOpts);
        });
      }

      var fetchOpts = {
        method: m,
        credentials: "include",
        headers: mosHeaders,
      };
      if (m === "POST") fetchOpts.body = postData == null ? "" : String(postData);
      var res = await fetch(url, fetchOpts);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return String((await res.text()) || "");
    }

    async function nhMosHttpRequestViaBackground(method, url, refererFull, postData) {
      if (
        typeof chrome === "undefined" ||
        !chrome.runtime ||
        !chrome.runtime.id ||
        typeof chrome.runtime.sendMessage !== "function"
      ) {
        throw new Error("background fetch 불가");
      }
      var ref = String(refererFull || "").trim();
      var m = String(method || "GET").toUpperCase();
      return await new Promise(function (resolve, reject) {
        try {
          var msg = { type: "yan4MosFetch", url: url, referer: ref, method: m };
          if (m === "POST") msg.body = postData == null ? "" : String(postData);
          chrome.runtime.sendMessage(msg, function (resp) {
            try {
              var le = chrome.runtime.lastError;
              if (le) {
                reject(new Error(le.message));
                return;
              }
              if (!resp || !resp.ok) {
                reject(
                  new Error(
                    (resp && resp.error) ||
                      (m === "POST" ? "MOS 호출 실패" : "MOS fetch 실패")
                  )
                );
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
          });
        } catch (e1) {
          reject(e1);
        }
      });
    }

    async function nhFetchMosText(url, refererFull) {
      try {
        return await nhMosHttpRequest("GET", url, refererFull);
      } catch (eGm) {
        return await nhMosHttpRequestViaBackground("GET", url, refererFull);
      }
    }

    async function nhPostMosEmpty(url, refererFull) {
      try {
        return await nhMosHttpRequest("POST", url, refererFull, "");
      } catch (eGm) {
        return await nhMosHttpRequestViaBackground("POST", url, refererFull, "");
      }
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

    /** 0~6시(자정~06시)는 당일 야간 연속으로 24~30시 표기 */
    function nhDisplayHourLabel(h) {
      var hour = Number(h);
      if (!isFinite(hour) || hour < 0 || hour > 23) return "—";
      if (hour >= 0 && hour <= 6) return String(hour + 24) + "시";
      return String(hour) + "시";
    }

    /** 근무일 시간순: 7~23시 → 24~30시(0~6시) */
    function nhHourSortKey(h) {
      var hour = Number(h);
      if (!isFinite(hour) || hour < 0 || hour > 23) return -1;
      if (hour >= 0 && hour <= 6) return hour + 24;
      return hour;
    }

    function nhActiveHoursSorted(agg) {
      var hours = [];
      var h;
      for (h = 0; h < 24; h++) {
        var u0 = agg.unitByHour[h] || 0;
        var m0 = agg.minByHour[h] || 0;
        if (u0 >= 0.0001 || m0 >= 0.0001) hours.push(h);
      }
      hours.sort(function (a, b) {
        return nhHourSortKey(a) - nhHourSortKey(b);
      });
      return hours;
    }

    function nhWorkerLastSlotMetrics(agg) {
      var active = nhActiveHoursSorted(agg);
      if (!active.length) {
        return {
          lastH: -1,
          slotLabel: "—",
          uphNum: Infinity,
          uphDisplay: "—",
          cumAtLast: 0,
        };
      }
      var lastH = active[active.length - 1];
      var u = agg.unitByHour[lastH] || 0;
      var m = agg.minByHour[lastH] || 0;
      var uphRounded = m > 0.0001 ? Math.round((u * 60) / m) : null;
      var running = 0;
      var i;
      for (i = 0; i < active.length; i++) {
        running += agg.unitByHour[active[i]] || 0;
      }
      return {
        lastH: lastH,
        slotLabel: nhDisplayHourLabel(lastH),
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
      var activeHours = nhActiveHoursSorted(agg);
      var runningCum = 0;
      var hi;
      for (hi = 0; hi < activeHours.length; hi++) {
        var h = activeHours[hi];
        var u = agg.unitByHour[h] || 0;
        var m = agg.minByHour[h] || 0;
        runningCum += u;
        var tr = document.createElement("tr");
        var tdNm = document.createElement("td");
        tdNm.textContent = String(dispName);
        var tdSlot = document.createElement("td");
        tdSlot.textContent = nhDisplayHourLabel(h);
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
        var centerId = cfsActiveCenterId(MOS_CENTER_ID);
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

  /** 입고내역 RWA (RPA) — 쉘 2페이지 */
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
    "진열작업자",
    "박스내 수량",
  ];
  var RECV_SKU_PAGE_BASE = "https://inventory.coupang.com/sku/";
  var RECV_SKU_LIST_REFERER = "https://inventory.coupang.com/sku/list";
  var RECV_SKU_DELAY_MS = 100;
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

  function recvBuildPagingUrl(page, toteFilter, ymd) {
    var q = new URLSearchParams({
      page: String(page),
      cartBarcode: toteFilter || "",
      workerUserUserId: "",
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

  function recvToteMatches(row, toteFilter) {
    if (!toteFilter) return true;
    var tote = String(row.toteBarcode || "").replace(/\s+/g, "").toUpperCase();
    var prefix = toteFilter.toUpperCase();
    if (tote.indexOf(prefix) !== 0) return false;
    return tote.length === prefix.length || tote.charAt(prefix.length) === "-";
  }

  function recvTotePrefixes(toteFilter) {
    return String(toteFilter || "")
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  /** 토트 접두어별 동시 조회 — 각 행에 _toteGroup(접두어) 부여 · 서버 필터 0건이면 하루 전체(1회)에서 골라냄 */
  async function recvFetchAllListRows(toteFilter, ymd, onProgress) {
    var prefixes = recvTotePrefixes(toteFilter);
    if (!prefixes.length) return recvFetchListPages("", ymd, onProgress);
    var pickFor = function (rows, prefix) {
      return rows.filter(function (r) {
        return recvToteMatches(r, prefix);
      });
    };
    var hits = await Promise.all(
      prefixes.map(function (prefix) {
        var label = prefix.replace(/^\d+-/, "");
        return recvFetchListPages(prefix, ymd, function (msg) {
          if (onProgress) onProgress(label + " " + msg);
        }).then(function (rows) {
          return pickFor(rows, prefix);
        });
      })
    );
    var needDay = hits.every(function (h) {
      return !h.length;
    });
    if (needDay && !recvExportStop) {
      var dayRows = await recvFetchListPages("", ymd, onProgress);
      hits = hits.map(function (h, i) {
        return h.length ? h : pickFor(dayRows, prefixes[i]);
      });
    }
    var out = [];
    hits.forEach(function (h, i) {
      h.forEach(function (r) {
        r._toteGroup = prefixes[i];
        out.push(r);
      });
    });
    return out;
  }

  async function recvFetchListPages(toteFilter, ymd, onProgress) {
    var all = [];
    var page = 0;
    var firstSig = null;
    while (page < RECV_PAGE_CAP) {
      if (recvExportStop) break;
      if (onProgress) onProgress("목록 " + (page + 1) + "페이지…");
      var html = await recvGmGet(recvBuildPagingUrl(page, toteFilter, ymd));
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
    var stowWorker = "";
    if (stowTable) {
      var tmap = recvHeaderIndexMap(stowTable);
      var iLoc = recvFindCol(tmap, ["로케이션"]);
      var iStowWorker = recvFindCol(tmap, ["진열작업자", "작업자"]);
      var str = stowTable.querySelector("tbody tr");
      if (str) {
        var stds = str.querySelectorAll("td");
        if (iLoc >= 0 && stds[iLoc]) stowLocation = recvCellText(stds[iLoc]);
        if (iStowWorker >= 0 && stds[iStowWorker]) {
          stowWorker = recvCellText(stds[iStowWorker]);
        }
      }
    }
    var pe = recvClassifyPeach(stowLocation);
    return {
      productName: productName,
      stowLocation: pe.location,
      peach: pe.peach,
      stowWorker: stowWorker,
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

  /** 상품관리 파레트 정보 「박스내 수량 N개」 → N */
  function recvParseSkuBoxQty(html) {
    var text = String(html || "").replace(/\u00a0/g, " ");
    try {
      var doc = new DOMParser().parseFromString(text, "text/html");
      if (doc && doc.body) {
        text = String(doc.body.innerText || doc.body.textContent || text);
      }
    } catch (eDom) {}
    text = text.replace(/\s+/g, " ");
    var m = text.match(/박스\s*내\s*수량\s*(\d+)\s*개/i);
    if (!m) m = text.match(/박스\s*내\s*수량[^\d]{0,40}(\d+)/i);
    if (!m) m = text.match(/Units?\s*per\s*(?:Case|Carton|Box)[^\d]{0,20}(\d+)/i);
    return m ? parseInt(m[1], 10) : "";
  }

  async function recvFetchSkuBoxQty(skuId) {
    var id = String(skuId || "").replace(/\D/g, "");
    if (!id) return "";
    var url = RECV_SKU_PAGE_BASE + id;
    try {
      var html = await unloadGapInventoryRequest({
        url: url,
        referer: RECV_SKU_LIST_REFERER,
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      });
      var n = recvParseSkuBoxQty(html);
      return n === "" || !isFinite(n) || n < 0 ? "" : n;
    } catch (eSku) {
      return "";
    }
  }

  /** 상세 보강 후 SKUID별 박스내 수량(N열) — 동일 SKU는 1회만 조회 */
  async function recvEnrichRowsWithBoxQty(rows, onProgress) {
    var cache = Object.create(null);
    var unique = [];
    var seen = Object.create(null);
    var i, id;
    for (i = 0; i < rows.length; i++) {
      id = String(rows[i].skuId || "").replace(/\D/g, "");
      if (!id || seen[id]) continue;
      seen[id] = 1;
      unique.push(id);
    }
    for (i = 0; i < unique.length; i++) {
      if (recvExportStop) break;
      id = unique[i];
      if (onProgress) {
        onProgress("박스내 수량 " + (i + 1) + "/" + unique.length + " (SKU " + id + ")…");
      }
      cache[id] = await recvFetchSkuBoxQty(id);
      await recvSleep(RECV_SKU_DELAY_MS);
    }
    return rows.map(function (r) {
      var sid = String(r.skuId || "").replace(/\D/g, "");
      return Object.assign({}, r, {
        boxQty: sid && cache[sid] != null ? cache[sid] : "",
      });
    });
  }

  var RECV_PROD_COL_HEADERS = [
    "작업자",
    "구역",
    "진열량(건)",
    "MH",
    "유닛",
    "생산성",
  ];
  /** LET 결과 4열: Worker, MH, Unit, UPH */
  var RECV_LET_COL_COUNT = 4;
  var RECV_PRESTO_STORAGE_KEYS = [
    "yan4PrestoUser",
    "yan4PrestoPassword",
    "yan4PrestoHost",
  ];
  var RECV_LET_COL_HEADERS = ["작업자", "MH", "Unit", "UPH"];

  function recvUniqueStowWorkers(rows) {
    var seen = Object.create(null);
    var out = [];
    (rows || []).forEach(function (r) {
      var w = String((r && r.stowWorker) || "").trim();
      if (!w || seen[w]) return;
      seen[w] = 1;
      out.push(w);
    });
    out.sort();
    return out;
  }

  /** G열 입고작업자 고유 수 — LET 펼침 행 추정용 */
  function recvUniqueReceiveWorkers(rows) {
    var seen = Object.create(null);
    var out = [];
    (rows || []).forEach(function (r) {
      var w = String((r && r.worker) || "").trim();
      if (!w || seen[w]) return;
      seen[w] = 1;
      out.push(w);
    });
    return out;
  }

  function recvWriteSheetCell(ws, r, c, v) {
    var addr = XLSX.utils.encode_cell({ r: r, c: c });
    if (v === "" || v == null) {
      ws[addr] = { t: "s", v: "" };
      return;
    }
    if (typeof v === "number" && isFinite(v)) {
      ws[addr] = { t: "n", v: v };
      return;
    }
    var num = Number(v);
    if (
      typeof v !== "boolean" &&
      String(v).trim() !== "" &&
      isFinite(num) &&
      /^-?\d+(\.\d+)?$/.test(String(v).trim())
    ) {
      ws[addr] = { t: "n", v: num };
      return;
    }
    ws[addr] = { t: "s", v: String(v) };
  }

  function recvYmdToDayInt(ymd) {
    return parseInt(String(ymd || "").replace(/\D/g, ""), 10) || 0;
  }

  /** LET 수식과 동일 계산 — SheetJS 동적배열이 Excel에서 깨져서 값으로 기입 */
  function recvParseReceivedAtMs(v) {
    var s = String(v == null ? "" : v).trim();
    if (!s) return NaN;
    var t = Date.parse(s.replace(/-/g, "/"));
    if (isFinite(t)) return t;
    var m = s.match(
      /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
    );
    if (!m) return NaN;
    return new Date(
      +m[1],
      +m[2] - 1,
      +m[3],
      +(m[4] || 0),
      +(m[5] || 0),
      +(m[6] || 0)
    ).getTime();
  }

  function recvComputeExcelProductivity(rows) {
    var map = Object.create(null);
    (rows || []).forEach(function (r) {
      var w = String((r && r.worker) || "").trim();
      if (!w || w === "입고작업자") return;
      var qty = Number(String((r && r.qty) || "").replace(/,/g, ""));
      if (!isFinite(qty)) qty = 0;
      var t = recvParseReceivedAtMs(r && r.receivedAt);
      if (!map[w]) {
        map[w] = { worker: w, qty: 0, minT: Infinity, maxT: -Infinity };
      }
      map[w].qty += qty;
      if (isFinite(t)) {
        if (t < map[w].minT) map[w].minT = t;
        if (t > map[w].maxT) map[w].maxT = t;
      }
    });
    return Object.keys(map)
      .sort()
      .map(function (k) {
        var o = map[k];
        var mh = 0;
        if (o.minT < Infinity && o.maxT > -Infinity && o.maxT >= o.minT) {
          mh =
            Math.round(((o.maxT - o.minT) / 3600000) * (8 / 9) * 100) / 100;
        }
        var uph = mh > 0 ? Math.round(o.qty / mh) : 0;
        return { worker: o.worker, mh: mh, unit: o.qty, uph: uph };
      });
  }

  function recvBuildProductivitySql(ymd, workers, centerId) {
    var day = recvYmdToDayInt(ymd);
    var year = parseInt(String(ymd || "").slice(0, 4), 10) || new Date().getFullYear();
    var cid =
      String(centerId || cfsActiveCenterId("1007")).replace(/\D/g, "") || "1007";
    var loc22 = String(cid).toLowerCase() + "-rcrt22%";
    var loc44 = String(cid).toLowerCase() + "-rcrt44%";
    var ids = (workers || [])
      .map(function (w) {
        return "'" + String(w).replace(/'/g, "''") + "'";
      })
      .join(",\n        ");
    return [
      "WITH workers AS (",
      "    SELECT * FROM (VALUES",
      "        " + ids,
      "    ) AS t (workerloginid)",
      "),",
      "logs AS (",
      "    SELECT lg.workerloginid, lg.createdat, lg.adjustquantity, lg.sourceinventoryid",
      "    FROM hive.ods.inventory_expanded_logs lg",
      "    JOIN workers w ON w.workerloginid = lg.workerloginid",
      "    WHERE lg.createdat_day = " + day,
      "      AND lg.centerid = " + cid,
      "      AND lg.jobtype = 'STOWING'",
      "),",
      "src AS (",
      "    SELECT i.id, l2.fullname",
      "    FROM hive.ods.inventories i",
      "    JOIN (SELECT DISTINCT sourceinventoryid FROM logs) k",
      "      ON i.id = k.sourceinventoryid",
      "    JOIN hive.ods.lots l2",
      "      ON l2.id = i.lotid",
      "    WHERE i.createdat_year = " + year,
      "),",
      "ev AS (",
      "    SELECT",
      "        lg.workerloginid,",
      "        lg.createdat,",
      "        lg.adjustquantity,",
      "        CASE",
      "            WHEN LOWER(s.fullname) LIKE '" + loc22 + "' THEN 'RCRT22'",
      "            WHEN LOWER(s.fullname) LIKE '" + loc44 + "' THEN 'RCRT44'",
      "            ELSE 'OTHER'",
      "        END AS area",
      "    FROM logs lg",
      "    JOIN src s ON s.id = lg.sourceinventoryid",
      "),",
      "seq AS (",
      "    SELECT",
      "        *,",
      "        ROW_NUMBER() OVER (PARTITION BY workerloginid ORDER BY createdat, area)",
      "      - ROW_NUMBER() OVER (PARTITION BY workerloginid, area ORDER BY createdat) AS grp",
      "    FROM ev",
      "),",
      "runs AS (",
      "    SELECT",
      "        workerloginid, area, grp,",
      "        COUNT(*) AS scans,",
      "        SUM(adjustquantity) AS units,",
      "        DATE_DIFF('second', MIN(createdat), MAX(createdat)) AS span_sec",
      "    FROM seq",
      "    WHERE area IN ('RCRT22', 'RCRT44')",
      "    GROUP BY workerloginid, area, grp",
      ")",
      "SELECT",
      "    COALESCE(workerloginid, '합계') AS worker,",
      "    area,",
      "    SUM(scans) AS stow_cnt,",
      "    ROUND(SUM(span_sec) / 3600.0 * 8 / 9, 2) AS mh,",
      "    SUM(units) AS units,",
      "    ROUND(SUM(units) / NULLIF(SUM(span_sec) / 3600.0 * 8 / 9, 0), 2) AS productivity",
      "FROM runs",
      "GROUP BY GROUPING SETS ((area, workerloginid), (area))",
      "ORDER BY area, GROUPING(workerloginid), workerloginid",
    ].join("\n");
  }

  function recvMapPrestoProductivityRows(result) {
    var idx = Object.create(null);
    ((result && result.columns) || []).forEach(function (name, i) {
      idx[String(name || "").toLowerCase()] = i;
    });
    return ((result && result.rows) || []).map(function (row) {
      function cell(name) {
        var v = row && idx[name] != null ? row[idx[name]] : "";
        return v == null ? "" : v;
      }
      return {
        worker: cell("worker"),
        area: cell("area"),
        stowCnt: cell("stow_cnt"),
        mh: cell("mh"),
        units: cell("units"),
        productivity: cell("productivity"),
      };
    });
  }

  function recvFilterProdRowsForSheet(prodRows, sheetName) {
    var sn = String(sheetName || "").toUpperCase();
    if (sn.indexOf("RCRT22") >= 0) {
      return (prodRows || []).filter(function (r) {
        return String(r.area || "").toUpperCase() === "RCRT22";
      });
    }
    if (sn.indexOf("RCRT44") >= 0) {
      return (prodRows || []).filter(function (r) {
        return String(r.area || "").toUpperCase() === "RCRT44";
      });
    }
    return prodRows || [];
  }

  /**
   * O열 비움(여백) · P열 3행부터 세로 배치:
   *  위 — 「Receive 생산성」
   *  아래 — 「Stow 생산성」
   */
  function recvApplyProductivityBlock(ws, prodRows, sheetRows) {
    if (!ws) return;
    var startCol = 15; // P (O=14 여백)
    var titleR = 2; // Excel 3행
    var headerR = titleR + 1;
    var dataR0 = headerR + 1;
    var letEndCol = startCol + RECV_LET_COL_COUNT - 1;
    var prestoEndCol = startCol + RECV_PROD_COL_HEADERS.length - 1;
    var excelRows = recvComputeExcelProductivity(sheetRows || []);
    var c;

    if (!ws["!merges"]) ws["!merges"] = [];

    // --- 위: 엑셀 계산값 (LET 대체) ---
    for (c = startCol; c <= letEndCol; c++) {
      recvWriteSheetCell(
        ws,
        titleR,
        c,
        c === startCol ? "Receive 생산성" : ""
      );
      recvWriteSheetCell(ws, headerR, c, RECV_LET_COL_HEADERS[c - startCol]);
    }
    ws["!merges"].push({
      s: { r: titleR, c: startCol },
      e: { r: titleR, c: letEndCol },
    });
    excelRows.forEach(function (r, ri) {
      var row = dataR0 + ri;
      recvWriteSheetCell(ws, row, startCol, r.worker);
      recvWriteSheetCell(ws, row, startCol + 1, r.mh);
      recvWriteSheetCell(ws, row, startCol + 2, r.unit);
      recvWriteSheetCell(ws, row, startCol + 3, r.uph);
    });

    var excelLastR = headerR + Math.max(excelRows.length, 1);
    var prestoTitleR = excelLastR + 2;
    var prestoHeaderR = prestoTitleR + 1;
    var prestoDataR = prestoHeaderR + 1;

    // --- 아래: Presto ---
    for (c = startCol; c <= prestoEndCol; c++) {
      recvWriteSheetCell(
        ws,
        prestoTitleR,
        c,
        c === startCol ? "Stow 생산성" : ""
      );
      recvWriteSheetCell(
        ws,
        prestoHeaderR,
        c,
        RECV_PROD_COL_HEADERS[c - startCol]
      );
    }
    ws["!merges"].push({
      s: { r: prestoTitleR, c: startCol },
      e: { r: prestoTitleR, c: prestoEndCol },
    });

    (prodRows || []).forEach(function (r, ri) {
      var row = prestoDataR + ri;
      var vals = [
        r.worker,
        r.area,
        r.stowCnt,
        r.mh,
        r.units,
        r.productivity,
      ];
      vals.forEach(function (v, vi) {
        recvWriteSheetCell(ws, row, startCol + vi, v);
      });
    });

    var range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    if (range.e.c < prestoEndCol) range.e.c = prestoEndCol;
    var lastProd =
      prestoDataR +
      Math.max((prodRows && prodRows.length) || 0, 1) -
      1;
    if (range.e.r < lastProd) range.e.r = lastProd;
    if (range.e.r < prestoHeaderR) range.e.r = prestoHeaderR;
    ws["!ref"] = XLSX.utils.encode_range(range);
  }

  async function recvFetchProductivityRows(ymd, workers, onProgress) {
    if (!workers || !workers.length) {
      return { rows: [], note: "진열작업자 없음 · 생산성 생략" };
    }
    if (
      !window.__YAN4_DESKTOP_SHELL__ ||
      !window.yan4ShellDesktop ||
      typeof window.yan4ShellDesktop.prestoQuery !== "function"
    ) {
      return { rows: [], note: "데스크톱에서만 Presto 조회 가능" };
    }
    if (onProgress) onProgress("Presto 생산성 조회 중… (작업자 " + workers.length + "명)");
    var sql = recvBuildProductivitySql(
      ymd,
      workers,
      cfsActiveCenterId("1007")
    );
    var res = await window.yan4ShellDesktop.prestoQuery({ sql: sql });
    if (!res || !res.ok) {
      throw new Error((res && res.error) || "Presto 조회 실패");
    }
    return {
      rows: recvMapPrestoProductivityRows(res),
      note: "생산성 " + ((res.rows && res.rows.length) || 0) + "행",
    };
  }

  function recvDownloadExcel(rows, ymd, toteFilter, prodRows) {
    if (typeof XLSX === "undefined") {
      throw new Error("XLSX 라이브러리 없음");
    }
    var toSheet = function (list, sheetName) {
      var data = [RECV_EXCEL_HEADERS.slice()];
      list.forEach(function (r) {
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
          r.stowWorker || "",
          r.boxQty != null && r.boxQty !== "" ? r.boxQty : "",
        ]);
      });
      var ws = XLSX.utils.aoa_to_sheet(data);
      recvApplyProductivityBlock(
        ws,
        recvFilterProdRowsForSheet(prodRows || [], sheetName),
        list
      );
      return ws;
    };
    var prefixes = recvTotePrefixes(toteFilter);
    var wb = XLSX.utils.book_new();
    if (prefixes.length > 1) {
      prefixes.forEach(function (prefix) {
        var sheetName = prefix.replace(/^\d+-/, "").slice(0, 31);
        XLSX.utils.book_append_sheet(
          wb,
          toSheet(
            rows.filter(function (r) {
              return r._toteGroup === prefix;
            }),
            sheetName
          ),
          sheetName
        );
      });
    } else {
      XLSX.utils.book_append_sheet(wb, toSheet(rows, "입고내역"), "입고내역");
    }
    var suffix = prefixes.length
      ? "_" +
        prefixes
          .map(function (p, i) {
            return i ? p.replace(/^\d+-/, "") : p;
          })
          .join("_")
      : "";
    return recvSaveWorkbook(wb, "입고내역_" + ymd + suffix + ".xlsx");
  }

  function recvSaveWorkbook(wb, filename) {
    if (
      !window.__YAN4_DESKTOP_SHELL__ ||
      typeof chrome === "undefined" ||
      !chrome.runtime ||
      typeof chrome.runtime.sendMessage !== "function"
    ) {
      XLSX.writeFile(wb, filename);
      return Promise.resolve(filename);
    }
    var b64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(
        { type: "yan4SaveToDownloads", filename: filename, base64: b64 },
        function (resp) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || "저장 실패"));
            return;
          }
          if (resp && resp.ok) {
            resolve(resp.filename || filename);
            return;
          }
          reject(new Error((resp && resp.error) || "저장 실패"));
        }
      );
    });
  }

  function initReceiveReportExportPane(paneBody) {
    if (!paneBody) return;
    paneBody.textContent = "";

    var mod = document.createElement("div");
    mod.className = "yna4-pane-mod yna4-pane-mod--recv";

    var rowTote = document.createElement("div");
    rowTote.className = "yna4-pane-row";
    var lblT = document.createElement("span");
    lblT.className = "yna4-pane-k";
    lblT.textContent = "토트바코드";
    var selTote = document.createElement("select");
    selTote.id = ROOT_ID + "-recv-tote";
    selTote.className = "yna4-pane-inp";
    selTote.style.flex = "1";
    selTote.style.minWidth = "0";
    [
      { v: "1007-RCRT22", t: "1007-RCRT22" },
      { v: "1007-RCRT44", t: "1007-RCRT44" },
      { v: "1007-RCRT22,1007-RCRT44", t: "RCRT22 + RCRT44 (시트 분리)" },
      { v: "", t: "전체" },
    ].forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o.v;
      opt.textContent = o.t;
      selTote.appendChild(opt);
    });
    rowTote.appendChild(lblT);
    rowTote.appendChild(selTote);

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
    inpD.style.minWidth = "0";
    rowDate.appendChild(lblD);
    rowDate.appendChild(inpD);

    var prestoAcc = buildPrestoAccountRow();
    var rowPresto = prestoAcc.row;
    var inpPrestoUser = prestoAcc.user;
    var inpPrestoPw = prestoAcc.pw;

    var actions = document.createElement("div");
    actions.className = "yna4-pane-actions";
    var btnSavePresto = document.createElement("button");
    btnSavePresto.type = "button";
    btnSavePresto.className = "yna4-pane-btn";
    btnSavePresto.textContent = "계정 저장";
    var btnRun = document.createElement("button");
    btnRun.type = "button";
    btnRun.id = ROOT_ID + "-recv-run";
    btnRun.className = "yna4-pane-btn yna4-pane-btn--primary";
    btnRun.textContent = "작업 시작";
    var btnStop = document.createElement("button");
    btnStop.type = "button";
    btnStop.id = ROOT_ID + "-recv-stop";
    btnStop.className = "yna4-pane-btn yna4-pane-btn--danger";
    btnStop.textContent = "작업 중지";
    btnStop.disabled = true;
    actions.appendChild(btnSavePresto);
    actions.appendChild(btnRun);
    actions.appendChild(btnStop);

    var status = document.createElement("div");
    status.id = ROOT_ID + "-recv-status";
    status.className = "yna4-pane-status";
    status.textContent = "토트 · 날짜 선택 후 작업 시작 (생산성은 Presto 계정 저장 후)";

    mod.appendChild(rowTote);
    mod.appendChild(rowDate);
    mod.appendChild(rowPresto);
    mod.appendChild(actions);
    mod.appendChild(status);
    paneBody.appendChild(mod);

    function setRecvStatus(msg) {
      status.textContent = msg || "";
    }

    function setRecvRunning(on) {
      recvExportRunning = on;
      btnRun.disabled = on;
      btnStop.disabled = !on;
      btnSavePresto.disabled = on;
    }

    bindPrestoAccountInputs(
      prestoAcc,
      function (store) {
        if (store.yan4PrestoUser) {
          setRecvStatus(
            "Presto 계정 저장됨 (" +
              store.yan4PrestoUser +
              ") · 토트·날짜 후 작업 시작"
          );
        }
      },
      function (u) {
        if (recvExportRunning) return;
        setRecvStatus(
          "Presto 계정 저장 완료 (" + u + ") · 개인 AD여야 로컬 조회 가능"
        );
      }
    );

    btnSavePresto.addEventListener("click", async function () {
      await prestoSaveAccount(inpPrestoUser.value, inpPrestoPw.value);
    });

    btnRun.addEventListener("click", async function () {
      if (recvExportRunning) return;
      var toteFilter = String(selTote.value || "").trim();
      var ymd = String(inpD.value || "").trim();
      if (!ymd) {
        alert("입고일시를 선택하세요.");
        return;
      }
      recvExportStop = false;
      setRecvRunning(true);
      setRecvStatus("시작…");
      try {
        var listRows = await recvFetchAllListRows(toteFilter, ymd, setRecvStatus);
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
        setRecvStatus(
          "목록 " + enriched.length + "행 · 박스내 수량(상품관리) 조회…"
        );
        enriched = await recvEnrichRowsWithBoxQty(enriched, setRecvStatus);
        if (recvExportStop) {
          setRecvStatus("중단됨");
          return;
        }
        var workers = recvUniqueStowWorkers(enriched);
        var prodRows = [];
        var prodNote = "";
        try {
          var prodPack = await recvFetchProductivityRows(
            ymd,
            workers,
            setRecvStatus
          );
          prodRows = (prodPack && prodPack.rows) || [];
          prodNote = (prodPack && prodPack.note) || "";
        } catch (eProd) {
          prodNote =
            "생산성 조회 실패: " +
            (eProd && eProd.message ? eProd.message : String(eProd));
          setRecvStatus(prodNote + " · 입고내역만 저장 진행…");
        }
        if (recvExportStop) {
          setRecvStatus("중단됨");
          return;
        }
        var savedName = await recvDownloadExcel(
          enriched,
          ymd,
          toteFilter,
          prodRows
        );
        setRecvStatus(
          "완료 · " +
            enriched.length +
            "행 Excel 저장 (다운로드/" +
            savedName +
            ")" +
            (prodNote ? " · " + prodNote : "")
        );
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

  /**
   * Presto 계정 칸 — 입고내역 RWA · STOW SCAN TRACKING 공용.
   * 같은 저장값을 쓰고, 한쪽에서 저장하면 "yan4-presto-account-saved" 로 다른 칸도 바로 바뀜.
   */
  var PRESTO_ACCOUNT_SAVED_EVENT = "yan4-presto-account-saved";

  function buildPrestoAccountRow() {
    var row = document.createElement("div");
    row.className = "yna4-pane-row";
    var lbl = document.createElement("span");
    lbl.className = "yna4-pane-k";
    lbl.textContent = "ID";
    var user = document.createElement("input");
    user.type = "text";
    user.className = "yna4-pane-inp";
    user.placeholder = "개인 AD ID";
    user.autocomplete = "off";
    user.title = "서비스 계정(svc) 불가 · DBeaver와 같은 개인 AD";
    user.style.flex = "1";
    user.style.minWidth = "4em";
    var pw = document.createElement("input");
    pw.type = "password";
    pw.className = "yna4-pane-inp";
    pw.placeholder = "AD PW";
    pw.autocomplete = "off";
    pw.style.flex = "1";
    pw.style.minWidth = "4em";
    row.appendChild(lbl);
    row.appendChild(user);
    row.appendChild(pw);
    return { row: row, user: user, pw: pw };
  }

  /** 저장값을 칸에 채우고 콜백(store) — 다른 카드에서 저장해도 따라 바뀜 */
  function bindPrestoAccountInputs(acc, onLoaded, onSaved) {
    function fill(u, p) {
      if (u != null) acc.user.value = u;
      if (p != null) acc.pw.value = p;
    }
    if (window.yan4ShellDesktop && typeof window.yan4ShellDesktop.storageGet === "function") {
      window.yan4ShellDesktop
        .storageGet(RECV_PRESTO_STORAGE_KEYS)
        .then(function (store) {
          store = store || {};
          fill(store.yan4PrestoUser || null, store.yan4PrestoPassword || null);
          if (typeof onLoaded === "function") onLoaded(store);
        })
        .catch(function () {});
    }
    window.addEventListener(PRESTO_ACCOUNT_SAVED_EVENT, function (ev) {
      var d = (ev && ev.detail) || {};
      fill(d.user, d.pw);
      if (typeof onSaved === "function" && d.user) onSaved(d.user);
    });
  }

  /** 계정 저장 — 성공하면 저장한 아이디, 취소·실패면 "" */
  async function prestoSaveAccount(u, p) {
    u = String(u || "").trim();
    p = String(p || "");
    if (!u) {
      alert("Presto 아이디를 입력하세요.");
      return "";
    }
    if (/svc|service|_sa$|^sa_|bot|robot|pipeline/i.test(u)) {
      var okSvc = confirm(
        "「" +
          u +
          "」은(는) 서비스 계정처럼 보입니다.\n" +
          "PC에서는 Presto가 서비스 계정을 막습니다.\n" +
          "DBeaver에 쓰는 개인 AD 계정인가요? 그래도 저장할까요?"
      );
      if (!okSvc) return "";
    }
    if (!window.yan4ShellDesktop || typeof window.yan4ShellDesktop.storageSet !== "function") {
      alert("데스크톱 앱에서만 계정을 저장할 수 있습니다.");
      return "";
    }
    try {
      await window.yan4ShellDesktop.storageSet({
        yan4PrestoUser: u,
        yan4PrestoPassword: p,
        yan4PrestoHost: "presto-gw.coupang.net",
        yan4PrestoPort: 443,
        yan4PrestoCatalog: "hive",
        yan4PrestoSchema: "ods",
      });
    } catch (eSave) {
      alert("저장 실패: " + (eSave && eSave.message ? eSave.message : String(eSave)));
      return "";
    }
    try {
      window.dispatchEvent(
        new CustomEvent(PRESTO_ACCOUNT_SAVED_EVENT, { detail: { user: u, pw: p } })
      );
    } catch (eEv) {}
    return u;
  }

  /** STOW SCAN TRACKING — 작업자 PDA 진열 스캔 내역(stow_work_logs) Presto 조회 → Excel */
  var WORKER_SCAN_ID_RE = /^[A-Za-z0-9._-]+$/;

  function workerScanBuildSql(centerId, userIds, ymd) {
    return (
      "SELECT sw.eventtype\n" +
      ", sw.skubarcode\n" +
      ", sw.locationbarcode\n" +
      ", sw.cartbarcode\n" +
      ", sw.quantity\n" +
      ", u.userid\n" +
      ", sw.message\n" +
      ", sw.createdat\n" +
      ", sw.centerid\n" +
      "FROM hive.ods.stow_work_logs sw\n" +
      "     JOIN (select id, userid from hive.ods.WMS_USERS) u on (sw.workeruserid = u.id)\n" +
      "where sw.centerid in (" + centerId + ")\n" +
      "and sw.createdat_day = " + recvYmdToDayInt(ymd) + "\n" +
      "and sw.updatedat between cast('" + ymd + " 00:00:00' as timestamp) and cast('" + ymd + " 23:59:59' as timestamp)\n" +
      "and u.userid in (" + userIds.map(function (id) { return "'" + id + "'"; }).join(", ") + ")\n" +
      "order by u.userid, sw.createdat"
    );
  }

  function initWorkerScanTracePane(paneBody) {
    if (!paneBody) return;
    paneBody.textContent = "";

    var mod = document.createElement("div");
    mod.className = "yna4-pane-mod yna4-pane-mod--worker-scan";

    function addRow(labelText, input) {
      var row = document.createElement("div");
      row.className = "yna4-pane-row";
      var lbl = document.createElement("span");
      lbl.className = "yna4-pane-k";
      lbl.textContent = labelText;
      input.className = "yna4-pane-inp";
      input.style.flex = "1";
      input.style.minWidth = "0";
      row.appendChild(lbl);
      row.appendChild(input);
      mod.appendChild(row);
    }

    var inpUser = document.createElement("input");
    inpUser.type = "text";
    inpUser.placeholder = "여러 명은 쉼표·띄어쓰기로 구분";
    inpUser.autocomplete = "off";
    inpUser.spellcheck = false;
    addRow("작업자 ID", inpUser);

    var inpDate = document.createElement("input");
    inpDate.type = "date";
    inpDate.value = recvTodayYmd();
    addRow("작업일", inpDate);

    var scanAcc = buildPrestoAccountRow();
    mod.appendChild(scanAcc.row);

    var actions = document.createElement("div");
    actions.className = "yna4-pane-actions";
    var btnSaveAcc = document.createElement("button");
    btnSaveAcc.type = "button";
    btnSaveAcc.className = "yna4-pane-btn";
    btnSaveAcc.textContent = "계정 저장";
    var btnRun = document.createElement("button");
    btnRun.type = "button";
    btnRun.className = "yna4-pane-btn yna4-pane-btn--primary";
    btnRun.textContent = "조회 후 Excel 저장";
    actions.appendChild(btnSaveAcc);
    actions.appendChild(btnRun);
    mod.appendChild(actions);

    var gauge = document.createElement("div");
    gauge.style.cssText =
      "display:none;height:8px;margin:6px 0;border-radius:4px;background:#e2e8f0;overflow:hidden;";
    var gaugeFill = document.createElement("div");
    gaugeFill.style.cssText =
      "width:0;height:100%;background:#2563eb;transition:width 0.3s;";
    gauge.appendChild(gaugeFill);
    mod.appendChild(gauge);

    var status = document.createElement("div");
    status.className = "yna4-pane-status";
    status.textContent = "현재 센터 기준 조회 · Presto 계정은 입고내역 RWA와 같이 씀";
    mod.appendChild(status);
    paneBody.appendChild(mod);

    bindPrestoAccountInputs(
      scanAcc,
      function (store) {
        if (!store.yan4PrestoUser) {
          status.textContent = "Presto 계정(개인 AD) 입력 후 계정 저장 · 입고내역 RWA와 같이 씀";
        }
      },
      function (u) {
        if (running) return;
        status.textContent = "Presto 계정 저장 완료 (" + u + ") · 입고내역 RWA와 같이 씀";
      }
    );
    btnSaveAcc.addEventListener("click", async function () {
      if (running) return;
      await prestoSaveAccount(scanAcc.user.value, scanAcc.pw.value);
    });

    var running = false;
    var activeProgressId = "";
    var progressPct = null;
    var progressQueued = false;
    var repaintProgress = null;

    if (window.yan4ShellDesktop && typeof window.yan4ShellDesktop.onPrestoProgress === "function") {
      window.yan4ShellDesktop.onPrestoProgress(function (p) {
        if (!p || !activeProgressId || p.progressId !== activeProgressId) return;
        progressQueued = p.state === "QUEUED";
        var total = Number(p.totalSplits) || 0;
        if (total > 0) {
          // 전체 조각 수가 조회 중 늘어도 게이지가 뒤로 가지 않게 함
          var pct = Math.min(99, Math.floor(((Number(p.completedSplits) || 0) / total) * 100));
          progressPct = progressPct == null ? pct : Math.max(progressPct, pct);
          gauge.style.display = "block";
          gaugeFill.style.width = progressPct + "%";
        }
        if (repaintProgress) repaintProgress();
      });
    }

    async function run() {
      if (running) return;
      var userIds = String(inpUser.value || "")
        .split(/[\s,]+/)
        .filter(function (id, i, all) {
          return id && all.indexOf(id) === i;
        });
      var extra = userIds.length - 1;
      var userLabel = extra > 0 ? userIds[0] + " 외 " + extra + "명" : userIds[0];
      var ymd = String(inpDate.value || "").trim();
      if (
        !userIds.length ||
        !userIds.every(function (id) {
          return WORKER_SCAN_ID_RE.test(id);
        })
      ) {
        status.textContent = "작업자 ID를 확인하세요.";
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        status.textContent = "작업일을 선택하세요.";
        return;
      }
      var centerId = cfsActiveCenterId("");
      if (!centerId) {
        status.textContent = "상단에서 센터를 먼저 선택하세요.";
        return;
      }
      if (!window.yan4ShellDesktop || typeof window.yan4ShellDesktop.prestoQuery !== "function") {
        status.textContent = "데스크톱 앱에서만 조회할 수 있습니다.";
        return;
      }
      running = true;
      btnRun.disabled = true;
      var startedAt = Date.now();
      function paintElapsed() {
        var sec = Math.floor((Date.now() - startedAt) / 1000);
        var elapsed = sec >= 60 ? Math.floor(sec / 60) + "분 " + (sec % 60) + "초" : sec + "초";
        status.textContent =
          (progressQueued ? "Presto 대기 중… " : "Presto 조회 중… ") +
          elapsed +
          (progressPct != null ? " · " + progressPct + "%" : "") +
          " (" + userLabel + " · " + ymd + ")";
      }
      activeProgressId = "scan-" + startedAt;
      progressPct = null;
      progressQueued = false;
      repaintProgress = paintElapsed;
      paintElapsed();
      var elapsedTimer = setInterval(paintElapsed, 1000);
      try {
        var res = await window.yan4ShellDesktop.prestoQuery({
          sql: workerScanBuildSql(centerId, userIds, ymd),
          progressId: activeProgressId,
        });
        clearInterval(elapsedTimer);
        activeProgressId = "";
        repaintProgress = null;
        if (!res || !res.ok) {
          throw new Error((res && res.error) || "Presto 조회 실패");
        }
        var rows = res.rows || [];
        if (!rows.length) {
          status.textContent = "결과 없음 (" + userLabel + " · " + ymd + ")";
          return;
        }
        if (typeof XLSX === "undefined") throw new Error("XLSX 라이브러리 없음");
        var wb = XLSX.utils.book_new();
        var ws = XLSX.utils.aoa_to_sheet([res.columns || []].concat(rows));
        XLSX.utils.book_append_sheet(wb, ws, "스캔내역");
        var saved = await recvSaveWorkbook(
          wb,
          "작업자스캔_" + userIds[0] + (extra > 0 ? "_외" + extra + "명" : "") + "_" + ymd + ".xlsx"
        );
        status.textContent = "완료 · " + rows.length + "행 Excel 저장 (다운로드/" + saved + ")";
      } catch (eRun) {
        status.textContent = "오류: " + (eRun && eRun.message ? eRun.message : String(eRun));
      } finally {
        clearInterval(elapsedTimer);
        activeProgressId = "";
        repaintProgress = null;
        gauge.style.display = "none";
        gaugeFill.style.width = "0";
        running = false;
        btnRun.disabled = false;
      }
    }

    btnRun.addEventListener("click", run);
    inpUser.addEventListener("keydown", function (e) {
      if (e.key === "Enter") run();
    });
  }

  /** Prepack&SR Daily Patrol — SharePoint 재고관리파일.xlsx → 필터 → 결과 창 */
  var PREPACK_INV_URL =
    "https://coupangfsnam.sharepoint.com/sites/FreshFinanceR2/_layouts/15/download.aspx?UniqueId=9bf1f502%2D02a6%2D4228%2D93ad%2D1f462b498ffa";
  var PREPACK_TYPE = "PICKING";
  var PREPACK_NAME_TOKEN = "[팩]";
  var PREPACK_CATE5 = ["깻잎", "상온 식빵/모닝빵", "허브류"];
  /** 엑셀 시트 정의 (시트명에 / 불가 → S/N 은 S-N) */
  var PREPACK_SHEET_SPECS = [
    {
      name: "PREPACK",
      label: "PREPACK",
      nameToken: "[팩]",
      cate5: PREPACK_CATE5,
      zones: null,
    },
    {
      name: "DAY SR",
      label: "DAY SR",
      nameToken: "[SR]",
      cate5: null,
      zones: ["1C", "1CP"],
    },
    {
      name: "S-N SR",
      label: "S.N SR",
      nameToken: "[SR]",
      cate5: null,
      zones: ["2C"],
    },
  ];
  var prepackRunning = false;
  var prepackActiveSheetIdx = 0;

  function prepackIsDesktop() {
    return !!(
      window.__YAN4_DESKTOP_SHELL__ &&
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    );
  }

  function prepackFetchInventoryBase64() {
    return new Promise(function (resolve, reject) {
      if (
        typeof chrome === "undefined" ||
        !chrome.runtime ||
        typeof chrome.runtime.sendMessage !== "function"
      ) {
        reject(new Error("확장/데스크톱 환경에서만 사용 가능"));
        return;
      }
      var msg = prepackIsDesktop()
        ? {
            type: "yan4SharePointFileFetch",
            url: PREPACK_INV_URL,
            label: "재고관리파일",
            nameIncludes: "재고관리",
            deleteAfterRead: true,
          }
        : { type: "yan4SlaFetch", url: PREPACK_INV_URL };
      chrome.runtime.sendMessage(msg, function (resp) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "다운로드 실패"));
          return;
        }
        if (resp && resp.ok && resp.base64) {
          resolve(resp.base64);
          return;
        }
        reject(new Error((resp && resp.error) || "다운로드 실패"));
      });
    });
  }

  function prepackNormHeader(v) {
    return String(v == null ? "" : v)
      .replace(/\u00a0/g, " ")
      .trim()
      .toUpperCase();
  }

  function prepackZoneOk(zoneVal, zones) {
    if (!zones || !zones.length) return true;
    var z = String(zoneVal == null ? "" : zoneVal)
      .replace(/\u00a0/g, " ")
      .trim()
      .toUpperCase();
    for (var i = 0; i < zones.length; i++) {
      if (z === String(zones[i]).trim().toUpperCase()) return true;
    }
    return false;
  }

  function prepackFilterRowsBySpec(aoa, hdr, spec) {
    var iType = hdr.indexOf("TYPE");
    var iName = hdr.indexOf("SKUNAME");
    var iCate5 = hdr.indexOf("CATE5");
    var iZone = hdr.indexOf("ZONE");
    if (iZone < 0 && hdr.length >= 4) iZone = 3;
    var iLoc = hdr.indexOf("FULLNAME");
    var iBarcode = hdr.indexOf("BARCODE");
    var iQty = hdr.indexOf("QUANTITY");
    var iTemp = hdr.indexOf("TEMPERATURE");
    if (iType < 0 || iName < 0) return null;
    if (spec.cate5 && iCate5 < 0) return null;
    if (spec.zones && iZone < 0) return null;
    var pick = function (row, i) {
      return i < 0 ? "" : row[i];
    };
    var out = [];
    for (var r = 1; r < aoa.length; r++) {
      var row = aoa[r];
      if (String(row[iType]).trim().toUpperCase() !== PREPACK_TYPE) continue;
      if (String(row[iName]).indexOf(spec.nameToken) < 0) continue;
      if (spec.cate5 && spec.cate5.indexOf(String(row[iCate5]).trim()) < 0) {
        continue;
      }
      if (spec.zones && !prepackZoneOk(pick(row, iZone), spec.zones)) continue;
      out.push({
        loc: prepackCellText(pick(row, iLoc)),
        barcode: prepackCellText(pick(row, iBarcode)),
        name: prepackCellText(pick(row, iName)),
        qty: Number(pick(row, iQty)) || 0,
        temp: prepackCellText(pick(row, iTemp)),
      });
    }
    out.sort(function (a, b) {
      return a.loc.localeCompare(b.loc, "ko", { numeric: true });
    });
    return out;
  }

  function prepackFilterWorkbook(wb) {
    var names = wb.SheetNames || [];
    for (var s = 0; s < names.length; s++) {
      var aoa = XLSX.utils.sheet_to_json(wb.Sheets[names[s]], {
        header: 1,
        raw: true,
        defval: "",
        blankrows: false,
      });
      if (!aoa.length) continue;
      var hdr = aoa[0].map(prepackNormHeader);
      if (hdr.indexOf("TYPE") < 0 || hdr.indexOf("SKUNAME") < 0) continue;
      var sheets = [];
      for (var si = 0; si < PREPACK_SHEET_SPECS.length; si++) {
        var spec = PREPACK_SHEET_SPECS[si];
        var rows = prepackFilterRowsBySpec(aoa, hdr, spec);
        if (rows == null) rows = [];
        sheets.push({
          name: spec.name,
          label: spec.label || spec.name,
          rows: rows,
        });
      }
      return {
        total: aoa.length - 1,
        sheets: sheets,
        rows: sheets[0] ? sheets[0].rows : [],
      };
    }
    throw new Error("TYPE / SKUNAME 열이 있는 시트를 찾지 못했습니다");
  }

  /** 바코드 등 큰 숫자가 지수 표기(8.81E+12)로 바뀌지 않게 정수 문자열로 */
  function prepackCellText(v) {
    if (v == null) return "";
    if (typeof v === "number" && isFinite(v)) {
      return Number.isInteger(v) ? v.toFixed(0) : String(v);
    }
    return String(v).replace(/\u00a0/g, " ").trim();
  }

  function prepackStamp() {
    var d = new Date();
    var p2 = function (n) {
      return (n < 10 ? "0" : "") + n;
    };
    return (
      d.getFullYear() +
      p2(d.getMonth() + 1) +
      p2(d.getDate()) +
      "_" +
      p2(d.getHours()) +
      p2(d.getMinutes())
    );
  }

  var PREPACK_COLS = [
    { key: "loc", label: "로케이션", cls: "mono" },
    { key: "barcode", label: "바코드", cls: "mono" },
    { key: "name", label: "상품명", cls: "" },
    { key: "qty", label: "수량", cls: "num" },
    { key: "temp", label: "온도대", cls: "" },
  ];
  var PREPACK_MODAL_ID = ROOT_ID + "-prepack-modal";
  var PREPACK_PRINT_CLASS = "yna4-prepack-print";
  var prepackLast = null;

  function prepackEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function prepackFmtNow(d) {
    var p2 = function (n) {
      return (n < 10 ? "0" : "") + n;
    };
    return (
      d.getFullYear() +
      "-" +
      p2(d.getMonth() + 1) +
      "-" +
      p2(d.getDate()) +
      " " +
      p2(d.getHours()) +
      ":" +
      p2(d.getMinutes())
    );
  }

  function prepackQtySum(rows) {
    return rows.reduce(function (s, r) {
      return s + (Number(r.qty) || 0);
    }, 0);
  }

  function prepackSheetsOf(res) {
    if (res && Array.isArray(res.sheets) && res.sheets.length) return res.sheets;
    if (res && Array.isArray(res.rows)) {
      return [{ name: "PREPACK", label: "PREPACK", rows: res.rows }];
    }
    return [];
  }

  function prepackTotalFilteredRows(res) {
    return prepackSheetsOf(res).reduce(function (n, sh) {
      return n + ((sh.rows && sh.rows.length) || 0);
    }, 0);
  }

  function prepackActiveSheet(res) {
    var sheets = prepackSheetsOf(res);
    if (!sheets.length) return { name: "", label: "", rows: [] };
    var i = Math.max(
      0,
      Math.min(sheets.length - 1, Number(prepackActiveSheetIdx) || 0)
    );
    prepackActiveSheetIdx = i;
    return sheets[i];
  }

  /** 팀즈/PDF — 현재 탭만 */
  function prepackResForActiveTab(res) {
    var sh = prepackActiveSheet(res);
    return {
      at: res.at,
      stamp: res.stamp,
      total: res.total,
      sheets: [sh],
      rows: sh.rows || [],
    };
  }

  function prepackMetaText(res) {
    var sheets = prepackSheetsOf(res);
    var parts = sheets.map(function (sh) {
      return (sh.label || sh.name) + " " + ((sh.rows && sh.rows.length) || 0);
    });
    return (
      "기준 " +
      res.at +
      " · " +
      parts.join(" · ") +
      "행 · 합계 " +
      prepackTotalFilteredRows(res).toLocaleString("en-US") +
      " (원본 " +
      res.total.toLocaleString("en-US") +
      "행)"
    );
  }

  function prepackTableHtml(rows) {
    var html =
      "<table class='yna4-prepack-table'><thead><tr><th class='idx'>#</th>" +
      PREPACK_COLS.map(function (c) {
        return "<th>" + prepackEsc(c.label) + "</th>";
      }).join("") +
      "</tr></thead><tbody>";
    rows.forEach(function (r, i) {
      html +=
        "<tr><td class='idx'>" +
        (i + 1) +
        "</td>" +
        PREPACK_COLS.map(function (c) {
          var v = c.key === "qty" ? Number(r.qty).toLocaleString("en-US") : r[c.key];
          return "<td class='" + c.cls + "'>" + prepackEsc(v) + "</td>";
        }).join("") +
        "</tr>";
    });
    return html + "</tbody></table>";
  }

  function prepackBuildTeamsClipboard(res) {
    var sheets = prepackSheetsOf(res);
    var tsv = [];
    var html =
      "<div style='font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:12px;color:#0f172a'>" +
      "<div style='font-weight:bold;margin-bottom:4px'>Prepack&amp;SR Daily Patrol · " +
      prepackEsc(prepackMetaText(res)) +
      "</div>";
    sheets.forEach(function (sh, si) {
      if (si) tsv.push("");
      tsv.push(String(sh.label || sh.name));
      tsv.push(
        PREPACK_COLS.map(function (c) {
          return c.label;
        }).join("\t")
      );
      html +=
        "<div style='font-weight:bold;margin:" +
        (si ? "14px" : "8px") +
        " 0 4px'>" +
        prepackEsc(sh.label || sh.name) +
        " (" +
        ((sh.rows && sh.rows.length) || 0) +
        "행)</div>" +
        '<table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:12px;color:#0f172a">' +
        '<thead><tr style="background:#f1f5f9;font-weight:bold">' +
        PREPACK_COLS.map(function (c) {
          return "<th>" + prepackEsc(c.label) + "</th>";
        }).join("") +
        "</tr></thead><tbody>";
      (sh.rows || []).forEach(function (r) {
        var cells = PREPACK_COLS.map(function (c) {
          return c.key === "qty"
            ? String(r.qty)
            : String(r[c.key] == null ? "" : r[c.key]);
        });
        tsv.push(
          cells
            .map(function (v) {
              return v.replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
            })
            .join("\t")
        );
        html +=
          "<tr>" +
          cells
            .map(function (v, i) {
              var right =
                PREPACK_COLS[i].key === "qty" ? " style='text-align:right'" : "";
              return "<td" + right + ">" + prepackEsc(v) + "</td>";
            })
            .join("") +
          "</tr>";
      });
      html += "</tbody></table>";
    });
    html += "</div>";
    return { tsv: tsv.join("\n"), html: html };
  }

  function prepackCopyTeams(res, setMsg) {
    var pack = prepackBuildTeamsClipboard(res);
    var fallback = function () {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard
          .writeText(pack.tsv)
          .then(function () {
            setMsg("복사 완료(텍스트만)");
          })
          .catch(function () {
            setMsg("복사 실패");
            alert("클립보드 복사 실패");
          });
        return;
      }
      setMsg("복사 실패");
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
        .then(function () {
          setMsg(
            "팀즈용 표 복사 완료 (" + prepackTotalFilteredRows(res) + "행)"
          );
        })
        .catch(fallback);
      return;
    }
    fallback();
  }

  /** 남은 ATS 보충지 인쇄 상태를 지움 — 안 지우면 이 출력에 ATS 보충지가 섞여 찍힘 */
  function clearStaleAtsPrintState() {
    document.body.classList.remove("yna4-ats-print-mode");
    var atsHost = document.getElementById("yna4AtsPrintChunkHost");
    if (atsHost) atsHost.innerHTML = "";
    var hidden = document.querySelectorAll(".yna4-ats-hidden-for-print-pages");
    var hi;
    for (hi = 0; hi < hidden.length; hi++) {
      hidden[hi].classList.remove("yna4-ats-hidden-for-print-pages");
    }
  }

  function prepackPrintPdf(res, setMsg) {
    var body = document.body;
    clearStaleAtsPrintState();
    var ownId = ROOT_ID + "-prepack-style";
    // 라벨 출력 CSS 등은 @page·html/body 크기를 전역으로 고정 → 출력 동안만 끔
    var muted = Array.prototype.filter.call(
      document.querySelectorAll("style"),
      function (s) {
        return s.id !== ownId && !s.disabled && /@media\s*print/.test(s.textContent || "");
      }
    );
    muted.forEach(function (s) {
      s.disabled = true;
    });
    // @page는 전역이라 상시로 두면 ATS 가로 출력까지 세로로 바뀜 → 출력 동안만 붙임
    var pageStyle = document.createElement("style");
    pageStyle.textContent = "@media print{@page{size:A4 portrait;margin:8mm}}";
    (document.head || document.documentElement).appendChild(pageStyle);
    var cleanup = function () {
      body.classList.remove(PREPACK_PRINT_CLASS);
      if (pageStyle.parentNode) pageStyle.parentNode.removeChild(pageStyle);
      muted.forEach(function (s) {
        s.disabled = false;
      });
    };
    body.classList.add(PREPACK_PRINT_CLASS);
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (
          window.__YAN4_DESKTOP_SHELL__ &&
          window.yan4ShellDesktop &&
          typeof window.yan4ShellDesktop.printToPdf === "function"
        ) {
          setMsg("PDF 만드는 중…");
          window.yan4ShellDesktop
            .printToPdf({
              filename: "Prepack_Daily_Routine_" + res.stamp + ".pdf",
              open: true,
            })
            .then(function (out) {
              cleanup();
              if (out && out.ok) {
                setMsg("PDF 저장 (다운로드/" + out.filename + ")");
              } else {
                setMsg("PDF 실패");
                alert("PDF 저장 실패: " + ((out && out.error) || "알 수 없음"));
              }
            });
          return;
        }
        var after = function () {
          window.removeEventListener("afterprint", after);
          setTimeout(cleanup, 300);
        };
        window.addEventListener("afterprint", after);
        window.print();
      });
    });
  }

  function prepackShowResult(res) {
    prepackLast = res;
    var modal = document.getElementById(PREPACK_MODAL_ID);
    if (!modal) {
      modal = document.createElement("div");
      modal.id = PREPACK_MODAL_ID;
      modal.className = "yna4-prepack-modal";
      modal.innerHTML =
        "<div class='yna4-prepack-backdrop' data-role='close'></div>" +
        "<div class='yna4-prepack-dialog'>" +
        "<div class='yna4-prepack-head'>" +
        "<div><strong>Prepack&amp;SR Daily Patrol</strong>" +
        "<div class='yna4-prepack-meta' data-role='meta'></div></div>" +
        "<div class='yna4-prepack-actions'>" +
        "<span class='yna4-prepack-msg' data-role='msg'></span>" +
        "<button type='button' class='yna4-pane-btn yna4-pane-btn--primary' data-act='teams'>팀즈용 표 복사</button>" +
        "<button type='button' class='yna4-pane-btn' data-act='pdf'>PDF 출력</button>" +
        "<button type='button' class='yna4-pane-btn' data-act='close'>닫기</button>" +
        "</div></div>" +
        "<div class='yna4-prepack-body' data-role='body'></div>" +
        "</div>";
      document.body.appendChild(modal);
      modal.addEventListener("click", function (e) {
        var t = e.target;
        if (!t || !t.getAttribute) return;
        var act = t.getAttribute("data-act") || t.getAttribute("data-role");
        var setMsg = function (m) {
          var el = modal.querySelector("[data-role=msg]");
          if (el) el.textContent = m || "";
        };
        if (act === "close") {
          modal.style.display = "none";
        } else if (act === "tab") {
          var idx = parseInt(t.getAttribute("data-sheet-idx"), 10);
          if (!isFinite(idx)) return;
          prepackActiveSheetIdx = idx;
          if (prepackLast) prepackPaintResultBody(modal, prepackLast);
        } else if (act === "teams" && prepackLast) {
          prepackCopyTeams(prepackResForActiveTab(prepackLast), setMsg);
        } else if (act === "pdf" && prepackLast) {
          prepackPrintPdf(prepackResForActiveTab(prepackLast), setMsg);
        }
      });
    }
    modal.querySelector("[data-role=meta]").textContent = prepackMetaText(res);
    modal.querySelector("[data-role=msg]").textContent = "";
    prepackPaintResultBody(modal, res);
    modal.style.display = "flex";
  }

  function prepackPaintResultBody(modal, res) {
    if (!modal) return;
    var sheets = prepackSheetsOf(res);
    if (!sheets.length) {
      modal.querySelector("[data-role=body]").innerHTML = "";
      return;
    }
    if (prepackActiveSheetIdx >= sheets.length) prepackActiveSheetIdx = 0;
    var sh = sheets[prepackActiveSheetIdx];
    var tabsHtml = sheets
      .map(function (s, i) {
        return (
          "<button type='button' class='yna4-prepack-tab" +
          (i === prepackActiveSheetIdx ? " is-active" : "") +
          "' data-act='tab' data-sheet-idx='" +
          i +
          "'>" +
          prepackEsc(s.label || s.name) +
          " · " +
          ((s.rows && s.rows.length) || 0) +
          "</button>"
        );
      })
      .join("");
    modal.querySelector("[data-role=body]").innerHTML =
      "<div class='yna4-prepack-tabs'>" +
      tabsHtml +
      "</div>" +
      "<div class='yna4-prepack-print-title'>Prepack&amp;SR Daily Patrol · " +
      prepackEsc(sh.label || sh.name) +
      " · " +
      prepackEsc(prepackMetaText(res)) +
      "</div>" +
      "<div class='yna4-prepack-sheet-title'>" +
      prepackEsc(sh.label || sh.name) +
      " · " +
      ((sh.rows && sh.rows.length) || 0) +
      "행</div>" +
      prepackTableHtml(sh.rows || []);
  }

  function prepackEnsureStyle() {
    var sid = ROOT_ID + "-prepack-style";
    if (document.getElementById(sid)) return;
    var st = document.createElement("style");
    st.id = sid;
    // 반짝임은 transform 애니메이션이라 엑셀 파싱으로 메인 스레드가 막혀도 계속 움직임
    st.textContent =
      ".yna4-prepack-bar{position:relative;overflow:hidden;--yna4-progress:0%;" +
      "background:linear-gradient(90deg,#bef264 var(--yna4-progress),#f8fafc var(--yna4-progress))!important;" +
      "border:1px solid #d9f99d;border-radius:10px!important;font-weight:600;color:#1f2937}" +
      ".yna4-prepack-bar.is-busy::after{content:'';position:absolute;top:0;bottom:0;left:0;width:40%;" +
      "background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);" +
      "animation:yna4PrepackShimmer 1.1s linear infinite;will-change:transform;pointer-events:none}" +
      ".yna4-prepack-bar.is-err{background:#fef2f2!important;border-color:#fecaca;color:#b91c1c}" +
      "@keyframes yna4PrepackShimmer{from{transform:translateX(-100%)}to{transform:translateX(260%)}}" +
      ".yna4-prepack-modal{display:none;position:fixed;inset:0;z-index:2147483646;align-items:center;justify-content:center;font-family:'Segoe UI','Malgun Gothic',sans-serif}" +
      ".yna4-prepack-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.55)}" +
      ".yna4-prepack-dialog{position:relative;display:flex;flex-direction:column;width:min(1100px,94vw);height:88vh;background:#fff;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.35);overflow:hidden}" +
      ".yna4-prepack-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc}" +
      ".yna4-prepack-head strong{font-size:16px;color:#0f172a}" +
      ".yna4-prepack-meta{font-size:12px;color:#475569;margin-top:2px}" +
      ".yna4-prepack-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}" +
      ".yna4-prepack-msg{font-size:12px;color:#15803d;font-weight:600;margin-right:4px}" +
      ".yna4-prepack-body{flex:1;overflow:auto;padding:10px 16px 16px}" +
      ".yna4-prepack-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}" +
      ".yna4-prepack-tab{border:1px solid #cbd5e1;background:#f8fafc;color:#334155;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer}" +
      ".yna4-prepack-tab.is-active{background:#0f172a;border-color:#0f172a;color:#fff}" +
      ".yna4-prepack-print-title{display:none}" +
      ".yna4-prepack-sheet-title{margin:0 0 8px;font-size:13px;font-weight:800;color:#0f172a}" +
      ".yna4-prepack-table{width:100%;border-collapse:collapse;font-size:12.5px;color:#0f172a;margin-bottom:8px}" +
      "body." + PREPACK_PRINT_CLASS + " .yna4-prepack-tabs{display:none!important}" +
      "body." + PREPACK_PRINT_CLASS + " .yna4-prepack-sheet-title{display:block!important;font-size:11pt;font-weight:700;margin:0 0 2mm}" +
      ".yna4-prepack-table th{position:sticky;top:0;background:#e2e8f0;text-align:left;padding:6px 8px;border:1px solid #cbd5e1;white-space:nowrap}" +
      ".yna4-prepack-table td{padding:5px 8px;border:1px solid #e2e8f0}" +
      ".yna4-prepack-table tbody tr:nth-child(even) td{background:#f8fafc}" +
      ".yna4-prepack-table .mono{font-family:Consolas,'Malgun Gothic',monospace;white-space:nowrap}" +
      ".yna4-prepack-table .num{text-align:right;font-weight:700;white-space:nowrap}" +
      ".yna4-prepack-table .idx{color:#94a3b8;text-align:right;width:1%;white-space:nowrap}" +
      "@media print{" +
      "body." + PREPACK_PRINT_CLASS + "." + PREPACK_PRINT_CLASS + ">*{display:none!important}" +
      "body." + PREPACK_PRINT_CLASS + "." + PREPACK_PRINT_CLASS + ">#" + PREPACK_MODAL_ID +
      "{display:block!important;position:static!important;inset:auto!important}" +
      "body." + PREPACK_PRINT_CLASS + " #" + PREPACK_MODAL_ID + " .yna4-prepack-backdrop," +
      "body." + PREPACK_PRINT_CLASS + " #" + PREPACK_MODAL_ID + " .yna4-prepack-head{display:none!important}" +
      "body." + PREPACK_PRINT_CLASS + " #" + PREPACK_MODAL_ID + " .yna4-prepack-dialog{display:block!important;width:auto!important;height:auto!important;box-shadow:none!important;border-radius:0!important;overflow:visible!important}" +
      "body." + PREPACK_PRINT_CLASS + " #" + PREPACK_MODAL_ID + " .yna4-prepack-body{overflow:visible!important;padding:0!important}" +
      "body." + PREPACK_PRINT_CLASS + " #" + PREPACK_MODAL_ID + " .yna4-prepack-print-title{display:block!important;font-size:11pt;font-weight:700;margin:0 0 3mm}" +
      "body." + PREPACK_PRINT_CLASS + " .yna4-prepack-table{font-size:9pt}" +
      "body." + PREPACK_PRINT_CLASS + " .yna4-prepack-table th{position:static!important}" +
      "body." + PREPACK_PRINT_CLASS + " .yna4-prepack-table tr{break-inside:avoid;page-break-inside:avoid}" +
      "html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      "}";
    (document.head || document.documentElement).appendChild(st);
  }

  function initBarcode128Pane(paneBody) {
    if (!paneBody) return;
    paneBody.textContent = "";

    var styleId = "yna4-barcode128-pane-css";
    if (!document.getElementById(styleId)) {
      var st = document.createElement("style");
      st.id = styleId;
      st.textContent =
        ".yna4-pane-card[data-pane='barcode128'] .yna4-pane-card-body{display:flex;flex-direction:column;}" +
        ".yna4-pane-mod--barcode128{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:6px;}" +
        ".yna4-pane-mod--barcode128 .yna4-pane-row{flex-wrap:nowrap;}" +
        ".yna4-pane-mod--barcode128 .yna4-pane-inp{flex:1 1 auto;min-width:0;width:auto;}" +
        ".yna4-pane-bc128-preview{flex:1 1 auto;min-height:72px;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;box-sizing:border-box;}" +
        ".yna4-pane-bc128-preview svg{max-width:100%;height:auto;display:block;}" +
        ".yna4-pane-bc128-status{font-size:11px;line-height:1.3;color:#64748b;min-height:1.3em;}" +
        ".yna4-pane-bc128-status.is-err{color:#b91c1c;font-weight:600;}";
      document.head.appendChild(st);
    }

    var mod = document.createElement("div");
    mod.className = "yna4-pane-mod yna4-pane-mod--barcode128";

    var row = document.createElement("div");
    row.className = "yna4-pane-row";

    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "yna4-pane-inp";
    inp.placeholder = "바코드 값";
    inp.autocomplete = "off";
    inp.spellcheck = false;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "yna4-pane-btn yna4-pane-btn--primary";
    btn.textContent = "보기";

    var preview = document.createElement("div");
    preview.className = "yna4-pane-bc128-preview";

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    preview.appendChild(svg);

    var status = document.createElement("div");
    status.className = "yna4-pane-bc128-status";
    status.textContent = "값을 입력하면 Code 128로 표시합니다.";

    function renderBarcode() {
      var value = String(inp.value || "").trim();
      svg.innerHTML = "";
      status.classList.remove("is-err");
      if (!value) {
        status.textContent = "값을 입력하면 Code 128로 표시합니다.";
        return;
      }
      if (typeof JsBarcode === "undefined") {
        status.textContent = "JsBarcode 없음";
        status.classList.add("is-err");
        return;
      }
      try {
        JsBarcode(svg, value, {
          format: "CODE128",
          displayValue: true,
          width: 1.6,
          height: 64,
          fontSize: 13,
          margin: 8,
          background: "#ffffff",
          lineColor: "#000000",
        });
        status.textContent = "Code 128 · " + value;
      } catch (eBc) {
        svg.innerHTML = "";
        status.textContent = "Code 128으로 표시할 수 없는 문자입니다.";
        status.classList.add("is-err");
      }
    }

    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      renderBarcode();
    });
    inp.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        renderBarcode();
      }
    });
    inp.addEventListener("input", renderBarcode);

    row.appendChild(inp);
    row.appendChild(btn);
    mod.appendChild(row);
    mod.appendChild(preview);
    mod.appendChild(status);
    paneBody.appendChild(mod);
  }

  function initPrepackDailyRoutinePane(paneBody) {
    if (!paneBody) return;
    paneBody.textContent = "";
    prepackEnsureStyle();

    var mod = document.createElement("div");
    mod.className = "yna4-pane-mod";

    var actions = document.createElement("div");
    actions.className = "yna4-pane-actions";
    var btnRun = document.createElement("button");
    btnRun.type = "button";
    btnRun.id = ROOT_ID + "-prepack-run";
    btnRun.className = "yna4-pane-btn yna4-pane-btn--primary";
    btnRun.textContent = "작업 시작";
    var btnReopen = document.createElement("button");
    btnReopen.type = "button";
    btnReopen.className = "yna4-pane-btn";
    btnReopen.textContent = "결과 다시 보기";
    btnReopen.disabled = !prepackLast;
    btnReopen.addEventListener("click", function () {
      if (prepackLast) prepackShowResult(prepackLast);
    });
    actions.appendChild(btnRun);
    actions.appendChild(btnReopen);

    var status = document.createElement("div");
    status.id = ROOT_ID + "-prepack-status";
    status.className = "yna4-pane-status yna4-prepack-bar";
    status.textContent = "작업 시작 → 재고관리파일 다운로드 후 결과 창 표시";

    mod.appendChild(actions);
    mod.appendChild(status);
    paneBody.appendChild(mod);

    var tickTimer = 0;

    function setStatus(msg, percent, mode) {
      status.textContent = msg || "";
      var p = Number(percent);
      status.style.setProperty(
        "--yna4-progress",
        (isFinite(p) ? Math.max(0, Math.min(100, p)) : 0) + "%"
      );
      status.classList.toggle("is-busy", mode === "busy");
      status.classList.toggle("is-err", mode === "err");
    }

    function stopTick() {
      if (tickTimer) clearInterval(tickTimer);
      tickTimer = 0;
    }

    function startDownloadTick(label) {
      var t0 = Date.now();
      var draw = function () {
        var sec = Math.floor((Date.now() - t0) / 1000);
        var p = 5 + 50 * (1 - Math.exp(-sec / 20));
        setStatus(label + " " + sec + "초", p, "busy");
      };
      draw();
      tickTimer = setInterval(draw, 500);
    }

    btnRun.addEventListener("click", async function () {
      if (prepackRunning) return;
      var prepackCenter = String(cfsActiveCenterCode("") || "").trim().toUpperCase();
      if (prepackCenter !== "YAN4") {
        setStatus(
          "YAN4 기준에서만 작업 가능 · 현재 " + (prepackCenter || "센터 확인 불가"),
          0,
          "err"
        );
        alert(
          "Prepack&SR Daily Patrol은 YAN4 기준에서만 작업할 수 있습니다.\n" +
            "현재 기준: " +
            (prepackCenter || "확인 불가") +
            "\n센터를 YAN4로 전환한 뒤 다시 시작하세요."
        );
        return;
      }
      if (typeof XLSX === "undefined") {
        alert("XLSX 라이브러리 없음");
        return;
      }
      prepackRunning = true;
      btnRun.disabled = true;
      try {
        startDownloadTick(
          prepackIsDesktop()
            ? "① Chrome으로 재고관리파일 다운로드 중… (최대 90초)"
            : "① 재고관리파일 다운로드 중…"
        );
        var b64 = await prepackFetchInventoryBase64();
        stopTick();
        setStatus("② 엑셀 읽는 중… (용량이 커서 잠시 멈춘 듯 보일 수 있음)", 60, "busy");
        await new Promise(function (r) {
          setTimeout(r, 60);
        });
        var srcWb = XLSX.read(b64, { type: "base64", cellDates: true, dense: true });
        b64 = null;
        setStatus("③ 조건 필터링 중…", 85, "busy");
        await new Promise(function (r) {
          setTimeout(r, 30);
        });
        var res = prepackFilterWorkbook(srcWb);
        srcWb = null;
        var filteredN = prepackTotalFilteredRows(res);
        if (!filteredN) {
          setStatus("완료 · 원본 " + res.total + "행 중 조건 충족 0행", 100);
          alert("조건을 충족하는 행이 없습니다.");
          return;
        }
        res.at = prepackFmtNow(new Date());
        res.stamp = prepackStamp();
        prepackShowResult(res);
        btnReopen.disabled = false;
        setStatus(
          "완료 · 원본 " +
            res.total +
            "행 → " +
            filteredN +
            "행 / 시트 " +
            prepackSheetsOf(res).length +
            " (결과 창 표시)",
          100
        );
      } catch (eRun) {
        var em = eRun && eRun.message ? eRun.message : String(eRun);
        setStatus("오류: " + em, 0, "err");
        alert("실패: " + em);
      } finally {
        stopTick();
        prepackRunning = false;
        btnRun.disabled = false;
      }
    });
  }

  /** receivingq — SKU 바코드 → 하차번호(IBC) unloadWork paging → 바코드 */
  var RECVQ_ROOT_ID = "yna4RecvqDrawer_v1";
  var RECVQ_SHRINK_ALARM_PATH = "media/SR.wav";
  var recvqSkuNameCache = Object.create(null);
  var recvqShrinkToastTimer = 0;
  var recvqShrinkToneAt = 0;

  function recvqNormalizeBarcodeKey(s) {
    var t = String(s != null ? s : "")
      .replace(/\u00a0/g, " ")
      .trim();
    if (!t) return "";
    var compact = t.replace(/\s+/g, "");
    var alnum = compact.replace(/[^A-Za-z0-9]/g, "");
    if (!alnum) return "";
    if (/[A-Za-z]/.test(alnum)) return alnum.toUpperCase();
    return alnum.replace(/[^\d]/g, "");
  }

  function recvqNormalizeSkuDigits(s) {
    return String(s != null ? s : "")
      .replace(/\D/g, "")
      .trim();
  }

  /** 사내규정 — 상품명에 SR 표기가 있으면 Shrink(SR) 대상 */
  function recvqIsSrProductName(name) {
    var t = String(name == null ? "" : name).replace(/\u00a0/g, " ");
    if (!t) return false;
    if (/\[\s*SR\s*\]/i.test(t)) return true;
    return /(^|[^A-Za-z])SR([^A-Za-z]|$)/.test(t);
  }

  function recvqRememberSkuName(key, name) {
    var k = recvqNormalizeBarcodeKey(key) || recvqNormalizeSkuDigits(key);
    if (!k || !name) return;
    recvqSkuNameCache[k] = String(name).trim();
  }

  function recvqCachedSkuName(scan) {
    var bk = recvqNormalizeBarcodeKey(scan);
    if (bk && recvqSkuNameCache[bk]) return recvqSkuNameCache[bk];
    var dk = recvqNormalizeSkuDigits(scan);
    if (dk && recvqSkuNameCache[dk]) return recvqSkuNameCache[dk];
    return "";
  }

  /** 스캔값만 있을 때 — inventory SKU 조회로 상품명 확보 */
  async function recvqResolveSkuName(scan) {
    var cached = recvqCachedSkuName(scan);
    if (cached) return cached;
    var name = "";
    try {
      var info = await xferOpFetchSkuFromInventory(scan);
      name = String((info && info.productName) || "").trim();
    } catch (eLookup) {
      name = "";
    }
    if (name) recvqRememberSkuName(scan, name);
    return name;
  }

  function recvqShrinkAlarmSrc() {
    if (yna4GateIsExtensionEnv()) {
      try {
        return chrome.runtime.getURL(RECVQ_SHRINK_ALARM_PATH);
      } catch (eExt) {}
    }
    return "";
  }

  function recvqPlayShrinkWebBeeps() {
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
          tone(880, t0, 0.12);
          tone(1175, t0 + 0.14, 0.16);
          setTimeout(function () {
            try {
              ctx.close();
            } catch (eC) {}
          }, 500);
        } catch (eR) {}
      }
      if (ctx.state === "suspended" && typeof ctx.resume === "function") {
        ctx.resume().then(runTones).catch(runTones);
      } else {
        runTones();
      }
    } catch (eT) {}
  }

  function recvqPlayShrinkAlarm() {
    var now = Date.now();
    if (now - recvqShrinkToneAt < 600) return;
    recvqShrinkToneAt = now;
    var src = recvqShrinkAlarmSrc();
    if (!src) {
      recvqPlayShrinkWebBeeps();
      return;
    }
    try {
      var au = new Audio(src);
      au.volume = 0.95;
      var p = au.play();
      if (p && typeof p.then === "function") {
        p.catch(function () {
          recvqPlayShrinkWebBeeps();
        });
      }
    } catch (eAu) {
      recvqPlayShrinkWebBeeps();
    }
  }

  function recvqEnsureShrinkToastCss() {
    var sid = "yna4-recvq-shrink-toast-css-v2";
    if (document.getElementById(sid)) return;
    var st = document.createElement("style");
    st.id = sid;
    st.textContent =
      "#" +
      RECVQ_ROOT_ID +
      "-shrink-toast{position:fixed;top:28px;left:50%;transform:translateX(-50%);z-index:2147483646;pointer-events:none;" +
      "min-width:min(520px,94vw);max-width:min(680px,96vw);padding:22px 28px;border-radius:14px;" +
      "border:3px solid #dc2626;background:linear-gradient(180deg,#fff1f2,#ffe4e6);" +
      "box-shadow:0 16px 48px rgba(220,38,38,.35),0 0 0 4px rgba(220,38,38,.12);" +
      "font:16px/1.45 system-ui,Segoe UI,Malgun Gothic,sans-serif;box-sizing:border-box;text-align:center;}" +
      ".yrq-shrink-toast-title{font-size:24px;font-weight:900;color:#991b1b;margin:0 0 10px;letter-spacing:-0.02em;}" +
      ".yrq-shrink-toast-body{font-size:19px;font-weight:800;color:#0f172a;line-height:1.4;word-break:keep-all;overflow-wrap:anywhere;}" +
      ".yrq-shrink-toast-meta{margin-top:10px;font-size:14px;font-weight:700;color:#64748b;}";
    (document.head || document.documentElement).appendChild(st);
  }

  function recvqHideShrinkToast() {
    var el = document.getElementById(RECVQ_ROOT_ID + "-shrink-toast");
    if (!el) return;
    try {
      el.remove();
    } catch (eRm) {}
    if (recvqShrinkToastTimer) {
      clearTimeout(recvqShrinkToastTimer);
      recvqShrinkToastTimer = 0;
    }
  }

  function recvqShowShrinkToast(row, scanKey) {
    recvqHideShrinkToast();
    var el = document.createElement("div");
    el.id = RECVQ_ROOT_ID + "-shrink-toast";
    el.className = "yrq-shrink-toast";
    var title = document.createElement("div");
    title.className = "yrq-shrink-toast-title";
    title.textContent = "⚠ SHRINK 대상";
    var body = document.createElement("div");
    body.className = "yrq-shrink-toast-body";
    body.textContent = String((row && row.name) || "").trim() || "확인 필요";
    var meta = document.createElement("div");
    meta.className = "yrq-shrink-toast-meta";
    meta.textContent =
      "상품명 SR 규정 · " + (String(scanKey || "").trim() || "스캔값 없음");
    el.appendChild(title);
    el.appendChild(body);
    el.appendChild(meta);
    document.body.appendChild(el);
    recvqShrinkToastTimer = setTimeout(recvqHideShrinkToast, 4500);
  }

  function recvqFireShrinkAlert(name, scanKey) {
    recvqPlayShrinkAlarm();
    recvqShowShrinkToast({ name: name }, scanKey);
  }

  function recvqMaybeAlertShrink(scan, nameHint) {
    var hinted = String(nameHint || "").trim();
    if (hinted) {
      if (recvqIsSrProductName(hinted)) recvqFireShrinkAlert(hinted, scan);
      return;
    }
    recvqResolveSkuName(scan)
      .then(function (name) {
        if (name && recvqIsSrProductName(name)) {
          recvqFireShrinkAlert(name, scan);
        }
      })
      .catch(function (eShrink) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[yna4 recvq shrink]", eShrink);
        }
      });
  }

  function recvqTryAlertShrinkKeys(keys, names) {
    if (!yna4RecvqGatePassed || !receivingqUrlAllowed()) return;
    var srName = "";
    var ni;
    for (ni = 0; ni < (names || []).length; ni++) {
      if (recvqIsSrProductName(names[ni])) {
        srName = String(names[ni]).trim();
        break;
      }
    }
    if (srName) {
      var nowSr = Date.now();
      if (srName === recvqLastShrinkScan && nowSr - recvqLastShrinkScanAt < 800) {
        return;
      }
      recvqLastShrinkScan = srName;
      recvqLastShrinkScanAt = nowSr;
      recvqFireShrinkAlert(srName, (keys && keys[0]) || "");
      return;
    }
    if (names && names.length) return;
    if (!keys || !keys.length) return;
    var now = Date.now();
    var ki, val;
    for (ki = 0; ki < keys.length; ki++) {
      val = String(keys[ki] == null ? "" : keys[ki]).trim();
      if (!val) continue;
      if (!recvqReceivingScanValueLooksShrinkable(val) && !/^\d{5,}$/.test(val)) {
        continue;
      }
      if (val === recvqLastShrinkScan && now - recvqLastShrinkScanAt < 800) continue;
      recvqLastShrinkScan = val;
      recvqLastShrinkScanAt = now;
      recvqMaybeAlertShrink(val);
      return;
    }
  }

  function recvqOnShrinkScanMessage(e) {
    if (!e || e.source !== window) return;
    var data = e.data;
    if (!data || data.type !== "YAN4_RECVQ_SHRINK_SCAN") return;
    recvqTryAlertShrinkKeys(data.keys || [], data.names || []);
  }

  var recvqShrinkHookBound = false;
  var recvqLastShrinkScan = "";
  var recvqLastShrinkScanAt = 0;

  function recvqSkuInputScore(inp) {
    if (!inp || inp.type === "hidden" || inp.disabled) return -99;
    var drawer = document.getElementById(RECVQ_ROOT_ID);
    if (drawer && drawer.contains(inp)) return -99;
    var hints = recvqInputHintsText(inp);
    var score = 0;
    if (/상품바코드|sku바코드|productbarcode|product.*barcode/i.test(hints))
      score += 14;
    if (/\bsku\b|상품|product/i.test(hints)) score += 8;
    if (/barcode|바코드/i.test(hints)) score += 5;
    if (/수량|quantity|qty|box|박스/i.test(hints)) score -= 8;
    if (/ibc|운송장|하차번호|inboundbarcode|inbound.*barcode/i.test(hints))
      score -= 14;
    if (/station|스테이션|rcs|identifier/i.test(hints)) score -= 14;
    return score;
  }

  function recvqReceivingScanValueLooksShrinkable(val) {
    val = String(val || "").trim();
    if (val.length < 4) return false;
    if (/^RCS\d{6,}$/i.test(val)) return false;
    return true;
  }

  function recvqOnReceivingShrinkKeydown(e) {
    if (!yna4RecvqGatePassed || !receivingqUrlAllowed()) return;
    if (e.key !== "Enter" && e.keyCode !== 13) return;
    var el = e.target;
    if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
    if (recvqSkuInputScore(el) < 0) return;
    var val = String(el.value || "").trim();
    if (!recvqReceivingScanValueLooksShrinkable(val)) return;
    var now = Date.now();
    if (val === recvqLastShrinkScan && now - recvqLastShrinkScanAt < 800) return;
    recvqLastShrinkScan = val;
    recvqLastShrinkScanAt = now;
    recvqTryAlertShrinkKeys([val]);
  }

  function recvqInjectReceivingFetchHook() {
    if (document.documentElement.getAttribute("data-yan4-recvq-fetch-hook") === "1") {
      return;
    }
    /* CFS Receiving 앱은 preload에서 메인 월드에 직접 주입 */
    if (window.__CFS_RECEIVING_APP__) return;
    if (!yna4GateIsExtensionEnv()) return;
    var hookSrc = "";
    try {
      hookSrc = chrome.runtime.getURL("recvq-fetch-hook.js");
    } catch (eUrl) {
      return;
    }
    document.documentElement.setAttribute("data-yan4-recvq-fetch-hook", "1");
    var s = document.createElement("script");
    s.src = hookSrc;
    s.async = false;
    s.onload = function () {
      try {
        s.remove();
      } catch (eRm) {}
    };
    s.onerror = function () {
      document.documentElement.removeAttribute("data-yan4-recvq-fetch-hook");
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[yna4 recvq shrink] fetch hook script load failed");
      }
    };
    (document.head || document.documentElement).appendChild(s);
  }

  /** 입고하기(/receiving) 본문 스캔 — Shrink 알림 (드로어 조회와 별도) */
  function recvqBindReceivingShrinkHook() {
    if (recvqShrinkHookBound) return;
    if (!receivingqUrlAllowed()) return;
    recvqShrinkHookBound = true;
    recvqEnsureShrinkToastCss();
    recvqInjectReceivingFetchHook();
    window.addEventListener("message", recvqOnShrinkScanMessage, false);
    document.addEventListener("keydown", recvqOnReceivingShrinkKeydown, true);
  }

  var RECVQ_UNLOAD_PAGING_BASE =
    "https://inbound.coupang.com/unloadWork/paging";
  var RECVQ_UNLOAD_LIST_REFERER =
    "https://inbound.coupang.com/unloadWork/list";
  var RECVQ_PAGE_CAP = 100;
  var RECVQ_FETCH_DELAY_MS = 150;
  var recvqSearchRunning = false;
  var recvqSearchStop = false;

  function recvqTodayYmd() {
    try {
      return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    } catch (eTd) {
      var d = new Date();
      return (
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0")
      );
    }
  }

  function recvqBuildUnloadPagingUrl(page, skuBarcode, ymd) {
    var q = new URLSearchParams({
      page: String(page),
      skuBarcode: skuBarcode || "",
      skuId: "",
      orderType: "",
      externalPurchaseOrderId: "",
      vendorName: "",
      invoiceNumber: "",
      bookingNumber: "",
      inboundBarcode: "",
      workerUserUserId: "",
      purchaseType: "",
      dateRangeType: "UNLOAD_DATE",
      endDate: ymd,
      startDate: ymd,
    });
    return RECVQ_UNLOAD_PAGING_BASE + "?" + q.toString();
  }

  function recvqUnloadGmGet(url) {
    var hdr = {
      Accept: "text/html, */*; q=0.01",
      Referer: RECVQ_UNLOAD_LIST_REFERER,
      "X-Requested-With": "XMLHttpRequest",
    };
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    ) {
      return new Promise(function (resolve, reject) {
        chrome.runtime.sendMessage(
          {
            type: "yan4InboundFetch",
            url: url,
            method: "GET",
            referer: hdr.Referer,
            accept: hdr.Accept,
          },
          function (res) {
            if (chrome.runtime.lastError) {
              gmGet(url, hdr).then(resolve, reject);
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
            gmGet(url, hdr).then(resolve, reject);
          }
        );
      });
    }
    return gmGet(url, hdr);
  }

  function recvqCellText(td) {
    if (!td) return "";
    return String(td.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function recvqHeaderIndexMap(table) {
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

  function recvqFindCol(map, candidates) {
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

  function recvqParseRowsFromHtml(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var table = doc.querySelector('table[is="w-table"]');
    if (!table) return [];
    var colMap = recvqHeaderIndexMap(table);
    var iVendor = recvqFindCol(colMap, ["업체명"]);
    var out = [];
    var trs = table.querySelectorAll("tbody tr");
    for (var r = 0; r < trs.length; r++) {
      var tr = trs[r];
      var tds = tr.querySelectorAll("td");
      var btn =
        tr.querySelector("button[data-inbound-barcode]") ||
        tr.querySelector("#printReceivableUnloadWork");
      var ibc = btn
        ? String(btn.getAttribute("data-inbound-barcode") || "").trim()
        : "";
      if (!ibc) continue;
      var vendor =
        iVendor >= 0 && tds[iVendor] ? recvqCellText(tds[iVendor]) : "";
      if (vendor === "-") vendor = "";
      out.push({ ibc: ibc, vendor: vendor });
    }
    return out;
  }

  function recvqHasNextUnloadPage(html) {
    var next = new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector("w-page-next");
    return !!(next && !next.hasAttribute("disabled"));
  }

  async function recvqFetchAllIbc(skuBarcode, onProgress) {
    var ymd = recvqTodayYmd();
    var all = [];
    var seen = {};
    var page = 0;
    var firstSig = null;
    while (page < RECVQ_PAGE_CAP) {
      if (recvqSearchStop) break;
      if (onProgress) onProgress("조회 " + (page + 1) + "페이지 · " + ymd);
      var html = await recvqUnloadGmGet(
        recvqBuildUnloadPagingUrl(page, skuBarcode, ymd)
      );
      var rows = recvqParseRowsFromHtml(html);
      if (!rows.length) break;
      var sig = rows[0].ibc;
      if (firstSig && sig === firstSig && page > 0) break;
      if (!firstSig) firstSig = sig;
      rows.forEach(function (row) {
        if (!seen[row.ibc]) {
          seen[row.ibc] = true;
          all.push(row);
        }
      });
      if (!recvqHasNextUnloadPage(html)) break;
      page++;
      await recvSleep(RECVQ_FETCH_DELAY_MS);
    }
    return all;
  }

  var RECVQ_UNLOAD_WORKS_BASE =
    "https://wms-front.coupang.com/v2/receiving/unload-works";

  function recvqReadWmsFrontHeader() {
    try {
      var nodes = document.querySelectorAll(
        "[data-wms-front-header], [data-x-wms-front-header]"
      );
      var ni;
      for (ni = 0; ni < nodes.length; ni++) {
        var dh = String(
          nodes[ni].getAttribute("data-wms-front-header") ||
            nodes[ni].getAttribute("data-x-wms-front-header") ||
            ""
        ).trim();
        if (dh) return dh;
      }
    } catch (eDh) {}
    return "";
  }

  function recvqWmsFrontFetchJson(url) {
    var ref =
      location.href && location.href.indexOf("wms-front.coupang.com") >= 0
        ? location.href
        : "https://wms-front.coupang.com/receiving";
    var wmsHdr = recvqReadWmsFrontHeader();
    function parseBody(text) {
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch (eJ) {
        throw new Error("JSON 파싱 실패");
      }
    }
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    ) {
      return new Promise(function (resolve, reject) {
        chrome.runtime.sendMessage(
          {
            type: "yan4WmsFrontFetch",
            url: url,
            method: "GET",
            referer: ref,
            wmsFrontHeader: wmsHdr || undefined,
          },
          function (res) {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message || "fetch 실패"));
              return;
            }
            if (!res || !res.ok) {
              reject(
                new Error(
                  (res && res.error) ||
                    "HTTP " + (res && res.status != null ? res.status : "?")
                )
              );
              return;
            }
            if (res.status < 200 || res.status >= 400) {
              reject(new Error("HTTP " + res.status));
              return;
            }
            try {
              resolve(parseBody(res.body));
            } catch (eP) {
              reject(eP);
            }
          }
        );
      });
    }
    var hdrs = {
      Accept: "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest",
      Referer: ref,
      activeresultcode: "true",
      "x-coupang-accept-language": "ko_KR",
    };
    if (wmsHdr) hdrs["x-wms-front-header"] = wmsHdr;
    return fetch(url, { credentials: "include", headers: hdrs }).then(function (
      res
    ) {
      return res.text().then(function (text) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return parseBody(text);
      });
    });
  }

  function recvqDetectStationBarcode() {
    var m = String(document.body && document.body.innerText ? document.body.innerText : "").match(
      /\b(RCS\d{8,})\b/i
    );
    if (m && m[1]) return String(m[1]).trim();
    var inputs = document.querySelectorAll("input");
    var ii;
    for (ii = 0; ii < inputs.length; ii++) {
      var v = String(inputs[ii].value || "").trim();
      if (/^RCS\d{8,}$/i.test(v)) return v;
    }
    var attrs = document.querySelectorAll(
      "[data-station-barcode], [data-station], [data-stationcode]"
    );
    for (ii = 0; ii < attrs.length; ii++) {
      var a =
        attrs[ii].getAttribute("data-station-barcode") ||
        attrs[ii].getAttribute("data-station") ||
        attrs[ii].getAttribute("data-stationcode") ||
        "";
      a = String(a || "").trim();
      if (/^RCS\d{8,}$/i.test(a)) return a;
    }
    return "";
  }

  function recvqInputHintsText(inp) {
    if (!inp) return "";
    var parts = [
      inp.placeholder,
      inp.name,
      inp.id,
      inp.getAttribute("aria-label"),
    ];
    var id = String(inp.id || "").trim();
    if (id) {
      try {
        var lab = document.querySelector('label[for="' + id.replace(/"/g, '\\"') + '"]');
        if (lab) parts.push(lab.textContent);
      } catch (eLf) {}
    }
    var drawer = document.getElementById(RECVQ_ROOT_ID);
    var row = inp.closest("tr, label, .field, .form-group, div");
    if (row && row !== inp && !(drawer && drawer.contains(row))) {
      parts.push(row.textContent);
    }
    return parts
      .map(function (x) {
        return String(x == null ? "" : x);
      })
      .join(" ")
      .replace(/\s+/g, " ");
  }

  function recvqFindReceivingIbcInput() {
    var drawer = document.getElementById(RECVQ_ROOT_ID);
    var best = null;
    var bestScore = 0;
    var inputs = document.querySelectorAll("input, textarea");
    var i;
    for (i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      if (!inp || inp.type === "hidden" || inp.disabled) continue;
      if (drawer && drawer.contains(inp)) continue;
      var hints = recvqInputHintsText(inp);
      var score = 0;
      if (/ibc|운송장|하차번호|inboundbarcode|inbound.*barcode/i.test(hints))
        score += 12;
      if (/receiving.*identifier|scannedreceiving|identifier/i.test(hints))
        score += 6;
      if (/barcode|바코드/i.test(hints)) score += 2;
      if (/sku|상품/i.test(hints)) score -= 8;
      if (score > bestScore) {
        bestScore = score;
        best = inp;
      }
    }
    return bestScore >= 6 ? best : null;
  }

  function recvqSetInputValue(el, value) {
    if (!el) return false;
    var v = String(value || "").trim();
    try {
      el.focus();
    } catch (eF) {}
    try {
      var proto =
        el instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : null;
      var desc =
        proto && Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(el, v);
      else el.value = v;
    } catch (eV) {
      el.value = v;
    }
    try {
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          data: v,
          inputType: "insertText",
        })
      );
    } catch (eIn) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function recvqDispatchEnterOn(el) {
    if (!el) return;
    var keyOpts = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    var types = ["keydown", "keypress", "keyup"];
    var ti;
    for (ti = 0; ti < types.length; ti++) {
      try {
        el.dispatchEvent(new KeyboardEvent(types[ti], keyOpts));
      } catch (eKe) {
        try {
          var ev = document.createEvent("Event");
          ev.initEvent(types[ti], true, true);
          el.dispatchEvent(ev);
        } catch (eEv) {}
      }
    }
    var form = el.closest ? el.closest("form") : null;
    if (form) {
      try {
        if (typeof form.requestSubmit === "function") {
          form.requestSubmit();
        } else {
          form.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true })
          );
        }
      } catch (eFm) {}
    }
  }

  function recvqSleepMs(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function recvqFetchUnloadWorks(ibc, stationBarcode) {
    var ibcNorm = String(ibc || "").trim();
    var station = String(stationBarcode || "").trim();
    if (!ibcNorm) throw new Error("IBC 없음");
    if (!station) {
      throw new Error("입고 작업대를 우선 설정 해주세요");
    }
    var q = new URLSearchParams({
      identifier: ibcNorm,
      stationBarcode: station,
      scannedReceivingIdentifier: ibcNorm,
    });
    var json = await recvqWmsFrontFetchJson(
      RECVQ_UNLOAD_WORKS_BASE + "?" + q.toString()
    );
    if (!json || String(json.resultCode || "").toUpperCase() !== "SUCCESS") {
      var msg =
        json && json.message
          ? String(json.message)
          : json && json.errorCode
            ? String(json.errorCode)
            : "unload-works 실패";
      throw new Error(msg);
    }
    var list = json.data && Array.isArray(json.data) ? json.data : [];
    if (!list.length) throw new Error("unload-works 데이터 없음");
    return list[0];
  }

  async function recvqApplyIbcToReceivingPage(ibc, onStatus) {
    var ibcNorm = String(ibc || "").trim();
    if (!ibcNorm) return;
    if (onStatus) onStatus("IBC 적용 중…");
    var station = recvqDetectStationBarcode();
    var row = await recvqFetchUnloadWorks(ibcNorm, station);
    var inbound = String(
      (row && row.inboundBarcode) || ibcNorm
    ).trim();
    var field = recvqFindReceivingIbcInput();
    if (!field) {
      throw new Error(
        "IBC/운송장 입력칸을 찾지 못했습니다. receiving 본문 화면인지 확인하세요."
      );
    }
    recvqSetInputValue(field, inbound);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(inbound);
      }
    } catch (eCp) {}
    await recvqSleepMs(60);
    recvqDispatchEnterOn(field);
    if (onStatus) onStatus("");
  }

  /** alert() 대신 — Electron(Windows)은 alert 닫은 뒤 페이지 입력·클릭이 먹통이 되는 문제가 있음 */
  var recvqNoticeTimer = 0;
  function recvqShowNotice(text) {
    var id = RECVQ_ROOT_ID + "-notice";
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.setAttribute("role", "alert");
      el.style.cssText =
        "position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:2147483647;" +
        "max-width:min(560px,90vw);padding:14px 22px;border-radius:10px;" +
        "background:#7f1d1d;color:#fff;border:1px solid #fca5a5;" +
        "font:700 15px/1.4 'Malgun Gothic',system-ui,sans-serif;" +
        "box-shadow:0 12px 32px rgba(0,0,0,.35);cursor:pointer;text-align:center;";
      el.title = "클릭하면 닫힘";
      el.addEventListener("click", function () {
        el.style.display = "none";
      });
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = String(text || "");
    el.style.display = "block";
    if (recvqNoticeTimer) clearTimeout(recvqNoticeTimer);
    recvqNoticeTimer = setTimeout(function () {
      el.style.display = "none";
    }, 4000);
  }

  function recvqRenderBarcodes(container, rows, onStatus) {
    container.textContent = "";
    if (!rows.length) {
      container.textContent = "결과 없음";
      return;
    }
    if (typeof JsBarcode === "undefined") {
      container.textContent = "JsBarcode 로드 실패";
      return;
    }
    rows.forEach(function (row) {
      var val = row && row.ibc ? row.ibc : String(row || "");
      var vendor = row && row.vendor ? row.vendor : "";
      var wrap = document.createElement("div");
      wrap.className = "yrq-bc-item";
      wrap.title = "클릭 → IBC/운송장 칸에 입력";
      wrap.setAttribute("role", "button");
      wrap.tabIndex = 0;
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      wrap.appendChild(svg);
      try {
        JsBarcode(svg, val, {
          format: "CODE128",
          width: 1.6,
          height: 50,
          displayValue: true,
          fontSize: 11,
          margin: 6,
          background: "#ffffff",
        });
      } catch (eBc) {
        var sp = document.createElement("div");
        sp.className = "yrq-bc-fallback";
        sp.textContent = val;
        wrap.appendChild(sp);
      }
      if (vendor) {
        var vend = document.createElement("div");
        vend.className = "yrq-vendor";
        vend.textContent = vendor;
        wrap.appendChild(vend);
      }
      function onPick() {
        if (recvqSearchRunning) return;
        recvqApplyIbcToReceivingPage(val, onStatus).catch(function (eAp) {
          var em = eAp && eAp.message ? eAp.message : String(eAp);
          if (onStatus) onStatus("실패 · " + em);
          recvqShowNotice("IBC 적용 실패 · " + em);
        });
      }
      wrap.addEventListener("click", onPick);
      wrap.addEventListener("keydown", function (eKd) {
        if (eKd.key === "Enter" || eKd.key === " ") {
          eKd.preventDefault();
          onPick();
        }
      });
      container.appendChild(wrap);
    });
  }

  function removeRecvqNodesIfPresent() {
    var el = document.getElementById(RECVQ_ROOT_ID);
    try {
      if (el) el.remove();
    } catch (eR) {}
  }

  function mountRecvqDrawer() {
    if (!document.body || document.getElementById(RECVQ_ROOT_ID)) return;

    var oldSkin = document.getElementById(RECVQ_ROOT_ID + "-skin");
    if (oldSkin) {
      try {
        oldSkin.remove();
      } catch (eSk) {}
    }

    var oldSkinV2 = document.getElementById(RECVQ_ROOT_ID + "-skin-v2");
    if (oldSkinV2) {
      try {
        oldSkinV2.remove();
      } catch (eSk2) {}
    }

    var oldSkinV3 = document.getElementById(RECVQ_ROOT_ID + "-skin-v3");
    if (oldSkinV3) {
      try {
        oldSkinV3.remove();
      } catch (eSk3) {}
    }

    var oldSkinV4 = document.getElementById(RECVQ_ROOT_ID + "-skin-v4");
    if (oldSkinV4) {
      try {
        oldSkinV4.remove();
      } catch (eSk4) {}
    }

    var oldSkinV5 = document.getElementById(RECVQ_ROOT_ID + "-skin-v5");
    if (oldSkinV5) {
      try {
        oldSkinV5.remove();
      } catch (eSk5) {}
    }

    var oldSkinV6 = document.getElementById(RECVQ_ROOT_ID + "-skin-v6");
    if (oldSkinV6) {
      try {
        oldSkinV6.remove();
      } catch (eSk6) {}
    }

    var oldSkinV7 = document.getElementById(RECVQ_ROOT_ID + "-skin-v7");
    if (oldSkinV7) {
      try {
        oldSkinV7.remove();
      } catch (eSk7) {}
    }

    var skinId = RECVQ_ROOT_ID + "-skin-v8";
    if (!document.getElementById(skinId) && document.head) {
      var st = document.createElement("style");
      st.id = skinId;
      st.textContent =
        "#" +
        RECVQ_ROOT_ID +
        "{position:fixed;top:0;left:0;bottom:0;z-index:2147483000;pointer-events:none;font:12px/1.4 system-ui,Segoe UI,Malgun Gothic,sans-serif;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-tab{pointer-events:auto;position:absolute;top:32%;left:0;transform:translateY(0);width:30px;padding:11px 7px;border:1px solid #2563eb;border-left:0;border-radius:0 8px 8px 0;background:linear-gradient(180deg,#1e40af,#2563eb);color:#fff;font-size:10.5px;font-weight:800;cursor:pointer;writing-mode:vertical-rl;text-orientation:mixed;letter-spacing:.04em;box-shadow:4px 0 14px rgba(37,99,235,.35);}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-panel{pointer-events:auto;position:absolute;top:0;left:0;height:100%;width:min(320px,92vw);max-width:360px;background:#fff;border-right:1px solid #bfdbfe;box-shadow:8px 0 24px rgba(15,23,42,.12);display:flex;flex-direction:column;transform:translateX(-100%);transition:transform .22s ease;box-sizing:border-box;}" +
        "#" +
        RECVQ_ROOT_ID +
        "[data-yrq-open='1'] .yrq-panel{transform:translateX(0);}" +
        "#" +
        RECVQ_ROOT_ID +
        "[data-yrq-open='1'] .yrq-tab{left:min(320px,92vw);}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-hdr{flex-shrink:0;padding:10px 12px;font-size:12px;font-weight:800;color:#1e3a8a;background:linear-gradient(180deg,#eff6ff,#dbeafe);border-bottom:1px solid #bfdbfe;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-body{flex:1;min-height:0;padding:12px;color:#334155;overflow:auto;display:flex;flex-direction:column;gap:8px;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-inp{flex:1;min-width:0;height:28px;border:1px solid #cbd5e1;border-radius:6px;padding:0 8px;font:inherit;box-sizing:border-box;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-btn{height:28px;padding:0 10px;border:1px solid #2563eb;border-radius:6px;background:#2563eb;color:#fff;font:inherit;font-weight:700;cursor:pointer;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-btn:disabled{opacity:.5;cursor:not-allowed;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-btn--ghost{border-color:#cbd5e1;background:#fff;color:#334155;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-meta{font-size:10px;color:#64748b;line-height:1.35;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-status{font-size:10px;color:#1e40af;min-height:1.2em;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-results{flex:1;min-height:0;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;padding:8px;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-bc-item{display:flex;flex-direction:column;align-items:center;padding:8px 4px;border-bottom:1px dashed #e2e8f0;background:#fff;cursor:pointer;border-radius:6px;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-bc-item:hover{background:#eff6ff;outline:1px solid #93c5fd;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-bc-item:last-child{border-bottom:0;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-vendor{margin-top:4px;font-size:10px;font-weight:700;color:#475569;text-align:center;line-height:1.35;word-break:keep-all;}" +
        "#" +
        RECVQ_ROOT_ID +
        " .yrq-bc-fallback{font-size:12px;font-weight:700;letter-spacing:.06em;}";
      (document.head || document.documentElement).appendChild(st);
    }

    var root = document.createElement("div");
    root.id = RECVQ_ROOT_ID;
    root.setAttribute("data-yrq-open", "0");

    var tab = document.createElement("button");
    tab.type = "button";
    tab.className = "yrq-tab";
    tab.textContent = "바코드";
    tab.setAttribute("aria-label", "바코드 패널 열기");

    var panel = document.createElement("div");
    panel.className = "yrq-panel";
    var hdr = document.createElement("div");
    hdr.className = "yrq-hdr";
    hdr.textContent = "IBC Tracking";
    var body = document.createElement("div");
    body.className = "yrq-body";

    var rowInp = document.createElement("div");
    rowInp.className = "yrq-row";
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "yrq-inp";
    inp.placeholder = "상품바코드를 스캔하세요";
    inp.autocomplete = "off";
    var btnSearch = document.createElement("button");
    btnSearch.type = "button";
    btnSearch.className = "yrq-btn";
    btnSearch.textContent = "조회";
    rowInp.appendChild(inp);
    rowInp.appendChild(btnSearch);

    var rowAct = document.createElement("div");
    rowAct.className = "yrq-row";
    var btnStop = document.createElement("button");
    btnStop.type = "button";
    btnStop.className = "yrq-btn yrq-btn--ghost";
    btnStop.textContent = "중단";
    btnStop.disabled = true;
    rowAct.appendChild(btnStop);

    var status = document.createElement("div");
    status.className = "yrq-status";
    status.textContent = "";

    var results = document.createElement("div");
    results.className = "yrq-results";

    body.appendChild(rowInp);
    body.appendChild(rowAct);
    body.appendChild(status);
    body.appendChild(results);
    panel.appendChild(hdr);
    panel.appendChild(body);
    root.appendChild(tab);
    root.appendChild(panel);
    document.body.appendChild(root);

    recvqEnsureShrinkToastCss();

    function setRecvqStatus(msg) {
      status.textContent = msg || "";
    }

    function setRecvqRunning(on) {
      recvqSearchRunning = on;
      btnSearch.disabled = on;
      btnStop.disabled = !on;
      inp.disabled = on;
    }

    btnSearch.addEventListener("click", async function () {
      if (recvqSearchRunning) return;
      var skuBarcode = String(inp.value || "").trim();
      if (!skuBarcode) {
        recvqShowNotice("상품바코드를 스캔하세요.");
        return;
      }
      recvqMaybeAlertShrink(skuBarcode);
      recvqSearchStop = false;
      setRecvqRunning(true);
      results.textContent = "";
      setRecvqStatus("시작…");
      try {
        var ibcList = await recvqFetchAllIbc(skuBarcode, setRecvqStatus);
        if (recvqSearchStop) {
          setRecvqStatus("중단됨 · " + ibcList.length + "건");
          recvqRenderBarcodes(results, ibcList, setRecvqStatus);
          return;
        }
        recvqRenderBarcodes(results, ibcList, setRecvqStatus);
        setRecvqStatus("완료 · " + ibcList.length + "건 · " + recvqTodayYmd());
      } catch (eRun) {
        results.textContent = "";
        setRecvqStatus(
          "오류: " + (eRun && eRun.message ? eRun.message : String(eRun))
        );
      } finally {
        setRecvqRunning(false);
        recvqSearchStop = false;
      }
    });

    btnStop.addEventListener("click", function () {
      recvqSearchStop = true;
      setRecvqStatus("중단 요청…");
    });

    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !recvqSearchRunning) btnSearch.click();
    });

    tab.addEventListener("click", function () {
      var open = root.getAttribute("data-yrq-open") === "1";
      root.setAttribute("data-yrq-open", open ? "0" : "1");
      tab.setAttribute("aria-label", open ? "바코드 패널 열기" : "바코드 패널 닫기");
    });
  }

  function tryMountRecvq() {
    if (!yna4RecvqGatePassed) return;
    if (!receivingqUrlAllowed()) return;
    recvqBindReceivingShrinkHook();
    mountRecvqDrawer();
  }

  function bootRecvq() {
    tryMountRecvq();
    setTimeout(tryMountRecvq, 0);
    setTimeout(tryMountRecvq, 200);
    setTimeout(tryMountRecvq, 600);
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
          " .yna4-shell-page-nav button.yna4-shell-page-nav--sla{min-width:34px;width:auto;padding:0 5px;font-size:10px;letter-spacing:0.02em;border-color:#a5b4fc;background:#eef2ff;color:#4338ca;}",
        sel +
          " .yna4-shell-page-nav button.yna4-shell-page-nav--sla.is-active{background:#4f46e5;color:#fff;border-color:#4338ca;}",
        sel +
          " .yna4-shell-page-nav button.yna4-shell-page-nav--ats{min-width:34px;width:auto;padding:0 5px;font-size:10px;letter-spacing:0.02em;border-color:#fca5a5;background:#fff5f5;color:#b91c1c;}",
        sel +
          " .yna4-shell-page-nav button.yna4-shell-page-nav--ats.is-active{background:#dc2626;color:#fff;border-color:#b91c1c;}",
        sel +
          " .yna4-shell-page-sla-inner{flex:1 1 auto;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:auto;padding:var(--yna4-sp-3);box-sizing:border-box;pointer-events:auto;}",
        sel +
          " .yna4-shell-page-sla-placeholder{font-size:var(--yna4-fs-md);font-weight:600;color:#64748b;text-align:center;padding:24px 12px;}",
        sel +
          " .yna4-shell-page3-host:has(.yna4-sla-root){overflow:visible;}",
        sel +
          " .yna4-shell-page3-host:has(.yna4-stow-error-root){overflow:visible;}",
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
          " .yna4-pane-card[data-pane='avail'] .yna4-pane-card-body," +
          sel +
          " .yna4-pane-card[data-pane='avail'] .yna4-pane-card-body--tools{overflow:auto;min-width:0;display:flex;flex-direction:column;}",
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
          " .yna4-pane-card[data-pane='p2dmg'] .yna4-pane-card-body," +
          " .yna4-pane-card[data-pane='p2dmg'] .yna4-pane-card-body--tools," +
          " .yna4-pane-card[data-pane='p2recv'] .yna4-pane-card-body," +
          " .yna4-pane-card[data-pane='p2recv'] .yna4-pane-card-body--tools{overflow:auto!important;}",
        sel +
          " .yna4-pane-card[data-pane='p2recv'] .yna4-pane-mod--recv input.yna4-pane-inp," +
          " .yna4-pane-card[data-pane='p2recv'] .yna4-pane-mod--recv select.yna4-pane-inp," +
          " .yna4-pane-card[data-pane='p2recv'] .yna4-pane-mod--recv button{pointer-events:auto;position:relative;z-index:2;}",
        sel +
          " .yna4-pane-shell-page3-full{flex:1 1 auto;min-height:0;min-width:0;width:100%;display:flex;flex-direction:column;padding:var(--yna4-sp-3);box-sizing:border-box;}",
        sel +
          " .yna4-shell-page3-host{flex:1 1 auto;min-height:0;min-width:0;display:flex;flex-direction:column;background:#fff;border:1px solid #bfdbfe;border-radius:var(--yna4-r-2);box-shadow:0 1px 3px rgba(30,64,175,.1);overflow:auto;}",
          " .yna4-shell-page3-host:has(.yna4-ats-root){overflow:visible;}",
        sel +
          " .yna4-shell-page3-inner{flex:1 1 auto;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:auto;padding:var(--yna4-sp-3);box-sizing:border-box;}",
        sel +
          " .yna4-shell-page3-placeholder{font-size:var(--yna4-fs-md);font-weight:600;color:#64748b;text-align:center;padding:24px 12px;}",
          " .yna4-shell-page-ats-inner{flex:1 1 auto;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:auto;padding:var(--yna4-sp-3);box-sizing:border-box;pointer-events:auto;}",
          " .yna4-shell-page-ats-inner .yna4-ats-root,.yna4-shell-page-ats-inner .yna4-ats-toolbar,.yna4-shell-page-ats-inner .yna4-ats-toolbar-row,.yna4-shell-page-ats-inner .yna4-ats-toolbar-row--teams,.yna4-shell-page-ats-inner .yna4-ats-toolbar-row--deadline,.yna4-shell-page-ats-inner .yna4-ats-zone-mode-switch,.yna4-shell-page-ats-inner .yna4-ats-teams-btn-group,.yna4-shell-page-ats-inner .yna4-ats-deadline-chips,.yna4-shell-page-ats-inner .yna4-ats-dashboards-scroll,.yna4-shell-page-ats-inner .yna4-ats-btn,.yna4-shell-page-ats-inner button.yna4-ats-deadline-chip{pointer-events:auto;position:relative;z-index:4;}",
          " .yna4-shell-page-ats-inner .yna4-ats-toolbar{position:sticky;top:0;z-index:12;flex-shrink:0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;box-sizing:border-box;}",
          " .yna4-shell-page-ats-inner .yna4-ats-teams-btn-group,.yna4-shell-page-ats-inner .yna4-ats-btn--teams{display:inline-flex;flex-wrap:wrap;gap:4px;}",
          " .yna4-shell-page-ats-inner .yna4-ats-status{display:inline-flex;align-items:center;min-height:22px!important;padding:2px 6px!important;font-size:10px!important;line-height:1.15;box-sizing:border-box;}",
          " .yna4-shell-page-ats-inner .yna4-ats-status.yna4-ats-pane-status{--yna4-progress:0%;background:linear-gradient(90deg,#bef264 var(--yna4-progress),#f8fafc var(--yna4-progress))!important;border:1px solid #d9f99d;border-radius:10px!important;font-weight:600;color:#1f2937;}",
          " .yna4-shell-page-ats-inner .yna4-ats-toolbar-row--deadline{flex:1 1 100%!important;flex-wrap:nowrap!important;width:100%!important;min-width:0!important;}",
          " .yna4-shell-page-ats-inner .yna4-ats-deadline-chips{display:flex!important;flex-flow:row nowrap!important;overflow-x:auto!important;overflow-y:hidden!important;flex-wrap:nowrap!important;}",
          " .yna4-shell-page-ats-inner .yna4-ats-toolbar-row--cutline{display:flex!important;flex-direction:column!important;flex-wrap:nowrap!important;align-items:stretch!important;gap:4px;width:100%!important;}",
          " .yna4-shell-page-ats-inner .yna4-ats-cutline-list{display:flex!important;flex-flow:row nowrap!important;overflow-x:auto!important;width:100%!important;min-width:0!important;}",
          " .yna4-shell-page-ats-inner button.yna4-ats-deadline-chip{display:inline-flex!important;flex-shrink:0!important;white-space:nowrap!important;min-height:22px!important;padding:2px 6px!important;font-size:10px!important;border-radius:10px!important;appearance:none;-webkit-appearance:none;}",
          " .yna4-shell-page-ats-inner button.yna4-ats-deadline-chip.yna4-ats-deadline-chip--on{background:#16a34a!important;border-color:#15803d!important;color:#fff!important;}",
          " .yna4-shell-page-ats-inner button.yna4-ats-deadline-chip:not(.yna4-ats-deadline-chip--on){background:#f1f5f9!important;border-color:#cbd5e1!important;color:#64748b!important;}",
          " .yna4-shell-page-ats-inner button.yna4-ats-btn{font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:10px!important;font-weight:600;line-height:1.15;-webkit-text-fill-color:currentColor;color:#334155!important;border:1px solid #cbd5e1;border-radius:10px!important;padding:2px 6px!important;background:#fff;min-height:22px!important;box-sizing:border-box;appearance:none;-webkit-appearance:none;}",
          " .yna4-shell-page-ats-inner button.yna4-ats-btn--primary{color:#fff!important;-webkit-text-fill-color:#fff!important;background:#dc2626!important;border-color:#b91c1c!important;}",
          " .yna4-shell-page-ats-inner button.yna4-ats-btn--gloc{color:#fff!important;-webkit-text-fill-color:#fff!important;background:#0f766e!important;border-color:#0d9488!important;}",
          " .yna4-shell-page-ats-inner button.yna4-ats-btn--teams{min-width:1.8em;padding:2px 6px!important;font-size:10px!important;min-height:22px!important;border-radius:10px!important;color:#334155!important;-webkit-text-fill-color:#334155!important;background:#fff!important;appearance:none;-webkit-appearance:none;}",
          " .yna4-shell-page-ats-inner .yna4-ats-zone-mode-switch[data-ats-zone-mode=teams]{border-color:#93c5fd!important;background:#eff6ff!important;}",
          " .yna4-shell-page-ats-inner .yna4-ats-zone-mode-switch[data-ats-zone-mode=pdf]{border-color:#c4b5fd!important;background:#f5f3ff!important;}",
          " .yna4-shell-page-ats-inner button.yna4-ats-zone-mode-btn.yna4-ats-zone-mode-btn--teams-on{background:#2563eb!important;border-color:#1d4ed8!important;color:#fff!important;-webkit-text-fill-color:#fff!important;font-weight:700!important;}",
          " .yna4-shell-page-ats-inner button.yna4-ats-zone-mode-btn.yna4-ats-zone-mode-btn--pdf-on{background:#7c3aed!important;border-color:#6d28d9!important;color:#fff!important;-webkit-text-fill-color:#fff!important;font-weight:700!important;}",
          " .yna4-shell-page-ats-inner button.yna4-ats-btn.yna4-ats-zone-btn.yna4-ats-zone-btn--pdf-on{background:#7c3aed!important;border-color:#6d28d9!important;color:#fff!important;-webkit-text-fill-color:#fff!important;font-weight:700!important;}",
          " .yna4-shell-page-ats-inner button.yna4-ats-btn.yna4-ats-zone-btn.yna4-ats-zone-btn--pdf-on:hover:not(:disabled){background:#6d28d9!important;border-color:#5b21b6!important;color:#fff!important;-webkit-text-fill-color:#fff!important;}",
          " .yna4-shell-page-ats-inner button.yna4-ats-btn--print{color:#1e293b!important;-webkit-text-fill-color:#1e293b!important;background:#f8fafc!important;border-color:#475569!important;font-weight:700!important;}",
          " .yna4-shell-page-ats-placeholder{font-size:var(--yna4-fs-md);font-weight:600;color:#64748b;text-align:center;padding:24px 12px;}",
        sel +
          " .yna4-page3-mod{gap:10px;min-height:0;font-size:15px;}",
        sel +
          " .yna4-page3-mod .yna4-pane-inp{font-size:16px;height:28px;}",
        sel +
          " .yna4-page3-mod .yna4-pane-btn{font-size:15px;}",
        sel +
          " .yna4-page3-mod .yna4-pane-status{font-size:14px;}",
        sel +
          " .yna4-page3-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;flex-shrink:0;}",
        sel +
          " .yna4-page3-grid{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}",
        sel +
          " .yna4-page3-col{min-width:0;display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px solid #bfdbfe;border-radius:var(--yna4-r-2);background:#fff;}",
        sel +
          " .yna4-page3-col-lbl{font-size:17px;font-weight:800;color:#1e40af;letter-spacing:-0.02em;text-align:center;}",
        sel +
          " .yna4-page3-col-body{flex:1 1 auto;min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;}",
        sel +
          " .yna4-page3-barcode-pane{flex:1 1 auto;width:100%;min-height:300px;border:1px solid #e5e9ef;border-radius:14px;background:#fbfcfd;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;padding:14px 12px;box-sizing:border-box;}",
        sel +
          " .yna4-page3-bc-core{flex:1 1 auto;min-height:200px;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;}",
        sel +
          " .yna4-page3-bc-slot{width:100%;height:" +
          PAGE3_BARCODE_SVG_HEIGHT_PX +
          "px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;}",
        sel +
          " .yna4-page3-bc-slot svg{height:" +
          PAGE3_BARCODE_SVG_HEIGHT_PX +
          "px !important;width:auto !important;max-width:100%;display:block;}",
        sel +
          " .yna4-page3-bc-foot{flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;margin-top:8px;}",
        sel +
          " .yna4-page3-bc-foot--spacer{min-height:72px;visibility:hidden;pointer-events:none;}",
        sel +
          " .yna4-page3-col-body--notice{background:#fff7ed;border:2px solid #fb923c;border-radius:14px;display:flex;align-items:center;justify-content:center;min-height:200px;}",
        sel +
          " .yna4-page3-qty-notice{font-size:clamp(32px,6vw,56px);font-weight:900;color:#dc2626;text-align:center;line-height:1.15;letter-spacing:-0.02em;padding:16px;word-break:keep-all;}",
        sel +
          " .yna4-page3-bc-text{margin-top:14px;font-size:28px;font-weight:800;color:#111827;word-break:break-all;text-align:center;line-height:1.2;letter-spacing:-0.3px;width:100%;}",
        sel +
          " .yna4-page3-bc-prog{margin-top:10px;display:inline-block;padding:10px 18px;font-size:28px;font-weight:900;color:#0f172a;background:#eef4ff;border:2px solid #c9dcff;border-radius:12px;line-height:1;letter-spacing:-0.5px;}",
        sel +
          " .yna4-page3-tote-nav{margin-top:4px;font-size:18px;font-weight:800;color:#334155;text-align:center;line-height:1.35;}",
        sel +
          " .yna4-page3-key{display:inline-block;min-width:1.5em;text-align:center;padding:3px 10px;margin:0 2px;background:#1e40af;color:#fff;border-radius:8px;font-size:20px;font-weight:900;line-height:1.2;}",
        sel +
          " .yna4-page3-name-foot{flex-shrink:0;padding:12px 14px;border:1px solid #bfdbfe;border-radius:var(--yna4-r-2);background:#f8fafc;position:sticky;top:0;z-index:2;}",
        sel +
          " .yna4-page3-name-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:6px;}",
        sel +
          " .yna4-page3-name-lbl{font-size:15px;font-weight:800;color:#1e40af;}",
        sel +
          " .yna4-page3-total-units{font-size:18px;font-weight:900;color:#b91c1c;white-space:nowrap;}",
        sel +
          " .yna4-page3-name-val{font-size:22px;font-weight:800;color:#0f172a;line-height:1.35;word-break:break-word;max-height:5em;overflow:auto;}",
        sel +
          " .yna4-page3-help{font-size:13px;color:#64748b;line-height:1.4;flex-shrink:0;}",
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
          " .yna4-pane-mod--locked{gap:6px;justify-content:center;padding:10px 8px;}",
          " .yna4-pane-lock-hint{font-size:10px;font-weight:700;color:#64748b;text-align:center;}",
          " .yna4-pane-row--lock{gap:6px;}",
          " .yna4-pane-lock-inp{flex:1 1 auto;min-width:0;}",
          " .yna4-pane-lock-err{font-size:10px;font-weight:700;color:#b91c1c;text-align:center;}",
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
          " .yna4-pane-mod--transfer-excel input[type='date'].yna4-pane-inp," +
          sel +
          " .yna4-pane-mod--stow-watch input[type='date'].yna4-pane-inp{max-width:10em;width:10em;min-width:0;font-size:8px;height:18px;min-height:18px;padding:0 3px;}",
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
          " .yna4-pane-card[data-pane='slot05']{min-height:min(240px,32vh);}",
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
          " .yna4-pane-mod--gross-uph .yna4-gross-uph-center{font-size:10px;font-weight:700;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:1px 6px;white-space:nowrap;}" +
          " .yna4-pane-mod--gross-uph .yna4-gross-uph-target{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;color:#334155;white-space:nowrap;}" +
          " .yna4-pane-mod--gross-uph .yna4-gross-uph-target-input{width:56px;font-size:10px;font-weight:600;padding:1px 4px;border:1px solid #cbd5e1;border-radius:8px;min-height:20px;box-sizing:border-box;text-align:right;}" +
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
    btnShellPage2.title = "입고내역 RWA (RPA)";
    var btnShellPage3 = document.createElement("button");
    btnShellPage3.type = "button";
    btnShellPage3.textContent = "3";
    btnShellPage3.title = "통합 3페이지 (단일 화면)";
    var btnShellPage4 = document.createElement("button");
    btnShellPage4.type = "button";
    btnShellPage4.textContent = "4";
    btnShellPage4.title = "STOW Error Tracking (월별)";
    var btnShellPageSla = document.createElement("button");
    btnShellPageSla.type = "button";
    btnShellPageSla.textContent = "SLA";
    btnShellPageSla.className = "yna4-shell-page-nav--sla";
    btnShellPageSla.title = "SLA (단일 화면)";
    var btnShellPageAts = document.createElement("button");
    btnShellPageAts.type = "button";
    btnShellPageAts.textContent = "ATS";
    btnShellPageAts.className = "yna4-shell-page-nav--ats";
    btnShellPageAts.title = "ATS (단일 화면)";
    pageNav.appendChild(btnShellPageSla);
    pageNav.appendChild(btnShellPageAts);
    pageNav.appendChild(btnShellPage1);
    pageNav.appendChild(btnShellPage2);
    pageNav.appendChild(btnShellPage3);
    pageNav.appendChild(btnShellPage4);

    var isDesktopShell =
      typeof window !== "undefined" && !!window.__YAN4_DESKTOP_SHELL__;

    var btnFold = document.createElement("button");
    btnFold.type = "button";
    btnFold.setAttribute("aria-label", "패널 접기");
    btnFold.textContent = "−";
    btnFold.setAttribute(
      "style",
      "flex-shrink:0;border:1px solid #bbb;background:#fff;color:#333;width:23px;height:23px;font-size:12px;line-height:1;cursor:pointer;font-weight:700;border-radius:0;padding:0;"
    );

    /* Desktop: 타이틀 제거 · SLA/ATS/1/2/3/4 는 #banner(YAN4 IB LIVE) 열로 이동
       Extension: 타이틀 제거 · 페이지 내비만 헤더에 유지 */
    if (isDesktopShell) {
      var desktopBanner = document.getElementById("banner");
      if (desktopBanner) {
        var loginGroupEl = desktopBanner.querySelector(".login-group");
        if (loginGroupEl) {
          desktopBanner.insertBefore(pageNav, loginGroupEl);
        } else {
          desktopBanner.appendChild(pageNav);
        }
      } else {
        hdr.appendChild(pageNav);
      }
      hdr.style.display = "none";
    } else {
      hdr.appendChild(pageNav);
      hdr.appendChild(btnFold);
    }

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

    var shellPage3 = document.createElement("div");
    shellPage3.id = ROOT_ID + "-shell-page-3";
    shellPage3.className = "yna4-shell-page";
    shellPage3.style.display = "none";

    var paneMain = document.createElement("div");
    paneMain.className =
      "yna4-pane-shell-main yna4-pane-grid yna4-pane-grid--shell";

    shellPage1.appendChild(paneMain);

    var paneMain2 = document.createElement("div");
    paneMain2.className =
      "yna4-pane-shell-main yna4-pane-grid yna4-pane-grid--shell-page2";

    shellPage2.appendChild(paneMain2);

    var paneMain3 = document.createElement("div");
    paneMain3.className =
      "yna4-pane-shell-main yna4-pane-shell-page3-full";
    var shellPage3Host = document.createElement("div");
    shellPage3Host.className = "yna4-shell-page3-host";
    paneMain3.appendChild(shellPage3Host);
    try {
      initUnifiedShellPage3(shellPage3Host);
    } catch (eP3Mount) {
      shellPage3Host.textContent = "3페이지 초기화 실패";
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[YAN4 Shell] page3 mount failed", eP3Mount);
      }
    }
    shellPage3.appendChild(paneMain3);

    var shellPageSla = document.createElement("div");
    shellPageSla.id = ROOT_ID + "-shell-page-sla";
    shellPageSla.className = "yna4-shell-page";
    shellPageSla.style.display = "none";

    var paneMainSla = document.createElement("div");
    paneMainSla.className =
      "yna4-pane-shell-main yna4-pane-shell-page3-full";
    var shellPageSlaHost = document.createElement("div");
    shellPageSlaHost.className = "yna4-shell-page3-host";
    paneMainSla.appendChild(shellPageSlaHost);
    try {
      initUnifiedShellPageSla(shellPageSlaHost);
    } catch (eSlaMount) {
      shellPageSlaHost.textContent = "SLA 페이지 초기화 실패";
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[YAN4 Shell] SLA mount failed", eSlaMount);
      }
    }
    shellPageSla.appendChild(paneMainSla);

    var shellPageAts = document.createElement("div");
    shellPageAts.id = ROOT_ID + "-shell-page-ats";
    shellPageAts.className = "yna4-shell-page";
    shellPageAts.style.display = "none";
    if (cfsAppIsPs()) {
      shellPage1.style.display = "none";
      shellPageAts.style.display = "flex";
    }

    var paneMainAts = document.createElement("div");
    paneMainAts.className =
      "yna4-pane-shell-main yna4-pane-shell-page3-full";
    var shellPageAtsHost = document.createElement("div");
    shellPageAtsHost.className = "yna4-shell-page3-host";
    paneMainAts.appendChild(shellPageAtsHost);
    try {
      initUnifiedShellPageAts(shellPageAtsHost);
    } catch (eAtsMount) {
      shellPageAtsHost.textContent = "ATS 페이지 초기화 실패";
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[YAN4 Shell] ATS mount failed", eAtsMount);
      }
    }
    shellPageAts.appendChild(paneMainAts);

    var shellPage4 = document.createElement("div");
    shellPage4.id = ROOT_ID + "-shell-page-4";
    shellPage4.className = "yna4-shell-page";
    shellPage4.style.display = "none";
    var paneMain4 = document.createElement("div");
    paneMain4.className = "yna4-pane-shell-main yna4-pane-shell-page3-full";
    var shellPage4Host = document.createElement("div");
    shellPage4Host.className = "yna4-shell-page3-host";
    paneMain4.appendChild(shellPage4Host);
    try {
      initUnifiedShellPage4(shellPage4Host);
    } catch (eP4Mount) {
      shellPage4Host.textContent = "4페이지 초기화 실패";
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[YAN4 Shell] page4 mount failed", eP4Mount);
      }
    }
    shellPage4.appendChild(paneMain4);

    body.appendChild(shellPage1);
    body.appendChild(shellPage2);
    body.appendChild(shellPage3);
    body.appendChild(shellPageSla);
    body.appendChild(shellPageAts);
    body.appendChild(shellPage4);

    var page2PaneSpecs = UNIFIED_SHELL_PAGE2_PANE_SPECS;
    if (cfsAppIsPs()) {
      page2PaneSpecs = UNIFIED_SHELL_PAGE2_PANE_SPECS.filter(function (spec) {
        return spec.kind === "rcrtLabelPrint" || spec.kind === "barcode128";
      });
    }
    page2PaneSpecs.forEach(function (spec, idx) {
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
      hdrTitle.textContent = paneCardTitleForSpec(spec);
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
      } else if (kind === "toteMoveApi") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        var initTotePane = function (el) {
          try {
            if (typeof window.__YAN4_INIT_TOTE_MOVE_API_PANE__ === "function") {
              window.__YAN4_INIT_TOTE_MOVE_API_PANE__(el);
            } else {
              el.textContent = "모듈 로드 실패";
            }
          } catch (eTm) {
            el.textContent = "초기화 실패(Tote-Move)";
            if (typeof console !== "undefined" && console.warn) {
              console.warn("[YAN4 Shell] toteMoveApi pane failed", eTm);
            }
          }
        };
        if (spec.paneLock && spec.paneLock.lockId) {
          mountPasswordLockedPane(paneBody, {
            lockId: spec.paneLock.lockId,
            password: spec.paneLock.password,
            initFn: initTotePane,
            titleEl: hdrTitle,
            revealedTitle: label,
          });
        } else {
          initTotePane(paneBody);
        }
      } else if (kind === "rcrtLabelPrint") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          if (typeof window.__YAN4_INIT_RCRT_LABEL_PRINT_PANE__ === "function") {
            window.__YAN4_INIT_RCRT_LABEL_PRINT_PANE__(paneBody);
          } else {
            paneBody.textContent = "모듈 로드 실패";
          }
        } catch (eRcrt) {
          paneBody.textContent = "초기화 실패(RCRT QR)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] rcrtLabelPrint pane failed", eRcrt);
          }
        }
      } else if (kind === "locationConsolidation") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        var initLocPane = function (el) {
          try {
            if (
              typeof window.__YAN4_INIT_LOCATION_CONSOLIDATION_PANE__ ===
              "function"
            ) {
              window.__YAN4_INIT_LOCATION_CONSOLIDATION_PANE__(el);
            } else {
              el.textContent = "모듈 로드 실패";
            }
          } catch (eLoc) {
            el.textContent = "초기화 실패(Location CONSOL)";
            if (typeof console !== "undefined" && console.warn) {
              console.warn(
                "[YAN4 Shell] locationConsolidation pane failed",
                eLoc
              );
            }
          }
        };
        if (spec.paneLock && spec.paneLock.lockId) {
          mountPasswordLockedPane(paneBody, {
            lockId: spec.paneLock.lockId,
            password: spec.paneLock.password,
            initFn: initLocPane,
            titleEl: hdrTitle,
            revealedTitle: label,
          });
        } else {
          initLocPane(paneBody);
        }
      } else if (kind === "bipyoLabelPrint") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          if (typeof window.__YAN4_INIT_BIPYO_LABEL_PRINT_PANE__ === "function") {
            window.__YAN4_INIT_BIPYO_LABEL_PRINT_PANE__(paneBody);
          } else {
            paneBody.textContent = "모듈 로드 실패";
          }
        } catch (eBipyo) {
          paneBody.textContent = "초기화 실패(수박비표)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] bipyoLabelPrint pane failed", eBipyo);
          }
        }
      } else if (kind === "damageVerify") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        var initDmgPane = function (el) {
          try {
            if (typeof window.__YAN4_INIT_DAMAGE_VERIFY_PANE__ === "function") {
              window.__YAN4_INIT_DAMAGE_VERIFY_PANE__(el);
            } else {
              el.textContent = "모듈 로드 실패";
            }
          } catch (eDmg) {
            el.textContent = "초기화 실패(IB 오류처리)";
            if (typeof console !== "undefined" && console.warn) {
              console.warn("[YAN4 Shell] damageVerify pane failed", eDmg);
            }
          }
        };
        if (spec.paneLock && spec.paneLock.lockId) {
          mountPasswordLockedPane(paneBody, {
            lockId: spec.paneLock.lockId,
            password: spec.paneLock.password,
            initFn: initDmgPane,
            titleEl: hdrTitle,
            revealedTitle: label,
          });
        } else {
          initDmgPane(paneBody);
        }
      } else if (kind === "availHistory") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          if (typeof window.__YAN4_INIT_AVAIL_HISTORY_PANE__ === "function") {
            window.__YAN4_INIT_AVAIL_HISTORY_PANE__(paneBody);
          } else {
            paneBody.textContent = "모듈 로드 실패";
          }
        } catch (eAvail) {
          paneBody.textContent = "초기화 실패(가용화내역조회)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] availHistory pane failed", eAvail);
          }
        }
      } else if (kind === "prepackDaily") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          initPrepackDailyRoutinePane(paneBody);
        } catch (ePrepack) {
          paneBody.textContent = "초기화 실패(Prepack&SR Daily Patrol)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] prepackDaily pane failed", ePrepack);
          }
        }
      } else if (kind === "workerScanTrace") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          initWorkerScanTracePane(paneBody);
        } catch (eWorkerScan) {
          paneBody.textContent = "초기화 실패(STOW SCAN TRACKING)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] worker scan pane failed", eWorkerScan);
          }
        }
      } else if (kind === "barcode128") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          initBarcode128Pane(paneBody);
        } catch (eBc128) {
          paneBody.textContent = "초기화 실패(바코드 생성)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] barcode128 pane failed", eBc128);
          }
        }
      } else {
        paneBody.textContent = "—";
      }

      paneMain2.appendChild(card);
    });

    function shellTierIsRecvqLimited() {
      return yna4ShellPage3GatePassed && !yna4ShellGatePassed;
    }

    function normalizeShellPageKey(pageKey) {
      if (pageKey === "sla" || pageKey === 5 || pageKey === "5") return "sla";
      if (pageKey === "ats") return "ats";
      if (pageKey === 4 || pageKey === "4") return "4";
      if (pageKey === 3 || pageKey === "3") return "3";
      if (pageKey === 2 || pageKey === "2") return "2";
      return "1";
    }

    function applyShellTierNavVisibility() {
      if (cfsAppIsPs()) {
        btnShellPage1.style.display = "none";
        btnShellPage4.style.display = "none";
        btnShellPageSla.style.display = "none";
        btnShellPage2.style.display = "";
        btnShellPage3.style.display = "";
        btnShellPageAts.style.display = "";
        btnShellPage2.textContent = "1";
        btnShellPage3.textContent = "2";
        btnShellPage2.title = "RCRT QR · 바코드 생성";
        btnShellPage3.title = "단일 화면";
        return;
      }
      var recvqLimited = shellTierIsRecvqLimited();
      btnShellPage1.style.display = recvqLimited ? "none" : "";
      btnShellPage2.style.display = recvqLimited ? "none" : "";
      btnShellPage4.style.display = recvqLimited ? "none" : "";
      btnShellPageSla.style.display = !yna4ShellGatePassed ? "none" : "";
      btnShellPageAts.style.display = !yna4ShellPage3GatePassed ? "none" : "";
      btnShellPage3.title = recvqLimited
        ? "통합 3페이지 (IB · 단일 화면)"
        : "통합 3페이지 (단일 화면)";
    }

    var shellPageSetCount = 0;
    function setShellPage(pageKey) {
      var p = normalizeShellPageKey(pageKey);
      if (cfsAppIsPs() && p !== "2" && p !== "3" && p !== "ats") {
        p = "ats";
      }
      if (shellTierIsRecvqLimited() && p !== "3" && p !== "ats") {
        p = "3";
      }
      if (p === "sla" && !yna4ShellGatePassed) {
        p = yna4ShellPage3GatePassed ? "3" : "1";
      }
      if (p === "ats" && !yna4ShellPage3GatePassed) {
        p = yna4ShellGatePassed ? "1" : "3";
      }
      if ((p === "1" || p === "2" || p === "4") && !yna4ShellGatePassed) {
        p = yna4ShellPage3GatePassed ? "3" : "1";
      }
      if (cfsAppIsPs() && p !== "2" && p !== "3" && p !== "ats") {
        p = "ats";
      }
      shellPage1.style.display = p === "1" ? "flex" : "none";
      shellPage2.style.display = p === "2" ? "flex" : "none";
      shellPage3.style.display = p === "3" ? "flex" : "none";
      shellPage4.style.display = p === "4" ? "flex" : "none";
      shellPageSla.style.display = p === "sla" ? "flex" : "none";
      shellPageAts.style.display = p === "ats" ? "flex" : "none";
      if (p === "sla") {
        var slaHostRemount = shellPageSla.querySelector(".yna4-shell-page3-host");
        var slaUiRev =
          typeof window.__YAN4_SLA_UI_REV__ === "string"
            ? window.__YAN4_SLA_UI_REV__
            : "";
        var slaInnerRemount = slaHostRemount
          ? slaHostRemount.querySelector(".yna4-shell-page-sla-inner")
          : null;
        var slaUiStale =
          slaHostRemount &&
          (!slaHostRemount.querySelector(".yna4-sla-root") ||
            (slaUiRev &&
              (!slaInnerRemount ||
                slaInnerRemount.getAttribute("data-yna4-sla-ui-rev") !==
                  slaUiRev)));
        if (slaUiStale) {
          try {
            initUnifiedShellPageSla(slaHostRemount);
          } catch (eSlaRemount) {
            if (typeof console !== "undefined" && console.warn) {
              console.warn("[YAN4 Shell] SLA remount failed", eSlaRemount);
            }
          }
        }
      }
      if (p === "ats") {
        var atsHostRemount = shellPageAts.querySelector(".yna4-shell-page3-host");
        var atsUiRev =
          typeof window.__YAN4_ATS_UI_REV__ === "string"
            ? window.__YAN4_ATS_UI_REV__
            : "";
        var atsUiStale =
          atsHostRemount &&
          (!atsHostRemount.querySelector(".yna4-ats-teams-btn-group") ||
            (atsUiRev &&
              atsHostRemount.getAttribute("data-yna4-ats-ui-rev") !== atsUiRev));
        if (atsUiStale) {
          try {
            initUnifiedShellPageAts(atsHostRemount);
          } catch (eAtsRemount) {
            if (typeof console !== "undefined" && console.warn) {
              console.warn("[YAN4 Shell] ATS remount failed", eAtsRemount);
            }
          }
        }
      }
      if (p === "4") {
        var p4HostRemount = shellPage4.querySelector(".yna4-shell-page3-host");
        var p4UiRev =
          typeof window.__YAN4_STOW_ERR_UI_REV__ === "string"
            ? window.__YAN4_STOW_ERR_UI_REV__
            : "";
        var p4Inner = p4HostRemount
          ? p4HostRemount.querySelector(".yna4-stow-error-mounted")
          : null;
        var p4Stale =
          p4HostRemount &&
          (!p4HostRemount.querySelector(".yna4-stow-error-root") ||
            (p4UiRev &&
              (!p4Inner ||
                p4Inner.getAttribute("data-yna4-stow-err-ui-rev") !== p4UiRev)));
        if (p4Stale) {
          try {
            initUnifiedShellPage4(p4HostRemount);
          } catch (eP4Remount) {
            if (typeof console !== "undefined" && console.warn) {
              console.warn("[YAN4 Shell] page4 remount failed", eP4Remount);
            }
          }
        }
      }
      btnShellPage1.classList.toggle("is-active", p === "1");
      btnShellPage2.classList.toggle("is-active", p === "2");
      btnShellPage3.classList.toggle("is-active", p === "3");
      btnShellPage4.classList.toggle("is-active", p === "4");
      btnShellPageSla.classList.toggle("is-active", p === "sla");
      btnShellPageAts.classList.toggle("is-active", p === "ats");
      shellPageSetCount++;
      try {
        GM_setValue(ROOT_ID + "_shell_page", p);
      } catch (eSp) {}
      // GM_getValue 는 Promise 라 시작 때 바로 못 읽음 → 동기로 읽을 사본
      try {
        localStorage.setItem(ROOT_ID + "_shell_page", p);
      } catch (eLsP) {}
      if (p === "1") syncNeedHelpColumnHeight(wrap);
      applyShellTierNavVisibility();
    }

    btnShellPage1.addEventListener("click", function () {
      setShellPage("1");
    });
    btnShellPage2.addEventListener("click", function () {
      setShellPage("2");
    });
    btnShellPage3.addEventListener("click", function () {
      setShellPage("3");
    });
    btnShellPage4.addEventListener("click", function () {
      setShellPage("4");
    });
    btnShellPageSla.addEventListener("click", function () {
      setShellPage("sla");
    });
    btnShellPageAts.addEventListener("click", function () {
      setShellPage("ats");
    });

    applyShellTierNavVisibility();

    function applyRestoredShellPage(savedPage) {
      if (cfsAppIsPs()) {
        var restoredPs = normalizeShellPageKey(savedPage);
        if (restoredPs !== "2" && restoredPs !== "3" && restoredPs !== "ats") {
          restoredPs = "ats";
        }
        setShellPage(restoredPs);
      } else if (shellTierIsRecvqLimited()) {
        var restoredIb = normalizeShellPageKey(savedPage);
        setShellPage(restoredIb === "ats" ? "ats" : "3");
      } else {
        var restored = normalizeShellPageKey(savedPage);
        if (
          restored === "2" ||
          restored === "3" ||
          restored === "4" ||
          restored === "sla" ||
          restored === "ats"
        ) {
          setShellPage(restored);
        }
      }
    }

    var lsShellPage = null;
    try {
      lsShellPage = localStorage.getItem(ROOT_ID + "_shell_page");
    } catch (eLsR) {}
    try {
      applyRestoredShellPage(lsShellPage || "1");
    } catch (eSp2) {
      if (cfsAppIsPs()) setShellPage("ats");
      else if (shellTierIsRecvqLimited()) setShellPage("3");
    }
    if (!lsShellPage && typeof GM_getValue === "function") {
      // 사본이 아직 없으면(이전 버전) 저장소 값으로 한 번 복원 — 그사이 사용자가 페이지를 바꿨으면 그대로 둠
      var shellPageSetAtBoot = shellPageSetCount;
      try {
        Promise.resolve(GM_getValue(ROOT_ID + "_shell_page", "")).then(function (v) {
          if (!v || shellPageSetCount !== shellPageSetAtBoot) return;
          try {
            applyRestoredShellPage(v);
          } catch (eSp3) {}
        });
      } catch (eGmP) {}
    }

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
      } else if (kind === "availHistory") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          if (typeof window.__YAN4_INIT_AVAIL_HISTORY_PANE__ === "function") {
            window.__YAN4_INIT_AVAIL_HISTORY_PANE__(paneBody);
          } else {
            paneBody.textContent = "모듈 로드 실패";
          }
        } catch (eAvailP1) {
          paneBody.textContent = "초기화 실패(가용화내역조회)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] availHistory pane init failed", eAvailP1);
          }
        }
      } else if (kind === "prepackDaily") {
        paneBody.classList.add("yna4-pane-card-body--tools");
        try {
          initPrepackDailyRoutinePane(paneBody);
        } catch (ePrepackP1) {
          paneBody.textContent = "초기화 실패(Prepack&SR Daily Patrol)";
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Shell] prepackDaily pane init failed", ePrepackP1);
          }
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
      if (isDesktopShell) return;
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

    if (!isDesktopShell) {
      btnFold.addEventListener("click", function () {
        setMinimized(true);
      });
      fabRestore.addEventListener("click", function () {
        setMinimized(false);
      });
    }

    card.appendChild(hdr);
    card.appendChild(body);
    wrap.appendChild(card);
    if (isDesktopShell) {
      var deskHost = document.getElementById("shellMount");
      if (deskHost) deskHost.appendChild(wrap);
      else document.body.appendChild(wrap);
    } else {
      document.body.appendChild(wrap);
      document.body.appendChild(fabRestore);
    }
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
    if (!yna4ShellGatePassed && !yna4ShellPage3GatePassed) return;
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

  function yna4GateStartBoot(tier) {
    yna4GateApplyTier(tier);
    var run = function () {
      if (
        (yna4ShellGatePassed || yna4ShellPage3GatePassed) &&
        inboundShellUrlAllowed()
      ) {
        bootShell();
      }
      if (yna4RecvqGatePassed && receivingqUrlAllowed()) bootRecvq();
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  }

  yna4GateEnsureUnlocked(yna4GateStartBoot);

  function onLocationMaybeChange() {
    if (inboundShellUrlAllowed()) {
      if (yna4ShellGatePassed || yna4ShellPage3GatePassed) tryMount();
    } else {
      removeShellNodesIfPresent();
    }
    if (receivingqUrlAllowed()) {
      if (yna4RecvqGatePassed) tryMountRecvq();
    } else {
      removeRecvqNodesIfPresent();
    }
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
      if (inboundShellUrlAllowed()) {
        if (!yna4ShellGatePassed && !yna4ShellPage3GatePassed) {
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
        return;
      }
      removeShellNodesIfPresent();
      if (receivingqUrlAllowed()) {
        if (yna4RecvqGatePassed && !document.getElementById(RECVQ_ROOT_ID)) {
          tryMountRecvq();
        }
      } else {
        removeRecvqNodesIfPresent();
      }
    } catch (ignore) {}
  }, 3000);
})();

