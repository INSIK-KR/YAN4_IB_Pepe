// ==UserScript==
// @name         YAN4 Location Auto Collector Sequential
// @namespace    yna4-location-auto
// @version      0.3.3
// @description  목록 페이지 링크(1CP,1FP,1AP,1APR)를 순차 새 탭으로 수집 후 클립보드 복사
// @match        https://inventory.coupang.com/storagecapacity/v3/location*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @run-at       document-end
// @allFrames    true
// ==/UserScript==

(function () {
  "use strict";

  const JOB_KEY = "YAN4_LOCATION_SEQ_JOB_V1";
  const PANEL_ID = "yna4-location-seq-panel";
  const PEEK_ID = PANEL_ID + "-peek";
  const TARGET_ORDER = ["1CP", "1FP", "1AP", "1APR"];
  const MAX_WAIT_MS = 15000;
  const MAX_RETRY = 1;
  const CLOSE_DELAY_MS = 700;
  /** 패널 DOM이 예전 스크립트 버전이면 제거 후 재생성 */
  const PANEL_BUILD_VER = "0.3.3";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function textOf(node) {
    return String(node || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function absolutizeLinks(root) {
    $all("a[href]", root).forEach((a) => {
      try {
        a.setAttribute("href", a.href);
      } catch (e) {}
    });
  }

  function buildTableHtml(table, includeHeader) {
    const clone = table.cloneNode(true);
    absolutizeLinks(clone);
    if (!includeHeader) {
      const thead = clone.querySelector("thead");
      if (thead) thead.remove();
    }
    return clone.outerHTML;
  }

  function buildTableText(table, includeHeader) {
    const lines = [];

    if (includeHeader) {
      $all("thead tr", table).forEach((tr) => {
        const cells = $all("th,td", tr).map((cell) => textOf(cell.textContent));
        if (cells.length) lines.push(cells.join("\t"));
      });
    }

    $all("tbody tr", table).forEach((tr) => {
      const cells = $all("th,td", tr).map((cell) => textOf(cell.textContent));
      if (cells.length) lines.push(cells.join("\t"));
    });

    return lines.join("\n");
  }

  function mergeHtmlTables(tableHtmlList) {
    if (!tableHtmlList.length) return "";
    const parser = new DOMParser();
    const firstDoc = parser.parseFromString(tableHtmlList[0], "text/html");
    const firstTable = firstDoc.querySelector("table");
    if (!firstTable) return "";

    const firstTbody = firstTable.querySelector("tbody");
    if (!firstTbody) return firstTable.outerHTML;

    for (let i = 1; i < tableHtmlList.length; i++) {
      const doc = parser.parseFromString(tableHtmlList[i], "text/html");
      const table = doc.querySelector("table");
      if (!table) continue;
      $all("tbody tr", table).forEach((row) => firstTbody.appendChild(row.cloneNode(true)));
    }

    return firstTable.outerHTML;
  }

  async function copyClipboard(html, text) {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return true;
    }

    try {
      if (typeof GM_setClipboard === "function") {
        GM_setClipboard(text, "text");
        return true;
      }
    } catch (e) {}

    const listener = function (e) {
      e.preventDefault();
      e.clipboardData.setData("text/html", html);
      e.clipboardData.setData("text/plain", text);
    };

    document.addEventListener("copy", listener, { once: true });
    document.execCommand("copy");
    return true;
  }

  function defaultJob() {
    return {
      running: false,
      phase: "idle",
      targets: [],
      currentIndex: 0,
      htmlParts: [],
      textParts: [],
      completedKeys: [],
      activeHref: "",
      activeKey: "",
      activeTabOpenedAt: 0,
      retries: {},
      startedAt: 0,
    };
  }

  async function getJob() {
    return (await GM_getValue(JOB_KEY)) || defaultJob();
  }

  async function setJob(job) {
    await GM_setValue(JOB_KEY, job);
  }

  async function clearJob() {
    await GM_deleteValue(JOB_KEY);
  }

  function isListPage() {
    return findTargetLinks().length > 0;
  }

  function isDetailPage() {
    return !!getDetailTable();
  }

  function getDetailTable() {
    return (
      document.querySelector('#unloadWorkPage table[is="w-table"]') ||
      document.querySelector("#unloadWorkPage table") ||
      document.querySelector('table[is="w-table"]')
    );
  }

  function findTargetLinks() {
    const anchors = $all("a[href]");
    const found = [];
    for (const key of TARGET_ORDER) {
      const hit = anchors.find((a) => textOf(a.textContent) === key);
      if (hit) found.push({ key, href: hit.href });
    }
    return found;
  }

  async function waitForTableReady(timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const table = getDetailTable();
      if (table) {
        const bodyRows = table.querySelectorAll("tbody tr");
        if (bodyRows.length > 0) return table;
      }
      await sleep(300);
    }
    return null;
  }

  function showMainPanel() {
    const p = $("#" + PANEL_ID);
    if (p) p.style.display = "";
    const pk = $("#" + PEEK_ID);
    if (pk) pk.remove();
  }

  function ensurePeekButton() {
    if ($("#" + PEEK_ID)) return;
    const b = document.createElement("button");
    b.id = PEEK_ID;
    b.type = "button";
    b.title = "패널 보이기";
    b.textContent = "로케";
    b.style.cssText = [
      "position:fixed",
      "left:10px",
      "bottom:10px",
      "z-index:99998",
      "padding:2px 6px",
      "border:0",
      "border-radius:4px",
      "background:#0f4c8a",
      "color:#fff",
      'font:600 9px/1.2 "Segoe UI","Malgun Gothic",sans-serif',
      "cursor:pointer",
      "opacity:.9",
      "box-shadow:0 2px 8px rgba(0,0,0,.15)",
    ].join(";");
    b.addEventListener("click", showMainPanel);
    document.body.appendChild(b);
  }

  function hideMainPanel() {
    const p = $("#" + PANEL_ID);
    if (p) p.style.display = "none";
    ensurePeekButton();
  }

  function panelInnerHtml() {
    const btnBase =
      "width:100%;border:0;border-radius:5px;padding:5px 8px;font-size:11px;font-weight:600;cursor:pointer;line-height:1.2;";
    return (
      '<div class="yna4-hdr" style="font-weight:700;font-size:10px;letter-spacing:.02em;opacity:.92;margin:0 0 4px 0;">YAN4 Location 자동수집</div>' +
      '<button type="button" class="yna4-start" style="' +
      btnBase +
      'background:#fff;color:#0f4c8a;margin-bottom:3px;">순차 수집 시작</button>' +
      '<button type="button" class="yna4-reset" style="' +
      btnBase +
      'background:#e2e8f0;color:#0f172a;margin-bottom:3px;">초기화</button>' +
      '<button type="button" class="yna4-ui-hide" style="width:100%;border:0;background:transparent;color:#fff;opacity:.75;font-size:9px;cursor:pointer;text-decoration:underline;padding:2px 0 0 0;margin:0;">UI 숨기기</button>'
    );
  }

  function ensurePanel() {
    const existing = $("#" + PANEL_ID);
    if (existing && existing.getAttribute("data-ya4-build") === PANEL_BUILD_VER) {
      return existing;
    }
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.setAttribute("data-ya4-build", PANEL_BUILD_VER);
    panel.style.cssText = [
      "position:fixed",
      "left:10px",
      "bottom:10px",
      "z-index:99999",
      "min-width:140px",
      "max-width:180px",
      "padding:6px 8px",
      "border-radius:8px",
      "background:#0f4c8a",
      "color:#fff",
      "box-shadow:0 4px 14px rgba(0,0,0,.18)",
      'font:11px/1.25 "Segoe UI","Malgun Gothic",sans-serif',
    ].join(";");

    panel.innerHTML = panelInnerHtml();
    document.body.appendChild(panel);

    $(".yna4-start", panel).addEventListener("click", startFromListPage);
    $(".yna4-reset", panel).addEventListener("click", async function () {
      await clearJob();
      alert("수집 상태를 초기화했습니다.");
    });
    $(".yna4-ui-hide", panel).addEventListener("click", hideMainPanel);

    return panel;
  }

  async function startFromListPage() {
    const links = findTargetLinks();
    if (links.length !== TARGET_ORDER.length) {
      alert("목록 페이지에서 4개 링크를 모두 찾지 못했습니다.\n필요 링크: " + TARGET_ORDER.join(", "));
      return;
    }

    const job = defaultJob();
    job.running = true;
    job.phase = "collecting";
    job.targets = links;
    job.currentIndex = 0;
    job.startedAt = Date.now();
    await setJob(job);

    await openNextTarget();
  }

  async function openNextTarget() {
    const job = await getJob();
    if (!job.running) return;
    if (job.currentIndex >= job.targets.length) {
      await finalizeOnListPage();
      return;
    }

    const target = job.targets[job.currentIndex];
    job.activeHref = target.href;
    job.activeKey = target.key;
    job.activeTabOpenedAt = Date.now();
    await setJob(job);

    window.open(target.href, "_blank");
  }

  async function finalizeOnListPage() {
    const job = await getJob();
    if (!job.running) return;
    const mergedHtml = mergeHtmlTables(job.htmlParts);
    const mergedText = job.textParts.join("\n");

    try {
      await copyClipboard(mergedHtml, mergedText);
      job.running = false;
      job.phase = "done";
      await setJob(job);
      alert("4개 링크 수집 완료. 클립보드에 복사했습니다.");
    } catch (e) {
      job.running = false;
      job.phase = "done";
      await setJob(job);
      alert("수집은 완료됐지만 복사 실패: " + (e && e.message ? e.message : e));
    }
  }

  async function collectFromDetailPage() {
    const job = await getJob();
    if (!job.running || !isDetailPage()) return;
    if (!job.activeHref || job.activeHref !== location.href) return;

    const activeKey = job.activeKey || "현재 탭";

    let table = await waitForTableReady(MAX_WAIT_MS);

    if (!table) {
      const retryCount = Number(job.retries[location.href] || 0);
      if (retryCount < MAX_RETRY) {
        job.retries[location.href] = retryCount + 1;
        await setJob(job);
        location.reload();
        return;
      }

      job.running = false;
      await setJob(job);
      alert(activeKey + " 표를 끝내 찾지 못했습니다.");
      return;
    }

    await sleep(800);

    const latest = await getJob();
    if (!latest.running) return;
    if (latest.completedKeys.includes(activeKey)) return;

    const includeHeader = latest.currentIndex === 0;
    const html = buildTableHtml(table, includeHeader);
    const text = buildTableText(table, includeHeader);

    latest.htmlParts.push(html);
    latest.textParts.push(text);
    latest.completedKeys.push(activeKey);
    latest.currentIndex += 1;
    latest.activeHref = "";
    latest.activeKey = "";
    await setJob(latest);

    await sleep(CLOSE_DELAY_MS);
    window.close();
  }

  async function listPageController() {
    const job = await getJob();
    if (!isListPage() || !job.running) return;

    if (job.currentIndex >= job.targets.length && job.completedKeys.length >= job.targets.length) {
      await finalizeOnListPage();
      return;
    }

    if (job.activeHref) {
      const openedAgo = Date.now() - (job.activeTabOpenedAt || 0);
      if (openedAgo > MAX_WAIT_MS + 6000) {
        job.activeHref = "";
        job.activeKey = "";
        job.activeTabOpenedAt = 0;
        await setJob(job);
      } else {
        return;
      }
    }

    if (job.currentIndex < job.targets.length) {
      await openNextTarget();
    }
  }

  async function boot() {
    ensurePanel();
    await collectFromDetailPage();
    await listPageController();
  }

  window.addEventListener("load", boot);
  setTimeout(boot, 1200);
  setInterval(boot, 3000);
})();
