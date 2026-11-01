/* MK2 SLA 개요 — 피벗·진척율·이동중이 그린 결과만 읽어서 보여준다. WMS 요청·SLA 계산 없음. */
(function () {
  "use strict";

  var PREV_LS_KEY = "yna4_sla_mk2_overview_prev_v1";
  var CHANNELS = [
    { key: "rm", label: "RocketMart", color: "#059669" },
    { key: "tr", label: "TR (이관)", color: "#1d4ed8" },
    { key: "ag", label: "AG", color: "#a855f7" },
    { key: "dir", label: "DIR (직납)", color: "#f59e0b" },
  ];

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function fmt(n) {
    return Math.round(Number(n) || 0).toLocaleString("en-US");
  }

  function channelOf(row) {
    if (row.direct) return "dir";
    if (row.toteStow) return "ag";
    if (row.key === "ROCKETMART") return "rm";
    return "tr";
  }

  function parseCol(col) {
    var m = /^(\d{2})\/(\d{2})(?: (\d{1,2}))?$/.exec(String(col || ""));
    if (!m) return null;
    return { mm: m[1], dd: m[2], hour: m[3] == null ? null : +m[3] };
  }

  function hourLabel(p) {
    return pad2(p.hour) + ":00";
  }

  /** 시간대 열의 시각(ms). 연도가 없어서 조회 시각과 가장 가까운 해로 본다 */
  function colMs(p, now) {
    var ms = new Date(now.getFullYear(), +p.mm - 1, +p.dd, p.hour).getTime();
    var halfYear = 183 * 864e5;
    if (ms - now.getTime() > halfYear) {
      return new Date(now.getFullYear() - 1, +p.mm - 1, +p.dd, p.hour).getTime();
    }
    if (now.getTime() - ms > halfYear) {
      return new Date(now.getFullYear() + 1, +p.mm - 1, +p.dd, p.hour).getTime();
    }
    return ms;
  }

  /** 운영일 시간대 표기: 자정을 넘긴 시간은 "익일" */
  function operHourLabel(c, operDay) {
    var start = new Date(operDay.startMs);
    var nextDay = new Date(c.ms).getDate() !== start.getDate();
    return (nextDay ? "익일 " : "") + pad2(c.hour) + ":00";
  }

  function colLabel(col) {
    var p = parseCol(col);
    if (!p) return String(col || "");
    return p.hour == null
      ? p.mm + "." + p.dd
      : p.mm + "." + p.dd + " " + hourLabel(p);
  }

  /**
   * pivot = { rows:[{key,label,direct,toteStow,cells:{col:{qty,overdue}}}], timeCols, grand,
   *           queryAt:Date, missCols:{col:1}, specials:{moving,adhoc,empty} }
   * progress = 진척율 패널 model, moving = 이동중 패널 data
   */
  function summarize(pivot, progress, moving) {
    var now = pivot.queryAt instanceof Date ? pivot.queryAt : new Date();
    var operDay = pivot.operDay;
    function inOperDay(p) {
      if (!p || p.hour == null) return false;
      var ms = colMs(p, now);
      return ms >= operDay.startMs && ms <= operDay.endMs;
    }
    var out = {
      total: Number(pivot.grand) || 0,
      miss: 0,
      missFromCol: "",
      today: 0,
      todayCols: [],
      columns: [],
      missRows: [],
      topCell: null,
      special: Object.create(null),
      progress: progress || null,
      expired: [],
      movingRowCount: 0,
    };
    var specials = pivot.specials || {};
    var byCol = Object.create(null);
    var ci, ri, col, row, cell, qty, chan, p;

    for (ci = 0; ci < pivot.timeCols.length; ci++) {
      byCol[pivot.timeCols[ci]] = { total: 0, overdue: 0, parts: Object.create(null) };
    }
    for (ri = 0; ri < pivot.rows.length; ri++) {
      row = pivot.rows[ri];
      chan = channelOf(row);
      var rowMiss = 0;
      for (ci = 0; ci < pivot.timeCols.length; ci++) {
        col = pivot.timeCols[ci];
        cell = row.cells[col];
        qty = cell ? Number(cell.qty) || 0 : 0;
        if (qty <= 0) continue;
        byCol[col].total += qty;
        byCol[col].parts[chan] = (byCol[col].parts[chan] || 0) + qty;
        if (cell.overdue) {
          byCol[col].overdue += qty;
          rowMiss += qty;
        }
        p = parseCol(col);
        if (inOperDay(p)) {
          if (!out.topCell || qty > out.topCell.qty) {
            out.topCell = { qty: qty, hour: p.hour, ms: colMs(p, now), label: row.label };
          }
        }
      }
      if (rowMiss > 0) {
        out.miss += rowMiss;
        out.missRows.push({ label: row.label, qty: rowMiss });
      }
    }
    out.missRows.sort(function (a, b) {
      return b.qty - a.qty;
    });

    for (ci = 0; ci < pivot.timeCols.length; ci++) {
      col = pivot.timeCols[ci];
      if (col === specials.moving || col === specials.adhoc || col === specials.empty) {
        out.special[col] = byCol[col].total;
        continue;
      }
      if (byCol[col].total <= 0) continue;
      p = parseCol(col);
      if (byCol[col].overdue > 0 && !out.missFromCol) out.missFromCol = col;
      if (inOperDay(p)) {
        out.today += byCol[col].total;
        out.todayCols.push({ col: col, hour: p.hour, ms: colMs(p, now), qty: byCol[col].total });
      }
      out.columns.push({
        col: col,
        parsed: p,
        total: byCol[col].total,
        parts: byCol[col].parts,
        miss: !!(pivot.missCols && pivot.missCols[col]),
      });
    }

    if (moving && moving.rows) {
      out.movingRowCount = moving.rows.length;
      var movingNow = moving.queriedAt instanceof Date ? moving.queriedAt.getTime() : now.getTime();
      for (ri = 0; ri < moving.rows.length; ri++) {
        row = moving.rows[ri];
        if (row.deadlineAt && row.deadlineAt.getTime() < movingNow) {
          out.expired.push(row);
        }
      }
    }
    var hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).getTime();
    out.nextCols = out.todayCols.filter(function (c) {
      return c.ms >= hourStart;
    });
    out.operDay = operDay;
    return out;
  }

  function buildChecks(s, specials) {
    var checks = [];
    if (s.miss > 0) {
      checks.push({
        tone: "bad",
        tag: "MISS",
        title: s.missRows
          .slice(0, 2)
          .map(function (r) {
            return r.label + " " + fmt(r.qty);
          })
          .join(" · "),
        detail: colLabel(s.missFromCol) + "부터 누적 " + fmt(s.miss) + " 유닛",
      });
    }
    if (s.expired.length) {
      var first = s.expired[0];
      var units = s.expired.reduce(function (sum, r) {
        return sum + (Number(r.unitTotal) || 0);
      }, 0);
      checks.push({
        tone: "bad",
        tag: "만료",
        title:
          "이동중 차량 " +
          (first.vehicleNo || "") +
          (s.expired.length > 1 ? " 외 " + (s.expired.length - 1) + "대" : "") +
          " 기한 초과",
        detail: fmt(units) + " 유닛",
      });
    }
    if (s.nextCols.length) {
      checks.push({
        tone: "info",
        tag: "다음",
        title: s.nextCols
          .slice(0, 2)
          .map(function (c) {
            return operHourLabel(c, s.operDay) + " 마감 " + fmt(c.qty);
          })
          .join(" · "),
        detail: "오늘(운영일) 남은 시간대 " + s.nextCols.length + "개",
      });
    }
    if (s.topCell) {
      checks.push({
        tone: "warn",
        tag: "집중",
        title:
          operHourLabel(s.topCell, s.operDay) +
          " " +
          s.topCell.label +
          " " +
          fmt(s.topCell.qty),
        detail: "오늘(운영일) 시간대 중 가장 큰 칸",
      });
    }
    var adhoc = s.special[specials.adhoc] || 0;
    if (adhoc > 0) {
      checks.push({
        tone: "muted",
        tag: "확인",
        title: "임의상차 " + fmt(adhoc),
        detail: "SLA 미등록 · 온도대 추론",
      });
    }
    return checks;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function kpi(cls, title, value, sub) {
    var box = el("div", "yna4-sla-ov-kpi " + cls);
    box.appendChild(el("div", "yna4-sla-ov-kpi-title", title));
    box.appendChild(el("div", "yna4-sla-ov-kpi-value", value));
    box.appendChild(el("div", "yna4-sla-ov-kpi-sub", sub));
    return box;
  }

  function buildKpis(s, prev) {
    var row = el("div", "yna4-sla-ov-kpis");
    var deltaText = "이전 조회 없음";
    if (prev && typeof prev.total === "number") {
      var d = s.total - prev.total;
      deltaText =
        "이전 조회 " + fmt(prev.total) + " → " + (d > 0 ? "+" : d < 0 ? "-" : "±") + fmt(Math.abs(d));
    }
    row.appendChild(kpi("yna4-sla-ov-kpi--hero", "총 미진열 유닛", fmt(s.total), deltaText));
    row.appendChild(
      kpi(
        "yna4-sla-ov-kpi--miss",
        "MISS 누적",
        fmt(s.miss),
        s.total ? "전체의 " + ((s.miss / s.total) * 100).toFixed(1) + "%" : "-"
      )
    );
    var range = s.todayCols.length
      ? operHourLabel(s.todayCols[0], s.operDay) +
        " ~ " +
        operHourLabel(s.todayCols[s.todayCols.length - 1], s.operDay) +
        " · " +
        s.todayCols.length +
        "개 시간대"
      : "오늘 시간대 없음";
    row.appendChild(kpi("yna4-sla-ov-kpi--today", "오늘 남은 마감", fmt(s.today), range));
    var un = s.progress && s.progress.unload && s.progress.unload.total;
    var re = s.progress && s.progress.receive && s.progress.receive.total;
    row.appendChild(
      kpi(
        "yna4-sla-ov-kpi--unload",
        "하차 진척율",
        un ? String(un.progress) : "-",
        un ? fmt(un.unload) + " / " + fmt(un.arrival) : "진척 조회 없음"
      )
    );
    row.appendChild(
      kpi(
        "yna4-sla-ov-kpi--receive",
        "매입 진척율",
        re ? String(re.progress) : "-",
        re ? fmt(re.receive) + " / " + fmt(re.unload) : "진척 조회 없음"
      )
    );
    return row;
  }

  function buildChart(s, specials) {
    var card = el("section", "yna4-sla-ov-card");
    var head = el("div", "yna4-sla-ov-card-head");
    head.appendChild(el("h3", "yna4-sla-ov-title", "마감 시점별 미진열 유닛"));
    CHANNELS.forEach(function (c) {
      var lg = el("span", "yna4-sla-ov-legend", c.label);
      var dot = el("i", "yna4-sla-ov-dot");
      dot.style.background = c.color;
      lg.insertBefore(dot, lg.firstChild);
      head.appendChild(lg);
    });
    card.appendChild(head);

    var max = 1;
    s.columns.forEach(function (c) {
      if (c.total > max) max = c.total;
    });
    var chart = el("div", "yna4-sla-ov-chart");
    s.columns.forEach(function (c) {
      var col = el("div", "yna4-sla-ov-col" + (c.miss ? " yna4-sla-ov-col--miss" : ""));
      col.title = colLabel(c.col) + " · " + fmt(c.total) + " 유닛";
      var plot = el("div", "yna4-sla-ov-plot");
      plot.appendChild(el("div", "yna4-sla-ov-val", fmt(c.total)));
      CHANNELS.forEach(function (ch) {
        var q = c.parts[ch.key] || 0;
        if (q <= 0) return;
        var seg = el("div", "yna4-sla-ov-seg");
        seg.style.height = Math.max(2, (q / max) * 170) + "px";
        seg.style.background = ch.color;
        plot.insertBefore(seg, plot.children[1] || null);
      });
      col.appendChild(plot);
      var p = c.parsed;
      col.appendChild(
        el("div", "yna4-sla-ov-lab", p && p.hour != null ? hourLabel(p) : p ? p.mm + "." + p.dd : c.col)
      );
      col.appendChild(
        el(
          "div",
          "yna4-sla-ov-lab2",
          p && p.hour != null ? p.mm + "." + p.dd : c.miss ? "MISS" : "Aging"
        )
      );
      chart.appendChild(col);
    });
    card.appendChild(chart);

    var excluded = [];
    [
      [specials.moving, "이동중"],
      [specials.adhoc, "임의상차"],
      [specials.empty, "비어있음"],
    ].forEach(function (x) {
      if (s.special[x[0]] > 0) excluded.push(x[1] + " " + fmt(s.special[x[0]]));
    });
    card.appendChild(
      el(
        "p",
        "yna4-sla-ov-note",
        "빨간 배경 = MISS 열." +
          (excluded.length ? " " + excluded.join(" · ") + "는 시점이 없어 제외." : "")
      )
    );
    return card;
  }

  function buildCheckList(checks) {
    var card = el("section", "yna4-sla-ov-card");
    card.appendChild(el("h3", "yna4-sla-ov-title", "지금 확인할 것"));
    if (!checks.length) {
      card.appendChild(el("p", "yna4-sla-ov-note", "먼저 확인할 항목이 없습니다."));
      return card;
    }
    var list = el("div", "yna4-sla-ov-checks");
    checks.forEach(function (c) {
      var item = el("div", "yna4-sla-ov-check");
      item.appendChild(el("span", "yna4-sla-ov-tag yna4-sla-ov-tag--" + c.tone, c.tag));
      var body = el("div", "yna4-sla-ov-check-body");
      body.appendChild(el("div", "yna4-sla-ov-check-title", c.title));
      body.appendChild(el("div", "yna4-sla-ov-check-detail", c.detail));
      item.appendChild(body);
      list.appendChild(item);
    });
    card.appendChild(list);
    return card;
  }

  /** 새 조회일 때만 이전 조회 값을 넘긴다 (다시 그려도 이전 값이 밀리지 않게) */
  var prevState = { runKey: "", prev: null };
  function resolvePrev(runKey, total) {
    if (prevState.runKey === runKey) return prevState.prev;
    var stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(PREV_LS_KEY) || "null");
      localStorage.setItem(PREV_LS_KEY, JSON.stringify({ total: total, at: runKey }));
    } catch (eLs) {}
    prevState = { runKey: runKey, prev: stored };
    return stored;
  }

  function render(host, state) {
    if (!host) return;
    host.textContent = "";
    var pivot = state && state.pivot;
    if (!pivot) {
      host.appendChild(
        el(
          "div",
          "yna4-sla-placeholder",
          (state && state.message) || "SLA 전체 버튼으로 조회하면 개요가 나옵니다."
        )
      );
      return;
    }
    var s = summarize(pivot, state.progress, state.moving);
    var specials = pivot.specials || {};
    var runKey = String(pivot.queryAt && pivot.queryAt.getTime ? pivot.queryAt.getTime() : "");
    host.appendChild(buildKpis(s, resolvePrev(runKey, s.total)));
    var grid = el("div", "yna4-sla-ov-grid");
    grid.appendChild(buildChart(s, specials));
    grid.appendChild(buildCheckList(buildChecks(s, specials)));
    host.appendChild(grid);
  }

  window.__YAN4_SLA_OVERVIEW__ = { render: render, summarize: summarize };
})();
