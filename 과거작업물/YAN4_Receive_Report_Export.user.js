// ==UserScript==
// @name         YAN4 입고내역 Excel (P/each)
// @namespace    yna4-receive-report-export
// @version      0.1.0
// @description  입고 내역 API 조회 → 토트 상세 진열로케이션 P/each → Excel 다운로드
// @match        https://inbound.coupang.com/receive/report/list*
// @grant        GM_xmlhttpRequest
// @connect      inbound.coupang.com
// @require      https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  if (document.getElementById("yna4UnifiedUiShell_v09")) return;

  var ROOT_ID = "yna4-receive-export-root";
  var LIST_REFERER = "https://inbound.coupang.com/receive/report/list";
  var PAGING_BASE = "https://inbound.coupang.com/receive/report/v2/paging";
  var DETAIL_BASE = "https://inbound.coupang.com/receive/report/v2";
  var PAGE_CAP = 500;
  var LIST_DELAY_MS = 200;
  var DETAIL_DELAY_MS = 120;
  var REQ_TIMEOUT_MS = 90000;

  var EXCEL_HEADERS = [
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

  var running = false;
  var stopRequested = false;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function todayYmd() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function parseHtml(html) {
    return new DOMParser().parseFromString(html, "text/html");
  } 

  function cellText(td) {
    if (!td) return "";
    var a = td.querySelector("a");
    if (a && a.textContent.trim()) return a.textContent.trim();
    return String(td.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function gmGet(url, referer) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        headers: {
          Accept: "text/html, */*; q=0.01",
          Referer: referer || LIST_REFERER,
          "X-Requested-With": "XMLHttpRequest",
        },
        timeout: REQ_TIMEOUT_MS,
        onload: function (r) {
          if (r.status >= 200 && r.status < 400) resolve(r.responseText || "");
          else reject(new Error("HTTP " + r.status));
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

  function buildPagingUrl(page, workerId, ymd) {
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
    return PAGING_BASE + "?" + q.toString();
  }

  function buildDetailUrl(detailPath) {
    var p = String(detailPath || "").trim();
    if (!p) return "";
    if (/^https?:\/\//i.test(p)) return p;
    if (p.charAt(0) !== "/") p = "/" + p;
    return "https://inbound.coupang.com" + p;
  }

  function headerIndexMap(table) {
    var map = {};
    var ths = table.querySelectorAll("thead th");
    for (var i = 0; i < ths.length; i++) {
      var key = String(ths[i].textContent || "")
        .replace(/\s+/g, "")
        .toLowerCase();
      map[key] = i;
    }
    return map;
  }

  function findCol(map, candidates) {
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

  function listRowSig(row) {
    return [
      row.poExternal,
      row.skuId,
      row.toteBarcode,
      row.detailPath,
      row.receivedAt,
    ].join("|");
  }

  function hasNextListPage(html) {
    var doc = parseHtml(html);
    var next = doc.querySelector("w-page-next");
    if (!next) return false;
    if (next.hasAttribute("disabled")) return false;
    return true;
  }

  function parseListRows(html) {
    var doc = parseHtml(html);
    var table = doc.querySelector('table[is="w-table"]');
    if (!table) return [];
    var map = headerIndexMap(table);
    var iPo = findCol(map, ["외부발주번호", "외부발주번호/itr번호"]);
    var iVendor = findCol(map, ["업체명"]);
    var iExtSku = findCol(map, ["외부skuid", "외부skuid"]);
    var iSku = findCol(map, ["skuid"]);
    var iBarcode = findCol(map, ["상품바코드"]);
    var iQty = findCol(map, ["입고수량"]);
    var iWorker = findCol(map, ["입고작업자"]);
    var iAt = findCol(map, ["입고일시"]);
    var iTote = findCol(map, ["토트바코드"]);

    var rows = [];
    var trs = table.querySelectorAll("tbody tr");
    for (var r = 0; r < trs.length; r++) {
      var tds = trs[r].querySelectorAll("td");
      if (!tds.length) continue;
      var toteTd = iTote >= 0 ? tds[iTote] : null;
      var detailA = toteTd ? toteTd.querySelector('a[href*="/detail"]') : null;
      var detailPath = detailA ? detailA.getAttribute("href") || "" : "";
      rows.push({
        poExternal: iPo >= 0 ? cellText(tds[iPo]) : "",
        vendor: iVendor >= 0 ? cellText(tds[iVendor]) : "",
        extSkuId: iExtSku >= 0 ? cellText(tds[iExtSku]) : "",
        skuId: iSku >= 0 ? cellText(tds[iSku]) : "",
        barcode: iBarcode >= 0 ? cellText(tds[iBarcode]) : "",
        qty: iQty >= 0 ? cellText(tds[iQty]) : "",
        worker: iWorker >= 0 ? cellText(tds[iWorker]) : "",
        receivedAt: iAt >= 0 ? cellText(tds[iAt]) : "",
        toteBarcode: toteTd ? cellText(toteTd) : "",
        detailPath: detailPath,
      });
    }
    return rows;
  }

  async function fetchAllListRows(workerId, ymd, onProgress) {
    var all = [];
    var page = 0;
    var firstSig = null;
    while (page < PAGE_CAP) {
      if (stopRequested) break;
      if (onProgress) onProgress("목록 " + (page + 1) + "페이지…", all.length);
      var html = await gmGet(buildPagingUrl(page, workerId, ymd), LIST_REFERER);
      var rows = parseListRows(html);
      if (!rows.length) break;
      var sig = listRowSig(rows[0]);
      if (firstSig && sig === firstSig && page > 0) break;
      if (!firstSig) firstSig = sig;
      all = all.concat(rows);
      if (!hasNextListPage(html)) break;
      page++;
      await sleep(LIST_DELAY_MS);
    }
    return all;
  }

  function tableAfterHeading(doc, headingContains) {
    var heads = doc.querySelectorAll("h5");
    for (var i = 0; i < heads.length; i++) {
      if (String(heads[i].textContent || "").indexOf(headingContains) < 0) continue;
      var el = heads[i].nextElementSibling;
      while (el) {
        if (el.tagName === "TABLE") return el;
        if (el.tagName === "BR") {
          el = el.nextElementSibling;
          continue;
        }
        el = el.nextElementSibling;
      }
    }
    return null;
  }

  function classifyPeach(location) {
    var loc = String(location || "").trim();
    if (!loc) return { location: "미진열", peach: "미진열" };
    if (loc.indexOf("P") >= 0) return { location: loc, peach: "Pallet" };
    return { location: loc, peach: "each" };
  }

  function parseDetailHtml(html, listSkuId) {
    var doc = parseHtml(html);
    var stockTable = tableAfterHeading(doc, "토트 내 재고");
    var stowTable = tableAfterHeading(doc, "진열 내역");

    var productName = "";
    if (stockTable) {
      var smap = headerIndexMap(stockTable);
      var iName = findCol(smap, ["상품명"]);
      var iSku = findCol(smap, ["skuid"]);
      var trs = stockTable.querySelectorAll("tbody tr");
      var pick = null;
      for (var s = 0; s < trs.length; s++) {
        var tds = trs[s].querySelectorAll("td");
        if (!tds.length) continue;
        var skuText = iSku >= 0 ? cellText(tds[iSku]) : "";
        if (listSkuId && skuText && skuText.indexOf(listSkuId) >= 0) {
          pick = tds;
          break;
        }
        if (!pick) pick = tds;
      }
      if (pick && iName >= 0) productName = cellText(pick[iName]);
    }

    var stowLocation = "";
    if (stowTable) {
      var tmap = headerIndexMap(stowTable);
      var iLoc = findCol(tmap, ["로케이션"]);
      var str = stowTable.querySelector("tbody tr");
      if (str) {
        var stds = str.querySelectorAll("td");
        if (iLoc >= 0 && stds[iLoc]) stowLocation = cellText(stds[iLoc]);
      }
    }

    var pe = classifyPeach(stowLocation);
    return {
      productName: productName,
      stowLocation: pe.location,
      peach: pe.peach,
    };
  }

  async function enrichRowsWithDetail(listRows, onProgress) {
    var out = [];
    var total = listRows.length;
    for (var i = 0; i < listRows.length; i++) {
      if (stopRequested) break;
      var row = listRows[i];
      var detail = {
        productName: "",
        stowLocation: "미진열",
        peach: "미진열",
      };
      if (row.detailPath) {
        if (onProgress) {
          onProgress("상세 " + (i + 1) + "/" + total + "…", i);
        }
        try {
          var url = buildDetailUrl(row.detailPath);
          var html = await gmGet(url, url);
          detail = parseDetailHtml(html, row.skuId);
        } catch (e) {
          detail.stowLocation = "미진열";
          detail.peach = "미진열(오류)";
        }
        await sleep(DETAIL_DELAY_MS);
      } else {
        detail.stowLocation = "미진열";
        detail.peach = "미진열";
      }
      out.push(Object.assign({}, row, detail));
    }
    return out;
  }

  function rowsToSheet(rows) {
    var data = [EXCEL_HEADERS.slice()];
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
    return XLSX.utils.aoa_to_sheet(data);
  }

  function downloadExcel(rows, ymd, workerId) {
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, rowsToSheet(rows), "입고내역");
    var suffix = workerId ? "_" + workerId : "";
    var name = "입고내역_" + ymd + suffix + ".xlsx";
    XLSX.writeFile(wb, name);
  }

  function injectStyles() {
    if ($("#yna4-receive-export-style")) return;
    var st = document.createElement("style");
    st.id = "yna4-receive-export-style";
    st.textContent =
      "#" +
      ROOT_ID +
      "{position:fixed;top:72px;right:16px;z-index:99999;width:300px;" +
      "background:#fff;border:1px solid #c7d2fe;border-radius:10px;" +
      "box-shadow:0 8px 24px rgba(75,75,192,.18);font:13px/1.4 'Malgun Gothic',sans-serif;color:#1e293b}" +
      "#" +
      ROOT_ID +
      " .yre-head{padding:10px 12px;background:#4b4bc0;color:#fff;font-weight:700;border-radius:10px 10px 0 0}" +
      "#" +
      ROOT_ID +
      " .yre-body{padding:12px;display:flex;flex-direction:column;gap:8px}" +
      "#" +
      ROOT_ID +
      " label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#475569}" +
      "#" +
      ROOT_ID +
      " input{padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px}" +
      "#" +
      ROOT_ID +
      " .yre-actions{display:flex;gap:8px;margin-top:4px}" +
      "#" +
      ROOT_ID +
      " button{flex:1;padding:8px 10px;border:none;border-radius:6px;cursor:pointer;font-weight:600}" +
      "#" +
      ROOT_ID +
      " .yre-run{background:#00c582;color:#fff}" +
      "#" +
      ROOT_ID +
      " .yre-run:disabled{opacity:.55;cursor:not-allowed}" +
      "#" +
      ROOT_ID +
      " .yre-stop{background:#fee2e2;color:#b91c1c}" +
      "#" +
      ROOT_ID +
      " .yre-status{min-height:36px;font-size:12px;color:#64748b;white-space:pre-wrap}";
    document.head.appendChild(st);
  }

  function setStatus(msg) {
    var el = $("#" + ROOT_ID + "-status");
    if (el) el.textContent = msg || "";
  }

  function setRunning(on) {
    running = on;
    var runBtn = $("#" + ROOT_ID + "-run");
    var stopBtn = $("#" + ROOT_ID + "-stop");
    if (runBtn) runBtn.disabled = on;
    if (stopBtn) stopBtn.disabled = !on;
  }

  async function runExport() {
    if (running) return;
    var workerEl = $("#" + ROOT_ID + "-worker");
    var dateEl = $("#" + ROOT_ID + "-date");
    var workerId = workerEl ? String(workerEl.value || "").trim() : "";
    var ymd = dateEl ? String(dateEl.value || "").trim() : "";
    if (!ymd) {
      alert("입고일시를 선택하세요.");
      return;
    }

    stopRequested = false;
    setRunning(true);
    setStatus("시작…");

    try {
      var listRows = await fetchAllListRows(workerId, ymd, function (msg) {
        setStatus(msg);
      });
      if (!listRows.length) {
        alert("조회 결과가 없습니다.");
        setStatus("결과 없음");
        return;
      }
      if (stopRequested) {
        setStatus("중단됨 (목록 " + listRows.length + "행)");
        return;
      }

      setStatus("목록 " + listRows.length + "행 · 상세 조회…");
      var enriched = await enrichRowsWithDetail(listRows, function (msg) {
        setStatus(msg);
      });
      if (stopRequested) {
        setStatus("중단됨");
        return;
      }

      downloadExcel(enriched, ymd, workerId);
      setStatus("완료 · " + enriched.length + "행 Excel 저장");
    } catch (e) {
      setStatus("오류: " + (e && e.message ? e.message : String(e)));
      alert("실패: " + (e && e.message ? e.message : String(e)));
    } finally {
      setRunning(false);
      stopRequested = false;
    }
  }

  function mountPanel() {
    if ($("#" + ROOT_ID)) return;
    injectStyles();
    var root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML =
      '<div class="yre-head">YAN4 입고내역 Excel</div>' +
      '<div class="yre-body">' +
      '<label>입고작업자<input type="text" id="' +
      ROOT_ID +
      '-worker" placeholder="Y6364751 (비우면 전체)" /></label>' +
      '<label>입고일시<input type="date" id="' +
      ROOT_ID +
      '-date" /></label>' +
      '<div class="yre-actions">' +
      '<button type="button" class="yre-run" id="' +
      ROOT_ID +
      '-run">조회 · Excel</button>' +
      '<button type="button" class="yre-stop" id="' +
      ROOT_ID +
      '-stop" disabled>중단</button>' +
      "</div>" +
      '<div class="yre-status" id="' +
      ROOT_ID +
      '-status">작업자 · 날짜 선택 후 조회</div>' +
      "</div>";
    document.body.appendChild(root);

    var dateEl = $("#" + ROOT_ID + "-date");
    if (dateEl) dateEl.value = todayYmd();
    $("#" + ROOT_ID + "-run").addEventListener("click", runExport);
    $("#" + ROOT_ID + "-stop").addEventListener("click", function () {
      stopRequested = true;
      setStatus("중단 요청…");
    });
  }

  mountPanel();
})();
