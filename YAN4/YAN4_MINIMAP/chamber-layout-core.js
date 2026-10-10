/**
 * chamber-layout.json ↔ 렌더 layout
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ChamberLayoutCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_CANVAS_PX = 1600;
  var DEFAULT_TILE_PX = 32;
  var DEFAULT_GRID_ROWS = DEFAULT_CANVAS_PX / DEFAULT_TILE_PX;
  var DEFAULT_GRID_COLS = DEFAULT_CANVAS_PX / DEFAULT_TILE_PX;
  var DEFAULT_ZOOM = DEFAULT_TILE_PX;

  function normSegment(seg) {
    var r0 = seg.r0 != null ? seg.r0 : seg.r;
    var c0 = seg.c0 != null ? seg.c0 : seg.c;
    var r1 = seg.r1 != null ? seg.r1 : r0 + (seg.h || 1) - 1;
    var c1 = seg.c1 != null ? seg.c1 : c0 + (seg.w || 1) - 1;
    if (r1 < r0) {
      var t = r0;
      r0 = r1;
      r1 = t;
    }
    if (c1 < c0) {
      t = c0;
      c0 = c1;
      c1 = t;
    }
    return { r0: r0, c0: c0, r1: r1, c1: c1 };
  }

  function segmentToTiles(seg, kindOrMeta) {
    var s = normSegment(seg);
    var kind = typeof kindOrMeta === "string" ? kindOrMeta : kindOrMeta.kind || "tile";
    var tileCol =
      typeof kindOrMeta === "object" && kindOrMeta.tileCol != null ? kindOrMeta.tileCol : null;
    var tileRow =
      typeof kindOrMeta === "object" && kindOrMeta.tileRow != null ? kindOrMeta.tileRow : null;
    var tiles = [];
    var r;
    var c;
    for (r = s.r0; r <= s.r1; r++) {
      for (c = s.c0; c <= s.c1; c++) {
        var t = { r: r, c: c, w: 1, h: 1, kind: kind };
        if (tileCol != null) t.tileCol = tileCol;
        if (tileRow != null) t.tileRow = tileRow;
        if (typeof kindOrMeta === "object" && kindOrMeta.tileSetId != null) {
          t.tileSetId = kindOrMeta.tileSetId;
        }
        if (typeof kindOrMeta === "object" && kindOrMeta.asset != null) {
          t.asset = kindOrMeta.asset;
        }
        tiles.push(t);
      }
    }
    return tiles;
  }

  function fixedGroupKey(item) {
    if (item.tileCol != null && item.tileRow != null) {
      var sid = item.tileSetId || "kenney";
      return "t:" + sid + "|" + item.tileCol + "," + item.tileRow;
    }
    return item.kind || "unknown";
  }

  function isUnitCellRect(item) {
    var s = normSegment(item);
    return s.r0 === s.r1 && s.c0 === s.c1;
  }

  /** 같은 kind 인접 셀 → 큰 사각형으로 합침 */
  function mergeCellsToRects(cells) {
    var set = {};
    cells.forEach(function (p) {
      set[p.r + "," + p.c] = true;
    });
    var used = {};
    var keys = Object.keys(set).sort(function (a, b) {
      var pa = a.split(",");
      var pb = b.split(",");
      return parseInt(pa[0], 10) - parseInt(pb[0], 10) || parseInt(pa[1], 10) - parseInt(pb[1], 10);
    });
    var rects = [];
    keys.forEach(function (key) {
      if (!set[key] || used[key]) return;
      var parts = key.split(",");
      var r = parseInt(parts[0], 10);
      var c = parseInt(parts[1], 10);
      var c1 = c;
      while (set[r + "," + (c1 + 1)] && !used[r + "," + (c1 + 1)]) c1++;
      var r1 = r;
      outer: while (true) {
        var rr = r1 + 1;
        for (var cc = c; cc <= c1; cc++) {
          if (!set[rr + "," + cc] || used[rr + "," + cc]) break outer;
        }
        r1 = rr;
      }
      for (rr = r; rr <= r1; rr++) {
        for (cc = c; cc <= c1; cc++) used[rr + "," + cc] = true;
      }
      rects.push({ r0: r, c0: c, r1: r1, c1: c1 });
    });
    return rects;
  }

  function mergeFixedList(fixedList) {
    if (!fixedList || !fixedList.length) return [];
    var unit = fixedList.every(isUnitCellRect);
    if (!unit) {
      return fixedList.map(function (item) {
        var s = normSegment(item);
        var out = { kind: item.kind || "tile", r0: s.r0, c0: s.c0, r1: s.r1, c1: s.c1 };
        if (item.tileCol != null) out.tileCol = item.tileCol;
        if (item.tileRow != null) out.tileRow = item.tileRow;
        if (item.tileSetId != null) out.tileSetId = item.tileSetId;
        return out;
      });
    }

    var byKind = {};
    fixedList.forEach(function (item) {
      var s = normSegment(item);
      var k = fixedGroupKey(item);
      if (!byKind[k]) byKind[k] = [];
      byKind[k].push({ r: s.r0, c: s.c0 });
    });

    var out = [];
    Object.keys(byKind).forEach(function (key) {
      mergeCellsToRects(byKind[key]).forEach(function (rect) {
        var entry = {
          kind: "tile",
          r0: rect.r0,
          c0: rect.c0,
          r1: rect.r1,
          c1: rect.c1,
        };
        if (key.indexOf("t:") === 0) {
          var rest = key.slice(2);
          var pipe = rest.indexOf("|");
          if (pipe >= 0) {
            entry.tileSetId = rest.slice(0, pipe);
            var cr = rest.slice(pipe + 1).split(",");
            entry.tileCol = parseInt(cr[0], 10);
            entry.tileRow = parseInt(cr[1], 10);
          } else {
            entry.tileSetId = "kenney";
            var legacy = rest.split(",");
            entry.tileCol = parseInt(legacy[0], 10);
            entry.tileRow = parseInt(legacy[1], 10);
          }
        } else {
          entry.kind = key;
        }
        out.push(entry);
      });
    });
    return out;
  }

  function ensureAisleShape(aisle) {
    if (!aisle.north) aisle.north = { segments: [] };
    if (!aisle.north.segments) aisle.north.segments = [];
    if (!aisle.south) aisle.south = { segments: [] };
    if (!aisle.south.segments) aisle.south.segments = [];
    return aisle;
  }

  function cloneJson(data) {
    return JSON.parse(JSON.stringify(data));
  }

  function ensureGridAndBackground(copy) {
    if (!copy.grid) copy.grid = {};
    if (!copy.grid.rows) copy.grid.rows = DEFAULT_GRID_ROWS;
    if (!copy.grid.cols) copy.grid.cols = DEFAULT_GRID_COLS;
    if (!copy.background) {
      copy.background = { enabled: false };
    } else if (copy.background.enabled == null) {
      copy.background.enabled = false;
    }
    if (!copy.meta) copy.meta = {};
    if (!copy.meta.canvasPx) copy.meta.canvasPx = DEFAULT_CANVAS_PX;
    if (!copy.fixed) copy.fixed = [];
    if (!copy.markers) copy.markers = [];
  }

  /** 로드/저장 전 정규화: fixed 압축, aisles 배열 보장 */
  function normalizeChamberJson(data) {
    var copy = cloneJson(data);
    ensureGridAndBackground(copy);
    if (!copy.aisles) copy.aisles = [];
    copy.aisles.forEach(ensureAisleShape);
    if (copy.fixed && copy.fixed.length) {
      copy.fixed = mergeFixedList(copy.fixed);
    }
    if (!copy.variable) {
      copy.variable = { shelf: { segments: [] }, pallet: { segments: [] } };
    }
    return copy;
  }

  function expandFixed(fixedList) {
    var tiles = [];
    if (!fixedList) return tiles;
    fixedList.forEach(function (item) {
      if (item.asset) {
        tiles = tiles.concat(
          segmentToTiles(item, {
            kind: item.kind || "sprite",
            asset: item.asset,
          })
        );
      } else if (item.tileCol != null && item.tileRow != null) {
        tiles = tiles.concat(
          segmentToTiles(item, {
            kind: item.kind || "tile",
            tileCol: item.tileCol,
            tileRow: item.tileRow,
            tileSetId: item.tileSetId || "kenney",
          })
        );
      } else if (item.kind) {
        tiles = tiles.concat(segmentToTiles(item, item.kind));
      }
    });
    return tiles;
  }

  function expandVariableSide(side, kind) {
    if (!side || !side.segments) return [];
    var tiles = [];
    side.segments.forEach(function (seg) {
      tiles = tiles.concat(segmentToTiles(seg, kind));
    });
    return tiles;
  }

  function expandAisles(aisles) {
    var tiles = [];
    if (!aisles) return tiles;
    aisles.forEach(function (aisle) {
      if (aisle.north && aisle.north.segments) {
        tiles = tiles.concat(expandVariableSide(aisle.north, "shelf-zone"));
      }
      if (aisle.south && aisle.south.segments) {
        tiles = tiles.concat(expandVariableSide(aisle.south, "pallet-zone"));
      }
    });
    return tiles;
  }

  function expandSprites(spriteList) {
    var out = [];
    if (!spriteList || !spriteList.length) return out;
    spriteList.forEach(function (item) {
      if (!item || !item.asset) return;
      var s = normSegment(item);
      out.push({
        asset: item.asset,
        r: s.r0,
        c: s.c0,
        w: s.c1 - s.c0 + 1,
        h: s.r1 - s.r0 + 1,
        label: item.label || item.text || "",
        z: item.z != null ? item.z : 0,
      });
    });
    return out;
  }

  function markersFromJson(data) {
    var out = [];
    (data.markers || []).forEach(function (mk) {
      var s = normSegment(mk);
      out.push({
        r: s.r0,
        c: s.c0,
        w: s.c1 - s.c0 + 1,
        h: s.r1 - s.r0 + 1,
        text: mk.label || mk.text || "",
        kind: mk.kind,
      });
    });
    return out;
  }

  function dedupeTiles(tiles) {
    var map = {};
    var order = [];
    tiles.forEach(function (t) {
      var k = t.r + "," + t.c;
      if (!map[k]) {
        order.push(k);
        map[k] = t;
      } else if (tilePriority(t.kind) > tilePriority(map[k].kind)) {
        map[k] = t;
      }
    });
    return order.map(function (k) {
      return map[k];
    });
  }

  function tilePriority(kind) {
    if (kind === "shelf-zone" || kind === "pallet-zone") return 3;
    if (kind === "rail" || kind === "conveyor") return 2;
    return 1;
  }

  function validateChamberJson(data) {
    if (!data || data.version !== 1) {
      return { ok: false, error: "version 1 필요" };
    }
    if (!data.grid || !data.grid.rows || !data.grid.cols) {
      return { ok: false, error: "grid.rows / grid.cols 필요" };
    }
    return { ok: true };
  }

  function chamberJsonToRenderLayout(data) {
    var v = validateChamberJson(data);
    if (!v.ok) throw new Error(v.error);

    var tiles = [];
    tiles = tiles.concat(expandFixed(data.fixed));
    if (data.variable) {
      tiles = tiles.concat(expandVariableSide(data.variable.shelf, "shelf-zone"));
      tiles = tiles.concat(expandVariableSide(data.variable.pallet, "pallet-zone"));
    }
    tiles = tiles.concat(expandAisles(data.aisles));
    tiles = dedupeTiles(tiles);

    return {
      source: data.name || "chamber-layout.json",
      rows: data.grid.rows,
      cols: data.grid.cols,
      background: data.background,
      baseMap: data.baseMap || null,
      floorTiles: tiles,
      sprites: expandSprites(data.sprites),
      markers: markersFromJson(data),
      boxes: data.apiBoxes || data.boxes || [],
      chamberJson: data,
    };
  }

  function newAisle(id) {
    var n = String(id || "").trim() || "1";
    return {
      id: n,
      label: "통로 " + n,
      zoneShelf: "1C" + n,
      zonePallet: "1CP" + n,
      north: { segments: [] },
      south: { segments: [] },
    };
  }

  return {
    validateChamberJson: validateChamberJson,
    normalizeChamberJson: normalizeChamberJson,
    chamberJsonToRenderLayout: chamberJsonToRenderLayout,
    segmentToTiles: segmentToTiles,
    normSegment: normSegment,
    mergeFixedList: mergeFixedList,
    newAisle: newAisle,
    ensureAisleShape: ensureAisleShape,
    cloneJson: cloneJson,
    DEFAULT_GRID_ROWS: DEFAULT_GRID_ROWS,
    DEFAULT_GRID_COLS: DEFAULT_GRID_COLS,
    DEFAULT_CANVAS_PX: DEFAULT_CANVAS_PX,
    DEFAULT_ZOOM: DEFAULT_ZOOM,
    ensureGridAndBackground: ensureGridAndBackground,
  };
});
