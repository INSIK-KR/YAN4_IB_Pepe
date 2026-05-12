// ==UserScript==
// @name         YAN4 IB PO→SKU 진열 미달 추적
// @namespace    yna4-ib-direct-sla
// @version      0.2.5
// @description  하차 상세 등 「발주 목록」표가 있는 페이지에서 발주 링크를 따라가 SKU 표를 읽고, 진열완료+진열오류 < 입고 행만 모은다.
// v0.2.5: 페이지 탭이 1개(data-go-page 고유 1개)면 추가 페이지 요청 안 함(1페이지만 있는데 순회하던 문제)
// @match        https://inbound.coupang.com/*
// @match        http://inbound.coupang.com/*
// @match        *://inbound.coupang.com/*
// @match        *://*.coupang.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// @connect      inbound.coupang.com
// @connect      inventory.coupang.com
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  try {
    console.log("[YAN4 PO SKU Gap Trace] v0.2.5 script loaded", location.href);
  } catch (e) {}

  const BTN_ID = "yna4-po-sku-gap-trace-btn";
  const MODAL_ID = "yna4-po-sku-gap-modal";

  /** 인벤 로케이션 열에서만 채택: 1007-RCRT2 / RCRT3 / RCRT4 (예: 1007-RCRT2-2-876) */
  const RCRT_LOCATION_RE = /1007-RCRT[234]/;
  const INVENTORY_LIST_URL = "https://inventory.coupang.com/inventory/list";
  /** 재고 SKU당 페이지 순회 상한 (비정상 페이지네이션 대비) */
  const INVENTORY_PAGE_CAP = 80;
  /** 인벤 HTTP 무한 대기 방지 (ms) — 끊기면 다음 POST/GET 시도로 넘어감 */
  const GM_REQ_TIMEOUT_MS = 45000;

  function normKey(s) {
    return String(s || "")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  /** 후보는 긴 것이 앞(입고수량 → 입고). 짧은 후보는 미입고/재입고 등 오매칭 제외 */
  function findCol(headers, candidates) {
    const h = headers.map((x, i) => ({ n: normKey(x), i }));
    function matchScore(headerNorm, candNorm) {
      if (!headerNorm || !candNorm) return -1;
      if (headerNorm === candNorm) return 2000 + candNorm.length;
      if (headerNorm.includes(candNorm)) return 1000 + candNorm.length;
      if (candNorm.includes(headerNorm) && headerNorm.length > 0) return 500 + headerNorm.length;
      return -1;
    }
    function rejectShortCand(headerNorm, candNorm) {
      if (candNorm === "입고") {
        if (headerNorm === "미입고" || headerNorm === "재입고") return true;
        if (/^미/.test(headerNorm) && headerNorm !== "입고" && headerNorm.includes("입고")) return true;
        if (/^재/.test(headerNorm) && headerNorm !== "입고" && headerNorm.includes("입고")) return true;
      }
      if (candNorm === "진열완료") {
        if (/^미/.test(headerNorm) && headerNorm !== "진열완료" && headerNorm.includes("진열완료"))
          return true;
      }
      if (candNorm === "진열오류") {
        if (/^미/.test(headerNorm) && headerNorm !== "진열오류" && headerNorm.includes("진열오류"))
          return true;
      }
      return false;
    }
    for (let c = 0; c < candidates.length; c++) {
      const cn = normKey(candidates[c]);
      let bestJ = -1;
      let bestSc = -1;
      for (let j = 0; j < h.length; j++) {
        const x = h[j];
        if (rejectShortCand(x.n, cn)) continue;
        const sc = matchScore(x.n, cn);
        if (sc > bestSc) {
          bestSc = sc;
          bestJ = x.i;
        }
      }
      if (bestJ >= 0) return bestJ;
    }
    return -1;
  }

  function num(v) {
    if (v == null || v === "") return NaN;
    return parseFloat(String(v).replace(/,/g, "").trim());
  }

  function tableToAoa(table) {
    const aoa = [];
    const trs = table.querySelectorAll("tr");
    for (let i = 0; i < trs.length; i++) {
      const cells = trs[i].querySelectorAll("th,td");
      if (!cells.length) continue;
      const row = [];
      for (let j = 0; j < cells.length; j++) {
        row.push(
          String(cells[j].textContent != null ? cells[j].textContent : "")
            .replace(/\u00a0/g, " ")
            .trim()
        );
      }
      aoa.push(row);
    }
    return aoa;
  }

  function padRows(aoa) {
    let max = 0;
    for (let i = 0; i < aoa.length; i++) {
      if (aoa[i].length > max) max = aoa[i].length;
    }
    return aoa.map(function (r) {
      const row = r.slice();
      while (row.length < max) row.push("");
      return row;
    });
  }

  function findPoSkuHeaderMap(aoa) {
    for (let r = 0; r < Math.min(25, aoa.length); r++) {
      const texts = aoa[r].map((c) => String(c ?? "").trim());
      const idxSku = findCol(texts, ["SKU ID", "SKUID"]);
      const idxRecv = findCol(texts, ["입고 수량", "입고수량", "입고"]);
      const idxDisp = findCol(texts, ["진열완료 수량", "진열완료수량", "진열완료"]);
      const idxErr = findCol(texts, ["진열오류 수량", "진열오류수량", "진열오류"]);
      if (idxSku < 0 || idxRecv < 0 || idxDisp < 0 || idxErr < 0) continue;
      const cols = [idxSku, idxRecv, idxDisp, idxErr];
      const uniq = new Set(cols);
      if (uniq.size < 4) continue;
      const idxName = findCol(texts, ["상품명"]);
      const idxStat = findCol(texts, ["상태"]);
      return {
        headerRow: r,
        idxSku,
        idxRecv,
        idxDisp,
        idxErr,
        idxName,
        idxStat,
      };
    }
    return null;
  }

  function purchaseOrderIdFromUrl(poUrl) {
    try {
      const u = new URL(poUrl, location.origin);
      const q = u.searchParams.get("purchaseOrderId") || u.searchParams.get("purchaseorderid");
      if (q) return String(q).trim();
      const path = u.pathname || "";
      let m = path.match(/(?:purchaseOrder\/item|purchaseorder\/item)\/(\d+)/i);
      if (m) return m[1];
      m = path.match(/purchaseOrderId[=/](\d+)/i);
      if (m) return m[1];
    } catch (e) {}
    return "";
  }

  function parseSkuGapsFromDoc(doc, poUrl) {
    const pid = purchaseOrderIdFromUrl(poUrl);
    const seen = new WeakSet();
    const tables = [];
    doc.querySelectorAll('table[is="w-table"]').forEach(function (tb) {
      if (!seen.has(tb)) {
        seen.add(tb);
        tables.push(tb);
      }
    });
    doc.querySelectorAll("table").forEach(function (tb) {
      if (!seen.has(tb)) {
        seen.add(tb);
        tables.push(tb);
      }
    });
    const out = [];

    for (let t = 0; t < tables.length; t++) {
      const aoa = padRows(tableToAoa(tables[t]));
      const map = findPoSkuHeaderMap(aoa);
      if (!map) continue;
      const dataStart = map.headerRow + 1;
      for (let r = dataStart; r < aoa.length; r++) {
        const cells = aoa[r].map((x) => String(x ?? "").trim());
        const recv = num(cells[map.idxRecv]);
        const disp = num(cells[map.idxDisp]);
        const err = num(cells[map.idxErr]);
        if (!Number.isFinite(recv) || !Number.isFinite(disp) || !Number.isFinite(err)) continue;
        if (disp + err >= recv) continue;
        const sku = map.idxSku >= 0 ? cells[map.idxSku].replace(/\s+/g, " ").trim() : "";
        const name = map.idxName >= 0 ? cells[map.idxName] || "" : "";
        const stat = map.idxStat >= 0 ? cells[map.idxStat] || "" : "";
        out.push({
          purchaseOrderId: pid,
          poUrl: poUrl,
          sku: sku,
          name: name,
          status: stat,
          recv: recv,
          disp: disp,
          err: err,
          gap: recv - disp - err,
        });
      }
    }
    const seenRows = Object.create(null);
    const dedup = [];
    for (let i = 0; i < out.length; i++) {
      const k = out[i].poUrl + "\t" + out[i].sku;
      if (seenRows[k]) continue;
      seenRows[k] = true;
      dedup.push(out[i]);
    }
    return dedup;
  }

  /** document + 열린(open) Shadow DOM — SPA가 표를 shadow 안에 그릴 때 대비 */
  function allSearchRootsFromDocument(doc) {
    const out = [];
    if (!doc || !doc.querySelectorAll) return out;
    const stack = [doc];
    let guard = 0;
    const MAX = 500;
    while (stack.length && guard < MAX) {
      guard++;
      const cur = stack.pop();
      if (!cur || !cur.querySelectorAll) continue;
      out.push(cur);
      let nodes;
      try {
        nodes = cur.querySelectorAll("*");
      } catch (e) {
        continue;
      }
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].shadowRoot) stack.push(nodes[i].shadowRoot);
      }
    }
    return out;
  }

  /** w-table 우선, 없으면 tbody에 purchaseOrder/item 링크가 있는 일반 table 까지 탐색 */
  function findPoListTable(doc) {
    if (!doc) return null;
    const wTables = doc.querySelectorAll('table[is="w-table"]');
    let t = scanPoListTableCandidates(wTables);
    if (t) return t;
    return scanPoListTableCandidates(doc.querySelectorAll("table"));
  }

  function scanPoListTableCandidates(tables) {
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      let headerBlob = "";
      table.querySelectorAll("thead th").forEach(function (th) {
        headerBlob += th.textContent || "";
      });
      if (/외부/i.test(headerBlob) && /발주|ITR/i.test(headerBlob)) return table;
    }
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      if (
        table.querySelector(
          'tbody a[href*="purchaseOrder/item"], tbody a[href*="purchaseorder/item"]'
        )
      ) {
        return table;
      }
    }
    return null;
  }

  /** 동일 출처 iframe 포함해 발주 목록 표가 있는 window 찾기 */
  function collectSameOriginWindows(win, depth, out) {
    if (depth > 8 || !win) return;
    try {
      out.push(win);
      const n = win.frames.length;
      for (let i = 0; i < n; i++) {
        try {
          collectSameOriginWindows(win.frames[i], depth + 1, out);
        } catch (e) {}
      }
    } catch (e) {}
  }

  function findPoListContext() {
    const wins = [];
    try {
      collectSameOriginWindows(window.top || window, 0, wins);
    } catch (e) {
      collectSameOriginWindows(window, 0, wins);
    }
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      let doc = null;
      try {
        doc = w.document;
      } catch (e) {
        continue;
      }
      if (!doc) continue;
      const roots = allSearchRootsFromDocument(doc);
      let table = null;
      for (let r = 0; r < roots.length; r++) {
        table = findPoListTable(roots[r]);
        if (table) break;
      }
      if (!table) continue;
      let origin = "";
      try {
        origin = w.location.origin || "";
      } catch (e2) {}
      if (!origin) origin = location.origin || "";
      return { table: table, origin: origin };
    }
    return null;
  }

  function collectPoUrls(table, origin) {
    const list = [];
    const seen = Object.create(null);
    const rowSel = "tbody tr, tr";
    table.querySelectorAll(rowSel).forEach(function (tr) {
      const a =
        tr.querySelector('td a[href*="purchaseOrder/item"]') ||
        tr.querySelector('td a[href*="purchaseorder/item"]') ||
        tr.querySelector('a[href*="purchaseOrder/item"]') ||
        tr.querySelector('a[href*="purchaseorder/item"]');
      if (!a) return;
      let href = a.getAttribute("href");
      if (!href) return;
      if (href.startsWith("/")) href = origin + href;
      else if (!/^https?:/i.test(href)) return;
      if (seen[href]) return;
      seen[href] = true;
      list.push(href);
    });
    return list;
  }

  const INV_REFERER = INVENTORY_LIST_URL + "?searched=true";

  function gmGet(url, extraHeaders) {
    const h = Object.assign(
      { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      extraHeaders || {}
    );
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        headers: h,
        timeout: GM_REQ_TIMEOUT_MS,
        onload: function (r) {
          if (r.status >= 200 && r.status < 400) resolve(r.responseText);
          else reject(new Error("HTTP " + r.status + " " + url));
        },
        onerror: function () {
          reject(new Error("요청 실패 " + url));
        },
        ontimeout: function () {
          reject(new Error("타임아웃(GET " + GM_REQ_TIMEOUT_MS + "ms) " + url));
        },
      });
    });
  }

  function gmPostForm(url, body, extraHeaders) {
    const h = Object.assign(
      {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      extraHeaders || {}
    );
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: "POST",
        url: url,
        headers: h,
        data: body,
        timeout: GM_REQ_TIMEOUT_MS,
        onload: function (r) {
          if (r.status >= 200 && r.status < 400) resolve(r.responseText);
          else reject(new Error("HTTP " + r.status + " POST " + url));
        },
        onerror: function () {
          reject(new Error("POST 실패 " + url));
        },
        ontimeout: function () {
          reject(new Error("타임아웃(POST " + GM_REQ_TIMEOUT_MS + "ms) " + url));
        },
      });
    });
  }

  /** 발주 표 SKU 칸에 부가 텍스트가 붙어도 숫자 ID만 인벤에 넘김 */
  function normalizeInventorySkuId(sku) {
    const s = String(sku || "")
      .replace(/\u00a0/g, " ")
      .trim();
    if (!s) return "";
    const digits = s.match(/\d{5,20}/);
    return digits ? digits[0] : s.replace(/\s+/g, "");
  }

  function pickInventoryTable(doc) {
    const w = doc.querySelector('table[is="w-table"]');
    if (w) return w;
    const tables = doc.querySelectorAll("table");
    for (let i = 0; i < tables.length; i++) {
      if (findInventoryLocationColIndex(tables[i]) >= 0) return tables[i];
    }
    return doc.querySelector("table");
  }

  function inventoryResultDataRowCount(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = pickInventoryTable(doc);
    if (!table) return 0;
    let n = 0;
    table.querySelectorAll("tbody tr").forEach(function (tr) {
      const tds = tr.querySelectorAll("td");
      if (tds.length >= 3) n++;
    });
    return n;
  }

  function findInventoryLocationColIndex(table) {
    const tr = table.querySelector("thead tr");
    if (!tr) return -1;
    const ths = tr.querySelectorAll("th");
    for (let i = 0; i < ths.length; i++) {
      const raw = String(ths[i].textContent || "").replace(/\u00a0/g, " ").trim();
      const k = normKey(raw);
      if (k === "로케이션") return i;
    }
    for (let i = 0; i < ths.length; i++) {
      const k = normKey(ths[i].textContent || "");
      if (k.includes("로케이션") && !k.includes("시작") && !k.includes("종료") && !k.includes("바코드"))
        return i;
    }
    return -1;
  }

  function inventoryListHasLocationColumn(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = pickInventoryTable(doc);
    if (!table) return false;
    return findInventoryLocationColIndex(table) >= 0;
  }

  /** inventory/list 응답 HTML에서 로케이션 열만 읽고 RCRT 필터 */
  function parseInventoryRcrtLocations(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = pickInventoryTable(doc);
    if (!table) return [];
    const idx = findInventoryLocationColIndex(table);
    if (idx < 0) return [];
    const out = [];
    const seen = Object.create(null);
    table.querySelectorAll("tbody tr").forEach(function (tr) {
      const cells = tr.querySelectorAll("td");
      if (cells.length <= idx) return;
      let text = String(cells[idx].textContent || "")
        .replace(/\u00a0/g, " ")
        .trim();
      if (!text || /^없음$/i.test(text)) return;
      if (!RCRT_LOCATION_RE.test(text)) return;
      if (seen[text]) return;
      seen[text] = true;
      out.push(text);
    });
    return out;
  }

  /**
   * 실제 페이지 탭 개수 기준: 고유 data-go-page 가 1개뿐이면 1페이지만 있는 것으로 본다.
   * (예전엔 max만 보거나 오매칭 시 2…N페이지를 순회해 한 페이지짜리에서도 멈춘 것처럼 보임)
   */
  function parsePaginationMaxPage(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    let nodes = doc.querySelectorAll("w-page-item-group w-page-item[data-go-page]");
    if (!nodes.length) nodes = doc.querySelectorAll("w-page-item[data-go-page]");
    if (!nodes.length) nodes = doc.querySelectorAll(".page-link.go-page[data-go-page]");
    const pages = new Set();
    for (let i = 0; i < nodes.length; i++) {
      const v = parseInt(nodes[i].getAttribute("data-go-page"), 10);
      if (Number.isFinite(v) && v >= 1 && v <= INVENTORY_PAGE_CAP) pages.add(v);
    }
    if (pages.size === 0 && typeof html === "string") {
      const blockMatch = html.match(/<w-page-item-group\b[\s\S]*?<\/w-page-item-group>/i);
      const scan = blockMatch ? blockMatch[0] : "";
      const re = /data-go-page\s*=\s*"(\d+)"/gi;
      let m;
      while ((m = re.exec(scan)) !== null) {
        const v = parseInt(m[1], 10);
        if (Number.isFinite(v) && v >= 1 && v <= INVENTORY_PAGE_CAP) pages.add(v);
      }
    }
    if (pages.size <= 1) return 1;
    let max = 1;
    pages.forEach(function (v) {
      if (v > max) max = v;
    });
    return max;
  }

  /** tbody 첫 데이터 행 지문 — 다음 페이지가 1페이지와 같은 HTML인지 구분 */
  function inventoryFirstDataRowSignature(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = pickInventoryTable(doc);
    if (!table) return "";
    const tr = table.querySelector("tbody tr");
    if (!tr) return "";
    return String(tr.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  }

  function mergeRcrtIntoSet(merged, html) {
    const locs = parseInventoryRcrtLocations(html);
    for (let i = 0; i < locs.length; i++) merged.add(locs[i]);
  }

  /**
   * POST 다음 페이지: Spring Pageable은 보통 page=0 이 첫 페이지 → UI N페이지 → page=N-1.
   * 서버가 body 무시하고 query만 볼 수 있어 POST URL에 ?page= 도 순차 시도.
   */
  async function collectRcrtAllPagesPost(firstHtml, basePostBody, id, hdr) {
    const merged = new Set();
    mergeRcrtIntoSet(merged, firstHtml);
    const sigFirst = inventoryFirstDataRowSignature(firstHtml);
    const maxFromUi = parsePaginationMaxPage(firstHtml);
    const last = Math.min(Math.max(1, maxFromUi), INVENTORY_PAGE_CAP);
    if (last > 1) {
      console.log("[YAN4] inventory paginate POST", id, "uiPages=1.." + last);
    }
    for (let uiPg = 2; uiPg <= last; uiPg++) {
      await sleep(350);
      const zeroBased = uiPg - 1;
      const attempts = [
        {
          label: "body.page=" + zeroBased + "(0-based)",
          run: function () {
            const p = new URLSearchParams(basePostBody);
            p.set("page", String(zeroBased));
            return gmPostForm(INVENTORY_LIST_URL, p.toString(), hdr);
          },
        },
        {
          label: "body.page=" + uiPg + "(1-based)",
          run: function () {
            const p = new URLSearchParams(basePostBody);
            p.set("page", String(uiPg));
            return gmPostForm(INVENTORY_LIST_URL, p.toString(), hdr);
          },
        },
        {
          label: "query.page=" + zeroBased + "+body",
          run: function () {
            const p = new URLSearchParams(basePostBody);
            p.delete("page");
            const q = new URLSearchParams();
            q.set("page", String(zeroBased));
            const url = INVENTORY_LIST_URL + "?" + q.toString();
            return gmPostForm(url, p.toString(), hdr);
          },
        },
        {
          label: "query.page=" + uiPg + "+body",
          run: function () {
            const p = new URLSearchParams(basePostBody);
            p.delete("page");
            const q = new URLSearchParams();
            q.set("page", String(uiPg));
            const url = INVENTORY_LIST_URL + "?" + q.toString();
            return gmPostForm(url, p.toString(), hdr);
          },
        },
      ];
      let chosenHtml = null;
      let chosenLabel = "";
      for (let ai = 0; ai < attempts.length; ai++) {
        try {
          const html = await attempts[ai].run();
          const rcrt = parseInventoryRcrtLocations(html);
          const sig = inventoryFirstDataRowSignature(html);
          const dup =
            sigFirst.length > 0 && sig === sigFirst && inventoryResultDataRowCount(html) > 0;
          if (rcrt.length > 0 || !dup) {
            chosenHtml = html;
            chosenLabel = attempts[ai].label;
            break;
          }
        } catch (e) {
          console.warn("[YAN4] inventory POST page attempt", id, uiPg, attempts[ai].label, e);
        }
      }
      if (!chosenHtml) {
        try {
          chosenHtml = await attempts[0].run();
          chosenLabel = attempts[0].label + "(fallback)";
        } catch (e) {
          console.warn("[YAN4] inventory POST page uiPg=" + uiPg, id, e);
          continue;
        }
      }
      mergeRcrtIntoSet(merged, chosenHtml);
      console.log(
        "[YAN4] inventory POST uiPage=" + uiPg,
        id,
        chosenLabel,
        "rcrtRow+" + parseInventoryRcrtLocations(chosenHtml).length
      );
    }
    return Array.from(merged).join(", ");
  }

  /**
   * GET: page를 0-based / 1-based 둘 다 시도해 첫 페이지와 다른 응답을 선택
   */
  async function collectRcrtAllPagesGet(firstHtml, firstUrl, id, hdr) {
    const merged = new Set();
    mergeRcrtIntoSet(merged, firstHtml);
    let baseUrl;
    try {
      baseUrl = new URL(firstUrl);
    } catch (e) {
      return Array.from(merged).join(", ");
    }
    const sigFirst = inventoryFirstDataRowSignature(firstHtml);
    const maxFromUi = parsePaginationMaxPage(firstHtml);
    const last = Math.min(Math.max(1, maxFromUi), INVENTORY_PAGE_CAP);
    if (last > 1) {
      console.log("[YAN4] inventory paginate GET", id, "uiPages=1.." + last);
    }
    for (let uiPg = 2; uiPg <= last; uiPg++) {
      await sleep(350);
      const zeroBased = uiPg - 1;
      const urls = [
        (function () {
          const u = new URL(baseUrl.href);
          u.searchParams.set("page", String(zeroBased));
          return u.href;
        })(),
        (function () {
          const u = new URL(baseUrl.href);
          u.searchParams.set("page", String(uiPg));
          return u.href;
        })(),
      ];
      let chosenHtml = null;
      let chosenUrl = "";
      for (let i = 0; i < urls.length; i++) {
        try {
          const html = await gmGet(urls[i], hdr);
          const rcrt = parseInventoryRcrtLocations(html);
          const sig = inventoryFirstDataRowSignature(html);
          const dup =
            sigFirst.length > 0 && sig === sigFirst && inventoryResultDataRowCount(html) > 0;
          if (rcrt.length > 0 || !dup) {
            chosenHtml = html;
            chosenUrl = urls[i];
            break;
          }
        } catch (e) {
          console.warn("[YAN4] inventory GET page try", id, uiPg, i, e);
        }
      }
      if (!chosenHtml) {
        try {
          chosenHtml = await gmGet(urls[0], hdr);
          chosenUrl = urls[0];
        } catch (e) {
          console.warn("[YAN4] inventory GET page uiPg=" + uiPg, id, e);
          continue;
        }
      }
      mergeRcrtIntoSet(merged, chosenHtml);
      console.log(
        "[YAN4] inventory GET uiPage=" + uiPg,
        id,
        chosenUrl.slice(-40),
        "rcrtRow+" + parseInventoryRcrtLocations(chosenHtml).length
      );
    }
    return Array.from(merged).join(", ");
  }

  async function fetchRcrtLocationsForSku(sku) {
    const id = normalizeInventorySkuId(sku);
    if (!id) {
      console.warn("[YAN4] inventory: SKU 비어 있음", sku);
      return "";
    }
    const enc = encodeURIComponent(id);
    const hdr = { Referer: INV_REFERER };

    const postBodies = [
      "searched=true&skuId=" + enc,
      "searched=true&page=1&skuId=" + enc,
      "skuId=" + enc + "&searched=true",
      "searched=true&sku=" + enc,
      "searched=true&searchSkuId=" + enc,
    ];
    const getUrls = [
      INVENTORY_LIST_URL + "?searched=true&skuId=" + enc,
      INVENTORY_LIST_URL + "?searched=true&page=1&skuId=" + enc,
      INVENTORY_LIST_URL + "?searched=true&sku=" + enc,
      INVENTORY_LIST_URL + "?searched=true&searchSkuId=" + enc,
    ];

    for (let p = 0; p < postBodies.length; p++) {
      try {
        const html = await gmPostForm(INVENTORY_LIST_URL, postBodies[p], hdr);
        if (!inventoryListHasLocationColumn(html)) continue;
        const out = await collectRcrtAllPagesPost(html, postBodies[p], id, hdr);
        console.log("[YAN4] inventory RCRT total POST#" + p, id, out || "(없음)");
        return out;
      } catch (e) {
        console.warn("[YAN4] inventory POST#" + p, id, e);
      }
    }
    for (let g = 0; g < getUrls.length; g++) {
      try {
        const html = await gmGet(getUrls[g], hdr);
        if (!inventoryListHasLocationColumn(html)) continue;
        const out = await collectRcrtAllPagesGet(html, getUrls[g], id, hdr);
        console.log("[YAN4] inventory RCRT total GET#" + g, id, out || "(없음)");
        return out;
      } catch (e) {
        console.warn("[YAN4] inventory GET#" + g, id, e);
      }
    }
    console.warn("[YAN4] inventory: 표 파싱 실패 또는 로그인 필요 SKU", id);
    return "";
  }

  async function enrichRowsWithRcrtLocations(rows, onProgress) {
    const skuSeen = Object.create(null);
    for (let i = 0; i < rows.length; i++) {
      const s = String(rows[i].sku || "").trim();
      if (s) skuSeen[s] = true;
    }
    const skus = Object.keys(skuSeen);
    const map = Object.create(null);
    for (let i = 0; i < skus.length; i++) {
      if (typeof onProgress === "function") onProgress(i + 1, skus.length);
      try {
        map[skus[i]] = await fetchRcrtLocationsForSku(skus[i]);
      } catch (e) {
        map[skus[i]] = "";
      }
      await sleep(400);
    }
    for (let i = 0; i < rows.length; i++) {
      const s = String(rows[i].sku || "").trim();
      rows[i].rcrtLocations = s && map[s] != null ? map[s] : "";
    }
    return rows;
  }

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  async function runTrace() {
    const ctx = findPoListContext();
    if (!ctx) {
      alert(
        "발주 목록 표를 찾지 못했습니다.\n· 같은 탭에서 하차 상세(발주 목록)까지 연 뒤 다시 시도\n· iframe 안 표는 동일 도메인만 인식\n· Tampermonkey 아이콘 → 「YAN4: 발주→SKU 미달 추적 실행」 도 시도"
      );
      return;
    }
    const origin = ctx.origin;
    const poTable = ctx.table;
    const urls = collectPoUrls(poTable, origin);
    if (!urls.length) {
      alert("발주 링크(purchaseOrder/item)가 있는 행이 없습니다.");
      return;
    }

    const btn = document.getElementById(BTN_ID);
    if (btn) {
      btn.disabled = true;
      btn.textContent = "추적 중… (0/" + urls.length + ")";
    }

    const all = [];
    for (let i = 0; i < urls.length; i++) {
      if (btn) btn.textContent = "추적 중… (" + (i + 1) + "/" + urls.length + ")";
      try {
        const html = await gmGet(urls[i]);
        const doc = new DOMParser().parseFromString(html, "text/html");
        const rows = parseSkuGapsFromDoc(doc, urls[i]);
        for (let j = 0; j < rows.length; j++) all.push(rows[j]);
      } catch (e) {
        console.warn(e);
      }
      await sleep(350);
    }

    all.sort(function (a, b) {
      return b.gap - a.gap;
    });

    let uniqSku = 0;
    const skuSet = Object.create(null);
    for (let i = 0; i < all.length; i++) {
      const s = String(all[i].sku || "").trim();
      if (s && !skuSet[s]) {
        skuSet[s] = true;
        uniqSku++;
      }
    }
    if (btn && uniqSku > 0) {
      btn.textContent = "재고 RCRT 조회… (0/" + uniqSku + ")";
    }
    await enrichRowsWithRcrtLocations(all, function (cur, tot) {
      if (btn) btn.textContent = "재고 RCRT 조회… (" + cur + "/" + tot + ")";
    });

    if (btn) {
      btn.disabled = false;
      btn.textContent = "발주→SKU 미달 추적";
    }

    showModal(all, urls.length);
  }

  function buildGapTsv(rows) {
    const lines = [
      "발주ID\tSKU\t상품명\t상태\t입고\t진열완료\t진열오류\t미달잔량\t로케이션(1007-RCRT2~4)",
    ];
    for (let i = 0; i < rows.length; i++) {
      const x = rows[i];
      lines.push(
        [
          x.purchaseOrderId,
          x.sku,
          x.name,
          x.status,
          x.recv,
          x.disp,
          x.err,
          x.gap,
          x.rcrtLocations != null ? x.rcrtLocations : "",
        ].join("\t")
      );
    }
    return lines.join("\n");
  }

  /** Microsoft Teams 등: 클립보드에 HTML 표 + plain TSV 동시 제공 시 채팅에 표로 붙음 */
  function buildGapClipboardTableInner(rows) {
    let html =
      '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:12px;color:#0f172a">' +
      '<thead><tr style="background:#f1f5f9;font-weight:bold">' +
      "<th>발주ID</th><th>SKU</th><th>상품명</th><th>상태</th>" +
      '<th style="text-align:right">입고</th><th style="text-align:right">진열완료</th><th style="text-align:right">진열오류</th><th style="text-align:right">미달</th>' +
      "<th>로케이션 (1007-RCRT2~4)</th>" +
      "</tr></thead><tbody>";
    if (!rows.length) {
      html +=
        '<tr><td colspan="9" style="text-align:center;color:#64748b;padding:12px">조건에 해당하는 SKU 없음</td></tr>';
    } else {
      for (let i = 0; i < rows.length; i++) {
        const x = rows[i];
        const loc = x.rcrtLocations != null ? x.rcrtLocations : "";
        html +=
          "<tr>" +
          "<td>" +
          escapeHtml(x.purchaseOrderId) +
          '</td><td style="font-family:Consolas,monospace">' +
          escapeHtml(x.sku) +
          "</td><td>" +
          escapeHtml(x.name) +
          "</td><td>" +
          escapeHtml(x.status) +
          '</td><td style="text-align:right">' +
          x.recv +
          '</td><td style="text-align:right">' +
          x.disp +
          '</td><td style="text-align:right">' +
          x.err +
          '</td><td style="text-align:right;font-weight:bold">' +
          x.gap +
          "</td><td>" +
          escapeHtml(loc) +
          "</td></tr>";
      }
    }
    html += "</tbody></table>";
    return html;
  }

  function wrapClipboardHtmlFragment(innerTable) {
    return (
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body>" +
      "<!--StartFragment-->" +
      innerTable +
      "<!--EndFragment-->" +
      "</body></html>"
    );
  }

  function copyGapTableForTeams(rows) {
    const tsv = buildGapTsv(rows);
    const inner = buildGapClipboardTableInner(rows);
    const fullHtml = wrapClipboardHtmlFragment(inner);

    const okTeams = function () {
      alert("팀즈에 붙여넣을 표 형식으로 복사했습니다.\n(채팅 입력창에 붙여넣기 하면 표로 표시됩니다.)");
    };
    const okTsvOnly = function () {
      alert(
        "표 형식 복사가 제한되어 탭으로 구분된 텍스트만 복사했습니다.\n메모장·엑셀에는 붙여넣기 가능합니다."
      );
    };
    const failPrompt = function () {
      prompt("복사 실패 — 아래를 수동으로 복사하세요.", tsv);
    };

    if (
      typeof ClipboardItem !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.write === "function"
    ) {
      navigator.clipboard
        .write([
          new ClipboardItem({
            "text/html": new Blob([fullHtml], { type: "text/html;charset=utf-8" }),
            "text/plain": new Blob([tsv], { type: "text/plain;charset=utf-8" }),
          }),
        ])
        .then(function () {
          okTeams();
        })
        .catch(function (err) {
          console.warn("[YAN4 PO Trace] ClipboardItem:", err);
          navigator.clipboard.writeText(tsv).then(okTsvOnly, failPrompt);
        });
      return;
    }
    navigator.clipboard.writeText(tsv).then(okTsvOnly, failPrompt);
  }

  function showModal(rows, poCount) {
    let el = document.getElementById(MODAL_ID);
    if (el) el.remove();

    el = document.createElement("div");
    el.id = MODAL_ID;
    el.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;";
    const panel = document.createElement("div");
    panel.style.cssText =
      "background:#fff;border-radius:12px;max-width:min(960px,96vw);max-height:88vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.25);padding:16px;font:13px/1.45 Segoe UI,Malgun Gothic,sans-serif;color:#0f172a;";
    const title =
      "<div style='font-weight:800;margin-bottom:10px;color:#0f766e'>진열 미달 SKU (진열완료+진열오류 &lt; 입고)</div>" +
      "<div style='font-size:12px;color:#64748b;margin-bottom:12px'>발주 " +
      poCount +
      "건 요청 · 미달 " +
      rows.length +
      "행</div>";

    let tableHtml =
      "<table style='width:100%;border-collapse:collapse;font-size:12px'><thead><tr>" +
      "<th style='text-align:left;padding:8px;border-bottom:2px solid #e2e8f0'>발주ID</th>" +
      "<th style='text-align:left;padding:8px;border-bottom:2px solid #e2e8f0'>SKU</th>" +
      "<th style='text-align:left;padding:8px;border-bottom:2px solid #e2e8f0'>상품명</th>" +
      "<th style='text-align:left;padding:8px;border-bottom:2px solid #e2e8f0'>상태</th>" +
      "<th style='text-align:right;padding:8px;border-bottom:2px solid #e2e8f0'>입고</th>" +
      "<th style='text-align:right;padding:8px;border-bottom:2px solid #e2e8f0'>진열완료</th>" +
      "<th style='text-align:right;padding:8px;border-bottom:2px solid #e2e8f0'>진열오류</th>" +
      "<th style='text-align:right;padding:8px;border-bottom:2px solid #e2e8f0'>미달</th>" +
      "<th style='text-align:left;padding:8px;border-bottom:2px solid #e2e8f0'>로케이션 (RCRT2~4)</th>" +
      "</tr></thead><tbody>";

    if (!rows.length) {
      tableHtml +=
        "<tr><td colspan='9' style='padding:20px;text-align:center;color:#64748b'>조건에 해당하는 SKU 없음</td></tr>";
    } else {
      for (let i = 0; i < rows.length; i++) {
        const x = rows[i];
        const loc = x.rcrtLocations != null ? x.rcrtLocations : "";
        tableHtml +=
          "<tr><td style='padding:6px;border-bottom:1px solid #f1f5f9'>" +
          escapeHtml(x.purchaseOrderId) +
          "</td><td style='padding:6px;border-bottom:1px solid #f1f5f9;font-family:Consolas,monospace'>" +
          escapeHtml(x.sku) +
          "</td><td style='padding:6px;border-bottom:1px solid #f1f5f9'>" +
          escapeHtml(x.name) +
          "</td><td style='padding:6px;border-bottom:1px solid #f1f5f9'>" +
          escapeHtml(x.status) +
          "</td><td style='padding:6px;border-bottom:1px solid #f1f5f9;text-align:right'>" +
          x.recv +
          "</td><td style='padding:6px;border-bottom:1px solid #f1f5f9;text-align:right'>" +
          x.disp +
          "</td><td style='padding:6px;border-bottom:1px solid #f1f5f9;text-align:right'>" +
          x.err +
          "</td><td style='padding:6px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:800'>" +
          x.gap +
          "</td><td style='padding:6px;border-bottom:1px solid #f1f5f9;font-size:11px'>" +
          escapeHtml(loc) +
          "</td></tr>";
      }
    }
    tableHtml += "</tbody></table>";

    panel.innerHTML =
      title +
      tableHtml +
      "<div style='margin-top:14px;display:flex;gap:8px;justify-content:flex-end'>" +
      "<button type='button' id='yna4-gap-copy' style='padding:8px 14px;border:0;border-radius:8px;background:#0d9488;color:#fff;font-weight:700;cursor:pointer'>팀즈용 표 복사</button>" +
      "<button type='button' id='yna4-gap-close' style='padding:8px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer'>닫기</button></div>";

    el.appendChild(panel);
    document.body.appendChild(el);

    document.getElementById("yna4-gap-close").addEventListener("click", function () {
      el.remove();
    });
    el.addEventListener("click", function (ev) {
      if (ev.target === el) el.remove();
    });

    document.getElementById("yna4-gap-copy").addEventListener("click", function () {
      copyGapTableForTeams(rows);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function injectButton() {
    if (!document.body) return;
    if (document.getElementById(BTN_ID)) return;
    if (!findPoListContext()) return;

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "발주→SKU 미달 추적";
    btn.style.cssText =
      "position:fixed;bottom:20px;right:20px;z-index:2147483645;padding:10px 14px;border:0;border-radius:10px;background:#0d9488;color:#fff;font:700 12px Segoe UI,Malgun Gothic,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2);";
    btn.addEventListener("click", function () {
      runTrace();
    });
    document.body.appendChild(btn);
  }

  function removeDeadButton() {
    const btn = document.getElementById(BTN_ID);
    if (btn && !findPoListContext()) btn.remove();
  }

  function shouldAutoRunByUrl() {
    try {
      const u = new URL(location.href);
      const q = String(u.searchParams.get("yna4_gap_auto") || "").trim();
      const h = String((u.hash || "").replace(/^#/, ""));
      if (q === "1" || /(?:^|&)yna4_gap_auto=1(?:&|$)/.test(h)) return true;
    } catch (e) {}
    return false;
  }

  function clearAutoRunFlagInUrl() {
    try {
      const u = new URL(location.href);
      if (!u.searchParams.has("yna4_gap_auto")) return;
      u.searchParams.delete("yna4_gap_auto");
      history.replaceState(null, "", u.pathname + (u.search || "") + (u.hash || ""));
    } catch (e) {}
  }

  function scheduleAutoRunIfRequested() {
    if (!shouldAutoRunByUrl()) return;
    clearAutoRunFlagInUrl();
    let tries = 0;
    const maxTry = 24;
    const tick = function () {
      tries++;
      if (findPoListContext()) {
        runTrace();
        return;
      }
      if (tries < maxTry) setTimeout(tick, 500);
    };
    setTimeout(tick, 350);
  }

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("YAN4: 발주→SKU 미달 추적 실행", function () {
      runTrace();
    });
  }

  injectButton();
  scheduleAutoRunIfRequested();
  const obs = new MutationObserver(function () {
    removeDeadButton();
    injectButton();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
