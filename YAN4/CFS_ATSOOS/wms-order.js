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
  let found = false;
  (String(html || "").match(/<table\b[\s\S]*?<\/table>/gi) || []).forEach(function (table) {
    const head = /<thead\b[\s\S]*?<\/thead>/i.exec(table);
    if (!head) return;
    const index = cellsOf(head[0], "th").indexOf(CUTLINE_HEADER);
    if (index < 0) return;
    found = true;
    const body = /<tbody\b[\s\S]*?<\/tbody>/i.exec(table);
    if (!body) return;
    (body[0].match(/<tr\b[\s\S]*?<\/tr>/gi) || []).forEach(function (row) {
      const value = cellsOf(row, "td")[index];
      if (value && DATE_TIME.test(value) && values.indexOf(value) < 0) values.push(value);
    });
  });
  return { found: found, values: values };
}

module.exports = { parseCutlines };
