/**
 * SLA — 이관 피벗 (SharePoint SLA FULLNAME=GC · WMS 이관 · 메모리 피벗)
 */
(function () {
  "use strict";

  var SLA_UI_REV = "280";
  var DIRECT_PENDING_NUM_COLOR = "#b45309";
  var PROGRESS_VENDOR_OFFSET_PX = 100;
  var SLA_DIRECT_DONE_SKIP_KEY = "yna4-sla-direct-done-skip";
  var SLA_LOOKBACK_DAYS_KEY = "yna4-sla-lookback-days";
  var SLA_AUTO_INTERVAL_MIN = 30;
  var SLA_METRICS_PREV_LS_KEY = "yna4_sla_metrics_prev_v2";
  var SHRINK_DAILY_LS_KEY = "yna4_shrink_daily_v1";
  var SHRINK_DAILY_RETAIN_DAYS = 60;
  var SLA_METRICS_CLEARED_LABEL = "진열";
  var SLA_METRICS_INTRO_LINE =
    "[전 시간대와 비교하여 진열량 공유드립니다.]";
  var SLA_CAPTURE_DOWNLOAD_DIR = "Inbox";
  var MOVING_DEADLINE_HOURS = 5;
  var MOVING_LOAD_MERGE_MS = 5 * 60 * 1000;
  /** 온도대 열 — SLA 전체 DIR/TR 라벨 기준 */
  var PIVOT_ZONE_COL_W = 110;
  /** SLA 시간대 열 — 헤더·본문 동일 너비 */
  var PIVOT_TIME_COL_W = 80;
  /** 직납 행 — 사진 기준 주황 배경 · 짙은 남색 글씨 */
  var PIVOT_DIRECT_BG = "#FFD18C";
  var PIVOT_DIRECT_TEXT = "#0c2340";
  /** 이동중 열 — 숫자 최대 5자리(콤마 포함) */
  var PIVOT_MOVING_COL_W = 50;
  /** (비어 있음) 열 */
  var PIVOT_EMPTY_COL_W = 52;
  /** 차량 0000/1111/9999 — 이동중만 임의상차 열 (진열대기·진열중은 일반 시간대) */
  var PIVOT_ADHOC_COL_W = 52;
  /** 총합계 열 — 숫자 최대 6자리(콤마 포함) */
  var PIVOT_TOTAL_COL_W = 56;
  /** 2단 헤더 — 날짜 행 / 시간 행 높이 (sticky top 연동) */
  var PIVOT_HEAD_DAY_H = 30;
  var PIVOT_HEAD_TIME_H = 26;
  window.__YAN4_SLA_UI_REV__ = SLA_UI_REV;

  var SHAREPOINT_SLA_URL_DEFAULT =
    "https://coupangfsnam.sharepoint.com/sites/FreshFinanceR2/_layouts/15/download.aspx?UniqueId=9c695e4e-8353-4f76-a750-7d46f46d8d1f";
  /** 센터명 → SLA xlsx. 없는 센터는 YAN4 파일 */
  var SHAREPOINT_SLA_URL_BY_CENTER = {
    BUC2: "https://coupangfsnam.sharepoint.com/sites/FreshFinanceR2/_layouts/15/download.aspx?UniqueId=85a4c065-b1b6-48a9-b33c-edec3d6041da",
    GWJ1: "https://coupangfsnam.sharepoint.com/sites/FreshFinanceR2/_layouts/15/download.aspx?UniqueId=a4eaa0dd-ddd6-461d-9b05-276fa82682d2",
    GWJ3: "https://coupangfsnam.sharepoint.com/sites/FreshFinanceR2/_layouts/15/download.aspx?UniqueId=abd65e66-46ee-4dfe-a136-21198d6f5b08",
    SEN2: "https://coupangfsnam.sharepoint.com/sites/FreshFinanceR2/_layouts/15/download.aspx?UniqueId=0de8964f-92b5-48db-9478-eac3f56611d4",
  };
  var SHAREPOINT_SLA_REFERER =
    "https://coupangfsnam.sharepoint.com/sites/FreshFinanceR2/Shared%20Documents/Forms/AllItems.aspx";

  var INBOUND_ORIGIN = "https://inbound.coupang.com";
  var TRANSFER_LIST_REFERER =
    INBOUND_ORIGIN + "/transfer/admin/operation/list";
  var TRANSFER_EXCEL_PATH = "/transfer/admin/operation/list/excel";
  var TRANSFER_PAGING_MAIN =
    INBOUND_ORIGIN + "/transfer/admin/operation/paging";
  var TRANSFER_PAGING_SAME =
    INBOUND_ORIGIN + "/transfer/admin/operation/same-center/paging";
  var INVENTORY_SKU_BASE = "https://inventory.coupang.com/sku/";
  var INVENTORY_SEARCH =
    "https://inventory.coupang.com/async/inventory/search";
  var INVENTORY_LIST_BASE =
    "https://inventory.coupang.com/inventory/list";
  var INVENTORY_REFERER =
    "https://inventory.coupang.com/inventory/list?searched=true";

  var TO_CENTER = "YAN4";
  var SEARCH_DATE_UPLOAD = "UPLOAD_COMPLETED_DATE";
  var SEARCH_DATE_UNLOAD = "UNLOAD_COMPLETED_DATE";
  var SEARCH_DATE_PICKING = "PICKING_START_DATE";
  var LOOKBACK_DAYS = 7;
  var LOOKBACK_DAY_OPTIONS = [7, 15, 30];
  var CHUNK_MAX_DAYS = 3;
  var OFFSET_HOURS_DEFAULT = 12;
  var OFFSET_HOURS_FROZEN = 18;
  var OFFSET_HOURS_ROCKETMART = 72;
  var PIVOT_ALERT_HOURS_ROCKETMART = 8;
  var PIVOT_ALERT_HOURS_DEFAULT = 2;
  var TOTE_MOVE_SEARCH_URL =
    "https://inventory.coupang.com/async/tote-move/search";
  var TOTE_MOVE_REFERER = "https://inventory.coupang.com/tote-move/list";
  /** tote-move/list 기간유형 — STOWING_COMPLETED 와 동일 패턴( _DATE 없음 ) */
  var TOTE_MOVE_SEARCH_DATE_TYPES = [
    "MOVING_COMPLETED",
    "MOVE_COMPLETED",
    "MOVING_STARTED",
    "MOVE_STARTED",
    "STOWING_COMPLETED",
  ];
  var TOTE_MOVE_PAGE_SIZE = 200;
  var TOTE_STOW_CHUNK_MAX_DAYS = 3;
  var TOTE_STOW_BARCODE_TOKENS = ["RCRT18", "RCRT88"];
  /** BUC2 에이징 FULLNAME. 다른 센터는 RCRT18·RCRT88 */
  var BUC2_AGING_BARCODE_TOKENS = [
    "RCRT39",
    "RCRT49",
    "RCRT59",
    "RCRT69",
    "RCRT79",
  ];
  /** GWJ1은 177-RCRT3-9-1~999 만. 177-RCRT3-1- 은 에이징이 아님 */
  var GWJ1_AGING_LOC_PREFIXES = ["177-RCRT3-9-"];
  /** GWJ3은 140-RCRT3-5-1~999 만 */
  var GWJ3_AGING_LOC_PREFIXES = ["140-RCRT3-5-"];
  var TOTE_STOW_ZONE_LABEL = "AG";
  var TOTE_STOW_TEMP_LABELS = {
    Ambient: "Ambient",
    Chilled: "Chilled",
    Frozen: "Frozen",
  };
  var TOTE_STOW_ROW_KEYS = {
    Ambient: "TOTE_STOW_AMBIENT",
    Chilled: "TOTE_STOW_CHILLED",
    Frozen: "TOTE_STOW_FROZEN",
  };
  var TOTE_STOW_ROW_KEY_LIST = [
    TOTE_STOW_ROW_KEYS.Ambient,
    TOTE_STOW_ROW_KEYS.Chilled,
    TOTE_STOW_ROW_KEYS.Frozen,
  ];
  var TOTE_AGING_HOURS = 24;
  /** SLA 피벗: 마감 시각 기준 이 시간 이상 초과하면 시간대 열 → DAY 열(AGING과 동일 MM/DD) */
  var SLA_PIVOT_DAY_BUCKET_HOURS = 1;
  var NETWORK_DELAY_MS = 100;
  var PAGING_PAGE_CAP = 8;

  var STATUS_PRESETS = [
    {
      api: "UNLOAD",
      label: "진열대기",
      searchDateType: SEARCH_DATE_UNLOAD,
    },
    {
      api: "STOW",
      label: "진열중",
      searchDateType: SEARCH_DATE_UNLOAD,
    },
    {
      api: "LOAD",
      label: "이동중",
      searchDateType: SEARCH_DATE_PICKING,
    },
  ];

  var PIVOT_COL_MOVING = "이동중";
  var PIVOT_COL_ADHOC = "임의상차";
  var PIVOT_COL_EMPTY = "(비어 있음)";
  var TRANSFER_SHRINK_STATUS_LABEL = "진열대기";
  var PIVOT_ROW_DEFS = [
    {
      key: "AMBIENT_HDR",
      kind: "group",
      label: "AMBIENT",
      bundle: "ambient",
      bundleRole: "start",
    },
    {
      key: "AMBIENT_ATS",
      kind: "child",
      label: "ATS",
      parent: "AMBIENT",
      ats: true,
      bundle: "ambient",
      bundleRole: "child",
    },
    {
      key: "AMBIENT_NON_ATS",
      kind: "child",
      label: "Non-ATS",
      parent: "AMBIENT",
      bundle: "ambient",
      bundleRole: "end",
    },
    {
      key: "CHILLED_HDR",
      kind: "group",
      label: "CHILLED",
      bundle: "chilled",
      bundleRole: "start",
    },
    {
      key: "CHILLED_ATS",
      kind: "child",
      label: "ATS",
      parent: "CHILLED",
      ats: true,
      bundle: "chilled",
      bundleRole: "child",
    },
    {
      key: "CHILLED_NON_ATS",
      kind: "child",
      label: "Non-ATS",
      parent: "CHILLED",
      bundle: "chilled",
      bundleRole: "end",
    },
    {
      key: "FROZEN",
      kind: "leaf",
      label: "FROZEN",
      bundle: "frozen",
      bundleRole: "solo",
    },
    {
      key: "ROCKETMART",
      kind: "leaf",
      label: "RocketMart",
      bundle: "rocketmart",
      bundleRole: "solo",
    },
    {
      key: "TOTE_STOW_HDR",
      kind: "group",
      label: TOTE_STOW_ZONE_LABEL,
      bundle: "totestow",
      bundleRole: "start",
      toteStow: true,
    },
    {
      key: "TOTE_STOW_AMBIENT",
      kind: "child",
      label: TOTE_STOW_TEMP_LABELS.Ambient,
      parent: TOTE_STOW_ZONE_LABEL,
      bundle: "totestow",
      bundleRole: "child",
      toteStow: true,
    },
    {
      key: "TOTE_STOW_CHILLED",
      kind: "child",
      label: TOTE_STOW_TEMP_LABELS.Chilled,
      parent: TOTE_STOW_ZONE_LABEL,
      bundle: "totestow",
      bundleRole: "child",
      toteStow: true,
    },
    {
      key: "TOTE_STOW_FROZEN",
      kind: "child",
      label: TOTE_STOW_TEMP_LABELS.Frozen,
      parent: TOTE_STOW_ZONE_LABEL,
      bundle: "totestow",
      bundleRole: "end",
      toteStow: true,
    },
  ];

  var PO_MGMT_ORIGIN = "https://po-management.coupang.net";
  var PO_LIST_DOWNLOAD_PATH = "/po/sku/list-download";
  var PO_LIST_REFERER = PO_MGMT_ORIGIN + "/po/sku/list";
  var PO_FC_CODE = "YAN4";

  /** 상단 센터 전환(가용화 모듈 __CFS_CENTER__) 기준 센터명 — 없으면 YAN4 */
  function poFcCode() {
    var api = window.__CFS_CENTER__;
    if (api && typeof api.activeId === "function") {
      var name = api.name(api.activeId());
      if (name && !/^\d+$/.test(name)) return name;
    }
    return PO_FC_CODE;
  }

  /** 상단 센터 전환이 끝난 센터의 SLA 파일. 주소 없는 센터는 YAN4 */
  function sharePointSlaUrl() {
    var code = poFcCode();
    return SHAREPOINT_SLA_URL_BY_CENTER[code] || SHAREPOINT_SLA_URL_DEFAULT;
  }
  var PO_SEARCH_TYPE = "WAREHOUSING_PLAN";
  var PO_PAGE_SIZE = 200;
  var PO_PAGE_CAP = 120;
  var PROGRESS_PO_STATUS_OK = { 발주: 1, 입고: 1, 입고완료: 1 };
  var PROGRESS_TEMP_DEFS = [
    { key: "Ambient", temp: "Ambient", label: "Ambient" },
    { key: "Chilled", temp: "Chilled", label: "Chilled" },
    { key: "Frozen", temp: "Frozen", label: "Frozen" },
  ];
  var DIRECT_OFFSET_HOURS = 12;
  /** SLA 직납·진척 PO — 운영일 07:00~익06:59 (KST). 이관 WMS 등은 달력일 */
  var OPERATIONAL_DAY_START_HOUR = 7;

  var DIRECT_ROW_DEFS = [
    {
      key: "DIRECT_PENDING_HDR",
      kind: "group",
      label: "진열대기",
      bundle: "pending",
      bundleRole: "start",
      direct: true,
    },
    {
      key: "DIRECT_PENDING_AMBIENT",
      kind: "child",
      label: "Ambient",
      parent: "진열대기",
      bundle: "pending",
      bundleRole: "child",
      direct: true,
    },
    {
      key: "DIRECT_PENDING_CHILLED",
      kind: "child",
      label: "Chilled",
      parent: "진열대기",
      bundle: "pending",
      bundleRole: "child",
      direct: true,
    },
    {
      key: "DIRECT_PENDING_FROZEN",
      kind: "child",
      label: "Frozen",
      parent: "진열대기",
      bundle: "pending",
      bundleRole: "end",
      direct: true,
    },
  ];

  var activePivotRowDefs = PIVOT_ROW_DEFS;

  var stopRequested = false;
  var pipelineBusy = false;
  var lastPivotDrillCtx = null;
  var lastSlaPivotMetricsCtx = null;
  var lastSlaProgressCaptureCtx = null;
  var lastSlaTransferBundle = null;
  var lastSlaPipelineSkipDirect = false;
  var lastShrinkSkuMaps = null;
  /** 상품명 SR 규정으로 생성한 Shrink 대상 행 + cate5 조회용 SLA 인덱스 */
  var lastShrinkTargetRows = [];
  var lastShrinkSlaLookup = null;
  var pivotDrillActivateLock = { at: 0, row: "", col: "" };

  var gcEnrichCache = Object.create(null);
  var skuTempCache = Object.create(null);
  var toteSkuEnrichCache = Object.create(null);
  /** SharePoint SLA에 GC가 없을 때 inventory 재고조회로 채우는 상세 상품정보 */
  var inventoryGcFallbackCache = Object.create(null);

  function normKey(s) {
    return String(s || "")
      .replace(/\u00a0/g, " ")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function normalizeCellText(t) {
    return String(t != null ? t : "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pad2(n) {
    var x = Math.floor(Number(n));
    if (!isFinite(x) || x < 0) x = 0;
    return (x < 10 ? "0" : "") + x;
  }

  function ymdFromDate(d) {
    var dt = d instanceof Date ? d : new Date();
    return (
      dt.getFullYear() +
      "-" +
      pad2(dt.getMonth() + 1) +
      "-" +
      pad2(dt.getDate())
    );
  }

  function seoulWallClock(d) {
    var base = d instanceof Date ? d : new Date();
    var ymd = base.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(base);
    var hour = 0;
    parts.forEach(function (p) {
      if (p.type === "hour") hour = parseInt(p.value, 10) || 0;
    });
    return { ymd: ymd, hour: hour };
  }

  function ymdAddDays(ymd, delta) {
    var dt = parseYmd(ymd);
    if (!dt) return String(ymd || "");
    dt.setDate(dt.getDate() + (Number(delta) || 0));
    return ymdFromDate(dt);
  }

  /** SLA 직납 전용 운영일 — 07:00~익일 06:59 구간의 기준 일자 (KST) */
  function operationalYmdNow(d) {
    var sc = seoulWallClock(d || new Date());
    if (sc.hour < OPERATIONAL_DAY_START_HOUR) {
      return ymdAddDays(sc.ymd, -1);
    }
    return sc.ymd;
  }

  function operationalDayLabel(operYmd) {
    return String(operYmd || "") + " (07:00~익06:59)";
  }

  function operationalSearchEndYmd(operYmd) {
    return ymdAddDays(operYmd, 1);
  }

  function operationalDayBoundsMs(operYmd) {
    var endYmd = operationalSearchEndYmd(operYmd);
    return {
      startMs: Date.parse(String(operYmd) + "T07:00:00+09:00"),
      endMs: Date.parse(String(endYmd) + "T06:59:59.999+09:00"),
    };
  }

  function instantInOperationalDay(instant, operYmd) {
    if (!instant || !operYmd) return false;
    var t =
      instant instanceof Date
        ? instant.getTime()
        : new Date(instant).getTime();
    if (!isFinite(t)) return false;
    var b = operationalDayBoundsMs(operYmd);
    return t >= b.startMs && t <= b.endMs;
  }

  function defaultProgressDateRange() {
    var oper = operationalYmdNow();
    return {
      startYmd: oper,
      endYmd: oper,
      operationalYmd: oper,
    };
  }

  function calendarYmdNow(d) {
    return seoulWallClock(d || new Date()).ymd;
  }

  function clampLookbackDays(n) {
    var d = Math.floor(Number(n) || LOOKBACK_DAYS);
    if (LOOKBACK_DAY_OPTIONS.indexOf(d) < 0) return LOOKBACK_DAYS;
    return d;
  }

  function loadLookbackDays() {
    try {
      return clampLookbackDays(localStorage.getItem(SLA_LOOKBACK_DAYS_KEY));
    } catch (eLs) {
      return LOOKBACK_DAYS;
    }
  }

  function saveLookbackDays(n) {
    var d = clampLookbackDays(n);
    try {
      localStorage.setItem(SLA_LOOKBACK_DAYS_KEY, String(d));
    } catch (eSave) {}
    return d;
  }

  /** 오늘 포함 N일 (7일 → 오늘~6일 전). 이관 WMS·Tote 진열대기 공통. */
  function defaultDateRange() {
    var endYmd = calendarYmdNow();
    var days = loadLookbackDays();
    return {
      startYmd: ymdAddDays(endYmd, -(days - 1)),
      endYmd: endYmd,
    };
  }

  function parseYmd(ymd) {
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

  function splitInclusiveRanges(startYmd, endYmd, maxInclusive) {
    var maxD = Math.max(1, Math.floor(Number(maxInclusive) || 3));
    var start = parseYmd(startYmd);
    var end = parseYmd(endYmd);
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
      if (chunkStart.getTime() < t0) chunkStart = new Date(t0);
      out.unshift({
        start: ymdFromDate(chunkStart),
        end: ymdFromDate(chunkEnd),
      });
      if (chunkStart.getTime() <= t0) break;
      curEnd = new Date(chunkStart.getTime());
      curEnd.setDate(curEnd.getDate() - 1);
    }
    return out;
  }

  function buildExcelQueryString(opts) {
    var o = opts || {};
    var p = new URLSearchParams();
    p.set("skuBarcode", "");
    p.set("skuExternalId", "");
    p.set("skuId", "");
    p.set("vehicleNumber", "");
    p.set("status", o.status != null ? String(o.status) : "");
    p.set("containerBarcode", "");
    p.set("transferCartPriority", "");
    p.set("toCenterCode", o.toCenterCode || poFcCode());
    p.set("centerCode", "");
    p.set("transferAllocationType", "");
    p.set("transferPlanExternalId", "");
    p.set("cartBarcode", "");
    p.set("searchDateType", o.searchDateType || SEARCH_DATE_UPLOAD);
    p.set("end", o.end || "");
    p.set("start", o.start || "");
    return p.toString();
  }

  function wmsSearchOptsForItem(item) {
    if (!item) {
      return { status: "", searchDateType: SEARCH_DATE_UPLOAD };
    }
    var i, preset;
    for (i = 0; i < STATUS_PRESETS.length; i++) {
      preset = STATUS_PRESETS[i];
      if (preset.label === item.statusLabel) {
        return {
          status: preset.api,
          searchDateType: preset.searchDateType || SEARCH_DATE_UPLOAD,
        };
      }
    }
    return { status: "", searchDateType: SEARCH_DATE_UPLOAD };
  }

  function dateRangeAroundItemAt(item, fallbackDr) {
    var base = null;
    if (item) {
      if (item.statusLabel === "이동중") base = item.loadAt;
      else base = item.unloadAt || item.loadAt;
    }
    if (base && !isNaN(base.getTime())) {
      var start = new Date(base.getTime());
      start.setDate(start.getDate() - 2);
      var end = new Date(base.getTime());
      end.setDate(end.getDate() + 2);
      return { startYmd: ymdFromDate(start), endYmd: ymdFromDate(end) };
    }
    return fallbackDr;
  }

  function detailSearchPlanKey(plan) {
    var dr = plan.dr || {};
    var o = plan.searchOpts || {};
    return (
      String(dr.startYmd || "") +
      "|" +
      String(dr.endYmd || "") +
      "|" +
      String(o.status != null ? o.status : "") +
      "|" +
      String(o.searchDateType || "")
    );
  }

  function detailSearchPlansForItem(item, fallbackDr) {
    var wms = wmsSearchOptsForItem(item);
    var narrow = dateRangeAroundItemAt(item, fallbackDr);
    var raw = [];
    if (item && item.statusLabel === "이동중") {
      raw.push({
        dr: narrow,
        searchOpts: { status: "", searchDateType: SEARCH_DATE_PICKING },
      });
      raw.push({
        dr: fallbackDr,
        searchOpts: { status: "", searchDateType: SEARCH_DATE_PICKING },
      });
    }
    raw.push(
      { dr: narrow, searchOpts: wms },
      { dr: fallbackDr, searchOpts: wms },
      {
        dr: fallbackDr,
        searchOpts: { status: "", searchDateType: SEARCH_DATE_PICKING },
      },
      {
        dr: fallbackDr,
        searchOpts: { status: "", searchDateType: SEARCH_DATE_UNLOAD },
      },
      {
        dr: fallbackDr,
        searchOpts: { status: "", searchDateType: SEARCH_DATE_UPLOAD },
      }
    );
    var seen = Object.create(null);
    var out = [];
    var i, k;
    for (i = 0; i < raw.length; i++) {
      k = detailSearchPlanKey(raw[i]);
      if (seen[k]) continue;
      seen[k] = 1;
      out.push(raw[i]);
    }
    return out;
  }

  function buildPagingUrl(base, page, dr, cartBarcode, searchOpts) {
    var o = searchOpts || {};
    var p = new URLSearchParams();
    p.set("page", String(page == null ? 0 : page));
    p.set("skuBarcode", "");
    p.set("skuExternalId", "");
    p.set("skuId", "");
    p.set("vehicleNumber", String(o.vehicleNumber || "").trim());
    p.set("status", o.status != null ? String(o.status) : "");
    p.set("containerBarcode", "");
    p.set("transferCartPriority", "");
    p.set("toCenterCode", poFcCode());
    p.set("centerCode", "");
    p.set("transferAllocationType", "");
    p.set("transferPlanExternalId", "");
    p.set("cartBarcode", String(cartBarcode || "").trim());
    p.set("searchDateType", o.searchDateType || SEARCH_DATE_UPLOAD);
    p.set("end", dr.endYmd);
    p.set("start", dr.startYmd);
    return base + "?" + p.toString();
  }

  function sleep(ms) {
    var n = Number(ms);
    if (!isFinite(n) || n < 0) n = 0;
    if (n > 120000) n = 120000;
    if (n === 0) return Promise.resolve();
    return new Promise(function (resolve) {
      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        resolve();
      }
      var useBg =
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        typeof chrome.runtime.sendMessage === "function" &&
        chrome.runtime.id;
      if (!useBg) {
        setTimeout(finish, n);
        return;
      }
      try {
        chrome.runtime.sendMessage({ type: "yan4Sleep", ms: n }, function () {
          if (chrome.runtime.lastError) {
            setTimeout(finish, n);
            return;
          }
          finish();
        });
      } catch (eSleep) {
        setTimeout(finish, n);
      }
    });
  }

  function gmXhr(opt) {
    return new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("GM_xmlhttpRequest 필요"));
        return;
      }
      GM_xmlhttpRequest({
        method: opt.method || "GET",
        url: opt.url,
        headers: opt.headers || {},
        timeout: opt.timeout || 120000,
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
        ontimeout: function () {
          reject(new Error("타임아웃"));
        },
      });
    });
  }

  function poManagementPost(body, opt) {
    opt = opt || {};
    var url = PO_MGMT_ORIGIN + PO_LIST_DOWNLOAD_PATH;
    var referer = opt.referer || PO_LIST_REFERER;
    var accept = opt.accept || "application/json, text/javascript, */*; q=0.01";
    return new Promise(function (resolve, reject) {
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        typeof chrome.runtime.sendMessage === "function"
      ) {
        chrome.runtime.sendMessage(
          {
            type: "yan4PoManagementFetch",
            url: url,
            method: "POST",
            referer: referer,
            accept: accept,
            body: body,
            contentType:
              "application/x-www-form-urlencoded; charset=UTF-8",
          },
          function (res) {
            if (chrome.runtime.lastError) {
              gmXhr({
                method: "POST",
                url: url,
                headers: {
                  Accept: accept,
                  Referer: referer,
                  Origin: PO_MGMT_ORIGIN,
                  "X-Requested-With": "XMLHttpRequest",
                  "Content-Type":
                    "application/x-www-form-urlencoded; charset=UTF-8",
                },
                body: body,
              })
                .then(function (text) {
                  resolve({ status: 200, body: text, apiStatus: "" });
                })
                .catch(reject);
              return;
            }
            if (res && res.ok && res.status >= 200 && res.status < 400) {
              resolve({
                status: res.status,
                body: String(res.body || ""),
                apiStatus: res.apiStatus || "",
              });
              return;
            }
            reject(
              new Error(
                (res && res.error) ||
                  "PO Management HTTP " +
                    (res && res.status ? res.status : "?")
              )
            );
          }
        );
        return;
      }
      gmXhr({
        method: "POST",
        url: url,
        headers: {
          Accept: accept,
          Referer: referer,
          Origin: PO_MGMT_ORIGIN,
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type":
            "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: body,
      })
        .then(function (text) {
          resolve({ status: 200, body: text, apiStatus: "" });
        })
        .catch(reject);
    });
  }

  function inboundGet(url, opt) {
    opt = opt || {};
    var referer = opt.referer || TRANSFER_LIST_REFERER;
    var accept = opt.accept || "text/html, */*; q=0.01";
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
            referer: referer,
            accept: accept,
          },
          function (res) {
            if (chrome.runtime.lastError) {
              gmXhr({
                url: url,
                headers: {
                  Accept: accept,
                  Referer: referer,
                  "X-Requested-With": "XMLHttpRequest",
                },
              }).then(resolve, reject);
              return;
            }
            if (res && res.ok && res.status >= 200 && res.status < 400) {
              resolve(String(res.body || ""));
              return;
            }
            reject(new Error((res && res.error) || "inbound fetch 실패"));
          }
        );
        return;
      }
      gmXhr({
        url: url,
        headers: {
          Accept: accept,
          Referer: referer,
          "X-Requested-With": "XMLHttpRequest",
        },
      }).then(resolve, reject);
    });
  }

  function inventoryGet(url, opt) {
    opt = opt || {};
    var referer = opt.referer || url;
    var accept =
      opt.accept || "text/html,application/xhtml+xml,*/*;q=0.8";
    return new Promise(function (resolve, reject) {
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
            accept: accept,
          },
          function (res) {
            if (chrome.runtime.lastError) {
              gmXhr({
                url: url,
                headers: {
                  Accept: accept,
                  Referer: referer,
                  "X-Requested-With": "XMLHttpRequest",
                },
              }).then(resolve, reject);
              return;
            }
            if (res && res.ok && res.status >= 200 && res.status < 400) {
              resolve(String(res.body || ""));
              return;
            }
            reject(new Error((res && res.error) || "inventory fetch 실패"));
          }
        );
        return;
      }
      gmXhr({
        url: url,
        headers: {
          Accept: accept,
          Referer: referer,
          "X-Requested-With": "XMLHttpRequest",
        },
      }).then(resolve, reject);
    });
  }

  function inventoryPostJson(url, bodyObj, opt) {
    opt = opt || {};
    var referer = opt.referer || TOTE_MOVE_REFERER;
    var accept = opt.accept || "application/json, text/plain, */*";
    var contentType = opt.contentType || "application/json";
    var payload = JSON.stringify(bodyObj || {});
    return new Promise(function (resolve, reject) {
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        typeof chrome.runtime.sendMessage === "function"
      ) {
        chrome.runtime.sendMessage(
          {
            type: "yan4InventoryFetch",
            url: url,
            method: "POST",
            referer: referer,
            accept: accept,
            contentType: contentType,
            body: payload,
          },
          function (res) {
            if (chrome.runtime.lastError) {
              gmXhr({
                url: url,
                method: "POST",
                data: payload,
                headers: {
                  Accept: accept,
                  Referer: referer,
                  "Content-Type": contentType,
                  "X-Requested-With": "XMLHttpRequest",
                },
              }).then(resolve, reject);
              return;
            }
            if (res && res.ok && res.status >= 200 && res.status < 400) {
              resolve(String(res.body || ""));
              return;
            }
            if (res && res.ok) {
              reject(new Error("HTTP " + res.status + " POST " + url));
              return;
            }
            gmXhr({
              url: url,
              method: "POST",
              data: payload,
              headers: {
                Accept: accept,
                Referer: referer,
                "Content-Type": contentType,
                "X-Requested-With": "XMLHttpRequest",
              },
            }).then(resolve, reject);
          }
        );
        return;
      }
      gmXhr({
        url: url,
        method: "POST",
        data: payload,
        headers: {
          Accept: accept,
          Referer: referer,
          "Content-Type": contentType,
          "X-Requested-With": "XMLHttpRequest",
        },
      }).then(resolve, reject);
    });
  }

  function getToteStowSearchRange() {
    return defaultDateRange();
  }

  function parseToteMoveInstant(v) {
    if (v instanceof Date) return v;
    if (v == null || v === "") return null;
    if (typeof v === "number" && isFinite(v)) {
      var dn = new Date(v);
      return isNaN(dn.getTime()) ? null : dn;
    }
    var d = parseFlexiblePoDate(v);
    return d && !isNaN(d.getTime()) ? d : null;
  }

  function isToteStowPendingStatus(desc) {
    var st = String(desc || "").trim();
    if (!st) return false;
    if (st.indexOf("진열완료") >= 0) return false;
    if (st.indexOf("진열중") >= 0) return false;
    if (st.indexOf("이동중") >= 0) return false;
    if (st.indexOf("진열대기") >= 0) return true;
    if (/stow.*pending/i.test(st)) return true;
    return false;
  }

  function toteMoveCompletedAt(raw) {
    return (
      parseToteMoveInstant(raw.moveCompletedAt) ||
      parseToteMoveInstant(raw.movedAt)
    );
  }

  function normalizeToteMoveRow(raw) {
    var moveCompletedAt = toteMoveCompletedAt(raw);
    var stowCompletedAt = parseToteMoveInstant(raw.stowCompletedAt);
    var statusDesc = String(raw.statusDesc || "").trim();
    var pending = isToteStowPendingStatus(statusDesc);
    if (!pending && moveCompletedAt && !stowCompletedAt) pending = true;
    if (statusDesc.indexOf("진열완료") >= 0) pending = false;
    var agingAt = null;
    if (pending && moveCompletedAt) {
      agingAt = new Date(
        moveCompletedAt.getTime() + TOTE_AGING_HOURS * 3600000
      );
    }
    return {
      toteBarcode: String(raw.toteBarcode || "").trim(),
      statusDesc: statusDesc,
      moveQuantity: Number(raw.moveQuantity) || 0,
      moveUserLoginId: String(raw.moveUserLoginId || "").trim(),
      movedAt: parseToteMoveInstant(raw.movedAt),
      moveCompletedAt: moveCompletedAt,
      stowQuantity: Number(raw.stowQuantity) || 0,
      stowUserLoginId: String(raw.stowUserLoginId || "").trim(),
      stowCompletedAt: stowCompletedAt,
      pending: pending,
      agingAt: agingAt,
      agingCol: agingAt ? formatPivotDateCol(agingAt) : "",
      skuId: "",
      skuName: "",
      temperature: "",
      tempZone: "",
      rowKey: "",
    };
  }

  function enumerateYmdInclusive(startYmd, endYmd) {
    var out = [];
    var d = parseYmd(startYmd);
    var end = parseYmd(endYmd);
    if (!d || !end || isNaN(d.getTime()) || isNaN(end.getTime())) return out;
    while (d.getTime() <= end.getTime()) {
      out.push(ymdFromDate(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  function isToteMoveApiSuccess(parsed) {
    if (!parsed) return false;
    if (parsed.success === true || parsed.success === "true") return true;
    if (parsed.result && Array.isArray(parsed.result.content)) return true;
    return false;
  }

  function toteMoveApiFailureText(parsed, raw) {
    if (!parsed) {
      var peek = String(raw || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
      if (/^<\s*(!doctype|html)/i.test(peek)) return "HTML응답(로그인 확인)";
      return peek || "JSON 파싱 실패";
    }
    var parts = [];
    if (parsed.message) parts.push(String(parsed.message));
    if (parsed.errorMessage) parts.push(String(parsed.errorMessage));
    if (parsed.error != null && parsed.error !== "") {
      parts.push(
        typeof parsed.error === "string"
          ? parsed.error
          : JSON.stringify(parsed.error)
      );
    }
    if (parsed.code != null) parts.push("code=" + parsed.code);
    if (parsed.result && parsed.result.message) {
      parts.push(String(parsed.result.message));
    }
    if (!parts.length) parts.push("success=" + String(parsed.success));
    return parts.join(" · ");
  }

  function mergeToteStowLinePacks(packs) {
    var seen = Object.create(null);
    var lines = [];
    var rawTotal = 0;
    var i, pack, li, line, sig;
    for (i = 0; i < packs.length; i++) {
      pack = packs[i];
      if (!pack) continue;
      rawTotal += Number(pack.rawTotal) || 0;
      for (li = 0; li < pack.lines.length; li++) {
        line = pack.lines[li];
        sig =
          String(line.toteBarcode || "") +
          "|" +
          (line.moveCompletedAt ? line.moveCompletedAt.getTime() : "") +
          "|" +
          String(line.statusDesc || "");
        if (seen[sig]) continue;
        seen[sig] = 1;
        lines.push(line);
      }
    }
    return {
      lines: lines,
      rawTotal: rawTotal,
      searchDateType: packs[0] ? packs[0].searchDateType : "",
    };
  }

  async function fetchToteMoveSearchPage(payload) {
    var raw = await inventoryPostJson(TOTE_MOVE_SEARCH_URL, payload, {
      referer: TOTE_MOVE_REFERER,
    });
    var parsed = null;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (eParse) {
      throw new Error(toteMoveApiFailureText(null, raw));
    }
    if (!isToteMoveApiSuccess(parsed)) {
      throw new Error(
        "Tote-Move API 거절(" +
          String(payload.searchDateType || "?") +
          "): " +
          toteMoveApiFailureText(parsed, raw)
      );
    }
    if (!parsed.result) throw new Error("Tote-Move API result 누락");
    return parsed.result;
  }

  async function fetchToteStowPendingRowsPaged(
    searchDateType,
    startYmd,
    endYmd,
    statusEl,
    prefix
  ) {
    var pfx = prefix || "";
    var base = {
      searchDateType: searchDateType,
      startDate: startYmd,
      endDate: endYmd,
      status: null,
      isProblemReport: null,
      moveUserLoginId: "",
      stowUserLoginId: "",
      toteBarcode: "",
      page: 0,
      pageSize: TOTE_MOVE_PAGE_SIZE,
    };
    var allRows = [];
    var rawTotal = 0;
    var p = 0;
    var totalPagesGuess = null;
    while (!stopRequested) {
      base.page = p;
      if (statusEl) {
        statusEl.textContent =
          pfx +
          "Tote 진열대기 " +
          searchDateType +
          " " +
          startYmd +
          "~" +
          endYmd +
          " p." +
          (p + 1) +
          "…";
      }
      var res = await fetchToteMoveSearchPage(base);
      var content = Array.isArray(res.content) ? res.content : [];
      rawTotal += content.length;
      if (typeof res.totalPages === "number") totalPagesGuess = res.totalPages;
      var i, row;
      for (i = 0; i < content.length; i++) {
        row = normalizeToteMoveRow(content[i] || {});
        if (!toteBarcodeMatchesSlaZones(row.toteBarcode)) continue;
        if (!row.pending || row.moveQuantity <= 0 || !row.agingAt) continue;
        allRows.push(row);
      }
      if (!!res.last) break;
      if (totalPagesGuess != null && p + 1 >= totalPagesGuess) break;
      p++;
      await sleep(120);
    }
    return { lines: allRows, rawTotal: rawTotal, searchDateType: searchDateType };
  }

  async function fetchToteStowPendingRowsForDateType(
    searchDateType,
    startYmd,
    endYmd,
    statusEl,
    prefix
  ) {
    try {
      return await fetchToteStowPendingRowsPaged(
        searchDateType,
        startYmd,
        endYmd,
        statusEl,
        prefix
      );
    } catch (eFull) {
      var days = enumerateYmdInclusive(startYmd, endYmd);
      if (days.length <= 1) throw eFull;
      var packs = [];
      var di;
      for (di = 0; di < days.length; di++) {
        if (stopRequested) break;
        packs.push(
          await fetchToteStowPendingRowsPaged(
            searchDateType,
            days[di],
            days[di],
            statusEl,
            prefix
          )
        );
      }
      var merged = mergeToteStowLinePacks(packs);
      merged.searchDateType = searchDateType;
      if (merged.rawTotal > 0 || merged.lines.length > 0) return merged;
      throw eFull;
    }
  }

  function agingBarcodeTokensForActiveCenter() {
    if (poFcCode() === "BUC2") return BUC2_AGING_BARCODE_TOKENS;
    return TOTE_STOW_BARCODE_TOKENS;
  }

  function toteBarcodeMatchesSlaZones(barcode) {
    var s = String(barcode || "").trim().toUpperCase();
    if (!s) return false;
    var code = poFcCode();
    var locPrefixes =
      code === "GWJ1"
        ? GWJ1_AGING_LOC_PREFIXES
        : code === "GWJ3"
          ? GWJ3_AGING_LOC_PREFIXES
          : null;
    var i, t, parts;
    if (locPrefixes) {
      for (i = 0; i < locPrefixes.length; i++) {
        t = String(locPrefixes[i] || "").toUpperCase();
        if (t && s.indexOf(t) === 0) return true;
      }
      return false;
    }
    var tokens = agingBarcodeTokensForActiveCenter();
    parts = s.split("-");
    for (i = 0; i < tokens.length; i++) {
      t = String(tokens[i] || "").toUpperCase();
      if (!t) continue;
      if (s.indexOf(t) === 0) return true;
      if (parts.indexOf(t) !== -1) return true;
    }
    return false;
  }

  async function fetchToteStowPendingRows(startYmd, endYmd, statusEl, prefix) {
    var chunks = splitInclusiveRanges(
      startYmd,
      endYmd,
      TOTE_STOW_CHUNK_MAX_DAYS
    );
    if (!chunks.length) {
      chunks = [{ start: startYmd, end: endYmd }];
    }
    var lastErr = null;
    var lastType = "";
    var di, ci, pack, best = null, chunkPacks, merged;
    for (di = 0; di < TOTE_MOVE_SEARCH_DATE_TYPES.length; di++) {
      if (stopRequested) break;
      lastType = TOTE_MOVE_SEARCH_DATE_TYPES[di];
      chunkPacks = [];
      try {
        for (ci = 0; ci < chunks.length; ci++) {
          if (stopRequested) break;
          try {
            pack = await fetchToteStowPendingRowsForDateType(
              lastType,
              chunks[ci].start,
              chunks[ci].end,
              statusEl,
              prefix
            );
            chunkPacks.push(pack);
          } catch (eChunk) {
            lastErr = eChunk;
          }
        }
        merged = mergeToteStowLinePacks(chunkPacks);
        merged.searchDateType = lastType;
        if (merged.lines.length > 0) {
          merged.error = "";
          return merged;
        }
        if (!best || merged.rawTotal > best.rawTotal) best = merged;
      } catch (eTry) {
        lastErr = eTry;
      }
    }
    if (best && (best.rawTotal > 0 || best.lines.length > 0)) {
      best.error = "";
      return best;
    }
    return {
      lines: [],
      rawTotal: 0,
      searchDateType: lastType || TOTE_MOVE_SEARCH_DATE_TYPES[0] || "",
      error: lastErr
        ? String(lastErr.message || lastErr)
        : "Tote API 응답 없음",
    };
  }

  function toteStowRowKeyFromTempZone(zone) {
    if (zone === "Ambient") return TOTE_STOW_ROW_KEYS.Ambient;
    if (zone === "Chilled") return TOTE_STOW_ROW_KEYS.Chilled;
    if (zone === "Frozen") return TOTE_STOW_ROW_KEYS.Frozen;
    return "";
  }

  function toteLineTempZone(line) {
    if (!line) return "";
    if (line.temperature) {
      var fromTemp = directTempZoneFromStorageLabel(line.temperature);
      if (fromTemp) return fromTemp;
    }
    return line.tempZone || "";
  }

  /** 피벗 집계·드릴 필터 동일 기준 (rowKey 비어 있어도 온도로 복원) */
  function toteLineResolvedRowKey(line) {
    if (!line) return "";
    if (line.rowKey && isToteStowPivotRowKey(line.rowKey)) return line.rowKey;
    return toteStowRowKeyFromTempZone(toteLineTempZone(line));
  }

  async function enrichToteStowLinesTemp(lines, statusEl, prefix) {
    var miss = 0;
    var missQty = 0;
    var i, line, pack, zone, rk;
    for (i = 0; i < lines.length; i++) {
      if (stopRequested) break;
      line = lines[i];
      if (statusEl && (i === 0 || (i + 1) % 8 === 0)) {
        statusEl.textContent =
          (prefix || "") + "Tote 온도 " + (i + 1) + "/" + lines.length + "…";
      }
      pack = await fetchToteSkuEnrich(line.toteBarcode);
      line.skuId = pack.skuId;
      line.skuName = pack.skuName;
      line.temperature = pack.temperature;
      zone = toteLineTempZone(line);
      line.tempZone = zone;
      rk = toteStowRowKeyFromTempZone(zone);
      line.rowKey = rk;
      if (!rk) {
        miss++;
        missQty += Number(line.moveQuantity) || 0;
      }
      if (i < lines.length - 1) await sleep(NETWORK_DELAY_MS);
    }
    return { miss: miss, missQty: missQty };
  }

  function buildToteStowPivotFromRows(rows) {
    var matrix = Object.create(null);
    var colSet = Object.create(null);
    var i, row, col, qty, rk, ri;
    for (ri = 0; ri < TOTE_STOW_ROW_KEY_LIST.length; ri++) {
      matrix[TOTE_STOW_ROW_KEY_LIST[ri]] = Object.create(null);
    }
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      rk = toteLineResolvedRowKey(row);
      if (!rk) continue;
      row.rowKey = rk;
      if (!row.tempZone) row.tempZone = toteLineTempZone(row);
      col = row.agingCol;
      if (!col || col === PIVOT_COL_EMPTY) continue;
      qty = row.moveQuantity;
      colSet[col] = 1;
      if (!matrix[rk]) matrix[rk] = Object.create(null);
      if (!matrix[rk][col]) matrix[rk][col] = 0;
      matrix[rk][col] += qty;
    }
    return { matrix: matrix, colSet: colSet };
  }

  function mergePivotTimeColSet(timeCols, colSet, refYear) {
    var merged = Object.create(null);
    var out = [];
    var i;
    if (timeCols) {
      for (i = 0; i < timeCols.length; i++) merged[timeCols[i]] = 1;
    }
    if (colSet) {
      for (var k in colSet) {
        if (Object.prototype.hasOwnProperty.call(colSet, k)) merged[k] = 1;
      }
    }
    for (var ck in merged) {
      if (Object.prototype.hasOwnProperty.call(merged, ck)) out.push(ck);
    }
    return sortPivotTimeCols(merged, refYear);
  }

  function isToteStowPivotRowKey(rowKey) {
    var rk = String(rowKey || "");
    if (!rk || rk === "TOTE_STOW_HDR") return false;
    return rk.indexOf("TOTE_STOW_") === 0;
  }

  function toteLinesForPivotCell(lines, colName, rowKey) {
    var out = [];
    var i;
    var lineRk;
    for (i = 0; i < lines.length; i++) {
      if (colName !== "__TOTAL__" && lines[i].agingCol !== colName) continue;
      if (
        rowKey &&
        rowKey !== "__GRAND__" &&
        isToteStowPivotRowKey(rowKey)
      ) {
        lineRk = toteLineResolvedRowKey(lines[i]);
        if (lineRk !== rowKey) continue;
      }
      out.push(lines[i]);
    }
    out.sort(function (a, b) {
      var ta = a.agingAt ? a.agingAt.getTime() : 0;
      var tb = b.agingAt ? b.agingAt.getTime() : 0;
      if (ta !== tb) return ta - tb;
      return String(a.toteBarcode || "").localeCompare(
        String(b.toteBarcode || ""),
        "ko"
      );
    });
    return out;
  }

  function toteCellHasUrgentSku(colName, rowKey, toteLines, queryAt) {
    var lines = toteLinesForPivotCell(toteLines || [], colName, rowKey);
    var i;
    for (i = 0; i < lines.length; i++) {
      if (
        isSlaDeadlineUrgent(
          lines[i].agingAt,
          queryAt,
          PIVOT_ALERT_HOURS_ROCKETMART
        )
      ) {
        return true;
      }
    }
    return false;
  }

  function parseSkuNameFromSkuHtml(html) {
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    var nodes = doc.querySelectorAll("h1, h2, dt, th, label");
    var i, lab, next;
    for (i = 0; i < nodes.length; i++) {
      lab = normalizeCellText(nodes[i].textContent);
      if (lab === "상품명" || lab.indexOf("상품명") >= 0) {
        next = nodes[i].nextElementSibling;
        if (next) {
          var found = normalizeCellText(next.textContent);
          if (found) return found;
        }
      }
    }
    var h = doc.querySelector("h1, h2");
    if (h) {
      var t = normalizeCellText(h.textContent);
      if (t && t.length > 2) return t;
    }
    return "";
  }

  async function fetchToteSkuEnrich(toteBarcode) {
    var bc = String(toteBarcode || "").trim();
    var out = { skuId: "", skuName: "", temperature: "" };
    if (!bc) return out;
    var cacheKey = normKey(bc);
    if (toteSkuEnrichCache[cacheKey]) return toteSkuEnrichCache[cacheKey];
    try {
      var text = await inventoryGet(buildInventorySearchUrlForLocation(bc), {
        referer: INVENTORY_REFERER,
        accept: "application/json, text/plain, */*",
      });
      var skuId = pickRepresentativeInventorySkuId(
        parseInventorySkuHitsAtGc(text, bc)
      );
      if (!skuId) {
        toteSkuEnrichCache[cacheKey] = out;
        return out;
      }
      out.skuId = skuId;
      await sleep(NETWORK_DELAY_MS);
      var skuHtml = await inventoryGet(INVENTORY_SKU_BASE + skuId, {
        referer: INVENTORY_SKU_BASE + skuId,
      });
      out.temperature = parseStorageTempFromSkuHtml(skuHtml) || "";
      out.skuName = parseSkuNameFromSkuHtml(skuHtml) || "";
      toteSkuEnrichCache[cacheKey] = out;
      return out;
    } catch (eTote) {
      toteSkuEnrichCache[cacheKey] = out;
      return out;
    }
  }

  async function fetchExcelArrayBuffer(queryString) {
    var url = INBOUND_ORIGIN + TRANSFER_EXCEL_PATH + "?" + queryString;
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
            referer: TRANSFER_LIST_REFERER,
            accept:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8",
            responseType: "arraybuffer",
          },
          function (res) {
            if (chrome.runtime.lastError) {
              reject(
                new Error(
                  chrome.runtime.lastError.message || "inbound excel fetch 실패"
                )
              );
              return;
            }
            var status = res && res.status;
            if (!res || res.ok === false || (status && status >= 400)) {
              reject(
                new Error(
                  TRANSFER_EXCEL_PATH +
                    " HTTP " +
                    (status || "?") +
                    ((res && res.error) ? " (" + res.error + ")" : "") +
                    " — EXE Coupang 로그인 후 다시 시도"
                )
              );
              return;
            }
            try {
              var b64 = String(res.base64 || "");
              if (!b64) {
                reject(new Error("엑셀 응답이 비어 있습니다"));
                return;
              }
              var bin = atob(b64);
              var bytes = new Uint8Array(bin.length);
              for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              resolve(bytes.buffer);
            } catch (eDec) {
              reject(eDec);
            }
          }
        );
      });
    }
    var res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!res.ok) {
      throw new Error(TRANSFER_EXCEL_PATH + " HTTP " + res.status);
    }
    var buf = await res.arrayBuffer();
    if (!buf || buf.byteLength < 400) {
      var peek = new TextDecoder("utf-8", { fatal: false }).decode(
        new Uint8Array(buf.slice(0, 500))
      );
      if (/^[\s\S]{0,500}<\s*html/i.test(peek)) {
        throw new Error("엑셀 API HTML 응답(권한 확인)");
      }
    }
    return buf;
  }

  function findColIndexExact(headers, candidates) {
    var i, c, cn, h;
    for (c = 0; c < candidates.length; c++) {
      cn = normKey(candidates[c]);
      for (i = 0; i < headers.length; i++) {
        h = normKey(headers[i]);
        if (h === cn) return i;
      }
    }
    return -1;
  }

  function findColIndex(headers, candidates) {
    var i, c, cn, h;
    for (c = 0; c < candidates.length; c++) {
      cn = normKey(candidates[c]);
      for (i = 0; i < headers.length; i++) {
        h = normKey(headers[i]);
        if (h === cn || h.indexOf(cn) >= 0 || cn.indexOf(h) >= 0) {
          return i;
        }
      }
    }
    return -1;
  }

  function findAllColIndices(headers, candidates) {
    var out = [];
    var i, c, cn, h;
    for (i = 0; i < headers.length; i++) {
      h = normKey(headers[i]);
      for (c = 0; c < candidates.length; c++) {
        cn = normKey(candidates[c]);
        if (h === cn || h.indexOf(cn) >= 0 || cn.indexOf(h) >= 0) {
          out.push(i);
          break;
        }
      }
    }
    return out;
  }

  function findTransferHeaderMap(aoa) {
    var r, row, headers, iTote, iQty, iUnload, iLoad, prioCols;
    for (r = 0; r < Math.min(8, aoa.length); r++) {
      row = aoa[r];
      if (!row || !row.length) continue;
      headers = row.map(function (x) {
        return normalizeCellText(x);
      });
      iTote = findColIndex(headers, ["토트바코드"]);
      iQty = findColIndex(headers, ["집품수량"]);
      iUnload = findColIndex(headers, [
        "하차완료일시",
        "하차완료 일시",
        "하차완료시간",
        "하차완료 시간",
        "하차 완료 시간",
        "하차완료시각",
        "하차일시",
        "하차 일시",
      ]);
      iLoad = findColIndex(headers, [
        "상차완료일시",
        "상차완료 일시",
        "상차완료시간",
        "상차완료 시간",
        "상차 완료 시간",
        "상차완료시각",
        "상차일시",
        "상차 일시",
      ]);
      var iPick = findColIndex(headers, [
        "집품완료일시",
        "집품완료 일시",
        "집품완료시간",
        "집품완료 시간",
        "집품 완료 시간",
        "집품완료시각",
        "집품일시",
        "집품 일시",
      ]);
      prioCols = findAllColIndices(headers, ["우선순위", "우선 순위"]);
      var iVehicle = findColIndex(headers, ["차량번호", "차량 번호"]);
      var iCt = findColIndex(headers, [
        "컨테이너 바코드",
        "컨테이너바코드",
        "container barcode",
        "containerbarcode",
        "CT",
        "Ct",
      ]);
      var iFromCenter = findColIndex(headers, [
        "보내는 센터",
        "보내는센터",
        "보내는 센터코드",
        "from center",
        "fromcenter",
        "fromcentercode",
      ]);
      var iTransferPlan = findColIndex(headers, [
        "이관계획번호",
        "이관계획 번호",
        "이관 계획번호",
        "이관계획",
        "transferplanexternalid",
        "transfer plan external id",
        "transfer plan",
      ]);
      if (iTote >= 0 && iQty >= 0) {
        return {
          headerRow: r,
          idxTote: iTote,
          idxQty: iQty,
          idxUnload: iUnload,
          idxLoad: iLoad,
          idxPick: iPick,
          idxVehicle: iVehicle,
          idxCt: iCt,
          idxFromCenter: iFromCenter,
          idxTransferPlan: iTransferPlan,
          idxPriority1: prioCols.length >= 1 ? prioCols[0] : -1,
          idxPriority2: prioCols.length >= 2 ? prioCols[1] : -1,
        };
      }
    }
    return null;
  }

  function excelSerialToDate(n) {
    if (!isFinite(n) || n < 1) return null;
    var ms = Math.round((n - 25569) * 86400000);
    var d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  function parseDateTimeCell(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date && !isNaN(v.getTime())) return v;
    if (typeof v === "number" && isFinite(v)) {
      return excelSerialToDate(v);
    }
    var s = normalizeCellText(v);
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s.replace(/,/g, ""))) {
      var serial = parseFloat(s.replace(/,/g, ""));
      if (isFinite(serial) && serial > 30000) {
        var fromSerial = excelSerialToDate(serial);
        if (fromSerial) return fromSerial;
      }
    }
    var m = s.match(
      /(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/
    );
    if (m) {
      var d = new Date(
        +m[1],
        +m[2] - 1,
        +m[3],
        +m[4],
        +m[5],
        m[6] != null ? +m[6] : 0,
        0
      );
      return isNaN(d.getTime()) ? null : d;
    }
    m = s.match(
      /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(?:오전|오후)?\s*(\d{1,2}):(\d{2})/
    );
    if (m) {
      var hr = +m[4];
      if (/오후/.test(s) && hr < 12) hr += 12;
      if (/오전/.test(s) && hr === 12) hr = 0;
      var dKr = new Date(+m[1], +m[2] - 1, +m[3], hr, +m[5], 0, 0);
      return isNaN(dKr.getTime()) ? null : dKr;
    }
    m = s.match(/(\d{2})\/(\d{2})[ T](\d{1,2}):(\d{2})/);
    if (m) {
      var yr = new Date().getFullYear();
      var d2 = new Date(+yr, +m[1] - 1, +m[2], +m[3], +m[4], 0, 0);
      return isNaN(d2.getTime()) ? null : d2;
    }
    m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ T](\d{1,2}):(\d{2})/);
    if (m) {
      var y = +m[3];
      if (y < 100) y += 2000;
      var dUs = new Date(y, +m[1] - 1, +m[2], +m[4], +m[5], 0, 0);
      return isNaN(dUs.getTime()) ? null : dUs;
    }
    return null;
  }

  function sheetCellDate(sh, r, c) {
    if (!sh || c < 0) return null;
    var addr = XLSX.utils.encode_cell({ r: r, c: c });
    var cell = sh[addr];
    if (!cell) return null;
    if (cell.t === "d" && cell.v instanceof Date && !isNaN(cell.v.getTime())) {
      return cell.v;
    }
    var raw = cell.w != null && String(cell.w).trim() !== "" ? cell.w : cell.v;
    return parseDateTimeCell(raw);
  }

  function parseQtyCell(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number" && isFinite(v)) return v;
    var n = parseFloat(
      String(v).replace(/,/g, "").replace(/\s+/g, "").trim()
    );
    return isFinite(n) ? n : 0;
  }

  function parseTransferSheetRows(buf, statusLabel) {
    if (typeof XLSX === "undefined") {
      throw new Error("XLSX 라이브러리 없음");
    }
    var wb = XLSX.read(buf, { type: "array", cellText: true, cellDates: true });
    var sn = wb.SheetNames && wb.SheetNames[0];
    if (!sn) return [];
    var sh = wb.Sheets[sn];
    if (!sh) return [];
    var aoa = XLSX.utils.sheet_to_json(sh, {
      header: 1,
      defval: "",
      raw: false,
    });
    var map = findTransferHeaderMap(aoa);
    if (!map) return [];
    var out = [];
    var r, row, gc, qty, unloadAt, loadAt, pickAt, prio1, prio2;
    for (r = map.headerRow + 1; r < aoa.length; r++) {
      row = aoa[r];
      if (!row || !row.length) continue;
      gc = normalizeCellText(row[map.idxTote]).toUpperCase();
      if (!gc) continue;
      qty = parseQtyCell(row[map.idxQty]);
      if (!qty) continue;
      unloadAt = sheetCellDate(sh, r, map.idxUnload);
      loadAt = sheetCellDate(sh, r, map.idxLoad);
      pickAt =
        map.idxPick != null && map.idxPick >= 0
          ? sheetCellDate(sh, r, map.idxPick)
          : null;
      prio1 =
        map.idxPriority1 >= 0
          ? normalizeCellText(row[map.idxPriority1])
          : "";
      prio2 =
        map.idxPriority2 >= 0
          ? normalizeCellText(row[map.idxPriority2])
          : "";
      out.push({
        gc: gc,
        qty: qty,
        unloadAt: unloadAt,
        loadAt: loadAt,
        pickAt: pickAt,
        ct:
          map.idxCt >= 0 ? normalizeCtKey(row[map.idxCt]) : "",
        fromCenter:
          map.idxFromCenter >= 0
            ? normalizeCellText(row[map.idxFromCenter])
            : "",
        vehicleNo:
          map.idxVehicle >= 0
            ? normalizeCellText(row[map.idxVehicle])
            : "",
        transferPlanNo:
          map.idxTransferPlan >= 0
            ? normalizeCellText(row[map.idxTransferPlan])
            : "",
        priority1: prio1,
        priority2: prio2,
        statusLabel: statusLabel,
      });
    }
    return out;
  }

  function normalizeSlaLookupKey(v) {
    return String(v != null ? v : "")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function expandScientificNumberString(s) {
    var t = String(s || "").replace(/\s+/g, "").trim();
    if (!/^\d+(\.\d+)?[eE][+\-]?\d+$/.test(t)) return t;
    var n = Number(t);
    if (!isFinite(n)) return t;
    return String(Math.round(n));
  }

  function normalizeSlaBarcodeKey(v) {
    var s = normalizeSlaLookupKey(v);
    if (!s) return "";
    s = expandScientificNumberString(s);
    if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
    if (/^\d+\.\d+$/.test(s)) {
      var asNum = Number(s);
      if (isFinite(asNum) && asNum >= 1e10) s = String(Math.round(asNum));
    }
    return s.replace(/\s+/g, "");
  }

  function formatBarcodeFromNumber(n) {
    if (typeof n !== "number" || !isFinite(n)) return "";
    var rounded = Math.round(n);
    if (Math.abs(n - rounded) < 1e-9) return String(rounded);
    return String(n);
  }

  /** SLA barcode — cell.w is often scientific; cell.v keeps full digits */
  function sheetBarcodeCellText(sh, r, c) {
    if (!sh || c < 0) return "";
    var addr = XLSX.utils.encode_cell({ r: r, c: c });
    var cell = sh[addr];
    if (!cell) return "";
    if (cell.t === "s" || cell.t === "str") {
      return normalizeSlaBarcodeKey(
        String(cell.v != null ? cell.v : cell.w || "")
      );
    }
    if (cell.t === "n" && typeof cell.v === "number" && isFinite(cell.v)) {
      return formatBarcodeFromNumber(cell.v);
    }
    var w = cell.w != null ? String(cell.w).trim() : "";
    if (w && /^\d+$/.test(w.replace(/\s/g, ""))) {
      return w.replace(/\s/g, "");
    }
    if (typeof cell.v === "number" && isFinite(cell.v)) {
      return formatBarcodeFromNumber(cell.v);
    }
    return normalizeSlaBarcodeKey(w || (cell.v != null ? String(cell.v) : ""));
  }

  function normalizeGcKey(v) {
    return String(v || "")
      .replace(/\u00a0/g, " ")
      .trim()
      .toUpperCase();
  }

  function isGcBarcodeKey(v) {
    return /^GC-/i.test(normalizeGcKey(v));
  }

  function slaCreatedAtMs(rec) {
    var n = rec && rec.createdAtMs;
    return typeof n === "number" && isFinite(n) ? n : NaN;
  }

  /** 같은 GC는 createdat이 더 최근인 행. 날짜가 없으면 있는 쪽을 남김 */
  function slaRecordIsNewer(rec, prev) {
    if (!prev) return true;
    var nextMs = slaCreatedAtMs(rec);
    var prevMs = slaCreatedAtMs(prev);
    if (!isFinite(prevMs)) return isFinite(nextMs);
    if (!isFinite(nextMs)) return false;
    return nextMs > prevMs;
  }

  function slaRowsLatestCreated(rows) {
    if (!rows || rows.length < 2) return rows || [];
    var best = NaN;
    var i, ms, out;
    for (i = 0; i < rows.length; i++) {
      ms = slaCreatedAtMs(rows[i]);
      if (isFinite(ms) && (!isFinite(best) || ms > best)) best = ms;
    }
    if (!isFinite(best)) return rows;
    out = [];
    for (i = 0; i < rows.length; i++) {
      if (slaCreatedAtMs(rows[i]) === best) out.push(rows[i]);
    }
    return out.length ? out : rows;
  }

  function slaRcrtAgingDedupeKey(rec) {
    var id = "";
    if (rec) {
      id = rec.skuId || rec.externalId || rec.barcode || "";
    }
    return normalizeGcKey(rec && rec.gc) + "|" + String(id);
  }

  /** FULLNAME 이 RCRT18/RCRT88 이면 88 에이징 행. 마감은 createdat+24h, 열은 월/일 */
  function slaRecordToRcrtAgingLine(rec) {
    if (!rec || !toteBarcodeMatchesSlaZones(rec.gc)) return null;
    var qty = Number(rec.quantity) || 0;
    if (qty <= 0) return null;
    if (!isFinite(slaCreatedAtMs(rec))) return null;
    var createdAt = new Date(rec.createdAtMs);
    if (isNaN(createdAt.getTime())) return null;
    var agingAt = new Date(createdAt.getTime() + TOTE_AGING_HOURS * 3600000);
    var temperature = String(rec.temperature || "").trim();
    var zone = directTempZoneFromStorageLabel(temperature);
    return {
      toteBarcode: rec.gc,
      statusDesc: "SLA",
      moveQuantity: qty,
      moveUserLoginId: "",
      movedAt: createdAt,
      moveCompletedAt: createdAt,
      stowQuantity: 0,
      stowUserLoginId: "",
      stowCompletedAt: null,
      pending: true,
      agingAt: agingAt,
      agingCol: formatPivotDateCol(agingAt),
      skuId: rec.skuId || rec.externalId || "",
      skuName: rec.unitDescription || "",
      temperature: temperature,
      tempZone: zone,
      rowKey: toteStowRowKeyFromTempZone(zone),
    };
  }

  function slaRcrtAgingLinesFromRecords(byKey) {
    var lines = [];
    var key, line;
    for (key in byKey) {
      if (!Object.prototype.hasOwnProperty.call(byKey, key)) continue;
      line = slaRecordToRcrtAgingLine(byKey[key]);
      if (line) lines.push(line);
    }
    return lines;
  }

  function storeSlaGcRecord(byGc, gc, rec) {
    var key = normalizeGcKey(gc);
    if (!isGcBarcodeKey(key)) return;
    var prev = byGc[key];
    if (!prev || slaRecordIsNewer(rec, prev)) byGc[key] = rec;
  }

  function findSlaHeaderMap(aoa) {
    var r, row, headers, i;
    for (r = 0; r < Math.min(6, aoa.length); r++) {
      row = aoa[r];
      if (!row || !row.length) continue;
      headers = row.map(function (x) {
        return normalizeCellText(x);
      });
      var map = {
        headerRow: r,
        idxSkuId: findColIndex(headers, ["skuid", "sku id"]),
        idxExtId: findColIndex(headers, ["externalid", "external id", "external skuid"]),
        idxBarcode: findColIndex(headers, ["barcode", "바코드"]),
        idxTemp: findColIndex(headers, ["temperature", "온도대", "온도"]),
        idxZone: findColIndex(headers, ["zone"]),
        idxQty: findColIndex(headers, ["quantity", "수량"]),
        idxCreatedAt: findColIndex(headers, ["createdat", "created at"]),
        idxCate2: findColIndex(headers, ["cate2"]),
        idxCate3: findColIndex(headers, ["cate3"]),
        idxCate4: findColIndex(headers, ["cate4"]),
        idxCate5: findColIndex(headers, ["cate5"]),
        idxType: findColIndex(headers, ["type"]),
        idxUnitDesc: findColIndex(headers, ["skuname", "sku name", "상품명"]),
        idxFromCenter: findColIndex(headers, [
          "보내는 센터",
          "보내는센터",
          "보내는 센터코드",
          "from center",
          "fromcenter",
          "fromcentercode",
        ]),
        idxGc: findColIndex(headers, [
          "fullname",
          "full name",
          "gc",
          "토트바코드",
          "토트 바코드",
          "cartbarcode",
          "cart barcode",
        ]),
      };
      if (
        map.idxSkuId >= 0 ||
        map.idxExtId >= 0 ||
        map.idxBarcode >= 0 ||
        map.idxGc >= 0
      ) {
        return map;
      }
    }
    return null;
  }

  function parseSlaFileLookup(buf) {
    if (typeof XLSX === "undefined") {
      throw new Error("XLSX 라이브러리 없음");
    }
    var wb = XLSX.read(buf, { type: "array", cellText: true, cellDates: true });
    var sn = wb.SheetNames && wb.SheetNames[0];
    if (!sn) {
      throw new Error("SLA 워크북 시트 없음");
    }
    var sh = wb.Sheets[sn];
    if (!sh || !sh["!ref"]) {
      throw new Error('시트 "' + sn + '" 비어 있음');
    }
    var aoa = XLSX.utils.sheet_to_json(sh, {
      header: 1,
      defval: "",
      raw: false,
    });
    var map = findSlaHeaderMap(aoa);
    if (!map) {
      throw new Error(
        "SLA 헤더 인식 실패 — FULLNAME(GC)/skuid/barcode 열 필요 · 시트: " +
          sn
      );
    }
    var bySkuId = Object.create(null);
    var byExtId = Object.create(null);
    var byBarcode = Object.create(null);
    var byGc = Object.create(null);
    var byGcAll = Object.create(null);
    var rcrtAgingByKey = Object.create(null);
    var directLocBySkuId = Object.create(null);
    var directLocByExtId = Object.create(null);
    var rowCount = 0;
    var r, row, rec, skuId, extId, barcode, gcKey, qty;
    for (r = map.headerRow + 1; r < aoa.length; r++) {
      row = aoa[r];
      if (!row || !row.length) continue;
      skuId =
        map.idxSkuId >= 0
          ? normalizeSlaLookupKey(row[map.idxSkuId]).replace(/\D/g, "")
          : "";
      extId =
        map.idxExtId >= 0 ? normalizeSlaLookupKey(row[map.idxExtId]) : "";
      barcode =
        map.idxBarcode >= 0
          ? sheetBarcodeCellText(sh, r, map.idxBarcode) ||
            normalizeSlaBarcodeKey(row[map.idxBarcode])
          : "";
      gcKey =
        map.idxGc >= 0 ? normalizeGcKey(row[map.idxGc]) : "";
      if (!skuId && !extId && !barcode && !gcKey) continue;
      qty = map.idxQty >= 0 ? parseQtyCell(row[map.idxQty]) : 0;
      var createdAt = null;
      if (map.idxCreatedAt >= 0) {
        createdAt = sheetCellDate(sh, r, map.idxCreatedAt);
        if (!createdAt) createdAt = parseDateTimeCell(row[map.idxCreatedAt]);
      }
      rec = {
        skuId: skuId,
        externalId: extId,
        barcode: barcode,
        gc: gcKey,
        temperature:
          map.idxTemp >= 0
            ? normalizeSlaLookupKey(row[map.idxTemp]).toUpperCase()
            : "",
        zone:
          map.idxZone >= 0
            ? normalizeSlaLookupKey(row[map.idxZone]).toUpperCase()
            : "",
        quantity: qty,
        createdAtMs:
          createdAt && !isNaN(createdAt.getTime()) ? createdAt.getTime() : NaN,
        cate2:
          map.idxCate2 >= 0 ? normalizeSlaLookupKey(row[map.idxCate2]) : "",
        cate3:
          map.idxCate3 >= 0 ? normalizeSlaLookupKey(row[map.idxCate3]) : "",
        cate4:
          map.idxCate4 >= 0 ? normalizeSlaLookupKey(row[map.idxCate4]) : "",
        cate5:
          map.idxCate5 >= 0 ? normalizeSlaLookupKey(row[map.idxCate5]) : "",
        type: map.idxType >= 0 ? normalizeSlaLookupKey(row[map.idxType]) : "",
        unitDescription:
          map.idxUnitDesc >= 0
            ? normalizeSlaLookupKey(row[map.idxUnitDesc])
            : "",
        fromCenter:
          map.idxFromCenter >= 0
            ? normalizeSlaLookupKey(row[map.idxFromCenter])
            : "",
      };
      rowCount++;
      if (skuId) bySkuId[skuId] = rec;
      if (extId) byExtId[extId] = rec;
      if (barcode) byBarcode[barcode] = rec;
      if (gcKey && isGcBarcodeKey(gcKey)) {
        storeSlaGcRecord(byGc, gcKey, rec);
        var gcNorm = normalizeGcKey(gcKey);
        if (!byGcAll[gcNorm]) byGcAll[gcNorm] = [];
        byGcAll[gcNorm].push(rec);
      } else if (gcKey && toteBarcodeMatchesSlaZones(gcKey)) {
        var rcrtKey = slaRcrtAgingDedupeKey(rec);
        var prevRcrt = rcrtAgingByKey[rcrtKey];
        if (!prevRcrt || slaRecordIsNewer(rec, prevRcrt)) {
          rcrtAgingByKey[rcrtKey] = rec;
        }
      } else if (gcKey && isSlaDirectRcrtLoc(gcKey)) {
        // 직납 로케이션(1007-RCRT2/3/4/22/44): SKU 별로 FULLNAME 전부 + quantity 합계 유지
        pushSlaDirectLoc(directLocBySkuId, skuId, gcKey, qty, skuId);
        pushSlaDirectLoc(
          directLocByExtId,
          normalizeDirectSkuJoinKey(extId),
          gcKey,
          qty,
          skuId
        );
      }
    }
    if (!rowCount) {
      throw new Error("SLA 데이터 행 없음");
    }
    var gcCount = Object.keys(byGc).length;
    if (!gcCount) {
      throw new Error(
        "SLA에 GC(FULLNAME) 행 없음 — FULLNAME 열에 GC- 바코드 확인"
      );
    }
    return {
      sheetName: sn,
      rowCount: rowCount,
      gcCount: gcCount,
      byGc: byGc,
      byGcAll: byGcAll,
      bySkuId: bySkuId,
      byExtId: byExtId,
      byBarcode: byBarcode,
      rcrtAgingLines: slaRcrtAgingLinesFromRecords(rcrtAgingByKey),
      directLocBySkuId: directLocBySkuId,
      directLocByExtId: directLocByExtId,
    };
  }

  /**
   * 센터별 직납 RCRT 로케이션 접두어 (직납 드릴 RCRT·SLA FULLNAME·inventory 조회 공통).
   * YAN4 는 사용자 지정, GWJ1·GWJ3·BUC2 는 ATS 화면(yan4-ats-page.js) 직납 목록과 같음.
   * 에이징(YAN4 RCRT18/88, GWJ1 177-RCRT3-9-, GWJ3 140-RCRT3-5-)은 포함하지 않음. 목록 없는 센터는 없음.
   */
  var DIRECT_RCRT_PREFIXES_BY_CENTER = {
    YAN4: [
      "1007-RCRT2-",
      "1007-RCRT3-",
      "1007-RCRT4-",
      "1007-RCRT22-",
      "1007-RCRT44-",
    ],
    GWJ1: [
      "177-RCRT3-1-",
      "177-RCRT3-2-",
      "177-RCRT3-3-",
      "177-RCRT3-4-",
      "177-RCRT3-5-",
      "177-RCRT3-6-",
      "177-RCRT3-7-",
      "177-RCRT3-8-",
    ],
    GWJ3: [
      "140-RCRT1-1-",
      "140-RCRT1-2-",
      "140-RCRT1-3-",
      "140-RCRT1-4-",
      "140-RCRT1-5-",
      "140-RCRT1-6-",
      "140-RCRT1-7-",
    ],
    BUC2: [
      "81-RCRT31-",
      "81-RCRT32-",
      "81-RCRT33-",
      "81-RCRT34-",
      "81-RCRT41-",
      "81-RCRT42-",
      "81-RCRT43-",
      "81-RCRT44-",
      "81-RCRT51-",
      "81-RCRT52-",
      "81-RCRT53-",
      "81-RCRT54-",
      "81-RCRT61-",
      "81-RCRT62-",
      "81-RCRT63-",
      "81-RCRT64-",
      "81-RCRT71-",
      "81-RCRT72-",
      "81-RCRT73-",
      "81-RCRT74-",
    ],
  };

  function isSlaDirectRcrtLoc(loc) {
    var s = String(loc || "").trim().toUpperCase();
    var prefixes = DIRECT_RCRT_PREFIXES_BY_CENTER[poFcCode()] || [];
    var i;
    if (!s) return false;
    for (i = 0; i < prefixes.length; i++) {
      if (s.indexOf(prefixes[i]) === 0) return true;
    }
    return false;
  }

  /* shell.js(inventory RCRT 조회)도 같은 기준을 쓰도록 공개 */
  window.__YAN4_DIRECT_RCRT__ = { isDirect: isSlaDirectRcrtLoc };

  /** skuId: SLA 행의 내부 skuid — inventory 로케이션 조회 결과에서 이 SKU 수량만 고를 때 씀 */
  function pushSlaDirectLoc(bucket, key, loc, qty, skuId) {
    if (!key || !loc) return;
    var list = bucket[key];
    if (!list) list = bucket[key] = [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].loc === loc) {
        list[i].qty += Number(qty) || 0;
        if (!list[i].skuId && skuId) list[i].skuId = skuId;
        return;
      }
    }
    list.push({ loc: loc, qty: Number(qty) || 0, skuId: skuId || "" });
  }

  /**
   * 직납 드릴 RCRT·유닛 — SLA FULLNAME(skuid 우선, 없으면 externalid). GC-·에이징 제외.
   * [{ loc, qty, skuId }] · qty 는 같은 SKU + 같은 FULLNAME 행의 quantity 합계
   */
  function slaDirectLocEntriesForSku(lookup, sku) {
    if (!lookup || !sku) return [];
    var internal = normalizeShrinkInternalSkuKey(sku);
    var list =
      internal && lookup.directLocBySkuId
        ? lookup.directLocBySkuId[internal]
        : null;
    if (!list || !list.length) {
      var ext = normalizeDirectSkuJoinKey(sku);
      list =
        ext && lookup.directLocByExtId ? lookup.directLocByExtId[ext] : null;
    }
    if (!list || !list.length) return [];
    return list.map(function (e) {
      return { loc: e.loc, qty: e.qty, skuId: e.skuId || "" };
    });
  }

  /** SLA 파일 RCRT 유닛 합계 — SLA 에 직납 RCRT 가 없으면 null */
  function slaRcrtUnitsForSku(lookup, sku) {
    var entries = slaDirectLocEntriesForSku(lookup, sku);
    if (!entries.length) return null;
    var total = 0;
    var i;
    for (i = 0; i < entries.length; i++) total += Number(entries[i].qty) || 0;
    return total;
  }

  function pickSlaRecordForGc(lookup, gc) {
    if (!lookup || !lookup.byGc) return null;
    return lookup.byGc[normalizeGcKey(gc)] || null;
  }

  function slaGcHasUsableTemp(slaLookup, gc) {
    var rec = pickSlaRecordForGc(slaLookup, gc);
    if (!rec) return false;
    var temp = String(rec.temperature || "").trim().toUpperCase();
    return temp === "FROZEN" || temp === "CHILLED" || temp === "AMBIENT";
  }

  function normalizeCtKey(ct) {
    return String(ct || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, "")
      .trim()
      .toUpperCase();
  }

  function isAdhocVehicle(vehicleNo) {
    var v = String(vehicleNo || "").replace(/\s+/g, "").trim();
    return v === "0000" || v === "1111" || v === "9999";
  }

  /** 드릴다운 "하차완료시간" 열 값 — 이동중 임의상차는 하차시간이 없어 집품완료 일시로 대체 */
  function drillUnloadColDate(item) {
    if (!item) return null;
    if (
      isAdhocVehicle(item.vehicleNo) &&
      item.statusLabel === "이동중"
    ) {
      if (item.pickAt && !isNaN(item.pickAt.getTime())) return item.pickAt;
    }
    if (item.unloadAt && !isNaN(item.unloadAt.getTime())) return item.unloadAt;
    if (item.pickAt && !isNaN(item.pickAt.getTime())) return item.pickAt;
    return item.unloadAt || null;
  }

  function hasSlaGcEntry(slaLookup, gc) {
    if (!slaLookup) return false;
    var key = normalizeGcKey(gc);
    if (slaLookup.byGc && slaLookup.byGc[key]) return true;
    if (
      slaLookup.byGcAll &&
      slaLookup.byGcAll[key] &&
      slaLookup.byGcAll[key].length
    ) {
      return true;
    }
    return false;
  }

  function slaRowMetaForItem(item, slaLookup) {
    if (!hasSlaGcEntry(slaLookup, item.gc)) {
      return { key: "UNKNOWN", frozen: false, label: "" };
    }
    var gc = normalizeGcKey(item.gc);
    var slaRec = pickSlaRecordForGc(slaLookup, item.gc);
    if (
      !slaRec &&
      slaLookup &&
      slaLookup.byGcAll &&
      slaLookup.byGcAll[gc] &&
      slaLookup.byGcAll[gc].length
    ) {
      slaRec = slaRowsLatestCreated(slaLookup.byGcAll[gc])[0];
    }
    var meta = pivotRowKeyFromSlaRecord(
      slaRec,
      item.priority1,
      item.priority2
    );
    if (meta.key === "UNKNOWN" && slaRec) {
      return {
        key: "ROCKETMART",
        frozen: false,
        rocketMart: true,
        label: "RocketMart",
      };
    }
    return meta;
  }

  async function buildCtStorageCache(allRows, slaLookup, dr, statusEl) {
    var ctRep = Object.create(null);
    var gcNoCt = Object.create(null);
    var gcMissingSla = Object.create(null);
    var i, row, ct, cts, gcs, missingGcs, label, enrich;
    for (i = 0; i < allRows.length; i++) {
      row = allRows[i];
      if (slaGcHasUsableTemp(slaLookup, row.gc)) continue;
      /* SLA에 GC 있음(온도 빈칸 포함) → 피벗은 RM·온도대로 처리, CT API 불필요 */
      if (hasSlaGcEntry(slaLookup, row.gc)) continue;
      /* 상품명 fallback 재고조회는 진열대기·진열중만 (이동중은 CT/차량 대표 GC 온도조회만) */
      if (
        isGcBarcodeKey(row.gc) &&
        (row.statusLabel === "진열대기" || row.statusLabel === "진열중")
      ) {
        gcMissingSla[normalizeGcKey(row.gc)] = row;
      }
      ct = normalizeCtKey(row.ct);
      if (ct) {
        if (!ctRep[ct]) ctRep[ct] = row;
      } else if (isAdhocVehicle(row.vehicleNo)) {
        gcNoCt[row.gc] = row;
      }
    }
    var cache = Object.create(null);
    var ctHits = 0;
    cts = Object.keys(ctRep);
    gcs = Object.keys(gcNoCt);
    for (i = 0; i < cts.length; i++) {
      if (stopRequested) break;
      row = ctRep[cts[i]];
      if (statusEl) {
        statusEl.textContent =
          "CT 온도대 " +
          (i + 1) +
          "/" +
          cts.length +
          " · " +
          cts[i] +
          " · " +
          row.gc;
      }
      enrich = await enrichGcZone(
        row.gc,
        dr,
        wmsSearchOptsForItem(row),
        row
      );
      cache[cts[i]] =
        enrich && enrich.storageLabel ? enrich.storageLabel : "";
      if (cache[cts[i]]) ctHits++;
      if (i + 1 < cts.length) await sleep(NETWORK_DELAY_MS);
    }
    for (i = 0; i < gcs.length; i++) {
      if (stopRequested) break;
      row = gcNoCt[gcs[i]];
      if (statusEl) {
        statusEl.textContent =
          "임의상차 GC " + (i + 1) + "/" + gcs.length + " · " + row.gc;
      }
      await enrichGcZone(row.gc, dr, wmsSearchOptsForItem(row), row);
      if (i + 1 < gcs.length) await sleep(NETWORK_DELAY_MS);
    }
    /** SLA GC 매칭 실패 · 진열대기/진열중만 — 드릴다운 상품명·유닛·바코드용 재고조회 */
    missingGcs = Object.keys(gcMissingSla);
    for (i = 0; i < missingGcs.length; i++) {
      if (stopRequested) break;
      if (
        Object.prototype.hasOwnProperty.call(
          inventoryGcFallbackCache,
          missingGcs[i]
        )
      ) {
        continue;
      }
      if (statusEl) {
        statusEl.textContent =
          "GC 상품정보 " +
          (i + 1) +
          "/" +
          missingGcs.length +
          " · " +
          missingGcs[i];
      }
      await fetchSkuIdFromInventoryLocation(missingGcs[i]);
      if (i + 1 < missingGcs.length) await sleep(NETWORK_DELAY_MS);
    }
    return {
      ctStorage: cache,
      ctCount: cts.length,
      ctHits: ctHits,
      gcNoCtCount: gcs.length,
    };
  }

  function resolveRowMetaForAdhocVehicle(item, slaLookup) {
    var rowMeta = slaRowMetaForItem(item, slaLookup);
    if (rowMeta.key !== "UNKNOWN") return rowMeta;
    var cached = gcEnrichCache[item.gc];
    if (cached && cached.storageLabel) {
      return pivotRowKeyFromStorage(
        cached.storageLabel,
        item.priority1,
        item.priority2
      );
    }
    return { key: "UNKNOWN", frozen: false, label: "" };
  }

  function resolvePivotPlacement(item, slaLookup, ctStorageCache, queryAt) {
    /* 임의상차 차량 — 이동중만 임의상차 열, 진열대기·진열중은 일반 SLA 시간대 */
    if (isAdhocVehicle(item.vehicleNo)) {
      var adhocMeta = resolveRowMetaForAdhocVehicle(item, slaLookup);
      if (item.statusLabel === "이동중") {
        if (adhocMeta.key === "UNKNOWN") return null;
        return { rowMeta: adhocMeta, col: PIVOT_COL_ADHOC };
      }
      if (adhocMeta.key !== "UNKNOWN") {
        return {
          rowMeta: adhocMeta,
          col: pivotColumnForRow(item, adhocMeta, queryAt),
        };
      }
    }
    var rowMeta = slaRowMetaForItem(item, slaLookup);
    if (rowMeta.key !== "UNKNOWN") {
      return {
        rowMeta: rowMeta,
        col: pivotColumnForRow(item, rowMeta, queryAt),
      };
    }
    var ct = normalizeCtKey(item.ct);
    var storageLabel = ct && ctStorageCache ? ctStorageCache[ct] : "";
    if (storageLabel) {
      rowMeta = pivotRowKeyFromStorage(
        storageLabel,
        item.priority1,
        item.priority2
      );
      if (rowMeta.key !== "UNKNOWN") {
        return {
          rowMeta: rowMeta,
          col: pivotColumnForRow(item, rowMeta, queryAt),
          viaCt: true,
        };
      }
    }
    return null;
  }

  function isAtsPriority(prio1, prio2) {
    return (
      /^ATS$/i.test(String(prio1 || "").trim()) ||
      /^ATS$/i.test(String(prio2 || "").trim())
    );
  }

  function pivotRowKeyFromSlaRecord(rec, prio1, prio2) {
    if (!rec) {
      return { key: "UNKNOWN", frozen: false, label: "" };
    }
    var temp = String(rec.temperature || "").trim().toUpperCase();
    var zone = String(rec.zone || "").trim().toUpperCase();
    if (temp === "FROZEN") {
      return { key: "FROZEN", frozen: true, label: "FROZEN" };
    }
    if (temp === "CHILLED") {
      var chilledAts = isAtsPriority(prio1, prio2);
      return chilledAts
        ? {
            key: "CHILLED_ATS",
            frozen: false,
            label: "ATS",
            parent: "CHILLED",
            ats: true,
          }
        : {
            key: "CHILLED_NON_ATS",
            frozen: false,
            label: "Non-ATS",
            parent: "CHILLED",
          };
    }
    if (temp === "AMBIENT") {
      var ats = isAtsPriority(prio1, prio2);
      return ats
        ? {
            key: "AMBIENT_ATS",
            frozen: false,
            label: "ATS",
            parent: "AMBIENT",
          }
        : {
            key: "AMBIENT_NON_ATS",
            frozen: false,
            label: "Non-ATS",
            parent: "AMBIENT",
          };
    }
    if (!temp) {
      return {
        key: "ROCKETMART",
        frozen: false,
        rocketMart: true,
        label: "RocketMart",
      };
    }
    return { key: "UNKNOWN", frozen: false, label: "" };
  }

  function pickSlaRecordForRefs(lookup, refs) {
    if (!lookup || !refs || !refs.length) return null;
    var best = null;
    var bestQty = -1;
    var i, ref, rec, qty;
    for (i = 0; i < refs.length; i++) {
      ref = refs[i];
      rec = null;
      if (ref.skuId && lookup.bySkuId[ref.skuId]) {
        rec = lookup.bySkuId[ref.skuId];
      } else if (ref.externalId && lookup.byExtId[ref.externalId]) {
        rec = lookup.byExtId[ref.externalId];
      } else if (ref.barcode && lookup.byBarcode[ref.barcode]) {
        rec = lookup.byBarcode[ref.barcode];
      }
      if (!rec) continue;
      qty = Number(rec.quantity) || 0;
      if (!best || qty > bestQty) {
        best = rec;
        bestQty = qty;
      }
    }
    return best;
  }

  function detectStorageTempLabel(text) {
    var s = String(text || "").replace(/\u00a0/g, " ");
    if (/냉장\s*\+\s*10|냉장\+10/i.test(s)) return "냉장+10";
    if (/냉동\s*[-−]?\s*18|냉동-18/i.test(s)) return "냉동-18";
    if (/냉장\s*\+\s*1|냉장\+1/i.test(s)) return "냉장+1";
    if (/상온/i.test(s)) return "상온";
    var u = s.replace(/\s+/g, " ").trim().toUpperCase();
    if (/\bFROZEN\b/.test(u)) return "냉동-18";
    if (/\bCHILLED\b/.test(u)) return "냉장+1";
    if (/\bAMBIENT\b/.test(u)) return "냉장+10";
    return "";
  }

  function pivotRowKeyFromStorage(label, priority1, priority2) {
    var lab = detectStorageTempLabel(label);
    if (!lab) {
      var u = String(label || "").replace(/\s+/g, "").trim().toUpperCase();
      if (u === "FROZEN" || (u.indexOf("냉동") >= 0 && u.indexOf("18") >= 0)) {
        lab = "냉동-18";
      } else if (u === "CHILLED" || u.indexOf("냉장+1") >= 0) {
        lab = "냉장+1";
      } else if (
        u === "AMBIENT" ||
        u.indexOf("냉장+10") >= 0 ||
        u.indexOf("냉장10") >= 0
      ) {
        lab = "냉장+10";
      } else if (u === "RM" || u.indexOf("상온") >= 0) {
        lab = "상온";
      }
    }
    if (lab === "냉동-18") {
      return { key: "FROZEN", frozen: true, label: "FROZEN" };
    }
    if (lab === "냉장+1") {
      var chilledAts = isAtsPriority(priority1, priority2);
      return chilledAts
        ? {
            key: "CHILLED_ATS",
            frozen: false,
            label: "ATS",
            parent: "CHILLED",
            ats: true,
          }
        : {
            key: "CHILLED_NON_ATS",
            frozen: false,
            label: "Non-ATS",
            parent: "CHILLED",
          };
    }
    if (lab === "상온") {
      return { key: "ROCKETMART", frozen: false, label: "RocketMart" };
    }
    if (lab === "냉장+10") {
      var ambientAts = isAtsPriority(priority1, priority2);
      return {
        key: ambientAts ? "AMBIENT_ATS" : "AMBIENT_NON_ATS",
        frozen: false,
        label: ambientAts ? "ATS" : "Non-ATS",
        parent: "AMBIENT",
      };
    }
    return { key: "UNKNOWN", frozen: false, label: "" };
  }

  function parseStorageTempFromSkuHtml(html) {
    var raw = String(html || "");
    var doc = new DOMParser().parseFromString(raw, "text/html");
    var nodes = doc.querySelectorAll("dt,th,label,span,div,td");
    var i, lab, found, next, row;
    for (i = 0; i < nodes.length; i++) {
      lab = normalizeCellText(nodes[i].textContent);
      if (lab !== "보관온도" && lab.indexOf("보관온도") < 0) continue;
      next = nodes[i].nextElementSibling;
      if (next) {
        found = detectStorageTempLabel(next.textContent);
        if (found) return found;
      }
      row = nodes[i].closest ? nodes[i].closest("tr") : null;
      if (row) {
        var tds = row.querySelectorAll("td,th,span");
        var j;
        for (j = 0; j < tds.length; j++) {
          if (tds[j] === nodes[i]) continue;
          found = detectStorageTempLabel(tds[j].textContent);
          if (found) return found;
        }
      }
    }
    return detectStorageTempLabel(doc.body ? doc.body.textContent : raw);
  }

  function parseListDetailPath(html, expectedGc) {
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    var table = doc.querySelector('table[is="w-table"]');
    if (!table) return "";
    var headers = [];
    var ths = table.querySelectorAll("thead th");
    var i, toteIdx = 0;
    for (i = 0; i < ths.length; i++) {
      if (normKey(ths[i].textContent).indexOf("토트바코드") >= 0) {
        toteIdx = i;
        break;
      }
    }
    var trs = table.querySelectorAll("tbody tr");
    var gcKey = normKey(expectedGc);
    for (i = 0; i < trs.length; i++) {
      var tds = trs[i].querySelectorAll("td");
      if (!tds.length) continue;
      var toteTd = tds[toteIdx] || tds[0];
      var tote = normalizeCellText(toteTd.textContent).toUpperCase();
      if (gcKey && normKey(tote) !== gcKey) continue;
      var a = toteTd.querySelector(
        'a[href*="/transfer/admin/operation/detail"]'
      );
      if (a) return a.getAttribute("href") || "";
    }
    return "";
  }

  function parseListDetailRows(html) {
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    var table = doc.querySelector('table[is="w-table"]');
    if (!table) return [];
    var ths = table.querySelectorAll("thead th");
    var i, toteIdx = 0;
    for (i = 0; i < ths.length; i++) {
      if (normKey(ths[i].textContent).indexOf("토트바코드") >= 0) {
        toteIdx = i;
        break;
      }
    }
    var out = [];
    var trs = table.querySelectorAll("tbody tr");
    for (i = 0; i < trs.length; i++) {
      var tds = trs[i].querySelectorAll("td");
      if (!tds.length) continue;
      var toteTd = tds[toteIdx] || tds[0];
      var a = toteTd.querySelector('a[href*="/transfer/admin/operation/detail"]');
      if (!a) continue;
      out.push({
        tote: normalizeCellText(toteTd.textContent).toUpperCase(),
        href: a.getAttribute("href") || "",
      });
    }
    return out;
  }

  function describeDetailTables(html) {
    var raw = String(html || "");
    var doc = new DOMParser().parseFromString(raw, "text/html");
    var tables = doc.querySelectorAll("table");
    var parts = [];
    var ti, tr, cells, ci, hs;
    for (ti = 0; ti < tables.length && ti < 4; ti++) {
      tr = tables[ti].querySelector("tr");
      cells = tr ? tr.querySelectorAll("th, td") : [];
      hs = [];
      for (ci = 0; ci < cells.length && ci < 8; ci++) {
        hs.push(normalizeCellText(cells[ci].textContent).slice(0, 14));
      }
      parts.push("표" + (ti + 1) + "[" + hs.join("|") + "]");
    }
    var title = doc.querySelector("title");
    return (
      "HTML " + raw.length + "자 · 표 " + tables.length + "개" +
      (title ? " · 제목 " + normalizeCellText(title.textContent).slice(0, 30) : "") +
      (parts.length ? " · " + parts.join(" ") : "")
    );
  }

  var movingVehicleTempCache = Object.create(null);

  /** 재고이관 목록: 차량번호 + 이동중(LOAD) + 도착센터 → GC 1건 상세 SKU ID → 보관온도 */
  async function resolveMovingTempByVehicle(cluster, dr, diag) {
    diag = diag || [];
    var vehicle = String((cluster && cluster.vehicleNo) || "").trim();
    if (!vehicle) {
      diag.push("차량조회: 차량번호 없음");
      return "";
    }
    var sample = cluster.sample || null;
    var cacheKey =
      vehicle +
      "|" +
      (sample && sample.loadAt ? sample.loadAt.getTime() : "");
    if (movingVehicleTempCache[cacheKey]) return movingVehicleTempCache[cacheKey];
    var range = dateRangeAroundItemAt(sample, dr);
    var opts = {
      status: "LOAD",
      searchDateType: SEARCH_DATE_PICKING,
      vehicleNumber: vehicle,
    };
    var bases = [TRANSFER_PAGING_MAIN, TRANSFER_PAGING_SAME];
    var baseNames = ["타센터", "동일센터"];
    var gcSet = cluster.gcSet || {};
    var bi, html, rows, pick, ri, detHtml, skuId, storage, label, tag;
    try {
      for (bi = 0; bi < bases.length; bi++) {
        if (stopRequested) return "";
        tag = "차량조회(" + baseNames[bi] + ", " + vehicle + ", " + poFcCode() + ")";
        html = await inboundGet(buildPagingUrl(bases[bi], 0, range, "", opts), {
          referer: TRANSFER_LIST_REFERER,
        });
        rows = parseListDetailRows(html);
        if (!rows.length) {
          diag.push(tag + ": 목록 0건");
          continue;
        }
        pick = rows[0];
        for (ri = 0; ri < rows.length; ri++) {
          if (gcSet[rows[ri].tote]) {
            pick = rows[ri];
            break;
          }
        }
        await sleep(NETWORK_DELAY_MS);
        detHtml = await inboundGet(buildDetailUrl(pick.href), {
          referer: TRANSFER_LIST_REFERER,
        });
        skuId = parseDetailFirstSkuId(detHtml);
        if (!skuId) {
          diag.push(
            tag + ": 목록 " + rows.length + "건 · " + pick.tote +
              " 상세에 SKU ID 없음 (" + describeDetailTables(detHtml) + ")"
          );
          continue;
        }
        storage = await fetchStorageLabelForSkuId(skuId);
        if (!storage) {
          diag.push(tag + ": " + pick.tote + " SKU " + skuId + " 보관온도 못 읽음");
          continue;
        }
        label = movingTempLabelFromRowMeta(
          pivotRowKeyFromStorage(
            storage,
            sample ? sample.priority1 : "",
            sample ? sample.priority2 : ""
          )
        );
        if (label) {
          movingVehicleTempCache[cacheKey] = label;
          return label;
        }
        diag.push(tag + ": SKU " + skuId + " 보관온도 '" + storage + "' 판정불가");
      }
    } catch (eVeh) {
      diag.push("차량조회 오류: " + ((eVeh && eVeh.message) || eVeh));
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[YAN4 moving temp by vehicle]", vehicle, eVeh);
      }
    }
    return "";
  }

  function detailTableAfterHeading(doc, headingContains) {
    var nodes = doc.querySelectorAll("h5, h4, h3, legend, dt");
    var i, el, txt, nested, wrap;
    for (i = 0; i < nodes.length; i++) {
      txt = normalizeCellText(nodes[i].textContent);
      if (txt.indexOf(headingContains) < 0) continue;
      el = nodes[i].nextElementSibling;
      while (el) {
        if (el.tagName === "TABLE") return el;
        nested = el.querySelector ? el.querySelector("table") : null;
        if (nested) return nested;
        el = el.nextElementSibling;
      }
      wrap = nodes[i].parentElement;
      if (wrap) {
        nested = wrap.querySelector("table");
        if (nested) return nested;
      }
    }
    return null;
  }

  function detailProductTablesOrdered(doc) {
    var hints = ["토트 안의", "토트안의", "토트 내", "토트내", "상품정보", "상품 정보", "집품"];
    var ordered = [];
    var hi, tbl, all, ti;
    for (hi = 0; hi < hints.length; hi++) {
      tbl = detailTableAfterHeading(doc, hints[hi]);
      if (tbl && ordered.indexOf(tbl) < 0) ordered.push(tbl);
    }
    all = doc.querySelectorAll('table[is="w-table"], table');
    for (ti = 0; ti < all.length; ti++) {
      if (ordered.indexOf(all[ti]) < 0) ordered.push(all[ti]);
    }
    return ordered;
  }

  function findInternalSkuColLoose(headers) {
    var i, h;
    for (i = 0; i < headers.length; i++) {
      h = normKey(headers[i]);
      if (h.indexOf("외부") >= 0 || h.indexOf("external") >= 0) continue;
      if (h.indexOf("sku") >= 0 && h.indexOf("id") >= 0) return i;
      if (h.indexOf("내부sku") >= 0) return i;
    }
    return -1;
  }

  function parseDetailProductRefsFromTable(table, out, seen) {
    var ths = table.querySelectorAll("thead th");
    var headers = [];
    var hi;
    var headerTr = null;
    if (!ths.length) {
      headerTr = table.querySelector("tr");
      ths = headerTr ? headerTr.querySelectorAll("th, td") : [];
    }
    for (hi = 0; hi < ths.length; hi++) {
      headers.push(normalizeCellText(ths[hi].textContent));
    }
    var iSku = findColIndexExact(headers, [
      "SKU ID",
      "SKUID",
      "SKU_ID",
      "상품ID",
    ]);
    if (iSku < 0) iSku = findInternalSkuColLoose(headers);
    var iBc = findColIndex(headers, [
      "상품바코드",
      "sku바코드",
      "바코드",
      "SKU 바코드",
    ]);
    if (iBc >= 0) {
      var bcHead = normKey(headers[iBc]);
      if (bcHead.indexOf("토트") >= 0 || bcHead.indexOf("컨테이너") >= 0) {
        iBc = -1;
      }
    }
    var iExt = findColIndexExact(headers, [
      "External SKUID",
      "External SKU ID",
      "externalid",
      "External ID",
    ]);
    if (iSku < 0 && iBc < 0 && iExt < 0) return;
    var trs = table.querySelectorAll("tbody tr");
    if (!trs.length) trs = table.querySelectorAll("tr");
    var r, tds, sid, bc, ext, sig;
    for (r = 0; r < trs.length; r++) {
      if (headerTr && trs[r] === headerTr) continue;
      tds = trs[r].querySelectorAll("td");
      if (!tds.length || (tds[0] && tds[0].getAttribute("colspan"))) {
        continue;
      }
      sid =
        iSku >= 0 && tds[iSku]
          ? normalizeCellText(tds[iSku].textContent).replace(/\D/g, "")
          : "";
      bc =
        iBc >= 0 && tds[iBc] ? normalizeSlaBarcodeKey(tds[iBc].textContent) : "";
      ext =
        iExt >= 0 && tds[iExt] ? normalizeSlaLookupKey(tds[iExt].textContent) : "";
      if (!sid && !bc && !ext) continue;
      sig = [sid, bc, ext].join("|");
      if (seen[sig]) continue;
      seen[sig] = 1;
      out.push({ skuId: sid, barcode: bc, externalId: ext });
    }
  }

  function parseDetailFirstSkuId(html) {
    var refs = parseDetailProductRefs(html);
    var i;
    for (i = 0; i < refs.length; i++) {
      if (refs[i].skuId) return refs[i].skuId;
    }
    return "";
  }

  function parseDetailProductRefs(html) {
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    var tables = detailProductTablesOrdered(doc);
    var out = [];
    var seen = Object.create(null);
    var t;
    for (t = 0; t < tables.length; t++) {
      parseDetailProductRefsFromTable(tables[t], out, seen);
    }
    return out;
  }

  function buildDetailUrl(path) {
    var p = String(path || "").trim();
    if (!p) return "";
    if (/^https?:\/\//i.test(p)) return p;
    return INBOUND_ORIGIN + (p.charAt(0) === "/" ? p : "/" + p);
  }

  async function fetchDetailPathForGcOnce(gc, dr, searchOpts) {
    var cart = String(gc || "").trim().toUpperCase();
    if (!cart) return "";
    var bases = [TRANSFER_PAGING_SAME, TRANSFER_PAGING_MAIN];
    var bi, page, html, path;
    for (bi = 0; bi < bases.length; bi++) {
      for (page = 0; page < PAGING_PAGE_CAP; page++) {
        if (stopRequested) return "";
        var url = buildPagingUrl(bases[bi], page, dr, cart, searchOpts);
        html = await inboundGet(url, { referer: TRANSFER_LIST_REFERER });
        path = parseListDetailPath(html, cart);
        if (path) return path;
        if (/검색\s*결과가\s*없/.test(html)) break;
        if (!/w-page-next/i.test(html) && page > 0) break;
        await sleep(NETWORK_DELAY_MS);
      }
    }
    return "";
  }

  async function fetchDetailPathForGc(gc, dr, searchOpts, item) {
    var cart = String(gc || "").trim().toUpperCase();
    if (!cart) return "";
    if (item && dr) {
      var plans = detailSearchPlansForItem(item, dr);
      var pi, path;
      for (pi = 0; pi < plans.length; pi++) {
        if (stopRequested) return "";
        path = await fetchDetailPathForGcOnce(
          cart,
          plans[pi].dr,
          plans[pi].searchOpts
        );
        if (path) return path;
      }
      return "";
    }
    return fetchDetailPathForGcOnce(cart, dr, searchOpts);
  }

  async function enrichGcFromSla(gc, dr, slaLookup) {
    var key = String(gc || "").trim().toUpperCase();
    if (!key) {
      return {
        slaRecord: null,
        rowKey: pivotRowKeyFromSlaRecord(null, "", ""),
      };
    }
    if (gcEnrichCache[key]) return gcEnrichCache[key];
    var result = {
      slaRecord: null,
      rowKey: pivotRowKeyFromSlaRecord(null, "", ""),
      refs: [],
    };
    if (key.indexOf("GC-") !== 0) {
      gcEnrichCache[key] = result;
      return result;
    }
    try {
      var detailPath = await fetchDetailPathForGc(key, dr);
      if (stopRequested || !detailPath) {
        gcEnrichCache[key] = result;
        return result;
      }
      await sleep(NETWORK_DELAY_MS);
      var detHtml = await inboundGet(buildDetailUrl(detailPath), {
        referer: TRANSFER_LIST_REFERER,
      });
      result.refs = parseDetailProductRefs(detHtml);
      result.slaRecord = pickSlaRecordForRefs(slaLookup, result.refs);
      gcEnrichCache[key] = result;
      return result;
    } catch (e) {
      gcEnrichCache[key] = result;
      return result;
    }
  }

  function normalizeInventorySkuId(raw) {
    var s = String(raw != null ? raw : "")
      .replace(/\u00a0/g, " ")
      .trim();
    if (!s) return "";
    var m = s.match(/\d{5,20}/);
    return m ? m[0] : s.replace(/\s+/g, "");
  }

  function inventoryLocationMatchesGc(rowLoc, gc) {
    var want = normalizeGcKey(gc);
    var loc = normalizeGcKey(rowLoc);
    if (!want) return false;
    if (!loc) return false;
    if (loc === want) return true;
    if (loc.indexOf(want) >= 0) return true;
    return false;
  }

  function buildInventorySearchUrlForLocation(gc, page) {
    var p = new URLSearchParams();
    p.set("searched", "true");
    p.set("locationType", "");
    p.set("zone", "");
    p.set("fromLocation", "");
    p.set("toLocation", "");
    p.set("locationBarcode", normalizeGcKey(gc));
    p.set("skuId", "");
    p.set("externalSkuId", "");
    p.set("skuBarcode", "");
    p.set("lpnId", "");
    p.set("inventoryId", "");
    p.set("saleableChangeType", "");
    p.set("availableInventory", "true");
    p.set("page", String(Math.max(0, Number(page) || 0)));
    p.set("pageSize", "20");
    return INVENTORY_SEARCH + "?" + p.toString();
  }

  function parseInventorySkuHitsAtGc(text, gc) {
    var hits = [];
    var j;
    try {
      j = JSON.parse(String(text || ""));
    } catch (eJ) {
      return hits;
    }
    if (!j || j.success === false) return hits;
    var content = j.result && j.result.content;
    if (!Array.isArray(content)) return hits;
    var i, row, dto, sid, qty;
    for (i = 0; i < content.length; i++) {
      row = content[i];
      if (!row) continue;
      if (!inventoryLocationMatchesGc(row.locationBarcode, gc)) continue;
      dto = row.skuDto || {};
      sid = normalizeInventorySkuId(dto.skuId);
      if (!sid) continue;
      qty = Number(row.quantity);
      if (!isFinite(qty)) qty = 0;
      hits.push({
        skuId: sid,
        qty: qty,
        barcode: String(dto.skuBarcode || "").trim(),
        skuName: String(dto.skuName || "").trim(),
      });
    }
    if (!hits.length && content.length) {
      for (i = 0; i < content.length; i++) {
        row = content[i];
        if (!row) continue;
        dto = row.skuDto || {};
        sid = normalizeInventorySkuId(dto.skuId);
        if (!sid) continue;
        qty = Number(row.quantity);
        if (!isFinite(qty)) qty = 0;
        hits.push({
          skuId: sid,
          qty: qty,
          barcode: String(dto.skuBarcode || "").trim(),
          skuName: String(dto.skuName || "").trim(),
        });
      }
    }
    return hits;
  }

  function inventoryFallbackRecordsFromHits(hits) {
    var byProduct = Object.create(null);
    var order = [];
    var i, hit, key, rec;
    for (i = 0; i < (hits || []).length; i++) {
      hit = hits[i] || {};
      key =
        normalizeInventorySkuId(hit.skuId) +
        "|" +
        String(hit.barcode || "").trim() +
        "|" +
        String(hit.skuName || "").trim();
      if (!byProduct[key]) {
        rec = {
          skuId: normalizeInventorySkuId(hit.skuId),
          externalId: "",
          barcode: String(hit.barcode || "").trim(),
          gc: "",
          temperature: "",
          zone: "",
          quantity: 0,
          cate2: "",
          cate3: "",
          cate4: "",
          type: "",
          unitDescription: String(hit.skuName || "").trim(),
          fromCenter: "",
        };
        byProduct[key] = rec;
        order.push(rec);
      }
      byProduct[key].quantity += Number(hit.qty) || 0;
    }
    return order;
  }

  function pickRepresentativeInventorySkuId(hits) {
    if (!hits || !hits.length) return "";
    var best = hits[0];
    var i;
    for (i = 1; i < hits.length; i++) {
      if (hits[i].qty > best.qty) best = hits[i];
    }
    return best.skuId || "";
  }

  async function fetchSkuIdFromInventoryLocation(gc) {
    var cart = normalizeGcKey(gc);
    if (!cart || cart.indexOf("GC-") !== 0) return "";
    if (
      Object.prototype.hasOwnProperty.call(inventoryGcFallbackCache, cart)
    ) {
      return pickRepresentativeInventorySkuId(
        inventoryGcFallbackCache[cart] || []
      );
    }
    try {
      var hits = [];
      var page = 0;
      var totalPages = 1;
      while (page < totalPages && page < PAGING_PAGE_CAP) {
        var text = await inventoryGet(
          buildInventorySearchUrlForLocation(cart, page),
          {
            referer: INVENTORY_REFERER,
            accept: "application/json, text/plain, */*",
          }
        );
        hits = hits.concat(parseInventorySkuHitsAtGc(text, cart));
        try {
          var parsed = JSON.parse(String(text || ""));
          totalPages = Number(
            parsed && parsed.result && parsed.result.totalPages != null
              ? parsed.result.totalPages
              : 1
          );
        } catch (ePage) {
          totalPages = 1;
        }
        if (!isFinite(totalPages) || totalPages < 1) totalPages = 1;
        page++;
        if (page < totalPages && page < PAGING_PAGE_CAP) {
          await sleep(NETWORK_DELAY_MS);
        }
      }
      inventoryGcFallbackCache[cart] = hits;
      return pickRepresentativeInventorySkuId(hits);
    } catch (eLoc) {
      inventoryGcFallbackCache[cart] = [];
      return "";
    }
  }

  async function fetchStorageLabelForSkuId(skuId) {
    var key = normalizeInventorySkuId(skuId);
    if (!key) return "";
    if (skuTempCache[key] !== undefined) return skuTempCache[key];
    await sleep(NETWORK_DELAY_MS);
    var skuHtml = await inventoryGet(INVENTORY_SKU_BASE + key, {
      referer: INVENTORY_SKU_BASE + key,
    });
    var storageLabel = parseStorageTempFromSkuHtml(skuHtml);
    skuTempCache[key] = storageLabel;
    return storageLabel;
  }

  async function enrichGcZone(gc, dr, searchOpts, item) {
    var key = String(gc || "").trim().toUpperCase();
    if (!key) {
      return { storageLabel: "", rowKey: pivotRowKeyFromStorage("", "") };
    }
    if (gcEnrichCache[key] && gcEnrichCache[key].storageLabel) {
      return gcEnrichCache[key];
    }
    var result = {
      storageLabel: "",
      rowKey: pivotRowKeyFromStorage("", ""),
      skuId: "",
    };
    if (key.indexOf("GC-") !== 0) {
      gcEnrichCache[key] = result;
      return result;
    }
    try {
      var skuId = await fetchSkuIdFromInventoryLocation(key);
      if (!skuId && !stopRequested) {
        var detailPath = await fetchDetailPathForGc(
          key,
          dr,
          searchOpts,
          item || null
        );
        if (detailPath) {
          await sleep(NETWORK_DELAY_MS);
          var detHtml = await inboundGet(buildDetailUrl(detailPath), {
            referer: TRANSFER_LIST_REFERER,
          });
          skuId = parseDetailFirstSkuId(detHtml);
        }
      }
      result.skuId = skuId;
      if (!skuId) {
        gcEnrichCache[key] = result;
        return result;
      }
      result.storageLabel = await fetchStorageLabelForSkuId(skuId);
      result.rowKey = pivotRowKeyFromStorage(result.storageLabel, "", "");
      gcEnrichCache[key] = result;
      return result;
    } catch (e) {
      gcEnrichCache[key] = result;
      return result;
    }
  }

  function formatPivotTimeCol(d) {
    if (!d || isNaN(d.getTime())) return PIVOT_COL_EMPTY;
    return (
      pad2(d.getMonth() + 1) +
      "/" +
      pad2(d.getDate()) +
      " " +
      d.getHours()
    );
  }

  function formatPivotDateCol(d) {
    if (!d || isNaN(d.getTime())) return PIVOT_COL_EMPTY;
    return pad2(d.getMonth() + 1) + "/" + pad2(d.getDate());
  }

  function isRocketMartRowMeta(rowMeta) {
    return !!(rowMeta && (rowMeta.key === "ROCKETMART" || rowMeta.rocketMart));
  }

  function pivotColumnForRow(item, rowMeta, queryAt) {
    if (item.statusLabel === "이동중") return PIVOT_COL_MOVING;
    var baseAt = null;
    var hours = OFFSET_HOURS_DEFAULT;
    if (isRocketMartRowMeta(rowMeta)) {
      baseAt = item.loadAt;
      hours = OFFSET_HOURS_ROCKETMART;
    } else {
      baseAt = item.unloadAt;
      hours =
        rowMeta && rowMeta.frozen
          ? OFFSET_HOURS_FROZEN
          : OFFSET_HOURS_DEFAULT;
    }
    if (!baseAt) return PIVOT_COL_EMPTY;
    var pivotAt = new Date(baseAt.getTime() + hours * 3600000);
    if (isRocketMartRowMeta(rowMeta)) {
      return formatPivotDateCol(pivotAt);
    }
    /* SLA 마감 후 1h+ 경과 → AGING처럼 DAY 열(MM/DD). 그 전은 시간대(MM/DD H) */
    var nowMs =
      queryAt instanceof Date && !isNaN(queryAt.getTime())
        ? queryAt.getTime()
        : typeof queryAt === "number" && isFinite(queryAt)
          ? queryAt
          : Date.now();
    if (nowMs - pivotAt.getTime() >= SLA_PIVOT_DAY_BUCKET_HOURS * 3600000) {
      return formatPivotDateCol(pivotAt);
    }
    return formatPivotTimeCol(pivotAt);
  }

  function pivotColExtraClass(colName) {
    if (colName === PIVOT_COL_MOVING) return " yna4-sla-pivot-col--moving";
    if (colName === PIVOT_COL_ADHOC) return " yna4-sla-pivot-col--adhoc";
    if (colName === PIVOT_COL_EMPTY) return " yna4-sla-pivot-col--empty";
    return "";
  }

  function parsePivotColSortKey(col, refYear) {
    if (col === PIVOT_COL_MOVING) return "z_moving";
    if (col === PIVOT_COL_ADHOC) return "z_adhoc";
    if (col === PIVOT_COL_EMPTY) return "z_empty";
    var yr = refYear || new Date().getFullYear();
    var mDate = /^(\d{2})\/(\d{2})$/.exec(col);
    if (mDate) {
      var dtDay = new Date(+yr, +mDate[1] - 1, +mDate[2], 0, 0, 0, 0);
      return String(dtDay.getTime() - 1).padStart(14, "0");
    }
    var m = /^(\d{2})\/(\d{2})\s+(\d{1,2})$/.exec(col);
    if (!m) return "z_" + col;
    var dt = new Date(+yr, +m[1] - 1, +m[2], +m[3], 0, 0, 0);
    return String(dt.getTime()).padStart(14, "0");
  }

  function formatPivotNum(n) {
    if (!n || !isFinite(n) || n === 0) return "-";
    return Math.round(n).toLocaleString("en-US");
  }

  function formatPivotQtyPositive(n) {
    var v = Math.round(Number(n) || 0);
    if (v <= 0) return "";
    return v.toLocaleString("en-US");
  }

  function isPivotDayOnlyCol(colName) {
    return /^\d{2}\/\d{2}$/.test(String(colName || ""));
  }

  /** 조회시각 기준 — SLA 마감 후 1h+ 경과 */
  function isPastSlaPlusBucketHours(deadlineAt, queryAt) {
    if (!deadlineAt || !deadlineAt.getTime || isNaN(deadlineAt.getTime())) {
      return false;
    }
    var nowMs =
      queryAt instanceof Date && !isNaN(queryAt.getTime())
        ? queryAt.getTime()
        : Date.now();
    return nowMs - deadlineAt.getTime() >= SLA_PIVOT_DAY_BUCKET_HOURS * 3600000;
  }

  /** DAY 열(MM/DD) 폴백 — 해당일 23:59:59 를 마감 대리값으로 사용 */
  function isPivotDayColPastOverdueFallback(colName, refYear, queryAt) {
    var m = /^(\d{2})\/(\d{2})$/.exec(String(colName || ""));
    if (!m) return false;
    var yr = refYear || new Date().getFullYear();
    var dayEnd = new Date(+yr, +m[1] - 1, +m[2], 23, 59, 59, 999);
    return isPastSlaPlusBucketHours(dayEnd, queryAt);
  }

  /**
   * 헤더 "MISS" — 해당 DAY 열이 조회일 이전·당일(시간대 초과 묶음)일 때만.
   * 미래 DAY(예: RocketMart 예정일)는 "일"로 표기.
   */
  function isPivotDayColMissHeader(colName, refYear, queryAt) {
    var m = /^(\d{2})\/(\d{2})$/.exec(String(colName || ""));
    if (!m) return false;
    var yr = refYear || new Date().getFullYear();
    var q =
      queryAt instanceof Date && !isNaN(queryAt.getTime())
        ? queryAt
        : new Date();
    var colDay = new Date(+yr, +m[1] - 1, +m[2], 0, 0, 0, 0);
    var qDay = new Date(q.getFullYear(), q.getMonth(), q.getDate(), 0, 0, 0, 0);
    return colDay.getTime() <= qDay.getTime();
  }

  function rocketMartCellHasOverdueBy1h(rowKey, colName, xferCtx, queryAt) {
    if (!xferCtx || !xferCtx.allRows) return false;
    var matches = transferItemsForPivotCell(
      xferCtx.allRows,
      xferCtx.slaLookup,
      rowKey,
      colName,
      xferCtx.ctStorage,
      queryAt
    );
    var i, item, placed, deadline;
    for (i = 0; i < matches.length; i++) {
      item = matches[i];
      placed = resolvePivotPlacement(
        item,
        xferCtx.slaLookup,
        xferCtx.ctStorage,
        queryAt
      );
      if (!placed || !placed.rowMeta) continue;
      deadline = drillSlaPivotAt(item, placed.rowMeta);
      if (deadline && deadline !== "이동중" && isPastSlaPlusBucketHours(deadline, queryAt)) {
        return true;
      }
    }
    return false;
  }

  function agingCellHasOverdueBy1h(rowKey, colName, toteLines, queryAt) {
    var lines = toteLinesForPivotCell(toteLines || [], colName, rowKey);
    var i;
    for (i = 0; i < lines.length; i++) {
      if (isPastSlaPlusBucketHours(lines[i].agingAt, queryAt)) return true;
    }
    return false;
  }

  /**
   * SLA 초과 DAY 스타일 대상
   * - 일반/직납: DAY 열 자체가 초과 1h+ 묶음
   * - RocketMart / Tote AGING: 원래 DAY 열 → 마감 후 1h+ 인 건만
   */
  var pivotOverdueStyleCtx = null;

  function isSlaOverdueDayBucketCell(colName, rowKey) {
    if (!isPivotDayOnlyCol(colName)) return false;
    var isRm = rowKey === "ROCKETMART";
    var isAging = isToteStowPivotRowKey(rowKey);
    if (!isRm && !isAging) return true;

    var ctx = pivotOverdueStyleCtx || {};
    var queryAt =
      ctx.queryAt instanceof Date && !isNaN(ctx.queryAt.getTime())
        ? ctx.queryAt
        : new Date();
    var drillCtx = ctx.drillCtx || null;
    var xferCtx =
      drillCtx && drillCtx.mode === "combined"
        ? drillCtx.transfer
        : drillCtx;
    if (isRm) {
      if (xferCtx && xferCtx.allRows) {
        return rocketMartCellHasOverdueBy1h(
          rowKey,
          colName,
          xferCtx,
          queryAt
        );
      }
      return isPivotDayColPastOverdueFallback(
        colName,
        ctx.refYear,
        queryAt
      );
    }
    var toteLines =
      (drillCtx && drillCtx.toteStowLines) ||
      (xferCtx && xferCtx.toteStowLines) ||
      [];
    if (toteLines.length) {
      return agingCellHasOverdueBy1h(rowKey, colName, toteLines, queryAt);
    }
    return isPivotDayColPastOverdueFallback(colName, ctx.refYear, queryAt);
  }

  function fillDirectPivotNumCell(td, poVal, pendingVal, colName, rowKey) {
    poVal = Math.round(Number(poVal) || 0);
    pendingVal = Math.round(Number(pendingVal) || 0);
    var total = poVal + pendingVal;
    td.className = pivotNumCellClass(total, colName, rowKey);
    td.textContent = "";
    if (poVal > 0 && pendingVal > 0) {
      td.appendChild(document.createTextNode(formatPivotQtyPositive(poVal)));
      var span = document.createElement("span");
      span.className = "yna4-sla-pivot-num-pending";
      span.textContent = " (" + formatPivotQtyPositive(pendingVal) + ")";
      td.appendChild(span);
    } else if (pendingVal > 0) {
      td.className += " yna4-sla-pivot-num--pending-only";
      td.textContent = formatPivotQtyPositive(pendingVal);
    } else {
      td.textContent = formatPivotNum(poVal);
    }
    if (total > 0) {
      td.title = "더블클릭: SLA 상세";
    }
  }

  function pivotRowPendingSum(matrixPending, rowKey, timeCols) {
    if (!matrixPending || !rowKey) return 0;
    var rowData = matrixPending[rowKey];
    if (!rowData) return 0;
    var sum = 0;
    var ci;
    for (ci = 0; ci < timeCols.length; ci++) {
      sum += Number(rowData[timeCols[ci]]) || 0;
    }
    return sum;
  }

  function matrixHasPendingQty(matrixPending) {
    if (!matrixPending) return false;
    var rk, rowData, col;
    for (rk in matrixPending) {
      if (!Object.prototype.hasOwnProperty.call(matrixPending, rk)) continue;
      rowData = matrixPending[rk];
      for (col in rowData) {
        if (!Object.prototype.hasOwnProperty.call(rowData, col)) continue;
        if (Number(rowData[col]) > 0) return true;
      }
    }
    return false;
  }

  function pivotNumCellClass(val, colName, rowKey) {
    var cls = "yna4-sla-pivot-num" + pivotColExtraClass(colName);
    if (val > 0) cls += " yna4-sla-pivot-num--hit";
    /* 값 열(시간/DAY)만 — 총합계 열·총합계 행·헤더는 제외 */
    if (
      val > 0 &&
      rowKey !== "__GRAND__" &&
      colName &&
      colName !== "__TOTAL__" &&
      isSlaOverdueDayBucketCell(colName, rowKey)
    ) {
      cls += " yna4-sla-pivot-num--overdue-day";
    }
    return cls;
  }

  function parseStatsQueryAt(stats) {
    if (stats && stats.loadedAt) {
      var d = parseFlexiblePoDate(stats.loadedAt);
      if (d && !isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  function isSlaDeadlineUrgent(deadlineAt, queryAt, thresholdHours) {
    if (!deadlineAt || deadlineAt === "이동중") return false;
    if (!deadlineAt.getTime || isNaN(deadlineAt.getTime())) return false;
    if (!queryAt || isNaN(queryAt.getTime())) queryAt = new Date();
    var remainMs = deadlineAt.getTime() - queryAt.getTime();
    return remainMs <= thresholdHours * 3600000;
  }

  function transferThresholdHoursForRowKey(rowKey) {
    if (rowKey === "ROCKETMART" || isToteStowPivotRowKey(rowKey)) {
      return PIVOT_ALERT_HOURS_ROCKETMART;
    }
    return PIVOT_ALERT_HOURS_DEFAULT;
  }

  function transferCellHasUrgentSku(rowKey, colName, xferCtx, queryAt) {
    if (!xferCtx || !xferCtx.allRows) return false;
    var thresholdH = transferThresholdHoursForRowKey(rowKey);
    var matches = transferItemsForPivotCell(
      xferCtx.allRows,
      xferCtx.slaLookup,
      rowKey,
      colName,
      xferCtx.ctStorage,
      queryAt
    );
    if (!matches.length) return false;
    var lines = buildDrillDetailLines(matches, xferCtx.slaLookup);
    var drillMini = {
      slaLookup: xferCtx.slaLookup,
      ctStorage: xferCtx.ctStorage,
    };
    var i, j, line, deadline, item, gc, placed, hasSlaLine;
    for (i = 0; i < lines.length; i++) {
      line = lines[i];
      if (!line.sla || line.inventoryFallback) continue;
      deadline = drillSlaPivotAt(
        line.transfer,
        drillRowMetaForLine(line, drillMini)
      );
      if (isSlaDeadlineUrgent(deadline, queryAt, thresholdH)) return true;
    }
    var seen = Object.create(null);
    for (i = 0; i < matches.length; i++) {
      item = matches[i];
      gc = normalizeGcKey(item.gc);
      if (!gc || seen[gc]) continue;
      hasSlaLine = false;
      for (j = 0; j < lines.length; j++) {
        if (
          lines[j].sla &&
          !lines[j].inventoryFallback &&
          normalizeGcKey(lines[j].transfer && lines[j].transfer.gc) === gc
        ) {
          hasSlaLine = true;
          break;
        }
      }
      if (hasSlaLine) continue;
      seen[gc] = 1;
      placed = resolvePivotPlacement(
        item,
        xferCtx.slaLookup,
        xferCtx.ctStorage,
        queryAt
      );
      if (!placed) continue;
      deadline = drillSlaPivotAt(item, placed.rowMeta);
      if (isSlaDeadlineUrgent(deadline, queryAt, thresholdH)) return true;
    }
    return false;
  }

  function directCellHasUrgentSku(rowKey, colName, directCtx, queryAt) {
    if (!directCtx || !directCtx.allRows) return false;
    var lines = directLinesForPivotCell(directCtx.allRows, rowKey, colName);
    var i;
    for (i = 0; i < lines.length; i++) {
      if (
        isSlaDeadlineUrgent(
          lines[i].slaAt,
          queryAt,
          PIVOT_ALERT_HOURS_DEFAULT
        )
      ) {
        return true;
      }
    }
    return false;
  }

  function pivotCellHasSlaAlert(rowKey, colName, rowDef, stats, queryAt) {
    if (!stats || !stats.drillCtx || !rowDef || rowDef.kind === "group") {
      return false;
    }
    var drillCtx = stats.drillCtx;
    if (isToteStowPivotRowKey(rowKey)) {
      var toteLines =
        drillCtx.toteStowLines ||
        (drillCtx.transfer && drillCtx.transfer.toteStowLines) ||
        [];
      return toteCellHasUrgentSku(colName, rowKey, toteLines, queryAt);
    }
    if (drillCtx.mode === "combined") {
      if (isDirectPivotRowDef(rowDef)) {
        return directCellHasUrgentSku(
          rowKey,
          colName,
          drillCtx.direct,
          queryAt
        );
      }
      return transferCellHasUrgentSku(
        rowKey,
        colName,
        drillCtx.transfer,
        queryAt
      );
    }
    if (drillCtx.mode === "direct") {
      return isDirectPivotRowDef(rowDef)
        ? directCellHasUrgentSku(rowKey, colName, drillCtx, queryAt)
        : false;
    }
    return transferCellHasUrgentSku(rowKey, colName, drillCtx, queryAt);
  }

  function buildPivotAlertMatrix(matrix, timeCols, rowDefs, stats) {
    var alert = Object.create(null);
    if (!stats || !stats.drillCtx) return alert;
    var queryAt = parseStatsQueryAt(stats);
    var cols = timeCols.slice();
    var ri, def, rowKey, ci, colName, val;
    for (ri = 0; ri < rowDefs.length; ri++) {
      def = rowDefs[ri];
      if (def.kind === "group") continue;
      rowKey = def.key;
      alert[rowKey] = Object.create(null);
      for (ci = 0; ci < cols.length; ci++) {
        colName = cols[ci];
        val =
          (matrix[rowKey] && matrix[rowKey][colName]) || 0;
        if (!(Number(val) > 0)) {
          alert[rowKey][colName] = false;
          continue;
        }
        alert[rowKey][colName] = pivotCellHasSlaAlert(
          rowKey,
          colName,
          def,
          stats,
          queryAt
        );
      }
    }
    return alert;
  }

  function applyPivotSlaAlertTd(td, rowKey, colKey, alertMatrix) {
    if (!td || !alertMatrix || !alertMatrix[rowKey] || !alertMatrix[rowKey][colKey]) {
      return;
    }
    /* MISS(초과 DAY)가 이미 있으면 임박 빨강 대신 MISS 스타일 유지 */
    if (td.classList.contains("yna4-sla-pivot-num--overdue-day")) {
      return;
    }
    td.classList.add("yna4-sla-pivot-num--sla-alert");
    var hint = "조회시간 기준 SLA 임박/초과";
    td.title = td.title ? td.title + " · " + hint : hint;
  }

  function pivotHeaderDateLabel(mm, dd, refYear) {
    var yr = refYear || new Date().getFullYear();
    return pad2(yr % 100) + "." + pad2(+mm) + "." + pad2(+dd);
  }

  function pivotColDateLabel(colName, refYear) {
    if (
      colName === PIVOT_COL_MOVING ||
      colName === PIVOT_COL_ADHOC ||
      colName === PIVOT_COL_EMPTY
    ) {
      return "";
    }
    var mDate = /^(\d{2})\/(\d{2})$/.exec(colName);
    if (mDate) {
      return pivotHeaderDateLabel(mDate[1], mDate[2], refYear);
    }
    var m = /^(\d{2})\/(\d{2})\s+(\d{1,2})$/.exec(colName);
    if (!m) return colName;
    return pivotHeaderDateLabel(m[1], m[2], refYear);
  }

  function pivotColTimeLabel(colName) {
    if (colName === PIVOT_COL_MOVING) return "이동중";
    if (colName === PIVOT_COL_ADHOC) return PIVOT_COL_ADHOC;
    if (colName === PIVOT_COL_EMPTY) return PIVOT_COL_EMPTY;
    if (/^(\d{2})\/(\d{2})$/.test(colName)) return "Aging";
    var m = /^(\d{2})\/(\d{2})\s+(\d{1,2})$/.exec(colName);
    if (!m) return colName;
    return pad2(parseInt(m[3], 10)) + ":00";
  }

  function isPivotDateOnlyColKey(colKey) {
    return /^(\d{2})\/(\d{2})$/.test(String(colKey || ""));
  }

  function groupPivotTimeCols(timeCols, refYear) {
    var dateGroups = [];
    var specialCols = [];
    var i, col, dateLabel, gi, grp;
    for (i = 0; i < timeCols.length; i++) {
      col = timeCols[i];
      if (
        col === PIVOT_COL_MOVING ||
        col === PIVOT_COL_ADHOC ||
        col === PIVOT_COL_EMPTY
      ) {
        specialCols.push(col);
        continue;
      }
      dateLabel = pivotColDateLabel(col, refYear);
      grp = null;
      for (gi = 0; gi < dateGroups.length; gi++) {
        if (dateGroups[gi].dateLabel === dateLabel) {
          grp = dateGroups[gi];
          break;
        }
      }
      if (!grp) {
        grp = { dateLabel: dateLabel, cols: [] };
        dateGroups.push(grp);
      }
      grp.cols.push({
        key: col,
        timeLabel: pivotColTimeLabel(col),
        dateOnly: isPivotDateOnlyColKey(col),
      });
    }
    return { dateGroups: dateGroups, specialCols: specialCols };
  }

  function pivotBundleTrClass(def) {
    var cls = "";
    if (def && (def.bundleRole === "start" || def.bundleRole === "solo")) {
      cls += " yna4-sla-pivot-bundle-start";
    }
    if (def && (def.bundleRole === "end" || def.bundleRole === "solo")) {
      cls += " yna4-sla-pivot-bundle-end";
    }
    return cls;
  }

  function isDirectPivotRowDef(def) {
    if (!def) return false;
    if (def.direct) return true;
    var k = String(def.key || "");
    return (
      k.indexOf("DIRECT_") === 0 || k.indexOf("COMBINED_DIRECT_") === 0
    );
  }

  function pivotDirectRowClass(def) {
    return isDirectPivotRowDef(def) ? " yna4-sla-pivot-tr--direct" : "";
  }

  function pivotRowSum(matrix, rowKey, timeCols) {
    var rowData = matrix[rowKey] || {};
    var sum = 0;
    var i, ckey;
    for (i = 0; i < timeCols.length; i++) {
      ckey = timeCols[i];
      sum += rowData[ckey] || 0;
    }
    return sum;
  }

  function isToteStowPivotRowDef(def) {
    if (!def) return false;
    if (def.key === "TOTE_STOW_HDR") return false;
    if (def.toteStow) return true;
    return isToteStowPivotRowKey(def.key);
  }

  function isToteStowPivotGroupDef(def) {
    return !!(def && def.kind === "group" && def.toteStow);
  }

  function toteGroupHasVisibleChild(rowDefs, groupIdx, matrix, timeCols) {
    var i, def;
    for (i = groupIdx + 1; i < rowDefs.length; i++) {
      def = rowDefs[i];
      if (def.kind === "group") break;
      if (isToteStowPivotRowKey(def.key) && pivotRowSum(matrix, def.key, timeCols) > 0) {
        return true;
      }
    }
    return false;
  }

  function directGroupHasVisibleChild(rowDefs, groupIdx, matrix, timeCols) {
    var i, def;
    for (i = groupIdx + 1; i < rowDefs.length; i++) {
      def = rowDefs[i];
      if (def.kind === "group") break;
      if (isDirectPivotRowDef(def) && pivotRowSum(matrix, def.key, timeCols) > 0) {
        return true;
      }
    }
    return false;
  }

  function rebundlePivotRowDefs(rowDefs) {
    var out = [];
    var i = 0;
    var def, bundle, seq, bi, role;
    while (i < rowDefs.length) {
      def = rowDefs[i];
      bundle = def.bundle;
      if (!bundle || def.bundleRole === "solo") {
        out.push(def);
        i++;
        continue;
      }
      seq = [];
      while (
        i < rowDefs.length &&
        rowDefs[i].bundle === bundle &&
        rowDefs[i].bundleRole !== "solo"
      ) {
        seq.push(rowDefs[i]);
        i++;
      }
      for (bi = 0; bi < seq.length; bi++) {
        role =
          seq.length === 1
            ? "solo"
            : bi === 0
              ? "start"
              : bi === seq.length - 1
                ? "end"
                : "child";
        out.push(
          Object.assign({}, seq[bi], {
            bundleRole: role,
          })
        );
      }
    }
    return out;
  }

  function filterEmptyDirectPivotRowDefs(rowDefs, matrix, timeCols) {
    var filtered = [];
    var i, def;
    for (i = 0; i < rowDefs.length; i++) {
      def = rowDefs[i];
      if (def.kind === "group") {
        if (isDirectPivotRowDef(def)) {
          if (!directGroupHasVisibleChild(rowDefs, i, matrix, timeCols)) {
            continue;
          }
        }
        if (isToteStowPivotGroupDef(def)) {
          if (!toteGroupHasVisibleChild(rowDefs, i, matrix, timeCols)) {
            continue;
          }
        }
        filtered.push(def);
        continue;
      }
      if (isDirectPivotRowDef(def)) {
        if (pivotRowSum(matrix, def.key, timeCols) <= 0) continue;
        filtered.push(def);
        continue;
      }
      if (isToteStowPivotRowDef(def)) {
        if (pivotRowSum(matrix, def.key, timeCols) <= 0) continue;
        filtered.push(def);
        continue;
      }
      filtered.push(def);
    }
    return rebundlePivotRowDefs(filtered);
  }

  function pivotColWidthPx(colName) {
    if (colName === PIVOT_COL_MOVING) return PIVOT_MOVING_COL_W;
    if (colName === PIVOT_COL_ADHOC) return PIVOT_ADHOC_COL_W;
    if (colName === PIVOT_COL_EMPTY) return PIVOT_EMPTY_COL_W;
    if (colName === "__TOTAL__") return PIVOT_TOTAL_COL_W;
    return PIVOT_TIME_COL_W;
  }

  function pivotTableWidthPx(timeCols) {
    var w = PIVOT_ZONE_COL_W + PIVOT_TOTAL_COL_W;
    var i;
    for (i = 0; i < timeCols.length; i++) {
      w += pivotColWidthPx(timeCols[i]);
    }
    return w;
  }

  function buildPivotColgroup(table, timeCols) {
    var cg = document.createElement("colgroup");
    var colZone = document.createElement("col");
    colZone.className = "yna4-sla-pivot-col-zone";
    colZone.style.width = PIVOT_ZONE_COL_W + "px";
    cg.appendChild(colZone);
    var i, col, colEl;
    for (i = 0; i < timeCols.length; i++) {
      col = timeCols[i];
      colEl = document.createElement("col");
      if (col === PIVOT_COL_MOVING) {
        colEl.className = "yna4-sla-pivot-col-moving";
      } else if (col === PIVOT_COL_ADHOC) {
        colEl.className = "yna4-sla-pivot-col-adhoc";
      } else if (col === PIVOT_COL_EMPTY) {
        colEl.className = "yna4-sla-pivot-col-empty";
      } else {
        colEl.className = "yna4-sla-pivot-col-slot";
      }
      colEl.style.width = pivotColWidthPx(col) + "px";
      cg.appendChild(colEl);
    }
    colEl = document.createElement("col");
    colEl.className = "yna4-sla-pivot-col-total";
    colEl.style.width = PIVOT_TOTAL_COL_W + "px";
    cg.appendChild(colEl);
    table.appendChild(cg);
    table.style.setProperty(
      "width",
      pivotTableWidthPx(timeCols) + "px",
      "important"
    );
    table.style.setProperty("min-width", "0", "important");
    table.style.setProperty("max-width", "none", "important");
  }

  function buildPivotTableHead(thead, timeCols, refYear, cornerTitle) {
    var grouped = groupPivotTimeCols(timeCols, refYear);
    var trDay = document.createElement("tr");
    trDay.className = "yna4-sla-pivot-tr yna4-sla-pivot-tr--head-day";
    var thCorner = document.createElement("th");
    thCorner.rowSpan = 2;
    thCorner.scope = "col";
    thCorner.className = "yna4-sla-pivot-th-zone yna4-sla-pivot-th-corner";
    var spanCornerTitle = document.createElement("span");
    spanCornerTitle.className =
      "yna4-sla-pivot-th-corner-line yna4-sla-pivot-th-corner-line--title";
    spanCornerTitle.textContent = cornerTitle || "SLA Time-table";
    thCorner.appendChild(spanCornerTitle);
    trDay.appendChild(thCorner);

    var gi, ti, grp, thDay, thTime, thSpec, col, hourCols, rmOnlyDay;
    for (gi = 0; gi < grouped.dateGroups.length; gi++) {
      grp = grouped.dateGroups[gi];
      hourCols = [];
      for (ti = 0; ti < grp.cols.length; ti++) {
        if (grp.cols[ti].dateOnly) continue;
        hourCols.push(grp.cols[ti]);
      }
      rmOnlyDay = !hourCols.length;
      if (rmOnlyDay) {
        for (ti = 0; ti < grp.cols.length; ti++) {
          if (!grp.cols[ti].dateOnly) continue;
          thDay = document.createElement("th");
          thDay.rowSpan = 2;
          thDay.scope = "col";
          var mergedMiss = isPivotDayColMissHeader(
            grp.cols[ti].key,
            refYear,
            pivotOverdueStyleCtx && pivotOverdueStyleCtx.queryAt
          );
          thDay.className =
            "yna4-sla-pivot-th-day yna4-sla-pivot-th-day--merged" +
            (mergedMiss ? " yna4-sla-pivot-th-day--overdue" : "");
          thDay.textContent = "";
          var dayLine = document.createElement("span");
          dayLine.className = "yna4-sla-pivot-th-day-line";
          dayLine.textContent = grp.dateLabel;
          thDay.appendChild(dayLine);
          var subLine = document.createElement("span");
          if (mergedMiss) {
            subLine.className =
              "yna4-sla-pivot-th-day-line yna4-sla-pivot-th-day-line--miss";
            subLine.textContent = "MISS";
            thDay.title = "SLA 초과 1시간+ · DAY 집계 (MISS)";
          } else {
            subLine.className =
              "yna4-sla-pivot-th-day-line yna4-sla-pivot-th-day-line--aging";
            subLine.textContent = "Aging";
            thDay.title = "DAY 집계 (Aging · 미초과)";
          }
          thDay.appendChild(subLine);
          trDay.appendChild(thDay);
        }
      } else {
        thDay = document.createElement("th");
        thDay.scope = "colgroup";
        thDay.colSpan = grp.cols.length;
        thDay.className = "yna4-sla-pivot-th-day";
        thDay.textContent = grp.dateLabel;
        trDay.appendChild(thDay);
      }
    }
    for (gi = 0; gi < grouped.specialCols.length; gi++) {
      col = grouped.specialCols[gi];
      thSpec = document.createElement("th");
      thSpec.rowSpan = 2;
      thSpec.scope = "col";
      if (col === PIVOT_COL_MOVING) {
        thSpec.textContent = "이동중";
        thSpec.className = "yna4-sla-pivot-th-moving";
      } else if (col === PIVOT_COL_ADHOC) {
        thSpec.title = "SLA 미등록 · CT/SKU 온도대 추론";
        thSpec.className = "yna4-sla-pivot-th-adhoc";
        var adhocLine1 = document.createElement("span");
        adhocLine1.className = "yna4-sla-pivot-th-adhoc-line";
        adhocLine1.textContent = "임의";
        var adhocLine2 = document.createElement("span");
        adhocLine2.className = "yna4-sla-pivot-th-adhoc-line";
        adhocLine2.textContent = "상차";
        thSpec.appendChild(adhocLine1);
        thSpec.appendChild(adhocLine2);
      } else {
        thSpec.textContent = "비어있음";
        thSpec.title = PIVOT_COL_EMPTY;
        thSpec.className = "yna4-sla-pivot-th-empty";
      }
      trDay.appendChild(thSpec);
    }
    var thTot = document.createElement("th");
    thTot.rowSpan = 2;
    thTot.scope = "col";
    thTot.textContent = "총합계";
    thTot.className = "yna4-sla-pivot-th-total";
    trDay.appendChild(thTot);
    thead.appendChild(trDay);

    var trTime = document.createElement("tr");
    trTime.className = "yna4-sla-pivot-tr yna4-sla-pivot-tr--head-time";
    for (gi = 0; gi < grouped.dateGroups.length; gi++) {
      grp = grouped.dateGroups[gi];
      hourCols = [];
      for (ti = 0; ti < grp.cols.length; ti++) {
        if (!grp.cols[ti].dateOnly) hourCols.push(grp.cols[ti]);
      }
      if (!hourCols.length) continue;
      for (ti = 0; ti < grp.cols.length; ti++) {
        thTime = document.createElement("th");
        thTime.scope = "col";
        if (grp.cols[ti].dateOnly) {
          var dayMiss = isPivotDayColMissHeader(
            grp.cols[ti].key,
            refYear,
            pivotOverdueStyleCtx && pivotOverdueStyleCtx.queryAt
          );
          thTime.className =
            "yna4-sla-pivot-th-time yna4-sla-pivot-th-time--rm" +
            (dayMiss ? " yna4-sla-pivot-th-time--overdue" : "");
          if (dayMiss) {
            thTime.textContent = "MISS";
            thTime.title = "SLA 초과 1시간+ · DAY 집계 (MISS)";
          } else {
            thTime.textContent = "Aging";
            thTime.title = "DAY 집계 (Aging · 미초과)";
          }
        } else {
          thTime.className = "yna4-sla-pivot-th-time";
          thTime.textContent = grp.cols[ti].timeLabel;
        }
        trTime.appendChild(thTime);
      }
    }
    thead.appendChild(trTime);
  }

  function pivotZoneLabelHtml(def) {
    if (def.kind === "group") {
      return (
        '<span class="yna4-sla-pivot-exp" aria-hidden="true">−</span>' +
        '<span class="yna4-sla-pivot-zone-text">' +
        def.label +
        "</span>"
      );
    }
    if (def.kind === "child") {
      return (
        '<span class="yna4-sla-pivot-exp yna4-sla-pivot-exp--blank" aria-hidden="true"></span>' +
        '<span class="yna4-sla-pivot-zone-text yna4-sla-pivot-zone-text--child">' +
        def.label +
        "</span>"
      );
    }
    return (
      '<span class="yna4-sla-pivot-exp yna4-sla-pivot-exp--blank" aria-hidden="true"></span>' +
      '<span class="yna4-sla-pivot-zone-text">' +
      def.label +
      "</span>"
    );
  }

  function pivotRowLabelFromKey(rowKey, rowDefs) {
    var defs = rowDefs || activePivotRowDefs || PIVOT_ROW_DEFS;
    var i;
    for (i = 0; i < defs.length; i++) {
      if (defs[i].key === rowKey) {
        if (defs[i].parent) {
          return defs[i].parent + " " + defs[i].label;
        }
        return defs[i].label;
      }
    }
    if (rowKey === "__GRAND__") return "총합계";
    return String(rowKey || "");
  }

  function formatDrillDateTimeNoYear(d) {
    if (!d || isNaN(d.getTime())) return "";
    return (
      pad2(d.getMonth() + 1) +
      "/" +
      pad2(d.getDate()) +
      " " +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes())
    );
  }

  function transferItemsForPivotCell(
    allRows,
    slaLookup,
    rowKey,
    colName,
    ctStorage,
    queryAt
  ) {
    var out = [];
    var i, item, placed;
    for (i = 0; i < allRows.length; i++) {
      item = allRows[i];
      placed = resolvePivotPlacement(item, slaLookup, ctStorage, queryAt);
      if (!placed) continue;
      if (rowKey !== "__GRAND__" && placed.rowMeta.key !== rowKey) continue;
      if (colName !== "__TOTAL__" && placed.col !== colName) continue;
      out.push(item);
    }
    out.sort(function (a, b) {
      return (Number(b.qty) || 0) - (Number(a.qty) || 0);
    });
    return out;
  }

  function buildDrillDetailLines(matches, slaLookup) {
    var lines = [];
    var i, item, gc, slaRows, inventoryRows, j;
    for (i = 0; i < matches.length; i++) {
      item = matches[i];
      gc = normalizeGcKey(item.gc);
      slaRows = slaRowsLatestCreated(
        slaLookup && slaLookup.byGcAll && slaLookup.byGcAll[gc]
          ? slaLookup.byGcAll[gc]
          : []
      );
      if (!slaRows.length) {
        var single = pickSlaRecordForGc(slaLookup, gc);
        if (single) slaRows = [single];
      }
      if (!slaRows.length) {
        inventoryRows = inventoryFallbackRecordsFromHits(
          inventoryGcFallbackCache[gc] || []
        );
        if (!inventoryRows.length) {
          lines.push({ transfer: item, sla: null });
          continue;
        }
        for (j = 0; j < inventoryRows.length; j++) {
          inventoryRows[j].gc = gc;
          lines.push({
            transfer: item,
            sla: inventoryRows[j],
            inventoryFallback: true,
          });
        }
        continue;
      }
      for (j = 0; j < slaRows.length; j++) {
        lines.push({ transfer: item, sla: slaRows[j] });
      }
    }
    return lines;
  }

  function clearPivotDrillSelection(tableShell) {
    if (!tableShell) return;
    var old = tableShell.querySelectorAll(".yna4-sla-pivot-num--selected");
    var i;
    for (i = 0; i < old.length; i++) {
      old[i].classList.remove("yna4-sla-pivot-num--selected");
    }
  }

  var PIVOT_DRILL_COLS = [
    {
      key: "fromCenter",
      label: "FROM",
      num: false,
      colClass: "yna4-sla-pivot-drill-col-from",
    },
    { key: "vehicleNo", label: "차량번호", num: false, colClass: "yna4-sla-pivot-drill-col-vehicle" },
    {
      key: "loadAt",
      label: "상차시간",
      num: false,
      colClass: "yna4-sla-pivot-drill-col-load",
    },
    {
      key: "unload",
      label: "하차완료시간",
      num: false,
      colClass: "yna4-sla-pivot-drill-col-unload",
    },
    {
      key: "slaPivot",
      label: "SLA",
      num: false,
      colClass: "yna4-sla-pivot-drill-col-sla",
    },
    { key: "ct", label: "컨테이너 바코드", num: false, colClass: "yna4-sla-pivot-drill-col-ct" },
    { key: "toteBarcode", label: "토트바코드", num: false, colClass: "yna4-sla-pivot-drill-col-tote" },
    {
      key: "productName",
      label: "상품명",
      num: false,
      colClass: "yna4-sla-pivot-drill-col-pname",
    },
    {
      key: "productBarcode",
      label: "상품바코드",
      num: false,
      colClass: "yna4-sla-pivot-drill-col-pbarcode",
    },
    {
      key: "slaQty",
      label: "유닛",
      num: true,
      colClass: "yna4-sla-pivot-drill-col-unit",
    },
    { key: "status", label: "상태", num: false, colClass: "yna4-sla-pivot-drill-col-status" },
    {
      key: "chuksan",
      label: "축산",
      num: false,
      colClass: "yna4-sla-pivot-drill-col-chuksan",
    },
  ];

  var TOTE_STOW_DRILL_COLS = [
    {
      key: "skuId",
      label: "SKU ID",
      num: false,
      colClass: "yna4-sla-pivot-drill-col-sku",
    },
    {
      key: "moveCompleted",
      label: "createdat",
      num: false,
      colClass: "yna4-sla-pivot-drill-col-unload",
    },
    {
      key: "aging",
      label: "Aging",
      num: false,
      colClass: "yna4-sla-pivot-drill-col-aging",
    },
    {
      key: "temperature",
      label: "온도대",
      num: false,
      colClass: "yna4-sla-pivot-drill-col-temp",
    },
    {
      key: "toteBarcode",
      label: "토트바코드",
      num: false,
      colClass: "yna4-sla-pivot-drill-col-tote",
    },
    {
      key: "productName",
      label: "상품명",
      num: false,
      colClass: "yna4-sla-pivot-drill-col-pname",
    },
    {
      key: "moveQty",
      label: "유닛",
      num: true,
      colClass: "yna4-sla-pivot-drill-col-unit",
    },
  ];

  var TOTE_STOW_DRILL_SHRINK_COL = {
    key: "shrink",
    label: "Shrink",
    num: false,
    colClass: "yna4-sla-pivot-drill-col-shrink",
  };

  function toteStowDrillColsForRowKey(rowKey) {
    if (rowKey === TOTE_STOW_ROW_KEYS.Chilled) {
      return TOTE_STOW_DRILL_COLS.concat([TOTE_STOW_DRILL_SHRINK_COL]);
    }
    return TOTE_STOW_DRILL_COLS;
  }

  var PIVOT_DRILL_SORT_COL_KEY = "slaQty";
  var PIVOT_DRILL_NO_FILTER_COL_KEYS = {
    fromCenter: 1,
    loadAt: 1,
    unload: 1,
    slaPivot: 1,
    slaQty: 1,
    status: 1,
  };

  function pivotDrillColHasFilter(colKey) {
    return !PIVOT_DRILL_NO_FILTER_COL_KEYS[String(colKey || "")];
  }

  function pivotDrillColsForRowKey(rowKey) {
    if (isToteStowPivotRowKey(rowKey)) return TOTE_STOW_DRILL_COLS;
    if (String(rowKey || "") !== "ROCKETMART") return PIVOT_DRILL_COLS;
    var out = [];
    var i, col;
    for (i = 0; i < PIVOT_DRILL_COLS.length; i++) {
      col = PIVOT_DRILL_COLS[i];
      if (col.key === "slaPivot") {
        out.push({
          key: col.key,
          label: "Aging",
          num: col.num,
          colClass: "yna4-sla-pivot-drill-col-aging",
        });
      } else {
        out.push(col);
      }
    }
    return out;
  }

  var DRILL_FILTER_SEARCH_SVG =
    '<svg class="yna4-sla-pivot-drill-filter-icon" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false">' +
    '<circle cx="6.5" cy="6.5" r="4.25" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M10.2 10.2L14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
    "</svg>";

  function fillDrillFilterBtnIcon(btn) {
    btn.innerHTML = DRILL_FILTER_SEARCH_SVG;
  }

  var DRILL_FILTER_BLANK = "(비어 있음)";
  var activeDrillFilterPop = null;

  function drillColIndexByKey(colKey) {
    var i;
    for (i = 0; i < PIVOT_DRILL_COLS.length; i++) {
      if (PIVOT_DRILL_COLS[i].key === colKey) return i;
    }
    return -1;
  }

  function drillFilterCellText(raw) {
    var s = String(raw != null ? raw : "").trim();
    return s === "" || s === "-" ? DRILL_FILTER_BLANK : s;
  }

  function drillUniqueColumnValues(lines, colKey, drillCtx) {
    var seen = Object.create(null);
    var out = [];
    var i, v;
    for (i = 0; i < lines.length; i++) {
      v = drillFilterCellText(
        pivotDrillCellValue(lines[i], colKey, drillCtx)
      );
      if (!seen[v]) {
        seen[v] = 1;
        out.push(v);
      }
    }
    out.sort(function (a, b) {
      return a.localeCompare(b, "ko");
    });
    return out;
  }

  function drillFilterAllowedMap(allValues, stateEntry) {
    var allowed = Object.create(null);
    var i;
    if (!stateEntry || stateEntry.all) {
      for (i = 0; i < allValues.length; i++) {
        allowed[allValues[i]] = true;
      }
      return allowed;
    }
    for (i = 0; i < allValues.length; i++) {
      allowed[allValues[i]] = !!(
        stateEntry.allowed && stateEntry.allowed[allValues[i]]
      );
    }
    return allowed;
  }

  function closeDrillFilterPop() {
    if (activeDrillFilterPop && activeDrillFilterPop.el) {
      if (activeDrillFilterPop.el.parentNode) {
        activeDrillFilterPop.el.parentNode.removeChild(activeDrillFilterPop.el);
      }
      if (activeDrillFilterPop.onDoc) {
        document.removeEventListener(
          "mousedown",
          activeDrillFilterPop.onDoc,
          !!activeDrillFilterPop.onDocCapture
        );
        document.removeEventListener("keydown", activeDrillFilterPop.onKey);
      }
    }
    activeDrillFilterPop = null;
  }

  function drillFilterMountRoot(anchorBtn) {
    if (anchorBtn && typeof anchorBtn.closest === "function") {
      var inSla = anchorBtn.closest(
        ".yna4-sla-root, .yna4-shell-page-sla-inner"
      );
      if (inSla) return inSla;
    }
    return document.body;
  }

  function positionDrillFilterPop(pop, anchorBtn) {
    var r = anchorBtn.getBoundingClientRect();
    var w = 240;
    var left = r.left;
    if (left + w > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - w - 8);
    }
    var top = r.bottom + 2;
    var maxH = Math.min(320, window.innerHeight - top - 8);
    if (maxH < 120) {
      top = Math.max(8, r.top - maxH - 2);
    }
    pop.style.position = "fixed";
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    pop.style.zIndex = "2147483646";
    pop.style.minWidth = w + "px";
    pop.style.maxHeight = Math.max(120, maxH) + "px";
    pop.style.overflow = "auto";
    pop.style.pointerEvents = "auto";
  }

  function applyDrillTableFilters(table, filterState, filterBtns, countEl) {
    var tbody = table.tBodies[0];
    if (!tbody) return 0;
    var trs = tbody.rows;
    var visible = 0;
    var i, tr, show, colKey, f, ci, td, val;
    for (i = 0; i < trs.length; i++) {
      tr = trs[i];
      show = true;
      for (colKey in filterState) {
        if (!Object.prototype.hasOwnProperty.call(filterState, colKey)) {
          continue;
        }
        f = filterState[colKey];
        if (!f || f.all) continue;
        ci = drillColIndexByKey(colKey);
        if (ci < 0) continue;
        td = tr.children[ci];
        if (!td) continue;
        val = drillFilterCellText(td.textContent);
        if (!f.allowed || !f.allowed[val]) {
          show = false;
          break;
        }
      }
      tr.style.display = show ? "" : "none";
      if (show) visible++;
    }
    if (filterBtns) {
      for (colKey in filterBtns) {
        if (!Object.prototype.hasOwnProperty.call(filterBtns, colKey)) continue;
        if (filterBtns[colKey].active) {
          filterBtns[colKey].btn.classList.add(
            "yna4-sla-pivot-drill-filter-btn--active"
          );
        } else {
          filterBtns[colKey].btn.classList.remove(
            "yna4-sla-pivot-drill-filter-btn--active"
          );
        }
      }
    }
    if (countEl) {
      if (visible < trs.length) {
        countEl.textContent =
          " · 표시 " + visible + "/" + trs.length + "행";
        countEl.style.display = "";
      } else {
        countEl.textContent = "";
        countEl.style.display = "none";
      }
    }
    return visible;
  }

  function drillColDefByKey(colKey) {
    var i;
    for (i = 0; i < PIVOT_DRILL_COLS.length; i++) {
      if (PIVOT_DRILL_COLS[i].key === colKey) return PIVOT_DRILL_COLS[i];
    }
    return null;
  }

  function drillSortRawValue(line, colKey, drillCtx, colDef) {
    var item = line.transfer;
    var sla = line.sla;
    if (colDef && colDef.num) {
      if (colKey === "slaQty") {
        var qty = sla ? Number(sla.quantity) : NaN;
        return isFinite(qty) ? qty : -9007199254740990;
      }
      var rawNum = pivotDrillCellValue(line, colKey, drillCtx);
      var n = Number(String(rawNum).replace(/,/g, ""));
      return isFinite(n) ? n : -9007199254740990;
    }
    if (colKey === "unload") {
      var uAt = drillUnloadColDate(item);
      if (uAt && !isNaN(uAt.getTime())) {
        return uAt.getTime();
      }
      return 9007199254740991;
    }
    if (colKey === "slaPivot") {
      return drillSlaPivotSortKey(line, drillCtx);
    }
    return drillFilterCellText(
      pivotDrillCellValue(line, colKey, drillCtx)
    ).toLowerCase();
  }

  function compareDrillLineIndices(
    aIdx,
    bIdx,
    lines,
    colKey,
    drillCtx,
    colDef,
    dir
  ) {
    var va = drillSortRawValue(lines[aIdx], colKey, drillCtx, colDef);
    var vb = drillSortRawValue(lines[bIdx], colKey, drillCtx, colDef);
    var cmp;
    if (typeof va === "number" && typeof vb === "number") {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb), "ko");
    }
    if (cmp === 0) cmp = aIdx - bIdx;
    return dir > 0 ? cmp : -cmp;
  }

  function updateDrillSortBtnUi(sortState, sortBtns) {
    var k, btn, entry;
    if (!sortBtns) return;
    for (k in sortBtns) {
      if (!Object.prototype.hasOwnProperty.call(sortBtns, k)) continue;
      entry = sortBtns[k];
      btn = entry.btn;
      btn.classList.remove(
        "yna4-sla-pivot-drill-sort-btn--asc",
        "yna4-sla-pivot-drill-sort-btn--desc"
      );
      if (sortState.key === k && sortState.dir === 1) {
        btn.classList.add("yna4-sla-pivot-drill-sort-btn--asc");
        btn.textContent = "\u25B2";
        btn.title = "내림차순으로 변경";
      } else if (sortState.key === k && sortState.dir === -1) {
        btn.classList.add("yna4-sla-pivot-drill-sort-btn--desc");
        btn.textContent = "\u25BC";
        btn.title = "정렬 해제";
      } else {
        btn.textContent = "\u25B2\u25BC";
        btn.title = "유닛 오름차순 정렬";
      }
    }
  }

  function applyDrillTableSort(table, lines, drillCtx, sortState, sortBtns) {
    var tbody = table.tBodies[0];
    if (!tbody) return;
    var trs = Array.prototype.slice.call(tbody.rows);
    var colDef, colKey, dir, i;
    if (!sortState.key || !sortState.dir) {
      trs.sort(function (trA, trB) {
        return (
          (Number(trA.getAttribute("data-drill-line-idx")) || 0) -
          (Number(trB.getAttribute("data-drill-line-idx")) || 0)
        );
      });
    } else {
      colKey = sortState.key;
      dir = sortState.dir;
      colDef = drillColDefByKey(colKey);
      trs.sort(function (trA, trB) {
        var ia = Number(trA.getAttribute("data-drill-line-idx")) || 0;
        var ib = Number(trB.getAttribute("data-drill-line-idx")) || 0;
        return compareDrillLineIndices(
          ia,
          ib,
          lines,
          colKey,
          drillCtx,
          colDef,
          dir
        );
      });
    }
    for (i = 0; i < trs.length; i++) tbody.appendChild(trs[i]);
    updateDrillSortBtnUi(sortState, sortBtns);
  }

  function openDrillFilterPop(
    anchorBtn,
    colDef,
    lines,
    drillCtx,
    table,
    filterState,
    filterBtns,
    countEl
  ) {
    closeDrillFilterPop();
    var allValues = drillUniqueColumnValues(lines, colDef.key, drillCtx);
    if (!allValues.length) return;

    var allowed = drillFilterAllowedMap(allValues, filterState[colDef.key]);
    var pop = document.createElement("div");
    pop.className = "yna4-sla-pivot-drill-filter-pop";
    pop.setAttribute("role", "dialog");
    pop.addEventListener("mousedown", function (e) {
      e.stopPropagation();
    });

    var search = document.createElement("input");
    search.type = "search";
    search.className = "yna4-sla-pivot-drill-filter-search";
    search.placeholder = "검색";
    pop.appendChild(search);

    var allRow = document.createElement("label");
    allRow.className = "yna4-sla-pivot-drill-filter-all";
    var allCb = document.createElement("input");
    allCb.type = "checkbox";
    allCb.checked = allValues.every(function (v) {
      return allowed[v];
    });
    allRow.appendChild(allCb);
    allRow.appendChild(document.createTextNode(" (모두 선택)"));
    pop.appendChild(allRow);

    var list = document.createElement("div");
    list.className = "yna4-sla-pivot-drill-filter-list";
    pop.appendChild(list);

    var itemRows = [];
    var i, row, cb, val;

    function syncAllCheckbox() {
      var allOn = true;
      var anyOn = false;
      for (i = 0; i < itemRows.length; i++) {
        if (!itemRows[i].cb.checked) allOn = false;
        else anyOn = true;
      }
      allCb.indeterminate = anyOn && !allOn;
      allCb.checked = allOn;
    }

    function renderListItems() {
      var q = String(search.value || "")
        .trim()
        .toLowerCase();
      list.textContent = "";
      itemRows = [];
      for (i = 0; i < allValues.length; i++) {
        val = allValues[i];
        if (q && val.toLowerCase().indexOf(q) < 0) continue;
        row = document.createElement("label");
        row.className = "yna4-sla-pivot-drill-filter-item";
        cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!allowed[val];
        (function (v, checkbox) {
          checkbox.addEventListener("change", function (ev) {
            allowed[v] = ev.target.checked;
            syncAllCheckbox();
          });
        })(val, cb);
        row.appendChild(cb);
        row.appendChild(document.createTextNode(" " + val));
        list.appendChild(row);
        itemRows.push({ cb: cb, val: val });
      }
      syncAllCheckbox();
    }

    allCb.addEventListener("change", function () {
      var on = allCb.checked;
      allCb.indeterminate = false;
      for (i = 0; i < allValues.length; i++) {
        allowed[allValues[i]] = on;
      }
      renderListItems();
    });

    search.addEventListener("input", renderListItems);
    renderListItems();

    var actions = document.createElement("div");
    actions.className = "yna4-sla-pivot-drill-filter-actions";

    var btnClear = document.createElement("button");
    btnClear.type = "button";
    btnClear.className = "yna4-sla-pivot-drill-filter-clear";
    btnClear.textContent = "필터 지우기";
    btnClear.addEventListener("click", function () {
      delete filterState[colDef.key];
      if (filterBtns[colDef.key]) filterBtns[colDef.key].active = false;
      applyDrillTableFilters(table, filterState, filterBtns, countEl);
      closeDrillFilterPop();
    });

    var btnOk = document.createElement("button");
    btnOk.type = "button";
    btnOk.className = "yna4-sla-pivot-drill-filter-ok";
    btnOk.textContent = "확인";
    btnOk.addEventListener("click", function () {
      var allOn = allValues.every(function (v) {
        return allowed[v];
      });
      var anyOn = allValues.some(function (v) {
        return allowed[v];
      });
      if (allOn || !anyOn) {
        delete filterState[colDef.key];
        if (filterBtns[colDef.key]) filterBtns[colDef.key].active = false;
      } else {
        var snap = Object.create(null);
        for (i = 0; i < allValues.length; i++) {
          snap[allValues[i]] = !!allowed[allValues[i]];
        }
        filterState[colDef.key] = { all: false, allowed: snap };
        if (filterBtns[colDef.key]) filterBtns[colDef.key].active = true;
      }
      applyDrillTableFilters(table, filterState, filterBtns, countEl);
      closeDrillFilterPop();
    });

    actions.appendChild(btnClear);
    actions.appendChild(btnOk);
    pop.appendChild(actions);

    drillFilterMountRoot(anchorBtn).appendChild(pop);
    positionDrillFilterPop(pop, anchorBtn);

    var onDoc = function (e) {
      if (pop.contains(e.target) || anchorBtn.contains(e.target)) return;
      closeDrillFilterPop();
    };
    var onKey = function (e) {
      if (e.key === "Escape") closeDrillFilterPop();
    };
    activeDrillFilterPop = {
      el: pop,
      onDoc: onDoc,
      onKey: onKey,
      onDocCapture: true,
    };
    setTimeout(function () {
      if (activeDrillFilterPop && activeDrillFilterPop.el === pop) {
        document.addEventListener("mousedown", onDoc, true);
        document.addEventListener("keydown", onKey);
      }
    }, 0);

    search.focus();
  }

  function bindDrillTableFilters(
    table,
    lines,
    drillCtx,
    filterState,
    filterBtns,
    countEl,
    sortState,
    sortBtns,
    drillCols
  ) {
    var ths = table.querySelectorAll("thead th");
    var ci, colDef, btn, sortBtn;
    drillCols = drillCols || PIVOT_DRILL_COLS;
    for (ci = 0; ci < drillCols.length; ci++) {
      colDef = drillCols[ci];
      if (!ths[ci]) continue;
      sortBtn = ths[ci].querySelector(".yna4-sla-pivot-drill-sort-btn");
      if (sortBtn && sortState && sortBtns) {
        sortBtns[colDef.key] = { btn: sortBtn };
        (function (colKey, anchorBtn) {
          anchorBtn.addEventListener("mousedown", function (ev) {
            ev.stopPropagation();
          });
          anchorBtn.addEventListener("click", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            if (sortState.key === colKey && sortState.dir === 1) {
              sortState.dir = -1;
            } else if (sortState.key === colKey && sortState.dir === -1) {
              sortState.key = null;
              sortState.dir = 0;
            } else {
              sortState.key = colKey;
              sortState.dir = 1;
            }
            applyDrillTableSort(table, lines, drillCtx, sortState, sortBtns);
            applyDrillTableFilters(table, filterState, filterBtns, countEl);
          });
        })(colDef.key, sortBtn);
      }
      btn = ths[ci].querySelector(".yna4-sla-pivot-drill-filter-btn");
      if (!btn) continue;
      filterBtns[colDef.key] = { btn: btn, active: false };
      (function (col, anchorBtn) {
        anchorBtn.addEventListener("mousedown", function (ev) {
          ev.stopPropagation();
        });
        anchorBtn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          openDrillFilterPop(
            anchorBtn,
            col,
            lines,
            drillCtx,
            table,
            filterState,
            filterBtns,
            countEl
          );
        });
      })(colDef, btn);
    }
    if (sortState && sortBtns) {
      updateDrillSortBtnUi(sortState, sortBtns);
    }
  }

  function drillRowMetaForLine(line, drillCtx) {
    var item = line.transfer;
    var sla = line.sla;
    if (sla && !line.inventoryFallback) {
      return pivotRowKeyFromSlaRecord(
        sla,
        item ? item.priority1 : "",
        item ? item.priority2 : ""
      );
    }
    if (!item || !drillCtx) {
      return { key: "UNKNOWN", frozen: false, label: "" };
    }
    var placed = resolvePivotPlacement(
      item,
      drillCtx.slaLookup,
      drillCtx.ctStorage,
      drillCtx.pivotQueryAt ||
        parseStatsQueryAt({ loadedAt: drillCtx.loadedAt })
    );
    return placed
      ? placed.rowMeta
      : { key: "UNKNOWN", frozen: false, label: "" };
  }

  function drillSlaPivotAt(item, rowMeta) {
    if (!item) return null;
    if (item.statusLabel === "이동중") return "이동중";
    var baseAt = null;
    var hours = OFFSET_HOURS_DEFAULT;
    if (rowMeta && (rowMeta.key === "ROCKETMART" || rowMeta.rocketMart)) {
      baseAt = item.loadAt;
      hours = OFFSET_HOURS_ROCKETMART;
    } else {
      baseAt = item.unloadAt;
      hours =
        rowMeta && rowMeta.frozen
          ? OFFSET_HOURS_FROZEN
          : OFFSET_HOURS_DEFAULT;
    }
    if (!baseAt) return null;
    return new Date(baseAt.getTime() + hours * 3600000);
  }

  function drillSlaPivotDisplay(line, drillCtx) {
    var item = line.transfer;
    var rowMeta = drillRowMetaForLine(line, drillCtx);
    var at = drillSlaPivotAt(item, rowMeta);
    if (at === "이동중") return "이동중";
    if (!at) return "-";
    return formatDrillDateTimeNoYear(at);
  }

  function drillFromCenterValue(item, sla) {
    if (item && item.fromCenter) return item.fromCenter;
    if (sla && sla.fromCenter) return sla.fromCenter;
    return "";
  }

  function slaRecIsChuksan(sla) {
    var c3 = normalizeSlaLookupKey(sla && sla.cate3 != null ? sla.cate3 : "");
    return c3.indexOf("축산") >= 0;
  }

  /** CATE3=축산 · CATE4=계란 → 계란, 그 외 축산 → 고기 */
  function slaRecIsEgg(sla) {
    if (!slaRecIsChuksan(sla)) return false;
    var c4 = normalizeSlaLookupKey(sla && sla.cate4 != null ? sla.cate4 : "");
    return c4.indexOf("계란") >= 0;
  }

  function isEggProductName(name) {
    return normalizeSlaLookupKey(name).indexOf("계란") >= 0;
  }

  function slaRecChuksanKindLabel(sla) {
    if (!slaRecIsChuksan(sla)) return "";
    if (slaRecIsEgg(sla)) return "🥚계란";
    return "🥩고기";
  }

  function pivotDrillCellValue(line, colKey, drillCtx) {
    var item = line.transfer;
    var sla = line.sla;
    switch (colKey) {
      case "toteBarcode":
        return item ? item.gc || "" : "";
      case "fromCenter":
        return drillFromCenterValue(item, sla);
      case "slaQty":
        return sla ? formatPivotNum(sla.quantity) : "-";
      case "ct":
        return item ? item.ct || "" : "";
      case "status":
        return item ? item.statusLabel || "" : "";
      case "vehicleNo":
        return item ? item.vehicleNo || "" : "";
      case "loadAt":
        return item && item.loadAt && !isNaN(item.loadAt.getTime())
          ? formatDrillDateTimeNoYear(item.loadAt)
          : "";
      case "unload":
        return item ? formatDrillDateTimeNoYear(drillUnloadColDate(item)) : "";
      case "productName":
        return sla ? sla.unitDescription || "-" : "-";
      case "chuksan":
        return slaRecChuksanKindLabel(sla);
      case "productBarcode":
        return sla ? sla.barcode || "-" : "-";
      case "slaPivot":
        return drillSlaPivotDisplay(line, drillCtx);
      default:
        return "";
    }
  }

  function drillStatusSortRank(statusLabel) {
    if (String(statusLabel || "").trim() === "진열중") return 0;
    return 1;
  }

  function drillSlaPivotSortKey(line, drillCtx) {
    var item = line.transfer;
    var rowMeta = drillRowMetaForLine(line, drillCtx);
    var at = drillSlaPivotAt(item, rowMeta);
    if (at === "이동중") return 9007199254740990;
    if (!at || isNaN(at.getTime())) return 9007199254740991;
    return at.getTime();
  }

  function drillPickAtSortKey(line) {
    var item = line.transfer;
    if (item && item.pickAt && !isNaN(item.pickAt.getTime())) {
      return item.pickAt.getTime();
    }
    return 9007199254740991;
  }

  function sortDrillDetailLines(lines, drillCtx, colName) {
    if (!lines || !lines.length) return lines || [];
    var i;
    /* 임의상차 — 집품완료 시간 빠른순(오름차순) 정렬 */
    if (colName === PIVOT_COL_ADHOC) {
      var pickKeyed = [];
      for (i = 0; i < lines.length; i++) {
        pickKeyed.push({
          line: lines[i],
          p: drillPickAtSortKey(lines[i]),
          gc: normalizeGcKey(lines[i].transfer && lines[i].transfer.gc),
        });
      }
      pickKeyed.sort(function (a, b) {
        if (a.p !== b.p) return a.p - b.p;
        return a.gc.localeCompare(b.gc);
      });
      for (i = 0; i < pickKeyed.length; i++) lines[i] = pickKeyed[i].line;
      return lines;
    }
    /* 정렬키 1회 계산 — comparator에서 resolvePivotPlacement 반복 방지 */
    var keyed = [];
    for (i = 0; i < lines.length; i++) {
      keyed.push({
        line: lines[i],
        rank: drillStatusSortRank(
          lines[i].transfer ? lines[i].transfer.statusLabel : ""
        ),
        t: drillSlaPivotSortKey(lines[i], drillCtx),
        gc: normalizeGcKey(lines[i].transfer && lines[i].transfer.gc),
      });
    }
    keyed.sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.t !== b.t) return a.t - b.t;
      return a.gc.localeCompare(b.gc);
    });
    for (i = 0; i < keyed.length; i++) lines[i] = keyed[i].line;
    return lines;
  }

  var DRILL_DOM_CHUNK_SIZE = 60;
  var DRILL_SCAN_YIELD_EVERY = 250;
  /* 직납 드릴 실시간 재고조회 — 드릴 열 때마다 새로 조회. inventory 부하 줄이기: 동시 2 · 요청 뒤 50ms */
  var DIRECT_DRILL_RCRT_CONCURRENCY = 2;
  var DIRECT_DRILL_LIVE_GAP_MS = 50;

  function slaDrillNextFrame() {
    return new Promise(function (resolve) {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function () {
          resolve();
        });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  /** 브라우저가 로딩 UI를 그릴 시간을 확보 */
  function slaDrillAfterPaint() {
    return slaDrillNextFrame().then(function () {
      return slaDrillNextFrame();
    });
  }

  function slaDrillYieldTick() {
    return new Promise(function (resolve) {
      setTimeout(resolve, 0);
    });
  }

  async function transferItemsForPivotCellAsync(
    allRows,
    slaLookup,
    rowKey,
    colName,
    ctStorage,
    queryAt,
    aliveFn
  ) {
    var out = [];
    var i, item, placed;
    allRows = allRows || [];
    for (i = 0; i < allRows.length; i++) {
      if (aliveFn && !aliveFn()) return out;
      if (i && i % DRILL_SCAN_YIELD_EVERY === 0) {
        await slaDrillYieldTick();
        if (aliveFn && !aliveFn()) return out;
      }
      item = allRows[i];
      placed = resolvePivotPlacement(item, slaLookup, ctStorage, queryAt);
      if (!placed) continue;
      if (rowKey !== "__GRAND__" && placed.rowMeta.key !== rowKey) continue;
      if (colName !== "__TOTAL__" && placed.col !== colName) continue;
      out.push(item);
    }
    out.sort(function (a, b) {
      return (Number(b.qty) || 0) - (Number(a.qty) || 0);
    });
    return out;
  }

  async function buildDrillDetailLinesAsync(matches, slaLookup, aliveFn) {
    var lines = [];
    var i, item, gc, slaRows, inventoryRows, j;
    matches = matches || [];
    for (i = 0; i < matches.length; i++) {
      if (aliveFn && !aliveFn()) return lines;
      if (i && i % DRILL_SCAN_YIELD_EVERY === 0) {
        await slaDrillYieldTick();
        if (aliveFn && !aliveFn()) return lines;
      }
      item = matches[i];
      gc = normalizeGcKey(item.gc);
      slaRows = slaRowsLatestCreated(
        slaLookup && slaLookup.byGcAll && slaLookup.byGcAll[gc]
          ? slaLookup.byGcAll[gc]
          : []
      );
      if (!slaRows.length) {
        var single = pickSlaRecordForGc(slaLookup, gc);
        if (single) slaRows = [single];
      }
      if (!slaRows.length) {
        inventoryRows = inventoryFallbackRecordsFromHits(
          inventoryGcFallbackCache[gc] || []
        );
        if (!inventoryRows.length) {
          lines.push({ transfer: item, sla: null });
          continue;
        }
        for (j = 0; j < inventoryRows.length; j++) {
          inventoryRows[j].gc = gc;
          lines.push({
            transfer: item,
            sla: inventoryRows[j],
            inventoryFallback: true,
          });
        }
        continue;
      }
      for (j = 0; j < slaRows.length; j++) {
        lines.push({ transfer: item, sla: slaRows[j] });
      }
    }
    return lines;
  }

  function createTransferDrillRow(line, lineIdx, drillCols, drillCtx, shrinkMaps) {
    var tr = document.createElement("tr");
    var ci, colDef, td;
    tr.setAttribute("data-drill-line-idx", String(lineIdx));
    if (isTransferDrillLineShrinkTarget(line, drillCtx, shrinkMaps)) {
      tr.classList.add("yna4-sla-pivot-drill-tr--shrink");
    }
    if (slaRecIsChuksan(line && line.sla)) {
      tr.classList.add("yna4-sla-pivot-drill-tr--chuksan");
    }
    if (slaRecIsEgg(line && line.sla)) {
      tr.classList.add("yna4-sla-pivot-drill-tr--egg");
    }
    for (ci = 0; ci < drillCols.length; ci++) {
      colDef = drillCols[ci];
      td = document.createElement("td");
      if (colDef.colClass) {
        td.className = colDef.colClass;
        if (colDef.key === "productName") {
          td.classList.add("yna4-sla-pivot-drill-unit");
        }
        if (colDef.num && colDef.key !== "slaQty") {
          td.classList.add("yna4-sla-pivot-drill-num");
        }
      } else if (colDef.num) {
        td.className = "yna4-sla-pivot-drill-num";
      } else if (colDef.key === "productName") {
        td.className = "yna4-sla-pivot-drill-unit";
      }
      td.textContent = pivotDrillCellValue(line, colDef.key, drillCtx);
      tr.appendChild(td);
    }
    return tr;
  }

  async function appendDrillRowsChunked(opts) {
    var tbody = opts.tbody;
    var lines = opts.lines || [];
    var createRow = opts.createRow;
    var aliveFn = opts.aliveFn;
    var onProgress = opts.onProgress;
    var chunkSize = opts.chunkSize || DRILL_DOM_CHUNK_SIZE;
    var i = 0;
    var end;
    var frag;
    var j;
    while (i < lines.length) {
      if (aliveFn && !aliveFn()) return false;
      end = Math.min(i + chunkSize, lines.length);
      frag = document.createDocumentFragment();
      for (j = i; j < end; j++) {
        frag.appendChild(createRow(lines[j], j));
      }
      tbody.appendChild(frag);
      i = end;
      if (typeof onProgress === "function") onProgress(i, lines.length);
      if (i < lines.length) {
        await slaDrillYieldTick();
      }
    }
    return true;
  }

  function isDirectPivotRowKey(rowKey) {
    return String(rowKey || "").indexOf("DIRECT_") === 0;
  }

  function isSlaPendingTimeCol(col) {
    return (
      col &&
      col !== PIVOT_COL_MOVING &&
      col !== PIVOT_COL_ADHOC &&
      col !== PIVOT_COL_EMPTY
    );
  }

  var SLA_METRICS_ZONE_DEFS = [
    {
      key: "tr_ambient",
      label: "TR Ambient",
      match: function (rk) {
        return rk === "AMBIENT_ATS" || rk === "AMBIENT_NON_ATS";
      },
    },
    {
      key: "tr_chilled",
      label: "TR Chilled",
      match: function (rk) {
        return rk === "CHILLED_ATS" || rk === "CHILLED_NON_ATS";
      },
    },
    {
      key: "tr_frozen",
      label: "TR Frozen",
      match: function (rk) {
        return rk === "FROZEN";
      },
    },
    {
      key: "tr_rocketmart",
      label: "TR RocketMart",
      match: function (rk) {
        return rk === "ROCKETMART";
      },
    },
    {
      key: "dir_ambient",
      label: "DIR Ambient",
      match: function (rk) {
        return rk === "DIRECT_PENDING_AMBIENT";
      },
    },
    {
      key: "dir_chilled",
      label: "DIR Chilled",
      match: function (rk) {
        return rk === "DIRECT_PENDING_CHILLED";
      },
    },
    {
      key: "dir_frozen",
      label: "DIR Frozen",
      match: function (rk) {
        return rk === "DIRECT_PENDING_FROZEN";
      },
    },
  ];

  function buildSlaPendingSnapshotForRows(matrix, timeCols, rowMatchFn) {
    var snap = { cells: Object.create(null), total: 0 };
    if (!matrix || !timeCols || typeof rowMatchFn !== "function") {
      return snap;
    }
    var rk, rowData, ci, col, q, cellKey;
    for (rk in matrix) {
      if (!Object.prototype.hasOwnProperty.call(matrix, rk)) continue;
      if (!rowMatchFn(rk)) continue;
      rowData = matrix[rk];
      for (ci = 0; ci < timeCols.length; ci++) {
        col = timeCols[ci];
        if (!isSlaPendingTimeCol(col)) continue;
        q = Number(rowData[col]) || 0;
        if (q <= 0) continue;
        cellKey = rk + "\t" + col;
        snap.cells[cellKey] = q;
        snap.total += q;
      }
    }
    return snap;
  }

  function buildSlaMetricsZoneSnapshots(matrix, timeCols) {
    var out = Object.create(null);
    var zi, def;
    for (zi = 0; zi < SLA_METRICS_ZONE_DEFS.length; zi++) {
      def = SLA_METRICS_ZONE_DEFS[zi];
      out[def.key] = buildSlaPendingSnapshotForRows(
        matrix,
        timeCols,
        def.match
      );
    }
    return out;
  }

  function diffSlaPendingSnapshots(prev, curr) {
    var cleared = 0;
    var added = 0;
    var keys = Object.create(null);
    var k, p, c;
    prev = prev || { cells: Object.create(null), total: 0 };
    curr = curr || { cells: Object.create(null), total: 0 };
    for (k in prev.cells) {
      if (Object.prototype.hasOwnProperty.call(prev.cells, k)) keys[k] = 1;
    }
    for (k in curr.cells) {
      if (Object.prototype.hasOwnProperty.call(curr.cells, k)) keys[k] = 1;
    }
    for (k in keys) {
      if (!Object.prototype.hasOwnProperty.call(keys, k)) continue;
      p = Number(prev.cells[k]) || 0;
      c = Number(curr.cells[k]) || 0;
      if (p > c) cleared += p - c;
      if (c > p) added += c - p;
    }
    return {
      cleared: cleared,
      added: added,
      totalPrev: Number(prev.total) || 0,
      totalCurr: Number(curr.total) || 0,
    };
  }

  function formatSlaMetricsQty(n) {
    return Math.round(Number(n) || 0).toLocaleString("en-US");
  }

  function formatSlaZoneMetricsLine(zoneLabel, diff) {
    diff = diff || {};
    if (
      !diff.totalPrev &&
      !diff.totalCurr &&
      !diff.cleared &&
      !diff.added
    ) {
      return "";
    }
    return (
      "[30min " +
      zoneLabel +
      "] " +
      SLA_METRICS_CLEARED_LABEL +
      " " +
      formatSlaMetricsQty(diff.cleared) +
      " · 신규 " +
      formatSlaMetricsQty(diff.added) +
      " · 잔량 " +
      formatSlaMetricsQty(diff.totalPrev) +
      "→" +
      formatSlaMetricsQty(diff.totalCurr)
    );
  }

  function buildSlaCaptureMetrics(matrix, timeCols) {
    var currZones = buildSlaMetricsZoneSnapshots(matrix, timeCols);
    var prevPack = null;
    try {
      prevPack = JSON.parse(
        localStorage.getItem(SLA_METRICS_PREV_LS_KEY) || "null"
      );
    } catch (ePrev) {
      prevPack = null;
    }
    var metricsLines = [];
    var zoneDiffs = Object.create(null);
    var prevZones =
      prevPack && prevPack.zones ? prevPack.zones : null;
    if (prevZones) {
      var zi, def, diff, line;
      for (zi = 0; zi < SLA_METRICS_ZONE_DEFS.length; zi++) {
        def = SLA_METRICS_ZONE_DEFS[zi];
        diff = diffSlaPendingSnapshots(
          prevZones[def.key],
          currZones[def.key]
        );
        zoneDiffs[def.key] = diff;
        line = formatSlaZoneMetricsLine(def.label, diff);
        if (line) metricsLines.push(line);
      }
      if (metricsLines.length) {
        metricsLines.unshift(SLA_METRICS_INTRO_LINE);
      }
    }
    return {
      metricsLines: metricsLines,
      snapshot: { zones: currZones },
      zones: zoneDiffs,
      zoneTotals: currZones,
    };
  }

  function persistSlaMetricsSnapshot(batchId, snapshot) {
    if (!snapshot) return;
    try {
      localStorage.setItem(
        SLA_METRICS_PREV_LS_KEY,
        JSON.stringify({
          batchId: batchId,
          zones: snapshot.zones,
          savedAt: new Date().toISOString(),
        })
      );
    } catch (eSave) {}
  }

  function buildCombinedRowDefs() {
    var out = [];
    var directTemps = [
      { key: "DIRECT_PENDING_AMBIENT", label: "Ambient" },
      { key: "DIRECT_PENDING_CHILLED", label: "Chilled" },
      { key: "DIRECT_PENDING_FROZEN", label: "Frozen" },
    ];
    var xferZones = [
      {
        headerKey: "COMBINED_TR_AMBIENT_HDR",
        headerLabel: "TR Ambient",
        bundle: "combined-tr-ambient",
        children: [
          { key: "AMBIENT_ATS", label: "ATS", ats: true },
          { key: "AMBIENT_NON_ATS", label: "Non-ATS" },
        ],
      },
      {
        headerKey: "COMBINED_TR_CHILLED_HDR",
        headerLabel: "TR Chilled",
        bundle: "combined-tr-chilled",
        children: [
          { key: "CHILLED_ATS", label: "ATS", ats: true },
          { key: "CHILLED_NON_ATS", label: "Non-ATS" },
        ],
      },
    ];
    var i, zi, zone, child;
    for (i = 0; i < directTemps.length; i++) {
      out.push({
        key: directTemps[i].key,
        kind: "leaf",
        label: "DIR " + directTemps[i].label,
        bundle: "combined-direct",
        bundleRole:
          i === 0 ? "start" : i === directTemps.length - 1 ? "end" : "child",
        direct: true,
      });
    }
    for (zi = 0; zi < xferZones.length; zi++) {
      zone = xferZones[zi];
      out.push({
        key: zone.headerKey,
        kind: "group",
        label: zone.headerLabel,
        bundle: zone.bundle,
        bundleRole: "start",
      });
      for (i = 0; i < zone.children.length; i++) {
        child = zone.children[i];
        out.push({
          key: child.key,
          kind: "child",
          label: child.label,
          parent: zone.headerLabel,
          ats: !!child.ats,
          bundle: zone.bundle,
          bundleRole: i === zone.children.length - 1 ? "end" : "child",
        });
      }
    }
    out.push({
      key: "FROZEN",
      kind: "leaf",
      label: "TR Frozen",
      bundle: "combined-tr-frozen",
      bundleRole: "solo",
    });
    out.push({
      key: "ROCKETMART",
      kind: "leaf",
      label: "RocketMart",
      bundle: "combined-tr-rocketmart",
      bundleRole: "solo",
    });
    var toteTemps = [
      { key: TOTE_STOW_ROW_KEYS.Ambient, label: TOTE_STOW_TEMP_LABELS.Ambient },
      { key: TOTE_STOW_ROW_KEYS.Chilled, label: TOTE_STOW_TEMP_LABELS.Chilled },
      { key: TOTE_STOW_ROW_KEYS.Frozen, label: TOTE_STOW_TEMP_LABELS.Frozen },
    ];
    for (i = 0; i < toteTemps.length; i++) {
      out.push({
        key: toteTemps[i].key,
        kind: "leaf",
        label: TOTE_STOW_ZONE_LABEL + " " + toteTemps[i].label,
        bundle: "combined-tr-totestow",
        bundleRole:
          i === 0 ? "start" : i === toteTemps.length - 1 ? "end" : "child",
        toteStow: true,
      });
    }
    return out;
  }

  function mergePivotMatrix(transferMatrix, directMatrix) {
    var out = Object.create(null);
    var k;
    if (transferMatrix) {
      for (k in transferMatrix) {
        if (Object.prototype.hasOwnProperty.call(transferMatrix, k)) {
          out[k] = transferMatrix[k];
        }
      }
    }
    if (directMatrix) {
      for (k in directMatrix) {
        if (Object.prototype.hasOwnProperty.call(directMatrix, k)) {
          out[k] = directMatrix[k];
        }
      }
    }
    return out;
  }

  function mergeCombinedTimeCols(transferBundle, directBundle, refYear) {
    var colSet = Object.create(null);
    var cols = [];
    var i;
    if (transferBundle && transferBundle.timeCols) {
      cols = cols.concat(transferBundle.timeCols);
    }
    if (directBundle && directBundle.timeCols) {
      cols = cols.concat(directBundle.timeCols);
    }
    for (i = 0; i < cols.length; i++) {
      colSet[cols[i]] = 1;
    }
    return sortPivotTimeCols(colSet, refYear);
  }

  function buildCombinedPivotBundle(transferBundle, directBundle) {
    var hasTransfer =
      transferBundle &&
      !transferBundle.stopped &&
      !transferBundle.error &&
      !transferBundle.empty &&
      transferBundle.matrix;
    var hasDirect =
      directBundle &&
      !directBundle.stopped &&
      !directBundle.error &&
      !directBundle.empty &&
      directBundle.matrix;
    if (!hasTransfer && !hasDirect) {
      var msgs = [];
      if (transferBundle && transferBundle.empty && transferBundle.message) {
        msgs.push("이관: " + transferBundle.message);
      }
      if (directBundle && directBundle.empty && directBundle.message) {
        msgs.push("직납: " + directBundle.message);
      }
      return {
        empty: true,
        summary: "조회 결과 없음",
        message:
          msgs.length > 0
            ? msgs.join(" · ")
            : "이관·직납 피벗 데이터가 없습니다.",
      };
    }
    var refYear =
      (hasTransfer &&
        transferBundle.stats &&
        transferBundle.stats.refYear) ||
      (hasDirect && directBundle.stats && directBundle.stats.refYear) ||
      new Date().getFullYear();
    var ts = formatPipelineTimestamp();
    var xferCtx =
      hasTransfer && transferBundle.stats
        ? transferBundle.stats.drillCtx
        : null;
    var directCtx =
      hasDirect && directBundle.stats
        ? directBundle.stats.drillCtx
        : null;
    var parts = [];
    if (directBundle && directBundle.summary) {
      parts.push(directBundle.summary);
    }
    if (transferBundle && transferBundle.summary) {
      parts.push(transferBundle.summary);
    }
    return {
      matrix: mergePivotMatrix(
        hasTransfer ? transferBundle.matrix : null,
        hasDirect ? directBundle.matrix : null
      ),
      timeCols: mergeCombinedTimeCols(
        hasTransfer ? transferBundle : null,
        hasDirect ? directBundle : null,
        refYear
      ),
      stats: {
        rowDefs: buildCombinedRowDefs(),
        cornerTitle: "SLA 전체",
        refYear: refYear,
        loadedAt: ts,
        matrixPending:
          hasDirect && directBundle.stats
            ? directBundle.stats.matrixPending
            : null,
        drillCtx: {
          mode: "combined",
          transfer: xferCtx,
          direct: directCtx,
          shrinkSkuMaps: lastShrinkSkuMaps,
          toteStowLines:
            xferCtx && xferCtx.toteStowLines ? xferCtx.toteStowLines : [],
          loadedAt: ts,
        },
      },
      summary: parts.join(" · "),
    };
  }

  function renderCombinedGrandDrillPanel(
    drillHost,
    drillCtx,
    colName,
    rowLabel,
    colLabel
  ) {
    drillHost.textContent = "";
    var wrap = document.createElement("div");
    wrap.className = "yna4-sla-pivot-drill-combined";
    var appended = 0;
    if (drillCtx && drillCtx.direct) {
      var dHost = document.createElement("div");
      renderDirectDrillPanel(
        dHost,
        drillCtx.direct,
        "__GRAND__",
        colName,
        "직납",
        colLabel
      );
      if (dHost.firstChild) {
        wrap.appendChild(dHost.firstChild);
        appended++;
      }
    }
    if (drillCtx && drillCtx.transfer) {
      var tHost = document.createElement("div");
      renderPivotDrillPanel(
        tHost,
        drillCtx.transfer,
        "__GRAND__",
        colName,
        "이관",
        colLabel
      );
      if (tHost.firstChild) {
        wrap.appendChild(tHost.firstChild);
        appended++;
      }
    }
    if (!appended) {
      var empty = document.createElement("p");
      empty.className = "yna4-sla-pivot-drill-empty";
      empty.textContent = "해당 셀에 데이터가 없습니다.";
      drillHost.appendChild(empty);
      return;
    }
    drillHost.appendChild(wrap);
  }

  function toteStowDrillTempLabel(line) {
    if (!line) return "-";
    var zone = toteLineTempZone(line);
    if (zone && TOTE_STOW_TEMP_LABELS[zone]) return TOTE_STOW_TEMP_LABELS[zone];
    return "-";
  }

  function isToteStowLineShrinkTarget(line, maps) {
    if (!line) return false;
    if (isSrProductName(line.skuName)) return true;
    maps = maps || lastShrinkSkuMaps;
    if (!maps) return false;
    var k = normalizeShrinkInternalSkuKey(line.skuId);
    if (!k) return false;
    return !!(maps.byInternal[k] || maps.byExternal[k]);
  }

  function toteStowDrillCellValue(line, colKey, maps) {
    if (!line) return "";
    switch (colKey) {
      case "toteBarcode":
        return line.toteBarcode || "";
      case "moveCompleted":
        return line.moveCompletedAt
          ? formatDrillDateTimeNoYear(line.moveCompletedAt)
          : "-";
      case "aging":
        return line.agingAt ? formatDrillDateTimeNoYear(line.agingAt) : "-";
      case "moveQty":
        return formatPivotNum(line.moveQuantity);
      case "skuId":
        return line.skuId || "-";
      case "temperature":
        return toteStowDrillTempLabel(line);
      case "productName":
        return line.skuName || "-";
      case "status":
        return line.statusDesc || "";
      case "shrink":
        return isToteStowLineShrinkTarget(line, maps) ? "O" : "X";
      default:
        return "";
    }
  }

  function applyToteStowDrillAgingAlert(tr, line, queryAt) {
    if (
      !tr ||
      !line ||
      !line.agingAt ||
      !isSlaDeadlineUrgent(
        line.agingAt,
        queryAt,
        PIVOT_ALERT_HOURS_ROCKETMART
      )
    ) {
      return;
    }
    tr.classList.add("yna4-sla-pivot-drill-tr--aging-alert");
  }

  function renderToteStowDrillTableBody(tbody, lines, queryAt, drillCols, maps) {
    drillCols = drillCols || TOTE_STOW_DRILL_COLS;
    var li, tr, td, ci, colDef;
    for (li = 0; li < lines.length; li++) {
      tr = document.createElement("tr");
      tr.setAttribute("data-tote-line-idx", String(li));
      applyToteStowDrillAgingAlert(tr, lines[li], queryAt);
      if (isToteStowLineShrinkTarget(lines[li], maps)) {
        tr.classList.add("yna4-sla-pivot-drill-tr--shrink");
      }
      if (isEggProductName(lines[li] && lines[li].skuName)) {
        tr.classList.add("yna4-sla-pivot-drill-tr--egg");
      }
      for (ci = 0; ci < drillCols.length; ci++) {
        colDef = drillCols[ci];
        td = document.createElement("td");
        if (colDef.colClass) td.className = colDef.colClass;
        if (colDef.num) td.classList.add("yna4-sla-pivot-drill-num");
        if (colDef.key === "productName") {
          td.classList.add("yna4-sla-pivot-drill-unit");
        }
        td.textContent = toteStowDrillCellValue(lines[li], colDef.key, maps);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function slaDrillCellPlainText(el) {
    var s = String(el && el.textContent != null ? el.textContent : "");
    s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    s = s.replace(/\t/g, " ");
    s = s.replace(/\n+/g, " / ");
    s = s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    return s;
  }

  /** 직납 드릴 RCRT — 비어 있거나 자리표시만 있으면 복사 대상에서 제외 */
  function slaDirectDrillRcrtIsEmpty(text) {
    var s = String(text || "").trim();
    if (!s) return true;
    if (s === "-") return true;
    if (s === "RCRT 조회…") return true;
    return false;
  }

  function slaDrillHeaderPlainText(th) {
    if (!th) return "";
    var label =
      th.querySelector && th.querySelector(".yna4-sla-pivot-drill-th-label");
    return slaDrillCellPlainText(label || th);
  }

  function slaEscapeHtmlForTeams(s) {
    return String(s != null ? s : "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function slaCopyTextToClipboard(text) {
    var s = String(text || "");
    if (!s) return Promise.resolve(false);
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
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
      var ta = document.createElement("textarea");
      ta.value = s;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return Promise.resolve(!!ok);
    } catch (eCp) {
      return Promise.resolve(false);
    }
  }

  function slaCopyHtmlPlainToClipboard(innerBodyHtml, plainText) {
    var plain = String(plainText || "");
    var inner = String(innerBodyHtml || "");
    if (!inner && !plain) return Promise.resolve(false);
    var fullHtml =
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body>" +
      inner +
      "</body></html>";
    if (navigator.clipboard && typeof ClipboardItem === "function") {
      try {
        var item = new ClipboardItem({
          "text/html": new Blob([fullHtml], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        });
        return navigator.clipboard.write([item]).then(
          function () {
            return true;
          },
          function () {
            return plain ? slaCopyTextToClipboard(plain) : Promise.resolve(false);
          }
        );
      } catch (eClip) {
        return plain ? slaCopyTextToClipboard(plain) : Promise.resolve(false);
      }
    }
    return plain ? slaCopyTextToClipboard(plain) : Promise.resolve(false);
  }

  function slaDrillRowCopyStyle(tr) {
    if (!tr || !tr.classList) return null;
    if (tr.classList.contains("yna4-sla-pivot-drill-tr--chuksan")) {
      return { bg: "#fed7aa", color: "#7c2d12" };
    }
    if (tr.classList.contains("yna4-sla-pivot-drill-tr--aging-alert")) {
      return { bg: "#fecaca", color: "#9f1239" };
    }
    if (tr.classList.contains("yna4-sla-pivot-drill-tr--shrink")) {
      return { bg: "#e0f2fe", color: "#0c4a6e" };
    }
    return null;
  }

  /** @param {string=} copyMode "" | "sr" | "egg" */
  function gatherSlaDrillTableCopy(table, copyMode) {
    if (!table) return null;
    var mode = copyMode === "sr" || copyMode === "egg" ? copyMode : "";
    var thead = table.tHead;
    var tbody = table.tBodies && table.tBodies[0];
    if (!thead || !thead.rows.length) return null;
    var headers = [];
    var hi, th;
    for (hi = 0; hi < thead.rows[0].cells.length; hi++) {
      th = thead.rows[0].cells[hi];
      headers.push(slaDrillHeaderPlainText(th));
    }
    if (!headers.length) return null;
    var isDirect =
      table.classList &&
      table.classList.contains("yna4-sla-pivot-drill-table--direct");
    var rcrtCol = -1;
    var nameCol = -1;
    var chuksanCol = -1;
    for (hi = 0; hi < headers.length; hi++) {
      if (isDirect && headers[hi] === "RCRT") rcrtCol = hi;
      if (headers[hi] === "상품명" || headers[hi] === "SKU 이름") nameCol = hi;
      if (headers[hi] === "축산") chuksanCol = hi;
    }
    var rows = [];
    var styles = [];
    var aligns = [];
    var ri, tr, ci, td, row, show, st, keep;
    if (tbody) {
      for (ri = 0; ri < tbody.rows.length; ri++) {
        tr = tbody.rows[ri];
        show = tr && tr.style && tr.style.display !== "none";
        if (!show) continue;
        if (mode === "sr") {
          if (!tr.classList.contains("yna4-sla-pivot-drill-tr--shrink")) {
            continue;
          }
        } else if (mode === "egg") {
          keep = tr.classList.contains("yna4-sla-pivot-drill-tr--egg");
          if (!keep && chuksanCol >= 0) {
            keep =
              slaDrillCellPlainText(tr.cells[chuksanCol]).indexOf("계란") >= 0;
          } else if (!keep && chuksanCol < 0 && nameCol >= 0) {
            /* 직납·Tote 등 축산열 없는 드릴만 상품명 폴백 */
            keep = isEggProductName(slaDrillCellPlainText(tr.cells[nameCol]));
          }
          if (!keep) continue;
        }
        row = [];
        for (ci = 0; ci < headers.length; ci++) {
          td = tr.cells[ci];
          row.push(slaDrillCellPlainText(td));
        }
        if (
          isDirect &&
          rcrtCol >= 0 &&
          slaDirectDrillRcrtIsEmpty(row[rcrtCol])
        ) {
          continue;
        }
        rows.push(row);
        styles.push(slaDrillRowCopyStyle(tr));
        aligns.push([]);
        for (ci = 0; ci < headers.length; ci++) {
          td = tr.cells[ci];
          aligns[aligns.length - 1].push(
            td &&
              (td.classList.contains("yna4-sla-pivot-drill-num") ||
                td.classList.contains("yna4-sla-pivot-drill-col-qty") ||
                td.classList.contains("yna4-sla-pivot-drill-col-unit") ||
                td.classList.contains("yna4-sla-pivot-drill-units"))
              ? "right"
              : "left"
          );
        }
      }
    }
    return { headers: headers, rows: rows, styles: styles, aligns: aligns };
  }

  function buildSlaDrillTeamsTsv(title, pack) {
    var lines = [];
    var r, c, row;
    if (title) lines.push("# " + title);
    if (!pack) return lines.join("\n");
    lines.push(pack.headers.join("\t"));
    for (r = 0; r < pack.rows.length; r++) {
      row = [];
      for (c = 0; c < pack.rows[r].length; c++) {
        row.push(String(pack.rows[r][c] || "").replace(/\t/g, " "));
      }
      lines.push(row.join("\t"));
    }
    return lines.join("\n");
  }

  function buildSlaDrillTeamsHtml(title, pack) {
    var parts = [];
    if (title) {
      parts.push(
        "<p style=\"margin:0 0 8px 0;font-weight:700;font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:13px;\">" +
          slaEscapeHtmlForTeams(title) +
          "</p>"
      );
    }
    if (!pack) return parts.join("");
    parts.push(
      "<table cellpadding=\"4\" cellspacing=\"0\" style=\"border-collapse:collapse;border:1px solid #94a3b8;font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:12px;\">"
    );
    parts.push("<thead><tr>");
    var hi, ri, ci, st, align, cellStyle;
    for (hi = 0; hi < pack.headers.length; hi++) {
      parts.push(
        "<th style=\"border:1px solid #cbd5e1;padding:4px 8px;background:#fef2f2;color:#991b1b;text-align:left;white-space:nowrap;\">" +
          slaEscapeHtmlForTeams(pack.headers[hi]) +
          "</th>"
      );
    }
    parts.push("</tr></thead><tbody>");
    for (ri = 0; ri < pack.rows.length; ri++) {
      st = pack.styles[ri];
      parts.push("<tr>");
      for (ci = 0; ci < pack.headers.length; ci++) {
        align =
          pack.aligns[ri] && pack.aligns[ri][ci] === "right" ? "right" : "left";
        cellStyle =
          "border:1px solid #cbd5e1;padding:4px 8px;vertical-align:top;text-align:" +
          align +
          ";";
        if (st) {
          cellStyle +=
            "background:" + st.bg + ";color:" + st.color + ";";
        }
        parts.push(
          "<td style=\"" +
            cellStyle +
            "\">" +
            slaEscapeHtmlForTeams(pack.rows[ri][ci]) +
            "</td>"
        );
      }
      parts.push("</tr>");
    }
    parts.push("</tbody></table>");
    return parts.join("");
  }

  function copySlaDrillTableForTeams(btn, table, title, copyMode) {
    var mode = copyMode === "sr" || copyMode === "egg" ? copyMode : "";
    var labelRest = mode === "sr" ? "SR" : mode === "egg" ? "계란" : "팀즈";
    function flash(ok, empty) {
      if (!btn) return;
      btn.textContent = empty
        ? mode === "sr"
          ? "SR 행 없음"
          : mode === "egg"
          ? "계란 행 없음"
          : "복사할 내용 없음"
        : ok
        ? "복사됨"
        : "복사 실패";
      window.setTimeout(function () {
        btn.textContent = labelRest;
      }, empty ? 2200 : 1600);
    }
    var pack = gatherSlaDrillTableCopy(table, mode);
    if (!pack || !pack.headers.length || (mode && !pack.rows.length)) {
      flash(false, true);
      return;
    }
    if (!pack.rows.length && !mode) {
      flash(false, true);
      return;
    }
    var useTitle = title;
    if (mode === "sr") useTitle = title ? title + " · SR만" : "SR만";
    if (mode === "egg") useTitle = title ? title + " · 계란만" : "계란만";
    var plain = buildSlaDrillTeamsTsv(useTitle, pack);
    var html = buildSlaDrillTeamsHtml(useTitle, pack);
    if (!plain && !html) {
      flash(false, true);
      return;
    }
    slaCopyHtmlPlainToClipboard(html, plain).then(function (ok) {
      flash(ok, false);
    });
  }

  function fillDrillHeadTitle(head, titleText) {
    var span = head.querySelector(".yna4-sla-pivot-drill-head-text");
    if (!span) {
      span = document.createElement("span");
      span.className = "yna4-sla-pivot-drill-head-text";
      head.insertBefore(span, head.firstChild);
    }
    span.textContent = titleText || "";
    return span;
  }

  function mountDrillHeadTeamsCopy(head, wrap, opts) {
    if (!head || !wrap) return null;
    opts = opts || {};
    var showEgg = opts.showEgg !== false;
    function drillTitle() {
      var titleEl = head.querySelector(".yna4-sla-pivot-drill-head-text");
      return titleEl
        ? String(titleEl.textContent || "").trim()
        : slaDrillCellPlainText(head);
    }
    function mkBtn(label, titleAttr, copyMode, btnMod) {
      var b = document.createElement("button");
      b.type = "button";
      b.className =
        "yna4-sla-pivot-drill-teams-btn" +
        (btnMod ? " yna4-sla-pivot-drill-teams-btn--" + btnMod : "");
      b.textContent = label;
      b.title = titleAttr;
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        copySlaDrillTableForTeams(
          b,
          wrap.querySelector(".yna4-sla-pivot-drill-table"),
          drillTitle(),
          copyMode
        );
      });
      head.appendChild(b);
      return b;
    }
    var btn = mkBtn("팀즈", "현재 드릴다운 표를 팀즈에 붙여넣기", "", "");
    mkBtn("SR", "상품명에 SR이 붙은 음영 행만 팀즈에 붙여넣기", "sr", "sr");
    if (showEgg) {
      mkBtn(
        "계란",
        "이관: 축산열 계란(CATE4)만 / Tote: 상품명에 계란이 있는 행만 팀즈에 붙여넣기",
        "egg",
        "egg"
      );
    }
    return btn;
  }

  function renderToteStowDrillPanel(
    drillHost,
    toteLines,
    rowKey,
    colName,
    rowLabel,
    colLabel,
    queryAt,
    drillCtx
  ) {
    if (!drillHost) return;
    drillHost.textContent = "";
    var lines = toteLinesForPivotCell(toteLines || [], colName, rowKey);
    var drillCols = toteStowDrillColsForRowKey(rowKey);
    var wrap = document.createElement("div");
    wrap.className = "yna4-sla-pivot-drill";

    var head = document.createElement("div");
    head.className = "yna4-sla-pivot-drill-head";
    var qtySum = 0;
    var i;
    for (i = 0; i < lines.length; i++) {
      qtySum += Number(lines[i].moveQuantity) || 0;
    }
    fillDrillHeadTitle(
      head,
      TOTE_STOW_ZONE_LABEL +
        " · " +
        rowLabel +
        " · " +
        colLabel +
        " · " +
        lines.length +
        "행 · 유닛 " +
        Math.round(qtySum).toLocaleString("en-US")
    );
    mountDrillHeadTeamsCopy(head, wrap);
    wrap.appendChild(head);

    if (!lines.length) {
      var empty = document.createElement("p");
      empty.className = "yna4-sla-pivot-drill-empty";
      empty.textContent =
        "해당 셀에 RCRT 에이징이 없습니다.";
      wrap.appendChild(empty);
      drillHost.appendChild(wrap);
      return;
    }

    var scroll = document.createElement("div");
    scroll.className = "yna4-sla-pivot-drill-scroll";
    var table = document.createElement("table");
    table.className =
      "yna4-sla-pivot-drill-table yna4-sla-pivot-drill-table--totestow";

    var thead = document.createElement("thead");
    var trH = document.createElement("tr");
    var ci, colDef, th;
    for (ci = 0; ci < drillCols.length; ci++) {
      colDef = drillCols[ci];
      th = document.createElement("th");
      if (colDef.colClass) th.className = colDef.colClass;
      th.textContent = colDef.label;
      trH.appendChild(th);
    }
    thead.appendChild(trH);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    table.appendChild(tbody);
    scroll.appendChild(table);
    wrap.appendChild(scroll);
    drillHost.appendChild(wrap);

    function paintToteBody(maps) {
      if (!tbody.isConnected) return;
      tbody.textContent = "";
      renderToteStowDrillTableBody(tbody, lines, queryAt, drillCols, maps);
    }
    paintToteBody(drillShrinkSkuMaps(drillCtx));

    if (rowKey === TOTE_STOW_ROW_KEYS.Chilled) {
      ensureDrillShrinkMapsAsync(drillCtx, paintToteBody);
    }

    (async function enrichAndRefresh() {
      var changed = false;
      for (i = 0; i < lines.length; i++) {
        if (stopRequested || !table.isConnected) return;
        if (lines[i].skuId) continue;
        var pack = await fetchToteSkuEnrich(lines[i].toteBarcode);
        if (pack.skuId || pack.skuName || pack.temperature) {
          lines[i].skuId = pack.skuId;
          lines[i].skuName = pack.skuName;
          lines[i].temperature = pack.temperature;
          lines[i].tempZone = toteLineTempZone(lines[i]);
          lines[i].rowKey = toteLineResolvedRowKey(lines[i]);
          changed = true;
        }
      }
      if (!changed || !table.isConnected) return;
      paintToteBody(drillShrinkSkuMaps(drillCtx));
    })();
  }

  function renderPivotDrillPanel(
    drillHost,
    drillCtx,
    rowKey,
    colName,
    rowLabel,
    colLabel
  ) {
    if (!drillHost) return;
    drillHost.textContent = "";
    if (drillCtx && drillCtx.mode === "combined") {
      if (String(rowKey).indexOf("COMBINED_") === 0) return;
      if (isToteStowPivotRowKey(rowKey)) {
        renderToteStowDrillPanel(
          drillHost,
          drillCtx.toteStowLines ||
            (drillCtx.transfer && drillCtx.transfer.toteStowLines) ||
            [],
          rowKey,
          colName,
          rowLabel,
          colLabel,
          parseStatsQueryAt(drillCtx),
          drillCtx
        );
        return;
      }
      if (isDirectPivotRowKey(rowKey)) {
        if (!drillCtx.direct) return;
        renderDirectDrillPanel(
          drillHost,
          drillCtx.direct,
          rowKey,
          colName,
          rowLabel,
          colLabel
        );
        return;
      }
      if (rowKey === "__GRAND__") {
        renderCombinedGrandDrillPanel(
          drillHost,
          drillCtx,
          colName,
          rowLabel,
          colLabel
        );
        return;
      }
      if (!drillCtx.transfer) return;
      drillCtx = drillCtx.transfer;
    }
    if (isToteStowPivotRowKey(rowKey)) {
      renderToteStowDrillPanel(
        drillHost,
        (drillCtx && drillCtx.toteStowLines) || [],
        rowKey,
        colName,
        rowLabel,
        colLabel,
        parseStatsQueryAt(drillCtx),
        drillCtx
      );
      return;
    }
    if (drillCtx && drillCtx.mode === "direct") {
      renderDirectDrillPanel(
        drillHost,
        drillCtx,
        rowKey,
        colName,
        rowLabel,
        colLabel
      );
      return;
    }
    var wrap = document.createElement("div");
    wrap.className = "yna4-sla-pivot-drill";

    var head = document.createElement("div");
    head.className = "yna4-sla-pivot-drill-head";
    fillDrillHeadTitle(head, rowLabel + " · " + colLabel + " · 조회 중…");
    mountDrillHeadTeamsCopy(head, wrap);
    var headFilterCount = document.createElement("span");
    headFilterCount.className = "yna4-sla-pivot-drill-head-filter";
    headFilterCount.style.display = "none";
    head.appendChild(headFilterCount);
    wrap.appendChild(head);

    var status = document.createElement("p");
    status.className = "yna4-sla-pivot-drill-empty";
    status.textContent = "이관 드릴다운 준비 중…";
    wrap.appendChild(status);
    drillHost.appendChild(wrap);

    function alive() {
      return !!wrap.isConnected;
    }

    (async function buildTransferDrillAsync() {
      await slaDrillAfterPaint();
      if (!alive()) return;

      status.textContent = "이관 행 매칭 중…";
      var matches = await transferItemsForPivotCellAsync(
        drillCtx.allRows,
        drillCtx.slaLookup,
        rowKey,
        colName,
        drillCtx.ctStorage,
        drillCtx.pivotQueryAt ||
          parseStatsQueryAt({ loadedAt: drillCtx.loadedAt }),
        alive
      );
      if (!alive()) return;

      if (!matches.length) {
        if (status.parentNode) status.parentNode.removeChild(status);
        var empty = document.createElement("p");
        empty.className = "yna4-sla-pivot-drill-empty";
        empty.textContent = "해당 셀에 WMS 행이 없습니다.";
        wrap.appendChild(empty);
        fillDrillHeadTitle(head, rowLabel + " · " + colLabel + " · 0행");
        return;
      }

      status.textContent =
        "SLA 상세 조립 중… (WMS " + matches.length.toLocaleString("en-US") + ")";
      await slaDrillYieldTick();
      if (!alive()) return;

      var lines = await buildDrillDetailLinesAsync(
        matches,
        drillCtx.slaLookup,
        alive
      );
      if (!alive()) return;

      status.textContent =
        "정렬 중… (SLA " + lines.length.toLocaleString("en-US") + ")";
      await slaDrillYieldTick();
      if (!alive()) return;
      lines = sortDrillDetailLines(lines, drillCtx, colName);
      if (!alive()) return;

      var slaQtySum = 0;
      var wmsQtySum = 0;
      var gi;
      for (gi = 0; gi < matches.length; gi++) {
        wmsQtySum += Number(matches[gi].qty) || 0;
      }
      for (gi = 0; gi < lines.length; gi++) {
        slaQtySum += Number(lines[gi].sla && lines[gi].sla.quantity) || 0;
      }
      fillDrillHeadTitle(
        head,
        rowLabel +
          " · " +
          colLabel +
          " · WMS " +
          matches.length +
          "행 · 집품 " +
          Math.round(wmsQtySum).toLocaleString("en-US") +
          " · SLA " +
          lines.length +
          "행 · 유닛 " +
          Math.round(slaQtySum).toLocaleString("en-US")
      );

      var scroll = document.createElement("div");
      scroll.className = "yna4-sla-pivot-drill-scroll";
      var table = document.createElement("table");
      var drillCols = pivotDrillColsForRowKey(rowKey);
      if (colName === PIVOT_COL_ADHOC || colName === PIVOT_COL_MOVING) {
        drillCols = drillCols.map(function (c) {
          if (c.key === "unload") {
            var c2 = {};
            var kk;
            for (kk in c) {
              if (Object.prototype.hasOwnProperty.call(c, kk)) c2[kk] = c[kk];
            }
            c2.label = "집품완료시간";
            return c2;
          }
          return c;
        });
      }
      /* 이동중 — 집품완료시간을 상차시간 앞으로 (둘 다 필터 없음 → drillColIndexByKey 영향 없음) */
      if (colName === PIVOT_COL_MOVING) {
        var iLoad = -1;
        var iUnload = -1;
        drillCols.forEach(function (c, i) {
          if (c.key === "loadAt") iLoad = i;
          if (c.key === "unload") iUnload = i;
        });
        if (iLoad >= 0 && iUnload > iLoad) {
          drillCols = drillCols.slice();
          var tmpCol = drillCols[iLoad];
          drillCols[iLoad] = drillCols[iUnload];
          drillCols[iUnload] = tmpCol;
        }
      }
      table.className =
        "yna4-sla-pivot-drill-table" +
        (rowKey === "ROCKETMART"
          ? " yna4-sla-pivot-drill-table--rocketmart"
          : "");

      var thead = document.createElement("thead");
      var trH = document.createElement("tr");
      var ci, colDef, th, labelSpan, sortBtn, filterBtn;
      var filterState = Object.create(null);
      var filterBtns = Object.create(null);
      var sortState = { key: null, dir: 0 };
      var sortBtns = Object.create(null);
      for (ci = 0; ci < drillCols.length; ci++) {
        colDef = drillCols[ci];
        th = document.createElement("th");
        if (colDef.colClass) {
          th.className = colDef.colClass;
        }
        var thInner = document.createElement("div");
        thInner.className = "yna4-sla-pivot-drill-th-inner";
        labelSpan = document.createElement("span");
        labelSpan.className = "yna4-sla-pivot-drill-th-label";
        labelSpan.textContent = colDef.label;
        if (colDef.key === PIVOT_DRILL_SORT_COL_KEY) {
          sortBtn = document.createElement("button");
          sortBtn.type = "button";
          sortBtn.className = "yna4-sla-pivot-drill-sort-btn";
          sortBtn.title = "유닛 오름차순 정렬";
          sortBtn.setAttribute("aria-label", colDef.label + " 정렬");
          sortBtn.textContent = "\u25B2\u25BC";
        } else {
          sortBtn = null;
        }
        thInner.appendChild(labelSpan);
        if (sortBtn) thInner.appendChild(sortBtn);
        if (pivotDrillColHasFilter(colDef.key)) {
          filterBtn = document.createElement("button");
          filterBtn.type = "button";
          filterBtn.className = "yna4-sla-pivot-drill-filter-btn";
          filterBtn.title = "필터";
          filterBtn.setAttribute("aria-label", colDef.label + " 필터");
          fillDrillFilterBtnIcon(filterBtn);
          thInner.appendChild(filterBtn);
        }
        th.appendChild(thInner);
        trH.appendChild(th);
      }
      thead.appendChild(trH);
      table.appendChild(thead);

      var tbody = document.createElement("tbody");
      table.appendChild(tbody);
      scroll.appendChild(table);
      wrap.appendChild(scroll);

      var shrinkMaps = drillShrinkSkuMaps(drillCtx);
      status.textContent =
        "표 표시 중… 0 / " + lines.length.toLocaleString("en-US");

      var painted = await appendDrillRowsChunked({
        tbody: tbody,
        lines: lines,
        chunkSize: DRILL_DOM_CHUNK_SIZE,
        aliveFn: alive,
        createRow: function (line, lineIdx) {
          return createTransferDrillRow(
            line,
            lineIdx,
            drillCols,
            drillCtx,
            shrinkMaps
          );
        },
        onProgress: function (done, total) {
          if (!alive() || !status.parentNode) return;
          status.textContent =
            "표 표시 중… " +
            done.toLocaleString("en-US") +
            " / " +
            total.toLocaleString("en-US");
        },
      });
      if (!alive() || !painted) return;

      if (status.parentNode) status.parentNode.removeChild(status);

      bindDrillTableFilters(
        table,
        lines,
        drillCtx,
        filterState,
        filterBtns,
        headFilterCount,
        sortState,
        sortBtns,
        drillCols
      );
      ensureDrillShrinkMapsAsync(drillCtx, function (maps) {
        if (!table.isConnected) return;
        applyTransferDrillShrinkHighlights(table, lines, drillCtx, maps);
      });
    })().catch(function (eDrill) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[YAN4 Transfer SLA drill]", eDrill);
      }
      if (!alive()) return;
      status.textContent = "이관 드릴다운 표시 실패";
      status.className =
        "yna4-sla-pivot-drill-empty yna4-sla-pivot-drill-empty--err";
    });
  }

  function pivotDrillEventTarget(ev) {
    var el = ev && ev.target;
    if (!el) return null;
    if (el.nodeType === 3) el = el.parentElement;
    if (!el || typeof el.closest !== "function") return null;
    return el.closest("td.yna4-sla-pivot-num--hit");
  }

  function pivotDrillIsOpen(drillHost, rowKey, colName) {
    return (
      drillHost &&
      drillHost.querySelector(".yna4-sla-pivot-drill") &&
      drillHost.getAttribute("data-open-row") === rowKey &&
      drillHost.getAttribute("data-open-col") === colName
    );
  }

  function shouldSkipPivotDrillActivate(rowKey, colName, drillHost) {
    var now = Date.now();
    if (
      now - pivotDrillActivateLock.at < 400 &&
      pivotDrillActivateLock.row === rowKey &&
      pivotDrillActivateLock.col === colName
    ) {
      return true;
    }
    pivotDrillActivateLock.at = now;
    pivotDrillActivateLock.row = rowKey;
    pivotDrillActivateLock.col = colName;
    return false;
  }

  function activatePivotDrill(
    tableShell,
    drillHost,
    tdHit,
    drillCtx,
    rowDefs
  ) {
    if (!drillCtx || !tdHit || !drillHost || !tableShell) return false;
    var trHit = tdHit.closest("tr");
    if (!trHit || trHit.classList.contains("yna4-sla-pivot-tr--group")) {
      return false;
    }
    var rk = trHit.getAttribute("data-pivot-row-key");
    var cn = tdHit.getAttribute("data-pivot-col");
    if (!rk || !cn) return false;
    if (shouldSkipPivotDrillActivate(rk, cn, drillHost)) return false;
    togglePivotDrill(
      drillHost,
      tableShell,
      drillCtx,
      rk,
      cn,
      tdHit,
      pivotRowLabelFromKey(rk, rowDefs),
      cn === "__TOTAL__" ? "총합계" : cn
    );
    return true;
  }

  function bindPivotDrillHandlers(
    wrap,
    tableShell,
    drillHost,
    drillCtx,
    rowDefs
  ) {
    if (!wrap || !drillCtx) return;

    function onPivotDrillPointer(ev) {
      var tdHit = pivotDrillEventTarget(ev);
      if (!tdHit) return;
      activatePivotDrill(
        tableShell,
        drillHost,
        tdHit,
        drillCtx,
        rowDefs
      );
    }

    wrap.addEventListener("dblclick", onPivotDrillPointer, false);
    wrap.addEventListener(
      "click",
      function (ev) {
        if (ev.detail < 2) return;
        onPivotDrillPointer(ev);
      },
      false
    );
  }

  function togglePivotDrill(
    drillHost,
    tableShell,
    drillCtx,
    rowKey,
    colName,
    td,
    rowLabel,
    colLabel
  ) {
    var same = pivotDrillIsOpen(drillHost, rowKey, colName);
    clearPivotDrillSelection(tableShell);
    if (same) {
      drillHost.textContent = "";
      drillHost.removeAttribute("data-open-row");
      drillHost.removeAttribute("data-open-col");
      pivotDrillActivateLock.at = 0;
      pivotDrillActivateLock.row = "";
      pivotDrillActivateLock.col = "";
      return;
    }
    td.classList.add("yna4-sla-pivot-num--selected");
    drillHost.setAttribute("data-open-row", rowKey);
    drillHost.setAttribute("data-open-col", colName);
    renderPivotDrillPanel(
      drillHost,
      drillCtx,
      rowKey,
      colName,
      rowLabel,
      colLabel
    );
    try {
      drillHost.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (eScroll) {}
  }

  function renderPivotTable(host, matrix, timeCols, stats) {
    host.textContent = "";
    var drillCtx =
      stats && stats.drillCtx ? stats.drillCtx : null;
    var rowDefs =
      stats && stats.rowDefs ? stats.rowDefs : PIVOT_ROW_DEFS;
    var matrixPending =
      stats && stats.matrixPending ? stats.matrixPending : null;
    rowDefs = filterEmptyDirectPivotRowDefs(rowDefs, matrix, timeCols);
    lastPivotDrillCtx = drillCtx;
    activePivotRowDefs = rowDefs;
    pivotDrillActivateLock.at = 0;
    pivotDrillActivateLock.row = "";
    pivotDrillActivateLock.col = "";
    var wrap = document.createElement("div");
    wrap.className = "yna4-sla-pivot-wrap";

    var tableShell = document.createElement("div");
    tableShell.className =
      "yna4-sla-pivot-table-shell yna4-sla-pivot-table-shell--excel";

    var table = document.createElement("table");
    table.className = "yna4-sla-pivot-table yna4-sla-pivot-table--excel";

    var refYear =
      stats && stats.refYear
        ? stats.refYear
        : new Date().getFullYear();
    var cornerTitle =
      stats && stats.cornerTitle ? stats.cornerTitle : "SLA Time-table";

    pivotOverdueStyleCtx = {
      queryAt: parseStatsQueryAt(stats),
      refYear: refYear,
      drillCtx: drillCtx,
    };
    try {
    buildPivotColgroup(table, timeCols);
    var thead = document.createElement("thead");
    buildPivotTableHead(thead, timeCols, refYear, cornerTitle);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    var colTotals = {};
    var grand = 0;
    var ri, def, tr, tdL, rowSum, ckey, val, ci;
    var alertMatrix = buildPivotAlertMatrix(matrix, timeCols, rowDefs, stats);

    function appendRow(def, indent) {
      var rowKey = def.key;
      if (def.kind === "group") {
        tr = document.createElement("tr");
        tr.className =
          "yna4-sla-pivot-tr yna4-sla-pivot-tr--group" +
          (def.toteStow ? " yna4-sla-pivot-tr--totestow" : "") +
          pivotBundleTrClass(def) +
          pivotDirectRowClass(def);
        tdL = document.createElement("td");
        tdL.className = "yna4-sla-pivot-td-zone";
        tdL.innerHTML = pivotZoneLabelHtml(def);
        tr.appendChild(tdL);
        for (ci = 0; ci < timeCols.length; ci++) {
          var tdDash = document.createElement("td");
          tdDash.textContent = "-";
          tdDash.className = pivotNumCellClass(0, timeCols[ci], rowKey);
          tr.appendChild(tdDash);
        }
        var tdG = document.createElement("td");
        tdG.textContent = "-";
        tdG.className = "yna4-sla-pivot-num yna4-sla-pivot-total";
        tr.appendChild(tdG);
        tbody.appendChild(tr);
        return;
      }
      var rowData = matrix[rowKey] || {};
      var rowPendingData =
        matrixPending && matrixPending[rowKey]
          ? matrixPending[rowKey]
          : null;
      rowSum = 0;

      tr = document.createElement("tr");
      tr.className =
        "yna4-sla-pivot-tr" +
        (def.kind === "child" ? " yna4-sla-pivot-tr--child" : "") +
        (def.ats ? " yna4-sla-pivot-tr--ats" : "") +
        (def.key === "FROZEN" ? " yna4-sla-pivot-tr--frozen" : "") +
        (def.key === "ROCKETMART" ? " yna4-sla-pivot-tr--rocketmart" : "") +
        (isToteStowPivotRowKey(def.key) ? " yna4-sla-pivot-tr--totestow" : "") +
        pivotBundleTrClass(def) +
        pivotDirectRowClass(def);
      tr.setAttribute("data-pivot-row-key", rowKey);
      tdL = document.createElement("td");
      tdL.className = "yna4-sla-pivot-td-zone";
      tdL.innerHTML = pivotZoneLabelHtml(def);
      tr.appendChild(tdL);
      for (ci = 0; ci < timeCols.length; ci++) {
        ckey = timeCols[ci];
        val = rowData[ckey] || 0;
        rowSum += val;
        if (!colTotals[ckey]) colTotals[ckey] = 0;
        colTotals[ckey] += val;
        var td = document.createElement("td");
        td.setAttribute("data-pivot-col", ckey);
        var pendVal =
          rowPendingData && rowPendingData[ckey]
            ? Number(rowPendingData[ckey]) || 0
            : 0;
        if (isDirectPivotRowDef(def) && pendVal > 0) {
          fillDirectPivotNumCell(td, val - pendVal, pendVal, ckey, rowKey);
        } else {
          td.className = pivotNumCellClass(val, ckey, rowKey);
          td.textContent = formatPivotNum(val);
          if (val > 0) {
            td.title = "더블클릭: SLA 상세";
          }
        }
        applyPivotSlaAlertTd(td, rowKey, ckey, alertMatrix);
        tr.appendChild(td);
      }
      grand += rowSum;
      var tdR = document.createElement("td");
      tdR.setAttribute("data-pivot-col", "__TOTAL__");
      var rowPendingSum = pivotRowPendingSum(
        matrixPending,
        rowKey,
        timeCols
      );
      if (isDirectPivotRowDef(def) && rowPendingSum > 0) {
        fillDirectPivotNumCell(
          tdR,
          rowSum - rowPendingSum,
          rowPendingSum,
          "",
          rowKey
        );
        tdR.className += " yna4-sla-pivot-total";
      } else {
        tdR.className =
          pivotNumCellClass(rowSum, "", rowKey) + " yna4-sla-pivot-total";
        tdR.textContent = formatPivotNum(rowSum);
        if (rowSum > 0) {
          tdR.title = "더블클릭: 행 전체 SLA 상세";
        }
      }
      tr.appendChild(tdR);
      tbody.appendChild(tr);
    }

    for (ri = 0; ri < rowDefs.length; ri++) {
      def = rowDefs[ri];
      if (def.kind === "group") {
        appendRow(def, false);
      } else if (def.kind === "child") {
        appendRow(def, true);
      } else {
        appendRow(def, false);
      }
    }

    tr = document.createElement("tr");
    tr.className = "yna4-sla-pivot-tr yna4-sla-pivot-tr--grand";
    tr.setAttribute("data-pivot-row-key", "__GRAND__");
    tdL = document.createElement("td");
    tdL.className = "yna4-sla-pivot-td-zone";
    tdL.innerHTML =
      '<span class="yna4-sla-pivot-exp yna4-sla-pivot-exp--blank" aria-hidden="true"></span>' +
      '<span class="yna4-sla-pivot-zone-text yna4-sla-pivot-zone-text--grand">총합계</span>';
    tr.appendChild(tdL);
    for (ci = 0; ci < timeCols.length; ci++) {
      ckey = timeCols[ci];
      val = colTotals[ckey] || 0;
      var tdC = document.createElement("td");
      tdC.className =
        pivotNumCellClass(val, ckey, "__GRAND__") + " yna4-sla-pivot-total";
      tdC.setAttribute("data-pivot-col", ckey);
      tdC.textContent = formatPivotNum(val);
      if (val > 0) {
        tdC.title = "더블클릭: 전체 SLA 상세";
      }
      tr.appendChild(tdC);
    }
    var tdGrand = document.createElement("td");
    tdGrand.className =
      pivotNumCellClass(grand, "", "__GRAND__") + " yna4-sla-pivot-total";
    tdGrand.setAttribute("data-pivot-col", "__TOTAL__");
    tdGrand.textContent = formatPivotNum(grand);
    if (grand > 0) {
      tdGrand.title = "더블클릭: 전체 SLA 상세";
    }
    tr.appendChild(tdGrand);
    tbody.appendChild(tr);

    table.appendChild(tbody);

    tableShell.appendChild(table);
    wrap.appendChild(tableShell);

    if (matrixHasPendingQty(matrixPending)) {
      var legend = document.createElement("p");
      legend.className = "yna4-sla-pivot-direct-legend";
      legend.innerHTML =
        '<span class="yna4-sla-pivot-num-pending">주황 숫자</span> = 구버전 PO대기 잔량(레거시) · <span class="yna4-sla-pivot-num-pending">(괄호)</span>';
      wrap.appendChild(legend);
    }

    var drillHost = document.createElement("div");
    drillHost.className = "yna4-sla-pivot-drill-host";
    wrap.appendChild(drillHost);

    if (drillCtx) {
      bindPivotDrillHandlers(
        wrap,
        tableShell,
        drillHost,
        drillCtx,
        rowDefs
      );
    }

    host.appendChild(wrap);
    } finally {
      pivotOverdueStyleCtx = null;
    }
  }

  function renderPivotPlaceholder(host, message, isErr) {
    host.innerHTML =
      '<div class="yna4-sla-placeholder' +
      (isErr ? " yna4-sla-placeholder--err" : "") +
      '">' +
      String(message || "") +
      "</div>";
  }

  function base64ToArrayBuffer(b64) {
    var bin = atob(String(b64 || ""));
    var len = bin.length;
    var u8 = new Uint8Array(len);
    var i;
    for (i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }

  async function fetchSharePointSlaBuffer() {
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    ) {
      return new Promise(function (resolve, reject) {
        chrome.runtime.sendMessage(
          {
            type: "yan4SlaFetch",
            url: sharePointSlaUrl(),
            referer: SHAREPOINT_SLA_REFERER,
            label: "SLA",
            nameIncludes: "SLA",
            deleteAfterRead: true,
          },
          function (resp) {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (resp && resp.ok && resp.base64) {
              resolve(base64ToArrayBuffer(resp.base64));
              return;
            }
            reject(new Error((resp && resp.error) || "SharePoint fetch 실패"));
          }
        );
      });
    }
    var res = await fetch(sharePointSlaUrl(), {
      method: "GET",
      credentials: "include",
      headers: {
        Accept:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8",
        Referer: SHAREPOINT_SLA_REFERER,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    if (!res.ok) {
      throw new Error("SharePoint HTTP " + res.status);
    }
    var buf = await res.arrayBuffer();
    if (!buf || buf.byteLength < 400) {
      throw new Error("SharePoint 빈 응답");
    }
    var peek = new TextDecoder("utf-8", { fatal: false }).decode(
      new Uint8Array(buf.slice(0, 500))
    );
    if (/^[\s\S]{0,500}<\s*html/i.test(peek)) {
      throw new Error("SharePoint HTML 응답(로그인·권한 확인)");
    }
    return buf;
  }

  async function fetchTransferRowsAll(statusEl, dr) {
    var chunks = splitInclusiveRanges(dr.startYmd, dr.endYmd, CHUNK_MAX_DAYS);
    var allRows = [];
    var si, ci, preset, buf, part;
    for (si = 0; si < STATUS_PRESETS.length; si++) {
      if (stopRequested) break;
      preset = STATUS_PRESETS[si];
      for (ci = 0; ci < chunks.length; ci++) {
        if (stopRequested) break;
        if (statusEl) {
          statusEl.textContent =
            preset.label +
            " WMS " +
            (ci + 1) +
            "/" +
            chunks.length +
            "…";
        }
        var qs = buildExcelQueryString({
          status: preset.api,
          start: chunks[ci].start,
          end: chunks[ci].end,
          toCenterCode: poFcCode(),
          searchDateType: preset.searchDateType || SEARCH_DATE_UPLOAD,
        });
        buf = await fetchExcelArrayBuffer(qs);
        part = parseTransferSheetRows(buf, preset.label);
        allRows = allRows.concat(part);
        await sleep(80);
      }
    }
    return allRows;
  }

  function buildPivotMatrixFromRows(allRows, resolveRow) {
    var matrix = Object.create(null);
    var colSet = Object.create(null);
    var unknown = 0;
    var emptyUnload = 0;
    var movingRows = 0;
    var movingQty = 0;
    var adhocRows = 0;
    var adhocQty = 0;
    var ctRows = 0;
    var ctQty = 0;
    var i, row, rowMeta, col, resolved;
    for (i = 0; i < allRows.length; i++) {
      row = allRows[i];
      if (row.statusLabel === "이동중") {
        movingRows++;
        movingQty += row.qty || 0;
      }
      resolved = resolveRow(row);
      if (!resolved || !resolved.rowMeta || resolved.rowMeta.key === "UNKNOWN") {
        unknown++;
        continue;
      }
      rowMeta = resolved.rowMeta;
      col = resolved.col;
      if (resolved.viaCt) {
        ctRows++;
        ctQty += row.qty || 0;
      }
      if (col === PIVOT_COL_ADHOC) {
        adhocRows++;
        adhocQty += row.qty || 0;
      }
      if (
        col === PIVOT_COL_EMPTY &&
        row.statusLabel !== "이동중" &&
        !row.unloadAt
      ) {
        emptyUnload++;
      }
      if (!matrix[rowMeta.key]) matrix[rowMeta.key] = Object.create(null);
      if (!matrix[rowMeta.key][col]) matrix[rowMeta.key][col] = 0;
      matrix[rowMeta.key][col] += row.qty;
      colSet[col] = 1;
    }
    return {
      matrix: matrix,
      colSet: colSet,
      unknown: unknown,
      emptyUnload: emptyUnload,
      movingRows: movingRows,
      movingQty: movingQty,
      adhocRows: adhocRows,
      adhocQty: adhocQty,
      ctRows: ctRows,
      ctQty: ctQty,
    };
  }

  function sortPivotTimeCols(colSet, refYear) {
    var timeCols = Object.keys(colSet).filter(function (c) {
      return (
        c !== PIVOT_COL_EMPTY &&
        c !== PIVOT_COL_MOVING &&
        c !== PIVOT_COL_ADHOC
      );
    });
    timeCols.sort(function (a, b) {
      return parsePivotColSortKey(a, refYear).localeCompare(
        parsePivotColSortKey(b, refYear)
      );
    });
    if (colSet[PIVOT_COL_MOVING]) timeCols.push(PIVOT_COL_MOVING);
    if (colSet[PIVOT_COL_ADHOC]) timeCols.push(PIVOT_COL_ADHOC);
    if (colSet[PIVOT_COL_EMPTY]) timeCols.push(PIVOT_COL_EMPTY);
    return timeCols;
  }

  function poApiDateFromYmd(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
    if (!m) return "";
    return m[1] + "/" + m[2] + "/" + m[3];
  }

  function defaultDirectDateRange() {
    return defaultProgressDateRange();
  }

  function poDownloadSelectedJson() {
    var cols = [
      ["purchaseOrderSeq", "발주번호"],
      ["skuSeq", "SKU ID"],
      ["skuName", "SKU 이름"],
      ["vendorName", "업체명"],
      ["temperature", "온도"],
      ["purchaseOrderSkuStatus", "스큐상태"],
      ["purchaseOrderCount", "발주 수량"],
      ["vendorConfirmedCount", "업체확정 발주수량"],
      ["receivingCount", "입고수량"],
      ["unloadedAt", "하차일시"],
    ];
    var out = [];
    var i;
    for (i = 0; i < cols.length; i++) {
      out.push({ id: cols[i][0], name: cols[i][1] });
    }
    return JSON.stringify(out);
  }

  function buildPoListDownloadBody(page, after, dr) {
    var from = poApiDateFromYmd(dr.startYmd);
    var to = poApiDateFromYmd(dr.endYmd);
    var p = new URLSearchParams();
    p.set("page", String(page == null ? 1 : page));
    p.set("size", String(PO_PAGE_SIZE));
    p.set("conditionPurchaseSearchType", "");
    p.set("purchaseSearchType", PO_SEARCH_TYPE);
    p.set("searchFromDate", from);
    p.set("searchToDate", to);
    p.set("requestDate", from + " - " + to);
    p.set("conditionPurchaseOrderRegType", "");
    p.set("conditionUnitCategory1", "");
    p.set("unitCategory1", "");
    p.set("conditionUnitCategory2Array", "");
    p.set("conditionPurchaseOrderStatus", "");
    p.set("conditionFcCodeArray", "");
    p.set("fcCodeArray", poFcCode());
    p.set("conditionPurchaseOrderSkuStatusArray", "");
    p.set("conditionSkuReceivedStatusType", "");
    p.set("skuReceivedStatusType", "");
    p.set("conditionTaskType", "");
    p.set("taskType", "");
    p.set("conditionOrderType", "");
    p.set("orderType", "");
    p.set("vendorIdArray", "");
    p.set("purchaseOrderSeqArray", "");
    p.set("skuSeqArray", "");
    p.set("selected", poDownloadSelectedJson());
    if (after) p.set("after", String(after));
    return p.toString();
  }

  function parsePoListDownloadResponse(text, isFirstPage) {
    var raw = String(text || "").trim();
    if (!raw) throw new Error("PO Management 빈 응답");
    var obj;
    try {
      obj = JSON.parse(raw);
    } catch (eJson) {
      if (/^\s*</.test(raw)) {
        throw new Error("PO Management HTML 응답 — po-management 로그인 확인");
      }
      throw new Error("PO Management JSON 파싱 실패");
    }
    if (isFirstPage && obj && obj.valid === false && !obj.data) {
      throw new Error(
        "PO Management 조회 실패 — po-management 로그인·YAN4·기간 확인"
      );
    }
    return obj;
  }

  function parseCsvLine(line) {
    var out = [];
    var cur = "";
    var inQ = false;
    var i, ch;
    for (i = 0; i < line.length; i++) {
      ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQ = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  /** PO list-download — 따옴표·줄바꿈 포함 CSV 레코드 단위 파싱 */
  function parseCsvRecords(text) {
    var src = String(text || "").replace(/^\uFEFF/, "");
    var records = [];
    var row = [];
    var field = "";
    var inQ = false;
    var i, ch;
    for (i = 0; i < src.length; i++) {
      ch = src[i];
      if (inQ) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQ = false;
          }
        } else {
          field += ch;
        }
        continue;
      }
      if (ch === '"') {
        inQ = true;
        continue;
      }
      if (ch === ",") {
        row.push(field);
        field = "";
        continue;
      }
      if (ch === "\n") {
        row.push(field);
        field = "";
        if (row.length > 1 || String(row[0] || "").trim()) {
          records.push(row);
        }
        row = [];
        continue;
      }
      if (ch === "\r") continue;
      field += ch;
    }
    row.push(field);
    if (row.length > 1 || String(row[0] || "").trim()) {
      records.push(row);
    }
    return records;
  }

  function poCellAt(cells, colIdx) {
    return colIdx != null && colIdx >= 0 && colIdx < cells.length
      ? cells[colIdx]
      : "";
  }

  function poDirectFourColumnLayout(cells) {
    if (!cells || cells.length !== 4) return null;
    var labels = cells.map(function (c) {
      return normKey(c);
    });
    if (
      labels[0] === "발주번호" &&
      labels[1] === "skuid" &&
      labels[2] === "업체명" &&
      labels[3] === "온도"
    ) {
      return {
        purchaseOrderSeq: 0,
        skuSeq: 1,
        vendorName: 2,
        temperature: 3,
      };
    }
    return null;
  }

  function poHeaderFieldMap(headerLine) {
    var names = {
      purchaseOrderSeq: ["발주번호"],
      vendorName: ["업체명"],
      temperature: ["온도"],
      skuSeq: ["sku id", "skuid", "skuseq"],
      skuName: ["sku 이름", "sku이름", "skuname", "상품명", "sku name"],
      status: ["스큐상태", "sku상태", "상태"],
      purchaseOrderCount: ["발주수량", "발주 수량"],
      vendorConfirmedCount: [
        "업체확정발주수량",
        "업체확정 발주수량",
        "업체확정수량",
      ],
      receiveQty: ["입고수량", "입고 수량"],
      unloadAt: ["하차일시", "하차시간", "하차 일시"],
    };
    var cells = parseCsvLine(String(headerLine || "").replace(/\n$/, ""));
    var idx = Object.create(null);
    var field, ci, lbl, ni;
    for (field in names) {
      if (!Object.prototype.hasOwnProperty.call(names, field)) continue;
      for (ci = 0; ci < cells.length; ci++) {
        lbl = normKey(cells[ci]);
        for (ni = 0; ni < names[field].length; ni++) {
          if (lbl === normKey(names[field][ni])) {
            idx[field] = ci;
            break;
          }
        }
        if (idx[field] != null) break;
      }
    }
    var fallback = poDirectFourColumnLayout(cells);
    if (fallback) {
      for (field in fallback) {
        if (!Object.prototype.hasOwnProperty.call(fallback, field)) continue;
        if (idx[field] == null) idx[field] = fallback[field];
      }
    }
    return { cells: cells, idx: idx };
  }

  function validatePoHeaderMap(headerMap) {
    var idx = headerMap.idx;
    var missing = [];
    if (idx.purchaseOrderSeq == null) missing.push("발주번호");
    if (idx.skuSeq == null) missing.push("SKU ID");
    if (idx.vendorName == null) missing.push("업체명");
    if (idx.temperature == null) missing.push("온도");
    if (idx.status == null) missing.push("스큐상태");
    if (idx.vendorConfirmedCount == null) missing.push("업체확정 발주수량");
    if (idx.receiveQty == null) missing.push("입고수량");
    if (idx.unloadAt == null) missing.push("하차일시");
    if (!missing.length) return;
    throw new Error(
      "PO CSV 헤더 인식 실패 — " +
        missing.join("·") +
        " (헤더 " +
        headerMap.cells.length +
        "열: " +
        headerMap.cells.slice(0, 8).join(",") +
        ")"
    );
  }

  function progressPoStatusOk(status) {
    return !!PROGRESS_PO_STATUS_OK[String(status || "").trim()];
  }

  function formatProgressQty(n) {
    var v = Number(n);
    if (!isFinite(v)) return "-";
    return Math.round(v).toLocaleString("en-US");
  }

  function formatProgressPct(num, den) {
    var n = Number(num);
    var d = Number(den);
    if (!isFinite(n) || !isFinite(d) || d <= 0) return "-";
    return (Math.round((n / d) * 1000) / 10).toFixed(1) + "%";
  }

  function parseProgressPctDisplay(val) {
    var s = String(val == null ? "" : val).trim();
    if (!s || s === "-") return { text: "-", pct: null };
    var m = /^([\d.]+)\s*%?$/.exec(s.replace(/,/g, ""));
    if (!m) return { text: s, pct: null };
    var n = parseFloat(m[1]);
    if (!isFinite(n)) return { text: s, pct: null };
    n = Math.max(0, Math.min(100, n));
    return {
      text: s.indexOf("%") >= 0 ? s : n.toFixed(1) + "%",
      pct: n,
    };
  }

  function appendProgressPctCell(td, val) {
    var pctInfo = parseProgressPctDisplay(val);
    td.className = "yna4-sla-progress-num yna4-sla-progress-pct-cell";
    if (pctInfo.pct != null) {
      var bar = document.createElement("div");
      bar.className = "yna4-sla-progress-pct-bar";
      bar.style.width = pctInfo.pct + "%";
      bar.setAttribute("aria-hidden", "true");
      td.appendChild(bar);
    }
    var label = document.createElement("span");
    label.className = "yna4-sla-progress-pct-text";
    label.textContent = pctInfo.text;
    td.appendChild(label);
  }

  function formatProgressDateTime(d) {
    if (!d || isNaN(d.getTime())) return "-";
    return (
      pad2(d.getMonth() + 1) +
      "/" +
      pad2(d.getDate()) +
      " " +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes())
    );
  }

  function normalizeShrinkInternalSkuKey(s) {
    return String(s != null ? s : "")
      .replace(/\u00a0/g, " ")
      .trim()
      .replace(/\D/g, "");
  }

  function shrinkExternalSkuKey(row) {
    return normalizeDirectSkuJoinKey(row && row.externalSkuId);
  }

  function shrinkInternalSkuKey(row) {
    return normalizeShrinkInternalSkuKey(row && row.skuId);
  }

  function normalizeShrinkBarcodeKey(s) {
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

  function shrinkBarcodeKeysFromRow(row) {
    var out = [];
    var seen = Object.create(null);
    var raw = row && row.skuBarcode;
    var list = Array.isArray(raw)
      ? raw
      : raw != null && String(raw).trim()
        ? [raw]
        : [];
    var i, k;
    for (i = 0; i < list.length; i++) {
      k = normalizeShrinkBarcodeKey(list[i]);
      if (!k || seen[k]) continue;
      seen[k] = 1;
      out.push(k);
    }
    return out;
  }

  /** 사내규정 — 상품명에 SR 표기가 있으면 Shrink(SR) 대상 */
  function isSrProductName(name) {
    var s = String(name == null ? "" : name).replace(/\u00a0/g, " ");
    if (!s) return false;
    if (/\[\s*SR\s*\]/i.test(s)) return true;
    return /(^|[^A-Za-z])SR([^A-Za-z]|$)/.test(s);
  }

  function makeShrinkTargetRow(skuId, externalSkuId, barcode, name, cate5) {
    return {
      cate5: String(cate5 || "").trim(),
      skuId: normalizeShrinkInternalSkuKey(skuId),
      externalSkuId: normalizeDirectSkuJoinKey(externalSkuId),
      skuBarcode: String(barcode || "").trim(),
      name: String(name || "").trim(),
    };
  }

  function slaRecordCate5(rec) {
    if (!rec) return "";
    return String(rec.cate5 || "").trim();
  }

  function findSlaRecordForPoSku(slaLookup, skuKey) {
    if (!slaLookup || !skuKey) return null;
    if (slaLookup.byExtId && slaLookup.byExtId[skuKey]) {
      return slaLookup.byExtId[skuKey];
    }
    var internal = normalizeShrinkInternalSkuKey(skuKey);
    if (internal && slaLookup.bySkuId && slaLookup.bySkuId[internal]) {
      return slaLookup.bySkuId[internal];
    }
    return null;
  }

  /**
   * 상품명 SR 규정 기반 Shrink 대상 목록 — 명단 파일 대체.
   * SLA 파일(이관 집계용) + PO SKU 이름(입고 집계용) 양쪽에서 수집, cate5 는 SLA 기준.
   */
  function buildShrinkTargetRowsFromData(slaLookup, poRows, poNameBySku) {
    var out = [];
    var seen = Object.create(null);
    function push(row) {
      var key = row.externalSkuId || row.skuId;
      if (!key) return;
      if (seen[key]) {
        if (!seen[key].cate5 && row.cate5) seen[key].cate5 = row.cate5;
        if (!seen[key].name && row.name) seen[key].name = row.name;
        if (!seen[key].skuId && row.skuId) seen[key].skuId = row.skuId;
        if (!seen[key].skuBarcode && row.skuBarcode) {
          seen[key].skuBarcode = row.skuBarcode;
        }
        return;
      }
      seen[key] = row;
      out.push(row);
    }
    var bucket, mapKey, rec;
    var buckets = slaLookup
      ? [slaLookup.bySkuId, slaLookup.byExtId, slaLookup.byBarcode]
      : [];
    var bi;
    for (bi = 0; bi < buckets.length; bi++) {
      bucket = buckets[bi];
      if (!bucket) continue;
      for (mapKey in bucket) {
        if (!Object.prototype.hasOwnProperty.call(bucket, mapKey)) continue;
        rec = bucket[mapKey];
        if (!rec || !isSrProductName(rec.unitDescription)) continue;
        push(
          makeShrinkTargetRow(
            rec.skuId,
            rec.externalId || rec.skuId,
            rec.barcode,
            rec.unitDescription,
            slaRecordCate5(rec)
          )
        );
      }
    }
    var i, key, name, poRec;
    poRows = poRows || [];
    for (i = 0; i < poRows.length; i++) {
      key = normalizeDirectSkuJoinKey(poRows[i] && poRows[i].skuSeq);
      if (!key) continue;
      name = String((poRows[i] && poRows[i].skuName) || "").trim();
      if (!name && poNameBySku) name = String(poNameBySku[key] || "").trim();
      if (!isSrProductName(name)) continue;
      poRec = findSlaRecordForPoSku(slaLookup, key);
      push(
        makeShrinkTargetRow(
          poRec ? poRec.skuId : "",
          key,
          poRec ? poRec.barcode : "",
          name,
          slaRecordCate5(poRec)
        )
      );
    }
    if (poNameBySku) {
      for (key in poNameBySku) {
        if (!Object.prototype.hasOwnProperty.call(poNameBySku, key)) continue;
        if (!isSrProductName(poNameBySku[key])) continue;
        poRec = findSlaRecordForPoSku(slaLookup, key);
        push(
          makeShrinkTargetRow(
            poRec ? poRec.skuId : "",
            key,
            poRec ? poRec.barcode : "",
            poNameBySku[key],
            slaRecordCate5(poRec)
          )
        );
      }
    }
    return out;
  }

  function countShrinkPoMatches(shrinkRows, receiveBySku) {
    var inPo = 0;
    var withReceive = 0;
    var si, key;
    if (!shrinkRows || !shrinkRows.length || !receiveBySku) {
      return { inPo: 0, withReceive: 0 };
    }
    for (si = 0; si < shrinkRows.length; si++) {
      key = shrinkExternalSkuKey(shrinkRows[si]);
      if (!key || receiveBySku[key] == null) continue;
      inPo++;
      if (Number(receiveBySku[key]) > 0) withReceive++;
    }
    return { inPo: inPo, withReceive: withReceive };
  }

  function buildShrinkSkuLookupMaps(shrinkRows) {
    var byInternal = Object.create(null);
    var byExternal = Object.create(null);
    var byBarcode = Object.create(null);
    var si, row, ik, ek, bk, bi, keys;
    shrinkRows = shrinkRows || [];
    for (si = 0; si < shrinkRows.length; si++) {
      row = shrinkRows[si];
      ik = shrinkInternalSkuKey(row);
      ek = shrinkExternalSkuKey(row);
      if (ik) byInternal[ik] = row;
      if (ek) byExternal[ek] = row;
      keys = shrinkBarcodeKeysFromRow(row);
      for (bi = 0; bi < keys.length; bi++) {
        bk = keys[bi];
        if (bk) byBarcode[bk] = row;
      }
    }
    return { byInternal: byInternal, byExternal: byExternal, byBarcode: byBarcode };
  }

  function rememberShrinkTargetRows(rows) {
    lastShrinkTargetRows = rows || [];
    lastShrinkSkuMaps = buildShrinkSkuLookupMaps(lastShrinkTargetRows);
    return lastShrinkTargetRows;
  }

  async function refreshShrinkSkuMapsCache(shrinkRows) {
    if (shrinkRows && shrinkRows.length) {
      rememberShrinkTargetRows(shrinkRows);
      return lastShrinkSkuMaps;
    }
    if (!lastShrinkTargetRows.length && lastShrinkSlaLookup) {
      rememberShrinkTargetRows(
        buildShrinkTargetRowsFromData(lastShrinkSlaLookup, [], null)
      );
      return lastShrinkSkuMaps;
    }
    lastShrinkSkuMaps = buildShrinkSkuLookupMaps(lastShrinkTargetRows);
    return lastShrinkSkuMaps;
  }

  function drillShrinkSkuMaps(drillCtx) {
    if (drillCtx && drillCtx.shrinkSkuMaps) return drillCtx.shrinkSkuMaps;
    return lastShrinkSkuMaps;
  }

  function isShrinkTargetFromMaps(maps, internalKey, externalKey, barcodeKey) {
    if (!maps) return false;
    if (internalKey && maps.byInternal[internalKey]) return true;
    if (externalKey && maps.byExternal[externalKey]) return true;
    if (barcodeKey && maps.byBarcode && maps.byBarcode[barcodeKey]) return true;
    return false;
  }

  function isTransferDrillLineShrinkTarget(line, drillCtx, maps) {
    if (!line) return false;
    if (line.sla && isSrProductName(line.sla.unitDescription)) return true;
    maps = maps || drillShrinkSkuMaps(drillCtx);
    if (!maps) return false;
    var sla = line.sla;
    if (
      sla &&
      isShrinkTargetFromMaps(
        maps,
        normalizeShrinkInternalSkuKey(sla.skuId),
        normalizeDirectSkuJoinKey(sla.externalId || sla.barcode)
      )
    ) {
      return true;
    }
    if (line.transfer && drillCtx) {
      return !!resolveShrinkRowForTransferGc(
        line.transfer.gc,
        drillCtx.slaLookup,
        maps
      );
    }
    return false;
  }

  function isDirectDrillLineShrinkTarget(item, maps) {
    if (!item) return false;
    if (isSrProductName(item.skuName)) return true;
    maps = maps || lastShrinkSkuMaps;
    if (!maps) return false;
    var k = normalizeDirectSkuJoinKey(item.skuSeq);
    if (!k) return false;
    return !!(maps.byInternal[k] || maps.byExternal[k]);
  }

  function applyTransferDrillShrinkHighlights(table, lines, drillCtx, maps) {
    if (!table || !lines || !lines.length) return;
    maps = maps || drillShrinkSkuMaps(drillCtx);
    if (!maps) return;
    var tbody = table.tBodies[0];
    if (!tbody) return;
    var i, tr, idx;
    for (i = 0; i < tbody.rows.length; i++) {
      tr = tbody.rows[i];
      idx = Number(tr.getAttribute("data-drill-line-idx")) || 0;
      if (isTransferDrillLineShrinkTarget(lines[idx], drillCtx, maps)) {
        tr.classList.add("yna4-sla-pivot-drill-tr--shrink");
      }
    }
  }

  function ensureDrillShrinkMapsAsync(drillCtx, applyFn) {
    var maps = drillShrinkSkuMaps(drillCtx);
    if (maps) {
      applyFn(maps);
      return;
    }
    refreshShrinkSkuMapsCache(null).then(function (loaded) {
      if (drillCtx) drillCtx.shrinkSkuMaps = loaded;
      applyFn(loaded);
    });
  }

  function pickBestSlaRecordForGc(lookup, gc) {
    if (!lookup) return null;
    var rec = pickSlaRecordForGc(lookup, gc);
    if (rec) return rec;
    var key = normalizeGcKey(gc);
    var list = lookup.byGcAll && lookup.byGcAll[key];
    if (!list || !list.length) return null;
    var best = null;
    var i;
    for (i = 0; i < list.length; i++) {
      if (!best || slaRecordIsNewer(list[i], best)) best = list[i];
    }
    return best;
  }

  function resolveShrinkRowForTransferGc(gc, slaLookup, maps) {
    var rec = pickBestSlaRecordForGc(slaLookup, gc);
    if (!rec || !maps) return null;
    var internal = normalizeShrinkInternalSkuKey(rec.skuId);
    if (internal && maps.byInternal[internal]) return maps.byInternal[internal];
    var ext = normalizeDirectSkuJoinKey(rec.externalId);
    if (ext && maps.byExternal[ext]) return maps.byExternal[ext];
    return null;
  }

  function shrinkRowUnitKey(row) {
    return shrinkInternalSkuKey(row) || shrinkExternalSkuKey(row);
  }

  function buildShrinkTypeModel(shrinkRows, unitForRow) {
    shrinkRows = shrinkRows || [];
    var shrinkTypeOrder = [];
    var shrinkTypeMap = Object.create(null);
    var shrinkSkuQty = 0;
    var shrinkUnitTotal = 0;
    var si, sr, cate5, unit;
    for (si = 0; si < shrinkRows.length; si++) {
      sr = shrinkRows[si];
      cate5 = String(sr.cate5 || "").trim();
      unit = Number(unitForRow(sr)) || 0;
      if (unit > 0) shrinkSkuQty++;
      if (unit > 0) shrinkUnitTotal += unit;
      if (!cate5) continue;
      if (!shrinkTypeMap[cate5]) {
        shrinkTypeMap[cate5] = { cate5: cate5, skuQty: 0, unit: 0 };
        shrinkTypeOrder.push(cate5);
      }
      if (unit >= 1) shrinkTypeMap[cate5].skuQty++;
      shrinkTypeMap[cate5].unit += unit;
    }
    return {
      skuQty: shrinkSkuQty,
      unitTotal: shrinkUnitTotal,
      types: shrinkTypeOrder
        .map(function (name) {
          return shrinkTypeMap[name];
        })
        .filter(function (row) {
          return (Number(row.skuQty) || 0) > 0 || (Number(row.unit) || 0) > 0;
        }),
    };
  }

  function buildTransferShrinkModel(transferRows, slaLookup, shrinkRows) {
    shrinkRows = shrinkRows || [];
    if (!shrinkRows.length) {
      return {
        skuQty: 0,
        unitTotal: 0,
        types: [],
        emptyHint: "SR 대상 0건 — 상품명 [SR] 표기·SLA skuname 확인",
      };
    }
    if (!transferRows || !transferRows.length || !slaLookup) {
      return {
        skuQty: 0,
        unitTotal: 0,
        types: [],
        emptyHint: "이관 WMS 데이터 없음",
      };
    }
    var maps = buildShrinkSkuLookupMaps(shrinkRows);
    var unitByKey = Object.create(null);
    var i, row, sr, key;
    for (i = 0; i < transferRows.length; i++) {
      row = transferRows[i];
      if (row.statusLabel !== TRANSFER_SHRINK_STATUS_LABEL) continue;
      sr = resolveShrinkRowForTransferGc(row.gc, slaLookup, maps);
      if (!sr) continue;
      key = shrinkRowUnitKey(sr);
      if (!key) continue;
      if (!unitByKey[key]) unitByKey[key] = 0;
      unitByKey[key] += Number(row.qty) || 0;
    }
    var agg = buildShrinkTypeModel(shrinkRows, function (r) {
      return unitByKey[shrinkRowUnitKey(r)] || 0;
    });
    return {
      skuQty: agg.skuQty,
      unitTotal: agg.unitTotal,
      types: agg.types,
      emptyHint:
        agg.types.length > 0
          ? ""
          : "당일 진열대기 이관 Shrink 없음 (SLA GC 매칭·shrink 목록 확인)",
    };
  }

  function enrichProgressBundleTransferShrink(progressBundle, transferBundle) {
    if (!progressBundle || !progressBundle.model) return progressBundle;
    var ctx =
      transferBundle &&
      transferBundle.stats &&
      transferBundle.stats.drillCtx;
    var shrinkRows = progressBundle.shrinkRows || [];
    // SLA 인덱싱은 진행률 조회 뒤에 끝나므로, 여기서 cate5·SLA 전용 SR SKU를 채워 재집계
    if (ctx && ctx.slaLookup) {
      shrinkRows = rememberShrinkTargetRows(
        buildShrinkTargetRowsFromData(
          ctx.slaLookup,
          progressBundle.poRows || [],
          progressBundle.poNameBySku || null
        )
      );
      progressBundle.shrinkRows = shrinkRows;
      if (progressBundle.stats) {
        progressBundle.stats.shrinkRows = shrinkRows.length;
        progressBundle.stats.shrinkPoMatched = countShrinkPoMatches(
          shrinkRows,
          progressBundle.shrinkReceiveBySku
        );
      }
      progressBundle.model.shrink = buildProgressPanelModel(
        progressBundle.poRows || [],
        shrinkRows,
        progressBundle.model.operationalYmd,
        progressBundle.shrinkReceiveBySku
      ).shrink;
    }
    progressBundle.model.shrinkTr = buildTransferShrinkModel(
      ctx ? ctx.allRows : [],
      ctx ? ctx.slaLookup : null,
      shrinkRows
    );
    if (transferBundle && transferBundle.empty && progressBundle.model.shrinkTr) {
      progressBundle.model.shrinkTr.emptyHint = "이관 WMS 데이터 없음";
      progressBundle.model.shrinkTr.types = [];
      progressBundle.model.shrinkTr.skuQty = 0;
      progressBundle.model.shrinkTr.unitTotal = 0;
    }
    return progressBundle;
  }

  function loadShrinkDailyStore() {
    var empty = { version: 1, dir: Object.create(null), tr: Object.create(null) };
    try {
      var raw = JSON.parse(
        localStorage.getItem(SHRINK_DAILY_LS_KEY) || "null"
      );
      if (!raw || typeof raw !== "object") return empty;
      return {
        version: 1,
        dir: raw.dir && typeof raw.dir === "object" ? raw.dir : Object.create(null),
        tr: raw.tr && typeof raw.tr === "object" ? raw.tr : Object.create(null),
      };
    } catch (eLoad) {
      return empty;
    }
  }

  function pruneShrinkDailyStore(store) {
    if (!store) return;
    var cutoff = ymdAddDays(calendarYmdNow(), -SHRINK_DAILY_RETAIN_DAYS);
    var bucket, key;
    for (bucket in store) {
      if (bucket !== "dir" && bucket !== "tr") continue;
      if (!store[bucket] || typeof store[bucket] !== "object") continue;
      for (key in store[bucket]) {
        if (!Object.prototype.hasOwnProperty.call(store[bucket], key)) continue;
        if (String(key) < cutoff) {
          delete store[bucket][key];
        }
      }
    }
  }

  function saveShrinkDailyStore(store) {
    pruneShrinkDailyStore(store);
    localStorage.setItem(SHRINK_DAILY_LS_KEY, JSON.stringify(store));
  }

  function buildTransferShrinkGcQtyMap(transferRows, slaLookup, shrinkRows) {
    var maps = buildShrinkSkuLookupMaps(shrinkRows);
    var out = Object.create(null);
    var i, row, gc, sr, qty;
    transferRows = transferRows || [];
    for (i = 0; i < transferRows.length; i++) {
      row = transferRows[i];
      if (row.statusLabel !== TRANSFER_SHRINK_STATUS_LABEL) continue;
      sr = resolveShrinkRowForTransferGc(row.gc, slaLookup, maps);
      if (!sr) continue;
      gc = normalizeGcKey(row.gc);
      if (!gc) continue;
      qty = Number(row.qty) || 0;
      if (!qty) continue;
      if (!out[gc]) out[gc] = 0;
      out[gc] += qty;
    }
    return out;
  }

  function mergeShrinkGcMaxMap(prev, curr) {
    var out = Object.create(null);
    var gc;
    prev = prev || Object.create(null);
    curr = curr || Object.create(null);
    for (gc in prev) {
      if (!Object.prototype.hasOwnProperty.call(prev, gc)) continue;
      out[gc] = Number(prev[gc]) || 0;
    }
    for (gc in curr) {
      if (!Object.prototype.hasOwnProperty.call(curr, gc)) continue;
      out[gc] = Math.max(Number(out[gc]) || 0, Number(curr[gc]) || 0);
    }
    return out;
  }

  function sumShrinkGcMaxMap(map) {
    var total = 0;
    var gc;
    map = map || Object.create(null);
    for (gc in map) {
      if (!Object.prototype.hasOwnProperty.call(map, gc)) continue;
      total += Number(map[gc]) || 0;
    }
    return total;
  }

  function formatShrinkTeamsQty(n) {
    return Math.round(Number(n) || 0).toLocaleString("en-US");
  }

  function buildShrinkTeamsLines(dirUnit, trUnit) {
    return [
      "[Shrink 오늘누적]",
      "직납 " +
        formatShrinkTeamsQty(dirUnit) +
        " · 이관 " +
        formatShrinkTeamsQty(trUnit),
    ];
  }

  function updateShrinkDailyFromCaptureCtx(ctx) {
    if (!ctx || !ctx.model) {
      return { dirUnit: 0, trUnit: 0, shrinkLines: [] };
    }
    var store = loadShrinkDailyStore();
    var operYmd =
      ctx.operationalYmd ||
      ctx.model.operationalYmd ||
      operationalYmdNow();
    var calYmd = calendarYmdNow();
    var dirUnit = Number(ctx.model.shrink && ctx.model.shrink.unitTotal) || 0;
    var gcNow = Object.create(null);
    if (ctx.transferCtx && ctx.transferCtx.allRows && ctx.transferCtx.slaLookup) {
      gcNow = buildTransferShrinkGcQtyMap(
        ctx.transferCtx.allRows,
        ctx.transferCtx.slaLookup,
        ctx.shrinkRows || []
      );
    }
    var prevTr = store.tr[calYmd] || null;
    var mergedGc = mergeShrinkGcMaxMap(
      prevTr && prevTr.gcMax ? prevTr.gcMax : null,
      gcNow
    );
    var trUnit = sumShrinkGcMaxMap(mergedGc);
    var nowIso = new Date().toISOString();
    if (ctx.skipDirect) {
      var prevDir = store.dir[operYmd];
      dirUnit = prevDir ? Number(prevDir.unit) || 0 : 0;
    } else {
      store.dir[operYmd] = { unit: dirUnit, at: nowIso };
    }
    store.tr[calYmd] = { gcMax: mergedGc, unit: trUnit, at: nowIso };
    try {
      saveShrinkDailyStore(store);
    } catch (eSave) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[YAN4 Shrink daily]", eSave);
      }
    }
    return {
      dirUnit: dirUnit,
      trUnit: trUnit,
      operYmd: operYmd,
      calYmd: calYmd,
      shrinkLines: buildShrinkTeamsLines(dirUnit, trUnit),
    };
  }

  function buildTransferOnlyShrinkCaptureModel(shrinkRows, transferCtx, operYmd) {
    return {
      operationalYmd: operYmd || operationalYmdNow(),
      shrink: {
        skuQty: 0,
        unitTotal: 0,
        types: [],
        emptyHint: "",
      },
      shrinkTr: buildTransferShrinkModel(
        transferCtx ? transferCtx.allRows : [],
        transferCtx ? transferCtx.slaLookup : null,
        shrinkRows
      ),
    };
  }

  async function resolveSlaProgressCaptureCtx(
    progressBundle,
    transferBundle,
    skipDirect
  ) {
    var shrinkRows =
      progressBundle && progressBundle.shrinkRows
        ? progressBundle.shrinkRows
        : [];
    if (!shrinkRows.length) {
      shrinkRows = buildShrinkTargetRowsFromData(
        lastShrinkSlaLookup,
        progressBundle && progressBundle.poRows ? progressBundle.poRows : [],
        progressBundle && progressBundle.poNameBySku
          ? progressBundle.poNameBySku
          : null
      );
      rememberShrinkTargetRows(shrinkRows);
    }
    if (!shrinkRows.length) return null;

    var model;
    var operationalYmd = operationalYmdNow();
    var transferCtx =
      transferBundle &&
      transferBundle.stats &&
      transferBundle.stats.drillCtx
        ? transferBundle.stats.drillCtx
        : null;

    if (progressBundle && progressBundle.model) {
      model = progressBundle.model;
      operationalYmd =
        (progressBundle.stats && progressBundle.stats.operationalYmd) ||
        model.operationalYmd ||
        operationalYmd;
      if (transferBundle) {
        enrichProgressBundleTransferShrink(progressBundle, transferBundle);
        model = progressBundle.model;
      }
    } else if (skipDirect) {
      operationalYmd = operationalYmdNow();
      model = buildTransferOnlyShrinkCaptureModel(
        shrinkRows,
        transferCtx,
        operationalYmd
      );
    } else {
      var dr = defaultProgressDateRange();
      operationalYmd = dr.operationalYmd;
      var poPack = await fetchPoSkuLinesAll(null, dr);
      if (stopRequested) return null;
      model = buildProgressPanelModel(
        poPack.rows,
        shrinkRows,
        dr.operationalYmd,
        poPack.shrinkReceiveBySku
      );
      model.shrinkTr = buildTransferShrinkModel(
        transferCtx ? transferCtx.allRows : [],
        transferCtx ? transferCtx.slaLookup : null,
        shrinkRows
      );
    }

    return {
      model: model,
      shrinkRows: shrinkRows,
      operationalYmd: operationalYmd,
      transferCtx: transferCtx,
      skipDirect: !!skipDirect,
    };
  }

  async function resolveShrinkDailyPackForCapture() {
    var ctx = lastSlaProgressCaptureCtx;
    if (!ctx && lastSlaTransferBundle) {
      ctx = await resolveSlaProgressCaptureCtx(
        null,
        lastSlaTransferBundle,
        lastSlaPipelineSkipDirect
      );
    }
    return updateShrinkDailyFromCaptureCtx(ctx);
  }

  function normalizePoProgressRowsFromRecords(records, headerMap) {
    var out = [];
    var idx = headerMap.idx;
    var ri, cells, vendorName, tempZone, status, hasText;
    for (ri = 0; ri < records.length; ri++) {
      cells = records[ri];
      hasText = false;
      for (var ci = 0; ci < cells.length; ci++) {
        if (String(cells[ci] || "").trim()) {
          hasText = true;
          break;
        }
      }
      if (!hasText) continue;
      vendorName = normalizeCellText(poCellAt(cells, idx.vendorName));
      tempZone = mapPoTemperature(poCellAt(cells, idx.temperature));
      status = normalizeCellText(poCellAt(cells, idx.status));
      if (!vendorName || !tempZone || !status) continue;
      out.push({
        purchaseOrderSeq: normalizeCellText(
          poCellAt(cells, idx.purchaseOrderSeq)
        ),
        skuSeq: normalizeCellText(poCellAt(cells, idx.skuSeq)),
        skuName: normalizeCellText(poCellAt(cells, idx.skuName)),
        vendorName: vendorName,
        temperature: tempZone,
        status: status,
        purchaseOrderCount: parsePoQty(
          poCellAt(cells, idx.purchaseOrderCount)
        ),
        vendorConfirmedCount: parsePoQty(
          poCellAt(cells, idx.vendorConfirmedCount)
        ),
        receiveQty: parsePoQty(poCellAt(cells, idx.receiveQty)),
        unloadAt: parseFlexiblePoDate(poCellAt(cells, idx.unloadAt)),
      });
    }
    return out;
  }

  function sumPoProgressQty(poRows, tempZone, pickQty, requireUnload, operYmd) {
    var total = 0;
    var i, row, qty;
    for (i = 0; i < poRows.length; i++) {
      row = poRows[i];
      if (row.temperature !== tempZone) continue;
      if (!progressPoStatusOk(row.status)) continue;
      if (requireUnload) {
        if (!row.unloadAt || isNaN(row.unloadAt.getTime())) continue;
        if (operYmd && !instantInOperationalDay(row.unloadAt, operYmd)) continue;
      }
      qty = pickQty(row);
      total += isFinite(qty) ? qty : 0;
    }
    return total;
  }

  function buildSkuReceiveIndex(poRows) {
    var idx = Object.create(null);
    var i, row, key;
    for (i = 0; i < poRows.length; i++) {
      row = poRows[i];
      if (!progressPoStatusOk(row.status)) continue;
      key = normalizeDirectSkuJoinKey(row.skuSeq);
      if (!key) continue;
      if (!idx[key]) idx[key] = 0;
      idx[key] += Number(row.receiveQty) || 0;
    }
    return idx;
  }

  /** Shrink — SKU·입고수량만 필요 (온도/업체 필터로 행이 빠져도 조인) */
  function buildSkuReceiveIndexFromRawRecords(records, headerMap) {
    var idx = Object.create(null);
    var i, cells, status, key, qty;
    var idxMap = headerMap && headerMap.idx ? headerMap.idx : null;
    if (!idxMap || idxMap.skuSeq == null || idxMap.receiveQty == null) {
      return idx;
    }
    for (i = 0; i < records.length; i++) {
      cells = records[i];
      status = normalizeCellText(poCellAt(cells, idxMap.status));
      if (!progressPoStatusOk(status)) continue;
      key = normalizeDirectSkuJoinKey(poCellAt(cells, idxMap.skuSeq));
      if (!key) continue;
      qty = parsePoQty(poCellAt(cells, idxMap.receiveQty));
      if (!idx[key]) idx[key] = 0;
      idx[key] += qty;
    }
    return idx;
  }

  /** Shrink — SKU별 상품명 (온도/업체 필터로 행이 빠져도 SR 판정 가능하게) */
  function buildSkuNameIndexFromRawRecords(records, headerMap) {
    var idx = Object.create(null);
    var i, cells, key, name;
    var idxMap = headerMap && headerMap.idx ? headerMap.idx : null;
    if (!idxMap || idxMap.skuSeq == null || idxMap.skuName == null) return idx;
    for (i = 0; i < records.length; i++) {
      cells = records[i];
      key = normalizeDirectSkuJoinKey(poCellAt(cells, idxMap.skuSeq));
      if (!key || idx[key]) continue;
      name = normalizeCellText(poCellAt(cells, idxMap.skuName));
      if (!name) continue;
      idx[key] = name;
    }
    return idx;
  }

  function buildProgressVendorRows(poRows, operYmd) {
    var byVendor = Object.create(null);
    var i, row, vendor, at;
    for (i = 0; i < poRows.length; i++) {
      row = poRows[i];
      if (!progressPoStatusOk(row.status)) continue;
      if (!row.unloadAt || isNaN(row.unloadAt.getTime())) continue;
      if (operYmd && !instantInOperationalDay(row.unloadAt, operYmd)) continue;
      vendor = row.vendorName;
      if (!vendor) continue;
      at = row.unloadAt.getTime();
      if (!byVendor[vendor] || at < byVendor[vendor].unloadAt.getTime()) {
        byVendor[vendor] = { vendorName: vendor, unloadAt: row.unloadAt };
      }
    }
    var out = Object.keys(byVendor).map(function (k) {
      return byVendor[k];
    });
    out.sort(function (a, b) {
      return a.unloadAt.getTime() - b.unloadAt.getTime();
    });
    return out;
  }

  function buildProgressPanelModel(poRows, shrinkRows, operYmd, shrinkReceiveBySku) {
    var unloadRows = [];
    var receiveRows = [];
    var ti, def, arrival, unload, receive;
    for (ti = 0; ti < PROGRESS_TEMP_DEFS.length; ti++) {
      def = PROGRESS_TEMP_DEFS[ti];
      arrival = sumPoProgressQty(
        poRows,
        def.temp,
        function (row) {
          return row.vendorConfirmedCount;
        },
        false,
        operYmd
      );
      unload = sumPoProgressQty(
        poRows,
        def.temp,
        function (row) {
          return row.vendorConfirmedCount;
        },
        true,
        operYmd
      );
      receive = sumPoProgressQty(
        poRows,
        def.temp,
        function (row) {
          return row.receiveQty;
        },
        false,
        operYmd
      );
      unloadRows.push({
        label: def.label,
        arrival: arrival,
        unload: unload,
        gap: arrival - unload,
        progress: formatProgressPct(unload, arrival),
      });
      receiveRows.push({
        label: def.label,
        unload: unload,
        receive: receive,
        gap: unload - receive,
        progress: formatProgressPct(receive, unload),
      });
    }
    function sumField(list, key) {
      var s = 0;
      var li;
      for (li = 0; li < list.length; li++) {
        s += Number(list[li][key]) || 0;
      }
      return s;
    }
    var unloadTotalArrival = sumField(unloadRows, "arrival");
    var unloadTotalUnload = sumField(unloadRows, "unload");
    var receiveTotalUnload = sumField(receiveRows, "unload");
    var receiveTotalReceive = sumField(receiveRows, "receive");

    var receiveBySku =
      shrinkReceiveBySku && typeof shrinkReceiveBySku === "object"
        ? shrinkReceiveBySku
        : buildSkuReceiveIndex(poRows);
    var shrinkAgg = buildShrinkTypeModel(shrinkRows || [], function (r) {
      return receiveBySku[shrinkExternalSkuKey(r)] || 0;
    });

    return {
      unload: {
        rows: unloadRows,
        total: {
          label: "Total",
          arrival: unloadTotalArrival,
          unload: unloadTotalUnload,
          gap: unloadTotalArrival - unloadTotalUnload,
          progress: formatProgressPct(unloadTotalUnload, unloadTotalArrival),
        },
      },
      receive: {
        rows: receiveRows,
        total: {
          label: "Total",
          unload: receiveTotalUnload,
          receive: receiveTotalReceive,
          gap: receiveTotalUnload - receiveTotalReceive,
          progress: formatProgressPct(receiveTotalReceive, receiveTotalUnload),
        },
      },
      shrink: {
        skuQty: shrinkAgg.skuQty,
        unitTotal: shrinkAgg.unitTotal,
        types: shrinkAgg.types,
        emptyHint:
          (shrinkRows || []).length > 0
            ? shrinkAgg.types.length > 0
              ? ""
              : "당일 입고 Shrink 없음 (SKU Qty·Unit 0 TYPE 제외)"
            : "SR 대상 0건 — PO SKU 이름 열·상품명 [SR] 표기 확인",
      },
      vendors: buildProgressVendorRows(poRows, operYmd),
      operationalYmd: operYmd || "",
    };
  }

  function syncProgressPanelLayout(host) {
    if (!host) return;
    var wrap = host.querySelector(".yna4-sla-progress-wrap");
    var leftShell = host.querySelector(
      ".yna4-sla-progress-left .yna4-sla-progress-table-shell"
    );
    var vendorPanel = host.querySelector(".yna4-sla-progress-vendors-panel");
    function apply() {
      if (leftShell && vendorPanel) {
        var leftH = leftShell.offsetHeight;
        var vendorH = Math.max(
          80,
          leftH - PROGRESS_VENDOR_OFFSET_PX
        );
        vendorPanel.style.height = vendorH + "px";
        vendorPanel.style.maxHeight = vendorH + "px";
      }
      if (wrap) {
        var rect = wrap.getBoundingClientRect();
        if (rect.height > 0) {
          host.style.height = Math.ceil(rect.height) + "px";
        }
      }
    }
    apply();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(apply);
    }
  }

  function renderProgressPanel(host, bundle) {
    if (!host) return;
    host.textContent = "";
    host.style.height = "";
    host.style.width = "";
    if (!bundle || !bundle.model) {
      renderProgressPlaceholder(host, "진척 데이터 없음");
      return;
    }
    var model = bundle.model;
    var wrap = document.createElement("div");
    wrap.className = "yna4-sla-progress-wrap";

    var head = document.createElement("div");
    head.className = "yna4-sla-progress-head";
    head.textContent =
      "진척율 · " +
      operationalDayLabel(
        (bundle.stats && bundle.stats.operationalYmd) ||
          (model && model.operationalYmd)
      );
    wrap.appendChild(head);

    var grid = document.createElement("div");
    grid.className = "yna4-sla-progress-grid";

    var left = document.createElement("div");
    left.className = "yna4-sla-progress-left";
    left.appendChild(
      buildProgressMainSection(
        model.unload,
        model.receive,
        model.shrink,
        model.shrinkTr
      )
    );

    var right = document.createElement("div");
    right.className = "yna4-sla-progress-right";
    right.appendChild(buildProgressVendorSection(model.vendors));

    grid.appendChild(left);
    grid.appendChild(right);
    wrap.appendChild(grid);
    host.appendChild(wrap);
    syncProgressPanelLayout(host);
  }

  function renderProgressPlaceholder(host, msg, isErr) {
    if (!host) return;
    host.textContent = "";
    var el = document.createElement("div");
    el.className =
      "yna4-sla-progress-placeholder" +
      (isErr ? " yna4-sla-progress-placeholder--err" : "");
    el.textContent = msg || "";
    host.appendChild(el);
  }

  function appendProgressColgroup(table, widths) {
    var cg = document.createElement("colgroup");
    var i, col;
    for (i = 0; i < widths.length; i++) {
      col = document.createElement("col");
      col.style.width = widths[i];
      cg.appendChild(col);
    }
    table.appendChild(cg);
  }

  function appendProgressTableBlock(
    tbody,
    groupTitle,
    cols,
    rows,
    totalRow,
    isFirst,
    emptyHint,
    tableColCount,
    bodyRowClass
  ) {
    var colCount = tableColCount || cols.length;
    var trGroup = document.createElement("tr");
    trGroup.className =
      "yna4-sla-progress-tr--group-hdr" +
      (isFirst ? "" : " yna4-sla-progress-tr--group-hdr--sep");
    var tdGroup = document.createElement("td");
    tdGroup.colSpan = colCount;
    tdGroup.textContent = groupTitle;
    trGroup.appendChild(tdGroup);
    tbody.appendChild(trGroup);

    var trCol = document.createElement("tr");
    trCol.className = "yna4-sla-progress-tr--col-hdr";
    var ci, th, tailSpan;
    tailSpan = colCount > cols.length ? colCount - cols.length + 1 : 1;
    for (ci = 0; ci < cols.length; ci++) {
      th = document.createElement("th");
      th.scope = "col";
      th.textContent = cols[ci].label;
      if (!cols[ci].label) th.className = "yna4-sla-progress-th-pad";
      if (ci === cols.length - 1 && tailSpan > 1) th.colSpan = tailSpan;
      trCol.appendChild(th);
    }
    tbody.appendChild(trCol);

    var allRows = rows.slice();
    if (totalRow) allRows.unshift(totalRow);
    var ri, tr, cj, td, val;
    for (ri = 0; ri < allRows.length; ri++) {
      tr = document.createElement("tr");
      if (ri === 0 && totalRow) tr.className = "yna4-sla-progress-tr--total";
      else if (bodyRowClass) tr.className = bodyRowClass;
      for (cj = 0; cj < cols.length; cj++) {
        td = document.createElement("td");
        val = allRows[ri][cols[cj].key];
        if (cols[cj].num) {
          td.textContent = formatProgressQty(val);
          td.className = "yna4-sla-progress-num";
        } else if (cols[cj].pct) {
          appendProgressPctCell(td, val);
        } else if (cols[cj].datetime) {
          td.textContent = formatProgressDateTime(val);
          td.className = "yna4-sla-progress-num";
        } else {
          td.textContent = val == null ? "" : String(val);
          if (cj === 0) td.className = "yna4-sla-progress-td-label";
          else if (!cols[cj].label) td.className = "yna4-sla-progress-td-pad";
        }
        if (cj === cols.length - 1 && tailSpan > 1) td.colSpan = tailSpan;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    if (emptyHint && (!rows || !rows.length)) {
      tr = document.createElement("tr");
      td = document.createElement("td");
      td.colSpan = colCount;
      td.className = "yna4-sla-progress-shrink-empty";
      td.textContent = emptyHint;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  function buildProgressShrinkRows(shrink) {
    shrink = shrink || { types: [] };
    var shrinkTypes = shrink.types || [];
    var rows = [];
    var ti, row;
    for (ti = 0; ti < shrinkTypes.length; ti++) {
      row = shrinkTypes[ti];
      if ((Number(row.skuQty) || 0) <= 0 && (Number(row.unit) || 0) <= 0) {
        continue;
      }
      rows.push({
        label: row.cate5,
        skuQty: row.skuQty,
        unit: row.unit,
        pad1: "",
        pad2: "",
      });
    }
    return rows;
  }

  function buildProgressMainSection(
    unloadModel,
    receiveModel,
    shrinkModel,
    shrinkTrModel
  ) {
    var unloadCols = [
      { key: "label", label: "Temperature" },
      { key: "arrival", label: "Arrival", num: true },
      { key: "unload", label: "Unload", num: true },
      { key: "gap", label: "Gap", num: true },
      { key: "progress", label: "Progress", pct: true },
    ];
    var receiveCols = [
      { key: "label", label: "Temperature" },
      { key: "unload", label: "Unload", num: true },
      { key: "receive", label: "Receive", num: true },
      { key: "gap", label: "Gap", num: true },
      { key: "progress", label: "Progress", pct: true },
    ];
    var shrinkCols = [
      { key: "label", label: "TYPE" },
      { key: "skuQty", label: "SKU Qty", num: true },
      { key: "unit", label: "Unit", num: true },
      { key: "pad1", label: "" },
      { key: "pad2", label: "" },
    ];
    shrinkModel = shrinkModel || { skuQty: 0, unitTotal: 0, types: [], emptyHint: "" };
    var shrinkRows = buildProgressShrinkRows(shrinkModel);
    var shrinkEmptyHint = "";
    if (!shrinkRows.length) {
      shrinkEmptyHint =
        shrinkModel.emptyHint ||
        "Shrink TYPE 없음 — SLA cate5 열·상품명 [SR] 표기 확인";
    }
    var sec = document.createElement("div");
    sec.className = "yna4-sla-progress-section";
    var table = document.createElement("table");
    table.className =
      "yna4-sla-progress-table yna4-sla-progress-table--combined";
    appendProgressColgroup(table, ["22%", "19.5%", "19.5%", "19.5%", "19.5%"]);
    var tbody = document.createElement("tbody");
    appendProgressTableBlock(
      tbody,
      "하차 진척율",
      unloadCols,
      unloadModel.rows,
      unloadModel.total,
      true
    );
    appendProgressTableBlock(
      tbody,
      "매입 진척율",
      receiveCols,
      receiveModel.rows,
      receiveModel.total,
      false
    );
    appendProgressTableBlock(
      tbody,
      "Shrink (직납 · PO 입고)",
      shrinkCols,
      shrinkRows,
      {
        label: "Total",
        skuQty: shrinkModel.skuQty,
        unit: shrinkModel.unitTotal,
        pad1: "",
        pad2: "",
      },
      false,
      shrinkEmptyHint
    );
    if (shrinkTrModel) {
      var shrinkTrRows = buildProgressShrinkRows(shrinkTrModel);
      var shrinkTrEmptyHint = "";
      if (!shrinkTrRows.length) {
        shrinkTrEmptyHint =
          shrinkTrModel.emptyHint ||
          "이관 Shrink 없음 — WMS 진열대기·SLA GC 확인";
      }
      appendProgressTableBlock(
        tbody,
        "Shrink (이관 · WMS 진열대기)",
        shrinkCols,
        shrinkTrRows,
        {
          label: "Total",
          skuQty: shrinkTrModel.skuQty,
          unit: shrinkTrModel.unitTotal,
          pad1: "",
          pad2: "",
        },
        false,
        shrinkTrEmptyHint
      );
    }
    table.appendChild(tbody);
    var shell = document.createElement("div");
    shell.className = "yna4-sla-progress-table-shell";
    shell.appendChild(table);
    sec.appendChild(shell);
    return sec;
  }

  function buildProgressVendorSection(vendors) {
    var sec = document.createElement("div");
    sec.className = "yna4-sla-progress-section yna4-sla-progress-section--vendors";
    var panel = document.createElement("div");
    panel.className = "yna4-sla-progress-vendors-panel";
    var groupHdr = document.createElement("div");
    groupHdr.className = "yna4-sla-progress-vendor-group-hdr";
    groupHdr.textContent = "하차시간";
    panel.appendChild(groupHdr);
    var scroll = document.createElement("div");
    scroll.className = "yna4-sla-progress-vendors-scroll";
    var table = document.createElement("table");
    table.className =
      "yna4-sla-progress-table yna4-sla-progress-table--vendors";
    var thead = document.createElement("thead");
    thead.innerHTML =
      "<tr><th class='yna4-sla-progress-vendor-th-label'>업체명</th>" +
      "<th>하차시간</th></tr>";
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    var vi, tr, row;
    vendors = vendors || [];
    for (vi = 0; vi < vendors.length; vi++) {
      row = vendors[vi];
      tr = document.createElement("tr");
      tr.innerHTML =
        "<td class='yna4-sla-progress-td-label'>" +
        escapeHtml(row.vendorName) +
        "</td><td class='yna4-sla-progress-num'>" +
        formatProgressDateTime(row.unloadAt) +
        "</td>";
      tbody.appendChild(tr);
    }
    if (!vendors.length) {
      tr = document.createElement("tr");
      tr.innerHTML =
        "<td colspan='2' class='yna4-sla-progress-shrink-empty'>당일 하차시간 없음</td>";
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    panel.appendChild(scroll);
    sec.appendChild(panel);
    return sec;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function collectProgressPanelBundle(statusEl, phaseLabel) {
    var prefix = phaseLabel ? phaseLabel + " " : "";
    var dr = defaultProgressDateRange();
    statusEl.textContent =
      prefix +
      "PO Management… (" +
      operationalDayLabel(dr.operationalYmd) +
      ")";
    var poPack = await fetchPoSkuLinesAll(statusEl, dr);
    if (stopRequested) return { stopped: true };
    var shrinkRows = rememberShrinkTargetRows(
      buildShrinkTargetRowsFromData(
        lastShrinkSlaLookup,
        poPack.rows,
        poPack.skuNameBySku
      )
    );
    var model = buildProgressPanelModel(
      poPack.rows,
      shrinkRows,
      dr.operationalYmd,
      poPack.shrinkReceiveBySku
    );
    return {
      model: model,
      poRows: poPack.rows,
      shrinkRows: shrinkRows,
      poNameBySku: poPack.skuNameBySku,
      shrinkReceiveBySku: poPack.shrinkReceiveBySku,
      stats: {
        poRows: poPack.rows.length,
        shrinkRows: shrinkRows.length,
        shrinkLoadError: "",
        shrinkPoMatched: countShrinkPoMatches(
          shrinkRows,
          poPack.shrinkReceiveBySku
        ),
        operationalYmd: dr.operationalYmd,
        loadedAt: formatPipelineTimestamp(),
      },
    };
  }

  function parseFlexiblePoDate(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date && !isNaN(v.getTime())) return v;
    var s = normalizeCellText(v);
    if (!s) return null;
    var mIso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(
      s
    );
    if (mIso) {
      var dIso = new Date(
        +mIso[1],
        +mIso[2] - 1,
        +mIso[3],
        +(mIso[4] || 0),
        +(mIso[5] || 0),
        +(mIso[6] || 0)
      );
      return isNaN(dIso.getTime()) ? null : dIso;
    }
    var mSlash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(
      s
    );
    if (mSlash) {
      var yr = +mSlash[3];
      if (yr < 100) yr += yr >= 70 ? 1900 : 2000;
      var dSl = new Date(
        yr,
        +mSlash[1] - 1,
        +mSlash[2],
        +(mSlash[4] || 0),
        +(mSlash[5] || 0),
        0
      );
      return isNaN(dSl.getTime()) ? null : dSl;
    }
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function parsePoQty(v) {
    var n = Number(String(v == null ? "" : v).replace(/,/g, "").trim());
    return isFinite(n) ? n : 0;
  }

  function mapPoTemperature(raw) {
    var s = normalizeCellText(raw);
    if (!s) return "";
    if (s === "냉장 +10℃" || s === "상온") return "Ambient";
    if (s === "냉장 +1℃") return "Chilled";
    if (s === "냉동 -18℃") return "Frozen";
    var u = s.toUpperCase();
    if (u === "AMBIENT" || u === "ROOM") return "Ambient";
    if (u === "CHILLED" || u === "COLD") return "Chilled";
    if (u === "FROZEN") return "Frozen";
    return "";
  }

  function directTempToRowKey(tempZone) {
    if (tempZone === "Ambient") return "DIRECT_PENDING_AMBIENT";
    if (tempZone === "Chilled") return "DIRECT_PENDING_CHILLED";
    if (tempZone === "Frozen") return "DIRECT_PENDING_FROZEN";
    return "";
  }

  function directTempZoneFromStorageLabel(storageLabel) {
    var lab = detectStorageTempLabel(storageLabel);
    if (lab === "냉동-18") return "Frozen";
    if (lab === "냉장+1") return "Chilled";
    if (lab === "냉장+10" || lab === "상온") return "Ambient";
    var meta = pivotRowKeyFromStorage(storageLabel, "", "");
    if (meta.key === "FROZEN") return "Frozen";
    if (
      meta.parent === "CHILLED" ||
      String(meta.key || "").indexOf("CHILLED") === 0
    ) {
      return "Chilled";
    }
    if (
      meta.parent === "AMBIENT" ||
      String(meta.key || "").indexOf("AMBIENT") === 0 ||
      meta.key === "ROCKETMART"
    ) {
      return "Ambient";
    }
    return "";
  }

  function directNormalizeInventorySkuId(sku) {
    var s = String(sku || "").replace(/\u00a0/g, " ").trim();
    if (!s) return "";
    var m = s.match(/\d{5,20}/);
    return m ? m[0] : s.replace(/\s+/g, "");
  }

  function parseInventorySkuDetailPathFromHtml(html) {
    var raw = String(html || "");
    var m = raw.match(/href=["'](\/sku\/\d+)/i);
    if (m) return m[1];
    m = raw.match(/inventory\.coupang\.com\/sku\/(\d+)/i);
    if (m) return "/sku/" + m[1];
    return "";
  }

  function buildDirectInventoryListSearchUrl(skuId, mode) {
    var p = new URLSearchParams();
    p.set("searched", "true");
    p.set("locationType", "");
    p.set("zone", "");
    p.set("fromLocation", "");
    p.set("toLocation", "");
    p.set("locationBarcode", "");
    p.set("skuId", mode === "external" ? "" : String(skuId || ""));
    p.set("externalSkuId", mode === "external" ? String(skuId || "") : "");
    p.set("skuBarcode", "");
    p.set("lpnId", "");
    p.set("inventoryId", "");
    p.set("saleableChangeType", "");
    p.set("availableInventory", "true");
    p.set("page", "0");
    p.set("pageSize", "20");
    return INVENTORY_LIST_BASE + "?" + p.toString();
  }

  async function fetchDirectSkuStorageLabel(skuId) {
    var key = directNormalizeInventorySkuId(skuId);
    if (!key) return "";
    if (skuTempCache[key] !== undefined) return skuTempCache[key];
    var storageLabel = "";
    var skuHtml = "";
    var listHtml = "";
    var detailPath = "";
    try {
      await sleep(NETWORK_DELAY_MS);
      skuHtml = await inventoryGet(INVENTORY_SKU_BASE + key, {
        referer: INVENTORY_SKU_BASE + key,
      });
      storageLabel = parseStorageTempFromSkuHtml(skuHtml);
      if (storageLabel) {
        skuTempCache[key] = storageLabel;
        return storageLabel;
      }
      listHtml = await inventoryGet(
        buildDirectInventoryListSearchUrl(key, "internal"),
        { referer: INVENTORY_REFERER }
      );
      storageLabel = parseStorageTempFromSkuHtml(listHtml);
      if (!storageLabel) {
        detailPath = parseInventorySkuDetailPathFromHtml(listHtml);
        if (detailPath) {
          await sleep(NETWORK_DELAY_MS);
          skuHtml = await inventoryGet(
            "https://inventory.coupang.com" + detailPath,
            {
              referer: INVENTORY_REFERER,
            }
          );
          storageLabel = parseStorageTempFromSkuHtml(skuHtml);
        }
      }
      if (!storageLabel) {
        listHtml = await inventoryGet(
          buildDirectInventoryListSearchUrl(key, "external"),
          { referer: INVENTORY_REFERER }
        );
        storageLabel = parseStorageTempFromSkuHtml(listHtml);
        if (!storageLabel) {
          detailPath = parseInventorySkuDetailPathFromHtml(listHtml);
          if (detailPath) {
            await sleep(NETWORK_DELAY_MS);
            skuHtml = await inventoryGet(
              "https://inventory.coupang.com" + detailPath,
              {
                referer: INVENTORY_REFERER,
              }
            );
            storageLabel = parseStorageTempFromSkuHtml(skuHtml);
          }
        }
      }
      skuTempCache[key] = storageLabel || "";
      return storageLabel;
    } catch (eSku) {
      skuTempCache[key] = "";
      return "";
    }
  }

  async function resolveDirectSkuTempZone(skuId) {
    return directTempZoneFromStorageLabel(
      await fetchDirectSkuStorageLabel(skuId)
    );
  }

  function directTimeColFromBase(baseAt, queryAt) {
    if (!baseAt || isNaN(baseAt.getTime())) return "";
    var slaAt = new Date(
      baseAt.getTime() + DIRECT_OFFSET_HOURS * 3600000
    );
    var nowMs =
      queryAt instanceof Date && !isNaN(queryAt.getTime())
        ? queryAt.getTime()
        : typeof queryAt === "number" && isFinite(queryAt)
          ? queryAt
          : Date.now();
    if (nowMs - slaAt.getTime() >= SLA_PIVOT_DAY_BUCKET_HOURS * 3600000) {
      return formatPivotDateCol(slaAt);
    }
    return formatPivotTimeCol(slaAt);
  }

  function directSlaAtFromBase(baseAt) {
    if (!baseAt || isNaN(baseAt.getTime())) return null;
    return new Date(baseAt.getTime() + DIRECT_OFFSET_HOURS * 3600000);
  }

  /** 하차(외부 SKU ID) ↔ PO Management(SKU ID) — 동일 값, 공백·.0 제거 */
  function normalizeDirectSkuJoinKey(s) {
    return normalizeSlaBarcodeKey(s);
  }

  function buildPoSkuIndex(poRows) {
    var idx = Object.create(null);
    var i, row, skuKey;
    for (i = 0; i < poRows.length; i++) {
      row = poRows[i];
      skuKey = normalizeDirectSkuJoinKey(row.skuSeq);
      if (!skuKey) continue;
      if (!idx[skuKey]) idx[skuKey] = row;
    }
    return idx;
  }

  function buildPoPurchaseOrderIndex(poRows) {
    var idx = Object.create(null);
    var i, row, poKey;
    for (i = 0; i < poRows.length; i++) {
      row = poRows[i];
      poKey = normalizeCellText(row.purchaseOrderSeq);
      if (!poKey) continue;
      if (!idx[poKey]) idx[poKey] = row;
    }
    return idx;
  }

  function buildDirectPoCtxFromPoRows(poRows) {
    if (!poRows || !poRows.length) return null;
    return {
      poBySku: buildPoSkuIndex(poRows),
      poByPoSeq: buildPoPurchaseOrderIndex(poRows),
    };
  }

  function resolveUnloadDetailUrl(unloadRow) {
    if (!unloadRow) return "";
    var raw = "";
    if (unloadRow.ibcUrl) raw = String(unloadRow.ibcUrl).trim();
    if (!raw) {
      var bridge = window.__YAN4_UNLOAD_SLA_BRIDGE__;
      if (bridge && typeof bridge.ibcUrlFor === "function") {
        raw = bridge.ibcUrlFor(unloadRow.ibc || unloadRow.unloadIbc);
      }
    }
    raw = String(raw || "").trim();
    if (!raw) return "";
    /* Desktop: file:// 잘못 절대화된 링크 복구 */
    if (/^https?:\/\/inbound\.coupang\.com\//i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw) && raw.indexOf("inbound.coupang.com") >= 0) {
      return raw;
    }
    var mFile = raw.match(
      /^(?:file:|app:)[\s\S]*?(\/(?:unloadWork|purchaseOrder)\/[\s\S]*)$/i
    );
    if (mFile) {
      return "https://inbound.coupang.com" + mFile[1].replace(/^\/+/, "/");
    }
    try {
      return new URL(raw, "https://inbound.coupang.com/").href;
    } catch (eU) {
      return raw;
    }
  }

  function resolveDirectTempZoneFromPo(poCtx, skuKey, gapSku) {
    if (!poCtx) return "";
    var poRec = null;
    if (skuKey && poCtx.poBySku && poCtx.poBySku[skuKey]) {
      poRec = poCtx.poBySku[skuKey];
    }
    if (!poRec && poCtx.poByPoSeq) {
      var poId = String(
        gapSku && gapSku.purchaseOrderId != null ? gapSku.purchaseOrderId : ""
      ).trim();
      if (poId) poRec = poCtx.poByPoSeq[poId] || null;
    }
    if (poRec && poRec.temperature) return poRec.temperature;
    if (gapSku && gapSku.poTemperature) {
      return mapPoTemperature(gapSku.poTemperature) || "";
    }
    return "";
  }

  function formatDirectRepresentativeFromRaw(raw) {
    if (!raw) return null;
    var skuKey = normalizeDirectSkuJoinKey(raw.sku);
    if (!skuKey) return null;
    return {
      skuKey: skuKey,
      skuName: String(raw.name || "").trim(),
      purchaseOrderSeq: String(raw.purchaseOrderId || "").trim() || "",
      skuStatus: String(raw.status || "").trim(),
      poTemperature: String(raw.poTemperature || "").trim(),
      source: raw.source || "unload",
    };
  }

  function enrichRepFromPoCtx(rep, poCtx) {
    if (!rep || !poCtx) return rep;
    var poRec =
      rep.skuKey && poCtx.poBySku ? poCtx.poBySku[rep.skuKey] : null;
    if (!poRec && poCtx.poByPoSeq && rep.purchaseOrderSeq) {
      poRec = poCtx.poByPoSeq[rep.purchaseOrderSeq] || null;
      if (
        poRec &&
        rep.skuKey &&
        normalizeDirectSkuJoinKey(poRec.skuSeq) &&
        normalizeDirectSkuJoinKey(poRec.skuSeq) !== rep.skuKey
      ) {
        poRec = null;
      }
    }
    if (!poRec) return rep;
    if (!rep.poTemperature && poRec.temperature) {
      rep.poTemperature = poRec.temperature;
    }
    if (!rep.purchaseOrderSeq && poRec.purchaseOrderSeq) {
      rep.purchaseOrderSeq = poRec.purchaseOrderSeq;
    }
    return rep;
  }

  /** IBC PO SKU 우선(진척 poCtx 보강) · 없을 때만 하차 상품정보 표 */
  async function resolveDirectRepresentativeSku(
    detailUrl,
    gapBridge,
    poCtx,
    prefetchedGapSkus
  ) {
    var rep = null;
    var gapSkus = prefetchedGapSkus || [];
    var gi, row, product;
    if (
      !gapSkus.length &&
      gapBridge &&
      typeof gapBridge.gapSkusForDetailUrl === "function" &&
      detailUrl
    ) {
      try {
        gapSkus = await gapBridge.gapSkusForDetailUrl(detailUrl);
      } catch (eGap) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 Direct SLA PO SKU]", detailUrl, eGap);
        }
      }
      for (gi = 0; gi < gapSkus.length; gi++) {
        rep = formatDirectRepresentativeFromRaw(gapSkus[gi]);
        if (rep) {
          rep.source = "po";
          break;
        }
      }
    } else if (gapSkus.length) {
      for (gi = 0; gi < gapSkus.length; gi++) {
        rep = formatDirectRepresentativeFromRaw(gapSkus[gi]);
        if (rep) {
          rep.source = "po";
          break;
        }
      }
    }
    if (rep) {
      rep = enrichRepFromPoCtx(rep, poCtx);
    }
    if (
      !rep &&
      gapBridge &&
      typeof gapBridge.topSkuForDetailUrl === "function" &&
      detailUrl
    ) {
      try {
        product = await gapBridge.topSkuForDetailUrl(detailUrl);
        if (product) product.source = "unload_product";
        rep = formatDirectRepresentativeFromRaw(product);
        if (rep) rep = enrichRepFromPoCtx(rep, poCtx);
      } catch (eTop) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 Direct SLA product SKU]", detailUrl, eTop);
        }
      }
    }
    return rep;
  }

  function pushDirectSlaRow(out, opts) {
    out.push({
      vendorName: opts.vendorName || "",
      temperature: opts.temperature || "",
      rowKey: opts.rowKey,
      timeCol: opts.timeCol,
      slaAt: opts.slaAt,
      slaBaseAt: opts.slaBaseAt,
      pivotQty: opts.qty,
      remainQty: opts.qty,
      topSkuGap: opts.qty,
      recv: Number(opts.recv) || 0,
      disp: Number(opts.disp) || 0,
      errQty: Number(opts.errQty) || 0,
      unloadIbc: opts.unloadIbc || "",
      ibcUrl: opts.ibcUrl || "",
      unloadWorker: opts.unloadWorker || "",
      skuSeq: opts.skuKey,
      skuName: opts.skuName || "",
      purchaseOrderSeq: opts.purchaseOrderSeq || "",
      poSkuList: opts.skuKey,
      skuStatus: opts.skuStatus || "",
      source: opts.source || "unload",
    });
  }

  async function pushDirectUnloadSkuRow(out, opts) {
    var skuKey = opts.skuKey;
    var gapSkuMeta = {
      purchaseOrderId: opts.purchaseOrderSeq,
      poTemperature: opts.poTemperature,
    };
    var tempZone = resolveDirectTempZoneFromPo(opts.poCtx, skuKey, gapSkuMeta);
    if (!tempZone) {
      tempZone = await resolveDirectSkuTempZone(skuKey);
    }
    var rowKey = directTempToRowKey(tempZone);
    if (!rowKey) {
      return { ok: false };
    }
    pushDirectSlaRow(out, {
      vendorName: opts.vendorName,
      temperature: tempZone,
      rowKey: rowKey,
      timeCol: opts.timeCol,
      slaAt: opts.slaAt,
      slaBaseAt: opts.slaBaseAt,
      qty: opts.qty,
      recv: opts.recv,
      disp: opts.disp,
      errQty: opts.errQty,
      unloadIbc: opts.unloadIbc,
      ibcUrl: opts.ibcUrl,
      unloadWorker: opts.unloadWorker,
      skuKey: skuKey,
      skuName: opts.skuName,
      purchaseOrderSeq: opts.purchaseOrderSeq,
      skuStatus: opts.skuStatus,
      source: opts.source,
    });
    return { ok: true };
  }

  /** 하차 미진열=수량(ibcBudget) · PO SKU gap마다 1행 · 잔량=대표 SKU 1행 */
  async function buildDirectRowsFromUnload(unloadRows, statusEl, poCtx) {
    var gapBridge = window.__YAN4_UNLOAD_GAP_BRIDGE__;
    var out = [];
    var queryAt = new Date();
    var enriched = 0;
    var skippedNoSku = 0;
    var skippedNoMeta = 0;
    var skippedNoTemp = 0;
    var skippedBad = 0;
    var tempMissSamples = [];
    var skippedQty = 0;
    var unloadRemainTotal = 0;
    var i, u, detailUrl, gapSkus, gi, gapSku, rep, baseAt, gapSkuMeta;
    var unloadRemain, skuKey, ibcBudget, gapQty, emitQty, poEmittedSum;
    var rowPack, remainderRep;
    var seenPo = Object.create(null);
    var dupIbc = 0;
    var dupPo = 0;
    var poIds, hasDupPo, newPoIds, pk;
    var ordered = (unloadRows || []).slice().sort(function (a, b) {
      var ta = a && a.unload ? a.unload.getTime() : NaN;
      var tb = b && b.unload ? b.unload.getTime() : NaN;
      if (isNaN(ta)) return isNaN(tb) ? 0 : 1;
      if (isNaN(tb)) return -1;
      return ta - tb;
    });
    for (i = 0; i < ordered.length; i++) {
      if (stopRequested) break;
      u = ordered[i];
      if (!u || !u.unload || isNaN(u.unload.getTime())) {
        skippedBad++;
        continue;
      }
      unloadRemain = Number(u.remainQty) || 0;
      if (unloadRemain <= 0) {
        skippedBad++;
        continue;
      }
      if (statusEl) {
        statusEl.textContent =
          "하차 SKU·온도 " + (i + 1) + "/" + ordered.length + "…";
      }
      detailUrl = resolveUnloadDetailUrl(u);
      baseAt = u.unload;
      gapSkus = [];
      if (
        gapBridge &&
        typeof gapBridge.gapSkusForDetailUrl === "function" &&
        detailUrl
      ) {
        try {
          gapSkus = await gapBridge.gapSkusForDetailUrl(detailUrl);
        } catch (eGap) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 Direct SLA PO SKU]", detailUrl, eGap);
          }
        }
      }
      poIds = (gapSkus && gapSkus.poIds) || [];
      if (!poIds.length) {
        poIds = [];
        for (gi = 0; gi < gapSkus.length; gi++) {
          pk = String(gapSkus[gi].purchaseOrderId || gapSkus[gi].poUrl || "");
          if (pk && poIds.indexOf(pk) < 0) poIds.push(pk);
        }
      }
      hasDupPo = false;
      newPoIds = Object.create(null);
      for (gi = 0; gi < poIds.length; gi++) {
        if (seenPo[poIds[gi]]) {
          hasDupPo = true;
          dupPo++;
        } else {
          newPoIds[poIds[gi]] = true;
        }
      }
      for (gi = 0; gi < poIds.length; gi++) seenPo[poIds[gi]] = true;
      if (hasDupPo) {
        gapSkus = gapSkus.filter(function (g) {
          return !!newPoIds[String(g.purchaseOrderId || g.poUrl || "")];
        });
        unloadRemain = 0;
        for (gi = 0; gi < gapSkus.length; gi++) {
          unloadRemain += Number(gapSkus[gi].gap) || 0;
        }
        if (unloadRemain <= 0) {
          dupIbc++;
          await sleep(80);
          continue;
        }
      }
      unloadRemainTotal += unloadRemain;
      ibcBudget = unloadRemain;
      poEmittedSum = 0;
      for (gi = 0; gi < gapSkus.length; gi++) {
        if (stopRequested) break;
        gapSku = gapSkus[gi];
        gapQty = Number(gapSku.gap) || 0;
        if (gapQty <= 0) continue;
        emitQty = Math.min(gapQty, ibcBudget);
        if (emitQty <= 0) continue;
        skuKey = normalizeDirectSkuJoinKey(gapSku.sku);
        if (!skuKey) {
          skippedNoSku++;
          continue;
        }
        rep = enrichRepFromPoCtx(
          formatDirectRepresentativeFromRaw(gapSku),
          poCtx
        );
        gapSkuMeta = {
          purchaseOrderId: rep ? rep.purchaseOrderSeq : "",
          poTemperature: rep ? rep.poTemperature : "",
        };
        rowPack = await pushDirectUnloadSkuRow(out, {
          poCtx: poCtx,
          vendorName: normalizeCellText(u.vendor),
          timeCol: directTimeColFromBase(baseAt, queryAt),
          slaAt: directSlaAtFromBase(baseAt),
          slaBaseAt: baseAt,
          qty: emitQty,
          recv: Number(gapSku.recv) || 0,
          disp: Number(gapSku.disp) || 0,
          errQty: Number(gapSku.err) || 0,
          unloadIbc: u.ibc || "",
          ibcUrl: detailUrl,
          unloadWorker: u.worker || "",
          skuKey: skuKey,
          skuName: rep ? rep.skuName : String(gapSku.name || "").trim(),
          purchaseOrderSeq: rep ? rep.purchaseOrderSeq : "",
          poTemperature: gapSkuMeta.poTemperature,
          skuStatus: rep ? rep.skuStatus : String(gapSku.status || "").trim(),
          source: "po",
        });
        if (!rowPack.ok) {
          skippedNoTemp++;
          skippedQty += emitQty;
          if (tempMissSamples.length < 3) {
            tempMissSamples.push(skuKey);
          }
          continue;
        }
        ibcBudget -= emitQty;
        poEmittedSum += emitQty;
        enriched++;
      }
      if (hasDupPo && ibcBudget > 0) {
        skippedQty += ibcBudget;
      } else if (ibcBudget > 0) {
        remainderRep = await resolveDirectRepresentativeSku(
          detailUrl,
          gapBridge,
          poCtx,
          gapSkus
        );
        if (!remainderRep) {
          skippedNoSku++;
          skippedQty += ibcBudget;
          if (!gapSkus.length) skippedNoMeta++;
        } else {
          rowPack = await pushDirectUnloadSkuRow(out, {
            poCtx: poCtx,
            vendorName: normalizeCellText(u.vendor),
            timeCol: directTimeColFromBase(baseAt, queryAt),
            slaAt: directSlaAtFromBase(baseAt),
            slaBaseAt: baseAt,
            qty: ibcBudget,
            recv: Number(u.recv) || 0,
            disp: Number(u.disp) || 0,
            errQty: Number(u.errQty) || 0,
            unloadIbc: u.ibc || "",
            ibcUrl: detailUrl,
            unloadWorker: u.worker || "",
            skuKey: remainderRep.skuKey,
            skuName: remainderRep.skuName,
            purchaseOrderSeq: remainderRep.purchaseOrderSeq,
            poTemperature: remainderRep.poTemperature,
            skuStatus: remainderRep.skuStatus,
            source: poEmittedSum > 0 ? "unload_remain" : remainderRep.source,
          });
          if (!rowPack.ok) {
            skippedNoTemp++;
            skippedQty += ibcBudget;
            if (tempMissSamples.length < 3) {
              tempMissSamples.push(remainderRep.skuKey);
            }
          } else {
            enriched++;
          }
        }
      }
      await sleep(80);
    }
    return {
      rows: out,
      enriched: enriched,
      skippedNoSku: skippedNoSku,
      skippedNoMeta: skippedNoMeta,
      skippedNoTemp: skippedNoTemp,
      skippedQty: skippedQty,
      unloadRemainTotal: unloadRemainTotal,
      skippedBad: skippedBad,
      dupIbc: dupIbc,
      dupPo: dupPo,
      tempMissSamples: tempMissSamples,
    };
  }

  async function fetchUnloadSlaRowsForDirect(statusEl, operYmd, statusText) {
    var bridge = window.__YAN4_UNLOAD_SLA_BRIDGE__;
    if (!bridge) return [];
    var want =
      String(operYmd || "").trim() ||
      (typeof bridge.operationalYmd === "function"
        ? bridge.operationalYmd()
        : operationalYmdNow());
    try {
      if (statusEl) {
        statusEl.textContent =
          statusText ||
          "직납 하차내역 조회… (" + operationalDayLabel(want) + ")";
      }
      if (typeof bridge.ensureForYmd === "function") {
        return await bridge.ensureForYmd(want, { forceRefresh: true });
      }
      if (typeof bridge.getRows === "function") {
        return bridge.getRows();
      }
    } catch (eUnload) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[YAN4 Direct SLA unload bridge]", eUnload);
      }
    }
    return [];
  }

  async function fetchPoSkuLinesAll(statusEl, dr) {
    var page = 1;
    var after = "";
    var chunks = [];
    var headerLine = "";
    var headerMap = null;
    var totalLines = 0;
    while (page <= PO_PAGE_CAP) {
      if (stopRequested) break;
      if (statusEl) {
        statusEl.textContent =
          "PO Management " + page + "페이지…";
      }
      var res = await poManagementPost(
        buildPoListDownloadBody(page, after, dr)
      );
      if (stopRequested) break;
      var payload = parsePoListDownloadResponse(res.body, page === 1);
      if (payload.header && !headerLine) {
        headerLine = String(payload.header || "");
        headerMap = poHeaderFieldMap(headerLine);
        validatePoHeaderMap(headerMap);
      }
      if (payload.data) {
        chunks.push(String(payload.data || ""));
        totalLines += String(payload.data || "").split(/\r?\n/).length;
      }
      if (!payload.after) break;
      after = String(payload.after || "");
      page++;
      await sleep(60);
    }
    if (!headerMap) {
      throw new Error("PO Management 헤더 없음");
    }
    var rawRecords = parseCsvRecords(chunks.join(""));
    var allRows = normalizePoProgressRowsFromRecords(rawRecords, headerMap);
    var shrinkReceiveBySku = buildSkuReceiveIndexFromRawRecords(
      rawRecords,
      headerMap
    );
    var skuNameBySku = buildSkuNameIndexFromRawRecords(rawRecords, headerMap);
    var poSkuCount = Object.keys(buildPoSkuIndex(allRows)).length;
    if (allRows.length && !poSkuCount) {
      throw new Error(
        "PO " +
          allRows.length +
          "행 · SKU ID 0건 — 헤더 " +
          headerMap.cells.length +
          "열(CSV 열 밀림·SKU 빈값 확인)"
      );
    }
    return {
      rows: allRows,
      shrinkReceiveBySku: shrinkReceiveBySku,
      skuNameBySku: skuNameBySku,
      headerMap: headerMap,
      rawLines: totalLines,
      poSkuCount: poSkuCount,
      headerCols: headerMap.cells.length,
    };
  }

  function buildDirectPivotMatrixFromRows(rows) {
    var matrix = Object.create(null);
    var matrixPending = Object.create(null);
    var colSet = Object.create(null);
    var unknown = 0;
    var i, row, val, isPending;
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      if (!row.rowKey || !row.timeCol) {
        unknown++;
        continue;
      }
      val =
        Number(row.topSkuGap) ||
        Number(row.pivotQty) ||
        Number(row.remainQty) ||
        0;
      if (val <= 0) continue;
      isPending = row.source === "unload_pending_po";
      if (!matrix[row.rowKey]) matrix[row.rowKey] = Object.create(null);
      if (!matrix[row.rowKey][row.timeCol]) {
        matrix[row.rowKey][row.timeCol] = 0;
      }
      matrix[row.rowKey][row.timeCol] += val;
      if (isPending) {
        if (!matrixPending[row.rowKey]) {
          matrixPending[row.rowKey] = Object.create(null);
        }
        if (!matrixPending[row.rowKey][row.timeCol]) {
          matrixPending[row.rowKey][row.timeCol] = 0;
        }
        matrixPending[row.rowKey][row.timeCol] += val;
      }
      colSet[row.timeCol] = 1;
    }
    return {
      matrix: matrix,
      matrixPending: matrixPending,
      colSet: colSet,
      unknown: unknown,
    };
  }

  function directRowGapQty(row) {
    return (
      Number(row.topSkuGap) ||
      Number(row.pivotQty) ||
      Number(row.remainQty) ||
      0
    );
  }

  /**
   * 직납 피벗 셀 값 (RCRT 유닛 기준).
   * unitsForSku(sku) 가 숫자면 그 SKU 를 셀당 1번만 더하고, null 이면 그 행은 하차 미진열.
   * 레거시 PO대기(unload_pending_po) 행은 항상 하차 미진열.
   */
  function directPivotCellValue(rows, unitsForSku) {
    var total = 0;
    var seen = Object.create(null);
    var i, row, gap, key, u;
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      gap = directRowGapQty(row);
      if (gap <= 0) continue;
      key = normalizeDirectSkuJoinKey(row.skuSeq);
      u =
        key && row.source !== "unload_pending_po" ? unitsForSku(row.skuSeq) : null;
      if (u == null) {
        total += gap;
        continue;
      }
      if (seen[key]) continue;
      seen[key] = 1;
      total += Number(u) || 0;
    }
    return total;
  }

  /** 직납 행을 피벗 셀(rowKey·timeCol)별로 묶기 — 하차 미진열 > 0 인 행만 (피벗과 같은 기준) */
  function groupDirectRowsByCell(rows) {
    var groups = Object.create(null);
    var i, row, k;
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      if (!row.rowKey || !row.timeCol || directRowGapQty(row) <= 0) continue;
      k = row.rowKey + "\u0001" + row.timeCol;
      if (!groups[k]) {
        groups[k] = { rowKey: row.rowKey, timeCol: row.timeCol, rows: [] };
      }
      groups[k].rows.push(row);
    }
    return groups;
  }

  /**
   * SLA 전체 조회 때 — 직납 피벗 숫자를 하차 미진열 대신 SLA 파일 RCRT 유닛 합계로.
   * SLA 에 직납 RCRT 가 없는 SKU 행은 하차 미진열 그대로.
   */
  function applySlaRcrtUnitsToDirectBundle(bundle, slaLookup) {
    var ctx = bundle && bundle.stats && bundle.stats.drillCtx;
    if (!ctx || !ctx.allRows || !bundle.matrix || !slaLookup) return;
    var groups = groupDirectRowsByCell(ctx.allRows);
    var matrix = bundle.matrix;
    var total = 0;
    var k, g, v;
    for (k in groups) {
      g = groups[k];
      v = directPivotCellValue(g.rows, function (sku) {
        return slaRcrtUnitsForSku(slaLookup, sku);
      });
      if (!matrix[g.rowKey]) matrix[g.rowKey] = Object.create(null);
      matrix[g.rowKey][g.timeCol] = v;
      total += v;
    }
    ctx.matrix = matrix;
    ctx.matrixPending = bundle.stats.matrixPending || null;
    ctx.slaUnitsAt = new Date();
    if (bundle.summary) {
      bundle.summary += " · RCRT 유닛 " + Math.round(total).toLocaleString("en-US");
    }
  }

  function sortDirectPivotTimeCols(colSet, refYear) {
    var timeCols = Object.keys(colSet);
    timeCols.sort(function (a, b) {
      return parsePivotColSortKey(a, refYear).localeCompare(
        parsePivotColSortKey(b, refYear)
      );
    });
    if (colSet[PIVOT_COL_EMPTY]) timeCols.push(PIVOT_COL_EMPTY);
    return timeCols;
  }

  function directLinesForPivotCell(allRows, rowKey, colName) {
    var out = [];
    var i, row;
    if (rowKey === "__GRAND__") {
      for (i = 0; i < allRows.length; i++) {
        row = allRows[i];
        if (colName === "__TOTAL__" || row.timeCol === colName) {
          out.push(row);
        }
      }
      return out;
    }
    for (i = 0; i < allRows.length; i++) {
      row = allRows[i];
      if (row.rowKey !== rowKey) continue;
      if (colName === "__TOTAL__" || row.timeCol === colName) {
        out.push(row);
      }
    }
    return out;
  }

  function formatDrillQty(n) {
    var v = Number(n);
    if (!isFinite(v)) return "-";
    if (v === 0) return "0";
    return Math.round(v).toLocaleString("en-US");
  }

  function formatDirectDrillDate(d) {
    if (!d || isNaN(d.getTime())) return "-";
    return (
      pad2(d.getMonth() + 1) +
      "/" +
      pad2(d.getDate()) +
      " " +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes())
    );
  }

  var DIRECT_DRILL_LOC_COL = 3;
  var DIRECT_DRILL_UNITS_COL = 4;
  var DIRECT_DRILL_COLS = [
    {
      key: "vendor",
      label: "업체",
      thClass: "yna4-sla-pivot-drill-col-vendor",
      tdClass: "yna4-sla-pivot-drill-col-vendor",
    },
    {
      key: "sku",
      label: "SKU ID",
      thClass: "yna4-sla-pivot-drill-col-sku",
      tdClass: "yna4-sla-pivot-drill-col-sku",
    },
    {
      key: "name",
      label: "상품명",
      thClass: "yna4-sla-pivot-drill-name",
      tdClass: "yna4-sla-pivot-drill-name",
    },
    {
      key: "loc",
      label: "RCRT",
      title: "로케이션 (RCRT)",
      thClass: "yna4-sla-pivot-drill-loc",
      tdClass: "yna4-sla-pivot-drill-loc",
    },
    {
      key: "units",
      label: "유닛",
      title: "SLA 파일 quantity (RCRT 줄별 합계)",
      thClass: "yna4-sla-pivot-drill-units",
      tdClass: "yna4-sla-pivot-drill-units",
    },
    {
      key: "temp",
      label: "온도",
      thClass: "yna4-sla-pivot-drill-col-temp",
      tdClass: "yna4-sla-pivot-drill-col-temp",
    },
    {
      key: "unloadAt",
      label: "하차일시",
      thClass: "yna4-sla-pivot-drill-col-dt",
      tdClass: "yna4-sla-pivot-drill-col-dt",
    },
    {
      key: "slaAt",
      label: "SLA(+12h)",
      thClass: "yna4-sla-pivot-drill-col-dt",
      tdClass: "yna4-sla-pivot-drill-col-dt",
    },
  ];

  function fillDirectDrillUnitsCell(td, entries) {
    td.className = "yna4-sla-pivot-drill-units";
    td.textContent = "";
    if (!entries || !entries.length) {
      td.textContent = "-";
      return;
    }
    var li;
    for (li = 0; li < entries.length; li++) {
      if (li) td.appendChild(document.createElement("br"));
      var line = document.createElement("span");
      line.className = "yna4-sla-pivot-drill-units-line";
      line.textContent =
        entries[li].qty != null && isFinite(entries[li].qty)
          ? formatDrillQty(entries[li].qty)
          : "-";
      td.appendChild(line);
    }
  }

  function fillDirectDrillLocationCell(td, locs) {
    td.className = "yna4-sla-pivot-drill-loc";
    td.textContent = "";
    td.removeAttribute("title");
    if (!locs || !locs.length) {
      td.textContent = "-";
      return;
    }
    td.title = locs.join("\n");
    var li;
    for (li = 0; li < locs.length; li++) {
      if (li) td.appendChild(document.createElement("br"));
      var line = document.createElement("span");
      line.className = "yna4-sla-pivot-drill-loc-line";
      line.textContent = locs[li];
      td.appendChild(line);
    }
  }

  /** SLA 에 없는 SKU — SKU 로 inventory 실시간 조회 { ok, entries } · 요청 뒤 50ms 쉼 */
  async function fetchDirectDrillLiveStock(bridge, sku) {
    var result = await bridge.rcrtLiveForSku(sku);
    await sleep(DIRECT_DRILL_LIVE_GAP_MS);
    return result;
  }

  /**
   * 로케이션 조회 결과에서 이 SKU 수량 — 응답에 SKU ID 가 있고 SLA skuid 를 알면 그 SKU 줄만,
   * 아니면 로케이션 전체 수량
   */
  function directDrillSkuQtyAtLoc(res, entry) {
    var sid = normalizeShrinkInternalSkuKey(entry && entry.skuId);
    if (sid && res.hasSkuIds && res.qtyBySku) {
      return Number(res.qtyBySku[sid]) || 0;
    }
    return Number(res.qty) || 0;
  }

  /**
   * SLA RCRT 를 하나씩 로케이션 바코드로 재고조회(SKU 조건 없음).
   * 그 SKU 재고가 남은 RCRT 만 남기고 유닛은 그 SKU 수량.
   * 하나라도 조회 실패면 { ok:false } — SLA 값 그대로 + 조회 실패 표시.
   * 로그인 풀림이면 { ok:false, login:true }
   */
  async function checkDirectDrillSlaLocs(bridge, slaEntries, aliveFn) {
    var out = [];
    var i, res, q;
    for (i = 0; i < slaEntries.length; i++) {
      if (stopRequested || !aliveFn()) return null;
      try {
        res = await bridge.locationStock(slaEntries[i].loc);
      } catch (eLoc) {
        res = null;
      }
      await sleep(DIRECT_DRILL_LIVE_GAP_MS);
      if (!res || !res.ok) {
        return { ok: false, login: !!(res && res.login), entries: slaEntries };
      }
      q = directDrillSkuQtyAtLoc(res, slaEntries[i]);
      if (q > 0) out.push({ loc: slaEntries[i].loc, qty: q });
    }
    return { ok: true, login: false, entries: out };
  }

  function markDirectDrillLookupFailed(td, unitsTd, tip) {
    tip = tip || "inventory 조회 실패 — SLA 파일 값";
    td.classList.add("yna4-sla-pivot-drill-loc--failed");
    td.title = tip;
    if (unitsTd) {
      unitsTd.classList.add("yna4-sla-pivot-drill-loc--failed");
      unitsTd.title = tip;
    }
  }

  /** 로그인 풀림 — 예전 SLA 값 대신 RCRT 칸에 "로그인 필요" */
  function markDirectDrillLoginNeeded(td, unitsTd) {
    fillDirectDrillLocationCell(td, []);
    td.textContent = "로그인 필요";
    if (unitsTd) fillDirectDrillUnitsCell(unitsTd, []);
    markDirectDrillLookupFailed(
      td,
      unitsTd,
      "WMS(inventory) 로그인이 풀렸어요 — 다시 로그인한 뒤 드릴을 다시 여세요"
    );
  }

  /**
   * 드릴 RCRT 조회 결과. onDone(results) — results[i] = { units, failed }
   * units: SLA RCRT 의 지금 SKU 재고 합계 (SLA 에 없는 SKU 는 null), failed: 조회 실패·로그인 풀림
   */
  async function loadDirectDrillRcrtLocations(itemLines, tbody, onDone) {
    var bridge = window.__YAN4_UNLOAD_GAP_BRIDGE__;
    var hasLive = !!(
      bridge &&
      typeof bridge.rcrtLiveForSku === "function" &&
      typeof bridge.locationStock === "function"
    );
    var slaLookup = lastShrinkSlaLookup;
    if (!tbody || !itemLines || !itemLines.length) return;
    var next = 0;
    var workers = Math.min(
      DIRECT_DRILL_RCRT_CONCURRENCY,
      itemLines.length
    );
    var wi;
    // 한 번 로그인 풀림이 확인되면 남은 행은 요청 없이 "로그인 필요"
    var loginLost = false;
    var results = new Array(itemLines.length);
    var FAILED = { units: null, failed: true };

    async function fillOne(mi) {
      var tr = tbody.children[mi];
      if (!tr || tr.children.length <= DIRECT_DRILL_LOC_COL) return;
      var td = tr.children[DIRECT_DRILL_LOC_COL];
      var sku = String(itemLines[mi].skuSeq || "").trim();
      if (!sku) {
        td.textContent = "-";
        results[mi] = { units: null, failed: false };
        return;
      }
      var unitsTd =
        tr.children.length > DIRECT_DRILL_UNITS_COL
          ? tr.children[DIRECT_DRILL_UNITS_COL]
          : null;
      function paint(entries) {
        fillDirectDrillLocationCell(
          td,
          entries.map(function (e) {
            return e.loc;
          })
        );
        if (unitsTd) fillDirectDrillUnitsCell(unitsTd, entries);
      }
      function alive() {
        return tbody.isConnected;
      }
      // RCRT 목록은 SLA 파일 FULLNAME → 로케이션 바코드로 실시간 재고조회 (비었으면 숨김)
      var slaEntries = slaDirectLocEntriesForSku(slaLookup, sku);
      // SLA 에 없는 SKU 는 피벗에서 하차 미진열 그대로 — 조회 결과와 상관없음
      if (!slaEntries.length) results[mi] = { units: null, failed: false };
      if (!hasLive) {
        paint(slaEntries);
        if (slaEntries.length) results[mi] = FAILED;
        return;
      }
      if (loginLost) {
        markDirectDrillLoginNeeded(td, unitsTd);
        if (slaEntries.length) results[mi] = FAILED;
        return;
      }
      td.textContent = "RCRT 조회…";
      if (slaEntries.length) {
        var checked = await checkDirectDrillSlaLocs(bridge, slaEntries, alive);
        if (!checked || !alive()) return;
        if (checked.login) {
          loginLost = true;
          markDirectDrillLoginNeeded(td, unitsTd);
          results[mi] = FAILED;
          return;
        }
        paint(checked.entries);
        if (!checked.ok) {
          markDirectDrillLookupFailed(td, unitsTd);
          results[mi] = FAILED;
          return;
        }
        var liveUnits = 0;
        var ei;
        for (ei = 0; ei < checked.entries.length; ei++) {
          liveUnits += Number(checked.entries[ei].qty) || 0;
        }
        results[mi] = { units: liveUnits, failed: false };
        return;
      }
      // SLA 파일에 없는 SKU — SKU 로 inventory 조회해서 재고 있는 RCRT
      var live = null;
      try {
        live = await fetchDirectDrillLiveStock(bridge, sku);
      } catch (eRcrt) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 Direct SLA RCRT]", sku, eRcrt);
        }
      }
      if (!alive()) return;
      if (live && live.login) {
        loginLost = true;
        markDirectDrillLoginNeeded(td, unitsTd);
        return;
      }
      if (!live || !live.ok) {
        paint([]);
        td.textContent = "조회 실패";
        markDirectDrillLookupFailed(td, unitsTd);
        return;
      }
      paint(
        live.entries.filter(function (e) {
          return e.qty == null || e.qty > 0;
        })
      );
    }

    async function worker() {
      var mi;
      while (true) {
        if (stopRequested || !tbody.isConnected) return;
        mi = next++;
        if (mi >= itemLines.length) return;
        await fillOne(mi);
      }
    }

    var jobs = [];
    for (wi = 0; wi < workers; wi++) {
      jobs.push(worker());
    }
    await Promise.all(jobs);
    if (typeof onDone === "function" && tbody.isConnected && !stopRequested) {
      onDone(results);
    }
  }

  function cssAttrValue(v) {
    return String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function parsePivotCellNum(td) {
    return Number(String((td && td.textContent) || "").replace(/[^\d.\-]/g, "")) || 0;
  }

  /**
   * 드릴 끝난 뒤 — 드릴에 나온 셀의 직납 피벗 값을 RCRT 실시간 유닛으로 다시 계산.
   * 셀 안에 조회 실패·로그인 풀림 행이 하나라도 있으면 그 셀은 그대로.
   * 행 합계·총합계도 같은 차이만큼 고침. 반환: { cells, total, skipped }
   */
  function applyDirectDrillLiveToPivot(drillCtx, itemLines, results, anchorEl) {
    var out = { cells: 0, total: 0, skipped: 0 };
    if (!drillCtx || !drillCtx.allRows || !drillCtx.matrix) return out;
    var liveBySku = Object.create(null);
    var failedSku = Object.create(null);
    var cellKeys = Object.create(null);
    var i, line, r, key;
    for (i = 0; i < itemLines.length; i++) {
      line = itemLines[i];
      r = results[i] || { units: null, failed: true };
      key = normalizeDirectSkuJoinKey(line.skuSeq);
      if (r.failed) {
        if (key) failedSku[key] = 1;
      } else if (r.units != null && key) {
        liveBySku[key] = r.units;
      }
      if (line.rowKey && line.timeCol) {
        cellKeys[line.rowKey + "\u0001" + line.timeCol] = {
          rowKey: line.rowKey,
          timeCol: line.timeCol,
        };
      }
    }
    var wrap = anchorEl && anchorEl.closest
      ? anchorEl.closest(".yna4-sla-pivot-wrap")
      : null;
    var matrix = drillCtx.matrix;
    var pending = drillCtx.matrixPending;
    var now = new Date();
    var stamp = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
    var ck, cell, rows, hasFail, ri, rk, oldVal, newVal, delta;
    for (ck in cellKeys) {
      cell = cellKeys[ck];
      if (
        pending &&
        pending[cell.rowKey] &&
        Number(pending[cell.rowKey][cell.timeCol]) > 0
      ) {
        out.skipped++;
        continue;
      }
      rows = directLinesForPivotCell(drillCtx.allRows, cell.rowKey, cell.timeCol);
      hasFail = false;
      for (ri = 0; ri < rows.length; ri++) {
        rk = normalizeDirectSkuJoinKey(rows[ri].skuSeq);
        if (rk && failedSku[rk]) {
          hasFail = true;
          break;
        }
      }
      if (hasFail) {
        out.skipped++;
        continue;
      }
      newVal = directPivotCellValue(rows, function (sku) {
        var k = normalizeDirectSkuJoinKey(sku);
        return k && liveBySku[k] !== undefined ? liveBySku[k] : null;
      });
      if (!matrix[cell.rowKey]) matrix[cell.rowKey] = Object.create(null);
      oldVal = Number(matrix[cell.rowKey][cell.timeCol]) || 0;
      matrix[cell.rowKey][cell.timeCol] = newVal;
      out.cells++;
      out.total += newVal;
      delta = newVal - oldVal;
      if (wrap) updateDirectPivotCellDom(wrap, matrix, cell, oldVal, newVal, delta, stamp);
    }
    return out;
  }

  function updateDirectPivotCellDom(wrap, matrix, cell, oldVal, newVal, delta, stamp) {
    var tr = wrap.querySelector(
      'tr[data-pivot-row-key="' + cssAttrValue(cell.rowKey) + '"]'
    );
    if (!tr) return;
    var td = tr.querySelector(
      'td[data-pivot-col="' + cssAttrValue(cell.timeCol) + '"]'
    );
    if (td) {
      td.textContent = formatPivotNum(newVal);
      td.classList.add("yna4-sla-pivot-num--live");
      td.title =
        "RCRT 실시간 반영 " +
        stamp +
        " (직전 " +
        formatDrillQty(oldVal) +
        ") · 더블클릭: SLA 상세";
    }
    var rowTotal = tr.querySelector('td[data-pivot-col="__TOTAL__"]');
    if (rowTotal) {
      var rowSum = 0;
      var c;
      for (c in matrix[cell.rowKey]) {
        rowSum += Number(matrix[cell.rowKey][c]) || 0;
      }
      rowTotal.textContent = formatPivotNum(rowSum);
    }
    if (!delta) return;
    var grand = wrap.querySelector('tr[data-pivot-row-key="__GRAND__"]');
    if (!grand) return;
    var gCol = grand.querySelector(
      'td[data-pivot-col="' + cssAttrValue(cell.timeCol) + '"]'
    );
    if (gCol) gCol.textContent = formatPivotNum(parsePivotCellNum(gCol) + delta);
    var gTot = grand.querySelector('td[data-pivot-col="__TOTAL__"]');
    if (gTot) gTot.textContent = formatPivotNum(parsePivotCellNum(gTot) + delta);
  }

  async function buildDirectDrillItemLines(unloadMatches, drillCtx) {
    var out = [];
    var ui, u, line, gapQty;
    for (ui = 0; ui < unloadMatches.length; ui++) {
      if (stopRequested) break;
      u = unloadMatches[ui];
      gapQty = Number(u.topSkuGap) || Number(u.pivotQty) || 0;
      if (gapQty <= 0 || !u.skuSeq) continue;
      line = {
        unloadIbc: u.unloadIbc || "",
        skuSeq: u.skuSeq,
        skuName: String(u.skuName || "").trim(),
        skuStatus: String(u.skuStatus || "").trim(),
        topSkuGap: gapQty,
        recv: Number(u.recv) || 0,
        disp: Number(u.disp) || 0,
        errQty: Number(u.errQty) || 0,
        vendorName: u.vendorName || "",
        temperature: u.temperature || "",
        purchaseOrderSeq: String(u.purchaseOrderSeq || "").trim(),
        slaBaseAt: u.slaBaseAt,
        slaAt: u.slaAt,
        source: u.source || "po",
        rowKey: u.rowKey || "",
        timeCol: u.timeCol || "",
      };
      out.push(line);
    }
    out.sort(function (a, b) {
      var ta = a.slaAt ? a.slaAt.getTime() : 0;
      var tb = b.slaAt ? b.slaAt.getTime() : 0;
      if (ta !== tb) return ta - tb;
      var ibc = String(a.unloadIbc || "").localeCompare(String(b.unloadIbc || ""));
      if (ibc) return ibc;
      return (Number(b.topSkuGap) || 0) - (Number(a.topSkuGap) || 0);
    });
    return out;
  }

  function directDrillCellValue(item, key) {
    switch (key) {
      case "sku":
        return item.skuSeq || "-";
      case "name":
        return item.skuName || "-";
      case "vendor":
        return item.vendorName || "";
      case "temp":
        return item.temperature || "";
      case "unloadAt":
        return formatDirectDrillDate(item.slaBaseAt);
      case "slaAt":
        return formatDirectDrillDate(item.slaAt);
      default:
        return "";
    }
  }

  function buildDirectDrillColgroup(table) {
    var cg = document.createElement("colgroup");
    var i, colDef, colEl;
    for (i = 0; i < DIRECT_DRILL_COLS.length; i++) {
      colDef = DIRECT_DRILL_COLS[i];
      colEl = document.createElement("col");
      if (colDef.tdClass) colEl.className = colDef.tdClass;
      cg.appendChild(colEl);
    }
    table.appendChild(cg);
  }

  function createDirectDrillRow(item, shrinkMaps) {
    var tr = document.createElement("tr");
    var ci, colDef, td, val;
    if (isDirectDrillLineShrinkTarget(item, shrinkMaps)) {
      tr.classList.add("yna4-sla-pivot-drill-tr--shrink");
    }
    for (ci = 0; ci < DIRECT_DRILL_COLS.length; ci++) {
      colDef = DIRECT_DRILL_COLS[ci];
      td = document.createElement("td");
      if (colDef.tdClass) td.className = colDef.tdClass;
      if (colDef.key === "loc") {
        td.textContent = item.skuSeq ? "RCRT 조회…" : "-";
      } else if (colDef.key === "units") {
        td.textContent = "-";
      } else if (colDef.key === "name") {
        val = directDrillCellValue(item, colDef.key);
        td.textContent = val || "-";
        if (val && val !== "-") td.title = val;
      } else {
        td.textContent = directDrillCellValue(item, colDef.key);
      }
      tr.appendChild(td);
    }
    return tr;
  }

  function renderDirectDrillTableBody(tbody, itemLines, shrinkMaps) {
    var mi;
    shrinkMaps = shrinkMaps || lastShrinkSkuMaps;
    for (mi = 0; mi < itemLines.length; mi++) {
      tbody.appendChild(createDirectDrillRow(itemLines[mi], shrinkMaps));
    }
  }

  function renderDirectDrillPanel(
    drillHost,
    drillCtx,
    rowKey,
    colName,
    rowLabel,
    colLabel
  ) {
    var unloadMatches = directLinesForPivotCell(
      drillCtx.allRows,
      rowKey,
      colName
    );
    unloadMatches.sort(function (a, b) {
      var ta = a.slaAt ? a.slaAt.getTime() : 0;
      var tb = b.slaAt ? b.slaAt.getTime() : 0;
      if (ta !== tb) return ta - tb;
      return String(a.unloadIbc || "").localeCompare(String(b.unloadIbc || ""));
    });
    var wrap = document.createElement("div");
    wrap.className = "yna4-sla-pivot-drill";
    var head = document.createElement("div");
    head.className = "yna4-sla-pivot-drill-head";
    fillDrillHeadTitle(head, rowLabel + " · " + colLabel + " · 품목 조회…");
    mountDrillHeadTeamsCopy(head, wrap, { showEgg: false });
    wrap.appendChild(head);
    if (!unloadMatches.length) {
      var empty = document.createElement("p");
      empty.className = "yna4-sla-pivot-drill-empty";
      empty.textContent = "해당 셀에 하차 행이 없습니다.";
      wrap.appendChild(empty);
      drillHost.appendChild(wrap);
      return;
    }
    var status = document.createElement("p");
    status.className = "yna4-sla-pivot-drill-empty";
    status.textContent = "품목 표시 중…";
    wrap.appendChild(status);
    drillHost.appendChild(wrap);

    function alive() {
      return !!wrap.isConnected;
    }

    slaDrillAfterPaint()
      .then(function () {
        if (!alive()) return null;
        return buildDirectDrillItemLines(unloadMatches, drillCtx);
      })
      .then(function (itemLines) {
        if (!alive() || !itemLines) return null;
        var gapSum = 0;
        var ibcSeen = Object.create(null);
        var ibcCount = 0;
        var wi;
        for (wi = 0; wi < itemLines.length; wi++) {
          gapSum += Number(itemLines[wi].topSkuGap) || 0;
        }
        for (wi = 0; wi < unloadMatches.length; wi++) {
          var ibcKey = String(unloadMatches[wi].unloadIbc || "").trim();
          if (!ibcKey || ibcSeen[ibcKey]) continue;
          ibcSeen[ibcKey] = 1;
          ibcCount++;
        }
        var headText =
          rowLabel +
          " · " +
          colLabel +
          " · 하차 " +
          ibcCount +
          " · 품목 " +
          itemLines.length +
          " · 미진열 " +
          Math.round(gapSum).toLocaleString("en-US") +
          " (IBC·하차)";
        fillDrillHeadTitle(head, headText);
        if (!itemLines.length) {
          if (status.parentNode) status.parentNode.removeChild(status);
          var noItems = document.createElement("p");
          noItems.className = "yna4-sla-pivot-drill-empty";
          noItems.textContent = "미진열 SKU가 없습니다.";
          wrap.appendChild(noItems);
          return null;
        }
        var scroll = document.createElement("div");
        scroll.className = "yna4-sla-pivot-drill-scroll";
        var table = document.createElement("table");
        table.className =
          "yna4-sla-pivot-drill-table yna4-sla-pivot-drill-table--direct";
        buildDirectDrillColgroup(table);
        var thead = document.createElement("thead");
        var trH = document.createElement("tr");
        var ci, colDef, th;
        for (ci = 0; ci < DIRECT_DRILL_COLS.length; ci++) {
          colDef = DIRECT_DRILL_COLS[ci];
          th = document.createElement("th");
          th.textContent = colDef.label;
          if (colDef.title) th.title = colDef.title;
          if (colDef.thClass) th.className = colDef.thClass;
          trH.appendChild(th);
        }
        thead.appendChild(trH);
        table.appendChild(thead);
        var tbody = document.createElement("tbody");
        table.appendChild(tbody);
        scroll.appendChild(table);
        wrap.appendChild(scroll);
        var shrinkMaps = drillShrinkSkuMaps(drillCtx);
        status.textContent =
          "표 표시 중… 0 / " + itemLines.length.toLocaleString("en-US");
        return appendDrillRowsChunked({
          tbody: tbody,
          lines: itemLines,
          chunkSize: DRILL_DOM_CHUNK_SIZE,
          aliveFn: alive,
          createRow: function (item) {
            return createDirectDrillRow(item, shrinkMaps);
          },
          onProgress: function (done, total) {
            if (!alive() || !status.parentNode) return;
            status.textContent =
              "표 표시 중… " +
              done.toLocaleString("en-US") +
              " / " +
              total.toLocaleString("en-US");
          },
        }).then(function (painted) {
          if (!alive() || !painted) return null;
          if (status.parentNode) status.parentNode.removeChild(status);
          if (!shrinkMaps) {
            ensureDrillShrinkMapsAsync(drillCtx, function (maps) {
              if (!tbody.isConnected) return;
              var ri, rowEl;
              for (ri = 0; ri < tbody.rows.length; ri++) {
                rowEl = tbody.rows[ri];
                if (isDirectDrillLineShrinkTarget(itemLines[ri], maps)) {
                  rowEl.classList.add("yna4-sla-pivot-drill-tr--shrink");
                }
              }
            });
          }
          return loadDirectDrillRcrtLocations(itemLines, tbody, function (results) {
            // 드릴 끝 — 피벗 셀을 RCRT 실시간 유닛으로 (실패 셀은 그대로)
            var applied = applyDirectDrillLiveToPivot(
              drillCtx,
              itemLines,
              results,
              wrap
            );
            if (!alive()) return;
            var note = "";
            if (applied.cells) {
              note +=
                " · RCRT 실시간 " +
                Math.round(applied.total).toLocaleString("en-US");
            }
            if (applied.skipped) {
              note += " · 조회 실패 " + applied.skipped + "칸 피벗 미반영";
            }
            if (note) fillDrillHeadTitle(head, headText + note);
          });
        });
      })
      .catch(function (eDrill) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 Direct SLA drill]", eDrill);
        }
        if (!alive()) return;
        if (status.parentNode) {
          status.textContent = "품목 조회 실패";
          status.className =
            "yna4-sla-pivot-drill-empty yna4-sla-pivot-drill-empty--err";
        }
      });
  }

  function formatPipelineTimestamp(d) {
    var loadedAt = d || new Date();
    return (
      loadedAt.getFullYear() +
      "-" +
      pad2(loadedAt.getMonth() + 1) +
      "-" +
      pad2(loadedAt.getDate()) +
      " " +
      pad2(loadedAt.getHours()) +
      ":" +
      pad2(loadedAt.getMinutes())
    );
  }

  async function collectDirectPivotBundle(statusEl, phaseLabel, pipelineOpts) {
    var prefix = phaseLabel ? phaseLabel + " " : "";
    var dr = defaultDirectDateRange();
    var ts = formatPipelineTimestamp();
    var unloadRows = await fetchUnloadSlaRowsForDirect(
      statusEl,
      dr.endYmd,
      prefix + "직납 하차내역 조회…"
    );
    if (stopRequested) return { stopped: true };
    if (!unloadRows.length) {
      return {
        empty: true,
        summary: "하차내역 없음",
        message:
          "미진열 하차내역이 없습니다. (inbound 하차 목록·당일 조회 확인)",
      };
    }

    var sharedPoRows =
      pipelineOpts &&
      pipelineOpts.poRows &&
      pipelineOpts.poRows.length
        ? pipelineOpts.poRows
        : null;
    var poCtx = sharedPoRows
      ? buildDirectPoCtxFromPoRows(sharedPoRows)
      : null;
    if (!poCtx) {
      statusEl.textContent = prefix + "PO Management (직납 온도)…";
      try {
        var poPack = await fetchPoSkuLinesAll(statusEl, dr);
        if (stopRequested) return { stopped: true };
        poCtx = buildDirectPoCtxFromPoRows(poPack.rows);
      } catch (ePo) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 Direct SLA PO]", ePo);
        }
      }
    }

    statusEl.textContent = prefix + "하차별 미진열 SKU·온도…";
    var builtRows = await buildDirectRowsFromUnload(
      unloadRows,
      statusEl,
      poCtx
    );
    if (stopRequested) return { stopped: true };
    var allRows = builtRows.rows;
    if (!allRows.length) {
      return {
        empty: true,
        summary: "SKU 매칭 없음",
        message:
          "하차 " +
          unloadRows.length +
          "건 · 미진열 SKU 0 — SKU없음 " +
          builtRows.skippedNoSku +
          " · PO메타없음 " +
          (builtRows.skippedNoMeta || 0) +
          " · 온도없음 " +
          builtRows.skippedNoTemp +
          (builtRows.tempMissSamples && builtRows.tempMissSamples.length
            ? " · 예:" + builtRows.tempMissSamples.join(", ")
            : "") +
          " (IBC·inventory SKU 보관온도 확인)",
      };
    }

    statusEl.textContent = prefix + "Direct 피벗 집계…";
    var refYear = parseYmd(dr.endYmd);
    refYear = refYear ? refYear.getFullYear() : new Date().getFullYear();
    var built = buildDirectPivotMatrixFromRows(allRows);
    var timeCols = sortDirectPivotTimeCols(built.colSet, refYear);
    var remainTotal = 0;
    var ri;
    for (ri = 0; ri < allRows.length; ri++) {
      remainTotal +=
        Number(allRows[ri].topSkuGap) ||
        Number(allRows[ri].pivotQty) ||
        0;
    }
    var unloadRemainTotal = Number(builtRows.unloadRemainTotal) || 0;
    var summaryRemain =
      " · 미진열 " + Math.round(remainTotal).toLocaleString("en-US");
    if (
      unloadRemainTotal > 0 &&
      Math.round(unloadRemainTotal) !== Math.round(remainTotal)
    ) {
      summaryRemain +=
        " (하차잔량 " +
        Math.round(unloadRemainTotal).toLocaleString("en-US") +
        ")";
      if (builtRows.skippedQty > 0) {
        summaryRemain +=
          " · 미반영 " +
          Math.round(builtRows.skippedQty).toLocaleString("en-US");
      }
    }
    return {
      matrix: built.matrix,
      timeCols: timeCols,
      stats: {
        rowDefs: DIRECT_ROW_DEFS,
        cornerTitle: "Direct SLA",
        refYear: refYear,
        loadedAt: ts,
        matrixPending: built.matrixPending,
        drillCtx: {
          mode: "direct",
          allRows: allRows,
          unloadRows: unloadRows,
          shrinkSkuMaps: lastShrinkSkuMaps,
        },
      },
      summary:
        "직납 SKU " +
        allRows.length +
        "/" +
        unloadRows.length +
        "하차" +
        (builtRows.skippedNoSku
          ? " · SKU없음 " + builtRows.skippedNoSku
          : "") +
        (builtRows.skippedNoMeta
          ? " · PO메타없음 " + builtRows.skippedNoMeta
          : "") +
        (builtRows.skippedNoTemp
          ? " · 온도없음 " + builtRows.skippedNoTemp
          : "") +
        (builtRows.dupPo
          ? " · 중복하차 발주 " + builtRows.dupPo + "건 제외"
          : "") +
        summaryRemain +
        " · " +
        operationalDayLabel(dr.operationalYmd || dr.endYmd),
    };
  }

  function movingTempLabelFromRowMeta(rowMeta) {
    if (!rowMeta || rowMeta.key === "UNKNOWN") return "";
    if (rowMeta.key === "FROZEN") return "FROZEN";
    if (rowMeta.key.indexOf("CHILLED") === 0) return "CHILLED";
    if (rowMeta.key.indexOf("AMBIENT") === 0) return "AMBIENT";
    if (rowMeta.key === "ROCKETMART") return "RocketMart";
    return "";
  }

  async function resolveMovingClusterTempZone(cluster, slaLookup, dr) {
    var sample = cluster && cluster.sample;
    if (!sample) return "이동중";
    var items = cluster.items && cluster.items.length ? cluster.items : [sample];
    var rec, ii, it;
    var label = "";
    var diag = [];
    var slaHit = 0;
    for (ii = 0; ii < items.length; ii++) {
      it = items[ii];
      rec = pickSlaRecordForGc(slaLookup, it.gc);
      if (!rec) continue;
      slaHit++;
      label = movingTempLabelFromRowMeta(
        pivotRowKeyFromSlaRecord(rec, it.priority1, it.priority2)
      );
      if (label) return label;
    }
    diag.push(
      "SLA: CT " + items.length + "개 중 " + slaHit + "개 기록" +
        (slaHit ? "(온도 판정불가)" : " 없음")
    );

    label = await resolveMovingTempByVehicle(cluster, dr, diag);
    if (label) return label;

    var enrich = await enrichGcZone(
      sample.gc,
      dr,
      wmsSearchOptsForItem(sample),
      sample
    );
    if (enrich && enrich.storageLabel) {
      label = movingTempLabelFromRowMeta(
        pivotRowKeyFromStorage(
          enrich.storageLabel,
          sample.priority1,
          sample.priority2
        )
      );
      if (label) return label;
      diag.push("GC조회(" + sample.gc + "): 보관온도 '" + enrich.storageLabel + "' 판정불가");
    } else {
      diag.push(
        "GC조회(" + sample.gc + "): " +
          (enrich && enrich.skuId ? "SKU " + enrich.skuId + " 보관온도 못 읽음" : "SKU ID 못 찾음")
      );
    }

    cluster.tempDiag = diag.join("\n");
    return "이동중";
  }

  function movingDeadlineAt(loadAt) {
    if (!loadAt || isNaN(loadAt.getTime())) return null;
    return new Date(loadAt.getTime() + MOVING_DEADLINE_HOURS * 3600000);
  }

  function formatMovingTime(d) {
    if (!d || isNaN(d.getTime())) return "-";
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function formatMovingQueryTimestamp(d) {
    if (!d || isNaN(d.getTime())) return "";
    return (
      d.getMonth() +
      1 +
      "/" +
      d.getDate() +
      " " +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes())
    );
  }

  function formatMovingRemainMs(ms) {
    if (!isFinite(ms)) return "-";
    if (ms <= 0) return "만료";
    var totalMin = Math.floor(ms / 60000);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    if (h > 0) return h + "H" + pad2(m) + "M";
    return m + "M";
  }

  function movingRemainClass(deadlineAt) {
    if (!deadlineAt || isNaN(deadlineAt.getTime())) return "";
    var ms = deadlineAt.getTime() - Date.now();
    if (ms <= 0) return " yna4-sla-moving-remain--expired";
    if (ms <= 3600000) return " yna4-sla-moving-remain--urgent";
    return "";
  }

  function movingLoadWithinMergeWindow(a, b) {
    if (!a || !b || isNaN(a.getTime()) || isNaN(b.getTime())) return false;
    return Math.abs(a.getTime() - b.getTime()) <= MOVING_LOAD_MERGE_MS;
  }

  function findMovingCluster(clusters, vehicleNo, loadAt) {
    var i, c, j;
    for (i = 0; i < clusters.length; i++) {
      c = clusters[i];
      if (c.vehicleNo !== vehicleNo) continue;
      for (j = 0; j < c.loadAts.length; j++) {
        if (movingLoadWithinMergeWindow(loadAt, c.loadAts[j])) return c;
      }
    }
    return null;
  }

  function movingClusterCtList(ctSet) {
    var list = Object.keys(ctSet || {});
    list.sort();
    return list;
  }

  function movingClusterTrackFromCenter(cluster, fromCenter) {
    var fc = normalizeCellText(fromCenter);
    if (!fc) return;
    if (!cluster.fromCenterSet) cluster.fromCenterSet = Object.create(null);
    cluster.fromCenterSet[fc] = 1;
  }

  function movingClusterFromCenterLabel(cluster) {
    var list = Object.keys(cluster.fromCenterSet || {});
    list.sort();
    return list.length ? list.join(", ") : "";
  }

  function finalizeMovingCluster(cluster) {
    var minLoad = cluster.loadAts[0];
    var i;
    for (i = 1; i < cluster.loadAts.length; i++) {
      if (cluster.loadAts[i].getTime() < minLoad.getTime()) {
        minLoad = cluster.loadAts[i];
      }
    }
    var ctList = movingClusterCtList(cluster.ctSet);
    return {
      loadAt: minLoad,
      vehicleNo: cluster.vehicleNo,
      fromCenter: movingClusterFromCenterLabel(cluster),
      tempZone: cluster.tempZone,
      tempDiag: cluster.tempDiag || "",
      deadlineAt: movingDeadlineAt(minLoad),
      ctCount: ctList.length,
      ctList: ctList,
      unitTotal: Math.round(Number(cluster.unitTotal) || 0),
    };
  }

  async function buildMovingPanelRows(allRows, slaLookup, dr, statusEl) {
    var clusters = [];
    var movingItems = [];
    var rows = [];
    var i, item, ct, cluster, row, ctTotal, unitGrandTotal, ci;
    ctTotal = 0;
    unitGrandTotal = 0;
    for (i = 0; i < allRows.length; i++) {
      item = allRows[i];
      if (!item || item.statusLabel !== "이동중") continue;
      if (isAdhocVehicle(item.vehicleNo)) continue;
      if (
        !item.vehicleNo ||
        !item.loadAt ||
        isNaN(item.loadAt.getTime())
      ) {
        continue;
      }
      movingItems.push(item);
    }
    movingItems.sort(function (a, b) {
      var va = String(a.vehicleNo || "").localeCompare(String(b.vehicleNo || ""));
      if (va !== 0) return va;
      return a.loadAt.getTime() - b.loadAt.getTime();
    });
    for (i = 0; i < movingItems.length; i++) {
      item = movingItems[i];
      ct = normalizeCtKey(item.ct);
      cluster = findMovingCluster(
        clusters,
        String(item.vehicleNo).trim(),
        item.loadAt
      );
      if (!cluster) {
        cluster = {
          vehicleNo: String(item.vehicleNo).trim(),
          tempZone: "",
          loadAts: [],
          ctSet: Object.create(null),
          fromCenterSet: Object.create(null),
          unitTotal: 0,
          sample: item,
          items: [],
          gcSet: Object.create(null),
        };
        clusters.push(cluster);
      }
      cluster.items.push(item);
      if (item.gc) cluster.gcSet[String(item.gc).trim().toUpperCase()] = 1;
      cluster.loadAts.push(item.loadAt);
      ct = normalizeCtKey(item.ct);
      if (ct) cluster.ctSet[ct] = 1;
      movingClusterTrackFromCenter(cluster, item.fromCenter);
      cluster.unitTotal += Number(item.qty) || 0;
    }
    for (ci = 0; ci < clusters.length; ci++) {
      if (stopRequested) break;
      cluster = clusters[ci];
      if (statusEl) {
        statusEl.textContent =
          "이동중 온도대 " +
          (ci + 1) +
          "/" +
          clusters.length +
          " · 차량 " +
          cluster.vehicleNo;
      }
      cluster.tempZone = await resolveMovingClusterTempZone(
        cluster,
        slaLookup,
        dr
      );
      if (ci + 1 < clusters.length) await sleep(NETWORK_DELAY_MS);
    }
    for (i = 0; i < clusters.length; i++) {
      row = finalizeMovingCluster(clusters[i]);
      ctTotal += row.ctCount;
      unitGrandTotal += row.unitTotal;
      rows.push(row);
    }
    rows.sort(function (a, b) {
      var ta = a.deadlineAt ? a.deadlineAt.getTime() : 9007199254740990;
      var tb = b.deadlineAt ? b.deadlineAt.getTime() : 9007199254740990;
      if (ta !== tb) return ta - tb;
      return String(a.vehicleNo || "").localeCompare(String(b.vehicleNo || ""));
    });
    return {
      rows: rows,
      ctTotal: ctTotal,
      unitTotal: unitGrandTotal,
      vehicleCount: rows.length,
      queriedAt: new Date(),
    };
  }

  var MOVING_PANEL_COLS = [
    {
      key: "fromCenter",
      label: "FROM FC",
      colClass: "yna4-sla-moving-col-from",
    },
    {
      key: "tempZone",
      label: "온도대",
      colClass: "yna4-sla-moving-col-temp",
    },
    {
      key: "vehicleNo",
      label: "차량번호",
      colClass: "yna4-sla-moving-col-vehicle",
    },
    {
      key: "loadAt",
      label: "상차시간",
      colClass: "yna4-sla-moving-col-load",
    },
    {
      key: "deadlineAt",
      label: "기한",
      colClass: "yna4-sla-moving-col-deadline",
    },
    {
      key: "remain",
      label: "남은시간",
      colClass: "yna4-sla-moving-col-remain",
    },
    {
      key: "ctCount",
      label: "CT",
      num: true,
      colClass: "yna4-sla-moving-col-ct",
    },
    {
      key: "unitTotal",
      label: "유닛수",
      num: true,
      colClass: "yna4-sla-moving-col-unit",
    },
  ];

  function buildMovingPanelColgroup(table) {
    var cg = document.createElement("colgroup");
    var i, colDef, colEl;
    for (i = 0; i < MOVING_PANEL_COLS.length; i++) {
      colDef = MOVING_PANEL_COLS[i];
      colEl = document.createElement("col");
      if (colDef.colClass) colEl.className = colDef.colClass;
      cg.appendChild(colEl);
    }
    table.appendChild(cg);
  }

  function movingPanelCellValue(row, key) {
    switch (key) {
      case "loadAt":
        return formatMovingTime(row.loadAt);
      case "vehicleNo":
        return row.vehicleNo || "-";
      case "fromCenter":
        return row.fromCenter || "-";
      case "tempZone":
        return row.tempZone || "-";
      case "deadlineAt":
        return formatMovingTime(row.deadlineAt);
      case "remain":
        if (!row.deadlineAt || isNaN(row.deadlineAt.getTime())) return "-";
        return formatMovingRemainMs(row.deadlineAt.getTime() - Date.now());
      case "ctCount":
        return String(row.ctCount || 0);
      case "unitTotal":
        return Math.round(Number(row.unitTotal) || 0).toLocaleString("en-US");
      default:
        return "";
    }
  }

  function renderMovingPanelPlaceholder(host, message, isErr) {
    if (!host) return;
    host.innerHTML =
      '<div class="yna4-sla-moving-wrap">' +
      '<h3 class="yna4-sla-moving-title">이동중</h3>' +
      '<p class="yna4-sla-moving-empty' +
      (isErr ? " yna4-sla-moving-empty--err" : "") +
      '">' +
      String(message || "") +
      "</p></div>";
  }

  function buildMovingCtDetailRow(ctList) {
    var detailTr = document.createElement("tr");
    var detailTd = document.createElement("td");
    var ctWrap = document.createElement("div");
    var cti, chip;
    detailTr.className = "yna4-sla-moving-detail";
    detailTd.colSpan = MOVING_PANEL_COLS.length;
    ctWrap.className = "yna4-sla-moving-ct-list";
    if (!ctList || !ctList.length) {
      ctWrap.textContent = "CT 없음";
    } else {
      for (cti = 0; cti < ctList.length; cti++) {
        chip = document.createElement("span");
        chip.className = "yna4-sla-moving-ct-chip";
        chip.textContent = ctList[cti];
        ctWrap.appendChild(chip);
      }
    }
    detailTd.appendChild(ctWrap);
    detailTr.appendChild(detailTd);
    return detailTr;
  }

  function toggleMovingPanelDetailRow(dataTr) {
    var detailTr = dataTr.nextElementSibling;
    if (
      !detailTr ||
      !detailTr.classList ||
      !detailTr.classList.contains("yna4-sla-moving-detail")
    ) {
      return;
    }
    var open = detailTr.classList.toggle("yna4-sla-moving-detail--open");
    dataTr.classList.toggle("yna4-sla-moving-row--open", open);
  }

  function copyMovingPanelForTeams(btn, title, rows) {
    var headers = [];
    var packRows = [];
    var styles = [];
    var aligns = [];
    var ci, ri, colDef, cells, rowAligns, hot;
    for (ci = 0; ci < MOVING_PANEL_COLS.length; ci++) {
      headers.push(MOVING_PANEL_COLS[ci].label);
    }
    for (ri = 0; ri < rows.length; ri++) {
      cells = [];
      rowAligns = [];
      for (ci = 0; ci < MOVING_PANEL_COLS.length; ci++) {
        colDef = MOVING_PANEL_COLS[ci];
        cells.push(movingPanelCellValue(rows[ri], colDef.key));
        rowAligns.push(colDef.num || colDef.key === "remain" ? "right" : "left");
      }
      hot = movingRemainClass(rows[ri].deadlineAt);
      packRows.push(cells);
      aligns.push(rowAligns);
      styles.push(hot ? { bg: "#fef2f2", color: "#b91c1c" } : null);
    }
    function flash(text) {
      btn.textContent = text;
      window.setTimeout(function () {
        btn.textContent = "팀즈";
      }, 1600);
    }
    if (!packRows.length) {
      flash("복사할 내용 없음");
      return;
    }
    var pack = { headers: headers, rows: packRows, styles: styles, aligns: aligns };
    slaCopyHtmlPlainToClipboard(
      buildSlaDrillTeamsHtml(title, pack),
      buildSlaDrillTeamsTsv(title, pack)
    ).then(function (ok) {
      flash(ok ? "복사됨" : "복사 실패");
    });
  }

  function renderMovingPanel(host, panel) {
    if (!host) return;
    host.textContent = "";
    var data = panel || { rows: [], ctTotal: 0, vehicleCount: 0 };
    var rows = data.rows || [];
    var wrap = document.createElement("section");
    wrap.className = "yna4-sla-moving-wrap";

    var head = document.createElement("h3");
    head.className = "yna4-sla-moving-title";
    head.textContent =
      "이동중 · " +
      rows.length +
      "대 · CT " +
      Math.round(data.ctTotal || 0).toLocaleString("en-US") +
      " · 유닛 " +
      Math.round(data.unitTotal || 0).toLocaleString("en-US") +
      (data.queriedAt
        ? " · 조회 " + formatMovingQueryTimestamp(data.queriedAt)
        : "");
    if (rows.length) {
      var titleText = head.textContent;
      var teamsBtn = document.createElement("button");
      teamsBtn.type = "button";
      teamsBtn.className = "yna4-sla-pivot-drill-teams-btn";
      teamsBtn.textContent = "팀즈";
      teamsBtn.title = "이동중 표를 팀즈에 붙여넣기";
      teamsBtn.setAttribute("data-html2canvas-ignore", "true");
      teamsBtn.style.marginLeft = "8px";
      teamsBtn.style.verticalAlign = "middle";
      teamsBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        copyMovingPanelForTeams(teamsBtn, titleText, rows);
      });
      head.appendChild(teamsBtn);
    }
    wrap.appendChild(head);

    if (!rows.length) {
      var empty = document.createElement("p");
      empty.className = "yna4-sla-moving-empty";
      empty.textContent =
        "차량·상차시간이 있는 이동중 데이터가 없습니다.";
      wrap.appendChild(empty);
      host.appendChild(wrap);
      return;
    }

    var scroll = document.createElement("div");
    scroll.className =
      "yna4-sla-moving-table-shell yna4-sla-moving-table-shell--excel";
    var table = document.createElement("table");
    table.className =
      "yna4-sla-moving-table yna4-sla-moving-table--excel";
    buildMovingPanelColgroup(table);

    var thead = document.createElement("thead");
    var trH = document.createElement("tr");
    var ci, colDef, th;
    for (ci = 0; ci < MOVING_PANEL_COLS.length; ci++) {
      colDef = MOVING_PANEL_COLS[ci];
      th = document.createElement("th");
      th.textContent = colDef.label;
      if (colDef.colClass) th.className = colDef.colClass;
      trH.appendChild(th);
    }
    thead.appendChild(trH);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    var ri, tr, td, detailTr;
    for (ri = 0; ri < rows.length; ri++) {
      tr = document.createElement("tr");
      tr.className =
        "yna4-sla-moving-row" +
        (ri % 2 ? " yna4-sla-moving-row--even" : " yna4-sla-moving-row--odd");
      tr.title = "더블클릭: CT 바코드";
      for (ci = 0; ci < MOVING_PANEL_COLS.length; ci++) {
        colDef = MOVING_PANEL_COLS[ci];
        td = document.createElement("td");
        if (colDef.colClass) td.className = colDef.colClass;
        if (colDef.num) {
          td.className =
            (colDef.colClass || "") + " yna4-sla-moving-num";
        }
        if (colDef.key === "remain") {
          td.className =
            (colDef.colClass || "") +
            " yna4-sla-moving-num yna4-sla-moving-remain" +
            movingRemainClass(rows[ri].deadlineAt);
        }
        td.textContent = movingPanelCellValue(rows[ri], colDef.key);
        if (colDef.key === "tempZone" && rows[ri].tempDiag) {
          td.title = rows[ri].tempDiag;
          td.style.cursor = "help";
          td.style.textDecoration = "underline dotted";
        }
        tr.appendChild(td);
      }
      tr.addEventListener("dblclick", function (ev) {
        ev.preventDefault();
        toggleMovingPanelDetailRow(ev.currentTarget);
      });
      detailTr = buildMovingCtDetailRow(rows[ri].ctList);
      tbody.appendChild(tr);
      tbody.appendChild(detailTr);
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    wrap.appendChild(scroll);
    host.appendChild(wrap);
  }

  function applyMovingPanel(host, transferBundle) {
    if (!host) return;
    if (!transferBundle || transferBundle.stopped) {
      host.textContent = "";
      return;
    }
    if (transferBundle.error) {
      renderMovingPanelPlaceholder(host, transferBundle.error, true);
      return;
    }
    if (transferBundle.empty) {
      renderMovingPanelPlaceholder(
        host,
        transferBundle.message || "이관 데이터 없음"
      );
      return;
    }
    renderMovingPanel(host, transferBundle.movingPanel);
  }

  async function collectMemoryPivotBundle(statusEl, phaseLabel) {
    var prefix = phaseLabel ? phaseLabel + " " : "";
    gcEnrichCache = Object.create(null);
    inventoryGcFallbackCache = Object.create(null);
    var dr = defaultDateRange();
    var ts = formatPipelineTimestamp();

    statusEl.textContent = prefix + "SharePoint SLA 다운로드…";
    var slaBuf = await fetchSharePointSlaBuffer();
    if (stopRequested) return { stopped: true };
    statusEl.textContent = prefix + "SLA 조회표 인덱싱…";
    var slaLookup = parseSlaFileLookup(slaBuf);
    lastShrinkSlaLookup = slaLookup;

    var allRows = await fetchTransferRowsAll(statusEl, dr);
    if (stopRequested) return { stopped: true };
    if (!allRows.length) {
      return {
        empty: true,
        summary: "WMS 데이터 없음",
        message: "이관 엑셀 조회 결과가 없습니다.",
      };
    }

    var gcSeen = Object.create(null);
    var uniqueGc = 0;
    var i, row;
    for (i = 0; i < allRows.length; i++) {
      row = allRows[i];
      if (!gcSeen[row.gc]) {
        gcSeen[row.gc] = 1;
        uniqueGc++;
      }
    }

    var ctCache = await buildCtStorageCache(allRows, slaLookup, dr, statusEl);
    if (stopRequested) return { stopped: true };

    statusEl.textContent = prefix + "피벗 집계…";
    var refYear = parseYmd(dr.endYmd);
    refYear = refYear ? refYear.getFullYear() : new Date().getFullYear();
    var pivotQueryAt = new Date();
    var built = buildPivotMatrixFromRows(allRows, function (item) {
      return resolvePivotPlacement(
        item,
        slaLookup,
        ctCache.ctStorage,
        pivotQueryAt
      );
    });
    var timeCols = sortPivotTimeCols(built.colSet, refYear);

    var toteStowLines = slaLookup.rcrtAgingLines || [];
    var toteQtySum = 0;
    var totePlaced = 0;
    var toteTempMiss = { miss: 0, missQty: 0 };
    var ti, toteQty;
    statusEl.textContent = prefix + "SLA Aging…";
    for (ti = 0; ti < toteStowLines.length; ti++) {
      toteQty = Number(toteStowLines[ti].moveQuantity) || 0;
      if (!toteStowLines[ti].rowKey) {
        toteTempMiss.miss += 1;
        toteTempMiss.missQty += toteQty;
      } else {
        totePlaced += 1;
        toteQtySum += toteQty;
      }
    }
    var toteMatrixPack = buildToteStowPivotFromRows(toteStowLines);
    built.matrix = mergePivotMatrix(built.matrix, toteMatrixPack.matrix);
    timeCols = mergePivotTimeColSet(timeCols, toteMatrixPack.colSet, refYear);
    var toteSummary =
      "Aging " +
      totePlaced +
      "/" +
      Math.round(toteQtySum).toLocaleString("en-US");
    if (toteTempMiss.miss > 0) {
      toteSummary +=
        " · 온도미상 " +
        toteTempMiss.miss +
        "/" +
        Math.round(toteTempMiss.missQty).toLocaleString("en-US");
    }

    statusEl.textContent = prefix + "이동중 패널…";
    var movingPanel = await buildMovingPanelRows(
      allRows,
      slaLookup,
      dr,
      statusEl
    );
    if (stopRequested) return { stopped: true };
    return {
      matrix: built.matrix,
      timeCols: timeCols,
      stats: {
        rawRows: allRows.length,
        uniqueGc: uniqueGc,
        unknown: built.unknown,
        emptyUnload: built.emptyUnload,
        movingRows: built.movingRows,
        movingQty: built.movingQty,
        adhocRows: built.adhocRows,
        adhocQty: built.adhocQty,
        ctRows: built.ctRows,
        ctQty: built.ctQty,
        ctZoneLookups: ctCache.ctCount,
        ctHits: ctCache.ctHits,
        slaRows: slaLookup.rowCount,
        slaGcCount: slaLookup.gcCount,
        slaSheet: slaLookup.sheetName,
        loadedAt: ts,
        refYear: refYear,
        drillCtx: {
          allRows: allRows,
          slaLookup: slaLookup,
          ctStorage: ctCache.ctStorage,
          shrinkSkuMaps: lastShrinkSkuMaps,
          toteStowLines: toteStowLines,
          loadedAt: ts,
          pivotQueryAt: pivotQueryAt,
        },
      },
      summary:
        "이관 WMS " +
        allRows.length +
        "행 · SLA GC " +
        slaLookup.gcCount +
        " · " +
        toteSummary +
        " · 임의상차 " +
        built.adhocQty +
        " · CT반영 " +
        built.ctQty +
        " · 미분류 " +
        built.unknown +
        " · 이동중 " +
        movingPanel.vehicleCount +
        "대/CT" +
        movingPanel.ctTotal,
      movingPanel: movingPanel,
    };
  }

  function applyPivotBundle(host, bundle) {
    if (!bundle) return;
    if (bundle.stopped) return;
    if (bundle.error) {
      renderPivotPlaceholder(host, bundle.error, true);
      return;
    }
    if (bundle.empty) {
      renderPivotPlaceholder(host, bundle.message || bundle.summary || "");
      return;
    }
    renderPivotTable(host, bundle.matrix, bundle.timeCols, bundle.stats);
    lastSlaPivotMetricsCtx = {
      matrix: bundle.matrix,
      timeCols: bundle.timeCols,
    };
  }

  function formatSlaCaptureBatchId(d) {
    var dt = d || new Date();
    return (
      "sla-" +
      pad2(dt.getFullYear()) +
      pad2(dt.getMonth() + 1) +
      pad2(dt.getDate()) +
      "_" +
      pad2(dt.getHours()) +
      pad2(dt.getMinutes()) +
      pad2(dt.getSeconds())
    );
  }

  function slaInboxFilename(batchId, suffix) {
    return SLA_CAPTURE_DOWNLOAD_DIR + "/" + batchId + suffix;
  }

  function downloadSlaJsonManifest(manifest, filename) {
    return new Promise(function (resolve, reject) {
      if (
        typeof chrome === "undefined" ||
        !chrome.runtime ||
        typeof chrome.runtime.sendMessage !== "function"
      ) {
        reject(new Error("chrome.runtime 없음"));
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: "yan4SlaDownloadJson",
          json: JSON.stringify(manifest),
          filename: filename,
        },
        function (resp) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (resp && resp.ok) {
            resolve(resp);
            return;
          }
          reject(new Error((resp && resp.error) || "manifest download 실패"));
        }
      );
    });
  }

  function downloadSlaPngDataUrl(dataUrl, filename) {
    return new Promise(function (resolve, reject) {
      if (
        typeof chrome === "undefined" ||
        !chrome.runtime ||
        typeof chrome.runtime.sendMessage !== "function"
      ) {
        reject(new Error("chrome.runtime 없음"));
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: "yan4SlaDownloadPng",
          dataUrl: dataUrl,
          filename: filename,
        },
        function (resp) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (resp && resp.ok) {
            resolve(resp);
            return;
          }
          reject(new Error((resp && resp.error) || "PNG download 실패"));
        }
      );
    });
  }

  function formatSlaCaptureReportTimestamp(d) {
    var dt = d || new Date();
    return (
      dt.getFullYear() +
      "-" +
      pad2(dt.getMonth() + 1) +
      "-" +
      pad2(dt.getDate()) +
      " " +
      pad2(dt.getHours()) +
      ":" +
      pad2(dt.getMinutes()) +
      ":" +
      pad2(dt.getSeconds())
    );
  }

  var SLA_CAPTURE_MAX_PX = 8192;
  var SLA_CAPTURE_MAX_AREA = 64000000;
  var SLA_CAPTURE_BASE_SCALE = 1.5;
  var SLA_PIVOT_HATCH_MOVING =
    "repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(59, 130, 246, 0.28) 5px, rgba(59, 130, 246, 0.28) 6px)";
  var SLA_PIVOT_HATCH_ADHOC =
    "repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(124, 58, 237, 0.28) 5px, rgba(124, 58, 237, 0.28) 6px)";
  var SLA_PIVOT_HATCH_OVERDUE =
    "repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(51, 65, 85, 0.38) 5px, rgba(51, 65, 85, 0.38) 6px)";

  function slaCaptureScaleForSize(w, h) {
    w = Math.max(1, Number(w) || 1);
    h = Math.max(1, Number(h) || 1);
    var scale = SLA_CAPTURE_BASE_SCALE;
    scale = Math.min(scale, SLA_CAPTURE_MAX_PX / w, SLA_CAPTURE_MAX_PX / h);
    scale = Math.min(scale, Math.sqrt(SLA_CAPTURE_MAX_AREA / (w * h)));
    return Math.max(0.25, scale);
  }

  function slaApplyPivotHatchForCapture(root) {
    if (!root || !root.querySelectorAll) return;
    var moving = root.querySelectorAll("td.yna4-sla-pivot-col--moving");
    var adhoc = root.querySelectorAll("td.yna4-sla-pivot-col--adhoc");
    var overdue = root.querySelectorAll("td.yna4-sla-pivot-num--overdue-day");
    var i;
    for (i = 0; i < moving.length; i++) {
      moving[i].style.backgroundImage = SLA_PIVOT_HATCH_MOVING;
    }
    for (i = 0; i < adhoc.length; i++) {
      adhoc[i].style.backgroundImage = SLA_PIVOT_HATCH_ADHOC;
    }
    for (i = 0; i < overdue.length; i++) {
      overdue[i].style.backgroundImage = SLA_PIVOT_HATCH_OVERDUE;
    }
  }

  function slaApplyCaptureCloneStyles(root) {
    if (!root) return;
    root.style.maxHeight = "none";
    root.style.overflow = "visible";
    root.style.height = "auto";
    var inner = root.querySelectorAll(
      ".yna4-sla-pivot-table-shell--excel, .yna4-sla-moving-table-shell--excel, .yna4-sla-progress-table-shell, .yna4-sla-progress-vendors-scroll, table"
    );
    var ii;
    for (ii = 0; ii < inner.length; ii++) {
      inner[ii].style.maxHeight = "none";
      inner[ii].style.overflow = "visible";
      inner[ii].style.height = "auto";
    }
  }

  function slaCaptureErrorBrief(err, maxLen) {
    var msg = String(err && err.message ? err.message : err || "unknown");
    if (maxLen && msg.length > maxLen) {
      return msg.slice(0, maxLen - 1) + "…";
    }
    return msg;
  }

  function resolveSlaMovingCaptureTarget(movingHost) {
    if (!movingHost) return null;
    return (
      movingHost.querySelector("table.yna4-sla-moving-table--excel") ||
      movingHost.querySelector(".yna4-sla-moving-table-shell--excel")
    );
  }

  function slaTightenMovingCaptureRoot(root) {
    if (!root) return;
    var table = root.matches && root.matches("table.yna4-sla-moving-table--excel")
      ? root
      : root.querySelector("table.yna4-sla-moving-table--excel");
    if (!table) return;
    var w = Math.ceil(table.getBoundingClientRect().width) || table.scrollWidth;
    if (w > 0) {
      table.style.width = w + "px";
      table.style.maxWidth = w + "px";
    }
    if (root !== table) {
      root.style.width = w > 0 ? w + "px" : "fit-content";
      root.style.maxWidth = w > 0 ? w + "px" : "fit-content";
      root.style.display = "inline-block";
    }
  }

  async function captureElementToPngDataUrl(el, label) {
    if (!el) return null;
    if (
      el.matches &&
      (el.matches("table.yna4-sla-moving-table--excel") ||
        el.querySelector("table.yna4-sla-moving-table--excel"))
    ) {
      slaTightenMovingCaptureRoot(el);
    }
    var w = el.scrollWidth || el.offsetWidth || 1;
    var h = el.scrollHeight || el.offsetHeight || 1;
    var scale = slaCaptureScaleForSize(w, h);
    var canvas;
    try {
      canvas = await html2canvas(el, {
        backgroundColor: "#ffffff",
        scale: scale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        onclone: function (_doc, cloneEl) {
          slaApplyCaptureCloneStyles(cloneEl);
          slaApplyPivotHatchForCapture(cloneEl);
          if (
            cloneEl.matches &&
            (cloneEl.matches("table.yna4-sla-moving-table--excel") ||
              cloneEl.querySelector("table.yna4-sla-moving-table--excel"))
          ) {
            slaTightenMovingCaptureRoot(cloneEl);
          }
        },
      });
    } catch (eH2c) {
      throw new Error(
        (label || "캡처") +
          " html2canvas: " +
          slaCaptureErrorBrief(eH2c, 120)
      );
    }
    if (!canvas || canvas.width < 1 || canvas.height < 1) {
      throw new Error((label || "캡처") + " 빈 캔버스");
    }
    try {
      return canvas.toDataURL("image/png");
    } catch (eUrl) {
      throw new Error(
        (label || "캡처") +
          " PNG(" +
          canvas.width +
          "x" +
          canvas.height +
          " scale=" +
          scale.toFixed(2) +
          "): " +
          slaCaptureErrorBrief(eUrl, 80)
      );
    }
  }

  function resolveSlaPivotCaptureTarget(pivotHost) {
    if (!pivotHost) return null;
    var drillHost = pivotHost.querySelector(".yna4-sla-pivot-drill-host");
    if (drillHost) {
      drillHost.textContent = "";
    }
    var pops = document.querySelectorAll(".yna4-sla-pivot-drill-filter-pop");
    var pi;
    for (pi = 0; pi < pops.length; pi++) {
      if (pops[pi].parentNode) {
        pops[pi].parentNode.removeChild(pops[pi]);
      }
    }
    return (
      pivotHost.querySelector("table.yna4-sla-pivot-table--excel") ||
      pivotHost.querySelector(".yna4-sla-pivot-table-shell")
    );
  }

  async function captureAndDownloadSlaScroll(
    statusEl,
    progressHost,
    pivotHost,
    movingHost
  ) {
    if (typeof html2canvas !== "function") {
      throw new Error("html2canvas 로드 실패");
    }
    if (progressHost) {
      syncProgressPanelLayout(progressHost);
    }
    await sleep(400);
    if (statusEl) {
      statusEl.textContent = (statusEl.textContent || "").replace(
        / · 캡처…$/,
        ""
      );
      statusEl.textContent += " · 캡처…";
    }

    var captureAt = new Date();
    var batchId = formatSlaCaptureBatchId(captureAt);
    var headerText =
      "현 시간 현황 공유드립니다. (Bot) " +
      formatSlaCaptureReportTimestamp(captureAt);
    var sections = [];
    var progressLeft =
      progressHost &&
      progressHost.querySelector(".yna4-sla-progress-left");
    var pivotTarget = resolveSlaPivotCaptureTarget(pivotHost);
    var movingTarget = resolveSlaMovingCaptureTarget(movingHost);

    if (progressLeft && progressLeft.textContent.trim()) {
      var progressUrl = await captureElementToPngDataUrl(
        progressLeft,
        "진척율"
      );
      var progressFile = batchId + "-progress.png";
      await downloadSlaPngDataUrl(
        progressUrl,
        slaInboxFilename(batchId, "-progress.png")
      ).catch(function (eDl) {
        throw new Error(
          "진척율 저장: " + slaCaptureErrorBrief(eDl, 100)
        );
      });
      sections.push({ label: "[진척율]", file: progressFile });
    }

    if (pivotTarget) {
      var slaUrl = await captureElementToPngDataUrl(pivotTarget, "SLA");
      var slaFile = batchId + "-sla.png";
      await downloadSlaPngDataUrl(
        slaUrl,
        slaInboxFilename(batchId, "-sla.png")
      ).catch(function (eDl) {
        throw new Error("SLA 저장: " + slaCaptureErrorBrief(eDl, 100));
      });
      sections.push({ label: "[SLA]", file: slaFile });
    }

    if (movingTarget) {
      var movingUrl = await captureElementToPngDataUrl(movingTarget, "이동중");
      var movingFile = batchId + "-moving.png";
      await downloadSlaPngDataUrl(
        movingUrl,
        slaInboxFilename(batchId, "-moving.png")
      ).catch(function (eDl) {
        throw new Error(
          "이동중 저장: " + slaCaptureErrorBrief(eDl, 100)
        );
      });
      sections.push({ label: "[이동중]", file: movingFile });
    }

    if (!sections.length) {
      throw new Error("캡처할 SLA 섹션 없음");
    }

    var metricsPack = null;
    if (
      lastSlaPivotMetricsCtx &&
      lastSlaPivotMetricsCtx.matrix &&
      lastSlaPivotMetricsCtx.timeCols
    ) {
      metricsPack = buildSlaCaptureMetrics(
        lastSlaPivotMetricsCtx.matrix,
        lastSlaPivotMetricsCtx.timeCols
      );
      if (metricsPack && metricsPack.snapshot) {
        persistSlaMetricsSnapshot(batchId, metricsPack.snapshot);
      }
    }

    var shrinkDailyPack = await resolveShrinkDailyPackForCapture();

    await downloadSlaJsonManifest(
      {
        batchId: batchId,
        header: headerText,
        metricsLines:
          metricsPack && metricsPack.metricsLines
            ? metricsPack.metricsLines
            : [],
        metrics:
          metricsPack && metricsPack.zones
            ? {
                zones: metricsPack.zones,
                zoneTotals: metricsPack.zoneTotals,
              }
            : null,
        shrinkLines:
          shrinkDailyPack &&
          shrinkDailyPack.shrinkLines &&
          shrinkDailyPack.shrinkLines.length
            ? shrinkDailyPack.shrinkLines
            : [],
        shrinkDaily:
          shrinkDailyPack && lastSlaProgressCaptureCtx
            ? {
                dirUnit: shrinkDailyPack.dirUnit,
                trUnit: shrinkDailyPack.trUnit,
                operationalYmd: shrinkDailyPack.operYmd,
                calendarYmd: shrinkDailyPack.calYmd,
              }
            : null,
        sections: sections,
      },
      slaInboxFilename(batchId, ".teams.json")
    ).catch(function (eMan) {
      throw new Error("manifest: " + slaCaptureErrorBrief(eMan, 100));
    });

    return batchId + " (" + sections.length + "장)";
  }

  function syncSlaAutoSchedule(enabled) {
    if (
      typeof chrome === "undefined" ||
      !chrome.runtime ||
      typeof chrome.runtime.sendMessage !== "function"
    ) {
      return;
    }
    chrome.runtime.sendMessage({
      type: "yan4SlaAutoScheduleUpdate",
      enabled: !!enabled,
      intervalMin: SLA_AUTO_INTERVAL_MIN,
    });
  }

  var slaAutoCountdownTimer = null;
  var slaAutoCountdownBtnEl = null;
  var slaAutoCountdownEnabled = false;
  var slaAutoCountdownRunning = false;

  function slaAutoButtonLabel(on, remainMs, running) {
    if (!on) return "30min Auto";
    if (running) return "30min Auto …";
    var remain =
      remainMs == null || !isFinite(remainMs)
        ? "--:--"
        : formatSlaAutoRemain(remainMs);
    return "30min Auto " + remain;
  }

  function renderSlaAutoButton(remainMs) {
    if (!slaAutoCountdownBtnEl) return;
    if (!slaAutoCountdownBtnEl.isConnected) {
      stopSlaAutoCountdown();
      return;
    }
    slaAutoCountdownBtnEl.textContent = slaAutoButtonLabel(
      slaAutoCountdownEnabled,
      remainMs,
      slaAutoCountdownRunning
    );
  }

  function setSlaAutoCountdownRunning(running) {
    slaAutoCountdownRunning = !!running;
    if (slaAutoCountdownRunning) {
      renderSlaAutoButton(null);
      return;
    }
    tickSlaAutoCountdown();
  }

  function querySlaAutoNextRunMs(cb) {
    if (
      typeof chrome === "undefined" ||
      !chrome.runtime ||
      typeof chrome.runtime.sendMessage !== "function"
    ) {
      cb(null);
      return;
    }
    chrome.runtime.sendMessage({ type: "yan4SlaAutoNextRun" }, function (resp) {
      if (chrome.runtime.lastError || !resp || !resp.ok || !resp.scheduledTime) {
        cb(null);
        return;
      }
      cb(Math.max(0, resp.scheduledTime - Date.now()));
    });
  }

  function formatSlaAutoRemain(ms) {
    if (ms == null || !isFinite(ms)) return "";
    var totalSec = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function stopSlaAutoCountdown() {
    slaAutoCountdownEnabled = false;
    slaAutoCountdownRunning = false;
    if (slaAutoCountdownTimer != null) {
      clearInterval(slaAutoCountdownTimer);
      slaAutoCountdownTimer = null;
    }
    if (slaAutoCountdownBtnEl && slaAutoCountdownBtnEl.isConnected) {
      slaAutoCountdownBtnEl.textContent = "30min Auto";
    }
    slaAutoCountdownBtnEl = null;
  }

  function tickSlaAutoCountdown() {
    if (!slaAutoCountdownEnabled || !slaAutoCountdownBtnEl) return;
    if (pipelineBusy || slaAutoCountdownRunning) {
      renderSlaAutoButton(null);
      return;
    }
    if (!slaAutoCountdownBtnEl.isConnected) {
      stopSlaAutoCountdown();
      return;
    }
    querySlaAutoNextRunMs(function (ms) {
      if (!slaAutoCountdownEnabled || !slaAutoCountdownBtnEl) return;
      renderSlaAutoButton(ms);
    });
  }

  function startSlaAutoCountdown(btnEl) {
    stopSlaAutoCountdown();
    if (!btnEl) return;
    slaAutoCountdownEnabled = true;
    slaAutoCountdownBtnEl = btnEl;
    slaAutoCountdownRunning = false;
    tickSlaAutoCountdown();
    slaAutoCountdownTimer = setInterval(tickSlaAutoCountdown, 1000);
  }

  function refreshSlaAutoCountdownAfterRun() {
    if (!slaAutoCountdownEnabled) return;
    slaAutoCountdownRunning = false;
    tickSlaAutoCountdown();
  }

  async function handleSlaAutoRun() {
    var host = document.querySelector(
      '.yna4-shell-page-sla-inner[data-yna4-sla-ready="1"]'
    );
    if (!host || !host.querySelector(".yna4-sla-root")) {
      return { ok: false, reason: "sla_page_not_open" };
    }
    if (pipelineBusy) {
      return { ok: false, reason: "busy" };
    }
    var statusEl = host.querySelector(".yna4-sla-status");
    var pivotHost = host.querySelector(".yna4-sla-pivot-host");
    var movingHost = host.querySelector(".yna4-sla-moving-host");
    var progressHost = host.querySelector(".yna4-sla-progress-host");
    var skipDirect = false;
    try {
      skipDirect = localStorage.getItem(SLA_DIRECT_DONE_SKIP_KEY) === "1";
    } catch (eSkip) {}
    if (statusEl) {
      statusEl.textContent = "자동 조회…";
    }
    setSlaAutoCountdownRunning(true);
    try {
      await runCombinedPivotPipeline(
        statusEl,
        pivotHost,
        movingHost,
        progressHost,
        { skipDirect: skipDirect, captureAfter: true }
      );
      return { ok: true };
    } finally {
      setSlaAutoCountdownRunning(false);
      refreshSlaAutoCountdownAfterRun();
    }
  }

  async function runCombinedPivotPipeline(
    statusEl,
    pivotHost,
    movingHost,
    progressHost,
    opts
  ) {
    if (pipelineBusy) return;
    pipelineBusy = true;
    stopRequested = false;
    var skipDirect = !!(opts && opts.skipDirect);
    var captureAfter = !!(opts && opts.captureAfter);
    try {
      pivotHost.textContent = "";
      if (movingHost) movingHost.textContent = "";
      if (progressHost) progressHost.textContent = "";

      var progressBundle = null;
      if (progressHost && !skipDirect) {
        progressBundle = await collectProgressPanelBundle(statusEl, "[1/3]");
        if (progressBundle && progressBundle.stopped) {
          statusEl.textContent = "중지됨";
          return;
        }
        if (stopRequested) {
          statusEl.textContent = "중지됨";
          return;
        }
        renderProgressPanel(progressHost, progressBundle);
      } else if (progressHost) {
        progressHost.textContent = "";
        progressHost.style.height = "";
        progressHost.style.width = "";
      }

      var directBundle = null;
      if (!skipDirect) {
        directBundle = await collectDirectPivotBundle(statusEl, "[2/3]", {
          poRows:
            progressBundle && progressBundle.poRows
              ? progressBundle.poRows
              : null,
        });
        if (directBundle && directBundle.stopped) {
          statusEl.textContent = "중지됨";
          return;
        }
        if (stopRequested) {
          statusEl.textContent = "중지됨";
          return;
        }
      }

      var transferBundle = await collectMemoryPivotBundle(
        statusEl,
        skipDirect ? "[1/1]" : "[3/3]"
      );
      if (transferBundle && transferBundle.stopped) {
        statusEl.textContent = "중지됨";
        return;
      }
      lastSlaTransferBundle = transferBundle || null;
      lastSlaPipelineSkipDirect = skipDirect;

      if (progressHost && progressBundle && transferBundle) {
        enrichProgressBundleTransferShrink(progressBundle, transferBundle);
        renderProgressPanel(progressHost, progressBundle);
      }
      lastSlaProgressCaptureCtx = await resolveSlaProgressCaptureCtx(
        progressBundle,
        transferBundle,
        skipDirect
      );
      if (progressHost && progressBundle && lastSlaProgressCaptureCtx) {
        progressBundle.model = lastSlaProgressCaptureCtx.model;
        renderProgressPanel(progressHost, progressBundle);
      }

      await refreshShrinkSkuMapsCache(
        progressBundle && progressBundle.shrinkRows
          ? progressBundle.shrinkRows
          : null
      );
      if (stopRequested) {
        statusEl.textContent = "중지됨";
        return;
      }
      if (
        transferBundle &&
        transferBundle.stats &&
        transferBundle.stats.drillCtx
      ) {
        transferBundle.stats.drillCtx.shrinkSkuMaps = lastShrinkSkuMaps;
      }
      if (directBundle && directBundle.stats && directBundle.stats.drillCtx) {
        directBundle.stats.drillCtx.shrinkSkuMaps = lastShrinkSkuMaps;
      }
      // 직납 피벗 = SLA 파일 RCRT 유닛 (SLA 파일은 [3/3] 이관 단계에서 받음)
      if (directBundle && !directBundle.empty && lastShrinkSlaLookup) {
        applySlaRcrtUnitsToDirectBundle(directBundle, lastShrinkSlaLookup);
      }

      var combined = buildCombinedPivotBundle(transferBundle, directBundle);
      applyPivotBundle(pivotHost, combined);
      applyMovingPanel(movingHost, transferBundle);
      if (combined && combined.summary) {
        statusEl.textContent =
          (skipDirect && !combined.empty ? "직납완료 · " : "") +
          (combined.empty ? combined.summary : "완료 · " + combined.summary) +
          (combined.empty ? "" : " · " + formatPipelineTimestamp());
      }
      if (captureAfter && !stopRequested) {
        try {
          var savedFn = await captureAndDownloadSlaScroll(
            statusEl,
            progressHost,
            pivotHost,
            movingHost
          );
          statusEl.textContent =
            (statusEl.textContent || "").replace(/ · 캡처…$/, "") +
            " · 저장 " +
            savedFn;
        } catch (eCap) {
          statusEl.textContent =
            (statusEl.textContent || "").replace(/ · 캡처…$/, "") +
            " · 캡처실패: " +
            slaCaptureErrorBrief(eCap, 72);
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 SLA capture]", eCap);
          }
        }
      }
    } catch (e) {
      statusEl.textContent = "오류";
      if (progressHost && !skipDirect) {
        renderProgressPlaceholder(
          progressHost,
          String(e && e.message ? e.message : e),
          true
        );
      }
      renderPivotPlaceholder(
        pivotHost,
        String(e && e.message ? e.message : e),
        true
      );
      renderMovingPanelPlaceholder(
        movingHost,
        String(e && e.message ? e.message : e),
        true
      );
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[YAN4 SLA combined pivot]", e);
      }
    } finally {
      pipelineBusy = false;
      stopRequested = false;
    }
  }

  function injectSlaPivotTableCriticalCss() {
    var cssId = "yna4-sla-pivot-critical-css-v137";
    var directBg = PIVOT_DIRECT_BG;
    var directText = PIVOT_DIRECT_TEXT;
    var zoneW = PIVOT_ZONE_COL_W + "px";
    var timeW = PIVOT_TIME_COL_W + "px";
    var movingW = PIVOT_MOVING_COL_W + "px";
    var adhocW = PIVOT_ADHOC_COL_W + "px";
    var emptyW = PIVOT_EMPTY_COL_W + "px";
    var totalW = PIVOT_TOTAL_COL_W + "px";
    var headDayH = PIVOT_HEAD_DAY_H + "px";
    var headTimeTop = PIVOT_HEAD_DAY_H + "px";
    var headTimeH = PIVOT_HEAD_TIME_H + "px";
    var old = document.getElementById(cssId);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var st = document.createElement("style");
    st.id = cssId;
    st.textContent =
      ".yna4-sla-pivot-table-shell--excel{overflow:auto;max-height:calc(100vh - 200px);border:1px solid #f1f5f9;border-radius:6px;background:#fff}" +
      ".yna4-sla-pivot-table--excel{min-width:0!important;max-width:none!important;table-layout:fixed;border-collapse:collapse;font:11px/1.35 Segoe UI,Malgun Gothic,sans-serif;font-variant-numeric:tabular-nums;color:#0f172a}" +
      ".yna4-sla-pivot-table--excel th,.yna4-sla-pivot-table--excel td{border:1px solid #e2e8f0;padding:5px 8px;white-space:nowrap;box-sizing:border-box}" +
      ".yna4-sla-pivot-col-zone{width:" +
      zoneW +
      "}.yna4-sla-pivot-col-slot{width:" +
      timeW +
      "}.yna4-sla-pivot-col-moving{width:" +
      movingW +
      "}.yna4-sla-pivot-col-adhoc{width:" +
      adhocW +
      "}.yna4-sla-pivot-col-empty{width:" +
      emptyW +
      "}.yna4-sla-pivot-col-total{width:" +
      totalW +
      "}" +
      ".yna4-sla-pivot-table--excel thead th{position:sticky;z-index:3;background:#475569;color:#fff;font-weight:700;text-align:center}" +
      ".yna4-sla-pivot-tr--head-day th{top:0;height:" +
      headDayH +
      ";padding:4px 4px;vertical-align:middle}" +
      ".yna4-sla-pivot-tr--head-time th{top:" +
      headTimeTop +
      ";height:" +
      headTimeH +
      ";background:#334155;font-size:10px;padding:4px 8px;color:#fff;vertical-align:middle}" +
      ".yna4-sla-pivot-th-time{width:" +
      timeW +
      ";min-width:" +
      timeW +
      ";max-width:" +
      timeW +
      "}" +
      ".yna4-sla-pivot-table--excel thead .yna4-sla-pivot-th-empty{width:" +
      emptyW +
      ";min-width:" +
      emptyW +
      ";max-width:" +
      emptyW +
      ";font-size:10px}" +
      ".yna4-sla-pivot-th-corner{width:" +
      zoneW +
      ";min-width:" +
      zoneW +
      ";max-width:" +
      zoneW +
      ";box-sizing:border-box;padding:6px 8px!important;vertical-align:middle;text-align:center}" +
      ".yna4-sla-pivot-th-corner-line{display:block;font-size:10px;font-weight:700;line-height:1.35;color:#fff}" +
      ".yna4-sla-pivot-th-corner-line--title{font-size:9px;line-height:1.25;white-space:normal}" +
      ".yna4-sla-pivot-th-day{font-size:11px;border-bottom:1px solid rgba(255,255,255,.25);padding:4px 2px!important;white-space:nowrap;text-align:center;vertical-align:middle;letter-spacing:-.02em}" +
      ".yna4-sla-pivot-th-day--merged{vertical-align:middle;border-bottom:none}" +
      ".yna4-sla-pivot-th-day-line{display:block;font-size:11px;font-weight:700;line-height:1.2;text-align:center}" +
      ".yna4-sla-pivot-th-day-line--miss{font-size:10px;margin-top:2px;letter-spacing:.02em}" +
      ".yna4-sla-pivot-th-day-line--aging{font-size:10px;margin-top:2px;letter-spacing:.02em;font-weight:600}" +
      ".yna4-sla-pivot-th-time--rm{font-size:10px;font-weight:700}" +
      ".yna4-sla-pivot-tr--ats td{background:#fef08a!important}" +
      ".yna4-sla-pivot-tr--ats td.yna4-sla-pivot-td-zone{background:#fef08a!important;font-weight:600;color:#0f172a}" +
      ".yna4-sla-pivot-tr--rocketmart td{background:#bbf7d0!important}" +
      ".yna4-sla-pivot-tr--totestow td{background:#cffafe!important}" +
      ".yna4-sla-pivot-tr--direct td{background:" +
      directBg +
      "!important;color:" +
      directText +
      "!important}" +
      ".yna4-sla-pivot-tr--direct td.yna4-sla-pivot-td-zone{background:" +
      directBg +
      "!important;font-weight:600;color:" +
      directText +
      "!important}" +
      ".yna4-sla-pivot-tr--direct .yna4-sla-pivot-num{color:" +
      directText +
      "!important}" +
      ".yna4-sla-pivot-tr--direct .yna4-sla-pivot-num--hit{color:" +
      directText +
      "!important;font-weight:700}" +
      ".yna4-sla-pivot-tr--direct .yna4-sla-pivot-num-pending,.yna4-sla-pivot-tr--direct .yna4-sla-pivot-num--pending-only{color:" +
      DIRECT_PENDING_NUM_COLOR +
      "!important;font-weight:700}" +
      ".yna4-sla-pivot-tr--group .yna4-sla-pivot-zone-text,.yna4-sla-pivot-tr--frozen .yna4-sla-pivot-zone-text,.yna4-sla-pivot-tr--rocketmart .yna4-sla-pivot-zone-text,.yna4-sla-pivot-tr--totestow .yna4-sla-pivot-zone-text,.yna4-sla-pivot-tr--direct .yna4-sla-pivot-zone-text{font-weight:700}" +
      ".yna4-sla-pivot-table--excel tbody .yna4-sla-pivot-tr--frozen td.yna4-sla-pivot-td-zone,.yna4-sla-pivot-table--excel tbody .yna4-sla-pivot-tr--rocketmart td.yna4-sla-pivot-td-zone,.yna4-sla-pivot-table--excel tbody .yna4-sla-pivot-tr--totestow td.yna4-sla-pivot-td-zone{font-weight:700;color:#0f172a}" +
      ".yna4-sla-pivot-tr--rocketmart td.yna4-sla-pivot-td-zone{background:#bbf7d0!important}" +
      ".yna4-sla-pivot-tr--totestow td.yna4-sla-pivot-td-zone{background:#cffafe!important}" +
      ".yna4-sla-pivot-table--excel tbody tr:not(.yna4-sla-pivot-tr--ats):not(.yna4-sla-pivot-tr--rocketmart):not(.yna4-sla-pivot-tr--totestow):not(.yna4-sla-pivot-tr--direct):not(.yna4-sla-pivot-tr--grand) td{background:#fff!important}" +
      ".yna4-sla-pivot-table--excel tbody tr:not(.yna4-sla-pivot-tr--ats):not(.yna4-sla-pivot-tr--rocketmart):not(.yna4-sla-pivot-tr--totestow):not(.yna4-sla-pivot-tr--direct):not(.yna4-sla-pivot-tr--grand) td.yna4-sla-pivot-td-zone{background:#fff!important;color:#0f172a}" +
      ".yna4-sla-pivot-tr--group td.yna4-sla-pivot-td-zone{font-weight:700}" +
      ".yna4-sla-pivot-bundle-start td.yna4-sla-pivot-td-zone{border-top:2px solid #cbd5e1}" +
      ".yna4-sla-pivot-bundle-end td{border-bottom:2px solid #e2e8f0}" +
      ".yna4-sla-pivot-tr--child .yna4-sla-pivot-td-zone{padding-left:18px}" +
      ".yna4-sla-pivot-table--excel thead th.yna4-sla-pivot-th-zone{left:0;z-index:6;text-align:center;width:" +
      zoneW +
      ";min-width:" +
      zoneW +
      ";max-width:" +
      zoneW +
      ";box-sizing:border-box;background:#475569;color:#fff}" +
      ".yna4-sla-pivot-table--excel tbody td.yna4-sla-pivot-td-zone{position:sticky;left:0;z-index:2;text-align:left;width:" +
      zoneW +
      ";min-width:" +
      zoneW +
      ";max-width:" +
      zoneW +
      ";box-sizing:border-box;border-right:1px solid #e2e8f0;box-shadow:2px 0 4px rgba(15,23,42,.04)}" +
      ".yna4-sla-pivot-exp{display:inline-block;width:14px;margin-right:4px;text-align:center;font-weight:700;color:#64748b}" +
      ".yna4-sla-pivot-zone-text--child{margin-left:2px}" +
      ".yna4-sla-pivot-col--moving{width:" +
      movingW +
      ";min-width:" +
      movingW +
      ";max-width:" +
      movingW +
      ";box-sizing:border-box}" +
      ".yna4-sla-pivot-table--excel thead .yna4-sla-pivot-th-moving{width:" +
      movingW +
      ";min-width:" +
      movingW +
      ";max-width:" +
      movingW +
      ";box-sizing:border-box}" +
      ".yna4-sla-pivot-col--adhoc{width:" +
      adhocW +
      ";min-width:" +
      adhocW +
      ";max-width:" +
      adhocW +
      ";box-sizing:border-box}" +
      ".yna4-sla-pivot-table--excel thead .yna4-sla-pivot-th-adhoc{width:" +
      adhocW +
      ";min-width:" +
      adhocW +
      ";max-width:" +
      adhocW +
      ";box-sizing:border-box;padding:4px 2px!important;white-space:normal;text-align:center;vertical-align:middle}" +
      ".yna4-sla-pivot-th-adhoc-line{display:block;font-size:10px;font-weight:700;line-height:1.2;text-align:center}" +
      ".yna4-sla-pivot-table--excel tbody tr:not(.yna4-sla-pivot-tr--grand) td.yna4-sla-pivot-col--moving{position:relative;overflow:hidden}" +
      ".yna4-sla-pivot-table--excel tbody tr:not(.yna4-sla-pivot-tr--grand) td.yna4-sla-pivot-col--moving::before{content:\"\";position:absolute;inset:0;background:repeating-linear-gradient(-45deg,transparent,transparent 5px,rgba(59,130,246,.28) 5px,rgba(59,130,246,.28) 6px);pointer-events:none;z-index:0}" +
      ".yna4-sla-pivot-table--excel tbody tr:not(.yna4-sla-pivot-tr--grand) td.yna4-sla-pivot-col--adhoc{position:relative;overflow:hidden}" +
      ".yna4-sla-pivot-table--excel tbody tr:not(.yna4-sla-pivot-tr--grand) td.yna4-sla-pivot-col--adhoc::before{content:\"\";position:absolute;inset:0;background:repeating-linear-gradient(-45deg,transparent,transparent 5px,rgba(124,58,237,.28) 5px,rgba(124,58,237,.28) 6px);pointer-events:none;z-index:0}" +
      ".yna4-sla-pivot-table--excel thead .yna4-sla-pivot-th-total{width:" +
      totalW +
      ";min-width:" +
      totalW +
      ";max-width:" +
      totalW +
      ";box-sizing:border-box}" +
      ".yna4-sla-pivot-table--excel tbody td.yna4-sla-pivot-total:last-child{width:" +
      totalW +
      ";min-width:" +
      totalW +
      ";max-width:" +
      totalW +
      ";box-sizing:border-box}" +
      ".yna4-sla-pivot-tr--grand td{background:#475569!important;font-weight:700;color:#fff!important;border-top:2px solid #334155}" +
      ".yna4-sla-pivot-tr--grand .yna4-sla-pivot-td-zone{background:#475569!important;color:#fff!important}" +
      ".yna4-sla-pivot-tr--grand .yna4-sla-pivot-num,.yna4-sla-pivot-tr--grand .yna4-sla-pivot-num--hit,.yna4-sla-pivot-tr--grand .yna4-sla-pivot-total{color:#fff!important}" +
      ".yna4-sla-pivot-tr--grand .yna4-sla-pivot-zone-text--grand{color:#fff}" +
      ".yna4-sla-pivot-num{text-align:right;width:" +
      timeW +
      ";min-width:" +
      timeW +
      ";max-width:" +
      timeW +
      ";color:#64748b}" +
      ".yna4-sla-pivot-col--empty{width:" +
      emptyW +
      ";min-width:" +
      emptyW +
      ";max-width:" +
      emptyW +
      "}" +
      ".yna4-sla-pivot-num--hit{color:#0f172a;font-weight:700;cursor:pointer}" +
      ".yna4-sla-pivot-num--overdue-day,.yna4-sla-pivot-num--overdue-day.yna4-sla-pivot-num--hit,.yna4-sla-pivot-table--excel tbody td.yna4-sla-pivot-num--overdue-day,.yna4-sla-pivot-table--excel tbody td.yna4-sla-pivot-num--overdue-day.yna4-sla-pivot-num--hit,.yna4-sla-pivot-table--excel tbody tr:not(.yna4-sla-pivot-tr--ats):not(.yna4-sla-pivot-tr--rocketmart):not(.yna4-sla-pivot-tr--totestow):not(.yna4-sla-pivot-tr--direct):not(.yna4-sla-pivot-tr--grand) td.yna4-sla-pivot-num--overdue-day{background:#b8c4d1!important;color:#0f172a!important;font-weight:700;position:relative;overflow:hidden}" +
      ".yna4-sla-pivot-table--excel tbody td.yna4-sla-pivot-num--overdue-day::before{content:\"\";position:absolute;inset:0;background:repeating-linear-gradient(-45deg,transparent,transparent 5px,rgba(51,65,85,.38) 5px,rgba(51,65,85,.38) 6px);pointer-events:none;z-index:0}" +
      ".yna4-sla-pivot-tr--direct td.yna4-sla-pivot-num--overdue-day,.yna4-sla-pivot-tr--ats td.yna4-sla-pivot-num--overdue-day,.yna4-sla-pivot-tr--frozen td.yna4-sla-pivot-num--overdue-day,.yna4-sla-pivot-tr--rocketmart td.yna4-sla-pivot-num--overdue-day,.yna4-sla-pivot-tr--totestow td.yna4-sla-pivot-num--overdue-day{background:#b8c4d1!important;color:#0f172a!important;position:relative;overflow:hidden}" +
      ".yna4-sla-pivot-num--overdue-day .yna4-sla-pivot-num-pending,.yna4-sla-pivot-num--overdue-day.yna4-sla-pivot-num--pending-only{color:#334155!important;position:relative;z-index:1}" +
      ".yna4-sla-pivot-num--overdue-day.yna4-sla-pivot-num--selected,.yna4-sla-pivot-table--excel tbody td.yna4-sla-pivot-num--overdue-day.yna4-sla-pivot-num--selected{outline:2px solid #2563eb;outline-offset:-2px;background:#94a3b8!important;color:#0f172a!important}" +
      ".yna4-sla-pivot-num--sla-alert,.yna4-sla-pivot-table--excel tbody td.yna4-sla-pivot-num--sla-alert,.yna4-sla-pivot-table--excel tbody tr:not(.yna4-sla-pivot-tr--ats):not(.yna4-sla-pivot-tr--rocketmart):not(.yna4-sla-pivot-tr--totestow):not(.yna4-sla-pivot-tr--direct):not(.yna4-sla-pivot-tr--grand) td.yna4-sla-pivot-num--sla-alert{background:#fecaca!important;color:#9f1239!important;font-weight:700;box-shadow:inset 0 0 0 1px #f87171}" +
      ".yna4-sla-pivot-tr--direct td.yna4-sla-pivot-num--sla-alert,.yna4-sla-pivot-tr--rocketmart td.yna4-sla-pivot-num--sla-alert,.yna4-sla-pivot-tr--totestow td.yna4-sla-pivot-num--sla-alert,.yna4-sla-pivot-tr--ats td.yna4-sla-pivot-num--sla-alert,.yna4-sla-pivot-tr--frozen td.yna4-sla-pivot-num--sla-alert{background:#fecaca!important;color:#9f1239!important;box-shadow:inset 0 0 0 1px #f87171}" +
      ".yna4-sla-pivot-num--overdue-day.yna4-sla-pivot-num--sla-alert,.yna4-sla-pivot-table--excel tbody td.yna4-sla-pivot-num--overdue-day.yna4-sla-pivot-num--sla-alert,.yna4-sla-pivot-table--excel tbody tr:not(.yna4-sla-pivot-tr--ats):not(.yna4-sla-pivot-tr--rocketmart):not(.yna4-sla-pivot-tr--totestow):not(.yna4-sla-pivot-tr--direct):not(.yna4-sla-pivot-tr--grand) td.yna4-sla-pivot-num--overdue-day.yna4-sla-pivot-num--sla-alert,.yna4-sla-pivot-tr--direct td.yna4-sla-pivot-num--overdue-day.yna4-sla-pivot-num--sla-alert,.yna4-sla-pivot-tr--ats td.yna4-sla-pivot-num--overdue-day.yna4-sla-pivot-num--sla-alert,.yna4-sla-pivot-tr--frozen td.yna4-sla-pivot-num--overdue-day.yna4-sla-pivot-num--sla-alert,.yna4-sla-pivot-tr--rocketmart td.yna4-sla-pivot-num--overdue-day.yna4-sla-pivot-num--sla-alert,.yna4-sla-pivot-tr--totestow td.yna4-sla-pivot-num--overdue-day.yna4-sla-pivot-num--sla-alert{background:#b8c4d1!important;color:#0f172a!important;box-shadow:none}" +
      ".yna4-sla-pivot-num--selected{outline:2px solid #2563eb;outline-offset:-2px;background:#eff6ff!important}" +
      ".yna4-sla-pivot-drill-host{margin-top:8px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc}" +
      ".yna4-sla-pivot-drill-host:not(:empty){min-height:48px}" +
      ".yna4-sla-pivot-drill{padding:8px 10px 10px}" +
      ".yna4-sla-pivot-drill-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font:600 11px/1.4 Segoe UI,Malgun Gothic,sans-serif;color:#0f172a;margin-bottom:6px}" +
      ".yna4-sla-pivot-drill-head-text{flex:0 1 auto}" +
      ".yna4-sla-pivot-drill-teams-btn{flex-shrink:0;font:600 10px/1.2 Segoe UI,Malgun Gothic,sans-serif;padding:2px 8px;min-height:20px;border-radius:8px;border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;cursor:pointer}" +
      ".yna4-sla-pivot-drill-teams-btn:hover{background:#dbeafe;border-color:#60a5fa}" +
      ".yna4-sla-pivot-drill-scroll{overflow:auto;max-height:280px;border:1px solid #f1f5f9;border-radius:6px;background:#fff}" +
      ".yna4-sla-pivot-drill-table{border-collapse:collapse;width:100%;font:11px/1.35 Segoe UI,Malgun Gothic,sans-serif}" +
      ".yna4-sla-pivot-drill-table th,.yna4-sla-pivot-drill-table td{border-bottom:1px solid #e2e8f0;padding:5px 8px;white-space:nowrap}" +
      ".yna4-sla-pivot-drill-table thead th{position:sticky;top:0;background:#fef2f2;color:#991b1b;font-weight:700;vertical-align:middle}" +
      ".yna4-sla-pivot-drill-th-inner{display:flex;align-items:center;justify-content:flex-start;gap:3px;width:100%}" +
      ".yna4-sla-pivot-drill-th-label{flex:0 1 auto;white-space:nowrap}" +
      ".yna4-sla-pivot-drill-sort-btn{flex-shrink:0;border:1px solid #bfdbfe;background:#fff;color:#64748b;cursor:pointer;padding:0 3px;font-size:8px;line-height:14px;border-radius:3px;min-width:18px;height:16px;pointer-events:auto;position:relative;z-index:2;letter-spacing:-1px}" +
      ".yna4-sla-pivot-drill-sort-btn:hover{background:#eff6ff;color:#2563eb}" +
      ".yna4-sla-pivot-drill-sort-btn--asc,.yna4-sla-pivot-drill-sort-btn--desc{background:#2563eb;border-color:#1d4ed8;color:#fff;font-size:9px;letter-spacing:0;min-width:16px}" +
      ".yna4-sla-pivot-drill-filter-btn{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid #cbd5e1;background:#fff;color:#64748b;cursor:pointer;padding:0 3px;font-size:9px;line-height:14px;border-radius:3px;min-width:16px;height:16px;pointer-events:auto;position:relative;z-index:2}" +
      ".yna4-sla-pivot-drill-filter-btn:hover{background:#f1f5f9;color:#2563eb;border-color:#93c5fd}" +
      ".yna4-sla-pivot-drill-filter-btn--active{background:#2563eb;border-color:#1d4ed8;color:#fff}" +
      ".yna4-sla-pivot-drill-filter-icon{display:block}" +
      ".yna4-sla-pivot-drill-filter-pop{position:fixed;background:#fff;border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 8px 24px rgba(15,23,42,.22);padding:6px 0;font:11px/1.35 Segoe UI,Malgun Gothic,sans-serif;color:#0f172a;pointer-events:auto;z-index:2147483646}" +
      ".yna4-sla-pivot-drill-filter-search{display:block;width:calc(100% - 16px);margin:0 8px 6px;padding:4px 6px;border:1px solid #e2e8f0;border-radius:4px;font:inherit;box-sizing:border-box}" +
      ".yna4-sla-pivot-drill-filter-all{display:flex;align-items:center;gap:4px;padding:4px 10px;border-bottom:1px solid #f1f5f9;font-weight:600;cursor:pointer}" +
      ".yna4-sla-pivot-drill-filter-list{max-height:200px;overflow:auto;padding:2px 0}" +
      ".yna4-sla-pivot-drill-filter-item{display:flex;align-items:center;gap:4px;padding:3px 10px;cursor:pointer;white-space:nowrap}" +
      ".yna4-sla-pivot-drill-filter-item:hover{background:#f8fafc}" +
      ".yna4-sla-pivot-drill-filter-actions{display:flex;justify-content:flex-end;gap:6px;padding:6px 8px 2px;border-top:1px solid #f1f5f9}" +
      ".yna4-sla-pivot-drill-filter-clear,.yna4-sla-pivot-drill-filter-ok{font:inherit;font-size:10px;padding:3px 8px;border-radius:4px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#334155}" +
      ".yna4-sla-pivot-drill-filter-ok{background:#991b1b;border-color:#7f1d1d;color:#fff;font-weight:600}" +
      ".yna4-sla-pivot-drill-head-filter{font-weight:600;color:#2563eb}" +
      ".yna4-sla-pivot-drill-num{text-align:right}" +
      ".yna4-sla-pivot-drill-table--direct{table-layout:fixed;width:max-content;max-width:100%}" +
      ".yna4-sla-pivot-drill-table--direct .yna4-sla-pivot-drill-col-vendor{width:115px;min-width:115px;max-width:115px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".yna4-sla-pivot-drill-table--direct th.yna4-sla-pivot-drill-loc,.yna4-sla-pivot-drill-table--direct td.yna4-sla-pivot-drill-loc{width:136px;min-width:136px;max-width:136px;padding-left:5px;padding-right:5px;box-sizing:border-box;vertical-align:middle;font-size:11px;line-height:1.35;color:#1e3a5f}" +
      ".yna4-sla-pivot-drill-table--direct td.yna4-sla-pivot-drill-loc .yna4-sla-pivot-drill-loc-line{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}" +
      ".yna4-sla-pivot-drill-table--direct th.yna4-sla-pivot-drill-col-qty,.yna4-sla-pivot-drill-table--direct td.yna4-sla-pivot-drill-col-qty{width:58px;min-width:58px;max-width:58px;text-align:right;padding-left:4px;padding-right:6px;box-sizing:border-box;font-variant-numeric:tabular-nums}" +
      ".yna4-sla-pivot-drill-table--direct th.yna4-sla-pivot-drill-units,.yna4-sla-pivot-drill-table--direct td.yna4-sla-pivot-drill-units{width:64px;min-width:64px;max-width:64px;text-align:right;padding-left:4px;padding-right:6px;box-sizing:border-box;vertical-align:middle;font-variant-numeric:tabular-nums}" +
      ".yna4-sla-pivot-drill-table--direct td.yna4-sla-pivot-drill-units{font-size:11px;line-height:1.35}" +
      ".yna4-sla-pivot-drill-table--direct td.yna4-sla-pivot-drill-loc--failed{color:#b45309}" +      ".yna4-sla-pivot-drill-table--direct td.yna4-sla-pivot-drill-units .yna4-sla-pivot-drill-units-line{display:block;white-space:nowrap}" +
      ".yna4-sla-pivot-drill-table--direct th.yna4-sla-pivot-drill-col-status,.yna4-sla-pivot-drill-table--direct td.yna4-sla-pivot-drill-col-status{width:80px;min-width:80px;max-width:96px}" +
      ".yna4-sla-pivot-drill-table .yna4-sla-pivot-drill-name{width:400px;max-width:400px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;font-size:11px;line-height:1.35;color:#334155}" +
      ".yna4-sla-pivot-drill-warn{color:#b45309;font-weight:700}" +
      ".yna4-sla-pivot-drill-col-from{width:68px;min-width:68px;max-width:68px;padding-left:4px;padding-right:4px;box-sizing:border-box;text-align:center}" +
      ".yna4-sla-pivot-drill-table thead th.yna4-sla-pivot-drill-col-from{text-align:center}" +
      ".yna4-sla-pivot-drill-col-from .yna4-sla-pivot-drill-th-inner{justify-content:center}" +
      ".yna4-sla-pivot-drill-col-vehicle{width:82px;min-width:82px;max-width:82px;padding-left:4px;padding-right:4px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".yna4-sla-pivot-drill-col-ct{width:108px;min-width:108px;max-width:108px;padding-left:4px;padding-right:4px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".yna4-sla-pivot-drill-col-tote{width:calc(15ch + 8px);min-width:calc(15ch + 8px);max-width:calc(15ch + 8px);padding-left:4px;padding-right:4px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}" +
      ".yna4-sla-pivot-drill-col-unit{width:64px;min-width:64px;max-width:64px;padding-left:4px;padding-right:4px;box-sizing:border-box;text-align:left}";
    (document.head || document.documentElement).appendChild(st);
  }

  function injectSlaProgressCriticalCss() {
    var cssId = "yna4-sla-progress-critical-css-v32";
    var old = document.getElementById(cssId);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var st = document.createElement("style");
    st.id = cssId;
    st.textContent =
      ".yna4-sla-progress-host{margin-bottom:0!important;display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;overflow:hidden!important;line-height:0!important;padding-bottom:4px!important;border-bottom:1px solid #e2e8f0!important}" +
      ".yna4-sla-progress-host:empty{display:none!important;border-bottom:none!important;padding-bottom:0!important}" +
      ".yna4-sla-progress-wrap{display:block!important;border:none!important;border-radius:0!important;background:#fff!important;padding:0!important;box-sizing:border-box!important;width:900px!important;max-width:calc(100%/0.9)!important;zoom:0.9!important;line-height:normal!important;font-size:11px!important}" +
      ".yna4-sla-pivot-host{margin-top:8px!important}" +
      ".yna4-sla-progress-host+.yna4-sla-pivot-host{margin-top:8px!important}" +
      ".yna4-sla-progress-head{display:block!important;font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px;line-height:1.3}" +
      ".yna4-sla-progress-grid{display:grid!important;grid-template-columns:minmax(0,1fr) 196px!important;gap:8px!important;align-items:start!important;width:100%!important;box-sizing:border-box!important}" +
      ".yna4-sla-progress-left,.yna4-sla-progress-right{display:flex!important;flex-direction:column!important;min-width:0!important;width:100%!important}" +
      ".yna4-sla-progress-right{align-self:start!important;height:auto!important}" +
      ".yna4-sla-progress-section{display:block!important;margin-bottom:0!important;visibility:visible!important;opacity:1!important;width:100%!important}" +
      ".yna4-sla-progress-section--vendors{display:flex!important;flex-direction:column!important;flex:0 0 auto!important;align-self:start!important;min-height:0!important;width:100%!important;margin-bottom:0!important;height:auto!important;max-height:none!important}" +
      ".yna4-sla-progress-vendors-panel{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;min-height:0!important;height:100%!important;border:1px solid #e2e8f0!important;background:#fff!important;overflow:hidden!important}" +
      ".yna4-sla-progress-vendor-group-hdr{background:#334155!important;color:#fff!important;font-size:11px!important;font-weight:700!important;text-align:center!important;padding:6px 8px!important;letter-spacing:-.01em;border-bottom:1px solid #475569!important;line-height:1.35!important;flex-shrink:0!important}" +
      ".yna4-sla-progress-vendors-scroll{display:block!important;flex:1 1 auto!important;min-height:0!important;width:100%!important;max-width:100%!important;overflow-x:hidden!important;overflow-y:auto!important;background:#fff;-webkit-overflow-scrolling:touch}" +
      ".yna4-sla-progress-table-shell{display:block!important;width:100%!important;overflow:hidden;border:1px solid #e2e8f0;border-radius:0!important;background:#fff;box-sizing:border-box!important}" +
      ".yna4-sla-progress-table{display:table!important;width:max-content!important;min-width:0!important;max-width:100%!important;border-collapse:collapse!important;font:11px/1.35 Segoe UI,Malgun Gothic,sans-serif!important;font-variant-numeric:tabular-nums;background:#fff;color:#0f172a;visibility:visible!important;table-layout:auto!important}" +
      ".yna4-sla-progress-table--combined{width:100%!important;table-layout:fixed!important}" +
      ".yna4-sla-progress-table--vendors{font:10px/1.25 Segoe UI,Malgun Gothic,sans-serif!important;width:100%!important;table-layout:fixed!important}" +
      ".yna4-sla-progress-table--vendors th,.yna4-sla-progress-table--vendors td{padding:2px 4px!important}" +
      ".yna4-sla-progress-table--vendors thead th{position:sticky!important;top:0!important;z-index:1!important;background:#475569!important;color:#fff!important;font-size:9px!important;text-align:center!important;font-weight:700!important}" +
      ".yna4-sla-progress-table--vendors .yna4-sla-progress-vendor-th-label{text-align:left!important}" +
      ".yna4-sla-progress-table--vendors .yna4-sla-progress-td-label{max-width:120px;overflow:hidden;text-overflow:ellipsis}" +
      ".yna4-sla-progress-table--vendors .yna4-sla-progress-num{font-size:9px!important}" +
      ".yna4-sla-progress-table thead{display:table-header-group!important}" +
      ".yna4-sla-progress-table tbody{display:table-row-group!important}" +
      ".yna4-sla-progress-table tr{display:table-row!important}" +
      ".yna4-sla-progress-table th,.yna4-sla-progress-table td{display:table-cell!important;border:1px solid #e2e8f0;padding:5px 8px!important;white-space:nowrap;vertical-align:middle;box-sizing:border-box}" +
      ".yna4-sla-progress-table thead th{background:#475569!important;color:#fff!important;font-weight:700;text-align:center;font-size:11px!important}" +
      ".yna4-sla-progress-table td{background:#fff!important;color:#0f172a!important}" +
      ".yna4-sla-progress-td-label{text-align:left!important;font-weight:400;color:#0f172a!important}" +
      ".yna4-sla-progress-num{text-align:right!important;font-variant-numeric:tabular-nums}" +
      ".yna4-sla-progress-pct-cell{position:relative!important;overflow:hidden!important;padding:5px 8px!important;vertical-align:middle!important}" +
      ".yna4-sla-progress-pct-bar{position:absolute!important;left:0!important;top:0!important;bottom:0!important;z-index:0!important;min-width:0!important;background:#86efac!important;pointer-events:none!important}" +
      ".yna4-sla-progress-pct-text{position:relative!important;z-index:1!important;display:block!important;font-variant-numeric:tabular-nums!important}" +
      ".yna4-sla-progress-tr--total .yna4-sla-progress-pct-bar{background:#4ade80!important}" +
      ".yna4-sla-progress-tr--group-hdr td{background:#334155!important;color:#fff!important;font-size:11px!important;font-weight:700!important;text-align:center!important;padding:6px 8px!important;letter-spacing:-.01em;border:none!important;border-bottom:1px solid #475569!important}" +
      ".yna4-sla-progress-tr--group-hdr--sep td{box-shadow:inset 0 1px 0 #1e293b!important;border-top:none!important}" +
      ".yna4-sla-progress-tr--col-hdr th{background:#475569!important;color:#fff!important;font-weight:700;text-align:center;font-size:11px!important;border:1px solid #e2e8f0;padding:5px 8px!important;white-space:nowrap;vertical-align:middle;box-sizing:border-box;display:table-cell!important}" +
      ".yna4-sla-progress-tr--col-hdr th:first-child{text-align:left!important}" +
      ".yna4-sla-progress-tr--col-hdr th.yna4-sla-progress-th-pad{padding:5px 4px!important;min-width:0!important;border-left:none!important;border-right:none!important;border-top:none!important;background:#475569!important}" +
      ".yna4-sla-progress-td-pad{padding:5px 4px!important;background:#fff!important;border-left:none!important;border-right:none!important;border-top:none!important}" +
      ".yna4-sla-progress-table-shell .yna4-sla-progress-table--combined>tbody>tr:first-child>:is(th,td){border-top:none!important}" +
      ".yna4-sla-progress-table-shell .yna4-sla-progress-table--combined>tbody>tr:last-child>:is(th,td){border-bottom:none!important}" +
      ".yna4-sla-progress-table-shell .yna4-sla-progress-table--combined>tbody>tr>:is(th,td):first-child{border-left:none!important}" +
      ".yna4-sla-progress-table-shell .yna4-sla-progress-table--combined>tbody>tr>:is(th,td):last-child{border-right:none!important}" +
      ".yna4-sla-progress-vendors-panel .yna4-sla-progress-table--vendors thead tr:first-child th{border-top:none!important}" +
      ".yna4-sla-progress-vendors-panel .yna4-sla-progress-table--vendors tbody tr:last-child td{border-bottom:none!important}" +
      ".yna4-sla-progress-vendors-panel .yna4-sla-progress-table--vendors tr>:first-child{border-left:none!important}" +
      ".yna4-sla-progress-vendors-panel .yna4-sla-progress-table--vendors tr>:last-child{border-right:none!important}" +
      ".yna4-sla-progress-tr--total td{background:#fef08a!important;font-weight:700;color:#0f172a!important;border-top:1px solid #ca8a04!important}" +
      ".yna4-sla-progress-tr--total .yna4-sla-progress-td-label,.yna4-sla-progress-tr--total .yna4-sla-progress-num{color:#0f172a!important}" +
      ".yna4-sla-progress-placeholder{display:block!important;padding:12px;border:1px dashed #cbd5e1;border-radius:0!important;color:#64748b;font-size:11px;background:#f8fafc}" +
      ".yna4-sla-progress-shrink-empty{color:#b45309!important;text-align:center!important;white-space:normal!important;font-size:11px!important;line-height:1.35;padding:8px!important;background:#fff!important}";
    (document.head || document.documentElement).appendChild(st);
  }

  function injectSlaToolbarCriticalCss() {
    var cssId = "yna4-sla-toolbar-critical-css-v14";
    var old = document.getElementById(cssId);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var st = document.createElement("style");
    st.id = cssId;
    st.textContent =
      ".yna4-sla-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex-shrink:0;position:sticky;top:0;z-index:12;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;box-sizing:border-box}" +
      ".yna4-shell-page-sla-inner .yna4-sla-status{display:inline-flex;align-items:center;min-height:22px;padding:2px 8px;font-size:11px;line-height:1.2;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#334155}" +
      ".yna4-shell-page-sla-inner button.yna4-sla-btn{font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:11px;font-weight:600;line-height:1.15;color:#334155;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:4px 10px;min-height:24px;cursor:pointer;appearance:none;-webkit-appearance:none}" +
      ".yna4-shell-page-sla-inner button.yna4-sla-btn--primary{color:#fff;background:#4f46e5;border-color:#4338ca}" +
      ".yna4-shell-page-sla-inner button.yna4-sla-btn--toggle{min-width:96px}" +
      ".yna4-shell-page-sla-inner button.yna4-sla-btn--auto{min-width:118px;font-variant-numeric:tabular-nums;letter-spacing:-0.02em}" +
      ".yna4-shell-page-sla-inner button.yna4-sla-btn--toggle-on{color:#fff;background:#059669;border-color:#047857}" +
      ".yna4-shell-page-sla-inner button.yna4-sla-btn:disabled{opacity:.55;cursor:not-allowed}" +
      ".yna4-sla-toolbar-check{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;line-height:1.15;color:#475569;cursor:pointer;user-select:none;margin:0;padding:3px 8px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;min-height:24px;box-sizing:border-box}" +
      ".yna4-sla-toolbar-check:hover{background:#f1f5f9}" +
      ".yna4-sla-toolbar-check input[type=checkbox]{margin:0;cursor:pointer;flex-shrink:0}" +
      ".yna4-sla-lookback{font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:11px;font-weight:600;line-height:1.15;color:#334155;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:3px 8px;min-height:24px;cursor:pointer;appearance:auto}" +
      ".yna4-sla-lookback:disabled{opacity:.55;cursor:not-allowed}";
    (document.head || document.documentElement).appendChild(st);
  }

  function slaEnsureStylesheet() {
    injectSlaToolbarCriticalCss();
    injectSlaProgressCriticalCss();
    injectSlaPivotTableCriticalCss();
    var cssId = "yna4-sla-page-css";
    var oldLink = document.getElementById(cssId);
    if (oldLink && oldLink.parentNode) oldLink.parentNode.removeChild(oldLink);
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
          chrome.runtime.getURL("yan4-sla-page.css") + "?v=" + SLA_UI_REV;
        (document.head || document.documentElement).appendChild(link);
      }
    } catch (eCss) {}
  }

  function remountSlaHostIfStale(hostEl) {
    if (!hostEl) return false;
    if (hostEl.getAttribute("data-yna4-sla-ui-rev") === SLA_UI_REV) {
      return false;
    }
    hostEl.removeAttribute("data-yna4-sla-ready");
    hostEl.textContent = "";
    hostEl.className = "yna4-shell-page-sla-inner";
    window.__YAN4_INIT_SHELL_PAGE_SLA__(hostEl);
    return true;
  }

  window.__YAN4_INIT_SHELL_PAGE_SLA__ = function (hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.className = "yna4-shell-page-sla-inner yna4-sla-mounted";
    hostEl.setAttribute("data-yna4-sla-ready", "1");
    hostEl.setAttribute("data-yna4-sla-ui-rev", SLA_UI_REV);
    slaEnsureStylesheet();

    var root = document.createElement("div");
    root.className = "yna4-sla-root";

    var toolbar = document.createElement("div");
    toolbar.className = "yna4-sla-toolbar";

    var btnAll = document.createElement("button");
    btnAll.type = "button";
    btnAll.className = "yna4-sla-btn yna4-sla-btn--primary";
    btnAll.title =
      "진척율(PO) + 이관 SLA Tracking + 직납 Direct SLA 피벗을 한 번에 조회";
    btnAll.textContent = "SLA 전체";

    var lookbackSel = document.createElement("select");
    lookbackSel.className = "yna4-sla-lookback";
    lookbackSel.title =
      "이관 WMS 조회 기간(오늘 포함). 88 에이징은 받은 SLA 파일. 직납·진척은 오늘 운영일만.";
    lookbackSel.setAttribute("aria-label", "이관 조회 기간");
    var lookbackDays = loadLookbackDays();
    var li, opt;
    for (li = 0; li < LOOKBACK_DAY_OPTIONS.length; li++) {
      opt = document.createElement("option");
      opt.value = String(LOOKBACK_DAY_OPTIONS[li]);
      opt.textContent = LOOKBACK_DAY_OPTIONS[li] + "일";
      if (LOOKBACK_DAY_OPTIONS[li] === lookbackDays) opt.selected = true;
      lookbackSel.appendChild(opt);
    }

    var btnStop = document.createElement("button");
    btnStop.type = "button";
    btnStop.className = "yna4-sla-btn";
    btnStop.textContent = "중지";

    var directDoneLbl = document.createElement("label");
    directDoneLbl.className = "yna4-sla-toolbar-check";
    directDoneLbl.title =
      "체크 시 직납·진척(PO·하차시간) 조회를 건너뛰고 이관 SLA만 조회합니다. PO·직납 Shrink 조회 없음. 30min Auto도 이 설정을 따릅니다 — Auto 사용 시 체크 해제 권장.";
    var directDoneCb = document.createElement("input");
    directDoneCb.type = "checkbox";
    directDoneCb.id = "yna4-sla-direct-done-skip";
    try {
      directDoneCb.checked =
        localStorage.getItem(SLA_DIRECT_DONE_SKIP_KEY) === "1";
    } catch (eLs) {}
    directDoneLbl.appendChild(directDoneCb);
    directDoneLbl.appendChild(document.createTextNode("직납완료"));

    var btnAuto = document.createElement("button");
    btnAuto.type = "button";
    btnAuto.className = "yna4-sla-btn yna4-sla-btn--toggle yna4-sla-btn--auto";
    btnAuto.setAttribute("aria-pressed", "false");
    btnAuto.textContent = "30min Auto";
    btnAuto.title =
      "30min Auto: run + capture now, then every 30 min → Inbox PNG×3 + teams.json";

    var statusEl = document.createElement("span");
    statusEl.className = "yna4-sla-status";
    statusEl.setAttribute("role", "status");
    statusEl.textContent = "준비";

    toolbar.appendChild(btnAll);
    toolbar.appendChild(lookbackSel);
    toolbar.appendChild(directDoneLbl);
    toolbar.appendChild(btnAuto);
    toolbar.appendChild(btnStop);
    toolbar.appendChild(statusEl);

    var scroll = document.createElement("div");
    scroll.className = "yna4-sla-scroll";

    var progressHost = document.createElement("div");
    progressHost.className = "yna4-sla-progress-host";

    var pivotHost = document.createElement("div");
    pivotHost.className = "yna4-sla-pivot-host";
    var placeholder = document.createElement("div");
    placeholder.className = "yna4-sla-placeholder";
    placeholder.textContent =
      "SLA 전체 버튼으로 진척·이관·직납 피벗을 한 번에 조회하세요.";
    pivotHost.appendChild(placeholder);

    var movingHost = document.createElement("div");
    movingHost.className = "yna4-sla-moving-host";

    scroll.appendChild(progressHost);
    scroll.appendChild(pivotHost);
    scroll.appendChild(movingHost);

    root.appendChild(toolbar);
    root.appendChild(scroll);
    hostEl.appendChild(root);

    function runPipelineWithButtons(runFn) {
      if (pipelineBusy) return;
      btnAll.disabled = true;
      lookbackSel.disabled = true;
      btnStop.disabled = false;
      runFn(statusEl, pivotHost, movingHost, progressHost).finally(function () {
        btnAll.disabled = false;
        lookbackSel.disabled = false;
        btnStop.disabled = true;
      });
    }

    lookbackSel.addEventListener("change", function () {
      saveLookbackDays(lookbackSel.value);
    });

    directDoneCb.addEventListener("change", function () {
      try {
        localStorage.setItem(
          SLA_DIRECT_DONE_SKIP_KEY,
          directDoneCb.checked ? "1" : "0"
        );
      } catch (eSave) {}
    });

    function updateSlaAutoToggleUi(on) {
      btnAuto.setAttribute("aria-pressed", on ? "true" : "false");
      btnAuto.classList.toggle("yna4-sla-btn--toggle-on", !!on);
      if (!on) {
        btnAuto.textContent = "30min Auto";
      } else {
        btnAuto.textContent = slaAutoButtonLabel(
          true,
          null,
          pipelineBusy || slaAutoCountdownRunning
        );
      }
    }

    function runSlaAutoPipelineNow() {
      if (pipelineBusy) {
        setSlaAutoCountdownRunning(true);
        return Promise.resolve({ ok: false, reason: "busy" });
      }
      btnAll.disabled = true;
      lookbackSel.disabled = true;
      btnStop.disabled = false;
      return handleSlaAutoRun().finally(function () {
        btnAll.disabled = false;
        lookbackSel.disabled = false;
        btnStop.disabled = true;
      });
    }

    function bootSlaAutoOff() {
      updateSlaAutoToggleUi(false);
      stopSlaAutoCountdown();
      syncSlaAutoSchedule(false);
    }

    bootSlaAutoOff();
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    ) {
      chrome.storage.local.set({ yna4_sla_auto_enabled_v1: false });
    }

    btnAuto.addEventListener("click", function () {
      var on = btnAuto.getAttribute("aria-pressed") !== "true";
      function applyAutoToggle() {
        updateSlaAutoToggleUi(on);
        syncSlaAutoSchedule(on);
        if (on) {
          statusEl.textContent = "30min Auto · starting…";
          startSlaAutoCountdown(btnAuto);
          setSlaAutoCountdownRunning(true);
          runSlaAutoPipelineNow();
        } else {
          stopSlaAutoCountdown();
          statusEl.textContent = "30min Auto off";
        }
      }
      if (
        typeof chrome !== "undefined" &&
        chrome.storage &&
        chrome.storage.local
      ) {
        chrome.storage.local.set(
          { yna4_sla_auto_enabled_v1: on },
          applyAutoToggle
        );
      } else {
        applyAutoToggle();
      }
    });

    btnAll.addEventListener("click", function () {
      runPipelineWithButtons(function (se, ph, mh, prh) {
        return runCombinedPivotPipeline(se, ph, mh, prh, {
          skipDirect: directDoneCb.checked,
        });
      });
    });

    btnStop.addEventListener("click", function () {
      if (!pipelineBusy) return;
      stopRequested = true;
      statusEl.textContent = "중지 요청…";
    });
    btnStop.disabled = true;
  };

  if (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    typeof chrome.runtime.onMessage !== "undefined"
  ) {
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (!message || message.type !== "yan4SlaAutoRun") {
        return false;
      }
      handleSlaAutoRun()
        .then(function (result) {
          sendResponse(result || { ok: true });
        })
        .catch(function (eAuto) {
          sendResponse({
            ok: false,
            error: String(eAuto && eAuto.message ? eAuto.message : eAuto),
          });
        });
      return true;
    });
  }

  function scheduleSlaUiMigrate() {
    function tick() {
      var host = document.querySelector(
        ".yna4-shell-page-sla-inner[data-yna4-sla-ready='1']"
      );
      if (host) remountSlaHostIfStale(host);
    }
    tick();
    setTimeout(tick, 0);
    setTimeout(tick, 400);
  }
  scheduleSlaUiMigrate();
})();
