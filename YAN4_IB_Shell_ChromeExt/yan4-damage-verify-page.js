/** YAN4 IB Shell — 2페이지 IB 오류처리 (붙여넣기 → 전산확인 → 엑셀 TSV) */
(function () {
  "use strict";

  var ROOT_ID = "yna4-damage-verify-root";
  var INV_SEARCH =
    "https://inventory.coupang.com/async/inventory/search";
  var INV_REFERER =
    "https://inventory.coupang.com/inventory/list?searched=true";
  var LOC_RE = /1007-[A-Z0-9][A-Z0-9-]*-\d+-\d+/gi;

  var DAMAGE_ZONE_MAP = [
    { re: /1\s*도|1도/i, zone: "냉장 IB 파손존" },
    { re: /10\s*도|10도/i, zone: "상온 IB 파손존" },
    { re: /상온/i, zone: "상온 IB 파손존" },
    { re: /냉동/i, zone: "냉동 IB 파손존" },
  ];

  /** 신고 유형 — headerRe 로 첫 줄 판별 (오버숏은 숏/오버보다 먼저) */
  var REPORT_TYPES = [
    {
      id: "damage",
      label: "파손",
      headerRe: /파손/i,
      defaultError: "이관 중 파손",
      verifyInventory: true,
      verifyWmsTransfer: false,
      verifyStowProblem: false,
      damageZone: true,
    },
    {
      id: "overshort",
      label: "오버숏",
      headerRe: /오버\s*숏|over\s*-?\s*short/i,
      defaultError: "overage/shortage",
      verifyInventory: false,
      verifyWmsTransfer: false,
      verifyStowProblem: false,
      damageZone: false,
    },
    {
      id: "recvQty",
      label: "입수량상이",
      /* Shortage/Overage 헤더보다 먼저 매칭 */
      headerRe: /입수량\s*상이|입고\s*수량\s*상이|입수\s*상이/i,
      defaultError: "입수량 상이",
      verifyInventory: false,
      verifyWmsTransfer: true,
      verifyStowProblem: false,
      damageZone: false,
    },
    {
      id: "shortage",
      label: "숏테이지",
      headerRe: /숏\s*테이지|shortage/i,
      defaultError: "숏테이지",
      /* 전산=WMS GC상세, 부족=붙여넣기, PRB0 재고 확인, 오류보고 참고 */
      verifyInventory: true,
      verifyWmsTransfer: true,
      verifyStowProblem: true,
      damageZone: false,
    },
    {
      id: "overage",
      label: "오버리지",
      headerRe: /오버\s*리지|overage/i,
      defaultError: "오버리지",
      /* 전산=해당 GC WMS 상세 SKU합 (재고조회 합산 금지) */
      verifyInventory: false,
      verifyWmsTransfer: true,
      verifyStowProblem: false,
      damageZone: false,
    },
  ];

  var GENERIC_TYPE = {
    id: "generic",
    label: "오류",
    headerRe: null,
    defaultError: "",
    verifyInventory: true,
    verifyWmsTransfer: false,
    verifyStowProblem: false,
    damageZone: false,
  };

  var lastRows = [];
  var running = false;
  var wmsGcProductCache = Object.create(null);
  var paneAuthorEl = null;
  var TO_FC = "YAN4";
  var ICQA_STATUS = "ICQA인계";
  var SHORTAGE_PRB_LOC = "1007-PRB0-1-10";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function trim(s) {
    return String(s || "").trim();
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function kstTodaySlash() {
    var d = new Date();
    var kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return (
      kst.getUTCFullYear() +
      "/" +
      pad2(kst.getUTCMonth() + 1) +
      "/" +
      pad2(kst.getUTCDate())
    );
  }

  function kstNow() {
    return new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  }

  /** 예시 양식: 8/31/2026 */
  function formatUsDateFromKst(d) {
    if (!d || isNaN(d.getTime())) return "";
    return d.getUTCMonth() + 1 + "/" + d.getUTCDate() + "/" + d.getUTCFullYear();
  }

  function kstTodayUs() {
    return formatUsDateFromKst(kstNow());
  }

  function parseWmsDistDateUs(raw) {
    var s = trim(raw);
    if (!s) return "";
    var m = s.match(/(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})/);
    if (m) {
      return parseInt(m[2], 10) + "/" + parseInt(m[3], 10) + "/" + m[1];
    }
    m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
    if (m) {
      var y = m[3];
      if (y.length === 2) y = "20" + y;
      return parseInt(m[1], 10) + "/" + parseInt(m[2], 10) + "/" + y;
    }
    m = s.match(/(\d{1,2})\/(\d{1,2})/);
    if (m) {
      return parseInt(m[1], 10) + "/" + parseInt(m[2], 10) + "/" + kstNow().getUTCFullYear();
    }
    return s.split(/\s+/)[0] || s;
  }

  function temperatureFromHeader(header) {
    var h = trim(header);
    if (/냉동|frozen/i.test(h)) return "FROZEN";
    if (/상온|10\s*도|ambient/i.test(h)) return "AMBIENT";
    if (/냉장|1\s*도|chilled/i.test(h)) return "CHILLED";
    return "";
  }

  function shiftFromKst() {
    var h = kstNow().getUTCHours();
    if (h >= 22 || h < 8) return "O/N";
    return "DAY";
  }

  function statusValueEn(report) {
    if (report.type.id === "overage") return "Overage";
    if (report.type.id === "shortage") return "Shortage";
    return report.errorContent || "";
  }

  function problemTitle(report) {
    if (report.overShort) return "overage/shortage";
    if (report.type.id === "overage") return "실물남음";
    if (report.type.id === "shortage") return "실물부족";
    return report.errorContent || "";
  }

  function extractBulletLines(block) {
    var lines = String(block || "").split(/\r?\n/);
    var out = [];
    var i, t;
    for (i = 0; i < lines.length; i++) {
      t = trim(lines[i]);
      if (!/^[•·\-\*]/.test(t)) continue;
      t = t.replace(/^[•·\-\*]\s*/, "").trim();
      if (t) out.push(t);
    }
    return out;
  }

  function buildFollowUpAction(type, overShort) {
    if (type.id === "overage") {
      return "로케이션 패트롤 후 오버리지존 이동";
    }
    if (type.id === "shortage") {
      return overShort
        ? "로케이션 패트롤 후 PRB0-1-10 전산이동"
        : "로케이션 패트롤 후 PRB0-1-10 이동";
    }
    return "";
  }

  function findTypeById(id) {
    var i;
    for (i = 0; i < REPORT_TYPES.length; i++) {
      if (REPORT_TYPES[i].id === id) return REPORT_TYPES[i];
    }
    return GENERIC_TYPE;
  }

  /**
   * 숏/오버 전산:
   * 1) WMS 이관상세 진열내역 SKU 합
   * 2) 없으면 진열오류보고 「전산수량」
   * 3) 숏(또는 입수상이 Shortage)만: 그래도 없으면 붙여넣기 수량
   */
  function wmsSysQty(report, verify) {
    var wms = verify && verify.wms ? verify.wms : null;
    var wmsQty =
      wms && wms.quantity != null && isFinite(Number(wms.quantity))
        ? Number(wms.quantity)
        : 0;
    if (wmsQty > 0) return wmsQty;
    var stow = verify && verify.stow ? verify.stow : null;
    var stowSys =
      stow && stow.sysQty != null && isFinite(Number(stow.sysQty))
        ? Number(stow.sysQty)
        : 0;
    if (stowSys > 0) return stowSys;
    var side =
      report && report.type && report.type.id === "recvQty"
        ? report.recvSide || "shortage"
        : report && report.type
          ? report.type.id
          : "";
    if (side === "shortage") {
      return report.qty > 0 ? report.qty : 0;
    }
    return 0;
  }

  /** 오버리지 추가수량(실물 N 남음) = 붙여넣기 「수량」 */
  function overageExtraQty(report) {
    return report && report.qty > 0 ? report.qty : 0;
  }

  /** 숏테이지 부족수량(실물 N 부족) = 붙여넣기 「수량」 */
  function shortageExtraQty(report) {
    return report && report.qty > 0 ? report.qty : 0;
  }

  function wmsTransferQty(report, verify) {
    var wms = verify && verify.wms ? verify.wms : null;
    var wmsQty =
      wms && wms.quantity != null && isFinite(Number(wms.quantity))
        ? Number(wms.quantity)
        : 0;
    if (wmsQty > 0) return wmsQty;
    return report.qty > 0 ? report.qty : 0;
  }

  function buildProblemDetail(report, verify) {
    var side =
      report.type.id === "recvQty"
        ? report.recvSide || "shortage"
        : report.type.id;
    if (side === "overage") {
      /* 전산(WMS 해당 SKU) + 남음(붙여넣기) = 실물 */
      var sysQty = wmsSysQty(report, verify);
      var extra = overageExtraQty(report);
      var physical = sysQty + extra;
      return (
        "전산 " +
        sysQty +
        "EA / 실물 " +
        physical +
        "EA / 실물 " +
        extra +
        "EA 남음"
      );
    }
    if (side === "shortage") {
      /* 전산(WMS 해당 SKU, 없으면 붙여넣기) − 부족 = 실물 */
      var sysQtyS = wmsSysQty(report, verify);
      var shortQty = shortageExtraQty(report);
      var physicalS = Math.max(0, sysQtyS - shortQty);
      return (
        "전산 " +
        sysQtyS +
        "EA / 실물 " +
        physicalS +
        "EA / 실물 " +
        shortQty +
        "EA 부족"
      );
    }
    return "";
  }

  function getPaneAuthor() {
    return paneAuthorEl ? trim(paneAuthorEl.value) : "";
  }

  function isIcqaType(report) {
    return report.type.id === "overage" || report.type.id === "shortage";
  }

  function parseQty(raw) {
    var m = String(raw || "").match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function detectTypeFromHeader(header) {
    var h = trim(header);
    if (!h) return GENERIC_TYPE;
    var i;
    for (i = 0; i < REPORT_TYPES.length; i++) {
      if (REPORT_TYPES[i].headerRe.test(h)) return REPORT_TYPES[i];
    }
    return GENERIC_TYPE;
  }

  function isReportHeader(line) {
    var t = trim(line);
    if (!t) return false;
    if (/해당토트|상품바코드|상품SKU|오류내용/i.test(t)) return false;
    var i;
    for (i = 0; i < REPORT_TYPES.length; i++) {
      if (REPORT_TYPES[i].headerRe.test(t)) return true;
    }
    return false;
  }

  function damageZoneFromHeader(header) {
    var h = trim(header);
    var i;
    for (i = 0; i < DAMAGE_ZONE_MAP.length; i++) {
      if (DAMAGE_ZONE_MAP[i].re.test(h)) return DAMAGE_ZONE_MAP[i].zone;
    }
    return "";
  }

  function splitBlocks(text) {
    var lines = String(text || "").split(/\r?\n/);
    var blocks = [];
    var current = [];
    var i, line, trimmed;
    for (i = 0; i < lines.length; i++) {
      line = lines[i];
      trimmed = trim(line);
      if (!trimmed) {
        if (current.length) {
          blocks.push(current.join("\n"));
          current = [];
        }
        continue;
      }
      if (current.length && isReportHeader(trimmed)) {
        blocks.push(current.join("\n"));
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length) blocks.push(current.join("\n"));
    return blocks;
  }

  function normalizePasteText(text) {
    return String(text || "").replace(/\u00a0/g, " ");
  }

  function parseField(block, labels) {
    var i, re, m, lit;
    block = normalizePasteText(block);
    for (i = 0; i < labels.length; i++) {
      if (labels[i] && labels[i].re) {
        re = labels[i].re;
      } else {
        lit = String(labels[i] || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        re = new RegExp(
          "(?:^|\\n)\\s*" + lit + "\\s*[:：]\\s*(.+)",
          "i"
        );
      }
      m = block.match(re);
      if (m) return trimFieldValue(m[1]);
    }
    return "";
  }

  function trimFieldValue(raw) {
    return trim(String(raw || "").replace(/\s*unit\s*$/i, ""));
  }

  function cleanGcBarcode(raw) {
    var s = trimFieldValue(raw);
    if (!s) return "";
    var m = s.match(/^(GC-[A-Z0-9][A-Z0-9-]*)/i);
    if (m) return m[1].toUpperCase();
    return s.split(/\s+/)[0];
  }

  function parseTote(block) {
    var text = normalizePasteText(block);
    var v = parseField(text, [FIELD_TOTE, "해당토트", "해당 토트", "GC바코드", "GC 바코드", "토트"]);
    v = cleanGcBarcode(v);
    if (v) return v;
    var m = text.match(
      /(?:^|\n)\s*해당\s*토트\s*[:：]?\s*\r?\n\s*(GC-[A-Z0-9][A-Z0-9-]*)/i
    );
    if (m) return m[1].toUpperCase();
    m = text.match(/(?:^|\n)\s*(GC-GT[0-9]+-[0-9]+-[0-9]+)/i);
    if (m) return m[1].toUpperCase();
    m = text.match(/\b(GC-GT[0-9]+-[0-9]+-[0-9]+)\b/i);
    return m ? m[1].toUpperCase() : "";
  }

  var FIELD_TOTE = {
    re: /(?:^|\n)\s*(?:해당\s*토트|토트\s*바코드|토트바코드|GC\s*바코드|GC바코드)\s*[:：]?\s*(.+)/i,
  };
  var FIELD_SKU_ID = {
    /* 「상품 외부SKU ID」와 구분 — 외부 줄은 매칭하지 않음 */
    re: /(?:^|\n)\s*상품\s*(?!외부)SKU\s*ID\s*[:：]\s*(.+)/i,
  };
  var FIELD_EXT_SKU_ID = {
    re: /(?:^|\n)\s*상품\s*외부\s*SKU\s*ID\s*[:：]\s*(.+)/i,
  };

  function normalizeLocKey(loc) {
    return trim(loc).toUpperCase();
  }

  function isToteLoc(loc) {
    return /1007-RCRT/i.test(String(loc || ""));
  }

  function extractMoveLocation(block, tote) {
    var toteKey = normalizeLocKey(tote);
    var bulletRe =
      /[•·\-\*]\s*(1007-[A-Z0-9][A-Z0-9-]*-\d+-\d+)[^\n]*/gi;
    var m, loc, best = "";
    while ((m = bulletRe.exec(block))) {
      loc = trim(m[1]);
      if (!loc || isToteLoc(loc)) continue;
      if (/전산|이동/i.test(m[0])) return loc;
      if (!best) best = loc;
    }
    var all = block.match(LOC_RE) || [];
    var i;
    for (i = 0; i < all.length; i++) {
      loc = trim(all[i]);
      if (!loc || isToteLoc(loc)) continue;
      if (toteKey && normalizeLocKey(loc) === toteKey) continue;
      return loc;
    }
    return best;
  }

  function extractHeader(block) {
    var lines = block.split(/\r?\n/);
    var i, t;
    for (i = 0; i < lines.length; i++) {
      t = trim(lines[i]);
      if (!t) continue;
      if (isReportHeader(t)) return t;
      if (/해당토트|상품바코드|상품SKU/i.test(t)) return "";
      return t;
    }
    return "";
  }

  /** 오버숏: 「실물」줄 기준으로 숏 구간 / 오버 구간 분리 */
  function splitOverShortSections(block) {
    var text = normalizePasteText(block);
    var m = text.match(
      /^([\s\S]*?)(?:^|\n)\s*실물\s*(?:\r?\n)([\s\S]*)$/i
    );
    if (!m) return null;
    return {
      shortagePart: trim(m[1]),
      overagePart: trim(m[2]),
    };
  }

  function detectRecvSide(header, errorRaw) {
    var blob = String(header || "") + "\n" + String(errorRaw || "");
    if (/shortage|숏\s*테이지|부족/i.test(blob)) return "shortage";
    if (/overage|오버\s*리지|남음/i.test(blob)) return "overage";
    return "shortage";
  }

  function buildReportFromPart(part, type, shared) {
    shared = shared || {};
    var header = shared.header || extractHeader(part) || "";
    var tote = parseTote(part) || shared.tote || "";
    var barcode = parseField(part, ["상품바코드", "상품 바코드", "바코드"]);
    var skuId = parseField(part, [FIELD_SKU_ID, "SKU ID", "SKU ID"]);
    var externalSkuId = parseField(part, [
      FIELD_EXT_SKU_ID,
      "외부 SKU ID",
      "외부SKU ID",
      "외부SKU",
    ]);
    var productName = parseField(part, ["상품명"]);
    var qtyRaw = parseField(part, ["수량"]);
    var errorRaw = parseField(part, ["이관오류내용", "오류내용"]);
    var moveLocation = extractMoveLocation(part, tote);
    if (type.id === "shortage" && !moveLocation) {
      moveLocation = SHORTAGE_PRB_LOC;
    }
    var verifyLoc =
      moveLocation ||
      (type.verifyInventory && type.id !== "overage" ? tote : "");
    if (type.id === "shortage" && !verifyLoc) {
      verifyLoc = SHORTAGE_PRB_LOC;
    }
    var overShort = !!shared.overShort;
    var recvSide =
      type.id === "recvQty" ? detectRecvSide(header, errorRaw) : "";
    return {
      type: type,
      header: header,
      overShort: overShort,
      recvSide: recvSide,
      damageZone: type.damageZone ? damageZoneFromHeader(header) : "",
      tote: tote,
      barcode: barcode,
      skuId: String(skuId || "").replace(/\D/g, ""),
      externalSkuId: String(externalSkuId || "").replace(/\D/g, ""),
      productName: productName,
      qty: parseQty(qtyRaw),
      errorContent: normalizeErrorContent(errorRaw, type),
      moveLocation: moveLocation,
      verifyLoc: verifyLoc,
      bullets: extractBulletLines(part),
      followUp: buildFollowUpAction(type, overShort),
    };
  }

  function parseOverShortReports(block) {
    var header = extractHeader(block);
    var sections = splitOverShortSections(block);
    if (!sections || !sections.shortagePart || !sections.overagePart) {
      return [];
    }
    var sharedTote = parseTote(sections.shortagePart) || parseTote(block);
    var shortRep = buildReportFromPart(
      sections.shortagePart,
      findTypeById("shortage"),
      { header: header, tote: sharedTote, overShort: true }
    );
    var overRep = buildReportFromPart(
      sections.overagePart,
      findTypeById("overage"),
      { header: header, tote: sharedTote, overShort: true }
    );
    if (!overRep.tote) overRep.tote = sharedTote;
    return [shortRep, overRep];
  }

  function parseBlock(block) {
    block = normalizePasteText(block);
    var header = extractHeader(block);
    var type = detectTypeFromHeader(header);
    if (type.id === "overshort") {
      return null;
    }
    return buildReportFromPart(block, type, { header: header, overShort: false });
  }

  /** 블록 → 검증할 report 배열 (오버숏은 숏+오버 2건) */
  function parseBlockToReports(block) {
    block = normalizePasteText(block);
    var header = extractHeader(block);
    var type = detectTypeFromHeader(header);
    if (type.id === "overshort") {
      return parseOverShortReports(block);
    }
    var one = parseBlock(block);
    return one ? [one] : [];
  }

  function normalizeErrorContent(raw, type) {
    var t = trim(raw);
    if (!t) return type.defaultError;
    if (/^overage$/i.test(t)) return "오버리지";
    if (/^shortage$/i.test(t)) return "숏테이지";
    return t;
  }

  function searchWmsTransfer(report) {
    var bridge =
      typeof window !== "undefined" && window.__YAN4_XFER_OP_BRIDGE__;
    if (!bridge || typeof bridge.searchErrorReport !== "function") {
      return Promise.resolve({
        found: false,
        status: "WMS모듈없음",
        fromCenter: "",
        distDate: "",
        quantity: 0,
        products: [],
      });
    }
    var toteKey = String(report.tote || "")
      .trim()
      .toUpperCase();
    var matchFields = {
      cartBarcode: report.tote,
      skuBarcode: report.barcode,
      skuId: report.skuId,
      skuExternalId: report.externalSkuId,
    };
    /* 오버숏: 같은 GC 상세는 1회만 읽고 SKU별 수량만 다시 집계 */
    if (
      toteKey &&
      wmsGcProductCache[toteKey] &&
      wmsGcProductCache[toteKey].products &&
      typeof bridge.pickDetailQuantity === "function"
    ) {
      var cached = wmsGcProductCache[toteKey];
      var qty = bridge.pickDetailQuantity(cached.products, matchFields);
      return Promise.resolve({
        found: !!cached.found,
        status: cached.status || "WMS OK",
        fromCenter: cached.fromCenter || "",
        distDate: cached.distDate || "",
        toteBarcode: cached.toteBarcode || report.tote || "",
        quantity: qty > 0 ? qty : 0,
        skuMatched: true,
        matchSkuId: report.skuId || "",
        productCount: cached.products.length,
        products: cached.products,
      });
    }
    return bridge.searchErrorReport(matchFields).then(function (res) {
      if (toteKey && res && res.found && res.products && res.products.length) {
        wmsGcProductCache[toteKey] = res;
      }
      return res;
    });
  }

  function searchStowProblem(report) {
    var bridge =
      typeof window !== "undefined" && window.__YAN4_STOW_PROBLEM_BRIDGE__;
    if (!bridge || typeof bridge.searchErrorReport !== "function") {
      return Promise.resolve({
        found: false,
        status: "오류보고모듈없음",
        sysQty: 0,
        problemQty: 0,
        stowDoneQty: 0,
      });
    }
    return bridge.searchErrorReport({
      cartBarcode: report.tote,
      skuBarcode: report.barcode,
      skuId: report.skuId,
      skuExternalId: report.externalSkuId,
    });
  }

  function formatWmsHint(wms) {
    if (!wms || !wms.found) return "";
    var parts = [];
    if (wms.fromCenter) parts.push(wms.fromCenter);
    if (wms.distDate) parts.push(wms.distDate);
    if (wms.quantity != null && Number(wms.quantity) > 0) {
      parts.push("WMS " + Number(wms.quantity) + "EA");
    }
    return parts.join(" · ");
  }

  function pickPlBarcode(dto, fallback) {
    var bc = trim(dto && dto.skuBarcode);
    if (/^PL/i.test(bc)) return bc;
    bc = trim(fallback);
    if (/^PL/i.test(bc)) return bc;
    return bc;
  }

  function inventoryRequest(url, opt) {
    opt = opt || {};
    var referer = opt.referer || INV_REFERER;
    var accept = opt.accept || "application/json, text/html, */*; q=0.8";
    return new Promise(function (resolve, reject) {
      var fallback = function () {
        if (typeof GM_xmlhttpRequest !== "function") {
          reject(new Error("inventory 요청 불가"));
          return;
        }
        GM_xmlhttpRequest({
          method: "GET",
          url: url,
          headers: {
            Accept: accept,
            Referer: referer,
          },
          timeout: 45000,
          onload: function (r) {
            if (r.status >= 200 && r.status < 400) resolve(r.responseText);
            else reject(new Error("HTTP " + r.status));
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
            accept: accept,
          },
          function (res) {
            if (chrome.runtime.lastError) {
              fallback();
              return;
            }
            if (res && res.ok && res.status >= 200 && res.status < 400) {
              resolve(res.body);
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

  function labeledValueNearText(text, labels) {
    var i, lit, re, m;
    var blob = String(text || "").replace(/\u00a0/g, " ");
    for (i = 0; i < labels.length; i++) {
      lit = String(labels[i] || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      re = new RegExp(lit + "\\s*[:：]?\\s*([^\\n\\r]{1,120})", "i");
      m = blob.match(re);
      if (m) return trim(m[1]);
    }
    return "";
  }

  function parseSkuPageMeta(html) {
    var out = { boxQty: 0, vendorName: "" };
    var raw = String(html || "");
    var doc = null;
    try {
      doc = new DOMParser().parseFromString(raw, "text/html");
    } catch (eDom) {
      doc = null;
    }
    var text =
      doc && doc.body
        ? String(doc.body.innerText || doc.body.textContent || "")
        : raw;
    text = text.replace(/\u00a0/g, " ");

    var boxRaw = labeledValueNearText(text, [
      "박스내 수량",
      "박스 내 수량",
      "박스내수량",
      "Units per Case",
      "Units per Carton",
      "Units Per Box",
    ]);
    var boxMatch = String(boxRaw || "").match(/(\d+)/);
    if (!boxMatch) {
      boxMatch = text.match(/박스\s*내\s*수량[^\d]{0,40}(\d+)/i);
    }
    if (!boxMatch) {
      boxMatch = text.match(/Units?\s*per\s*(?:Case|Carton|Box)[^\d]{0,20}(\d+)/i);
    }
    if (boxMatch) out.boxQty = parseInt(boxMatch[1], 10);

    var vendor = labeledValueNearText(text, [
      "제조업체명",
      "제조 업체명",
      "제조업체",
      "Manufacturer",
      "Vendor Name",
    ]);
    if (vendor) {
      vendor = vendor.replace(/\s{2,}/g, " ").split(/\n/)[0];
      out.vendorName = trim(vendor);
    }

    if (doc && (!out.boxQty || !out.vendorName)) {
      var nodes = doc.querySelectorAll("dt, th, label, span, div, td");
      var i, lab, next, row, tds, j, cell;
      for (i = 0; i < nodes.length; i++) {
        lab = trim(String(nodes[i].textContent || "").replace(/\s+/g, " "));
        if (!lab) continue;
        next = nodes[i].nextElementSibling;
        row = nodes[i].closest ? nodes[i].closest("tr") : null;
        if (!out.boxQty && /박스\s*내\s*수량|units?\s*per\s*(case|carton|box)/i.test(lab)) {
          cell = next ? trim(next.textContent) : "";
          if (!cell && row) {
            tds = row.querySelectorAll("td, th");
            for (j = 0; j < tds.length; j++) {
              if (tds[j] === nodes[i]) continue;
              cell = trim(tds[j].textContent);
              if (/\d/.test(cell)) break;
            }
          }
          boxMatch = String(cell || "").match(/(\d+)/);
          if (boxMatch) out.boxQty = parseInt(boxMatch[1], 10);
        }
        if (
          !out.vendorName &&
          /제조\s*업체|manufacturer|vendor\s*name/i.test(lab) &&
          lab.length < 40
        ) {
          cell = next ? trim(next.textContent) : "";
          if (!cell && row) {
            tds = row.querySelectorAll("td, th");
            for (j = 0; j < tds.length; j++) {
              if (tds[j] === nodes[i]) continue;
              cell = trim(tds[j].textContent);
              if (cell && cell !== lab) break;
            }
          }
          if (cell && !/제조\s*업체|manufacturer/i.test(cell)) {
            out.vendorName = cell.replace(/\s{2,}/g, " ");
          }
        }
      }
    }
    return out;
  }

  async function fetchSkuPageMeta(skuId) {
    var id = String(skuId || "").replace(/\D/g, "");
    if (!id) return { boxQty: 0, vendorName: "" };
    var url = "https://inventory.coupang.com/sku/" + id;
    try {
      var html = await inventoryRequest(url, {
        referer: url,
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      });
      return parseSkuPageMeta(html);
    } catch (eSku) {
      return { boxQty: 0, vendorName: "" };
    }
  }

  function recvLabelQty(verify) {
    return verify && verify.labelQty > 0 ? Number(verify.labelQty) : 0;
  }

  function recvActualQty(verify) {
    return verify && verify.actualQty != null && isFinite(Number(verify.actualQty))
      ? Number(verify.actualQty)
      : 0;
  }

  function buildSearchUrl(opt) {
    opt = opt || {};
    var p = new URLSearchParams();
    p.set("searched", "true");
    p.set("locationType", "");
    p.set("zone", "");
    p.set("fromLocation", "");
    p.set("toLocation", "");
    p.set("locationBarcode", String(opt.locationBarcode || ""));
    p.set("skuId", String(opt.skuId || ""));
    p.set("externalSkuId", "");
    p.set("skuBarcode", String(opt.skuBarcode || ""));
    p.set("lpnId", "");
    p.set("inventoryId", "");
    p.set("saleableChangeType", "");
    p.set("availableInventory", "true");
    p.set("page", "0");
    p.set("pageSize", "20");
    return INV_SEARCH + "?" + p.toString();
  }

  function parseInventoryHits(text, loc, barcode, skuId) {
    var out = {
      found: false,
      qty: 0,
      plBarcode: "",
      name: "",
      status: "조회실패",
    };
    var j;
    try {
      j = JSON.parse(String(text || ""));
    } catch (eJ) {
      out.status = "파싱오류";
      return out;
    }
    if (!j || j.success === false) {
      out.status = "API오류";
      return out;
    }
    var content = j.result && j.result.content;
    if (!Array.isArray(content) || !content.length) {
      out.status = "재고없음";
      return out;
    }
    var wantLoc = normalizeLocKey(loc);
    var wantBc = trim(barcode);
    var wantSku = trim(skuId);
    var i, row, dto, rowLoc, rowBc, rowSku, q;
    for (i = 0; i < content.length; i++) {
      row = content[i];
      if (!row) continue;
      dto = row.skuDto || {};
      rowLoc = normalizeLocKey(row.locationBarcode);
      if (wantLoc && rowLoc !== wantLoc) continue;
      rowBc = trim(dto.skuBarcode);
      rowSku = String(dto.skuId != null ? dto.skuId : "");
      if (wantBc && rowBc && rowBc !== wantBc && !/^PL/i.test(wantBc)) {
        if (rowBc.replace(/\D/g, "") !== wantBc.replace(/\D/g, "")) continue;
      } else if (!wantBc && wantSku && rowSku !== wantSku) {
        continue;
      }
      q = Number(row.quantity);
      out.found = true;
      out.qty += isFinite(q) ? q : 0;
      out.plBarcode = pickPlBarcode(dto, out.plBarcode || wantBc);
      if (dto.skuName) out.name = trim(dto.skuName);
      out.status = "OK";
    }
    if (!out.found) out.status = "재고없음";
    return out;
  }

  async function verifyReport(report) {
    var wms = null;
    if (report.type.verifyWmsTransfer) {
      wms = await searchWmsTransfer(report);
    }
    var stow = null;
    if (report.type.verifyStowProblem) {
      stow = await searchStowProblem(report);
    }

    if (report.type.id === "recvQty") {
      var skuMeta = await fetchSkuPageMeta(report.skuId);
      var boxQty = skuMeta && skuMeta.boxQty > 0 ? Number(skuMeta.boxQty) : 0;
      var diff = report.qty > 0 ? report.qty : 0;
      var labelQty = boxQty;
      var actualQty =
        report.recvSide === "overage"
          ? boxQty + diff
          : Math.max(0, boxQty - diff);
      var wmsOk = !!(wms && wms.found);
      var parts = [];
      if (wmsOk) {
        parts.push("WMS OK(" + Number(wms.quantity || 0) + ")");
      } else {
        parts.push((wms && wms.status) || "WMS없음");
      }
      if (boxQty > 0) {
        parts.push("박스내" + boxQty);
      } else {
        parts.push("박스내수량없음");
      }
      if (skuMeta && skuMeta.vendorName) {
        parts.push(skuMeta.vendorName);
      }
      return {
        report: report,
        verify: {
          found: wmsOk && boxQty > 0,
          qty: wmsSysQty(report, { wms: wms }),
          plBarcode: "",
          name: report.productName || "",
          status: parts.join(" · "),
          wms: wms,
          stow: stow,
          boxQty: boxQty,
          labelQty: labelQty,
          actualQty: actualQty,
          vendorName: (skuMeta && skuMeta.vendorName) || "",
        },
      };
    }

    if (!report.type.verifyInventory) {
      var wmsOk = !report.type.verifyWmsTransfer || (wms && wms.found);
      var found;
      var status;
      if (report.type.verifyStowProblem) {
        found = !!(stow && stow.found);
        if (stow && stow.found && wms && wms.found) {
          status = "오류보고+WMS OK";
        } else if (stow && stow.found) {
          status =
            "오류보고 OK" + (wms ? " · " + (wms.status || "WMS없음") : "");
        } else {
          status = (stow && stow.status) || "오류보고없음";
        }
      } else {
        found = wmsOk;
        status = wms
          ? wms.status
          : report.type.verifyWmsTransfer
            ? "WMS없음"
            : "TSV만";
      }
      return {
        report: report,
        verify: {
          found: found,
          qty: stow && stow.sysQty != null ? Number(stow.sysQty) : 0,
          plBarcode: "",
          name: "",
          status: status,
          wms: wms,
          stow: stow,
        },
      };
    }

    var loc =
      report.verifyLoc ||
      (report.type.id === "shortage" ? SHORTAGE_PRB_LOC : "");
    var barcode = report.barcode;
    var skuId = report.skuId;
    var verify;

    if (!loc) {
      /* 오버리지: 로케이션 없으면 바코드/SKU로 재고(전산) 조회 */
      if (
        report.type.id === "overage" &&
        (barcode || skuId || report.externalSkuId)
      ) {
        try {
          var urlSku = buildSearchUrl({
            locationBarcode: "",
            skuBarcode: barcode,
            skuId: barcode ? "" : skuId,
          });
          var textSku = await inventoryRequest(urlSku);
          verify = parseInventoryHits(textSku, "", barcode, skuId);
          if (!verify.found && report.externalSkuId && !barcode) {
            var urlExt = buildSearchUrl({
              locationBarcode: "",
              skuBarcode: "",
              skuId: report.externalSkuId,
            });
            var textExt = await inventoryRequest(urlExt);
            verify = parseInventoryHits(textExt, "", "", report.externalSkuId);
          }
        } catch (eInv) {
          verify = {
            found: false,
            qty: 0,
            plBarcode: "",
            name: "",
            status: "재고조회실패",
          };
        }
      } else {
        verify = {
          found: false,
          qty: 0,
          plBarcode: "",
          name: "",
          status: "로케이션없음",
        };
      }
    } else {
      var url = buildSearchUrl({
        locationBarcode: loc,
        skuBarcode: barcode,
        skuId: barcode ? "" : skuId,
      });
      var text = await inventoryRequest(url);
      verify = parseInventoryHits(text, loc, barcode, skuId);
    }

    if (!verify.plBarcode && skuId) {
      try {
        var url2 = buildSearchUrl({ skuId: skuId });
        var text2 = await inventoryRequest(url2);
        var meta = parseInventoryHits(text2, "", "", skuId);
        if (meta.plBarcode) verify.plBarcode = meta.plBarcode;
        if (!verify.name && meta.name) verify.name = meta.name;
      } catch (eMeta) {
        /* PL 보조조회 실패는 무시 */
      }
    }

    verify.wms = wms;
    verify.stow = stow;
    verify.invQty = verify.qty;

    if (report.type.id === "shortage") {
      var expectQty = shortageExtraQty(report);
      var prbOk =
        verify.found &&
        expectQty > 0 &&
        Number(verify.invQty) >= expectQty;
      var wmsOk = !!(wms && wms.found);
      var stowOk = !!(stow && stow.found);
      var parts = [];
      if (wmsOk) {
        var wmsShow = Number(wms.quantity || 0);
        var stowSysShow =
          stow && stow.sysQty != null ? Number(stow.sysQty) : 0;
        var sysUsed = wmsSysQty(report, {
          wms: wms,
          stow: stow,
        });
        parts.push(
          "WMS OK(" +
            wmsShow +
            (report.skuId ? "·SKU" + report.skuId : "") +
            (wms.productCount != null ? "/" + wms.productCount + "행" : "") +
            ")"
        );
        if (wmsShow < 1 && stowSysShow > 0) {
          parts.push("전산=오류보고" + stowSysShow);
        } else if (sysUsed > 0 && sysUsed !== wmsShow) {
          parts.push("전산" + sysUsed);
        }
      } else if (report.type.verifyWmsTransfer) {
        parts.push((wms && wms.status) || "WMS없음");
      }
      if (stowOk) parts.push("오류보고 OK");
      else if (report.type.verifyStowProblem) {
        parts.push((stow && stow.status) || "오류보고없음");
      }
      if (prbOk) {
        parts.push("PRB재고 OK(" + verify.invQty + ")");
      } else if (verify.found) {
        parts.push(
          "PRB수량부족(" + verify.invQty + "/" + expectQty + ")"
        );
      } else {
        parts.push(verify.status || "PRB재고없음");
      }
      verify.status = parts.join(" · ");
      /* 성공: WMS 전산 + PRB에 부족수량만큼 재고 */
      verify.found = wmsOk && prbOk;
      verify.qty = wmsSysQty(report, verify);
      return { report: report, verify: verify };
    }

    if (
      report.type.id !== "overage" &&
      verify.found &&
      report.qty > 0 &&
      verify.qty < report.qty
    ) {
      verify.status = "수량부족(" + verify.qty + ")";
    }
    if (wms && !wms.found && report.type.verifyWmsTransfer) {
      verify.found = false;
      verify.status = wms.status || "WMS없음";
    } else if (wms && wms.found && verify.found) {
      verify.status = "WMS+재고 OK";
    } else if (wms && wms.found && !verify.found) {
      verify.found = report.type.id === "overage" ? true : verify.found;
      verify.status = "WMS OK · " + (verify.status || "재고없음");
    }
    return { report: report, verify: verify };
  }

  function damageErrorContentFromLocation(loc) {
    var s = trim(loc).toUpperCase();
    if (!s) return "이관 중 파손";
    if (/-1-222$/.test(s) || s.indexOf("XX26-1-222") >= 0) {
      return "진열 중 파손";
    }
    if (/-1-888$/.test(s) || s.indexOf("XX26-1-888") >= 0) {
      return "이관 중 파손";
    }
    return "이관 중 파손";
  }

  function buildDamageTsvLine(report, verify) {
    var pl =
      verify.plBarcode || (/^PL/i.test(report.barcode) ? report.barcode : "");
    var name = report.productName || verify.name || "";
    var locCol = report.moveLocation || report.verifyLoc || "";
    var cols = [
      kstTodaySlash(),
      "DAY",
      "",
      pl,
      name,
      String(report.qty > 0 ? report.qty : verify.qty || 1),
      damageErrorContentFromLocation(locCol),
      locCol,
      report.damageZone || "",
    ];
    return cols.join("\t");
  }

  function icqaProcessStatus(report) {
    if (report.type.id === "shortage") return "PRB0-1-10 이동";
    if (report.type.id === "overage") return "ICQA인계";
    return ICQA_STATUS;
  }

  function buildIcqaTsvLine(report, verify) {
    var wms = verify && verify.wms ? verify.wms : null;
    var author = getPaneAuthor();
    var authorProper = "=PROPER([@작성자])";
    var skuCol = report.externalSkuId || report.skuId || "";
    var gcCol =
      report.tote ||
      (wms && wms.toteBarcode ? cleanGcBarcode(wms.toteBarcode) : "");
    /* 확인작업자·U열 = PROPER(작성자), V열 = 오버숏 시 overage/shortage */
    var cols = [
      author,
      wms && wms.distDate ? parseWmsDistDateUs(wms.distDate) : "",
      kstTodaySlash(),
      wms && wms.fromCenter ? wms.fromCenter : "",
      TO_FC,
      gcCol,
      report.barcode || "",
      skuCol,
      report.productName || (verify && verify.name) || "",
      temperatureFromHeader(report.header),
      String(
        report.type.id === "overage"
          ? overageExtraQty(report)
          : report.type.id === "shortage"
          ? shortageExtraQty(report)
          : report.qty > 0
          ? report.qty
          : 0
      ),
      statusValueEn(report),
      icqaProcessStatus(report),
      shiftFromKst(),
      problemTitle(report),
      buildProblemDetail(report, verify),
      authorProper,
      report.followUp || "",
      authorProper,
      report.overShort ? "overage/shortage" : "",
    ];
    return cols.join("\t");
  }


  function buildRecvQtyTsvLine(report, verify) {
    var wms = verify && verify.wms ? verify.wms : null;
    var author = getPaneAuthor();
    var unloadRaw =
      (wms && (wms.unloadDate || wms.distDate)) || "";
    var gcCol =
      report.tote ||
      (wms && wms.toteBarcode ? cleanGcBarcode(wms.toteBarcode) : "");
    /* B열부터 붙여넣기 → K=부족수식, L=외박스, M=실제 → =M-L */
    var shortFormula = '=INDIRECT("M"&ROW())-INDIRECT("L"&ROW())';
    var cols = [
      author,
      unloadRaw ? parseWmsDistDateUs(unloadRaw) : "",
      wms && wms.fromCenter ? wms.fromCenter : "",
      TO_FC,
      gcCol,
      (verify && verify.vendorName) || "",
      report.externalSkuId || report.skuId || "",
      report.productName || (verify && verify.name) || "",
      temperatureFromHeader(report.header),
      shortFormula,
      String(recvLabelQty(verify)),
      String(recvActualQty(verify)),
      buildProblemDetail(report, verify),
    ];
    return cols.join("\t");
  }

  function buildTsvLine(report, verify) {
    if (report.type.id === "recvQty") return buildRecvQtyTsvLine(report, verify);
    if (isIcqaType(report)) return buildIcqaTsvLine(report, verify);
    return buildDamageTsvLine(report, verify);
  }

  /** 오버숏: 같은 GC → 2행 From FC / 집품일시는 숏(1행)과 동일 */
  function shareOverShortWmsMeta(shortPack, overPack) {
    var src =
      shortPack && shortPack.verify && shortPack.verify.wms
        ? shortPack.verify.wms
        : null;
    var dst =
      overPack && overPack.verify && overPack.verify.wms
        ? overPack.verify.wms
        : null;
    if (!src) return;
    if (!dst) {
      if (!overPack.verify) overPack.verify = {};
      overPack.verify.wms = {
        found: !!src.found,
        status: src.status || "",
        fromCenter: src.fromCenter || "",
        distDate: src.distDate || "",
        toteBarcode: src.toteBarcode || "",
        quantity: 0,
      };
      return;
    }
    if (src.fromCenter) dst.fromCenter = src.fromCenter;
    if (src.distDate) dst.distDate = src.distDate;
    if (src.toteBarcode && !dst.toteBarcode) dst.toteBarcode = src.toteBarcode;
  }

  function buildTsvExport(rows) {
    var lines = [];
    var i;
    for (i = 0; i < rows.length; i++) {
      lines.push(buildTsvLine(rows[i].report, rows[i].verify));
    }
    return lines.join("\n");
  }

  function setStatus(msg) {
    var el = $("#" + ROOT_ID + "-status");
    if (el) el.textContent = msg || "";
  }

  function renderResults(rows) {
    var box = $("#" + ROOT_ID + "-results");
    if (!box) return;
    if (!rows.length) {
      box.textContent = "결과 없음";
      return;
    }
    var html = "";
    var i, r, ok;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      ok =
        r.verify &&
        (r.verify.found ||
          (r.verify.status && r.verify.status === "TSV만"));
      html +=
        '<div class="yna4-dmg-row' +
        (ok ? " yna4-dmg-row--ok" : " yna4-dmg-row--bad") +
        '">' +
        '<span class="yna4-dmg-type">[' +
        (r.report.type && r.report.type.id === "recvQty"
          ? "입수상이·" +
            (r.report.recvSide === "overage" ? "오버" : "숏")
          : (r.report.overShort ? "오버숏·" : "") +
            (r.report.type ? r.report.type.label : "?")) +
        "]</span> " +
        '<span class="yna4-dmg-badge">' +
        (r.verify ? r.verify.status : "?") +
        "</span> " +
        (r.report.productName || r.report.moveLocation || "—");
      if (isIcqaType(r.report) || (r.report.type && r.report.type.id === "recvQty")) {
        html +=
          ' <span class="yna4-dmg-meta">' +
          [
            r.report.tote ||
              (r.verify &&
                r.verify.wms &&
                r.verify.wms.toteBarcode),
            r.report.barcode,
            r.report.skuId ? "SKU" + r.report.skuId : "",
            r.report.externalSkuId ? "EXT" + r.report.externalSkuId : "",
            r.verify && r.verify.labelQty
              ? "박스" + r.verify.labelQty + "/" + r.verify.actualQty
              : "",
          ]
            .filter(Boolean)
            .join(" · ") +
          "</span>";
      }
      if (r.verify && r.verify.wms && formatWmsHint(r.verify.wms)) {
        html +=
          ' <span class="yna4-dmg-wms">WMS ' +
          formatWmsHint(r.verify.wms) +
          "</span>";
      }
      if (r.verify && r.verify.stow && r.verify.stow.found) {
        html +=
          ' <span class="yna4-dmg-wms">오류보고 전산' +
          Number(r.verify.stow.sysQty || 0) +
          " · 신고" +
          Number(r.verify.stow.problemQty || 0) +
          (r.verify.stow.stowDoneQty != null
            ? " · 진열완료" + Number(r.verify.stow.stowDoneQty)
            : "") +
          "</span>";
      }
      if (
        r.report.type &&
        r.report.type.id === "shortage" &&
        r.verify &&
        r.verify.invQty != null
      ) {
        html +=
          ' <span class="yna4-dmg-loc">PRB재고 ' +
          Number(r.verify.invQty) +
          "EA</span>";
      }
      html +=
        (r.report.moveLocation || r.report.verifyLoc
          ? ' <span class="yna4-dmg-loc">' +
            (r.report.moveLocation || r.report.verifyLoc) +
            "</span>"
          : "") +
        "</div>";
    }
    box.innerHTML = html;
  }

  async function runVerify(text) {
    var blocks = splitBlocks(text);
    if (!blocks.length) {
      alert("붙여넣을 내용이 없습니다.");
      return;
    }
    running = true;
    setStatus("파싱 " + blocks.length + "건…");
    lastRows = [];
    wmsGcProductCache = Object.create(null);
    var i, j, reports, report, pack;
    try {
      for (i = 0; i < blocks.length; i++) {
        reports = parseBlockToReports(blocks[i]);
        if (!reports.length) continue;
        var pairStart = lastRows.length;
        for (j = 0; j < reports.length; j++) {
          report = reports[j];
          if (
            !report.tote &&
            !report.moveLocation &&
            !report.verifyLoc &&
            !report.barcode &&
            !report.productName
          ) {
            continue;
          }
          setStatus(
            "처리 " +
              (i + 1) +
              "/" +
              blocks.length +
              (reports.length > 1
                ? " · " +
                  (report.type ? report.type.label : "") +
                  " " +
                  (j + 1) +
                  "/" +
                  reports.length
                : "") +
              "…"
          );
          pack = await verifyReport(report);
          lastRows.push(pack);
        }
        if (
          reports.length >= 2 &&
          reports[0].overShort &&
          reports[1].overShort &&
          lastRows.length >= pairStart + 2
        ) {
          shareOverShortWmsMeta(
            lastRows[pairStart],
            lastRows[pairStart + 1]
          );
        }
      }
      renderResults(lastRows);
      var okN = 0;
      for (i = 0; i < lastRows.length; i++) {
        if (
          lastRows[i].verify &&
          (lastRows[i].verify.found ||
            lastRows[i].verify.status === "TSV만")
        ) {
          okN++;
        }
      }
      setStatus(
        "완료 · " + lastRows.length + "건 (확인 " + okN + "/" + lastRows.length + ")"
      );
    } catch (eRun) {
      setStatus("오류: " + (eRun && eRun.message ? eRun.message : String(eRun)));
    } finally {
      running = false;
    }
  }

  function writeClipboard(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          setStatus(okMsg || "복사됨");
        },
        function () {
          fallbackCopy(text, okMsg);
        }
      );
      return;
    }
    fallbackCopy(text, okMsg);
  }

  function copyTsv() {
    if (!lastRows.length) {
      alert("먼저 확인을 실행하세요.");
      return;
    }
    var tsv = buildTsvExport(lastRows);
    writeClipboard(tsv, "TSV " + lastRows.length + "행 복사됨");
  }

  function fallbackCopy(text, okMsg) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      setStatus(okMsg || "TSV 복사됨");
    } catch (eC) {
      alert("복사 실패 — 결과 영역에서 수동 복사하세요.");
    }
    document.body.removeChild(ta);
  }

  function ensureStyles() {
    var st = document.getElementById("yna4-damage-verify-css");
    if (!st) {
      st = document.createElement("style");
      st.id = "yna4-damage-verify-css";
      document.head.appendChild(st);
    }
    st.textContent =
      "#" +
      ROOT_ID +
      "{display:flex;flex-direction:column;gap:4px;height:100%;min-height:0;box-sizing:border-box;overflow:auto;}" +
      "#" +
      ROOT_ID +
      " .yna4-dmg-ta{width:100%;min-height:64px;flex:0 0 auto;resize:vertical;font-size:11px;line-height:1.35;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;}" +
      "#" +
      ROOT_ID +
      " .yna4-dmg-results{margin-top:4px;flex:1 1 auto;min-height:72px;max-height:none;overflow:auto;font-size:11px;line-height:1.5;}" +
      "#" +
      ROOT_ID +
      " .yna4-dmg-row{padding:4px 0;border-bottom:1px solid #f1f5f9;white-space:normal;overflow-wrap:anywhere;word-break:break-word;}" +
      "#" +
      ROOT_ID +
      " .yna4-dmg-row--ok .yna4-dmg-badge{color:#15803d;}" +
      "#" +
      ROOT_ID +
      " .yna4-dmg-row--bad .yna4-dmg-badge{color:#b91c1c;}" +
      "#" +
      ROOT_ID +
      " .yna4-dmg-badge{font-weight:700;}" +
      "#" +
      ROOT_ID +
      " .yna4-dmg-type{color:#475569;font-weight:600;}" +
      "#" +
      ROOT_ID +
      " .yna4-dmg-loc{color:#64748b;}" +
      "#" +
      ROOT_ID +
      " .yna4-dmg-wms{color:#1d4ed8;font-size:10px;}" +
      "#" +
      ROOT_ID +
      " .yna4-dmg-meta{color:#64748b;font-size:10px;}" +
      "#" +
      ROOT_ID +
      " .yna4-dmg-author-row{display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:11px;flex:0 0 auto;}" +
      "#" +
      ROOT_ID +
      " .yna4-dmg-author-inp{flex:1;min-width:0;padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;}" +
      "#" +
      ROOT_ID +
      " .yna4-pane-status{white-space:normal;overflow-wrap:anywhere;word-break:break-word;line-height:1.35;}";
  }

  window.__YAN4_INIT_DAMAGE_VERIFY_PANE__ = function (hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.id = ROOT_ID;
    hostEl.className = "yna4-pane-mod yna4-pane-mod--damage-verify";
    ensureStyles();

    var hint = document.createElement("div");
    hint.className = "yna4-pane-status";
    hint.style.marginBottom = "4px";
    hint.textContent =
      "숏/오버/오버숏/입수량상이 → 오류처리 시트 · 파손 → 파손 TSV";

    var authorRow = document.createElement("div");
    authorRow.className = "yna4-dmg-author-row";
    var authorLbl = document.createElement("span");
    authorLbl.textContent = "작성자";
    paneAuthorEl = document.createElement("input");
    paneAuthorEl.type = "text";
    paneAuthorEl.className = "yna4-dmg-author-inp";
    paneAuthorEl.placeholder = "작성자 (구분은 비움)";
    authorRow.appendChild(authorLbl);
    authorRow.appendChild(paneAuthorEl);

    var ta = document.createElement("textarea");
    ta.className = "yna4-dmg-ta";
    ta.placeholder =
      "1도 입수량 상이 ( Shortage ) / 1도오버숏 / 파손\n해당토트 : GC-GT…\n…";

    var actions = document.createElement("div");
    actions.className = "yna4-pane-actions";
    actions.style.marginTop = "6px";

    var btnRun = document.createElement("button");
    btnRun.type = "button";
    btnRun.className = "yna4-pane-btn yna4-pane-btn--primary";
    btnRun.textContent = "전산 확인";

    var btnCopy = document.createElement("button");
    btnCopy.type = "button";
    btnCopy.className = "yna4-pane-btn";
    btnCopy.textContent = "TSV 복사";

    actions.appendChild(btnRun);
    actions.appendChild(btnCopy);

    var status = document.createElement("div");
    status.id = ROOT_ID + "-status";
    status.className = "yna4-pane-status";
    status.textContent = "붙여넣기 후 전산 확인";

    var results = document.createElement("div");
    results.id = ROOT_ID + "-results";
    results.className = "yna4-dmg-results";

    hostEl.appendChild(hint);
    hostEl.appendChild(authorRow);
    hostEl.appendChild(ta);
    hostEl.appendChild(actions);
    hostEl.appendChild(status);
    hostEl.appendChild(results);

    btnRun.addEventListener("click", function () {
      if (running) return;
      void runVerify(ta.value);
    });
    btnCopy.addEventListener("click", copyTsv);
  };
})();
