"use strict";

/**
 * htp-calc.js 결과를 엑셀 Status 값과 비교한다.
 * 사용: node tools/verify.js <mos.tsv> <status.json>
 *  - mos.tsv: 엑셀 MOS 시트를 탭 구분으로 내보낸 파일 (머리글 포함)
 *  - status.json: { status: {셀주소: 값}, vehicles: [...] } — 엑셀 Status 시트 계산값
 */
const fs = require("fs");
const path = require("path");
const calc = require(path.join(__dirname, "..", "renderer", "htp-calc.js"));

const [mosPath, statusPath] = process.argv.slice(2);
if (!mosPath || !statusPath) {
  console.error("usage: node tools/verify.js <mos.tsv> <status.json>");
  process.exit(1);
}

const table = calc.tsvToTable(fs.readFileSync(mosPath, "utf8"));
const parsed = calc.parseMosTable(table);
const xl = JSON.parse(fs.readFileSync(statusPath, "utf8")).status;

const inputs = {
  target: xl.D2,
  rates: { day: xl.F3, swing: xl.G3, night: xl.H3 },
  obPlan: xl.E5,
  sop: {
    d1: { direct: xl.D8, xdock: xl.D9, rc: xl.D10, rocketmart: xl.D11 },
    d0: { direct: xl.E8, xdock: xl.E9, rc: xl.E10, rocketmart: xl.E11 },
  },
};
const t0 = Date.now();
const m = calc.computeStatus(parsed.rows, inputs);
console.log("rows", parsed.rows.length, "missing", parsed.missing, "compute ms", Date.now() - t0);

const COLS = "F G H I J K L M N O P Q R S T U V W X Y Z AA AB AC".split(" ");
let fail = 0;
let checked = 0;
function check(label, mine, cell) {
  const want = typeof xl[cell] === "number" ? xl[cell] : 0;
  const got = mine === null || mine === undefined ? 0 : mine;
  checked++;
  if (Math.abs(got - want) > 1e-6 * Math.max(1, Math.abs(want))) {
    fail++;
    if (fail <= 40) console.log("DIFF", label, cell, "excel", want, "app", got);
  }
}
function checkHourly(label, hourly, row) {
  calc.HOURS.forEach(function (h, i) {
    check(label + "@" + h, hourly[h], COLS[i] + row);
  });
}

check("HTP Actual", m.summary.htpActual, "D3");
checkHourly("하차", m.hourly.unload, 22);
checkHourly("직납하차", m.hourly.unloadDirect, 23);
checkHourly("이관하차", m.hourly.unloadTransfer, 24);
checkHourly("매입개별", m.hourly.receiveEach, 26);
checkHourly("매입팔레트", m.hourly.receivePallet, 27);
checkHourly("진열개별", m.hourly.stowEach, 29);
checkHourly("진열팔레트", m.hourly.stowPallet, 30);
checkHourly("생산성", m.hourly.productivity, 20);
checkHourly("직납건 개별", m.stowMix.direct.each, 32);
checkHourly("직납건 팔레트", m.stowMix.direct.pallet, 33);
[35, 38, 41].forEach(function (row, i) {
  checkHourly("직납 " + m.stowMix.directParts[i].label + " 개별", m.stowMix.directParts[i].each, row);
  checkHourly("직납 " + m.stowMix.directParts[i].label + " 팔레트", m.stowMix.directParts[i].pallet, row + 1);
});
[47, 50, 53, 56].forEach(function (row, i) {
  const p = m.stowMix.transferParts[i];
  // 로켓마트는 엑셀에서 개별(56)·팔레트(57) 순서
  checkHourly("이관 " + p.label + " 개별", p.each, row);
  checkHourly("이관 " + p.label + " 팔레트", p.pallet, row + 1);
});
checkHourly("직접공정", m.process.direct.hourly, 58);
checkHourly("간접공정", m.process.indirect.hourly, 59);
checkHourly("센터공정", m.process.centre.hourly, 60);
check("직접공정 총계", m.process.direct.total, "E58");
check("간접공정 총계", m.process.indirect.total, "E59");
check("센터공정 총계", m.process.centre.total, "E60");

const MH_ROWS = {
  teamCaptain: 62, stow: 64, console1: 65, console2: 66, stowPs: 67, stowTraining: 68, stowWait: 69,
  receive: 71, receivePs: 72, receiveWait: 73, dockMaster: 75, unloadDirect: 76, unloadTransfer: 77,
  unloadWait: 78, sorter: 79, shrink: 81, prepack: 82, forklift1: 84, forklift2: 85, pbox: 87,
  signalman: 88, project1: 89, project2: 90, safetyTraining: 91, onboarding: 92, legalTraining: 93,
};
m.tasks.forEach(function (t) {
  const row = MH_ROWS[t.key];
  checkHourly("MH " + t.label, t.hourly, row);
  check("MH 총계 " + t.label, t.total, "E" + row);
  check("지연 " + t.label, t.delay, "E" + (row + 34));
});

console.log("checked", checked, "diff", fail);
process.exit(fail ? 1 : 0);
