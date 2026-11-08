"use strict";

/**
 * 배포용 파일을 .dist-pack/ 에 복사하고 직접 작성한 코드를 난독화한다 (CFS IB PS와 같은 방식).
 * 원본(main.js, src/)은 그대로라 npm start 는 읽을 수 있는 코드로 돈다.
 */
const fs = require("fs");
const path = require("path");
const JavaScriptObfuscator = require("javascript-obfuscator");

const root = __dirname;
const packDir = path.join(root, ".dist-pack");
const LARGE_KB = 120;
const ROOT_SCRIPTS = ["main.js", "preload.js", "powerbi-export.js", "wms-order.js", "wms-transfer.js"];
const QUERY_REQUIRE = 'require("./powerbi-query.json")';

function obfuscatorOptions(source, renameGlobals) {
  const large = Buffer.byteLength(source, "utf8") >= LARGE_KB * 1024;
  const base = {
    compact: true,
    identifierNamesGenerator: "hexadecimal",
    renameGlobals: renameGlobals,
    selfDefending: false,
    debugProtection: false,
    disableConsoleOutput: false,
    stringArray: true,
    rotateStringArray: true,
    stringArrayThreshold: large ? 0.6 : 0.75,
    stringArrayEncoding: ["base64"],
    splitStrings: !large,
    splitStringsChunkLength: 8,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    reservedNames: ["^require$", "^exports$", "^module$", "^__dirname$", "^__filename$", "^process$", "^Buffer$", "^global$", "^window$", "^document$"],
  };
  // 화면 묶음처럼 큰 파일은 제어 흐름까지 펼치면 용량과 실행 부담이 커서 생략한다
  return large
    ? Object.assign(base, { controlFlowFlattening: false, deadCodeInjection: false, numbersToExpressions: false })
    : Object.assign(base, { controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.4, deadCodeInjection: false, numbersToExpressions: true });
}

function obfuscate(file) {
  const source = fs.readFileSync(file, "utf8");
  const before = (Buffer.byteLength(source) / 1024).toFixed(1);
  // CommonJS 파일의 최상위 이름은 모듈 안에서만 쓰여 바꿔도 안전하다. 화면 묶음은 이미 압축되어 있어 그대로 둔다
  const renameGlobals = path.dirname(file) === packDir;
  fs.writeFileSync(file, JavaScriptObfuscator.obfuscate(source, obfuscatorOptions(source, renameGlobals)).getObfuscatedCode(), "utf8");
  console.log("[obfuscate-pack] " + path.relative(packDir, file) + " " + before + " KB → " + (fs.statSync(file).size / 1024).toFixed(1) + " KB");
}

function main() {
  fs.rmSync(packDir, { recursive: true, force: true });
  fs.mkdirSync(packDir, { recursive: true });
  ROOT_SCRIPTS.forEach(function (name) {
    fs.copyFileSync(path.join(root, name), path.join(packDir, name));
  });
  fs.cpSync(path.join(root, "dist"), path.join(packDir, "dist"), { recursive: true });
  fs.mkdirSync(path.join(packDir, "build"), { recursive: true });
  fs.copyFileSync(path.join(root, "build", "icon.png"), path.join(packDir, "build", "icon.png"));

  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  fs.writeFileSync(
    path.join(packDir, "package.json"),
    JSON.stringify({ name: pkg.name, version: pkg.version, private: true, description: pkg.description, author: pkg.author, main: "main.js" }, null, 2) + "\n",
    "utf8"
  );

  // 쿼리 JSON이 평문 파일로 남지 않게 코드 안에 넣어 함께 난독화한다
  const exportPath = path.join(packDir, "powerbi-export.js");
  const exportSource = fs.readFileSync(exportPath, "utf8");
  if (exportSource.indexOf(QUERY_REQUIRE) < 0) throw new Error("powerbi-export.js 에서 쿼리 불러오는 줄을 찾지 못했습니다");
  const query = JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, "powerbi-query.json"), "utf8")));
  // 객체로 넣으면 항목 이름이 평문으로 남아서 문자열 하나로 넣는다
  fs.writeFileSync(exportPath, exportSource.split(QUERY_REQUIRE).join("JSON.parse(" + JSON.stringify(query) + ")"), "utf8");

  const assets = path.join(packDir, "dist", "assets");
  const targets = ROOT_SCRIPTS.map(function (name) {
    return path.join(packDir, name);
  }).concat(
    fs
      .readdirSync(assets)
      .filter(function (name) {
        return /\.js$/i.test(name);
      })
      .map(function (name) {
        return path.join(assets, name);
      })
  );
  targets.forEach(obfuscate);
  console.log("[obfuscate-pack] 완료 " + targets.length + "개 파일");
}

main();
