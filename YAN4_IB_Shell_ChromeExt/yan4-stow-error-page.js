/**
 * 4페이지 — STOW Error Tracking 월별 집계
 * inbound /stowing/problem/paging HTML (WMS 최대 1달)
 */
(function () {
  "use strict";

  var STOW_ERR_UI_REV = "8";
  window.__YAN4_STOW_ERR_UI_REV__ = STOW_ERR_UI_REV;
  /** 조회 표에 노출할 최소 O+S 합 (미만 작업자 숨김) */
  var MIN_SHOW_TOTAL = 3;
  /** 관리자 등 — 진열작업자 집계에서 제외 (대소문자 무시) */
  var EXCLUDE_WORKER_NAMES = [
    "박지수",
    "민경두",
    "박광현",
    "Stone",
    "Solin",
    "Youngwoon",
    "Aron",
    "Teo",
    "Chris",
    "Eri",
    "Diah",
    "Luca",
    "송태정",
    "Wiz",
    "Pepe",
    "Han",
    "Judy",
  ];

  var LIST_REFERER = "https://inbound.coupang.com/stowing/problem/list";
  var PAGE_URL = "https://inbound.coupang.com/stowing/problem/paging";
  var MAX_PAGES = 500;
  var WEEK_LABELS = ["첫째주", "둘째주", "셋째주", "넷째주", "다섯째주"];
  var WEEK_RANGES = ["1–7일", "8–14일", "15–21일", "22–28일", "29–말일"];
  var SHIFT_DEFS = [
    { id: "day", label: "주간조", hours: "08–17시" },
    { id: "aft", label: "오후조", hours: "17–21시" },
    { id: "eve", label: "오심조", hours: "21–26시" },
    { id: "night", label: "심야조", hours: "26–30시" },
  ];
  var SHIFT_ORDER = { day: 0, aft: 1, eve: 2, night: 3 };

  var stopRequested = false;

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function ymdFromDate(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function calendarYmdNow() {
    return ymdFromDate(new Date());
  }

  function currentYearMonth() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
  }

  function monthRangeFromYm(ym) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(ym || "").trim());
    if (!m) {
      ym = currentYearMonth();
      m = /^(\d{4})-(\d{2})$/.exec(ym);
    }
    var y = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10);
    var lastD = new Date(y, mo, 0).getDate();
    var start = y + "-" + pad2(mo) + "-01";
    var end = y + "-" + pad2(mo) + "-" + pad2(lastD);
    var today = calendarYmdNow();
    if (end > today) end = today;
    if (start > today) start = today;
    return {
      ym: y + "-" + pad2(mo),
      startYmd: start,
      endYmd: end,
      year: y,
      month: mo,
      lastDay: lastD,
    };
  }

  function weekIndexFromDay(day) {
    var d = Math.floor(Number(day) || 0);
    if (d < 1) return -1;
    return Math.min(4, Math.floor((d - 1) / 7));
  }

  function parseReportAt(raw, fallbackYear) {
    var s = String(raw || "").replace(/\s+/g, " ").trim();
    if (!s) return null;
    var hour = -1;
    var min = 0;
    var hm = /(\d{1,2}):(\d{2})/.exec(s);
    if (hm) {
      hour = parseInt(hm[1], 10);
      min = parseInt(hm[2], 10);
    }
    var m = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(s);
    if (m) {
      return {
        y: parseInt(m[1], 10),
        mo: parseInt(m[2], 10),
        d: parseInt(m[3], 10),
        hour: hour,
        min: min,
      };
    }
    m = /(\d{1,2})[-./](\d{1,2})(?:[-./](\d{2,4}))?/.exec(s);
    if (m) {
      var y = fallbackYear;
      if (m[3]) {
        y = parseInt(m[3], 10);
        if (y < 100) y += 2000;
      }
      return {
        y: y,
        mo: parseInt(m[1], 10),
        d: parseInt(m[2], 10),
        hour: hour,
        min: min,
      };
    }
    if (hour >= 0) {
      return { y: fallbackYear, mo: 0, d: 0, hour: hour, min: min };
    }
    return null;
  }

  /** 08–17 주간 · 17–21 오후 · 21–02(26시) 오심 · 02–06(30시) 심야. 06–08은 심야. */
  function shiftIdFromHour(hour, min) {
    if (hour == null || hour < 0 || !isFinite(hour)) return "";
    var h = Number(hour) + (Number(min) || 0) / 60;
    var ext = h < 8 ? h + 24 : h;
    if (ext >= 8 && ext < 17) return "day";
    if (ext >= 17 && ext < 21) return "aft";
    if (ext >= 21 && ext < 26) return "eve";
    if (ext >= 26 && ext < 32) return "night";
    return "";
  }

  function shiftDefById(id) {
    var i;
    for (i = 0; i < SHIFT_DEFS.length; i++) {
      if (SHIFT_DEFS[i].id === id) return SHIFT_DEFS[i];
    }
    return { id: "", label: "미분류", hours: "" };
  }

  function pickDominantShift(counts) {
    var bestId = "";
    var bestN = 0;
    var i, id, n;
    for (i = 0; i < SHIFT_DEFS.length; i++) {
      id = SHIFT_DEFS[i].id;
      n = (counts && counts[id]) || 0;
      if (n > bestN) {
        bestN = n;
        bestId = id;
      }
    }
    return bestId;
  }

  function classifyReason(raw) {
    var u = String(raw || "").toUpperCase();
    var hasO = /OVERAGE|과잉/.test(u) || /초과/.test(u);
    var hasS = /SHORTAGE|부족|결품/.test(u);
    if (hasO && !hasS) return "OVERAGE";
    if (hasS && !hasO) return "SHORTAGE";
    if (hasO && hasS) {
      if (u.indexOf("OVERAGE") >= 0 && u.indexOf("SHORTAGE") < 0) return "OVERAGE";
      if (u.indexOf("SHORTAGE") >= 0 && u.indexOf("OVERAGE") < 0) return "SHORTAGE";
      return "OVERAGE";
    }
    return "OTHER";
  }

  function looksLikeKoName(token) {
    var t = String(token || "").replace(/\s/g, "");
    if (!t || t.length < 2 || t.length > 4) return false;
    return /^[가-힣]+$/.test(t);
  }

  function workerDisplay(raw) {
    var s = String(raw || "").replace(/\s+/g, " ").trim();
    if (!s) return "—";
    var parts = s.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      var i;
      for (i = 0; i < parts.length; i++) {
        if (!looksLikeKoName(parts[i])) return s;
      }
      return parts[0];
    }
    return s;
  }

  function workerKey(name) {
    return String(name || "—")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  var EXCLUDE_WORKER_KEYS = (function () {
    var m = Object.create(null);
    var i;
    for (i = 0; i < EXCLUDE_WORKER_NAMES.length; i++) {
      m[workerKey(EXCLUDE_WORKER_NAMES[i])] = true;
    }
    return m;
  })();

  /** 표시명 전체 또는 공백 분리 토큰이 제외 목록과 일치하면 true */
  function isExcludedWorker(displayName) {
    var key = workerKey(displayName);
    if (EXCLUDE_WORKER_KEYS[key]) return true;
    var parts = String(displayName || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ");
    var i;
    for (i = 0; i < parts.length; i++) {
      if (parts[i] && EXCLUDE_WORKER_KEYS[workerKey(parts[i])]) return true;
    }
    return false;
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

  function inboundHtmlViaDesktop(url) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(
        {
          type: "yan4InboundFetch",
          url: url,
          method: "GET",
          referer: LIST_REFERER,
          accept: "text/html, */*;q=0.8",
        },
        function (msg) {
          if (chrome.runtime.lastError) {
            reject(
              new Error(chrome.runtime.lastError.message || "inbound fetch 실패")
            );
            return;
          }
          if (!msg || msg.ok === false || (msg.status && msg.status >= 400)) {
            reject(
              new Error(
                "HTTP " +
                  ((msg && msg.status) || "?") +
                  ((msg && msg.error) ? " (" + msg.error + ")" : "") +
                  " — Coupang 로그인 확인"
              )
            );
            return;
          }
          resolve(String(msg.body || ""));
        }
      );
    });
  }

  async function fetchInboundHtml(url) {
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
      return await inboundHtmlViaDesktop(url);
    }
    if (typeof GM_xmlhttpRequest === "function" && !window.__YAN4_DESKTOP_SHELL__) {
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
        Accept: "text/html, */*;q=0.8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: LIST_REFERER,
      },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return String((await res.text()) || "");
  }

  function headerPickScore(texts) {
    if (!texts || !texts.length) return -1e9;
    var sem = 0;
    var empty = 0;
    var hi;
    for (hi = 0; hi < texts.length; hi++) {
      var n = String(texts[hi] || "")
        .replace(/\s+/g, "")
        .toLowerCase();
      if (!n) {
        empty++;
        continue;
      }
      if (n.indexOf("진열") >= 0) sem += 3;
      if (n.indexOf("작업자") >= 0 || n.indexOf("담당") >= 0) sem += 2;
      if (n.indexOf("보고") >= 0) sem += 2;
      if (n.indexOf("사유") >= 0) sem += 2;
      if (n.indexOf("처리") >= 0 && n.indexOf("상태") >= 0) sem += 3;
      if (n.indexOf("전산") >= 0 && n.indexOf("수량") >= 0) sem += 2;
    }
    if (empty / texts.length > 0.55) sem -= 5;
    return sem * 1000 + texts.length;
  }

  function headerTextsFromTable(tbl) {
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
          texts.push(String(cells[hi].textContent || "").replace(/\s+/g, " ").trim());
        }
        var pick = headerPickScore(texts);
        if (pick > bestPick) {
          bestPick = pick;
          best = texts;
        }
      }
      if (best.length) return best;
    }
    return [];
  }

  function findCol(headerTexts, candidates, rightmost) {
    var best = -1;
    var ci, hi, cand, h;
    for (ci = 0; ci < candidates.length; ci++) {
      cand = String(candidates[ci] || "").replace(/\s+/g, "");
      if (!cand) continue;
      for (hi = 0; hi < headerTexts.length; hi++) {
        h = String(headerTexts[hi] || "").replace(/\s+/g, "");
        if (!h) continue;
        if (h.indexOf(cand) >= 0 || cand.indexOf(h) >= 0) {
          if (rightmost) {
            if (hi > best) best = hi;
          } else {
            return hi;
          }
        }
      }
    }
    return best;
  }

  function findSysQtyCol(headerTexts) {
    if (!headerTexts || !headerTexts.length) return -1;
    var hi, h;
    for (hi = 0; hi < headerTexts.length; hi++) {
      h = String(headerTexts[hi] || "").replace(/\s+/g, "");
      if (!h) continue;
      if (h.indexOf("전산수량") >= 0) return hi;
      if (h.indexOf("전산") >= 0 && h.indexOf("수량") >= 0) return hi;
    }
    for (hi = 0; hi < headerTexts.length; hi++) {
      h = String(headerTexts[hi] || "").replace(/\s+/g, "");
      if (!h) continue;
      if (h.indexOf("시스템수량") >= 0) return hi;
      if (h.indexOf("WMS수량") >= 0 || h.indexOf("wms수량") >= 0) return hi;
    }
    return -1;
  }

  function parseQtyNumber(raw) {
    var s = String(raw || "")
      .replace(/,/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!s || s === "-" || s === "—") return null;
    var m = /(-?\d+(?:\.\d+)?)/.exec(s);
    if (!m) return null;
    var n = Number(m[1]);
    if (!isFinite(n)) return null;
    return n;
  }

  function sysQtyFromReason(reasonText) {
    var s = String(reasonText || "").replace(/\s+/g, "");
    if (!s) return null;
    var m =
      /전산수량[:：=]?(-?\d+(?:\.\d+)?)/.exec(s) ||
      /전산[:：=](-?\d+(?:\.\d+)?)/.exec(s) ||
      /시스템수량[:：=]?(-?\d+(?:\.\d+)?)/.exec(s);
    if (!m) return null;
    var n = Number(m[1]);
    if (!isFinite(n)) return null;
    return n;
  }

  /** OVERAGE + 전산수량 0 — 값을 못 읽으면 제외하지 않음 */
  function isOverageZeroSysQty(kind, sysQty) {
    if (kind !== "OVERAGE") return false;
    if (sysQty == null || !isFinite(sysQty)) return false;
    return sysQty === 0;
  }

  function columnMap(headerTexts) {
    if (!headerTexts || !headerTexts.length) return null;
    return {
      worker: findCol(
        headerTexts,
        ["진열작업자", "진열 작업자", "진열담당", "진열 담당"],
        true
      ),
      reportAt: findCol(headerTexts, [
        "문제보고일시",
        "문제보고 일시",
        "보고일시",
        "보고 일시",
        "등록일시",
        "등록 일시",
      ]),
      reason: findCol(headerTexts, [
        "문제보고사유",
        "문제보고 사유",
        "보고사유",
        "보고 사유",
        "문제사유",
        "오류사유",
        "진열오류사유",
      ]),
      status: findCol(headerTexts, ["처리상태", "처리 상태"]),
      sysQty: findSysQtyCol(headerTexts),
    };
  }

  function mainProblemTable(doc) {
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

  function cellText(td) {
    if (!td) return "";
    try {
      if (typeof td.innerText === "string" && td.innerText.length) {
        return String(td.innerText).replace(/\s+/g, " ").trim();
      }
    } catch (eIn) {}
    return String(td.textContent || "").replace(/\s+/g, " ").trim();
  }

  function countStowLinkRows(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var tbl = mainProblemTable(doc) || doc.querySelector("table");
    var tbody = tbl && tbl.querySelector("tbody");
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

  function parseRowsFromPagingHtml(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var tbl = mainProblemTable(doc) || doc.querySelector("table");
    var cmap = columnMap(headerTextsFromTable(tbl));
    var iw = cmap && cmap.worker >= 0 ? cmap.worker : 3;
    var ireport = cmap && cmap.reportAt >= 0 ? cmap.reportAt : 5;
    var ireason = cmap && cmap.reason >= 0 ? cmap.reason : 6;
    var istatus = cmap && cmap.status >= 0 ? cmap.status : 8;
    var iqty = cmap && cmap.sysQty >= 0 ? cmap.sysQty : -1;
    var minCols = Math.max(
      3,
      iw + 1,
      ireport + 1,
      ireason + 1,
      istatus + 1,
      iqty + 1
    );
    var tbody = tbl && tbl.querySelector("tbody");
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
      if (!stowProblemId && !reportNo) continue;
      var reasonText = cellText(tds[ireason]);
      var sysQty = iqty >= 0 ? parseQtyNumber(cellText(tds[iqty])) : null;
      if (sysQty == null) sysQty = sysQtyFromReason(reasonText);
      out.push({
        stowProblemId: stowProblemId || reportNo,
        reportNo: reportNo || stowProblemId,
        detailHref: href,
        workerText: workerDisplay(cellText(tds[iw])),
        reportAtText: cellText(tds[ireport]),
        reasonText: reasonText,
        statusText: cellText(tds[istatus]),
        sysQty: sysQty,
      });
    }
    return out;
  }

  function problemDetailUrl(href, stowProblemId) {
    var h = String(href || "").trim();
    if (/^https?:\/\//i.test(h)) return h;
    if (h.indexOf("//") === 0) return "https:" + h;
    if (h.charAt(0) === "/") return "https://inbound.coupang.com" + h;
    if (h) {
      return "https://inbound.coupang.com/" + h.replace(/^\.\//, "");
    }
    var id = String(stowProblemId || "").trim();
    if (!id) return "";
    return (
      "https://inbound.coupang.com/stowing/problem/list?stowProblemId=" +
      encodeURIComponent(id)
    );
  }

  function openProblemDetailUrl(url) {
    var u = String(url || "").trim();
    if (!u) return;
    try {
      if (
        window.yan4ShellDesktop &&
        typeof window.yan4ShellDesktop.openUrl === "function"
      ) {
        window.yan4ShellDesktop.openUrl(u);
        return;
      }
    } catch (eOpen) {}
    try {
      window.open(u, "_blank", "noopener,noreferrer");
    } catch (eWin) {
      try {
        location.href = u;
      } catch (eLoc) {}
    }
  }

  function emptyWeekArr() {
    return [0, 0, 0, 0, 0];
  }

  function emptyWorker(name) {
    return {
      name: name,
      total: 0,
      overage: 0,
      shortage: 0,
      weeks: emptyWeekArr(),
      weekO: emptyWeekArr(),
      weekS: emptyWeekArr(),
      shiftCounts: { day: 0, aft: 0, eve: 0, night: 0 },
      shiftId: "",
      items: [],
    };
  }

  function aggregateRows(rows, range) {
    var byKey = Object.create(null);
    var order = [];
    var skippedZeroSys = 0;
    var i, row, key, rec, dt, wi, kind, sid;
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      kind = classifyReason(row.reasonText);
      if (kind !== "OVERAGE" && kind !== "SHORTAGE") continue;
      if (isExcludedWorker(row.workerText)) continue;
      if (isOverageZeroSysQty(kind, row.sysQty)) {
        skippedZeroSys++;
        continue;
      }
      key = workerKey(row.workerText);
      rec = byKey[key];
      if (!rec) {
        rec = emptyWorker(row.workerText || "—");
        byKey[key] = rec;
        order.push(key);
      }
      rec.total++;
      if (kind === "OVERAGE") rec.overage++;
      else rec.shortage++;
      wi = -1;
      dt = parseReportAt(row.reportAtText, range.year);
      if (dt) {
        sid = shiftIdFromHour(dt.hour, dt.min);
        if (sid && rec.shiftCounts[sid] != null) rec.shiftCounts[sid]++;
      }
      if (dt && dt.y === range.year && dt.mo === range.month) {
        wi = weekIndexFromDay(dt.d);
        if (wi >= 0) {
          rec.weeks[wi]++;
          if (kind === "OVERAGE") rec.weekO[wi]++;
          else rec.weekS[wi]++;
        } else {
          wi = -1;
        }
      }
      rec.items.push({
        stowProblemId: String(row.stowProblemId || "").trim(),
        reportNo: String(row.reportNo || row.stowProblemId || "").trim(),
        detailUrl: problemDetailUrl(row.detailHref, row.stowProblemId),
        reportAtText: row.reportAtText || "—",
        reasonText: row.reasonText || "—",
        statusText: row.statusText || "—",
        kind: kind,
        weekIndex: wi,
      });
    }
    var list = [];
    for (i = 0; i < order.length; i++) {
      rec = byKey[order[i]];
      if (rec.total < MIN_SHOW_TOTAL) continue;
      rec.shiftId = pickDominantShift(rec.shiftCounts);
      rec.items.sort(function (a, b) {
        if (a.weekIndex !== b.weekIndex) {
          var aw = a.weekIndex < 0 ? 99 : a.weekIndex;
          var bw = b.weekIndex < 0 ? 99 : b.weekIndex;
          if (aw !== bw) return aw - bw;
        }
        return String(b.reportAtText || "").localeCompare(
          String(a.reportAtText || ""),
          "ko"
        );
      });
      list.push(rec);
    }
    list.sort(function (a, b) {
      var oa = SHIFT_ORDER[a.shiftId];
      var ob = SHIFT_ORDER[b.shiftId];
      if (oa == null) oa = 99;
      if (ob == null) ob = 99;
      if (oa !== ob) return oa - ob;
      var sa = Math.max(a.overage, a.shortage);
      var sb = Math.max(b.overage, b.shortage);
      if (sb !== sa) return sb - sa;
      if (b.total !== a.total) return b.total - a.total;
      if (b.overage !== a.overage) return b.overage - a.overage;
      return String(a.name || "").localeCompare(String(b.name || ""), "ko");
    });
    return { workers: list, skippedZeroSys: skippedZeroSys };
  }

  function ensureCss() {
    var cssId = "yna4-stow-error-page-css";
    if (document.getElementById(cssId)) return;
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        typeof chrome.runtime.getURL === "function"
      ) {
        var link = document.createElement("link");
        link.id = cssId;
        link.rel = "stylesheet";
        link.href =
          chrome.runtime.getURL("yan4-stow-error-page.css") +
          "?v=" +
          STOW_ERR_UI_REV;
        (document.head || document.documentElement).appendChild(link);
        return;
      }
    } catch (eCss) {}
    var fallback = document.createElement("link");
    fallback.id = cssId;
    fallback.rel = "stylesheet";
    fallback.href = "./vendor/yan4-stow-error-page.css?v=" + STOW_ERR_UI_REV;
    (document.head || document.documentElement).appendChild(fallback);
  }

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function appendWeekCell(tr, rec, wi) {
    var td = document.createElement("td");
    td.className = "yna4-stow-error-td-week";
    var o = rec.weekO[wi] || 0;
    var s = rec.weekS[wi] || 0;
    if (!o && !s) {
      td.appendChild(el("span", "yna4-stow-error-week-zero", "—"));
      tr.appendChild(td);
      return;
    }
    var box = el("div", "yna4-stow-error-week-os");
    var so = el("span", "yna4-stow-error-chip yna4-stow-error-chip--o", "O " + o);
    var ss = el("span", "yna4-stow-error-chip yna4-stow-error-chip--s", "S " + s);
    if (!o) so.className += " is-zero";
    if (!s) ss.className += " is-zero";
    box.appendChild(so);
    box.appendChild(ss);
    td.appendChild(box);
    tr.appendChild(td);
  }

  function colCount(showW5) {
    return 5 + (showW5 ? 5 : 4);
  }

  function weekSectionTitle(wi) {
    if (wi < 0) return "주차 미분류";
    return WEEK_LABELS[wi] + " (" + WEEK_RANGES[wi] + ")";
  }

  function buildDrilldownPanel(rec, showW5) {
    var panel = el("div", "yna4-stow-error-drill");
    panel.appendChild(
      el(
        "div",
        "yna4-stow-error-drill-head",
        rec.name + " · O+S " + rec.total + "건 · 주차별 상세"
      )
    );
    var items = rec.items || [];
    if (!items.length) {
      panel.appendChild(el("div", "yna4-stow-error-drill-empty", "상세 행 없음"));
      return panel;
    }
    var maxW = showW5 ? 5 : 4;
    var buckets = [];
    var bi;
    for (bi = 0; bi < maxW; bi++) buckets.push([]);
    var other = [];
    var ii;
    for (ii = 0; ii < items.length; ii++) {
      var it = items[ii];
      var w = it.weekIndex;
      if (w >= 0 && w < maxW) buckets[w].push(it);
      else other.push(it);
    }
    function appendWeekBlock(title, list) {
      if (!list.length) return;
      var sec = el("div", "yna4-stow-error-drill-week");
      sec.appendChild(
        el("div", "yna4-stow-error-drill-week-title", title + " · " + list.length + "건")
      );
      var tbl = el("table", "yna4-stow-error-drill-table");
      var colg = document.createElement("colgroup");
      var colW = ["148px", "92px", "120px", "auto", "110px"];
      var ci;
      for (ci = 0; ci < colW.length; ci++) {
        var col = document.createElement("col");
        col.style.width = colW[ci];
        colg.appendChild(col);
      }
      tbl.appendChild(colg);
      var thead = document.createElement("thead");
      var hr = document.createElement("tr");
      ["일시", "유형", "문제보고번호", "사유", "처리상태"].forEach(function (h) {
        hr.appendChild(el("th", "", h));
      });
      thead.appendChild(hr);
      tbl.appendChild(thead);
      var tb = document.createElement("tbody");
      var ri;
      for (ri = 0; ri < list.length; ri++) {
        var row = list[ri];
        var tr = document.createElement("tr");
        var tdAt = el("td", "yna4-stow-error-drill-td-at", row.reportAtText);
        tdAt.title = row.reportAtText || "";
        tr.appendChild(tdAt);
        var tdKind = el(
          "td",
          "yna4-stow-error-drill-td-kind yna4-stow-error-drill-td-kind--" +
            (row.kind === "SHORTAGE" ? "s" : "o"),
          row.kind === "SHORTAGE" ? "SHORTAGE" : "OVERAGE"
        );
        tr.appendChild(tdKind);
        var tdNo = document.createElement("td");
        tdNo.className = "yna4-stow-error-drill-td-no";
        var label = row.reportNo || row.stowProblemId || "—";
        if (row.detailUrl) {
          var a = document.createElement("a");
          a.className = "yna4-stow-error-drill-link";
          a.href = row.detailUrl;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = label;
          (function (url) {
            a.addEventListener("click", function (ev) {
              if (
                window.yan4ShellDesktop &&
                typeof window.yan4ShellDesktop.openUrl === "function"
              ) {
                ev.preventDefault();
                openProblemDetailUrl(url);
              }
            });
          })(row.detailUrl);
          tdNo.appendChild(a);
        } else {
          tdNo.textContent = label;
        }
        tr.appendChild(tdNo);
        tr.appendChild(el("td", "yna4-stow-error-drill-td-reason", row.reasonText));
        tr.appendChild(el("td", "yna4-stow-error-drill-td-status", row.statusText));
        tb.appendChild(tr);
      }
      tbl.appendChild(tb);
      sec.appendChild(tbl);
      panel.appendChild(sec);
    }
    for (bi = 0; bi < maxW; bi++) {
      appendWeekBlock(weekSectionTitle(bi), buckets[bi]);
    }
    appendWeekBlock(weekSectionTitle(-1), other);
    return panel;
  }

  function renderTable(host, workers, range) {
    host.textContent = "";
    if (!workers.length) {
      host.appendChild(
        el(
          "div",
          "yna4-stow-error-empty",
          "해당 월 O+S 합 " + MIN_SHOW_TOTAL + "건 이상인 작업자가 없습니다."
        )
      );
      return;
    }
    var showW5 = range.lastDay >= 29;
    var cols = colCount(showW5);
    var wrap = el("div", "yna4-stow-error-table-wrap");
    var table = el("table", "yna4-stow-error-table");
    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    var headers = [
      { t: "조", sub: "최다 시간대" },
      { t: "진열작업자", sub: "클릭 → 상세" },
      { t: "합계", sub: "O+S" },
      { t: "OVERAGE", sub: "" },
      { t: "SHORTAGE", sub: "" },
    ];
    var wi;
    for (wi = 0; wi < 5; wi++) {
      if (wi === 4 && !showW5) break;
      headers.push({ t: WEEK_LABELS[wi], sub: WEEK_RANGES[wi] });
    }
    var hi;
    for (hi = 0; hi < headers.length; hi++) {
      var th = document.createElement("th");
      th.appendChild(document.createTextNode(headers[hi].t));
      if (headers[hi].sub) {
        th.appendChild(document.createElement("br"));
        th.appendChild(el("span", "yna4-stow-error-th-sub", headers[hi].sub));
      }
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = document.createElement("tbody");
    var lastShift = "__none__";
    var personIdx = 0;
    var ri;
    for (ri = 0; ri < workers.length; ri++) {
      var rec = workers[ri];
      var sid = rec.shiftId || "";
      if (sid !== lastShift) {
        lastShift = sid;
        personIdx = 0;
        var def = shiftDefById(sid);
        var gtr = document.createElement("tr");
        gtr.className =
          "yna4-stow-error-tr-group yna4-stow-error-tr-group--" + (sid || "none");
        var gtd = document.createElement("td");
        gtd.colSpan = cols;
        gtd.textContent = def.label + (def.hours ? "  ·  " + def.hours : "");
        gtr.appendChild(gtd);
        tb.appendChild(gtr);
      }
      var tr = document.createElement("tr");
      tr.className =
        "yna4-stow-error-tr-person" + (personIdx % 2 ? " is-alt" : "");
      personIdx++;
      var rowKey = workerKey(rec.name) + "|" + ri;
      tr.setAttribute("data-worker-row", rowKey);
      var tdShift = document.createElement("td");
      tdShift.className = "yna4-stow-error-td-shift";
      var badge = el(
        "span",
        "yna4-stow-error-badge yna4-stow-error-badge--" + (sid || "none"),
        shiftDefById(sid).label
      );
      tdShift.appendChild(badge);
      tr.appendChild(tdShift);
      var tdName = document.createElement("td");
      tdName.className = "yna4-stow-error-td-name";
      var nameBtn = el("button", "yna4-stow-error-name-btn", rec.name);
      nameBtn.type = "button";
      nameBtn.title = "주차별 오류 상세 열기/닫기";
      tdName.appendChild(nameBtn);
      tr.appendChild(tdName);
      tr.appendChild(
        el("td", "yna4-stow-error-td-num yna4-stow-error-td-total", String(rec.total))
      );
      tr.appendChild(
        el("td", "yna4-stow-error-td-num yna4-stow-error-td-o", String(rec.overage))
      );
      tr.appendChild(
        el("td", "yna4-stow-error-td-num yna4-stow-error-td-s", String(rec.shortage))
      );
      for (wi = 0; wi < 5; wi++) {
        if (wi === 4 && !showW5) break;
        appendWeekCell(tr, rec, wi);
      }
      var dtr = document.createElement("tr");
      dtr.className = "yna4-stow-error-tr-drill";
      dtr.hidden = true;
      dtr.setAttribute("data-drill-for", rowKey);
      var dtd = document.createElement("td");
      dtd.colSpan = cols;
      dtd.appendChild(buildDrilldownPanel(rec, showW5));
      dtr.appendChild(dtd);
      (function (personTr, drillTr, btn) {
        function toggle() {
          var willOpen = drillTr.hidden;
          var openRows = tb.querySelectorAll(
            "tr.yna4-stow-error-tr-drill:not([hidden])"
          );
          var oi;
          for (oi = 0; oi < openRows.length; oi++) {
            openRows[oi].hidden = true;
          }
          var openBtns = tb.querySelectorAll(".yna4-stow-error-name-btn.is-open");
          for (oi = 0; oi < openBtns.length; oi++) {
            openBtns[oi].classList.remove("is-open");
          }
          var openPersons = tb.querySelectorAll(
            "tr.yna4-stow-error-tr-person.is-open"
          );
          for (oi = 0; oi < openPersons.length; oi++) {
            openPersons[oi].classList.remove("is-open");
          }
          if (willOpen) {
            drillTr.hidden = false;
            btn.classList.add("is-open");
            personTr.classList.add("is-open");
            try {
              drillTr.scrollIntoView({ block: "nearest", behavior: "smooth" });
            } catch (eScr) {}
          }
        }
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          toggle();
        });
        personTr.addEventListener("click", function (ev) {
          if (ev.target && ev.target.closest && ev.target.closest("a")) return;
          if (
            ev.target === btn ||
            (btn.contains && btn.contains(ev.target))
          ) {
            return;
          }
          toggle();
        });
      })(tr, dtr, nameBtn);
      tb.appendChild(tr);
      tb.appendChild(dtr);
    }
    table.appendChild(tb);
    wrap.appendChild(table);
    host.appendChild(wrap);
  }

  async function fetchAllOgRows(startY, endY, onProgress) {
    var qs = buildFilterQs(startY, endY);
    var merged = [];
    var seen = Object.create(null);
    var page;
    for (page = 0; page < MAX_PAGES; page++) {
      if (stopRequested) break;
      if (onProgress) onProgress(page + 1, merged.length);
      var html = await fetchInboundHtml(PAGE_URL + "?page=" + page + "&" + qs);
      var part = parseRowsFromPagingHtml(html);
      var pi;
      for (pi = 0; pi < part.length; pi++) {
        var kRaw = String(part[pi].stowProblemId || "").trim();
        var k = kRaw.replace(/\s+/g, "");
        if (!k) {
          k =
            "FB:" +
            workerKey(part[pi].workerText) +
            "|" +
            String(part[pi].reportAtText || "") +
            "|" +
            String(part[pi].reasonText || "");
        }
        if (!seen[k]) {
          seen[k] = true;
          merged.push(part[pi]);
        }
      }
      if (countStowLinkRows(html) === 0) break;
    }
    return merged;
  }

  window.__YAN4_INIT_SHELL_PAGE4__ = function (hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.className = "yna4-shell-page-sla-inner yna4-stow-error-mounted";
    hostEl.setAttribute("data-yna4-stow-err-ui-rev", STOW_ERR_UI_REV);
    ensureCss();

    var root = el("div", "yna4-stow-error-root");
    var toolbar = el("div", "yna4-stow-error-toolbar");
    var title = el("span", "yna4-stow-error-title", "STOW Error Tracking");
    var monthInp = document.createElement("input");
    monthInp.type = "month";
    monthInp.className = "yna4-stow-error-month";
    monthInp.value = currentYearMonth();
    monthInp.title = "문제보고일시 월 (WMS 최대 1달)";
    var btnRun = el("button", "yna4-stow-error-btn yna4-stow-error-btn--primary", "조회");
    btnRun.type = "button";
    var btnStop = el("button", "yna4-stow-error-btn", "중지");
    btnStop.type = "button";
    btnStop.disabled = true;
    var statusEl = el("span", "yna4-stow-error-status", "월을 고른 뒤 조회");
    statusEl.setAttribute("role", "status");
    toolbar.appendChild(title);
    toolbar.appendChild(monthInp);
    toolbar.appendChild(btnRun);
    toolbar.appendChild(btnStop);
    toolbar.appendChild(statusEl);

    var summaryEl = el("div", "yna4-stow-error-summary", "");
    var tableHost = el("div", "yna4-stow-error-body");
    tableHost.appendChild(
      el(
        "div",
        "yna4-stow-error-empty",
        "문제보고일시를 월 단위로 조회합니다. OVERAGE / SHORTAGE만 집계하고, O+S 합 " +
          MIN_SHOW_TOTAL +
          "건 미만·지정 관리자는 숨깁니다. OVERAGE 전산수량 0은 카운트에서 제외합니다. 오류가 가장 많은 시간대로 조를 정합니다."
      )
    );

    root.appendChild(toolbar);
    root.appendChild(summaryEl);
    root.appendChild(tableHost);
    hostEl.appendChild(root);

    var busy = false;

    async function runQuery() {
      if (busy) return;
      var range = monthRangeFromYm(monthInp.value);
      monthInp.value = range.ym;
      busy = true;
      stopRequested = false;
      btnRun.disabled = true;
      btnStop.disabled = false;
      monthInp.disabled = true;
      summaryEl.textContent = "";
      tableHost.textContent = "";
      statusEl.textContent =
        range.startYmd + " ~ " + range.endYmd + " 조회 중…";
      try {
        var rows = await fetchAllOgRows(
          range.startYmd,
          range.endYmd,
          function (page, n) {
            statusEl.textContent =
              range.startYmd +
              " ~ " +
              range.endYmd +
              " · p." +
              page +
              " · 문제보고 " +
              n +
              "행";
          }
        );
        if (stopRequested) {
          statusEl.textContent = "중지됨 · 문제보고 " + rows.length + "행";
          return;
        }
        var agg = aggregateRows(rows, range);
        var workers = agg.workers;
        var totO = 0;
        var totS = 0;
        var wi;
        for (wi = 0; wi < workers.length; wi++) {
          totO += workers[wi].overage;
          totS += workers[wi].shortage;
        }
        summaryEl.textContent =
          range.year +
          "년 " +
          range.month +
          "월 · 문제보고 " +
          rows.length +
          "건 · 표시 " +
          workers.length +
          "명 (O+S≥" +
          MIN_SHOW_TOTAL +
          ") · OVERAGE " +
          totO +
          " · SHORTAGE " +
          totS +
          (agg.skippedZeroSys
            ? " · O전산0제외 " + agg.skippedZeroSys
            : "");
        renderTable(tableHost, workers, range);
        statusEl.textContent = "완료 · " + workers.length + "명";
      } catch (eRun) {
        statusEl.textContent =
          "오류 · " + (eRun && eRun.message ? eRun.message : String(eRun));
        tableHost.appendChild(
          el(
            "div",
            "yna4-stow-error-empty yna4-stow-error-empty--err",
            "조회 실패. inbound 로그인 후 다시 시도하세요."
          )
        );
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 stow error page]", eRun);
        }
      } finally {
        busy = false;
        btnRun.disabled = false;
        btnStop.disabled = true;
        monthInp.disabled = false;
      }
    }

    btnRun.addEventListener("click", function () {
      runQuery();
    });
    btnStop.addEventListener("click", function () {
      if (!busy) return;
      stopRequested = true;
      statusEl.textContent = "중지 요청…";
    });
    monthInp.addEventListener("keydown", function (eK) {
      if (eK.key === "Enter") runQuery();
    });
  };
})();
