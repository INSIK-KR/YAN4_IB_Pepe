// ==UserScript==
// @name         YAN4 NeedToReplenish Copier v5 (batch cutlines)
// @namespace    yna4-need-to-replenish
// @version      0.5.4
// @description  대시보드 다중 컷타임 일괄 수집 + 상세 진입 시 100건 보기·조회 자동화 후 순수 TSV 만 이어붙여 복사
// @match        https://outbound.coupang.com/workflow/nob/dashboard*
// @match        https://outbound.coupang.com/workflow/nob/v2/view/needToReplenish/detail/*
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const PANEL_ID = "yna4-replenish-copy-panel";
  const PEEK_ID = PANEL_ID + "-peek";
  const JOB_KEY = "YAN4_REPLENISH_COPY_JOB_V4";

  const TABLE_SELECTOR = "table.table.table-bordered.table-striped.table-hover.mb-0.w-100";
  const PAGE_ITEM_SELECTOR = "w-page-item-group w-page-item";

  const MAX_WAIT_MS = 15000;
  const PAGE_WAIT_MS = 12000;
  const RETRY_LIMIT = 1;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function defaultJob() {
    return {
      // 배치(다중 컷타임) 모드
      batchMode: false,
      batchQueue: [], // [{url, label}]  남은 대상 (index 0 = 현재 대상)
      batchDone: [],  // [{url, label, text}]  완료된 수집 결과
      batchStartedAt: 0,

      // 현재 상세 페이지 1건의 수집 상태
      running: false,
      preconditionApplied: false, // 100건 보기 + 조회 완료 여부 (리로드 대비)
      startedAt: 0,
      collectedPages: [],
      textParts: [],
      currentPage: 1,
      retryCount: 0,
      lastError: "",
    };
  }

  async function getJob() {
    try {
      const v = await GM_getValue(JOB_KEY);
      if (!v) return defaultJob();
      const parsed = typeof v === "string" ? JSON.parse(v) : v;
      return { ...defaultJob(), ...parsed };
    } catch {
      return defaultJob();
    }
  }

  async function setJob(job) {
    await GM_setValue(JOB_KEY, JSON.stringify(job));
  }

  async function clearJob() {
    await GM_deleteValue(JOB_KEY);
  }

  function getTable() {
    return $(TABLE_SELECTOR);
  }

  function getCurrentPage() {
    const active = $("w-page-item[active]");
    if (!active) return 1;

    const textN = parseInt(String(active.textContent || "").trim(), 10);
    if (Number.isFinite(textN)) return textN;

    const hrefN = parseInt(String(active.getAttribute("href") || "").trim(), 10);
    return Number.isFinite(hrefN) ? hrefN : 1;
  }

  function itemTextTrim(el) {
    return String(el.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function itemAriaTitle(el) {
    return String(el.getAttribute("aria-label") || el.getAttribute("title") || "");
  }

  function isNavDisabled(el) {
    if (el.hasAttribute("disabled")) return true;
    if (String(el.getAttribute("aria-disabled") || "").toLowerCase() === "true") return true;
    if (el.classList && el.classList.contains("disabled")) return true;
    return false;
  }

  function isLikelyPrevItem(el) {
    if (isNavDisabled(el)) return false;
    const t = itemTextTrim(el);
    if (/^(‹|«|<|◀|←)$/i.test(t)) return true;
    if (/^(prev|이전)$/i.test(t)) return true;
    if (/이전|prev|previous/i.test(itemAriaTitle(el))) return true;
    return false;
  }

  function isLikelyNextItem(el) {
    if (isNavDisabled(el)) return false;
    const t = itemTextTrim(el);
    if (/^(›|»|>|\u203a|▶|→)$/i.test(t)) return true;
    if (/^(next|다음)$/i.test(t)) return true;
    if (/다음|next|forward|다음\s*페이지/i.test(itemAriaTitle(el))) return true;
    return false;
  }

  function isEllipsisItem(el) {
    const t = itemTextTrim(el);
    return /^[.…‧⋮·]+$/.test(t) || t === "···";
  }

  function pageNumFromItem(el) {
    const t = parseInt(itemTextTrim(el), 10);
    if (Number.isFinite(t)) return t;
    const h = parseInt(String(el.getAttribute("href") || "").trim(), 10);
    if (Number.isFinite(h)) return h;
    const d = parseInt(String(el.getAttribute("data-page") || "").trim(), 10);
    if (Number.isFinite(d)) return d;
    return NaN;
  }

  function getPageItemByNumber(pageNum) {
    const items = $all(PAGE_ITEM_SELECTOR);

    for (const it of items) {
      const t = parseInt(String(it.textContent || "").trim(), 10);
      if (t === pageNum) return it;

      const href = it.getAttribute("href");
      const h = parseInt(String(href || "").trim(), 10);
      if (h === pageNum) return it;

      const dp = it.getAttribute("data-page");
      const d = parseInt(String(dp || "").trim(), 10);
      if (d === pageNum) return it;
    }
    return null;
  }

  /** 번호가 DOM에 없을 때(예: 1~10만 보임) 다음 페이지 버튼으로 이동 */
  function getNextPagerControl(currentPage) {
    const want = currentPage + 1;
    const byNum = getPageItemByNumber(want);
    if (byNum) return byNum;

    // <w-page-next href="N"> : w-page-item-group 바깥의 전용 다음 엘리먼트
    const wNext = $("w-page-next");
    if (wNext && !isNavDisabled(wNext)) {
      const hrefN = parseInt(String(wNext.getAttribute("href") || "").trim(), 10);
      if (!Number.isFinite(hrefN) || hrefN > currentPage) return wNext;
    }

    const items = $all(PAGE_ITEM_SELECTOR);
    for (const it of items) {
      if (isLikelyNextItem(it)) return it;
    }

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.hasAttribute("active")) continue;
      if (isNavDisabled(it)) continue;
      if (isLikelyPrevItem(it)) continue;
      if (isEllipsisItem(it)) continue;
      if (Number.isFinite(pageNumFromItem(it))) continue;
      return it;
    }

    return null;
  }

  async function waitForTableReady(timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const table = getTable();
      if (table) return table;
      await sleep(200);
    }
    return null;
  }

  async function waitForPageChange(fromPage, targetPage, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const now = getCurrentPage();
      if (now === targetPage && now !== fromPage) {
        const table = await waitForTableReady(Math.min(4000, timeoutMs));
        if (table) return true;
      }
      await sleep(200);
    }
    return false;
  }

  function buildPageText(table) {
    const lines = [];
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

  async function copyToClipboard(text) {
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text, { type: "text/plain" });
      return;
    }

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const listener = function (e) {
      e.preventDefault();
      e.clipboardData.setData("text/plain", text);
    };
    document.addEventListener("copy", listener, { once: true });
    document.execCommand("copy");
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
    b.textContent = "보충";
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

  function ensurePanel() {
    if ($("#" + PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = [
      "position:fixed",
      "left:10px",
      "bottom:10px",
      "z-index:99999",
      "min-width:168px",
      "max-width:200px",
      "padding:6px 8px",
      "border-radius:8px",
      "background:#0f4c8a",
      "color:#fff",
      "box-shadow:0 4px 14px rgba(0,0,0,.18)",
      'font:11px/1.25 "Segoe UI","Malgun Gothic",sans-serif',
    ].join(";");

    const btnBase =
      "width:100%;border:0;border-radius:5px;padding:5px 8px;font-size:11px;font-weight:600;cursor:pointer;line-height:1.2;";

    panel.innerHTML =
      '<div class="yna4-hdr" style="font-weight:700;font-size:10px;letter-spacing:.02em;opacity:.92;margin:0 0 4px 0;">워크플로우 복사_Pepe</div>' +
      '<button type="button" class="yna4-start" style="' +
      btnBase +
      'background:#fff;color:#0f4c8a;margin-bottom:3px;">전체 수집</button>' +
      '<button type="button" class="yna4-stop" style="' +
      btnBase +
      'background:#fecaca;color:#7f1d1d;margin-bottom:3px;">중지</button>' +
      '<div class="yna4-status" style="margin-top:4px;font-size:10px;line-height:1.25;opacity:.88;word-break:break-word;">준비</div>' +
      '<button type="button" class="yna4-ui-hide" style="width:100%;border:0;background:transparent;color:#fff;opacity:.75;font-size:9px;cursor:pointer;text-decoration:underline;padding:3px 0 0 0;margin:0;">UI 숨기기</button>';

    document.body.appendChild(panel);

    $(".yna4-start", panel).addEventListener("click", startCollection);
    $(".yna4-stop", panel).addEventListener("click", stopAndClear);
    $(".yna4-ui-hide", panel).addEventListener("click", hideMainPanel);
  }

  function setStatus(msg) {
    const el = $("#" + PANEL_ID + " .yna4-status");
    if (el) el.textContent = msg;
  }

  function triggerPageClick(pageEl) {
    if (!pageEl) return false;

    try {
      pageEl.scrollIntoView({ block: "center", inline: "center" });
    } catch {}

    const fire = (type) => {
      try {
        pageEl.dispatchEvent(
          new MouseEvent(type, { bubbles: true, cancelable: true, view: window })
        );
      } catch {}
    };

    fire("mouseover");
    fire("mousedown");
    fire("mouseup");
    fire("click");

    try {
      pageEl.click();
    } catch {}

    return true;
  }

  async function moveToNextPage(currentPage) {
    const nextEl = getNextPagerControl(currentPage);
    if (!nextEl) return { done: true, moved: false };

    const targetPage = currentPage + 1;

    triggerPageClick(nextEl);
    let moved = await waitForPageChange(currentPage, targetPage, PAGE_WAIT_MS);
    if (moved) return { done: false, moved: true };

    triggerPageClick(nextEl);
    moved = await waitForPageChange(currentPage, targetPage, Math.floor(PAGE_WAIT_MS / 2));
    return { done: false, moved };
  }

  // 배치 완료 처리가 동시에 2번 돌면 큐 이중 shift 가 나서
  // 같은 데이터가 다른 라벨로 두 번 들어간다. 방어적 가드.
  let batchCompletionLocked = false;

  // ============================================================================
  //  Detail precondition: pagingSize=100 + 조회 버튼 클릭 (수집 시작 전 1회)
  // ============================================================================

  const PAGING_SIZE_SELECTOR = 'select[name="pagingSize"]';
  const SEARCH_BTN_SELECTOR = "button.btn-search";
  const PRECONDITION_WAIT_MS = 1800;

  function findSearchButton() {
    const direct = $(SEARCH_BTN_SELECTOR);
    if (direct) return direct;
    const btns = $all("button");
    for (const b of btns) {
      const t = String(b.textContent || "").replace(/\s+/g, "").trim();
      if (t === "조회") return b;
    }
    return null;
  }

  /** 페이지 당 100건 보기로 바꾸고 조회 버튼을 한 번 클릭한 뒤 테이블 리프레시 대기. */
  async function applyDetailPrecondition() {
    try {
      const select = $(PAGING_SIZE_SELECTOR);
      if (select && String(select.value).trim() !== "100") {
        select.value = "100";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        select.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(250);
      }
    } catch {}

    const btn = findSearchButton();
    if (!btn) return false;

    try {
      btn.click();
    } catch {}

    // 조회 클릭이 Ajax면 테이블이 재렌더되며, 폼 submit 로 리로드되면 스크립트가 재부팅됨.
    await sleep(PRECONDITION_WAIT_MS);
    return true;
  }

  async function collectLoop() {
    const job = await getJob();
    if (!job.running) return;

    const page = getCurrentPage();
    job.currentPage = page;
    await setJob(job);

    setStatus(`p.${page} 수집…`);

    const table = await waitForTableReady(MAX_WAIT_MS);
    if (!table) {
      job.lastError = `테이블 로딩 실패 (page ${page})`;
      if (job.retryCount < RETRY_LIMIT) {
        job.retryCount += 1;
        await setJob(job);
        setStatus(`재시도 ${job.retryCount}/${RETRY_LIMIT}`);
        location.reload();
        return;
      }
      job.running = false;
      await setJob(job);
      setStatus(`중단: ${job.lastError}`);
      return;
    }

    const pageText = buildPageText(table);
    if (!job.collectedPages.includes(page)) {
      job.collectedPages.push(page);
      if (pageText.trim()) job.textParts.push(pageText);
      await setJob(job);
    }

    const moveResult = await moveToNextPage(page);

    if (moveResult.done) {
      job.running = false;
      const mergedText = job.textParts.join("\n");

      if (job.batchMode && Array.isArray(job.batchQueue) && job.batchQueue.length > 0) {
        if (batchCompletionLocked) return;
        batchCompletionLocked = true;
        // 배치: 현재 컷타임 결과를 batchDone 에 누적 → 큐에서 pop → 다음 이동
        const current = job.batchQueue.shift();
        job.batchDone.push({
          url: current.url,
          label: current.label,
          text: mergedText,
        });
        job.collectedPages = [];
        job.textParts = [];
        job.currentPage = 1;
        job.retryCount = 0;
        job.lastError = "";
        job.preconditionApplied = false; // 다음 상세에서 100건 보기·조회 재적용
        await setJob(job);

        if (job.batchQueue.length > 0) {
          const nextTarget = job.batchQueue[0];
          setStatus(`완료: ${current.label} (${job.batchDone.length}개) · 다음 이동…`);
          await sleep(700);
          location.href = nextTarget.url;
          return;
        }

        // 배치 종료 — 모든 컷타임 순수 TSV 만 그대로 이어붙여 복사
        const combined = job.batchDone
          .map((d) => d.text)
          .filter((t) => String(t || "").trim().length > 0)
          .join("\n");
        try {
          await copyToClipboard(combined);
          setStatus(`배치 완료 ${job.batchDone.length}개 · 복사됨`);
        } catch (e) {
          setStatus(`배치 완료(복사실패) ${String(e && e.message ? e.message : e)}`);
        }
        job.batchMode = false;
        job.batchQueue = [];
        job.batchDone = [];
        await setJob(job);
        return;
      }

      // 단일(기존) 모드
      await setJob(job);
      try {
        await copyToClipboard(mergedText);
        setStatus(`완료 ${job.collectedPages.length}p · 복사됨`);
      } catch (e) {
        setStatus(`완료(복사실패) ${String(e && e.message ? e.message : e)}`);
      }
      return;
    }

    if (!moveResult.moved) {
      job.lastError = `페이지 이동 실패: ${page} → ${page + 1}`;
      if (job.retryCount < RETRY_LIMIT) {
        job.retryCount += 1;
        await setJob(job);
        setStatus(`이동재시도 ${job.retryCount}/${RETRY_LIMIT}`);
        location.reload();
        return;
      }
      job.running = false;
      await setJob(job);
      setStatus(`중단: ${job.lastError}`);
      return;
    }

    await sleep(400);
    await collectLoop();
  }

  async function startCollection() {
    const job = defaultJob();
    job.running = true;
    job.preconditionApplied = true; // 리로드 대비 먼저 저장 후 적용
    job.startedAt = Date.now();
    job.currentPage = getCurrentPage();
    await setJob(job);
    setStatus("100건 보기·조회…");
    await applyDetailPrecondition();
    setStatus("시작…");
    await collectLoop();
  }

  async function stopAndClear() {
    await clearJob();
    setStatus("초기화");
  }

  // ============================================================================
  //  Page routing
  // ============================================================================

  function isDashboardPage() {
    return /\/workflow\/nob\/dashboard\b/i.test(location.pathname);
  }
  function isDetailPage() {
    return /\/workflow\/nob\/v2\/view\/needToReplenish\/detail\//i.test(
      location.pathname
    );
  }

  // ============================================================================
  //  Dashboard mode: 다중 컷타임 보충 필요 일괄 수집
  // ============================================================================

  const DASH_PANEL_ID = "yna4-replenish-dash-panel";
  const DASH_PEEK_ID = DASH_PANEL_ID + "-peek";
  const DASH_CB_CLASS = "yna4-need-replenish-cb";
  const DASH_LINK_MARK = "yna4NeedReplenishBound";
  /** 목록 행(tr) 한 줄당 체크 1개만 — 조회 결과 테이블용 */
  const DASH_ROW_MARK = "yna4DashRowBound";
  const NEED_DETAIL_HREF = "/workflow/nob/v2/view/needToReplenish/detail/";

  function getNeedReplenishLinks() {
    return $all('a[href*="' + NEED_DETAIL_HREF + '"]');
  }

  function cutlineLabelFromHref(href) {
    try {
      const idx = href.indexOf(NEED_DETAIL_HREF);
      if (idx === -1) return href;
      const tail = href.substring(idx + NEED_DETAIL_HREF.length);
      return decodeURIComponent(tail).trim();
    } catch {
      return href;
    }
  }

  function detailAbsUrl(raw) {
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    try {
      return new URL(raw, location.origin).href;
    } catch {
      return raw;
    }
  }

  /** 대시보드에서 조회 후 생기는 목록 테이블: 행마다 체크박스(컷타임 선택) */
  function enhanceDashboardTableRows() {
    const table = $(TABLE_SELECTOR);
    if (!table) return 0;
    let added = 0;
    $all("tbody tr", table).forEach((tr) => {
      if (tr.dataset[DASH_ROW_MARK] === "1") return;
      const link = tr.querySelector('a[href*="' + NEED_DETAIL_HREF + '"]');
      if (!link) return;
      const raw = link.getAttribute("href") || "";
      if (!raw) return;

      link.dataset[DASH_LINK_MARK] = "1";

      const cell =
        tr.cells && tr.cells.length ? tr.cells[0] : tr.querySelector("td,th");
      if (!cell) return;
      if (cell.querySelector("input." + DASH_CB_CLASS)) return;

      const abs = detailAbsUrl(raw);
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = DASH_CB_CLASS;
      cb.dataset.url = abs;
      cb.dataset.label = cutlineLabelFromHref(abs);
      cb.title = "이 행 컷타임 · 일괄 수집 대상";
      cb.style.cssText =
        "margin:0 6px 0 0;vertical-align:middle;cursor:pointer;transform:scale(1.1);";
      cb.addEventListener("click", (e) => e.stopPropagation());
      cell.insertBefore(cb, cell.firstChild);
      tr.dataset[DASH_ROW_MARK] = "1";
      added++;
    });
    return added;
  }

  /** 테이블 밖 등 링크에만 체크(행 처리된 tr 안 링크는 제외) */
  function enhanceDashboardLinks() {
    const links = getNeedReplenishLinks();
    let added = 0;
    links.forEach((link) => {
      if (link.dataset[DASH_LINK_MARK] === "1") return;
      const tr = link.closest("tr");
      if (tr && tr.dataset[DASH_ROW_MARK] === "1") return;
      const href = link.getAttribute("href") || "";
      if (!href) return;
      const absLink = detailAbsUrl(href);

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = DASH_CB_CLASS;
      cb.dataset.url = absLink;
      cb.dataset.label = cutlineLabelFromHref(absLink);
      cb.title = "일괄 수집 대상";
      cb.style.cssText =
        "margin:0 4px 0 0;vertical-align:middle;cursor:pointer;transform:scale(1.1);";
      cb.addEventListener("click", (e) => e.stopPropagation());
      if (link.parentNode) link.parentNode.insertBefore(cb, link);
      link.dataset[DASH_LINK_MARK] = "1";
      added++;
    });
    return added;
  }

  function getDashCheckedTargets() {
    return $all("input." + DASH_CB_CLASS + ":checked").map((cb) => ({
      url: cb.dataset.url,
      label: cb.dataset.label,
    }));
  }

  function setDashStatus(msg) {
    const el = $("#" + DASH_PANEL_ID + " .yna4-dash-status");
    if (el) el.textContent = msg;
  }

  function refreshDashCount() {
    const n = $all("input." + DASH_CB_CLASS + ":checked").length;
    const el = $("#" + DASH_PANEL_ID + " .yna4-dash-count");
    if (el) el.textContent = `선택 ${n}개`;
  }

  async function startDashBatch() {
    const targets = getDashCheckedTargets();
    if (targets.length === 0) {
      alert("일괄 수집할 컷타임을 체크해주세요.");
      return;
    }
    const proceed = confirm(
      `선택한 ${targets.length}개 컷타임을 순차 수집합니다.\n` +
        targets.map((t, i) => `${i + 1}. ${t.label}`).join("\n") +
        "\n\n현재 탭이 첫 번째 상세 페이지로 이동합니다. 진행할까요?"
    );
    if (!proceed) return;

    const job = defaultJob();
    job.batchMode = true;
    job.batchQueue = targets.slice();
    job.batchStartedAt = Date.now();
    job.running = false;
    await setJob(job);
    setDashStatus("이동 중…");
    await sleep(200);
    location.href = targets[0].url;
  }

  function showDashPanel() {
    const p = $("#" + DASH_PANEL_ID);
    if (p) p.style.display = "";
    const pk = $("#" + DASH_PEEK_ID);
    if (pk) pk.remove();
  }
  function hideDashPanel() {
    const p = $("#" + DASH_PANEL_ID);
    if (p) p.style.display = "none";
    if ($("#" + DASH_PEEK_ID)) return;
    const b = document.createElement("button");
    b.id = DASH_PEEK_ID;
    b.type = "button";
    b.title = "패널 보이기";
    b.textContent = "보충일괄";
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
    b.addEventListener("click", showDashPanel);
    document.body.appendChild(b);
  }

  function ensureDashPanel() {
    if ($("#" + DASH_PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = DASH_PANEL_ID;
    panel.style.cssText = [
      "position:fixed",
      "left:10px",
      "bottom:10px",
      "z-index:99999",
      "min-width:200px",
      "max-width:240px",
      "padding:8px 10px",
      "border-radius:8px",
      "background:#0f4c8a",
      "color:#fff",
      "box-shadow:0 4px 14px rgba(0,0,0,.18)",
      'font:11px/1.3 "Segoe UI","Malgun Gothic",sans-serif',
    ].join(";");
    const btnBase =
      "width:100%;border:0;border-radius:5px;padding:5px 8px;font-size:11px;font-weight:600;cursor:pointer;line-height:1.2;";
    panel.innerHTML =
      '<div style="font-weight:700;font-size:10px;opacity:.92;margin:0 0 5px 0;">보충 일괄 수집_Pepe</div>' +
      '<div class="yna4-dash-count" style="font-size:10px;margin-bottom:4px;opacity:.9;">선택 0개</div>' +
      '<div style="display:flex;gap:4px;margin-bottom:4px;">' +
      '<button type="button" class="yna4-dash-all" style="flex:1;border:0;border-radius:5px;padding:4px 6px;font-size:10px;font-weight:600;cursor:pointer;background:rgba(255,255,255,.18);color:#fff;">전체</button>' +
      '<button type="button" class="yna4-dash-none" style="flex:1;border:0;border-radius:5px;padding:4px 6px;font-size:10px;font-weight:600;cursor:pointer;background:rgba(255,255,255,.18);color:#fff;">해제</button>' +
      "</div>" +
      '<button type="button" class="yna4-dash-start" style="' +
      btnBase +
      'background:#fff;color:#0f4c8a;margin-bottom:3px;">선택 수집 시작</button>' +
      '<button type="button" class="yna4-dash-clear" style="' +
      btnBase +
      'background:#fecaca;color:#7f1d1d;margin-bottom:3px;">배치 초기화</button>' +
      '<div class="yna4-dash-status" style="margin-top:4px;font-size:10px;opacity:.88;word-break:break-word;">조회 후 표가 뜨면 행마다 체크 → 선택 수집</div>' +
      '<button type="button" class="yna4-dash-hide" style="width:100%;border:0;background:transparent;color:#fff;opacity:.75;font-size:9px;cursor:pointer;text-decoration:underline;padding:3px 0 0 0;margin:0;">UI 숨기기</button>';
    document.body.appendChild(panel);

    $(".yna4-dash-all", panel).addEventListener("click", () => {
      $all("input." + DASH_CB_CLASS).forEach((cb) => (cb.checked = true));
      refreshDashCount();
    });
    $(".yna4-dash-none", panel).addEventListener("click", () => {
      $all("input." + DASH_CB_CLASS).forEach((cb) => (cb.checked = false));
      refreshDashCount();
    });
    $(".yna4-dash-start", panel).addEventListener("click", startDashBatch);
    $(".yna4-dash-clear", panel).addEventListener("click", async () => {
      await stopAndClear();
      setDashStatus("배치 초기화");
    });
    $(".yna4-dash-hide", panel).addEventListener("click", hideDashPanel);

    document.addEventListener("change", (e) => {
      if (e.target && e.target.classList && e.target.classList.contains(DASH_CB_CLASS)) {
        refreshDashCount();
      }
    });
  }

  function runDashboardCheckboxEnhance() {
    enhanceDashboardTableRows();
    enhanceDashboardLinks();
    refreshDashCount();
  }

  async function bootDashboard() {
    ensureDashPanel();

    let moDeb;
    const mo = new MutationObserver(function () {
      clearTimeout(moDeb);
      moDeb = setTimeout(runDashboardCheckboxEnhance, 350);
    });
    try {
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (eMo) {}

    runDashboardCheckboxEnhance();

    const started = Date.now();
    const tick = async () => {
      runDashboardCheckboxEnhance();
      const job = await getJob();
      if (job.batchMode && job.batchQueue && job.batchQueue.length > 0) {
        setDashStatus(
          `배치 대기: 남은 ${job.batchQueue.length}건 · 완료 ${
            job.batchDone ? job.batchDone.length : 0
          }건`
        );
      }
      if (Date.now() - started < 180000) setTimeout(tick, 2000);
    };
    tick();
  }

  // ============================================================================
  //  Detail mode boot
  // ============================================================================

  async function bootDetail() {
    ensurePanel();

    const job = await getJob();

    // 배치 진행 중이라면 자동 시작 (큐의 첫 대상이 이 페이지라고 가정)
    if (job.batchMode && Array.isArray(job.batchQueue) && job.batchQueue.length > 0) {
      const target = job.batchQueue[0];
      const totalAll =
        (job.batchDone ? job.batchDone.length : 0) + job.batchQueue.length;
      const curIndex = (job.batchDone ? job.batchDone.length : 0) + 1;
      setStatus(`배치 ${curIndex}/${totalAll}: ${target.label}`);

      // 사전 단계(100건 보기 + 조회) 가 조회 버튼 submit 로 페이지 리로드를 유발해도
      // job.preconditionApplied 플래그 덕에 중복 재적용 없이 이어서 수집 시작 가능.
      if (!job.preconditionApplied) {
        job.running = true;
        job.preconditionApplied = true;
        job.collectedPages = [];
        job.textParts = [];
        job.currentPage = 1;
        job.retryCount = 0;
        job.lastError = "";
        job.startedAt = Date.now();
        await setJob(job);
        setStatus(`배치 ${curIndex}/${totalAll}: 100건·조회…`);
        await applyDetailPrecondition();
        setStatus(`배치 ${curIndex}/${totalAll}: 수집 시작`);
        setTimeout(() => collectLoop(), 600);
        return;
      }

      // 이미 실행 중이면 그대로 재개 (사전 단계는 이미 적용됨)
      if (job.running) {
        setTimeout(() => collectLoop(), 800);
        return;
      }

      // 사전 단계는 적용됐는데 running 이 꺼진 상태 (예: 리로드 직후)
      job.running = true;
      job.startedAt = Date.now();
      job.collectedPages = [];
      job.textParts = [];
      job.currentPage = getCurrentPage();
      job.retryCount = 0;
      job.lastError = "";
      await setJob(job);
      setTimeout(() => collectLoop(), 1200);
      return;
    }

    // 일반(수동 단일) 모드 재개
    if (job.running) {
      setStatus("재개…");
      setTimeout(() => collectLoop(), 800);
    }
  }

  // ============================================================================
  //  Entry
  // ============================================================================

  // window.load 와 setTimeout 두 트리거가 boot 을 중복 호출해 수집 루프가
  // 동시 실행되면 배치 큐가 이중 shift 되는 문제가 있어 가드를 건다.
  let bootRan = false;

  async function boot() {
    if (bootRan) return;
    bootRan = true;
    try {
      if (isDashboardPage()) {
        bootDashboard();
        return;
      }
      if (isDetailPage()) {
        await bootDetail();
        return;
      }
    } catch (e) {
      try {
        console.warn("[YAN4 Replenish] boot failed:", e);
      } catch {}
    }
  }

  window.addEventListener("load", boot);
  setTimeout(boot, 1200);
})();
