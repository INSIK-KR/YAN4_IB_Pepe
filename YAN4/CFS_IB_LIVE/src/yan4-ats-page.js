/**
 * ATS — outbound 보충 대시보드 Barcode 수집 → inventory async/search(skuBarcode)
 * → 로케이션 필터 표. ⑨⑩ 버퍼존은 replenish/order/search 전체조회 교집합.
 */
(function () {
  "use strict";

  /** DOM/문구 변경 시 증가 — 확장만 새로고침해도 예전 ATS 마크업 자동 재구성 */
  var ATS_UI_REV = "78";
  window.__YAN4_ATS_UI_REV__ = ATS_UI_REV;

  var OUTBOUND_DASH = "https://outbound.coupang.com/workflow/nob/dashboard";
  var NEED_DETAIL_PATH = "/workflow/nob/v2/view/needToReplenish/detail/";
  var DETAIL_CUTLINE_CAP = 24;
  var OUTBOUND_PAGE_CAP = 500;
  var OUTBOUND_PAGE_DELAY_MS = 55;
  /** 보충 상세·목록 — RPA와 동일: select[name=pagingSize]=100 후 조회 */
  var OUTBOUND_LIST_PAGE_SIZE = "100";
  var INVENTORY_SEARCH =
    "https://inventory.coupang.com/async/inventory/search";
  var INVENTORY_LOG_SEARCH =
    "https://inventory.coupang.com/async/inventory/log/search";
  var INVENTORY_REFERER =
    "https://inventory.coupang.com/inventory/list?searched=true";
  var REPLENISH_ORDER_SEARCH =
    "https://inventory.coupang.com/async/replenish/order/search";
  var REPLENISH_ORDER_REFERER =
    "https://inventory.coupang.com/replenish/order/list";
  var REPLENISH_ORDER_PAGE_CAP = 80;
  var REPLENISH_ORDER_PAGE_DELAY_MS = 60;
  var INVENTORY_LOG_RANGE_DAYS = 7;
  var INVENTORY_SKU_PAGE_BASE = "https://inventory.coupang.com/sku/";
  var TEMP_ZONE_DELAY_MS = 90;
  var INBOUND_TRANSFER_PAGING_MAIN =
    "https://inbound.coupang.com/transfer/admin/operation/paging";
  var INBOUND_TRANSFER_PAGING_SAME_CENTER =
    "https://inbound.coupang.com/transfer/admin/operation/same-center/paging";
  var INBOUND_TRANSFER_REFERER =
    "https://inbound.coupang.com/transfer/admin/operation/list";
  var TRANSFER_TO_CENTER = "YAN4";
  function transferToCenter() {
    var api = window.__CFS_CENTER__;
    if (api && typeof api.activeId === "function") {
      var name = api.name(api.activeId());
      if (name && !/^\d+$/.test(name)) return name;
    }
    return TRANSFER_TO_CENTER;
  }
  /** 로케이션 앞자리. YAN4=1007, BUC2=81, GWJ1=177, GWJ3=140 */
  function atsActiveCenterId() {
    var api = window.__CFS_CENTER__;
    try {
      if (api && typeof api.activeId === "function") {
        var id = String(api.activeId() || "").replace(/\s+/g, "");
        if (/^\d+$/.test(id)) return id;
      }
    } catch (eCenterId) {}
    return "1007";
  }
  function atsMcrtPrefix() {
    return atsActiveCenterId() + "-MCRT0-";
  }
  var TRANSFER_SEARCH_DATE_TYPE = "PICKING_START_DATE";
  var TRANSFER_DATE_LOOKBACK_DAYS = 31;
  var TRANSFER_DELAY_MS = 100;
  var TRANSFER_PAGE_CAP = 8;
  var INVENTORY_PAGE_CAP = 40;
  var BARCODE_DELAY_MS = 120;
  var ATS_NO_STOCK_LABEL = "진열가능한 재고 없음";
  var ATS_NO_STOCK_QTY = "X";
  /** 보충마감 = 출고마감 - N분. 기본 50, 사용자가 툴바에서 바꿈 */
  var ATS_DEADLINE_OFFSET_DEFAULT_MIN = 50;
  var ATS_DEADLINE_OFFSET_MAX_MIN = 600;
  var ATS_DEADLINE_OFFSET_STORAGE_KEY = "yna4_ats_deadline_offset_min_v1";

  function normalizeAtsDeadlineOffset(v) {
    var n = parseInt(String(v == null ? "" : v).trim(), 10);
    if (!isFinite(n) || n < 0) return null;
    return Math.min(n, ATS_DEADLINE_OFFSET_MAX_MIN);
  }

  function getAtsDeadlineOffsetMin() {
    try {
      var n = normalizeAtsDeadlineOffset(
        localStorage.getItem(ATS_DEADLINE_OFFSET_STORAGE_KEY)
      );
      if (n != null) return n;
    } catch (eOff) {}
    return ATS_DEADLINE_OFFSET_DEFAULT_MIN;
  }

  function saveAtsDeadlineOffsetMin(n) {
    try {
      localStorage.setItem(ATS_DEADLINE_OFFSET_STORAGE_KEY, String(n));
    } catch (eOffSv) {}
  }
  var ATS_DONE_STORAGE_KEY = "yna4_ats_replenish_done_v2";
  var ATS_RCRT_DISPLAY_STORAGE_KEY = "yna4_ats_rcrt_display_done_v1";
  var ATS_RCRT_DISPLAY_TIME_STORAGE_KEY = "yna4_ats_rcrt_display_time_v1";
  var ATS_ADDITIONAL_REPL_STORAGE_KEY = "yna4_ats_additional_repl_v1";
  var ATS_GLOC_LOOKUP_DELAY_MS = 200;
  /** 조회실행 완료 시각 — 재고조회 시 이보다 이른 부분진열완료 → 추가보충 */
  var atsLastPipelineRunAt = NaN;
  /** @type {Set<string>} */
  var atsReplenishDoneKeys = new Set();
  /** @type {Set<string>} GC·RCRT 부분진열(이력 첫 음수 ≥ 보충수량) — 주황, 팀즈 복사 제외 */
  var atsRcrtDisplayDoneKeys = new Set();
  /** @type {Set<string>} 부분진열은 됐으나 조회실행 이후 보충 잔존 — CT 추가보충필요함 */
  var atsAdditionalReplenishKeys = new Set();
  /** @type {Object<string, number>} doneKey → 부분진열완료 epoch ms */
  var atsRcrtDisplayTimeByKey = Object.create(null);

  var ATS_LOC_PREFIXES = [
    "GC-",
    "1007-RCRT2-",
    "1007-RCRT22-",
    "1007-RCRT44-",
    "1007-RCRT4-",
    "1007-RCRT3-",
    "1007-RCRT88-",
    "1007-RCRT18-",
    "1007-MCRT0-",
    "1007-1FPZ",
    "1007-2CPZ",
    "1007-1CEZ",
  ];
  /**
   * BUC2(81) 직납 로케이션. 뒤 1-1~999 는 접두어에 포함.
   * 온도는 참고만 (31–44 chilled, 51–64 frozen, 71–74 ambient). CT 라벨은 전부 직납.
   */
  var BUC2_DIRECT_LOC_PREFIXES = [
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
  ];
  /** BUC2 버퍼. 뒤 번호(1-1 등)는 접두어로 포함. 온도는 로케이션이 정한다. */
  var BUC2_BUFFER_FROZEN = ["81-5FPZ"];
  var BUC2_BUFFER_CHILLED = ["81-3CFZ", "81-3CPZ", "81-4CPY"];
  var BUC2_BUFFER_AMBIENT = ["81-6APZ"];
  var BUC2_BUFFER_ROCKET = ["81-4CPR"];
  /** GWJ1(177) 직납. 177-RCRT3-1- ~ 177-RCRT3-8-. 9번은 에이징이라 제외 */
  var GWJ1_DIRECT_LOC_PREFIXES = [
    "177-RCRT3-1-",
    "177-RCRT3-2-",
    "177-RCRT3-3-",
    "177-RCRT3-4-",
    "177-RCRT3-5-",
    "177-RCRT3-6-",
    "177-RCRT3-7-",
    "177-RCRT3-8-",
  ];
  /** GWJ3(140) 직납. 140-RCRT1-1- ~ 140-RCRT1-7- */
  var GWJ3_DIRECT_LOC_PREFIXES = [
    "140-RCRT1-1-",
    "140-RCRT1-2-",
    "140-RCRT1-3-",
    "140-RCRT1-4-",
    "140-RCRT1-5-",
    "140-RCRT1-6-",
    "140-RCRT1-7-",
  ];
  /** GWJ1(177) 버퍼 */
  var GWJ1_BUFFER_FROZEN = ["177-2A1Z", "177-2A1Y", "177-3B1Z"];
  var GWJ1_BUFFER_CHILLED = ["177-4Z2P", "177-4Z1P", "177-4Z2M"];
  var GWJ1_BUFFER_AMBIENT = ["177-2B1Z", "177-3Z1P"];
  var GWJ1_BUFFER_ROCKET = ["177-RGVT", "177-2Z1P"];
  /** GWJ3(140). 71ZM은 71Z보다 긴 코드 */
  var GWJ3_BUFFER_FROZEN = ["140-71ZM", "140-71Z"];
  var GWJ3_BUFFER_CHILLED = ["140-21Z", "140-22Z", "140-31Z"];
  var GWJ3_BUFFER_AMBIENT = ["140-11Z"];
  var GWJ3_BUFFER_ROCKET = ["140-12Z"];
  /** YAN4 1007-RCRT18- 에 해당하는 토트 재고이동. SLA 에이징과 같은 구간 */
  var BUC2_TOTE_MOVE_PREFIXES = [
    "81-RCRT39-",
    "81-RCRT49-",
    "81-RCRT59-",
    "81-RCRT69-",
    "81-RCRT79-",
  ];
  var GWJ1_TOTE_MOVE_PREFIXES = ["177-RCRT3-9-"];
  var GWJ3_TOTE_MOVE_PREFIXES = ["140-RCRT3-5-"];
  /** 나머지 센터 버퍼·직납·에이징. 직납은 yan4-sla-page.js 목록과 같음. 없는 칸은 빈 목록 */
  var ATS_CENTER_PACKS = {
    /* 온도 구분 없이 RCRT1 만 사용. 4CZ 는 에그 버퍼, AML·CML 은 자동화 설비 */
    INC11: {
      frozen: [],
      chilled: [
        "123-ZC",
        "123-ZCM",
        "123-ZSR",
        "123-4CZ",
        "123-65ZP",
        "123-CML1",
        "123-CML2",
        "123-CML3",
      ],
      ambient: [
        "123-ZA",
        "123-ZAM",
        "123-ZAP",
        "123-AML1",
        "123-AML2",
        "123-AML3",
      ],
      rocket: [],
      egg: [
        "123-4CZ",
      ],
      direct: [
        "123-RCRT1-",
      ],
      tote: [],
    },
    INC12: {
      frozen: [],
      chilled: [],
      ambient: [],
      rocket: [],
      direct: [
        "166-RCRT21-",
        "166-RCRT22-",
        "166-RCRT23-",
        "166-RCRT24-",
        "166-RCRT25-",
        "166-RCRT41-",
        "166-RCRT42-",
        "166-RCRT43-",
        "166-RCRT44-",
        "166-RCRT45-",
        "166-RCRT31-",
        "166-RCRT32-",
        "166-RCRT33-",
        "166-RCRT34-",
        "166-RCRT35-",
        "166-RCRT51-",
        "166-RCRT52-",
        "166-RCRT53-",
        "166-RCRT54-",
        "166-RCRT55-",
        "166-RCRT61-",
        "166-RCRT62-",
        "166-RCRT63-",
        "166-RCRT64-",
        "166-RCRT65-",
      ],
      /* 에이징 RCRT30·RCRT40 (콘솔용). RCRT20 쉬링크대기는 제외 */
      tote: [
        "166-RCRT30-",
        "166-RCRT40-",
      ],
    },
    /* 직납 RCRT77-1~3 냉장, -10·-20·-30 냉동. 버퍼 없음.
       RCRT88-4 토트 재고 이동 (88-1 쉬링크, 88-2 계란 프리팩, 88-3 10도 프리팩은 제외) */
    SEN2: {
      frozen: [],
      chilled: [],
      ambient: [],
      rocket: [],
      direct: [
        "1016-RCRT77-1-",
        "1016-RCRT77-2-",
        "1016-RCRT77-3-",
        "1016-RCRT77-10-",
        "1016-RCRT77-20-",
        "1016-RCRT77-30-",
      ],
      tote: [
        "1016-RCRT88-4-",
      ],
    },
    INC15: {
      frozen: [
        "124-ZF",
      ],
      chilled: [
        "124-1DB",
      ],
      ambient: [
        "124-ZR",
      ],
      rocket: [],
      direct: [
        "124-RCRT10-",
        "124-RCRT1-",
        "124-RCRT18-",
      ],
      tote: [],
    },
    INC22: {
      frozen: [],
      chilled: [],
      ambient: [],
      rocket: [],
      direct: [
        "167-RCRT21-",
        "167-RCRT31-",
        "167-RCRT22-",
        "167-RCRT32-",
        "167-RCRT23-",
        "167-RCRT33-",
      ],
      tote: [],
    },
    INC37: {
      frozen: [],
      chilled: [],
      ambient: [],
      rocket: [],
      direct: [
        "184-RCRT10-",
        "184-RCRT1-",
        "184-RCRT18-",
      ],
      tote: [],
    },
    PYT2: {
      frozen: [
        "91-61Z",
        "91-71ZA",
      ],
      chilled: [
        "91-31Z",
        "91-31ZA",
        "91-51Z",
        "91-52N",
        "91-52M",
      ],
      ambient: [
        "91-11B",
      ],
      rocket: [],
      direct: [
        "91-RCRT1-",
      ],
      tote: [],
    },
    SIH1: {
      frozen: [],
      chilled: [
        "145-1CMZ",
      ],
      ambient: [],
      rocket: [
        "145-1APZ",
      ],
      direct: [
        "145-RCRT22-",
        "145-RCRT11-",
        "145-RCRT33-",
      ],
      tote: [
        "145-RCRT9-",
        "145-RCRT18-",
      ],
    },
    YON5: {
      frozen: [
        "135-ZFSL",
        "135-5ZA",
        "135-5ZAL",
        "135-5ZAP",
        "135-5ZLP",
        "135-6ZAP",
        "135-1ZFS",
        "135-1ZFP",
      ],
      chilled: [
        "135-1A1Z",
        "135-1ALZ",
        "135-1AZ",
        "135-ZDLP",
        "135-3ZDP",
        "135-6ZDM",
        "135-7ZDM",
      ],
      ambient: [
        "135-3ZMP",
      ],
      rocket: [
        "135-2ZBP",
      ],
      direct: [
        "135-RCRT21-",
        "135-RCRT22-",
        "135-RCRT23-",
        "135-RCRT24-",
        "135-RCRT25-",
        "135-RCRT26-",
        "135-RCRT27-",
        "135-RCRT29-",
        "135-RCRT11-",
        "135-RCRT12-",
        "135-RCRT13-",
        "135-RCRT14-",
        "135-RCRT15-",
        "135-RCRT16-",
        "135-RCRT17-",
        "135-RCRT19-",
        "135-RCRT31-",
        "135-RCRT32-",
        "135-RCRT33-",
        "135-RCRT34-",
        "135-RCRT35-",
        "135-RCRT36-",
        "135-RCRT37-",
        "135-RCRT39-",
      ],
      tote: [
        "135-RCRT18-",
        "135-RCRT40-",
      ],
    },
    GON1: {
      frozen: [
        "105-3CR",
        "105-3CW",
        "105-3CX",
        "105-3ZD",
        "105-3ZDP",
      ],
      chilled: [
        "105-2DZ",
        "105-2MW",
      ],
      ambient: [],
      rocket: [],
      direct: [
        "105-RCRT3-",
        "105-RCRT2-",
        "105-RCRT4-",
      ],
      tote: [],
    },
    CHW2: {
      frozen: [
        "148-1K1K",
      ],
      chilled: [
        "148-2G1Z",
        "148-2G2Z",
      ],
      ambient: [],
      rocket: [],
      direct: [
        "148-RCRT9-1-",
        "148-RCRT9-2-",
        "148-RCRT9-11-",
        "148-RCRT9-3-",
        "148-RCRT9-4-",
        "148-RCRT9-5-",
        "148-RCRT9-6-",
        "148-RCRT9-7-",
        "148-RCRT9-12-",
        "148-RCRT9-13-",
        "148-RCRT9-14-",
        "148-RCRT9-8-",
        "148-RCRT9-9-",
        "148-RCRT9-16-",
      ],
      tote: [],
    },
    DAJ1: {
      frozen: [],
      chilled: [
        "182-3A1Z",
      ],
      ambient: [],
      rocket: [],
      direct: [
        "182-RCRT3-1-",
        "182-RCRT3-2-",
        "182-RCRT3-3-",
        "182-RCRT3-4-",
        "182-RCRT3-5-",
        "182-RCRT3-6-",
        "182-RCRT3-7-",
        "182-RCRT3-8-",
        "182-RCRT3-9-",
        "182-RCRT3-10-",
      ],
      tote: [
        "182-RCRT4-",
      ],
    },
    GYS1: {
      frozen: [
        "1015-02BP",
      ],
      chilled: [],
      ambient: [],
      rocket: [],
      direct: [
        "1015-RCRT9-7-",
        "1015-RCRT9-1-",
        "1015-RCRT9-2-",
        "1015-RCRT9-3-",
        "1015-RCRT9-4-",
        "1015-RCRT9-5-",
        "1015-RCRT9-6-",
        "1015-RCRT9-8-",
      ],
      tote: [],
    },
    DAE4: {
      frozen: [],
      chilled: [],
      ambient: [],
      rocket: [
        "121-2NZ",
      ],
      direct: [
        "121-RCRT9-7-",
        "121-RCRT9-11-",
        "121-RCRT9-1-",
        "121-RCRT9-2-",
        "121-RCRT9-3-",
        "121-RCRT9-4-",
        "121-RCRT9-5-",
        "121-RCRT9-6-",
        "121-RCRT9-8-",
        "121-RCRT9-9-",
      ],
      tote: [],
    },
    GMH1: {
      frozen: [],
      chilled: [
        "78-1B",
        "78-1ZC",
        "78-3ZB",
      ],
      ambient: [
        "78-1ZD",
        "78-3ZA",
      ],
      rocket: [],
      direct: [
        "78-RCRT9-1-",
        "78-RCRT9-2-",
        "78-RCRT9-3-",
        "78-RCRT9-4-",
        "78-RCRT9-5-",
        "78-RCRT9-6-",
        "78-RCRT9-7-",
        "78-RCRT9-8-",
        "78-RCRT9-9-",
      ],
      tote: [
        "78-RCRT55-",
      ],
    },
  };

  function atsCenterBufferPack(center) {
    if (center === "BUC2") {
      return {
        frozen: BUC2_BUFFER_FROZEN,
        chilled: BUC2_BUFFER_CHILLED,
        ambient: BUC2_BUFFER_AMBIENT,
        rocket: BUC2_BUFFER_ROCKET,
        direct: BUC2_DIRECT_LOC_PREFIXES,
        tote: BUC2_TOTE_MOVE_PREFIXES,
      };
    }
    if (center === "GWJ1") {
      return {
        frozen: GWJ1_BUFFER_FROZEN,
        chilled: GWJ1_BUFFER_CHILLED,
        ambient: GWJ1_BUFFER_AMBIENT,
        rocket: GWJ1_BUFFER_ROCKET,
        direct: GWJ1_DIRECT_LOC_PREFIXES,
        tote: GWJ1_TOTE_MOVE_PREFIXES,
      };
    }
    if (center === "GWJ3") {
      return {
        frozen: GWJ3_BUFFER_FROZEN,
        chilled: GWJ3_BUFFER_CHILLED,
        ambient: GWJ3_BUFFER_AMBIENT,
        rocket: GWJ3_BUFFER_ROCKET,
        direct: GWJ3_DIRECT_LOC_PREFIXES,
        tote: GWJ3_TOTE_MOVE_PREFIXES,
      };
    }
    return ATS_CENTER_PACKS[center] || null;
  }

  function atsLocPrefixesForActiveCenter() {
    var mcrt = atsMcrtPrefix();
    var pack = atsCenterBufferPack(transferToCenter());
    if (pack) {
      return ["GC-"]
        .concat(pack.direct)
        .concat(pack.tote || [])
        .concat(pack.frozen)
        .concat(pack.chilled)
        .concat(pack.ambient)
        .concat(pack.rocket)
        .concat([mcrt]);
    }
    var base = [];
    var i;
    for (i = 0; i < ATS_LOC_PREFIXES.length; i++) {
      if (ATS_LOC_PREFIXES[i] === "1007-MCRT0-") continue;
      base.push(ATS_LOC_PREFIXES[i]);
    }
    base.push(mcrt);
    return base;
  }
  var ATS_BUFFER_LOC_PREFIX_FROZEN = "1007-1FPZ";
  var ATS_BUFFER_LOC_PREFIX_CHILLED = "1007-2CPZ";
  var ATS_BUFFER_LOC_PREFIX_EGG = "1007-1CEZ";
  var ATS_BUFFER_LOC_PREFIXES = [
    ATS_BUFFER_LOC_PREFIX_FROZEN,
    ATS_BUFFER_LOC_PREFIX_CHILLED,
    ATS_BUFFER_LOC_PREFIX_EGG,
  ];

  var stopRequested = false;

  function normKey(s) {
    return String(s || "").replace(/\s+/g, "").toLowerCase();
  }

  function normalizeMergeGcKey(v) {
    if (v == null || v === "") return "";
    return String(v)
      .replace(/\u00a0/g, " ")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  function normalizeSkuJoinKey(v) {
    var s = String(v != null ? v : "")
      .replace(/^\uFEFF+/, "")
      .replace(/\u200b|\u200c|\u200d|\ufeff/g, "")
      .replace(/\u00a0/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    if (
      s.length >= 2 &&
      s.charCodeAt(0) === 34 &&
      s.charCodeAt(s.length - 1) === 34
    ) {
      s = s.slice(1, -1).trim().replace(/\s+/g, " ");
    }
    if (s === "") return "";
    var noComma = s.replace(/,/g, "");
    var n = Number(noComma);
    if (noComma !== "" && isFinite(n) && String(n) === noComma) {
      return String(Math.trunc(n));
    }
    return s;
  }

  /** 로컬 mergeReplenishDoneKey 와 동일 — SKU|GC 행 단위 완료(초록). */
  function atsReplenishDoneKey(sku, gcRaw) {
    var skuPart =
      String(sku || "").trim() === ""
        ? "__EMPTY_SKU__"
        : normalizeSkuJoinKey(sku);
    var gcNorm = normalizeMergeGcKey(gcRaw);
    var gcPart = gcNorm === "" ? "__NO_GC__" : gcNorm;
    return skuPart + "|" + gcPart;
  }

  function loadKeySetFromStorage(storageKey, targetSet) {
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) return;
      var j = JSON.parse(raw);
      targetSet.clear();
      if (Array.isArray(j)) {
        var i;
        for (i = 0; i < j.length; i++) {
          targetSet.add(String(j[i]));
        }
        return;
      }
      if (j && typeof j === "object" && Array.isArray(j.m)) {
        for (var k = 0; k < j.m.length; k++) {
          targetSet.add(String(j.m[k]));
        }
      }
    } catch (eLoad) {}
  }

  function saveKeySetToStorage(storageKey, sourceSet) {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ m: Array.from(sourceSet) })
      );
    } catch (eSave) {}
  }

  function loadTimeMapFromStorage(storageKey, targetMap) {
    var k;
    for (k in targetMap) {
      if (Object.prototype.hasOwnProperty.call(targetMap, k)) {
        delete targetMap[k];
      }
    }
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) return;
      var j = JSON.parse(raw);
      var pairs = j && j.m;
      if (!Array.isArray(pairs)) return;
      var i, pair;
      for (i = 0; i < pairs.length; i++) {
        pair = pairs[i];
        if (!pair || pair.length < 2) continue;
        targetMap[String(pair[0])] = Number(pair[1]);
      }
    } catch (eTm) {}
  }

  function saveTimeMapToStorage(storageKey, sourceMap) {
    try {
      var pairs = [];
      var k;
      for (k in sourceMap) {
        if (
          Object.prototype.hasOwnProperty.call(sourceMap, k) &&
          isFinite(sourceMap[k])
        ) {
          pairs.push([k, sourceMap[k]]);
        }
      }
      localStorage.setItem(storageKey, JSON.stringify({ m: pairs }));
    } catch (eSvTm) {}
  }

  function loadAtsReplenishDoneFromStorage() {
    loadKeySetFromStorage(ATS_DONE_STORAGE_KEY, atsReplenishDoneKeys);
    loadKeySetFromStorage(ATS_RCRT_DISPLAY_STORAGE_KEY, atsRcrtDisplayDoneKeys);
    loadKeySetFromStorage(ATS_ADDITIONAL_REPL_STORAGE_KEY, atsAdditionalReplenishKeys);
    loadTimeMapFromStorage(
      ATS_RCRT_DISPLAY_TIME_STORAGE_KEY,
      atsRcrtDisplayTimeByKey
    );
  }

  function saveAtsReplenishDoneToStorage() {
    saveKeySetToStorage(ATS_DONE_STORAGE_KEY, atsReplenishDoneKeys);
  }

  function saveAtsRcrtDisplayDoneToStorage() {
    saveKeySetToStorage(ATS_RCRT_DISPLAY_STORAGE_KEY, atsRcrtDisplayDoneKeys);
  }

  function saveAtsAdditionalReplToStorage() {
    saveKeySetToStorage(ATS_ADDITIONAL_REPL_STORAGE_KEY, atsAdditionalReplenishKeys);
  }

  function saveAtsRcrtDisplayTimeToStorage() {
    saveTimeMapToStorage(
      ATS_RCRT_DISPLAY_TIME_STORAGE_KEY,
      atsRcrtDisplayTimeByKey
    );
  }

  function clearAtsReplenishDoneKeys() {
    atsReplenishDoneKeys.clear();
    atsRcrtDisplayDoneKeys.clear();
    atsAdditionalReplenishKeys.clear();
    atsRcrtDisplayTimeByKey = Object.create(null);
    saveAtsReplenishDoneToStorage();
    saveAtsRcrtDisplayDoneToStorage();
    saveAtsAdditionalReplToStorage();
    saveAtsRcrtDisplayTimeToStorage();
  }

  /** 팀즈 복사 등에서 제외: 초록(재고없음) 또는 주황(RCRT 진열완료) */
  function atsRowExcludedFromTeamsExport(doneKey) {
    if (!doneKey) return false;
    return (
      atsReplenishDoneKeys.has(doneKey) || atsRcrtDisplayDoneKeys.has(doneKey)
    );
  }

  function atsMarkReplenishDoneKeys(doneKeyList) {
    if (!Array.isArray(doneKeyList)) return { marked: 0 };
    var marked = 0;
    var i, k;
    for (i = 0; i < doneKeyList.length; i++) {
      k = String(doneKeyList[i] || "").trim();
      if (!k || k.indexOf("|") < 0) continue;
      if (k.indexOf("__EMPTY_SKU__|") === 0) continue;
      if (!atsReplenishDoneKeys.has(k)) marked += 1;
      atsReplenishDoneKeys.add(k);
    }
    saveAtsReplenishDoneToStorage();
    return { marked: marked };
  }

  function atsMarkRcrtDisplayDoneKeys(doneKeyList) {
    if (!Array.isArray(doneKeyList)) return { marked: 0 };
    var marked = 0;
    var i, k;
    for (i = 0; i < doneKeyList.length; i++) {
      k = String(doneKeyList[i] || "").trim();
      if (!k || k.indexOf("|") < 0) continue;
      if (k.indexOf("__EMPTY_SKU__|") === 0) continue;
      if (!atsRcrtDisplayDoneKeys.has(k)) marked += 1;
      atsRcrtDisplayDoneKeys.add(k);
    }
    saveAtsRcrtDisplayDoneToStorage();
    return { marked: marked };
  }

  function parseObQtyNumber(v) {
    if (v == null || v === "") return NaN;
    var n = parseFloat(String(v).replace(/,/g, "").trim());
    return isFinite(n) ? n : NaN;
  }

  function formatObQtyNumber(n) {
    if (!isFinite(n)) return "";
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return String(n);
  }

  /** 대시보드 패널 머리글 — 행 수가 아니라 보충(obQty) 유닛 합. */
  function sumAtsObQtyUnits(rows) {
    var total = 0;
    var i, n;
    for (i = 0; i < (rows || []).length; i++) {
      n = parseObQtyNumber(rows[i] && rows[i].obQty);
      if (isFinite(n)) total += n;
    }
    return total;
  }

  /**
   * ATS 마감 "HH:MM" → 정렬용 분. 6시간 전 ~ 18시간 뒤를 시간순으로 —
   * 자정 넘는 마감(00:30 컷 → 23:30 등)이 문자열 비교로 맨 뒤로 가던 것 방지.
   */
  function atsDeadlineRelMinutes(hm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || "").trim());
    if (!m) return Infinity;
    var mins = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    var now = new Date();
    var from = now.getHours() * 60 + now.getMinutes() - 360;
    return (((mins - from) % 1440) + 1440) % 1440;
  }

  /** outbound 동일 Barcode 중복 행 — 보충수량 합산(로컬 aggregateWorkflowRowsBySkuId Unit 합과 동일). */
  function mergeOutboundItemFields(into, item) {
    if (!into || !item) return into;
    var a = parseObQtyNumber(into.obQty);
    var b = parseObQtyNumber(item.obQty);
    if (isFinite(a) || isFinite(b)) {
      into.obQty = formatObQtyNumber((isFinite(a) ? a : 0) + (isFinite(b) ? b : 0));
    } else {
      into._dupRows = (into._dupRows || 1) + 1;
      into.obQty = String(into._dupRows);
    }
    if (
      item.atsDeadline &&
      (!into.atsDeadline ||
        atsDeadlineRelMinutes(item.atsDeadline) <
          atsDeadlineRelMinutes(into.atsDeadline))
    ) {
      into.atsDeadline = item.atsDeadline;
    }
    return into;
  }

  function inventoryRowQtyNumber(row) {
    return parseObQtyNumber(row && row.qty);
  }

  function pickInventoryExpiryRaw(row) {
    if (!row || typeof row !== "object") return "";
    var cands = [
      row.expiredAt,
      row.expireAt,
      row.expirationDate,
      row.expireDate,
      row.lpnExpiredAt,
      row.expiryDate,
      row.lpnExpireDate,
    ];
    var lpn = row.lpnDto || row.lpn || null;
    if (lpn && typeof lpn === "object") {
      cands.push(
        lpn.expiredAt,
        lpn.expireAt,
        lpn.expirationDate,
        lpn.expireDate
      );
    }
    var i, v;
    for (i = 0; i < cands.length; i++) {
      v = cands[i];
      if (v == null || v === "") continue;
      return String(v).trim();
    }
    v = String(row.lpnId != null ? row.lpnId : row.lpnBarcode || "").trim();
    // LPN 번호 속 아무 숫자 8자리를 날짜로 보지 않도록 — 실제 날짜(2000~2099년)일 때만
    var mDt =
      /((?:20)\d{2})[-./]?(0[1-9]|1[0-2])[-./]?(0[1-9]|[12]\d|3[01])/.exec(v);
    if (mDt) return mDt[1] + "-" + mDt[2] + "-" + mDt[3];
    return "";
  }

  /** YYYY-MM-DD 비교키. 없으면 맨 뒤. */
  function expirySortKey(raw) {
    var s = String(raw || "").trim();
    if (!s) return "\uffff";
    var m = /(\d{4})[-./년](\d{1,2})[-./월](\d{1,2})/.exec(s);
    if (m) {
      return m[1] + "-" + pad2(parseInt(m[2], 10)) + "-" + pad2(parseInt(m[3], 10));
    }
    var digits = s.replace(/\D/g, "");
    if (digits.length >= 8) {
      return digits.slice(0, 4) + "-" + digits.slice(4, 6) + "-" + digits.slice(6, 8);
    }
    var n = Number(s);
    if (isFinite(n) && n > 10000000000) {
      var d = new Date(n);
      if (!isNaN(d.getTime())) {
        return (
          d.getFullYear() +
          "-" +
          pad2(d.getMonth() + 1) +
          "-" +
          pad2(d.getDate())
        );
      }
    }
    return "\uffff";
  }

  function inventoryExpirySortKey(row) {
    return expirySortKey((row && row._expiredAt) || "");
  }

  /** 버퍼존 우선 → 비버퍼는 LPN 유통기한 짧은 순(FIFO) → 재고 내림차순. */
  function sortInventoryMatchesBufferFirst(matched) {
    return matched.slice().sort(function (a, b) {
      var ba = atsLocationIsBufferZone(a && a.location) ? 0 : 1;
      var bb = atsLocationIsBufferZone(b && b.location) ? 0 : 1;
      if (ba !== bb) return ba - bb;
      var ea = inventoryExpirySortKey(a);
      var eb = inventoryExpirySortKey(b);
      if (ea !== eb) return ea < eb ? -1 : 1;
      var qa = inventoryRowQtyNumber(a);
      var qb = inventoryRowQtyNumber(b);
      var na = isFinite(qa) ? qa : 0;
      var nb = isFinite(qb) ? qb : 0;
      if (nb !== na) return nb - na;
      return String((a && a.location) || "").localeCompare(
        String((b && b.location) || "")
      );
    });
  }

  /** 버퍼 우선 후 FIFO 누적. 보충수량 채울 때까지 로케이션 선택. */
  function selectInventoryMatchesForObQty(matched, obQtyNum) {
    if (!matched || !matched.length) return [];
    if (matched.length === 1) return matched.slice();
    var sorted = sortInventoryMatchesBufferFirst(matched);
    if (!isFinite(obQtyNum) || obQtyNum <= 0) return [sorted[0]];
    var out = [];
    var cum = 0;
    var i, q;
    for (i = 0; i < sorted.length; i++) {
      out.push(sorted[i]);
      q = inventoryRowQtyNumber(sorted[i]);
      if (isFinite(q)) cum += q;
      if (cum >= obQtyNum) break;
    }
    return out;
  }

  /** 로컬 allocateUnitDisplayAcrossSlaEntries — GC·RCRT 행마다 보충수량 배분. */
  function allocateObQtyAcrossInventoryRows(rows, obQtyNum, obQtyDisplayFallback) {
    if (!rows || !rows.length) return [];
    if (!isFinite(obQtyNum) || obQtyNum <= 0) {
      var fallback =
        obQtyDisplayFallback != null && obQtyDisplayFallback !== ""
          ? String(obQtyDisplayFallback)
          : "";
      return rows.map(function () {
        return fallback;
      });
    }
    var remaining = obQtyNum;
    var out = [];
    var i, q, alloc;
    for (i = 0; i < rows.length; i++) {
      if (remaining <= 0) {
        out.push("0");
        continue;
      }
      q = inventoryRowQtyNumber(rows[i]);
      if (isFinite(q) && q > 0) {
        alloc = Math.min(q, remaining);
      } else if (i === rows.length - 1) {
        alloc = remaining;
      } else {
        alloc = 0;
      }
      remaining -= alloc;
      out.push(formatObQtyNumber(alloc));
    }
    return out;
  }

  function formatYmdDate(d) {
    return (
      d.getFullYear() +
      "-" +
      pad2(d.getMonth() + 1) +
      "-" +
      pad2(d.getDate())
    );
  }

  function buildInventoryLogSearchUrl(inventoryId) {
    var id = String(inventoryId || "").replace(/\D/g, "");
    if (!id) return "";
    var end = new Date();
    var start = new Date(end.getTime());
    start.setDate(start.getDate() - (INVENTORY_LOG_RANGE_DAYS - 1));
    var p = new URLSearchParams();
    p.set("inventoryId", id);
    p.set("searchStartAt", formatYmdDate(start));
    p.set("searchEndAt", formatYmdDate(end));
    p.set("rangeDays", String(INVENTORY_LOG_RANGE_DAYS));
    p.set("page", "0");
    p.set("pageSize", "20");
    return INVENTORY_LOG_SEARCH + "?" + p.toString();
  }

  function inventoryLogFetch(inventoryId) {
    var id = String(inventoryId || "").replace(/\D/g, "");
    if (!id) return Promise.reject(new Error("inventoryId 없음"));
    var url = buildInventoryLogSearchUrl(id);
    var referer =
      "https://inventory.coupang.com/inventory/log/inventory/" + id;
    return inventoryGet(url, { referer: referer, tag: "inv-log" });
  }

  /** 부분진열(주황): 이력 첫 음수 변동 절대값 ≥ 보충수량 (GC·RCRT 동일) */
  function atsLogIndicatesPartialDisplay(dispQtyAbs, obQty) {
    return (
      isFinite(dispQtyAbs) &&
      isFinite(obQty) &&
      obQty > 0 &&
      dispQtyAbs >= obQty
    );
  }

  function parseLogEntryTimeMs(entry) {
    if (!entry) return NaN;
    var keys = [
      "createdAt",
      "updatedAt",
      "changeAt",
      "eventAt",
      "occurredAt",
      "transactionAt",
      "modifiedAt",
      "createdDate",
      "changeDate",
    ];
    var i, v, t;
    for (i = 0; i < keys.length; i++) {
      v = entry[keys[i]];
      if (v == null || v === "") continue;
      if (typeof v === "number" && isFinite(v)) {
        return v < 1e12 ? v * 1000 : v;
      }
      t = Date.parse(String(v));
      if (isFinite(t)) return t;
    }
    return NaN;
  }

  /** 재고이력 음수 누적 ≥ 보충수량 시 완료 시각·수량 (추가보충 판정용). */
  function parsePartialDisplayInfoFromLog(text, obQty) {
    var out = {
      completed: false,
      completedAtMs: NaN,
      displayQty: NaN,
    };
    try {
      var j = JSON.parse(String(text || ""));
      if (!j || j.success === false) return out;
      var content = j.result && j.result.content;
      if (!Array.isArray(content)) return out;
      var events = [];
      var i, cq, tms;
      for (i = 0; i < content.length; i++) {
        cq = Number(
          content[i] && content[i].changeQuantity != null
            ? content[i].changeQuantity
            : NaN
        );
        if (!isFinite(cq) || cq >= 0) continue;
        tms = parseLogEntryTimeMs(content[i]);
        events.push({ qty: Math.abs(cq), tms: tms, idx: i });
      }
      if (!events.length) return out;
      if (!isFinite(obQty) || obQty <= 0) return out;
      events.sort(function (a, b) {
        if (isFinite(a.tms) && isFinite(b.tms)) {
          if (a.tms !== b.tms) return a.tms - b.tms;
          return a.idx - b.idx;
        }
        if (isFinite(a.tms)) return -1;
        if (isFinite(b.tms)) return 1;
        return a.idx - b.idx;
      });
      var cum = 0;
      for (i = 0; i < events.length; i++) {
        cum += events[i].qty;
        if (cum >= obQty) {
          out.completed = true;
          out.displayQty = cum;
          out.completedAtMs = events[i].tms;
          return out;
        }
      }
      return out;
    } catch (ePd) {
      return out;
    }
  }

  function formatAtsHmFromMs(ms) {
    if (!isFinite(ms)) return "";
    var d = new Date(ms);
    if (isNaN(d.getTime())) return "";
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function parseInventoryHitsAtLocation(text, locationBarcode) {
    var hits = [];
    var want = normalizeMergeGcKey(locationBarcode);
    if (!want) return hits;
    var j;
    try {
      j = JSON.parse(String(text || ""));
    } catch (eP) {
      return hits;
    }
    if (!j || j.success === false) return hits;
    var content = j.result && j.result.content;
    if (!Array.isArray(content)) return hits;
    var i, row, loc, dto, invId;
    for (i = 0; i < content.length; i++) {
      row = content[i];
      if (!row) continue;
      loc = normalizeMergeGcKey(row.locationBarcode);
      if (loc !== want) continue;
      dto = row.skuDto || {};
      invId =
        row.inventoryId != null
          ? String(row.inventoryId).replace(/\D/g, "")
          : "";
      hits.push({
        inventoryId: invId,
        skuId: String(dto.skuId != null ? dto.skuId : ""),
        barcode: String(dto.skuBarcode || "").trim(),
        location: String(row.locationBarcode || "").trim(),
      });
    }
    return hits;
  }

  function pickInventoryHitForRow(hits, job) {
    if (!hits || !hits.length || !job) return null;
    var bc = normalizeBarcode(job.barcode);
    var sku = normalizeSkuJoinKey(job.skuId);
    var i, h;
    if (bc) {
      for (i = 0; i < hits.length; i++) {
        h = hits[i];
        if (normalizeBarcode(h.barcode) === bc && h.inventoryId) return h;
      }
      return null;
    }
    if (sku) {
      for (i = 0; i < hits.length; i++) {
        h = hits[i];
        if (normalizeSkuJoinKey(h.skuId) === sku && h.inventoryId) return h;
      }
    }
    return null;
  }

  function rowAlreadyMarkedForLookup(row) {
    var dk = atsReplenishDoneKey(row.skuId, row.location);
    return (
      atsReplenishDoneKeys.has(dk) || atsRcrtDisplayDoneKeys.has(dk)
    );
  }


  function normalizeBarcode(raw) {
    var s = String(raw || "").replace(/\u00a0/g, " ").trim();
    if (!s) return "";
    var compact = s.replace(/\s+/g, "");
    var alnum = compact.replace(/[^A-Za-z0-9]/g, "");
    if (!alnum) return "";
    if (/[A-Za-z]/.test(alnum)) return alnum.toUpperCase();
    var digits = alnum.replace(/[^\d]/g, "");
    if (digits.length >= 8 && digits.length <= 20) return digits;
    return alnum;
  }

  function isLikelyBarcode(s) {
    var t = normalizeBarcode(s);
    if (!t) return false;
    if (/^\d{8,20}$/.test(t)) return true;
    if (/^[A-Z]{1,4}\d{4,18}$/.test(t)) return true;
    if (/^[A-Z0-9]{5,24}$/.test(t) && /[A-Z]/.test(t) && /\d/.test(t)) return true;
    return false;
  }

  var atsLocPrefixesSorted = null;
  var atsLocPrefixesSortedFor = "";

  function getAtsLocPrefixesSorted() {
    var center = transferToCenter();
    if (!atsLocPrefixesSorted || atsLocPrefixesSortedFor !== center) {
      atsLocPrefixesSortedFor = center;
      atsLocPrefixesSorted = atsLocPrefixesForActiveCenter()
        .slice()
        .sort(function (a, b) {
          return String(b).length - String(a).length;
        });
    }
    return atsLocPrefixesSorted;
  }

  /** 긴 접두어 우선(RCRT88이 RCRT2보다 먼저). 1007-RCRT88- 또는 1007-RCRT88 형식 모두 허용 */
  function atsLocationMatches(loc) {
    var s = String(loc || "")
      .replace(/\u00a0/g, " ")
      .trim()
      .toUpperCase();
    if (!s) return false;
    var prefixes = getAtsLocPrefixesSorted();
    var i, p, bare, next;
    for (i = 0; i < prefixes.length; i++) {
      p = String(prefixes[i]).toUpperCase();
      if (p && s.indexOf(p) === 0) return true;
      bare = p.replace(/-+$/, "");
      if (bare.length < 6 || s.indexOf(bare) !== 0) continue;
      if (s.length === bare.length) return true;
      next = s.charAt(bare.length);
      if (next === "-" || next === "." || next === "_") return true;
    }
    return false;
  }

  function findColIndex(headers, candidates) {
    var h = headers.map(function (x, i) {
      return { n: normKey(x), i: i };
    });
    var c, j;
    for (c = 0; c < candidates.length; c++) {
      var cn = normKey(candidates[c]);
      for (j = 0; j < h.length; j++) {
        if (
          h[j].n === cn ||
          h[j].n.indexOf(cn) >= 0 ||
          cn.indexOf(h[j].n) >= 0
        ) {
          return h[j].i;
        }
      }
    }
    return -1;
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
        data: opt.data != null ? opt.data : undefined,
        timeout: opt.timeout || 45000,
        onload: function (r) {
          if (r.status >= 200 && r.status < 400) {
            resolve(String(r.responseText || ""));
          } else {
            reject(new Error("HTTP " + r.status + (opt.tag ? " · " + opt.tag : "")));
          }
        },
        onerror: function () {
          reject(new Error("네트워크" + (opt.tag ? " · " + opt.tag : "")));
        },
        ontimeout: function () {
          reject(new Error("타임아웃" + (opt.tag ? " · " + opt.tag : "")));
        },
      });
    });
  }

  function inventoryGet(url, opt) {
    opt = opt || {};
    var referer = opt.referer || INVENTORY_REFERER;
    var accept =
      opt.accept || "application/json, text/javascript, */*; q=0.01";
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
                tag: opt.tag || "inventory",
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
        tag: opt.tag || "inventory",
      }).then(resolve, reject);
    });
  }

  function inventoryFetch(url) {
    return inventoryGet(url, {});
  }

  /** inventory POST (form-urlencoded) — replenish/order/search 등 */
  function inventoryPostForm(url, formBody, opt) {
    opt = opt || {};
    var referer = opt.referer || INVENTORY_REFERER;
    var accept =
      opt.accept || "application/json, text/javascript, */*; q=0.01";
    var contentType =
      opt.contentType ||
      "application/x-www-form-urlencoded; charset=UTF-8";
    var payload = String(formBody != null ? formBody : "");
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
                method: "POST",
                url: url,
                data: payload,
                headers: {
                  Accept: accept,
                  Referer: referer,
                  "Content-Type": contentType,
                  "X-Requested-With": "XMLHttpRequest",
                },
                tag: opt.tag || "inventory-post",
              }).then(resolve, reject);
              return;
            }
            if (res && res.ok && res.status >= 200 && res.status < 400) {
              resolve(String(res.body || ""));
              return;
            }
            reject(
              new Error((res && res.error) || "inventory POST 실패")
            );
          }
        );
        return;
      }
      gmXhr({
        method: "POST",
        url: url,
        data: payload,
        headers: {
          Accept: accept,
          Referer: referer,
          "Content-Type": contentType,
          "X-Requested-With": "XMLHttpRequest",
        },
        tag: opt.tag || "inventory-post",
      }).then(resolve, reject);
    });
  }

  function buildReplenishOrderSearchBody(page) {
    var p = new URLSearchParams();
    p.set("shippingCompanyId", "");
    p.set("shippingType", "");
    p.set("shippedCutLine", "");
    p.set("skuBarcode", "");
    p.set("skuId", "");
    p.set("externalSkuId", "");
    p.set("page", String(page != null ? page : 0));
    return p.toString();
  }

  function emptyReplenishOrderIndex() {
    return {
      rows: [],
      bySku: Object.create(null),
      byBarcode: Object.create(null),
    };
  }

  function parseReplenishOrderPage(jsonText) {
    var rows = [];
    var totalPages = 1;
    var j;
    try {
      j = JSON.parse(String(jsonText || ""));
    } catch (eJ) {
      return { rows: rows, totalPages: totalPages };
    }
    if (!j || j.success === false) {
      return { rows: rows, totalPages: totalPages };
    }
    var result = j.result || {};
    var pageView = result.pageView || null;
    var list = result.targetList;
    if (!Array.isArray(list) || !list.length) {
      list = pageView && Array.isArray(pageView.content) ? pageView.content : [];
    }
    if (pageView && pageView.totalPages != null) {
      totalPages = Number(pageView.totalPages);
      if (!isFinite(totalPages) || totalPages < 1) totalPages = 1;
    }
    var i, r, loc, sku, bc, bufQty, replQty;
    for (i = 0; i < list.length; i++) {
      r = list[i];
      if (!r) continue;
      loc = String(r.locationFullName || "").trim();
      sku = normalizeSkuJoinKey(r.skuId != null ? r.skuId : "");
      bc = normalizeBarcode(r.barcode);
      bufQty =
        r.bufferQuantity != null && isFinite(Number(r.bufferQuantity))
          ? String(r.bufferQuantity)
          : "";
      replQty =
        r.replenishQuantity != null && isFinite(Number(r.replenishQuantity))
          ? String(r.replenishQuantity)
          : "";
      rows.push({
        skuId: sku || String(r.skuId != null ? r.skuId : ""),
        externalSkuId: normalizeSkuJoinKey(
          r.externalSkuId != null ? r.externalSkuId : ""
        ),
        barcode: bc,
        name: String(r.unitDescription || "").trim(),
        location: loc,
        qty: bufQty,
        obQty: replQty,
        _expiredAt: String(r.expiredAt || "").trim(),
        lpnId: r.lpnId != null ? String(r.lpnId) : "",
        fromBufferOrder: true,
      });
    }
    return { rows: rows, totalPages: totalPages };
  }

  function pushReplenishOrderIndex(index, row) {
    if (!index || !row) return;
    var dedupeKey =
      String(row.skuId || "") +
      "|" +
      String(row.location || "") +
      "|" +
      String(row.lpnId || "") +
      "|" +
      String(row._expiredAt || "") +
      "|" +
      String(row.obQty || "");
    if (!index._seen) index._seen = Object.create(null);
    if (index._seen[dedupeKey]) return;
    index._seen[dedupeKey] = true;
    index.rows.push(row);
    function addMap(map, key) {
      var k = String(key || "");
      if (!k) return;
      if (!map[k]) map[k] = [];
      map[k].push(row);
    }
    addMap(index.bySku, normalizeSkuJoinKey(row.skuId));
    addMap(index.bySku, normalizeSkuJoinKey(row.externalSkuId));
    addMap(index.byBarcode, normalizeBarcode(row.barcode));
  }

  function sortBufferOrderRowsByExpiry(rows) {
    return (rows || []).slice().sort(function (a, b) {
      var ea = String((a && a._expiredAt) || "").trim() || "\uffff";
      var eb = String((b && b._expiredAt) || "").trim() || "\uffff";
      if (ea !== eb) return ea < eb ? -1 : 1;
      return String((a && a.location) || "").localeCompare(
        String((b && b.location) || ""),
        "ko"
      );
    });
  }

  /** 워크플로우 barcode·inventory meta sku 로 버퍼존 주문행 조회 (유통기한 짧은 순). */
  function lookupBufferOrderRows(index, barcode, invMeta) {
    if (!index || !index.rows || !index.rows.length) return [];
    var seen = Object.create(null);
    var out = [];
    function take(list) {
      var i, r, k;
      for (i = 0; i < (list || []).length; i++) {
        r = list[i];
        if (!r) continue;
        k =
          String(r.skuId || "") +
          "|" +
          String(r.location || "") +
          "|" +
          String(r.lpnId || "") +
          "|" +
          String(r._expiredAt || "");
        if (seen[k]) continue;
        seen[k] = true;
        out.push(r);
      }
    }
    take(index.byBarcode[normalizeBarcode(barcode)]);
    if (invMeta) {
      take(index.bySku[normalizeSkuJoinKey(invMeta.skuId)]);
    }
    return sortBufferOrderRowsByExpiry(out);
  }

  /** 버퍼존 주문행의 버퍼재고 합 — 일반 로케이션 보충 차감용 */
  function sumBufferOrderSupplyQty(bufOrderRows) {
    if (!bufOrderRows || !bufOrderRows.length) return NaN;
    var total = 0;
    var found = false;
    var i, q;
    for (i = 0; i < bufOrderRows.length; i++) {
      q = parseObQtyNumber(bufOrderRows[i] && bufOrderRows[i].qty);
      if (!isFinite(q) || q <= 0) continue;
      total += q;
      found = true;
    }
    return found ? total : NaN;
  }

  function bufferOrderRowToAtsRow(bufRow, ob) {
    var base = {
      location: String((bufRow && bufRow.location) || "").trim(),
      inventoryId: "",
      skuId: String((bufRow && bufRow.skuId) || ""),
      barcode: String((bufRow && bufRow.barcode) || "").trim(),
      name: String((bufRow && bufRow.name) || "").trim(),
      obQty: String((bufRow && bufRow.obQty) || ""),
      unloadTime: "",
      loadTime: "",
      status: "",
      vehicleNo: "",
      tempZone: "",
      gc: "",
      ct: "",
      priority: "",
      atsDeadline: "",
      qty: String((bufRow && bufRow.qty) || ""),
      _expiredAt: String((bufRow && bufRow._expiredAt) || "").trim(),
      fromBufferOrder: true,
    };
    var row = applyOutboundFields(base, ob);
    // ⑨⑩: 재고=버퍼수량, 보충=보충수량 (워크플로우 obQty로 덮어쓰지 않음)
    row.qty = String((bufRow && bufRow.qty) || "");
    row.obQty = String((bufRow && bufRow.obQty) || "");
    return row;
  }

  async function fetchAllReplenishOrderIndex(onProgress) {
    var index = emptyReplenishOrderIndex();
    var page = 0;
    var totalPages = 1;
    while (!stopRequested && page < REPLENISH_ORDER_PAGE_CAP && page < totalPages) {
      if (onProgress) onProgress(page + 1, totalPages);
      var text = await inventoryPostForm(
        REPLENISH_ORDER_SEARCH,
        buildReplenishOrderSearchBody(page),
        {
          referer: REPLENISH_ORDER_REFERER,
          tag: "replenish-order",
        }
      );
      var part = parseReplenishOrderPage(text);
      var i;
      for (i = 0; i < part.rows.length; i++) {
        pushReplenishOrderIndex(index, part.rows[i]);
      }
      totalPages = part.totalPages;
      if (!isFinite(totalPages) || totalPages < 1) totalPages = 1;
      page += 1;
      if (page >= totalPages) break;
      await sleep(REPLENISH_ORDER_PAGE_DELAY_MS);
    }
    delete index._seen;
    return index;
  }

  function inboundGet(url, opt) {
    opt = opt || {};
    var referer = opt.referer || INBOUND_TRANSFER_REFERER;
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
                tag: opt.tag || "inbound",
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
        tag: opt.tag || "inbound",
      }).then(resolve, reject);
    });
  }

  function atsYmdFromDate(d) {
    return (
      d.getFullYear() +
      "-" +
      ("0" + (d.getMonth() + 1)).slice(-2) +
      "-" +
      ("0" + d.getDate()).slice(-2)
    );
  }

  function atsTransferDateRange() {
    var end = new Date();
    var start = new Date(end.getTime());
    start.setDate(start.getDate() - TRANSFER_DATE_LOOKBACK_DAYS);
    return { startYmd: atsYmdFromDate(start), endYmd: atsYmdFromDate(end) };
  }

  /** 이관 토트바코드(cartBarcode) — 로케이션에 GC- 가 있는 경우만 */
  function atsGcToteBarcodeFromLocation(loc) {
    var s = String(loc || "").trim();
    if (!s) return "";
    var idx = s.toUpperCase().indexOf("GC-");
    if (idx < 0) return "";
    return s.slice(idx).toUpperCase();
  }

  function rowNeedsTransferLookup(row) {
    if (!row || row.noStock) return false;
    return !!atsGcToteBarcodeFromLocation(row.location);
  }

  function buildTransferPagingUrl(pagingBase, cartBarcode, page) {
    var dr = atsTransferDateRange();
    var p = new URLSearchParams();
    p.set("page", String(page == null ? 0 : page));
    p.set("skuBarcode", "");
    p.set("skuExternalId", "");
    p.set("skuId", "");
    p.set("vehicleNumber", "");
    p.set("status", "");
    p.set("containerBarcode", "");
    p.set("transferCartPriority", "");
    p.set("toCenterCode", transferToCenter());
    p.set("centerCode", "");
    p.set("transferAllocationType", "");
    p.set("transferPlanExternalId", "");
    p.set("cartBarcode", String(cartBarcode || "").trim().toUpperCase());
    p.set("searchDateType", TRANSFER_SEARCH_DATE_TYPE);
    p.set("end", dr.endYmd);
    p.set("start", dr.startYmd);
    return String(pagingBase || INBOUND_TRANSFER_PAGING_SAME_CENTER) + "?" + p.toString();
  }

  function atsTableHeaderIndexMap(table) {
    var map = Object.create(null);
    var ths = table.querySelectorAll("thead th");
    var i, key;
    for (i = 0; i < ths.length; i++) {
      key = normKey(normalizeCellText(ths[i].textContent));
      if (key != null && key !== "" && map[key] == null) map[key] = i;
    }
    return map;
  }

  function atsFindTableCol(map, candidates) {
    var c, cn, k;
    for (c = 0; c < candidates.length; c++) {
      cn = normKey(candidates[c]);
      if (map[cn] != null) return map[cn];
      for (k in map) {
        if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
        if (k.indexOf(cn) >= 0 || cn.indexOf(k) >= 0) return map[k];
      }
    }
    return -1;
  }

  function transferPagingHasNextPage(html) {
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    var next = doc.querySelector("w-page-next");
    return !!(next && !next.hasAttribute("disabled"));
  }

  function formatAtsTimeOnly(raw) {
    var s = String(raw || "").replace(/\u00a0/g, " ").trim();
    if (!s || /검색\s*결과/.test(s)) return "";
    var m = s.match(
      /(\d{4})[-./](\d{1,2})[-./](\d{1,2})[\sT]+(\d{1,2}):(\d{2})/
    );
    if (m) {
      return ("0" + m[4]).slice(-2) + ":" + m[5];
    }
    m = s.match(/(\d{1,2})[-./](\d{1,2})[\s]+(\d{1,2}):(\d{2})/);
    if (m) {
      return ("0" + m[3]).slice(-2) + ":" + m[4];
    }
    m = s.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
    if (m) {
      var hKr = parseInt(m[1], 10);
      var minKr = m[2] != null ? parseInt(m[2], 10) : 0;
      if (
        Number.isFinite(hKr) &&
        hKr >= 0 &&
        hKr <= 23 &&
        Number.isFinite(minKr) &&
        minKr >= 0 &&
        minKr <= 59
      ) {
        return ("0" + hKr).slice(-2) + ":" + ("0" + minKr).slice(-2);
      }
    }
    m = s.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
    if (m) {
      return ("0" + m[1]).slice(-2) + ":" + m[2];
    }
    return s;
  }

  /** 하차시간용 짧은 일시 — 여백 위해 MM/DD HH:MM */
  function formatAtsDateTimeCompact(raw) {
    var s = String(raw || "").replace(/\u00a0/g, " ").trim();
    if (!s || /검색\s*결과/.test(s)) return "";
    var m = s.match(
      /(\d{4})[-./](\d{1,2})[-./](\d{1,2})[\sT]+(\d{1,2}):(\d{2})/
    );
    if (m) {
      return (
        ("0" + m[2]).slice(-2) +
        "/" +
        ("0" + m[3]).slice(-2) +
        " " +
        ("0" + m[4]).slice(-2) +
        ":" +
        m[5]
      );
    }
    m = s.match(/(\d{1,2})[-./](\d{1,2})[\s]+(\d{1,2}):(\d{2})/);
    if (m) {
      return (
        ("0" + m[1]).slice(-2) +
        "/" +
        ("0" + m[2]).slice(-2) +
        " " +
        ("0" + m[3]).slice(-2) +
        ":" +
        m[4]
      );
    }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
    if (m) {
      return (
        ("0" + m[1]).slice(-2) +
        "/" +
        ("0" + m[2]).slice(-2) +
        " " +
        ("0" + m[3]).slice(-2) +
        ":" +
        m[4]
      );
    }
    return formatAtsTimeOnly(s);
  }

  var TRANSFER_INFO_EMPTY = {
    loadTime: "",
    unloadTime: "",
    status: "",
    vehicleNo: "",
    priority: "",
    ct: "",
    fromCenter: "",
  };

  function transferInfoHasData(info) {
    return !!(
      info &&
      (info.loadTime ||
        info.unloadTime ||
        info.status ||
        info.vehicleNo ||
        info.priority ||
        info.ct)
    );
  }

  function parseTransferOperationHtml(html, expectedCart) {
    var raw = String(html || "");
    if (!raw || (/로그인|login/i.test(raw) && !/w-table/i.test(raw))) {
      return Object.assign({}, TRANSFER_INFO_EMPTY);
    }
    if (/검색\s*결과가\s*없/.test(raw)) {
      return Object.assign({}, TRANSFER_INFO_EMPTY);
    }
    var doc = new DOMParser().parseFromString(raw, "text/html");
    var table = doc.querySelector('table[is="w-table"]');
    if (!table) return Object.assign({}, TRANSFER_INFO_EMPTY);
    var map = atsTableHeaderIndexMap(table);
    var cartKey = normKey(expectedCart);
    var iTote = atsFindTableCol(map, ["토트바코드"]);
    var iPriority = atsFindTableCol(map, ["우선순위", "우선 순위"]);
    var iCt = atsFindTableCol(map, [
      "컨테이너 바코드",
      "컨테이너바코드",
      "CT",
      "Ct",
    ]);
    var iStatus = atsFindTableCol(map, ["상태"]);
    var iFrom = atsFindTableCol(map, [
      "보내는센터",
      "보내는 센터",
      "보내는 센터코드",
    ]);
    var iLoad = atsFindTableCol(map, ["상차완료시간", "상차완료 시간"]);
    var iVehicle = atsFindTableCol(map, ["차량번호"]);
    var iUnload = atsFindTableCol(map, [
      "하차완료일시",
      "하차완료 일시",
      "하차 완료 일시",
    ]);
    if (iPriority < 0) iPriority = 1;
    var trs = table.querySelectorAll("tbody tr");
    var r, tds, out, toteVal;
    for (r = 0; r < trs.length; r++) {
      tds = trs[r].querySelectorAll("td");
      if (!tds.length) continue;
      if (tds[0] && tds[0].getAttribute("colspan")) continue;
      if (cartKey && iTote >= 0) {
        toteVal = normalizeCellText(tds[iTote].textContent);
        if (toteVal && normKey(toteVal) !== cartKey) continue;
      }
      out = {
        loadTime:
          iLoad >= 0
            ? formatAtsTimeOnly(tds[iLoad].textContent)
            : "",
        unloadTime:
          iUnload >= 0
            ? formatAtsDateTimeCompact(tds[iUnload].textContent)
            : "",
        status:
          iStatus >= 0 ? normalizeCellText(tds[iStatus].textContent) : "",
        vehicleNo:
          iVehicle >= 0
            ? normalizeCellText(tds[iVehicle].textContent)
            : "",
        priority:
          iPriority >= 0 && tds[iPriority]
            ? normalizeCellText(tds[iPriority].textContent)
            : "",
        ct:
          iCt >= 0 && tds[iCt]
            ? normalizeCellText(tds[iCt].textContent)
            : "",
        fromCenter:
          iFrom >= 0 && tds[iFrom]
            ? normalizeCellText(tds[iFrom].textContent)
            : "",
      };
      if (/검색\s*결과/.test(out.status)) continue;
      if (transferInfoHasData(out)) return out;
    }
    return Object.assign({}, TRANSFER_INFO_EMPTY);
  }

  var transferInfoCache = Object.create(null);

  function fetchTransferInfoForCart(cartBarcode) {
    var cart = String(cartBarcode || "").trim().toUpperCase();
    if (!cart || cart.indexOf("GC-") !== 0) {
      return Promise.resolve(Object.assign({}, TRANSFER_INFO_EMPTY));
    }
    var key = normKey(cart);
    if (!key) return Promise.resolve(Object.assign({}, TRANSFER_INFO_EMPTY));
    if (transferInfoCache[key] !== undefined) {
      return Promise.resolve(transferInfoCache[key]);
    }
    var pagingBases = [
      INBOUND_TRANSFER_PAGING_MAIN,
      INBOUND_TRANSFER_PAGING_SAME_CENTER,
    ];
    function tryPagingBase(baseIndex) {
      if (stopRequested || baseIndex >= pagingBases.length) {
        var miss = Object.assign({}, TRANSFER_INFO_EMPTY);
        transferInfoCache[key] = miss;
        return miss;
      }
      var base = pagingBases[baseIndex];
      var page = 0;
      function fetchPage() {
        if (stopRequested || page >= TRANSFER_PAGE_CAP) {
          return tryPagingBase(baseIndex + 1);
        }
        var url = buildTransferPagingUrl(base, cart, page);
        return inboundGet(url, {
          referer: INBOUND_TRANSFER_REFERER,
          tag: "transfer-paging",
        })
          .then(function (html) {
            var info = parseTransferOperationHtml(html, cart);
            if (transferInfoHasData(info)) {
              transferInfoCache[key] = info;
              return info;
            }
            if (
              /검색\s*결과가\s*없/.test(String(html || "")) ||
              !transferPagingHasNextPage(html)
            ) {
              return tryPagingBase(baseIndex + 1);
            }
            page += 1;
            return sleep(TRANSFER_DELAY_MS).then(fetchPage);
          })
          .catch(function () {
            return tryPagingBase(baseIndex + 1);
          });
      }
      return fetchPage();
    }
    return tryPagingBase(0);
  }

  async function enrichRowsTransferByCart(allRows, onProgress) {
    var seen = Object.create(null);
    var carts = [];
    var i, row, cart;
    for (i = 0; i < allRows.length; i++) {
      row = allRows[i];
      if (!rowNeedsTransferLookup(row)) continue;
      cart = atsGcToteBarcodeFromLocation(row.location);
      if (!cart || seen[normKey(cart)]) continue;
      seen[normKey(cart)] = 1;
      carts.push(cart);
    }
    for (i = 0; i < carts.length; i++) {
      if (stopRequested) break;
      if (onProgress) onProgress(i + 1, carts.length, carts[i]);
      await fetchTransferInfoForCart(carts[i]);
      if (i + 1 < carts.length) await sleep(TRANSFER_DELAY_MS);
    }
    for (i = 0; i < allRows.length; i++) {
      row = allRows[i];
      if (!rowNeedsTransferLookup(row)) continue;
      cart = normKey(atsGcToteBarcodeFromLocation(row.location));
      if (!cart || transferInfoCache[cart] === undefined) continue;
      row.loadTime = transferInfoCache[cart].loadTime || "";
      row.unloadTime = transferInfoCache[cart].unloadTime || "";
      row.status = transferInfoCache[cart].status || "";
      row.vehicleNo = transferInfoCache[cart].vehicleNo || "";
      row.priority = transferInfoCache[cart].priority || "";
      row.ct = transferInfoCache[cart].ct || "";
      row.fromCenter = transferInfoCache[cart].fromCenter || "";
    }
  }

  function atsInventoryLocationKey(loc) {
    return normalizeMergeGcKey(loc);
  }

  function buildAtsRowsFromInventoryPicks(picked, ob, obQtyNum) {
    var out = [];
    if (!picked || !picked.length) return out;
    var obAlloc = allocateObQtyAcrossInventoryRows(
      picked,
      obQtyNum,
      ob && ob.obQty
    );
    var mi, rowOut;
    for (mi = 0; mi < picked.length; mi++) {
      rowOut = applyOutboundFields(
        {
          location: picked[mi].location,
          inventoryId: picked[mi].inventoryId,
          skuId: picked[mi].skuId,
          barcode: picked[mi].barcode,
          name: picked[mi].name,
          qty: picked[mi].qty,
          _expiredAt: picked[mi]._expiredAt,
          lpnId: picked[mi].lpnId,
          unloadTime: "",
          loadTime: "",
          status: "",
          vehicleNo: "",
          tempZone: "",
          gc: "",
          ct: "",
          priority: "",
          atsDeadline: "",
          obQty: "",
        },
        ob
      );
      if (obAlloc[mi] != null && obAlloc[mi] !== "") {
        rowOut.obQty = obAlloc[mi];
      }
      out.push(rowOut);
    }
    return out;
  }

  /**
   * 진열완료(또는 쓸 수 없는 GC)면 같은 보충 barcode의 다음 FIFO 재고로 교체.
   * 후보가 없으면 재고없음(X)으로 남겨 보충 니드 누락을 막음.
   */
  async function replaceStowCompleteWithNextInventory(
    allRows,
    poolByBc,
    onProgress
  ) {
    var rejectedByBc = Object.create(null);
    var replacedCt = 0;
    var noStockCt = 0;
    var round;
    var maxRounds = 10;

    function ensureRejected(bc) {
      if (!rejectedByBc[bc]) rejectedByBc[bc] = Object.create(null);
      return rejectedByBc[bc];
    }

    for (round = 0; round < maxRounds; round++) {
      if (stopRequested) break;
      var badIdx = [];
      var badBcSet = Object.create(null);
      var i, row, bc, locKey;
      for (i = 0; i < allRows.length; i++) {
        row = allRows[i];
        if (!row || row.noStock || row.fromBufferOrder) continue;
        if (!atsStatusIsStowComplete(row.status)) continue;
        bc = normalizeBarcode(row.barcode);
        if (!bc) continue;
        locKey = atsInventoryLocationKey(row.location);
        if (locKey) ensureRejected(bc)[locKey] = 1;
        badIdx.push(i);
        badBcSet[bc] = 1;
      }
      if (!badIdx.length) break;

      for (i = badIdx.length - 1; i >= 0; i--) {
        allRows.splice(badIdx[i], 1);
      }

      var bcList = Object.keys(badBcSet);
      var bi, pool, used, avail, picked, fresh, hasBuffer, hasInv, hasNoStock;
      var j, obQtyNum, kept;
      for (bi = 0; bi < bcList.length; bi++) {
        bc = bcList[bi];
        pool = poolByBc[bc];
        if (!pool) continue;

        /* 해당 barcode의 기존 inventory 행은 전부 걷고 FIFO 재선별 */
        kept = [];
        hasBuffer = false;
        hasNoStock = false;
        for (j = 0; j < allRows.length; j++) {
          row = allRows[j];
          if (normalizeBarcode(row.barcode) !== bc) {
            kept.push(row);
            continue;
          }
          if (row.fromBufferOrder) {
            kept.push(row);
            hasBuffer = true;
          } else if (row.noStock) {
            hasNoStock = true;
          }
          /* inventory / 진열완료 후보 행은 버림 */
        }
        allRows.length = 0;
        for (j = 0; j < kept.length; j++) allRows.push(kept[j]);

        used = Object.create(null);
        var rej = rejectedByBc[bc] || Object.create(null);
        var rk;
        for (rk in rej) {
          if (Object.prototype.hasOwnProperty.call(rej, rk)) used[rk] = 1;
        }
        avail = (pool.matched || []).filter(function (m) {
          var k = atsInventoryLocationKey(m && m.location);
          return k && !used[k];
        });
        obQtyNum = parseObQtyNumber(pool.ob && pool.ob.obQty);
        picked = selectInventoryMatchesForObQty(avail, obQtyNum);
        if (picked.length) {
          fresh = buildAtsRowsFromInventoryPicks(picked, pool.ob, obQtyNum);
          for (j = 0; j < fresh.length; j++) allRows.push(fresh[j]);
          replacedCt += fresh.length;
        } else if (!hasBuffer) {
          allRows.push(
            makeNoStockRow(bc, pool.meta || null, pool.ob || null)
          );
          noStockCt += 1;
        }
      }

      if (onProgress) {
        onProgress(round + 1, maxRounds, replacedCt);
      }
      await enrichRowsTransferByCart(allRows, null);
    }

    /* 최종 안전망: 진열완료 행이 남아 있으면 제거하고, 그 barcode에 재고/버퍼/X 없으면 X */
    var leftoverBc = Object.create(null);
    for (i = allRows.length - 1; i >= 0; i--) {
      row = allRows[i];
      if (!row || row.noStock || row.fromBufferOrder) continue;
      if (!atsStatusIsStowComplete(row.status)) continue;
      bc = normalizeBarcode(row.barcode);
      if (bc) {
        locKey = atsInventoryLocationKey(row.location);
        if (locKey) ensureRejected(bc)[locKey] = 1;
        leftoverBc[bc] = 1;
      }
      allRows.splice(i, 1);
    }
    var lb = Object.keys(leftoverBc);
    for (bi = 0; bi < lb.length; bi++) {
      bc = lb[bi];
      pool = poolByBc[bc];
      hasBuffer = false;
      hasInv = false;
      hasNoStock = false;
      for (j = 0; j < allRows.length; j++) {
        row = allRows[j];
        if (normalizeBarcode(row.barcode) !== bc) continue;
        if (row.fromBufferOrder) hasBuffer = true;
        else if (row.noStock) hasNoStock = true;
        else hasInv = true;
      }
      if (!hasBuffer && !hasInv && !hasNoStock) {
        allRows.push(
          makeNoStockRow(bc, (pool && pool.meta) || null, (pool && pool.ob) || null)
        );
        noStockCt += 1;
      }
    }

    return { replacedCt: replacedCt, noStockCt: noStockCt };
  }

  /** 표시용 — inventory locationBarcode 전체(RCRT·MCRT·GC 등). 이관 조회는 atsGcToteBarcodeFromLocation 별도 */
  function atsLocationDisplayForRow(row) {
    if (!row) return "";
    return String(row.location || "").trim();
  }

  /** 로케이션 접두어별 CT 열 고정 문구(긴 접두어 우선). 없으면 이관 표 컨테이너 바코드 */
  var ATS_LOCATION_CT_LABEL_RULES = [
    { prefix: "1007-1FPZ", label: "냉동버퍼존 확인" },
    { prefix: "1007-2CPZ", label: "냉장버퍼존 확인" },
    { prefix: "1007-1CEZ", label: "에그버퍼존 확인" },
    { prefix: "1007-RCRT22-", label: "프로젝트 직납" },
    { prefix: "1007-RCRT44-", label: "프로젝트 직납" },
    { prefix: "1007-RCRT88-", label: "SR 및 프리팩존 확인" },
    { prefix: "1007-RCRT18-", label: "토트재고이동중 확인" },
    { prefix: "1007-RCRT18", label: "토트재고이동중 확인" },
    { prefix: "1007-MCRT0-", label: "재고이동중 확인" },
    { prefix: "1007-RCRT4-", label: "직납" },
    { prefix: "1007-RCRT3-", label: "직납" },
    { prefix: "1007-RCRT2-", label: "직납" },
  ];

  function pushAtsCtPrefixes(extra, prefixes, label) {
    var i;
    for (i = 0; i < prefixes.length; i++) {
      extra.push({ prefix: prefixes[i], label: label });
    }
  }

  function atsCtLabelRules() {
    var pack = atsCenterBufferPack(transferToCenter());
    var extra = [];
    if (pack) {
      /* 에그는 냉장 목록에도 있음. 같은 길이면 먼저 넣은 쪽이 이김 */
      pushAtsCtPrefixes(extra, pack.egg || [], "에그버퍼존 확인");
      pushAtsCtPrefixes(extra, pack.frozen, "냉동버퍼존 확인");
      pushAtsCtPrefixes(extra, pack.chilled, "냉장버퍼존 확인");
      pushAtsCtPrefixes(extra, pack.ambient, "상온버퍼존 확인");
      pushAtsCtPrefixes(extra, pack.rocket, "로켓버퍼존 확인");
      pushAtsCtPrefixes(extra, pack.direct, "직납");
      pushAtsCtPrefixes(extra, pack.tote || [], "토트재고이동중 확인");
    }
    extra.push({ prefix: atsMcrtPrefix(), label: "재고이동중 확인" });
    extra.sort(function (a, b) {
      return String(b.prefix).length - String(a.prefix).length;
    });
    return extra.concat(ATS_LOCATION_CT_LABEL_RULES);
  }

  function atsCtLabelFromLocation(loc) {
    var s = String(loc || "")
      .replace(/\u00a0/g, " ")
      .trim()
      .toUpperCase();
    if (!s) return "";
    var i, rule, p, bare, next;
    var ctRules = atsCtLabelRules();
    for (i = 0; i < ctRules.length; i++) {
      rule = ctRules[i];
      p = String(rule.prefix).toUpperCase();
      if (s.indexOf(p) === 0) return rule.label;
      bare = p.replace(/-+$/, "");
      if (bare.length < 8 || s.indexOf(bare) !== 0) continue;
      if (s.length === bare.length) return rule.label;
      next = s.charAt(bare.length);
      if (next === "-" || next === "." || next === "_") return rule.label;
    }
    return "";
  }

  function atsCtDisplayForRow(row) {
    if (!row || row.noStock) return "";
    var fromLoc = atsCtLabelFromLocation(row.location);
    if (fromLoc) return fromLoc;
    return String(row.ct || "").trim();
  }

  function atsCtDisplayForTableRow(row, doneKey) {
    if (!row || row.noStock) return "";
    if (doneKey && atsAdditionalReplenishKeys.has(doneKey)) {
      var addHm = formatAtsHmFromMs(atsRcrtDisplayTimeByKey[doneKey]);
      return addHm
        ? "추가보충필요 마지막 부분진열 시간 " + addHm
        : "추가보충필요";
    }
    if (doneKey && atsRcrtDisplayDoneKeys.has(doneKey)) {
      var doneMs = atsRcrtDisplayTimeByKey[doneKey];
      var hm = formatAtsHmFromMs(doneMs);
      return hm ? "부분진열완료 " + hm : "부분진열완료";
    }
    return atsCtDisplayForRow(row);
  }

  function detectStorageTempLabel(text) {
    var s = String(text || "").replace(/\u00a0/g, " ");
    if (/냉장\s*\+\s*10|냉장\+10/i.test(s)) return "냉장+10";
    if (/냉동\s*[-−]?\s*18|냉동-18/i.test(s)) return "냉동-18";
    if (/냉장\s*\+\s*1|냉장\+1/i.test(s)) return "냉장+1";
    if (/상온/i.test(s)) return "상온";
    return "";
  }

  function mapStorageTempToZoneCode(label) {
    var t = String(label || "").replace(/\s+/g, "");
    if (!t) return "";
    if (/냉동/.test(t) && /18/.test(t)) return "FROZEN";
    if (/냉장\+10|냉장.?10/.test(t)) return "AMBIENT";
    if (/냉장\+1|냉장.?1/.test(t)) return "CHILLED";
    if (/상온/.test(t)) return "RM";
    return "";
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
        if (found) return mapStorageTempToZoneCode(found);
      }
      row = nodes[i].closest ? nodes[i].closest("tr") : null;
      if (row) {
        var tds = row.querySelectorAll("td,th,span");
        var j;
        for (j = 0; j < tds.length; j++) {
          if (tds[j] === nodes[i]) continue;
          found = detectStorageTempLabel(tds[j].textContent);
          if (found) return mapStorageTempToZoneCode(found);
        }
      }
    }
    return mapStorageTempToZoneCode(
      detectStorageTempLabel(doc.body ? doc.body.textContent : raw)
    );
  }

  var skuTempZoneCache = Object.create(null);

  function fetchTempZoneForSkuId(skuId) {
    var id = String(skuId || "").replace(/\D/g, "");
    if (!id) return Promise.resolve("");
    if (skuTempZoneCache[id] !== undefined) {
      return Promise.resolve(skuTempZoneCache[id]);
    }
    var skuUrl = INVENTORY_SKU_PAGE_BASE + id;
    return inventoryGet(skuUrl, {
      referer: skuUrl,
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      tag: "sku-page",
    })
      .then(function (html) {
        var zone = parseStorageTempFromSkuHtml(html);
        skuTempZoneCache[id] = zone;
        return zone;
      })
      .catch(function () {
        skuTempZoneCache[id] = "";
        return "";
      });
  }

  function rowNeedsTempZoneLookup(row) {
    if (!row || row.noStock) return false;
    var loc = String(row.location || "").trim();
    return !!loc && loc !== ATS_NO_STOCK_LABEL;
  }

  async function enrichRowsTempZoneBySku(allRows, onProgress) {
    var seen = Object.create(null);
    var skuIds = [];
    var i, sid, row;
    for (i = 0; i < allRows.length; i++) {
      row = allRows[i];
      if (!rowNeedsTempZoneLookup(row)) continue;
      sid = String(row.skuId || "").replace(/\D/g, "");
      if (!sid || seen[sid]) continue;
      seen[sid] = 1;
      skuIds.push(sid);
    }
    for (i = 0; i < skuIds.length; i++) {
      if (stopRequested) break;
      if (onProgress) onProgress(i + 1, skuIds.length, skuIds[i]);
      await fetchTempZoneForSkuId(skuIds[i]);
      if (i + 1 < skuIds.length) await sleep(TEMP_ZONE_DELAY_MS);
    }
    for (i = 0; i < allRows.length; i++) {
      row = allRows[i];
      if (!rowNeedsTempZoneLookup(row)) continue;
      sid = String(row.skuId || "").replace(/\D/g, "");
      row.tempZone = sid ? skuTempZoneCache[sid] || "" : "";
    }
  }

  function buildInventorySearchUrl(barcode, page) {
    return buildInventorySearchUrlParams({
      skuBarcode: String(barcode || ""),
      page: page,
    });
  }

  /** 재고조회: 로케이션 + 바코드(없으면 skuId) 동시 검색 — 혼재 loc 에서 해당 보충건만. */
  function buildInventorySearchUrlForGlocLookup(loc, barcode, skuId, page) {
    var bc = normalizeBarcode(barcode);
    return buildInventorySearchUrlParams({
      locationBarcode: String(loc || ""),
      skuBarcode: bc,
      skuId: bc ? "" : String(skuId != null ? skuId : ""),
      page: page,
    });
  }

  function buildInventorySearchUrlParams(opt) {
    opt = opt || {};
    var p = new URLSearchParams();
    p.set("searched", "true");
    p.set("locationType", "");
    p.set("zone", "");
    p.set("fromLocation", "");
    p.set("toLocation", "");
    p.set("locationBarcode", String(opt.locationBarcode || ""));
    p.set("skuId", "");
    p.set("externalSkuId", "");
    p.set("skuBarcode", String(opt.skuBarcode || ""));
    p.set("lpnId", "");
    p.set("inventoryId", "");
    p.set("saleableChangeType", "");
    p.set("availableInventory", "true");
    p.set("page", String(opt.page != null ? opt.page : 0));
    p.set("pageSize", "20");
    return INVENTORY_SEARCH + "?" + p.toString();
  }

  /** result.content 비어 있으면 false(재고 없음 → 초록 대상). 파싱 실패·success false 는 null. */
  function inventoryLocationHasStockFromResponse(text) {
    try {
      var j = JSON.parse(String(text || ""));
      if (!j || j.success === false) return null;
      var content = j.result && j.result.content;
      if (!Array.isArray(content)) return false;
      return content.length > 0;
    } catch (eInv) {
      return null;
    }
  }

  function rowEligibleForAtsGlocLookup(row) {
    if (!row || row.noStock) return false;
    var loc = String(row.location || "").trim();
    if (!loc || loc === ATS_NO_STOCK_LABEL) return false;
    return true;
  }

  function atsGlocLookupPackKey(loc, barcode, skuId) {
    var bc = normalizeBarcode(barcode);
    if (bc) return String(loc || "").trim() + "\x1e" + bc;
    var sku = normalizeSkuJoinKey(skuId);
    return String(loc || "").trim() + "\x1e" + "sku:" + (sku || "__EMPTY__");
  }

  /** GC·RCRT·버퍼존: 로케이션+바코드 묶음별 보충조회. 초록·주황·⑪ 제외. */
  function collectLocationLookupPackFromRows(rows) {
    var byPack = Object.create(null);
    var lookupPacks = [];
    var i, row, loc, dk, packKey, pack, job;
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      if (atsRowHiddenByStatus(row)) continue;
      if (!rowEligibleForAtsGlocLookup(row)) continue;
      loc = String(row.location || "").trim();
      if (rowAlreadyMarkedForLookup(row)) continue;
      dk = atsReplenishDoneKey(row.skuId, loc);
      packKey = atsGlocLookupPackKey(loc, row.barcode, row.skuId);
      if (!byPack[packKey]) {
        pack = {
          loc: loc,
          barcode: String(row.barcode || "").trim(),
          skuId: row.skuId,
          jobs: [],
        };
        byPack[packKey] = pack;
        lookupPacks.push(pack);
      } else {
        pack = byPack[packKey];
      }
      job = {
        doneKey: dk,
        obQty: parseObQtyNumber(row.obQty),
        skuId: row.skuId,
        barcode: String(row.barcode || "").trim(),
      };
      pack.jobs.push(job);
    }
    return { lookupPacks: lookupPacks };
  }

  var BARCODE_HEADER_CANDS = [
    "Barcode",
    "BARCODE",
    "바코드",
    "상품바코드",
    "SKU Barcode",
    "SKUBARCODE",
    "EAN",
    "UPC",
  ];
  var OB_QTY_HEADER_CANDS = [
    "보충수량",
    "Unit",
    "UNIT",
    "수량",
    "Qty",
    "Quantity",
  ];
  var OB_DEADLINE_HEADER_CANDS = [
    "출고마감",
    "출고 마감",
    "출고마감시간",
    "출고 마감시간",
    "출고 마감 시간",
    "출고마감 시간",
    "보충기한",
    "마감시간",
    "마감",
  ];
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function normalizeCellText(raw) {
    return String(raw || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeObQty(raw) {
    var s = normalizeCellText(raw);
    if (!s) return "";
    var n = s.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    return n ? n[0] : s;
  }

  function extractOutboundDeadlineTime(raw) {
    var s = normalizeCellText(raw);
    if (!s) return "";
    var isPm = /오후|\bPM\b/i.test(s);
    var isAm = /오전|\bAM\b/i.test(s);
    var mKr = s.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
    if (mKr) {
      var h = parseInt(mKr[1], 10);
      if (isPm && h < 12) h += 12;
      if (isAm && h === 12) h = 0;
      var min = mKr[2] != null ? parseInt(mKr[2], 10) : 0;
      if (
        Number.isFinite(h) &&
        h >= 0 &&
        h <= 23 &&
        Number.isFinite(min) &&
        min >= 0 &&
        min <= 59
      ) {
        return pad2(h) + ":" + pad2(min);
      }
    }
    var re = /\b(\d{1,2}):(\d{2})(?::\d{2})?\b/g;
    var mm;
    var best = "";
    while ((mm = re.exec(s)) !== null) {
      var hh = parseInt(mm[1], 10);
      if (isPm && hh < 12) hh += 12;
      if (isAm && hh === 12) hh = 0;
      if (hh >= 0 && hh <= 23) best = pad2(hh) + ":" + mm[2];
    }
    return best;
  }

  function subtractMinutesFromHm(hm, deltaMin) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || "").trim());
    if (!m) return "";
    var total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    if (!Number.isFinite(total)) return "";
    total =
      (((total - deltaMin) % (24 * 60)) + 24 * 60) % (24 * 60);
    return pad2(Math.floor(total / 60)) + ":" + pad2(total % 60);
  }

  function buildOutboundItem(barcode, obQty, deadlineRaw) {
    var dlTime = extractOutboundDeadlineTime(deadlineRaw);
    return {
      barcode: barcode,
      obQty: obQty || "",
      atsDeadline: dlTime
        ? subtractMinutesFromHm(dlTime, getAtsDeadlineOffsetMin())
        : "",
    };
  }

  function outboundItemStore() {
    var byBc = Object.create(null);
    var list = [];
    return {
      list: list,
      byBarcode: byBc,
      /** 실패한 컷라인 상세·페이지 수 — 0 이 아니면 일부 보충 목록이 빠진 것 */
      failed: 0,
      add: function (item) {
        var bc = item && item.barcode;
        if (!bc) return;
        if (byBc[bc]) {
          mergeOutboundItemFields(byBc[bc], item);
          return;
        }
        byBc[bc] = item;
        list.push(item);
      },
      get: function (bc) {
        return byBc[String(bc || "")] || null;
      },
    };
  }

  function parseOutboundItemsFromDoc(doc) {
    var store = outboundItemStore();
    var tables = doc.querySelectorAll(
      'table[is="w-table"], table.table, table'
    );
    var ti, cells, texts, idxBc, idxQty, idxDl, ri;
    for (ti = 0; ti < tables.length; ti++) {
      var table = tables[ti];
      var headerTr =
        table.querySelector("thead tr") ||
        (table.rows && table.rows.length ? table.rows[0] : null);
      if (!headerTr) continue;
      cells = headerTr.querySelectorAll("th,td");
      texts = [];
      for (ri = 0; ri < cells.length; ri++) {
        texts.push(String(cells[ri].textContent || "").trim());
      }
      idxBc = findColIndex(texts, BARCODE_HEADER_CANDS);
      if (idxBc < 0) continue;
      idxQty = findColIndex(texts, OB_QTY_HEADER_CANDS);
      idxDl = findColIndex(texts, OB_DEADLINE_HEADER_CANDS);
      var bodyRows = table.querySelectorAll("tbody tr");
      if (!bodyRows.length && table.rows && table.rows.length > 1) {
        bodyRows = [];
        for (ri = 1; ri < table.rows.length; ri++) bodyRows.push(table.rows[ri]);
      }
      for (ri = 0; ri < bodyRows.length; ri++) {
        var tds = bodyRows[ri].querySelectorAll("td,th");
        if (tds.length <= idxBc) continue;
        var bc = normalizeBarcode(tds[idxBc].textContent);
        if (!isLikelyBarcode(bc)) continue;
        var obQty =
          idxQty >= 0 && tds.length > idxQty
            ? normalizeObQty(tds[idxQty].textContent)
            : "";
        var dlRaw =
          idxDl >= 0 && tds.length > idxDl
            ? normalizeCellText(tds[idxDl].textContent)
            : "";
        store.add(buildOutboundItem(bc, obQty, dlRaw));
      }
    }
    return store;
  }

  function parseOutboundItemsFromHtml(html) {
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    return parseOutboundItemsFromDoc(doc);
  }

  /** 보충 필요 칸 하이퍼링크의 표시 숫자만 (워크플로우 RPA 와 동일) */
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
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
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
      seen[abs] = 1;
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
          pathLabel + (needNum != null ? " " + String(needNum) : ""),
      });
      if (list.length >= DETAIL_CUTLINE_CAP) break;
    }
    return list;
  }

  function cutlineUrlsFromItems(items) {
    if (!items || !items.length) return [];
    var out = [];
    var i;
    for (i = 0; i < items.length; i++) {
      if (typeof items[i] === "string") {
        out.push(items[i]);
      } else if (items[i] && items[i].url) {
        out.push(items[i].url);
      }
    }
    return out;
  }

  async function fetchOutboundDashboardCutlineList() {
    var hdr = {
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      Referer: OUTBOUND_DASH,
      Origin: "https://outbound.coupang.com",
    };
    var html0 = await gmXhr({
      url: OUTBOUND_DASH,
      headers: hdr,
      tag: "outbound 대시보드(시간대)",
    });
    if (looksLikeLoginHtml(html0)) {
      return { items: [], note: "login", html: html0 };
    }
    var searched = await outboundSearchHtml(html0);
    var html1 = searched.html || html0;
    if (looksLikeLoginHtml(html1)) {
      return { items: [], note: "login", html: html1 };
    }
    return {
      items: parseCutlinesFromHtml(html1),
      note: searched.note || "ok",
      html: html1,
    };
  }

  function outboundCsrfFromDoc(doc) {
    var m = doc.querySelector('meta[name="_csrf"]');
    var tok = (m && m.getAttribute("content")) || "";
    if (!tok) {
      var inp = doc.querySelector('input[name="_csrf"], input[name="csrf-token"]');
      if (inp) tok = inp.value || "";
    }
    return tok ? { "X-CSRF-TOKEN": tok, "X-XSRF-TOKEN": tok } : {};
  }

  function findNobDashboardSearchForm(doc) {
    var btn =
      doc.querySelector("button.btn-search[type='submit']") ||
      doc.querySelector("button.btn-search") ||
      doc.querySelector("input.btn-search[type='submit']");
    return btn && btn.closest ? btn.closest("form") : null;
  }

  function serializeOutboundForm(form) {
    var chunks = [];
    var els = form.querySelectorAll("input, select, textarea");
    var i, el, n, tag, type, oi;
    for (i = 0; i < els.length; i++) {
      el = els[i];
      if (el.disabled) continue;
      n = el.getAttribute("name");
      if (!n) continue;
      tag = String(el.tagName || "").toUpperCase();
      if (tag === "INPUT") {
        type = String(el.getAttribute("type") || "text").toLowerCase();
        if (type === "submit" || type === "button" || type === "image") continue;
        if ((type === "checkbox" || type === "radio") && !el.checked) continue;
        chunks.push(encodeURIComponent(n) + "=" + encodeURIComponent(el.value || ""));
      } else if (tag === "SELECT") {
        if (typeof el.selectedOptions !== "undefined" && el.selectedOptions.length) {
          for (oi = 0; oi < el.selectedOptions.length; oi++) {
            chunks.push(
              encodeURIComponent(n) +
                "=" +
                encodeURIComponent(String(el.selectedOptions[oi].value || ""))
            );
          }
        } else if (el.options && el.selectedIndex >= 0) {
          chunks.push(
            encodeURIComponent(n) +
              "=" +
              encodeURIComponent(String(el.options[el.selectedIndex].value || ""))
          );
        }
      } else if (tag === "TEXTAREA") {
        chunks.push(encodeURIComponent(n) + "=" + encodeURIComponent(el.value || ""));
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

  function upsertParam(body, key, value) {
    var k = encodeURIComponent(key);
    var v = encodeURIComponent(String(value == null ? "" : value));
    var parts = String(body || "").split("&").filter(Boolean);
    var out = [];
    var seen = false;
    var i;
    for (i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf("=");
      var pk = eq === -1 ? parts[i] : parts[i].slice(0, eq);
      if (pk === k) {
        if (!seen) {
          out.push(k + "=" + v);
          seen = true;
        }
      } else out.push(parts[i]);
    }
    if (!seen) out.push(k + "=" + v);
    return out.join("&");
  }

  function looksLikeLoginHtml(html) {
    var s = String(html || "").slice(0, 12000).toLowerCase();
    return (
      /login|sign\s*in|sso|oauth/i.test(s) &&
      (!/needtoreplenish|btn-search|workflow\/nob/i.test(s) ||
        s.indexOf("password") >= 0)
    );
  }

  function outboundSearchHtml(html0) {
    var hdrBase = {
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      Referer: OUTBOUND_DASH,
      Origin: "https://outbound.coupang.com",
    };
    var doc0 = new DOMParser().parseFromString(html0, "text/html");
    var form = findNobDashboardSearchForm(doc0);
    if (!form) return Promise.resolve({ html: html0, note: "no-form" });
    var method = String(form.method || form.getAttribute("method") || "get")
      .toUpperCase()
      .trim();
    var actRaw = form.getAttribute("action");
    var submitUrl =
      actRaw != null &&
      String(actRaw).trim().length > 0 &&
      String(actRaw).trim() !== "#"
        ? new URL(String(actRaw).trim(), OUTBOUND_DASH).href.split("#")[0]
        : OUTBOUND_DASH;
    var body = upsertParam(serializeOutboundForm(form), "searched", "true");
    var xh = outboundCsrfFromDoc(doc0);

    function postSearch() {
      return gmXhr({
        method: "POST",
        url: submitUrl,
        data: body,
        headers: Object.assign(
          {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
            Referer: OUTBOUND_DASH,
            Origin: "https://outbound.coupang.com",
          },
          xh
        ),
        tag: "outbound 조회(POST)",
      }).then(function (html1) {
        return { html: html1, note: "form-post" };
      });
    }

    if (method === "GET") {
      var uGet = submitUrl;
      if (body) uGet += (uGet.indexOf("?") !== -1 ? "&" : "?") + body;
      return gmXhr({
        url: uGet,
        headers: Object.assign({}, hdrBase, xh),
        tag: "outbound 조회(GET)",
      }).then(function (html1) {
        if (
          parseOutboundItemsFromHtml(html1).list.length ||
          parseCutlinesFromHtml(html1).length
        ) {
          return { html: html1, note: "form-get" };
        }
        return postSearch();
      });
    }
    return postSearch();
  }

  function mergeOutboundStores(intoStore, fromStore) {
    var i;
    for (i = 0; i < fromStore.list.length; i++) intoStore.add(fromStore.list[i]);
    intoStore.failed = (intoStore.failed || 0) + (fromStore.failed || 0);
  }

  function outboundPageStoreSig(store) {
    var n = store.list.length;
    if (!n) return "0";
    return (
      String(n) +
      "|" +
      String(store.list[0].barcode) +
      "|" +
      String(store.list[n - 1].barcode)
    );
  }

  function parseOutboundMaxPageFromHtml(html) {
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    var maxPage = 1;
    var nodes = doc.querySelectorAll("w-page-item-group w-page-item, w-page-item");
    var i, el, v1, v2, ui2, h, t;
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      v1 = parseInt(String(el.getAttribute("data-go-page") || "").trim(), 10);
      if (isFinite(v1) && v1 > maxPage) maxPage = v1;
      v2 = parseInt(String(el.getAttribute("data-page") || "").trim(), 10);
      if (isFinite(v2)) {
        ui2 = v2 >= 0 ? v2 + 1 : v2;
        if (isFinite(ui2) && ui2 > maxPage) maxPage = ui2;
      }
      h = parseInt(String(el.getAttribute("href") || "").trim(), 10);
      if (isFinite(h) && h > maxPage) maxPage = h;
      t = parseInt(String(el.textContent || "").replace(/[^\d]/g, ""), 10);
      if (isFinite(t) && t > maxPage) maxPage = t;
    }
    return maxPage;
  }

  function parseOutboundActivePageFromHtml(html) {
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

  function buildOutboundPageUrl(base, key, val) {
    try {
      var u = new URL(base);
      u.searchParams.set(String(key || "page"), String(val));
      return u.href;
    } catch (eUrl) {
      return base;
    }
  }

  function pickOutboundPagingForm(doc) {
    if (!doc) return null;
    var p = doc.querySelector("input[name='page']");
    if (p && p.form) return p.form;
    return doc.querySelector('form[action*="/workflow/nob/v2/view/"]');
  }

  function findOutboundListSearchForm(doc) {
    var sel = doc.querySelector('select[name="pagingSize"]');
    if (sel && sel.closest) {
      var f = sel.closest("form");
      if (f) return f;
    }
    return findNobDashboardSearchForm(doc);
  }

  function outboundFetchHeaders(refererUrl) {
    return {
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      Referer: refererUrl || OUTBOUND_DASH,
      Origin: "https://outbound.coupang.com",
    };
  }

  function outboundDetailHeaders(baseUrl) {
    return outboundFetchHeaders(baseUrl || OUTBOUND_DASH);
  }

  /** NeedToReplenish Copier 와 동일: pagingSize 100 + 조회(POST/GET) 후 HTML 반환 */
  async function applyOutboundPagingSize100(baseUrl, html0) {
    var doc = new DOMParser().parseFromString(String(html0 || ""), "text/html");
    var form = findOutboundListSearchForm(doc);
    if (!form) return html0;
    if (!doc.querySelector('select[name="pagingSize"]')) return html0;
    var method = String(form.method || form.getAttribute("method") || "get")
      .toUpperCase()
      .trim();
    var actRaw = form.getAttribute("action");
    var submitUrl =
      actRaw != null &&
      String(actRaw).trim().length > 0 &&
      String(actRaw).trim() !== "#"
        ? new URL(String(actRaw).trim(), baseUrl).href.split("#")[0]
        : baseUrl;
    var body = upsertParam(serializeOutboundForm(form), "pagingSize", OUTBOUND_LIST_PAGE_SIZE);
    body = upsertParam(body, "searched", "true");
    body = upsertParam(body, "page", "0");
    var xh = outboundCsrfFromDoc(doc);
    var hdr = outboundFetchHeaders(baseUrl);

    function postSize100() {
      return gmXhr({
        method: "POST",
        url: submitUrl,
        data: body,
        headers: Object.assign(
          {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          },
          hdr,
          xh
        ),
        tag: "outbound pagingSize=100",
      });
    }

    if (method === "GET") {
      var uGet = submitUrl;
      if (body) uGet += (uGet.indexOf("?") !== -1 ? "&" : "?") + body;
      try {
        var htmlGet = await gmXhr({
          url: uGet,
          headers: Object.assign({}, hdr, xh),
          tag: "outbound pagingSize=100 GET",
        });
        if (parseOutboundItemsFromHtml(htmlGet).list.length) return htmlGet;
      } catch (eG) {}
    }
    try {
      return await postSize100();
    } catch (eP) {
      return html0;
    }
  }

  /** 출고 목록 다음 페이지를 받는 방식 — 0~2: GET 주소 형식, 3: POST. -1 = 아직 모름 */
  var outboundPageMethod = -1;

  async function fetchOutboundListPageHtml(baseUrl, uiPage, contextHtml) {
    var tryUrls = [
      buildOutboundPageUrl(baseUrl, "page", Math.max(0, uiPage - 1)),
      buildOutboundPageUrl(baseUrl, "page", uiPage),
      buildOutboundPageUrl(baseUrl, "pageNumber", uiPage),
    ];
    // 앞서 통한 방식부터 — 매 페이지 GET 3가지를 차례로 더듬던 것 줄임
    var order = [0, 1, 2];
    if (outboundPageMethod >= 0 && outboundPageMethod <= 2) {
      order = [outboundPageMethod].concat(
        order.filter(function (x) {
          return x !== outboundPageMethod;
        })
      );
    } else if (outboundPageMethod === 3) {
      order = [];
    }
    var oi, ai;
    for (oi = 0; oi < order.length; oi++) {
      ai = order[oi];
      try {
        var htmlGet = await gmXhr({
          url: tryUrls[ai],
          headers: outboundDetailHeaders(baseUrl),
          tag: "outbound p" + uiPage + " GET",
        });
        var storeGet = parseOutboundItemsFromHtml(htmlGet);
        if (!storeGet.list.length) continue;
        if (parseOutboundActivePageFromHtml(htmlGet) === uiPage) {
          outboundPageMethod = ai;
          return htmlGet;
        }
      } catch (eGet) {}
    }
    var doc = new DOMParser().parseFromString(String(contextHtml || ""), "text/html");
    var form = pickOutboundPagingForm(doc);
    if (!form) throw new Error("outbound paging form not found");
    var actionRaw = form.getAttribute("action");
    var submitUrl =
      actionRaw && String(actionRaw).trim() && String(actionRaw).trim() !== "#"
        ? new URL(String(actionRaw).trim(), baseUrl).href
        : baseUrl;
    var body = upsertParam(serializeOutboundForm(form), "page", String(Math.max(0, uiPage - 1)));
    body = upsertParam(body, "pagingSize", OUTBOUND_LIST_PAGE_SIZE);
    body = upsertParam(body, "searched", "true");
    var xh = Object.assign(
      {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      outboundFetchHeaders(baseUrl),
      outboundCsrfFromDoc(doc)
    );
    var htmlPost = await gmXhr({
      method: "POST",
      url: submitUrl,
      data: body,
      headers: xh,
      tag: "outbound p" + uiPage + " POST",
    });
    if (parseOutboundActivePageFromHtml(htmlPost) !== uiPage) {
      // POST 로 기억했는데 안 맞으면 다음엔 처음부터 다시 더듬음
      if (outboundPageMethod === 3) outboundPageMethod = -1;
      throw new Error("outbound page mismatch " + uiPage);
    }
    outboundPageMethod = 3;
    return htmlPost;
  }

  async function collectOutboundItemsAllPages(baseUrl, firstHtml, onPageProgress) {
    var htmlReady = firstHtml;
    try {
      htmlReady = await applyOutboundPagingSize100(baseUrl, firstHtml);
    } catch (eSz) {
      htmlReady = firstHtml;
    }
    var store = parseOutboundItemsFromHtml(htmlReady);
    var maxHint = parseOutboundMaxPageFromHtml(htmlReady);
    if (!isFinite(maxHint) || maxHint < 1) maxHint = 1;
    var seenSig = Object.create(null);
    seenSig[outboundPageStoreSig(store)] = 1;
    var contextHtml = htmlReady;
    var p;
    for (p = 2; p <= OUTBOUND_PAGE_CAP; p++) {
      if (stopRequested) break;
      if (onPageProgress) onPageProgress(p, maxHint);
      var htmlP = "";
      try {
        htmlP = await fetchOutboundListPageHtml(baseUrl, p, contextHtml);
      } catch (eMove) {
        // 마지막 페이지 다음은 원래 실패로 끝남 — 있다고 알려진 페이지에서 실패했을 때만 집계
        if (p <= maxHint) store.failed = (store.failed || 0) + 1;
        break;
      }
      var storeP = parseOutboundItemsFromHtml(htmlP);
      if (!storeP.list.length) break;
      var sig = outboundPageStoreSig(storeP);
      if (seenSig[sig]) break;
      seenSig[sig] = 1;
      mergeOutboundStores(store, storeP);
      contextHtml = htmlP;
      if (p > maxHint + 1 && p > store.list.length) {
        /* keep trying until dup/empty */
      }
      await sleep(OUTBOUND_PAGE_DELAY_MS);
    }
    return store;
  }

  async function collectOutboundItemsFromDetailUrls(urls, onProgress) {
    var store = outboundItemStore();
    var di;
    for (di = 0; di < urls.length; di++) {
      if (stopRequested) break;
      if (onProgress) onProgress(di + 1, urls.length, urls[di], 1, 1);
      try {
        var html = await gmXhr({
          url: urls[di],
          headers: outboundDetailHeaders(urls[di]),
          tag: "outbound 상세 p1",
        });
        var part = await collectOutboundItemsAllPages(urls[di], html, function (p, maxH) {
          if (onProgress) onProgress(di + 1, urls.length, urls[di], p, maxH);
        });
        mergeOutboundStores(store, part);
      } catch (eD) {
        // 실패한 컷라인은 건너뛰되 개수는 남김 — 완료 메시지에 표시
        store.failed = (store.failed || 0) + 1;
      }
      if (di + 1 < urls.length) await sleep(80);
    }
    return store;
  }

  function outboundFetchResult(store, note, extra) {
    var out = {
      items: store.list,
      byBarcode: store.byBarcode,
      failed: store.failed || 0,
      barcodes: store.list.map(function (it) {
        return it.barcode;
      }),
      note: note,
    };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
      }
    }
    return out;
  }

  async function fetchOutboundItems(onProgress, opt) {
    opt = opt || {};
    var selectedUrls = opt.selectedCutlineUrls || null;
    var useSelectedOnly = !!(selectedUrls && selectedUrls.length);
    var hdr = {
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      Referer: OUTBOUND_DASH,
      Origin: "https://outbound.coupang.com",
    };
    if (useSelectedOnly) {
      var storeSel = await collectOutboundItemsFromDetailUrls(
        selectedUrls,
        onProgress
      );
      return outboundFetchResult(storeSel, "detail-selected-" + selectedUrls.length, {
        cutlines: selectedUrls.length,
      });
    }
    var html0 = await gmXhr({ url: OUTBOUND_DASH, headers: hdr, tag: "outbound 대시보드" });
    if (looksLikeLoginHtml(html0)) {
      return outboundFetchResult(outboundItemStore(), "login", { html: html0 });
    }
    var store0 = await collectOutboundItemsAllPages(OUTBOUND_DASH, html0);
    if (store0.list.length) {
      return outboundFetchResult(store0, "dashboard-get");
    }
    var searched = await outboundSearchHtml(html0);
    var html1 = searched.html || html0;
    if (looksLikeLoginHtml(html1)) {
      return outboundFetchResult(outboundItemStore(), "login", { html: html1 });
    }
    var store1 = await collectOutboundItemsAllPages(OUTBOUND_DASH, html1);
    if (store1.list.length) {
      return outboundFetchResult(store1, searched.note || "search");
    }
    var cutObjs = parseCutlinesFromHtml(html1);
    var cuts = cutlineUrlsFromItems(cutObjs);
    if (!cuts.length) {
      return outboundFetchResult(outboundItemStore(), searched.note || "no-data", {
        html: html1,
      });
    }
    var storeD = await collectOutboundItemsFromDetailUrls(cuts, onProgress);
    return outboundFetchResult(storeD, "detail-" + cuts.length, {
      cutlines: cuts.length,
    });
  }

  function mergeInventoryMeta(meta, dto) {
    if (!dto) return meta;
    if (!meta.skuId && dto.skuId != null) meta.skuId = String(dto.skuId);
    if (!meta.name && dto.skuName) meta.name = String(dto.skuName).trim();
    if (!meta.barcode && dto.skuBarcode) {
      meta.barcode = String(dto.skuBarcode).trim();
    }
    return meta;
  }

  function parseInventoryPage(jsonText, queryBarcode) {
    var matched = [];
    var meta = {
      skuId: "",
      barcode: String(queryBarcode || "").trim(),
      name: "",
    };
    var j;
    try {
      j = JSON.parse(String(jsonText || ""));
    } catch (eJ) {
      return { matched: matched, meta: meta };
    }
    if (!j || j.success === false) return { matched: matched, meta: meta };
    var content = j.result && j.result.content;
    if (!Array.isArray(content)) return { matched: matched, meta: meta };
    var i, row, loc, dto;
    for (i = 0; i < content.length; i++) {
      row = content[i];
      if (!row) continue;
      dto = row.skuDto || {};
      mergeInventoryMeta(meta, dto);
      loc = String(row.locationBarcode || "").trim();
      if (!atsLocationMatches(loc)) continue;
      matched.push({
        location: loc,
        inventoryId:
          row.inventoryId != null ? String(row.inventoryId).replace(/\D/g, "") : "",
        skuId: String(dto.skuId != null ? dto.skuId : ""),
        barcode: String(dto.skuBarcode || meta.barcode || queryBarcode || "").trim(),
        name: String(dto.skuName || "").trim(),
        obQty: "",
        unloadTime: "",
        loadTime: "",
        status: "",
        vehicleNo: "",
        tempZone: "",
        gc: "",
        ct: "",
        priority: "",
        atsDeadline: "",
        qty:
          row.quantity != null && isFinite(Number(row.quantity))
            ? String(row.quantity)
            : "",
        _expiredAt: pickInventoryExpiryRaw(row),
        lpnId: row.lpnId != null ? String(row.lpnId) : "",
      });
    }
    return { matched: matched, meta: meta };
  }

  function applyOutboundFields(row, ob) {
    if (!row) return row;
    if (ob) {
      row.obQty = ob.obQty || "";
      row.atsDeadline = ob.atsDeadline || "";
      if (row.unloadTime == null) row.unloadTime = "";
      if (row.loadTime == null) row.loadTime = "";
      if (row.status == null) row.status = "";
      if (row.vehicleNo == null) row.vehicleNo = "";
      if (row.tempZone == null) row.tempZone = "";
    }
    return row;
  }

  function makeNoStockRow(queryBarcode, meta, ob) {
    var m = meta || {};
    return applyOutboundFields(
      {
        location: ATS_NO_STOCK_LABEL,
        skuId: String(m.skuId != null ? m.skuId : ""),
        barcode: String(m.barcode || queryBarcode || "").trim(),
        name: String(m.name || "").trim(),
        obQty: "",
        unloadTime: "",
        loadTime: "",
        status: "",
        vehicleNo: "",
        tempZone: "",
        gc: "",
        ct: "",
        priority: "",
        atsDeadline: "",
        qty: ATS_NO_STOCK_QTY,
        noStock: true,
      },
      ob
    );
  }

  /** 보충데이터입력.html 대시보드 ①~⑬ — ⑨냉동 ⑩냉장 ⑪상온 ⑫로켓 버퍼, ⑬재고없음 */
  var ATS_DASH_COUNT = 13;
  /** 진열가능 재고 없음 패널 — PDF 보충지에서 제외. 버퍼 칸 추가 시 맨 뒤 */
  var ATS_DASH_NO_STOCK = 13;
  var ATS_DASH_CHILLED_10_15 = ["10구", "15구", "10입", "15입"];
  var ATS_DASH_CHILLED_20_30 = ["20구", "25구", "30구", "20입", "25입", "30입"];

  function atsNameHasAnyFragment(nameText, frags) {
    var t = String(nameText || "");
    var i;
    for (i = 0; i < frags.length; i++) {
      if (t.indexOf(frags[i]) !== -1) return true;
    }
    return false;
  }

  function atsChilledMoistOrBakedEggExcludesDash13(nameText) {
    var t = String(nameText || "");
    return t.indexOf("촉촉란") !== -1 || t.indexOf("구운란") !== -1;
  }

  function atsChilledSmallPackCheeseOrSoftEggSkipsDash1(nameText) {
    var t = String(nameText || "");
    if (!atsNameHasAnyFragment(t, ATS_DASH_CHILLED_10_15)) return false;
    if (t.indexOf("치즈") !== -1) return true;
    if (t.indexOf("반숙이") !== -1) return true;
    if (t.indexOf("반숙란") !== -1) return true;
    return false;
  }

  function atsChilledMatchesDash1(nameText) {
    return atsNameHasAnyFragment(nameText, ATS_DASH_CHILLED_10_15);
  }

  function atsChilledMatchesDash2Sr(nameText) {
    return String(nameText || "").indexOf("[SR]") !== -1;
  }

  function atsChilledMatchesDash3LargeEgg(nameText) {
    var t = String(nameText || "");
    if (!atsNameHasAnyFragment(t, ATS_DASH_CHILLED_20_30)) return false;
    if (t.indexOf("반숙란") !== -1) return false;
    if (t.indexOf("반숙") !== -1) return false;
    return true;
  }

  function atsAmbientMatchesDash5(nameText) {
    var t = String(nameText || "");
    return t.indexOf("[팩]") !== -1 || t.indexOf("수박") !== -1;
  }

  function atsNormalizeLocationKey(loc) {
    return String(loc || "")
      .replace(/\u00a0/g, " ")
      .trim()
      .toUpperCase();
  }

  function atsLocationStartsWithPrefix(loc, prefix) {
    var s = atsNormalizeLocationKey(loc);
    var p = String(prefix || "").toUpperCase();
    return !!(s && p && s.indexOf(p) === 0);
  }

  function atsLocationHasAnyPrefix(loc, prefixes) {
    var i;
    for (i = 0; i < (prefixes || []).length; i++) {
      if (atsLocationStartsWithPrefix(loc, prefixes[i])) return true;
    }
    return false;
  }

  function atsBufferPrefixesForActiveCenter() {
    var pack = atsCenterBufferPack(transferToCenter());
    if (pack) {
      return {
        frozen: pack.frozen,
        chilled: pack.chilled,
        ambient: pack.ambient,
        rocket: pack.rocket,
      };
    }
    return {
      frozen: [ATS_BUFFER_LOC_PREFIX_FROZEN],
      chilled: [ATS_BUFFER_LOC_PREFIX_CHILLED, ATS_BUFFER_LOC_PREFIX_EGG],
      ambient: [],
      rocket: [],
    };
  }

  function atsLocationIsFrozenBufferZone(loc) {
    return atsLocationHasAnyPrefix(loc, atsBufferPrefixesForActiveCenter().frozen);
  }

  function atsLocationIsEggBufferZone(loc) {
    return atsLocationStartsWithPrefix(loc, ATS_BUFFER_LOC_PREFIX_EGG);
  }

  /** ⑩ 냉장버퍼존. YAN4는 2CPZ+에그, BUC2는 3CFZ·3CPZ·4CPY */
  function atsLocationIsChilledBufferZone(loc) {
    return atsLocationHasAnyPrefix(loc, atsBufferPrefixesForActiveCenter().chilled);
  }

  function atsLocationIsAmbientBufferZone(loc) {
    return atsLocationHasAnyPrefix(loc, atsBufferPrefixesForActiveCenter().ambient);
  }

  function atsLocationIsRocketBufferZone(loc) {
    return atsLocationHasAnyPrefix(loc, atsBufferPrefixesForActiveCenter().rocket);
  }

  function atsLocationIsBufferZone(loc) {
    return (
      atsLocationIsFrozenBufferZone(loc) ||
      atsLocationIsChilledBufferZone(loc) ||
      atsLocationIsAmbientBufferZone(loc) ||
      atsLocationIsRocketBufferZone(loc)
    );
  }

  /** @returns {number} 1~13 */
  function atsDashboardSlotForRow(row) {
    if (!row) return ATS_DASH_NO_STOCK;
    if (row.noStock || String(row.location || "").trim() === ATS_NO_STOCK_LABEL) {
      return ATS_DASH_NO_STOCK;
    }
    if (row.fromBufferOrder || atsLocationIsBufferZone(row.location)) {
      if (atsLocationIsFrozenBufferZone(row.location)) return 9;
      if (atsLocationIsChilledBufferZone(row.location)) return 10;
      if (atsLocationIsAmbientBufferZone(row.location)) return 11;
      if (atsLocationIsRocketBufferZone(row.location)) return 12;
      var zBuf = String(row.tempZone || "").trim().toUpperCase();
      if (zBuf === "FROZEN") return 9;
      if (zBuf === "CHILLED") return 10;
      return 10;
    }
    var z = String(row.tempZone || "").trim().toUpperCase();
    var n = String(row.name || "");
    if (z === "CHILLED") {
      var noDash13 = atsChilledMoistOrBakedEggExcludesDash13(n);
      var dash4Cheese =
        !noDash13 && atsChilledSmallPackCheeseOrSoftEggSkipsDash1(n);
      if (!noDash13 && !dash4Cheese && atsChilledMatchesDash1(n)) return 1;
      if (atsChilledMatchesDash2Sr(n)) return 2;
      if (!noDash13 && atsChilledMatchesDash3LargeEgg(n)) return 3;
      return 4;
    }
    if (z === "AMBIENT") {
      if (atsAmbientMatchesDash5(n)) return 5;
      return 6;
    }
    if (z === "FROZEN") return 7;
    return 8;
  }

  var ATS_DASH_PANEL_TITLES = [
    "① CHILLED — 10·15구 (프리팩)",
    "② CHILLED — [SR]",
    "③ CHILLED — 20·25·30구 (반숙·반숙란 제외)",
    "④ CHILLED — ①②③ 제외 나머지",
    "⑤ AMBIENT — [팩]·수박",
    "⑥ AMBIENT — ⑤ 제외 나머지",
    "⑦ FROZEN",
    "⑧ RM",
    "⑨ 냉동버퍼존",
    "⑩ 냉장버퍼존",
    "⑪ 상온버퍼존",
    "⑫ 로켓버퍼존",
    "⑬ 진열가능한 재고 없음",
  ];

  var ATS_TABLE_HEADERS = [
    "SKU ID",
    "Barcode",
    "보충",
    "재고",
    "상품명",
    "로케이션",
    "CT",
    "우선순위",
    "온도대",
    "차량번호",
    "상차시간",
    "하차시간",
    "상태",
    "보충기한",
    "FROM FC",
  ];

  var ATS_ROW_CELL_KEYS = [
    "skuId",
    "barcode",
    "obQty",
    "qty",
    "name",
    "location",
    "ct",
    "priority",
    "tempZone",
    "vehicleNo",
    "loadTime",
    "unloadTime",
    "status",
    "atsDeadline",
    "fromCenter",
  ];

  var ATS_TABLE_COL_COUNT = ATS_ROW_CELL_KEYS.length;
  /** 팀즈 복사·필터용 로케이션(GC) 열 (0-based) */
  var ATS_COL_LOCATION = 5;
  var ATS_DEADLINE_CHIP_STORAGE_KEY = "yna4_ats_deadline_chip_on_v1";
  var ATS_CUTLINE_SEL_STORAGE_KEY = "yna4_ats_cutline_sel_v1";
  var ATS_PRINT_DASH_CHIP_STORAGE_KEY = "yna4_ats_print_dash_chip_on_v1";
  var ATS_ZONE_MODE_STORAGE_KEY = "yna4_ats_zone_mode_v1";
  var ATS_SORT_MODE_STORAGE_KEY = "yna4_ats_sort_mode_v1";
  var ATS_URGENT_MODE_STORAGE_KEY = "yna4_ats_urgent_mode_v1";
  var ATS_COL_ATS_DEADLINE = 13;

  var ATS_TEAMS_COPY_BUTTONS = [
    { label: "EGG·SR", dashboards: [1, 2], title: "①② CHILLED 10·15구 · [SR] 표(HTML)+TSV" },
    { label: "EGG20·30", dashboards: [3], title: "③ CHILLED 20·25·30구" },
    { label: "냉장", dashboards: [4], title: "④ CHILLED 나머지" },
    { label: "상온", dashboards: [5, 6], title: "⑤⑥ AMBIENT" },
    { label: "냉동", dashboards: [7], title: "⑦ FROZEN" },
    { label: "RM", dashboards: [8], title: "⑧ RM" },
    {
      label: "냉동버퍼존",
      dashboards: [9],
      title: "⑨ 냉동버퍼존",
    },
    {
      label: "냉장버퍼존",
      dashboards: [10],
      title: "⑩ 냉장버퍼존",
    },
    {
      label: "상온버퍼존",
      dashboards: [11],
      title: "⑪ 상온버퍼존",
    },
    {
      label: "로켓버퍼존",
      dashboards: [12],
      title: "⑫ 로켓버퍼존",
    },
  ];

  function atsCellTextForTeamsTsv(td) {
    if (!td || td.textContent == null) return "";
    var s = String(td.textContent);
    s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    s = s.replace(/\t/g, " ");
    s = s.replace(/\n/g, " ");
    s = s.replace(/\u00a0/g, " ");
    return s.trim();
  }

  var ATS_COL_STATUS = 12;

  function atsTrExcludedFromTeamsCopy(tr) {
    if (!tr) return true;
    if (tr.classList.contains("yna4-ats-empty")) return true;
    if (tr.classList.contains("yna4-ats-row--no-stock")) return true;
    if (tr.classList.contains("yna4-ats-row--done")) return true;
    if (tr.classList.contains("yna4-ats-row--rcrt-display")) return true;
    var dk = tr.getAttribute("data-ats-done-key");
    if (dk && atsRowExcludedFromTeamsExport(dk)) return true;
    var tds = tr.querySelectorAll("td");
    if (
      tds.length > ATS_COL_STATUS &&
      atsStatusIsStowComplete(atsCellTextForTeamsTsv(tds[ATS_COL_STATUS]))
    ) {
      return true;
    }
    return false;
  }

  function atsDeadlineKeyFromCellRow(cells) {
    if (!cells || cells.length <= ATS_COL_ATS_DEADLINE) return "__EMPTY__";
    var s = String(cells[ATS_COL_ATS_DEADLINE] != null ? cells[ATS_COL_ATS_DEADLINE] : "").trim();
    return s ? s : "__EMPTY__";
  }

  function loadAtsDeadlineChipStateMap() {
    try {
      var raw = localStorage.getItem(ATS_DEADLINE_CHIP_STORAGE_KEY);
      if (!raw) return {};
      var j = JSON.parse(raw);
      return j && typeof j === "object" ? j : {};
    } catch (eLd) {
      return {};
    }
  }

  function saveAtsDeadlineChipStateMap(map) {
    try {
      localStorage.setItem(ATS_DEADLINE_CHIP_STORAGE_KEY, JSON.stringify(map || {}));
    } catch (eSv) {}
  }

  function collectAtsDeadlineCountsFromTables(tablesByDash) {
    var counts = Object.create(null);
    var d, table, trs, i, tr, tds, cells, k;
    for (d = 1; d <= ATS_DASH_COUNT; d++) {
      table = tablesByDash && tablesByDash[d];
      if (!table) continue;
      trs = table.querySelectorAll("tbody tr");
      for (i = 0; i < trs.length; i++) {
        tr = trs[i];
        if (atsTrExcludedFromTeamsCopy(tr)) continue;
        tds = tr.querySelectorAll("td");
        if (!tds.length) continue;
        if (
          !tr.getAttribute("data-ats-loc") &&
          (!tds.length || !atsCellTextForTeamsTsv(tds[ATS_COL_LOCATION]))
        ) {
          continue;
        }
        cells = [];
        for (var j = 0; j < tds.length; j++) {
          cells.push(atsCellTextForTeamsTsv(tds[j]));
        }
        k = atsDeadlineKeyFromCellRow(cells);
        if (k === "__EMPTY__") continue;
        counts[k] = (counts[k] || 0) + 1;
      }
    }
    return counts;
  }

  function collectUniqueAtsDeadlinesFromTables(tablesByDash) {
    var seen = Object.create(null);
    var keys = [];
    var d, table, trs, i, tr, tds, cells, k;
    for (d = 1; d <= ATS_DASH_COUNT; d++) {
      table = tablesByDash && tablesByDash[d];
      if (!table) continue;
      trs = table.querySelectorAll("tbody tr");
      for (i = 0; i < trs.length; i++) {
        tr = trs[i];
        if (atsTrExcludedFromTeamsCopy(tr)) continue;
        tds = tr.querySelectorAll("td");
        if (!tds.length) continue;
        if (
          !tr.getAttribute("data-ats-loc") &&
          (!tds.length || !atsCellTextForTeamsTsv(tds[ATS_COL_LOCATION]))
        ) {
          continue;
        }
        cells = [];
        for (var j = 0; j < tds.length; j++) {
          cells.push(atsCellTextForTeamsTsv(tds[j]));
        }
        k = atsDeadlineKeyFromCellRow(cells);
        if (k === "__EMPTY__") continue;
        if (seen[k]) continue;
        seen[k] = 1;
        keys.push({ key: k, label: k });
      }
    }
    keys.sort(function (a, b) {
      return String(a.label).localeCompare(String(b.label), "ko", {
        numeric: true,
      });
    });
    return keys;
  }

  function getAtsDeadlineExportEnabledKeysSet(chipHost) {
    if (!chipHost) return null;
    var btns = chipHost.querySelectorAll(
      "button.yna4-ats-deadline-chip[data-deadline-key]"
    );
    if (!btns.length) return null;
    var s = new Set();
    var i;
    for (i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute("aria-pressed") === "true") {
        s.add(String(btns[i].getAttribute("data-deadline-key") || "__EMPTY__"));
      }
    }
    return s;
  }

  /** 조회 실행 직후: 현재 표에 있는 보충마감 칩 전부 ON */
  function setAtsDeadlineChipsAllOnForTables(tablesByDash) {
    var list = collectUniqueAtsDeadlinesFromTables(tablesByDash);
    var map = {};
    var i;
    for (i = 0; i < list.length; i++) {
      map[list[i].key] = true;
    }
    saveAtsDeadlineChipStateMap(map);
  }

  function syncAtsDeadlineExportChips(chipHost, tablesByDash) {
    if (!chipHost) return;
    var list = collectUniqueAtsDeadlinesFromTables(tablesByDash);
    if (!list.length) {
      chipHost.innerHTML =
        "<span class=\"yna4-ats-deadline-chips-hint\">조회 실행 후 보충마감 시간대·잔여 건수 표시</span>";
      return;
    }
    var deadlineCounts = collectAtsDeadlineCountsFromTables(tablesByDash);
    var prev = loadAtsDeadlineChipStateMap();
    var pruned = {};
    var i;
    for (i = 0; i < list.length; i++) {
      var kk = list[i].key;
      if (Object.prototype.hasOwnProperty.call(prev, kk)) {
        pruned[kk] = prev[kk];
      } else {
        pruned[kk] = true;
      }
    }
    saveAtsDeadlineChipStateMap(pruned);
    chipHost.innerHTML = "";
    for (i = 0; i < list.length; i++) {
      (function (item) {
        var on = pruned[item.key] !== false;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "yna4-ats-deadline-chip";
        if (on) btn.classList.add("yna4-ats-deadline-chip--on");
        var rowCnt = deadlineCounts[item.key] || 0;
        btn.textContent =
          item.label + (rowCnt ? " · " + rowCnt + "건" : "");
        btn.setAttribute("data-deadline-key", item.key);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.title =
          (on ? "켜짐" : "꺼짐") +
          " · 잔여 " +
          rowCnt +
          "건 · 팀즈·PDF에 " +
          (on ? "포함" : "제외") +
          " (클릭하여 전환)";
        btn.addEventListener("click", function () {
          var cur = loadAtsDeadlineChipStateMap();
          var k = btn.getAttribute("data-deadline-key");
          var curOn = cur[k] !== false;
          cur[k] = !curOn;
          saveAtsDeadlineChipStateMap(cur);
          syncAtsDeadlineExportChips(chipHost, tablesByDash);
          if (atsPrintContext.teamsBtnGroup) {
            refreshAtsZoneButtons(
              atsPrintContext.teamsBtnGroup,
              tablesByDash
            );
          }
        });
        chipHost.appendChild(btn);
      })(list[i]);
    }
  }

  function getAtsTableCopyData(table, enabledDeadlineKeys) {
    if (!table) return null;
    var tbody = table.querySelector("tbody");
    if (!tbody) return null;
    var dataRows = [];
    var trs = tbody.querySelectorAll("tr");
    var i, tr, tds, j, cells, locText;
    for (i = 0; i < trs.length; i++) {
      tr = trs[i];
      if (tr.style.display === "none") continue;
      if (atsTrExcludedFromTeamsCopy(tr)) continue;
      tds = tr.querySelectorAll("td");
      if (!tds.length) continue;
      locText = tr.getAttribute("data-ats-loc") || "";
      if (!locText && tds.length > ATS_COL_LOCATION) {
        locText = atsCellTextForTeamsTsv(tds[ATS_COL_LOCATION]);
      }
      if (!locText || locText === ATS_NO_STOCK_LABEL) continue;
      cells = [];
      for (j = 0; j < tds.length; j++) {
        cells.push(atsCellTextForTeamsTsv(tds[j]));
      }
      if (
        enabledDeadlineKeys != null &&
        !enabledDeadlineKeys.has(atsDeadlineKeyFromCellRow(cells))
      ) {
        continue;
      }
      dataRows.push(cells);
    }
    if (!dataRows.length) return null;
    var headerCells = null;
    var thRow = table.querySelector("thead tr");
    if (thRow) {
      var ths = thRow.querySelectorAll("th");
      var headers = [];
      var h;
      for (h = 0; h < ths.length; h++) {
        var t =
          ths[h].textContent != null ? String(ths[h].textContent) : "";
        t = t.replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
        headers.push(t);
      }
      if (headers.length) headerCells = headers;
    }
    return { headerCells: headerCells, dataRows: dataRows };
  }

  /** 인쇄/PDF: 로컬 MERGE_PRINT와 동일 청크 방식. 보충기한 열은 인쇄에 표시. */
  var ATS_PRINT_ROWS_PER_PAGE = 14;
  var ATS_PRINT_CHUNK_HOST_ID = "yna4AtsPrintChunkHost";
  var ATS_PRINT_HIDE_ORIGINAL_CLASS = "yna4-ats-hidden-for-print-pages";
  /** SKU·상차 제거 후 12열 (보충기한 포함·표시) — 로컬 merge-table 비율 기준 */
  var ATS_PRINT_HEADERS = [
    "BC",
    "보충",
    "재고",
    "상품명",
    "로케이션",
    "CT",
    "우선순위",
    "온도대",
    "차량번호",
    "하차시간",
    "상태",
    "보충기한",
  ];
  var ATS_PRINT_COL_WIDTHS = [
    "4%",
    "3%",
    "3%",
    "22%",
    "11%",
    "11%",
    "5.5%",
    "4%",
    "6%",
    "9%",
    "5.5%",
    "10.5%",
  ];

  // 보충지출력(PDF) 버튼으로 시작한 인쇄인지 — 다른 출력(프리팩·라벨)엔 끼어들지 않게
  var atsPrintOwnRequest = false;
  var ATS_FOREIGN_PRINT_CLASSES = [
    "yna4-prepack-print",
    "yna4-rcrt-print-mode",
    "yna4-bipyo-print-mode",
  ];

  /** beforeprint 에서 ATS 보충지를 준비할지 — 버튼 출력이거나, ATS 화면에서 Ctrl+P 일 때만 */
  function atsShouldHandleBeforePrint() {
    var bl = document.body.classList;
    var i;
    // 다른 출력이 먼저 — afterprint 가 안 와서 atsPrintOwnRequest 가 남아 있어도 끼어들지 않게
    for (i = 0; i < ATS_FOREIGN_PRINT_CLASSES.length; i++) {
      if (bl.contains(ATS_FOREIGN_PRINT_CLASSES[i])) return false;
    }
    if (atsPrintOwnRequest) return true;
    var grid = atsPrintContext.dashboardsGrid;
    return !!(grid && grid.isConnected && grid.getClientRects().length);
  }

  var atsPrintContext = {
    dashboardsGrid: null,
    dashPanelTables: null,
    deadlineChipsHost: null,
    teamsBtnGroup: null,
    zoneModeSwitch: null,

  };

  function atsTrExcludedFromPrint(tr) {
    if (!tr) return true;
    if (tr.classList.contains("yna4-ats-empty")) return true;
    if (tr.classList.contains("yna4-ats-row--no-stock")) return true;
    if (tr.classList.contains("yna4-ats-row--done")) return true;
    return false;
  }

  function atsDeadlineKeyFromTrForPrint(tr) {
    if (!tr) return "__EMPTY__";
    var tds = tr.querySelectorAll("td");
    var cells = [];
    var j;
    for (j = 0; j < tds.length; j++) {
      cells.push(atsCellTextForTeamsTsv(tds[j]));
    }
    return atsDeadlineKeyFromCellRow(cells);
  }

  function stripAtsCellsExcludedFromPrintClone(tr) {
    if (!tr || !tr.querySelectorAll) return;
    var nodes = tr.querySelectorAll(
      ".yna4-ats-col--sku, .yna4-ats-col--load, .yna4-ats-col--fromfc"
    );
    var i;
    for (i = 0; i < nodes.length; i++) {
      nodes[i].remove();
    }
  }

  function atsPrintBarcodeLast4(raw) {
    var t = String(raw || "")
      .replace(/\s+/g, "")
      .trim();
    if (!t) return "";
    if (t.length <= 4) return t;
    return t.slice(-4);
  }

  /** 화면용 ch/em 열폭·title 제거 — 인쇄 표 폭 100% 안에 맞춤 */
  function normalizeAtsPrintRowClone(tr) {
    stripAtsCellsExcludedFromPrintClone(tr);
    if (!tr || !tr.querySelectorAll) return;
    var tds = tr.querySelectorAll("td");
    var i;
    for (i = 0; i < tds.length; i++) {
      tds[i].removeAttribute("class");
      tds[i].removeAttribute("style");
      tds[i].removeAttribute("title");
    }
    if (tds.length) {
      tds[0].textContent = atsPrintBarcodeLast4(
        atsCellTextForTeamsTsv(tds[0])
      );
    }
  }

  function collectAtsPrintRowsFromTbody(tbody, enabledDeadlineKeys) {
    var rows = [];
    if (!tbody) return rows;
    var trs = tbody.querySelectorAll("tr");
    var i, tr, tds, locText, cells;
    for (i = 0; i < trs.length; i++) {
      tr = trs[i];
      if (tr.style.display === "none") continue;
      if (atsTrExcludedFromPrint(tr)) continue;
      tds = tr.querySelectorAll("td");
      if (!tds.length) continue;
      locText = tr.getAttribute("data-ats-loc") || "";
      if (!locText && tds.length > ATS_COL_LOCATION) {
        locText = atsCellTextForTeamsTsv(tds[ATS_COL_LOCATION]);
      }
      if (!locText || locText === ATS_NO_STOCK_LABEL) continue;
      if (
        enabledDeadlineKeys != null &&
        !enabledDeadlineKeys.has(atsDeadlineKeyFromTrForPrint(tr))
      ) {
        continue;
      }
      rows.push(tr);
    }
    return rows;
  }

  function loadAtsPrintDashChipStateMap() {
    try {
      var raw = localStorage.getItem(ATS_PRINT_DASH_CHIP_STORAGE_KEY);
      if (!raw) return {};
      var j = JSON.parse(raw);
      return j && typeof j === "object" ? j : {};
    } catch (eLd) {
      return {};
    }
  }

  function saveAtsPrintDashChipStateMap(map) {
    try {
      localStorage.setItem(
        ATS_PRINT_DASH_CHIP_STORAGE_KEY,
        JSON.stringify(map || {})
      );
    } catch (eSv) {}
  }

  function setAtsPrintDashChipsAllOn() {
    var map = {};
    var i;
    for (i = 0; i < ATS_TEAMS_COPY_BUTTONS.length; i++) {
      map[ATS_TEAMS_COPY_BUTTONS[i].label] = true;
    }
    saveAtsPrintDashChipStateMap(map);
  }

  function findAtsZoneSpecByLabel(label) {
    var i;
    for (i = 0; i < ATS_TEAMS_COPY_BUTTONS.length; i++) {
      if (ATS_TEAMS_COPY_BUTTONS[i].label === label) {
        return ATS_TEAMS_COPY_BUTTONS[i];
      }
    }
    return null;
  }

  function loadAtsZoneMode() {
    try {
      if (localStorage.getItem(ATS_ZONE_MODE_STORAGE_KEY) === "pdf") return "pdf";
    } catch (eZm) {}
    return "teams";
  }

  function saveAtsZoneMode(mode) {
    try {
      localStorage.setItem(
        ATS_ZONE_MODE_STORAGE_KEY,
        mode === "pdf" ? "pdf" : "teams"
      );
    } catch (eSvZm) {}
  }

  function applyAtsZoneModeChrome(modeSwitch, teamsBtnGroup, mode) {
    var isTeams = mode !== "pdf";
    if (modeSwitch) {
      var btnT = modeSwitch.querySelector("[data-yna4-ats-zone-mode-teams]");
      var btnP = modeSwitch.querySelector("[data-yna4-ats-zone-mode-pdf]");
      if (btnT) {
        btnT.classList.toggle("yna4-ats-zone-mode-btn--on", isTeams);
        btnT.classList.toggle("yna4-ats-zone-mode-btn--teams-on", isTeams);
      }
      if (btnP) {
        btnP.classList.toggle("yna4-ats-zone-mode-btn--on", !isTeams);
        btnP.classList.toggle("yna4-ats-zone-mode-btn--pdf-on", !isTeams);
      }
      modeSwitch.setAttribute("data-ats-zone-mode", isTeams ? "teams" : "pdf");
    }
    if (teamsBtnGroup) {
      teamsBtnGroup.setAttribute("data-ats-zone-mode", isTeams ? "teams" : "pdf");
    }
  }

  function countAtsPrintableRowsInZone(tablesByDash, zoneSpec, enabledDeadlineKeys) {
    if (!zoneSpec || !zoneSpec.dashboards) return 0;
    var total = 0;
    var zi, table, tbody, rows;
    for (zi = 0; zi < zoneSpec.dashboards.length; zi++) {
      table = tablesByDash && tablesByDash[zoneSpec.dashboards[zi]];
      tbody = table ? table.querySelector("tbody") : null;
      rows = collectAtsPrintRowsFromTbody(tbody, enabledDeadlineKeys);
      total += rows.length;
    }
    return total;
  }

  function getAtsPrintEnabledDashboardIdsSet() {
    var pdfMap = loadAtsPrintDashChipStateMap();
    var s = new Set();
    var i, j, spec;
    for (i = 0; i < ATS_TEAMS_COPY_BUTTONS.length; i++) {
      spec = ATS_TEAMS_COPY_BUTTONS[i];
      if (pdfMap[spec.label] === false) continue;
      for (j = 0; j < spec.dashboards.length; j++) {
        s.add(spec.dashboards[j]);
      }
    }
    return s;
  }

  function refreshAtsZoneButtons(teamsBtnGroup, tablesByDash) {
    if (!teamsBtnGroup) return;
    var mode = loadAtsZoneMode();
    var isPdf = mode === "pdf";
    var pdfMap = loadAtsPrintDashChipStateMap();
    var enabledDl = getAtsDeadlineExportEnabledKeysSet(
      atsPrintContext.deadlineChipsHost
    );
    var btns = teamsBtnGroup.querySelectorAll("button[data-zone-key]");
    var bi, btn, key, spec, pdfOn, rowCnt;
    for (bi = 0; bi < btns.length; bi++) {
      btn = btns[bi];
      key = btn.getAttribute("data-zone-key") || "";
      spec = findAtsZoneSpecByLabel(key);
      if (!spec) continue;
      pdfOn = pdfMap[key] !== false;
      btn.className = "yna4-ats-btn yna4-ats-btn--teams yna4-ats-zone-btn";
      if (isPdf && pdfOn) btn.classList.add("yna4-ats-zone-btn--pdf-on");
      if (isPdf) {
        rowCnt = countAtsPrintableRowsInZone(tablesByDash, spec, enabledDl);
        btn.textContent = spec.label + (rowCnt ? " · " + rowCnt + "건" : "");
        btn.setAttribute("aria-pressed", pdfOn ? "true" : "false");
        btn.title =
          (spec.title || spec.label) +
          " · PDF " +
          (pdfOn ? "포함" : "제외") +
          (rowCnt ? " · 출력 " + rowCnt + "건" : "") +
          " · 클릭 전환";
      } else {
        btn.textContent = spec.label;
        btn.removeAttribute("aria-pressed");
        btn.title =
          (spec.title || spec.label) +
          " · 팀즈 HTML+TSV 복사 · 초록·주황 제외";
      }
    }
    applyAtsZoneModeChrome(
      atsPrintContext.zoneModeSwitch,
      teamsBtnGroup,
      mode
    );
  }

  function getAtsDashboardSectionTitle(dashboardIndex1, tablesByDash) {
    var table = tablesByDash && tablesByDash[dashboardIndex1];
    if (table && table.closest) {
      var panel = table.closest(".yna4-ats-dashboard-panel");
      if (panel) {
        var h3 = panel.querySelector(".yna4-ats-dashboard-panel-title");
        if (h3) {
          var t = String(h3.textContent != null ? h3.textContent : "")
            .replace(/\r?\n/g, " ")
            .trim();
          if (t) return t;
        }
      }
    }
    return String(ATS_DASH_PANEL_TITLES[dashboardIndex1 - 1] || "").trim();
  }

  function buildAtsPrintTableThead() {
    var thead = document.createElement("thead");
    var tr = document.createElement("tr");
    tr.className = "yna4-ats-print-header-row";
    var hi, th;
    for (hi = 0; hi < ATS_PRINT_HEADERS.length; hi++) {
      th = document.createElement("th");
      th.scope = "col";
      th.textContent = ATS_PRINT_HEADERS[hi];
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    return thead;
  }

  function ensureAtsPrintChunkHostElement() {
    var host = document.getElementById(ATS_PRINT_CHUNK_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = ATS_PRINT_CHUNK_HOST_ID;
      host.setAttribute("aria-hidden", "true");
    }
    if (host.parentNode !== document.body) {
      document.body.appendChild(host);
    }
    return host;
  }

  function prepareAtsPrintPagedTables() {
    var ctx = atsPrintContext;
    var grid = ctx.dashboardsGrid;
    var tablesByDash = ctx.dashPanelTables;
    if (!tablesByDash || !tablesByDash[1]) return false;
    var host = ensureAtsPrintChunkHostElement();
    if (!host) return false;
    host.innerHTML = "";
    var enabledPrint = getAtsDeadlineExportEnabledKeysSet(ctx.deadlineChipsHost);
    var enabledDash = getAtsPrintEnabledDashboardIdsSet();

    function appendChunksForRows(rows, parentEl, sectionTitleText) {
      var mount = parentEl || host;
      var titleText =
        sectionTitleText != null ? String(sectionTitleText).trim() : "";
      var slot = ATS_PRINT_ROWS_PER_PAGE;
      var start = 0;
      var chunkIndex = 0;
      while (start < rows.length) {
        var pageWrap = document.createElement("div");
        pageWrap.className = "yna4-ats-print-page-chunk";
        var dataSlots = slot - 1;
        if (titleText && chunkIndex === 0) {
          var titleEl = document.createElement("div");
          titleEl.className = "yna4-ats-print-section-title";
          titleEl.textContent = titleText;
          pageWrap.appendChild(titleEl);
          dataSlots = slot - 2;
        }
        var tbl = document.createElement("table");
        tbl.className = "yna4-ats-print-table";
        var colg = document.createElement("colgroup");
        var c;
        for (c = 0; c < ATS_PRINT_COL_WIDTHS.length; c++) {
          var col = document.createElement("col");
          col.style.width = ATS_PRINT_COL_WIDTHS[c];
          colg.appendChild(col);
        }
        tbl.appendChild(colg);
        tbl.appendChild(buildAtsPrintTableThead());
        var tb = document.createElement("tbody");
        var end = Math.min(start + dataSlots, rows.length);
        var j;
        for (j = start; j < end; j++) {
          var rowClone = rows[j].cloneNode(true);
          normalizeAtsPrintRowClone(rowClone);
          tb.appendChild(rowClone);
        }
        start = end;
        tbl.appendChild(tb);
        pageWrap.appendChild(tbl);
        mount.appendChild(pageWrap);
        chunkIndex += 1;
      }
    }

    var any = false;
    var d;
    for (d = 1; d <= ATS_DASH_COUNT; d++) {
      if (d === ATS_DASH_NO_STOCK) continue;
      if (enabledDash != null && !enabledDash.has(d)) continue;
      var table = tablesByDash && tablesByDash[d];
      var tbody = table ? table.querySelector("tbody") : null;
      var rows = collectAtsPrintRowsFromTbody(tbody, enabledPrint);
      if (!rows.length) continue;
      any = true;
      var dashBlock = document.createElement("div");
      dashBlock.className = "yna4-ats-print-dash-block";
      host.appendChild(dashBlock);
      var printTitle = getAtsDashboardSectionTitle(d, tablesByDash);
      if (!printTitle) printTitle = "대시보드 " + d;
      appendChunksForRows(rows, dashBlock, printTitle);
    }

    if (!any) {
      if (grid) grid.classList.remove(ATS_PRINT_HIDE_ORIGINAL_CLASS);
      return false;
    }
    var chunksAll = host.querySelectorAll(".yna4-ats-print-page-chunk");
    if (chunksAll.length) {
      chunksAll[chunksAll.length - 1].classList.add(
        "yna4-ats-print-page-chunk--last-doc"
      );
    }
    if (grid) grid.classList.add(ATS_PRINT_HIDE_ORIGINAL_CLASS);
    return true;
  }

  function restoreAtsPrintPagedTables() {
    var grid = atsPrintContext.dashboardsGrid;
    if (grid) grid.classList.remove(ATS_PRINT_HIDE_ORIGINAL_CLASS);
    var host = document.getElementById(ATS_PRINT_CHUNK_HOST_ID);
    if (host) host.innerHTML = "";
    document.body.classList.remove("yna4-ats-print-mode");
    atsPrintOwnRequest = false;
  }

  function runAtsPrintMergePdf(btnPrintPdf) {
    var restLabel = "보충지출력(PDF)";
    function flashButton(empty) {
      if (!btnPrintPdf) return;
      btnPrintPdf.textContent = empty ? "출력할 내용 없음" : restLabel;
      if (empty) {
        window.setTimeout(function () {
          btnPrintPdf.textContent = restLabel;
        }, 2200);
      }
    }
    var ek = getAtsDeadlineExportEnabledKeysSet(
      atsPrintContext.deadlineChipsHost
    );
    if (ek && ek.size === 0) {
      alert("보충마감 버튼을 하나 이상 켜 주세요.");
      flashButton(true);
      return;
    }
    var pd = getAtsPrintEnabledDashboardIdsSet();
    if (pd && pd.size === 0) {
      alert("PDF 모드에서 온도대를 하나 이상 켜 주세요.");
      flashButton(true);
      return;
    }
    try {
      if (!prepareAtsPrintPagedTables()) {
        flashButton(true);
        return;
      }
    } catch (ePrep) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[yna4 ats print prepare]", ePrep);
      }
      flashButton(true);
      return;
    }
    // 다른 카드(라벨·프리팩)의 @page가 뒤에 붙어 있으면 그쪽이 이김 → 출력 직전 맨 뒤로 다시 붙임
    injectAtsPrintCriticalCss();
    atsPrintOwnRequest = true;
    document.body.classList.add("yna4-ats-print-mode");
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        window.print();
      });
    });
  }

  if (!window.__YAN4_ATS_PRINT_HOOKS__) {
    window.__YAN4_ATS_PRINT_HOOKS__ = true;
    window.addEventListener("beforeprint", function () {
      if (!atsShouldHandleBeforePrint()) {
        // 다른 화면 출력 — 혹시 남은 ATS 보충지도 지우고 빠짐
        try {
          restoreAtsPrintPagedTables();
        } catch (eSkip) {}
        return;
      }
      document.body.classList.add("yna4-ats-print-mode");
      try {
        prepareAtsPrintPagedTables();
      } catch (eBp) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[yna4 ats beforeprint]", eBp);
        }
      }
    });
    window.addEventListener("afterprint", function () {
      function restore() {
        try {
          restoreAtsPrintPagedTables();
        } catch (eAp) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[yna4 ats afterprint]", eAp);
          }
        }
      }
      if (window.__YAN4_DESKTOP_SHELL__) {
        window.setTimeout(restore, 1500);
      } else {
        restore();
      }
    });
  }

  function gatherAtsCopySectionsForDashboardIds(
    dashboardIds,
    tablesByDash,
    enabledDeadlineKeys
  ) {
    var sections = [];
    var want = Object.create(null);
    var i, d, table, dat;
    for (i = 0; i < dashboardIds.length; i++) {
      want[dashboardIds[i]] = true;
    }
    for (d = 1; d <= ATS_DASH_COUNT; d++) {
      if (!want[d]) continue;
      table = tablesByDash && tablesByDash[d];
      dat = getAtsTableCopyData(table, enabledDeadlineKeys);
      if (dat) {
        sections.push({
          title: ATS_DASH_PANEL_TITLES[d - 1] || "",
          headerCells: dat.headerCells,
          dataRows: dat.dataRows,
        });
      }
    }
    return sections;
  }

  function buildAtsTeamsCopyTsvLines(sections) {
    var lines = [];
    var i, sec, r;
    for (i = 0; i < sections.length; i++) {
      sec = sections[i];
      if (sec.title) lines.push("# " + sec.title);
      if (sec.headerCells && sec.headerCells.length) {
        lines.push(sec.headerCells.join("\t"));
      }
      for (r = 0; r < sec.dataRows.length; r++) {
        lines.push(sec.dataRows[r].join("\t"));
      }
      if (sec.title) lines.push("");
    }
    return lines;
  }

  function escapeHtmlForTeamsClipboard(s) {
    return String(s != null ? s : "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildAtsTeamsHtmlFromSections(sections) {
    var parts = [];
    var s, sec, h, r, c;
    for (s = 0; s < sections.length; s++) {
      sec = sections[s];
      if (sec.title) {
        parts.push(
          "<p style=\"margin:10px 0 4px 0;font-weight:700;font-family:Segoe UI,Arial,sans-serif;font-size:13px;\">" +
            escapeHtmlForTeamsClipboard(sec.title) +
            "</p>"
        );
      }
      parts.push(
        "<table cellpadding=\"4\" cellspacing=\"0\" style=\"border-collapse:collapse;border:1px solid #64748b;margin-bottom:14px;font-family:Segoe UI,Arial,sans-serif;font-size:12px;\">"
      );
      if (sec.headerCells && sec.headerCells.length) {
        parts.push("<thead><tr>");
        for (h = 0; h < sec.headerCells.length; h++) {
          parts.push(
            "<th style=\"background:#e2e8f0;border:1px solid #94a3b8;padding:4px 8px;text-align:left;\">" +
              escapeHtmlForTeamsClipboard(sec.headerCells[h]) +
              "</th>"
          );
        }
        parts.push("</tr></thead>");
      }
      parts.push("<tbody>");
      for (r = 0; r < sec.dataRows.length; r++) {
        parts.push("<tr>");
        for (c = 0; c < sec.dataRows[r].length; c++) {
          parts.push(
            "<td style=\"border:1px solid #cbd5e1;padding:4px 8px;vertical-align:top;\">" +
              escapeHtmlForTeamsClipboard(sec.dataRows[r][c]) +
              "</td>"
          );
        }
        parts.push("</tr>");
      }
      parts.push("</tbody></table>");
    }
    return parts.join("");
  }

  function copyTextToClipboardAts(text) {
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
      return Promise.resolve(ok);
    } catch (eCp) {
      return Promise.resolve(false);
    }
  }

  function copyHtmlPlainToClipboardAts(innerBodyHtml, plainText) {
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
            return plain
              ? copyTextToClipboardAts(plain)
              : Promise.resolve(false);
          }
        );
      } catch (eClip) {
        return plain ? copyTextToClipboardAts(plain) : Promise.resolve(false);
      }
    }
    return plain ? copyTextToClipboardAts(plain) : Promise.resolve(false);
  }

  function copyAtsPreviewForTeamsSlice(
    btn,
    labelRest,
    dashboardIds,
    tablesByDash,
    deadlineChipHost
  ) {
    function flashButton(ok, empty) {
      if (!btn) return;
      btn.textContent = empty ? "복사할 내용 없음" : ok ? "복사됨" : "복사 실패";
      window.setTimeout(function () {
        btn.textContent = labelRest;
      }, empty ? 2200 : 1600);
    }
    var ek = getAtsDeadlineExportEnabledKeysSet(deadlineChipHost);
    if (ek && ek.size === 0) {
      alert("보충마감 버튼을 하나 이상 켜 주세요.");
      flashButton(false, true);
      return;
    }
    var sections = gatherAtsCopySectionsForDashboardIds(
      dashboardIds,
      tablesByDash,
      ek
    );
    if (!sections.length) {
      flashButton(false, true);
      return;
    }
    var plainTsv = buildAtsTeamsCopyTsvLines(sections).join("\n").trim();
    var innerHtml = buildAtsTeamsHtmlFromSections(sections);
    if (!plainTsv && !innerHtml) {
      flashButton(false, true);
      return;
    }
    copyHtmlPlainToClipboardAts(innerHtml, plainTsv).then(function (ok) {
      flashButton(ok, false);
    });
  }

  function atsDeadlineSortKey(row) {
    var dl = String((row && row.atsDeadline) || "").trim();
    if (!dl) return "\uffff";
    var rel = atsDeadlineRelMinutes(dl);
    if (!isFinite(rel)) return dl;
    return ("0000" + rel).slice(-4);
  }

  /** 버퍼존 주문행 — 유통기한 짧은 순 (표시 열 아님) */
  function atsExpiredAtSortKey(row) {
    // "2026-1-5" / "2026.01.05" 처럼 표기가 달라도 같은 기준(YYYY-MM-DD)으로 비교
    return inventoryExpirySortKey(row);
  }

  /** 이관 상태 「진열완료」— 부분진열완료는 제외하지 않음 */
  function atsStatusIsStowComplete(status) {
    var s = String(status || "").replace(/\s+/g, "");
    if (!s) return false;
    if (s.indexOf("부분진열") >= 0) return false;
    return s === "진열완료" || s.indexOf("진열완료") === 0;
  }

  function atsRowHiddenByStatus(row) {
    return atsStatusIsStowComplete(row && row.status);
  }

  /** 이동중 → 대시보드 하단 (0=일반, 1=이동중) */
  function atsStatusBottomRank(row) {
    return String((row && row.status) || "").trim() === "이동중" ? 1 : 0;
  }

  function atsVehicleSortKey(row) {
    var v = String((row && row.vehicleNo) || "")
      .replace(/\s+/g, "")
      .trim();
    if (!v) return "\uffff";
    return v;
  }

  /** 보충수량 정렬 키 — 많은 순 (숫자 없으면 맨 뒤) */
  function atsObQtySortValue(row) {
    var n = parseObQtyNumber(row && row.obQty);
    return isFinite(n) ? n : -Infinity;
  }

  /**
   * 대시보드 화면 나열 순서만 결정 — 재고 로케이션 선택(FIFO)과는 무관.
   * "fifo"=기존 기본 순서 · "qty"=보충수량 많은 순 우선
   */
  var atsSortMode = "fifo";

  function loadAtsSortMode() {
    try {
      if (localStorage.getItem(ATS_SORT_MODE_STORAGE_KEY) === "qty") return "qty";
    } catch (eSm) {}
    return "fifo";
  }

  function saveAtsSortMode(mode) {
    try {
      localStorage.setItem(
        ATS_SORT_MODE_STORAGE_KEY,
        mode === "qty" ? "qty" : "fifo"
      );
    } catch (eSm) {}
  }

  function sortRowsWithinDashboard(rows) {
    var copy = (rows || []).slice();
    copy.sort(function (a, b) {
      var sa = atsStatusBottomRank(a);
      var sb = atsStatusBottomRank(b);
      if (sa !== sb) return sa - sb;
      if (atsSortMode === "qty") {
        var qa = atsObQtySortValue(a);
        var qb = atsObQtySortValue(b);
        if (qa !== qb) return qb - qa;
      }
      var ea = atsExpiredAtSortKey(a);
      var eb = atsExpiredAtSortKey(b);
      if (ea !== eb) return ea < eb ? -1 : 1;
      var ka = atsDeadlineSortKey(a);
      var kb = atsDeadlineSortKey(b);
      if (ka !== kb) return ka < kb ? -1 : 1;
      var va = atsVehicleSortKey(a);
      var vb = atsVehicleSortKey(b);
      if (va !== vb) return va < vb ? -1 : 1;
      return String(a.location || "").localeCompare(
        String(b.location || ""),
        "ko"
      );
    });
    return copy;
  }

  var ATS_URGENT_LOAD_HOUR_LIMIT = 18;

  /** 상차시간 "HH:MM" → 분. 없으면 NaN */
  function atsLoadTimeMinutes(row) {
    var s = formatAtsTimeOnly((row && row.loadTime) || "");
    var m = /^(\d{1,2}):(\d{2})/.exec(String(s).trim());
    if (!m) return NaN;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  /** 직납·프로젝트 직납은 전부 · 그 외는 상차시간 18:00 이전만 (버퍼존 제외) */
  function atsRowIsUrgentDirect(row) {
    if (!row || row.noStock) return false;
    if (atsLocationIsBufferZone(row.location)) return false;
    if (atsCtLabelFromLocation(row.location).indexOf("직납") >= 0) return true;
    var mins = atsLoadTimeMinutes(row);
    if (!isFinite(mins)) return false;
    return mins < ATS_URGENT_LOAD_HOUR_LIMIT * 60;
  }

  /** 0=꺼짐 · 1=음영표시 · 2=해당행만 */
  var atsUrgentMode = 0;

  function loadAtsUrgentMode() {
    try {
      var v = Number(localStorage.getItem(ATS_URGENT_MODE_STORAGE_KEY));
      if (v === 1 || v === 2) return v;
    } catch (eUm) {}
    return 0;
  }

  function saveAtsUrgentMode(mode) {
    try {
      localStorage.setItem(ATS_URGENT_MODE_STORAGE_KEY, String(mode || 0));
    } catch (eUm) {}
  }

  /** 개별 재고조회 — 대상 행의 추가보충 표시만 해제 (다른 행 상태 보존) */
  function clearAdditionalReplKeysForLookupPacks(packs) {
    var pi, ji, jobs;
    for (pi = 0; pi < (packs || []).length; pi++) {
      jobs = (packs[pi] && packs[pi].jobs) || [];
      for (ji = 0; ji < jobs.length; ji++) {
        if (jobs[ji] && jobs[ji].doneKey) {
          atsAdditionalReplenishKeys.delete(jobs[ji].doneKey);
        }
      }
    }
  }

  /** 클릭한 행과 같은 SKU 행 모두 — 로케이션이 여러 개면 함께 조회 */
  function atsRowsForSameSku(allRows, seedRow) {
    var out = [];
    var seedSku = String((seedRow && seedRow.skuId) || "").trim();
    var i, r;
    if (!seedSku) return seedRow ? [seedRow] : [];
    for (i = 0; i < (allRows || []).length; i++) {
      r = allRows[i];
      if (String((r && r.skuId) || "").trim() === seedSku) out.push(r);
    }
    return out.length ? out : seedRow ? [seedRow] : [];
  }

  function partitionAtsRowsByDashboard(rows) {
    var buckets = [];
    var s, i, slot, row;
    for (s = 1; s <= ATS_DASH_COUNT; s++) buckets[s] = [];
    for (i = 0; i < (rows || []).length; i++) {
      row = rows[i];
      if (atsRowHiddenByStatus(row)) continue;
      // 버퍼존은 필터 대상에서 제외 — 항상 표시
      if (
        atsUrgentMode === 2 &&
        !atsRowIsUrgentDirect(row) &&
        !atsLocationIsBufferZone(row && row.location)
      ) {
        continue;
      }
      slot = atsDashboardSlotForRow(row);
      if (slot >= 1 && slot <= ATS_DASH_COUNT) buckets[slot].push(row);
    }
    for (s = 1; s <= ATS_DASH_COUNT; s++) {
      buckets[s] = sortRowsWithinDashboard(buckets[s]);
    }
    return buckets;
  }

  var ATS_TABLE_COL_CLASSES = [
    "yna4-ats-col--sku",
    "yna4-ats-col--barcode",
    "yna4-ats-col--obqty",
    "yna4-ats-col--qty",
    "yna4-ats-col--name",
    "yna4-ats-col--loc",
    "yna4-ats-col--ct",
    "yna4-ats-col--priority",
    "yna4-ats-col--temp",
    "yna4-ats-col--vehicle",
    "yna4-ats-col--load",
    "yna4-ats-col--unload",
    "yna4-ats-col--status",
    "yna4-ats-col--deadline",
    "yna4-ats-col--fromfc",
  ];

  /** ①~⑪ 모든 패널 동일 열폭 (ch = 글자 수 기준, 값 안 잘리는 최소) */
  var ATS_TABLE_COL_WIDTHS = [
    "9ch",
    "15ch",
    "3.5ch",
    "3.5ch",
    "20em",
    "20ch",
    "15em",
    "5ch",
    "7ch",
    "8ch",
    "10ch",
    "10ch",
    "6ch",
    "6ch",
    "7ch",
  ];

  function buildAtsTableShell(dashId) {
    var wrap = document.createElement("div");
    wrap.className = "yna4-ats-panel-table-wrap";
    var table = document.createElement("table");
    table.className = "yna4-ats-table";
    if (dashId >= 1 && dashId <= ATS_DASH_COUNT) {
      table.id = "yna4AtsTable" + dashId;
    }
    var colgroup = document.createElement("colgroup");
    var hi, th, col, colCls;
    for (hi = 0; hi < ATS_TABLE_HEADERS.length; hi++) {
      colCls = ATS_TABLE_COL_CLASSES[hi] || "";
      col = document.createElement("col");
      if (colCls) col.className = colCls;
      if (ATS_TABLE_COL_WIDTHS[hi]) {
        col.style.width = ATS_TABLE_COL_WIDTHS[hi];
      }
      colgroup.appendChild(col);
    }
    var thead = document.createElement("thead");
    var thr = document.createElement("tr");
    for (hi = 0; hi < ATS_TABLE_HEADERS.length; hi++) {
      th = document.createElement("th");
      colCls = ATS_TABLE_COL_CLASSES[hi] || "";
      if (colCls) th.className = colCls;
      th.textContent = ATS_TABLE_HEADERS[hi];
      thr.appendChild(th);
    }
    thead.appendChild(thr);
    var tbody = document.createElement("tbody");
    table.appendChild(colgroup);
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);
    return { wrap: wrap, table: table, tbody: tbody };
  }

  function fetchInventoryForBarcode(barcode) {
    var merged = [];
    var meta = {
      skuId: "",
      barcode: String(barcode || "").trim(),
      name: "",
    };
    var page = 0;
    var totalPages = 1;
    function loop() {
      if (stopRequested || page >= INVENTORY_PAGE_CAP) {
        return Promise.resolve({ matched: merged, meta: meta });
      }
      var url = buildInventorySearchUrl(barcode, page);
      return inventoryFetch(url).then(function (text) {
        var j;
        var part;
        try {
          j = JSON.parse(text);
        } catch (eP) {
          return Promise.resolve({ matched: merged, meta: meta });
        }
        part = parseInventoryPage(text, barcode);
        mergeInventoryMeta(meta, {
          skuId: part.meta.skuId || null,
          skuName: part.meta.name,
          skuBarcode: part.meta.barcode,
        });
        if (part.meta.barcode) meta.barcode = part.meta.barcode;
        if (part.meta.name) meta.name = part.meta.name;
        if (part.meta.skuId) meta.skuId = part.meta.skuId;
        merged = merged.concat(part.matched);
        totalPages =
          j && j.result && j.result.totalPages != null
            ? Number(j.result.totalPages)
            : 1;
        if (!isFinite(totalPages) || totalPages < 1) totalPages = 1;
        page += 1;
        if (page >= totalPages) return { matched: merged, meta: meta };
        return loop();
      });
    }
    return loop();
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

  function renderTable(tbody, rows) {
    tbody.textContent = "";
    if (!rows.length) {
      var tr0 = document.createElement("tr");
      var td0 = document.createElement("td");
      td0.colSpan = ATS_TABLE_COL_COUNT;
      td0.className = "yna4-ats-empty";
      td0.textContent = "행 없음";
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
      return;
    }
    var i, r, tr, doneKey, gcForKey;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      tr = document.createElement("tr");
      tr.setAttribute("data-ats-loc", String(r.location || ""));
      if (atsUrgentMode && atsRowIsUrgentDirect(r)) {
        tr.classList.add("yna4-ats-row--urgent-direct");
      }
      if (r.noStock) {
        tr.classList.add("yna4-ats-row--no-stock");
      } else {
        gcForKey = r.location;
        doneKey = atsReplenishDoneKey(r.skuId, gcForKey);
        tr.setAttribute("data-ats-done-key", doneKey);
        if (atsReplenishDoneKeys.has(doneKey)) {
          tr.classList.add("yna4-ats-row--done");
        } else if (atsRcrtDisplayDoneKeys.has(doneKey)) {
          tr.classList.add("yna4-ats-row--rcrt-display");
        } else if (atsAdditionalReplenishKeys.has(doneKey)) {
          tr.classList.add("yna4-ats-row--additional-repl");
        }
      }
      var ci, ck, cellVal;
      for (ci = 0; ci < ATS_ROW_CELL_KEYS.length; ci++) {
        ck = ATS_ROW_CELL_KEYS[ci];
        var td = document.createElement("td");
        if (ATS_TABLE_COL_CLASSES[ci]) {
          td.className = ATS_TABLE_COL_CLASSES[ci];
        }
        if (ck === "location") {
          cellVal = atsLocationDisplayForRow(r);
        } else if (ck === "ct") {
          cellVal = atsCtDisplayForTableRow(r, doneKey);
        } else if (ck === "loadTime") {
          cellVal = formatAtsTimeOnly(r[ck] || "");
        } else if (ck === "unloadTime") {
          cellVal = formatAtsDateTimeCompact(r[ck] || "");
        } else {
          cellVal = r[ck] || "";
        }
        if (ck === "qty" && r.noStock) cellVal = ATS_NO_STOCK_QTY;
        td.textContent = cellVal;
        td.title = td.textContent;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function injectAtsPrintCriticalCss() {
    var cssId = "yna4-ats-print-critical-css-v8";
    var old = document.getElementById(cssId);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var oldV7 = document.getElementById("yna4-ats-print-critical-css-v7");
    if (oldV7 && oldV7.parentNode) oldV7.parentNode.removeChild(oldV7);
    var st = document.createElement("style");
    st.id = cssId;
    st.textContent =
      "#yna4AtsPrintChunkHost{display:none}" +
      "@media print{" +
      "@page{size:A4 landscape;margin:4mm}" +
      "html,body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0!important;padding:0!important;height:auto!important;max-height:none!important;overflow:visible!important}" +
      "body.yna4-ats-print-mode>*:not(#yna4AtsPrintChunkHost){display:none!important}" +
      "body.yna4-ats-print-mode #yna4AtsPrintChunkHost{display:block!important;position:static!important;width:100%!important;max-width:100%!important;box-sizing:border-box;padding:0 1.5mm;margin:0!important;overflow:visible!important}" +
      ".yna4-ats-hidden-for-print-pages{display:none!important}" +
      ".yna4-ats-print-dash-block:not(:first-child)>.yna4-ats-print-page-chunk:first-child{page-break-before:always!important;break-before:page!important}" +
      ".yna4-ats-print-page-chunk{page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid}" +
      ".yna4-ats-print-page-chunk--last-doc{page-break-after:auto;break-after:auto}" +
      ".yna4-ats-print-section-title{text-align:left!important;font-size:8.75pt!important;font-weight:700!important;background:#e2e8f0!important;padding:3px 4px!important;margin:0 0 1mm 0!important;box-sizing:border-box!important}" +
      ".yna4-ats-print-table{width:100%!important;max-width:100%!important;min-width:0!important;font-size:7.75pt!important;line-height:1.18!important;border-collapse:collapse!important;table-layout:fixed!important}" +
      ".yna4-ats-print-table col{min-width:0!important}" +
      ".yna4-ats-print-table td{padding:1px 2px!important;border-bottom:1px solid #cbd5e1!important;box-sizing:border-box!important;min-width:0!important;max-width:none!important;width:auto!important;word-break:break-word!important;overflow-wrap:anywhere!important;height:36pt!important;min-height:36pt!important;max-height:36pt!important}" +
      ".yna4-ats-print-table thead th{padding:1px 2px!important;border-bottom:1px solid #94a3b8!important;box-sizing:border-box!important;min-width:0!important;max-width:none!important;width:auto!important;background:#e2e8f0!important;font-weight:700!important;font-size:7.5pt!important;line-height:1.15!important;height:28pt!important;min-height:28pt!important;max-height:28pt!important;white-space:normal!important;overflow:hidden!important;text-align:center!important;vertical-align:middle!important}" +
      ".yna4-ats-print-table th:nth-child(1),.yna4-ats-print-table td:nth-child(1){width:4%!important;min-width:0!important}" +
      ".yna4-ats-print-table th:nth-child(2),.yna4-ats-print-table td:nth-child(2),.yna4-ats-print-table th:nth-child(3),.yna4-ats-print-table td:nth-child(3){width:3%!important}" +
      ".yna4-ats-print-table th:nth-child(4),.yna4-ats-print-table td:nth-child(4){width:22%!important;padding:2px 2px!important;white-space:normal!important;overflow:hidden!important;vertical-align:middle!important;text-align:left!important}" +
      ".yna4-ats-print-table th:nth-child(5),.yna4-ats-print-table td:nth-child(5){width:11%!important}" +
      ".yna4-ats-print-table th:nth-child(6),.yna4-ats-print-table td:nth-child(6){width:11%!important;min-width:0!important;white-space:normal!important;line-height:1.2!important;text-align:left!important}" +
      ".yna4-ats-print-table th:nth-child(7),.yna4-ats-print-table td:nth-child(7){width:5.5%!important;min-width:0!important}" +
      ".yna4-ats-print-table th:nth-child(8),.yna4-ats-print-table td:nth-child(8){width:4%!important}" +
      ".yna4-ats-print-table th:nth-child(9),.yna4-ats-print-table td:nth-child(9){width:6%!important}" +
      ".yna4-ats-print-table th:nth-child(10),.yna4-ats-print-table td:nth-child(10){width:9%!important;padding:2px 1px!important;font-size:7.25pt!important}" +
      ".yna4-ats-print-table th:nth-child(11),.yna4-ats-print-table td:nth-child(11){width:5.5%!important;padding:2px 1px!important}" +
      ".yna4-ats-print-table th:nth-child(12),.yna4-ats-print-table td:nth-child(12){width:10.5%!important}" +
      ".yna4-ats-print-table thead th:nth-child(12){color:#1e40af!important}" +
      ".yna4-ats-print-table tbody td:nth-child(12){font-weight:600!important;color:#1e40af!important;white-space:nowrap!important}" +
      ".yna4-ats-print-table tbody td:not(:nth-child(4)):not(:nth-child(6)){white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;vertical-align:middle!important;text-align:center!important}" +
      ".yna4-ats-print-table tbody tr.yna4-ats-row--done{background-color:#86efac!important}" +
      ".yna4-ats-print-table tbody tr.yna4-ats-row--rcrt-display{background-color:#fdba74!important}" +
      "}";
    (document.head || document.documentElement).appendChild(st);
  }

  function injectAtsToolbarCriticalCss() {
    var cssId = "yna4-ats-toolbar-critical-css-v26";
    var legacyCritIds = ["yna4-ats-toolbar-critical-css"];
    var vi, oldCrit;
    for (vi = 2; vi <= 25; vi++) {
      legacyCritIds.push("yna4-ats-toolbar-critical-css-v" + vi);
    }
    legacyCritIds.push(cssId);
    for (vi = 0; vi < legacyCritIds.length; vi++) {
      oldCrit = document.getElementById(legacyCritIds[vi]);
      if (oldCrit && oldCrit.parentNode) oldCrit.parentNode.removeChild(oldCrit);
    }
    var st = document.createElement("style");
    st.id = cssId;
    st.textContent =
      ".yna4-ats-toolbar{display:flex;flex-direction:column;align-items:stretch;gap:4px;flex-shrink:0;position:sticky;top:0;z-index:12;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;box-sizing:border-box}" +
      ".yna4-ats-toolbar-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:2px 4px;background:transparent;border:none}" +
      ".yna4-ats-toolbar-actions{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;padding:0;background:transparent;border:none}" +
      ".yna4-ats-teams-btn-group{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;padding:0;background:transparent;border:none}" +
      ".yna4-ats-toolbar-row--cutline{display:flex!important;flex-direction:column!important;flex-wrap:nowrap!important;align-items:stretch!important;gap:4px;padding-top:4px;border-top:1px dashed #e2e8f0;width:100%;min-width:0;box-sizing:border-box}" +
      ".yna4-ats-cutline-actions{display:flex;flex-wrap:nowrap;align-items:center;gap:4px;flex:0 0 auto;width:100%}" +
      ".yna4-ats-cutline-list{display:flex!important;flex-flow:row nowrap!important;align-items:center;gap:6px;flex:0 0 auto;width:100%!important;max-width:100%;min-width:0;padding:2px 0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:thin;font-size:10px;line-height:1.2;box-sizing:border-box}" +
      ".yna4-ats-cutline-chip{display:inline-flex!important;flex-shrink:0;align-items:center;gap:4px;padding:3px 8px;border:1px solid #bfdbfe;border-radius:10px;background:#fff;white-space:nowrap;cursor:pointer}" +
      ".yna4-ats-cutline-chip.is-on{border-color:#2563eb;background:#eff6ff}" +
      ".yna4-ats-cutline-chip>input[type=checkbox]{flex-shrink:0;margin:0}" +
      ".yna4-ats-cutline-chip-time{font-weight:600;color:#1e3a8a}" +
      ".yna4-ats-cutline-chip-count{display:inline-flex;padding:1px 5px;border-radius:999px;font-weight:800;font-size:9px;color:#9a3412;background:#ffedd5;border:1px solid #fb923c}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-btn--urgent{border:1px solid #fbbf24!important;background:#fffbeb!important;color:#92400e!important;-webkit-text-fill-color:#92400e!important;font-weight:700}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-btn--urgent.is-on{background:#fbbf24!important;border-color:#d97706!important;color:#3f2a06!important;-webkit-text-fill-color:#3f2a06!important}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-btn--urgent.is-only{background:#d97706!important;border-color:#b45309!important;color:#fff!important;-webkit-text-fill-color:#fff!important}" +
      ".yna4-ats-table tbody tr.yna4-ats-row--urgent-direct>td{background-color:#fde68a!important;box-shadow:inset 0 0 0 9999px rgba(251,191,36,.18)}" +
      ".yna4-ats-table tbody tr.yna4-ats-row--urgent-direct>td:first-child{border-left:3px solid #d97706!important}" +
      ".yna4-ats-table tbody tr[data-ats-done-key]{cursor:pointer}" +
      ".yna4-ats-table tbody tr[data-ats-done-key]:hover{outline:2px solid #2563eb;outline-offset:-2px}" +
      ".yna4-ats-zone-mode-switch{display:inline-flex;flex-shrink:0;align-items:center;gap:2px;padding:2px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;overflow:hidden}" +
      ".yna4-ats-zone-mode-switch[data-ats-zone-mode=teams]{border-color:#93c5fd;background:#eff6ff}" +
      ".yna4-ats-zone-mode-switch[data-ats-zone-mode=pdf]{border-color:#c4b5fd;background:#f5f3ff}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-zone-mode-btn{display:inline-flex!important;align-items:center;justify-content:center;min-height:20px!important;padding:2px 8px!important;border:1px solid transparent!important;border-radius:8px!important;font-size:10px!important;font-weight:600;cursor:pointer;background:transparent!important;color:#64748b!important;-webkit-text-fill-color:#64748b!important}" +
      "button.yna4-ats-zone-mode-btn.yna4-ats-zone-mode-btn--teams-on{background:#2563eb!important;border-color:#1d4ed8!important;color:#fff!important;-webkit-text-fill-color:#fff!important;font-weight:700!important}" +
      "button.yna4-ats-zone-mode-btn.yna4-ats-zone-mode-btn--pdf-on{background:#7c3aed!important;border-color:#6d28d9!important;color:#fff!important;-webkit-text-fill-color:#fff!important;font-weight:700!important}" +
      ".yna4-ats-toolbar-row--deadline{flex:1 1 100%!important;flex-wrap:nowrap!important;align-items:stretch;width:100%;min-width:0}" +
      ".yna4-ats-deadline-chips{display:flex!important;flex-flow:row nowrap!important;align-items:center;gap:4px;flex:1 1 auto;min-width:0;width:100%;max-width:100%;padding:2px 0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:thin;background:transparent;border:none}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-deadline-chip{display:inline-flex!important;flex-shrink:0!important;white-space:nowrap!important}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-btn{font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:10px!important;font-weight:600;line-height:1.15;-webkit-text-fill-color:currentColor;color:#334155!important;background:#fff;border:1px solid #cbd5e1;border-radius:10px!important;padding:2px 6px!important;min-height:22px!important;box-sizing:border-box;appearance:none;-webkit-appearance:none}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-btn--auto{min-width:74px;font-variant-numeric:tabular-nums;color:#b91c1c!important;-webkit-text-fill-color:#b91c1c!important;background:#fff!important;border-color:#f87171!important}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-btn--auto:hover:not(:disabled){background:#fef2f2!important}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-btn--auto.yna4-ats-btn--auto-on{color:#fff!important;-webkit-text-fill-color:#fff!important;background:#dc2626!important;border-color:#b91c1c!important}" +
      ".yna4-ats-deadline-offset{display:inline-flex;align-items:center;gap:3px;margin-left:8px;font-size:10px;font-weight:600;color:#334155;white-space:nowrap}" +
      ".yna4-ats-deadline-offset-minus{margin-left:4px;margin-right:-1px;font-weight:800;color:#b91c1c}" +
      ".yna4-ats-deadline-offset-input{width:48px;font-size:10px;font-weight:600;padding:1px 4px;border:1px solid #cbd5e1;border-radius:8px;min-height:20px;box-sizing:border-box;text-align:right}" +
      ".yna4-shell-page-ats-inner select.yna4-ats-auto-interval{font-family:Segoe UI,Malgun Gothic,sans-serif;font-size:10px;font-weight:600;line-height:1.15;color:#334155;background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:2px 4px;min-height:22px;box-sizing:border-box;cursor:pointer}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-btn--primary{color:#fff!important;-webkit-text-fill-color:#fff!important;background:#dc2626!important;border-color:#b91c1c!important}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-btn--cutline{color:#fff!important;-webkit-text-fill-color:#fff!important;background:#2563eb!important;border-color:#1d4ed8!important;font-weight:700!important}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-btn--gloc{color:#fff!important;-webkit-text-fill-color:#fff!important;background:#0f766e!important;border-color:#0d9488!important}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-btn--teams{min-width:1.8em;padding:2px 6px!important;font-size:10px!important;min-height:22px!important;border-radius:10px!important;color:#334155!important;-webkit-text-fill-color:#334155!important;background:#fff!important;border:1px solid #cbd5e1!important;appearance:none;-webkit-appearance:none}" +
      /* PDF ON 보라 — teams 흰 배경보다 뒤에·더 높은 특이도로 둬야 음영이 보임 */
      ".yna4-shell-page-ats-inner button.yna4-ats-btn.yna4-ats-zone-btn.yna4-ats-zone-btn--pdf-on{background:#7c3aed!important;border-color:#6d28d9!important;color:#fff!important;-webkit-text-fill-color:#fff!important;font-weight:700!important}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-btn.yna4-ats-zone-btn.yna4-ats-zone-btn--pdf-on:hover:not(:disabled){background:#6d28d9!important;border-color:#5b21b6!important;color:#fff!important;-webkit-text-fill-color:#fff!important}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-btn--print{color:#1e293b!important;-webkit-text-fill-color:#1e293b!important;background:#f8fafc!important;border-color:#475569!important;font-weight:700!important}" +
      ".yna4-shell-page-ats-inner button.yna4-ats-deadline-chip{display:inline-flex;align-items:center;justify-content:center;min-height:22px!important;padding:2px 6px!important;border-radius:10px!important;font-size:10px!important;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#f1f5f9;color:#64748b!important;-webkit-text-fill-color:#64748b!important;appearance:none;-webkit-appearance:none}" +
      "button.yna4-ats-deadline-chip.yna4-ats-deadline-chip--on{background:#16a34a!important;border-color:#15803d!important;color:#fff!important;-webkit-text-fill-color:#fff!important;font-weight:700!important}" +
      ".yna4-shell-page-ats-inner .yna4-ats-status{display:inline-flex;align-items:center;min-height:22px!important;padding:2px 6px!important;font-size:10px!important;line-height:1.15;box-sizing:border-box}" +
      ".yna4-shell-page-ats-inner .yna4-ats-status.yna4-ats-pane-status{--yna4-progress:0%;background:linear-gradient(90deg,#bef264 var(--yna4-progress),#f8fafc var(--yna4-progress))!important;border:1px solid #d9f99d;border-radius:10px!important;font-weight:600;color:#1f2937}" +
      ".yna4-ats-status.yna4-ats-pane-status.is-progress-heavy{color:#14532d}";
    (document.head || document.documentElement).appendChild(st);
  }

  function atsEnsureStylesheet() {
    injectAtsToolbarCriticalCss();
    injectAtsPrintCriticalCss();
    var cssId = "yna4-ats-page-css";
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
          chrome.runtime.getURL("yan4-ats-page.css") + "?v=" + ATS_UI_REV;
        (document.head || document.documentElement).appendChild(link);
      }
    } catch (eCss) {
      /* stylesheet optional — critical toolbar CSS injected above */
    }
  }

  function remountAtsHostIfStale(hostEl) {
    if (!hostEl) return false;
    if (hostEl.getAttribute("data-yna4-ats-ui-rev") === ATS_UI_REV) return false;
    hostEl.removeAttribute("data-yna4-ats-ready");
    hostEl.textContent = "";
    hostEl.className = "yna4-shell-page-ats-inner";
    window.__YAN4_INIT_SHELL_PAGE_ATS__(hostEl);
    return true;
  }

  var ATS_AUTO_INTERVALS_MIN = [10, 20, 30];
  var ATS_AUTO_INTERVAL_STORAGE_KEY = "yna4_ats_auto_interval_min_v1";
  /** AUTO 상태는 화면을 다시 그려도 유지 (앱을 다시 켜면 꺼진 상태) */
  var atsAuto = { on: false, nextAt: 0, timer: null };

  function loadAtsAutoIntervalMin() {
    try {
      var n = Number(localStorage.getItem(ATS_AUTO_INTERVAL_STORAGE_KEY));
      if (ATS_AUTO_INTERVALS_MIN.indexOf(n) >= 0) return n;
    } catch (e) {}
    return ATS_AUTO_INTERVALS_MIN[0];
  }

  function saveAtsAutoIntervalMin(n) {
    try {
      localStorage.setItem(ATS_AUTO_INTERVAL_STORAGE_KEY, String(n));
    } catch (e) {}
  }

  function formatAtsAutoRemain(ms) {
    var totalSec = Math.max(0, Math.ceil(ms / 1000));
    var s = totalSec % 60;
    return Math.floor(totalSec / 60) + ":" + (s < 10 ? "0" : "") + s;
  }

  window.__YAN4_INIT_SHELL_PAGE_ATS__ = function (hostEl) {
    if (!hostEl) return;
    if (atsAuto.timer) {
      clearInterval(atsAuto.timer);
      atsAuto.timer = null;
    }
    loadAtsReplenishDoneFromStorage();
    stopRequested = false;
    hostEl.textContent = "";
    hostEl.className = "yna4-shell-page-ats-inner yna4-ats-mounted";
    hostEl.setAttribute("data-yna4-ats-ready", "1");
    hostEl.setAttribute("data-yna4-ats-ui-rev", ATS_UI_REV);
    atsEnsureStylesheet();

    var root = document.createElement("div");
    root.className = "yna4-ats-root";

    var toolbar = document.createElement("div");
    toolbar.className = "yna4-ats-toolbar";

    var toolbarRowMain = document.createElement("div");
    toolbarRowMain.className = "yna4-ats-toolbar-row yna4-ats-toolbar-row--main";

    var toolbarRowCutline = document.createElement("div");
    toolbarRowCutline.className =
      "yna4-ats-toolbar-row yna4-ats-toolbar-row--cutline";

    var toolbarRowTeams = document.createElement("div");
    toolbarRowTeams.className = "yna4-ats-toolbar-row yna4-ats-toolbar-row--teams";

    var toolbarRowDeadline = document.createElement("div");
    toolbarRowDeadline.className = "yna4-ats-toolbar-row yna4-ats-toolbar-row--deadline";

    var btnRun = document.createElement("button");
    btnRun.type = "button";
    btnRun.className = "yna4-ats-btn yna4-ats-btn--primary";
    btnRun.setAttribute("data-yna4-ats-run", "1");
    btnRun.textContent = "조회실행";

    var btnAuto = document.createElement("button");
    btnAuto.type = "button";
    btnAuto.className = "yna4-ats-btn yna4-ats-btn--auto";
    btnAuto.setAttribute("data-yna4-ats-auto", "1");
    btnAuto.setAttribute("aria-pressed", "false");
    btnAuto.textContent = "AUTO";
    btnAuto.title = "켜면 고른 간격마다 조회실행 (다시 누르면 끔)";

    var selAutoInterval = document.createElement("select");
    selAutoInterval.className = "yna4-ats-auto-interval";
    selAutoInterval.setAttribute("aria-label", "자동 조회 간격");
    selAutoInterval.title = "자동 조회 간격";
    ATS_AUTO_INTERVALS_MIN.forEach(function (min) {
      var opt = document.createElement("option");
      opt.value = String(min);
      opt.textContent = min + "MIN";
      selAutoInterval.appendChild(opt);
    });
    selAutoInterval.value = String(loadAtsAutoIntervalMin());

    var btnGloc = document.createElement("button");
    btnGloc.type = "button";
    btnGloc.className = "yna4-ats-btn yna4-ats-btn--gloc";
    btnGloc.setAttribute("data-yna4-ats-gloc", "1");
    btnGloc.title =
      "로케이션+바코드 재고조회. 재고 없음→초록. 부분진열완료→주황·CT시각. 조회실행보다 이른 완료+보충잔존→CT 추가보충필요·마지막부분진열시각";
    btnGloc.textContent = "재고조회";

    var btnLoadCutlines = document.createElement("button");
    btnLoadCutlines.type = "button";
    btnLoadCutlines.className = "yna4-ats-btn yna4-ats-btn--cutline";
    btnLoadCutlines.setAttribute("data-yna4-ats-load-cutlines", "1");
    btnLoadCutlines.textContent = "시간대 조회";
    btnLoadCutlines.title =
      "조회실행 전 보충 시간대·잔여 건수 불러오기 (RPA 워크플로우 조회와 동일)";

    var btnCutlineAll = document.createElement("button");
    btnCutlineAll.type = "button";
    btnCutlineAll.className = "yna4-ats-btn yna4-ats-btn--teams";
    btnCutlineAll.setAttribute("data-yna4-ats-cutline-all", "1");
    btnCutlineAll.textContent = "전체";

    var btnCutlineNone = document.createElement("button");
    btnCutlineNone.type = "button";
    btnCutlineNone.className = "yna4-ats-btn yna4-ats-btn--teams";
    btnCutlineNone.setAttribute("data-yna4-ats-cutline-none", "1");
    btnCutlineNone.textContent = "해제";

    var cutlineActions = document.createElement("div");
    cutlineActions.className = "yna4-ats-cutline-actions";
    var cutlineActionsLabel = document.createElement("span");
    cutlineActionsLabel.className = "yna4-ats-cutline-actions-label";
    cutlineActionsLabel.textContent = "보충 시간대";
    cutlineActions.appendChild(cutlineActionsLabel);
    cutlineActions.appendChild(btnCutlineAll);
    cutlineActions.appendChild(btnCutlineNone);

    var offsetWrap = document.createElement("label");
    offsetWrap.className = "yna4-ats-deadline-offset";
    offsetWrap.title =
      "보충마감 = 출고마감 - 입력한 분 (기본 50분) · 다음 조회 실행부터 적용";
    var offsetLab = document.createElement("span");
    offsetLab.textContent = "보충마감설정";
    var offsetMinus = document.createElement("span");
    offsetMinus.className = "yna4-ats-deadline-offset-minus";
    offsetMinus.textContent = "-";
    var inpOffset = document.createElement("input");
    inpOffset.type = "number";
    inpOffset.min = "0";
    inpOffset.max = String(ATS_DEADLINE_OFFSET_MAX_MIN);
    inpOffset.step = "5";
    inpOffset.className = "yna4-ats-deadline-offset-input";
    inpOffset.value = String(getAtsDeadlineOffsetMin());
    var offsetUnit = document.createElement("span");
    offsetUnit.textContent = "분";
    inpOffset.addEventListener("change", function () {
      var n = normalizeAtsDeadlineOffset(inpOffset.value);
      if (n == null) n = getAtsDeadlineOffsetMin();
      inpOffset.value = String(n);
      saveAtsDeadlineOffsetMin(n);
      setStatus("보충마감설정 -" + n + "분 · 다음 조회 실행부터 적용");
    });
    offsetWrap.appendChild(offsetLab);
    offsetWrap.appendChild(offsetMinus);
    offsetWrap.appendChild(inpOffset);
    offsetWrap.appendChild(offsetUnit);
    cutlineActions.appendChild(offsetWrap);

    var cutlineListHost = document.createElement("div");
    cutlineListHost.id = "atsCutlineList";
    cutlineListHost.className = "yna4-ats-cutline-list";
    cutlineListHost.textContent = "시간대 조회 중…";

    var statusEl = document.createElement("span");
    statusEl.className = "yna4-ats-status";
    statusEl.setAttribute("role", "status");
    statusEl.textContent = "준비";

    var toolbarActions = document.createElement("div");
    toolbarActions.className = "yna4-ats-toolbar-actions";
    toolbarActions.appendChild(btnLoadCutlines);
    toolbarActions.appendChild(btnRun);
    toolbarActions.appendChild(btnAuto);
    toolbarActions.appendChild(selAutoInterval);
    // 일괄 재고조회 버튼 제거 — 대시보드에서 행(SKU) 클릭으로 개별 조회
    toolbarRowMain.appendChild(toolbarActions);
    toolbarRowMain.appendChild(statusEl);

    var zoneModeSwitch = document.createElement("span");
    zoneModeSwitch.className = "yna4-ats-zone-mode-switch";
    zoneModeSwitch.setAttribute("role", "group");
    zoneModeSwitch.setAttribute("aria-label", "팀즈 복사 / PDF 온도대 모드");
    var btnZoneModeTeams = document.createElement("button");
    btnZoneModeTeams.type = "button";
    btnZoneModeTeams.className =
      "yna4-ats-zone-mode-btn yna4-ats-zone-mode-btn--on yna4-ats-zone-mode-btn--teams-on";
    btnZoneModeTeams.setAttribute("data-yna4-ats-zone-mode-teams", "1");
    btnZoneModeTeams.textContent = "팀즈";
    btnZoneModeTeams.title = "구간 버튼 클릭 → 팀즈 표 복사";
    var btnZoneModePdf = document.createElement("button");
    btnZoneModePdf.type = "button";
    btnZoneModePdf.className = "yna4-ats-zone-mode-btn";
    btnZoneModePdf.setAttribute("data-yna4-ats-zone-mode-pdf", "1");
    btnZoneModePdf.textContent = "PDF";
    btnZoneModePdf.title = "구간 버튼 클릭 → PDF 포함 ON/OFF";
    zoneModeSwitch.appendChild(btnZoneModeTeams);
    zoneModeSwitch.appendChild(btnZoneModePdf);
    zoneModeSwitch.setAttribute("data-ats-zone-mode", "teams");

    var sortModeSwitch = document.createElement("span");
    sortModeSwitch.className = "yna4-ats-zone-mode-switch yna4-ats-sort-mode-switch";
    sortModeSwitch.setAttribute("role", "group");
    sortModeSwitch.setAttribute("aria-label", "대시보드 화면 나열 순서");
    var btnSortFifo = document.createElement("button");
    btnSortFifo.type = "button";
    btnSortFifo.className = "yna4-ats-zone-mode-btn yna4-ats-sort-mode-btn";
    btnSortFifo.textContent = "기본";
    btnSortFifo.title =
      "화면 나열 순서: 유통기한 → 보충마감 → 차량 → 로케이션 (기본)";
    var btnSortQty = document.createElement("button");
    btnSortQty.type = "button";
    btnSortQty.className = "yna4-ats-zone-mode-btn yna4-ats-sort-mode-btn";
    btnSortQty.textContent = "수량";
    btnSortQty.title =
      "화면 나열 순서: 보충수량 많은 순 (이동중은 계속 하단) · 재고 선택 FIFO 규칙과 무관";
    sortModeSwitch.appendChild(btnSortFifo);
    sortModeSwitch.appendChild(btnSortQty);

    var btnUrgent = document.createElement("button");
    btnUrgent.type = "button";
    btnUrgent.className = "yna4-ats-btn yna4-ats-btn--urgent";
    btnUrgent.setAttribute("data-yna4-ats-urgent", "1");
    btnUrgent.title =
      "직납은 전부 · 그 외는 상차시간 18:00 이전만 · 버퍼존은 항상 표시 · 클릭마다 꺼짐 → 음영표시 → 해당행만";

    var teamsBtnGroup = document.createElement("span");
    teamsBtnGroup.className = "yna4-ats-teams-btn-group";
    teamsBtnGroup.setAttribute("role", "group");
    teamsBtnGroup.setAttribute("aria-label", "온도대 구간 버튼");
    teamsBtnGroup.setAttribute("data-ats-zone-mode", "teams");
    var ti, teamSpec, teamBtn;
    for (ti = 0; ti < ATS_TEAMS_COPY_BUTTONS.length; ti++) {
      teamSpec = ATS_TEAMS_COPY_BUTTONS[ti];
      teamBtn = document.createElement("button");
      teamBtn.type = "button";
      teamBtn.className = "yna4-ats-btn yna4-ats-btn--teams yna4-ats-zone-btn";
      teamBtn.textContent = teamSpec.label;
      if (teamSpec.title) {
        teamBtn.title = teamSpec.title + " · 팀즈 HTML+TSV 복사 · 초록·주황 제외";
      }
      teamBtn.setAttribute("data-zone-key", teamSpec.label);
      teamBtn.setAttribute(
        "data-zone-dashboards",
        teamSpec.dashboards.join(",")
      );
      teamsBtnGroup.appendChild(teamBtn);
    }

    var deadlineChipsHost = document.createElement("div");
    deadlineChipsHost.id = "atsDeadlineExportChips";
    deadlineChipsHost.className = "yna4-ats-deadline-chips";
    deadlineChipsHost.setAttribute("role", "group");
    deadlineChipsHost.setAttribute(
      "aria-label",
      "보충마감별 팀즈 복사·PDF 출력 필터"
    );
    deadlineChipsHost.innerHTML =
      "<span class=\"yna4-ats-deadline-chips-hint\">조회 실행 후 보충마감 시간대·잔여 건수 표시</span>";

    var btnPrintPdf = document.createElement("button");
    btnPrintPdf.type = "button";
    btnPrintPdf.className = "yna4-ats-btn yna4-ats-btn--print";
    btnPrintPdf.id = "btnAtsPrintMergePdf";
    btnPrintPdf.textContent = "보충지출력(PDF)";
    btnPrintPdf.title =
      "보충지출력(PDF). PDF 모드에서 켠 온도대·보충마감 ON만 포함. 초록(완료) 행 제외.";

    toolbarRowCutline.appendChild(cutlineActions);
    toolbarRowCutline.appendChild(cutlineListHost);
    toolbarRowTeams.appendChild(sortModeSwitch);
    toolbarRowTeams.appendChild(btnUrgent);
    toolbarRowTeams.appendChild(zoneModeSwitch);
    toolbarRowTeams.appendChild(teamsBtnGroup);
    toolbarRowTeams.appendChild(btnPrintPdf);
    toolbarRowDeadline.appendChild(deadlineChipsHost);
    toolbar.appendChild(toolbarRowMain);
    toolbar.appendChild(toolbarRowCutline);
    toolbar.appendChild(toolbarRowTeams);
    toolbar.appendChild(toolbarRowDeadline);

    var dashboardsScroll = document.createElement("div");
    dashboardsScroll.className = "yna4-ats-dashboards-scroll";
    var dashboardsGrid = document.createElement("div");
    dashboardsGrid.className = "yna4-ats-dashboards-grid";
    dashboardsGrid.setAttribute("role", "region");
    dashboardsGrid.setAttribute("aria-label", "ATS 대시보드 ①~⑬");

    atsPrintContext.dashboardsGrid = dashboardsGrid;
    atsPrintContext.deadlineChipsHost = deadlineChipsHost;
    atsPrintContext.teamsBtnGroup = teamsBtnGroup;
    atsPrintContext.zoneModeSwitch = zoneModeSwitch;

    var dashPanelTbodies = [];
    var dashPanelTables = [];
    var dashPanelMetas = [];
    var pi, section, titleEl, metaEl, built;
    for (pi = 1; pi <= ATS_DASH_COUNT; pi++) {
      section = document.createElement("section");
      section.className = "yna4-ats-dashboard-panel";
      if (pi === ATS_DASH_NO_STOCK) section.className += " yna4-ats-dashboard-panel--etc";
      titleEl = document.createElement("h3");
      titleEl.className = "yna4-ats-dashboard-panel-title";
      titleEl.textContent = ATS_DASH_PANEL_TITLES[pi - 1];
      metaEl = document.createElement("p");
      metaEl.className = "yna4-ats-dashboard-panel-meta";
      metaEl.setAttribute("aria-live", "polite");
      built = buildAtsTableShell(pi);
      section.appendChild(titleEl);
      section.appendChild(metaEl);
      section.appendChild(built.wrap);
      dashboardsGrid.appendChild(section);
      dashPanelTbodies[pi] = built.tbody;
      dashPanelTables[pi] = built.table;
      dashPanelMetas[pi] = metaEl;
    }
    atsPrintContext.dashPanelTables = dashPanelTables;

    btnPrintPdf.addEventListener("click", function () {
      runAtsPrintMergePdf(btnPrintPdf);
    });

    function setAtsZoneModeLocal(mode) {
      saveAtsZoneMode(mode);
      refreshAtsZoneButtons(teamsBtnGroup, dashPanelTables);
    }

    refreshAtsZoneButtons(teamsBtnGroup, dashPanelTables);

    dashboardsScroll.appendChild(dashboardsGrid);

    root.appendChild(toolbar);
    root.appendChild(dashboardsScroll);
    hostEl.appendChild(root);

    var atsAllRows = [];
    var glocBusy = false;
    var atsCutlineItems = [];
    var ATS_CUTLINE_CB_CLASS = "yna4-ats-cutline-cb";
    var cutlineLoadBusy = false;

    function loadCutlineSelMap() {
      try {
        var raw = localStorage.getItem(ATS_CUTLINE_SEL_STORAGE_KEY);
        if (!raw) return {};
        var j = JSON.parse(raw);
        return j && typeof j === "object" ? j : {};
      } catch (eLd) {
        return {};
      }
    }

    function saveCutlineSelMap(map) {
      try {
        localStorage.setItem(
          ATS_CUTLINE_SEL_STORAGE_KEY,
          JSON.stringify(map || {})
        );
      } catch (eSv) {}
    }

    function getSelectedCutlineUrls() {
      var cbs = cutlineListHost.querySelectorAll(
        "input." + ATS_CUTLINE_CB_CLASS + ":checked"
      );
      var urls = [];
      var i;
      for (i = 0; i < cbs.length; i++) {
        if (cbs[i].dataset && cbs[i].dataset.url) urls.push(cbs[i].dataset.url);
      }
      return urls;
    }

    function persistCutlineCheckboxState() {
      var cbs = cutlineListHost.querySelectorAll(
        "input." + ATS_CUTLINE_CB_CLASS
      );
      var map = {};
      var i;
      for (i = 0; i < cbs.length; i++) {
        if (cbs[i].dataset && cbs[i].dataset.url) {
          map[cbs[i].dataset.url] = !!cbs[i].checked;
        }
      }
      saveCutlineSelMap(map);
    }

    function setAllCutlineChecks(on) {
      var cbs = cutlineListHost.querySelectorAll(
        "input." + ATS_CUTLINE_CB_CLASS
      );
      var i, chip;
      for (i = 0; i < cbs.length; i++) {
        cbs[i].checked = !!on;
        chip = cbs[i].closest(".yna4-ats-cutline-chip");
        if (chip) {
          if (on) chip.classList.add("is-on");
          else chip.classList.remove("is-on");
        }
      }
      persistCutlineCheckboxState();
    }

    function renderCutlineList(items) {
      cutlineListHost.textContent = "";
      if (!items || !items.length) {
        cutlineListHost.textContent =
          "0건 · outbound 대시보드에 보충 시간대가 없습니다.";
        return;
      }
      var prevSel = loadCutlineSelMap();
      var j;
      for (j = 0; j < items.length; j++) {
        (function (item) {
          var chip = document.createElement("label");
          chip.className = "yna4-ats-cutline-chip";
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.className = ATS_CUTLINE_CB_CLASS;
          cb.dataset.url = item.url;
          cb.dataset.label = item.label || item.cutline || item.url;
          var checked =
            Object.prototype.hasOwnProperty.call(prevSel, item.url) ?
              !!prevSel[item.url]
            : true;
          cb.checked = checked;
          if (checked) chip.classList.add("is-on");
          var labDate = document.createElement("span");
          labDate.className = "yna4-ats-cutline-chip-time";
          labDate.textContent = item.cutline || item.label || item.url;
          chip.appendChild(cb);
          chip.appendChild(labDate);
          if (item.needCount != null) {
            var labCnt = document.createElement("span");
            labCnt.className = "yna4-ats-cutline-chip-count";
            labCnt.textContent = String(item.needCount) + "unit";
            chip.appendChild(labCnt);
          }
          cb.addEventListener("change", function () {
            if (cb.checked) chip.classList.add("is-on");
            else chip.classList.remove("is-on");
            persistCutlineCheckboxState();
          });
          cutlineListHost.appendChild(chip);
        })(items[j]);
      }
    }

    async function loadWorkflowCutlines() {
      if (cutlineLoadBusy || pipelineBusy) {
        setStatus("다른 작업 진행 중…");
        return;
      }
      if (typeof GM_xmlhttpRequest !== "function") {
        setStatus("GM_xmlhttpRequest 없음 — 확장 새로고침", "err");
        return;
      }
      cutlineLoadBusy = true;
      btnLoadCutlines.disabled = true;
      setStatus("시간대 조회 중…");
      try {
        var dashList = await fetchOutboundDashboardCutlineList();
        if (dashList.note === "login") {
          cutlineListHost.textContent =
            "outbound 로그인 후 「시간대 조회」를 다시 눌러주세요.";
          setStatus(
            "outbound 로그인 필요 — outbound 탭에서 로그인 후 다시 조회",
            "err"
          );
          return;
        }
        if (dashList.note === "no-form") {
          cutlineListHost.textContent =
            "대시보드 폼 없음 — outbound에서 수동 조회 후 「시간대 조회」";
          setStatus(
            "대시보드 조회 폼 없음 — outbound에서 수동 조회 후 재시도",
            "err"
          );
          return;
        }
        atsCutlineItems = dashList.items || [];
        renderCutlineList(atsCutlineItems);
        if (!atsCutlineItems.length) {
          setStatus(
            "시간대 0건 — 조회실행은 대시보드 직접 수집을 시도합니다.",
            "ok"
          );
          return;
        }
        var totalNeed = 0;
        var ni;
        for (ni = 0; ni < atsCutlineItems.length; ni++) {
          if (atsCutlineItems[ni].needCount != null) {
            totalNeed += atsCutlineItems[ni].needCount;
          }
        }
        var line =
          "시간대 " +
          atsCutlineItems.length +
          "개 · 선택 후 조회실행";
        if (totalNeed) line += " · 합계 " + totalNeed + "unit";
        setStatus(line, "ok");
      } catch (eCut) {
        cutlineListHost.textContent =
          "시간대 조회 실패 · 「시간대 조회」 버튼으로 다시 시도";
        setStatus(
          "시간대 조회 실패: " +
            (eCut && eCut.message ? eCut.message : String(eCut)),
          "err"
        );
      } finally {
        cutlineLoadBusy = false;
        btnLoadCutlines.disabled = false;
      }
    }

    function renderAllDashboardPanels(resetDeadlineChipsAllOn) {
      var buckets = partitionAtsRowsByDashboard(atsAllRows);
      var pi, cnt;
      for (pi = 1; pi <= ATS_DASH_COUNT; pi++) {
        cnt = sumAtsObQtyUnits(buckets[pi]);
        dashPanelMetas[pi].textContent =
          (formatObQtyNumber(cnt) || "0") + "unit";
        dashPanelMetas[pi].title = "보충 unit 합";
        renderTable(dashPanelTbodies[pi], buckets[pi]);
      }
      if (resetDeadlineChipsAllOn) {
        setAtsDeadlineChipsAllOnForTables(dashPanelTables);
        setAtsPrintDashChipsAllOn();
      }
      syncAtsDeadlineExportChips(deadlineChipsHost, dashPanelTables);
      refreshAtsZoneButtons(teamsBtnGroup, dashPanelTables);
    }

    function applyAtsSortModeUi() {
      var qtyOn = atsSortMode === "qty";
      sortModeSwitch.setAttribute("data-ats-zone-mode", qtyOn ? "pdf" : "teams");
      btnSortFifo.className =
        "yna4-ats-zone-mode-btn yna4-ats-sort-mode-btn" +
        (qtyOn ? "" : " yna4-ats-zone-mode-btn--on yna4-ats-zone-mode-btn--teams-on");
      btnSortQty.className =
        "yna4-ats-zone-mode-btn yna4-ats-sort-mode-btn" +
        (qtyOn ? " yna4-ats-zone-mode-btn--on yna4-ats-zone-mode-btn--pdf-on" : "");
    }

    function setAtsSortMode(mode) {
      var next = mode === "qty" ? "qty" : "fifo";
      if (next === atsSortMode) return;
      atsSortMode = next;
      saveAtsSortMode(next);
      applyAtsSortModeUi();
      // 정렬만 바뀌므로 재조회 없이 현재 데이터로 다시 그림
      renderAllDashboardPanels(false);
    }

    btnSortFifo.addEventListener("click", function () {
      setAtsSortMode("fifo");
    });
    btnSortQty.addEventListener("click", function () {
      setAtsSortMode("qty");
    });
    atsSortMode = loadAtsSortMode();
    applyAtsSortModeUi();

    function applyAtsUrgentUi() {
      btnUrgent.textContent =
        atsUrgentMode === 2
          ? "직납+18시이전 · 해당행만"
          : atsUrgentMode === 1
          ? "직납+18시이전 · 음영"
          : "직납+18시이전";
      btnUrgent.classList.toggle("is-on", atsUrgentMode === 1);
      btnUrgent.classList.toggle("is-only", atsUrgentMode === 2);
    }

    function cycleAtsUrgentMode() {
      atsUrgentMode = (atsUrgentMode + 1) % 3;
      saveAtsUrgentMode(atsUrgentMode);
      applyAtsUrgentUi();
      renderAllDashboardPanels(false);
    }

    btnUrgent.addEventListener("click", function (ev) {
      ev.preventDefault();
      cycleAtsUrgentMode();
    });
    atsUrgentMode = loadAtsUrgentMode();
    applyAtsUrgentUi();

    function clearAllDashboardPanels() {
      var pi;
      for (pi = 1; pi <= ATS_DASH_COUNT; pi++) {
        dashPanelMetas[pi].textContent = "";
        renderTable(dashPanelTbodies[pi], []);
      }
    }

    function setStatus(msg, mode) {
      statusEl.textContent = msg || "";
      statusEl.style.removeProperty("--yna4-progress");
      statusEl.removeAttribute("data-progress");
      statusEl.className =
        "yna4-ats-status" +
        (mode === "err" ? " err" : mode === "ok" ? " ok" : "");
    }

    var ATS_PIPELINE_PROGRESS_LABEL = "조회실행 중…";

    function setAtsPipelineProgress(percent, msg) {
      var p = Number(percent);
      if (!isFinite(p)) p = 0;
      if (p < 0) p = 0;
      if (p > 100) p = 100;
      statusEl.textContent = msg || ATS_PIPELINE_PROGRESS_LABEL;
      statusEl.className = "yna4-ats-status yna4-ats-pane-status";
      statusEl.style.setProperty("--yna4-progress", p.toFixed(1) + "%");
      statusEl.setAttribute("data-progress", String(Math.round(p)));
      if (p >= 55) statusEl.classList.add("is-progress-heavy");
      else statusEl.classList.remove("is-progress-heavy");
    }

    var pipelineBusy = false;

    /**
     * @param {Array=} optRows 조회 대상 행. 생략 시 전체.
     * @param {string=} optLabel 상태 메시지에 붙일 대상 표기 (SKU 등)
     */
    async function runAtsGlocLookupAndMarkDone(optRows, optLabel) {
      if (glocBusy || pipelineBusy) {
        setStatus("다른 작업 진행 중…");
        return;
      }
      if (!atsAllRows.length) {
        setStatus("먼저 조회 실행으로 표를 채워 주세요.", "err");
        return;
      }
      var targetRows =
        optRows && optRows.length ? optRows : atsAllRows;
      var scopeTag = optLabel ? " · " + optLabel : "";
      var locPack = collectLocationLookupPackFromRows(targetRows);
      if (!locPack.lookupPacks.length) {
        setStatus(
          "재고조회 생략 · 대상 없음(완료·주황·⑪·빈 로케이션 제외)" + scopeTag,
          "ok"
        );
        return;
      }
      glocBusy = true;
      btnGloc.disabled = true;
      if (targetRows === atsAllRows) {
        atsAdditionalReplenishKeys.clear();
      } else {
        // 개별 조회는 대상 행의 추가보충 표시만 초기화
        clearAdditionalReplKeysForLookupPacks(locPack.lookupPacks);
      }
      var doneKeysToMark = [];
      var orangeKeysToMark = [];
      var seenDoneKey = Object.create(null);
      var seenOrangeKey = Object.create(null);
      var seenAdditionalKey = Object.create(null);
      var errCt = 0;
      var noStockPackCt = 0;
      var partialOrangeCt = 0;
      var additionalReplCt = 0;
      var li, pack, loc, bc, text, hasStock, s, dk, jobs, ji, job, hits, hit, logText, partialInfo;
      var logCache, statusBc;
      var totalSteps = locPack.lookupPacks.length;
      var step = 0;
      try {
        for (li = 0; li < locPack.lookupPacks.length; li++) {
          if (stopRequested) {
            setStatus("재고조회 중지됨 · " + step + "/" + totalSteps, "err");
            break;
          }
          pack = locPack.lookupPacks[li];
          loc = pack.loc;
          bc = pack.barcode;
          jobs = pack.jobs || [];
          step += 1;
          statusBc = normalizeBarcode(bc) || String(pack.skuId || "");
          setStatus(
            "재고조회 " +
              step +
              "/" +
              totalSteps +
              " · " +
              loc +
              " · " +
              statusBc +
              scopeTag
          );
          text = await inventoryFetch(
            buildInventorySearchUrlForGlocLookup(loc, bc, pack.skuId, 0)
          );
          hasStock = inventoryLocationHasStockFromResponse(text);
          if (hasStock === null) {
            errCt += 1;
            if (step < totalSteps) await sleep(ATS_GLOC_LOOKUP_DELAY_MS);
            continue;
          }
          if (!hasStock) {
            noStockPackCt += 1;
            for (s = 0; s < jobs.length; s++) {
              dk = jobs[s].doneKey;
              if (!dk || seenDoneKey[dk]) continue;
              seenDoneKey[dk] = 1;
              doneKeysToMark.push(dk);
            }
            if (step < totalSteps) await sleep(ATS_GLOC_LOOKUP_DELAY_MS);
            continue;
          }
          hits = parseInventoryHitsAtLocation(text, loc);
          logCache = Object.create(null);
          for (ji = 0; ji < jobs.length; ji++) {
            job = jobs[ji];
            if (!job || !job.doneKey || seenOrangeKey[job.doneKey]) continue;
            hit = pickInventoryHitForRow(hits, job);
            if (!hit || !hit.inventoryId) {
              errCt += 1;
              continue;
            }
            if (!Object.prototype.hasOwnProperty.call(logCache, hit.inventoryId)) {
              try {
                logCache[hit.inventoryId] = await inventoryLogFetch(
                  hit.inventoryId
                );
                await sleep(ATS_GLOC_LOOKUP_DELAY_MS);
              } catch (eLogF) {
                logCache[hit.inventoryId] = null;
                errCt += 1;
              }
            }
            logText = logCache[hit.inventoryId];
            if (!logText) continue;
            partialInfo = parsePartialDisplayInfoFromLog(logText, job.obQty);
            if (
              !partialInfo.completed ||
              !atsLogIndicatesPartialDisplay(partialInfo.displayQty, job.obQty)
            ) {
              continue;
            }
            if (isFinite(partialInfo.completedAtMs)) {
              atsRcrtDisplayTimeByKey[job.doneKey] = partialInfo.completedAtMs;
            }
            if (
              isFinite(atsLastPipelineRunAt) &&
              isFinite(partialInfo.completedAtMs) &&
              partialInfo.completedAtMs < atsLastPipelineRunAt
            ) {
              if (!seenAdditionalKey[job.doneKey]) {
                seenAdditionalKey[job.doneKey] = 1;
                atsAdditionalReplenishKeys.add(job.doneKey);
                if (atsRcrtDisplayDoneKeys.has(job.doneKey)) {
                  atsRcrtDisplayDoneKeys.delete(job.doneKey);
                }
                additionalReplCt += 1;
              }
              continue;
            }
            seenOrangeKey[job.doneKey] = 1;
            orangeKeysToMark.push(job.doneKey);
            partialOrangeCt += 1;
          }
          if (step < totalSteps) await sleep(ATS_GLOC_LOOKUP_DELAY_MS);
        }
        var markGreen = doneKeysToMark.length
          ? atsMarkReplenishDoneKeys(doneKeysToMark)
          : { marked: 0 };
        var markOrange = orangeKeysToMark.length
          ? atsMarkRcrtDisplayDoneKeys(orangeKeysToMark)
          : { marked: 0 };
        if (additionalReplCt) saveAtsRcrtDisplayDoneToStorage();
        saveAtsAdditionalReplToStorage();
        saveAtsRcrtDisplayTimeToStorage();
        renderAllDashboardPanels();
        var line =
          "재고조회" +
          scopeTag +
          " · 초록 " +
          (markGreen.marked != null ? markGreen.marked : doneKeysToMark.length) +
          " · 주황 " +
          (markOrange.marked != null ? markOrange.marked : orangeKeysToMark.length);
        if (additionalReplCt) line += " · 추가보충 " + additionalReplCt;
        if (noStockPackCt) line += " · 재고없음 " + noStockPackCt + "건";
        if (partialOrangeCt) line += " · 부분진열 " + partialOrangeCt;
        if (errCt) line += " · 오류/미판정 " + errCt;
        setStatus(line, "ok");
      } catch (eGloc) {
        setStatus(
          "재고조회 실패: " + (eGloc && eGloc.message ? eGloc.message : String(eGloc)),
          "err"
        );
      } finally {
        glocBusy = false;
        btnGloc.disabled = false;
      }
    }

    async function runPipeline() {
      if (pipelineBusy) {
        setStatus("이미 조회 중…");
        return;
      }
      if (typeof GM_xmlhttpRequest !== "function") {
        setStatus("GM_xmlhttpRequest 없음 — 확장 새로고침", "err");
        return;
      }
      if (!atsCutlineItems.length) {
        setStatus("시간대 목록 확인 중…");
        try {
          var preList = await fetchOutboundDashboardCutlineList();
          if (preList.note === "login") {
            setStatus(
              "outbound 로그인 필요 — outbound 탭에서 로그인 후 다시 조회",
              "err"
            );
            return;
          }
          if (preList.items && preList.items.length) {
            atsCutlineItems = preList.items;
            renderCutlineList(atsCutlineItems);
            var preTotal = 0;
            var pi;
            for (pi = 0; pi < atsCutlineItems.length; pi++) {
              if (atsCutlineItems[pi].needCount != null) {
                preTotal += atsCutlineItems[pi].needCount;
              }
            }
            var preLine =
              "시간대 " + atsCutlineItems.length + "개 · 선택 후 조회실행";
            if (preTotal) preLine += " · 합계 " + preTotal + "unit";
            setStatus(preLine, "ok");
            return;
          }
        } catch (ePre) {
          /* 대시보드 직접 수집 경로로 계속 */
        }
      }
      var selectedCutlineUrls = null;
      if (atsCutlineItems.length) {
        selectedCutlineUrls = getSelectedCutlineUrls();
        if (!selectedCutlineUrls.length) {
          setStatus("보충 시간대를 하나 이상 선택하세요.", "err");
          return;
        }
      }
      pipelineBusy = true;
      stopRequested = false;
      btnRun.disabled = true;
      btnGloc.disabled = true;
      setAtsPipelineProgress(0, ATS_PIPELINE_PROGRESS_LABEL);
      atsAllRows = [];
      clearAtsReplenishDoneKeys();
      clearAllDashboardPanels();
      try {
        var dash = await fetchOutboundItems(
          function (ci, ct, url, pg, pgMax) {
          var obPct = 2;
          if (ct > 0) {
            obPct = 2 + Math.round(((ci - 1) / ct) * 33);
            if (pg && pgMax && pgMax > 1) {
              obPct = Math.min(
                35,
                obPct + Math.round(((pg - 1) / pgMax) * (33 / Math.max(ct, 1)))
              );
            }
          }
          setAtsPipelineProgress(obPct, ATS_PIPELINE_PROGRESS_LABEL);
          },
          { selectedCutlineUrls: selectedCutlineUrls }
        );
        var items = dash.items || [];
        var obByBc = dash.byBarcode || Object.create(null);
        var barcodes = dash.barcodes || [];
        if (!barcodes.length) {
          var hint =
            dash.note === "login"
              ? "outbound 로그인 필요 — outbound 탭에서 로그인 후 다시 조회"
              : dash.note === "no-form"
                ? "대시보드 조회 폼 없음 — outbound에서 수동 조회 후 재시도"
                : "Barcode 0건 — 대시보드·보충상세 표에 Barcode 열/데이터 확인";
          setStatus(hint, "err");
          return;
        }
        var bufferIndex = emptyReplenishOrderIndex();
        try {
          setAtsPipelineProgress(36, ATS_PIPELINE_PROGRESS_LABEL);
          bufferIndex = await fetchAllReplenishOrderIndex(function (pg, pgMax) {
            var bufPct =
              36 +
              Math.round(
                ((pg - 1) / Math.max(pgMax, 1)) * 4
              );
            setAtsPipelineProgress(
              Math.min(39, bufPct),
              ATS_PIPELINE_PROGRESS_LABEL
            );
          });
        } catch (eBuf) {
          bufferIndex = emptyReplenishOrderIndex();
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[YAN4 ATS] replenish/order 조회 실패 — 기존 버퍼존 규칙 유지", eBuf);
          }
        }
        var allRows = [];
        var bufferCoveredCt = 0;
        var bufferPartialCt = 0;
        var poolByBc = Object.create(null);
        var si;
        var invBase = 40;
        var invSpan = 40;
        for (si = 0; si < barcodes.length; si++) {
          if (stopRequested) {
            setStatus("중지됨", "err");
            break;
          }
          setAtsPipelineProgress(
            invBase +
              Math.round(((si + 1) / Math.max(barcodes.length, 1)) * invSpan),
            ATS_PIPELINE_PROGRESS_LABEL
          );
          var bc = barcodes[si];
          var ob = obByBc[bc] || null;
          var inv = await fetchInventoryForBarcode(bc);
          var matched = (inv && inv.matched) || [];
          var bufOrderRows = lookupBufferOrderRows(
            bufferIndex,
            bc,
            inv && inv.meta ? inv.meta : null
          );
          // 이 SKU가 버퍼존 주문표에 있으면 inventory 버퍼존 로케이션은 제외(중복 방지)
          if (bufOrderRows.length) {
            matched = matched.filter(function (m) {
              return !atsLocationIsBufferZone(m && m.location);
            });
          }
          poolByBc[normalizeBarcode(bc) || String(bc || "")] = {
            matched: matched.slice(),
            meta: inv && inv.meta ? inv.meta : null,
            ob: ob,
          };
          var bi;
          var rowOut;
          for (bi = 0; bi < bufOrderRows.length; bi++) {
            rowOut = bufferOrderRowToAtsRow(bufOrderRows[bi], ob);
            if (inv && inv.meta) {
              if (!rowOut.name && inv.meta.name) rowOut.name = inv.meta.name;
              if (!rowOut.skuId && inv.meta.skuId) {
                rowOut.skuId = String(inv.meta.skuId);
              }
              if (!rowOut.barcode && inv.meta.barcode) {
                rowOut.barcode = String(inv.meta.barcode).trim();
              }
            }
            allRows.push(rowOut);
          }
          var obQtyNum = parseObQtyNumber(ob && ob.obQty);
          // 버퍼존 재고로 보충수량을 채울 수 있으면 일반 로케이션은 부족분만
          var needQtyNum = obQtyNum;
          var bufSupply = sumBufferOrderSupplyQty(bufOrderRows);
          if (isFinite(obQtyNum) && isFinite(bufSupply)) {
            needQtyNum = obQtyNum - bufSupply;
            if (needQtyNum <= 0) {
              bufferCoveredCt += 1;
              if (si + 1 < barcodes.length) await sleep(BARCODE_DELAY_MS);
              continue;
            }
            bufferPartialCt += 1;
          }
          var picked = selectInventoryMatchesForObQty(matched, needQtyNum);
          if (picked.length) {
            var built = buildAtsRowsFromInventoryPicks(picked, ob, needQtyNum);
            var mi;
            for (mi = 0; mi < built.length; mi++) allRows.push(built[mi]);
          } else if (!bufOrderRows.length) {
            allRows.push(
              makeNoStockRow(bc, inv && inv.meta ? inv.meta : null, ob)
            );
          }
          if (si + 1 < barcodes.length) await sleep(BARCODE_DELAY_MS);
        }
        var fallbackInfo = { replacedCt: 0, noStockCt: 0 };
        if (!stopRequested && allRows.length) {
          transferInfoCache = Object.create(null);
          var gcCartCount = 0;
          var riGc;
          for (riGc = 0; riGc < allRows.length; riGc++) {
            if (rowNeedsTransferLookup(allRows[riGc])) gcCartCount += 1;
          }
          if (!gcCartCount) {
            setAtsPipelineProgress(82, ATS_PIPELINE_PROGRESS_LABEL);
          } else {
            await enrichRowsTransferByCart(allRows, function (done, total) {
              setAtsPipelineProgress(
                80 + Math.round((done / Math.max(total, 1)) * 8),
                ATS_PIPELINE_PROGRESS_LABEL
              );
            });
          }
          setAtsPipelineProgress(88, ATS_PIPELINE_PROGRESS_LABEL);
          fallbackInfo = await replaceStowCompleteWithNextInventory(
            allRows,
            poolByBc,
            null
          );
        }
        if (!stopRequested && allRows.length) {
          skuTempZoneCache = Object.create(null);
          await enrichRowsTempZoneBySku(allRows, function (done, total) {
            setAtsPipelineProgress(
              90 + Math.round((done / Math.max(total, 1)) * 10),
              ATS_PIPELINE_PROGRESS_LABEL
            );
          });
        }
        if (!stopRequested) {
          setAtsPipelineProgress(100, ATS_PIPELINE_PROGRESS_LABEL);
          atsAllRows = allRows.filter(function (r) {
            return !atsRowHiddenByStatus(r);
          });
          atsLastPipelineRunAt = Date.now();
          renderAllDashboardPanels(true);
          var bits = ["완료"];
          if (bufferCoveredCt) bits.push("버퍼충족 " + bufferCoveredCt);
          if (bufferPartialCt) bits.push("버퍼부족분 " + bufferPartialCt);
          if (fallbackInfo.replacedCt) {
            bits.push("진열완료→다음재고 " + fallbackInfo.replacedCt);
          }
          if (fallbackInfo.noStockCt) {
            bits.push("대체없음→X " + fallbackInfo.noStockCt);
          }
          var stillHidden = allRows.length - atsAllRows.length;
          if (stillHidden > 0) bits.push("진열완료숨김 " + stillHidden);
          if (dash.failed) {
            bits.push("출고 조회 일부 실패 " + dash.failed + "건 — 다시 조회 권장");
          }
          setStatus(bits.join(" · "), dash.failed ? "err" : "ok");
        }
      } catch (e) {
        setStatus("실패: " + (e && e.message ? e.message : String(e)), "err");
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[YAN4 ATS]", e);
        }
      } finally {
        pipelineBusy = false;
        btnRun.disabled = false;
        btnGloc.disabled = false;
      }
    }

    /** 대시보드 행 클릭 → 해당 SKU만 재고조회 */
    async function runAtsGlocLookupForRowEl(rowEl) {
      var key = rowEl.getAttribute("data-ats-done-key") || "";
      if (!key) return;
      var seed = null;
      var i, r;
      for (i = 0; i < atsAllRows.length; i++) {
        r = atsAllRows[i];
        if (atsReplenishDoneKey(r.skuId, r.location) === key) {
          seed = r;
          break;
        }
      }
      if (!seed) {
        setStatus("행을 찾지 못했습니다. 다시 조회 실행해 주세요.", "err");
        return;
      }
      var rows = atsRowsForSameSku(atsAllRows, seed);
      var label =
        "SKU " +
        (seed.skuId || "") +
        (rows.length > 1 ? " (" + rows.length + "로케)" : "");
      await runAtsGlocLookupAndMarkDone(rows, label);
    }

    function onAtsClick(ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-yna4-ats-run]")) {
        ev.preventDefault();
        ev.stopPropagation();
        void runPipeline();
        return;
      }
      if (t.closest("[data-yna4-ats-load-cutlines]")) {
        ev.preventDefault();
        ev.stopPropagation();
        void loadWorkflowCutlines();
        return;
      }
      if (t.closest("[data-yna4-ats-cutline-all]")) {
        ev.preventDefault();
        ev.stopPropagation();
        setAllCutlineChecks(true);
        return;
      }
      if (t.closest("[data-yna4-ats-cutline-none]")) {
        ev.preventDefault();
        ev.stopPropagation();
        setAllCutlineChecks(false);
        return;
      }
      if (t.closest("[data-yna4-ats-zone-mode-teams]")) {
        ev.preventDefault();
        ev.stopPropagation();
        setAtsZoneModeLocal("teams");
        return;
      }
      if (t.closest("[data-yna4-ats-zone-mode-pdf]")) {
        ev.preventDefault();
        ev.stopPropagation();
        setAtsZoneModeLocal("pdf");
        return;
      }
      if (t.closest("[data-yna4-ats-gloc]")) {
        ev.preventDefault();
        ev.stopPropagation();
        void runAtsGlocLookupAndMarkDone();
        return;
      }
      var rowEl = t.closest("tr[data-ats-done-key]");
      if (rowEl && rowEl.closest(".yna4-ats-table")) {
        ev.preventDefault();
        ev.stopPropagation();
        void runAtsGlocLookupForRowEl(rowEl);
        return;
      }
      var zoneBtn = t.closest("button[data-zone-key]");
      if (zoneBtn && zoneBtn.closest(".yna4-ats-teams-btn-group")) {
        ev.preventDefault();
        ev.stopPropagation();
        var zlbl = zoneBtn.getAttribute("data-zone-key") || "";
        var zspec = findAtsZoneSpecByLabel(zlbl);
        if (!zspec) return;
        if (loadAtsZoneMode() === "pdf") {
          var zcur = loadAtsPrintDashChipStateMap();
          zcur[zlbl] = zcur[zlbl] === false;
          saveAtsPrintDashChipStateMap(zcur);
          refreshAtsZoneButtons(teamsBtnGroup, dashPanelTables);
        } else {
          copyAtsPreviewForTeamsSlice(
            zoneBtn,
            zlbl,
            zspec.dashboards,
            dashPanelTables,
            deadlineChipsHost
          );
        }
        return;
      }
    }

    root.addEventListener("click", onAtsClick, true);
    function atsAutoIntervalMs() {
      return (Number(selAutoInterval.value) || ATS_AUTO_INTERVALS_MIN[0]) * 60000;
    }

    function paintAtsAuto() {
      btnAuto.classList.toggle("yna4-ats-btn--auto-on", atsAuto.on);
      btnAuto.setAttribute("aria-pressed", atsAuto.on ? "true" : "false");
      if (!atsAuto.on) btnAuto.textContent = "AUTO";
      else if (pipelineBusy || atsAuto.nextAt === Infinity) btnAuto.textContent = "AUTO …";
      else btnAuto.textContent = "AUTO " + formatAtsAutoRemain(atsAuto.nextAt - Date.now());
    }

    /** 시간이 되면 조회실행. 이미 조회 중이면 끝난 뒤에 다시 센다 */
    async function tickAtsAuto() {
      if (atsAuto.on && !pipelineBusy && Date.now() >= atsAuto.nextAt) {
        atsAuto.nextAt = Infinity;
        paintAtsAuto();
        try {
          await runPipeline();
        } finally {
          atsAuto.nextAt = Date.now() + atsAutoIntervalMs();
        }
      }
      paintAtsAuto();
    }

    function startAtsAutoTicker() {
      if (atsAuto.timer) clearInterval(atsAuto.timer);
      atsAuto.timer = setInterval(function () {
        void tickAtsAuto();
      }, 1000);
      paintAtsAuto();
    }

    btnAuto.addEventListener("click", function (ev) {
      ev.preventDefault();
      atsAuto.on = !atsAuto.on;
      if (atsAuto.on) {
        atsAuto.nextAt = Date.now() + atsAutoIntervalMs();
        startAtsAutoTicker();
      } else {
        if (atsAuto.timer) clearInterval(atsAuto.timer);
        atsAuto.timer = null;
        paintAtsAuto();
      }
    });
    selAutoInterval.addEventListener("change", function () {
      saveAtsAutoIntervalMin(Number(selAutoInterval.value));
      if (atsAuto.on && atsAuto.nextAt !== Infinity) {
        atsAuto.nextAt = Date.now() + atsAutoIntervalMs();
      }
      paintAtsAuto();
    });
    if (atsAuto.on) startAtsAutoTicker();

    btnRun.addEventListener("click", function (ev) {
      ev.preventDefault();
      void runPipeline().then(function () {
        // 손으로 조회한 뒤에도 AUTO 간격을 처음부터 다시 센다
        if (atsAuto.on && atsAuto.nextAt !== Infinity) {
          atsAuto.nextAt = Date.now() + atsAutoIntervalMs();
        }
      });
    });
    btnLoadCutlines.addEventListener("click", function (ev) {
      ev.preventDefault();
      void loadWorkflowCutlines();
    });
    btnCutlineAll.addEventListener("click", function (ev) {
      ev.preventDefault();
      setAllCutlineChecks(true);
    });
    btnCutlineNone.addEventListener("click", function (ev) {
      ev.preventDefault();
      setAllCutlineChecks(false);
    });
    btnZoneModeTeams.addEventListener("click", function (ev) {
      ev.preventDefault();
      setAtsZoneModeLocal("teams");
    });
    btnZoneModePdf.addEventListener("click", function (ev) {
      ev.preventDefault();
      setAtsZoneModeLocal("pdf");
    });
    btnGloc.addEventListener("click", function (ev) {
      ev.preventDefault();
      void runAtsGlocLookupAndMarkDone();
    });

    setTimeout(function () {
      void loadWorkflowCutlines();
    }, 120);
  };

  function scheduleAtsUiMigrate() {
    function tick() {
      var host = document.querySelector(
        ".yna4-shell-page-ats-inner[data-yna4-ats-ready='1']"
      );
      if (host) remountAtsHostIfStale(host);
    }
    tick();
    setTimeout(tick, 0);
    setTimeout(tick, 400);
    setTimeout(tick, 1200);
  }
  scheduleAtsUiMigrate();
})();
