"use strict";

const { session } = require("electron");

const SESSION_PARTITION = "persist:yna4-minimap-inventory";
const API_BIN =
  "https://inventory.coupang.com/async/storagecapacity/summary/bin";
const CHAMBER_PREFIX = "1007";
const AISLE_DELAY_MS = 150;
const PAGE_DELAY_MS = 80;
const PAGE_SIZE = 20;
const BAY_LOT_RE = /^1007-(1CP\d+|1C\d+)-(\d+)-\d+$/i;

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function parseNumber(value) {
  if (value === undefined || value === null) return null;
  var n = parseFloat(String(value).replace(/[,\s]/g, ""));
  return isFinite(n) ? n : null;
}

/** Consolidation stockingScore 와 동일: 빈 로케 많을수록·진열공간 클수록 ↑ */
function capacityGoodness(emptyLots, availableSpace) {
  var empty = emptyLots != null ? emptyLots : 0;
  var avail = availableSpace != null ? availableSpace : 0;
  return Number((empty * 0.65 + avail * 0.35).toFixed(2));
}

function bayKey(zone, row) {
  var z = String(zone || "")
    .trim()
    .toUpperCase();
  var r = String(row == null ? "" : row).trim();
  if (!z || !r) return "";
  return CHAMBER_PREFIX + "-" + z + "-" + r;
}

function getSession() {
  return session.fromPartition(SESSION_PARTITION);
}

async function postJson(url, body) {
  var ses = getSession();
  var res = await ses.fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      Accept: "*/*",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    throw new Error("HTTP " + res.status);
  }
  return res.json();
}

/** Excel 박스 목록 → 통로별 bin API 조회 범위 */
function buildAisleRanges(boxes) {
  var byZone = {};
  (boxes || []).forEach(function (box) {
    var zone = String((box && box.zone) || "")
      .trim()
      .toUpperCase();
    var row = parseInt(box && box.row, 10);
    if (!zone || !isFinite(row)) return;
    if (!byZone[zone]) {
      byZone[zone] = { minRow: row, maxRow: row };
    } else {
      byZone[zone].minRow = Math.min(byZone[zone].minRow, row);
      byZone[zone].maxRow = Math.max(byZone[zone].maxRow, row);
    }
  });

  return Object.keys(byZone)
    .sort()
    .map(function (zone) {
      var span = byZone[zone];
      return {
        zone: zone,
        startFullName:
          CHAMBER_PREFIX + "-" + zone + "-" + span.minRow + "-101",
        endFullName:
          CHAMBER_PREFIX + "-" + zone + "-" + span.maxRow + "-505",
      };
    });
}

async function fetchBinPage(startFullName, endFullName, pageIndex) {
  var body = {
    startFullName: startFullName,
    endFullName: endFullName,
    excludeTemp: false,
    pageSize: PAGE_SIZE,
  };
  if (pageIndex != null) body.pageIndex = pageIndex;
  var json = await postJson(API_BIN, body);
  if (!json || json.success !== true) {
    throw new Error((json && json.message) || "bin summary API 실패");
  }
  return json.result || {};
}

async function fetchAisleLots(range) {
  var allLots = [];
  var pageIndex = null;
  var totalElements = null;

  while (true) {
    var result = await fetchBinPage(
      range.startFullName,
      range.endFullName,
      pageIndex
    );
    var page = result.detailViewPage || {};
    var content = Array.isArray(page.content) ? page.content : [];
    if (!content.length) break;
    allLots = allLots.concat(content);
    if (totalElements == null && typeof page.totalElements === "number") {
      totalElements = page.totalElements;
    }
    if (page.last === true) break;
    if (totalElements != null && allLots.length >= totalElements) break;
    var current =
      typeof page.number === "number"
        ? page.number
        : pageIndex == null
          ? 0
          : pageIndex;
    pageIndex = current + 1;
    await sleep(PAGE_DELAY_MS);
  }

  return allLots;
}

function aggregateLotsToBayMap(lots) {
  var bays = {};

  (lots || []).forEach(function (lot) {
    var name = lot.lotFullName || "";
    var m = name.match(BAY_LOT_RE);
    if (!m) return;
    var key = CHAMBER_PREFIX + "-" + m[1].toUpperCase() + "-" + m[2];
    if (!bays[key]) {
      bays[key] = {
        emptyLots: 0,
        totalLots: 0,
        totalLotVolume: 0,
        totalInventoryVolume: 0,
      };
    }
    var bay = bays[key];
    bay.totalLots++;
    var qty = parseNumber(lot.inventoryUnitQuantity);
    if (!qty) bay.emptyLots++;
    bay.totalLotVolume += parseNumber(lot.lotVolume) || 0;
    bay.totalInventoryVolume += parseNumber(lot.inventoryVolume) || 0;
  });

  var map = {};
  Object.keys(bays).forEach(function (key) {
    var b = bays[key];
    var volRate =
      b.totalLotVolume > 0
        ? (b.totalInventoryVolume / b.totalLotVolume) * 100
        : null;
    var availableSpace =
      volRate != null ? Math.max(0, 100 - volRate) : null;
    var goodness = capacityGoodness(b.emptyLots, availableSpace);
    var parts = key.split("-");
    map[key] = {
      emptyLots: b.emptyLots,
      availableSpace:
        availableSpace != null ? Number(availableSpace.toFixed(1)) : null,
      goodness: goodness,
      displayEmpty: String(b.emptyLots),
      displayAvailable:
        availableSpace != null ? availableSpace.toFixed(1) + "%" : "",
      totalLots: b.totalLots,
      occupancyVolumeRate:
        volRate != null ? Number(volRate.toFixed(1)) : null,
      displayOccupied: volRate != null ? volRate.toFixed(1) + "%" : "",
      zoneName: parts[1] || "",
      bay: parts[2] || "",
    };
  });
  return map;
}

function mergeUsageMaps(target, source) {
  Object.keys(source || {}).forEach(function (key) {
    target[key] = source[key];
  });
  return target;
}

async function fetchAllCapacity(boxes, onProgress) {
  var ranges = buildAisleRanges(boxes);
  if (!ranges.length) {
    throw new Error("도면에서 1007- 위치를 찾을 수 없음");
  }

  var usageMap = {};
  var lotCount = 0;
  var bayCount = 0;

  for (var i = 0; i < ranges.length; i++) {
    var range = ranges[i];
    if (onProgress) {
      onProgress(i + 1, ranges.length, range.zone, range.startFullName);
    }
    var lots = await fetchAisleLots(range);
    lotCount += lots.length;
    var partial = aggregateLotsToBayMap(lots);
    bayCount += Object.keys(partial).length;
    mergeUsageMaps(usageMap, partial);
    if (i < ranges.length - 1) await sleep(AISLE_DELAY_MS);
  }

  if (!Object.keys(usageMap).length) {
    throw new Error("bin API에서 bay 데이터 없음 (로그인 확인)");
  }

  return {
    usageMap: usageMap,
    aisleCount: ranges.length,
    bayCount: bayCount,
    lotCount: lotCount,
  };
}

/** @deprecated rowsToUsageMap — bin API는 fetchAllCapacity가 map 반환 */
function rowsToUsageMap(rows) {
  return aggregateLotsToBayMap(rows || []);
}

module.exports = {
  SESSION_PARTITION,
  fetchAllCapacity,
  rowsToUsageMap,
  bayKey,
  buildAisleRanges,
  capacityGoodness,
  aggregateLotsToBayMap,
};
