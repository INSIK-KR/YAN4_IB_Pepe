"use strict";

/**
 * 확장 yan4-ats-page.js / .css 를 renderer/vendor 로 복사
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..", "YAN4_IB_Shell_ChromeExt");
const outDir = path.join(__dirname, "renderer", "vendor");
const files = ["yan4-ats-page.js", "yan4-ats-page.css"];

fs.mkdirSync(outDir, { recursive: true });
for (const f of files) {
  const src = path.join(root, f);
  const dst = path.join(outDir, f);
  if (!fs.existsSync(src)) {
    console.warn("[copy-ats-assets] missing:", src);
    continue;
  }
  fs.copyFileSync(src, dst);
  console.log("[copy-ats-assets]", f);
}
