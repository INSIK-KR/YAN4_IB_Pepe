"use strict";

(function () {
  const Calc = window.HtpCalc;
  const HC_LABELS = ["팀캡틴", "계약직", "단기직", "신규", "조퇴", "OB->IB", "IB->OB", "IB->ICQA", "Hub->IB"];
  const VEHICLE_FIELDS = [
    { key: "date", label: "운영일자", type: "text" },
    { key: "arrival", label: "실제도착시간", type: "text", placeholder: "13:05" },
    { key: "fromFc", label: "From FC", type: "text" },
    { key: "temp", label: "온도구분", type: "select", options: ["Ambient", "Chilled", "Frozen", "RM"] },
    { key: "measured", label: "측정온도", type: "number" },
    { key: "vehicleNo", label: "차량번호", type: "text" },
    { key: "pallet", label: "PALLET", type: "number" },
  ];

  const state = {
    mos: null, // { rows, workDate, source }
    inputs: defaultInputs(),
  };

  function defaultInputs() {
    return {
      target: 223.2,
      obPlan: 0,
      rates: { day: 0.356, swing: 0.326, night: 0.318 },
      facility: { day: 0, swing: 0, night: 0 },
      sop: {
        d1: { direct: 0, xdock: 0, rc: 0, rocketmart: 0 },
        d0: { direct: 0, xdock: 0, rc: 0, rocketmart: 0 },
      },
      hc: HC_LABELS.map(function (label) {
        return { label: label, day: { tar: 0, act: 0 }, swing: { tar: 0, act: 0 }, night: { tar: 0, act: 0 } };
      }),
      vehicles: [],
    };
  }

  // ---------- 공통 ----------
  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function fmtInt(v) {
    if (v === null || v === undefined || !isFinite(v)) return "";
    return Math.round(v).toLocaleString("ko-KR");
  }

  function fmt1(v) {
    if (v === null || v === undefined || !isFinite(v)) return "";
    return v.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function fmtPct(v) {
    if (v === null || v === undefined || !isFinite(v)) return "";
    return (v * 100).toFixed(1) + "%";
  }

  function hourLabel(h) {
    return String(h % 24).padStart(2, "0");
  }

  function getPath(obj, p) {
    return p.split(".").reduce(function (o, k) {
      return o == null ? undefined : o[k];
    }, obj);
  }

  function setPath(obj, p, v) {
    const keys = p.split(".");
    let o = obj;
    keys.slice(0, -1).forEach(function (k) {
      if (o[k] == null || typeof o[k] !== "object") o[k] = {};
      o = o[k];
    });
    o[keys[keys.length - 1]] = v;
  }

  // ---------- 탭 ----------
  const tabs = document.querySelectorAll(".tab");
  const views = document.querySelectorAll(".view");
  let currentView = "status";

  function show(name) {
    currentView = name;
    tabs.forEach(function (t) {
      t.classList.toggle("active", t.dataset.view === name);
    });
    views.forEach(function (v) {
      v.hidden = v.dataset.view !== name;
    });
    if (name === "status") renderStatus();
  }

  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      show(t.dataset.view);
    });
  });

  // ---------- 입력값 저장 ----------
  let saveTimer = null;
  function saveInputs() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (window.cfsHtp) window.cfsHtp.saveInputs(state.inputs);
    }, 300);
  }

  function mergeInputs(saved) {
    const base = defaultInputs();
    if (!saved) return base;
    const merged = Object.assign(base, saved);
    merged.hc = HC_LABELS.map(function (label, i) {
      const row = (saved.hc || [])[i] || {};
      return {
        label: label,
        day: Object.assign({ tar: 0, act: 0 }, row.day),
        swing: Object.assign({ tar: 0, act: 0 }, row.swing),
        night: Object.assign({ tar: 0, act: 0 }, row.night),
      };
    });
    merged.vehicles = Array.isArray(saved.vehicles) ? saved.vehicles : [];
    return merged;
  }

  // ---------- MOS 자료 ----------
  function setMos(table, source) {
    const parsed = Calc.parseMosTable(table);
    if (parsed.missing.length) {
      $("mosInfo").innerHTML =
        '<span class="bad">필요한 열을 찾지 못했습니다: ' + esc(parsed.missing.join(", ")) + "</span>";
      return;
    }
    if (!parsed.rows.length) {
      $("mosInfo").innerHTML = '<span class="bad">MOS 행이 없습니다.</span>';
      return;
    }
    state.mos = { rows: parsed.rows, workDate: parsed.workDate, source: source };
    $("mosInfo").innerHTML =
      "<b>" + esc(source) + "</b> · " + fmtInt(parsed.rows.length) + "행 · 운영일 " + esc(parsed.workDate || "-");
    $("mosState").textContent = "MOS " + fmtInt(parsed.rows.length) + "행 · " + (parsed.workDate || "");
    renderMosPreview(table);
  }

  function renderMosPreview(table) {
    const rows = table.slice(0, 31);
    const html = rows
      .map(function (r, i) {
        const tag = i === 0 ? "th" : "td";
        return (
          "<tr>" +
          r
            .slice(0, 33)
            .map(function (c) {
              return "<" + tag + ">" + esc(c) + "</" + tag + ">";
            })
            .join("") +
          "</tr>"
        );
      })
      .join("");
    $("mosPreview").innerHTML = html;
    $("mosPreviewCard").hidden = false;
  }

  $("mosFile").addEventListener("change", function (e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    $("mosInfo").textContent = "읽는 중… (" + file.name + ")";
    file.arrayBuffer().then(function (buf) {
      setTimeout(function () {
        try {
          loadWorkbook(buf, file.name);
        } catch (err) {
          $("mosInfo").innerHTML = '<span class="bad">파일을 읽지 못했습니다: ' + esc(err.message) + "</span>";
        }
      }, 30);
    });
  });

  /** 엑셀/CSV 바이트 → MOS 행. 큰 통합문서도 MOS 시트만 읽는다 */
  function loadWorkbook(buf, label) {
    const probe = XLSX.read(buf, { type: "array", bookSheets: true });
    const sheetName = probe.SheetNames.indexOf("MOS") >= 0 ? "MOS" : probe.SheetNames[0];
    const wb = XLSX.read(buf, { type: "array", sheets: [sheetName], dense: true });
    const table = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: "" });
    setMos(table, label + " [" + sheetName + "]");
    return !!state.mos;
  }

  // ---------- MOS에서 받기 ----------
  const MOS_BASE = "https://mos.coupang.net";
  const MOS_REFERER = MOS_BASE + "/status/worker-history?resource=38";
  const MOS_CENTER_ID = "1007"; // YAN4

  function todayLocal() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function workerHistoryQuery(date) {
    const p = new URLSearchParams();
    p.set("startDate", date);
    p.set("endDate", date);
    p.set("centerId", MOS_CENTER_ID);
    p.set("contractType", "ALL");
    ["INBOUND", "OTHER", "OUTBOUND"].forEach(function (t) {
      p.append("workTypeCdList", t);
    });
    p.set("isAgv", "ALL");
    return p.toString();
  }

  const STATUS_POLL_MS = 1500;
  const STATUS_POLL_MAX = 600; // 1.5초 × 600 = 15분까지 기다림

  /**
   * exportExcel 응답에서 파일 ID(UUID)와 파일 이름을 찾는다.
   * 응답 모양을 아직 확인하지 못해 문자열에서 UUID·*.xlsx 를 찾는다.
   * 파일 이름이 없으면 MOS 화면과 같은 규칙(worker_history_요청시각.xlsx)으로 만든다.
   */
  function parseExportResponse(text, requestedAt) {
    const s = String(text || "").replace(/\\\//g, "/");
    const id = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.exec(s);
    if (!id) return null;
    const name = /[\w.-]+\.xlsx/.exec(s);
    const d = requestedAt;
    const stamp =
      d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, "0") +
      String(d.getDate()).padStart(2, "0") +
      String(d.getHours()).padStart(2, "0") +
      String(d.getMinutes()).padStart(2, "0") +
      String(d.getSeconds()).padStart(2, "0");
    return { id: id[0], fileName: name ? name[0] : "worker_history_" + stamp + ".xlsx", nameFromServer: !!name };
  }

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  /** getAsyncFileSaveStatus 가 SUCCESS 가 될 때까지 기다린다 */
  async function waitForExport(id) {
    for (let i = 0; i < STATUS_POLL_MAX; i++) {
      const res = await window.cfsHtp.mosFetch({
        url: MOS_BASE + "/common/export-excel/getAsyncFileSaveStatus/" + id,
        method: "GET",
        referer: MOS_REFERER,
        headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json, text/javascript, */*; q=0.01" },
      });
      if (!res.ok) return { ok: false, error: res.error || "HTTP " + res.status };
      let status = "";
      try {
        status = String(JSON.parse(res.body).status || "").toUpperCase();
      } catch (_e) {
        return { ok: false, error: "상태 응답을 읽지 못함", body: res.body };
      }
      if (status === "SUCCESS") return { ok: true };
      if (/FAIL|ERROR|CANCEL/.test(status)) return { ok: false, error: "MOS 파일 만들기 실패 (" + status + ")" };
      downloadInfo("MOS가 엑셀을 만드는 중… " + esc(status || "") + " (" + Math.round(((i + 1) * STATUS_POLL_MS) / 1000) + "초)");
      await sleep(STATUS_POLL_MS);
    }
    return { ok: false, error: "15분이 지나도 파일이 준비되지 않았습니다" };
  }

  function base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  function downloadInfo(html) {
    $("mosDownloadInfo").innerHTML = html;
  }

  async function downloadFromMos() {
    const date = $("mosDate").value;
    if (!date) return downloadInfo('<span class="bad">날짜를 고르세요.</span>');
    const st = await window.cfsHtp.mosStatus();
    if (!st.loggedIn) return downloadInfo('<span class="bad">MOS 로그인이 필요합니다. 오른쪽 위 MOS 로그인을 눌러주세요.</span>');

    downloadInfo("MOS에 엑셀 만들기 요청 중… (" + esc(date) + ")");
    const requestedAt = new Date();
    const exp = await window.cfsHtp.mosFetch({
      url: MOS_BASE + "/status/worker-history/exportExcel?" + workerHistoryQuery(date),
      method: "POST",
      body: "",
      contentType: "application/x-www-form-urlencoded; charset=UTF-8",
      referer: MOS_REFERER,
      headers: { Origin: MOS_BASE, "X-Requested-With": "XMLHttpRequest", Accept: "application/json, text/javascript, */*; q=0.01" },
    });
    if (!exp.ok) return downloadInfo('<span class="bad">엑셀 만들기 실패: ' + esc(exp.error || "HTTP " + exp.status) + "</span>");
    const rawExport = '<pre>exportExcel 응답:\n' + esc(String(exp.body || "").slice(0, 2000)) + "</pre>";
    const job = parseExportResponse(exp.body, requestedAt);
    if (!job) {
      return downloadInfo('<span class="bad">MOS 응답에서 파일 ID를 찾지 못했습니다. 아래 응답을 개발자에게 전달해 주세요.</span>' + rawExport);
    }

    const done = await waitForExport(job.id);
    if (!done.ok) {
      return downloadInfo('<span class="bad">' + esc(done.error) + "</span>" + (done.body ? "<pre>" + esc(String(done.body).slice(0, 1000)) + "</pre>" : ""));
    }

    downloadInfo("파일 받는 중… " + esc(job.fileName));
    const file = await window.cfsHtp.mosFetch({
      url: MOS_BASE + "/common/export-excel/downloadSavedFile/" + job.id + "/" + encodeURIComponent(job.fileName),
      method: "GET",
      referer: MOS_REFERER,
      binary: true,
      headers: { Accept: "*/*" },
    });
    if (!file.ok || !file.base64) {
      return downloadInfo(
        '<span class="bad">파일 받기 실패: ' + esc(file.error || "HTTP " + file.status) + "</span>" + (job.nameFromServer ? "" : " (파일 이름을 추정해서 요청함 — 아래 응답을 개발자에게 전달해 주세요)" + rawExport)
      );
    }

    downloadInfo("엑셀 읽는 중…");
    await new Promise(function (r) {
      setTimeout(r, 30);
    });
    const buf = base64ToArrayBuffer(file.base64);
    let loaded = false;
    try {
      loaded = loadWorkbook(buf, "MOS " + date);
    } catch (err) {
      return downloadInfo('<span class="bad">받은 파일을 읽지 못했습니다: ' + esc(err.message) + "</span>");
    }
    if (!loaded) return downloadInfo('<span class="bad">받은 파일의 열이 예상과 다릅니다. 아래 MOS 자료 넣기 칸의 안내를 확인하세요.</span>');
    downloadInfo('<span class="good">완료</span> · ' + fmtInt(state.mos.rows.length) + "행 · " + fmtInt(buf.byteLength / 1024) + " KB");
  }

  $("mosDate").value = todayLocal();
  $("mosDownload").addEventListener("click", function () {
    const btn = $("mosDownload");
    btn.disabled = true;
    downloadFromMos()
      .catch(function (err) {
        downloadInfo('<span class="bad">오류: ' + esc(err && err.message ? err.message : err) + "</span>");
      })
      .finally(function () {
        btn.disabled = false;
      });
  });

  $("mosClear").addEventListener("click", function () {
    state.mos = null;
    $("mosInfo").textContent = "";
    $("mosState").textContent = "MOS 자료 없음";
    $("mosPreviewCard").hidden = true;
  });

  document.addEventListener("paste", function (e) {
    if (currentView !== "mos") return;
    const text = e.clipboardData && e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    setMos(Calc.tsvToTable(text), "붙여넣기");
  });

  // ---------- 입력 화면 ----------
  function bindInputs() {
    document.querySelectorAll("[data-path]").forEach(function (el) {
      const v = getPath(state.inputs, el.dataset.path);
      el.value = v === undefined || v === null ? "" : v;
      el.addEventListener("input", function () {
        setPath(state.inputs, el.dataset.path, el.value === "" ? 0 : Number(el.value));
        saveInputs();
      });
    });
  }

  function renderHcTable() {
    const shifts = ["day", "swing", "night"];
    let html =
      "<thead><tr><th rowspan=2></th><th colspan=2>Day</th><th colspan=2>Swing</th><th colspan=2>Night</th></tr>" +
      "<tr><th>Tar.</th><th>Act.</th><th>Tar.</th><th>Act.</th><th>Tar.</th><th>Act.</th></tr></thead><tbody>";
    state.inputs.hc.forEach(function (row, i) {
      html += "<tr><th>" + esc(row.label) + "</th>";
      shifts.forEach(function (s) {
        ["tar", "act"].forEach(function (k) {
          html += '<td><input type="number" data-hc="' + i + "." + s + "." + k + '" value="' + esc(row[s][k] || "") + '" /></td>';
        });
      });
      html += "</tr>";
    });
    $("hcTable").innerHTML = html + "</tbody>";
    $("hcTable").querySelectorAll("input").forEach(function (el) {
      el.addEventListener("input", function () {
        const parts = el.dataset.hc.split(".");
        state.inputs.hc[Number(parts[0])][parts[1]][parts[2]] = el.value === "" ? 0 : Number(el.value);
        saveInputs();
      });
    });
  }

  function renderVehicleTable() {
    let html =
      "<thead><tr>" +
      VEHICLE_FIELDS.map(function (f) {
        return "<th>" + esc(f.label) + "</th>";
      }).join("") +
      "<th></th></tr></thead><tbody>";
    state.inputs.vehicles.forEach(function (v, i) {
      html += "<tr>";
      VEHICLE_FIELDS.forEach(function (f) {
        const val = esc(v[f.key] === undefined ? "" : v[f.key]);
        if (f.type === "select") {
          html +=
            '<td><select data-v="' + i + "." + f.key + '"><option value=""></option>' +
            f.options
              .map(function (o) {
                return "<option" + (o === v[f.key] ? " selected" : "") + ">" + o + "</option>";
              })
              .join("") +
            "</select></td>";
        } else {
          html +=
            '<td><input type="' + f.type + '" data-v="' + i + "." + f.key + '" value="' + val + '" placeholder="' + esc(f.placeholder || "") + '" /></td>';
        }
      });
      html += '<td><button class="link" data-del="' + i + '">삭제</button></td></tr>';
    });
    $("vehicleTable").innerHTML = html + "</tbody>";
    $("vehicleTable").querySelectorAll("[data-v]").forEach(function (el) {
      el.addEventListener("input", function () {
        const parts = el.dataset.v.split(".");
        const f = VEHICLE_FIELDS.find(function (x) {
          return x.key === parts[1];
        });
        state.inputs.vehicles[Number(parts[0])][parts[1]] = f.type === "number" && el.value !== "" ? Number(el.value) : el.value;
        saveInputs();
      });
    });
    $("vehicleTable").querySelectorAll("[data-del]").forEach(function (el) {
      el.addEventListener("click", function () {
        state.inputs.vehicles.splice(Number(el.dataset.del), 1);
        saveInputs();
        renderVehicleTable();
      });
    });
    $("vehicleTable").querySelectorAll("input").forEach(function (el) {
      el.addEventListener("paste", onVehiclePaste);
    });
  }

  /** 엑셀 이관차량하차정보 C~J열을 그대로 붙여넣기 (하차시간대 열은 건너뜀) */
  function onVehiclePaste(e) {
    const text = e.clipboardData && e.clipboardData.getData("text/plain");
    if (!text || text.indexOf("\t") < 0) return;
    e.preventDefault();
    const rows = Calc.tsvToTable(text).filter(function (r) {
      return r.length >= 8 && /\d{1,2}:\d{2}/.test(r[1]);
    });
    rows.forEach(function (r) {
      state.inputs.vehicles.push({
        date: r[0],
        arrival: r[1],
        fromFc: r[3],
        temp: r[4],
        measured: r[5] === "" ? "" : Number(r[5]),
        vehicleNo: r[6],
        pallet: r[7] === "" ? "" : Number(r[7]),
      });
    });
    saveInputs();
    renderVehicleTable();
  }

  $("vehicleAdd").addEventListener("click", function () {
    state.inputs.vehicles.push({ date: "", arrival: "", fromFc: "", temp: "", measured: "", vehicleNo: "", pallet: "" });
    saveInputs();
    renderVehicleTable();
  });

  $("vehicleClear").addEventListener("click", function () {
    if (!state.inputs.vehicles.length) return;
    if (!window.confirm("이관 차량 " + state.inputs.vehicles.length + "건을 모두 지울까요?")) return;
    state.inputs.vehicles = [];
    saveInputs();
    renderVehicleTable();
  });

  // ---------- Status 화면 ----------
  function hourlyHeader(m, firstCols) {
    let top = "<tr>" + firstCols.map(function () {
      return "<th></th>";
    }).join("");
    m.shiftGroups.forEach(function (g) {
      top += '<th class="shift-head" colspan="' + (g.to - g.from + 1) + '">' + esc(g.label) + "</th>";
    });
    top += "</tr>";
    let second = "<tr>" + firstCols.map(function (c) {
      return "<th>" + esc(c) + "</th>";
    }).join("");
    m.hours.forEach(function (h) {
      second += '<th class="' + (isGroupStart(m, h) ? "gs" : "") + '">' + hourLabel(h) + "</th>";
    });
    return "<thead>" + top + second + "</tr></thead>";
  }

  function isGroupStart(m, h) {
    return m.shiftGroups.some(function (g) {
      return g.from === h;
    });
  }

  function hourlyCells(m, hourly, fmt, cls) {
    return m.hours
      .map(function (h) {
        const v = hourly[h];
        const extra = typeof cls === "function" ? cls(v) : "";
        return '<td class="num ' + (isGroupStart(m, h) ? "gs " : "") + extra + '">' + (v ? fmt(v) : "") + "</td>";
      })
      .join("");
  }

  function sum(hourly) {
    return Calc.total(hourly);
  }

  function renderStatus() {
    if (!state.mos) {
      $("statusEmpty").hidden = false;
      $("statusBody").hidden = true;
      return;
    }
    const m = Calc.computeStatus(state.mos.rows, state.inputs);
    $("statusEmpty").hidden = true;
    $("statusBody").hidden = false;
    $("statusBody").innerHTML =
      renderTop(m) + renderHourly(m) + renderStowMix(m) + renderManHour(m) + renderDelayPeople(m);
  }

  function renderTop(m) {
    const s = m.summary;
    const gapCls = s.htpGap === null ? "" : s.htpGap >= 0 ? "good" : "bad";
    const sop = state.inputs.sop;
    const sopRow = function (label, key) {
      const d1 = Number(sop.d1[key]) || 0;
      const d0 = Number(sop.d0[key]) || 0;
      return "<tr><th>" + label + '</th><td class="num">' + fmtInt(d1) + '</td><td class="num">' + fmtInt(d0) + '</td><td class="num">' + fmtInt(d0 - d1) + "</td></tr>";
    };
    let html = '<div class="top-grid">';
    html +=
      '<div class="card kpi"><table class="kv">' +
      "<tr><th>Date</th><td>" + esc(state.mos.workDate) + "</td></tr>" +
      "<tr><th>Target</th><td>" + fmt1(s.target) + "</td></tr>" +
      '<tr><th>HTP Actual</th><td class="big">' + fmt1(s.htpActual) + "</td></tr>" +
      '<tr><th>HTP Gap</th><td class="' + gapCls + '">' + fmt1(s.htpGap) + "</td></tr>" +
      "<tr><th>IB MIX</th><td>" + fmtPct(s.ibMix) + "</td></tr>" +
      "</table></div>";

    html +=
      '<div class="card"><h3>S&amp;OP</h3><table class="grid">' +
      "<thead><tr><th></th><th>D-1</th><th>D-0</th><th>Diff.</th></tr></thead><tbody>" +
      '<tr class="sum"><th>Total</th><td class="num">' + fmtInt(s.sopD1) + '</td><td class="num">' + fmtInt(s.sopD0) + '</td><td class="num">' + fmtInt(s.sopDiff) + "</td></tr>" +
      sopRow("Direct", "direct") + sopRow("Xdock", "xdock") + sopRow("RC", "rc") + sopRow("RocketMart", "rocketmart") +
      '</tbody></table><table class="grid"><thead><tr><th></th><th>Day</th><th>Swing</th><th>Night</th></tr></thead><tbody>' +
      '<tr><th>Rate</th><td class="num">' + fmtPct(state.inputs.rates.day) + '</td><td class="num">' + fmtPct(state.inputs.rates.swing) + '</td><td class="num">' + fmtPct(state.inputs.rates.night) + "</td></tr>" +
      '<tr><th>Plan</th><td class="num">' + fmtInt(s.plan.day) + '</td><td class="num">' + fmtInt(s.plan.swing) + '</td><td class="num">' + fmtInt(s.plan.night) + "</td></tr>" +
      "</tbody></table></div>";

    html += '<div class="card"><h3>업무별</h3><table class="grid"><thead><tr><th>Task</th><th>Total</th>';
    m.shiftGroups.forEach(function (g) {
      html += '<th colspan="2">' + esc(g.label) + "</th>";
    });
    html += "</tr></thead><tbody>";
    m.taskSummary.forEach(function (row) {
      const f = row.unit === "qty" ? fmtInt : fmt1;
      html += "<tr" + (row.unit === "hc" && row.label === "하차" ? ' class="split"' : "") + "><th>" + esc(row.label) + (row.unit === "hc" ? " 인원" : "") + '</th><td class="num">' + f(row.total) + "</td>";
      m.shiftGroups.forEach(function (g) {
        html += '<td class="num">' + f(row[g.key].value) + '</td><td class="num muted">' + fmtPct(row[g.key].share) + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table></div>";

    html += renderHcAndSim(m);
    return html + "</div>";
  }

  function renderHcAndSim(m) {
    const shifts = [["day", "Day"], ["swing", "Swing"], ["night", "Night"]];
    let html = '<div class="card hc-sim"><div><h3>H/C</h3><table class="grid"><thead><tr><th></th>';
    shifts.forEach(function (s) {
      html += '<th colspan="3">' + s[1] + "</th>";
    });
    html += "</tr><tr><th></th>" + shifts.map(function () {
      return "<th>Tar.</th><th>Act.</th><th>Diff.</th>";
    }).join("") + "</tr></thead><tbody>";
    state.inputs.hc.forEach(function (row) {
      html += "<tr><th>" + esc(row.label) + "</th>";
      shifts.forEach(function (s) {
        const tar = Number(row[s[0]].tar) || 0;
        const act = Number(row[s[0]].act) || 0;
        const diff = act - tar;
        html += '<td class="num">' + (tar || "") + '</td><td class="num">' + (act || "") + '</td><td class="num ' + (diff < 0 ? "bad" : "") + '">' + (diff || "") + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table></div>";

    const sim = m.simulation;
    const line = function (label, block, key, f) {
      return "<tr><th>" + label + "</th>" + shifts.map(function (s) {
        return '<td class="num">' + f(sim[block][s[0]][key]) + "</td>";
      }).join("") + "</tr>";
    };
    html += '<div><h3>근무조 시뮬레이션</h3><table class="grid"><thead><tr><th></th><th>Day</th><th>Swing</th><th>Night</th></tr></thead><tbody>';
    [["tar", "Tar"], ["act", "Act"], ["simul", "Simul"]].forEach(function (b) {
      html += '<tr class="sum"><th colspan="4">' + b[1] + "</th></tr>";
      html += line("Total", b[0], "total", fmtInt) + line("Facility", b[0], "facility", fmtInt) + line("Gap", b[0], "gap", fmtInt);
      html += line(b[0] === "simul" ? "Expect Stow" : "Stow", b[0], "stow", fmtInt) + line("HTP", b[0], "htp", fmt1);
    });
    html += line("Act − Target Stow", "simul", "actMinusTarget", fmtInt) + line("Act − Simul Stow", "simul", "actMinusSimul", fmtInt);
    return html + "</tbody></table></div></div>";
  }

  function renderHourly(m) {
    const target = Number(state.inputs.target) || 0;
    const v = m.vehicles;
    const row = function (label, hourly, fmt, cls, rowCls) {
      return '<tr class="' + (rowCls || "") + '"><th>' + label + '</th><td class="num">' + fmt(sum(hourly)) + "</td>" + hourlyCells(m, hourly, fmt, cls) + "</tr>";
    };
    let html = '<div class="card"><h3>시간대별 현황</h3><div class="table-wrap"><table class="grid hourly">' + hourlyHeader(m, ["", "총계"]) + "<tbody>";
    html += row("차량대수 (실제 도착)", v.count, fmtInt);
    html += row("하차 PLT", v.pallet, fmtInt, null, "sum");
    html += row("　Ambient", v.Ambient, fmtInt) + row("　Chilled", v.Chilled, fmtInt) + row("　Frozen", v.Frozen, fmtInt) + row("　RocketMart", v.RM, fmtInt);
    html += '<tr class="sum"><th>근무조 HTP</th><td></td>';
    m.shiftGroups.forEach(function (g, i) {
      const htp = m.shiftHtp[i].htp;
      html += '<td class="num gs ' + (htp === null ? "" : htp >= target ? "good" : "bad") + '" colspan="' + (g.to - g.from + 1) + '">' + esc(g.label) + " " + fmt1(htp) + "</td>";
    });
    html += "</tr>";
    html += row("생산성", m.hourly.productivity, fmt1, function (x) {
      return x === null || x === undefined ? "" : x >= target ? "good" : "bad";
    });
    html += row("하차", m.hourly.unload, fmtInt, null, "sum") + row("　직납", m.hourly.unloadDirect, fmtInt) + row("　이관", m.hourly.unloadTransfer, fmtInt);
    html += row("매입", m.hourly.receive, fmtInt, null, "sum") + row("　개별", m.hourly.receiveEach, fmtInt) + row("　팔레트", m.hourly.receivePallet, fmtInt);
    html += row("진열", m.hourly.stow, fmtInt, null, "sum") + row("　ACT.개별", m.hourly.stowEach, fmtInt) + row("　ACT.팔레트", m.hourly.stowPallet, fmtInt);
    return html + "</tbody></table></div></div>";
  }

  function renderStowMix(m) {
    let html = '<div class="card"><h3>진열 구성</h3><div class="table-wrap"><table class="grid hourly">' + hourlyHeader(m, ["", "비율", "총계"]) + "<tbody>";
    const row = function (label, hourly, parentTotal, rowCls) {
      const t = sum(hourly);
      return '<tr class="' + (rowCls || "") + '"><th>' + label + '</th><td class="num muted">' + (parentTotal ? fmtPct(t / parentTotal) : "") + '</td><td class="num">' + fmtInt(t) + "</td>" + hourlyCells(m, hourly, fmtInt) + "</tr>";
    };
    [["direct", "directParts"], ["transfer", "transferParts"]].forEach(function (k) {
      const g = m.stowMix[k[0]];
      const gTotal = sum(g.sum);
      html += row(g.label, g.sum, 0, "sum") + row("　개별", g.each, gTotal) + row("　팔레트", g.pallet, gTotal);
      m.stowMix[k[1]].forEach(function (p) {
        const pTotal = sum(p.sum);
        html += row("　" + p.label, p.sum, gTotal, "sub") + row("　　개별", p.each, pTotal) + row("　　팔레트", p.pallet, pTotal);
      });
    });
    return html + "</tbody></table></div></div>";
  }

  function renderManHour(m) {
    let html = '<div class="card"><h3>공정별 투입시간 (MH)</h3><div class="table-wrap"><table class="grid hourly">' + hourlyHeader(m, ["", "비율", "총계", "지연 MH", "지연 비율"]) + "<tbody>";
    const p = m.process;
    [["직접공정", p.direct], ["간접공정", p.indirect], ["센터공정", p.centre]].forEach(function (x) {
      html += '<tr class="sum"><th>' + x[0] + '</th><td class="num muted">' + fmtPct(x[1].share) + '</td><td class="num">' + fmt1(x[1].total) + "</td><td></td><td></td>" + hourlyCells(m, x[1].hourly, fmt1) + "</tr>";
    });
    let group = null;
    m.tasks.forEach(function (t) {
      if (t.group !== group) {
        group = t.group;
        const members = m.tasks.filter(function (x) {
          return x.group === group;
        });
        const gh = {};
        m.hours.forEach(function (h) {
          gh[h] = members.reduce(function (s, x) {
            return s + (x.hourly[h] || 0);
          }, 0);
        });
        html += '<tr class="sub"><th>' + esc(group) + '</th><td></td><td class="num">' + fmt1(sum(gh)) + '</td><td class="num">' + fmt1(members.reduce(function (s, x) {
          return s + x.delay;
        }, 0)) + "</td><td></td>" + hourlyCells(m, gh, fmt1) + "</tr>";
      }
      html += "<tr><th>　" + esc(t.label) + '</th><td class="num muted">' + fmtPct(t.share) + '</td><td class="num">' + fmt1(t.total) + '</td><td class="num">' + (t.delay ? fmt1(t.delay) : "") + '</td><td class="num muted">' + (t.delay ? fmtPct(t.delayShare) : "") + "</td>" + hourlyCells(m, t.hourly, fmt1) + "</tr>";
    });
    return html + "</tbody></table></div></div>";
  }

  function renderDelayPeople(m) {
    const list = m.checkInDelay
      .filter(function (p) {
        return p.manHour > 0;
      })
      .sort(function (a, b) {
        return b.manHour - a.manHour;
      });
    let html = '<div class="card"><details><summary>체크인 지연 인원 ' + list.length + "명</summary>";
    html += '<table class="grid"><thead><tr><th>Employee</th><th>근무조</th><th>첫 시작</th><th>첫 공정</th><th>지연 MH</th></tr></thead><tbody>';
    list.forEach(function (p) {
      const mins = Math.round(p.firstStart * 1440);
      const hh = Math.floor(mins / 60);
      const mm = String(mins % 60).padStart(2, "0");
      html += "<tr><td>" + esc(p.employee) + "</td><td>" + esc(p.shift) + '</td><td class="num">' + String(hh).padStart(2, "0") + ":" + mm + "</td><td>" + esc(p.task) + '</td><td class="num">' + fmt1(p.manHour) + "</td></tr>";
    });
    return html + "</tbody></table></details></div>";
  }

  // ---------- MOS 로그인 ----------
  function renderMosSession(st) {
    const loggedIn = !!(st && st.loggedIn);
    $("mosLoginDot").classList.toggle("on", loggedIn);
    $("mosLoginText").textContent = loggedIn ? "MOS 로그인됨" : "MOS 로그인";
  }

  $("mosLogin").addEventListener("click", function () {
    if (window.cfsHtp) window.cfsHtp.mosLogin();
  });

  if (window.cfsHtp) {
    window.cfsHtp.onMosSession(renderMosSession);
    window.cfsHtp.mosStatus().then(renderMosSession);
  }

  // ---------- 시작 ----------
  function start(saved) {
    state.inputs = mergeInputs(saved);
    bindInputs();
    renderHcTable();
    renderVehicleTable();
    renderStatus();
  }

  if (window.cfsHtp) {
    window.cfsHtp.appInfo().then(function (info) {
      $("appVersion").textContent = "v" + info.version;
    });
    window.cfsHtp.loadInputs().then(start, function () {
      start(null);
    });
  } else {
    start(null);
  }
})();
