"use strict";

/**
 * signAndEditExecutable=false 이면 내부 exe 리소스가 Electron 기본값으로 남음
 * (작업 관리자 이름 "Electron") → 캐시된 rcedit로 직접 기록
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function findRcedit() {
  const cache = path.join(
    process.env.LOCALAPPDATA || "",
    "electron-builder",
    "Cache",
    "winCodeSign"
  );
  let dirs = [];
  try {
    dirs = fs.readdirSync(cache);
  } catch (e) {
    return "";
  }
  for (let i = 0; i < dirs.length; i++) {
    const p = path.join(cache, dirs[i], "rcedit-x64.exe");
    if (fs.existsSync(p)) return p;
  }
  return "";
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const info = context.packager.appInfo;
  const exe = path.join(context.appOutDir, info.productFilename + ".exe");
  const rcedit = findRcedit();
  if (!rcedit || !fs.existsSync(exe)) {
    console.warn("[after-pack] rcedit 또는 exe 없음 — 리소스 편집 생략");
    return;
  }
  const ver = info.version;
  const args = [
    exe,
    "--set-version-string", "FileDescription", info.productName,
    "--set-version-string", "ProductName", info.productName,
    "--set-version-string", "CompanyName", info.companyName || "YAN4 IB Pepe",
    "--set-version-string", "LegalCopyright", info.copyright || "",
    "--set-version-string", "OriginalFilename", info.productFilename + ".exe",
    "--set-version-string", "InternalName", info.productFilename,
    "--set-file-version", ver,
    "--set-product-version", ver,
  ];
  const icon = path.join(context.packager.projectDir, "build", "icon.ico");
  if (fs.existsSync(icon)) args.push("--set-icon", icon);
  const r = spawnSync(rcedit, args, { stdio: "inherit" });
  if (r.status !== 0) {
    throw new Error("rcedit 실패 (exit " + r.status + ")");
  }
  console.log("[after-pack] exe 리소스 기록:", info.productName, ver);
};
