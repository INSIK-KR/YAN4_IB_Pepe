#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const Core = require("./chamber-layout-core");

const p = path.join(__dirname, "chamber-layout.json");
if (!fs.existsSync(p)) {
  console.error("chamber-layout.json 없음");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(p, "utf8"));
const before = raw.fixed ? raw.fixed.length : 0;
const normalized = Core.normalizeChamberJson(raw);
const after = normalized.fixed.length;

fs.writeFileSync(p, JSON.stringify(normalized, null, 2), "utf8");
console.log("[compress] fixed", before, "→", after, "rects");
