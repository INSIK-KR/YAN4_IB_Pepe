"use strict";

/**
 * 1) Obfuscate into .dist-pack/
 * 2) Build portable EXE to %LOCALAPPDATA% (avoids workspace file locks)
 * 3) Copy only the .exe into ./release/
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = __dirname;
const pkg = require("./package.json");
const version = pkg.version;
const productName = (pkg.build && pkg.build.productName) || "YAN4 IB LIVE_by Pepe";
const packDir = path.join(root, ".dist-pack");
const outDir = path.join(
  process.env.LOCALAPPDATA || path.join(require("os").homedir(), "AppData", "Local"),
  "YAN4ShellDesktop",
  "release"
);
const exeName = productName + " " + version + ".exe";
const builtExe = path.join(outDir, exeName);
const releaseDir = path.join(root, "release");
const destExe = path.join(releaseDir, exeName);

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

run("node", ["obfuscate-pack.js"]);
if (!fs.existsSync(path.join(packDir, "main.js"))) {
  console.error("obfuscate pack missing main.js:", packDir);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
run("npx", [
  "electron-builder",
  "--win",
  "portable",
  "--config.directories.app=" + packDir,
  "--config.directories.output=" + outDir,
]);

if (!fs.existsSync(builtExe)) {
  console.error("build missing:", builtExe);
  process.exit(1);
}

fs.mkdirSync(releaseDir, { recursive: true });
fs.readdirSync(releaseDir).forEach(function (name) {
  if (
    (/^YAN4 IB LIVE_by Pepe .*\.exe$/i.test(name) ||
      /^YAN4-IB-Shell .*\.exe$/i.test(name)) &&
    name !== exeName
  ) {
    try {
      fs.unlinkSync(path.join(releaseDir, name));
    } catch (e) {}
  }
});
fs.copyFileSync(builtExe, destExe);
console.log("OK", destExe, "(" + fs.statSync(destExe).size + " bytes)");
