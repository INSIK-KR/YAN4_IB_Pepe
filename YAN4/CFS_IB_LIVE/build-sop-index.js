"use strict";

/**
 * Fresh-Inbound-SOP.pdf → assets/sop/sop-index.json (페이지별 텍스트)
 * 런타임 검색을 findInPage 대신 인덱스 조회로 빠르게.
 */
const fs = require("fs");
const path = require("path");

/** 프로젝트 폴더 파일이 0.1초쯤 잠겨 open 이 UNKNOWN 으로 실패할 때가 있음 → 잠시 뒤 다시 씀 */
async function writeFileWithRetry(file, text) {
  for (var attempt = 1; ; attempt++) {
    try {
      fs.writeFileSync(file, text, "utf8");
      return;
    } catch (e) {
      if (attempt >= 10) throw e;
      await new Promise(function (r) {
        setTimeout(r, 200);
      });
    }
  }
}

async function main() {
  const root = __dirname;
  const pdfPath = path.join(root, "assets", "sop", "Fresh-Inbound-SOP.pdf");
  const outPath = path.join(root, "assets", "sop", "sop-index.json");
  if (!fs.existsSync(pdfPath)) {
    console.error("[build-sop-index] PDF 없음:", pdfPath);
    process.exit(1);
  }

  const pdfjs = require("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data: data, useSystemFonts: true }).promise;
  const pages = [];
  for (var i = 1; i <= doc.numPages; i++) {
    var page = await doc.getPage(i);
    var tc = await page.getTextContent();
    var text = (tc.items || [])
      .map(function (it) {
        return it && it.str != null ? String(it.str) : "";
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ page: i, text: text });
    if (i % 10 === 0 || i === doc.numPages) {
      process.stdout.write(
        "[build-sop-index] " + i + "/" + doc.numPages + "\r"
      );
    }
  }
  var payload = {
    source: "Fresh-Inbound-SOP.pdf",
    builtAt: new Date().toISOString(),
    pageCount: pages.length,
    pages: pages,
  };
  await writeFileWithRetry(outPath, JSON.stringify(payload));
  var kb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(
    "\n[build-sop-index] OK",
    outPath,
    pages.length + " pages,",
    kb + " KB"
  );
}

main().catch(function (e) {
  console.error("[build-sop-index]", e && e.stack ? e.stack : e);
  process.exit(1);
});
