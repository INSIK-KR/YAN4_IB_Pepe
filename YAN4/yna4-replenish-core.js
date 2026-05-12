(function () {
  "use strict";

  const YNA4_PAGE_ROLE = window.YNA4_PAGE_ROLE || "combined";
  const IS_COMBINED_PAGE = YNA4_PAGE_ROLE === "combined";
  const IS_DATA_PAGE = YNA4_PAGE_ROLE === "data" || IS_COMBINED_PAGE;
  const IS_PREVIEW_PAGE = YNA4_PAGE_ROLE === "preview" || IS_COMBINED_PAGE;

  const WORKFLOW_TSV_STORAGE_KEY = "yna4_workflow_tsv_v1";
  const WB_B64_STORAGE_PREFIX = "yna4_wb_b64_v1_";
  const WB_SHEET_STORAGE_PREFIX = "yna4_wb_sheet_v1_";
  const WB_FILENAME_STORAGE_PREFIX = "yna4_wb_filename_v1_";
  let replenishSyncChannel = null;
  try {
    replenishSyncChannel = new BroadcastChannel("yna4_replenish_v1");
  } catch (e) {
    replenishSyncChannel = null;
  }

  function broadcastReplenishSync(kind) {
    if (replenishSyncChannel) {
      try {
        replenishSyncChannel.postMessage({ t: kind || "sync", at: Date.now() });
      } catch (e) {}
    }
  }

  function getWorkflowTsvText() {
    const ta = document.getElementById("pasteTsv");
    if (IS_DATA_PAGE && ta) return ta.value;
    try {
      return localStorage.getItem(WORKFLOW_TSV_STORAGE_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function persistWorkflowTsvFromDataPage() {
    if (!IS_DATA_PAGE) return;
    const ta = document.getElementById("pasteTsv");
    if (!ta) return;
    try {
      localStorage.setItem(WORKFLOW_TSV_STORAGE_KEY, ta.value);
    } catch (e) {}
    broadcastReplenishSync("tsv");
  }

  function persistWorkbooksToStorage() {
    if (!IS_DATA_PAGE) return;
    const isSingleWorkbookMode = workbooks[0] && workbooks[0] === workbooks[1];
    const b64Cache = new Map();
    for (let i = 0; i < 2; i++) {
      const wb = workbooks[i];
      const nameEl = document.getElementById("fileName" + i);
      const fnText = nameEl
        ? String(nameEl.textContent || "").replace(/^선택됨:\s*/, "")
        : "붙여넣기";
      try {
        if (isSingleWorkbookMode && i > 0) {
          localStorage.removeItem(WB_B64_STORAGE_PREFIX + i);
          localStorage.removeItem(WB_SHEET_STORAGE_PREFIX + i);
          localStorage.removeItem(WB_FILENAME_STORAGE_PREFIX + i);
          continue;
        }
        if (wb) {
          let b64 = b64Cache.get(wb);
          if (!b64) {
            b64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
            b64Cache.set(wb, b64);
          }
          localStorage.setItem(WB_B64_STORAGE_PREFIX + i, b64);
          localStorage.setItem(WB_SHEET_STORAGE_PREFIX + i, currentSheet[i] || "");
          localStorage.setItem(WB_FILENAME_STORAGE_PREFIX + i, fnText || "workbook");
        } else {
          localStorage.removeItem(WB_B64_STORAGE_PREFIX + i);
          localStorage.removeItem(WB_SHEET_STORAGE_PREFIX + i);
          localStorage.removeItem(WB_FILENAME_STORAGE_PREFIX + i);
        }
      } catch (e) {}
    }
    for (let j = 2; j <= 3; j++) {
      try {
        localStorage.removeItem(WB_B64_STORAGE_PREFIX + j);
        localStorage.removeItem(WB_SHEET_STORAGE_PREFIX + j);
        localStorage.removeItem(WB_FILENAME_STORAGE_PREFIX + j);
      } catch (e) {}
    }
    broadcastReplenishSync("wb");
  }

  function loadWorkbooksFromStorage() {
    for (let i = 0; i < 2; i++) {
      try {
        const b64 = localStorage.getItem(WB_B64_STORAGE_PREFIX + i);
        if (b64) {
          workbooks[i] = XLSX.read(b64, { type: "base64", cellDates: true });
          const sn = localStorage.getItem(WB_SHEET_STORAGE_PREFIX + i);
          const names = workbooks[i].SheetNames || [];
          currentSheet[i] = sn && names.indexOf(sn) !== -1 ? sn : names[0] || "";
        } else {
          workbooks[i] = null;
          currentSheet[i] = "";
        }
      } catch (e) {
        workbooks[i] = null;
        currentSheet[i] = "";
      }
    }
    if (IS_DATA_PAGE) {
      for (let i = 0; i < 2; i++) {
        syncPasteTextareaFromWorkbook(i);
        if (workbooks[i]) updateExcelSummary(i);
        else setSummary(i, "", false);
      }
    }
  }

  function applyExternalReplenishUpdate() {
    loadWorkbooksFromStorage();
    if (IS_DATA_PAGE) {
      const ta = document.getElementById("pasteTsv");
      if (ta) {
        let s = "";
        try {
          s = localStorage.getItem(WORKFLOW_TSV_STORAGE_KEY) || "";
        } catch (e) {}
        if (s !== ta.value) ta.value = s;
      }
      refreshPasteMeta();
    } else if (IS_PREVIEW_PAGE) {
      refreshMergePreview();
    }
  }

  /** 취합 결과 테이블 열 순서(나머지 열은 SLA·진열대기·이동중 매핑 확정 후 채움) */
  const MERGE_TABLE_HEADERS = [
    "SKU ID",
    "Barcode",
    "보충수량",
    "GC재고",
    "상품명",
    "GC",
    "CT",
    "우선순위",
    "온도대",
    "차량번호",
    "하차시간",
    "상태",
    "보충기한",
    "완료"
  ];

  /** 워크플로 TSV 열 번호(1부터) — F=6 SKU, G=7 바코드, H=8 Unit, I=9 보충기한, J=10 상태 */
  const MERGE_SKU_WORKFLOW_COL_1BASED = 6;
  const MERGE_SKU_WORKFLOW_COL_0 = MERGE_SKU_WORKFLOW_COL_1BASED - 1;
  const MERGE_BARCODE_WORKFLOW_COL_1BASED = 7;
  const MERGE_BARCODE_WORKFLOW_COL_0 = MERGE_BARCODE_WORKFLOW_COL_1BASED - 1;
  const MERGE_UNIT_WORKFLOW_COL_1BASED = 8;
  const MERGE_UNIT_WORKFLOW_COL_0 = MERGE_UNIT_WORKFLOW_COL_1BASED - 1;
  /** 보충기한: 워크플로 I열 = 탭 기준 9번째(1-based 9). */
  const MERGE_DEADLINE_WORKFLOW_COL_1BASED = 9;
  const MERGE_DEADLINE_WORKFLOW_COL_0 = MERGE_DEADLINE_WORKFLOW_COL_1BASED - 1;
  /** 상태(예: 재고 부족): 워크플로 J열 = 1-based 10. 이관현황 I와 별개. */
  const MERGE_STATUS_WORKFLOW_COL_1BASED = 10;
  const MERGE_STATUS_WORKFLOW_COL_0 = MERGE_STATUS_WORKFLOW_COL_1BASED - 1;
  const MERGE_WORKFLOW_MIN_COLS = Math.max(
    MERGE_SKU_WORKFLOW_COL_1BASED,
    MERGE_BARCODE_WORKFLOW_COL_1BASED,
    MERGE_UNIT_WORKFLOW_COL_1BASED,
    MERGE_DEADLINE_WORKFLOW_COL_1BASED,
    MERGE_STATUS_WORKFLOW_COL_1BASED
  );

  /** SLA(①) 시트 열(0-based): D=3→GC, G=6→SKU ID, J=9→상품명, O=14→온도대 */
  const SLA_WB_INDEX = 0;
  const SLA_GC_COL_0 = 3;
  const SLA_SKU_COL_0 = 6;
  /** 카트/보내기 TSV: I열(0-based 8) 바코드(PL02…). 워크플로 6·7열(SKU·바코드)과 SLA G·I 조인. */
  const SLA_BARCODE_COL_0 = 8;
  const SLA_PRODUCT_NAME_COL_0 = 9;
  const SLA_TEMP_ZONE_COL_0 = 14;
  /** SLA P열(0-based 15) = 해당 SKU·GC 조합의 수량. 워크플로 Unit보다 적으면 같은 SKU의 다른 GC도 추가 표시. */
  const SLA_QTY_COL_0 = 15;
  const SLA_TEMP_ZONE_CANONICAL = ["FROZEN", "CHILLED", "AMBIENT"];

  /** SLA O열: 공백 → 표시 RM·필터 RM. FROZEN/CHILLED/AMBIENT(대소문자 무시) 정규화. 그 외는 표시 유지·필터 기타. */
  function formatTempZoneCell(raw) {
    const t = String(raw != null ? raw : "").trim();
    if (!t) return { display: "RM", filterKey: "RM" };
    const u = t.toUpperCase();
    if (SLA_TEMP_ZONE_CANONICAL.indexOf(u) !== -1) return { display: u, filterKey: u };
    return { display: t, filterKey: "OTHER" };
  }

  /** 대시보드①: CHILLED — 10·15구 (프리팩) */
  const MERGE_DASHBOARD1_CHILLED_NAME_FRAGMENTS = ["10구", "15구", "10입", "15입"];

  function mergeProductNameMatchesChilledDashboard1(nameText) {
    const t = String(nameText || "");
    for (let i = 0; i < MERGE_DASHBOARD1_CHILLED_NAME_FRAGMENTS.length; i++) {
      if (t.indexOf(MERGE_DASHBOARD1_CHILLED_NAME_FRAGMENTS[i]) !== -1) return true;
    }
    return false;
  }

  /** 대시보드②: CHILLED — [SR] 태그 */
  function mergeProductNameMatchesChilledDashboard2Sr(nameText) {
    const t = String(nameText || "");
    return t.indexOf("[SR]") !== -1;
  }

  /** 대시보드③: CHILLED — 20·25·30구 (상품명에 반숙·반숙란 있으면 ③ 제외 → ④) */
  const MERGE_DASHBOARD3_CHILLED_NAME_FRAGMENTS = ["20구", "25구", "30구", "20입", "25입", "30입"];

  function mergeProductNameMatchesChilledDashboard3LargeEgg(nameText) {
    const t = String(nameText || "");
    let hasLargeEgg = false;
    for (let i = 0; i < MERGE_DASHBOARD3_CHILLED_NAME_FRAGMENTS.length; i++) {
      if (t.indexOf(MERGE_DASHBOARD3_CHILLED_NAME_FRAGMENTS[i]) !== -1) {
        hasLargeEgg = true;
        break;
      }
    }
    if (!hasLargeEgg) return false;
    if (t.indexOf("반숙란") !== -1) return false;
    if (t.indexOf("반숙") !== -1) return false;
    return true;
  }

  /** ①·③ 전용 패턴이어도 촉촉란·구운란 있으면 ④(CHILLED 기타). ②(SR) 등은 변경 없음. */
  function mergeProductNameChilledMoistOrBakedEggExcludesDashboard1And3(nameText) {
    const t = String(nameText || "");
    return t.indexOf("촉촉란") !== -1 || t.indexOf("구운란") !== -1;
  }

  function mergeProductNameMatchesAmbientDashboard3(nameText) {
    const t = String(nameText || "");
    if (t.indexOf("[팩]") !== -1) return true;
    if (t.indexOf("수박") !== -1) return true;
    return false;
  }

  /** GC 토큰(하이픈/언더스코어/공백 분리) 중 하나가 정확히 'RCRT1'이면 true. ⑦ ETC 우선 분류용. */
  function mergeGcMatchesEtcRcrt1Exact(gcRaw) {
    const g = String(gcRaw != null ? gcRaw : "")
      .trim()
      .toUpperCase()
      .replace(/\u00a0/g, " ");
    if (!g) return false;
    const parts = g.split(/[-_\s]+/);
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "RCRT1") return true;
    }
    return false;
  }

  /**
   * SLA P 수량을 워크플로 Unit 누적에 넣지 않을 GC — ⑨번 대시보드와 동일( GC 없음 · RCRT1 정확 토큰 ).
   * RCRT2 등은 창고 수량 누적에 포함.
   */
  function mergeGcSlaQtyExcludedFromEtcDash9(gcRaw) {
    const gc = String(gcRaw != null ? gcRaw : "").trim();
    if (!gc) return true;
    return mergeGcMatchesEtcRcrt1Exact(gc);
  }

  /** 1=10·15구, 2=[SR], 3=20·25·30구, 4=CHILLED 그 외, 5=AMBIENT 프리팩, 6=AMBIENT, 7=FROZEN, 8=RM(GC있음·온도대 미지정/기타), 9=ETC(GC 없음·RCRT1) */
  function mergeDashboardSlotIndexForRow(tempFilterKey, productName, gcRaw) {
    const gc = String(gcRaw != null ? gcRaw : "").trim();
    if (!gc) return 9;
    if (mergeGcMatchesEtcRcrt1Exact(gc)) return 9;
    const z = String(tempFilterKey || "");
    const n = String(productName || "");
    if (z === "CHILLED") {
      const noDash13ForMoistBakedEgg = mergeProductNameChilledMoistOrBakedEggExcludesDashboard1And3(n);
      if (!noDash13ForMoistBakedEgg && mergeProductNameMatchesChilledDashboard1(n)) return 1;
      if (mergeProductNameMatchesChilledDashboard2Sr(n)) return 2;
      if (!noDash13ForMoistBakedEgg && mergeProductNameMatchesChilledDashboard3LargeEgg(n)) return 3;
      return 4;
    }
    if (z === "AMBIENT") {
      if (mergeProductNameMatchesAmbientDashboard3(n)) return 5;
      return 6;
    }
    if (z === "FROZEN") return 7;
    return 8;
  }

  /** 통합 상태(②): 진열대기·진열중·이동중을 한 붙여넣기에 넣음. A=GC → B·H·I·K·L (진열대기 열 배치, 첫 GC 행만 사용). */
  const PENDING_WB_INDEX = 1;
  const PENDING_GC_MATCH_COL_0 = 0;
  const PENDING_PRIORITY_COL_0 = 1;
  const PENDING_CT_COL_0 = 7;
  const PENDING_STATUS_COL_0 = 8;
  const PENDING_VEHICLE_COL_0 = 10;
  const PENDING_UNLOAD_COL_0 = 11;

  /** ② 이관 I열: 진열대기·진열중·이동중. 워크플로 10열 이후 배송사 라벨이 오면 무시하고 이관 상태를 쓴다. */
  const MERGE_STATUS_TRANSFER_STATE_RE = /진열대기|진열중|이동중/;

  function mergeStatusLooksLikeTransferSheet(s) {
    return MERGE_STATUS_TRANSFER_STATE_RE.test(String(s || ""));
  }

  /** 워크플로 상태 열이 배송/운송 라벨인 경우 — 이관 상태를 가리지 않음 */
  function mergeStatusWorkflowIsCarrierOrDeliveryNoise(s) {
    const t = String(s || "").trim();
    if (!t) return true;
    return /쿠팡배송|로켓배송|신선배송|새벽배송|당일배송|일반배송|택배\s*배송|^\s*배송\s*$/i.test(t) ||
      /대한통운|한진택배|롯데택배|CJ대한통운|CJ\s*대한통운/i.test(t);
  }

  function mergeStatusWorkflowIsUsefulSupplement(s) {
    const t = String(s || "").trim();
    if (!t || mergeStatusWorkflowIsCarrierOrDeliveryNoise(t)) return false;
    if (mergeStatusLooksLikeTransferSheet(t)) return true;
    return /재고|부족|품절|결품|단종|보충|지연/i.test(t);
  }

  /** 이관이 진열대기·진열중·이동중이면 이관만 표시(워크플로 재고 부족 등은 붙이지 않음). */
  function resolveMergeTableStatusDisplay(pendStatusRaw, workflowStatusRaw) {
    const pendStatus = String(pendStatusRaw != null ? pendStatusRaw : "").trim();
    const wf = String(workflowStatusRaw != null ? workflowStatusRaw : "").trim();

    if (mergeStatusLooksLikeTransferSheet(pendStatus)) {
      return pendStatus;
    }
    if (wf && mergeStatusWorkflowIsUsefulSupplement(wf)) return wf.trim();
    if (!mergeStatusWorkflowIsCarrierOrDeliveryNoise(wf)) return pendStatus || wf;
    return pendStatus;
  }

  /** 표에 보이는 상태 문구 기준 재고부족 — GC 있을 때만 대시보드 하단 정렬에 사용. */
  function mergeDisplayStatusIsStockShortageForDashSort(statusDisplay) {
    return /재고\s*부족|재고부족/.test(String(statusDisplay || "").trim());
  }

  const workbooks = [null, null];
  const currentSheet = ["", ""];
  /** 대시보드: SKU별 보충 완료 체크 — 세션 중 localStorage에 두며, 페이지 새로고침 시 초기화 */
  const mergeReplenishDoneBySku = new Set();
  const MERGE_DONE_STORAGE_KEY = "yna4_merge_replenish_done_v1";

  function mergeReplenishDoneKey(sku) {
    return String(sku || "").trim() === "" ? "__EMPTY_SKU__" : String(sku).trim();
  }

  function loadMergeReplenishDoneFromStorage() {
    try {
      const raw = localStorage.getItem(MERGE_DONE_STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      mergeReplenishDoneBySku.clear();
      for (let i = 0; i < arr.length; i++) {
        mergeReplenishDoneBySku.add(String(arr[i]));
      }
    } catch (e) {}
  }

  function saveMergeReplenishDoneToStorage() {
    try {
      localStorage.setItem(MERGE_DONE_STORAGE_KEY, JSON.stringify(Array.from(mergeReplenishDoneBySku)));
    } catch (e) {}
  }

  /** 페이지를 새로 불러올 때마다 이전 세션 데이터를 지운다. */
  function clearYna4ReplenishLocalStorage() {
    try {
      localStorage.removeItem(WORKFLOW_TSV_STORAGE_KEY);
      localStorage.removeItem(MERGE_DONE_STORAGE_KEY);
      for (let i = 0; i < 2; i++) {
        localStorage.removeItem(WB_B64_STORAGE_PREFIX + i);
        localStorage.removeItem(WB_SHEET_STORAGE_PREFIX + i);
        localStorage.removeItem(WB_FILENAME_STORAGE_PREFIX + i);
      }
      for (let j = 2; j <= 3; j++) {
        localStorage.removeItem(WB_B64_STORAGE_PREFIX + j);
        localStorage.removeItem(WB_SHEET_STORAGE_PREFIX + j);
        localStorage.removeItem(WB_FILENAME_STORAGE_PREFIX + j);
      }
    } catch (e) {}
  }

  function idxFromEl(el) {
    const i = parseInt(el.getAttribute("data-idx"), 10);
    return Number.isFinite(i) ? i : 0;
  }

  /** !ref 범위가 빈 행·열까지 포함하는 경우가 많아, 값이 있는 셀만 보고 실제 크기를 잡는다. */
  function cellHasDisplayValue(cell) {
    if (!cell || cell.t === "z") return false;
    if (cell.v != null && cell.v !== "") {
      if (typeof cell.v === "string" && cell.v.trim() === "") return false;
      return true;
    }
    if (cell.w != null && String(cell.w).trim() !== "") return true;
    return false;
  }

  function sheetStats(sheet) {
    if (!sheet || !sheet["!ref"]) return { rows: 0, cols: 0 };
    let minR = Infinity;
    let maxR = -1;
    let minC = Infinity;
    let maxC = -1;
    for (const addr in sheet) {
      if (addr[0] === "!") continue;
      if (!cellHasDisplayValue(sheet[addr])) continue;
      const d = XLSX.utils.decode_cell(addr);
      if (d.r < minR) minR = d.r;
      if (d.r > maxR) maxR = d.r;
      if (d.c < minC) minC = d.c;
      if (d.c > maxC) maxC = d.c;
    }
    if (maxR < 0 || !Number.isFinite(minR)) return { rows: 0, cols: 0 };
    return {
      rows: maxR - minR + 1,
      cols: maxC - minC + 1
    };
  }

  function setSummary(i, msg, isErr) {
    const el = document.getElementById("summary" + i);
    if (!el) return;
    el.textContent = msg;
    el.className = "load-summary" + (isErr ? " err" : msg ? " ok" : "");
  }

  function populateSheetSelect(i, wb) {
    const strip = document.getElementById("sheetStrip" + i);
    const sel = document.getElementById("sheetSelect" + i);
    if (!strip || !sel || !wb) return;
    const names = wb.SheetNames || [];
    sel.innerHTML = "";
    names.forEach(function (n) {
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    });
    if (names.length > 1) {
      strip.classList.add("is-visible");
      strip.setAttribute("aria-hidden", "false");
    } else {
      strip.classList.remove("is-visible");
      strip.setAttribute("aria-hidden", "true");
    }
    const preferredByIndex = {
      0: "②DBeaver",
      1: "①이관현황 Data"
    };
    let pick = "";
    if (currentSheet[i] && names.indexOf(currentSheet[i]) !== -1) {
      pick = currentSheet[i];
    } else if (preferredByIndex[i] && names.indexOf(preferredByIndex[i]) !== -1) {
      pick = preferredByIndex[i];
    } else {
      pick = names[0] || "";
    }
    sel.value = pick;
    currentSheet[i] = pick;
  }

  function updateExcelSummary(i) {
    const wb = workbooks[i];
    if (!wb) {
      setSummary(i, "", false);
      return;
    }
    const name = currentSheet[i] || wb.SheetNames[0];
    const sh = wb.Sheets[name];
    const st = sheetStats(sh);
    setSummary(
      i,
      "선택 시트 「" + name + "」 · 값 있는 셀 기준 약 " + st.rows + "행 × " + st.cols + "열",
      false
    );
  }

  function bindSheetSelect(i) {
    const sel = document.getElementById("sheetSelect" + i);
    if (!sel) return;
    sel.addEventListener("change", function () {
      currentSheet[i] = sel.value;
      updateExcelSummary(i);
      persistWorkbooksToStorage();
      refreshMergePreview();
    });
  }

  /** 엑셀 복사는 줄바꿈이 \\r 만 오거나 BOM이 붙는 경우가 있어 시트·워크플로 공통으로 사용 */
  function splitPastedTsvLines(text) {
    return String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r\n|\n|\r/)
      .map(function (line) {
        return line.replace(/^\uFEFF+/, "").replace(/^\r+|\r+$/g, "");
      });
  }

  function tsvTextToRows(text) {
    const lines = splitPastedTsvLines(text);
    const rows = [];
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (line === "" && li === lines.length - 1) continue;
      rows.push(line.split("\t"));
    }
    return rows;
  }

  function syncPasteTextareaFromWorkbook(i) {
    const ta = document.getElementById("pasteSourceTsv" + i);
    if (!ta) return;
    const wb = workbooks[i];
    if (!wb) {
      ta.value = "";
      return;
    }
    try {
      const names = wb.SheetNames || [];
      const sn = (currentSheet[i] && names.indexOf(currentSheet[i]) !== -1 ? currentSheet[i] : null) || names[0] || "";
      const sh = wb.Sheets[sn];
      if (!sh) {
        ta.value = "";
        return;
      }
      let csv = XLSX.utils.sheet_to_csv(sh, { FS: "\t", RS: "\n" });
      if (csv.length && csv.charAt(csv.length - 1) === "\n") csv = csv.slice(0, -1);
      ta.value = csv;
    } catch (e) {
      ta.value = "";
    }
  }

  function applyPasteTextToSlot(i, rawText, opts) {
    opts = opts || {};
    const rows = tsvTextToRows(String(rawText || "").replace(/^\uFEFF/, ""));
    if (!rows.length) {
      workbooks[i] = null;
      currentSheet[i] = "";
      setSummary(i, "", false);
      persistWorkbooksToStorage();
      if (!opts.skipRefresh) refreshMergePreview();
      return;
    }
    try {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "붙여넣기");
      workbooks[i] = wb;
      currentSheet[i] = "붙여넣기";
      updateExcelSummary(i);
      persistWorkbooksToStorage();
      if (!opts.skipRefresh) refreshMergePreview();
    } catch (err) {
      workbooks[i] = null;
      currentSheet[i] = "";
      setSummary(i, "붙여넣기 처리 실패: " + (err.message || String(err)), true);
      persistWorkbooksToStorage();
      if (!opts.skipRefresh) refreshMergePreview();
    }
  }

  function wirePasteSlot(i) {
    const ta = document.getElementById("pasteSourceTsv" + i);
    if (!ta) return;
    let deb = null;
    function scheduleApply() {
      if (deb) clearTimeout(deb);
      deb = window.setTimeout(function () {
        deb = null;
        applyPasteTextToSlot(i, ta.value, {});
      }, 200);
    }
    ta.addEventListener("input", scheduleApply);
    ta.addEventListener("paste", function () {
      window.requestAnimationFrame(scheduleApply);
    });
  }

  function workflowTsvNonEmptyLines(text) {
    return splitPastedTsvLines(text)
      .map(function (l) {
        return l.trim();
      })
      .filter(function (l) {
        return l.length > 0;
      });
  }

  /** Unit 셀을 숫자로 해석(쉼표 제거). 실패 시 null */
  function parseWorkflowUnitNumber(unitStr) {
    const t = String(unitStr || "")
      .trim()
      .replace(/,/g, "")
      .replace(/\s/g, "");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function formatAggregatedUnitSum(n) {
    if (!Number.isFinite(n)) return "0";
    if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    const r = Math.round(n * 1000) / 1000;
    return String(r);
  }

  /** 붙여넣기 각 줄 → { sku, bc, unitStr, deadlineRaw, statusRaw } */
  function parseWorkflowRowObjects(lines) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split("\t");
      out.push({
        sku: cols.length > MERGE_SKU_WORKFLOW_COL_0 ? String(cols[MERGE_SKU_WORKFLOW_COL_0] || "").trim() : "",
        bc: cols.length > MERGE_BARCODE_WORKFLOW_COL_0 ? String(cols[MERGE_BARCODE_WORKFLOW_COL_0] || "").trim() : "",
        unitStr: cols.length > MERGE_UNIT_WORKFLOW_COL_0 ? String(cols[MERGE_UNIT_WORKFLOW_COL_0] || "").trim() : "",
        deadlineRaw:
          cols.length > MERGE_DEADLINE_WORKFLOW_COL_0
            ? String(cols[MERGE_DEADLINE_WORKFLOW_COL_0] || "").trim()
            : "",
        statusRaw:
          cols.length > MERGE_STATUS_WORKFLOW_COL_0
            ? String(cols[MERGE_STATUS_WORKFLOW_COL_0] || "").trim()
            : ""
      });
    }
    return out;
  }

  /**
   * SKU ID 기준 중복 제거(첫 등장 순서 유지).
   * Unit: 한 SKU 그룹 안에서 숫자만 합산; 숫자가 하나도 없으면 합쳐진 행 수.
   * Barcode·보충기한(I=9)·상태(J=10): 그룹에서 비어 있지 않은 첫 값.
   */
  function aggregateWorkflowRowsBySkuId(rows) {
    const order = [];
    const map = new Map();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const skuNorm = normalizeSkuJoinKey(r.sku);
      const key = skuNorm === "" ? "__EMPTY_SKU__" : skuNorm;
      if (!map.has(key)) {
        map.set(key, {
          sku: key === "__EMPTY_SKU__" ? "" : r.sku,
          barcode: r.bc,
          deadlineRaw: "",
          workflowStatus: "",
          unitSum: 0,
          hadNumeric: false,
          rowCount: 0
        });
        order.push(key);
      }
      const e = map.get(key);
      e.rowCount += 1;
      if (!e.barcode && r.bc) e.barcode = r.bc;
      if (!e.deadlineRaw && r.deadlineRaw) e.deadlineRaw = r.deadlineRaw;
      if (!e.workflowStatus && r.statusRaw) e.workflowStatus = r.statusRaw;
      const num = parseWorkflowUnitNumber(r.unitStr);
      if (num !== null) {
        e.unitSum += num;
        e.hadNumeric = true;
      }
    }
    return order.map(function (key) {
      const e = map.get(key);
      const unitDisplay = e.hadNumeric ? formatAggregatedUnitSum(e.unitSum) : String(e.rowCount);
      return {
        sku: e.sku,
        barcode: e.barcode || "",
        unit: unitDisplay,
        unitNumeric: e.hadNumeric ? e.unitSum : null,
        deadlineRaw: e.deadlineRaw || "",
        workflowStatus: e.workflowStatus || ""
      };
    });
  }

  /** SLA D열·진열대기 A열 GC를 같은 값으로 맞추기(공백·NBSP·대소문자 차이로 조인 실패 방지). 표시용 원문은 그대로 둠. */
  function normalizeMergeGcKey(v) {
    if (v == null || v === "") return "";
    let s = String(v).replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ");
    return s.toUpperCase();
  }

  /**
   * 워크플로 SKU ↔ SLA G열 조인용 키 (공백·NBSP 정리, 순수 숫자 SKU는 쉼표 제거 후 정수 문자열로 통일).
   */
  function normalizeSkuJoinKey(v) {
    let s = String(v != null ? v : "")
      .replace(/^\uFEFF+/, "")
      .replace(/\u200b|\u200c|\u200d|\ufeff/g, "")
      .replace(/\u00a0/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    if (s.length >= 2 && s.charCodeAt(0) === 34 && s.charCodeAt(s.length - 1) === 34) {
      s = s.slice(1, -1).trim().replace(/\s+/g, " ");
    }
    if (s === "") return "";
    const noComma = s.replace(/,/g, "");
    const n = Number(noComma);
    if (noComma !== "" && Number.isFinite(n) && String(n) === noComma) {
      return String(Math.trunc(n));
    }
    return s;
  }

  function slaHeaderRowSkipCount(rows) {
    if (!rows || !rows.length) return 0;
    const row = rows[0];
    if (!Array.isArray(row)) return 0;
    const cell = normalizeSkuJoinKey(
      String(row[SLA_SKU_COL_0] != null ? row[SLA_SKU_COL_0] : "").replace(/\u00a0/g, " ")
    );
    const u = cell.toUpperCase();
    if (!cell) return 0;
    if (u === "SKU" || u === "SKU ID" || u.indexOf("SKU") === 0) return 1;
    return 0;
  }

  function stateHeaderRowSkipCount(rows) {
    if (!rows || !rows.length) return 0;
    const row = rows[0];
    if (!Array.isArray(row)) return 0;
    const a = String(row[PENDING_GC_MATCH_COL_0] != null ? row[PENDING_GC_MATCH_COL_0] : "")
      .replace(/\u00a0/g, " ")
      .trim();
    const u = normalizeMergeGcKey(a);
    if (u === "GC" || u === "G.C" || a.toUpperCase() === "GC CODE") return 1;
    return 0;
  }

  /**
   * SLA 선택 시트: G열 SKU → 같은 행 D=GC, J=상품명, O=온도대, P=수량.
   * 같은 SKU는 여러 GC 엔트리를 배열(`entries`)로 수집 후 수량 내림차순 정렬.
   * 같은 SKU 안에서 같은 GC(정규화 기준)가 여러 번 나오면 **수량을 합산**하여 한 엔트리로 병합.
   * 하위 호환: 그룹 객체의 `gc`·`productName`·`tempZone`·`qty`는 수량 최대 엔트리(=entries[0]) 값으로 설정.
   * Barcode(I) 매칭: 해당 SKU 그룹을 그대로 alias로 공유.
   */
  function buildSlaSkuLookupMap() {
    const map = new Map();
    const bcAlias = new Map();
    const wb = workbooks[SLA_WB_INDEX];
    if (!wb || !wb.SheetNames || !wb.SheetNames.length) return map;
    const sn = currentSheet[SLA_WB_INDEX] || wb.SheetNames[0];
    const sh = wb.Sheets[sn];
    if (!sh || !sh["!ref"]) return map;
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "", raw: false });
    const skip = slaHeaderRowSkipCount(rows);
    for (let r = skip; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const skuRaw = String(row[SLA_SKU_COL_0] != null ? row[SLA_SKU_COL_0] : "").trim();
      const skuKey = normalizeSkuJoinKey(skuRaw);
      if (!skuKey) continue;
      const gc = String(row[SLA_GC_COL_0] != null ? row[SLA_GC_COL_0] : "").trim();
      const pname = String(row[SLA_PRODUCT_NAME_COL_0] != null ? row[SLA_PRODUCT_NAME_COL_0] : "").trim();
      const tempZone = String(row[SLA_TEMP_ZONE_COL_0] != null ? row[SLA_TEMP_ZONE_COL_0] : "").trim();
      const qtyRaw = String(row[SLA_QTY_COL_0] != null ? row[SLA_QTY_COL_0] : "").trim();
      const qtyNum = parseWorkflowUnitNumber(qtyRaw);
      if (!map.has(skuKey)) map.set(skuKey, { entries: [], _byGc: new Map() });
      const grp = map.get(skuKey);
      const gcDedupKey = normalizeMergeGcKey(gc);
      if (grp._byGc.has(gcDedupKey)) {
        const existing = grp._byGc.get(gcDedupKey);
        if (Number.isFinite(qtyNum)) {
          existing.qty = (Number.isFinite(existing.qty) ? existing.qty : 0) + qtyNum;
        }
        if (!existing.productName && pname) existing.productName = pname;
        if (!existing.tempZone && tempZone) existing.tempZone = tempZone;
      } else {
        const ent = { gc: gc, productName: pname, tempZone: tempZone, qty: qtyNum };
        grp._byGc.set(gcDedupKey, ent);
        grp.entries.push(ent);
      }
      const bcRaw = String(row[SLA_BARCODE_COL_0] != null ? row[SLA_BARCODE_COL_0] : "").trim();
      const bcKey = normalizeSkuJoinKey(bcRaw);
      if (bcKey && bcKey !== skuKey && !bcAlias.has(bcKey) && !map.has(bcKey)) {
        bcAlias.set(bcKey, skuKey);
      }
    }
    map.forEach(function (grp) {
      grp.entries.sort(function (a, b) {
        const qa = Number.isFinite(a.qty) ? a.qty : -Infinity;
        const qb = Number.isFinite(b.qty) ? b.qty : -Infinity;
        return qb - qa;
      });
      const p = grp.entries[0] || { gc: "", productName: "", tempZone: "", qty: null };
      grp.gc = p.gc;
      grp.productName = p.productName;
      grp.tempZone = p.tempZone;
      grp.qty = p.qty;
      delete grp._byGc;
    });
    bcAlias.forEach(function (skuKey, bcKey) {
      if (!map.has(bcKey) && map.has(skuKey)) map.set(bcKey, map.get(skuKey));
    });
    return map;
  }

  /**
   * 워크플로 Unit 대비 SLA 수량 누적으로 표시할 엔트리 목록을 산출.
   * 정책: 누적이 Unit에 도달할 때까지 GC 추가. 초과하는 마지막 GC도 포함. 수량 내림차순(entries는 이미 정렬됨).
   * ⑨번(GC 없음·RCRT1)에 해당하는 SLA 줄의 P 수량은 누적에 포함하지 않음. RCRT2는 포함.
   * Unit 숫자가 없으면(= rowCount 기반) 첫 엔트리만 반환(기존 동작 유지).
   * 누적 제외 대상(⑨)만 있는 경우, 전 엔트리를 탐색해도 Unit을 채울 수 없으면 첫 엔트리만 반환.
   */
  function resolveSlaEntriesForUnit(slaGroup, unitNumeric) {
    if (!slaGroup || !slaGroup.entries || !slaGroup.entries.length) return [];
    const entries = slaGroup.entries;
    if (entries.length === 1) return [entries[0]];
    if (!Number.isFinite(unitNumeric) || unitNumeric <= 0) return [entries[0]];
    const out = [];
    let cum = 0;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      out.push(e);
      if (mergeGcSlaQtyExcludedFromEtcDash9(e.gc)) continue;
      const q = Number.isFinite(e.qty) ? e.qty : 0;
      cum += q;
      if (cum >= unitNumeric) break;
    }
    if (cum < unitNumeric && out.length === entries.length) {
      const onlyEtcDash9Gc = entries.every(function (e) {
        return mergeGcSlaQtyExcludedFromEtcDash9(e.gc);
      });
      if (onlyEtcDash9Gc) return [entries[0]];
    }
    return out;
  }

  /** A열 GC → B·H·I·K·L (통합 상태 붙여넣기: 진열대기·진열중·이동중 동일 열 가정, GC당 첫 행). */
  function buildGcSheetLookupMap(wbIndex) {
    const map = new Map();
    const wb = workbooks[wbIndex];
    if (!wb || !wb.SheetNames || !wb.SheetNames.length) return map;
    const sn = currentSheet[wbIndex] || wb.SheetNames[0];
    const sh = wb.Sheets[sn];
    if (!sh || !sh["!ref"]) return map;
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: "", raw: false });
    const skip = stateHeaderRowSkipCount(rows);
    for (let r = skip; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const gcKey = normalizeMergeGcKey(row[PENDING_GC_MATCH_COL_0] != null ? row[PENDING_GC_MATCH_COL_0] : "");
      if (!gcKey) continue;
      const priority = String(row[PENDING_PRIORITY_COL_0] != null ? row[PENDING_PRIORITY_COL_0] : "").trim();
      const ct = String(row[PENDING_CT_COL_0] != null ? row[PENDING_CT_COL_0] : "").trim();
      const status = String(row[PENDING_STATUS_COL_0] != null ? row[PENDING_STATUS_COL_0] : "").trim();
      const vehicle = String(row[PENDING_VEHICLE_COL_0] != null ? row[PENDING_VEHICLE_COL_0] : "").trim();
      const unloadRaw = row[PENDING_UNLOAD_COL_0];
      if (!map.has(gcKey))
        map.set(gcKey, {
          ct: ct,
          priority: priority,
          status: status,
          vehicle: vehicle,
          unloadRaw: unloadRaw
        });
    }
    return map;
  }

  function buildPendingGcLookupMap() {
    return buildGcSheetLookupMap(PENDING_WB_INDEX);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function parseUnloadDateTime(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date && !isNaN(v.getTime())) return v;
    if (typeof v === "number" && Number.isFinite(v)) {
      const d = new Date((v - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) return d;
    }
    const str = String(v).trim();
    if (!str) return null;
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
    return null;
  }

  /** 보충기한 셀에 상태 문구가 잘못 들어온 경우(열 착각) 표시 제외 */
  function workflowDeadlineRawIsLikelyStatusNotTime(s) {
    const t = String(s != null ? s : "").trim();
    if (!t) return false;
    if (/\d{1,2}\s*:\s*\d{2}/.test(t)) return false;
    if (/\d{4}[-/]\d/.test(t)) return false;
    return /재고|부족|결품|품절|단종|쿠팡배송/i.test(t);
  }

  /** 하차시간·워크플로 보충기한(I=9열): 시:분만, 로컬 24시간 형식(00:00~23:59). */
  function formatUnloadTimeDisplay(raw) {
    const d = parseUnloadDateTime(raw);
    if (!d) {
      const s = raw != null && raw !== "" ? String(raw).trim() : "";
      return { text: s, parsed: false };
    }
    const h = d.getHours();
    const m = d.getMinutes();
    return { text: pad2(h) + ":" + pad2(m), parsed: true };
  }

  function mergeStatusSummaryBucketFromDeadlineRaw(deadlineRaw) {
    const safeRaw = workflowDeadlineRawIsLikelyStatusNotTime(deadlineRaw) ? "" : deadlineRaw;
    const disp = formatUnloadTimeDisplay(safeRaw);
    const t = String(disp.text || "").trim();
    if (!t) return { label: "미지정", sortRank: 2, sortValue: Number.POSITIVE_INFINITY };
    const m = t.match(/^(\d{1,2})\s*:\s*(\d{2})$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      if (Number.isFinite(h) && Number.isFinite(mm) && h >= 0 && h <= 23 && mm >= 0 && mm <= 59) {
        return {
          label: pad2(h) + ":" + pad2(mm),
          sortRank: 0,
          sortValue: h * 60 + mm
        };
      }
    }
    return { label: t, sortRank: 1, sortValue: Number.POSITIVE_INFINITY };
  }

  /** 대시보드 행 정렬: 보충기한 오름차순(더 이른·짧게 남은 쪽 우선). 파싱 실패 시 맨 아래로. */
  function resolveMergeRowReplenishDeadlineSortKey(workflowRow) {
    const raw = workflowRow && workflowRow.deadlineRaw;
    if (workflowDeadlineRawIsLikelyStatusNotTime(raw)) return Number.POSITIVE_INFINITY;
    const d = parseUnloadDateTime(raw);
    if (d && !isNaN(d.getTime())) return d.getTime();
    const bucket = mergeStatusSummaryBucketFromDeadlineRaw(raw);
    return Number.isFinite(bucket.sortValue) ? bucket.sortValue : Number.POSITIVE_INFINITY;
  }

  function mergeStatusSummaryTempInfoFromSlaEntry(slaEnt) {
    if (!slaEnt) {
      return { label: "미지정", order: 99 };
    }
    const tz = formatTempZoneCell(slaEnt.tempZone);
    const key = String(tz.filterKey || "");
    if (key === "FROZEN") return { label: "FROZEN", order: 1 };
    if (key === "CHILLED") return { label: "CHILLED", order: 2 };
    if (key === "AMBIENT") return { label: "AMBIENT", order: 3 };
    if (key === "RM") return { label: "RM", order: 4 };
    if (key === "OTHER") return { label: String(tz.display || "기타"), order: 5 };
    return { label: "미지정", order: 99 };
  }

  function mergeStatusSummaryKey(statusText) {
    const t = String(statusText || "").trim();
    if (t === "진열대기") return "waiting";
    if (t === "이동중") return "moving";
    return "";
  }

  function renderMergeTimeStatusSummary(summaryRowsByKey, deadlineMetaByLabel) {
    const thead = document.getElementById("mergeTimeStatusSummaryThead");
    const tbody = document.getElementById("mergeTimeStatusSummaryTbody");
    if (!thead || !tbody) return;
    thead.innerHTML = "";
    tbody.innerHTML = "";
    const rowKeys = Object.keys(summaryRowsByKey || {});
    const deadlineLabels = Object.keys(deadlineMetaByLabel || {}).sort(function (a, b) {
      const aa = deadlineMetaByLabel[a] || {};
      const bb = deadlineMetaByLabel[b] || {};
      const ra = aa.sortRank != null ? aa.sortRank : 9;
      const rb = bb.sortRank != null ? bb.sortRank : 9;
      if (ra !== rb) return ra - rb;
      const va = Number.isFinite(aa.sortValue) ? aa.sortValue : Number.POSITIVE_INFINITY;
      const vb = Number.isFinite(bb.sortValue) ? bb.sortValue : Number.POSITIVE_INFINITY;
      if (va !== vb) return va - vb;
      return String(a).localeCompare(String(b), undefined, { numeric: true });
    });
    if (!rowKeys.length || !deadlineLabels.length) {
      const trh = document.createElement("tr");
      ["구분", "유닛수"].forEach(function (h) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = h;
        trh.appendChild(th);
      });
      thead.appendChild(trh);
      const trEmpty = document.createElement("tr");
      const tdEmpty = document.createElement("td");
      tdEmpty.colSpan = 2;
      tdEmpty.textContent = "집계할 데이터 없음";
      trEmpty.appendChild(tdEmpty);
      tbody.appendChild(trEmpty);
      return;
    }

    const trHeader = document.createElement("tr");
    const thLabel = document.createElement("th");
    thLabel.scope = "col";
    thLabel.textContent = "구분";
    trHeader.appendChild(thLabel);
    for (let d = 0; d < deadlineLabels.length; d++) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = deadlineLabels[d];
      trHeader.appendChild(th);
    }
    const thTotal = document.createElement("th");
    thTotal.scope = "col";
    thTotal.textContent = "합계";
    trHeader.appendChild(thTotal);
    thead.appendChild(trHeader);

    const orderedRows = rowKeys.slice().sort(function (a, b) {
      const ra = summaryRowsByKey[a] || {};
      const rb = summaryRowsByKey[b] || {};
      const ta = ra.tempOrder != null ? ra.tempOrder : 99;
      const tb = rb.tempOrder != null ? rb.tempOrder : 99;
      if (ta !== tb) return ta - tb;
      const sa = ra.statusOrder != null ? ra.statusOrder : 99;
      const sb = rb.statusOrder != null ? rb.statusOrder : 99;
      if (sa !== sb) return sa - sb;
      return String(ra.label || a).localeCompare(String(rb.label || b), undefined, { numeric: true });
    });

    const colTotals = {};
    for (let d = 0; d < deadlineLabels.length; d++) {
      colTotals[deadlineLabels[d]] = 0;
    }
    let grandTotal = 0;

    for (let i = 0; i < orderedRows.length; i++) {
      const rowKey = orderedRows[i];
      const row = summaryRowsByKey[rowKey] || {};
      const tr = document.createElement("tr");
      const tdLabel = document.createElement("td");
      tdLabel.textContent = row.label || rowKey;
      tr.appendChild(tdLabel);
      let rowTotal = 0;
      for (let d = 0; d < deadlineLabels.length; d++) {
        const ddl = deadlineLabels[d];
        const n = Number((row.byDeadline && row.byDeadline[ddl]) || 0);
        rowTotal += n;
        colTotals[ddl] += n;
        const td = document.createElement("td");
        td.textContent = formatAggregatedUnitSum(n);
        tr.appendChild(td);
      }
      grandTotal += rowTotal;
      const tdRowTotal = document.createElement("td");
      tdRowTotal.textContent = formatAggregatedUnitSum(rowTotal);
      tr.appendChild(tdRowTotal);
      tbody.appendChild(tr);
    }

    const trTotal = document.createElement("tr");
    const tdTotalLabel = document.createElement("td");
    tdTotalLabel.textContent = "합계";
    trTotal.appendChild(tdTotalLabel);
    for (let d = 0; d < deadlineLabels.length; d++) {
      const ddl = deadlineLabels[d];
      const td = document.createElement("td");
      td.textContent = formatAggregatedUnitSum(colTotals[ddl] || 0);
      trTotal.appendChild(td);
    }
    const tdGrandTotal = document.createElement("td");
    tdGrandTotal.textContent = formatAggregatedUnitSum(grandTotal);
    trTotal.appendChild(tdGrandTotal);
    tbody.appendChild(trTotal);
  }

  function copyTextToClipboard(text) {
    const s = String(text || "");
    if (!s) return Promise.resolve(false);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(s).then(
        function () {
          return true;
        },
        function () {
          return false;
        }
      );
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return Promise.resolve(ok);
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  /** Teams·Outlook 등: text/html + text/plain 동시 제공 시 표로 붙여넣기 되는 경우가 많음 */
  function copyHtmlPlainToClipboard(innerBodyHtml, plainText) {
    const plain = String(plainText || "");
    const inner = String(innerBodyHtml || "");
    if (!inner && !plain) return Promise.resolve(false);
    const fullHtml =
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body>" + inner + "</body></html>";
    if (navigator.clipboard && typeof ClipboardItem === "function") {
      try {
        const item = new ClipboardItem({
          "text/html": new Blob([fullHtml], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" })
        });
        return navigator.clipboard.write([item]).then(
          function () {
            return true;
          },
          function () {
            return plain ? copyTextToClipboard(plain) : Promise.resolve(false);
          }
        );
      } catch (e) {
        return plain ? copyTextToClipboard(plain) : Promise.resolve(false);
      }
    }
    return plain ? copyTextToClipboard(plain) : Promise.resolve(false);
  }

  function escapeHtmlForClipboard(s) {
    return String(s != null ? s : "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * 팀즈 복사 공통: 한 표에서 (완료 열 제외·GC 빈 행 제외) 헤더·데이터 셀 문자열.
   * @returns {{ headerCells: string[]|null, dataRows: string[][] }|null}
   */
  function getMergeTableCopyData(table) {
    if (!table) return null;
    const idxDoneCol = MERGE_TABLE_HEADERS.indexOf("완료");
    const idxGc = MERGE_TABLE_HEADERS.indexOf("GC");
    const tbody = table.querySelector("tbody");
    const dataRows = [];
    if (tbody) {
      const trs = tbody.querySelectorAll("tr");
      for (let i = 0; i < trs.length; i++) {
        const tr = trs[i];
        if (tr.style.display === "none") continue;
        const doneCb = tr.querySelector('input[type="checkbox"]');
        if (doneCb && doneCb.checked) continue;
        const tds = tr.querySelectorAll("td");
        if (idxGc >= 0) {
          if (tds.length <= idxGc) continue;
          const gcText = mergePreviewCellTextForSheetsTsv(tds[idxGc]);
          if (!gcText) continue;
        }
        const cells = [];
        for (let j = 0; j < tds.length; j++) {
          if (idxDoneCol >= 0 && j === idxDoneCol) continue;
          cells.push(mergePreviewCellTextForSheetsTsv(tds[j]));
        }
        dataRows.push(cells);
      }
    }
    if (!dataRows.length) return null;
    let headerCells = null;
    const thRow = table.querySelector("thead tr");
    if (thRow) {
      const headers = [];
      const ths = thRow.querySelectorAll("th");
      for (let h = 0; h < ths.length; h++) {
        if (idxDoneCol >= 0 && h === idxDoneCol) continue;
        let t = ths[h].textContent != null ? String(ths[h].textContent) : "";
        t = t.replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
        headers.push(t);
      }
      if (headers.length) headerCells = headers;
    }
    return { headerCells: headerCells, dataRows: dataRows };
  }

  function gatherMergeCopySectionsList() {
    const sections = [];
    const grid = document.getElementById("mergeDashboardsGrid");
    if (grid) {
      for (let d = 1; d <= 9; d++) {
        const table = document.getElementById("mergePreviewTable" + d);
        const title = getMergeDashboardSectionTitle(d);
        const dat = getMergeTableCopyData(table);
        if (dat) sections.push({ title: title, headerCells: dat.headerCells, dataRows: dat.dataRows });
      }
    } else {
      const table = document.getElementById("mergePreviewTable");
      const dat = getMergeTableCopyData(table);
      if (dat) sections.push({ title: "", headerCells: dat.headerCells, dataRows: dat.dataRows });
    }
    return sections;
  }

  /** 대시보드 번호 1~9 중 지정한 패널만(팀즈 분할 복사). 레거시 단일 표면 전체와 동일. */
  function gatherMergeCopySectionsListForDashboardIds(dashboardIds) {
    const grid = document.getElementById("mergeDashboardsGrid");
    if (!grid) return gatherMergeCopySectionsList();
    const want = {};
    for (let i = 0; i < dashboardIds.length; i++) want[dashboardIds[i]] = true;
    const sections = [];
    for (let d = 1; d <= 9; d++) {
      if (!want[d]) continue;
      const table = document.getElementById("mergePreviewTable" + d);
      const title = getMergeDashboardSectionTitle(d);
      const dat = getMergeTableCopyData(table);
      if (dat) sections.push({ title: title, headerCells: dat.headerCells, dataRows: dat.dataRows });
    }
    return sections;
  }

  function buildMergeCopyTsvLinesFromSections(sections) {
    const lines = [];
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      if (sec.title) lines.push("# " + sec.title);
      if (sec.headerCells && sec.headerCells.length) lines.push(sec.headerCells.join("\t"));
      for (let r = 0; r < sec.dataRows.length; r++) {
        lines.push(sec.dataRows[r].join("\t"));
      }
      if (sec.title) lines.push("");
    }
    return lines;
  }

  function buildTeamsHtmlFromSections(sections) {
    const parts = [];
    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];
      if (sec.title) {
        parts.push(
          "<p style=\"margin:10px 0 4px 0;font-weight:700;font-family:Segoe UI,Arial,sans-serif;font-size:13px;\">" +
            escapeHtmlForClipboard(sec.title) +
            "</p>"
        );
      }
      parts.push(
        "<table cellpadding=\"4\" cellspacing=\"0\" style=\"border-collapse:collapse;border:1px solid #64748b;margin-bottom:14px;font-family:Segoe UI,Arial,sans-serif;font-size:12px;\">"
      );
      if (sec.headerCells && sec.headerCells.length) {
        parts.push("<thead><tr>");
        for (let h = 0; h < sec.headerCells.length; h++) {
          parts.push(
            "<th style=\"background:#e2e8f0;border:1px solid #94a3b8;padding:4px 8px;text-align:left;\">" +
              escapeHtmlForClipboard(sec.headerCells[h]) +
              "</th>"
          );
        }
        parts.push("</tr></thead>");
      }
      parts.push("<tbody>");
      for (let r = 0; r < sec.dataRows.length; r++) {
        parts.push("<tr>");
        for (let c = 0; c < sec.dataRows[r].length; c++) {
          parts.push(
            "<td style=\"border:1px solid #cbd5e1;padding:4px 8px;vertical-align:top;\">" +
              escapeHtmlForClipboard(sec.dataRows[r][c]) +
              "</td>"
          );
        }
        parts.push("</tr>");
      }
      parts.push("</tbody></table>");
    }
    return parts.join("");
  }

  /** 대시보드 표 → TSV 한 셀(탭/줄바꿈 제거). 구글 시트용 복사에서는 완료 열 제외. */
  function mergePreviewCellTextForSheetsTsv(td) {
    const cb = td.querySelector && td.querySelector('input[type="checkbox"]');
    if (cb) return cb.checked ? "TRUE" : "FALSE";
    let s = td.textContent != null ? String(td.textContent) : "";
    s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    s = s.replace(/\t/g, " ");
    s = s.replace(/\n/g, " ");
    return s.trim();
  }

  /** 인쇄/PDF: GC 있는 보이는 행만, 페이지당 이 줄 수(고정 행높이 기준)로 잘라 출력 */
  const MERGE_PRINT_ROWS_PER_PAGE = 14;
  const MERGE_PRINT_CHUNK_HOST_ID = "yna4MergePrintChunkHost";
  const MERGE_PRINT_HIDE_ORIGINAL_TABLE_CLASS = "yna4-merge-hidden-for-print-pages";

  /**
   * 인쇄 청크 표 <colgroup> 너비 (14개 열, MERGE_TABLE_HEADERS 순서와 일치).
   * table-layout: fixed 에서 첫 행이 제목(colspan) 일 때도 열 폭을 균일하게 고정.
   * 인쇄에서 숨기는 열(보충기한=13, 완료=14)은 0 으로 둔다(CSS display:none 과 함께).
   */
  const MERGE_PRINT_COL_WIDTHS = [
    "5%",    // 1 SKU ID
    "10%",   // 2 Barcode
    "3%",    // 3 보충수량
    "3%",    // 4 GC재고
    "24%",   // 5 상품명
    "9%",    // 6 GC
    "16%",   // 7 CT
    "6%",    // 8 우선순위
    "4.2%",  // 9 온도대
    "5%",    // 10 차량번호
    "6%",    // 11 하차시간
    "4%",    // 12 상태
    "0",     // 13 보충기한 (인쇄 숨김)
    "0"      // 14 완료 (인쇄 숨김)
  ];

  function ensureMergePrintChunkHostElement(anchorEl) {
    if (!anchorEl || !anchorEl.parentElement) return null;
    let host = document.getElementById(MERGE_PRINT_CHUNK_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = MERGE_PRINT_CHUNK_HOST_ID;
      host.setAttribute("aria-hidden", "true");
      anchorEl.parentElement.appendChild(host);
    }
    return host;
  }

  const MERGE_DASHBOARD_PRINT_TITLES = [
    "① CHILLED — 10·15구 (프리팩)",
    "② CHILLED — [SR]",
    "③ CHILLED — 20·25·30구 (반숙·반숙란 제외)",
    "④ CHILLED — ①②③ 제외 나머지",
    "⑤ AMBIENT — 상품명 [팩]·수박",
    "⑥ AMBIENT — ⑤ 제외 나머지",
    "⑦ FROZEN — 전체",
    "⑧ RM — GC 있음 · 온도대 미지정",
    "⑨ ETC — GC 없음 · RCRT1"
  ];
  // 주: RCRT1은 정확 매칭(RCRT18/RCRT10 등은 제외). HTML 패널 타이틀과 일치.

  /** 복사·인쇄 섹션 제목: HTML `#mergeDashTitle{n}` 우선(수정 반영), 없으면 MERGE_DASHBOARD_PRINT_TITLES */
  function getMergeDashboardSectionTitle(dashboardIndex1) {
    const el = document.getElementById("mergeDashTitle" + dashboardIndex1);
    if (el) {
      const t = String(el.textContent != null ? el.textContent : "")
        .replace(/\r?\n/g, " ")
        .trim();
      if (t) return t;
    }
    return String(MERGE_DASHBOARD_PRINT_TITLES[dashboardIndex1 - 1] || "").trim();
  }

  function collectMergePrintRowsFromTbody(tbody) {
    const rows = [];
    if (!tbody) return rows;
    const gcCol = MERGE_TABLE_HEADERS.indexOf("GC") + 1;
    const trs = tbody.querySelectorAll("tr");
    for (let i = 0; i < trs.length; i++) {
      const tr = trs[i];
      if (tr.style.display === "none") continue;
      const doneCb = tr.querySelector('input[type="checkbox"]');
      if (doneCb && doneCb.checked) continue;
      if (gcCol > 0) {
        const td = tr.querySelector("td:nth-child(" + gcCol + ")");
        const gcText = td ? mergePreviewCellTextForSheetsTsv(td) : "";
        if (!String(gcText || "").trim()) continue;
      }
      rows.push(tr);
    }
    return rows;
  }

  function prepareMergePrintPagedTables() {
    const grid = document.getElementById("mergeDashboardsGrid");
    const anchor = grid || document.getElementById("mergePreviewTable");
    if (!anchor) return;
    const host = ensureMergePrintChunkHostElement(anchor);
    if (!host) return;
    host.innerHTML = "";

    /**
     * 인쇄: 페이지당 행 슬롯 MERGE_PRINT_ROWS_PER_PAGE 고정.
     * 제목은 caption 아님 tbody 첫 tr(한 td colspan) — 첫 페이지만 제목 1행 + 데이터 (슬롯-1)행, 이후 페이지는 데이터 슬롯만.
     * sectionTitleText: MERGE_DASHBOARD_PRINT_TITLES 등 고정 문자열.
     */
    function appendChunksForRows(rows, tableClassName, parentEl, sectionTitleText) {
      const mount = parentEl || host;
      const titleText = sectionTitleText != null ? String(sectionTitleText).trim() : "";
      const slot = MERGE_PRINT_ROWS_PER_PAGE;
      const colCount =
        rows.length && rows[0].querySelectorAll
          ? rows[0].querySelectorAll("td").length
          : MERGE_TABLE_HEADERS.length;
      let start = 0;
      let chunkIndex = 0;
      while (start < rows.length) {
        const pageWrap = document.createElement("div");
        pageWrap.className = "yna4-merge-print-page-chunk";
        const tbl = document.createElement("table");
        tbl.className = tableClassName || "merge-table";
        const colg = document.createElement("colgroup");
        for (let c = 0; c < MERGE_PRINT_COL_WIDTHS.length; c++) {
          const col = document.createElement("col");
          col.style.width = MERGE_PRINT_COL_WIDTHS[c];
          colg.appendChild(col);
        }
        tbl.appendChild(colg);
        const tb = document.createElement("tbody");
        let dataSlots = slot;
        if (titleText && chunkIndex === 0) {
          const trT = document.createElement("tr");
          trT.className = "yna4-merge-print-title-row";
          const tdT = document.createElement("td");
          tdT.colSpan = colCount;
          tdT.textContent = titleText;
          trT.appendChild(tdT);
          tb.appendChild(trT);
          dataSlots = slot - 1;
        }
        const end = Math.min(start + dataSlots, rows.length);
        for (let j = start; j < end; j++) {
          tb.appendChild(rows[j].cloneNode(true));
        }
        start = end;
        tbl.appendChild(tb);
        pageWrap.appendChild(tbl);
        mount.appendChild(pageWrap);
        chunkIndex += 1;
      }
    }

    let any = false;
    if (grid) {
      for (let d = 1; d <= 9; d++) {
        const table = document.getElementById("mergePreviewTable" + d);
        const tbody = table ? table.querySelector("tbody") : null;
        const rows = collectMergePrintRowsFromTbody(tbody);
        if (!rows.length) continue;
        any = true;
        const dashBlock = document.createElement("div");
        dashBlock.className = "yna4-merge-print-dash-block";
        host.appendChild(dashBlock);
        const printTitle = String(MERGE_DASHBOARD_PRINT_TITLES[d - 1] || "").trim() || "대시보드 " + d;
        appendChunksForRows(rows, table ? table.className : "merge-table", dashBlock, printTitle);
      }
    } else {
      const table = document.getElementById("mergePreviewTable");
      const tbody = table ? table.querySelector("tbody") : null;
      if (!tbody) {
        if (table) table.classList.remove(MERGE_PRINT_HIDE_ORIGINAL_TABLE_CLASS);
        return;
      }
      const rows = collectMergePrintRowsFromTbody(tbody);
      if (!rows.length) {
        if (table) table.classList.remove(MERGE_PRINT_HIDE_ORIGINAL_TABLE_CLASS);
        return;
      }
      any = true;
      const dashBlock = document.createElement("div");
      dashBlock.className = "yna4-merge-print-dash-block";
      host.appendChild(dashBlock);
      appendChunksForRows(rows, table ? table.className : "merge-table", dashBlock, "보충 현황");
    }

    if (!any) {
      if (grid) grid.classList.remove(MERGE_PRINT_HIDE_ORIGINAL_TABLE_CLASS);
      else {
        const t = document.getElementById("mergePreviewTable");
        if (t) t.classList.remove(MERGE_PRINT_HIDE_ORIGINAL_TABLE_CLASS);
      }
      return;
    }
    const chunksAll = host.querySelectorAll(".yna4-merge-print-page-chunk");
    if (chunksAll.length) {
      chunksAll[chunksAll.length - 1].classList.add("yna4-merge-print-page-chunk--last-doc");
    }
    if (grid) grid.classList.add(MERGE_PRINT_HIDE_ORIGINAL_TABLE_CLASS);
    else {
      const t = document.getElementById("mergePreviewTable");
      if (t) t.classList.add(MERGE_PRINT_HIDE_ORIGINAL_TABLE_CLASS);
    }
  }

  function restoreMergePrintPagedTables() {
    const grid = document.getElementById("mergeDashboardsGrid");
    if (grid) grid.classList.remove(MERGE_PRINT_HIDE_ORIGINAL_TABLE_CLASS);
    const table = document.getElementById("mergePreviewTable");
    if (table) table.classList.remove(MERGE_PRINT_HIDE_ORIGINAL_TABLE_CLASS);
    const host = document.getElementById(MERGE_PRINT_CHUNK_HOST_ID);
    if (host) host.innerHTML = "";
  }

  window.addEventListener("beforeprint", prepareMergePrintPagedTables);
  window.addEventListener("afterprint", restoreMergePrintPagedTables);

  function copyMergePreviewForTeamsSlice(btn, labelRest, dashboardIds) {
    function flashButton(ok, empty) {
      if (!btn) return;
      btn.textContent = empty ? "복사할 내용 없음" : ok ? "복사됨" : "복사 실패";
      window.setTimeout(function () {
        btn.textContent = labelRest;
      }, empty ? 2200 : 1600);
    }

    const sections = gatherMergeCopySectionsListForDashboardIds(dashboardIds);
    if (!sections.length) {
      flashButton(false, true);
      return;
    }
    const plainTsv = buildMergeCopyTsvLinesFromSections(sections).join("\n").trim();
    const innerHtml = buildTeamsHtmlFromSections(sections);
    if (!plainTsv && !innerHtml) {
      flashButton(false, true);
      return;
    }
    copyHtmlPlainToClipboard(innerHtml, plainTsv).then(function (ok) {
      flashButton(ok, false);
    });
  }

  /** 통합 상태 시트 K열 차량번호 — SLA 대표(gc) 기준 (다른 호출 호환용). */
  function resolveVehicleForMergeRow(row, slaLookup, stateGcLookup) {
    const skuKey = normalizeSkuJoinKey(row.sku);
    const slaGrp = skuKey && slaLookup.has(skuKey) ? slaLookup.get(skuKey) : null;
    return resolveVehicleForMergeSlaEnt(slaGrp, stateGcLookup);
  }

  /** 해당 표시 줄의 SLA GC → 통합 상태 K열 차량번호(정렬 보조키). SLA 없음이면 빈 문자열. */
  function resolveVehicleForMergeSlaEnt(slaEnt, stateGcLookup) {
    if (!slaEnt) return "";
    const gcVal = String(slaEnt.gc != null ? slaEnt.gc : "").trim();
    const gck = normalizeMergeGcKey(gcVal);
    if (!gck) return "";
    const pendEnt = stateGcLookup.has(gck) ? stateGcLookup.get(gck) : null;
    if (!pendEnt) return "";
    return String(pendEnt.vehicle != null ? pendEnt.vehicle : "").trim();
  }

  /**
   * 대시보드 패널 내 정렬:
   * ① GC 있음·재고부족만 패널 맨 아래
   * ② 각 구간 안에서 보충기한 오름차순 → 차량 → SKU(RCRT 별칙 없음)
   */
  function sortStagedMergeDashboardRows(stagedRows) {
    stagedRows.sort(function (a, b) {
      const saLo = Number(a.shortageBottom || 0);
      const sbLo = Number(b.shortageBottom || 0);
      if (saLo !== sbLo) return saLo - sbLo;

      const ta = Number.isFinite(a.tKey) ? a.tKey : Number.POSITIVE_INFINITY;
      const tb = Number.isFinite(b.tKey) ? b.tKey : Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      const va = String(a.vKey || "");
      const vb = String(b.vKey || "");
      const ea = !va;
      const eb = !vb;
      if (ea && eb) {
        const sa = String(a.skuKeySort || "");
        const sb = String(b.skuKeySort || "");
        return sa.localeCompare(sb, undefined, { numeric: true });
      }
      if (ea) return 1;
      if (eb) return -1;
      const cv = va.localeCompare(vb, undefined, { numeric: true });
      if (cv !== 0) return cv;
      const ska = String(a.skuKeySort || "");
      const skb = String(b.skuKeySort || "");
      return ska.localeCompare(skb, undefined, { numeric: true });
    });
  }

  function attachMergeCellCopy(td, rawText) {
    td.classList.add("merge-cell-copy");
    const t = String(rawText || "").trim();
    if (t) td.title = "클릭하여 복사";
    td.addEventListener("click", function (e) {
      e.stopPropagation();
      const copyStr = String(rawText || "").trim();
      if (!copyStr) return;
      copyTextToClipboard(copyStr).then(function (ok) {
        if (!ok) return;
        td.classList.remove("merge-cell-copied-flash");
        void td.offsetWidth;
        td.classList.add("merge-cell-copied-flash");
        window.setTimeout(function () {
          td.classList.remove("merge-cell-copied-flash");
        }, 500);
      });
    });
  }

  function renderMergePreviewTableShell(table) {
    if (!table) return null;
    table.innerHTML = "";
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    MERGE_TABLE_HEADERS.forEach(function (h) {
      const th = document.createElement("th");
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    return tbody;
  }

  function buildMergePreviewTr(row, slaLookup, stateGcLookup, emptyTail, slaEntOverride) {
    const tr = document.createElement("tr");
    const tdSku = document.createElement("td");
    tdSku.textContent = row.sku;
    if (!String(row.sku || "").trim()) tdSku.classList.add("merge-cell-empty");
    attachMergeCellCopy(tdSku, row.sku);
    tr.appendChild(tdSku);
    const tdBc = document.createElement("td");
    tdBc.textContent = row.barcode;
    if (!String(row.barcode || "").trim()) tdBc.classList.add("merge-cell-empty");
    attachMergeCellCopy(tdBc, row.barcode);
    tr.appendChild(tdBc);
    const skuKey = normalizeSkuJoinKey(row.sku);
    const slaGroup = skuKey && slaLookup.has(skuKey) ? slaLookup.get(skuKey) : null;
    const slaEnt = slaEntOverride || slaGroup;
    const pname = slaEnt ? slaEnt.productName : "";
    const gcVal = slaEnt ? slaEnt.gc : "";
    const tempVal = slaEnt ? slaEnt.tempZone : "";
    const tdUnit = document.createElement("td");
    const unitText = String(row.unit != null ? row.unit : "");
    tdUnit.textContent = unitText;
    if (!unitText) tdUnit.classList.add("merge-cell-empty");
    tr.appendChild(tdUnit);
    const tdGcQty = document.createElement("td");
    const gcQtyText = slaEnt && Number.isFinite(slaEnt.qty)
      ? formatAggregatedUnitSum(slaEnt.qty)
      : "";
    tdGcQty.textContent = gcQtyText;
    if (!gcQtyText) tdGcQty.classList.add("merge-cell-empty");
    tr.appendChild(tdGcQty);
    const tdName = document.createElement("td");
    tdName.textContent = pname;
    if (!pname) tdName.className = "merge-cell-empty";
    tr.appendChild(tdName);
    const tdGc = document.createElement("td");
    tdGc.textContent = gcVal;
    if (!gcVal) tdGc.classList.add("merge-cell-empty");
    attachMergeCellCopy(tdGc, gcVal);
    tr.appendChild(tdGc);
    let pendEnt = null;
    const gck = normalizeMergeGcKey(gcVal);
    if (gck && stateGcLookup.has(gck)) pendEnt = stateGcLookup.get(gck);
    const ctVal = pendEnt ? pendEnt.ct : "";
    const priVal = pendEnt ? pendEnt.priority : "";
    const statusVal = resolveMergeTableStatusDisplay(
      pendEnt ? pendEnt.status : "",
      row.workflowStatus
    );
    const tdCt = document.createElement("td");
    tdCt.textContent = ctVal;
    if (!ctVal) tdCt.className = "merge-cell-empty";
    tr.appendChild(tdCt);
    const tdPri = document.createElement("td");
    tdPri.textContent = priVal;
    if (!priVal) tdPri.className = "merge-cell-empty";
    tr.appendChild(tdPri);
    const tdTemp = document.createElement("td");
    if (slaEnt) {
      const tz = formatTempZoneCell(tempVal);
      tdTemp.textContent = tz.display;
      tr.setAttribute("data-merge-temp", tz.filterKey);
      if (tz.filterKey === "RM") tdTemp.classList.add("merge-temp-rm");
    } else {
      tdTemp.className = "merge-cell-empty";
      tdTemp.textContent = "";
      tr.setAttribute("data-merge-temp", "");
    }
    tr.appendChild(tdTemp);
    const vehVal = pendEnt ? pendEnt.vehicle : "";
    const unloadDisp = formatUnloadTimeDisplay(pendEnt ? pendEnt.unloadRaw : null);
    const tdVeh = document.createElement("td");
    tdVeh.textContent = vehVal;
    if (!vehVal) tdVeh.className = "merge-cell-empty";
    tr.appendChild(tdVeh);
    const tdUnload = document.createElement("td");
    tdUnload.textContent = unloadDisp.text;
    if (!unloadDisp.text) tdUnload.className = "merge-cell-empty";
    tr.appendChild(tdUnload);
    const tdStatus = document.createElement("td");
    tdStatus.textContent = statusVal;
    if (!statusVal) tdStatus.className = "merge-cell-empty";
    tr.appendChild(tdStatus);
    const deadlineDisp = formatUnloadTimeDisplay(
      workflowDeadlineRawIsLikelyStatusNotTime(row.deadlineRaw) ? "" : row.deadlineRaw
    );
    const tdDeadline = document.createElement("td");
    tdDeadline.textContent = deadlineDisp.text;
    if (!deadlineDisp.text) tdDeadline.className = "merge-cell-empty";
    tr.appendChild(tdDeadline);
    const doneKey = mergeReplenishDoneKey(row.sku);
    const isDone = mergeReplenishDoneBySku.has(doneKey);
    if (isDone) tr.classList.add("merge-row-done");
    const tdDone = document.createElement("td");
    tdDone.className = "merge-cell-done";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = isDone;
    cb.title = "보충 완료";
    cb.setAttribute("aria-label", "보충 완료");
    cb.addEventListener("change", function () {
      if (cb.checked) {
        mergeReplenishDoneBySku.add(doneKey);
        tr.classList.add("merge-row-done");
      } else {
        mergeReplenishDoneBySku.delete(doneKey);
        tr.classList.remove("merge-row-done");
      }
      saveMergeReplenishDoneToStorage();
    });
    tdDone.appendChild(cb);
    tr.appendChild(tdDone);
    // 행 더블클릭으로 완료 토글: 체크박스 자체/입력·선택 요소 위 더블클릭은 네이티브 동작에 맡김.
    tr.addEventListener("dblclick", function (e) {
      if (e.target === cb) return;
      const tag = String((e.target && e.target.tagName) || "").toUpperCase();
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "A") return;
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
      cb.click();
    });
    for (let j = 0; j < emptyTail; j++) {
      const td = document.createElement("td");
      td.className = "merge-cell-empty";
      td.textContent = "";
      tr.appendChild(td);
    }
    return tr;
  }

  function refreshMergePreview() {
    const raw = getWorkflowTsvText();
    const lines = workflowTsvNonEmptyLines(raw);
    const parsed = parseWorkflowRowObjects(lines);
    const merged = aggregateWorkflowRowsBySkuId(parsed);
    const slaLookup = buildSlaSkuLookupMap();
    const stateGcLookup = buildPendingGcLookupMap();
    const mergedForDisplay = merged.slice();
    const hintEl = document.getElementById("mergeJoinHint");
    if (hintEl) {
      const wbSla = workbooks[SLA_WB_INDEX];
      const wbState = workbooks[PENDING_WB_INDEX];
      let nSku = 0;
      let slaHit = 0;
      let stateHit = 0;
      for (let hi = 0; hi < mergedForDisplay.length; hi++) {
        const row = mergedForDisplay[hi];
        const skuKey = normalizeSkuJoinKey(row.sku);
        if (!skuKey) continue;
        nSku += 1;
        if (slaLookup.has(skuKey)) {
          slaHit += 1;
          const ent = slaLookup.get(skuKey);
          const gck = normalizeMergeGcKey(ent && ent.gc ? ent.gc : "");
          if (gck && stateGcLookup.has(gck)) stateHit += 1;
        }
      }
      const parts = [];
      if (!wbSla) parts.push("① SLA 가 비어 있음");
      if (!wbState) parts.push("② 이관현황 이 비어 있음");
      if (nSku === 0) parts.push("워크플로에 SKU(F열)가 있는 행이 없음");
      else if (wbSla && slaHit < nSku) parts.push("SLA와 워크플로 SKU 일치가 부족합니다");
      else if (wbState && slaHit > 0 && stateHit < slaHit) parts.push("이관현황 GC 일치가 부족합니다");
      hintEl.textContent = parts.join(" · ");
    }

    const grid = document.getElementById("mergeDashboardsGrid");
    const tbodies = [];
    const multiDash = !!grid;
    if (multiDash) {
      for (let d = 1; d <= 9; d++) {
        const t = document.getElementById("mergePreviewTable" + d);
        tbodies.push(renderMergePreviewTableShell(t));
        const meta = document.getElementById("mergeDashMeta" + d);
        if (meta) meta.textContent = "";
      }
    } else {
      const legacy = document.getElementById("mergePreviewTable");
      if (!legacy) return;
      tbodies.push(renderMergePreviewTableShell(legacy));
    }

    const emptyTail = MERGE_TABLE_HEADERS.length - 14;
    const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const stagedByDash = [[], [], [], [], [], [], [], [], []];
    const stagedLegacy = [];
    const statusSummaryRowsByKey = {};
    const statusSummaryDeadlines = {};

    function accumulateStatusSummaryForWorkflowRow(workflowRow, slaEntries) {
      for (let i = 0; i < slaEntries.length; i++) {
        const slaEnt = slaEntries[i] || null;
        const gcVal = String(slaEnt && slaEnt.gc != null ? slaEnt.gc : "").trim();
        const tempKey = slaEnt ? formatTempZoneCell(slaEnt.tempZone).filterKey : "";
        const pname = slaEnt ? String(slaEnt.productName || "") : "";
        const slot = mergeDashboardSlotIndexForRow(tempKey, pname, gcVal);
        if (slot === 9) continue;
        const gck = normalizeMergeGcKey(gcVal);
        const pendEnt = gck && stateGcLookup.has(gck) ? stateGcLookup.get(gck) : null;
        const statusVal = resolveMergeTableStatusDisplay(
          pendEnt ? pendEnt.status : "",
          workflowRow.workflowStatus
        );
        let statusKey = mergeStatusSummaryKey(statusVal);
        const isRcrtGc = gcVal.toUpperCase().indexOf("RCRT") !== -1;
        // 9번(ETC) 제외 상태에서 RCRT GC는 상태 문구가 달라도 집계에 포함한다.
        if (!statusKey && isRcrtGc) statusKey = "waiting";
        if (!statusKey) continue;
        const tempInfo = mergeStatusSummaryTempInfoFromSlaEntry(slaEnt);
        const statusLabel = statusKey === "waiting" ? "진열대기" : "이동중";
        const rowKey = tempInfo.label + "\x1f" + statusKey;
        if (!statusSummaryRowsByKey[rowKey]) {
          statusSummaryRowsByKey[rowKey] = {
            label: tempInfo.label + " · " + statusLabel,
            tempOrder: tempInfo.order,
            statusOrder: statusKey === "waiting" ? 1 : 2,
            byDeadline: {}
          };
        }
        const bucketInfo = mergeStatusSummaryBucketFromDeadlineRaw(workflowRow.deadlineRaw);
        const bucket = bucketInfo.label;
        if (!statusSummaryDeadlines[bucket]) {
          statusSummaryDeadlines[bucket] = {
            sortRank: bucketInfo.sortRank,
            sortValue: bucketInfo.sortValue
          };
        };
        const unitVal = Number.isFinite(workflowRow.unitNumeric)
          ? Number(workflowRow.unitNumeric)
          : Number.parseFloat(String(workflowRow.unit != null ? workflowRow.unit : "").replace(/,/g, ""));
        const increment = Number.isFinite(unitVal) ? unitVal : 0;
        if (!statusSummaryRowsByKey[rowKey].byDeadline[bucket]) {
          statusSummaryRowsByKey[rowKey].byDeadline[bucket] = 0;
        }
        statusSummaryRowsByKey[rowKey].byDeadline[bucket] += increment;
      }
    }

    function appendDashboardRow(workflowRow, skuKeySort, slaEnt) {
      const pname = slaEnt ? slaEnt.productName : "";
      const gcVal = slaEnt ? String(slaEnt.gc != null ? slaEnt.gc : "").trim() : "";
      let tempKey = "";
      if (slaEnt) tempKey = formatTempZoneCell(slaEnt.tempZone).filterKey;
      const slot = mergeDashboardSlotIndexForRow(tempKey, pname, gcVal);
      const tr = buildMergePreviewTr(workflowRow, slaLookup, stateGcLookup, emptyTail, slaEnt);
      const tKey = resolveMergeRowReplenishDeadlineSortKey(workflowRow);
      const vKey = resolveVehicleForMergeSlaEnt(slaEnt, stateGcLookup);
      const gcValForSort = slaEnt ? String(slaEnt.gc != null ? slaEnt.gc : "").trim() : "";
      const gckForSort = gcValForSort ? normalizeMergeGcKey(gcValForSort) : "";
      const pendForSort =
        gckForSort && stateGcLookup.has(gckForSort) ? stateGcLookup.get(gckForSort) : null;
      const statusForSort = resolveMergeTableStatusDisplay(
        pendForSort ? pendForSort.status : "",
        workflowRow.workflowStatus
      );
      const hasGcForSort = gcValForSort.length > 0;
      const shortageBottom =
        hasGcForSort && mergeDisplayStatusIsStockShortageForDashSort(statusForSort) ? 1 : 0;
      const rec = {
        tr: tr,
        tKey: tKey,
        vKey: vKey,
        skuKeySort: skuKeySort,
        shortageBottom: shortageBottom
      };
      if (multiDash) {
        if (slot >= 1 && slot <= 9 && stagedByDash[slot - 1]) {
          stagedByDash[slot - 1].push(rec);
          counts[slot - 1] += 1;
        }
      } else if (tbodies[0]) {
        stagedLegacy.push(rec);
      }
    }

    for (let i = 0; i < mergedForDisplay.length; i++) {
      const row = mergedForDisplay[i];
      const skuKey = normalizeSkuJoinKey(row.sku);
      const slaGroup = skuKey && slaLookup.has(skuKey) ? slaLookup.get(skuKey) : null;
      const slaEntries = resolveSlaEntriesForUnit(slaGroup, row.unitNumeric);
      accumulateStatusSummaryForWorkflowRow(row, slaEntries.length ? slaEntries : [null]);
      if (!slaEntries.length) {
        appendDashboardRow(row, skuKey, null);
      } else {
        for (let k = 0; k < slaEntries.length; k++) {
          appendDashboardRow(row, skuKey, slaEntries[k]);
        }
      }
    }

    if (multiDash) {
      for (let d = 0; d < 9; d++) {
        sortStagedMergeDashboardRows(stagedByDash[d]);
        const tbody = tbodies[d];
        if (!tbody) continue;
        const st = stagedByDash[d];
        for (let u = 0; u < st.length; u++) tbody.appendChild(st[u].tr);
      }
    } else if (tbodies[0]) {
      sortStagedMergeDashboardRows(stagedLegacy);
      for (let u = 0; u < stagedLegacy.length; u++) tbodies[0].appendChild(stagedLegacy[u].tr);
    }

    if (multiDash) {
      for (let d = 0; d < 9; d++) {
        const meta = document.getElementById("mergeDashMeta" + (d + 1));
        if (meta) meta.textContent = counts[d] ? counts[d] + "건" : "0건";
      }
    }
    renderMergeTimeStatusSummary(statusSummaryRowsByKey, statusSummaryDeadlines);

  }

  function refreshPasteMeta() {
    refreshMergePreview();
  }

  function flushPersistedPageState() {
    saveMergeReplenishDoneToStorage();
  }

  for (let i = 0; i < 2; i++) {
    wirePasteSlot(i);
    bindSheetSelect(i);
  }

  const pasteTsv = document.getElementById("pasteTsv");
  if (pasteTsv) {
    pasteTsv.addEventListener("input", function () {
      persistWorkflowTsvFromDataPage();
      refreshPasteMeta();
    });
  }

  const MERGE_TEAMS_COPY_BUTTONS = [
    { id: "btnCopyMergeTeamsChilled12", label: "EGG·SR", dashboards: [1, 2] },
    { id: "btnCopyMergeTeamsChilled3", label: "EGG20·30", dashboards: [3] },
    { id: "btnCopyMergeTeamsChilled4", label: "냉장", dashboards: [4] },
    { id: "btnCopyMergeTeamsAmbient", label: "상온", dashboards: [5, 6] },
    { id: "btnCopyMergeTeamsFrozen", label: "냉동", dashboards: [7] },
    { id: "btnCopyMergeTeamsRm", label: "RM", dashboards: [8] },
    { id: "btnCopyMergeTeamsRcrtEtc", label: "ETC", dashboards: [9] }
  ];
  MERGE_TEAMS_COPY_BUTTONS.forEach(function (spec) {
    const el = document.getElementById(spec.id);
    if (!el) return;
    const rest = spec.label;
    el.addEventListener("click", function () {
      copyMergePreviewForTeamsSlice(el, rest, spec.dashboards);
    });
  });

  const btnPrintMergePdf = document.getElementById("btnPrintMergePdf");
  if (btnPrintMergePdf) {
    btnPrintMergePdf.addEventListener("click", function () {
      const anchor = document.getElementById("yna4-preview-anchor");
      if (anchor) anchor.scrollIntoView({ block: "start", behavior: "auto" });
      window.setTimeout(function () {
        window.print();
      }, 50);
    });
  }

  if (replenishSyncChannel) {
    replenishSyncChannel.addEventListener("message", function (ev) {
      const k = ev && ev.data && ev.data.t;
      if (IS_PREVIEW_PAGE && k === "tsv") {
        refreshMergePreview();
        return;
      }
      if (IS_PREVIEW_PAGE && k === "wb") {
        loadWorkbooksFromStorage();
        refreshMergePreview();
        return;
      }
      applyExternalReplenishUpdate();
    });
  }
  window.addEventListener("storage", function (e) {
    if (!e.key) return;
    if (
      e.key === WORKFLOW_TSV_STORAGE_KEY ||
      e.key.indexOf(WB_B64_STORAGE_PREFIX) === 0 ||
      e.key.indexOf(WB_SHEET_STORAGE_PREFIX) === 0 ||
      e.key.indexOf(WB_FILENAME_STORAGE_PREFIX) === 0
    ) {
      applyExternalReplenishUpdate();
    }
  });

  function attachUnloadHandlers() {
    if (IS_COMBINED_PAGE) {
      window.addEventListener("beforeunload", function () {
        persistWorkflowTsvFromDataPage();
        persistWorkbooksToStorage();
        flushPersistedPageState();
      });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") {
          persistWorkflowTsvFromDataPage();
          persistWorkbooksToStorage();
          flushPersistedPageState();
        }
      });
    } else if (IS_PREVIEW_PAGE) {
      window.addEventListener("beforeunload", flushPersistedPageState);
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") {
          flushPersistedPageState();
        }
      });
    } else {
      window.addEventListener("beforeunload", function () {
        persistWorkflowTsvFromDataPage();
        persistWorkbooksToStorage();
      });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") {
          persistWorkflowTsvFromDataPage();
          persistWorkbooksToStorage();
        }
      });
    }
  }

  function finishBootstrap() {
    if (IS_PREVIEW_PAGE) {
      loadMergeReplenishDoneFromStorage();
    }
    refreshPasteMeta();
    attachUnloadHandlers();
  }

  function restorePasteFromLocalWhenEmpty() {
    if (!IS_DATA_PAGE) return;
    const ta0 = document.getElementById("pasteTsv");
    if (!ta0) return;
    let s = "";
    try {
      s = localStorage.getItem(WORKFLOW_TSV_STORAGE_KEY) || "";
    } catch (e) {}
    if (!ta0.value && s) ta0.value = s;
  }

  clearYna4ReplenishLocalStorage();
  loadWorkbooksFromStorage();
  restorePasteFromLocalWhenEmpty();
  finishBootstrap();
})();
