// ==UserScript==
// @name         YAN4 RCRT88 긁어오기
// @namespace    yan4-ib-tote-move
// @version      1.7.1
// @description  tote-move/list: 기간 UI→#input · 진열완료 조회 후 RCRT88 표 수집 · 클립보드 TSV
// @match        https://inventory.coupang.com/tote-move/list*
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const PANEL_ID = "yan4-tote-move-stowing-panel";
  /** 토트 바코드에 포함되는 타입 토큰 — 이 값만 수집 (예: 1007-RCRT88-1-490 의 RCRT88 구간) */
  const INCLUDE_TOTE_TOKEN = "RCRT88";

  /**
   * 비우면: 기간유형 `w-select` 안의 `span.icon-area`(화살표)만 우선 클릭 → 없으면 w-select 폴백.
   */
  const FILTER_DROPDOWN_TRIGGER_SELECTOR = "";

  /** 기간유형(시작/완료/진열 시간 구분) 필드 — 이 안의 w-select 만 조작 */
  const PERIOD_TYPE_FIELD_SELECTOR = 'w-field[label="기간유형"]';

  /**
   * 드롭다운 연 직후 DOM 에 숨겨진 예전 w-option 이 먼저 잡히면 클릭 실패 → 다른 앵커까지 순회하게 됨.
   * 열린 패널의 옵션이 보일 때까지 최대 이 시간(ms)만큼 폴링합니다.
   */
  const DROPDOWN_OPEN_WAIT_MS = 2800;

  function barcodeMatchesInclude(barcode) {
    const s = String(barcode || "").trim();
    if (!s) return false;
    if (s.startsWith(INCLUDE_TOTE_TOKEN)) return true;
    return s.split("-").indexOf(INCLUDE_TOTE_TOKEN) !== -1;
  }

  let runSeq = 0;
  let stopRequested = false;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  /**
   * Light DOM + 모든 하위 shadowRoot 를 재귀 순회해 첫 일치 요소 반환.
   * (document.querySelector 는 shadow 내부 w-option 을 못 봄 → 진열완료 선택 실패 원인)
   */
  function deepQuerySelector(selector, root) {
    const start = root || document.documentElement;
    function visit(node) {
      if (!node) return null;
      try {
        if (node.nodeType === 1 && typeof node.matches === "function") {
          if (node.matches(selector)) return node;
        }
        const kids = node.childNodes;
        for (let i = 0; i < kids.length; i++) {
          const hit = visit(kids[i]);
          if (hit) return hit;
        }
        if (node.shadowRoot) {
          const hit = visit(node.shadowRoot);
          if (hit) return hit;
        }
      } catch (e) {
        return null;
      }
      return null;
    }
    return visit(start);
  }

  /** shadow 포함 문서 전체에서 선택자와 일치하는 모든 노드 */
  function deepQuerySelectorAll(selector, root) {
    const out = [];
    const start = root || document.documentElement;
    function visit(node) {
      if (!node) return;
      try {
        if (
          node.nodeType === 1 &&
          typeof node.matches === "function" &&
          node.matches(selector)
        ) {
          out.push(node);
        }
        const kids = node.childNodes;
        for (let i = 0; i < kids.length; i++) visit(kids[i]);
        if (node.shadowRoot) visit(node.shadowRoot);
      } catch (e) {}
    }
    visit(start);
    return out;
  }

  /** value 일치 또는 라벨에 "진열완료" 포함 (앱마다 속성이 다를 때 대비) */
  function findStowingCompletedOption() {
    let el = deepQuerySelector('w-option[value="STOWING_COMPLETED"]');
    if (el) return el;

    const candidates = [];
    function collectWOption(node) {
      if (!node) return;
      try {
        if (node.nodeType === 1) {
          const tag = String(node.tagName || "").toLowerCase();
          if (tag === "w-option") candidates.push(node);
        }
        const kids = node.childNodes;
        for (let i = 0; i < kids.length; i++) collectWOption(kids[i]);
        if (node.shadowRoot) collectWOption(node.shadowRoot);
      } catch (e) {}
    }
    collectWOption(document.documentElement);

    for (let i = 0; i < candidates.length; i++) {
      const o = candidates[i];
      const v = o.getAttribute && o.getAttribute("value");
      if (v === "STOWING_COMPLETED") return o;
      const t = String(o.textContent || "").replace(/\s+/g, " ").trim();
      if (t.indexOf("진열완료") !== -1) return o;
    }
    return null;
  }

  function isRoughlyVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return false;
    try {
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") return false;
      if (Number(st.opacity) === 0) return false;
    } catch (e) {
      return false;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const vh = window.innerHeight || 0;
    const vw = window.innerWidth || 0;
    return !(r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw);
  }

  function isStowingCandidateOption(o) {
    const v = o.getAttribute && o.getAttribute("value");
    if (v === "STOWING_COMPLETED") return true;
    const t = String(o.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    return t.indexOf("진열완료") !== -1;
  }

  function collectWOptionsUnder(root) {
    const candidates = [];
    function collectWOption(node) {
      if (!node) return;
      try {
        if (node.nodeType === 1) {
          const tag = String(node.tagName || "").toLowerCase();
          if (tag === "w-option") candidates.push(node);
        }
        const kids = node.childNodes;
        for (let i = 0; i < kids.length; i++) collectWOption(kids[i]);
        if (node.shadowRoot) collectWOption(node.shadowRoot);
      } catch (e) {}
    }
    collectWOption(root);
    return candidates;
  }

  /** 기간유형 필드 안의 `value="STOWING_COMPLETED"` 노드 (선택 여부는 optionLooksSelected 로) */
  function findStowingCompletedOptionUnderPeriodField() {
    const field = findPeriodTypeField();
    if (!field) return null;
    const opts = collectWOptionsUnder(field);
    for (let i = 0; i < opts.length; i++) {
      const v = opts[i].getAttribute && opts[i].getAttribute("value");
      if (v === "STOWING_COMPLETED") return opts[i];
    }
    return null;
  }

  function findPeriodTypeField() {
    return deepQuerySelector(PERIOD_TYPE_FIELD_SELECTOR);
  }

  /** 기간유형 필드 안의 `w-select.sel-date-type` (없으면 w-select) */
  function findPeriodTypeSelect() {
    let el = deepQuerySelector(
      PERIOD_TYPE_FIELD_SELECTOR + " w-select.sel-date-type"
    );
    if (el) return el;
    el = deepQuerySelector(PERIOD_TYPE_FIELD_SELECTOR + " w-select");
    if (el) return el;
    const field = findPeriodTypeField();
    if (field && field.querySelector) {
      return (
        field.querySelector("w-select.sel-date-type") ||
        field.querySelector("w-select") ||
        null
      );
    }
    return null;
  }

  /**
   * 기간유형 w-select **내부**(shadow 포함) — `span.icon-area` + chevron path(`M1.378`) 우선, 없으면 첫 icon-area.
   */
  function findPeriodTypeIconTrigger() {
    const host = findPeriodTypeSelect();
    if (!host) return null;

    const iconSpans = [];
    function walk(node) {
      if (!node) return;
      try {
        if (node.nodeType === 1) {
          const tag = String(node.tagName || "").toLowerCase();
          if (
            tag === "span" &&
            node.classList &&
            node.classList.contains("icon-area")
          ) {
            iconSpans.push(node);
          }
        }
        const kids = node.childNodes;
        for (let i = 0; i < kids.length; i++) walk(kids[i]);
        if (node.shadowRoot) walk(node.shadowRoot);
      } catch (e) {}
    }
    walk(host);

    for (let i = 0; i < iconSpans.length; i++) {
      const pathEl =
        iconSpans[i].querySelector("svg.icon path") ||
        iconSpans[i].querySelector("svg path");
      const d = pathEl && pathEl.getAttribute && pathEl.getAttribute("d");
      if (d && d.indexOf("M1.378") !== -1) return iconSpans[i];
    }
    return iconSpans.length ? iconSpans[0] : null;
  }

  /**
   * 클릭 대상: 기간유형 트리 우선 → 없으면 전체 문서(레이어가 body 로 붙는 경우).
   * 숨은 레이어 오탐 방지를 위해 보이는 노드만.
   */
  function findVisibleStowingCompletedOption() {
    const order = [];
    const field = deepQuerySelector(PERIOD_TYPE_FIELD_SELECTOR);
    if (field) order.push(field);
    order.push(document.documentElement);

    const seen = new Set();
    for (let i = 0; i < order.length; i++) {
      const candidates = collectWOptionsUnder(order[i]);
      for (let j = 0; j < candidates.length; j++) {
        const o = candidates[j];
        if (seen.has(o)) continue;
        seen.add(o);
        if (!isStowingCandidateOption(o)) continue;
        if (isRoughlyVisible(o)) return o;
      }
    }
    return null;
  }

  async function waitForVisibleStowingOption(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (stopRequested) return null;
      const o = findVisibleStowingCompletedOption();
      if (o) return o;
      await sleep(80);
    }
    return null;
  }

  function optionLooksSelected(opt) {
    if (!opt) return false;
    if (opt.hasAttribute && opt.hasAttribute("selected")) return true;
    const aria = opt.getAttribute && opt.getAttribute("aria-selected");
    if (aria === "true") return true;
    if (opt.classList && opt.classList.contains("selected")) return true;
    return false;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function sleepInterruptible(ms) {
    const step = 100;
    let left = ms;
    while (left > 0) {
      if (stopRequested) return false;
      await sleep(Math.min(step, left));
      left -= step;
    }
    return true;
  }

  function setStatus(msg) {
    const status = $("#" + PANEL_ID + " .yan4-tote-status");
    if (status) status.textContent = msg;
  }

  function findDateRangeInput() {
    let el = deepQuerySelector('#input[type="text"]');
    if (!el) el = deepQuerySelector("#input");
    if (!el) {
      const id = document.getElementById("input");
      if (id && String(id.tagName || "").toUpperCase() === "INPUT") el = id;
    }
    return el || null;
  }

  /** Vue 등 반응형 입력용: value setter + input/change */
  function setInputValueReactFriendly(el, value) {
    if (!el) return;
    const str = String(value);
    try {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(el, str);
      else el.value = str;
    } catch (e) {
      el.value = str;
    }
    try {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (e2) {}
  }

  function pad2(n) {
    return String(n).length < 2 ? "0" + n : String(n);
  }

  /** 로컬 기준 YYYY-MM-DD */
  function todayYmd() {
    const d = new Date();
    return (
      d.getFullYear() +
      "-" +
      pad2(d.getMonth() + 1) +
      "-" +
      pad2(d.getDate())
    );
  }

  function compareYmd(a, b) {
    if (!a || !b) return 0;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function applyDateRangeToPage(panel) {
    const startEl = panel.querySelector(".yan4-date-start");
    const endEl = panel.querySelector(".yan4-date-end");
    const preview = panel.querySelector(".yan4-date-preview");
    if (!startEl || !endEl) return;

    let s = String(startEl.value || "").trim();
    let e = String(endEl.value || "").trim();
    if (s && e && compareYmd(s, e) > 0) {
      const t = s;
      s = e;
      e = t;
      startEl.value = s;
      endEl.value = e;
    }

    const target = findDateRangeInput();
    if (s && e) {
      const text = s + " - " + e;
      setInputValueReactFriendly(target, text);
      if (preview) preview.textContent = "→ " + text;
      setStatus(
        target ? "기간 반영됨 · 작동으로 조회·수집" : "#input 없음 · 기간 문자열만 생성"
      );
    } else {
      if (preview) preview.textContent = "시작·종료 모두 선택 시 페이지에 반영";
    }
  }

  function tryParseRangeIntoPickers(panel, raw) {
    const startEl = panel.querySelector(".yan4-date-start");
    const endEl = panel.querySelector(".yan4-date-end");
    if (!startEl || !endEl || !raw) return;
    const m = String(raw)
      .trim()
      .match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/);
    if (m) {
      startEl.value = m[1];
      endEl.value = m[2];
    }
  }

  function normalizeCellText(el) {
    return String(el.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getMainTable() {
    return $('table[is="w-table"]');
  }

  function getCurrentPageNum() {
    const el = $('w-page-item[active][data-go-page]');
    if (!el) return 1;
    const n = parseInt(String(el.getAttribute("data-go-page") || "").trim(), 10);
    return Number.isFinite(n) ? n : 1;
  }

  async function waitUntilPage(expected, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (stopRequested) return false;
      if (getCurrentPageNum() === expected) return true;
      await sleep(120);
    }
    return false;
  }

  /**
   * @returns {Promise<number|false>} 다음 페이지 번호 또는 실패
   */
  async function goToNextPage(curPage) {
    const want = curPage + 1;
    const direct = $(`w-page-item.go-page[data-go-page="${want}"]`);
    if (direct) {
      direct.click();
      const ok = await waitUntilPage(want, 12000);
      return ok ? want : false;
    }
    const nextArrow = $("w-page-next.go-next-page");
    if (nextArrow) {
      nextArrow.click();
      const ok = await waitUntilPage(want, 12000);
      return ok ? want : false;
    }
    return false;
  }

  function isStowingCompletedSelected() {
    const scoped = findStowingCompletedOptionUnderPeriodField();
    if (scoped) return optionLooksSelected(scoped);
    const opt = findStowingCompletedOption();
    return optionLooksSelected(opt);
  }

  async function clickStowingCompletedOption() {
    let opt = findVisibleStowingCompletedOption();
    if (!opt) opt = await waitForVisibleStowingOption(DROPDOWN_OPEN_WAIT_MS);
    if (!opt) return false;

    opt.click();
    await sleep(100);
    try {
      opt.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
        })
      );
    } catch (e) {}

    for (let r = 0; r < 10; r++) {
      if (isStowingCompletedSelected()) return true;
      await sleep(100);
    }
    return optionLooksSelected(
      findStowingCompletedOptionUnderPeriodField() || findStowingCompletedOption()
    );
  }

  /**
   * Vue 등에서 native click 만으로 안 열릴 때 대비 — 앵커 중심 좌표로 pointer/mouse 순 전달
   */
  function syntheticClick(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") {
      el && el.click && el.click();
      return;
    }
    const r = el.getBoundingClientRect();
    const x = r.left + Math.min(r.width / 2, 40);
    const y = r.top + Math.min(r.height / 2, 20);
    const base = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0,
    };
    try {
      if (typeof PointerEvent === "function") {
        el.dispatchEvent(
          new PointerEvent("pointerdown", {
            pointerId: 1,
            pointerType: "mouse",
            ...base,
          })
        );
      }
      el.dispatchEvent(new MouseEvent("mousedown", base));
      el.dispatchEvent(new MouseEvent("mouseup", base));
      el.dispatchEvent(new MouseEvent("click", base));
    } catch (e) {
      try {
        el.click();
      } catch (e2) {}
    }
  }

  /** a.selected 가 트리거 — span 이 아니라 앵커를 누르는 편이 slot/핸들러와 맞는 경우가 많음 */
  async function openDropdownFromTrigger(trigger) {
    if (!trigger) return;
    const anchor =
      trigger.closest && trigger.closest("a")
        ? trigger.closest("a")
        : trigger;
    syntheticClick(anchor);
    await sleep(520);
  }

  async function ensureStowingCompletedOption() {
    if (isStowingCompletedSelected()) return true;

    const customSel = String(FILTER_DROPDOWN_TRIGGER_SELECTOR || "").trim();
    if (customSel) {
      try {
        const trigger =
          deepQuerySelector(customSel) || $(customSel);
        if (trigger) {
          setStatus("드롭다운 열기(지정 선택자)…");
          await openDropdownFromTrigger(trigger);
          await sleep(450);
          if (await clickStowingCompletedOption()) return true;
        }
      } catch (e) {
        setStatus("지정 선택자 오류 · 기간유형으로 재시도");
      }
    }

    const periodSel = findPeriodTypeSelect();
    if (!periodSel) {
      setStatus("실패 · 기간유형(w-field) 또는 w-select 없음");
      return false;
    }

    const iconTr = findPeriodTypeIconTrigger();
    if (iconTr) {
      setStatus("기간유형 화살표(span.icon-area)만 클릭…");
      syntheticClick(iconTr);
      await sleep(520);
      if (await clickStowingCompletedOption()) return true;
      try {
        iconTr.click();
      } catch (e) {}
      await sleep(520);
      if (await clickStowingCompletedOption()) return true;
    }

    setStatus("기간유형 w-select 전체 클릭(폴백)…");
    syntheticClick(periodSel);
    await sleep(520);
    if (await clickStowingCompletedOption()) return true;

    try {
      periodSel.click();
    } catch (e) {}
    await sleep(520);
    return await clickStowingCompletedOption();
  }

  async function clickSearchAndWaitTable(mySeq) {
    const btn = $("button.btn-search");
    if (!btn) return false;

    const tableBefore = getMainTable();
    const snapshot =
      tableBefore && tableBefore.querySelector("tbody")
        ? tableBefore.querySelector("tbody").innerHTML
        : "";

    btn.click();

    const deadline = Date.now() + 18000;
    while (Date.now() < deadline) {
      if (stopRequested || mySeq !== runSeq) return false;
      const table = getMainTable();
      const tbody = table && table.querySelector("tbody");
      const now = tbody ? tbody.innerHTML : "";
      if (table && tbody && now !== snapshot) {
        await sleep(450);
        return true;
      }
      await sleep(160);
    }
    return !!getMainTable();
  }

  /**
   * 헤더 제외 · RCRT88 토트만 · TSV 한 줄씩
   */
  function scrapeCurrentPageRows() {
    const table = getMainTable();
    if (!table) return [];

    const out = [];
    $all("tbody tr", table).forEach((tr) => {
      const tds = $all("td", tr);
      if (!tds.length) return;

      const first = tds[0];
      const a = first.querySelector("a");
      const barcode = (a ? a.textContent : first.textContent).trim();
      if (!barcodeMatchesInclude(barcode)) return;

      const line = tds.map(normalizeCellText).join("\t");
      out.push(line);
    });
    return out;
  }

  async function collectAllPages(mySeq) {
    const lines = [];
    let cur = getCurrentPageNum();

    while (!stopRequested && mySeq === runSeq) {
      setStatus("페이지 " + cur + " 수집 중… (" + lines.length + "행)");

      const chunk = scrapeCurrentPageRows();
      lines.push.apply(lines, chunk);

      const slept = await sleepInterruptible(320);
      if (!slept || stopRequested || mySeq !== runSeq) break;

      const next = await goToNextPage(cur);
      if (!next) break;
      cur = next;

      await sleepInterruptible(280);
    }

    return lines;
  }

  async function runPipeline() {
    const mySeq = ++runSeq;
    stopRequested = false;

    setStatus("진열완료 선택…");
    const okOpt = await ensureStowingCompletedOption();
    if (!okOpt) {
      alert(
        "[YAN4] '진열완료 시간' 옵션을 선택하지 못했습니다.\n필터 드롭다운을 연 뒤 다시 시도하세요."
      );
      setStatus("실패 · 옵션");
      return;
    }

    if (stopRequested || mySeq !== runSeq) return;

    setStatus("조회 중…");
    const searched = await clickSearchAndWaitTable(mySeq);
    if (!searched) {
      alert("[YAN4] 조회 후 표를 확인하지 못했습니다.");
      setStatus("실패 · 조회");
      return;
    }

    if (stopRequested || mySeq !== runSeq) return;

    setStatus("전 페이지 수집…");
    const lines = await collectAllPages(mySeq);

    const text = lines.join("\n");
    try {
      if (typeof GM_setClipboard === "function") {
        GM_setClipboard(text, "text/plain");
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("clipboard unavailable");
      }
      setStatus(
        "완료 · " +
          lines.length +
          "행 복사됨 (" +
          INCLUDE_TOTE_TOKEN +
          " 만)"
      );
    } catch (e) {
      alert("[YAN4] 클립보드 복사 실패: " + (e && e.message ? e.message : e));
      setStatus("복사 실패");
    }
  }

  function requestStop() {
    stopRequested = true;
    runSeq++;
    setStatus("중지 요청됨");
  }

  function createPanel() {
    if ($("#" + PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = [
      "position:fixed",
      "left:12px",
      "bottom:12px",
      "z-index:99999",
      "min-width:180px",
      "max-width:260px",
      "padding:8px 10px",
      "border-radius:8px",
      "background:#0f4c8a",
      "color:#fff",
      "box-shadow:0 4px 14px rgba(0,0,0,.2)",
      'font:11px/1.35 "Segoe UI","Malgun Gothic",sans-serif',
    ].join(";");

    const btnBase =
      "width:100%;border:0;border-radius:4px;padding:6px 8px;font-size:11px;font-weight:600;cursor:pointer;line-height:1.2;";

    const dateInp =
      "box-sizing:border-box;width:100%;max-width:100%;margin-top:2px;padding:3px 4px;border-radius:4px;border:1px solid rgba(255,255,255,.35);font-size:11px;color:#0f172a;background:#f8fafc;";

    panel.innerHTML =
      '<div style="font-weight:700;font-size:11px;margin:0 0 6px 0;opacity:.95;">RCRT88 긁어오기</div>' +
      '<div class="yan4-date-block" style="margin:0 0 8px 0;font-size:10px;line-height:1.25;">' +
      '<label style="display:block;margin-bottom:4px;opacity:.95;">시작' +
      '<input type="date" class="yan4-date-start" style="' +
      dateInp +
      '" /></label>' +
      '<label style="display:block;margin-bottom:4px;opacity:.95;">종료' +
      '<input type="date" class="yan4-date-end" style="' +
      dateInp +
      '" /></label>' +
      '<div class="yan4-date-preview" style="font-size:9px;opacity:.88;margin-top:2px;word-break:break-all;">시작·종료 선택 시 <code style="font-size:9px;">YYYY-MM-DD - YYYY-MM-DD</code> 로 입력</div>' +
      "</div>" +
      '<button type="button" class="yan4-tote-run" style="' +
      btnBase +
      'background:#fff;color:#0f4c8a;margin-bottom:4px;">작동 (순차 실행)</button>' +
      '<button type="button" class="yan4-tote-stop" style="' +
      btnBase +
      'background:#fecaca;color:#7f1d1d;margin-bottom:6px;">중지</button>' +
      '<div class="yan4-tote-status" style="font-size:10px;line-height:1.3;opacity:.9;word-break:break-word;">준비</div>';

    document.body.appendChild(panel);

    const end = panel.querySelector(".yan4-date-end");
    const start = panel.querySelector(".yan4-date-start");
    if (end && !end.value) end.value = todayYmd();
    if (start && !start.value && end) {
      const d = new Date();
      d.setDate(d.getDate() - 2);
      start.value =
        d.getFullYear() +
        "-" +
        pad2(d.getMonth() + 1) +
        "-" +
        pad2(d.getDate());
    }

    const field = findDateRangeInput();
    if (field && field.value) tryParseRangeIntoPickers(panel, field.value);

    function onDateChange() {
      applyDateRangeToPage(panel);
    }
    if (start)
      start.addEventListener("change", onDateChange);
    if (end) end.addEventListener("change", onDateChange);
    if (start) start.addEventListener("input", onDateChange);
    if (end) end.addEventListener("input", onDateChange);

    if (start && end && start.value && end.value) applyDateRangeToPage(panel);

    $(".yan4-tote-run", panel).addEventListener("click", function () {
      runPipeline().catch(function (e) {
        alert("[YAN4] 오류: " + (e && e.message ? e.message : e));
        setStatus("오류");
      });
    });
    $(".yan4-tote-stop", panel).addEventListener("click", requestStop);
  }

  createPanel();
})();
