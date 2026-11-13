/** YAN4 IB Shell — 게임식 튜토리얼 (강조 + 개구리 말풍선 + 다음/이전/건너뛰기)
 *  - 상단 「튜토리얼」 버튼 → 기본 · SLA · ATS · 1~4페이지 투어
 *  - 1·2페이지 카드 머리말의 개구리 버튼 → 그 카드만 짚는 짧은 투어
 *  - 자동으로 띄우지 않음 (버튼으로만 연다)
 */
(function () {
  "use strict";
  if (window.__YAN4_TUTORIAL__) return;

  var FROG_SRC = "./media/tutorial-frog.png";
  var Z = 2147483647; /* 셸(#yna4UnifiedUiShell_v09) 2147483646 보다 위 */
  var NO_TARGET_NOTE = "조회한 뒤 다시 보면 이 자리를 짚어 드립니다.";

  /* ───────── 찾기 도우미 ───────── */
  function isVis(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var cs = window.getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }
  function qa(sel, root) {
    try {
      return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    } catch (e) {
      return [];
    }
  }
  function q(sel, root) {
    var list = qa(sel, root);
    for (var i = 0; i < list.length; i++) if (isVis(list[i])) return list[i];
    return null;
  }
  function txt(el) {
    return String((el && el.textContent) || "").replace(/\s+/g, " ").trim();
  }
  /** root 안에서 sel 중 글자가 text 로 시작하는 첫 보이는 요소 */
  function byText(root, sel, text) {
    var list = qa(sel, root);
    for (var i = 0; i < list.length; i++) {
      if (isVis(list[i]) && txt(list[i]).indexOf(text) === 0) return list[i];
    }
    return null;
  }
  function pageEl(key) {
    return document.getElementById("yna4UnifiedUiShell_v09-shell-page-" + key);
  }
  function card(id) {
    return document.querySelector('.yna4-pane-card[data-pane="' + id + '"]');
  }
  /** 카드 안 요소 찾기 함수 */
  function inCard(id, sel, text) {
    return function () {
      var c = card(id);
      if (!c) return null;
      return text ? byText(c, sel, text) : q(sel, c);
    };
  }
  function cardWhole(id) {
    return function () {
      return card(id);
    };
  }
  function inPage(key, sel, text) {
    return function () {
      var p = pageEl(key);
      if (!p) return null;
      return text ? byText(p, sel, text) : q(sel, p);
    };
  }
  function all() {
    var fns = Array.prototype.slice.call(arguments);
    return function () {
      var out = [];
      fns.forEach(function (f) {
        var r = typeof f === "function" ? f() : q(f);
        if (r) out.push(r);
      });
      return out;
    };
  }

  /* ───────── MK2 SLA 탭 (개요 · 피벗 표 · 이동중) — MK1에는 없음 ───────── */
  function slaTabs() {
    return qa(".yna4-sla-tab", pageEl("sla"));
  }
  function hasSlaTabs() {
    return slaTabs().length > 0;
  }
  function activeSlaTab() {
    var t = slaTabs().filter(function (b) {
      return b.classList.contains("yna4-sla-tab--active");
    })[0];
    return t ? txt(t) : "";
  }
  /** 탭을 바꿨으면 true */
  function selectSlaTab(label) {
    var tabs = slaTabs();
    for (var i = 0; i < tabs.length; i++) {
      if (txt(tabs[i]) === label) {
        if (tabs[i].classList.contains("yna4-sla-tab--active")) return false;
        try {
          tabs[i].click();
        } catch (e) {}
        return true;
      }
    }
    return false;
  }

  /* ───────── 페이지 이동 ───────── */
  function navBtn(page) {
    var nav = qa("#banner .yna4-shell-page-nav button, .yna4-shell-page-nav button");
    for (var i = 0; i < nav.length; i++) {
      var b = nav[i];
      if (page === "sla" && b.classList.contains("yna4-shell-page-nav--sla")) return b;
      if (page === "ats" && b.classList.contains("yna4-shell-page-nav--ats")) return b;
      if (
        txt(b) === page &&
        !b.classList.contains("yna4-shell-page-nav--sla") &&
        !b.classList.contains("yna4-shell-page-nav--ats")
      )
        return b;
    }
    return null;
  }
  function gotoPage(page, done) {
    if (!page) return done();
    var p = pageEl(page);
    if (p && p.style.display !== "none") return done();
    var b = navBtn(page);
    if (b && isVis(b)) {
      try {
        b.click();
      } catch (e) {}
      setTimeout(done, 350);
    } else {
      done();
    }
  }

  /* ───────── 투어 내용 ───────── */
  var TOURS = {};
  var MENU = [];
  function tour(id, name, page, steps, inMenu) {
    TOURS[id] = { id: id, name: name, page: page, steps: steps };
    if (inMenu) MENU.push(id);
  }

  tour(
    "basic",
    "기본 · 상단 바",
    null,
    [
      {
        title: "CFS IB LIVE 안내",
        text:
          "상단 바부터 차례로 안내합니다.<br>「다음」이나 → 키로 넘기고, Esc로 언제든 닫습니다.",
      },
      {
        t: "#banner .yna4-shell-page-nav",
        title: "페이지 버튼",
        text:
          "<b>SLA</b>·<b>ATS</b>가 핵심 화면입니다.<br>1·2페이지는 카드 모음, 3·4페이지는 화면 전체를 쓰는 작업 화면입니다.",
      },
      {
        t: "#banner .center-group",
        title: "센터 확인 · 전환",
        text:
          "「센터: YAN4 (1007) ✓」처럼 지금 센터가 표시됩니다.<br>다른 센터면 목록에서 고르고 「전환」을 누릅니다.",
      },
      {
        t: "#btnLoginCoupang",
        title: "WMS 로그인 (가장 먼저)",
        text:
          "SLA·ATS 조회 대부분이 WMS 세션을 씁니다.<br>로그인이 끝나면 버튼이 「로그인완료」로 바뀝니다. 세션이 풀리면 다시 눌러 재로그인합니다.",
      },
      {
        t: all("#btnLoginPo", "#btnLoginMos", "#btnLoginShipments"),
        title: "PO · MOS · SHPT",
        text:
          "<b>PO</b>: PO Management (SLA 진척)<br><b>MOS</b>: Gross HTP · Need help Tracking<br><b>SHPT</b>: 쉽먼트 입차예약시간<br>WMS → PO → MOS 순서로 로그인합니다.",
      },
      {
        t: "#btnOpenSop",
        title: "입고 매뉴얼 (SOP)",
        text: "입고 SOP를 검색해서 해당 쪽을 바로 엽니다.",
      },
      {
        t: "#yna4TutorialBtn",
        title: "튜토리얼 다시 보기",
        text:
          "이 버튼에서 SLA · ATS · 페이지별 안내를 언제든 다시 봅니다.<br>1·2페이지 카드는 카드 오른쪽 위 <b>개구리 버튼</b>을 누르면 그 카드만 안내합니다.",
      },
    ],
    true
  );

  /* ───────── SLA · ATS 도우미 (예시 데이터 / 실제 결과 둘 다) ───────── */
  function slaP() {
    return pageEl("sla");
  }
  function slaDrillHost() {
    return q(".yna4-sla-pivot-drill-host", slaP());
  }
  function slaDrillKey() {
    var d = slaDrillHost();
    if (!d) return "";
    var r = d.getAttribute("data-open-row") || "";
    return r ? r + "|" + (d.getAttribute("data-open-col") || "") : "";
  }
  function slaDrillReady() {
    var d = slaDrillHost();
    return !!(d && slaDrillKey() && d.querySelector("tbody tr"));
  }
  var SLA_CELL = ".yna4-sla-pivot-num--hit:not(.yna4-sla-pivot-total):not(.yna4-sla-pivot-col--moving):not(.yna4-sla-pivot-col--adhoc)";
  /** 먼저 볼 칸: MISS(지난 날) → SLA 경고 → 아무 이관 칸 */
  function slaFirstCell() {
    var p = slaP();
    if (!p) return null;
    var picks = [
      ".yna4-sla-pivot-tr:not(.yna4-sla-pivot-tr--direct):not(.yna4-sla-pivot-tr--grand) .yna4-sla-pivot-num--overdue-day:not(.yna4-sla-pivot-total)",
      ".yna4-sla-pivot-tr:not(.yna4-sla-pivot-tr--direct):not(.yna4-sla-pivot-tr--grand) .yna4-sla-pivot-num--sla-alert:not(.yna4-sla-pivot-total)",
      ".yna4-sla-pivot-tr:not(.yna4-sla-pivot-tr--direct):not(.yna4-sla-pivot-tr--grand) " + SLA_CELL,
    ];
    for (var i = 0; i < picks.length; i++) {
      var el = q(picks[i], p);
      if (el) return el;
    }
    return null;
  }
  function slaDirectCell() {
    return q(".yna4-sla-pivot-tr--direct " + SLA_CELL, slaP());
  }
  /** 열려 있는 드릴을 닫음 — 같은 칸을 더블클릭하면 닫혀 버리므로 직접 해 보기 전에 */
  function slaCloseDrill() {
    var d = slaDrillHost();
    if (!d) return;
    d.textContent = "";
    d.removeAttribute("data-open-row");
    d.removeAttribute("data-open-col");
    qa(".yna4-sla-pivot-num--selected", slaP()).forEach(function (td) {
      td.classList.remove("yna4-sla-pivot-num--selected");
    });
  }
  function drillOpenedBy(prefixRe) {
    return function (k0) {
      var k = slaDrillKey();
      return !!(k && k !== k0 && (!prefixRe || prefixRe.test(k)) && slaDrillReady());
    };
  }

  tour(
    "sla",
    "SLA",
    "sla",
    [
      {
        title: "SLA 화면",
        text:
          "입고 진열 마감(SLA)을 보는 화면입니다.<br>순서: <b>로그인 → 센터 확인 → 「SLA 전체」 → 결과 보기</b><br>결과 화면은 직접 눌러 보며 익힙니다.",
      },
      {
        t: inPage("sla", ".yna4-sla-btn--primary"),
        title: "「SLA 전체」",
        text: "진척 · 이관 · 직납을 한 번에 조회합니다. 끝나면 아래 줄에 요약과 조회 시각이 나옵니다.",
      },
      {
        t: all(inPage("sla", ".yna4-sla-lookback"), inPage("sla", ".yna4-sla-toolbar-check")),
        title: "기간 · 직납완료",
        text:
          "<b>기간</b>: 이관 조회 기간(7 · 15 · 30일). 직납 · 진척은 오늘 운영일만 봅니다.<br><b>직납완료</b>: 체크하면 직납 · 진척을 건너뛰고 이관만 봅니다. 직납까지 보려면 체크를 풉니다.",
      },
      {
        t: all(inPage("sla", ".yna4-sla-btn--auto"), inPage("sla", "button", "캡처")),
        title: "30min Auto · 캡처",
        text:
          "<b>캡처</b>: 진척율 · SLA · 이동중을 이미지 한 장으로 복사합니다 → 팀즈에 붙여넣기.<br><b>30min Auto</b>: 지금 조회 + 캡처하고 30분마다 반복합니다.",
      },
      {
        when: hasSlaTabs,
        t: function () {
          return qa(".yna4-sla-tab", slaP()).filter(isVis);
        },
        title: "화면 탭",
        text: "<b>개요</b> · <b>피벗 표</b> · <b>이동중</b>을 탭으로 오갑니다. 이어서 탭마다 짚어 봅니다.",
      },
      {
        when: hasSlaTabs,
        tab: "개요",
        t: inPage("sla", ".yna4-sla-overview-host"),
        title: "개요",
        text: "조회 결과를 한 장으로 요약합니다. 채널별(RocketMart · 이관 · AG · 직납) · 온도대별로 남은 UNIT을 먼저 봅니다.",
      },
      {
        tab: "개요",
        t: inPage("sla", ".yna4-sla-progress-host"),
        title: "A · 진척율",
        text:
          "금일(07:00 ~ 익일 06:59) 하차 · 입고 진행입니다.<br><b>하차 진척율</b> = 도착 대비 하차 · <b>매입 진척율</b> = 하차 대비 입고<br><b>Shrink</b> = 직납 · 이관 Shrink 품목<br>오른쪽은 업체별 입고예약 · 하차시간입니다.",
      },
      {
        tab: "피벗 표",
        t: function () {
          var h = q(".yna4-sla-pivot-host", slaP());
          return h && h.querySelector("table") ? h.querySelector("table") : null;
        },
        title: "B · 피벗 표 읽는 법",
        text:
          "<b>행</b> = 직납(DIR) · 이관 온도대(Ambient · Chilled · Frozen · RocketMart)<br><b>열</b> = SLA 날짜 · 시각. 숫자는 그 시각까지 진열해야 할 남은 UNIT입니다.<br><b>MISS</b> 열은 이미 SLA가 지난 칸, <b>이동중</b>은 아직 센터에 안 온 UNIT입니다.",
      },
      {
        tab: "피벗 표",
        before: slaCloseDrill,
        t: slaFirstCell,
        act: "이 칸을 더블클릭해 보세요",
        snap: slaDrillKey,
        done: drillOpenedBy(null),
        title: "급한 칸부터 — 더블클릭",
        text:
          "<b>MISS</b>(빨간 칸)부터, 그다음 가장 이른 시각 칸을 봅니다.<br>칸을 <b>더블클릭</b>하면 그 칸에 들어 있는 실물 목록(드릴)이 아래에 열립니다.",
      },
      {
        tab: "피벗 표",
        t: function () {
          var d = slaDrillHost();
          return d && slaDrillKey() ? d : null;
        },
        title: "C · 드릴 목록",
        text:
          "차량 · 상차시간 · CT · 토트 · 상품 · 유닛 · <b>상태</b>(진열대기 · 진열중)로 실물을 찾습니다.<br><b>주황 행</b> = 고기 / 계란(축산)<br>같은 칸을 다시 더블클릭하면 닫힙니다.",
      },
      {
        tab: "피벗 표",
        t: function () {
          return q(".yna4-sla-pivot-drill-teams-btn", slaDrillHost());
        },
        title: "팀즈 공유",
        text: "「팀즈」를 누르면 지금 드릴 표가 복사됩니다. 팀즈 채팅에 그대로 붙여넣으면 됩니다.",
      },
      {
        tab: "피벗 표",
        t: function () {
          return qa(".yna4-sla-pivot-drill-filter-btn, .yna4-sla-pivot-drill-sort-btn", slaDrillHost()).filter(isVis).slice(0, 3);
        },
        title: "정렬 · 필터",
        text: "열 머리의 ▾ · ▲▼ 버튼으로 차량 · 토트 · 상태별로 걸러 보거나 정렬합니다.",
      },
      {
        tab: "피벗 표",
        t: slaDirectCell,
        act: "직납 칸을 더블클릭해 보세요",
        snap: slaDrillKey,
        done: drillOpenedBy(/^DIRECT/),
        title: "D · 직납 칸",
        text: "주황 배경의 <b>DIR</b> 행은 직납입니다. 직납 칸도 더블클릭하면 품목 목록이 열립니다.",
      },
      {
        tab: "피벗 표",
        t: function () {
          var d = slaDrillHost();
          return d && /^DIRECT/.test(slaDrillKey()) ? d : null;
        },
        title: "직납 드릴 — RCRT 실시간",
        text:
          "업체 · SKU · 상품 · <b>RCRT</b>(지금 남은 수량, 없으면 「-」) · 하차일시 · SLA(+12h)입니다.<br>진열한 뒤 다시 누르면 진열된 만큼 숫자가 줄고, 바뀐 칸은 <b>연한 노랑</b>이 됩니다.<br>「로그인 필요」가 나오면 WMS 재로그인 후 다시 누릅니다.",
        demoNote: "예시 데이터에서는 실시간 RCRT 조회를 하지 않아 「RCRT 조회…」로 남습니다.",
      },
      {
        tab: "이동중",
        t: function () {
          return q(".yna4-sla-moving-host table", slaP()) ? q(".yna4-sla-moving-host", slaP()) : null;
        },
        title: "E · 이동중 차량",
        text:
          "아직 센터에 안 온 차량 목록입니다.<br>FROM FC · 온도대 · 차량 · 상차시간 · <b>기한</b> · <b>남은시간</b> · CT · 유닛. 기한이 지나면 「만료」.<br>피벗의 <b>이동중</b> 칸을 더블클릭하면 그 온도대 이동중 토트 목록도 볼 수 있습니다.",
      },
      {
        title: "현장 요약",
        text:
          "① MISS 칸부터, 그다음 가장 이른 시각 칸<br>② 칸을 더블클릭해 상품 · 토트 · RCRT 위치 확인 → 「팀즈」로 공유<br>③ 진열 후 다시 눌러 숫자가 줄었는지 확인",
      },
    ],
    true
  );

  /* ───────── ATS ───────── */
  function atsP() {
    return pageEl("ats");
  }
  function atsViewTabBtn(label) {
    return qa(".yna4-ats-view-tab", atsP()).filter(function (b) {
      return isVis(b) && txt(b).indexOf(label) >= 0;
    })[0] || null;
  }
  function atsViewTabOn(label) {
    var b = atsViewTabBtn(label);
    return !!(b && b.classList.contains("is-on"));
  }
  /** 행이 있는 첫 구간 (⑬ 재고 없음은 뒤로) */
  function atsFirstPanelWithRows() {
    var panels = qa(".yna4-ats-dashboard-panel", atsP()).filter(isVis);
    var fallback = null;
    for (var i = 0; i < panels.length; i++) {
      var rows = qa("tbody tr", panels[i]).filter(function (tr) {
        return tr.children.length > 3;
      });
      if (!rows.length) continue;
      if (/재고 없음/.test(txt(panels[i].querySelector("h3")))) {
        if (!fallback) fallback = panels[i];
        continue;
      }
      return panels[i];
    }
    return fallback;
  }

  tour(
    "ats",
    "ATS",
    "ats",
    [
      {
        title: "ATS 화면",
        text:
          "보충(ATS) 목록을 만들고 팀즈 · 보충지로 나눠 주는 화면입니다.<br>순서: <b>「시간대 조회」 → 시간대 선택 → 「조회실행」</b><br>결과 화면은 직접 눌러 보며 익힙니다.",
      },
      {
        t: inPage("ats", ".yna4-ats-btn--cutline"),
        title: "1 · 「시간대 조회」",
        text: "보충 시간대와 잔여 건수를 불러옵니다. 안 되면 WMS 로그인 후 다시 누릅니다.",
      },
      {
        t: inPage("ats", ".yna4-ats-toolbar-row--cutline"),
        title: "2 · 보충 시간대 선택",
        text: "처리할 시간대만 체크합니다(칩마다 남은 unit). 「전체」 · 「해제」로 한 번에 켜고 끕니다.",
      },
      {
        t: inPage("ats", ".yna4-ats-deadline-offset"),
        title: "보충마감설정",
        text: "보충마감 = 출고마감 − 입력한 분(기본 50분). 다음 조회실행부터 적용됩니다.",
      },
      {
        t: all(inPage("ats", ".yna4-ats-btn--primary"), inPage("ats", ".yna4-ats-btn--auto"), inPage("ats", ".yna4-ats-auto-interval")),
        title: "3 · 「조회실행」 · AUTO",
        text:
          "<b>조회실행</b>: 로케이션 재고까지 확인해 목록을 만듭니다. 끝나면 버퍼충족 · 대체없음 건수가 문구로 나옵니다.<br><b>AUTO</b>: 고른 간격(10 · 20 · 30분)마다 조회실행. 다시 누르면 꺼집니다.",
      },
      {
        t: function () {
          return atsFirstPanelWithRows();
        },
        title: "구간별 목록",
        text:
          "①~⑬ 구간마다 <b>보충</b>할 수량 / 남은 <b>재고</b>, 실물 위치(<b>로케이션 · CT</b>), 상차 · 하차시간, <b>보충기한</b>이 나옵니다.<br><b>초록</b> = 보충 끝 · <b>주황</b> = 일부 진열(「추가보충필요」면 남은 것 보충) · <b>음영</b> = 직납 / 18시 이전, 먼저 처리<br>⑬은 진열할 재고가 없는 건입니다.",
      },
      {
        t: function () {
          var p = atsFirstPanelWithRows();
          return p ? qa(".yna4-ats-ct-filter-btn", p).filter(isVis) : null;
        },
        title: "CT · 차량번호 정렬 · 필터",
        text: "열 머리의 ▾ 버튼으로 CT · 차량번호를 정렬하거나 골라 봅니다.",
      },
      {
        t: function () {
          return qa(".yna4-ats-sort-mode-btn", atsP()).filter(isVis).concat([q(".yna4-ats-btn--urgent", atsP())]).filter(Boolean);
        },
        title: "나열 순서 · 급한 건",
        text:
          "<b>기본</b>: 유통기한 → 보충마감 → 차량 → 로케이션 · <b>수량</b>: 보충수량 많은 순<br><b>직납+18시이전</b>: 누를 때마다 꺼짐 → 음영표시 → 해당행만. 급한 건만 골라 봅니다.",
      },
      {
        t: inPage("ats", ".yna4-ats-deadline-chips"),
        title: "보충마감 칩",
        text: "마감 시각별 건수입니다. 칩을 눌러 켜고 끄면 그 마감만 목록과 보충지에 남습니다.",
      },
      {
        t: function () {
          return qa(".yna4-ats-zone-mode-btn", atsP()).filter(function (b) {
            return isVis(b) && !b.classList.contains("yna4-ats-sort-mode-btn");
          }).concat(qa(".yna4-ats-zone-btn", atsP()).filter(isVis));
        },
        title: "팀즈 모드 · PDF 모드 · 구간 버튼",
        text:
          "<b>팀즈</b> 모드: 구간 버튼(EGG · 냉장 · 상온 · 냉동 · RM · 버퍼존)을 누르면 그 구간 표가 복사됩니다 → 팀즈에 붙여넣기.<br><b>PDF</b> 모드: 구간 버튼으로 보충지에 넣을 구간을 켜고 끕니다.",
      },
      {
        t: "#btnAtsPrintMergePdf",
        title: "보충지출력(PDF)",
        text: "PDF 모드에서 켠 구간 · 보충마감만 담아 보충지를 뽑습니다. 초록(완료) 행은 빠집니다.",
      },
      {
        t: function () {
          return atsViewTabBtn("CT");
        },
        act: "「CT 현황판」을 눌러 보세요",
        done: function () {
          return atsViewTabOn("CT");
        },
        title: "CT 현황판",
        text: "같은 결과를 <b>CT(차량)</b> 기준으로 묶어 봅니다. 어느 CT부터 꺼낼지 정할 때 씁니다.",
      },
      {
        t: function () {
          /* 이미 펼친 줄(is-open)은 누르면 접히므로, 아직 안 펼친 첫 CT 줄 */
          return q("tr.yna4-ats-ov-ct:not(.is-open)", atsP());
        },
        act: "이 줄을 눌러 펼쳐 보세요",
        snap: function () {
          return qa(".yna4-ats-ov-detail", atsP()).length;
        },
        done: function (n0) {
          return qa(".yna4-ats-ov-detail", atsP()).length > n0;
        },
        title: "CT 줄 펼치기",
        text: "줄마다 CT · 온도대 · 품목 수 · 보충 unit · 보충기한 · 남은 시간이 나옵니다.",
      },
      {
        t: function () {
          return q(".yna4-ats-ov-detail", atsP());
        },
        title: "CT 안의 상품",
        text: "그 CT에서 보충할 상품 · 보충 수량 · 재고 · 로케이션 · 보충기한입니다. 다시 누르면 접힙니다.",
      },
      {
        t: function () {
          return atsViewTabBtn("대시보드");
        },
        act: "「대시보드」를 눌러 돌아가 보세요",
        done: function () {
          return atsViewTabOn("대시보드");
        },
        title: "대시보드로",
        text: "구간별 목록 화면으로 돌아갑니다.",
      },
      {
        title: "현장 요약",
        text:
          "받은 보충지는 <b>색 없는 행만</b>, 맨 오른쪽 「보충기한」이 이른 것부터.<br>로케이션에서 꺼내 CT 기준으로 「보충」 열 수량만큼 보충합니다.",
      },
    ],
    true
  );

  /* 1·2페이지 카드 — 카드마다 개구리 버튼 */
  var CARD_TOURS = {
    po: {
      name: "Direct Tracking (receiving)",
      steps: [
        {
          t: cardWhole("po"),
          title: "Direct Tracking",
          text:
            "직납 발주 중 수량 차이가 있는 발주만 골라 검품 · 하차와 맞춰 봅니다.<br>발주 = 회송+입고, 발주 = 진열완료인 건은 빠집니다. (WMS · PO 로그인)",
        },
        { t: inCard("po", "input[type=date], .yna4-pane-inp"), title: "입고일자", text: "발주 목록과 검품(B) 하차 조회에 같이 쓰는 날짜입니다." },
        { t: inCard("po", "button", "작업 시작"), title: "작업 시작 · 중지", text: "발주 목록 → 차이 발주 상세 → 검품 조인 순서로 모읍니다. 멈추려면 「작업 중지」." },
        { t: inCard("po", "button", "통합 결과"), title: "통합 결과", text: "마지막 실행 결과를 팝업 창으로 엽니다." },
      ],
    },
    unload: {
      name: "Direct SLA (RPA)",
      steps: [
        { t: cardWhole("unload"), title: "Direct SLA", text: "직납 하차 내역을 모아 하차 SLA 결과를 만듭니다. (WMS 로그인)" },
        { t: all(inCard("unload", "button", "오늘"), inCard("unload", "button", "어제")), title: "오늘 · 어제", text: "조회할 날을 고릅니다." },
        { t: inCard("unload", "button", "작업 시작"), title: "작업 시작 · 중지", text: "하차 목록을 모읍니다. 멈추려면 「작업 중지」." },
        { t: inCard("unload", "button", "통합 결과"), title: "통합 결과", text: "모은 결과를 SLA 표로 엽니다.<br>오류가 나면 진단 칸에서 「칸 안 전체 선택」 후 내용을 전달합니다." },
      ],
    },
    avail: {
      name: "가용화내역조회",
      steps: [
        { t: cardWhole("avail"), title: "가용화내역조회", text: "SKU 한 개의 한 달 가용화 내역(ADJUST · PUTAWAY)을 봅니다.<br>Cycle count · Overage · General · Transfer error만 추립니다." },
        { t: inCard("avail", "input.yna4-avail-inp"), title: "SKU ID", text: "조회할 SKU ID를 넣습니다." },
        { t: inCard("avail", ".yna4-avail-month"), title: "월", text: "조회할 달입니다. 이번 달은 오늘까지 봅니다." },
        { t: inCard("avail", "select"), title: "센터", text: "「현재」는 센터 전환 없이 조회합니다. 다른 센터를 고르면 전환해서 조회한 뒤 YAN4로 돌아옵니다." },
        { t: all(inCard("avail", "button", "조회 실행"), inCard("avail", "button", "결과")), title: "조회 실행 · 결과", text: "7일씩 나눠 조회합니다. 「결과」로 마지막 결과를 다시 엽니다." },
      ],
    },
    prepack: {
      name: "Prepack&SR Daily Patrol",
      steps: [
        { t: cardWhole("prepack"), title: "Prepack&SR Daily Patrol", text: "프리팩 · SR 일일 점검표를 만듭니다." },
        { t: inCard("prepack", "button", "작업 시작"), title: "작업 시작", text: "재고관리 파일을 내려받은 뒤 결과 창을 띄웁니다." },
        { t: inCard("prepack", "button", "결과 다시 보기"), title: "결과 다시 보기", text: "마지막 결과 창을 다시 엽니다." },
      ],
    },
    slot05: {
      name: "STOW Error Tracking",
      steps: [
        { t: cardWhole("slot05"), title: "STOW Error Tracking", text: "진열 문제보고(STOW 오류)를 주기적으로 확인하고, 새 건이 생기면 알립니다." },
        { t: all(inCard("slot05", "input[id$=stow-watch-start]"), inCard("slot05", "input[id$=stow-watch-end]")), title: "기간", text: "감시할 문제보고 기간입니다." },
        { t: inCard("slot05", "input[id$=stow-watch-interval]"), title: "주기(초)", text: "몇 초마다 다시 확인할지 정합니다." },
        { t: all(inCard("slot05", "button", "감시 시작"), inCard("slot05", "button", "감시 중지")), title: "감시 시작 · 중지", text: "감시를 켜고 끕니다. 월별 집계는 4페이지에서 봅니다." },
      ],
    },
    slot12wide: {
      name: "Gross HTP",
      steps: [
        { t: cardWhole("slot12wide"), title: "Gross HTP", text: "시간대별 입고 생산성(HTP) 그래프입니다. 상단에서 고른 센터 기준입니다. (MOS 로그인)" },
        { t: all(inCard("slot12wide", "label", "오늘"), inCard("slot12wide", "label", "어제"), inCard("slot12wide", "button", "조회")), title: "오늘 · 어제 · 조회", text: "날을 고르고 「조회」를 누릅니다." },
        { t: inCard("slot12wide", ".yna4-gross-uph-target"), title: "목표", text: "목표 HTP입니다. 그래프에 빨간 점선으로 그려지고, 바꾸면 바로 반영됩니다." },
      ],
    },
    slot06: {
      name: "Need help Tracking",
      steps: [
        { t: cardWhole("slot06"), title: "Need help Tracking", text: "작업자별 Need help 요청 내역을 모아 봅니다. (MOS 로그인)" },
        { t: inCard("slot06", "textarea"), title: "작업자 ID", text: "한 줄에 하나씩 넣습니다. 예) V6703574" },
        { t: inCard("slot06", "input"), title: "조회일", text: "조회할 날짜입니다." },
        { t: all(inCard("slot06", "button", "조회 시작"), inCard("slot06", "button", "조회 중지")), title: "조회 시작 · 중지", text: "조회를 시작하고 멈춥니다." },
      ],
    },
    p2recv: {
      name: "입고내역 RWA (RPA)",
      steps: [
        { t: cardWhole("p2recv"), title: "입고내역 RWA", text: "RCRT 토트별 입고내역을 엑셀로 뽑습니다." },
        { t: inCard("p2recv", "select"), title: "토트바코드", text: "RCRT22 · RCRT44 · 둘 다(시트 분리) · 전체 중에서 고릅니다." },
        { t: inCard("p2recv", "input[id$=recv-date]"), title: "입고일시", text: "조회할 날짜입니다." },
        { t: all(inCard("p2recv", "input[placeholder='개인 AD ID']"), inCard("p2recv", "input[placeholder='AD PW']"), inCard("p2recv", "button", "계정 저장")), title: "Presto 계정", text: "생산성까지 보려면 개인 AD 계정을 넣고 「계정 저장」합니다. 서비스 계정(svc)은 안 됩니다." },
        { t: inCard("p2recv", "button", "작업 시작"), title: "작업 시작 · 중지", text: "토트 · 날짜를 고른 뒤 시작합니다." },
      ],
    },
    p2workerScan: {
      name: "STOW SCAN TRACKING",
      steps: [
        { t: cardWhole("p2workerScan"), title: "STOW SCAN TRACKING", text: "작업자의 진열 스캔 기록을 엑셀로 뽑습니다." },
        { t: inCard("p2workerScan", "input[placeholder*='쉼표']"), title: "작업자 ID", text: "여러 명은 쉼표나 띄어쓰기로 구분합니다." },
        { t: inCard("p2workerScan", "input[type=date]"), title: "작업일", text: "조회할 날짜입니다." },
        { t: inCard("p2workerScan", "button", "계정 저장"), title: "계정 저장", text: "Presto 개인 AD 계정입니다. 입고내역 RWA와 같이 씁니다." },
        { t: inCard("p2workerScan", "button", "조회 후 Excel 저장"), title: "조회 후 Excel 저장", text: "조회해서 엑셀로 저장합니다." },
      ],
    },
    p2rcrt: {
      name: "RCRT QR 출력",
      steps: [
        { t: cardWhole("p2rcrt"), title: "RCRT QR 출력", text: "RCRT 로케이션 QR 라벨을 PDF로 만듭니다." },
        { t: function () { var c = card("p2rcrt"); return c ? qa("select", c).filter(isVis)[0] : null; }, title: "종류", text: "냉장 오전/오후 · 상온 · 냉동 · 프로젝트 · RCRT18 · RCRT88 중에서 고릅니다." },
        { t: function () { var c = card("p2rcrt"); return c ? qa("select, input", c).filter(isVis).slice(1) : null; }, title: "매수", text: "몇 장 뽑을지 고르거나 「직접」으로 입력합니다. 아래에 번호 범위가 미리 보입니다." },
        { t: inCard("p2rcrt", "button", "PDF 저장"), title: "PDF 저장", text: "Downloads 폴더에 PDF로 저장합니다." },
      ],
    },
    p2bipyo: {
      name: "수박비표 출력",
      steps: [
        { t: cardWhole("p2bipyo"), title: "수박비표 출력", text: "수박 비표(라벨)를 PDF로 만듭니다." },
        { t: function () { var c = card("p2bipyo"); return c ? qa("input.yna4-pane-inp", c).filter(isVis) : null; }, title: "라벨 내용", text: "라벨에 찍힐 문구 · 무게 · 전화 · 번호 등을 채웁니다." },
        { t: inCard("p2bipyo", ".yna4-bipyo-check"), title: "gomgom", text: "체크하면 gomgom 로고를 넣습니다." },
        { t: inCard("p2bipyo", "button", "PDF 저장"), title: "PDF 저장", text: "Downloads 폴더에 PDF로 저장합니다." },
      ],
    },
    /* 테스트 중 카드(IB 오류처리 · Tote-Move RCRT88 · Location CONSOL)는 튜토리얼 없음 */
    barcode128: {
      name: "바코드 생성",
      steps: [
        { t: cardWhole("barcode128"), title: "바코드 생성", text: "아무 값이나 Code 128 바코드로 띄워 스캔할 수 있게 합니다." },
        { t: all(inCard("barcode128", "input"), inCard("barcode128", "button", "보기")), title: "값 넣고 「보기」", text: "값을 넣고 「보기」를 누르면 바코드가 나옵니다." },
      ],
    },
  };

  function cardTourSteps(id) {
    var spec = CARD_TOURS[id];
    if (!spec) return null;
    return spec.steps.slice();
  }

  function pageCardsTour(pageKey) {
    var p = pageEl(pageKey);
    var steps = [
      {
        t: function () {
          return q(".yna4-pane-card .yna4-tut-card-btn", pageEl(pageKey));
        },
        title: pageKey + "페이지 카드",
        text:
          "카드마다 하는 일이 다릅니다. 카드 오른쪽 위 <b>개구리 버튼</b>을 누르면 그 카드만 자세히 안내합니다.<br>이어서 카드를 하나씩 짚어 봅니다.",
      },
    ];
    qa(".yna4-pane-card[data-pane]", p).forEach(function (c) {
      var id = c.getAttribute("data-pane");
      var spec = CARD_TOURS[id];
      if (!spec || !isVis(c)) return;
      var first = spec.steps[0];
      steps.push({ t: cardWhole(id), title: spec.name, text: first.text });
    });
    return steps;
  }

  tour("p1", "1페이지 카드", "1", null, true);
  tour("p2", "2페이지 카드", "2", null, true);

  tour(
    "p3",
    "3페이지",
    "3",
    [
      {
        title: "3페이지 · 토트 바코드 화면",
        text: "GC바코드 하나로 상품과 그 상품이 담긴 토트 바코드를 크게 띄웁니다. 스캐너로 바로 찍을 수 있습니다.",
      },
      { t: inPage("3", ".yna4-page3-toolbar"), title: "GC바코드 · 조회", text: "GC바코드를 넣고 「조회」를 누릅니다. 「중지」로 멈춥니다." },
      { t: inPage("3", ".yna4-page3-name-head"), title: "상품명 · 총 유닛", text: "조회한 상품 이름과 총 유닛 수입니다." },
      {
        t: function () {
          return qa(".yna4-page3-col", pageEl("3")).filter(isVis)[0] || null;
        },
        title: "토트바코드",
        text: "상품이 담긴 토트 바코드입니다. 키보드 <b>Q</b> 이전 · <b>E</b> 다음으로 넘깁니다. 아래 숫자는 몇 번째 토트인지입니다.",
      },
      {
        t: function () {
          return qa(".yna4-page3-col", pageEl("3")).filter(isVis)[1] || null;
        },
        title: "상품바코드",
        text: "상품 바코드입니다.",
      },
      { t: inPage("3", ".yna4-page3-qty-notice"), title: "실물수량확인!", text: "진열 전에 실물 수량을 꼭 확인합니다." },
    ],
    true
  );

  tour(
    "p4",
    "4페이지",
    "4",
    [
      {
        t: inPage("4", ".yna4-stow-error-toolbar"),
        title: "4페이지 · STOW Error Tracking (월별)",
        text: "월을 고르고 「조회」를 누릅니다. WMS는 최대 한 달씩 조회합니다.",
      },
      {
        t: function () {
          return q(".yna4-stow-error-summary", pageEl("4")) || q(".yna4-stow-error-body", pageEl("4"));
        },
        title: "결과",
        text:
          "문제보고일시 기준으로 OVERAGE / SHORTAGE만 집계합니다.<br>O+S 합 3건 미만 · 지정 관리자는 숨기고, OVERAGE 전산수량 0은 빼고 셉니다. 오류가 가장 많은 시간대로 조를 정합니다.",
      },
    ],
    true
  );

  /* ───────── 스타일 ───────── */
  function injectCss() {
    if (document.getElementById("yna4-tut-css")) return;
    var s = document.createElement("style");
    s.id = "yna4-tut-css";
    s.textContent = [
      "#banner .login-group button#yna4TutorialBtn,#yna4TutorialBtn{background:#4ade80;color:#0f172a;min-width:0;width:auto;height:auto;padding:4px 8px;border:0;font-size:12px;font-weight:800;line-height:1.2;letter-spacing:0;display:inline-flex;align-items:center;gap:4px;}",
      "#banner .login-group button#yna4TutorialBtn:hover{background:#22c55e;}",
      "#yna4TutorialBtn img{width:16px;height:16px;border-radius:50%;background:#fff;display:block;}",
      ".yna4-tut-menu{position:fixed;z-index:" + Z + ";background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 12px 32px rgba(15,23,42,.28);padding:6px;min-width:190px;font-family:inherit;}",
      ".yna4-tut-menu-h{font-size:11px;color:#64748b;padding:4px 8px 6px;font-weight:700;}",
      ".yna4-tut-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:7px 10px;font-size:13px;font-weight:700;color:#0f172a;border-radius:6px;cursor:pointer;font-family:inherit;}",
      ".yna4-tut-menu button:hover{background:#eff6ff;color:#1d4ed8;}",
      ".yna4-tut-card-btn{margin-left:auto;flex:0 0 auto;width:24px;height:24px;padding:0;border:1px solid #93c5fd;border-radius:50%;background:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;}",
      ".yna4-tut-card-btn:hover{border-color:#16a34a;box-shadow:0 0 0 2px rgba(22,163,74,.25);}",
      ".yna4-tut-card-btn img{width:22px;height:22px;display:block;}",
      ".yna4-tut-root{position:fixed;inset:0;z-index:" + Z + ";font-family:inherit;}",
      ".yna4-tut-root.is-dim{background:rgba(15,23,42,.6);}",
      ".yna4-tut-root.is-act{pointer-events:none;}",
      ".yna4-tut-blk{position:fixed;left:0;top:0;width:0;height:0;pointer-events:auto;}",
      ".yna4-tut-root.is-act .yna4-tut-bubble{pointer-events:auto;}",
      ".yna4-tut-root.is-act .yna4-tut-spot{border-color:#22c55e;animation:yna4TutPulse 1.2s ease-in-out infinite;}",
      "@keyframes yna4TutPulse{0%,100%{outline:0 solid rgba(34,197,94,.6);}50%{outline:6px solid rgba(34,197,94,.35);}}",
      ".yna4-tut-badge{position:fixed;top:42px;left:50%;transform:translateX(-50%);background:#fef3c7;border:2px solid #f59e0b;color:#78350f;font-weight:800;font-size:12px;padding:5px 14px;border-radius:999px;pointer-events:none;white-space:nowrap;box-shadow:0 6px 16px rgba(0,0,0,.25);}",
      ".yna4-tut-note--act{color:#15803d !important;font-weight:800;font-size:13px !important;}",
      ".yna4-tut-spot{position:fixed;border:3px solid #fbbf24;border-radius:8px;box-shadow:0 0 0 9999px rgba(15,23,42,.6);pointer-events:none;transition:all .2s ease;}",
      ".yna4-tut-bubble{position:fixed;display:flex;gap:12px;align-items:flex-start;background:#fff;border-radius:14px;border:2px solid #1d4ed8;box-shadow:0 16px 40px rgba(15,23,42,.35);padding:12px 14px 10px 10px;box-sizing:border-box;color:#0f172a;}",
      ".yna4-tut-frog{width:76px;height:76px;flex:0 0 auto;border-radius:50%;background:#e0f2fe;border:2px solid #bfdbfe;}",
      ".yna4-tut-main{flex:1 1 auto;min-width:0;}",
      ".yna4-tut-title{font-size:14px;font-weight:800;color:#1e3a8a;margin:2px 0 4px;}",
      ".yna4-tut-text{font-size:13px;line-height:1.55;color:#1e293b;word-break:keep-all;}",
      ".yna4-tut-text b{color:#b91c1c;}",
      ".yna4-tut-note{margin-top:6px;font-size:12px;color:#64748b;}",
      ".yna4-tut-foot{display:flex;align-items:center;gap:6px;margin-top:10px;}",
      ".yna4-tut-count{font-size:12px;color:#64748b;font-weight:700;margin-right:auto;}",
      ".yna4-tut-foot button{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:7px;padding:5px 11px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;}",
      ".yna4-tut-foot button:hover{background:#f1f5f9;}",
      ".yna4-tut-foot button.yna4-tut-next{background:#1d4ed8;border-color:#1d4ed8;color:#fff;}",
      ".yna4-tut-foot button.yna4-tut-next:hover{background:#1e40af;}",
      ".yna4-tut-foot button:disabled{opacity:.4;cursor:default;}",
    ].join("");
    (document.head || document.documentElement).appendChild(s);
  }

  /* ───────── 실행기 ───────── */
  var cur = null; /* { steps, i, root, spot, bubble } */

  function resolveTargets(step) {
    if (!step.t) return [];
    var r;
    try {
      r = typeof step.t === "function" ? step.t() : q(step.t);
    } catch (e) {
      r = null;
    }
    if (!r) return [];
    if (!Array.isArray(r)) r = [r];
    return r.filter(isVis);
  }

  function unionRect(els) {
    var L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
    els.forEach(function (el) {
      var r = el.getBoundingClientRect();
      L = Math.min(L, r.left);
      T = Math.min(T, r.top);
      R = Math.max(R, r.right);
      B = Math.max(B, r.bottom);
    });
    return { left: L, top: T, right: R, bottom: B };
  }

  /* ───────── 예시 모드 (조회 결과가 없을 때 가명 처리한 실제 결과로 화면을 그림) ───────── */
  var SAMPLE_SRC = "./vendor/yan4-tutorial-sample.js";
  var samplePromise = null;
  function loadSample() {
    if (window.__YAN4_TUTORIAL_SAMPLE__) return Promise.resolve(window.__YAN4_TUTORIAL_SAMPLE__);
    if (samplePromise) return samplePromise;
    samplePromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = SAMPLE_SRC;
      s.onload = function () {
        if (window.__YAN4_TUTORIAL_SAMPLE__) resolve(window.__YAN4_TUTORIAL_SAMPLE__);
        else reject(new Error("예시 데이터 없음"));
      };
      s.onerror = function () {
        samplePromise = null;
        reject(new Error("예시 데이터 파일을 못 읽음"));
      };
      document.head.appendChild(s);
    });
    return samplePromise;
  }

  /** serializeGraph 결과를 원래 객체로 (Date · Map · Set · 공유 참조 복원) */
  function decodeGraph(root) {
    var byId = {};
    function dec(v) {
      if (v === null || typeof v !== "object") return v;
      if (Array.isArray(v)) return v.map(dec);
      if (Object.prototype.hasOwnProperty.call(v, "__ref")) return byId[v.__ref];
      if (Object.prototype.hasOwnProperty.call(v, "__date")) return v.__date ? new Date(v.__date) : new Date(NaN);
      if (Object.prototype.hasOwnProperty.call(v, "__num")) return Number(v.__num);
      if (Object.prototype.hasOwnProperty.call(v, "__skip")) return null;
      var out;
      if (v.__map) {
        out = new Map();
        if (v.__id) byId[v.__id] = out;
        v.__map.forEach(function (kv) {
          out.set(dec(kv[0]), dec(kv[1]));
        });
        return out;
      }
      if (v.__set) {
        out = new Set();
        if (v.__id) byId[v.__id] = out;
        v.__set.forEach(function (x) {
          out.add(dec(x));
        });
        return out;
      }
      if (v.__arr) {
        out = [];
        if (v.__id) byId[v.__id] = out;
        v.__arr.forEach(function (x) {
          out.push(dec(x));
        });
        return out;
      }
      out = {};
      if (v.__id) byId[v.__id] = out;
      Object.keys(v).forEach(function (k) {
        if (k === "__id") return;
        out[k] = dec(v[k]);
      });
      return out;
    }
    return dec(root);
  }

  function demoApi(kind) {
    return kind === "sla" ? window.__YAN4_SLA_TUTORIAL__ : kind === "ats" ? window.__YAN4_ATS_TUTORIAL__ : null;
  }
  function fmtSampleTime(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    var p2 = function (n) {
      return (n < 10 ? "0" : "") + n;
    };
    return d.getMonth() + 1 + "/" + d.getDate() + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
  }

  /** 실제 결과가 있으면 그대로(false), 없으면 예시 데이터로 그림(라벨 문자열) */
  function ensureDemo(kind, cb) {
    var api = demoApi(kind);
    if (!api || !api.replay) return cb(null);
    try {
      if (api.hasResult && api.hasResult()) return cb(null);
      if (api.isBusy && api.isBusy()) return cb(null);
    } catch (e) {}
    loadSample().then(
      function (sample) {
        var data;
        try {
          data = decodeGraph(sample[kind]);
        } catch (eD) {
          return cb(null);
        }
        if (!data) return cb(null);
        var when = fmtSampleTime(data.capturedAt);
        var label = "예시 데이터" + (when ? " (" + when + " 기준)" : "");
        window.__YAN4_TUTORIAL_DEMO__ = true;
        var ok = false;
        try {
          ok = api.replay(data, label);
        } catch (eR) {
          if (typeof console !== "undefined" && console.warn) console.warn("[YAN4 tutorial] replay", eR);
        }
        if (!ok) {
          window.__YAN4_TUTORIAL_DEMO__ = false;
          return cb(null);
        }
        cb(label);
      },
      function () {
        cb(null);
      }
    );
  }
  function endDemo(kind) {
    var api = demoApi(kind);
    try {
      if (api && api.restore) api.restore();
    } catch (e) {}
    window.__YAN4_TUTORIAL_DEMO__ = false;
  }

  function close() {
    if (!cur) return;
    try {
      cur.root.remove();
    } catch (e) {}
    if (cur.actTimer) clearInterval(cur.actTimer);
    if (cur.demo) endDemo(cur.demo);
    if (cur.slaTab0) selectSlaTab(cur.slaTab0);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onResize, true);
    cur = null;
  }

  function onKey(ev) {
    if (!cur) return;
    var k = ev.key;
    if (k === "Escape") close();
    else if (k === "ArrowRight" || k === "Enter") go(cur.i + 1);
    else if (k === "ArrowLeft") go(cur.i - 1);
    else return;
    ev.preventDefault();
    ev.stopPropagation();
  }
  function onResize() {
    if (cur) place();
  }

  function go(i) {
    if (!cur) return;
    if (i >= cur.steps.length) return close();
    if (i < 0) return;
    cur.i = i;
    render();
  }

  function render() {
    var step = cur.steps[cur.i];
    if (typeof step.before === "function" && cur.beforeAt !== cur.i) {
      cur.beforeAt = cur.i;
      try {
        step.before();
      } catch (eBefore) {}
    }
    if (step.tab && selectSlaTab(step.tab)) {
      var me = cur;
      setTimeout(function () {
        if (cur === me) render();
      }, 150);
      return;
    }
    var els = resolveTargets(step);
    cur.els = els;
    if (els.length) {
      var r0 = unionRect(els);
      /* 직접 해 보기 칸은 항상 가운데로 (고정 머리글 밑에 숨으면 클릭이 머리글에 맞음) */
      if (step.act || r0.top < 40 || r0.bottom > window.innerHeight - 10) {
        try {
          els[0].scrollIntoView({ block: "center", inline: "nearest" });
        } catch (e) {}
      }
    }
    var b = cur.bubble;
    b.querySelector(".yna4-tut-title").textContent = step.title || "";
    b.querySelector(".yna4-tut-text").innerHTML = step.text || "";
    var note = b.querySelector(".yna4-tut-note");
    var missing = !!step.t && !els.length;
    var acting = !!(step.act && els.length);
    note.className = "yna4-tut-note" + (acting ? " yna4-tut-note--act" : "");
    note.textContent = missing
      ? step.missing || NO_TARGET_NOTE
      : acting
        ? "👉 " + step.act
        : cur.demo && step.demoNote
          ? step.demoNote
          : "";
    note.style.display = note.textContent ? "" : "none";
    var snap0 = null;
    if (acting && typeof step.snap === "function") {
      try {
        snap0 = step.snap();
      } catch (eSnap) {}
    }
    /* 직접 해 보기: 강조 칸만 눌리게 하고, 끝나면 다음 단계로 */
    if (cur.actTimer) {
      clearInterval(cur.actTimer);
      cur.actTimer = null;
    }
    cur.root.classList.toggle("is-act", acting);
    if (acting && typeof step.done === "function") {
      var meAct = cur, iAct = cur.i;
      cur.actTimer = setInterval(function () {
        if (cur !== meAct || cur.i !== iAct) return;
        var ok = false;
        try {
          ok = !!step.done(snap0);
        } catch (eDone) {}
        if (!ok) return;
        clearInterval(cur.actTimer);
        cur.actTimer = null;
        note.textContent = "✓ 잘했습니다!";
        setTimeout(function () {
          if (cur === meAct && cur.i === iAct) go(iAct + 1);
        }, 900);
      }, 250);
    }
    b.querySelector(".yna4-tut-count").textContent = cur.i + 1 + " / " + cur.steps.length;
    b.querySelector(".yna4-tut-prev").disabled = cur.i === 0;
    var last = cur.i === cur.steps.length - 1;
    b.querySelector(".yna4-tut-next").textContent = last ? "완료" : "다음 ▶";
    b.querySelector(".yna4-tut-skip").style.visibility = last ? "hidden" : "visible";
    place();
    try {
      b.querySelector(".yna4-tut-next").focus({ preventScroll: true });
    } catch (e) {}
  }

  function place() {
    var vw = window.innerWidth, vh = window.innerHeight, M = 12, GAP = 14, PAD = 6;
    var b = cur.bubble, spot = cur.spot, els = cur.els || [];
    var w = Math.min(420, vw - 2 * M);
    b.style.width = w + "px";
    if (!els.length) {
      spot.style.display = "none";
      cur.root.classList.add("is-dim");
      var h0 = b.offsetHeight;
      b.style.left = Math.round((vw - w) / 2) + "px";
      b.style.top = Math.round(Math.max(M, (vh - h0) / 2)) + "px";
      return;
    }
    cur.root.classList.remove("is-dim");
    var r = unionRect(els);
    var s = {
      left: Math.max(2, r.left - PAD),
      top: Math.max(2, r.top - PAD),
      right: Math.min(vw - 2, r.right + PAD),
      bottom: Math.min(vh - 2, r.bottom + PAD),
    };
    spot.style.display = "";
    spot.style.left = s.left + "px";
    spot.style.top = s.top + "px";
    spot.style.width = Math.max(0, s.right - s.left) + "px";
    spot.style.height = Math.max(0, s.bottom - s.top) + "px";
    /* 직접 해 보기 단계: 강조 칸 밖 네 면만 막음 */
    var bl = cur.blockers;
    var rects = [
      [0, 0, vw, s.top],
      [0, s.bottom, vw, vh - s.bottom],
      [0, s.top, s.left, s.bottom - s.top],
      [s.right, s.top, vw - s.right, s.bottom - s.top],
    ];
    for (var bi = 0; bi < 4; bi++) {
      bl[bi].style.left = rects[bi][0] + "px";
      bl[bi].style.top = rects[bi][1] + "px";
      bl[bi].style.width = Math.max(0, rects[bi][2]) + "px";
      bl[bi].style.height = Math.max(0, rects[bi][3]) + "px";
    }
    var h = b.offsetHeight;
    var clampX = function (x) {
      return Math.max(M, Math.min(vw - w - M, x));
    };
    var clampY = function (y) {
      return Math.max(M, Math.min(vh - h - M, y));
    };
    var x, y;
    if (s.bottom + GAP + h <= vh - M) {
      y = s.bottom + GAP;
      x = clampX(s.left);
    } else if (s.top - GAP - h >= M) {
      y = s.top - GAP - h;
      x = clampX(s.left);
    } else if (s.right + GAP + w <= vw - M) {
      x = s.right + GAP;
      y = clampY(s.top);
    } else if (s.left - GAP - w >= M) {
      x = s.left - GAP - w;
      y = clampY(s.top);
    } else {
      /* 대상이 화면 대부분을 덮음 → 오른쪽 아래 구석 */
      x = vw - w - M - 8;
      y = vh - h - M - 8;
    }
    b.style.left = Math.round(x) + "px";
    b.style.top = Math.round(y) + "px";
  }

  function start(steps, opts) {
    opts = opts || {};
    close();
    closeMenu();
    steps = (steps || []).filter(function (s) {
      try {
        return !s.when || s.when();
      } catch (e) {
        return false;
      }
    });
    if (!steps.length) return;
    injectCss();
    var root = document.createElement("div");
    root.className = "yna4-tut-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "튜토리얼");
    var spot = document.createElement("div");
    spot.className = "yna4-tut-spot";
    var b = document.createElement("div");
    b.className = "yna4-tut-bubble";
    b.innerHTML =
      '<img class="yna4-tut-frog" alt="" src="' + FROG_SRC + '">' +
      '<div class="yna4-tut-main"><div class="yna4-tut-title"></div><div class="yna4-tut-text"></div>' +
      '<div class="yna4-tut-note"></div>' +
      '<div class="yna4-tut-foot"><span class="yna4-tut-count"></span>' +
      '<button type="button" class="yna4-tut-skip">건너뛰기</button>' +
      '<button type="button" class="yna4-tut-prev">이전</button>' +
      '<button type="button" class="yna4-tut-next">다음 ▶</button></div></div>';
    root.appendChild(spot);
    var blockers = [];
    for (var bk = 0; bk < 4; bk++) {
      var blk = document.createElement("div");
      blk.className = "yna4-tut-blk";
      root.appendChild(blk);
      blockers.push(blk);
    }
    if (opts.demoLabel) {
      var badge = document.createElement("div");
      badge.className = "yna4-tut-badge";
      badge.textContent = "🐸 " + opts.demoLabel + " — 튜토리얼이 끝나면 원래 화면으로 돌아갑니다";
      root.appendChild(badge);
    }
    root.appendChild(b);
    /* 강조 영역 밖 클릭은 막기만 함 (실수로 조회 버튼 누르지 않게) */
    root.addEventListener("mousedown", function (ev) {
      if (!b.contains(ev.target)) ev.preventDefault();
    });
    b.querySelector(".yna4-tut-skip").addEventListener("click", close);
    b.querySelector(".yna4-tut-prev").addEventListener("click", function () {
      go(cur.i - 1);
    });
    b.querySelector(".yna4-tut-next").addEventListener("click", function () {
      go(cur.i + 1);
    });
    document.body.appendChild(root);
    cur = {
      steps: steps,
      i: 0,
      root: root,
      spot: spot,
      bubble: b,
      blockers: blockers,
      els: [],
      slaTab0: opts.slaTab0 != null ? opts.slaTab0 : activeSlaTab(),
      demo: opts.demo || null,
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize, true);
    render();
  }

  function startTour(id) {
    var t = TOURS[id];
    if (!t) return;
    closeMenu();
    gotoPage(t.page, function () {
      var steps = t.steps;
      if (id === "p1") steps = pageCardsTour("1");
      if (id === "p2") steps = pageCardsTour("2");
      if (id !== "sla" && id !== "ats") return start(steps);
      var tab0 = activeSlaTab();
      ensureDemo(id, function (demoLabel) {
        start(steps, { demo: demoLabel ? id : null, demoLabel: demoLabel, slaTab0: tab0 });
      });
    });
  }

  function startCard(id) {
    start(cardTourSteps(id));
  }

  /* ───────── 상단 버튼 · 메뉴 ───────── */
  var menuEl = null;
  function closeMenu() {
    if (menuEl) {
      try {
        menuEl.remove();
      } catch (e) {}
      menuEl = null;
      document.removeEventListener("mousedown", onDocDown, true);
    }
  }
  function onDocDown(ev) {
    if (!menuEl) return;
    var btn = document.getElementById("yna4TutorialBtn");
    if (menuEl.contains(ev.target) || (btn && btn.contains(ev.target))) return;
    closeMenu();
  }
  function navVisible(page) {
    if (!page) return true;
    var b = navBtn(page);
    return !!(b && isVis(b));
  }
  function openMenu(anchor) {
    if (menuEl) return closeMenu();
    injectCss();
    menuEl = document.createElement("div");
    menuEl.className = "yna4-tut-menu";
    var h = document.createElement("div");
    h.className = "yna4-tut-menu-h";
    h.textContent = "어떤 화면을 안내할까요?";
    menuEl.appendChild(h);
    MENU.forEach(function (id) {
      var t = TOURS[id];
      if (!navVisible(t.page)) return;
      var it = document.createElement("button");
      it.type = "button";
      it.textContent = t.name;
      it.setAttribute("data-tour", id);
      it.addEventListener("click", function () {
        startTour(id);
      });
      menuEl.appendChild(it);
    });
    document.body.appendChild(menuEl);
    var r = anchor.getBoundingClientRect();
    var mw = menuEl.offsetWidth;
    menuEl.style.top = Math.round(r.bottom + 6) + "px";
    menuEl.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw))) + "px";
    document.addEventListener("mousedown", onDocDown, true);
  }

  function ensureTopButton() {
    if (document.getElementById("yna4TutorialBtn")) return;
    var sop = document.getElementById("btnOpenSop");
    var host = sop ? sop.parentNode : document.querySelector("#banner .login-group");
    if (!host) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "yna4TutorialBtn";
    btn.title = "튜토리얼 (화면 사용법 안내)";
    btn.innerHTML = '<img alt="" src="' + FROG_SRC + '"><span>튜토리얼</span>';
    btn.addEventListener("click", function () {
      openMenu(btn);
    });
    if (sop && sop.nextSibling) host.insertBefore(btn, sop.nextSibling);
    else host.appendChild(btn);
  }

  function ensureCardButtons() {
    qa(".yna4-pane-card[data-pane]").forEach(function (c) {
      var id = c.getAttribute("data-pane");
      if (!CARD_TOURS[id]) return;
      var hdr = c.querySelector(".yna4-pane-card-hdr");
      if (!hdr || hdr.querySelector(".yna4-tut-card-btn")) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "yna4-tut-card-btn";
      b.title = CARD_TOURS[id].name + " 튜토리얼";
      b.setAttribute("aria-label", CARD_TOURS[id].name + " 튜토리얼");
      b.innerHTML = '<img alt="" src="' + FROG_SRC + '">';
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        startCard(id);
      });
      hdr.appendChild(b);
    });
  }

  /* ───────── 예시 데이터 추출 (숨김: Ctrl+Alt+Shift+T) ─────────
   * 「SLA 전체」 · ATS 「조회실행」 결과를 JSON 한 파일로 Downloads에 저장.
   * 튜토리얼 예시 데이터를 만들 원본 — 개발자가 가명 처리해서 씀. */
  function serializeGraph(root) {
    var seen = new Map();
    var nid = 0;
    function enc(v) {
      if (v === null) return null;
      var t = typeof v;
      if (t === "function" || t === "symbol" || t === "undefined") return undefined;
      if (t === "number") return isFinite(v) ? v : { __num: String(v) };
      if (t !== "object") return v;
      if (v instanceof Date) return { __date: isNaN(v.getTime()) ? null : v.toISOString() };
      if (typeof Node !== "undefined" && v instanceof Node) return undefined;
      if (typeof Window !== "undefined" && v instanceof Window) return undefined;
      if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return { __skip: "binary" };
      if (seen.has(v)) return { __ref: seen.get(v) };
      var id = ++nid;
      seen.set(v, id);
      if (v instanceof Map) {
        var mo = [];
        v.forEach(function (x, k) {
          mo.push([enc(k), enc(x)]);
        });
        return { __id: id, __map: mo };
      }
      if (v instanceof Set) {
        var so = [];
        v.forEach(function (x) {
          so.push(enc(x));
        });
        return { __id: id, __set: so };
      }
      if (Array.isArray(v)) {
        return {
          __id: id,
          __arr: v.map(function (x) {
            var e = enc(x);
            return e === undefined ? null : e;
          }),
        };
      }
      var o = { __id: id };
      Object.keys(v).forEach(function (k) {
        var e = enc(v[k]);
        if (e !== undefined) o[k] = e;
      });
      return o;
    }
    return enc(root);
  }

  function exportSampleData() {
    var sla = null, ats = null;
    try {
      sla = window.__YAN4_SLA_TUTORIAL__ && window.__YAN4_SLA_TUTORIAL__.capture();
    } catch (e) {}
    try {
      ats = window.__YAN4_ATS_TUTORIAL__ && window.__YAN4_ATS_TUTORIAL__.capture();
    } catch (e) {}
    var hasAts = !!(ats && ats.rows && ats.rows.length);
    if (!sla && !hasAts) {
      alert("[예시 데이터 추출]\n아직 결과가 없습니다.\n「SLA 전체」와 ATS 「조회실행」을 먼저 끝낸 뒤 다시 눌러 주세요.");
      return;
    }
    var d = new Date();
    var p2 = function (n) {
      return (n < 10 ? "0" : "") + n;
    };
    var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + "_" + p2(d.getHours()) + p2(d.getMinutes());
    var json;
    try {
      json = JSON.stringify({
        kind: "yan4-tutorial-sample-raw",
        v: 1,
        app: document.title,
        exportedAt: d.toISOString(),
        sla: serializeGraph(sla),
        ats: serializeGraph(ats),
      });
    } catch (eJ) {
      alert("[예시 데이터 추출] 실패: " + (eJ && eJ.message ? eJ.message : eJ));
      return;
    }
    var name = "CFS_IB_LIVE_tutorial_raw_" + stamp + ".json";
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 4000);
    var info =
      "SLA: " + (sla ? "있음" : "없음 (「SLA 전체」 먼저)") +
      " · ATS: " + (hasAts ? ats.rows.length + "행" : "없음 (「조회실행」 먼저)") +
      " · 원본 " + Math.round(json.length / 1024).toLocaleString() + " KB";
    gzipBase64(json).then(
      function (b64) {
        showChunkDialog(name, info, b64);
      },
      function (eZ) {
        alert("[예시 데이터 추출] Downloads에 " + name + " 저장. (압축 실패: " + (eZ && eZ.message ? eZ.message : eZ) + ")\n" + info);
      }
    );
  }

  /** 문자열 → gzip → base64 (메일·드라이브 막혔을 때 구글 문서로 옮기려고) */
  function gzipBase64(text) {
    var cs = new CompressionStream("gzip");
    var stream = new Blob([text]).stream().pipeThrough(cs);
    return new Response(stream).arrayBuffer().then(function (buf) {
      var u8 = new Uint8Array(buf);
      var bin = "";
      for (var i = 0; i < u8.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      }
      return btoa(bin);
    });
  }

  var CHUNK_CHARS = 100000;
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return copyTextFallback(text);
      });
    }
    return Promise.resolve(copyTextFallback(text));
  }
  function copyTextFallback(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:0;";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (e) {}
    ta.remove();
  }

  function showChunkDialog(fileName, info, b64) {
    var n = Math.max(1, Math.ceil(b64.length / CHUNK_CHARS));
    var old = document.getElementById("yna4-tut-export");
    if (old) old.remove();
    var root = document.createElement("div");
    root.id = "yna4-tut-export";
    root.style.cssText =
      "position:fixed;inset:0;z-index:" + Z + ";background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;font-family:inherit;";
    var box = document.createElement("div");
    box.style.cssText =
      "background:#fff;border-radius:12px;padding:16px 18px;width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 40px);overflow:auto;box-shadow:0 16px 40px rgba(0,0,0,.35);color:#0f172a;";
    box.innerHTML =
      '<div style="font-size:15px;font-weight:800;color:#1e3a8a;margin-bottom:6px">예시 데이터 추출</div>' +
      '<div style="font-size:12px;color:#475569;line-height:1.6">' + info +
      "<br>Downloads에 <b>" + fileName + "</b> 저장함" +
      "<br>압축 " + b64.length.toLocaleString() + "자 → <b>" + n + "조각</b> (조각당 최대 " + CHUNK_CHARS.toLocaleString() + "자)" +
      '<br><br>조각 버튼을 누르면 클립보드에 복사됩니다. 구글 문서 하나에 조각 하나씩 붙여넣으세요.</div>' +
      '<div class="yna4-tut-chunks" style="display:flex;flex-wrap:wrap;gap:6px;margin:12px 0"></div>' +
      '<div style="text-align:right"><button type="button" class="yna4-tut-export-close" style="border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:6px 14px;font-weight:700;cursor:pointer">닫기</button></div>';
    var list = box.querySelector(".yna4-tut-chunks");
    for (var i = 0; i < n; i++) {
      (function (i) {
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("data-chunk", String(i + 1));
        b.textContent = "조각 " + (i + 1) + "/" + n + " 복사";
        b.style.cssText =
          "border:1px solid #1d4ed8;background:#eff6ff;color:#1d4ed8;border-radius:7px;padding:7px 12px;font-weight:800;cursor:pointer;font-size:12px;";
        b.addEventListener("click", function () {
          var part = b64.substr(i * CHUNK_CHARS, CHUNK_CHARS);
          copyText("YAN4TUT " + (i + 1) + "/" + n + "\n" + part).then(function () {
            b.textContent = "✓ 조각 " + (i + 1) + "/" + n + " 복사됨";
            b.style.background = "#dcfce7";
            b.style.borderColor = "#16a34a";
            b.style.color = "#166534";
          });
        });
        list.appendChild(b);
      })(i);
    }
    box.querySelector(".yna4-tut-export-close").addEventListener("click", function () {
      root.remove();
    });
    root.appendChild(box);
    document.body.appendChild(root);
  }

  window.addEventListener(
    "keydown",
    function (ev) {
      if (ev.ctrlKey && ev.altKey && ev.shiftKey && (ev.key === "T" || ev.key === "t" || ev.code === "KeyT")) {
        ev.preventDefault();
        ev.stopPropagation();
        exportSampleData();
      }
    },
    true
  );

  function boot() {
    injectCss();
    ensureTopButton();
    ensureCardButtons();
  }

  window.__YAN4_TUTORIAL__ = {
    start: startTour,
    startCard: startCard,
    close: close,
    exportSample: exportSampleData,
    serialize: serializeGraph,
    tours: TOURS,
    cards: CARD_TOURS,
    current: function () {
      return cur ? { i: cur.i, n: cur.steps.length, title: cur.steps[cur.i].title, hit: (cur.els || []).length } : null;
    },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  /* 셸이 카드를 늦게 그리거나 다시 그릴 때(잠금 해제 등) 버튼을 다시 붙임 */
  setInterval(function () {
    try {
      ensureTopButton();
      ensureCardButtons();
    } catch (e) {}
  }, 1500);
})();
