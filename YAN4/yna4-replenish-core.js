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

  function persistWorkbooksToStorageCore() {
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

  let persistWorkbooksTimer = null;
  function schedulePersistWorkbooksToStorage() {
    if (persistWorkbooksTimer) clearTimeout(persistWorkbooksTimer);
    persistWorkbooksTimer = setTimeout(function () {
      persistWorkbooksTimer = null;
      persistWorkbooksToStorageCore();
    }, 450);
  }

  function flushPersistWorkbooksToStorage() {
    if (!IS_DATA_PAGE) return;
    if (persistWorkbooksTimer) {
      clearTimeout(persistWorkbooksTimer);
      persistWorkbooksTimer = null;
    }
    persistWorkbooksToStorageCore();
  }

  function persistWorkbooksToStorage() {
    if (!IS_DATA_PAGE) return;
    schedulePersistWorkbooksToStorage();
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
    "상차시간",
    "하차시간",
    "상태",
    "보충기한"
  ];

  /** 팀즈 복사·인쇄 청크 등에서 제외(대시보드 화면에만 표시). */
  const MERGE_TABLE_HEADERS_DASHBOARD_ONLY = new Set(["상차시간"]);

  /** 인쇄/PDF 청크 복제 시에만 제거(화면·팀즈 복사에는 유지). */
  const MERGE_TABLE_HEADER_PRINT_STRIP = new Set(["SKU ID"]);

  /** buildMergePreviewTr 가 붙이는 데이터 td 개수(= MERGE_TABLE_HEADERS 길이). */
  const MERGE_PREVIEW_BODY_TD_COUNT = 14;

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

  /** ① 패턴(10·15구/입) + 치즈·반숙이·반숙란 → ① 제외, CHILLED 나머지(④)로 귀속 */
  function mergeProductNameChilledSmallPackCheeseOrSoftEggSkipsDash1ForDash4(nameText) {
    const t = String(nameText || "");
    if (!mergeProductNameMatchesChilledDashboard1(t)) return false;
    if (t.indexOf("치즈") !== -1) return true;
    if (t.indexOf("반숙이") !== -1) return true;
    if (t.indexOf("반숙란") !== -1) return true;
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
      const dash4CheeseSmall =
        !noDash13ForMoistBakedEgg && mergeProductNameChilledSmallPackCheeseOrSoftEggSkipsDash1ForDash4(n);
      if (!noDash13ForMoistBakedEgg && !dash4CheeseSmall && mergeProductNameMatchesChilledDashboard1(n)) return 1;
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

  /** 통합 상태(②): 진열대기·진열중·이동중을 한 붙여넣기에 넣음. A=GC → B·H·I·J·K·L (진열대기 열 배치, 첫 GC 행만 사용). */
  const PENDING_WB_INDEX = 1;
  const PENDING_GC_MATCH_COL_0 = 0;
  const PENDING_PRIORITY_COL_0 = 1;
  const PENDING_CT_COL_0 = 7;
  const PENDING_STATUS_COL_0 = 8;
  /** 이관 시트 J열(1-based J): 진열대기·진열중·이동중 행의 상차 시각(날짜+시간 원문). */
  const PENDING_LOAD_TIME_COL_0 = 9;
  const PENDING_VEHICLE_COL_0 = 10;
  const PENDING_UNLOAD_COL_0 = 11;

  /** ② 이관 I열: 진열대기·진열중·이동중. 워크플로 10열 이후 배송사 라벨이 오면 무시하고 이관 상태를 쓴다. */
  const MERGE_STATUS_TRANSFER_STATE_RE = /진열대기|진열중|이동중/;

  function mergeStatusLooksLikeTransferSheet(s) {
    return MERGE_STATUS_TRANSFER_STATE_RE.test(String(s || ""));
  }

  /** 날짜+시간 문자열에서 시각만 HH:MM 또는 HH:MM:SS (이관 시트 J열 상차시간 등). */
  function extractTimePartFromDateTimeCell(raw) {
    const t = String(raw || "")
      .replace(/\u00a0/g, " ")
      .trim();
    if (!t) return "";
    const pad2 = function (n) {
      return (n < 10 ? "0" : "") + n;
    };
    const mKr = t.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
    if (mKr) {
      const h = parseInt(mKr[1], 10);
      const min = mKr[2] != null ? parseInt(mKr[2], 10) : 0;
      if (Number.isFinite(h) && h >= 0 && h <= 23 && Number.isFinite(min) && min >= 0 && min <= 59) {
        return pad2(h) + ":" + pad2(min);
      }
    }
    let best = "";
    const re = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;
    let mm;
    while ((mm = re.exec(t)) !== null) {
      const h = parseInt(mm[1], 10);
      if (h >= 0 && h <= 23) {
        best = pad2(h) + ":" + mm[2] + (mm[3] != null && mm[3] !== "" ? ":" + mm[3] : "");
      }
    }
    return best;
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

  /** SLA/진열대기 GC 문자열이 직납(1007…) 구간이면 true — 선택적 GC 접두 뒤 1007 시작. */
  function mergeGcRawLooksDirectVendor1007(gcRaw) {
    let u = String(gcRaw != null ? gcRaw : "")
      .replace(/\u00a0/g, " ")
      .trim()
      .toUpperCase();
    if (!u) return false;
    u = u.replace(/^GC[-_\s]*/, "");
    return u.indexOf("1007") === 0;
  }

  /** ①~⑧: GC 1007대 + (표시 전)재고부족일 때만 직납 행 스타일 규칙 적용 */
  function mergeDirectVendor1007DisplayApplies(gcRaw, resolvedStatusBeforeOverride, dashboardSlot1) {
    const st = String(resolvedStatusBeforeOverride != null ? resolvedStatusBeforeOverride : "").trim();
    const slot = dashboardSlot1 != null ? Number(dashboardSlot1) : 9;
    if (!Number.isFinite(slot) || slot < 1 || slot > 8) return false;
    if (!mergeGcRawLooksDirectVendor1007(gcRaw)) return false;
    if (!mergeDisplayStatusIsStockShortageForDashSort(st)) return false;
    return true;
  }

  /**
   * ①~⑧: 재고부족 → 상태는 진열대기로 맞춤(이관 흐름과 동일한 표시 규칙).
   * @param {string} gcRaw
   * @param {string} statusDisplay resolveMergeTableStatusDisplay 결과
   * @param {number} [dashboardSlot1] 1~9
   */
  function applyDirectVendor1007StockStatusOverride(gcRaw, statusDisplay, dashboardSlot1) {
    const st = String(statusDisplay != null ? statusDisplay : "").trim();
    if (mergeDirectVendor1007DisplayApplies(gcRaw, st, dashboardSlot1)) return "진열대기";
    return st;
  }

  /**
   * ①~⑧: 동일 조건에서 우선순위 열에 직납 표기(데이터 소스 우선순위 대신).
   */
  function applyDirectVendor1007PriorityOverride(
    gcRaw,
    priorityDisplay,
    resolvedStatusBeforeOverride,
    dashboardSlot1
  ) {
    const st0 = String(resolvedStatusBeforeOverride != null ? resolvedStatusBeforeOverride : "").trim();
    if (mergeDirectVendor1007DisplayApplies(gcRaw, st0, dashboardSlot1)) return "직납";
    return String(priorityDisplay != null ? priorityDisplay : "").trim();
  }

  const workbooks = [null, null];
  const currentSheet = ["", ""];
  /** 대시보드: 더블클릭 또는 보충조회(로케이션 조회)로만 초록(완료) 표시 — SKU+GC 행 단위(v2). */
  const mergeReplenishDoneKeys = new Set();
  const MERGE_DONE_STORAGE_KEY = "yna4_merge_replenish_done_v2";

  /** @param {string} sku @param {string} [gcRaw] */
  function mergeReplenishDoneKey(sku, gcRaw) {
    const skuPart =
      String(sku || "").trim() === "" ? "__EMPTY_SKU__" : normalizeSkuJoinKey(sku);
    const gcNorm = normalizeMergeGcKey(gcRaw);
    const gcPart = gcNorm === "" ? "__NO_GC__" : gcNorm;
    return skuPart + "|" + gcPart;
  }

  function loadMergeReplenishDoneFromStorage() {
    try {
      const raw = localStorage.getItem(MERGE_DONE_STORAGE_KEY);
      if (!raw) return;
      const j = JSON.parse(raw);
      mergeReplenishDoneKeys.clear();
      if (Array.isArray(j)) {
        for (let i = 0; i < j.length; i++) {
          mergeReplenishDoneKeys.add(String(j[i]));
        }
        return;
      }
      if (j && typeof j === "object") {
        const m = j.m || j.manual;
        if (Array.isArray(m)) {
          for (let k = 0; k < m.length; k++) mergeReplenishDoneKeys.add(String(m[k]));
        }
      }
    } catch (e) {}
  }

  function saveMergeReplenishDoneToStorage() {
    try {
      localStorage.setItem(
        MERGE_DONE_STORAGE_KEY,
        JSON.stringify({
          m: Array.from(mergeReplenishDoneKeys)
        })
      );
    } catch (e) {}
  }

  /** 워크플로우 TSV가 바뀌면 완료(초록) 전부 초기화 */
  let workflowTsvSnapshotForDoneReset = null;

  function resetMergeReplenishDoneIfWorkflowChanged() {
    const raw = getWorkflowTsvText();
    if (workflowTsvSnapshotForDoneReset === null) {
      workflowTsvSnapshotForDoneReset = raw;
      return;
    }
    if (raw === workflowTsvSnapshotForDoneReset) return;
    workflowTsvSnapshotForDoneReset = raw;
    if (!mergeReplenishDoneKeys.size) return;
    mergeReplenishDoneKeys.clear();
    saveMergeReplenishDoneToStorage();
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
    if (!wb) return;
    const names = wb.SheetNames || [];
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
    currentSheet[i] = pick;

    const strip = document.getElementById("sheetStrip" + i);
    const sel = document.getElementById("sheetSelect" + i);
    if (!strip || !sel) return;
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
    sel.value = pick;
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

  /** 붙여넣기 각 줄 → { sku, bc, unitStr, deadlineRaw, statusRaw } (statusRaw = 워크플로 J열) */
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
      const bcRaw = String(row[SLA_BARCODE_COL_0] != null ? row[SLA_BARCODE_COL_0] : "").trim();
      const bcKey = normalizeSkuJoinKey(bcRaw);
      const primaryKey = skuKey || bcKey;
      if (!primaryKey) continue;
      const gc = String(row[SLA_GC_COL_0] != null ? row[SLA_GC_COL_0] : "").trim();
      const pname = String(row[SLA_PRODUCT_NAME_COL_0] != null ? row[SLA_PRODUCT_NAME_COL_0] : "").trim();
      const tempZone = String(row[SLA_TEMP_ZONE_COL_0] != null ? row[SLA_TEMP_ZONE_COL_0] : "").trim();
      const qtyRaw = String(row[SLA_QTY_COL_0] != null ? row[SLA_QTY_COL_0] : "").trim();
      const qtyNum = parseWorkflowUnitNumber(qtyRaw);
      if (!map.has(primaryKey)) map.set(primaryKey, { entries: [], _byGc: new Map() });
      const grp = map.get(primaryKey);
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
      if (bcKey && bcKey !== primaryKey && !bcAlias.has(bcKey) && !map.has(bcKey)) {
        bcAlias.set(bcKey, primaryKey);
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

  /**
   * 펼친 GC 행마다 보충수량 표시 — Unit을 SLA GC재고(P) 순으로 배분.
   * ⑨ RCRT1 등 누적 제외 GC는 해당 줄에 워크플로 Unit 전체 표시(기존 ⑨ 정책).
   */
  function allocateUnitDisplayAcrossSlaEntries(slaEntries, unitNumeric, unitDisplayFallback) {
    if (!slaEntries || !slaEntries.length) return [];
    if (!Number.isFinite(unitNumeric) || unitNumeric <= 0) {
      const u = String(unitDisplayFallback != null ? unitDisplayFallback : "");
      return slaEntries.map(function () {
        return u;
      });
    }
    let remaining = unitNumeric;
    const out = [];
    let i;
    for (i = 0; i < slaEntries.length; i++) {
      const ent = slaEntries[i];
      if (remaining <= 0) {
        out.push("0");
        continue;
      }
      if (mergeGcSlaQtyExcludedFromEtcDash9(ent.gc)) {
        out.push(formatAggregatedUnitSum(unitNumeric));
        continue;
      }
      const q = Number.isFinite(ent.qty) ? ent.qty : 0;
      let alloc;
      if (q > 0) {
        alloc = Math.min(q, remaining);
      } else if (i === slaEntries.length - 1) {
        alloc = remaining;
      } else {
        alloc = 0;
      }
      remaining -= alloc;
      out.push(formatAggregatedUnitSum(alloc));
    }
    return out;
  }

  /**
   * 워크플로 → SLA 그룹: SKU(F) 우선, 실패 시 바코드(G) fallback (엑셀 N→DBeaver I 조인).
   * @returns {{ group: object|null, sortKey: string }}
   */
  function resolveSlaLookupGroupForWorkflowRow(row, slaLookup) {
    const skuKey = normalizeSkuJoinKey(row && row.sku);
    if (skuKey && slaLookup.has(skuKey)) {
      return { group: slaLookup.get(skuKey), sortKey: skuKey };
    }
    const bcKey = normalizeSkuJoinKey(row && row.barcode);
    if (bcKey && slaLookup.has(bcKey)) {
      return { group: slaLookup.get(bcKey), sortKey: skuKey || bcKey };
    }
    return { group: null, sortKey: skuKey || bcKey || "" };
  }

  /** A열 GC → B·H·I·J·K·L (통합 상태 붙여넣기: I=상태, J=상차시각, K=차량, L=하차, GC당 첫 행). */
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
      const loadTimeRaw = row[PENDING_LOAD_TIME_COL_0];
      const vehicle = String(row[PENDING_VEHICLE_COL_0] != null ? row[PENDING_VEHICLE_COL_0] : "").trim();
      const unloadRaw = row[PENDING_UNLOAD_COL_0];
      if (!map.has(gcKey))
        map.set(gcKey, {
          ct: ct,
          priority: priority,
          status: status,
          loadTimeRaw: loadTimeRaw,
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

  /** 워크플로 출고마감(I=9) → 보충기한: 엑셀 보충건 X열과 동일하게 50분 당김. */
  const MERGE_REPLENISH_DEADLINE_OFFSET_MINUTES = 50;

  function adjustWorkflowDeadlineRawForDisplay(raw) {
    if (raw == null || raw === "") return raw;
    if (workflowDeadlineRawIsLikelyStatusNotTime(raw)) return raw;
    const d = parseUnloadDateTime(raw);
    if (!d || isNaN(d.getTime())) return raw;
    return new Date(d.getTime() - MERGE_REPLENISH_DEADLINE_OFFSET_MINUTES * 60 * 1000);
  }

  /** 보충기한 열·정렬·0:00/0:40 집계용 (출고마감 −50분). */
  function formatReplenishDeadlineDisplay(raw) {
    if (workflowDeadlineRawIsLikelyStatusNotTime(raw)) {
      return formatUnloadTimeDisplay("");
    }
    return formatUnloadTimeDisplay(adjustWorkflowDeadlineRawForDisplay(raw));
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
    const disp = formatReplenishDeadlineDisplay(safeRaw);
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
    const adjusted = adjustWorkflowDeadlineRawForDisplay(raw);
    const d = parseUnloadDateTime(adjusted);
    if (d && !isNaN(d.getTime())) return d.getTime();
    const bucket = mergeStatusSummaryBucketFromDeadlineRaw(raw);
    return Number.isFinite(bucket.sortValue) ? bucket.sortValue : Number.POSITIVE_INFINITY;
  }

  /** 통합표 보충기한 셀에서 마지막 시각 토큰(H:mm) → 0~1439 분. */
  function mergeDisplayedDeadlineLastHmMinutes(deadlineCellText) {
    const s = String(deadlineCellText != null ? deadlineCellText : "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!s) return null;
    let last = null;
    const re = /(\d{1,2})\s*[:：]\s*(\d{2})/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const h = parseInt(m[1], 10);
      const mi = parseInt(m[2], 10);
      if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) last = h * 60 + mi;
    }
    return last;
  }

  /** 보충기한 시각이 정확히 00:50 → 0:00 열, 01:30 → 0:40 열. 그 외는 집계 제외. */
  function mergeReplenishWindow5730BandFromMinutes(mins) {
    if (mins === 50) return "00:50";
    if (mins === 90) return "01:30";
    return null;
  }

  function scanMergeDashboardsForReplenishWindowSummary() {
    const idxStatus = MERGE_TABLE_HEADERS.indexOf("상태");
    const idxDeadline = MERGE_TABLE_HEADERS.indexOf("보충기한");
    const idxUnit = MERGE_TABLE_HEADERS.indexOf("보충수량");
    const idxTemp = MERGE_TABLE_HEADERS.indexOf("온도대");
    const out = {
      AMBIENT: { col00: 0, col40: 0, prepack: 0 },
      CHILLED: { col00: 0, col40: 0, prepack: 0 },
      FROZEN: { col00: 0, col40: 0, prepack: 0 },
    };
    const prepackSlots = { 1: true, 2: true, 5: true };
    let dash;
    for (dash = 1; dash <= 8; dash++) {
      const tbl = document.getElementById("mergePreviewTable" + dash);
      if (!tbl) continue;
      const isPrepackSlot = !!prepackSlots[dash];
      const rows = tbl.querySelectorAll("tbody tr");
      let ri;
      for (ri = 0; ri < rows.length; ri++) {
        const tr = rows[ri];
        if (tr.classList.contains("merge-row-done")) continue;
        const tds = tr.querySelectorAll("td");
        if (tds.length <= Math.max(idxStatus, idxDeadline, idxUnit, idxTemp)) continue;
        const status = mergePreviewCellTextForSheetsTsv(tds[idxStatus]);
        if (status !== "진열대기") continue;
        const mins = mergeDisplayedDeadlineLastHmMinutes(mergePreviewCellTextForSheetsTsv(tds[idxDeadline]));
        const band = mergeReplenishWindow5730BandFromMinutes(mins);
        if (!band) continue;
        const tempCell = mergePreviewCellTextForSheetsTsv(tds[idxTemp]);
        const tz = formatTempZoneCell(tempCell);
        const fk = String(tz.filterKey || "");
        if (fk !== "AMBIENT" && fk !== "CHILLED" && fk !== "FROZEN") continue;
        const u = parseFloat(String(mergePreviewCellTextForSheetsTsv(tds[idxUnit]) || "").replace(/,/g, ""));
        const qty = Number.isFinite(u) ? u : 0;
        if (band === "00:50") out[fk].col00 += qty;
        else out[fk].col40 += qty;
        if (isPrepackSlot) out[fk].prepack += qty;
      }
    }
    return out;
  }

  function formatReplenishWindowSummaryCell(n) {
    if (!Number.isFinite(n) || n === 0) return "–";
    return formatAggregatedUnitSum(n);
  }

  function renderMergeReplenishWindowSummary() {
    const thead = document.getElementById("mergeTimeStatusSummaryThead");
    const tbody = document.getElementById("mergeTimeStatusSummaryTbody");
    if (!thead || !tbody) return;
    thead.innerHTML = "";
    tbody.innerHTML = "";
    const data = scanMergeDashboardsForReplenishWindowSummary();
    const trTop = document.createElement("tr");
    const thCat = document.createElement("th");
    thCat.rowSpan = 2;
    thCat.scope = "col";
    thCat.textContent = "구분";
    trTop.appendChild(thCat);
    const thGroup = document.createElement("th");
    thGroup.colSpan = 2;
    thGroup.scope = "colgroup";
    thGroup.textContent = "진열가능 보충건";
    trTop.appendChild(thGroup);
    const thPre = document.createElement("th");
    thPre.rowSpan = 2;
    thPre.scope = "col";
    thPre.textContent = "PREPACK";
    trTop.appendChild(thPre);
    thead.appendChild(trTop);

    const trSub = document.createElement("tr");
    const th00 = document.createElement("th");
    th00.className = "merge-time-status-summary-deadline";
    th00.scope = "col";
    th00.textContent = "0:00";
    const th40 = document.createElement("th");
    th40.className = "merge-time-status-summary-deadline";
    th40.scope = "col";
    th40.textContent = "0:40";
    trSub.appendChild(th00);
    trSub.appendChild(th40);
    thead.appendChild(trSub);

    const order = ["AMBIENT", "CHILLED", "FROZEN"];
    let t00 = 0;
    let t40 = 0;
    let tPre = 0;
    let i;
    for (i = 0; i < order.length; i++) {
      const k = order[i];
      const row = data[k] || { col00: 0, col40: 0, prepack: 0 };
      t00 += row.col00;
      t40 += row.col40;
      tPre += row.prepack;
      const tr = document.createElement("tr");
      const tdL = document.createElement("td");
      tdL.textContent = k;
      tr.appendChild(tdL);
      const td0 = document.createElement("td");
      td0.className = "merge-time-status-summary-deadline";
      td0.textContent = formatReplenishWindowSummaryCell(row.col00);
      tr.appendChild(td0);
      const td4 = document.createElement("td");
      td4.className = "merge-time-status-summary-deadline";
      td4.textContent = formatReplenishWindowSummaryCell(row.col40);
      tr.appendChild(td4);
      const tdP = document.createElement("td");
      tdP.textContent = formatReplenishWindowSummaryCell(row.prepack);
      tr.appendChild(tdP);
      tbody.appendChild(tr);
    }
    const trTot = document.createElement("tr");
    const tdTL = document.createElement("td");
    tdTL.textContent = "합계";
    trTot.appendChild(tdTL);
    const tdT0 = document.createElement("td");
    tdT0.className = "merge-time-status-summary-deadline";
    tdT0.textContent = formatReplenishWindowSummaryCell(t00);
    trTot.appendChild(tdT0);
    const tdT4 = document.createElement("td");
    tdT4.className = "merge-time-status-summary-deadline";
    tdT4.textContent = formatReplenishWindowSummaryCell(t40);
    trTot.appendChild(tdT4);
    const tdTP = document.createElement("td");
    tdTP.textContent = formatReplenishWindowSummaryCell(tPre);
    trTot.appendChild(tdTP);
    tbody.appendChild(trTot);
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

  function mergeDeadlineKeyFromCellRowCells(cells) {
    const labels = MERGE_TABLE_HEADERS.filter(function (h) {
      return !MERGE_TABLE_HEADERS_DASHBOARD_ONLY.has(h);
    });
    const idxDl = labels.indexOf("보충기한");
    if (idxDl < 0 || !cells || cells.length <= idxDl) return "__EMPTY__";
    const s = String(cells[idxDl] != null ? cells[idxDl] : "").trim();
    return s ? s : "__EMPTY__";
  }

  function mergeDeadlineKeyFromTrForExport(tr) {
    const idxDl = MERGE_TABLE_HEADERS.indexOf("보충기한");
    const col1 = idxDl >= 0 ? idxDl + 1 : 0;
    if (!col1) return "__EMPTY__";
    const td = tr.querySelector("td:nth-child(" + col1 + ")");
    const s = td ? mergePreviewCellTextForSheetsTsv(td) : "";
    return String(s || "").trim() ? String(s || "").trim() : "__EMPTY__";
  }

  function mergeDeadlineLabelFromKey(key) {
    return key === "__EMPTY__" ? "(미지정)" : key;
  }

  /**
   * 팀즈 복사 공통: 한 표에서 (초록 완료 행 제외·GC 빈 행 제외) 헤더·데이터 셀 문자열.
   * @param {Set<string>|null} [enabledDeadlineKeys] null = 기한 필터 없음. 빈 Set = 포함 행 없음.
   * @returns {{ headerCells: string[]|null, dataRows: string[][] }|null}
   */
  function getMergeTableCopyData(table, enabledDeadlineKeys) {
    if (!table) return null;
    const idxGc = MERGE_TABLE_HEADERS.indexOf("GC");
    const tbody = table.querySelector("tbody");
    const dataRows = [];
    if (tbody) {
      const trs = tbody.querySelectorAll("tr");
      for (let i = 0; i < trs.length; i++) {
        const tr = trs[i];
        if (tr.style.display === "none") continue;
        if (tr.classList.contains("merge-row-done")) continue;
        const tds = tr.querySelectorAll("td");
        if (idxGc >= 0) {
          if (tds.length <= idxGc) continue;
          const gcText = mergePreviewCellTextForSheetsTsv(tds[idxGc]);
          if (!gcText) continue;
        }
        const cells = [];
        for (let j = 0; j < tds.length; j++) {
          if (tds[j].classList.contains("merge-col-dashboard-only")) continue;
          cells.push(mergePreviewCellTextForSheetsTsv(tds[j]));
        }
        if (
          enabledDeadlineKeys != null &&
          !enabledDeadlineKeys.has(mergeDeadlineKeyFromCellRowCells(cells))
        ) {
          continue;
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
        if (ths[h].classList.contains("merge-col-dashboard-only")) continue;
        let t = ths[h].textContent != null ? String(ths[h].textContent) : "";
        t = t.replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
        headers.push(t);
      }
      if (headers.length) headerCells = headers;
    }
    return { headerCells: headerCells, dataRows: dataRows };
  }

  function gatherMergeCopySectionsList(enabledDeadlineKeys) {
    const sections = [];
    const grid = document.getElementById("mergeDashboardsGrid");
    if (grid) {
      for (let d = 1; d <= 9; d++) {
        const table = document.getElementById("mergePreviewTable" + d);
        const title = getMergeDashboardSectionTitle(d);
        const dat = getMergeTableCopyData(table, enabledDeadlineKeys);
        if (dat) sections.push({ title: title, headerCells: dat.headerCells, dataRows: dat.dataRows });
      }
    } else {
      const table = document.getElementById("mergePreviewTable");
      const dat = getMergeTableCopyData(table, enabledDeadlineKeys);
      if (dat) sections.push({ title: "", headerCells: dat.headerCells, dataRows: dat.dataRows });
    }
    return sections;
  }

  /** 대시보드 번호 1~9 중 지정한 패널만(팀즈 분할 복사). 레거시 단일 표면 전체와 동일. */
  function gatherMergeCopySectionsListForDashboardIds(dashboardIds, enabledDeadlineKeys) {
    const grid = document.getElementById("mergeDashboardsGrid");
    if (!grid) return gatherMergeCopySectionsList(enabledDeadlineKeys);
    const want = {};
    for (let i = 0; i < dashboardIds.length; i++) want[dashboardIds[i]] = true;
    const sections = [];
    for (let d = 1; d <= 9; d++) {
      if (!want[d]) continue;
      const table = document.getElementById("mergePreviewTable" + d);
      const title = getMergeDashboardSectionTitle(d);
      const dat = getMergeTableCopyData(table, enabledDeadlineKeys);
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

  function compareMergeDeadlineGroupKeys(a, b) {
    if (a === "__EMPTY__" && b === "__EMPTY__") return 0;
    if (a === "__EMPTY__") return 1;
    if (b === "__EMPTY__") return -1;
    const ba = mergeStatusSummaryBucketFromDeadlineRaw(a);
    const bb = mergeStatusSummaryBucketFromDeadlineRaw(b);
    if (ba.sortRank !== bb.sortRank) return ba.sortRank - bb.sortRank;
    if (ba.sortValue !== bb.sortValue) return ba.sortValue - bb.sortValue;
    return String(ba.label || a).localeCompare(String(bb.label || b), undefined, { numeric: true });
  }

  /** 통합표 보충기한 칩 ON/OFF (로컬). true = 복사·인쇄에 포함 */
  const MERGE_DEADLINE_CHIP_STATE_KEY = "yna4_merge_deadline_chip_on_v1";

  function loadMergeDeadlineChipStateMap() {
    try {
      const raw = localStorage.getItem(MERGE_DEADLINE_CHIP_STATE_KEY);
      if (!raw) return {};
      const j = JSON.parse(raw);
      return j && typeof j === "object" ? j : {};
    } catch (e) {
      return {};
    }
  }

  function saveMergeDeadlineChipStateMap(map) {
    try {
      localStorage.setItem(MERGE_DEADLINE_CHIP_STATE_KEY, JSON.stringify(map || {}));
    } catch (e2) {}
  }

  function collectUniqueMergePreviewDeadlinesFromDom() {
    const grid = document.getElementById("mergeDashboardsGrid");
    if (!grid) return [];
    const idxGc = MERGE_TABLE_HEADERS.indexOf("GC");
    const seen = Object.create(null);
    const keys = [];
    for (let d = 1; d <= 9; d++) {
      const table = document.getElementById("mergePreviewTable" + d);
      if (!table) continue;
      const tbody = table.querySelector("tbody");
      if (!tbody) continue;
      const trs = tbody.querySelectorAll("tr");
      for (let i = 0; i < trs.length; i++) {
        const tr = trs[i];
        if (tr.style.display === "none") continue;
        if (tr.classList.contains("merge-row-done")) continue;
        const tds = tr.querySelectorAll("td");
        if (idxGc >= 0) {
          if (tds.length <= idxGc) continue;
          if (!mergePreviewCellTextForSheetsTsv(tds[idxGc])) continue;
        }
        const k = mergeDeadlineKeyFromTrForExport(tr);
        if (!seen[k]) {
          seen[k] = true;
          keys.push(k);
        }
      }
    }
    keys.sort(compareMergeDeadlineGroupKeys);
    return keys.map(function (k) {
      return { key: k, label: mergeDeadlineLabelFromKey(k) };
    });
  }

  /** null = 칩 없음·기한 필터 없음. 빈 Set = 모두 꺼짐 */
  function getMergeDeadlineExportEnabledKeysSet() {
    const host = document.getElementById("mergeDeadlineExportChips");
    if (!host) return null;
    const btns = host.querySelectorAll("button.merge-deadline-chip[data-deadline-key]");
    if (!btns.length) return null;
    const s = new Set();
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      if (b.getAttribute("aria-pressed") === "true") {
        s.add(String(b.getAttribute("data-deadline-key") || "__EMPTY__"));
      }
    }
    return s;
  }

  function syncMergeDeadlineExportChips() {
    const host = document.getElementById("mergeDeadlineExportChips");
    if (!host) return;
    const list = collectUniqueMergePreviewDeadlinesFromDom();
    if (!list.length) {
      host.innerHTML =
        "<span class=\"merge-deadline-chips-hint\">워크플로 반영 후 보충기한별 버튼이 표시됩니다</span>";
      return;
    }
    const prev = loadMergeDeadlineChipStateMap();
    const pruned = {};
    for (let i = 0; i < list.length; i++) {
      const kk = list[i].key;
      if (Object.prototype.hasOwnProperty.call(prev, kk)) {
        pruned[kk] = prev[kk];
      } else {
        pruned[kk] = true;
      }
    }
    saveMergeDeadlineChipStateMap(pruned);
    host.innerHTML = "";
    const lab = document.createElement("span");
    lab.className = "merge-deadline-chips-label";
    lab.textContent = "보충기한:";
    host.appendChild(lab);
    for (let j = 0; j < list.length; j++) {
      const item = list[j];
      const on = pruned[item.key] !== false;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-merge-teams-copy btn-merge-teams-copy--compact merge-deadline-chip";
      if (on) btn.classList.add("merge-deadline-chip--on");
      btn.textContent = item.label;
      btn.setAttribute("data-deadline-key", item.key);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.title = "켜짐: 팀즈 복사·인쇄에 포함 · 꺼짐: 제외";
      btn.addEventListener("click", function () {
        const cur = loadMergeDeadlineChipStateMap();
        const k = btn.getAttribute("data-deadline-key");
        const curOn = cur[k] !== false;
        cur[k] = !curOn;
        saveMergeDeadlineChipStateMap(cur);
        syncMergeDeadlineExportChips();
      });
      host.appendChild(btn);
    }
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

  /** 대시보드 표 → TSV 한 셀(탭/줄바꿈 제거). */
  function mergePreviewCellTextForSheetsTsv(td) {
    let s = td.textContent != null ? String(td.textContent) : "";
    s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    s = s.replace(/\t/g, " ");
    s = s.replace(/\n/g, " ");
    s = s.replace(/\u00a0/g, " ");
    return s.trim();
  }

  /** 인쇄/PDF: GC 있는 보이는 행만, 페이지당 이 줄 수(고정 행높이 기준)로 잘라 출력 */
  const MERGE_PRINT_ROWS_PER_PAGE = 14;
  const MERGE_PRINT_CHUNK_HOST_ID = "yna4MergePrintChunkHost";
  const MERGE_PRINT_HIDE_ORIGINAL_TABLE_CLASS = "yna4-merge-hidden-for-print-pages";

  /**
   * 인쇄 청크 표 <colgroup> 너비 (12열: 상차시간·SKU ID 제거 후 순서).
   * 각 데이터 행 td 순서(1→12):
   *   Barcode, 보충수량, GC재고, 상품명, GC, CT, 우선순위, 온도대, 차량번호, 하차시간, 상태, 보충기한
   * 보충기한(12번째)은 보충데이터입력.html @media print 에서 display:none (폭 0) — PDF에는 안 보임.
   * 청크 표에는 열 제목 thead 행 없음. 구역 제목만 tbody 첫 줄(yna4-merge-print-title-row)에 표시.
   * table-layout: fixed 에서 첫 행이 제목(colspan) 일 때도 열 폭을 균일하게 고정.
   */
  const MERGE_PRINT_COL_WIDTHS = [
    "11%",   // 1 Barcode
    "3%",    // 2 보충수량
    "3%",    // 3 GC재고
    "29%",   // 4 상품명 (인쇄에서 SKU 열 제거분 반영)
    "9%",    // 5 GC
    "16%",   // 6 CT
    "6%",    // 7 우선순위
    "4.2%",  // 8 온도대
    "5%",    // 9 차량번호
    "6%",    // 10 하차시간
    "4%",    // 11 상태
    "0"      // 12 보충기한 (인쇄 숨김)
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

  /** 인쇄 청크용: 상차시간·SKU ID 등 복제 시 제거 → MERGE_PRINT_COL_WIDTHS 열 수와 맞춤. */
  function stripMergeCellsExcludedFromPrintClone(tr) {
    if (!tr || !tr.querySelectorAll) return;
    const nodes = tr.querySelectorAll(".merge-col-dashboard-only, .merge-col-print-exclude");
    let i;
    for (i = 0; i < nodes.length; i++) {
      nodes[i].remove();
    }
  }

  function collectMergePrintRowsFromTbody(tbody, enabledDeadlineKeys) {
    const rows = [];
    if (!tbody) return rows;
    const gcCol = MERGE_TABLE_HEADERS.indexOf("GC") + 1;
    const trs = tbody.querySelectorAll("tr");
    for (let i = 0; i < trs.length; i++) {
      const tr = trs[i];
      if (tr.style.display === "none") continue;
      if (tr.classList.contains("merge-row-done")) continue;
      if (gcCol > 0) {
        const td = tr.querySelector("td:nth-child(" + gcCol + ")");
        const gcText = td ? mergePreviewCellTextForSheetsTsv(td) : "";
        if (!String(gcText || "").trim()) continue;
      }
      const dk = mergeDeadlineKeyFromTrForExport(tr);
      if (
        enabledDeadlineKeys != null &&
        enabledDeadlineKeys.size > 0 &&
        !enabledDeadlineKeys.has(dk)
      ) {
        continue;
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
    const enabledPrint = getMergeDeadlineExportEnabledKeysSet();

    /**
     * 인쇄: 페이지당 행 슬롯 MERGE_PRINT_ROWS_PER_PAGE 고정.
     * 제목은 caption 아님 tbody 첫 tr(한 td colspan) — 첫 페이지만 제목 1행 + 데이터 (슬롯-1)행, 이후 페이지는 데이터 슬롯만.
     * sectionTitleText: MERGE_DASHBOARD_PRINT_TITLES 등 고정 문자열.
     */
    function appendChunksForRows(rows, tableClassName, parentEl, sectionTitleText) {
      const mount = parentEl || host;
      const titleText = sectionTitleText != null ? String(sectionTitleText).trim() : "";
      const slot = MERGE_PRINT_ROWS_PER_PAGE;
      const colCount = MERGE_PRINT_COL_WIDTHS.length;
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
          const rowClone = rows[j].cloneNode(true);
          stripMergeCellsExcludedFromPrintClone(rowClone);
          tb.appendChild(rowClone);
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
        const rows = collectMergePrintRowsFromTbody(tbody, enabledPrint);
        if (!rows.length) continue;
        any = true;
        const dashBlock = document.createElement("div");
        dashBlock.className = "yna4-merge-print-dash-block";
        host.appendChild(dashBlock);
        let printTitle = String(getMergeDashboardSectionTitle(d) || "").trim();
        if (!printTitle) printTitle = String(MERGE_DASHBOARD_PRINT_TITLES[d - 1] || "").trim() || "대시보드 " + d;
        appendChunksForRows(rows, table ? table.className : "merge-table", dashBlock, printTitle);
      }
    } else {
      const table = document.getElementById("mergePreviewTable");
      const tbody = table ? table.querySelector("tbody") : null;
      if (!tbody) {
        if (table) table.classList.remove(MERGE_PRINT_HIDE_ORIGINAL_TABLE_CLASS);
        return;
      }
      const rows = collectMergePrintRowsFromTbody(tbody, enabledPrint);
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

    const ek = getMergeDeadlineExportEnabledKeysSet();
    if (ek && ek.size === 0) {
      alert("보충기한 버튼을 하나 이상 켜 주세요.");
      flashButton(false, true);
      return;
    }
    const sections = gatherMergeCopySectionsListForDashboardIds(dashboardIds, ek);
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
    const resolved = resolveSlaLookupGroupForWorkflowRow(row, slaLookup);
    return resolveVehicleForMergeSlaEnt(resolved.group, stateGcLookup);
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
      if (MERGE_TABLE_HEADERS_DASHBOARD_ONLY.has(h)) th.classList.add("merge-col-dashboard-only");
      if (MERGE_TABLE_HEADER_PRINT_STRIP.has(h)) th.classList.add("merge-col-print-exclude");
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    return tbody;
  }

  function buildMergePreviewTr(
    row,
    slaLookup,
    stateGcLookup,
    emptyTail,
    slaEntOverride,
    dashboardSlot1,
    unitDisplayOverride
  ) {
    const tr = document.createElement("tr");
    const tdSku = document.createElement("td");
    tdSku.textContent = row.sku;
    tdSku.classList.add("merge-col-print-exclude");
    if (!String(row.sku || "").trim()) tdSku.classList.add("merge-cell-empty");
    attachMergeCellCopy(tdSku, row.sku);
    tr.appendChild(tdSku);
    const tdBc = document.createElement("td");
    tdBc.textContent = row.barcode;
    if (!String(row.barcode || "").trim()) tdBc.classList.add("merge-cell-empty");
    attachMergeCellCopy(tdBc, row.barcode);
    tr.appendChild(tdBc);
    const slaResolved = resolveSlaLookupGroupForWorkflowRow(row, slaLookup);
    const slaGroup = slaResolved.group;
    const slaEnt = slaEntOverride || slaGroup;
    const pname = slaEnt ? slaEnt.productName : "";
    const gcVal = slaEnt ? slaEnt.gc : "";
    const tempVal = slaEnt ? slaEnt.tempZone : "";
    const tdUnit = document.createElement("td");
    const unitText =
      unitDisplayOverride != null && unitDisplayOverride !== ""
        ? String(unitDisplayOverride)
        : String(row.unit != null ? row.unit : "");
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
    const priValRaw = pendEnt ? pendEnt.priority : "";
    const statusValResolved = resolveMergeTableStatusDisplay(
      pendEnt ? pendEnt.status : "",
      row.workflowStatus
    );
    const statusVal = applyDirectVendor1007StockStatusOverride(
      gcVal,
      statusValResolved,
      dashboardSlot1
    );
    const priVal = applyDirectVendor1007PriorityOverride(
      gcVal,
      priValRaw,
      statusValResolved,
      dashboardSlot1
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
    const showBoardingTime = MERGE_STATUS_TRANSFER_STATE_RE.test(String(statusVal || "").trim());
    let boardingTimeText = "";
    if (showBoardingTime && pendEnt && pendEnt.loadTimeRaw != null && pendEnt.loadTimeRaw !== "") {
      const loadDisp = formatUnloadTimeDisplay(pendEnt.loadTimeRaw);
      if (loadDisp.parsed) boardingTimeText = loadDisp.text;
      else boardingTimeText = extractTimePartFromDateTimeCell(String(pendEnt.loadTimeRaw).trim());
    }
    const tdBoarding = document.createElement("td");
    tdBoarding.textContent = boardingTimeText;
    if (!boardingTimeText) tdBoarding.classList.add("merge-cell-empty");
    tdBoarding.classList.add("merge-col-dashboard-only");
    tr.appendChild(tdBoarding);
    const tdUnload = document.createElement("td");
    tdUnload.textContent = unloadDisp.text;
    if (!unloadDisp.text) tdUnload.className = "merge-cell-empty";
    tr.appendChild(tdUnload);
    const tdStatus = document.createElement("td");
    tdStatus.textContent = statusVal;
    if (!statusVal) tdStatus.className = "merge-cell-empty";
    tr.appendChild(tdStatus);
    const deadlineDisp = formatReplenishDeadlineDisplay(row.deadlineRaw);
    const tdDeadline = document.createElement("td");
    tdDeadline.textContent = deadlineDisp.text;
    if (!deadlineDisp.text) tdDeadline.className = "merge-cell-empty";
    tr.appendChild(tdDeadline);
    const doneKey = mergeReplenishDoneKey(row.sku, gcVal);
    if (mergeReplenishDoneKeys.has(doneKey)) tr.classList.add("merge-row-done");
    tr.setAttribute("data-merge-done-key", doneKey);
    tr.addEventListener("dblclick", function (e) {
      const tag = String((e.target && e.target.tagName) || "").toUpperCase();
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "A") return;
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();

      if (mergeReplenishDoneKeys.has(doneKey)) mergeReplenishDoneKeys.delete(doneKey);
      else mergeReplenishDoneKeys.add(doneKey);
      saveMergeReplenishDoneToStorage();
      refreshMergePreview();
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
    resetMergeReplenishDoneIfWorkflowChanged();
    const raw = getWorkflowTsvText();
    const lines = workflowTsvNonEmptyLines(raw);
    const parsed = parseWorkflowRowObjects(lines);
    const merged = aggregateWorkflowRowsBySkuId(parsed);
    const slaLookup = buildSlaSkuLookupMap();
    const stateGcLookup = buildPendingGcLookupMap();
    const mergedForDisplay = merged.slice();

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

    const emptyTail = Math.max(0, MERGE_TABLE_HEADERS.length - MERGE_PREVIEW_BODY_TD_COUNT);
    const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const stagedByDash = [[], [], [], [], [], [], [], [], []];
    const stagedLegacy = [];

    function appendDashboardRow(workflowRow, skuKeySort, slaEnt, unitDisplayOverride) {
      const pname = slaEnt ? slaEnt.productName : "";
      const gcVal = slaEnt ? String(slaEnt.gc != null ? slaEnt.gc : "").trim() : "";
      let tempKey = "";
      if (slaEnt) tempKey = formatTempZoneCell(slaEnt.tempZone).filterKey;
      const slot = mergeDashboardSlotIndexForRow(tempKey, pname, gcVal);
      const tr = buildMergePreviewTr(
        workflowRow,
        slaLookup,
        stateGcLookup,
        emptyTail,
        slaEnt,
        slot,
        unitDisplayOverride
      );
      const tKey = resolveMergeRowReplenishDeadlineSortKey(workflowRow);
      const vKey = resolveVehicleForMergeSlaEnt(slaEnt, stateGcLookup);
      const gcValForSort = slaEnt ? String(slaEnt.gc != null ? slaEnt.gc : "").trim() : "";
      const gckForSort = gcValForSort ? normalizeMergeGcKey(gcValForSort) : "";
      const pendForSort =
        gckForSort && stateGcLookup.has(gckForSort) ? stateGcLookup.get(gckForSort) : null;
      const statusResolved = resolveMergeTableStatusDisplay(
        pendForSort ? pendForSort.status : "",
        workflowRow.workflowStatus
      );
      const statusForSort = applyDirectVendor1007StockStatusOverride(
        gcValForSort,
        statusResolved,
        slot
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
      const slaResolved = resolveSlaLookupGroupForWorkflowRow(row, slaLookup);
      const slaGroup = slaResolved.group;
      const sortKey = slaResolved.sortKey;
      const slaEntries = resolveSlaEntriesForUnit(slaGroup, row.unitNumeric);
      const unitAllocs = allocateUnitDisplayAcrossSlaEntries(
        slaEntries,
        row.unitNumeric,
        row.unit
      );
      if (!slaEntries.length) {
        appendDashboardRow(row, sortKey, null, row.unit);
      } else {
        for (let k = 0; k < slaEntries.length; k++) {
          appendDashboardRow(row, sortKey, slaEntries[k], unitAllocs[k]);
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
    renderMergeReplenishWindowSummary();
    syncMergeDeadlineExportChips();
  }

  let workflowMergePreviewTimer = null;
  function scheduleWorkflowMergePreviewRefresh() {
    if (workflowMergePreviewTimer) clearTimeout(workflowMergePreviewTimer);
    workflowMergePreviewTimer = setTimeout(function () {
      workflowMergePreviewTimer = null;
      refreshMergePreview();
    }, 110);
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
      scheduleWorkflowMergePreviewRefresh();
    });
    pasteTsv.addEventListener("paste", function () {
      window.setTimeout(function () {
        persistWorkflowTsvFromDataPage();
        scheduleWorkflowMergePreviewRefresh();
      }, 0);
    });
  }

  const MERGE_TEAMS_COPY_BUTTONS = [
    { id: "btnCopyMergeTeamsChilled12", label: "EGG·SR", dashboards: [1, 2] },
    { id: "btnCopyMergeTeamsChilled3", label: "EGG20·30", dashboards: [3] },
    { id: "btnCopyMergeTeamsChilled4", label: "냉장", dashboards: [4] },
    { id: "btnCopyMergeTeamsAmbient", label: "상온", dashboards: [5, 6] },
    { id: "btnCopyMergeTeamsFrozen", label: "냉동", dashboards: [7] },
    { id: "btnCopyMergeTeamsRm", label: "RM", dashboards: [8] }
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
        try {
          prepareMergePrintPagedTables();
        } catch (ePrep) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[yna4 print prepare]", ePrep);
          }
        }
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            const desk = window.yna4Desktop;
            if (desk && typeof desk.printMergeToPdf === "function") {
              desk
                .printMergeToPdf({
                  landscape: true,
                  defaultFileName: "YNA4보충.pdf",
                })
                .then(function (r) {
                  if (r && !r.ok && !r.canceled && r.error) {
                    alert("PDF 저장 실패: " + r.error);
                  }
                })
                .catch(function (ePdf) {
                  alert(String(ePdf && ePdf.message ? ePdf.message : ePdf));
                })
                .finally(function () {
                  try {
                    restoreMergePrintPagedTables();
                  } catch (eR) {}
                });
            } else {
              window.print();
            }
          });
        });
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
        flushPersistWorkbooksToStorage();
        flushPersistedPageState();
      });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") {
          persistWorkflowTsvFromDataPage();
          flushPersistWorkbooksToStorage();
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
        flushPersistWorkbooksToStorage();
      });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") {
          persistWorkflowTsvFromDataPage();
          flushPersistWorkbooksToStorage();
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

  /**
   * Electron 등 네이티브 래퍼에서 로컬 .xlsx 바이너리를 ① SLA(0)·② 이관(1) 슬롯에 넣을 때 사용.
   * @param {number} slotIndex 0 또는 1
   * @param {ArrayBuffer} arrayBuffer
   * @param {string} [fileName]
   * @returns {{ ok: boolean, error?: string }}
   */
  function loadWorkbookIntoSlotFromBinary(slotIndex, arrayBuffer, fileName) {
    const idx = slotIndex === 1 ? 1 : 0;
    let buf = arrayBuffer;
    if (!buf) {
      setSummary(idx, "파일 데이터가 비어 있습니다.", true);
      refreshMergePreview();
      return { ok: false, error: "empty" };
    }
    if (!(buf instanceof ArrayBuffer)) {
      if (buf.buffer instanceof ArrayBuffer) {
        const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      } else {
        setSummary(idx, "파일 데이터 형식 오류(ArrayBuffer 필요).", true);
        refreshMergePreview();
        return { ok: false, error: "bad buffer" };
      }
    }
    try {
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      workbooks[idx] = wb;
      currentSheet[idx] = "";
      populateSheetSelect(idx, wb);
      updateExcelSummary(idx);
      syncPasteTextareaFromWorkbook(idx);
      persistWorkbooksToStorage();
      refreshMergePreview();
      const fn = String(fileName || "").trim() || "workbook.xlsx";
      setSummary(idx, "로드됨 · 「" + fn + "」", false);
      return { ok: true };
    } catch (err) {
      workbooks[idx] = null;
      currentSheet[idx] = "";
      setSummary(idx, "엑셀 파싱 실패: " + (err.message || String(err)), true);
      persistWorkbooksToStorage();
      refreshMergePreview();
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }

  window.YNA4_REPLENISH_LOAD_WORKBOOK = loadWorkbookIntoSlotFromBinary;

  /**
   * Electron 보충조회: 재고 없음 GC에 해당하는 SKU+GC 행만 완료(초록).
   * @param {string[]} doneKeyList mergeReplenishDoneKey(sku, gc) 목록
   * @returns {{ ok: boolean, marked?: number }}
   */
  function mergeReplenishMarkDoneKeysFromList(doneKeyList) {
    if (!Array.isArray(doneKeyList)) return { ok: false };
    let marked = 0;
    for (let i = 0; i < doneKeyList.length; i++) {
      const k = String(doneKeyList[i] || "").trim();
      if (!k || k.indexOf("|") < 0) continue;
      if (k.indexOf("__EMPTY_SKU__|") === 0) continue;
      if (!mergeReplenishDoneKeys.has(k)) marked += 1;
      mergeReplenishDoneKeys.add(k);
    }
    saveMergeReplenishDoneToStorage();
    refreshMergePreview();
    return { ok: true, marked: marked };
  }
  window.YNA4_REPLENISH_MARK_DONE_KEYS = mergeReplenishMarkDoneKeysFromList;
  /** @deprecated 보충조회 v2 — SKU 전체 초록(구버전). 호환용 no-op에 가깝게 키만 SKU|__NO_GC__ */
  window.YNA4_REPLENISH_MARK_SKUS_DONE = function (skuList) {
    if (!Array.isArray(skuList)) return { ok: false };
    const keys = [];
    for (let i = 0; i < skuList.length; i++) {
      keys.push(mergeReplenishDoneKey(skuList[i], ""));
    }
    return mergeReplenishMarkDoneKeysFromList(keys);
  };
  window.YNA4_REPLENISH_DONE_KEY = mergeReplenishDoneKey;

  /**
   * ①·② 붙여넣기와 동일하게 TSV 문자열을 슬롯에 반영(내부적으로 aoa_to_sheet 워크북 생성).
   * @param {number} slotIndex 0 또는 1
   */
  function applyTsvToSlotFromExternal(slotIndex, rawText) {
    const idx = slotIndex === 1 ? 1 : 0;
    applyPasteTextToSlot(idx, String(rawText || ""), {});
    return { ok: true };
  }
  window.YNA4_REPLENISH_APPLY_TSV_TO_SLOT = applyTsvToSlotFromExternal;

  function clearReplenishWorkbookSlot(slotIndex) {
    const idx = slotIndex === 1 ? 1 : 0;
    workbooks[idx] = null;
    currentSheet[idx] = "";
    setSummary(idx, "", false);
    syncPasteTextareaFromWorkbook(idx);
    persistWorkbooksToStorage();
    refreshMergePreview();
    return { ok: true };
  }
  window.YNA4_REPLENISH_CLEAR_SLOT = clearReplenishWorkbookSlot;

  clearYna4ReplenishLocalStorage();
  loadWorkbooksFromStorage();
  restorePasteFromLocalWhenEmpty();
  finishBootstrap();
})();
