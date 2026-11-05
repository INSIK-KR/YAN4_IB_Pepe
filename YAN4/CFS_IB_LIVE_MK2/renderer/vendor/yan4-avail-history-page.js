/** YAN4 IB Shell — 2페이지 가용화내역조회 (SKU log ADJUST + PUTAWAY, 작업내역 DESC_CATS 필터) */
(function () {
  "use strict";

  var ROOT_ID = "yna4-avail-history-root";
  var MODAL_ID = "yna4-avail-history-modal";
  var API_LOG =
    "https://inventory.coupang.com/async/inventory/log/search";
  /** inventory 페이지 최대 조회 기간 */
  var API_MAX_RANGE_DAYS = 7;
  var PAGE_SIZE = 20;
  var PAGE_DELAY_MS = 80;
  var CHUNK_DELAY_MS = 100;
  var LOG_TYPES = ["ADJUST", "PUTAWAY"];
  /** 작업내역(description)에 포함되면 표시 — 로케이션 합계 열 순서 */
  var DESC_CATS = [
    { key: "cycle", label: "Cycle count", re: /Cycle\s*count/i },
    { key: "overage", label: "Overage", re: /Overage/i },
    { key: "general", label: "General", re: /General/i },
    { key: "transferError", label: "Transfer error", re: /Transfer[\s_-]*error/i },
  ];
  var DESC_CATS_TEXT = DESC_CATS.map(function (c) {
    return c.label;
  }).join(" / ");
  var CHANGE_CENTER_URL = "https://inbound.coupang.com/auth/changeCenter/";
  var HOME_CENTER_ID = "1007";
  var CENTER_SWITCH_DELAY_MS = 400;
  var CENTERS = [
    ["78", "GMH1"],
    ["81", "BUC2"],
    ["88", "YON3"],
    ["91", "PYT2"],
    ["105", "GON1"],
    ["121", "DAE4"],
    ["123", "INC11"],
    ["124", "INC15"],
    ["132", "INC17"],
    ["135", "YON5"],
    ["140", "GWJ3"],
    ["145", "SIH1"],
    ["148", "CHW2"],
    ["166", "INC12"],
    ["167", "INC22"],
    ["177", "GWJ1"],
    ["182", "DAJ1"],
    ["184", "INC37"],
    ["186", "INC39"],
    ["187", "INC31"],
    ["554", "SFJEJ2"],
    ["1007", "YAN4"],
    ["1015", "GYS1"],
    ["1016", "SEN2"],
    ["3056", "SFSPA3"],
  ];

  /** 상단 센터 전환 목록 (리전별) — CENTERS 는 전체 유지: 이름 변환·가용화내역 조회에 씀 */
  var CENTER_REGIONS = [
    ["Region1", ["BUC2", "INC11", "INC12", "INC15", "INC22", "INC37", "PYT2"]],
    ["Region2", ["GWJ1", "GWJ3", "SEN2", "SIH1", "YAN4", "YON5"]],
    ["Region3", ["CHW2", "DAE4", "DAJ1", "GMH1", "GON1", "GYS1"]],
  ];

  var paneStatusEl = null;
  var lastRows = [];
  var lastMeta = null;
  var fetching = false;

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatYmd(d) {
    return (
      d.getFullYear() +
      "-" +
      pad2(d.getMonth() + 1) +
      "-" +
      pad2(d.getDate())
    );
  }

  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  function ymdCmp(a, b) {
    return formatYmd(a).localeCompare(formatYmd(b));
  }

  /** 선택 연·월의 달력 시작~끝 (당월이면 오늘까지) */
  function calendarMonthBounds(year, monthIndex) {
    var start = new Date(year, monthIndex, 1);
    start.setHours(0, 0, 0, 0);
    var end = new Date(year, monthIndex + 1, 0);
    end.setHours(0, 0, 0, 0);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    if (ymdCmp(end, today) > 0) end = today;
    if (ymdCmp(start, end) > 0) {
      throw new Error("선택한 월은 아직 시작 전입니다.");
    }
    return { start: start, end: end };
  }

  function currentYearMonthValue() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
  }

  function parseYearMonthValue(v) {
    var m = String(v || "").match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    return {
      year: parseInt(m[1], 10),
      monthIndex: parseInt(m[2], 10) - 1,
      label: m[1] + "-" + m[2],
    };
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function setStatus(text, isErr) {
    if (!paneStatusEl) return;
    paneStatusEl.textContent = text || "";
    paneStatusEl.style.color = isErr ? "#b91c1c" : "#475569";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cell(v) {
    if (v == null || v === "") return "-";
    return String(v);
  }

  function rowMatchesCat(cat, row) {
    return cat.re.test(String(row && row.description != null ? row.description : ""));
  }

  function rowMatchesAnyCat(row) {
    return DESC_CATS.some(function (c) {
      return rowMatchesCat(c, row);
    });
  }

  function qtyOf(row) {
    var n = Number(row && row.changeQuantity);
    return isFinite(n) ? n : 0;
  }

  function locationKey(row) {
    var loc = String((row && row.locationFullName) || "").trim() || "(로케이션 없음)";
    return row && row._center ? row._center + " · " + loc : loc;
  }

  function showCenterCol() {
    return !!(lastMeta && lastMeta.centerMode);
  }

  /** 로케이션별 작업내역 유형(DESC_CATS) 수량 / 합계 */
  function buildLocationSummary(rows) {
    var map = Object.create(null);
    var order = [];
    (rows || []).forEach(function (r) {
      var loc = locationKey(r);
      if (!map[loc]) {
        map[loc] = {
          location: loc,
          qty: Object.create(null),
          totalQty: 0,
          rowHits: 0,
        };
        DESC_CATS.forEach(function (c) {
          map[loc].qty[c.key] = 0;
        });
        order.push(loc);
      }
      var q = qtyOf(r);
      map[loc].totalQty += q;
      map[loc].rowHits += 1;
      DESC_CATS.forEach(function (c) {
        if (rowMatchesCat(c, r)) map[loc].qty[c.key] += q;
      });
    });
    var out = order.map(function (k) {
      return map[k];
    });
    out.sort(function (a, b) {
      var ad = Math.abs(b.totalQty) - Math.abs(a.totalQty);
      if (ad) return ad;
      return String(a.location).localeCompare(String(b.location));
    });
    return out;
  }

  function qtyClass(n) {
    if (!isFinite(n) || n === 0) return "";
    return n > 0 ? "qty-pos" : "qty-neg";
  }

  function rowKey(r) {
    return [
      r.skuId,
      r.logType,
      r.workedAt,
      r.locationFullName,
      r.changeQuantity,
      r.lpnId,
      r.workerId,
      r.description,
    ].join("|");
  }

  function getJson(url, referer) {
    return new Promise(function (resolve, reject) {
      var fallback = function () {
        if (typeof GM_xmlhttpRequest !== "function") {
          reject(new Error("GM_xmlhttpRequest 필요 (inventory 로그인)"));
          return;
        }
        GM_xmlhttpRequest({
          method: "GET",
          url: url,
          headers: {
            Accept: "*/*",
            "Content-Type": "application/json;charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            Referer: referer || "https://inventory.coupang.com/",
            Pragma: "no-cache",
            "Cache-Control": "no-cache",
          },
          timeout: 60000,
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
      };
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        typeof chrome.runtime.sendMessage === "function"
      ) {
        chrome.runtime.sendMessage(
          {
            type: "yan4InventoryFetch",
            url: url,
            method: "GET",
            referer: referer,
            accept: "*/*",
          },
          function (res) {
            if (chrome.runtime.lastError) {
              fallback();
              return;
            }
            if (res && res.ok && res.status >= 200 && res.status < 400) {
              try {
                resolve(JSON.parse(String(res.body || "{}")));
              } catch (e2) {
                reject(new Error("JSON 파싱 실패"));
              }
              return;
            }
            fallback();
          }
        );
        return;
      }
      fallback();
    });
  }

  function changeCenter(centerId) {
    var url = CHANGE_CENTER_URL + encodeURIComponent(String(centerId));
    return new Promise(function (resolve, reject) {
      var handle = function (status, body) {
        if (status < 200 || status >= 400) {
          reject(new Error("센터 변경 HTTP " + status));
          return;
        }
        var j = null;
        try {
          j = JSON.parse(String(body || "{}"));
        } catch (e) {
          reject(new Error("센터 변경 응답 오류 (inbound 로그인 확인)"));
          return;
        }
        if (!j || j.success !== true) {
          reject(new Error((j && j.message) || "센터 변경 실패"));
          return;
        }
        resolve(j.message || "");
      };
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        typeof chrome.runtime.sendMessage === "function"
      ) {
        chrome.runtime.sendMessage(
          {
            type: "yan4InboundFetch",
            url: url,
            method: "GET",
            referer: "https://inbound.coupang.com/",
            accept: "*/*",
          },
          function (res) {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!res || !res.ok) {
              reject(new Error((res && res.error) || "센터 변경 요청 실패"));
              return;
            }
            handle(res.status, res.body);
          }
        );
        return;
      }
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("센터 변경 요청 불가"));
        return;
      }
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        headers: { Accept: "*/*", Referer: "https://inbound.coupang.com/" },
        timeout: 30000,
        onload: function (r) {
          handle(r.status, r.responseText);
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

  var ACTIVE_CENTER_KEY = "cfsActiveCenterId";

  function activeCenterId() {
    try {
      var v = localStorage.getItem(ACTIVE_CENTER_KEY);
      if (v && CENTERS.some(function (c) { return c[0] === v; })) return v;
    } catch (e) {}
    return HOME_CENTER_ID;
  }

  function hasActiveCenterRecord() {
    try {
      return !!localStorage.getItem(ACTIVE_CENTER_KEY);
    } catch (e) {
      return false;
    }
  }

  /** inbound 메인 HTML 의 data-home-api="…/home/info?centerId=1007" = 현재 세션 센터 */
  var CURRENT_CENTER_PAGE = "https://inbound.coupang.com/";

  function parseCurrentCenterId(html) {
    var m = String(html || "").match(/centerId(?:=|&#x3D;|&#61;)(\d{3,6})/i);
    return m ? m[1] : "";
  }

  function inboundGetText(url) {
    return new Promise(function (resolve, reject) {
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        typeof chrome.runtime.sendMessage === "function"
      ) {
        chrome.runtime.sendMessage(
          {
            type: "yan4InboundFetch",
            url: url,
            method: "GET",
            referer: CURRENT_CENTER_PAGE,
            accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          },
          function (res) {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!res || !res.ok) {
              reject(new Error((res && res.error) || "inbound 요청 실패"));
              return;
            }
            resolve({ status: res.status, body: res.body });
          }
        );
        return;
      }
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("inbound 요청 불가"));
        return;
      }
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        headers: { Accept: "text/html,*/*;q=0.8" },
        timeout: 30000,
        onload: function (r) {
          resolve({ status: r.status, body: r.responseText });
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

  /** 서버 세션의 실제 현재 센터 — 확인되면 앱 기준 센터(cfsActiveCenterId)도 맞춤 */
  async function detectCurrentCenter() {
    var r = await inboundGetText(CURRENT_CENTER_PAGE);
    if (!r || r.status < 200 || r.status >= 400) {
      throw new Error("inbound HTTP " + (r && r.status));
    }
    var id = parseCurrentCenterId(r.body);
    if (!id) throw new Error("센터 정보 없음 (WMS 로그인 확인)");
    try {
      localStorage.setItem(ACTIVE_CENTER_KEY, id);
    } catch (e) {}
    return id;
  }

  async function switchActiveCenter(centerId) {
    var want = String(centerId);
    var msg = await changeCenter(want);
    var got = "";
    try {
      got = await detectCurrentCenter();
    } catch (eDetect) {
      try {
        localStorage.setItem(ACTIVE_CENTER_KEY, want);
      } catch (e) {}
      return { message: msg, verified: false };
    }
    if (got !== want) {
      throw new Error("전환 후 확인 결과 " + centerName(got) + " (" + got + ")");
    }
    return { message: msg, verified: true };
  }

  window.__CFS_CENTER__ = {
    list: CENTERS,
    regions: CENTER_REGIONS,
    name: function (id) {
      return centerName(id);
    },
    activeId: activeCenterId,
    hasRecord: hasActiveCenterRecord,
    switchTo: switchActiveCenter,
    detect: detectCurrentCenter,
  };

  function centerName(centerId) {
    for (var i = 0; i < CENTERS.length; i++) {
      if (CENTERS[i][0] === String(centerId)) return CENTERS[i][1];
    }
    return String(centerId);
  }

  /** 센터 세션을 바꿔가며 조회 — 끝나면(오류 포함) 앱 기준 센터로 복귀 */
  async function fetchCentersLogs(skuId, locationFullName, yearMonth, centerIds) {
    var rows = [];
    var failed = [];
    var rawCount = 0;
    var base = null;
    try {
      for (var i = 0; i < centerIds.length; i++) {
        var id = centerIds[i];
        var name = centerName(id);
        var prefix = "[" + (i + 1) + "/" + centerIds.length + " " + name + "] ";
        try {
          setStatus(prefix + "센터 변경…");
          await changeCenter(id);
          await sleep(CENTER_SWITCH_DELAY_MS);
          var pack = await fetchMonthLogs(skuId, locationFullName, yearMonth, prefix);
          if (!base) base = pack;
          rawCount += pack.rawCount;
          pack.rows.forEach(function (r) {
            r._center = name;
            rows.push(r);
          });
        } catch (eCenter) {
          failed.push(name + "(" + (eCenter && eCenter.message ? eCenter.message : eCenter) + ")");
        }
      }
    } finally {
      var homeId = activeCenterId();
      var homeName = centerName(homeId);
      try {
        setStatus(homeName + " 센터로 복귀 중…");
        await changeCenter(homeId);
      } catch (eHome) {
        failed.push(homeName + " 복귀 실패 — 상단 센터 선택에서 다시 전환");
      }
    }
    rows.sort(function (a, b) {
      return String(b.workedAt || "").localeCompare(String(a.workedAt || ""));
    });
    var ym = parseYearMonthValue(yearMonth);
    return {
      rows: rows,
      rawCount: rawCount,
      matchedCount: rows.length,
      skuId: skuId,
      yearMonth: ym ? ym.label : yearMonth,
      searchStartAt: base ? base.searchStartAt : "",
      searchEndAt: base ? base.searchEndAt : "",
      chunks: base ? base.chunks : 0,
      centerMode: centerIds.length > 1 ? "전체 센터" : centerName(centerIds[0]),
      centerCount: centerIds.length,
      failed: failed,
    };
  }

  function buildLogUrl(opt) {
    var p = new URLSearchParams();
    p.set("skuId", String(opt.skuId || ""));
    p.set("searchStartAt", opt.searchStartAt || "");
    p.set("searchEndAt", opt.searchEndAt || "");
    p.set(
      "rangeDays",
      String(opt.rangeDays != null ? opt.rangeDays : API_MAX_RANGE_DAYS)
    );
    p.set("locationFullName", opt.locationFullName || "");
    p.set("logType", opt.logType || "ADJUST");
    p.set("lpnId", opt.lpnId || "");
    p.set("workerId", opt.workerId || "");
    p.set("page", String(opt.page != null ? opt.page : 0));
    p.set("pageSize", String(opt.pageSize || PAGE_SIZE));
    return API_LOG + "?" + p.toString();
  }

  /**
   * 카드 기간(기본 30일)을 inventory 최대 7일 구간으로 분할.
   * 샘플과 동일: end - start = rangeDays (예: 09-07 ~ 09-14, rangeDays=7)
   */
  function buildDateChunks(overallStart, overallEnd, maxDays) {
    var chunks = [];
    var cursorEnd = new Date(overallEnd.getTime());
    var guard = 0;
    while (ymdCmp(cursorEnd, overallStart) >= 0 && guard < 64) {
      guard++;
      var cursorStart = addDays(cursorEnd, -maxDays);
      if (ymdCmp(cursorStart, overallStart) < 0) {
        cursorStart = new Date(overallStart.getTime());
      }
      var spanDays = Math.round(
        (cursorEnd.getTime() - cursorStart.getTime()) / 86400000
      );
      if (spanDays < 1) spanDays = 1;
      chunks.push({
        searchStartAt: formatYmd(cursorStart),
        searchEndAt: formatYmd(cursorEnd),
        rangeDays: spanDays,
      });
      cursorEnd = addDays(cursorStart, -1);
    }
    return chunks;
  }

  async function fetchLogPagesForWindow(opt, referer, onProgress) {
    var all = [];
    var page = 0;
    var totalPages = 1;
    while (page < totalPages) {
      if (onProgress) onProgress(page + 1, totalPages);
      var url = buildLogUrl({
        skuId: opt.skuId,
        searchStartAt: opt.searchStartAt,
        searchEndAt: opt.searchEndAt,
        rangeDays: opt.rangeDays,
        locationFullName: opt.locationFullName || "",
        logType: opt.logType,
        page: page,
        pageSize: PAGE_SIZE,
      });
      var json = await getJson(url, referer);
      if (!json || json.success !== true) {
        throw new Error(
          (json && json.message) ||
            "log search 실패 (" + opt.logType + " " + opt.searchStartAt + ")"
        );
      }
      var result = json.result || {};
      var content = Array.isArray(result.content) ? result.content : [];
      all = all.concat(content);
      if (typeof result.totalPages === "number" && result.totalPages > 0) {
        totalPages = result.totalPages;
      } else if (result.last === true || !content.length) {
        break;
      } else {
        totalPages = page + 2;
      }
      if (result.last === true) break;
      page += 1;
      if (page < totalPages) await sleep(PAGE_DELAY_MS);
    }
    return all;
  }

  async function fetchMonthLogs(skuId, locationFullName, yearMonth, statusPrefix) {
    var ym = parseYearMonthValue(yearMonth) || parseYearMonthValue(currentYearMonthValue());
    var bounds = calendarMonthBounds(ym.year, ym.monthIndex);
    var overallStart = bounds.start;
    var overallEnd = bounds.end;
    var chunks = buildDateChunks(
      overallStart,
      overallEnd,
      API_MAX_RANGE_DAYS
    );
    var referer =
      "https://inventory.coupang.com/inventory/log/sku/" + skuId;
    var raw = [];
    var seen = Object.create(null);
    var ci, ti, chunk, logType, rows, ri, key, r;
    var totalSteps = chunks.length * LOG_TYPES.length;
    var step = 0;

    for (ci = 0; ci < chunks.length; ci++) {
      chunk = chunks[ci];
      for (ti = 0; ti < LOG_TYPES.length; ti++) {
        logType = LOG_TYPES[ti];
        step += 1;
        setStatus(
          (statusPrefix || "") +
            "조회 중… " +
            step +
            "/" +
            totalSteps +
            " · " +
            ym.label +
            " · " +
            logType +
            " · " +
            chunk.searchStartAt +
            "~" +
            chunk.searchEndAt
        );
        rows = await fetchLogPagesForWindow(
          {
            skuId: skuId,
            searchStartAt: chunk.searchStartAt,
            searchEndAt: chunk.searchEndAt,
            rangeDays: chunk.rangeDays,
            locationFullName: locationFullName || "",
            logType: logType,
          },
          referer
        );
        for (ri = 0; ri < rows.length; ri++) {
          r = rows[ri];
          key = rowKey(r);
          if (seen[key]) continue;
          seen[key] = 1;
          raw.push(r);
        }
        await sleep(CHUNK_DELAY_MS);
      }
    }

    var matched = raw.filter(rowMatchesAnyCat);
    matched.sort(function (a, b) {
      return String(b.workedAt || "").localeCompare(String(a.workedAt || ""));
    });

    return {
      rows: matched,
      rawCount: raw.length,
      matchedCount: matched.length,
      skuId: skuId,
      yearMonth: ym.label,
      searchStartAt: formatYmd(overallStart),
      searchEndAt: formatYmd(overallEnd),
      chunks: chunks.length,
    };
  }

  function rowsToPlain(rows) {
    var headers = [
      "일시",
      "유형",
      "로케이션",
      "수량",
      "작업내역",
      "작업자",
      "가용",
    ];
    var withCenter = showCenterCol();
    if (withCenter) headers.unshift("센터");
    var lines = [headers.join("\t")];
    rows.forEach(function (r) {
      lines.push(
        (withCenter ? [cell(r._center)] : []).concat([
          cell(r.workedAt),
          cell(r.logType),
          cell(r.locationFullName),
          r.changeQuantity == null ? "" : String(r.changeQuantity),
          cell(r.description),
          cell(r.workerName) + (r.workerId ? " (" + r.workerId + ")" : ""),
          r.saleable === true ? "Y" : r.saleable === false ? "N" : cell(r.saleable),
        ])
          .map(function (v) {
            return String(v == null ? "" : v)
              .replace(/\t/g, " ")
              .replace(/\r?\n/g, " ");
          })
          .join("\t")
      );
    });
    return lines.join("\n");
  }

  function summaryToPlain(summary) {
    var lines = [
      ["로케이션"]
        .concat(
          DESC_CATS.map(function (c) {
            return c.label;
          }),
          ["합계", "건수"]
        )
        .join("\t"),
    ];
    summary.forEach(function (s) {
      lines.push(
        [s.location]
          .concat(
            DESC_CATS.map(function (c) {
              return s.qty[c.key];
            }),
            [s.totalQty, s.rowHits]
          )
          .join("\t")
      );
    });
    return lines.join("\n");
  }

  function summaryToTeamsHtml(summary) {
    var headers = ["로케이션"].concat(
      DESC_CATS.map(function (c) {
        return c.label;
      }),
      ["합계", "건수"]
    );
    var html =
      '<div style="font-weight:700;margin:12px 0 6px;font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:13px;color:#0f172a">로케이션별 수량 합계</div>' +
      '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:12px;color:#0f172a">' +
      '<thead><tr style="background:#f1f5f9;font-weight:bold">' +
      headers
        .map(function (h) {
          return "<th>" + esc(h) + "</th>";
        })
        .join("") +
      "</tr></thead><tbody>";
    summary.forEach(function (s) {
      html +=
        "<tr>" +
        "<td>" +
        esc(s.location) +
        "</td>" +
        DESC_CATS.map(function (c) {
          return (
            "<td style=\"text-align:right\">" +
            esc(String(s.qty[c.key])) +
            "</td>"
          );
        }).join("") +
        "<td style=\"text-align:right;font-weight:700\">" +
        esc(String(s.totalQty)) +
        "</td>" +
        "<td style=\"text-align:right\">" +
        esc(String(s.rowHits)) +
        "</td>" +
        "</tr>";
    });
    html += "</tbody></table>";
    return html;
  }

  function rowsToTeamsHtml(rows, title) {
    var headers = [
      "일시",
      "유형",
      "로케이션",
      "수량",
      "작업내역",
      "작업자",
      "가용",
    ];
    var withCenter = showCenterCol();
    if (withCenter) headers.unshift("센터");
    var summary = buildLocationSummary(rows);
    var html =
      (title
        ? "<div style=\"font-weight:700;margin-bottom:8px;font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:13px;color:#0f172a\">" +
          esc(title) +
          "</div>"
        : "") +
      (summary.length ? summaryToTeamsHtml(summary) : "") +
      '<div style="font-weight:700;margin:14px 0 6px;font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:13px;color:#0f172a">상세 내역</div>' +
      '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:12px;color:#0f172a">' +
      '<thead><tr style="background:#f1f5f9;font-weight:bold">' +
      headers
        .map(function (h) {
          return "<th>" + esc(h) + "</th>";
        })
        .join("") +
      "</tr></thead><tbody>";
    rows.forEach(function (r) {
      var qty = r.changeQuantity == null ? "" : String(r.changeQuantity);
      var worker =
        cell(r.workerName) + (r.workerId ? " (" + r.workerId + ")" : "");
      var sale =
        r.saleable === true ? "Y" : r.saleable === false ? "N" : cell(r.saleable);
      html +=
        "<tr>" +
        (withCenter ? "<td>" + esc(cell(r._center)) + "</td>" : "") +
        "<td>" +
        esc(cell(r.workedAt)) +
        "</td>" +
        "<td>" +
        esc(cell(r.logType)) +
        "</td>" +
        "<td>" +
        esc(cell(r.locationFullName)) +
        "</td>" +
        "<td style=\"text-align:right\">" +
        esc(qty) +
        "</td>" +
        "<td>" +
        esc(cell(r.description)) +
        "</td>" +
        "<td>" +
        esc(worker === "-" ? "" : worker) +
        "</td>" +
        "<td>" +
        esc(sale) +
        "</td>" +
        "</tr>";
    });
    html += "</tbody></table>";
    return html;
  }

  function buildTeamsTitle() {
    if (!lastMeta) return "가용화내역조회";
    return (
      "가용화내역 · SKU " +
      lastMeta.skuId +
      (lastMeta.centerMode ? " · " + lastMeta.centerMode : "") +
      (lastMeta.yearMonth ? " · " + lastMeta.yearMonth : "") +
      " · " +
      DESC_CATS_TEXT +
      " " +
      lastRows.length +
      "건"
    );
  }

  function copyTeamsTable(btn) {
    if (!lastRows || !lastRows.length) {
      if (btn) {
        btn.textContent = "복사할 내용 없음";
        setTimeout(function () {
          btn.textContent = "팀즈 복사";
        }, 1400);
      }
      return;
    }
    var title = buildTeamsTitle();
    var summary = buildLocationSummary(lastRows);
    var plain =
      title +
      "\n\n[로케이션별 합계]\n" +
      summaryToPlain(summary) +
      "\n\n[상세]\n" +
      rowsToPlain(lastRows);
    var html = rowsToTeamsHtml(lastRows, title);
    function done(ok, label) {
      if (!btn) return;
      btn.textContent = ok ? label || "복사됨" : "복사 실패";
      setTimeout(function () {
        btn.textContent = "팀즈 복사";
      }, 1400);
    }
    if (
      typeof ClipboardItem !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.write === "function"
    ) {
      navigator.clipboard
        .write([
          new ClipboardItem({
            "text/html": new Blob([html], {
              type: "text/html;charset=utf-8",
            }),
            "text/plain": new Blob([plain], {
              type: "text/plain;charset=utf-8",
            }),
          }),
        ])
        .then(function () {
          done(true, "팀즈 복사됨");
        })
        .catch(function () {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(plain).then(
              function () {
                done(true, "텍스트 복사됨");
              },
              function () {
                done(false);
              }
            );
            return;
          }
          done(false);
        });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(plain).then(
        function () {
          done(true, "텍스트 복사됨");
        },
        function () {
          done(false);
        }
      );
      return;
    }
    try {
      var ta = document.createElement("textarea");
      ta.value = plain;
      document.body.appendChild(ta);
      ta.select();
      done(!!document.execCommand("copy"), "텍스트 복사됨");
      document.body.removeChild(ta);
    } catch (eCp) {
      done(false);
    }
  }

  function ensureModalDom() {
    var existing = document.getElementById(MODAL_ID);
    if (existing) {
      var copyBtn = existing.querySelector('[data-act="copy"]');
      if (copyBtn) copyBtn.textContent = "팀즈 복사";
      if (!document.getElementById(MODAL_ID + "-summary")) {
        existing.remove();
      } else {
        return existing;
      }
    }
    var root = document.createElement("div");
    root.id = MODAL_ID;
    root.innerHTML =
      '<div class="yna4-avail-inner">' +
      '<div class="yna4-avail-toolbar">' +
      '<button type="button" class="yna4-avail-btn" data-act="copy">팀즈 복사</button>' +
      '<button type="button" class="yna4-avail-btn" data-act="close">닫기</button>' +
      '<div class="yna4-avail-meta" id="' +
      MODAL_ID +
      '-meta"></div></div>' +
      '<div class="yna4-avail-hint">작업내역에 ' +
      esc(DESC_CATS_TEXT) +
      " 포함 행만 표시 · ADJUST+PUTAWAY · 선택 월(7일 분할)</div>" +
      '<div class="yna4-avail-section-title">로케이션별 수량 합계</div>' +
      '<div class="yna4-avail-table-wrap yna4-avail-summary-wrap" id="' +
      MODAL_ID +
      '-summary"></div>' +
      '<div class="yna4-avail-section-title">상세 내역</div>' +
      '<div class="yna4-avail-table-wrap" id="' +
      MODAL_ID +
      '-table"></div></div>';
    document.body.appendChild(root);

    if (!document.getElementById("yna4-avail-history-css-v2")) {
      var oldCss = document.getElementById("yna4-avail-history-css");
      if (oldCss) oldCss.remove();
      var st = document.createElement("style");
      st.id = "yna4-avail-history-css-v2";
      st.textContent =
        "#" +
        MODAL_ID +
        "{display:none;position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.45);align-items:center;justify-content:center;padding:24px;box-sizing:border-box;}" +
        "#" +
        MODAL_ID +
        ".is-open{display:flex;}" +
        "#" +
        MODAL_ID +
        " .yna4-avail-inner{width:min(1100px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 20px 50px rgba(15,23,42,.28);padding:16px 18px 20px;}" +
        "#" +
        MODAL_ID +
        " .yna4-avail-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;}" +
        "#" +
        MODAL_ID +
        " .yna4-avail-btn{border:1px solid #cbd5e1;background:#f8fafc;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;}" +
        "#" +
        MODAL_ID +
        " .yna4-avail-btn:hover{background:#e2e8f0;}" +
        "#" +
        MODAL_ID +
        " .yna4-avail-meta{flex:1;min-width:160px;font-size:12px;color:#475569;font-weight:600;}" +
        "#" +
        MODAL_ID +
        " .yna4-avail-hint{font-size:11px;color:#64748b;margin-bottom:10px;}" +
        "#" +
        MODAL_ID +
        " .yna4-avail-section-title{font-size:12px;font-weight:800;color:#0f172a;margin:10px 0 6px;}" +
        "#" +
        MODAL_ID +
        " .yna4-avail-table-wrap{overflow:auto;max-height:42vh;border:1px solid #e2e8f0;border-radius:12px;scrollbar-gutter:stable;}" +
        "#" +
        MODAL_ID +
        " .yna4-avail-summary-wrap{max-height:28vh;margin-bottom:4px;}" +
        "#" +
        MODAL_ID +
        " table{width:100%;border-collapse:collapse;font-size:12px;}" +
        "#" +
        MODAL_ID +
        " .yna4-avail-sum-table{table-layout:fixed;width:100%;}" +
        "#" +
        MODAL_ID +
        " .yna4-avail-sum-table col.c-loc{width:44%;}" +
        "#" +
        MODAL_ID +
        " .yna4-avail-sum-table col.c-num{width:14%;}" +
        "#" +
        MODAL_ID +
        " th,#" +
        MODAL_ID +
        " td{padding:7px 8px;border-bottom:1px solid #f1f5f9;text-align:left;vertical-align:middle;}" +
        "#" +
        MODAL_ID +
        " th{position:sticky;top:0;background:#f8fafc;color:#64748b;font-size:11px;z-index:1;}" +
        "#" +
        MODAL_ID +
        " .yna4-avail-sum-table th{position:static;}" +
        "#" +
        MODAL_ID +
        " .yna4-avail-sum-table th.num,#" +
        MODAL_ID +
        " .yna4-avail-sum-table td.num{text-align:right;font-variant-numeric:tabular-nums;}" +
        "#" +
        MODAL_ID +
        " .qty-pos{color:#15803d;font-weight:700;}" +
        "#" +
        MODAL_ID +
        " .qty-neg{color:#b91c1c;font-weight:700;}" +
        "#" +
        MODAL_ID +
        " .qty-sum{font-weight:800;}" +
        "#" +
        ROOT_ID +
        ".yna4-pane-mod--avail-history{box-sizing:border-box;min-width:0;max-width:100%;width:100%;overflow:auto;display:flex;flex-direction:column;gap:4px;}" +
        "#" +
        ROOT_ID +
        " .yna4-avail-form{display:flex;flex-direction:column;gap:4px;margin:0;min-width:0;width:100%;max-width:100%;}" +
        "#" +
        ROOT_ID +
        " .yna4-avail-row{display:flex;min-width:0;width:100%;max-width:100%;overflow:hidden;}" +
        "#" +
        ROOT_ID +
        " .yna4-avail-inp,#" +
        ROOT_ID +
        " .yna4-avail-month{width:100%;max-width:100%;min-width:0;flex:1 1 auto;padding:5px 8px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;box-sizing:border-box;}" +
        "#" +
        ROOT_ID +
        " > .yna4-pane-actions{flex-wrap:wrap;min-width:0;width:100%;max-width:100%;}" +
        "#" +
        ROOT_ID +
        " > .yna4-pane-status{font-size:10px;overflow-wrap:anywhere;max-width:100%;}";
      document.head.appendChild(st);
    }

    root.addEventListener("click", function (e) {
      if (e.target === root) closeModal();
      var btn =
        e.target && e.target.closest ? e.target.closest("[data-act]") : null;
      if (btn && root.contains(btn)) {
        var act = btn.getAttribute("data-act");
        if (act === "close") closeModal();
        if (act === "copy") copyTeamsTable(btn);
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && root.classList.contains("is-open")) closeModal();
    });
    return root;
  }

  function openModal() {
    ensureModalDom().classList.add("is-open");
  }

  function closeModal() {
    var root = document.getElementById(MODAL_ID);
    if (root) root.classList.remove("is-open");
  }

  function renderModalTable() {
    var metaEl = document.getElementById(MODAL_ID + "-meta");
    var summaryEl = document.getElementById(MODAL_ID + "-summary");
    var tableEl = document.getElementById(MODAL_ID + "-table");
    if (!tableEl) return;
    if (metaEl && lastMeta) {
      metaEl.textContent =
        "SKU " +
        lastMeta.skuId +
        " · " +
        (lastMeta.yearMonth || "") +
        " (" +
        lastMeta.searchStartAt +
        " ~ " +
        lastMeta.searchEndAt +
        ") · 매칭 " +
        lastRows.length +
        "건 (원본 " +
        lastMeta.rawCount +
        " · 구간 " +
        lastMeta.chunks +
        "×2유형)" +
        (lastMeta.centerMode
          ? " · " + lastMeta.centerMode + " " + lastMeta.centerCount + "곳"
          : "") +
        (lastMeta.failed && lastMeta.failed.length
          ? " · 실패: " + lastMeta.failed.join(", ")
          : "");
    }
    if (!lastRows.length) {
      if (summaryEl) {
        summaryEl.innerHTML =
          '<div style="padding:16px;color:#64748b;font-size:13px;">합계할 행이 없습니다.</div>';
      }
      tableEl.innerHTML =
        '<div style="padding:16px;color:#64748b;font-size:13px;">' +
        esc(DESC_CATS_TEXT) +
        " 작업내역이 없습니다.</div>";
      return;
    }

    var summary = buildLocationSummary(lastRows);
    if (summaryEl) {
      var sHtml =
        '<table class="yna4-avail-sum-table">' +
        "<colgroup>" +
        '<col class="c-loc">' +
        DESC_CATS.map(function () {
          return '<col class="c-num">';
        }).join("") +
        '<col class="c-num">' +
        '<col class="c-num">' +
        "</colgroup>" +
        "<thead><tr>" +
        "<th>로케이션</th>" +
        DESC_CATS.map(function (c) {
          return '<th class="num">' + esc(c.label) + "</th>";
        }).join("") +
        '<th class="num">합계</th>' +
        '<th class="num">건수</th>' +
        "</tr></thead><tbody>";
      summary.forEach(function (s) {
        sHtml +=
          "<tr>" +
          "<td>" +
          esc(s.location) +
          "</td>" +
          DESC_CATS.map(function (c) {
            var v = s.qty[c.key];
            return (
              '<td class="num ' +
              qtyClass(v) +
              '">' +
              esc(String(v)) +
              "</td>"
            );
          }).join("") +
          '<td class="num qty-sum ' +
          qtyClass(s.totalQty) +
          '">' +
          esc(String(s.totalQty)) +
          "</td>" +
          '<td class="num">' +
          esc(String(s.rowHits)) +
          "</td>" +
          "</tr>";
      });
      sHtml += "</tbody></table>";
      summaryEl.innerHTML = sHtml;
    }

    var withCenter = showCenterCol();
    var html =
      "<table><thead><tr>" +
      (withCenter ? "<th>센터</th>" : "") +
      "<th>일시</th><th>유형</th><th>로케이션</th><th>수량</th><th>작업내역</th><th>작업자</th><th>가용</th>" +
      "</tr></thead><tbody>";
    lastRows.forEach(function (r) {
      var qty = r.changeQuantity;
      var qtyCls = qtyClass(Number(qty));
      html +=
        "<tr>" +
        (withCenter ? "<td>" + esc(cell(r._center)) + "</td>" : "") +
        "<td>" +
        esc(cell(r.workedAt)) +
        "</td>" +
        "<td>" +
        esc(cell(r.logType)) +
        "</td>" +
        "<td>" +
        esc(cell(r.locationFullName)) +
        "</td>" +
        '<td class="' +
        qtyCls +
        '">' +
        esc(cell(qty)) +
        "</td>" +
        "<td>" +
        esc(cell(r.description)) +
        "</td>" +
        "<td>" +
        esc(cell(r.workerName) + (r.workerId ? " (" + r.workerId + ")" : "")) +
        "</td>" +
        "<td>" +
        esc(
          r.saleable === true
            ? "Y"
            : r.saleable === false
            ? "N"
            : cell(r.saleable)
        ) +
        "</td>" +
        "</tr>";
    });
    html += "</tbody></table>";
    tableEl.innerHTML = html;
  }

  async function runSearch(form) {
    if (fetching) return;
    var skuId = String(form.skuInput.value || "").replace(/\D/g, "");
    if (!skuId) {
      setStatus("SKU ID를 입력하세요.", true);
      form.skuInput.focus();
      return;
    }
    var loc = "";
    var yearMonth = String(form.monthInput.value || "").trim();
    if (!parseYearMonthValue(yearMonth)) {
      setStatus("조회 월을 선택하세요.", true);
      form.monthInput.focus();
      return;
    }

    var centerSel = String(form.centerSelect.value || "");
    var centerIds =
      centerSel === "ALL"
        ? CENTERS.map(function (c) {
            return c[0];
          })
        : centerSel
        ? [centerSel]
        : null;
    if (
      centerSel === "ALL" &&
      !window.confirm(
        "전체 " +
          CENTERS.length +
          "개 센터를 차례로 전환하며 조회합니다.\n조회 중에는 다른 창의 inbound/inventory 센터도 바뀌어 보일 수 있고, 끝나면 " +
          centerName(activeCenterId()) +
          "로 복귀합니다.\n진행할까요?"
      )
    ) {
      return;
    }

    fetching = true;
    form.runBtn.disabled = true;
    try {
      ensureModalDom();
      var pack = centerIds
        ? await fetchCentersLogs(skuId, loc, yearMonth, centerIds)
        : await fetchMonthLogs(skuId, loc, yearMonth);
      lastRows = pack.rows || [];
      lastMeta = pack;
      setStatus(
        "완료 · " +
          (pack.centerMode ? pack.centerMode + " · " : "") +
          (pack.failed && pack.failed.length ? "실패 " + pack.failed.length + "곳 · " : "") +
          pack.yearMonth +
          " · 매칭 " +
          lastRows.length +
          "건 / 원본 " +
          pack.rawCount +
          " · " +
          pack.searchStartAt +
          " ~ " +
          pack.searchEndAt
      );
      renderModalTable();
      openModal();
    } catch (eRun) {
      setStatus(
        "실패: " + (eRun && eRun.message ? eRun.message : eRun),
        true
      );
      console.warn("[YAN4 avail history]", eRun);
    } finally {
      fetching = false;
      form.runBtn.disabled = false;
    }
  }

  window.__YAN4_INIT_AVAIL_HISTORY_PANE__ = function (hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.id = ROOT_ID;
    hostEl.classList.add("yna4-pane-mod", "yna4-pane-mod--avail-history");
    ensureModalDom();

    var form = document.createElement("div");
    form.className = "yna4-avail-form";

    var rowSku = document.createElement("div");
    rowSku.className = "yna4-avail-row";
    var skuInput = document.createElement("input");
    skuInput.className = "yna4-avail-inp";
    skuInput.type = "text";
    skuInput.placeholder = "SKU ID";
    skuInput.inputMode = "numeric";
    skuInput.title = "SKU ID";
    rowSku.appendChild(skuInput);

    var rowMonth = document.createElement("div");
    rowMonth.className = "yna4-avail-row";
    var monthInput = document.createElement("input");
    monthInput.className = "yna4-avail-month";
    monthInput.type = "month";
    monthInput.value = currentYearMonthValue();
    monthInput.max = currentYearMonthValue();
    monthInput.title = "조회할 달력 월 (당월은 오늘까지)";
    rowMonth.appendChild(monthInput);

    var rowCenter = document.createElement("div");
    rowCenter.className = "yna4-avail-row";
    var centerSelect = document.createElement("select");
    centerSelect.className = "yna4-avail-inp";
    centerSelect.title = "현재 = 센터 전환 없이 조회 · 그 외는 전환 후 조회하고 YAN4로 복귀";
    [["", "현재"], ["ALL", "전체"]]
      .concat(
        CENTERS.map(function (c) {
          return [c[0], c[1]];
        })
      )
      .forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o[0];
        opt.textContent = o[1];
        centerSelect.appendChild(opt);
      });
    rowCenter.appendChild(centerSelect);

    form.appendChild(rowSku);
    form.appendChild(rowMonth);
    form.appendChild(rowCenter);

    var actions = document.createElement("div");
    actions.className = "yna4-pane-actions";
    var runBtn = document.createElement("button");
    runBtn.type = "button";
    runBtn.className = "yna4-pane-btn yna4-pane-btn--primary";
    runBtn.textContent = "조회 실행";
    runBtn.title =
      "선택 월 · ADJUST+PUTAWAY · 7일 분할 · " + DESC_CATS_TEXT + "만";
    var reopenBtn = document.createElement("button");
    reopenBtn.type = "button";
    reopenBtn.className = "yna4-pane-btn";
    reopenBtn.textContent = "결과";
    reopenBtn.disabled = true;
    actions.appendChild(runBtn);
    actions.appendChild(reopenBtn);

    paneStatusEl = document.createElement("div");
    paneStatusEl.className = "yna4-pane-status";
    paneStatusEl.textContent =
      "월 선택 · ADJUST+PUTAWAY(7일 분할) · " + DESC_CATS_TEXT;

    hostEl.appendChild(form);
    hostEl.appendChild(actions);
    hostEl.appendChild(paneStatusEl);

    var formRefs = {
      skuInput: skuInput,
      monthInput: monthInput,
      centerSelect: centerSelect,
      runBtn: runBtn,
    };

    runBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      void runSearch(formRefs).then(function () {
        reopenBtn.disabled = !(lastRows && lastRows.length);
      });
    });
    reopenBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (!lastMeta) return;
      renderModalTable();
      openModal();
    });
    skuInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        runBtn.click();
      }
    });
  };
})();
