/**
 * Kenney Tiny Battle → assets/kenney/tilemap_packed.png
 * Place kenney_tiny-battle.zip in assets/incoming/ then: npm run setup-kenney
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const INCOMING = path.join(ROOT, "assets", "incoming", "kenney_tiny-battle.zip");
const OUT_DIR = path.join(ROOT, "assets", "kenney");
const OUT_FILE = path.join(OUT_DIR, "tilemap_packed.png");

const CANDIDATES = [
  "Tilemap/tilemap_packed.png",
  "tilemap_packed.png",
  "PNG/Tilemap/tilemap_packed.png",
  "kenney_tiny-battle/Tilemap/tilemap_packed.png",
];

function copyFromZip() {
  if (!fs.existsSync(INCOMING)) return false;
  const AdmZip = tryRequire("adm-zip");
  if (!AdmZip) {
    console.warn("[setup-kenney] adm-zip 없음 — zip 수동 압축 해제 후 tilemap_packed.png 복사");
    return false;
  }
  const zip = new AdmZip(INCOMING);
  const entries = zip.getEntries();
  for (const rel of CANDIDATES) {
    const entry = entries.find(function (e) {
      return e.entryName.replace(/\\/g, "/").endsWith(rel);
    });
    if (entry) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(OUT_FILE, entry.getData());
      console.log("[setup-kenney] extracted", entry.entryName, "→", OUT_FILE);
      return true;
    }
  }
  const any = entries.find(function (e) {
    return /tilemap_packed\.png$/i.test(e.entryName);
  });
  if (any) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, any.getData());
    console.log("[setup-kenney] extracted", any.entryName);
    return true;
  }
  return false;
}

function tryRequire(name) {
  try {
    return require(name);
  } catch (e) {
    return null;
  }
}

function main() {
  if (fs.existsSync(OUT_FILE)) {
    console.log("[setup-kenney] OK —", OUT_FILE);
    return;
  }
  if (copyFromZip()) return;
  console.log(
    "[setup-kenney] tilemap 없음.\n" +
      "  1) https://kenney.nl/assets/tiny-battle 에서 다운로드\n" +
      "  2) kenney_tiny-battle.zip → assets/incoming/\n" +
      "  3) npm run setup-kenney\n" +
      "또는 Tilemap/tilemap_packed.png 를 assets/kenney/ 에 직접 복사"
  );
  process.exitCode = 1;
}

main();
