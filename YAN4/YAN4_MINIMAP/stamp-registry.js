/**
 * Multi-sheet 16×16 tiles — Kenney + optional Warehouse (MissingRice)
 */
(function (root) {
  "use strict";

  var STORAGE_PAINT_KEY = "yan4-paint-tileset";

  var DEFAULT_MANIFEST = {
    tilePx: 16,
    defaultZoom: 16,
    defaultGutter: 0,
    sheetCols: 18,
    sheetRows: 11,
    spritesheet: "assets/kenney/tilemap_packed.png",
    backgroundTile: { col: 1, row: 1 },
    stamps: {
      rail: { col: 2, row: 7 },
      conveyor: { col: 5, row: 3 },
      pillar: { col: 6, row: 5 },
      entrance: { col: 7, row: 5 },
      mezzanine: { col: 8, row: 5 },
      "nys-zone": { col: 3, row: 0 },
      "zone-green": { col: 1, row: 1 },
      "shelf-zone": { col: 9, row: 4 },
      "pallet-zone": { col: 4, row: 2 },
    },
  };

  var manifest = DEFAULT_MANIFEST;
  var tilesConfig = { defaultPaintId: "kenney", sets: [] };
  var sheets = {};
  /** @type {Object.<string,string>} */
  var stampTileCache = {};
  var floorRepeatDataUrl = null;
  var loadDone = false;
  var kenneyStampId = "kenney";
  var runtimeSheetSeq = 1;

  function tilePx() {
    return manifest.tilePx || 16;
  }

  function defaultZoom() {
    return manifest.defaultZoom != null ? manifest.defaultZoom : 16;
  }

  function defaultGutter() {
    return manifest.defaultGutter != null ? manifest.defaultGutter : 0;
  }

  function stampDef(kind) {
    if (!kind || !manifest.stamps) return null;
    return manifest.stamps[kind] || null;
  }

  function editorStamps() {
    var out = [];
    var kinds = ["rail", "conveyor", "pillar", "entrance", "mezzanine", "nys-zone", "zone-green"];
    kinds.forEach(function (kind) {
      var d = stampDef(kind);
      if (!d) return;
      out.push({ kind: kind, label: kind, cls: kind });
    });
    return out;
  }

  function sheetState(id) {
    return sheets[id] || null;
  }

  function getSheetDims(id) {
    var s = sheets[id];
    if (!s || !s.ready) return { cols: 18, rows: 11 };
    return { cols: s.cols, rows: s.rows };
  }

  function getActivePaintId() {
    var id = tilesConfig.activePaintId;
    try {
      var stored = root.localStorage && root.localStorage.getItem(STORAGE_PAINT_KEY);
      if (stored) id = stored;
    } catch (e) {}
    var st = sheets[id];
    if (st && st.ready) return id;
    var i;
    for (i = 0; i < tilesConfig.sets.length; i++) {
      var sid = tilesConfig.sets[i].id;
      if (sheets[sid] && sheets[sid].ready) return sid;
    }
    return kenneyStampId;
  }

  function setActivePaintId(id, silent) {
    try {
      if (root.localStorage) root.localStorage.setItem(STORAGE_PAINT_KEY, id);
    } catch (e) {}
    tilesConfig.activePaintId = id;
    clearStampCache();
    if (!silent && root.document && root.document.dispatchEvent) {
      root.document.dispatchEvent(new CustomEvent("yan4-paint-tileset-changed", { detail: { id: id } }));
    }
  }

  function listPaintSets() {
    return (tilesConfig.sets || []).map(function (def) {
      var st = sheets[def.id];
      return {
        id: def.id,
        label: def.label || def.id,
        ready: !!(st && st.ready),
        failed: !!(st && st.failed),
        optional: !!def.optional,
        license: def.license || "",
      };
    });
  }

  function clearStampCache() {
    stampTileCache = {};
    floorRepeatDataUrl = null;
  }

  function bakeStampTileBitmap(img, px, col, row) {
    if (!img || !img.naturalWidth) return "";
    var canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;
    var ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, col * px, row * px, px, px, 0, 0, px, px);
    try {
      return canvas.toDataURL("image/png");
    } catch (e) {
      return "";
    }
  }

  function bakeFloorFromKenney() {
    var k = sheets[kenneyStampId];
    if (!k || !k.ready || !k.img) return;
    var px = tilePx();
    var at = manifest.backgroundTile || { col: 1, row: 1 };
    floorRepeatDataUrl = bakeStampTileBitmap(k.img, px, at.col, at.row);
  }

  /** @param {string} sheetId */
  function bakeStampTileAtSheet(sheetId, col, row) {
    var st = sheets[sheetId];
    if (!st || !st.ready || !st.img) return "";
    var key = sheetId + "/" + col + "," + row;
    if (stampTileCache[key]) return stampTileCache[key];
    var px = st.tilePx != null ? st.tilePx : manifest.tilePx || 16;
    var url = bakeStampTileBitmap(st.img, px, col, row);
    stampTileCache[key] = url;
    return url;
  }

  function stampTileStyleForSheet(sheetId, col, row, zoom) {
    var st = sheets[sheetId];
    var url = bakeStampTileAtSheet(sheetId, col, row);
    if (!url) return "";
    var basePx = st && st.tilePx != null ? st.tilePx : manifest.tilePx || 16;
    var z = zoom > 0 ? zoom : basePx;
    return (
      "background-image:url('" +
      url +
      "');" +
      "background-size:" +
      z +
      "px " +
      z +
      "px;" +
      "background-position:0 0;" +
      "background-repeat:no-repeat;"
    );
  }

  function stampTileStyle(kind, zoom) {
    var d = stampDef(kind);
    if (!d) return "";
    return stampTileStyleForSheet(kenneyStampId, d.col, d.row, zoom);
  }

  function floorRepeatStyle(zoom) {
    if (!floorRepeatDataUrl) return "";
    var z = zoom > 0 ? zoom : tilePx();
    return (
      "background-image:url('" +
      floorRepeatDataUrl +
      "');" +
      "background-size:" +
      z +
      "px " +
      z +
      "px;" +
      "background-repeat:repeat;"
    );
  }

  function applyKenneyBodyClass() {
    var k = sheets[kenneyStampId];
    if (k && k.ready && !k.failed && root.document) {
      root.document.body.classList.add("kenney-stamps");
    } else if (root.document) {
      root.document.body.classList.remove("kenney-stamps");
    }
  }

  /** Any paint sheet usable (Warehouse without Kenney still shows tiles if wh loaded) */
  function loadSheetDef(def, done) {
    var id = def.id;
    var url = def.spritesheet || def.path;
    if (!url) {
      sheets[id] = { failed: true, ready: false, optional: !!def.optional };
      done(id, false);
      return;
    }
    var px = def.tilePx != null ? def.tilePx : manifest.tilePx;
    var img = new Image();
    img.onload = function () {
      var cols = px > 0 ? Math.round(img.naturalWidth / px) : 0;
      var rows = px > 0 ? Math.round(img.naturalHeight / px) : 0;
      sheets[id] = {
        img: img,
        url: url,
        cols: cols,
        rows: rows,
        ready: true,
        failed: false,
        optional: !!def.optional,
        tilePx: px,
      };
      if (id === kenneyStampId) {
        manifest.sheetCols = cols;
        manifest.sheetRows = rows;
      }
      done(id, true);
    };
    img.onerror = function () {
      sheets[id] = { failed: true, ready: false, optional: !!def.optional, url: url };
      done(id, false);
    };
    img.src = url;
  }

  function loadAllSheets(onReady) {
    var list = tilesConfig.sets && tilesConfig.sets.length ? tilesConfig.sets : [{ id: kenneyStampId, spritesheet: manifest.spritesheet, tilePx: 16 }];
    var left = list.length;

    function one(id, ok) {
      left--;
      if (left <= 0) {
        bakeFloorFromKenney();
        loadDone = true;
        applyKenneyBodyClass();
        if (root.document && root.document.dispatchEvent) {
          root.document.dispatchEvent(new CustomEvent("yan4-stamps-ready"));
        }
        if (onReady) onReady();
      }
    }

    list.forEach(function (def) {
      loadSheetDef(def, one);
    });
  }

  function importExternalSheets(files, onReady) {
    var list = Array.isArray(files) ? files : [];
    if (!list.length) {
      if (onReady) onReady({ added: 0, ready: 0 });
      return;
    }
    var defs = [];
    list.forEach(function (f) {
      var src = "";
      var label = "";
      if (typeof f === "string") {
        src = f;
      } else if (f && typeof f === "object") {
        src = f.url || f.path || "";
        label = f.name || "";
      }
      if (!src) return;
      var id = "ext-" + Date.now() + "-" + runtimeSheetSeq++;
      defs.push({
        id: id,
        label: label ? "불러옴 · " + label : "불러옴 타일 " + runtimeSheetSeq,
        spritesheet: src,
        tilePx: 16,
        optional: false,
        external: true,
      });
    });
    if (!defs.length) {
      if (onReady) onReady({ added: 0, ready: 0 });
      return;
    }
    if (!tilesConfig.sets) tilesConfig.sets = [];
    Array.prototype.push.apply(tilesConfig.sets, defs);

    var left = defs.length;
    var firstReadyId = "";
    var readyCount = 0;
    defs.forEach(function (def) {
      loadSheetDef(def, function (_id, ok) {
        if (ok) {
          readyCount++;
          if (!firstReadyId) firstReadyId = def.id;
        }
        left--;
        if (left <= 0) {
          if (firstReadyId) setActivePaintId(firstReadyId, true);
          if (root.document && root.document.dispatchEvent) {
            root.document.dispatchEvent(new CustomEvent("yan4-stamps-ready"));
            root.document.dispatchEvent(
              new CustomEvent("yan4-paint-tileset-changed", {
                detail: { id: firstReadyId || getActivePaintId(), imported: true },
              })
            );
          }
          if (onReady) onReady({ added: defs.length, ready: readyCount });
        }
      });
    });
  }

  function mergeTilesetsIntoManifest(tilesetsParsed) {
    if (!tilesetsParsed || !tilesetsParsed.sets || !tilesetsParsed.sets.length) return;
    tilesConfig.defaultPaintId = tilesetsParsed.defaultPaintId || kenneyStampId;
    tilesConfig.sets = tilesetsParsed.sets;
    var ken = tilesetsParsed.sets.filter(function (s) {
      return s.id === kenneyStampId;
    })[0];
    if (ken && ken.spritesheet) manifest.spritesheet = ken.spritesheet;
  }

  function applyStampManifestParsed(parsed) {
    manifest = Object.assign({}, DEFAULT_MANIFEST, parsed);
    if (parsed.backgroundTile) {
      manifest.backgroundTile = Object.assign(
        {},
        DEFAULT_MANIFEST.backgroundTile,
        parsed.backgroundTile
      );
    }
    if (parsed.stamps) {
      Object.keys(parsed.stamps).forEach(function (k) {
        manifest.stamps[k] = Object.assign({}, DEFAULT_MANIFEST.stamps[k], parsed.stamps[k]);
      });
    }
  }

  function kenneyFallbackSet() {
    return [
      {
        id: kenneyStampId,
        label: "Kenney",
        spritesheet: manifest.spritesheet || DEFAULT_MANIFEST.spritesheet,
        tilePx: manifest.tilePx || 16,
      },
    ];
  }

  function fetchTilesetsAndLoadSheets(onReady) {
    var xhrT = new XMLHttpRequest();
    xhrT.open("GET", "assets/tilesets/tilesets.json", true);
    xhrT.onload = function () {
      if (xhrT.status >= 200 && xhrT.status < 300) {
        try {
          mergeTilesetsIntoManifest(JSON.parse(xhrT.responseText));
        } catch (e) {}
      }
      if (!tilesConfig.sets || !tilesConfig.sets.length) {
        tilesConfig.sets = kenneyFallbackSet();
      }
      loadAllSheets(onReady);
    };
    xhrT.onerror = function () {
      tilesConfig.sets = kenneyFallbackSet();
      loadAllSheets(onReady);
    };
    xhrT.send();
  }

  function init(onReady) {
    var xhrM = new XMLHttpRequest();
    xhrM.open("GET", "assets/stamps/stamp-manifest.json", true);
    xhrM.onload = function () {
      if (xhrM.status >= 200 && xhrM.status < 300) {
        try {
          applyStampManifestParsed(JSON.parse(xhrM.responseText));
        } catch (e) {}
      }
      fetchTilesetsAndLoadSheets(onReady);
    };
    xhrM.onerror = function () {
      fetchTilesetsAndLoadSheets(onReady);
    };
    xhrM.send();
  }

  function isSheetReady() {
    var k = sheets[kenneyStampId];
    if (k && k.ready) return true;
    var id = getActivePaintId();
    return !!(sheets[id] && sheets[id].ready);
  }

  function bakeFloorRepeatTile(override) {
    bakeFloorFromKenney();
    void override;
  }

  root.Yan4StampRegistry = {
    init: init,
    tilePx: tilePx,
    defaultZoom: defaultZoom,
    defaultGutter: defaultGutter,
    editorStamps: editorStamps,
    stampDef: stampDef,
    stampTileStyle: stampTileStyle,
    stampTileStyleAt: function (col, row, zoom) {
      return stampTileStyleForSheet(getActivePaintId(), col, row, zoom);
    },
    stampTileStyleForSheet: stampTileStyleForSheet,
    getSheetCols: function () {
      var d = getSheetDims(getActivePaintId());
      return d.cols;
    },
    getSheetRows: function () {
      var d = getSheetDims(getActivePaintId());
      return d.rows;
    },
    getSheetDimsFor: getSheetDims,
    getActivePaintId: getActivePaintId,
    setActivePaintId: setActivePaintId,
    listPaintSets: listPaintSets,
    importExternalSheets: importExternalSheets,
    floorRepeatStyle: floorRepeatStyle,
    bakeFloorRepeatTile: bakeFloorRepeatTile,
    spritesheetUrl: function () {
      var st = sheets[kenneyStampId];
      return st && st.url ? st.url : manifest.spritesheet;
    },
    isSheetReady: isSheetReady,
    KENNEY_ID: kenneyStampId,
  };
})(typeof window !== "undefined" ? window : this);
