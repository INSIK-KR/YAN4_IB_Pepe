/**
 * 진열자 생산성 (엑셀 "진열자 생산성 대시보드"의 작업자 시트·Dashboard 계산).
 * - 근무조는 MOS Shift 열: Day* → Day, Swing* → Swing, Over* → Night
 * - MH = (HTP End − HTP Start) × 24 × 8/9, 종료 00:00 은 자정, 자정을 넘기면 하루를 더한다. 같은 행도 그대로 더한다
 * - 진열(STOW(STOW)) MH 1시간 이상 작업자만, EACH HTP 는 EACH MH 1시간 이상일 때만
 */
import { ZONE_BY_LOC } from "./pivot.mjs";

const STOW_TASK = "STOW(STOW)";
const SHIFTS = [
  { key: "day", label: "Day", match: "Day" },
  { key: "swing", label: "Swing", match: "Swing" },
  { key: "night", label: "Night", match: "Over" },
];
const TYPES = [
  { key: "each", label: "EACH" },
  { key: "pallet", label: "PALLET" },
  { key: "case", label: "CASE" },
];
// 주 온도가 같은 MH 로 겹치면 이 순서로 고른다 (엑셀과 같음)
const TEMP_PRIORITY = ["냉장", "냉동", "상온", "로켓마트"];
const BANDS = [
  { label: "150 미만", below: 150 },
  { label: "150~229", below: 229 },
  { label: "229~300", below: 300 },
  { label: "300 이상", below: Infinity },
];
const MIN_MH = 1;
const TOP_N = 5;
const BOTTOM_N = 10;
// 진열 외 업무가 많은 인원: 총 근무 4시간 이상 & 진열 비중 60% 미만
const OTHER_WORK_MIN_MH = 4;
const OTHER_WORK_MAX_SHARE = 0.6;

function shiftKeyOf(shift) {
  const s = String(shift || "");
  for (let i = 0; i < SHIFTS.length; i++) {
    if (s.indexOf(SHIFTS[i].match) === 0) return SHIFTS[i].key;
  }
  return null;
}

/** 엑셀 계산 시트 A열과 같은 행별 MH */
function rowMh(r) {
  if (r.startFrac === null || r.endFrac === null) return 0;
  let d = r.endFrac === 0 && r.startFrac > 0 ? 1 - r.startFrac : r.endFrac - r.startFrac;
  if (d < 0) d += 1;
  return (d * 24 * 8) / 9;
}

/** 엑셀 QUARTILE(PERCENTILE.INC)과 같은 보간 */
function quantile(sorted, p) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function ratio(a, b) {
  return b > 0 ? a / b : null;
}

function bandOf(eachHtp) {
  if (eachHtp === null) return "-";
  for (let i = 0; i < BANDS.length; i++) {
    if (eachHtp < BANDS[i].below) return BANDS[i].label;
  }
  return BANDS[BANDS.length - 1].label;
}

function newWorker(employee) {
  const w = { employee: employee, contract: "", qty: 0, mh: 0, totalMh: 0, tempMh: {} };
  TYPES.forEach(function (t) {
    w[t.key] = { qty: 0, mh: 0 };
  });
  return w;
}

function finishWorker(w) {
  let temp = "미분류";
  let best = 0;
  TEMP_PRIORITY.forEach(function (t) {
    if ((w.tempMh[t] || 0) > best) {
      best = w.tempMh[t];
      temp = t;
    }
  });
  const out = {
    employee: w.employee,
    contract: w.contract,
    temp: temp,
    qty: w.qty,
    mh: w.mh,
    htp: ratio(w.qty, w.mh),
    totalMh: w.totalMh,
    stowShare: ratio(w.mh, w.totalMh),
  };
  TYPES.forEach(function (t) {
    out[t.key] = { qty: w[t.key].qty, mh: w[t.key].mh, htp: ratio(w[t.key].qty, w[t.key].mh) };
  });
  // EACH HTP 는 EACH MH 1시간 이상일 때만 본다
  out.eachHtp = w.each.mh >= MIN_MH ? w.each.qty / w.each.mh : null;
  out.band = bandOf(out.eachHtp);
  return out;
}

function summarize(workers) {
  const sum = function (pick) {
    return workers.reduce(function (s, w) {
      return s + pick(w);
    }, 0);
  };
  const qty = sum(function (w) {
    return w.qty;
  });
  const mh = sum(function (w) {
    return w.mh;
  });
  const out = {
    people: workers.length,
    perm: workers.filter(function (w) {
      return w.contract === "PERM";
    }).length,
    temp: workers.filter(function (w) {
      return w.contract === "TEMP";
    }).length,
    qty: qty,
    mh: mh,
    htp: ratio(qty, mh),
  };
  TYPES.forEach(function (t) {
    const q = sum(function (w) {
      return w[t.key].qty;
    });
    const h = sum(function (w) {
      return w[t.key].mh;
    });
    out[t.key] = { qty: q, mh: h, htp: ratio(q, h) };
  });
  out.eachQtyShare = ratio(out.each.qty, qty);
  out.eachMhShare = ratio(out.each.mh, mh);
  const ranked = workers
    .filter(function (w) {
      return w.eachHtp !== null;
    })
    .map(function (w) {
      return w.eachHtp;
    })
    .sort(function (a, b) {
      return a - b;
    });
  out.q1 = quantile(ranked, 0.25);
  out.median = quantile(ranked, 0.5);
  out.q3 = quantile(ranked, 0.75);
  out.bands = {};
  BANDS.forEach(function (b) {
    out.bands[b.label] = workers.filter(function (w) {
      return w.band === b.label;
    }).length;
  });
  out.otherWork = workers.filter(function (w) {
    return w.totalMh >= OTHER_WORK_MIN_MH && w.stowShare !== null && w.stowShare < OTHER_WORK_MAX_SHARE;
  }).length;
  return out;
}

/**
 * MOS 행 → { shifts: [{ key, label, workers, summary, top, bottom }], total }
 * workers 는 EACH HTP 가 있는 사람이 위, 그 안에서 EACH HTP 높은 순 (없으면 진열 물량 순)
 */
function computeStowProductivity(rows) {
  const contractOf = {};
  const byShift = {};
  SHIFTS.forEach(function (s) {
    byShift[s.key] = new Map();
  });
  const totalMh = {};
  SHIFTS.forEach(function (s) {
    totalMh[s.key] = new Map();
  });

  rows.forEach(function (r) {
    if (!(r.employee in contractOf)) contractOf[r.employee] = r.contractType;
    const key = shiftKeyOf(r.shift);
    if (!key) return;
    const mh = rowMh(r);
    totalMh[key].set(r.employee, (totalMh[key].get(r.employee) || 0) + mh);
    if (r.task !== STOW_TASK) return;
    const map = byShift[key];
    let w = map.get(r.employee);
    if (!w) {
      w = newWorker(r.employee);
      map.set(r.employee, w);
    }
    w.qty += r.qty;
    w.mh += mh;
    const type = r.pickType.toLowerCase();
    if (w[type]) {
      w[type].qty += r.qty;
      w[type].mh += mh;
    }
    const zone = ZONE_BY_LOC[r.location];
    if (zone) w.tempMh[zone[0]] = (w.tempMh[zone[0]] || 0) + mh;
  });

  const shifts = SHIFTS.map(function (s) {
    const workers = Array.from(byShift[s.key].values())
      .filter(function (w) {
        return w.mh >= MIN_MH;
      })
      .map(function (w) {
        w.contract = contractOf[w.employee] || "";
        w.totalMh = totalMh[s.key].get(w.employee) || 0;
        return finishWorker(w);
      })
      .sort(function (a, b) {
        const ra = a.eachHtp !== null ? 1 : 0;
        const rb = b.eachHtp !== null ? 1 : 0;
        if (ra !== rb) return rb - ra;
        return ra ? b.eachHtp - a.eachHtp : b.qty - a.qty;
      });
    const ranked = workers.filter(function (w) {
      return w.eachHtp !== null;
    });
    return {
      key: s.key,
      label: s.label,
      workers: workers,
      summary: summarize(workers),
      top: ranked.slice(0, TOP_N),
      // 하위는 가장 낮은 사람부터
      bottom: ranked.slice(-BOTTOM_N).reverse(),
    };
  });
  const all = shifts.reduce(function (list, s) {
    return list.concat(s.workers);
  }, []);
  return { shifts: shifts, total: summarize(all) };
}

export { SHIFTS as STOW_SHIFTS, TYPES as STOW_TYPES, BANDS as STOW_BANDS, MIN_MH as STOW_MIN_MH, computeStowProductivity, rowMh, shiftKeyOf };
