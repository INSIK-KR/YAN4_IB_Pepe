"use strict";

/**
 * Copy src/ assets into renderer/ for the desktop shell.
 */
const fs = require("fs");
const path = require("path");

const extRoot = path.join(__dirname, "src");
const outVendor = path.join(__dirname, "renderer", "vendor");
const outMedia = path.join(__dirname, "renderer", "media");

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (!fs.existsSync(src)) {
    console.warn("[copy-shell-assets] missing:", src);
    return;
  }
  fs.copyFileSync(src, dst);
  console.log("[copy-shell-assets]", path.relative(extRoot, src));
}

const rootFiles = [
  "shell.js",
  "gm-bridge.js",
  "yan4-ats-page.js",
  "yan4-ats-page.css",
  "yan4-sla-page.js",
  "yan4-sla-page.css",
  "yan4-stow-error-page.js",
  "yan4-stow-error-page.css",
  "yan4-rcrt-label-print.js",
  "yan4-bipyo-label-print.js",
  "yan4-location-consolidation-page.js",
  "yan4-damage-verify-page.js",
  "yan4-avail-history-page.js",
];

const vendorFiles = [
  "chart.umd.min.js",
  "xlsx.full.min.js",
  "JsBarcode.all.min.js",
  "qrcode.min.js",
  "html2canvas.min.js",
];

const mediaFiles = [
  "stow-watch-alarm.wav",
  "SR.wav",
  "farm-fresh-seal.png",
  "gomgom-logo.png",
];

fs.mkdirSync(outVendor, { recursive: true });
fs.mkdirSync(outMedia, { recursive: true });

rootFiles.forEach(function (f) {
  copyFile(path.join(extRoot, f), path.join(outVendor, f));
});
vendorFiles.forEach(function (f) {
  copyFile(path.join(extRoot, "vendor", f), path.join(outVendor, f));
});
mediaFiles.forEach(function (f) {
  copyFile(path.join(extRoot, "media", f), path.join(outMedia, f));
});
