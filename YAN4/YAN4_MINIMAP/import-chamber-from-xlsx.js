#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { importFromPath } = require("./chamber-excel-import");

const candidates = [
  process.argv[2],
  path.join(__dirname, "1챔버도면.xlsx"),
  path.join(require("os").homedir(), "Downloads", "1챔버도면.xlsx"),
].filter(Boolean);

let src = null;
for (const p of candidates) {
  if (fs.existsSync(p)) {
    src = p;
    break;
  }
}

if (!src) {
  console.error("사용법: node import-chamber-from-xlsx.js [1챔버도면.xlsx 경로]");
  process.exit(1);
}

const out = path.join(__dirname, "chamber-layout.json");
const json = importFromPath(src);
fs.writeFileSync(out, JSON.stringify(json, null, 2), "utf8");
console.log("[import]", src, "→", out);
console.log(
  "  grid",
  json.grid.cols + "×" + json.grid.rows,
  "| fixed",
  json.fixed.length,
  "| shelf segments",
  json.variable.shelf.segments.length,
  "| markers",
  json.markers.length
);
