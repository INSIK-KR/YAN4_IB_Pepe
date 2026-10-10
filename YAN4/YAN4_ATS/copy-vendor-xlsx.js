/* Copies SheetJS browser bundle into ../vendor/ for offline Electron. */
const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "node_modules", "xlsx", "dist", "xlsx.full.min.js");
const destDir = path.join(__dirname, "..", "vendor");
const dest = path.join(destDir, "xlsx.full.min.js");
if (!fs.existsSync(src)) {
  console.warn("[copy-vendor-xlsx] node_modules/xlsx not found; run npm install in yna4-replenish-desktop");
  process.exit(0);
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("[copy-vendor-xlsx] ->", dest);
