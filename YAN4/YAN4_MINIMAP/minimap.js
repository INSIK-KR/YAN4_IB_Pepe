(function () {
  "use strict";

  var LOC_RE = /^1007-(1CP\d+|1C\d+)-(\d+)-(.+)$/i;
  var Core = window.ChamberLayoutCore;
  var api = window.yan4Minimap;

  if (!api || api.isElectron !== true) {
    document.body.innerHTML =
      "<p style=\"font-family:system-ui;padding:1.25rem;background:#151b26;color:#d8e2f0;\">" +
      "미니맵은 <strong>Electron</strong>(<code>npm start</code>)에서만 실행됩니다.</p>";
    return;
  }
  if (!Core) {
    document.body.innerHTML =
      "<p style=\"padding:1rem;color:#f88;\">chamber-layout-core.js 없음</p>";
    return;
  }

  var state = {
    layout: null,
    chamberJson: null,
    fileName: "chamber-layout.json",
    cellSize: 32,
    gutter: 0,
    usageMap: null,
    capacityRange: { min: 0, max: 100 },
    apiMeta: null,
    fetching: false,
    placing: false,
    guidePngUrl: "",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function zoneClass(zone) {
    var z = String(zone || "").toUpperCase();
    if (z.indexOf("1CP") === 0) return "zone-1cp";
    if (z.indexOf("1C") === 0) return "zone-1c";
    return "zone-other";
  }

  function parseLocation(text) {
    var m = String(text).match(LOC_RE);
    if (!m) return { text: text, zone: "", aisle: "", row: "", slot: "" };
    var zone = m[1].toUpperCase();
    var aisle = zone.replace(/^1CP/i, "").replace(/^1C/i, "");
    return { text: text, zone: zone, aisle: aisle, row: m[2], slot: m[3] };
  }

  function ensureApiBoxes() {
    if (!state.chamberJson) return;
    if (!state.chamberJson.apiBoxes) state.chamberJson.apiBoxes = [];
  }

  function toPlaceDraft() {
    var text = String(($("placeText") && $("placeText").value) || "").trim();
    var w = parseInt(($("placeW") && $("placeW").value) || "1", 10);
    var h = parseInt(($("placeH") && $("placeH").value) || "1", 10);
    if (!text) return null;
    if (w < 1 || !isFinite(w)) w = 1;
    if (h < 1 || !isFinite(h)) h = 1;
    var parsed = parseLocation(text);
    return {
      text: text,
      zone: parsed.zone || "",
      row: parsed.row || "",
      w: w,
      h: h,
    };
  }

  function boxUsageKey(box) {
    var zone = String(box.zone || "")
      .trim()
      .toUpperCase();
    var row = String(box.row == null ? "" : box.row).trim();
    if (!zone || !row) return "";
    return "1007-" + zone + "-" + row;
  }

  function colorForGoodness(goodness, range) {
    if (goodness == null || !isFinite(goodness)) return "";
    var min = range.min;
    var max = range.max;
    if (max <= min) max = min + 1;
    var t = Math.max(0, Math.min(1, 1 - (goodness - min) / (max - min)));
    if (t <= 0.5) {
      var g = Math.round(34 + (234 - 34) * (t * 2));
      return "rgb(34," + g + ",94)";
    }
    var r = Math.round(234 + (239 - 234) * ((t - 0.5) * 2));
    var y = Math.round(179 - (179 - 68) * ((t - 0.5) * 2));
    return "rgb(" + r + "," + y + ",68)";
  }

  function computeCapacityRange(map) {
    if (!map) return { min: 0, max: 100 };
    var vals = Object.keys(map)
      .map(function (k) {
        return map[k] && map[k].goodness;
      })
      .filter(function (v) {
        return v != null && isFinite(v);
      });
    if (!vals.length) return { min: 0, max: 100 };
    return { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
  }

  function boxRateLabel(cap) {
    if (!cap) return "";
    var empty = cap.emptyLots != null ? String(Math.round(cap.emptyLots)) : "-";
    var avail =
      cap.availableSpace != null
        ? Math.round(cap.availableSpace) + "%"
        : cap.displayAvailable || "-";
    return "빈" + empty + "·" + avail;
  }

  function getBoxUsage(box) {
    if (!state.usageMap) return null;
    return state.usageMap[boxUsageKey(box)] || null;
  }

  function boxDeck(box) {
    var z = String(box.zone || "").toUpperCase();
    if (z.indexOf("1CP") === 0) return "south";
    if (z.indexOf("1C") === 0) return "north";
    return "north";
  }

  function layoutHasContent(layout) {
    if (!layout) return false;
    if (layout.rows > 0 && layout.cols > 0) return true;
    return !!(
      layout.baseMap ||
      (layout.floorTiles && layout.floorTiles.length) ||
      (layout.sprites && layout.sprites.length) ||
      (layout.markers && layout.markers.length) ||
      (layout.boxes && layout.boxes.length)
    );
  }

  function backgroundEnabled(layout) {
    return !!(layout && layout.background && layout.background.enabled === true);
  }

  function floorBackgroundStyle(layout) {
    var Catalog = window.Yan4AssetCatalog;
    if (Catalog && layout && layout.background) {
      var customBg = Catalog.backgroundStyle(layout.background, state.cellSize);
      if (customBg) return customBg;
    }
    var Stamps = window.Yan4StampRegistry;
    if (Stamps && Stamps.isSheetReady()) {
      if (layout.background && layout.background.col != null && Stamps.bakeFloorRepeatTile) {
        Stamps.bakeFloorRepeatTile(layout.background);
      }
      return Stamps.floorRepeatStyle(state.cellSize);
    }
    return "";
  }

  function spriteImageStyle(assetId) {
    var Catalog = window.Yan4AssetCatalog;
    if (Catalog && assetId) {
      return Catalog.spriteLayerStyle(assetId, state.cellSize);
    }
    return "";
  }

  function baseMapStyle(layout) {
    if (state.guidePngUrl) {
      return (
        "background-image:url('" +
        String(state.guidePngUrl).replace(/'/g, "%27") +
        "');background-size:100% 100%;background-repeat:no-repeat;background-position:0 0;"
      );
    }
    var Catalog = window.Yan4AssetCatalog;
    if (!Catalog || !layout || !layout.baseMap) return "";
    return Catalog.baseMapLayerStyle(layout.baseMap, state.cellSize, layout.cols, layout.rows);
  }

  function markerKindClass(mk) {
    var k = mk.kind || "";
    if (k === "entrance") return "floor-marker--entrance";
    if (k === "pillar") return "floor-marker--pillar";
    if (k === "zone-green") return "floor-marker--zone-green";
    if (k === "mezzanine") return "floor-marker--mezzanine";
    if (k === "nys-zone") return "floor-marker--nys";
    var t = String(mk.text || "");
    if (/챔버입구/.test(t)) return "floor-marker--entrance";
    if (/기둥/.test(t)) return "floor-marker--pillar";
    if (/원복존|적재함/.test(t)) return "floor-marker--zone-green";
    if (/메자닌|리프트/.test(t)) return "floor-marker--mezzanine";
    if (/NYS|WMS|대기존/.test(t)) return "floor-marker--nys";
    return "";
  }

  function buildColTracks(cols) {
    var cell = state.cellSize;
    var out = [];
    var c;
    for (c = 0; c < cols; c++) out.push(cell + "px");
    return out.join(" ");
  }

  function buildRowTracks(rows) {
    var out = [];
    var r;
    for (r = 0; r < rows; r++) out.push(state.cellSize + "px");
    return out.join(" ");
  }

  function renderSpatialGrid(layout) {
    var html = "";
    html += '<div class="block-map excel-map block-map--pixel-floor" style="';
    html += "--map-gutter:" + state.gutter + "px;";
    html += "--map-cell:" + state.cellSize + "px;";
    html += "--rate-fs:" + Math.max(7, Math.round(state.cellSize * 0.22)) + "px;";
    html += "grid-template-columns:" + buildColTracks(layout.cols) + ";";
    html += "grid-template-rows:" + buildRowTracks(layout.rows) + ";";
    html += '">';

    if (backgroundEnabled(layout)) {
      var floorBg = floorBackgroundStyle(layout);
      html +=
        '<div class="map-floor-bg map-floor-bg--custom" style="grid-column:1 / -1;grid-row:1 / -1;' +
        floorBg +
        '"></div>';
    } else {
      html +=
        '<div class="map-floor-bg map-floor-bg--white" style="grid-column:1 / -1;grid-row:1 / -1;"></div>';
    }

    var baseBg = baseMapStyle(layout);
    if (baseBg) {
      html +=
        '<div class="map-base-map" style="grid-column:1 / -1;grid-row:1 / -1;z-index:1;' +
        baseBg +
        '"></div>';
    }

    var Stamps = window.Yan4StampRegistry;
    var kenneyOn = Stamps && Stamps.isSheetReady();
    (layout.floorTiles || []).forEach(function (tile) {
      var gridStyle =
        "grid-column:" + (tile.c + 1) + " / span " + tile.w + ";" +
        "grid-row:" + (tile.r + 1) + " / span " + tile.h + ";";
      var paintStyle = "";
      if (tile.asset) {
        paintStyle = spriteImageStyle(tile.asset);
      } else if (kenneyOn) {
        var sid =
          tile.tileSetId ||
          (Stamps.KENNEY_ID != null ? Stamps.KENNEY_ID : "kenney");
        if (tile.tileCol != null && tile.tileRow != null) {
          paintStyle = Stamps.stampTileStyleForSheet(sid, tile.tileCol, tile.tileRow, state.cellSize);
        } else {
          paintStyle = Stamps.stampTileStyle(tile.kind, state.cellSize);
        }
      }
      var cls =
        "floor-tile floor-tile--" + (tile.kind || "tile") +
        (paintStyle ? (tile.asset ? " floor-tile--png" : " floor-tile--kenney") : "");
      html += '<div class="' + cls + '" style="' + gridStyle + paintStyle + '"></div>';
    });

    (layout.sprites || []).forEach(function (sp) {
      var spStyle = spriteImageStyle(sp.asset);
      html +=
        '<div class="map-sprite" title="' + escapeHtml(sp.label || sp.asset || "") + '" style="' +
        "grid-column:" + (sp.c + 1) + " / span " + sp.w + ";" +
        "grid-row:" + (sp.r + 1) + " / span " + sp.h + ";" +
        "z-index:" + (2 + (sp.z || 0)) + ";" +
        spStyle +
        '"></div>';
    });

    (layout.boxes || []).forEach(function (box, idx) {
      var cap = getBoxUsage(box);
      var goodness = cap ? cap.goodness : null;
      var bg = goodness != null ? colorForGoodness(goodness, state.capacityRange) : "";
      var style =
        "grid-column:" + (box.c + 1) + " / span " + box.w + ";" +
        "grid-row:" + (box.r + 1) + " / span " + box.h + ";";
      if (bg) style += "background:" + bg + ";color:#0f172a;";
      var deck = boxDeck(box);
      html +=
        '<button type="button" class="excel-box map-block deck-' + deck + " " +
        zoneClass(box.zone) + (bg ? "" : " map-block--no-api") +
        '" data-idx="' + idx + '" style="' + style + '" title="' + escapeHtml(box.text || "") + '">';
      if (cap) {
        html += '<span class="excel-box-rate">' + escapeHtml(boxRateLabel(cap)) + "</span>";
      }
      html += "</button>";
    });

    (layout.markers || []).forEach(function (mk) {
      var cls = "floor-marker " + markerKindClass(mk);
      html +=
        '<div class="' + cls.trim() + '" title="' + escapeHtml(mk.text || "") + '" style="' +
        "grid-column:" + (mk.c + 1) + " / span " + mk.w + ";" +
        "grid-row:" + (mk.r + 1) + " / span " + mk.h + ";" +
        '">' +
        escapeHtml(mk.text || "") +
        "</div>";
    });

    html += "</div>";
    return html;
  }

  function renderFloorplan(layout) {
    return (
      '<div class="warehouse-floorplan">' +
      '<div class="pixel-frame">' +
      '<div class="pixel-frame__corner pixel-frame__corner--tl"></div>' +
      '<div class="pixel-frame__corner pixel-frame__corner--tr"></div>' +
      '<div class="pixel-frame__corner pixel-frame__corner--bl"></div>' +
      '<div class="pixel-frame__corner pixel-frame__corner--br"></div>' +
      '<div class="floorplan-map-shell">' +
      renderSpatialGrid(layout) +
      "</div></div></div>"
    );
  }

  function countAisles(json) {
    return (json.aisles && json.aisles.length) || 0;
  }

  function countShelfSegs(json) {
    var n = 0;
    if (json.variable && json.variable.shelf) n += json.variable.shelf.segments.length;
    (json.aisles || []).forEach(function (a) {
      if (a.north && a.north.segments) n += a.north.segments.length;
    });
    return n;
  }

  function countPalletSegs(json) {
    var n = 0;
    if (json.variable && json.variable.pallet) n += json.variable.pallet.segments.length;
    (json.aisles || []).forEach(function (a) {
      if (a.south && a.south.segments) n += a.south.segments.length;
    });
    return n;
  }

  function render() {
    var viewport = $("viewport");
    if (!layoutHasContent(state.layout)) {
      viewport.innerHTML =
        '<p class="hint"><strong>chamber-layout.json</strong> 없음.<br>' +
        "앱 폴더에 두거나 JSON 불러오기 · <code>npm run import-layout</code></p>";
      $("statusText").textContent = "레이아웃 대기";
      $("metaBox").innerHTML = "chamber-layout.json 필요";
      return;
    }

    state.layout.boxes.forEach(function (b, i) {
      b._idx = i;
      if (!b.zone && b.text) Object.assign(b, parseLocation(b.text));
    });

    viewport.innerHTML = renderFloorplan(state.layout);

    viewport.querySelectorAll(".excel-box").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (state.placing) {
          var idxDel = parseInt(btn.getAttribute("data-idx"), 10);
          if (state.chamberJson && state.chamberJson.apiBoxes && idxDel >= 0) {
            state.chamberJson.apiBoxes.splice(idxDel, 1);
            refreshFromChamberJson();
            $("statusText").textContent = "박스 삭제됨";
          }
          return;
        }
        var idx = parseInt(btn.getAttribute("data-idx"), 10);
        var box = state.layout.boxes[idx];
        if (box) {
          $("statusText").textContent =
            (box.text || boxUsageKey(box)) + " · " + state.fileName;
        }
      });
    });

    var map = viewport.querySelector(".block-map.excel-map");
    if (map) {
      map.classList.toggle("placement-on", !!state.placing);
      map.addEventListener("click", function (ev) {
        if (!state.placing) return;
        if (!state.layout) return;
        if (ev.target && ev.target.closest(".excel-box")) return;
        var draft = toPlaceDraft();
        if (!draft) {
          $("statusText").textContent = "1007 로케이션을 먼저 입력하세요";
          return;
        }
        var rect = map.getBoundingClientRect();
        var pitch = state.cellSize + state.gutter;
        var c = Math.floor((ev.clientX - rect.left) / pitch);
        var r = Math.floor((ev.clientY - rect.top) / pitch);
        if (c < 0 || r < 0 || c >= state.layout.cols || r >= state.layout.rows) return;
        ensureApiBoxes();
        state.chamberJson.apiBoxes.push({
          text: draft.text,
          zone: draft.zone,
          row: draft.row,
          r: r,
          c: c,
          w: draft.w,
          h: draft.h,
        });
        refreshFromChamberJson();
        $("statusText").textContent = draft.text + " 추가됨 (" + r + "," + c + ")";
      });
    }

    var tiles = state.layout.floorTiles ? state.layout.floorTiles.length : 0;
    var sprites = state.layout.sprites ? state.layout.sprites.length : 0;
    var j = state.chamberJson;
    $("statusText").textContent =
      state.fileName + " · " + state.layout.rows + "×" + state.layout.cols +
      " · 스프라이트 " + sprites + " · 타일 " + tiles;

    $("metaBox").innerHTML =
      "<div><strong>" + escapeHtml(state.fileName) + "</strong></div>" +
      "<div>격자 " + state.layout.rows + "×" + state.layout.cols + "</div>" +
      "<div>PNG 스프라이트 " + sprites + " · 격자 타일 " + tiles + "</div>" +
      (j
        ? "<div>통로 정의 " + countAisles(j) +
          " · 선반 블록 " + countShelfSegs(j) +
          " · PLT 블록 " + countPalletSegs(j) + "</div>"
        : "");
  }

  function applyChamberJson(data, fileName, skipNormalize) {
    var normalized = skipNormalize ? data : Core.normalizeChamberJson(data);
    var layout = Core.chamberJsonToRenderLayout(normalized);
    state.chamberJson = normalized;
    state.layout = layout;
    state.fileName = fileName || normalized.name || "chamber-layout.json";
    state.usageMap = null;
    state.apiMeta = null;
    render();
  }

  function refreshFromChamberJson() {
    if (!state.chamberJson) return;
    if (!state.chamberJson.aisles) state.chamberJson.aisles = [];
    var layout = Core.chamberJsonToRenderLayout(state.chamberJson);
    state.layout = layout;
    render();
  }

  window.yan4App = {
    getChamberJson: function () {
      return state.chamberJson;
    },
    getCellSize: function () {
      return state.cellSize;
    },
    getGutter: function () {
      return state.gutter;
    },
    refreshFromChamberJson: refreshFromChamberJson,
    applyChamberJson: applyChamberJson,
  };

  function loadJsonFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var data = JSON.parse(String(ev.target.result));
        applyChamberJson(data, file.name);
      } catch (e) {
        alert("JSON 오류: " + (e && e.message ? e.message : e));
      }
    };
    reader.readAsText(file, "utf8");
  }

  function initUpload() {
    var zone = $("uploadZone");
    var input = $("fileInput");
    zone.addEventListener("click", function () {
      input.click();
    });
    input.addEventListener("change", function () {
      loadJsonFile(input.files && input.files[0]);
      input.value = "";
    });
    zone.addEventListener("dragover", function (e) {
      e.preventDefault();
      zone.classList.add("dragover");
    });
    zone.addEventListener("dragleave", function () {
      zone.classList.remove("dragover");
    });
    zone.addEventListener("drop", function (e) {
      e.preventDefault();
      zone.classList.remove("dragover");
      loadJsonFile(e.dataTransfer.files && e.dataTransfer.files[0]);
    });
  }

  function setApiStatus(msg) {
    $("apiStatus").textContent = msg;
  }

  async function runFetch() {
    if (state.fetching) return;
    if (!layoutHasContent(state.layout)) {
      setApiStatus("레이아웃을 먼저 로드하세요");
      return;
    }
    if (!state.layout.boxes.length) {
      setApiStatus("apiBoxes 없음 — JSON에 1007- 로케이션 추가 후 조회");
      return;
    }
    state.fetching = true;
    $("fetchBtn").disabled = true;
    try {
      setApiStatus("bin API 조회 중…");
      var res = await api.fetchCapacity(state.layout.boxes);
      if (!res.ok) throw new Error(res.error || "API 실패");
      state.usageMap = res.usageMap;
      state.capacityRange = computeCapacityRange(res.usageMap);
      state.apiMeta = {
        bayCount: res.bayCount,
        lotCount: res.lotCount,
        aisleCount: res.aisleCount,
      };
      setApiStatus(
        "완료 · bay " + res.bayCount + " · lot " + res.lotCount + " · 통로 " + res.aisleCount
      );
      render();
    } catch (e) {
      setApiStatus("오류: " + (e && e.message ? e.message : String(e)));
    } finally {
      state.fetching = false;
      $("fetchBtn").disabled = false;
    }
  }

  async function runLogin() {
    setApiStatus("로그인 창 여는 중…");
    var res = await api.openInventoryLogin();
    setApiStatus(res.ok ? "로그인 창 열림" : "오류: " + (res.error || ""));
  }

  async function reloadLayout() {
    var res = await api.readChamberLayout();
    if (res.ok && res.layout) {
      applyChamberJson(res.layout, res.fileName || "chamber-layout.json");
      return;
    }
    $("viewport").innerHTML =
      '<p class="hint">chamber-layout.json 없음<br><code>npm run import-layout</code></p>';
    $("statusText").textContent = "레이아웃 없음";
  }

  async function saveLayout() {
    if (!state.chamberJson) {
      alert("저장할 레이아웃이 없습니다");
      return;
    }
    var toSave = Core.normalizeChamberJson(state.chamberJson);
    state.chamberJson = toSave;
    var res = await api.saveChamberLayout(toSave);
    if (res.ok) {
      $("metaBox").innerHTML =
        "<div><strong>저장됨</strong></div><div>" + escapeHtml(res.path || "") + "</div>";
    } else {
      alert("저장 실패: " + (res.error || ""));
    }
  }

  $("reloadBtn").addEventListener("click", reloadLayout);
  $("saveBtn").addEventListener("click", saveLayout);
  $("loginBtn").addEventListener("click", runLogin);
  $("fetchBtn").addEventListener("click", runFetch);
  $("cellSize").addEventListener("input", function () {
    var px = window.Yan4StampRegistry ? window.Yan4StampRegistry.tilePx() : 32;
    state.cellSize = parseInt($("cellSize").value, 10) || px;
    render();
  });
  $("gutter").addEventListener("input", function () {
    state.gutter = parseInt($("gutter").value, 10) || 0;
    render();
  });
  $("guidePngInput").addEventListener("change", function () {
    var f = $("guidePngInput").files && $("guidePngInput").files[0];
    if (!f) return;
    if (state.guidePngUrl) {
      try {
        URL.revokeObjectURL(state.guidePngUrl);
      } catch (_e) {}
    }
    state.guidePngUrl = URL.createObjectURL(f);
    $("statusText").textContent = "기준 PNG 적용됨: " + (f.name || "image/png");
    render();
    $("guidePngInput").value = "";
  });
  $("placeModeBtn").addEventListener("click", function () {
    state.placing = !state.placing;
    $("placeModeBtn").textContent = "배치 모드 " + (state.placing ? "ON" : "OFF");
    $("placeModeBtn").classList.toggle("btn-secondary", !state.placing);
    $("placeModeBtn").classList.toggle("btn-primary", state.placing);
    render();
  });

  api.onFetchProgress(function (p) {
    setApiStatus("통로 " + p.cur + "/" + p.total + " · " + (p.name || "") + "…");
  });

  initUpload();

  document.addEventListener("yan4-stamps-ready", function () {
    if (state.layout) render();
  });

  document.addEventListener("yan4-assets-ready", function () {
    applyDisplayDefaults();
    if (state.layout) render();
  });

  function applyDisplayDefaults() {
    var Catalog = window.Yan4AssetCatalog;
    var Stamps = window.Yan4StampRegistry;
    var CoreRef = window.ChamberLayoutCore;
    var px =
      Catalog && Catalog.cellPx
        ? Catalog.cellPx()
        : CoreRef && CoreRef.DEFAULT_ZOOM
          ? CoreRef.DEFAULT_ZOOM
          : Stamps
            ? Stamps.defaultZoom()
            : 32;
    state.cellSize = px;
    state.gutter = Stamps ? Stamps.defaultGutter() : 0;
    var cs = $("cellSize");
    var g = $("gutter");
    if (cs) cs.value = String(state.cellSize);
    if (g) g.value = String(state.gutter);
    if (document.body) {
      if (state.cellSize >= 32) document.body.classList.add("map-hq");
      else document.body.classList.remove("map-hq");
    }
  }

  function boot() {
    var Catalog = window.Yan4AssetCatalog;
    var Stamps = window.Yan4StampRegistry;

    function afterCatalog() {
      applyDisplayDefaults();
      if (Stamps && Stamps.init) {
        Stamps.init(function () {
          reloadLayout();
        });
        return;
      }
      reloadLayout();
    }

    if (Catalog && Catalog.init) {
      Catalog.init(afterCatalog);
      return;
    }
    afterCatalog();
  }

  boot();
})();
