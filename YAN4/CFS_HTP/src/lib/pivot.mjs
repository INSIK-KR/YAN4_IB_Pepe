/**
 * MOS 행을 원하는 행·열로 묶어 보는 피벗 계산.
 * 입고 공정(TASKS)만 대상으로 하고, MH는 ManHour 시트와 같이 중복 행을 한 번만 센다 (체크인 지연 MH 미포함).
 */
import { HOURS, SHIFT_GROUPS, TASKS, manHourKey, workedFraction } from "./htp-calc.mjs";

const TASK_ORDER = TASKS.map(function (t) {
  return t.label;
});
const GROUP_ORDER = [];
const TASK_BY_NAME = {};
TASKS.forEach(function (t) {
  const group = t.group || "기타";
  TASK_BY_NAME[t.task] = { label: t.label, group: group };
  if (GROUP_ORDER.indexOf(group) < 0) GROUP_ORDER.push(group);
});

// Location → [온도대, 선반·팔레트]. 코드에 P가 있으면 팔레트. 1CT·1CPT·2CP·2CPZ 는 표에 없지만 엑셀 묶음(LOC)에 있어 넣어 둔다
export const ZONE_BY_LOC = {
  "1A": ["상온", "선반"],
  "1AP": ["상온", "팔레트"],
  "1APR": ["로켓마트", "팔레트"],
  "1AR": ["로켓마트", "선반"],
  "1PC": ["냉장", "팔레트"],
  "1C": ["냉장", "선반"],
  "1CE": ["냉장", "선반"],
  "1CM": ["냉장", "선반"],
  "1CP": ["냉장", "팔레트"],
  "1CPE": ["냉장", "팔레트"],
  "1CPM": ["냉장", "팔레트"],
  "1F": ["냉동", "선반"],
  "1FM": ["냉동", "선반"],
  "1FP": ["냉동", "팔레트"],
  "1FPM": ["냉동", "팔레트"],
  "1CEZ": ["냉장", "선반"],
  "1CPZ": ["냉장", "팔레트"],
  "1FPZ": ["냉동", "팔레트"],
  "2C": ["냉장", "선반"],
  "2CM": ["냉장", "선반"],
  "1CT": ["냉장", "선반"],
  "1CPT": ["냉장", "팔레트"],
  "2CP": ["냉장", "팔레트"],
  "2CPZ": ["냉장", "팔레트"],
};
const NO_ZONE = ["기타", "기타"];
const TEMP_ORDER = ["상온", "냉장", "냉동", "로켓마트", "기타"];
const LOC_TYPE_ORDER = ["선반", "팔레트", "기타"];
const ZONE_ORDER = [];
TEMP_ORDER.slice(0, 4).forEach(function (t) {
  ZONE_ORDER.push(t + " 선반", t + " 팔레트");
});
ZONE_ORDER.push("기타");

const CHANNEL = { NORMAL: "직납", TRANSFER: "이관" };
// 하차는 MOS Inbound Type 이 비어 있어 공정으로 구분한다
const TASK_CHANNEL = { 직납하차: "직납", 이관하차: "이관" };
const PICK = { EACH: "개별", CASE: "케이스", PALLET: "팔레트" };

function hourName(h) {
  return String(h % 24).padStart(2, "0") + "시";
}

function shiftOfHour(h) {
  const g = SHIFT_GROUPS.find(function (x) {
    return h >= x.from && h <= x.to;
  });
  return g ? g.label : "";
}

// order 가 있으면 그 순서로, 없으면 합계 큰 순으로 줄을 세운다
const PIVOT_FIELDS = [
  { key: "group", label: "공정 묶음", order: GROUP_ORDER },
  { key: "task", label: "공정", order: TASK_ORDER },
  { key: "channel", label: "직납·이관", order: ["직납", "이관", "기타"] },
  { key: "temp", label: "온도대", order: TEMP_ORDER },
  { key: "locType", label: "선반·팔레트", order: LOC_TYPE_ORDER },
  { key: "zone", label: "온도대·유형", order: ZONE_ORDER },
  { key: "pick", label: "개별·팔레트", order: ["개별", "케이스", "팔레트", "기타"] },
  {
    key: "shiftGroup",
    label: "근무조",
    order: SHIFT_GROUPS.map(function (g) {
      return g.label;
    }),
  },
  { key: "hourName", label: "시간대", order: HOURS.map(hourName) },
  { key: "contract", label: "계약 형태" },
  { key: "location", label: "로케이션" },
  { key: "employee", label: "작업자" },
];

const PIVOT_MEASURES = [
  { key: "qty", label: "수량" },
  { key: "mh", label: "MH" },
  { key: "hc", label: "인원" },
  { key: "uph", label: "시간당 수량" },
];

/** MOS 행 → 피벗용 행. 자료가 바뀔 때 한 번만 만든다 */
function preparePivotRows(rows) {
  const seen = new Set();
  const out = [];
  rows.forEach(function (r) {
    const t = TASK_BY_NAME[r.task];
    if (!t || r.hour < HOURS[0] || r.hour > HOURS[HOURS.length - 1]) return;
    const key = manHourKey(r);
    let mh = 0;
    if (!seen.has(key)) {
      seen.add(key);
      mh = (workedFraction(r) * 24 * 8) / 9;
    }
    const zone = ZONE_BY_LOC[r.location] || NO_ZONE;
    out.push({
      group: t.group,
      task: t.label,
      channel: TASK_CHANNEL[t.label] || CHANNEL[r.inboundType] || "기타",
      temp: zone[0],
      locType: zone[1],
      zone: zone === NO_ZONE ? "기타" : zone[0] + " " + zone[1],
      pick: PICK[r.pickType] || "기타",
      shiftGroup: shiftOfHour(r.hour),
      hourName: hourName(r.hour),
      contract: r.contractType || "(없음)",
      location: r.location || "(없음)",
      employee: r.employee,
      qty: r.qty,
      mh: mh,
    });
  });
  return out;
}

function newCell(withPeople) {
  return { qty: 0, mh: 0, people: withPeople ? new Set() : null };
}

function addTo(cell, r) {
  cell.qty += r.qty;
  cell.mh += r.mh;
  if (cell.people) cell.people.add(r.employee);
}

function cellValue(cell, measure) {
  if (!cell) return null;
  if (measure === "qty") return cell.qty;
  if (measure === "mh") return cell.mh;
  if (measure === "hc") return cell.people.size;
  return cell.mh ? cell.qty / cell.mh : null;
}

function bucket(map, key, withPeople) {
  let c = map.get(key);
  if (!c) {
    c = newCell(withPeople);
    map.set(key, c);
  }
  return c;
}

function sortKeys(keys, field, totalOf) {
  const def = PIVOT_FIELDS.find(function (f) {
    return f.key === field;
  });
  if (def && def.order) {
    const rank = function (k) {
      const i = def.order.indexOf(k);
      return i < 0 ? def.order.length : i;
    };
    return keys.sort(function (a, b) {
      return rank(a) - rank(b);
    });
  }
  return keys.sort(function (a, b) {
    return (totalOf(b) || 0) - (totalOf(a) || 0) || String(a).localeCompare(String(b));
  });
}

/**
 * config: { row1, row2 (없으면 ""), col, measure, filters: { 필드: 값 } }
 * 반환: { cols, rows: [{ key, label, values, total, children }], colTotals, grandTotal, max }
 * 값이 없는 행은 뺀다. max 는 색칠 기준 (가장 아래 줄 칸의 최댓값).
 */
function computePivot(prepared, config) {
  const measure = config.measure;
  const filters = Object.entries(config.filters || {}).filter(function (e) {
    return e[1];
  });
  const withPeople = measure === "hc";
  const SEP = "\u0001";
  const leaf = new Map(); // r1|r2|c
  const leafTotal = new Map(); // r1|r2
  const parent = new Map(); // r1|c
  const parentTotal = new Map(); // r1
  const colTotal = new Map(); // c
  const grand = newCell(withPeople);

  prepared.forEach(function (r) {
    for (let i = 0; i < filters.length; i++) {
      if (r[filters[i][0]] !== filters[i][1]) return;
    }
    if (measure === "qty" ? !r.qty : measure === "mh" ? !r.mh : !r.qty && !r.mh) return;
    const r1 = r[config.row1];
    const c = r[config.col];
    addTo(bucket(parent, r1 + SEP + c, withPeople), r);
    addTo(bucket(parentTotal, r1, withPeople), r);
    addTo(bucket(colTotal, c, withPeople), r);
    addTo(grand, r);
    if (config.row2) {
      const r2 = r[config.row2];
      addTo(bucket(leaf, r1 + SEP + r2 + SEP + c, withPeople), r);
      addTo(bucket(leafTotal, r1 + SEP + r2, withPeople), r);
    }
  });

  const cols = sortKeys(Array.from(colTotal.keys()), config.col, function (k) {
    return cellValue(colTotal.get(k), measure);
  });

  function valuesOf(map, prefix) {
    const v = {};
    cols.forEach(function (c) {
      v[c] = cellValue(map.get(prefix + c), measure);
    });
    return v;
  }

  const childrenByParent = new Map();
  leafTotal.forEach(function (_cell, key) {
    const parts = key.split(SEP);
    if (!childrenByParent.has(parts[0])) childrenByParent.set(parts[0], []);
    childrenByParent.get(parts[0]).push(parts[1]);
  });

  let max = 0;
  function trackMax(values) {
    cols.forEach(function (c) {
      if ((values[c] || 0) > max) max = values[c];
    });
  }

  const parents = sortKeys(Array.from(parentTotal.keys()), config.row1, function (k) {
    return cellValue(parentTotal.get(k), measure);
  });
  function hasValue(row) {
    return !!row.total;
  }
  const rows = parents.map(function (r1) {
    const children = sortKeys(childrenByParent.get(r1) || [], config.row2, function (k) {
      return cellValue(leafTotal.get(r1 + SEP + k), measure);
    }).map(function (r2) {
      const values = valuesOf(leaf, r1 + SEP + r2 + SEP);
      trackMax(values);
      return { key: r1 + SEP + r2, label: r2, values: values, total: cellValue(leafTotal.get(r1 + SEP + r2), measure), children: [] };
    });
    const values = valuesOf(parent, r1 + SEP);
    if (!children.length) trackMax(values);
    return { key: r1, label: r1, values: values, total: cellValue(parentTotal.get(r1), measure), children: children.filter(hasValue) };
  }).filter(hasValue);

  const colTotals = {};
  cols.forEach(function (c) {
    colTotals[c] = cellValue(colTotal.get(c), measure);
  });
  return { cols: cols, rows: rows, colTotals: colTotals, grandTotal: cellValue(grand, measure), max: max };
}

/** 필터 목록에 보여줄 값 (자료에 있는 값만) */
function fieldValues(prepared, field) {
  const totals = new Map();
  prepared.forEach(function (r) {
    totals.set(r[field], (totals.get(r[field]) || 0) + r.qty + r.mh);
  });
  return sortKeys(Array.from(totals.keys()), field, function (k) {
    return totals.get(k);
  });
}

export { PIVOT_FIELDS, PIVOT_MEASURES, preparePivotRows, computePivot, fieldValues };
