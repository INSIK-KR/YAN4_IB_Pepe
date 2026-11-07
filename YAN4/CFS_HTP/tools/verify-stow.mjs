// 진열 생산성 계산을 엑셀 "진열자 생산성 대시보드"의 작업자 시트 값과 대조
// node tools/verify-stow.mjs <MOS 시트를 탭 구분으로 내보낸 파일> <작업자 시트 값 JSON>
import fs from "node:fs";
import { parseMosTable, tsvToTable } from "../src/lib/htp-calc.mjs";
import { computeStowProductivity } from "../src/lib/stow-prod.mjs";

const [mosPath, expectedPath] = process.argv.slice(2);
const parsed = parseMosTable(tsvToTable(fs.readFileSync(mosPath, "utf8")));
const result = computeStowProductivity(parsed.rows);
const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));

// 작업자 시트 열: A 작업자 … T 차트(하위25%)
const COLS = [
  ["employee", (w) => w.employee],
  ["contract", (w) => w.contract],
  ["temp", (w) => w.temp],
  ["qty", (w) => w.qty],
  ["mh", (w) => w.mh],
  ["htp", (w) => w.htp],
  ["each.qty", (w) => w.each.qty],
  ["each.mh", (w) => w.each.mh],
  ["eachHtp", (w) => w.eachHtp],
  ["pallet.qty", (w) => w.pallet.qty],
  ["pallet.mh", (w) => w.pallet.mh],
  ["pallet.htp", (w) => w.pallet.htp],
  ["case.qty", (w) => w.case.qty],
  ["case.mh", (w) => w.case.mh],
  ["case.htp", (w) => w.case.htp],
  ["totalMh", (w) => w.totalMh],
  ["stowShare", (w) => w.stowShare],
  ["band", (w) => w.band],
];

function same(a, b) {
  const blank = (v) => v === null || v === "" || v === undefined;
  if (blank(a) && blank(b)) return true;
  if (typeof b === "number" || typeof a === "number") return Math.abs(Number(a) - Number(b)) < 1e-6;
  return String(a) === String(b);
}

let checked = 0;
const diffs = [];
result.shifts.forEach((s) => {
  const rows = expected[s.label + " 작업자"];
  if (rows.length !== s.workers.length) diffs.push(`${s.label}: 인원 엑셀 ${rows.length} 앱 ${s.workers.length}`);
  rows.forEach((row, i) => {
    const w = s.workers[i];
    COLS.forEach(([name, get], c) => {
      checked++;
      const v = w ? get(w) : undefined;
      if (!same(v, row[c])) diffs.push(`${s.label} ${i + 2}행 ${name}: 엑셀 ${row[c]} 앱 ${v}`);
    });
  });
});
const d = expected.Dashboard;
[["C", 0], ["D", 1], ["E", 2]].forEach(([col, i]) => {
  const sm = result.shifts[i].summary;
  [
    [23, sm.q1],
    [24, sm.median],
    [25, sm.q3],
    [26, sm.otherWork],
  ].forEach(([r, v]) => {
    checked++;
    if (!same(v, d[col + r])) diffs.push(`Dashboard ${col}${r}: 엑셀 ${d[col + r]} 앱 ${v}`);
  });
});
console.log(diffs.slice(0, 40).join("\n"));
console.log("checked", checked, "diff", diffs.length);
