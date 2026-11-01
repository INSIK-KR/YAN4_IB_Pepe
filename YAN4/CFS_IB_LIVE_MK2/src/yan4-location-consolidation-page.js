/** YAN4 IB Shell — 2페이지 Location CONSOLIDATION (API 수집 + 모달 대시보드) */
(function () {
  "use strict";

  var LOC_UI_REV = "11";
  window.__YAN4_LOC_CONSOL_UI_REV__ = LOC_UI_REV;

  var ROOT_ID = "yna4-loc-consolidation-root";
  var API_LIST =
    "https://inventory.coupang.com/async/v3/storagecapacity/location-capacity/list";
  var API_DETAIL =
    "https://inventory.coupang.com/async/v3/storagecapacity/location-capacity/detail/list";
  var API_BIN =
    "https://inventory.coupang.com/async/storagecapacity/summary/bin";
  var LIST_BODY = {
    floors: ["1.1", "1.2", "2.1", "2.2"],
    zoneType: null,
    zoneName: null,
  };
  var DETAIL_DELAY_MS = 120;
  var BIN_PAGE_SIZE = 40;
  var BIN_PAGE_DELAY_MS = 60;
  /** 목록 API는 전 존을 주지만 상세 수집은 이 4개만 */
  var TARGET_ZONE_NAMES = ["1CP", "1FP", "1AP", "1APR"];
  var CHAMBER_PREFIX = "1007";
  function chamberPrefix() {
    var api = window.__CFS_CENTER__;
    var id = api && typeof api.activeId === "function" ? api.activeId() : "";
    return /^\d+$/.test(String(id || "")) ? String(id) : CHAMBER_PREFIX;
  }
  var CONSOL_AVAIL_DEFAULT = 60;
  var CONSOL_AVAIL_KEY = "yan4LocConsolAvailMin";
  var consolAvailMin = loadConsolAvailMin();
  var DEFAULT_HEADERS = [
    "존 유형",
    "존",
    "통로",
    "유닛 수",
    "인벤토리",
    "로케이션",
    "FILLRATE",
    "진열가능공간",
    "사용중인로케이션",
    "비어있는로케이션",
    "전체로케이션",
    "로케이션사용률",
  ];

  var ZONE_ORDER = ["CP", "FP", "AP", "APR"];
  var ZONE_LABEL = { CP: "냉장", FP: "냉동", AP: "상온", APR: "로켓" };
  var ZONE_THEME = {
    CP: {
      text: "#166534",
      chartHi: "#16a34a",
      chartLo: "rgba(34, 197, 94, 0.38)",
      legendLo: "#bbf7d0",
    },
    FP: {
      text: "#1e40af",
      chartHi: "#2563eb",
      chartLo: "rgba(96, 165, 250, 0.42)",
      legendLo: "#bfdbfe",
    },
    AP: {
      text: "#854d0e",
      chartHi: "#ca8a04",
      chartLo: "rgba(234, 179, 8, 0.48)",
      legendLo: "#fde68a",
    },
    APR: {
      text: "#6d28d9",
      chartHi: "#9333ea",
      chartLo: "rgba(192, 132, 252, 0.42)",
      legendLo: "#e9d5ff",
    },
  };
  var CHART_RELOC_HI = "#ea580c";
  var CHART_MIXED_LO = "rgba(148, 163, 184, 0.55)";

  var chartInstances = [];
  var summaryQuickZone = "All";
  var lastSummaryData = null;
  var lastNormalized = null;
  var lastRawRows = null;
  var lastUpdateTime = "";
  var fetching = false;
  var paneStatusEl = null;
  var paneDashBtn = null;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function zoneLabel(code) {
    return ZONE_LABEL[code] || code;
  }

  function zoneTextColor(zoneType) {
    if (zoneType && ZONE_THEME[zoneType]) return ZONE_THEME[zoneType].text;
    return "#64748b";
  }

  function zoneChartPalette(zoneType) {
    var t = zoneType && ZONE_THEME[zoneType];
    if (!t) {
      return {
        stockHi: "#16a34a",
        stockLo: CHART_MIXED_LO,
        relocHi: CHART_RELOC_HI,
        relocLo: CHART_MIXED_LO,
        legendMuted: "#cbd5e1",
      };
    }
    return {
      stockHi: t.chartHi,
      stockLo: t.chartLo,
      relocHi: CHART_RELOC_HI,
      relocLo: t.chartLo,
      legendMuted: t.legendLo,
    };
  }

  function parsePercent(value) {
    if (value === undefined || value === null) return 0;
    return parseFloat(String(value).replace(/[%\s,]/g, "")) || 0;
  }

  function parseNumber(value) {
    if (value === undefined || value === null) return 0;
    return parseFloat(String(value).replace(/[,\s]/g, "")) || 0;
  }

  function getZoneType(zoneName) {
    if (!zoneName) return "Unknown";
    var normalized = String(zoneName).trim().toUpperCase();
    if (normalized.endsWith("CP")) return "CP";
    if (normalized.endsWith("FP")) return "FP";
    if (normalized.endsWith("APR")) return "APR";
    if (normalized.endsWith("AP")) return "AP";
    return "Unknown";
  }

  var aggRawByAisle = Object.create(null);

  function aggRawKey(zoneName, aisle) {
    return (
      String(zoneName || "").trim().toUpperCase() +
      "|" +
      String(aisle == null ? "" : aisle).trim()
    );
  }

  function apiItemToRow(item) {
    aggRawByAisle[aggRawKey(item.zoneName, item.aisle)] = item;
    var empty =
      item.displayEmptyLotCount != null
        ? parseNumber(item.displayEmptyLotCount)
        : Math.max(0, (item.totalLotCount || 0) - (item.usingLotCount || 0));
    return {
      "존 유형": item.displayZoneType || item.zoneType || "",
      존: item.zoneName || "",
      통로: item.aisle != null && item.aisle !== "" ? String(item.aisle) : "",
      "유닛 수": item.displayUnitQuantity || String(item.unitQuantity || ""),
      인벤토리: item.displayInventoryVolume || "",
      로케이션: "",
      FILLRATE: item.fillrate != null ? String(item.fillrate) : "",
      진열가능공간: item.displayAvaliableLotVolume || "",
      "사용중인로케이션":
        item.displayUsingLotCount || String(item.usingLotCount || ""),
      "비어있는로케이션": String(empty),
      "전체로케이션":
        item.displayTotalLotCount || String(item.totalLotCount || ""),
      로케이션사용률: item.displayOccupied || "",
    };
  }

  function normalizeData(data) {
    return data.map(function (row) {
      var emptyLoc = parseNumber(row["비어있는로케이션"]);
      var availableSpace = parsePercent(row["진열가능공간"]);
      var usageRate = parsePercent(row["로케이션사용률"]);
      var fillRate = parsePercent(row["FILLRATE"]);
      var totalLoc = parseNumber(row["전체로케이션"]);
      var usedLoc = parseNumber(row["사용중인로케이션"]);
      var stockingScore = emptyLoc * 0.65 + availableSpace * 0.35;
      var relocationScore = Math.max(0, 5 - emptyLoc) * 12 + availableSpace * 0.7;
      var zoneName = row["존"] || row["존 유형"] || "";
      var aisle = row["통로"];
      var chartLabel = zoneName;
      if (aisle != null && String(aisle).trim() !== "") {
        chartLabel = zoneName + "·T" + String(aisle).trim();
      }
      return Object.assign({}, row, {
        _emptyLoc: emptyLoc,
        _availableSpace: availableSpace,
        _usageRate: usageRate,
        _fillRate: fillRate,
        _totalLoc: totalLoc,
        _usedLoc: usedLoc,
        _zoneType: getZoneType(zoneName),
        _stockingScore: Number(stockingScore.toFixed(2)),
        _relocationScore: Number(relocationScore.toFixed(2)),
        _chartLabel: chartLabel,
      });
    });
  }

  var lastEmptyDrillLocs = [];
  var lastEmptyDrillRows = [];
  var lastEmptyDrillRaw = null;
  var emptyDrillBusy = false;

  function loadConsolAvailMin() {
    try {
      var n = Number(localStorage.getItem(CONSOL_AVAIL_KEY));
      if (localStorage.getItem(CONSOL_AVAIL_KEY) != null && isFinite(n)) {
        return Math.min(100, Math.max(0, Math.round(n)));
      }
    } catch (e) {}
    return CONSOL_AVAIL_DEFAULT;
  }

  function saveConsolAvailMin(n) {
    consolAvailMin = n;
    try {
      localStorage.setItem(CONSOL_AVAIL_KEY, String(n));
    } catch (e) {}
  }

  function isStockingTarget(row) {
    return row._emptyLoc >= 1 && row._availableSpace >= consolAvailMin;
  }

  function isEmptyLocRow(row) {
    return row._emptyLoc >= 1;
  }

  /** 콘솔 우선 — 진열가능공간 많은 통로 (빈 칸 점수 미사용) */
  function isRelocationTarget(row) {
    return row._availableSpace >= consolAvailMin;
  }

  function sumEmptyLoc(data) {
    return (data || []).reduce(function (sum, row) {
      return sum + (Number(row._emptyLoc) || 0);
    }, 0);
  }

  function aisleTokenPrimary(aisle) {
    var raw = String(aisle != null ? aisle : "").trim();
    if (!raw) return "";
    return raw.replace(/^0+/, "") || "0";
  }

  function buildPrimaryBinRange(zoneName, aisle) {
    var z = String(zoneName || "")
      .trim()
      .toUpperCase();
    var a = aisleTokenPrimary(aisle);
    if (!z || !a) return null;
    var mid = z + a;
    return {
      mid: mid,
      aisleToken: a,
      startFullName: chamberPrefix() + "-" + mid + "-0-0",
      endFullName: chamberPrefix() + "-" + mid + "-999-999",
    };
  }

  /** 표시/필터용 부피 — lotVolume만 (usableLotVolume 폴백 금지: 빈칸이 1로 잘못 잡힘) */
  function lotVolumeOf(lot) {
    if (!lot) return null;
    if (lot.lotVolume == null || lot.lotVolume === "") return null;
    return parseNumber(lot.lotVolume);
  }

  function lotInventoryQty(lot) {
    if (!lot) return null;
    if (lot.inventoryUnitQuantity != null && lot.inventoryUnitQuantity !== "") {
      return parseNumber(lot.inventoryUnitQuantity);
    }
    if (lot.unitQuantity != null && lot.unitQuantity !== "") {
      return parseNumber(lot.unitQuantity);
    }
    return null;
  }

  function lotInventoryVolume(lot) {
    if (!lot) return null;
    if (lot.inventoryVolume != null && lot.inventoryVolume !== "") {
      return parseNumber(lot.inventoryVolume);
    }
    return null;
  }

  /**
   * 빈 로케이션 (minimap/capacity와 동일 기준):
   * - inventoryUnitQuantity 가 없거나 0
   * - inventoryVolume 이 있으면 0이어야 함
   * - lotVolume === 1 은 조회 대상 아님 (호출 측에서 제외)
   */
  function isDrillEmptyLot(lot) {
    if (!lot) return false;
    var qty = lotInventoryQty(lot);
    if (qty != null && qty > 0) return false;
    var invVol = lotInventoryVolume(lot);
    if (invVol != null && invVol > 0) return false;
    return true;
  }

  function locationBelongsToAisle(lotFullName, zoneName, aisleToken) {
    var name = String(lotFullName || "")
      .trim()
      .toUpperCase();
    var z = String(zoneName || "")
      .trim()
      .toUpperCase();
    var a = aisleTokenPrimary(aisleToken);
    if (!name || !z || !a) return false;
    var parts = name.split("-");
    if (parts[0] !== chamberPrefix()) return false;
    /* 표준: 1007-1CP17-행-슬롯 */
    if (parts.length >= 4) {
      var mid = String(parts[1] || "").toUpperCase();
      if (mid === z + a) return true;
      /* 0패딩 차이: 1CP07 vs 1CP7 */
      if (mid.indexOf(z) === 0) {
        var midAisle = aisleTokenPrimary(mid.slice(z.length));
        if (midAisle === a) return true;
      }
    }
    /* 보조: 1007-1CP-17-행-슬롯 */
    if (parts.length >= 5 && String(parts[1] || "").toUpperCase() === z) {
      var partA = aisleTokenPrimary(parts[2]);
      if (partA === a) return true;
    }
    return false;
  }

  function aisleTokenVariants(aisle) {
    var raw = String(aisle != null ? aisle : "").trim();
    var primary = aisleTokenPrimary(raw);
    var out = [];
    function push(v) {
      v = String(v || "");
      if (!v || out.indexOf(v) >= 0) return;
      out.push(v);
    }
    push(primary);
    if (/^\d+$/.test(raw)) {
      push(raw);
      if (raw.length < 2) push(raw.padStart(2, "0"));
      if (primary && primary.length < 2) push(primary.padStart(2, "0"));
    }
    return out;
  }

  async function fetchBinPage(startFullName, endFullName, pageIndex) {
    var body = {
      startFullName: startFullName,
      endFullName: endFullName,
      excludeTemp: false,
      pageSize: BIN_PAGE_SIZE,
    };
    if (pageIndex != null) body.pageIndex = pageIndex;
    var json = await postJson(API_BIN, body);
    if (!json || json.success !== true) {
      throw new Error((json && json.message) || "bin summary API 실패");
    }
    return json.result || {};
  }

  async function fetchAllLotsForRange(range) {
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
      await sleep(BIN_PAGE_DELAY_MS);
    }
    return allLots;
  }

  function filterEmptyLotsFromScan(lots, zoneName, aisleToken) {
    var skippedVol1 = 0;
    var skippedOtherAisle = 0;
    var skippedOccupied = 0;
    var rows = [];
    var seen = Object.create(null);
    var i, lot, name, lotVol;
    for (i = 0; i < lots.length; i++) {
      lot = lots[i];
      name = String((lot && lot.lotFullName) || "").trim();
      if (!name) continue;
      if (!locationBelongsToAisle(name, zoneName, aisleToken)) {
        skippedOtherAisle++;
        continue;
      }
      lotVol = lotVolumeOf(lot);
      if (lotVol === 1) {
        skippedVol1++;
        continue;
      }
      if (!isDrillEmptyLot(lot)) {
        skippedOccupied++;
        continue;
      }
      if (seen[name]) continue;
      seen[name] = 1;
      rows.push({
        name: name,
        lotVolume: lotVol,
        qty: lotInventoryQty(lot),
        invVolume: lotInventoryVolume(lot),
      });
    }
    rows.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    return {
      rows: rows,
      skippedVol1: skippedVol1,
      skippedOtherAisle: skippedOtherAisle,
      skippedOccupied: skippedOccupied,
    };
  }

  async function fetchEmptyLocationsForAisle(zoneName, aisle, expectedEmpty) {
    var variants = aisleTokenVariants(aisle);
    if (!variants.length) {
      throw new Error("통로 정보가 없어 로케이션 범위를 만들 수 없습니다.");
    }
    var expect =
      expectedEmpty != null && expectedEmpty !== ""
        ? parseNumber(expectedEmpty)
        : null;
    var best = null;
    var bestScore = null;
    var v, range, lots, filtered, pack, score;
    for (v = 0; v < variants.length; v++) {
      range = buildPrimaryBinRange(zoneName, variants[v]);
      if (!range) continue;
      lots = await fetchAllLotsForRange(range);
      filtered = filterEmptyLotsFromScan(lots, zoneName, range.aisleToken);
      pack = {
        locs: filtered.rows.map(function (r) {
          return r.name;
        }),
        rows: filtered.rows,
        tried: range.mid,
        scanned: lots.length,
        rawLots: lots,
        skippedVol1: filtered.skippedVol1,
        skippedOtherAisle: filtered.skippedOtherAisle,
        skippedOccupied: filtered.skippedOccupied,
        expectedEmpty: expectedEmpty,
      };
      /* 통로집계에 가장 가까운 후보 (부피1 제외분은 집계에 포함될 수 있음) */
      score = filtered.rows.length + filtered.skippedVol1;
      if (expect != null && isFinite(expect)) {
        score = -Math.abs(score - expect);
      }
      if (
        !best ||
        score > bestScore ||
        (score === bestScore && lots.length > best.scanned)
      ) {
        best = pack;
        bestScore = score;
      }
      if (
        expect != null &&
        isFinite(expect) &&
        filtered.rows.length + filtered.skippedVol1 === expect
      ) {
        break;
      }
      if ((expect == null || !isFinite(expect)) && lots.length) break;
      if (v + 1 < variants.length) await sleep(BIN_PAGE_DELAY_MS);
    }
    if (!best) {
      throw new Error("통로 정보가 없어 로케이션 범위를 만들 수 없습니다.");
    }
    return best;
  }

  function postJson(url, body) {
    return new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("GM_xmlhttpRequest 필요"));
        return;
      }
      GM_xmlhttpRequest({
        method: "POST",
        url: url,
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          Accept: "*/*",
          "X-Requested-With": "XMLHttpRequest",
          Referer:
            "https://inventory.coupang.com/storagecapacity/v3/location",
        },
        data: JSON.stringify(body || {}),
        timeout: 60000,
        onload: function (res) {
          if (res.status < 200 || res.status >= 400) {
            reject(new Error("HTTP " + res.status));
            return;
          }
          try {
            resolve(JSON.parse(String(res.responseText || "{}")));
          } catch (e) {
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
    });
  }

  function pickTargetZones(zones) {
    var byName = Object.create(null);
    var i, z, name;
    for (i = 0; i < (zones || []).length; i++) {
      z = zones[i];
      name = String((z && z.zoneName) || "")
        .trim()
        .toUpperCase();
      if (name) byName[name] = z;
    }
    var out = [];
    for (i = 0; i < TARGET_ZONE_NAMES.length; i++) {
      if (byName[TARGET_ZONE_NAMES[i]]) out.push(byName[TARGET_ZONE_NAMES[i]]);
    }
    return out;
  }

  async function fetchZoneList() {
    var json = await postJson(API_LIST, LIST_BODY);
    if (!json || json.success !== true) {
      throw new Error(
        (json && json.message) || "목록 API 실패 (success=false)"
      );
    }
    var list =
      json.result && Array.isArray(json.result.capacityList)
        ? json.result.capacityList
        : [];
    return {
      zones: list,
      updateTime: (json.result && json.result.updateTime) || "",
    };
  }

  async function fetchZoneDetail(zone) {
    var body = {
      floor: zone.floor,
      zoneType: zone.zoneType,
      zoneName: zone.zoneName,
    };
    var json = await postJson(API_DETAIL, body);
    if (!json || json.success !== true) {
      throw new Error(
        zone.zoneName +
          " 상세 API 실패: " +
          ((json && json.message) || "success=false")
      );
    }
    return json.result && Array.isArray(json.result.capacityList)
      ? json.result.capacityList
      : [];
  }

  async function fetchAllZoneDetails(zones, onProgress) {
    var merged = [];
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (onProgress) onProgress(i + 1, zones.length, z.zoneName);
      var rows = await fetchZoneDetail(z);
      for (var j = 0; j < rows.length; j++) {
        merged.push(apiItemToRow(rows[j]));
      }
      if (i < zones.length - 1) await sleep(DETAIL_DELAY_MS);
    }
    return merged;
  }

  function setStatus(msg) {
    var text = String(msg || "");
    var el = $("#" + ROOT_ID + "-status");
    if (el) el.textContent = text;
    if (paneStatusEl) paneStatusEl.textContent = text;
  }

  function ensureChartJs() {
    return new Promise(function (resolve, reject) {
      if (typeof Chart !== "undefined") {
        resolve();
        return;
      }
      reject(new Error("Chart.js 미로드 — 확장 새로고침"));
    });
  }

  function openModal() {
    ensureModalDom();
    var root = $("#" + ROOT_ID);
    if (!root) return;
    try {
      (document.body || document.documentElement).appendChild(root);
    } catch (eMove) {}
    root.classList.add("is-open");
  }

  function closeModal() {
    var root = $("#" + ROOT_ID);
    if (root) root.classList.remove("is-open");
  }

  function setDashBtnEnabled(on) {
    if (paneDashBtn) paneDashBtn.disabled = !on;
  }

  function drawKPI(data) {
    var stockingTargets = data.filter(isStockingTarget);
    var relocationTargets = data.filter(isRelocationTarget);
    var totalEmpty = sumEmptyLoc(data);
    var avgAvailable =
      data.length === 0
        ? "0.0"
        : (
            data.reduce(function (sum, row) {
              return sum + row._availableSpace;
            }, 0) / data.length
          ).toFixed(1);
    var byZoneHtml = ZONE_ORDER.map(function (z) {
      var n = sumEmptyLoc(
        data.filter(function (row) {
          return row._zoneType === z;
        })
      );
      return (
        '<span style="color:' +
        zoneTextColor(z) +
        ';font-weight:800;">' +
        zoneLabel(z) +
        " " +
        n +
        "</span>"
      );
    }).join(" · ");

    $("#" + ROOT_ID + "-kpi").innerHTML =
      '<div class="kpi-box"><div class="kpi-label">진열 작업 대상(통로)</div><div class="kpi-value">' +
      stockingTargets.length +
      '</div></div><div class="kpi-box"><div class="kpi-label">진열여유 통로(≥' +
      consolAvailMin +
      '%)</div><div class="kpi-value">' +
      relocationTargets.length +
      '</div></div><div class="kpi-box"><div class="kpi-label">전체 빈 로케이션</div><div class="kpi-value">' +
      totalEmpty +
      '</div><div class="kpi-sub">' +
      byZoneHtml +
      '</div></div><div class="kpi-box"><div class="kpi-label">평균 진열가능공간</div><div class="kpi-value">' +
      avgAvailable +
      "%</div></div>";
  }

  function summaryTopRowsHtml(stockingTop, relocationTop) {
    var stockingBlock = stockingTop.length
      ? stockingTop
          .map(function (d) {
            return (
              '<div class="summary-item summary-item--drill" role="button" tabindex="0" title="클릭하면 빈 로케이션 위치 조회" data-zone="' +
              String(d["존"] || "").replace(/"/g, "") +
              '" data-aisle="' +
              String(d["통로"] || "").replace(/"/g, "") +
              '" data-empty="' +
              d._emptyLoc +
              '"><div class="summary-left"><span style="color:' +
              zoneTextColor(d._zoneType) +
              ';font-weight:800;">' +
              zoneLabel(d._zoneType) +
              '</span> <span style="color:#64748b;font-weight:600;">(' +
              (d["존"] || "") +
              (d["통로"] ? " · 통로 " + d["통로"] : "") +
              ')</span></div><div class="summary-right">빈 로케이션 ' +
              d._emptyLoc +
              " / 진열가능공간 " +
              d._availableSpace +
              "%</div></div>"
            );
          })
          .join("")
      : '<div class="summary-item"><div class="summary-left">대상 없음</div><div class="summary-right">빈 로케이션 0</div></div>';
    var relocationBlock = relocationTop.length
      ? relocationTop
          .map(function (d) {
            return (
              '<div class="summary-item"><div class="summary-left"><span style="color:' +
              zoneTextColor(d._zoneType) +
              ';font-weight:800;">' +
              zoneLabel(d._zoneType) +
              '</span> <span style="color:#64748b;font-weight:600;">(' +
              (d["존"] || "") +
              (d["통로"] ? " · 통로 " + d["통로"] : "") +
              ')</span></div><div class="summary-right">진열가능공간 ' +
              d._availableSpace +
              "% / 빈 " +
              d._emptyLoc +
              "</div></div>"
            );
          })
          .join("")
      : '<div class="summary-item"><div class="summary-left">대상 없음</div><div class="summary-right">진열가능 ≥' +
        consolAvailMin +
        "% 통로 없음</div></div>";
    return (
      '<div class="summary-panel stocking"><h3>📦 비어있는 로케이션 전체 <span style="font-size:12px;font-weight:600;color:#64748b;">(통로 클릭 → 빈 위치)</span></h3>' +
      stockingBlock +
      '</div><div class="summary-panel relocation"><h3>🔄 콘솔 우선 · 진열가능공간 많은 순 <span style="font-size:12px;font-weight:600;color:#64748b;">(≥' +
      consolAvailMin +
      "%)</span></h3>" +
      relocationBlock +
      "</div>"
    );
  }

  function drawSummary(data) {
    lastSummaryData = data;
    var slice = data;
    if (summaryQuickZone !== "All") {
      slice = data.filter(function (row) {
        return row._zoneType === summaryQuickZone;
      });
    }
    var stockingTop = slice
      .filter(isEmptyLocRow)
      .slice()
      .sort(function (a, b) {
        if (b._emptyLoc !== a._emptyLoc) return b._emptyLoc - a._emptyLoc;
        return b._availableSpace - a._availableSpace;
      });
    var relocationTop = slice
      .filter(isRelocationTarget)
      .slice()
      .sort(function (a, b) {
        if (b._availableSpace !== a._availableSpace) {
          return b._availableSpace - a._availableSpace;
        }
        return a._emptyLoc - b._emptyLoc;
      });
    $("#" + ROOT_ID + "-summary").innerHTML = summaryTopRowsHtml(
      stockingTop,
      relocationTop
    );
  }

  function syncSummaryQuickButtonsUi() {
    var root = $("#" + ROOT_ID);
    if (!root) return;
    root.querySelectorAll(".summary-qbtn").forEach(function (b) {
      b.classList.toggle(
        "active",
        b.getAttribute("data-sum-zone") === summaryQuickZone
      );
    });
  }

  function setEmptyDrillVisible(on) {
    var card = $("#" + ROOT_ID + "-empty-drill-card");
    if (card) card.style.display = on ? "" : "none";
  }

  function renderEmptyDrillList(rows) {
    var list = $("#" + ROOT_ID + "-empty-drill-list");
    if (!list) return;
    if (!rows || !rows.length) {
      list.innerHTML =
        '<div class="empty-drill-empty">빈 로케이션이 없거나 조회 결과가 없습니다.</div>';
      return;
    }
    list.innerHTML =
      '<div class="empty-drill-row empty-drill-row--head">로케이션<span>부피</span></div>' +
      rows
        .map(function (r) {
          var name = typeof r === "string" ? r : r.name;
          var vol =
            typeof r === "string"
              ? ""
              : r.lotVolume != null
              ? String(r.lotVolume)
              : "-";
          return (
            '<div class="empty-drill-row"><span class="empty-drill-name">' +
            String(name) +
            '</span><span class="empty-drill-vol">' +
            vol +
            "</span></div>"
          );
        })
        .join("");
  }

  function copyEmptyDrillLocs(btn) {
    copyTextWithFlash(btn, (lastEmptyDrillLocs || []).join("\n"), "복사");
  }

  function copyEmptyDrillRaw(btn) {
    var text = lastEmptyDrillRaw ? JSON.stringify(lastEmptyDrillRaw, null, 1) : "";
    copyTextWithFlash(btn, text, "원본복사");
  }

  function copyTextWithFlash(btn, text, label) {
    if (!text) {
      if (btn) {
        btn.textContent = "복사할 내용 없음";
        setTimeout(function () {
          btn.textContent = label;
        }, 1400);
      }
      return;
    }
    function done(ok) {
      if (!btn) return;
      btn.textContent = ok ? "복사됨" : "복사 실패";
      setTimeout(function () {
        btn.textContent = label;
      }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          done(true);
        },
        function () {
          done(false);
        }
      );
      return;
    }
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      done(!!document.execCommand("copy"));
      document.body.removeChild(ta);
    } catch (eCp) {
      done(false);
    }
  }

  async function openEmptyLocDrill(zoneName, aisle, expectedEmpty) {
    var titleEl = $("#" + ROOT_ID + "-empty-drill-title");
    var statusEl = $("#" + ROOT_ID + "-empty-drill-status");
    if (emptyDrillBusy) {
      if (statusEl) statusEl.textContent = "이미 조회 중…";
      return;
    }
    setEmptyDrillVisible(true);
    lastEmptyDrillLocs = [];
    lastEmptyDrillRows = [];
    lastEmptyDrillRaw = null;
    renderEmptyDrillList([]);
    if (titleEl) {
      titleEl.textContent =
        "빈 로케이션 · " +
        String(zoneName || "") +
        (aisle ? " · 통로 " + aisle : "") +
        " (lotVolume=1 제외)";
    }
    if (statusEl) {
      statusEl.textContent =
        "bin API 조회 중…" +
        (expectedEmpty != null && expectedEmpty !== ""
          ? " (통로집계 빈 " + expectedEmpty + ")"
          : "");
    }
    emptyDrillBusy = true;
    try {
      var pack = await fetchEmptyLocationsForAisle(
        zoneName,
        aisle,
        expectedEmpty
      );
      lastEmptyDrillRows = pack.rows || [];
      lastEmptyDrillLocs = pack.locs || [];
      lastEmptyDrillRaw = {
        zone: zoneName,
        aisle: aisle,
        expectedEmpty: expectedEmpty,
        range: pack.tried,
        aggregateUpdateTime: lastUpdateTime,
        aggregateRow: aggRawByAisle[aggRawKey(zoneName, aisle)] || null,
        emptyListed: pack.locs || [],
        lots: pack.rawLots || [],
      };
      renderEmptyDrillList(lastEmptyDrillRows);
      if (statusEl) {
        var drillN = lastEmptyDrillLocs.length;
        var vol1 = pack.skippedVol1 || 0;
        var expectN =
          expectedEmpty != null && expectedEmpty !== ""
            ? parseNumber(expectedEmpty)
            : null;
        var note = "";
        if (expectN != null && isFinite(expectN) && drillN + vol1 !== expectN) {
          note =
            " · 참고: 통로집계 " +
            expectN +
            " ≠ 드릴 " +
            drillN +
            "+부피1(" +
            vol1 +
            ")";
        } else if (vol1 > 0) {
          note = " · 부피1 " + vol1 + "개 제외(집계엔 포함될 수 있음)";
        }
        statusEl.textContent =
          "빈 " +
          drillN +
          "개" +
          (expectN != null && isFinite(expectN)
            ? " · 통로집계 빈 " +
              expectN +
              (lastUpdateTime ? " (집계 기준 " + lastUpdateTime + ", 상세는 실시간)" : "")
            : "") +
          " · 스캔 " +
          (pack.scanned || 0) +
          " · 범위 " +
          (pack.tried || "-") +
          " · 재고있음 제외 " +
          (pack.skippedOccupied || 0) +
          (pack.skippedOtherAisle ? " · 다른통로 제외 " + pack.skippedOtherAisle : "") +
          note;
      }
      var card = $("#" + ROOT_ID + "-empty-drill-card");
      if (card && card.scrollIntoView) {
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } catch (eDrill) {
      if (statusEl) {
        statusEl.textContent =
          "조회 실패: " + (eDrill && eDrill.message ? eDrill.message : eDrill);
      }
      console.warn("[YAN4 Loc Consol empty drill]", eDrill);
    } finally {
      emptyDrillBusy = false;
    }
  }

  function destroyAllCharts() {
    chartInstances.forEach(function (ch) {
      try {
        ch.destroy();
      } catch (e) {}
    });
    chartInstances.length = 0;
  }

  function passageNumbersFromData(data) {
    return data.map(function (d) {
      return d["통로"] != null && String(d["통로"]).trim() !== ""
        ? String(d["통로"]).trim()
        : "";
    });
  }

  function chartTooltipTitleWithPassage(ctx, passageNumbers) {
    if (!ctx || !ctx.length || !ctx[0]) return "";
    var c = ctx[0];
    var idx = c.dataIndex;
    if (idx < 0 || idx >= passageNumbers.length) return c.label || "";
    var zone = c.label || "";
    var passage = passageNumbers[idx];
    if (passage) return [zone, "통로: " + passage];
    return zone;
  }

  function createBarPair(stockingCanvasId, relocationCanvasId, data, zoneForPalette) {
    var pal = zoneChartPalette(zoneForPalette);
    var labels = data.map(function (d) {
      return d._chartLabel || d["존"];
    });
    var passageNumbers = passageNumbersFromData(data);
    var stockingScores = data.map(function (d) {
      return d._emptyLoc;
    });
    var relocationScores = data.map(function (d) {
      return d._availableSpace;
    });
    var stockingColors = data.map(function (d) {
      return isEmptyLocRow(d) ? pal.stockHi : pal.stockLo;
    });
    var relocationColors = data.map(function (d) {
      return isRelocationTarget(d) ? pal.relocHi : pal.relocLo;
    });
    var opt = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function (ctx) {
              return chartTooltipTitleWithPassage(ctx, passageNumbers);
            },
          },
        },
      },
      scales: { y: { beginAtZero: true } },
    };
    var elS = document.getElementById(stockingCanvasId);
    var elR = document.getElementById(relocationCanvasId);
    if (!elS || !elR || typeof Chart === "undefined") return;
    chartInstances.push(
      new Chart(elS, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "비어있는 로케이션",
              data: stockingScores,
              backgroundColor: stockingColors,
              borderRadius: 8,
            },
          ],
        },
        options: opt,
      })
    );
    chartInstances.push(
      new Chart(elR, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "진열가능공간(%)",
              data: relocationScores,
              backgroundColor: relocationColors,
              borderRadius: 8,
            },
          ],
        },
        options: opt,
      })
    );
  }

  function chartPairMountHtml(stockingId, relocationId, pal) {
    var p = pal || zoneChartPalette(null);
    return (
      '<div class="chart-grid"><div class="card"><h2 class="card-title">📊 비어있는 로케이션</h2><div class="chart-wrap"><canvas id="' +
      stockingId +
      '"></canvas></div></div><div class="card"><h2 class="card-title">📊 진열가능공간(%)</h2><div class="chart-wrap"><canvas id="' +
      relocationId +
      '"></canvas></div></div></div>'
    );
  }

  function drawCharts(normalized) {
    var mount = $("#" + ROOT_ID + "-charts");
    if (!mount) return;
    if (!normalized || !normalized.length) {
      mount.innerHTML =
        '<div class="zone-empty-note">API 조회 후 그래프를 확인하세요.</div>';
      return;
    }
    destroyAllCharts();
    if (summaryQuickZone === "All") {
      var html = "";
      for (var zi = 0; zi < ZONE_ORDER.length; zi++) {
        var z = ZONE_ORDER[zi];
        var slice = normalized.filter(function (row) {
          return row._zoneType === z;
        });
        if (!slice.length) {
          html +=
            '<div class="zone-chart-section"><h2 class="zone-chart-heading" style="color:' +
            zoneTextColor(z) +
            '">' +
            zoneLabel(z) +
            ' 구역</h2><div class="zone-empty-note">이 구역에 해당하는 행이 없습니다.</div></div>';
          continue;
        }
        html +=
          '<div class="zone-chart-section"><h2 class="zone-chart-heading" style="color:' +
          zoneTextColor(z) +
          '">' +
          zoneLabel(z) +
          ' 구역</h2>' +
          chartPairMountHtml("stockingChart-" + z, "relocationChart-" + z) +
          "</div>";
      }
      mount.innerHTML = html;
      for (var zj = 0; zj < ZONE_ORDER.length; zj++) {
        var z2 = ZONE_ORDER[zj];
        var slice2 = normalized.filter(function (row) {
          return row._zoneType === z2;
        });
        if (slice2.length) {
          createBarPair(
            "stockingChart-" + z2,
            "relocationChart-" + z2,
            slice2,
            z2
          );
        }
      }
      return;
    }
    var chartRows = normalized.filter(function (row) {
      return row._zoneType === summaryQuickZone;
    });
    if (!chartRows.length) {
      mount.innerHTML =
        '<div class="zone-empty-note">선택한 구역에 맞는 그래프 데이터가 없습니다.</div>';
      return;
    }
    mount.innerHTML =
      '<div class="zone-chart-section"><h2 class="zone-chart-heading" style="color:' +
      zoneTextColor(summaryQuickZone) +
      '">' +
      zoneLabel(summaryQuickZone) +
      ' 구역</h2>' +
      chartPairMountHtml("stockingChart", "relocationChart") +
      "</div>";
    createBarPair("stockingChart", "relocationChart", chartRows, summaryQuickZone);
  }

  function drawTable(data) {
    var html = "<table><thead><tr>";
    DEFAULT_HEADERS.forEach(function (h) {
      html += "<th>" + h + "</th>";
    });
    html += "</tr></thead><tbody>";
    data.forEach(function (row) {
      html += "<tr>";
      DEFAULT_HEADERS.forEach(function (h) {
        html += "<td>" + (row[h] != null ? row[h] : "") + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    $("#" + ROOT_ID + "-table").innerHTML = html;
  }

  function renderAnalysis(rows, updateTime) {
    lastRawRows = rows;
    lastUpdateTime = updateTime || "";
    var normalized = normalizeData(rows);
    lastNormalized = normalized;
    drawKPI(normalized);
    drawSummary(normalized);
    setEmptyDrillVisible(false);
    lastEmptyDrillLocs = [];
    drawCharts(normalized);
    drawTable(rows);
    syncSummaryQuickButtonsUi();
    var meta = $("#" + ROOT_ID + "-meta");
    if (meta) {
      meta.textContent =
        "갱신: " +
        (updateTime || "-") +
        " · 통로 행 " +
        rows.length +
        "건 · 존 " +
        new Set(rows.map(function (r) { return r["존"]; })).size +
        "개";
      var staleText = aggStaleWarning(updateTime);
      if (staleText) {
        var warn = document.createElement("b");
        warn.style.cssText =
          "display:inline-block;margin-left:8px;padding:2px 8px;border-radius:6px;background:#fef2f2;color:#b91c1c;";
        warn.textContent = staleText;
        meta.appendChild(warn);
      }
    }
  }

  var AGG_STALE_HOURS = 6;

  function aggAgeHours(updateTime) {
    var m = String(updateTime || "").match(
      /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/
    );
    if (!m) return null;
    var t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
    return (Date.now() - t) / 3600000;
  }

  function aggStaleWarning(updateTime) {
    var h = aggAgeHours(updateTime);
    if (h == null || h < AGG_STALE_HOURS) return "";
    var age =
      h >= 48 ? Math.floor(h / 24) + "일" : Math.floor(h) + "시간";
    return (
      "⚠ 집계가 " +
      age +
      " 전 데이터 — 빈 로케이션·진열가능공간이 현재와 다를 수 있음 (상세보기는 실시간)"
    );
  }

  async function runFetch() {
    if (fetching) return;
    fetching = true;
    var btn = $("#" + ROOT_ID + "-fetch");
    if (btn) btn.disabled = true;
    try {
      setStatus("목록 API 조회 중…");
      await ensureChartJs();
      var listPack = await fetchZoneList();
      var zones = pickTargetZones(listPack.zones || []);
      if (!zones.length) {
        throw new Error(
          "1CP·1FP·1AP·1APR 존을 찾지 못했습니다 (목록 API 확인)"
        );
      }
      setStatus(
        "상세 수집 0/" + zones.length + " (" + TARGET_ZONE_NAMES.join("·") + ")…"
      );
      var rows = await fetchAllZoneDetails(zones, function (cur, total, name) {
        setStatus("상세 수집 " + cur + "/" + total + " (" + name + ")…");
      });
      if (!rows.length) throw new Error("상세 API에서 통로 데이터 없음");
      renderAnalysis(rows, listPack.updateTime);
      var staleMsg = aggStaleWarning(listPack.updateTime);
      setStatus(
        "완료 — 통로 " +
          rows.length +
          "행 (" +
          zones.length +
          "개 존)" +
          (staleMsg ? " · " + staleMsg : "")
      );
      setDashBtnEnabled(true);
      openModal();
    } catch (e) {
      setStatus("오류: " + (e && e.message ? e.message : String(e)));
      console.warn("[YAN4 Location Consolidation]", e);
    } finally {
      fetching = false;
      if (btn) btn.disabled = false;
    }
  }

  function injectStyles() {
    if ($("#" + ROOT_ID + "-style")) return;
    var st = document.createElement("style");
    st.id = ROOT_ID + "-style";
    st.textContent =
      "#" +
      ROOT_ID +
      "{position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.45);display:none;overflow:auto;font-family:'Segoe UI',Arial,sans-serif;}" +
      "#" +
      ROOT_ID +
      ".is-open{display:block;}" +
      "#" +
      ROOT_ID +
      " .inner{max-width:1480px;margin:0 auto;padding:20px 18px 40px;}" +
      "#" +
      ROOT_ID +
      " .toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px;}" +
      "#" +
      ROOT_ID +
      " .toolbar .btn{border:0;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:700;cursor:pointer;color:#fff;background:linear-gradient(135deg,#1d4ed8,#60a5fa);}" +
      "#" +
      ROOT_ID +
      " .toolbar .btn:disabled{opacity:.55;cursor:not-allowed;}" +
      "#" +
      ROOT_ID +
      " .toolbar .btn-close{background:#334155;}" +
      "#" +
      ROOT_ID +
      " .status{flex:1;min-width:200px;font-size:13px;color:#e2e8f0;}" +
      "#" +
      ROOT_ID +
      " .meta{font-size:12px;color:#cbd5e1;margin-bottom:12px;}" +
      "#" +
      ROOT_ID +
      " .page-title{margin:0 0 6px;font-size:28px;font-weight:800;color:#dbeafe;}" +
      "#" +
      ROOT_ID +
      " .page-subtitle{margin:0 0 16px;font-size:14px;color:#cbd5e1;}" +
      "#" +
      ROOT_ID +
      " .card{background:#fff;border-radius:16px;padding:18px;margin-bottom:16px;border:1px solid #dbeafe;border-top:4px solid #2563eb;}" +
      "#" +
      ROOT_ID +
      " .card-title{margin:0 0 12px;font-size:17px;font-weight:800;color:#123a7a;}" +
      "#" +
      ROOT_ID +
      " .kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;}" +
      "#" +
      ROOT_ID +
      " .kpi-box{background:#f8fbff;border:1px solid #dbeafe;border-radius:14px;padding:14px;}" +
      "#" +
      ROOT_ID +
      " .kpi-label{font-size:12px;color:#64748b;font-weight:700;margin-bottom:6px;}" +
      "#" +
      ROOT_ID +
      " .kpi-value{font-size:24px;font-weight:800;color:#123a7a;}" +
      "#" +
      ROOT_ID +
      " .kpi-sub{margin-top:6px;font-size:11px;font-weight:700;line-height:1.35;color:#64748b;}" +
      "#" +
      ROOT_ID +
      " .summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;}" +
      "#" +
      ROOT_ID +
      " .summary-panel{border-radius:14px;padding:16px;background:#f8fbff;border:1px solid #dbeafe;max-height:420px;overflow:auto;}" +
      "#" +
      ROOT_ID +
      " .summary-panel.stocking{border-left:5px solid #16a34a;}" +
      "#" +
      ROOT_ID +
      " .summary-panel.relocation{border-left:5px solid #f59e0b;}" +
      "#" +
      ROOT_ID +
      " .summary-panel h3{margin:0 0 10px;font-size:18px;color:#123a7a;}" +
      "#" +
      ROOT_ID +
      " .summary-item{display:flex;justify-content:space-between;gap:8px;padding:10px 12px;margin-bottom:8px;background:#fff;border-radius:10px;border:1px solid #e2e8f0;font-size:13px;}" +
      "#" +
      ROOT_ID +
      " .summary-item--drill{cursor:pointer;transition:background .12s,border-color .12s;}" +
      "#" +
      ROOT_ID +
      " .summary-item--drill:hover{background:#ecfdf5;border-color:#86efac;}" +
      "#" +
      ROOT_ID +
      " .empty-drill-list{max-height:320px;overflow:auto;border:1px solid #dbeafe;border-radius:12px;background:#f8fbff;}" +
      "#" +
      ROOT_ID +
      " .empty-drill-row{display:flex;justify-content:space-between;gap:12px;padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;}" +
      "#" +
      ROOT_ID +
      " .empty-drill-row--head{color:#64748b;font-size:11px;background:#f1f5f9;position:sticky;top:0;}" +
      "#" +
      ROOT_ID +
      " .empty-drill-name{font-family:Consolas,'Courier New',monospace;}" +
      "#" +
      ROOT_ID +
      " .empty-drill-vol{font-variant-numeric:tabular-nums;color:#334155;min-width:40px;text-align:right;}" +
      "#" +
      ROOT_ID +
      " .empty-drill-row:last-child{border-bottom:0;}" +
      "#" +
      ROOT_ID +
      " .empty-drill-empty{padding:16px;color:#64748b;font-size:13px;}" +
      "#" +
      ROOT_ID +
      " .summary-left{font-weight:800;min-width:0;}" +
      "#" +
      ROOT_ID +
      " .summary-right{color:#334155;white-space:nowrap;font-size:12px;}" +
      "#" +
      ROOT_ID +
      " .summary-card-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px;}" +
      "#" +
      ROOT_ID +
      " .avail-min-ctl{display:inline-flex;align-items:center;gap:8px;margin-left:auto;font-size:12px;font-weight:700;color:#334155;}" +
      " .avail-min-ctl input{width:160px;accent-color:#2563eb;cursor:pointer;}" +
      " .avail-min-ctl b{min-width:40px;color:#1d4ed8;}" +
      " .summary-qbtn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:700;cursor:pointer;}" +
      "#" +
      ROOT_ID +
      " .summary-qbtn.active{background:#2563eb;border-color:#2563eb;color:#fff;}" +
      "#" +
      ROOT_ID +
      " .chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}" +
      " .chart-wrap{height:280px;}" +
      "#" +
      ROOT_ID +
      " .table-wrap{overflow:auto;max-height:420px;border:1px solid #dbeafe;border-radius:12px;}" +
      "#" +
      ROOT_ID +
      " table{width:100%;border-collapse:collapse;font-size:12px;}" +
      "#" +
      ROOT_ID +
      " th{position:sticky;top:0;background:#123a7a;color:#fff;padding:8px;}" +
      "#" +
      ROOT_ID +
      " td{border-bottom:1px solid #e5e7eb;padding:7px;text-align:center;}" +
      "@media(max-width:1000px){#" +
      ROOT_ID +
      " .summary-grid,#" +
      ROOT_ID +
      " .chart-grid{grid-template-columns:1fr;}}";
    document.head.appendChild(st);
  }

  function bindSummaryButtons(root) {
    root.querySelectorAll(".summary-qbtn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var z = btn.getAttribute("data-sum-zone");
        if (!z) return;
        summaryQuickZone = z;
        syncSummaryQuickButtonsUi();
        if (lastSummaryData) drawSummary(lastSummaryData);
        if (lastNormalized) drawCharts(lastNormalized);
      });
    });
    var slider = root.querySelector("#" + ROOT_ID + "-avail-min");
    var sliderVal = root.querySelector("#" + ROOT_ID + "-avail-min-val");
    if (slider) {
      slider.value = String(consolAvailMin);
      if (sliderVal) sliderVal.textContent = consolAvailMin + "%";
      slider.addEventListener("input", function () {
        var n = Math.min(100, Math.max(0, Math.round(Number(slider.value) || 0)));
        saveConsolAvailMin(n);
        if (sliderVal) sliderVal.textContent = n + "%";
        if (lastNormalized) drawKPI(lastNormalized);
        if (lastSummaryData) drawSummary(lastSummaryData);
      });
    }
  }

  function ensureModalDom() {
    injectStyles();
    var existing = $("#" + ROOT_ID);
    if (existing) {
      if (existing.getAttribute("data-yna4-loc-consol-ui-rev") === LOC_UI_REV) {
        return;
      }
      try {
        existing.parentNode && existing.parentNode.removeChild(existing);
      } catch (eRm) {}
      var oldStyle = $("#" + ROOT_ID + "-style");
      if (oldStyle && oldStyle.parentNode) {
        try {
          oldStyle.parentNode.removeChild(oldStyle);
        } catch (eSt) {}
      }
      injectStyles();
    }
    var root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("data-yna4-loc-consol-ui-rev", LOC_UI_REV);
    root.innerHTML =
      '<div class="inner">' +
      '<div class="toolbar">' +
      '<button type="button" class="btn" id="' +
      ROOT_ID +
      '-fetch">다시 조회</button>' +
      '<button type="button" class="btn btn-close" id="' +
      ROOT_ID +
      '-close">닫기</button>' +
      '<div class="status" id="' +
      ROOT_ID +
      '-status">inventory 로그인 후 조회를 실행하세요.</div>' +
      "</div>" +
      '<h1 class="page-title">YAN4 IB CONSOLIDATION</h1>' +
      '<p class="page-subtitle">전 존·통로 API 수집 — 클립보드/새 탭 없음</p>' +
      '<div class="meta" id="' +
      ROOT_ID +
      '-meta"></div>' +
      '<div class="card"><h2 class="card-title">📊 주요 지표</h2><div class="kpi-grid" id="' +
      ROOT_ID +
      '-kpi"></div></div>' +
      '<div class="card"><div class="summary-card-head"><h2 class="card-title">🎯 작업 우선순위 요약</h2>' +
      '<div class="summary-quick-btns"><button type="button" class="summary-qbtn active" data-sum-zone="All">전체</button>' +
      '<button type="button" class="summary-qbtn" data-sum-zone="CP">냉장</button>' +
      '<button type="button" class="summary-qbtn" data-sum-zone="FP">냉동</button>' +
      '<button type="button" class="summary-qbtn" data-sum-zone="AP">상온</button>' +
      '<button type="button" class="summary-qbtn" data-sum-zone="APR">로켓</button></div>' +
      '<label class="avail-min-ctl" title="콘솔 우선 목록 기준 — 진열가능공간 이 값 이상인 통로만">콘솔 기준 진열가능 ≥ ' +
      '<input type="range" min="0" max="100" step="5" id="' +
      ROOT_ID +
      '-avail-min">' +
      '<b id="' +
      ROOT_ID +
      '-avail-min-val"></b></label></div>' +
      '<div class="summary-grid" id="' +
      ROOT_ID +
      '-summary"></div></div>' +
      '<div class="card" id="' +
      ROOT_ID +
      '-empty-drill-card" style="display:none">' +
      '<div class="summary-card-head"><h2 class="card-title" id="' +
      ROOT_ID +
      '-empty-drill-title">빈 로케이션 상세</h2>' +
      '<button type="button" class="summary-qbtn" id="' +
      ROOT_ID +
      '-empty-drill-copy">복사</button>' +
      '<button type="button" class="summary-qbtn" id="' +
      ROOT_ID +
      '-empty-drill-raw" title="이 통로의 bin API 원본 데이터 복사 (원인 분석용)">원본복사</button>' +
      '<button type="button" class="summary-qbtn" id="' +
      ROOT_ID +
      '-empty-drill-close">닫기</button></div>' +
      '<div class="meta" id="' +
      ROOT_ID +
      '-empty-drill-status"></div>' +
      '<div class="empty-drill-list" id="' +
      ROOT_ID +
      '-empty-drill-list"></div></div>' +
      '<div class="card"><h2 class="card-title">📊 구역별 그래프</h2><div id="' +
      ROOT_ID +
      '-charts"></div></div>' +
      '<div class="card"><h2 class="card-title">📋 원본 데이터</h2><div class="table-wrap" id="' +
      ROOT_ID +
      '-table"></div></div>' +
      "</div>";
    document.body.appendChild(root);
    $("#" + ROOT_ID + "-fetch").addEventListener("click", runFetch);
    $("#" + ROOT_ID + "-close").addEventListener("click", closeModal);
    var copyBtn = $("#" + ROOT_ID + "-empty-drill-copy");
    var closeDrillBtn = $("#" + ROOT_ID + "-empty-drill-close");
    if (copyBtn) {
      copyBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        copyEmptyDrillLocs(copyBtn);
      });
    }
    var rawBtn = $("#" + ROOT_ID + "-empty-drill-raw");
    if (rawBtn) {
      rawBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        copyEmptyDrillRaw(rawBtn);
      });
    }
    if (closeDrillBtn) {
      closeDrillBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        setEmptyDrillVisible(false);
      });
    }
    root.addEventListener("click", function (e) {
      if (e.target === root) closeModal();
      var hit =
        e.target && e.target.closest
          ? e.target.closest(".summary-item--drill")
          : null;
      if (!hit || !root.contains(hit)) return;
      e.preventDefault();
      e.stopPropagation();
      void openEmptyLocDrill(
        hit.getAttribute("data-zone"),
        hit.getAttribute("data-aisle"),
        hit.getAttribute("data-empty")
      );
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && root.classList.contains("is-open")) closeModal();
    });
    bindSummaryButtons(root);
  }

  window.__YAN4_INIT_LOCATION_CONSOLIDATION_PANE__ = function (hostEl) {
    if (!hostEl) return;
    hostEl.textContent = "";
    hostEl.className = "yna4-pane-mod yna4-pane-mod--loc-consol";
    hostEl.setAttribute("data-yna4-loc-consol-ui-rev", LOC_UI_REV);

    ensureModalDom();

    var actions = document.createElement("div");
    actions.className = "yna4-pane-actions";

    var btnRun = document.createElement("button");
    btnRun.type = "button";
    btnRun.className = "yna4-pane-btn yna4-pane-btn--primary";
    btnRun.textContent = "조회 실행";
    btnRun.title = "inventory API로 전 존·통로 수집 후 대시보드 모달 열기";

    var btnDash = document.createElement("button");
    btnDash.type = "button";
    btnDash.className = "yna4-pane-btn";
    btnDash.textContent = "대시보드";
    btnDash.disabled = true;
    btnDash.title = "마지막 조회 결과 대시보드 다시 열기";
    paneDashBtn = btnDash;

    actions.appendChild(btnRun);
    actions.appendChild(btnDash);

    paneStatusEl = document.createElement("div");
    paneStatusEl.className = "yna4-pane-status";
    paneStatusEl.textContent = "조회 실행 — API 수집 후 모달 자동 표시";

    hostEl.appendChild(actions);
    hostEl.appendChild(paneStatusEl);

    btnRun.addEventListener("click", function (ev) {
      ev.preventDefault();
      void runFetch();
    });
    btnDash.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (lastRawRows && lastRawRows.length) {
        renderAnalysis(lastRawRows, lastUpdateTime);
        openModal();
      }
    });

    if (lastRawRows && lastRawRows.length) {
      setDashBtnEnabled(true);
    }
  };
})();
