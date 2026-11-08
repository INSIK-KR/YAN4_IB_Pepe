"use strict";

const { cellText, cellsOf, addDays } = require("./wms-order");

// CFS IB LIVE ATS 화면과 같은 이관현황 조회 조건
const PAGING_BASES = [
  "https://inbound.coupang.com/transfer/admin/operation/paging",
  "https://inbound.coupang.com/transfer/admin/operation/same-center/paging",
];
const SEARCH_DATE_TYPE = "PICKING_START_DATE";
const LOOKBACK_DAYS = 30;
const PAGE_CAP = 8;

function normKey(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function buildTransferUrl(base, cart, center, date, page) {
  const p = new URLSearchParams([
    ["page", String(page)],
    ["skuBarcode", ""],
    ["skuExternalId", ""],
    ["skuId", ""],
    ["vehicleNumber", ""],
    ["status", ""],
    ["containerBarcode", ""],
    ["transferCartPriority", ""],
    ["toCenterCode", center],
    ["centerCode", ""],
    ["transferAllocationType", ""],
    ["transferPlanExternalId", ""],
    ["cartBarcode", cart.toUpperCase()],
    ["searchDateType", SEARCH_DATE_TYPE],
    ["end", addDays(date, 1)],
    ["start", addDays(date, -LOOKBACK_DAYS)],
  ]);
  return base + "?" + p.toString();
}

function findCol(headers, names) {
  for (const name of names) {
    const index = headers.indexOf(normKey(name));
    if (index >= 0) return index;
  }
  return -1;
}

/** 이관현황 표의 줄. 고객 정보는 없지만 필요한 칸만 꺼낸다 */
function parseTransferRows(html) {
  const tables = String(html || "").match(/<table\b[\s\S]*?<\/table>/gi) || [];
  for (const table of tables) {
    const head = /<thead\b[\s\S]*?<\/thead>/i.exec(table);
    if (!head) continue;
    const labels = cellsOf(head[0], "th");
    const headers = labels.map(normKey);
    const iTote = findCol(headers, ["토트바코드"]);
    if (iTote < 0) continue;
    const iCt = findCol(headers, ["컨테이너바코드"]);
    const iLoad = findCol(headers, ["상차완료시간", "상차완료일시"]);
    const iUnload = findCol(headers, ["하차완료일시", "하차일시"]);
    const iStow = findCol(headers, ["진열완료일시", "진열완료시간", "진열완료시각", "진열일시"]);
    const iVehicle = findCol(headers, ["차량번호"]);
    const body = /<tbody\b[\s\S]*?<\/tbody>/i.exec(table);
    const rows = [];
    ((body && body[0].match(/<tr\b[\s\S]*?<\/tr>/gi)) || []).forEach(function (tr) {
      if (/<td\b[^>]*colspan/i.test(tr)) return;
      const tds = cellsOf(tr, "td");
      if (!tds.length) return;
      const at = function (i) {
        return i >= 0 ? tds[i] || "" : "";
      };
      rows.push({ tote: at(iTote), ct: at(iCt), load: at(iLoad), unload: at(iUnload), stow: at(iStow), vehicle: at(iVehicle) });
    });
    return { rows: rows, labels: labels, hasStow: iStow >= 0 };
  }
  return { rows: [], labels: [], hasStow: false };
}

/** GC는 재사용되므로 컨테이너(CT)까지 맞는 줄을 고른다. ctMatched=false 면 GC만 맞은 첫 줄 */
function pickTransferRow(rows, cart, ct) {
  const cartKey = normKey(cart);
  const ctKey = normKey(ct);
  const sameCart = rows.filter(function (row) {
    return normKey(row.tote) === cartKey;
  });
  const exact = ctKey
    ? sameCart.find(function (row) {
        return normKey(row.ct) === ctKey;
      })
    : null;
  return { row: exact || sameCart[0] || null, ctMatched: !!exact };
}

function hasNextPage(html, page) {
  const tag = /<w-page-next\b[^>]*>/i.exec(String(html || ""));
  if (!tag || /\bdisabled\b/i.test(tag[0])) return false;
  const dataPage = /data-page="(\d+)"/i.exec(tag[0]);
  return dataPage ? Number(dataPage[1]) - 1 > page : true;
}

module.exports = { PAGING_BASES, PAGE_CAP, buildTransferUrl, parseTransferRows, pickTransferRow, hasNextPage, cellText };
