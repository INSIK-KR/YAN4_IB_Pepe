// ==UserScript==
// @name         YAN4 Unload Table Copier v3
// @namespace    yna4-ib-direct-sla
// @version      0.4.2
// @description  하차 내역 표 전체 페이지 HTML/텍스트 복사 (중지 가능)
// @match        *://*/*
// @grant        GM_setClipboard
// @run-at       document-end
// @allFrames    true
// ==/UserScript==

(function () {
  "use strict";

  const PANEL_ID = "yna4-unload-copy-panel";
  const PEEK_ID = PANEL_ID + "-peek";

  let copyAllRunning = false;
  let copyAllStopRequested = false;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function sleepInterruptible(ms) {
    const step = 100;
    let left = ms;
    while (left > 0) {
      if (copyAllStopRequested) return false;
      await sleep(Math.min(step, left));
      left -= step;
    }
    return true;
  }

  function getUnloadPage() {
    return $("#unloadWorkPage");
  }

  function getUnloadTable() {
    return $('#unloadWorkPage table[is="w-table"]');
  }

  function getCurrentPage() {
    const active = $("w-page-item[active]");
    if (!active) return 1;
    const n = parseInt(String(active.textContent || "").trim(), 10);
    return Number.isFinite(n) ? n : 1;
  }

  function getLastPage() {
    const items = $all("w-page-item[data-page]");
    const pages = items
      .map((x) => parseInt(x.dataset.page || "", 10))
      .filter((x) => Number.isFinite(x));
    const active = getCurrentPage();
    return pages.length ? Math.max(active, ...pages) : active;
  }

  function absolutizeLinks(root) {
    const anchors = $all("a[href]", root);
    anchors.forEach((a) => {
      try {
        a.setAttribute("href", a.href);
      } catch (e) {
        // ignore
      }
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
        const cells = $all("th,td", tr).map((cell) =>
          String(cell.textContent || "")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        );
        if (cells.length) lines.push(cells.join("\t"));
      });
    }
    $all("tbody tr", table).forEach((tr) => {
      const cells = $all("th,td", tr).map((cell) =>
        String(cell.textContent || "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      );
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
      const rows = table.querySelectorAll("tbody tr");
      rows.forEach((row) => firstTbody.appendChild(row.cloneNode(true)));
    }

    return firstTable.outerHTML;
  }

  async function writeClipboard(html, text) {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    }

    if (typeof GM_setClipboard === "function") {
      try {
        GM_setClipboard(html, { type: "text/html", mimetype: "text/html" });
        return;
      } catch (e) {
        // continue fallback
      }
    }

    const listener = function (e) {
      e.preventDefault();
      e.clipboardData.setData("text/html", html);
      e.clipboardData.setData("text/plain", text);
    };

    document.addEventListener("copy", listener, { once: true });
    document.execCommand("copy");
  }

  function setStatus(msg) {
    const status = $("#" + PANEL_ID + " .yna4-copy-status");
    if (status) status.textContent = msg;
  }

  async function waitForPageChange(targetPage, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (copyAllStopRequested) return false;
      if (getCurrentPage() === targetPage && getUnloadTable()) return true;
      await sleep(200);
    }
    return false;
  }

  async function moveToPage(page) {
    if (getCurrentPage() === page) return true;

    if (typeof window.loadPage === "function") {
      window.loadPage(page - 1);
    } else {
      const item = document.querySelector('w-page-item[data-page="' + page + '"]');
      if (!item) return false;
      item.click();
    }

    return waitForPageChange(page, 8000);
  }

  function requestStopCopyAll() {
    if (copyAllRunning) copyAllStopRequested = true;
  }

  async function copyAllPages() {
    if (copyAllRunning) return;

    const table = getUnloadTable();
    if (!table) {
      alert("하차 내역 표를 찾지 못했습니다.");
      return;
    }

    copyAllRunning = true;
    copyAllStopRequested = false;

    const lastPage = getLastPage();
    const htmlParts = [];
    const textParts = [];

    setStatus("수집 시작…");

    try {
      let stopped = false;

      for (let page = 1; page <= lastPage; page++) {
        if (copyAllStopRequested) {
          stopped = true;
          break;
        }

        setStatus(page + "/" + lastPage + " …");

        const ok = await moveToPage(page);
        if (copyAllStopRequested) {
          stopped = true;
          break;
        }
        if (!ok) {
          alert(page + "페이지로 이동 실패");
          return;
        }

        const slept = await sleepInterruptible(1000);
        if (!slept || copyAllStopRequested) {
          stopped = true;
          break;
        }

        const currentTable = getUnloadTable();
        if (!currentTable) {
          alert(page + "페이지 표를 찾지 못했습니다.");
          return;
        }

        const includeHeader = page === 1;
        htmlParts.push(buildTableHtml(currentTable, includeHeader));
        textParts.push(buildTableText(currentTable, includeHeader));
      }

      if (stopped) {
        if (htmlParts.length) {
          try {
            await writeClipboard(mergeHtmlTables(htmlParts), textParts.join("\n"));
            setStatus("중지 · " + htmlParts.length + "p 복사됨");
          } catch (e) {
            setStatus("중지(복사실패)");
          }
        } else {
          setStatus("중지됨");
        }
        return;
      }

      const mergedHtml = mergeHtmlTables(htmlParts);
      const mergedText = textParts.join("\n");
      await writeClipboard(mergedHtml, mergedText);
      setStatus("완료 " + lastPage + "p · 복사됨");
    } catch (e) {
      alert("전체 복사 실패: " + (e && e.message ? e.message : e));
    } finally {
      copyAllRunning = false;
      copyAllStopRequested = false;
    }
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
    b.textContent = "하차";
    b.style.cssText = [
      "position:fixed",
      "left:8px",
      "bottom:8px",
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

  function createPanel() {
    if ($("#" + PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = [
      "position:fixed",
      "left:8px",
      "bottom:8px",
      "z-index:99999",
      "min-width:124px",
      "max-width:168px",
      "padding:5px 6px",
      "border-radius:6px",
      "background:#0f4c8a",
      "color:#fff",
      "box-shadow:0 3px 10px rgba(0,0,0,.16)",
      'font:10px/1.2 "Segoe UI","Malgun Gothic",sans-serif',
    ].join(";");

    const btnBase =
      "width:100%;border:0;border-radius:4px;padding:4px 6px;font-size:10px;font-weight:600;cursor:pointer;line-height:1.15;";

    panel.innerHTML =
      '<div class="yna4-hdr" style="font-weight:700;font-size:9px;letter-spacing:.02em;opacity:.92;margin:0 0 3px 0;">하차내역 복사_Pepe</div>' +
      '<button type="button" class="yna4-copy-all" style="' +
      btnBase +
      'background:#fff;color:#0f4c8a;margin-bottom:2px;">전체 복사</button>' +
      '<button type="button" class="yna4-copy-stop" style="' +
      btnBase +
      'background:#fecaca;color:#7f1d1d;margin-bottom:2px;">중지</button>' +
      '<div class="yna4-copy-status" style="margin-top:2px;font-size:9px;line-height:1.2;opacity:.88;word-break:break-word;">준비</div>' +
      '<button type="button" class="yna4-ui-hide" style="width:100%;border:0;background:transparent;color:#fff;opacity:.75;font-size:9px;cursor:pointer;text-decoration:underline;padding:2px 0 0 0;margin:0;">UI 숨기기</button>';

    document.body.appendChild(panel);

    $(".yna4-copy-all", panel).addEventListener("click", copyAllPages);
    $(".yna4-copy-stop", panel).addEventListener("click", requestStopCopyAll);
    $(".yna4-ui-hide", panel).addEventListener("click", hideMainPanel);
  }

  function boot() {
    if (!getUnloadPage()) return;
    createPanel();
  }

  const obs = new MutationObserver(() => {
    boot();
  });

  obs.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  boot();
})();
