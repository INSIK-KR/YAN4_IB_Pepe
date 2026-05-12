// ==UserScript==
// @name         YAN4 IB 통합 UI Shell (UI만 · 단일 파일)
// @namespace    yna4-ui-shell
// @version      0.20.7
// @description  YAN4 IB 통합: 직납하차내역 긁어오기 HTTP + outbound 워크플로우(embed) · 그리드(~10칸)
// NOTE: 패널은 inboundShellUrlAllowed + 매칭은 아래 참고 (@match=outbound 에선 패널 없음 · 워크플로우 embed DOM만).
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
// @connect      inbound.coupang.com
// @connect      inventory.coupang.com
// @connect      outbound.coupang.com
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  /** 페이지/구버전 스크립트와 id 충돌 시 패널이 영구히 안 뜰 수 있어 고유값 유지 */
  var ROOT_ID = "yna4UnifiedUiShell_v09";
  var UNLOAD_MINI_BTN_DEFAULT_URL = "";
  var UNLOAD_MINI_BTN_STORAGE_KEY = ROOT_ID + "-unload-mini-btn-url";

  function getUnloadMiniBtnUrl() {
    try {
      var v = localStorage.getItem(UNLOAD_MINI_BTN_STORAGE_KEY) || "";
      if (String(v).trim()) return String(v).trim();
    } catch (eGet) {}
    return String(UNLOAD_MINI_BTN_DEFAULT_URL || "").trim();
  }

  function setUnloadMiniBtnUrl(v) {
    try {
      if (!String(v || "").trim()) {
        localStorage.removeItem(UNLOAD_MINI_BTN_STORAGE_KEY);
        return;
      }
      localStorage.setItem(UNLOAD_MINI_BTN_STORAGE_KEY, String(v).trim());
    } catch (eSet) {}
  }

  function openUnloadMiniBtnTarget(ev) {
    try {
      if (ev && ev.shiftKey) {
        var cur = getUnloadMiniBtnUrl();
        var next = prompt(
          "열 HTML URL을 입력하세요.\n예) file:///C:/.../my.html  또는 https://...",
          cur || ""
        );
        if (next === null) return;
        setUnloadMiniBtnUrl(next);
        return;
      }
      var target = getUnloadMiniBtnUrl();
      if (!target) {
        var input = prompt(
          "먼저 열 HTML URL을 입력하세요.\n예) file:///C:/.../my.html  또는 https://...",
          ""
        );
        if (!input) return;
        setUnloadMiniBtnUrl(input);
        target = String(input).trim();
      }
      if (!target) return;
      window.open(target, "_blank", "noopener,noreferrer");
    } catch (eOpen) {
      alert("열기 실패: " + (eOpen && eOpen.message ? eOpen.message : eOpen));
    }
  }

  /**
   * 통합 패널 카드 슬롯 정의 (개수·순서 늘리려면 이 배열만 수정)
   * kind: unload=직납하차내역 긁어오기 · repl=outbound 워크플로우(IB 루트) · todo/slot 참고
   */
  var UNIFIED_SHELL_PANE_SPECS = [
    { id: "po", label: "발주 SKU", kind: "todo" },
    { id: "unload", label: "직납하차내역 긁어오기", kind: "unload" },
    { id: "loc", label: "로케이션", kind: "todo" },
    { id: "repl", label: "워크플로우 긁어오기", kind: "repl" },
    { id: "slot05", label: "영역 5", kind: "slot" },
    { id: "slot06", label: "영역 6", kind: "slot" },
    { id: "slot07", label: "영역 7", kind: "slot" },
    { id: "slot08", label: "영역 8", kind: "slot" },
    { id: "slot09", label: "영역 9", kind: "slot" },
    { id: "slot10", label: "Tote-Move RCRT88(API)", kind: "toteMoveApi" },
  ];

  /**
   * 통합 패널 카드 UI를 보여 줄 URL 여부
   * HTTPS + (inbound|inventory).coupang.com + 경로가 루트(/) 일 때만 true · 하위 경로·HTTP 에서는 패널 숨김
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

  /** 직납하차내역 긁어오기 — 전체 복사는 GM_xmlhttpRequest 만 사용 (숨김 iframe 없음) */
  var unloadCopyRunning = false;
  var unloadCopyStopRequested = false;
  var shellUnloadRefreshHint = function () {};

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

  function toteRequestStop() {
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
    btnRun.textContent = "작업 시작";
    btnRun.className = "yna4-pane-btn yna4-pane-btn--primary";

    var btnStop = document.createElement("button");
    btnStop.type = "button";
    btnStop.textContent = "작업 중지";
    btnStop.className = "yna4-pane-btn yna4-pane-btn--danger";

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

(function replenishOutboundEmbed() {
  "use strict";
  try {

  const PANEL_ID = "yna4-replenish-copy-panel";
  const PEEK_ID = PANEL_ID + "-peek";
  const JOB_KEY = "YAN4_REPLENISH_COPY_JOB_V4";

  const TABLE_SELECTOR = "table.table.table-bordered.table-striped.table-hover.mb-0.w-100";
  const PAGE_ITEM_SELECTOR = "w-page-item-group w-page-item";

  const MAX_WAIT_MS = 15000;
  const PAGE_WAIT_MS = 12000;
  const RETRY_LIMIT = 1;

  function replenishQs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function replenishQsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function defaultJob() {
    return {
      // 배치(다중 컷타임) 모드
      batchMode: false,
      batchQueue: [], // [{url, label}]  남은 대상 (index 0 = 현재 대상)
      batchDone: [],  // [{url, label, text}]  완료된 수집 결과
      batchStartedAt: 0,

      // 현재 상세 페이지 1건의 수집 상태
      running: false,
      preconditionApplied: false, // 100건 보기 + 조회 완료 여부 (리로드 대비)
      startedAt: 0,
      collectedPages: [],
      textParts: [],
      currentPage: 1,
      retryCount: 0,
      lastError: "",
    };
  }

  async function getJob() {
    try {
      const v = await GM_getValue(JOB_KEY);
      if (!v) return defaultJob();
      const parsed = typeof v === "string" ? JSON.parse(v) : v;
      return { ...defaultJob(), ...parsed };
    } catch {
      return defaultJob();
    }
  }

  async function setJob(job) {
    await GM_setValue(JOB_KEY, JSON.stringify(job));
  }

  async function clearJob() {
    await GM_deleteValue(JOB_KEY);
  }

  function getTable() {
    return replenishQs(TABLE_SELECTOR);
  }

  function getCurrentPage() {
    const active = replenishQs("w-page-item[active]");
    if (!active) return 1;

    const textN = parseInt(String(active.textContent || "").trim(), 10);
    if (Number.isFinite(textN)) return textN;

    const hrefN = parseInt(String(active.getAttribute("href") || "").trim(), 10);
    return Number.isFinite(hrefN) ? hrefN : 1;
  }

  function itemTextTrim(el) {
    return String(el.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function itemAriaTitle(el) {
    return String(el.getAttribute("aria-label") || el.getAttribute("title") || "");
  }

  function isNavDisabled(el) {
    if (el.hasAttribute("disabled")) return true;
    if (String(el.getAttribute("aria-disabled") || "").toLowerCase() === "true") return true;
    if (el.classList && el.classList.contains("disabled")) return true;
    return false;
  }

  function isLikelyPrevItem(el) {
    if (isNavDisabled(el)) return false;
    const t = itemTextTrim(el);
    if (/^(‹|«|<|◀|←)$/i.test(t)) return true;
    if (/^(prev|이전)$/i.test(t)) return true;
    if (/이전|prev|previous/i.test(itemAriaTitle(el))) return true;
    return false;
  }

  function isLikelyNextItem(el) {
    if (isNavDisabled(el)) return false;
    const t = itemTextTrim(el);
    if (/^(›|»|>|\u203a|▶|→)$/i.test(t)) return true;
    if (/^(next|다음)$/i.test(t)) return true;
    if (/다음|next|forward|다음\s*페이지/i.test(itemAriaTitle(el))) return true;
    return false;
  }

  function isEllipsisItem(el) {
    const t = itemTextTrim(el);
    return /^[.…‧⋮·]+$/.test(t) || t === "···";
  }

  function pageNumFromItem(el) {
    const t = parseInt(itemTextTrim(el), 10);
    if (Number.isFinite(t)) return t;
    const h = parseInt(String(el.getAttribute("href") || "").trim(), 10);
    if (Number.isFinite(h)) return h;
    const d = parseInt(String(el.getAttribute("data-page") || "").trim(), 10);
    if (Number.isFinite(d)) return d;
    return NaN;
  }

  function getPageItemByNumber(pageNum) {
    const items = replenishQsa(PAGE_ITEM_SELECTOR);

    for (const it of items) {
      const t = parseInt(String(it.textContent || "").trim(), 10);
      if (t === pageNum) return it;

      const href = it.getAttribute("href");
      const h = parseInt(String(href || "").trim(), 10);
      if (h === pageNum) return it;

      const dp = it.getAttribute("data-page");
      const d = parseInt(String(dp || "").trim(), 10);
      if (d === pageNum) return it;
    }
    return null;
  }

  /** 번호가 DOM에 없을 때(예: 1~10만 보임) 다음 페이지 버튼으로 이동 */
  function getNextPagerControl(currentPage) {
    const want = currentPage + 1;
    const byNum = getPageItemByNumber(want);
    if (byNum) return byNum;

    // <w-page-next href="N"> : w-page-item-group 바깥의 전용 다음 엘리먼트
    const wNext = replenishQs("w-page-next");
    if (wNext && !isNavDisabled(wNext)) {
      const hrefN = parseInt(String(wNext.getAttribute("href") || "").trim(), 10);
      if (!Number.isFinite(hrefN) || hrefN > currentPage) return wNext;
    }

    const items = replenishQsa(PAGE_ITEM_SELECTOR);
    for (const it of items) {
      if (isLikelyNextItem(it)) return it;
    }

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.hasAttribute("active")) continue;
      if (isNavDisabled(it)) continue;
      if (isLikelyPrevItem(it)) continue;
      if (isEllipsisItem(it)) continue;
      if (Number.isFinite(pageNumFromItem(it))) continue;
      return it;
    }

    return null;
  }

  async function waitForTableReady(timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const table = getTable();
      if (table) return table;
      await sleep(200);
    }
    return null;
  }

  async function waitForPageChange(fromPage, targetPage, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const now = getCurrentPage();
      if (now === targetPage && now !== fromPage) {
        const table = await waitForTableReady(Math.min(4000, timeoutMs));
        if (table) return true;
      }
      await sleep(200);
    }
    return false;
  }

  function buildPageText(table) {
    const lines = [];
    replenishQsa("tbody tr", table).forEach((tr) => {
      const cells = replenishQsa("th,td", tr).map((cell) =>
        String(cell.textContent || "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      );
      if (cells.length) lines.push(cells.join("\t"));
    });
    return lines.join("\n");
  }

  async function copyToClipboard(text) {
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text, { type: "text/plain" });
      return;
    }

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const listener = function (e) {
      e.preventDefault();
      e.clipboardData.setData("text/plain", text);
    };
    document.addEventListener("copy", listener, { once: true });
    document.execCommand("copy");
  }

  function showMainPanel() {
    const p = replenishQs("#" + PANEL_ID);
    if (p) p.style.display = "";
    const pk = replenishQs("#" + PEEK_ID);
    if (pk) pk.remove();
  }

  function ensurePeekButton() {
    if (replenishQs("#" + PEEK_ID)) return;
    const b = document.createElement("button");
    b.id = PEEK_ID;
    b.type = "button";
    b.title = "패널 보이기";
    b.textContent = "보충";
    b.style.cssText = [
      "position:fixed",
      "left:10px",
      "bottom:10px",
      "z-index:99998",
      "padding:2px 6px",
      "border:0",
      "border-radius:4px",
      "background:#0f4c8a",
      "color:#fff",
      'font:600 9px/1.2 "Segoe UI","Malgun Gothic",sans-serif',
      "cursor:pointer",
      "opacity:.9",
      "box-shadow:0 2px 8px rgba(0,0,0,.15)",
    ].join(";");
    b.addEventListener("click", showMainPanel);
    document.body.appendChild(b);
  }

  function hideMainPanel() {
    const p = replenishQs("#" + PANEL_ID);
    if (p) p.style.display = "none";
    ensurePeekButton();
  }

  function ensurePanel() {
    if (replenishQs("#" + PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = [
      "position:fixed",
      "left:10px",
      "bottom:10px",
      "z-index:99999",
      "min-width:168px",
      "max-width:200px",
      "padding:6px 8px",
      "border-radius:8px",
      "background:#0f4c8a",
      "color:#fff",
      "box-shadow:0 4px 14px rgba(0,0,0,.18)",
      'font:11px/1.25 "Segoe UI","Malgun Gothic",sans-serif',
    ].join(";");

    const btnBase =
      "width:100%;border:0;border-radius:5px;padding:5px 8px;font-size:11px;font-weight:600;cursor:pointer;line-height:1.2;";

    panel.innerHTML =
      '<div class="yna4-hdr" style="font-weight:700;font-size:10px;letter-spacing:.02em;opacity:.92;margin:0 0 4px 0;">워크플로우 복사_Pepe</div>' +
      '<button type="button" class="yna4-start" style="' +
      btnBase +
      'background:#fff;color:#0f4c8a;margin-bottom:3px;">전체 수집</button>' +
      '<button type="button" class="yna4-stop" style="' +
      btnBase +
      'background:#fecaca;color:#7f1d1d;margin-bottom:3px;">작업 중지</button>' +
      '<div class="yna4-status" style="margin-top:4px;font-size:10px;line-height:1.25;opacity:.88;word-break:break-word;">준비</div>' +
      '<button type="button" class="yna4-ui-hide" style="width:100%;border:0;background:transparent;color:#fff;opacity:.75;font-size:9px;cursor:pointer;text-decoration:underline;padding:3px 0 0 0;margin:0;">UI 숨기기</button>';

    document.body.appendChild(panel);

    replenishQs(".yna4-start", panel).addEventListener("click", startCollection);
    replenishQs(".yna4-stop", panel).addEventListener("click", stopAndClear);
    replenishQs(".yna4-ui-hide", panel).addEventListener("click", hideMainPanel);
  }

  function setStatus(msg) {
    const el = replenishQs("#" + PANEL_ID + " .yna4-status");
    if (el) el.textContent = msg;
  }

  function triggerPageClick(pageEl) {
    if (!pageEl) return false;

    try {
      pageEl.scrollIntoView({ block: "center", inline: "center" });
    } catch {}

    const fire = (type) => {
      try {
        pageEl.dispatchEvent(
          new MouseEvent(type, { bubbles: true, cancelable: true, view: window })
        );
      } catch {}
    };

    fire("mouseover");
    fire("mousedown");
    fire("mouseup");
    fire("click");

    try {
      pageEl.click();
    } catch {}

    return true;
  }

  async function moveToNextPage(currentPage) {
    const nextEl = getNextPagerControl(currentPage);
    if (!nextEl) return { done: true, moved: false };

    const targetPage = currentPage + 1;

    triggerPageClick(nextEl);
    let moved = await waitForPageChange(currentPage, targetPage, PAGE_WAIT_MS);
    if (moved) return { done: false, moved: true };

    triggerPageClick(nextEl);
    moved = await waitForPageChange(currentPage, targetPage, Math.floor(PAGE_WAIT_MS / 2));
    return { done: false, moved };
  }

  // 배치 완료 처리가 동시에 2번 돌면 큐 이중 shift 가 나서
  // 같은 데이터가 다른 라벨로 두 번 들어간다. 방어적 가드.
  let batchCompletionLocked = false;

  // ============================================================================
  //  Detail precondition: pagingSize=100 + 조회 버튼 클릭 (수집 시작 전 1회)
  // ============================================================================

  const PAGING_SIZE_SELECTOR = 'select[name="pagingSize"]';
  const SEARCH_BTN_SELECTOR = "button.btn-search";
  const PRECONDITION_WAIT_MS = 1800;

  function findSearchButton() {
    const direct = replenishQs(SEARCH_BTN_SELECTOR);
    if (direct) return direct;
    const btns = replenishQsa("button");
    for (const b of btns) {
      const t = String(b.textContent || "").replace(/\s+/g, "").trim();
      if (t === "조회") return b;
    }
    return null;
  }

  /** 페이지 당 100건 보기로 바꾸고 조회 버튼을 한 번 클릭한 뒤 테이블 리프레시 대기. */
  async function applyDetailPrecondition() {
    try {
      const select = replenishQs(PAGING_SIZE_SELECTOR);
      if (select && String(select.value).trim() !== "100") {
        select.value = "100";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        select.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(250);
      }
    } catch {}

    const btn = findSearchButton();
    if (!btn) return false;

    try {
      btn.click();
    } catch {}

    // 조회 클릭이 Ajax면 테이블이 재렌더되며, 폼 submit 로 리로드되면 스크립트가 재부팅됨.
    await sleep(PRECONDITION_WAIT_MS);
    return true;
  }

  async function collectLoop() {
    const job = await getJob();
    if (!job.running) return;

    const page = getCurrentPage();
    job.currentPage = page;
    await setJob(job);

    setStatus(`p.${page} 수집…`);

    const table = await waitForTableReady(MAX_WAIT_MS);
    if (!table) {
      job.lastError = `테이블 로딩 실패 (page ${page})`;
      if (job.retryCount < RETRY_LIMIT) {
        job.retryCount += 1;
        await setJob(job);
        setStatus(`재시도 ${job.retryCount}/${RETRY_LIMIT}`);
        location.reload();
        return;
      }
      job.running = false;
      await setJob(job);
      setStatus(`중단: ${job.lastError}`);
      return;
    }

    const pageText = buildPageText(table);
    if (!job.collectedPages.includes(page)) {
      job.collectedPages.push(page);
      if (pageText.trim()) job.textParts.push(pageText);
      await setJob(job);
    }

    const moveResult = await moveToNextPage(page);

    if (moveResult.done) {
      job.running = false;
      const mergedText = job.textParts.join("\n");

      if (job.batchMode && Array.isArray(job.batchQueue) && job.batchQueue.length > 0) {
        if (batchCompletionLocked) return;
        batchCompletionLocked = true;
        // 배치: 현재 컷타임 결과를 batchDone 에 누적 → 큐에서 pop → 다음 이동
        const current = job.batchQueue.shift();
        job.batchDone.push({
          url: current.url,
          label: current.label,
          text: mergedText,
        });
        job.collectedPages = [];
        job.textParts = [];
        job.currentPage = 1;
        job.retryCount = 0;
        job.lastError = "";
        job.preconditionApplied = false; // 다음 상세에서 100건 보기·조회 재적용
        await setJob(job);

        if (job.batchQueue.length > 0) {
          const nextTarget = job.batchQueue[0];
          setStatus(`완료: ${current.label} (${job.batchDone.length}개) · 다음 이동…`);
          await sleep(700);
          location.href = nextTarget.url;
          return;
        }

        // 배치 종료 — 모든 컷타임 순수 TSV 만 그대로 이어붙여 복사
        const combined = job.batchDone
          .map((d) => d.text)
          .filter((t) => String(t || "").trim().length > 0)
          .join("\n");
        try {
          await copyToClipboard(combined);
          setStatus(`배치 완료 ${job.batchDone.length}개 · 복사됨`);
        } catch (e) {
          setStatus(`배치 완료(복사실패) ${String(e && e.message ? e.message : e)}`);
        }
        job.batchMode = false;
        job.batchQueue = [];
        job.batchDone = [];
        await setJob(job);
        return;
      }

      // 단일(기존) 모드
      await setJob(job);
      try {
        await copyToClipboard(mergedText);
        setStatus(`완료 ${job.collectedPages.length}p · 복사됨`);
      } catch (e) {
        setStatus(`완료(복사실패) ${String(e && e.message ? e.message : e)}`);
      }
      return;
    }

    if (!moveResult.moved) {
      job.lastError = `페이지 이동 실패: ${page} → ${page + 1}`;
      if (job.retryCount < RETRY_LIMIT) {
        job.retryCount += 1;
        await setJob(job);
        setStatus(`이동재시도 ${job.retryCount}/${RETRY_LIMIT}`);
        location.reload();
        return;
      }
      job.running = false;
      await setJob(job);
      setStatus(`중단: ${job.lastError}`);
      return;
    }

    await sleep(400);
    await collectLoop();
  }

  async function startCollection() {
    const job = defaultJob();
    job.running = true;
    job.preconditionApplied = true; // 리로드 대비 먼저 저장 후 적용
    job.startedAt = Date.now();
    job.currentPage = getCurrentPage();
    await setJob(job);
    setStatus("100건 보기·조회…");
    await applyDetailPrecondition();
    setStatus("시작…");
    await collectLoop();
  }

  async function stopAndClear() {
    await clearJob();
    setStatus("초기화");
  }

  // ============================================================================
  //  Page routing
  // ============================================================================

  function isDashboardPage() {
    return /\/workflow\/nob\/dashboard\b/i.test(location.pathname);
  }
  function isDetailPage() {
    return /\/workflow\/nob\/v2\/view\/needToReplenish\/detail\//i.test(
      location.pathname
    );
  }

  // ============================================================================
  //  Dashboard mode: 다중 컷타임 보충 필요 일괄 수집
  // ============================================================================

  const DASH_PANEL_ID = "yna4-replenish-dash-panel";
  const DASH_PEEK_ID = DASH_PANEL_ID + "-peek";
  const DASH_CB_CLASS = "yna4-need-replenish-cb";
  const DASH_LINK_MARK = "yna4NeedReplenishBound";
  const DASH_ROW_MARK = "nya4DashRowBound";
  const NEED_DETAIL_HREF = "/workflow/nob/v2/view/needToReplenish/detail/";

  function getNeedReplenishLinks() {
    return replenishQsa('a[href*="' + NEED_DETAIL_HREF + '"]');
  }

  function cutlineLabelFromHref(href) {
    try {
      const idx = href.indexOf(NEED_DETAIL_HREF);
      if (idx === -1) return href;
      const tail = href.substring(idx + NEED_DETAIL_HREF.length);
      return decodeURIComponent(tail).trim();
    } catch {
      return href;
    }
  }

  function detailAbsUrl(raw) {
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    try {
      return new URL(raw, location.origin).href;
    } catch {
      return raw;
    }
  }

  function enhanceDashboardTableRows() {
    const table = replenishQs(TABLE_SELECTOR);
    if (!table) return 0;
    let added = 0;
    replenishQsa("tbody tr", table).forEach((tr) => {
      if (tr.dataset[DASH_ROW_MARK] === "1") return;
      const link = tr.querySelector('a[href*="' + NEED_DETAIL_HREF + '"]');
      if (!link) return;
      const raw = link.getAttribute("href") || "";
      if (!raw) return;

      link.dataset[DASH_LINK_MARK] = "1";

      const cell =
        tr.cells && tr.cells.length ? tr.cells[0] : tr.querySelector("td,th");
      if (!cell) return;
      if (cell.querySelector("input." + DASH_CB_CLASS)) return;

      const abs = detailAbsUrl(raw);
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = DASH_CB_CLASS;
      cb.dataset.url = abs;
      cb.dataset.label = cutlineLabelFromHref(abs);
      cb.title = "이 행 컷타임 · 일괄 수집 대상";
      cb.style.cssText =
        "margin:0 6px 0 0;vertical-align:middle;cursor:pointer;transform:scale(1.1);";
      cb.addEventListener("click", (e) => e.stopPropagation());
      cell.insertBefore(cb, cell.firstChild);
      tr.dataset[DASH_ROW_MARK] = "1";
      added++;
    });
    return added;
  }

  function enhanceDashboardLinks() {
    const links = getNeedReplenishLinks();
    let added = 0;
    links.forEach((link) => {
      if (link.dataset[DASH_LINK_MARK] === "1") return;
      const tr = link.closest("tr");
      if (tr && tr.dataset[DASH_ROW_MARK] === "1") return;
      const href = link.getAttribute("href") || "";
      if (!href) return;
      const absLink = detailAbsUrl(href);

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = DASH_CB_CLASS;
      cb.dataset.url = absLink;
      cb.dataset.label = cutlineLabelFromHref(absLink);
      cb.title = "일괄 수집 대상";
      cb.style.cssText =
        "margin:0 4px 0 0;vertical-align:middle;cursor:pointer;transform:scale(1.1);";
      cb.addEventListener("click", (e) => e.stopPropagation());
      if (link.parentNode) link.parentNode.insertBefore(cb, link);
      link.dataset[DASH_LINK_MARK] = "1";
      added++;
    });
    return added;
  }

  function getDashCheckedTargets() {
    return replenishQsa("input." + DASH_CB_CLASS + ":checked").map((cb) => ({
      url: cb.dataset.url,
      label: cb.dataset.label,
    }));
  }

  function setDashStatus(msg) {
    const el = replenishQs("#" + DASH_PANEL_ID + " .yna4-dash-status");
    if (el) el.textContent = msg;
  }

  function refreshDashCount() {
    const n = replenishQsa("input." + DASH_CB_CLASS + ":checked").length;
    const el = replenishQs("#" + DASH_PANEL_ID + " .yna4-dash-count");
    if (el) el.textContent = `선택 ${n}개`;
  }

  async function replenishStartBatchCommon(targets, openInNewTab) {
    if (!targets || targets.length === 0) {
      alert("일괄 수집할 컷타임을 체크해주세요.");
      return false;
    }
    const proceed = confirm(
      `선택한 ${targets.length}개 컷타임을 순차 수집합니다.\n` +
        targets.map((t, i) => `${i + 1}. ${t.label}`).join("\n") +
        (openInNewTab
          ? "\n\n첫 상세가 새 탭에서 열립니다(통합 탭 유지). 진행할까요?"
          : "\n\n현재 탭이 첫 번째 상세 페이지로 이동합니다. 진행할까요?")
    );
    if (!proceed) return false;

    const job = defaultJob();
    job.batchMode = true;
    job.batchQueue = targets.slice();
    job.batchStartedAt = Date.now();
    job.running = false;
    await setJob(job);
    setDashStatus("이동 중…");
    await sleep(200);
    if (openInNewTab) {
      window.open(targets[0].url, "_blank", "noopener,noreferrer");
    } else {
      location.href = targets[0].url;
    }
    return true;
  }

  async function startDashBatch() {
    await replenishStartBatchCommon(getDashCheckedTargets(), false);
  }

  function showDashPanel() {
    const p = replenishQs("#" + DASH_PANEL_ID);
    if (p) p.style.display = "";
    const pk = replenishQs("#" + DASH_PEEK_ID);
    if (pk) pk.remove();
  }
  function hideDashPanel() {
    const p = replenishQs("#" + DASH_PANEL_ID);
    if (p) p.style.display = "none";
    if (replenishQs("#" + DASH_PEEK_ID)) return;
    const b = document.createElement("button");
    b.id = DASH_PEEK_ID;
    b.type = "button";
    b.title = "패널 보이기";
    b.textContent = "보충일괄";
    b.style.cssText = [
      "position:fixed",
      "left:10px",
      "bottom:10px",
      "z-index:99998",
      "padding:2px 6px",
      "border:0",
      "border-radius:4px",
      "background:#0f4c8a",
      "color:#fff",
      'font:600 9px/1.2 "Segoe UI","Malgun Gothic",sans-serif',
      "cursor:pointer",
      "opacity:.9",
      "box-shadow:0 2px 8px rgba(0,0,0,.15)",
    ].join(";");
    b.addEventListener("click", showDashPanel);
    document.body.appendChild(b);
  }

  function ensureDashPanel() {
    if (replenishQs("#" + DASH_PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = DASH_PANEL_ID;
    panel.style.cssText = [
      "position:fixed",
      "left:10px",
      "bottom:10px",
      "z-index:99999",
      "min-width:200px",
      "max-width:240px",
      "padding:8px 10px",
      "border-radius:8px",
      "background:#0f4c8a",
      "color:#fff",
      "box-shadow:0 4px 14px rgba(0,0,0,.18)",
      'font:11px/1.3 "Segoe UI","Malgun Gothic",sans-serif',
    ].join(";");
    const btnBase =
      "width:100%;border:0;border-radius:5px;padding:5px 8px;font-size:11px;font-weight:600;cursor:pointer;line-height:1.2;";
    panel.innerHTML =
      '<div style="font-weight:700;font-size:10px;opacity:.92;margin:0 0 5px 0;">보충 일괄 수집_Pepe</div>' +
      '<div class="yna4-dash-count" style="font-size:10px;margin-bottom:4px;opacity:.9;">선택 0개</div>' +
      '<div style="display:flex;gap:4px;margin-bottom:4px;">' +
      '<button type="button" class="yna4-dash-all" style="flex:1;border:0;border-radius:5px;padding:4px 6px;font-size:10px;font-weight:600;cursor:pointer;background:rgba(255,255,255,.18);color:#fff;">전체</button>' +
      '<button type="button" class="yna4-dash-none" style="flex:1;border:0;border-radius:5px;padding:4px 6px;font-size:10px;font-weight:600;cursor:pointer;background:rgba(255,255,255,.18);color:#fff;">해제</button>' +
      "</div>" +
      '<button type="button" class="yna4-dash-start" style="' +
      btnBase +
      'background:#fff;color:#0f4c8a;margin-bottom:3px;">작업 시작</button>' +
      '<button type="button" class="yna4-dash-clear" style="' +
      btnBase +
      'background:#fecaca;color:#7f1d1d;margin-bottom:3px;">배치 초기화</button>' +
      '<div class="yna4-dash-status" style="margin-top:4px;font-size:10px;opacity:.88;word-break:break-word;">준비</div>' +
      '<button type="button" class="yna4-dash-hide" style="width:100%;border:0;background:transparent;color:#fff;opacity:.75;font-size:9px;cursor:pointer;text-decoration:underline;padding:3px 0 0 0;margin:0;">UI 숨기기</button>';
    document.body.appendChild(panel);

    replenishQs(".yna4-dash-all", panel).addEventListener("click", () => {
      replenishQsa("input." + DASH_CB_CLASS).forEach((cb) => (cb.checked = true));
      refreshDashCount();
    });
    replenishQs(".yna4-dash-none", panel).addEventListener("click", () => {
      replenishQsa("input." + DASH_CB_CLASS).forEach((cb) => (cb.checked = false));
      refreshDashCount();
    });
    replenishQs(".yna4-dash-start", panel).addEventListener("click", startDashBatch);
    replenishQs(".yna4-dash-clear", panel).addEventListener("click", async () => {
      await stopAndClear();
      setDashStatus("배치 초기화");
    });
    replenishQs(".yna4-dash-hide", panel).addEventListener("click", hideDashPanel);

    document.addEventListener("change", (e) => {
      if (e.target && e.target.classList && e.target.classList.contains(DASH_CB_CLASS)) {
        refreshDashCount();
      }
    });
  }

  function runDashboardCheckboxEnhance() {
    enhanceDashboardTableRows();
    enhanceDashboardLinks();
    refreshDashCount();
  }

  async function bootDashboard() {
    ensureDashPanel();

    let moDeb;
    let dashMo = new MutationObserver(function () {
      clearTimeout(moDeb);
      moDeb = setTimeout(runDashboardCheckboxEnhance, 350);
    });
    try {
      dashMo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (eMo) {}

    runDashboardCheckboxEnhance();

    const started = Date.now();
    const tick = async () => {
      runDashboardCheckboxEnhance();
      const job = await getJob();
      if (job.batchMode && job.batchQueue && job.batchQueue.length > 0) {
        setDashStatus(
          "남음 " +
            job.batchQueue.length +
            " · 완료 " +
            (job.batchDone ? job.batchDone.length : 0)
        );
      }
      if (Date.now() - started < 180000) setTimeout(tick, 2000);
    };
    tick();
  }

  // ============================================================================
  //  Detail mode boot
  // ============================================================================

  async function bootDetail() {
    ensurePanel();

    const job = await getJob();

    // 배치 진행 중이라면 자동 시작 (큐의 첫 대상이 이 페이지라고 가정)
    if (job.batchMode && Array.isArray(job.batchQueue) && job.batchQueue.length > 0) {
      const target = job.batchQueue[0];
      const totalAll =
        (job.batchDone ? job.batchDone.length : 0) + job.batchQueue.length;
      const curIndex = (job.batchDone ? job.batchDone.length : 0) + 1;
      setStatus(`배치 ${curIndex}/${totalAll}: ${target.label}`);

      // 사전 단계(100건 보기 + 조회) 가 조회 버튼 submit 로 페이지 리로드를 유발해도
      // job.preconditionApplied 플래그 덕에 중복 재적용 없이 이어서 수집 시작 가능.
      if (!job.preconditionApplied) {
        job.running = true;
        job.preconditionApplied = true;
        job.collectedPages = [];
        job.textParts = [];
        job.currentPage = 1;
        job.retryCount = 0;
        job.lastError = "";
        job.startedAt = Date.now();
        await setJob(job);
        setStatus(`배치 ${curIndex}/${totalAll}: 100건·조회…`);
        await applyDetailPrecondition();
        setStatus(`배치 ${curIndex}/${totalAll}: 수집 시작`);
        setTimeout(() => collectLoop(), 600);
        return;
      }

      // 이미 실행 중이면 그대로 재개 (사전 단계는 이미 적용됨)
      if (job.running) {
        setTimeout(() => collectLoop(), 800);
        return;
      }

      // 사전 단계는 적용됐는데 running 이 꺼진 상태 (예: 리로드 직후)
      job.running = true;
      job.startedAt = Date.now();
      job.collectedPages = [];
      job.textParts = [];
      job.currentPage = getCurrentPage();
      job.retryCount = 0;
      job.lastError = "";
      await setJob(job);
      setTimeout(() => collectLoop(), 1200);
      return;
    }

    // 일반(수동 단일) 모드 재개
    if (job.running) {
      setStatus("재개…");
      setTimeout(() => collectLoop(), 800);
    }
  }

  // ============================================================================
  //  Entry
  // ============================================================================

  // window.load 와 setTimeout 두 트리거가 boot 을 중복 호출해 수집 루프가
  // 동시 실행되면 배치 큐가 이중 shift 되는 문제가 있어 가드를 건다.
  let bootRan = false;

  async function boot() {
    if (bootRan) return;
    bootRan = true;
    try {
      if (isDashboardPage()) {
        bootDashboard();
        return;
      }
      if (isDetailPage()) {
        await bootDetail();
        return;
      }
    } catch (e) {
      try {
        console.warn("[YAN4 Replenish] boot failed:", e);
      } catch {}
    }
  }

  function replenishOutboundHostsOk() {
    try {
      return /^outbound\.coupang\.com$/i.test(location.hostname || "");
    } catch (eOk) {
      return false;
    }
  }

  function replenishOutboundScheduleBoot() {
    if (!replenishOutboundHostsOk()) return;
    if (!isDashboardPage() && !isDetailPage()) return;
    window.addEventListener("load", boot);
    setTimeout(boot, 1200);
  }

  try {
    if (typeof window !== "undefined") {
      window.__yna4replenishGetJob = getJob;
      window.__yna4replenishStartBatchFromTargets = function (targets) {
        return replenishStartBatchCommon(targets, true);
      };
    }
  } catch (eExpose) {}

  replenishOutboundScheduleBoot();
  } catch (eReplBoot) {
    try {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[YAN4 Shell] replenish module disabled by runtime error", eReplBoot);
      }
    } catch (ignore) {}
  }
})();

  /** IB 통합 패널 — 워크플로우: HTTP로 대시보드 목록 파싱 + 선택 수집 → 새 탭 상세 자동화 */
  function initReplenishLauncherPane(hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.className = "yna4-pane-mod";
    var dashUrl = "https://outbound.coupang.com/workflow/nob/dashboard";
    var NEED_DETAIL_PATH = "/workflow/nob/v2/view/needToReplenish/detail/";
    var CB_CLASS = ROOT_ID + "-repl-cut-cb";

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
        var label = abs;
        try {
          var ix = abs.indexOf(NEED_DETAIL_PATH);
          if (ix !== -1) {
            label = decodeURIComponent(abs.substring(ix + NEED_DETAIL_PATH.length)).trim();
          }
        } catch (eL) {}
        list.push({ url: abs, label: label });
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
          var lab = document.createElement("span");
          lab.textContent = item.label;
          lab.className = "yna4-pane-list-row-label";
          rowEl.appendChild(cb);
          rowEl.appendChild(lab);
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
    bottomMarginPx: 8,
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
    var h = vh - topPx - LAYOUT.bottomMarginPx;
    if (!isFinite(h) || h < 80) {
      h = Math.max(120, Math.floor(vh * 0.45));
    }
    wrap.style.top = topPx + "px";
    wrap.style.bottom = "auto";
    wrap.style.left = side;
    wrap.style.right = side;
    wrap.style.height = h + "px";
    wrap.style.maxHeight = h + "px";
    wrap.style.minHeight = h + "px";
    } catch (ePos) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[YAN4 Shell] positionPanel", ePos);
      }
    }
  }

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
        "font:13px/1.45 system-ui,Segoe UI,Malgun Gothic,sans-serif",
        "color:#0f172a",
        "display:flex",
        "flex-direction:column",
        "box-sizing:border-box",
        "overflow:hidden",
      ].join(";")
    );
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
        "flex:1",
        "display:flex",
        "flex-direction:column",
        "min-height:0",
        "height:100%",
        "min-height:min(320px,45vh)",
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
        sel + "{--yna4-sp-1:4px;--yna4-sp-2:6px;--yna4-sp-3:8px;--yna4-sp-4:10px;--yna4-r-1:6px;--yna4-r-2:8px;--yna4-fs-sm:11px;--yna4-fs-md:12px;--yna4-fs-lg:14px;--yna4-lh-1:1.35;--yna4-btn-h:30px;--yna4-btn-px:10px;}",
        sel + " .yna4-title-wrap{display:flex;align-items:center;gap:9px;min-width:0;flex:1;}",
        sel +
          " .yna4-title-badge{display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:26px;padding:0 6px;font-size:11px;font-weight:800;letter-spacing:-0.02em;color:#fff;background:linear-gradient(155deg,#1e3a8a,#2563eb);border:1px solid #1d4ed8;border-radius:6px;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 2px 6px rgba(37,99,235,.28);cursor:default;transition:transform .2s ease;flex-shrink:0;}",
        sel + " .yna4-title-badge:hover{transform:rotate(-5deg) scale(1.07);}",
        sel + " .yna4-title-col{display:flex;flex-direction:column;min-width:0;gap:1px;}",
        sel + " .yna4-title-line1{font-size:14px;font-weight:800;color:#111;line-height:1.2;letter-spacing:-0.03em;}",
        sel + " .yna4-title-line1 .yna4-title-em{font-style:normal;color:#2563eb;font-weight:800;}",
        sel + " .yna4-title-line2{font-size:10px;font-weight:600;color:#64748b;line-height:1.25;}",
        sel +
          " .yna4-pane-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:var(--yna4-sp-3);align-content:start;padding:var(--yna4-sp-3);box-sizing:border-box;}",
        sel +
          " .yna4-pane-card{display:flex;flex-direction:column;min-width:0;min-height:136px;background:#fff;border:1px solid #bfdbfe;border-radius:var(--yna4-r-2);box-shadow:0 1px 3px rgba(30,64,175,.1);overflow:hidden;}",
        sel +
          " .yna4-pane-card-hdr{flex-shrink:0;padding:7px var(--yna4-sp-4);font-size:var(--yna4-fs-md);font-weight:800;color:#1e3a8a;letter-spacing:-0.02em;background:linear-gradient(180deg,#eff6ff 0%,#dbeafe 100%);border-bottom:1px solid #bfdbfe;}",
        sel + " .yna4-pane-card-hdr-inner{display:flex;align-items:center;justify-content:space-between;gap:8px;}",
        sel + " .yna4-pane-mini-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:22px;padding:0;border:1px solid #1d4ed8;border-radius:6px;background:linear-gradient(155deg,#1e3a8a,#2563eb);color:#fff;line-height:1;cursor:pointer;}",
        sel + " .yna4-pane-mini-btn svg{width:13px;height:13px;display:block;}",
        sel +
          " .yna4-pane-card-body{flex:1;min-height:96px;padding:var(--yna4-sp-3) var(--yna4-sp-4);font-size:var(--yna4-fs-md);color:#334155;line-height:var(--yna4-lh-1);overflow:auto;}",
        sel +
          " .yna4-pane-card-body--tools{overflow:visible;}",
        sel +
          " .yna4-pane-mod{display:flex;flex-direction:column;gap:var(--yna4-sp-2);font-size:var(--yna4-fs-md);color:#334155;line-height:var(--yna4-lh-1);min-height:0;background:transparent;box-sizing:border-box;padding:var(--yna4-sp-2);}",
        sel +
          " .yna4-pane-mod--unload{gap:2px;}",
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
        sel + " .yna4-pane-k--box{display:inline-flex;align-items:center;justify-content:center;height:var(--yna4-btn-h);padding:0 10px;border:1px solid #cbd5e1;border-radius:var(--yna4-r-1);background:#fff;color:#334155;font-weight:600;font-size:var(--yna4-fs-md);line-height:1.2;box-sizing:border-box;}",
        sel + " .yna4-pane-inp{height:26px;border:1px solid #cbd5e1;border-radius:var(--yna4-r-1);padding:0 7px;background:#fff;color:#0f172a;font-size:var(--yna4-fs-md);box-sizing:border-box;min-width:108px;}",
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
        sel + " .yna4-pane-btn--compact{padding:6px 10px;font-size:12px;font-weight:600;}",
        sel + " .yna4-pane-toggle{min-width:52px;}",
        sel + " .yna4-pane-toggle.is-active{border-color:#16a34a;background:#16a34a;color:#fff;}",
        sel + " .yna4-pane-btn--block{width:100%;box-sizing:border-box;}",
        sel +
          " .yna4-pane-status{--yna4-progress:0%;font-size:var(--yna4-fs-sm);color:#1f2937;line-height:var(--yna4-lh-1);word-break:break-word;padding:var(--yna4-sp-2) var(--yna4-sp-3);background:linear-gradient(90deg,#bef264 var(--yna4-progress),#f8fafc var(--yna4-progress));border:1px solid #d9f99d;border-radius:var(--yna4-r-1);min-height:1.8em;box-sizing:border-box;transition:background .18s ease,color .18s ease;}",
        sel + " .yna4-pane-status.is-progress-heavy{color:#14532d;}",
        sel +
          " .yna4-pane-scroll{max-height:176px;overflow:auto;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;font-size:12px;color:#334155;box-sizing:border-box;}",
        sel +
          " .yna4-pane-list-row{display:flex;align-items:flex-start;gap:6px;padding:5px 0;border-bottom:1px solid #f1f5f9;}",
        sel + " .yna4-pane-list-row:last-child{border-bottom:0;padding-bottom:2px;}",
        sel +
          " .yna4-pane-list-row-label{flex:1;word-break:break-word;line-height:1.35;}",
        sel +
          " .yna4-pane-diag{display:none;padding:10px;background:#fefce8;border:1px solid #eab308;border-radius:6px;box-sizing:border-box;}",
        sel +
          ' .yna4-pane-diag-log{display:block;width:100%;height:168px;margin:8px 0 0 0;box-sizing:border-box;font-family:Consolas,Menlo,monospace;font-size:11px;line-height:1.35;padding:8px;border:1px solid #cbd5e1;border-radius:6px;resize:vertical;background:#fff;color:#0f172a;}',
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

    var btnFold = document.createElement("button");
    btnFold.type = "button";
    btnFold.setAttribute("aria-label", "패널 접기");
    btnFold.textContent = "−";
    btnFold.setAttribute(
      "style",
      "flex-shrink:0;border:1px solid #bbb;background:#fff;color:#333;width:30px;height:30px;font-size:16px;line-height:1;cursor:pointer;font-weight:700;border-radius:0;padding:0;"
    );

    hdr.appendChild(titleWrap);
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
        "right:12px",
        "bottom:12px",
        "z-index:" + LAYOUT.zIndex,
        "width:44px",
        "height:44px",
        "padding:0",
        "border:1px solid #2563eb",
        "border-radius:999px",
        "background:linear-gradient(155deg,#1e3a8a,#2563eb)",
        "color:#fff",
        "font:700 11px/1 system-ui,Segoe UI,sans-serif",
        "cursor:pointer",
        "box-shadow:0 4px 14px rgba(37,99,235,.38)",
        "align-items:center",
        "justify-content:center",
      ].join(";")
    );

    var body = document.createElement("div");
    body.id = ROOT_ID + "-body";
    body.className = "yna4-pane-grid";
    body.setAttribute(
      "style",
      "flex:1;min-height:0;overflow:auto;background:#eff6ff;"
    );

    UNIFIED_SHELL_PANE_SPECS.forEach(function (spec) {
      var id = spec.id;
      var label = spec.label;
      var kind = spec.kind || "slot";

      var card = document.createElement("div");
      card.className = "yna4-pane-card";
      card.dataset.pane = id;

      var paneHdr = document.createElement("div");
      paneHdr.className = "yna4-pane-card-hdr";
      if (kind === "unload") {
        var hdrInner = document.createElement("div");
        hdrInner.className = "yna4-pane-card-hdr-inner";
        var hdrLabel = document.createElement("span");
        hdrLabel.textContent = label;
        var miniBtn = document.createElement("button");
        miniBtn.type = "button";
        miniBtn.className = "yna4-pane-mini-btn";
        miniBtn.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M14 4h6v6m0-6L10 14m-2-8H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/>' +
          "</svg>";
        miniBtn.title = "클릭: 지정 HTML 새 탭 열기 / Shift+클릭: URL 설정";
        miniBtn.addEventListener("click", function (eMini) {
          eMini.preventDefault();
          eMini.stopPropagation();
          openUnloadMiniBtnTarget(eMini);
        });
        hdrInner.appendChild(hdrLabel);
        hdrInner.appendChild(miniBtn);
        paneHdr.appendChild(hdrInner);
      } else {
        paneHdr.textContent = label;
      }

      var paneBody = document.createElement("div");
      paneBody.className = "yna4-pane-card-body";

      card.appendChild(paneHdr);
      card.appendChild(paneBody);

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
      } else if (kind === "todo") {
        paneBody.textContent = "—";
      } else {
        paneBody.textContent = "—";
      }

      body.appendChild(card);
    });

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

    function relayout() {
      try {
        if (wrap.getAttribute("data-yna4-minimized") === "1") return;
        positionPanel(wrap);
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
    window.addEventListener("scroll", relayout, true);
    setTimeout(relayout, 0);
    setTimeout(relayout, 400);
    setTimeout(relayout, 1500);
    } catch (e) {
      if (typeof console !== "undefined" && console.error) {
        console.error("[YAN4 Unified UI Shell]", e);
      }
    }
  }

  function tryMount() {
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootShell, { once: true });
  }
  bootShell();

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
