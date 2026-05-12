// ==UserScript==

// @name         MOS ADS Process Path Bulk Collector (ETA + DnD)

// @namespace    mos-ads-processpath-ui

// @version      6.1

// @match        https://mos.coupang.net/adHocData/79*

// @grant        GM_setClipboard

// ==/UserScript==
 
(async function () {

  'use strict';
 
  /***********************

   * PROCESS GROUP DEFINITIONS

   ***********************/

  const PROCESS_GROUPS = {

    favorites: [

      "1.01 M","1.02 M_ACE","1.03 M_FT",

      "2.01 S CG1","2.02 S CG2","2.025 S CG3","2.03 S Egg",

      "3.03 S F3","3.04 S F1 FT"

    ],

    disabled: [

      "3.05 S F2 FT","3.06 S F3 FT",

      "4.01 S AG1","4.02 S AG2",

      "5.00 S RM_BOX","5.01 S RM_PB","5.01 S RM_PB_1","5.02 S RM_SIOC",

      "5.03 S 상온 Overtote","5.04 S 냉장 Overtote","5.05 S 냉동 Overtote",

      "5.11 S 계란 1호","5.12 S 계란 2호",

      "UNKNOWN"

    ]

  };
 
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const TABLE_UPDATE_TIMEOUT = 15000;

  const BETWEEN_ACTION_DELAY = 600;
 
  let stopRequested = false;

  let lastSelectedPath = null;

  let startTime = null;

  let processedCount = 0;

  let totalCount = 0;
 
  /***********************

   * Helper

   ***********************/

  const $ = s => document.querySelector(s);

  const $$ = s => [...document.querySelectorAll(s)];
 
  function findSearchButton() {

    return $$("button").find(b => b.textContent.replace(/\s+/g, "").includes("검색"));

  }
 
  function openProcessPathDropdown() {

    const label = $$("label").find(l => l.innerText.includes("Process Path"));

    label?.parentElement.querySelector('[role="combobox"], input')?.click();

  }
 
  function findOptionByName(name) {

    return $$('[role="option"]').find(o => o.innerText.trim() === name);

  }
 
  async function waitForTableChange(prevHtml) {

    const start = Date.now();

    while (Date.now() - start < TABLE_UPDATE_TIMEOUT) {

      if (stopRequested) return null;

      const tbody = $("table tbody");

      if (tbody && tbody.innerHTML !== prevHtml) return tbody;

      await sleep(300);

    }

    return null;

  }
 
  function collectTable(path) {

    const tbody = $("table tbody");

    if (!tbody) return [];

    return [...tbody.querySelectorAll("tr")].map(tr => {

      const cols = [...tr.querySelectorAll("td")].map(td => td.innerText.trim());

      return [path, ...cols].join("\t");

    });

  }
 
  function formatETA(ms) {

    if (ms <= 0) return "계산중...";

    const sec = Math.floor(ms / 1000);

    return `${Math.floor(sec / 60)}m ${sec % 60}s`;

  }
 
  /***********************

   * UI

   ***********************/

  function createUI() {

    const panel = document.createElement("div");

    panel.style.cssText = `

      position:fixed; top:120px; left:20px;

      width:390px; background:#fff;

      border:1px solid #ccc; z-index:99999;

      font-size:12px; box-shadow:0 2px 8px rgba(0,0,0,.25);

    `;
 
    panel.innerHTML = `
<div id="pp-header" style="padding:8px;font-weight:bold;cursor:move;background:#f3f3f3;border-bottom:1px solid #ddd;">

        Process Path Collector
</div>
 
      <div style="padding:10px;border-bottom:1px solid #eee;">
<div id="pp-current-path" style="font-size:16px;font-weight:bold;color:#2e7dff;">대기중</div>
<div id="pp-progress-text"></div>
<div id="pp-eta-text" style="color:#555;margin-bottom:6px;"></div>
<div style="height:10px;background:#eee;border-radius:5px;overflow:hidden;">
<div id="pp-progress-inner" style="width:0%;height:100%;background:#2e7dff;"></div>
</div>
</div>
 
      <div style="padding:8px;">
<div id="pp-list" style="max-height:320px;overflow-y:auto;"></div>
<hr/>
<div style="display:flex;gap:6px;">
<button id="pp-start" style="flex:1;background:#2e7dff;color:#fff;">▶ Start</button>
<button id="pp-stop" style="flex:1;background:#777;color:#fff;">⛔ Stop</button>
</div>
</div>

    `;

    document.body.appendChild(panel);

    makeDraggable(panel, $("#pp-header"));
 
    const list = $("#pp-list");
 
    function renderGroup(title, paths, checked, id) {

      list.insertAdjacentHTML("beforeend", `
<div data-group="${id}" style="border:1px solid #ddd;margin-bottom:10px;padding:6px;">
<div style="display:flex;justify-content:space-between;align-items:center;font-weight:bold;margin-bottom:6px;">
<span>${title}</span>
<span style="display:flex;gap:4px;">
<button class="pp-check-all" data-group="${id}">✔ 전체</button>
<button class="pp-uncheck-all" data-group="${id}">✖ 해제</button>

              ${id === "fav" ? `<button class="pp-run-fav">⭐ 바로실행</button>` : ""}

              ${id === "fav" ? `<button class="pp-move" data-from="fav" data-to="dis">→ 기타</button>` : ""}

              ${id === "dis" ? `<button class="pp-move" data-from="dis" data-to="fav">← 즐겨찾기</button>` : ""}
</span>
</div>
<div class="pp-items" style="display:flex;flex-wrap:wrap;gap:6px 12px;min-height:28px;"></div>
</div>

      `);
 
      const box = list.querySelector(`[data-group="${id}"] .pp-items`);

      paths.forEach(p => {

        box.insertAdjacentHTML("beforeend", `
<label class="pp-item" draggable="true" style="display:flex;align-items:center;gap:4px;cursor:grab;">
<input type="checkbox" data-path="${p}" ${checked ? "checked" : ""}>
<span>${p}</span>
</label>

        `);

      });

    }
 
    renderGroup("⭐ 즐겨찾기", PROCESS_GROUPS.favorites, true, "fav");

    renderGroup("⚪ 기타", PROCESS_GROUPS.disabled, false, "dis");
 
    /* 이벤트 */

    list.addEventListener("click", e => {

      const group = e.target.dataset.group;
 
      /* 전체 선택 / 해제 */

      if (group && e.target.classList.contains("pp-check-all")) {

        list.querySelectorAll(`[data-group="${group}"] input`).forEach(c => c.checked = true);

      }

      if (group && e.target.classList.contains("pp-uncheck-all")) {

        list.querySelectorAll(`[data-group="${group}"] input`).forEach(c => c.checked = false);

      }
 
      /* 그룹 이동 */

      if (e.target.classList.contains("pp-move")) {

        const from = e.target.dataset.from;

        const to = e.target.dataset.to;

        const src = list.querySelector(`[data-group="${from}"] .pp-items`);

        const dst = list.querySelector(`[data-group="${to}"] .pp-items`);

        src.querySelectorAll("input:checked").forEach(chk => {

          dst.appendChild(chk.closest(".pp-item"));

        });

      }
 
      /* ⭐ 즐겨찾기 바로 실행 */

      if (e.target.classList.contains("pp-run-fav")) {

        list.querySelectorAll(`[data-group="dis"] input`).forEach(c => c.checked = false);

        $("#pp-start").click();

      }

    });
 
    /* Drag & Drop */

    let dragged = null;

    list.addEventListener("dragstart", e => {

      dragged = e.target.closest(".pp-item");

      if (dragged) dragged.style.opacity = "0.5";

    });

    list.addEventListener("dragend", () => {

      if (dragged) dragged.style.opacity = "";

      dragged = null;

    });

    list.querySelectorAll(".pp-items").forEach(box => {

      box.addEventListener("dragover", e => e.preventDefault());

      box.addEventListener("drop", () => {

        if (dragged) box.appendChild(dragged);

      });

    });

  }
 
  function makeDraggable(panel, handle) {

    let d=false,x=0,y=0;

    handle.onmousedown=e=>{d=true;x=e.clientX-panel.offsetLeft;y=e.clientY-panel.offsetTop;};

    document.onmousemove=e=>{if(d){panel.style.left=e.clientX-x+"px";panel.style.top=e.clientY-y+"px";}};

    document.onmouseup=()=>d=false;

  }
 
  function updateProgress() {

    const p = Math.round(processedCount / totalCount * 100);

    $("#pp-progress-inner").style.width = p + "%";

    $("#pp-progress-text").innerText = `진행률: ${processedCount}/${totalCount} (${p}%)`;

    if (processedCount) {

      const avg = (Date.now() - startTime) / processedCount;

      $("#pp-eta-text").innerText = `ETA: ${formatETA(avg * (totalCount - processedCount))}`;

    }

  }
 
  /***********************

   * EXECUTION

   ***********************/

  createUI();
 
  $("#pp-stop").onclick = () => stopRequested = true;
 
  $("#pp-start").onclick = async () => {

    stopRequested = false;

    processedCount = 0;

    lastSelectedPath = null;
 
    const searchBtn = findSearchButton();

    if (!searchBtn) return alert("Search 버튼 없음");
 
    const selected = $$("#pp-list input:checked").map(c => c.dataset.path);

    if (!selected.length) return alert("Process Path 선택 필요");
 
    totalCount = selected.length;

    startTime = Date.now();
 
    const results = ["ProcessPath\tSnapshotTime\tWorkflowStatus\tValue"];
 
    for (const path of selected) {

      if (stopRequested) break;
 
      $("#pp-current-path").innerText = `▶ ${path}`;
 
      openProcessPathDropdown();

      await sleep(400);
 
      if (lastSelectedPath && lastSelectedPath !== path) {

        findOptionByName(lastSelectedPath)?.click();

        await sleep(200);

      }
 
      findOptionByName(path)?.click();

      lastSelectedPath = path;
 
      await sleep(BETWEEN_ACTION_DELAY);
 
      const prev = $("table tbody")?.innerHTML ?? "";

      searchBtn.click();
 
      const updated = await waitForTableChange(prev);

      processedCount++;
 
      if (updated) results.push(...collectTable(path));

      updateProgress();

    }
 
    GM_setClipboard(results.join("\n"));

    $("#pp-current-path").innerText = "✅ 완료";

    $("#pp-eta-text").innerText = "";

    alert(`✅ 완료 (${results.length - 1} rows)`);

  };
 
})();
 