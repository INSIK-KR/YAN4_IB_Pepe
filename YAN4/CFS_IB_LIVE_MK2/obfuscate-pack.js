"use strict";

/**
 * Copy app files into .dist-pack/ and obfuscate first-party JS for portable builds.
 * Source tree (main.js, renderer/) stays readable for npm start.
 */
const fs = require("fs");
require("./build-fs-retry");
const path = require("path");
const JavaScriptObfuscator = require("javascript-obfuscator");

const root = __dirname;
const packDir = path.join(root, ".dist-pack");
const LARGE_KB = 120;

const SKIP_NAME_RE = /\.min\.js$/i;
const SKIP_BASENAMES = new Set([
  "chart.umd.min.js",
  "xlsx.full.min.js",
  "JsBarcode.all.min.js",
  "qrcode.min.js",
  "html2canvas.min.js",
  /* 튜토리얼 예시 데이터 — 데이터라 난독화 불필요(3MB+) */
  "yan4-tutorial-sample.js",
]);

const COPY_ROOT_FILES = ["main.js", "preload.js", "preload-sop.js", "package.json"];

function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  mkdirp(dest);
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) copyDir(from, to);
    else copyFile(from, to);
  }
}

function shouldObfuscate(filePath) {
  if (!/\.js$/i.test(filePath)) return false;
  const base = path.basename(filePath);
  if (SKIP_NAME_RE.test(base) || SKIP_BASENAMES.has(base)) return false;
  return true;
}

function obfuscatorOptions(filePath, source) {
  const large = Buffer.byteLength(source, "utf8") >= LARGE_KB * 1024;
  const base = {
    compact: true,
    identifierNamesGenerator: "hexadecimal",
    renameGlobals: false,
    selfDefending: false,
    debugProtection: false,
    disableConsoleOutput: false,
    stringArray: true,
    /* rotate 는 빌드마다 무작위로 yan4-sla-page.js 를 깨뜨림(1.0.88 charAt 오류) → 끄고 seed 고정 */
    rotateStringArray: false,
    seed: 20261030,
    stringArrayThreshold: large ? 0.6 : 0.75,
    stringArrayEncoding: ["base64"],
    splitStrings: !large,
    splitStringsChunkLength: 8,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    reservedNames: [
      "^require$",
      "^exports$",
      "^module$",
      "^__dirname$",
      "^__filename$",
      "^process$",
      "^Buffer$",
      "^global$",
      "^window$",
      "^document$",
      "^chrome$",
      "^ElectronAPI$",
    ],
  };
  if (large) {
    /* shell.js / sla 등 대용량 — 제어흐름 펼치기는 용량·시간 부담이 커서 생략 */
    return Object.assign(base, {
      controlFlowFlattening: false,
      deadCodeInjection: false,
      numbersToExpressions: false,
    });
  }
  return Object.assign(base, {
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.4,
    deadCodeInjection: false,
    numbersToExpressions: true,
  });
}

function obfuscateFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const result = JavaScriptObfuscator.obfuscate(
    source,
    obfuscatorOptions(filePath, source)
  );
  fs.writeFileSync(filePath, result.getObfuscatedCode(), "utf8");
}

function walkJs(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkJs(p, out);
    else if (shouldObfuscate(p)) out.push(p);
  }
}

function writePackPackageJson() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
  );
  const packPkg = {
    name: pkg.name,
    version: pkg.version,
    private: true,
    description: pkg.description,
    author: pkg.author,
    main: "main.js",
  };
  fs.writeFileSync(
    path.join(packDir, "package.json"),
    JSON.stringify(packPkg, null, 2) + "\n",
    "utf8"
  );
}

function main() {
  console.log("[obfuscate-pack] preparing", packDir);
  rmrf(packDir);
  mkdirp(packDir);

  for (const name of COPY_ROOT_FILES) {
    if (name === "package.json") continue;
    copyFile(path.join(root, name), path.join(packDir, name));
  }
  writePackPackageJson();

  const iconSrc = path.join(root, "build", "icon.ico");
  if (fs.existsSync(iconSrc)) {
    copyFile(iconSrc, path.join(packDir, "build", "icon.ico"));
  }

  copyDir(path.join(root, "renderer"), path.join(packDir, "renderer"));

  const targets = [
    path.join(packDir, "main.js"),
    path.join(packDir, "preload.js"),
    path.join(packDir, "preload-sop.js"),
  ];
  walkJs(path.join(packDir, "renderer"), targets);

  let n = 0;
  for (const file of targets) {
    if (!fs.existsSync(file) || !shouldObfuscate(file)) continue;
    const kb = (fs.statSync(file).size / 1024).toFixed(1);
    process.stdout.write("[obfuscate-pack] " + path.relative(packDir, file) + " (" + kb + " KB)… ");
    obfuscateFile(file);
    const kb2 = (fs.statSync(file).size / 1024).toFixed(1);
    console.log("→ " + kb2 + " KB");
    n++;
  }
  console.log("[obfuscate-pack] done — " + n + " file(s)");
}

main();
