/**
 * 1회성: 1챔버도면.xlsx → chamber-layout.json
 * Node: require("./chamber-excel-import").importFromPath(path)
 */
"use strict";

const XLSX = require("xlsx");
const fs = require("fs");
const Core = require("./chamber-layout-core");

const LOC_RE = /^1007-(1CP\d+|1C\d+)-(\d+)-(.+)$/i;

const FIXED_KINDS = {
  FFFF00: "conveyor",
  DEDFE1: "rail",
  D1D1D1: "pillar",
  "00B050": "zone-green",
  F6C6AD: "mezzanine",
  "808489": "nys-zone",
};

function sheetTightBounds(sh) {
  let minR = Infinity,
    maxR = -Infinity,
    minC = Infinity,
    maxC = -Infinity,
    found = false;
  const touch = (r, c) => {
    found = true;
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    minC = Math.min(minC, c);
    maxC = Math.max(maxC, c);
  };
  Object.keys(sh).forEach((key) => {
    if (key[0] === "!") return;
    const a = XLSX.utils.decode_cell(key);
    touch(a.r, a.c);
  });
  (sh["!merges"] || []).forEach((m) => {
    touch(m.s.r, m.s.c);
    touch(m.e.r, m.e.c);
  });
  return found ? { s: { r: minR, c: minC }, e: { r: maxR, c: maxC } } : null;
}

function sheetEffectiveBounds(sh) {
  const ref = sh["!ref"];
  if (!ref) return null;
  const loose = XLSX.utils.decode_range(ref);
  const tight = sheetTightBounds(sh);
  if (!tight) return loose;
  return {
    s: {
      r: Math.max(loose.s.r, tight.s.r),
      c: Math.max(loose.s.c, tight.s.c),
    },
    e: {
      r: Math.min(loose.e.r, tight.e.r),
      c: Math.min(loose.e.c, tight.e.c),
    },
  };
}

function cellFgRgbNormalized(cell) {
  if (!cell || !cell.s || !cell.s.fgColor) return "";
  let rgb = cell.s.fgColor.rgb ? String(cell.s.fgColor.rgb) : "";
  rgb = rgb.replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{8}$/.test(rgb)) rgb = rgb.slice(2);
  return /^[0-9A-F]{6}$/.test(rgb) ? rgb : "";
}

function isThemeShelfFill(cell) {
  if (!cell || !cell.s || cell.s.patternType !== "solid" || !cell.s.fgColor) return false;
  if (cellFgRgbNormalized(cell)) return false;
  const fg = cell.s.fgColor;
  return (
    fg.theme === 0 &&
    typeof fg.tint === "number" &&
    Math.abs(fg.tint + 0.0499893185216834) < 0.02
  );
}

function isBarePatternNoneOnly(cell) {
  if (!cell || !cell.s || cell.s.patternType !== "none") return false;
  return Object.keys(cell.s).length === 1;
}

function rowContainsRailRgb(sheet, r, c0, c1) {
  for (let c = c0; c <= c1; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    if (cellFgRgbNormalized(cell) === "DEDFE1") return true;
  }
  return false;
}

function computeThemeShelfColumnSpan(sheet, bounds) {
  let minC = Infinity,
    maxC = -Infinity,
    touched = false;
  for (let r = bounds.s.r; r <= bounds.e.r; r++) {
    for (let c = bounds.s.c; c <= bounds.e.c; c++) {
      if (!isThemeShelfFill(sheet[XLSX.utils.encode_cell({ r, c })])) continue;
      touched = true;
      minC = Math.min(minC, c);
      maxC = Math.max(maxC, c);
    }
  }
  return touched ? { minC, maxC } : null;
}

function sheetCellText(sheet, r, c) {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (!cell || cell.v == null) return "";
  return String(cell.v).trim();
}

function classifyPixelCell(cell, text) {
  const t = String(text || "");
  if (t) {
    if (/챔버입구/.test(t)) return "entrance";
    if (/기둥/.test(t)) return "pillar";
    if (/원복존|적재함/.test(t)) return "zone-green";
    if (/메자닌|리프트/.test(t)) return "mezzanine";
    if (/NYS|WMS|대기존/.test(t)) return "nys-zone";
    if (/컨베이어|벨트|conveyor/i.test(t)) return "conveyor";
    if (/레일|rail/i.test(t)) return "rail";
  }
  const rgb = cellFgRgbNormalized(cell);
  if (rgb === "FFFF00") return "conveyor";
  if (rgb === "DEDFE1") return "rail";
  if (rgb === "D1D1D1") return "pillar";
  if (rgb === "00B050") return "zone-green";
  if (rgb === "F6C6AD") return "mezzanine";
  if (rgb === "808489") return "nys-zone";
  if (isThemeShelfFill(cell)) return "shelf";
  return "";
}

function collectShelfInfer(sheet, bounds, span) {
  if (!span) return [];
  const cells = [];
  let rHi = bounds.e.r;
  if (rHi > bounds.s.r + 154) rHi = bounds.s.r + 154;
  for (let r = Math.max(bounds.s.r, bounds.s.r + 76); r <= rHi; r++) {
    if (!rowContainsRailRgb(sheet, r, bounds.s.c, bounds.e.c)) continue;
    for (let c = span.minC; c <= span.maxC; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const t = sheetCellText(sheet, r, c);
      if (LOC_RE.test(t) || t) continue;
      if (!isBarePatternNoneOnly(cell)) continue;
      cells.push({ r, c });
    }
  }
  return cells;
}

/** 인접 shelf 셀 → 사각형 segments (가변 레이어 초안) */
function cellsToSegments(cells) {
  if (!cells.length) return [];
  const set = new Set(cells.map((p) => p.r + "," + p.c));
  const used = new Set();
  const segments = [];

  function grow(sr, sc) {
    let r1 = sr;
    while (set.has(r1 + 1 + "," + sc) && !used.has(r1 + 1 + "," + sc)) r1++;
    let c1 = sc;
    outer: while (true) {
      for (let r = sr; r <= r1; r++) {
        if (!set.has(r + "," + (c1 + 1)) || used.has(r + "," + (c1 + 1))) {
          break outer;
        }
      }
      c1++;
    }
    for (let r = sr; r <= r1; r++) {
      for (let c = sc; c <= c1; c++) {
        used.add(r + "," + c);
      }
    }
    return { r0: sr, c0: sc, r1, c1 };
  }

  const sorted = cells.slice().sort((a, b) => a.r - b.r || a.c - b.c);
  sorted.forEach(({ r, c }) => {
    const k = r + "," + c;
    if (!set.has(k) || used.has(k)) return;
    segments.push(grow(r, c));
  });
  return segments;
}

function collectMarkers(sheet, bounds) {
  const markers = [];
  const used = {};
  const merges = sheet["!merges"] || [];

  function addMarker(r, c, w, h, text, kind) {
    const key = r + "," + c + "," + text;
    if (used[key]) return;
    used[key] = true;
    markers.push({ kind, label: text, r0: r, c0: c, r1: r + h - 1, c1: c + w - 1 });
  }

  merges.forEach((m) => {
    const text = sheetCellText(sheet, m.s.r, m.s.c);
    if (!text || LOC_RE.test(text)) return;
    let kind = "label";
    if (/챔버입구/.test(text)) kind = "entrance";
    else if (/기둥/.test(text)) kind = "pillar";
    else if (/원복존|적재함/.test(text)) kind = "zone-green";
    else if (/메자닌|리프트/.test(text)) kind = "mezzanine";
    else if (/NYS|WMS|대기존/.test(text)) kind = "nys-zone";
    addMarker(m.s.r, m.s.c, m.e.c - m.s.c + 1, m.e.r - m.s.r + 1, text, kind);
  });

  return markers;
}

function pickSheet(wb) {
  let best = wb.SheetNames[0];
  let bestScore = -1;
  wb.SheetNames.forEach((name) => {
    const sheet = wb.Sheets[name];
    if (!sheet["!ref"]) return;
    const b = sheetEffectiveBounds(sheet);
    if (!b) return;
    const area = (b.e.r - b.s.r + 1) * (b.e.c - b.s.c + 1);
    if (area > bestScore) {
      bestScore = area;
      best = name;
    }
  });
  return best;
}

function importSheetToChamberJson(sheet, sheetName) {
  const bounds = sheetEffectiveBounds(sheet);
  if (!bounds) throw new Error("빈 시트: " + sheetName);

  const fixed = [];
  const shelfCells = [];
  const themeSpan = computeThemeShelfColumnSpan(sheet, bounds);

  for (let r = bounds.s.r; r <= bounds.e.r; r++) {
    for (let c = bounds.s.c; c <= bounds.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const t = sheetCellText(sheet, r, c);
      if (LOC_RE.test(t)) continue;
      let kind = classifyPixelCell(cell, t);
      if (kind === "shelf") {
        shelfCells.push({ r, c });
        continue;
      }
      if (!kind) continue;
      fixed.push({ kind, r0: r, c0: c, r1: r, c1: c });
    }
  }

  const inferred = collectShelfInfer(sheet, bounds, themeSpan);
  inferred.forEach((p) => shelfCells.push(p));

  const shelfSegments = cellsToSegments(shelfCells);

  var json = {
    version: 1,
    name: "YAN4 1챔ber",
    source: sheetName,
    importedAt: new Date().toISOString(),
    grid: {
      rows: bounds.e.r - bounds.s.r + 1,
      cols: bounds.e.c - bounds.s.c + 1,
    },
    fixed,
    markers: collectMarkers(sheet, bounds),
    aisles: [],
    variable: {
      shelf: { segments: shelfSegments },
      pallet: { segments: [] },
    },
  };
  return Core.normalizeChamberJson(json);
}

function importFromPath(filePath) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", cellStyles: true });
  const sn = pickSheet(wb);
  return importSheetToChamberJson(wb.Sheets[sn], sn);
}

module.exports = { importFromPath, importSheetToChamberJson };
