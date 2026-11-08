"use strict";

const CUTLINE_HEADER = "출고 커트라인";
const DATE_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function cellText(html) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellsOf(html, tag) {
  const re = new RegExp("<" + tag + "\\b[\\s\\S]*?</" + tag + ">", "gi");
  return (html.match(re) || []).map(cellText);
}

/**
 * 오더 상세 HTML에서 출고 커트라인만 꺼낸다. 운송장이 여러 개면 서로 다른 값을 모두 돌려준다.
 * found=false 는 커트라인 표 자체가 없는 경우 (센터가 다르거나 없는 오더 등)
 */
function parseCutlines(html) {
  const values = [];
  const headers = [];
  let found = false;
  const page = String(html || "");
  const tables = page.match(/<table\b[\s\S]*?<\/table>/gi) || [];
  tables.forEach(function (table) {
    const head = /<thead\b[\s\S]*?<\/thead>/i.exec(table);
    if (!head) return;
    const names = cellsOf(head[0], "th");
    headers.push.apply(headers, names);
    const index = names.indexOf(CUTLINE_HEADER);
    if (index < 0) return;
    found = true;
    const body = /<tbody\b[\s\S]*?<\/tbody>/i.exec(table);
    if (!body) return;
    (body[0].match(/<tr\b[\s\S]*?<\/tr>/gi) || []).forEach(function (row) {
      const value = cellsOf(row, "td")[index];
      if (value && DATE_TIME.test(value) && values.indexOf(value) < 0) values.push(value);
    });
  });
  if (found) return { found: true, values: values };
  // 원인 확인용. 오더 내용이 담길 수 있는 긴 페이지의 본문은 넣지 않는다
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(page);
  const redirect = /location(?:\.href|\.replace)?\s*[=(]\s*['"]([^'"?]+)/i.exec(page);
  const text = page.length < 3000 ? cellText(page.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")).slice(0, 100) : "";
  const diagnostic =
    "표 " + tables.length + "개 · 응답 " + page.length + "자" +
    (title ? " · 제목 " + cellText(title[1]) : "") +
    (headers.length ? " · 머리글 " + headers.join(", ").slice(0, 160) : "") +
    (redirect ? " · 이동 스크립트 " + redirect[1] : "") +
    (text ? " · 내용 " + text : "");
  return { found: false, values: values, diagnostic: diagnostic };
}

/** 출고 목록 검색 폼 그대로의 본문 (빈 칸도 브라우저처럼 함께 보낸다) */
function buildOrderSearchBody(orderNumber, start, end) {
  return new URLSearchParams([
    ["page", ""],
    ["start", start],
    ["end", end],
    ["searched", "false"],
    ["backwardKey", ""],
    ["forwardKey", ""],
    ["searchKey", ""],
    ["shipmentStatus", ""],
    ["shippingCompanyId", ""],
    ["shippingType", ""],
    ["pageSize", "20"],
    ["processPathGroupId", ""],
    ["workFlowStatus", ""],
    ["rebatchType", ""],
    ["reShipType", ""],
    ["pickingType", ""],
    ["batchId", ""],
    ["orderNumber", orderNumber],
    ["shipmentId", ""],
    ["skuId", ""],
    ["skuExternalId", ""],
    ["barcode", ""],
    ["invoiceNumber", ""],
  ]).toString();
}

/**
 * 검색 결과의 주문 ID. 주문 번호에 링크가 없는 줄은 같은 줄의 쉽먼트 ID 링크에 주문 ID가 있다.
 * 다른 오더의 링크가 섞이지 않게 주문 번호 칸이 일치하는 줄만 본다
 */
function parseOrderIds(html, orderNumber) {
  const ids = [];
  (String(html || "").match(/<tr\b[\s\S]*?<\/tr>/gi) || []).forEach(function (row) {
    if (cellsOf(row, "td").indexOf(orderNumber) < 0) return;
    const re = /<a\b[^>]*href="[^"]*\/order\/detail\/(\d+)[^"]*"/gi;
    let m;
    while ((m = re.exec(row))) {
      if (ids.indexOf(m[1]) < 0) ids.push(m[1]);
    }
  });
  return ids;
}

function addDays(date, days) {
  const [y, m, d] = String(date).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

module.exports = { parseCutlines, buildOrderSearchBody, parseOrderIds, addDays, cellText, cellsOf };
