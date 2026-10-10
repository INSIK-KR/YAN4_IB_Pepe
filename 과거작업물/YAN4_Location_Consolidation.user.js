// ==UserScript==
// @name         YAN4 Location Consolidation (API)
// @namespace    yna4-location-consolidation
// @version      0.1.1
// @description  inventory 로케이션 capacity API 전 존·통로 수집 + CONSOLIDATION 대시보드 (새 탭/클립보드 없음)
// @match        https://inventory.coupang.com/storagecapacity/v3/location*
// @grant        GM_xmlhttpRequest
// @connect      inventory.coupang.com
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  var ROOT_ID = "yna4-loc-consolidation-root";
  var CHART_JS =
    "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js";
  var API_LIST =
    "https://inventory.coupang.com/async/v3/storagecapacity/location-capacity/list";
  var API_DETAIL =
    "https://inventory.coupang.com/async/v3/storagecapacity/location-capacity/detail/list";
  var LIST_BODY = {
    floors: ["1.1", "1.2", "2.1", "2.2"],
    zoneType: null,
    zoneName: null,
  };
  var DETAIL_DELAY_MS = 120;
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
  var fetching = false;

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

  function apiItemToRow(item) {
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

  function isStockingTarget(row) {
    return row._emptyLoc >= 1 && row._availableSpace >= 60;
  }

  function isRelocationTarget(row) {
    return row._emptyLoc <= 1 && row._availableSpace >= 60;
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
    var el = $("#" + ROOT_ID + "-status");
    if (el) el.textContent = msg;
  }

  function ensureChartJs() {
    return new Promise(function (resolve, reject) {
      if (typeof Chart !== "undefined") {
        resolve();
        return;
      }
      var s = document.createElement("script");
      s.src = CHART_JS;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Chart.js 로드 실패"));
      };
      document.head.appendChild(s);
    });
  }

  function drawKPI(data) {
    var stockingTargets = data.filter(isStockingTarget);
    var relocationTargets = data.filter(isRelocationTarget);
    var totalEmpty = data.reduce(function (sum, row) {
      return sum + row._emptyLoc;
    }, 0);
    var avgAvailable =
      data.length === 0
        ? "0.0"
        : (
            data.reduce(function (sum, row) {
              return sum + row._availableSpace;
            }, 0) / data.length
          ).toFixed(1);

    $("#" + ROOT_ID + "-kpi").innerHTML =
      '<div class="kpi-box"><div class="kpi-label">진열 작업 대상</div><div class="kpi-value">' +
      stockingTargets.length +
      '</div></div><div class="kpi-box"><div class="kpi-label">콘솔 대상</div><div class="kpi-value">' +
      relocationTargets.length +
      '</div></div><div class="kpi-box"><div class="kpi-label">전체 빈 로케이션</div><div class="kpi-value">' +
      totalEmpty +
      '</div></div><div class="kpi-box"><div class="kpi-label">평균 진열가능공간</div><div class="kpi-value">' +
      avgAvailable +
      "%</div></div>";
  }

  function summaryTopRowsHtml(stockingTop, relocationTop) {
    var stockingBlock = stockingTop.length
      ? stockingTop
          .map(function (d) {
            return (
              '<div class="summary-item"><div class="summary-left"><span style="color:' +
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
      : '<div class="summary-item"><div class="summary-left">대상 없음</div><div class="summary-right">조건 충족 구간 없음</div></div>';
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
              ')</span></div><div class="summary-right">빈 로케이션 ' +
              d._emptyLoc +
              " / 진열가능공간 " +
              d._availableSpace +
              "%</div></div>"
            );
          })
          .join("")
      : '<div class="summary-item"><div class="summary-left">대상 없음</div><div class="summary-right">조건 충족 구간 없음</div></div>';
    return (
      '<div class="summary-panel stocking"><h3>📦 비어있는 로케이션 TOP5</h3>' +
      stockingBlock +
      '</div><div class="summary-panel relocation"><h3>🔄 콘솔 작업 우선 TOP5</h3>' +
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
      .filter(isStockingTarget)
      .slice()
      .sort(function (a, b) {
        return b._stockingScore - a._stockingScore;
      })
      .slice(0, 5);
    var relocationTop = slice
      .slice()
      .sort(function (a, b) {
        return b._relocationScore - a._relocationScore;
      })
      .slice(0, 5);
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

  function drawComment(data) {
    var stockingTop = data
      .filter(isStockingTarget)
      .slice()
      .sort(function (a, b) {
        return b._stockingScore - a._stockingScore;
      })
      .slice(0, 3);
    var relocationTop = data
      .slice()
      .sort(function (a, b) {
        return b._relocationScore - a._relocationScore;
      })
      .slice(0, 3);
    var cpData = data.filter(function (d) {
      return d._zoneType === "CP";
    });
    var fpData = data.filter(function (d) {
      return d._zoneType === "FP";
    });
    var cpTop = cpData
      .slice()
      .sort(function (a, b) {
        return b._stockingScore - a._stockingScore;
      })
      .slice(0, 3);
    var fpTop = fpData
      .slice()
      .sort(function (a, b) {
        return b._stockingScore - a._stockingScore;
      })
      .slice(0, 3);
    var html = "";
    if (stockingTop.length) {
      html +=
        "<strong>비어있는 로케이션:</strong> " +
        stockingTop
          .map(function (d) {
            return (
              d["존"] +
              (d["통로"] ? " T" + d["통로"] : "") +
              "(" +
              d._emptyLoc +
              "개 / " +
              d._availableSpace +
              "%)"
            );
          })
          .join(", ") +
        "<br>";
    } else {
      html +=
        "<strong>비어있는 로케이션:</strong> 현재 기준상 두드러지는 비어있는 로케이션 구간은 없습니다.<br>";
    }
    if (relocationTop.length) {
      html +=
        "<strong>콘솔 작업 우선 구간:</strong> " +
        relocationTop
          .map(function (d) {
            return (
              d["존"] +
              (d["통로"] ? " T" + d["통로"] : "") +
              "(" +
              d._emptyLoc +
              "개 / " +
              d._availableSpace +
              "%)"
            );
          })
          .join(", ") +
        "<br>";
    } else {
      html +=
        "<strong>콘솔 작업 우선 구간:</strong> 표시할 데이터가 없습니다.<br>";
    }
    html +=
      "<br><strong>냉장 그룹 (" +
      cpData.length +
      "행) 최상위:</strong> " +
      (cpTop.length
        ? cpTop
            .map(function (d) {
              return d["존"] + "(" + d._emptyLoc + ", " + d._availableSpace + "%)";
            })
            .join(", ")
        : "대상 없음") +
      ".<br>";
    html +=
      "<strong>냉동 그룹 (" +
      fpData.length +
      "행) 최상위:</strong> " +
      (fpTop.length
        ? fpTop
            .map(function (d) {
              return d["존"] + "(" + d._emptyLoc + ", " + d._availableSpace + "%)";
            })
            .join(", ")
        : "대상 없음") +
      ".<br><br>";
    html +=
      "<strong>권장 운영 방향:</strong> 빈 로케이션이 존재하면서 진열가능공간이 높은 구간에는 진열 인력을 우선 투입하고, 빈 로케이션이 부족하지만 진열가능공간이 넉넉한 구간에는 콘솔 작업자를 투입해 추가 빈 로케이션을 확보하는 방향으로 운영합니다.";
    $("#" + ROOT_ID + "-comment").innerHTML = html;
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
      return d._stockingScore;
    });
    var relocationScores = data.map(function (d) {
      return d._relocationScore;
    });
    var stockingColors = data.map(function (d) {
      return isStockingTarget(d) ? pal.stockHi : pal.stockLo;
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
              label: "콘솔 작업 우선도",
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
      '"></canvas></div></div><div class="card"><h2 class="card-title">📊 콘솔 작업 우선 구간</h2><div class="chart-wrap"><canvas id="' +
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
    var normalized = normalizeData(rows);
    lastNormalized = normalized;
    drawKPI(normalized);
    drawSummary(normalized);
    drawComment(normalized);
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
    }
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
      var zones = listPack.zones || [];
      if (!zones.length) throw new Error("목록 API에 존 데이터 없음");
      setStatus("전 존 상세 수집 0/" + zones.length + "…");
      var rows = await fetchAllZoneDetails(zones, function (cur, total, name) {
        setStatus("상세 수집 " + cur + "/" + total + " (" + name + ")…");
      });
      if (!rows.length) throw new Error("상세 API에서 통로 데이터 없음");
      renderAnalysis(rows, listPack.updateTime);
      setStatus("완료 — 통로 " + rows.length + "행 (" + zones.length + "개 존)");
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
      "{position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,.45);display:none;overflow:auto;font-family:'Segoe UI',Arial,sans-serif;}" +
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
      " .summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;}" +
      "#" +
      ROOT_ID +
      " .summary-panel{border-radius:14px;padding:16px;background:#f8fbff;border:1px solid #dbeafe;}" +
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
      " .summary-left{font-weight:800;min-width:0;}" +
      "#" +
      ROOT_ID +
      " .summary-right{color:#334155;white-space:nowrap;font-size:12px;}" +
      "#" +
      ROOT_ID +
      " .summary-card-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px;}" +
      "#" +
      ROOT_ID +
      " .summary-qbtn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:700;cursor:pointer;}" +
      "#" +
      ROOT_ID +
      " .summary-qbtn.active{background:#2563eb;border-color:#2563eb;color:#fff;}" +
      "#" +
      ROOT_ID +
      " .comment-box{background:linear-gradient(135deg,#123a7a,#2563eb);color:#fff;border-radius:14px;padding:16px;line-height:1.7;font-size:14px;}" +
      "#" +
      ROOT_ID +
      " .chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}" +
      "#" +
      ROOT_ID +
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
      "#" +
      ROOT_ID +
      "-launcher{position:fixed;right:14px;bottom:14px;z-index:999998;border:0;border-radius:999px;padding:10px 14px;font-size:13px;font-weight:800;color:#fff;background:#0f4c8a;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2);}" +
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
  }

  function ensureUi() {
    injectStyles();
    if (!$("#" + ROOT_ID + "-launcher")) {
      var launcher = document.createElement("button");
      launcher.id = ROOT_ID + "-launcher";
      launcher.type = "button";
      launcher.textContent = "CONSOL";
      launcher.title = "YAN4 Location Consolidation (API)";
      launcher.addEventListener("click", function () {
        var root = $("#" + ROOT_ID);
        if (root) root.classList.add("is-open");
      });
      document.body.appendChild(launcher);
    }
    if ($("#" + ROOT_ID)) return;
    var root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML =
      '<div class="inner">' +
      '<div class="toolbar">' +
      '<button type="button" class="btn" id="' +
      ROOT_ID +
      '-fetch">API 전체 조회</button>' +
      '<button type="button" class="btn btn-close" id="' +
      ROOT_ID +
      '-close">닫기</button>' +
      '<div class="status" id="' +
      ROOT_ID +
      '-status">inventory 로그인 후 「API 전체 조회」를 누르세요.</div>' +
      "</div>" +
      '<h1 class="page-title">YAN4 IB CONSOLIDATION</h1>' +
      '<p class="page-subtitle">전 존·통로 API 수집 — 새 탭/클립보드 없음 (Location_HAN 분석 기준)</p>' +
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
      '<button type="button" class="summary-qbtn" data-sum-zone="APR">로켓</button></div></div>' +
      '<div class="summary-grid" id="' +
      ROOT_ID +
      '-summary"></div></div>' +
      '<div class="card"><h2 class="card-title">📝 자동 보고 코멘트</h2><div class="comment-box" id="' +
      ROOT_ID +
      '-comment">API 조회 후 자동 생성됩니다.</div></div>' +
      '<div class="card"><h2 class="card-title">📊 구역별 그래프</h2><div id="' +
      ROOT_ID +
      '-charts"></div></div>' +
      '<div class="card"><h2 class="card-title">📋 원본 데이터</h2><div class="table-wrap" id="' +
      ROOT_ID +
      '-table"></div></div>' +
      "</div>";
    document.body.appendChild(root);
    $("#" + ROOT_ID + "-fetch").addEventListener("click", runFetch);
    $("#" + ROOT_ID + "-close").addEventListener("click", function () {
      root.classList.remove("is-open");
    });
    bindSummaryButtons(root);
  }

  ensureUi();
})();
