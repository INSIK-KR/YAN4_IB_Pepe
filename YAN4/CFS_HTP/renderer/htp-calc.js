"use strict";

/**
 * 123.xlsm Status 시트 계산을 옮긴 모듈.
 * MOS 원본 행 → (Caculation · ManHour · MosDelay 계산) → Status 모델.
 * 렌더러(window.HtpCalc)와 node(검증 스크립트) 양쪽에서 쓴다.
 */
(function (root) {
  // Status F..AC 열 = HourOfWorkDate 8..31 (08시 ~ 다음날 07시)
  const HOURS = [];
  for (let h = 8; h <= 31; h++) HOURS.push(h);

  // Status J~S 표의 근무조 구간 (열 범위 F:N, O:R, S:W, X:AC)
  const SHIFT_GROUPS = [
    { key: "day", label: "Day", from: 8, to: 16 },
    { key: "swing", label: "Swing", from: 17, to: 20 },
    { key: "swingNight", label: "Swing&Night", from: 21, to: 25 },
    { key: "night", label: "Night", from: 26, to: 31 },
  ];

  // MOS Shift 값 (Status AI11:AK11, MosDelay G1:I1)
  const SHIFT_DAY = "Day 1 (08:00 ~ 17:00)";
  const SHIFT_SWING = "Swing 1 (17:00 ~ 02:00)";
  const SHIFT_NIGHT = "Over Night1 (21:00 ~ 06:00)";

  // ManHour Z:AA Tag 목록. status=false 는 VCPU 환산에는 들어가지만 Status에는 안 보이는 행
  const TASKS = [
    { key: "teamCaptain", group: "TeamCaptain", label: "팀캡틴", task: "IB_Support(IB_TEAM_CAPTAIN)" },
    { key: "stow", group: "STOW", label: "진열", task: "STOW(STOW)" },
    { key: "console1", group: "STOW", label: "콘솔1", task: "STOW(Stow_Consolidation)" },
    { key: "console2", group: "STOW", label: "콘솔2", task: "STOW(RELOCATOR)" },
    { key: "stowPs", group: "STOW", label: "진열PS", task: "STOW(STOW_PS)" },
    { key: "stowTraining", group: "STOW", label: "진열교육", task: "STOW(Stow_Training)" },
    { key: "stowWait", group: "STOW", label: "진열대기", task: "STOW(STOW_WS)" },
    { key: "receive", group: "Receive", label: "매입", task: "RECEIVE(RECEIVE)" },
    { key: "receivePs", group: "Receive", label: "매입PS", task: "RECEIVE(RECEIVE_PS)" },
    { key: "receiveWait", group: "Receive", label: "매입대기", task: "RECEIVE(RECEIVE_WS)" },
    { key: "dockMaster", group: "Unload", label: "도크마스터", task: "UNLOAD(Dock_Master)" },
    { key: "unloadDirect", group: "Unload", label: "직납하차", task: "UNLOAD(UNLOAD)" },
    { key: "unloadTransfer", group: "Unload", label: "이관하차", task: "TRANSFER(TRANSFER_CART_UNLOAD)" },
    { key: "unloadWait", group: "Unload", label: "하차대기", task: "UNLOAD(UNLOAD_WS)" },
    { key: "sorter", group: "Unload", label: "소터", task: "UNLOAD(SORTER)" },
    { key: "inspector", group: null, label: "쉬링크(검수)", task: "UNLOAD(INSPECTOR)", status: false },
    { key: "shrink", group: "Prepack", label: "쉬링크", task: "RECEIVE(Receive_Shrink Packaging)" },
    { key: "prepack", group: "Prepack", label: "프리팩", task: "RECEIVE(RECEIVE_PREPACK)" },
    { key: "forklift1", group: "Folklift", label: "지게차1", task: "UNLOAD(FORKLIFTER)" },
    { key: "forklift2", group: "Folklift", label: "지게차2", task: "RECEIVE(RECEIVE_FORKLIFTER)" },
    { key: "pbox", group: "Centre Task", label: "피박스", task: "FACILITY_SERVICE(P-Box)" },
    { key: "signalman", group: "Centre Task", label: "시그널맨", task: "FACILITY_SERVICE(SIGNALMAN)" },
    { key: "project1", group: "Centre Task", label: "프로젝트1", task: "PROJECT(PROJECT_WORKER)" },
    { key: "project2", group: "Centre Task", label: "프로젝트2", task: "PROJECT(PROJECT_CONSTRUCTION)" },
    { key: "safetyTraining", group: "Centre Task", label: "신규교육", task: "Admin(SAFETY_TRAINER)" },
    { key: "onboarding", group: "Centre Task", label: "센터신규", task: "Admin(ONBOARDING_ORIENTATION)" },
    { key: "legalTraining", group: "Centre Task", label: "법정의무교육", task: "Admin(LEGAL_TRAINING)" },
  ];
  const TASK_BY_NAME = {};
  TASKS.forEach(function (t) {
    TASK_BY_NAME[t.task] = t;
  });

  // Status 58~60 직접/간접/센터공정 구성 (시간대 열 기준)
  const DIRECT_HOURLY = ["stow", "console1", "console2", "receive", "receivePs", "dockMaster", "unloadDirect", "unloadTransfer"];
  const INDIRECT_HOURLY = ["teamCaptain", "stowTraining", "stowWait", "receiveWait", "unloadWait", "sorter", "shrink", "prepack", "forklift1"];
  const CENTRE_HOURLY = ["pbox", "signalman", "project1", "project2", "safetyTraining", "onboarding"];
  // 총계(E열)는 진열PS·지게차2·법정의무교육이 더 들어가고 체크인 지연 MH가 더해진다
  const DIRECT_TOTAL = DIRECT_HOURLY.concat(["stowPs"]);
  const INDIRECT_TOTAL = INDIRECT_HOURLY.concat(["forklift2"]);
  const CENTRE_TOTAL = CENTRE_HOURLY.concat(["legalTraining"]);

  // Status J5:S11 인원 환산(MH/8)에 쓰는 공정
  const HEADCOUNT_ROWS = [
    { label: "하차", tasks: ["dockMaster", "unloadDirect", "unloadTransfer", "unloadWait", "sorter"] },
    { label: "매입", tasks: ["receive", "receivePs", "receiveWait"] },
    { label: "진열", tasks: ["stow", "console1", "console2", "stowPs", "stowTraining", "stowWait"] },
    { label: "프리팩", tasks: ["prepack"] },
    { label: "쉬링크", tasks: ["shrink"] },
    { label: "신호수", tasks: ["signalman"] },
    { label: "피박스", tasks: ["pbox"] },
  ];

  // Caculation 로케이션 코드 묶음 (Status 31~57)
  const LOC = {
    ambientEach: ["1A"],
    ambientPallet: ["1AP"],
    chilledEach: ["1C", "1CT", "1CE", "1CM", "2C"],
    chilledPallet: ["1CP", "1CPT", "1CPE", "1CPM", "2CP", "2CPZ"],
    frozenEach: ["1F", "1FM"],
    frozenPallet: ["1FP", "1FPZ", "1FPM"],
    rocketEach: ["1AR"],
    rocketPallet: ["1APR"],
  };

  // MOS 열 이름 → 내부 키 (MOS 시트 A~AG 순서)
  const MOS_COLUMNS = [
    ["Work Date", "workDate"],
    ["Employee", "employee"],
    ["Task Start", "taskStart"],
    ["Task End", "taskEnd"],
    ["HTP Start", "htpStart"],
    ["HTP End", "htpEnd"],
    ["Work Type", "workType"],
    ["Process(Task)", "task"],
    ["Unit Qty", "qty"],
    ["Record Count", "recordCount"],
    ["Center Code", "center"],
    ["Location", "location"],
    ["Floor", "floor"],
    ["Pick/Receive Type", "pickType"],
    ["FnF", "fnf"],
    ["NOB", "nob"],
    ["Packing Type", "packingType"],
    ["Box Category", "boxCategory"],
    ["Extra Box Category", "extraBoxCategory"],
    ["Sku Temperatures", "skuTemp"],
    ["Inbound Type", "inboundType"],
    ["Batch Job ID", "batchJobId"],
    ["Batch ID", "batchId"],
    ["Process Path Type", "processPathType"],
    ["Process Path Name", "processPathName"],
    ["Zone Type Name", "zoneTypeName"],
    ["Punch Center", "punchCenter"],
    ["Contract Type", "contractType"],
    ["Shift", "shift"],
    ["User Work Type", "userWorkType"],
    ["HourOfWorkDate", "hour"],
    ["Zone Group", "zoneGroup"],
    ["AGV Meta", "agvMeta"],
  ];
  const REQUIRED_KEYS = ["employee", "htpStart", "htpEnd", "task", "qty", "location", "pickType", "inboundType", "shift", "userWorkType", "hour"];

  function str(v) {
    return v === null || v === undefined ? "" : String(v).trim();
  }

  function num(v) {
    if (typeof v === "number") return v;
    const n = Number(str(v).replace(/,/g, ""));
    return isFinite(n) ? n : 0;
  }

  /** "HH:MM(:SS)" 또는 엑셀 시간(하루=1) → 하루 비율. 읽을 수 없으면 null */
  function dayFraction(v) {
    if (typeof v === "number") return v >= 0 ? v - Math.floor(v) : null;
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(str(v));
    if (!m) return null;
    return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0)) / 86400;
  }

  /**
   * 표(2차원 배열)에서 MOS 행을 읽는다. 머리글 행이 있으면 열 이름으로, 없으면 MOS 시트 열 순서로 맞춘다.
   * 반환: { rows, workDate, missing }
   */
  function parseMosTable(table) {
    let headerIdx = -1;
    for (let i = 0; i < Math.min(table.length, 20); i++) {
      const cells = (table[i] || []).map(str);
      if (cells.indexOf("Employee") >= 0 && cells.indexOf("Process(Task)") >= 0) {
        headerIdx = i;
        break;
      }
    }
    const colOf = {};
    if (headerIdx >= 0) {
      const header = table[headerIdx].map(str);
      MOS_COLUMNS.forEach(function (c) {
        const idx = header.indexOf(c[0]);
        if (idx >= 0) colOf[c[1]] = idx;
      });
    } else {
      MOS_COLUMNS.forEach(function (c, i) {
        colOf[c[1]] = i;
      });
    }
    const missing = REQUIRED_KEYS.filter(function (k) {
      return colOf[k] === undefined;
    });
    const rows = [];
    let workDate = "";
    for (let i = headerIdx + 1; i < table.length; i++) {
      const r = table[i];
      if (!r) continue;
      const employee = str(r[colOf.employee]);
      if (!employee) continue;
      const row = {
        employee: employee,
        htpStart: str(r[colOf.htpStart]),
        htpEnd: str(r[colOf.htpEnd]),
        startFrac: dayFraction(r[colOf.htpStart]),
        endFrac: dayFraction(r[colOf.htpEnd]),
        task: str(r[colOf.task]),
        qty: num(r[colOf.qty]),
        location: str(r[colOf.location]).toUpperCase(),
        pickType: str(r[colOf.pickType]).toUpperCase(),
        inboundType: str(r[colOf.inboundType]).toUpperCase(),
        contractType: str(r[colOf.contractType]),
        shift: str(r[colOf.shift]),
        userWorkType: str(r[colOf.userWorkType]).toUpperCase(),
        hour: num(r[colOf.hour]),
      };
      if (!workDate && colOf.workDate !== undefined) workDate = str(r[colOf.workDate]);
      rows.push(row);
    }
    return { rows: rows, workDate: workDate, missing: missing };
  }

  /** 붙여넣은 탭 구분 텍스트 → 2차원 배열 */
  function tsvToTable(text) {
    return String(text || "")
      .split(/\r?\n/)
      .filter(function (line) {
        return line.length > 0;
      })
      .map(function (line) {
        return line.split("\t");
      });
  }

  function emptyHourly() {
    const o = {};
    HOURS.forEach(function (h) {
      o[h] = 0;
    });
    return o;
  }

  function addHourly(target, h, v) {
    if (target[h] !== undefined) target[h] += v;
  }

  function sumHourly(list) {
    const out = emptyHourly();
    list.forEach(function (src) {
      HOURS.forEach(function (h) {
        out[h] += src[h] || 0;
      });
    });
    return out;
  }

  function total(hourly) {
    return HOURS.reduce(function (s, h) {
      return s + (hourly[h] || 0);
    }, 0);
  }

  function sumRange(hourly, from, to) {
    let s = 0;
    for (let h = from; h <= to; h++) s += hourly[h] || 0;
    return s;
  }

  function div(a, b) {
    return b ? a / b : null;
  }

  /** ManHour 피벗: 같은 값을 가진 행은 한 번만 센다 (피벗 행 머리글 A:K 기준) */
  function manHourKey(r) {
    return [r.hour, r.shift, r.employee, r.htpStart, r.htpEnd, r.task, r.contractType, r.location, r.inboundType, r.qty, r.pickType].join("\u0001");
  }

  /** ManHour L열(Hour 환산, 하루 비율). 종료가 00:00이면 24:00으로 본다 */
  function workedFraction(r) {
    if (r.startFrac === null || r.endFrac === null) return 0;
    const end = r.endFrac === 0 ? 1 : r.endFrac;
    return end - r.startFrac;
  }

  /** MosDelay: 근무조 첫 체크인보다 늦게 시작한 시간(MH) */
  function computeCheckInDelay(rows) {
    const shiftStart = {};
    shiftStart[SHIFT_DAY] = 8 / 24;
    shiftStart[SHIFT_SWING] = 17 / 24;
    shiftStart[SHIFT_NIGHT] = 21 / 24;

    const people = new Map();
    rows.forEach(function (r) {
      let p = people.get(r.employee);
      if (!p) {
        p = { firstShift: r.shift, inbound: false, minStart: null, minHour: null, minHourTask: "" };
        people.set(r.employee, p);
      }
      if (r.userWorkType === "INBOUND" || r.userWorkType === "28") p.inbound = true;
      if (r.startFrac !== null) {
        const adj = r.startFrac < 8 / 24 ? r.startFrac + 1 : r.startFrac;
        if (p.minStart === null || adj < p.minStart) p.minStart = adj;
      }
      if (p.minHour === null || r.hour < p.minHour) {
        p.minHour = r.hour;
        p.minHourTask = r.task;
      }
    });

    const byTask = {};
    const list = [];
    people.forEach(function (p, employee) {
      if (!p.inbound) return;
      const start = shiftStart[p.firstShift];
      if (start === undefined || p.minStart === null) return;
      // 엑셀은 첫 시작 시각을 "HH:MM"(초 버림)으로 바꿔 계산한다
      const firstMinute = Math.floor(p.minStart * 1440 + 1e-6) / 1440;
      const mh = Math.max(0, (firstMinute - start) * 24 * 8 / 9);
      byTask[p.minHourTask] = (byTask[p.minHourTask] || 0) + mh;
      list.push({ employee: employee, shift: p.firstShift, firstStart: firstMinute, task: p.minHourTask, manHour: mh });
    });
    return { byTask: byTask, people: list };
  }

  /**
   * MOS 행 + 입력값 → Status 모델.
   * inputs: { target, rates{day,swing,night}, obPlan, sop{d1{direct,xdock,rc,rocketmart}, d0{...}},
   *           hc[{label, day{tar,act}, swing{...}, night{...}}], facility{day,swing,night}, vehicles[] }
   */
  function computeStatus(rows, inputs) {
    inputs = inputs || {};

    // --- Caculation: 시간대별 처리 수량 ---
    const q = {
      unloadDirect: emptyHourly(),
      unloadTransfer: emptyHourly(),
      receiveEach: emptyHourly(),
      receivePallet: emptyHourly(),
      stowEach: emptyHourly(), // NORMAL/TRANSFER × EACH/CASE
      stowPallet: emptyHourly(),
    };
    const stowLoc = { NORMAL: {}, TRANSFER: {} };
    const stowByShift = {};

    // --- ManHour: 공정별 시간대 MH ---
    const mh = {};
    TASKS.forEach(function (t) {
      mh[t.key] = emptyHourly();
    });
    const seen = new Set();

    rows.forEach(function (r) {
      const h = r.hour;
      if (r.task === "STOW(STOW)") {
        stowByShift[r.shift] = (stowByShift[r.shift] || 0) + r.qty;
        if (r.inboundType === "NORMAL" || r.inboundType === "TRANSFER") {
          if (r.pickType === "EACH" || r.pickType === "CASE") addHourly(q.stowEach, h, r.qty);
          else if (r.pickType === "PALLET") addHourly(q.stowPallet, h, r.qty);
          const byLoc = stowLoc[r.inboundType];
          if (!byLoc[r.location]) byLoc[r.location] = emptyHourly();
          addHourly(byLoc[r.location], h, r.qty);
        }
      } else if (r.task === "UNLOAD(UNLOAD)") {
        addHourly(q.unloadDirect, h, r.qty);
      } else if (r.task === "TRANSFER(TRANSFER_CART_UNLOAD)") {
        addHourly(q.unloadTransfer, h, r.qty);
      } else if (r.task === "RECEIVE(RECEIVE)") {
        if (r.pickType === "EACH") addHourly(q.receiveEach, h, r.qty);
        else if (r.pickType === "PALLET") addHourly(q.receivePallet, h, r.qty);
      }

      const t = TASK_BY_NAME[r.task];
      if (t) {
        const key = manHourKey(r);
        if (!seen.has(key)) {
          seen.add(key);
          const frac = workedFraction(r);
          if (frac) addHourly(mh[t.key], h, frac * 24 * 8 / 9);
        }
      }
    });

    function locSum(type, codes) {
      return sumHourly(
        codes.map(function (c) {
          return stowLoc[type][c] || {};
        })
      );
    }

    // --- Status 21~30: 하차·매입·진열 ---
    const unload = sumHourly([q.unloadDirect, q.unloadTransfer]);
    const receive = sumHourly([q.receiveEach, q.receivePallet]);
    const stow = sumHourly([q.stowEach, q.stowPallet]);

    // --- Status 31~57: 진열 구성 ---
    function pair(label, each, pallet) {
      return { label: label, each: each, pallet: pallet, sum: sumHourly([each, pallet]) };
    }
    const direct = [
      pair("상온", locSum("NORMAL", LOC.ambientEach), locSum("NORMAL", LOC.ambientPallet)),
      pair("냉장", locSum("NORMAL", LOC.chilledEach), locSum("NORMAL", LOC.chilledPallet)),
      pair("냉동", locSum("NORMAL", LOC.frozenEach), locSum("NORMAL", LOC.frozenPallet)),
    ];
    const transfer = [
      pair("XD상온", locSum("TRANSFER", LOC.ambientEach), locSum("TRANSFER", LOC.ambientPallet)),
      pair("XD냉장", locSum("TRANSFER", LOC.chilledEach), locSum("TRANSFER", LOC.chilledPallet)),
      pair("RC냉동", locSum("TRANSFER", LOC.frozenEach), locSum("TRANSFER", LOC.frozenPallet)),
      pair("로켓마트", locSum("TRANSFER", LOC.rocketEach), locSum("TRANSFER", LOC.rocketPallet)),
    ];
    function groupTotal(label, parts) {
      return pair(
        label,
        sumHourly(parts.map(function (p) {
          return p.each;
        })),
        sumHourly(parts.map(function (p) {
          return p.pallet;
        }))
      );
    }
    const stowMix = {
      direct: groupTotal("직납건", direct),
      directParts: direct,
      transfer: groupTotal("이관건", transfer),
      transferParts: transfer,
    };

    // --- Status 58~93: 공정별 MH, 94~127: 체크인 지연 ---
    const delay = computeCheckInDelay(rows);
    const delayByKey = {};
    TASKS.forEach(function (t) {
      delayByKey[t.key] = delay.byTask[t.task] || 0;
    });
    function pick(keys) {
      return keys.map(function (k) {
        return mh[k];
      });
    }
    function totalOf(keys) {
      return keys.reduce(function (s, k) {
        return s + total(mh[k]) + delayByKey[k];
      }, 0);
    }
    const directMh = sumHourly(pick(DIRECT_HOURLY));
    const indirectMh = sumHourly(pick(INDIRECT_HOURLY));
    const centreMh = sumHourly(pick(CENTRE_HOURLY));
    const processTotals = {
      direct: totalOf(DIRECT_TOTAL),
      indirect: totalOf(INDIRECT_TOTAL),
      centre: totalOf(CENTRE_TOTAL),
    };
    const processAll = processTotals.direct + processTotals.indirect + processTotals.centre;

    const productivity = {};
    HOURS.forEach(function (h) {
      productivity[h] = div(stow[h], directMh[h] + indirectMh[h]);
    });
    const shiftHtp = SHIFT_GROUPS.map(function (g) {
      return {
        key: g.key,
        label: g.label,
        htp: div(sumRange(stow, g.from, g.to), sumRange(directMh, g.from, g.to) + sumRange(indirectMh, g.from, g.to)),
      };
    });

    // --- Status 상단 ---
    const target = num(inputs.target);
    const htpActual = div(total(stow), processTotals.direct + processTotals.indirect);
    const sop = inputs.sop || {};
    const sopKeys = ["direct", "xdock", "rc", "rocketmart"];
    function sopTotal(side) {
      return sopKeys.reduce(function (s, k) {
        return s + num((sop[side] || {})[k]);
      }, 0);
    }
    const sopD1 = sopTotal("d1");
    const sopD0 = sopTotal("d0");
    const obPlan = num(inputs.obPlan);
    const rates = inputs.rates || {};
    const plan = {
      day: sopD1 * num(rates.day),
      swing: sopD1 * num(rates.swing),
      night: sopD1 * num(rates.night),
    };

    // Status I2:S4 업무별 처리량, I5:S11 인원 환산(MH/8)
    function byShift(hourly, totalValue) {
      const out = { total: totalValue };
      SHIFT_GROUPS.forEach(function (g) {
        const v = sumRange(hourly, g.from, g.to);
        out[g.key] = { value: v, share: div(v, totalValue) };
      });
      return out;
    }
    const taskSummary = [
      Object.assign({ label: "하차", unit: "qty" }, byShift(unload, total(unload))),
      Object.assign({ label: "매입", unit: "qty" }, byShift(receive, total(receive))),
      Object.assign({ label: "진열", unit: "qty" }, byShift(stow, total(stow))),
    ].concat(
      HEADCOUNT_ROWS.map(function (row) {
        const hourly = sumHourly(pick(row.tasks));
        const totalHc =
          row.tasks.reduce(function (s, k) {
            return s + total(mh[k]) + delayByKey[k];
          }, 0) / 8;
        const scaled = {};
        HOURS.forEach(function (h) {
          scaled[h] = hourly[h] / 8;
        });
        return Object.assign({ label: row.label, unit: "hc" }, byShift(scaled, totalHc));
      })
    );

    // --- 이관 차량 (Status 12~17) ---
    const vehicles = (inputs.vehicles || []).filter(function (v) {
      return dayFraction(v.arrival) !== null;
    });
    const vehicleHourly = { count: emptyHourly(), Ambient: emptyHourly(), Chilled: emptyHourly(), Frozen: emptyHourly(), RM: emptyHourly() };
    vehicles.forEach(function (v) {
      const hh = Math.floor(dayFraction(v.arrival) * 24 + 1e-9);
      const h = hh < 8 ? hh + 24 : hh;
      addHourly(vehicleHourly.count, h, 1);
      const temp = vehicleHourly[v.temp] ? v.temp : null;
      if (temp) addHourly(vehicleHourly[temp], h, num(v.pallet));
    });
    vehicleHourly.pallet = sumHourly([vehicleHourly.Ambient, vehicleHourly.Chilled, vehicleHourly.Frozen, vehicleHourly.RM]);

    // --- H/C (Status T1:AC11) 와 근무조 시뮬레이션 (Status AG3:AK23) ---
    const hc = inputs.hc || [];
    const facility = inputs.facility || {};
    function hcSum(shift, kind) {
      // 팀캡틴 + 계약직 + 단기직 (T3:T5)
      return hc.slice(0, 3).reduce(function (s, row) {
        return s + num(((row || {})[shift] || {})[kind]);
      }, 0);
    }
    const shifts3 = ["day", "swing", "night"];
    const actualStowByShift = {
      day: stowByShift[SHIFT_DAY] || 0,
      swing: stowByShift[SHIFT_SWING] || 0,
      night: stowByShift[SHIFT_NIGHT] || 0,
    };
    const sim = { tar: {}, act: {}, simul: {} };
    shifts3.forEach(function (s) {
      const fac = num(facility[s]);
      const tarGap = hcSum(s, "tar") - fac;
      const actGap = hcSum(s, "act") - fac;
      sim.tar[s] = { total: hcSum(s, "tar"), facility: fac, gap: tarGap, stow: plan[s], htp: div(plan[s], tarGap * 8) };
      sim.act[s] = { total: hcSum(s, "act"), facility: fac, gap: actGap, stow: actualStowByShift[s], htp: div(actualStowByShift[s], actGap * 8) };
    });
    const dayStowSoFar = sumRange(stow, 8, 16);
    const restGap = sim.act.swing.gap + sim.act.night.gap;
    shifts3.forEach(function (s) {
      const stowValue = s === "day" ? dayStowSoFar : restGap ? ((sopD1 - dayStowSoFar) * sim.act[s].gap) / restGap : null;
      sim.simul[s] = {
        total: sim.act[s].total,
        facility: sim.act[s].facility,
        gap: sim.act[s].gap,
        stow: stowValue,
        htp: stowValue === null ? null : div(stowValue, sim.act[s].gap * 8),
        actMinusTarget: actualStowByShift[s] - plan[s],
        actMinusSimul: s === "day" || stowValue === null ? null : actualStowByShift[s] - stowValue,
      };
    });

    const taskRows = TASKS.filter(function (t) {
      return t.status !== false;
    }).map(function (t) {
      return {
        key: t.key,
        group: t.group,
        label: t.label,
        task: t.task,
        hourly: mh[t.key],
        total: total(mh[t.key]),
        share: div(total(mh[t.key]), processAll),
        delay: delayByKey[t.key],
        delayShare: div(delayByKey[t.key], processAll),
      };
    });

    return {
      hours: HOURS,
      shiftGroups: SHIFT_GROUPS,
      summary: {
        target: target,
        htpActual: htpActual,
        htpGap: htpActual === null ? null : htpActual - target,
        obPlan: obPlan,
        sopD1: sopD1,
        sopD0: sopD0,
        sopDiff: sopD0 - sopD1,
        ibMix: div(sopD0, sopD0 + obPlan),
        plan: plan,
      },
      taskSummary: taskSummary,
      vehicles: vehicleHourly,
      hourly: {
        unload: unload,
        unloadDirect: q.unloadDirect,
        unloadTransfer: q.unloadTransfer,
        receive: receive,
        receiveEach: q.receiveEach,
        receivePallet: q.receivePallet,
        stow: stow,
        stowEach: q.stowEach,
        stowPallet: q.stowPallet,
        productivity: productivity,
      },
      shiftHtp: shiftHtp,
      stowMix: stowMix,
      process: {
        direct: { hourly: directMh, total: processTotals.direct, share: div(processTotals.direct, processAll) },
        indirect: { hourly: indirectMh, total: processTotals.indirect, share: div(processTotals.indirect, processAll) },
        centre: { hourly: centreMh, total: processTotals.centre, share: div(processTotals.centre, processAll) },
      },
      tasks: taskRows,
      checkInDelay: delay.people,
      simulation: sim,
    };
  }

  const api = {
    HOURS: HOURS,
    SHIFT_GROUPS: SHIFT_GROUPS,
    TASKS: TASKS,
    MOS_COLUMNS: MOS_COLUMNS,
    parseMosTable: parseMosTable,
    tsvToTable: tsvToTable,
    computeStatus: computeStatus,
    total: total,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HtpCalc = api;
})(typeof window !== "undefined" ? window : globalThis);
