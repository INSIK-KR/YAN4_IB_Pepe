"use strict";

// powerbi-query.json 은 리포트의 "데이터 내보내기" 요청 본문을 그대로 저장한 것.
// 리포트의 열이나 필터가 바뀌면 새로 캡처한 본문으로 이 파일을 교체한다.
const template = require("./powerbi-query.json");

function setFilter(where, property, literals) {
  const hit = where.find(function (w) {
    const cond = w.Condition && w.Condition.In;
    return cond && cond.Expressions[0].Column && cond.Expressions[0].Column.Property === property;
  });
  if (!hit) throw new Error("내보내기 쿼리에서 " + property + " 필터를 찾지 못했습니다");
  hit.Condition.In.Values = literals.map(function (value) {
    return [{ Literal: { Value: value } }];
  });
}

/** centers: "YAN4" 또는 ["YAN4", "BUC2"], date: "YYYY-MM-DD" */
function buildAtsOosBody(centers, date) {
  const list = Array.from(new Set(Array.isArray(centers) ? centers : [centers]));
  if (!list.length) throw new Error("센터를 하나 이상 선택해 주세요");
  list.forEach(function (center) {
    if (!/^[A-Z][A-Z0-9]*$/.test(String(center))) throw new Error("센터 코드 형식이 올바르지 않습니다");
  });
  const m = /^\d{4}-(\d{2})-\d{2}$/.exec(String(date));
  if (!m) throw new Error("날짜 형식이 올바르지 않습니다");
  const month = Number(m[1]);

  const body = JSON.parse(JSON.stringify(template));
  const commands = body.executeSemanticQueryRequest.queries[0].Query.Commands;
  const where = commands[0].SemanticQueryDataShapeCommand.Query.Where;
  setFilter(
    where,
    "centercode",
    list.map(function (center) {
      return "'" + center + "'";
    })
  );
  setFilter(where, "oos_date", ["datetime'" + date + "T00:00:00'"]);
  setFilter(where, "Month", [month + "L"]);
  commands[1].ExportDataCommand.FiltersDescription =
    "적용된 필터: \ncentercode " + list.join(" 또는 ") + "임\noos_date " + date + "임\nMonth " + month + "임\nrcvtype NOT_MATCHED 또는 (공백)이(가) 아님";
  return body;
}

module.exports = { buildAtsOosBody };
