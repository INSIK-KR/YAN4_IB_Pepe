(function () {
  "use strict";

  if (typeof window.__YAN4_DESKTOP_PATCH_GM_XHR__ === "function") {
    window.__YAN4_DESKTOP_PATCH_GM_XHR__();
  }

  var statusEl = document.getElementById("sessStatus");
  var lastDetail = { coupang: 0, sharepoint: 0, po: 0, mos: 0 };
  var busyKind = "";
  /** 이번 실행에서 로그인 창을 닫아 확인된 서비스만 「로그인완료」 */
  var confirmedOk = { coupang: false, po: false, mos: false, shipments: false };

  var LOGIN_BTNS = [
    { id: "btnLoginCoupang", kind: "coupang", idle: "WMS", detailKey: "coupang" },
    { id: "btnLoginPo", kind: "po", idle: "PO", detailKey: "po" },
    { id: "btnLoginMos", kind: "mos", idle: "MOS", detailKey: "mos" },
    { id: "btnLoginShipments", kind: "shipments", idle: "SHPT", detailKey: "shipments" },
  ];

  function clearStatusBanner() {
    if (!statusEl) return;
    statusEl.className = "hint";
    statusEl.textContent = "";
    statusEl.title = "";
  }

  function paintLoginButtons() {
    var i, spec, btn, isBusy, isOk;
    for (i = 0; i < LOGIN_BTNS.length; i++) {
      spec = LOGIN_BTNS[i];
      btn = document.getElementById(spec.id);
      if (!btn) continue;
      isBusy = busyKind === spec.kind;
      isOk = !isBusy && !!confirmedOk[spec.kind];
      btn.classList.toggle("is-busy", isBusy);
      btn.classList.toggle("is-ok", isOk);
      if (isBusy) {
        btn.textContent = "로그인중";
        btn.title = spec.idle + " 로그인 진행 중";
      } else if (isOk) {
        btn.textContent = "로그인완료";
        btn.title = spec.idle + " 로그인 완료 · 다시 누르면 재로그인";
      } else {
        btn.textContent = spec.idle;
        btn.title =
          spec.kind === "coupang"
            ? "WMS · inventory/inbound/outbound 세션"
            : spec.kind === "po"
              ? "PO Management 세션"
              : spec.kind === "shipments"
                ? "SHPT · 쉽먼트 입차예약시간"
                : "MOS · Gross HTP / Need help";
      }
    }
  }

  function paintStatus(st) {
    if (st && st.detail) lastDetail = st.detail;
    paintLoginButtons();
    /* 쿠키 수(C/SP/PO/MOS) 배너는 표시하지 않음 — SLA 다운로드 진행만 statusEl 사용 */
    if (statusEl && !/^Chrome/.test(String(statusEl.textContent || ""))) {
      clearStatusBanner();
    }
  }

  function markConfirmedFromDetail(kind) {
    if (!kind || !Object.prototype.hasOwnProperty.call(confirmedOk, kind)) {
      return;
    }
    var key =
      kind === "coupang"
        ? "coupang"
        : kind === "po"
          ? "po"
          : kind === "mos"
            ? "mos"
            : kind === "shipments"
              ? "shipments"
              : "";
    if (!key) return;
    var n = Number(lastDetail[key]) || 0;
    confirmedOk[key] = n > 0;
  }

  /** 상단에서 고른 센터. 쉽먼트 로그인 확인에 쓴다 */
  function activeCenterName() {
    try {
      var api = window.__CFS_CENTER__;
      return api ? api.name(api.activeId()) : "";
    } catch (e) {
      return "";
    }
  }

  function bindLogin(spec) {
    var btn = document.getElementById(spec.id);
    if (!btn || !window.yan4ShellDesktop) return;
    btn.addEventListener("click", function () {
      busyKind = spec.kind;
      paintLoginButtons();
      btn.disabled = true;
      window.yan4ShellDesktop
        .openLogin(spec.kind, activeCenterName())
        .then(function () {
          return window.yan4ShellDesktop.sessionStatus();
        })
        .then(paintStatus)
        .catch(function () {
          busyKind = "";
          paintLoginButtons();
        })
        .then(function () {
          btn.disabled = false;
        });
    });
  }

  clearStatusBanner();

  if (window.yan4ShellDesktop) {
    window.yan4ShellDesktop.sessionStatus().then(paintStatus).catch(function () {});
    window.yan4ShellDesktop.onSessionUpdated(paintStatus);
    if (typeof window.yan4ShellDesktop.onLoginClosed === "function") {
      window.yan4ShellDesktop.onLoginClosed(function (payload) {
        var kind = payload && payload.kind;
        if (kind && busyKind === kind) busyKind = "";
        else if (!kind) busyKind = "";
        window.yan4ShellDesktop
          .sessionStatus()
          .then(function (st) {
            if (st && st.detail) lastDetail = st.detail;
            if (kind) markConfirmedFromDetail(kind);
            paintStatus(st);
          })
          .catch(function () {
            paintLoginButtons();
          });
      });
    }
  }

  var bi;
  for (bi = 0; bi < LOGIN_BTNS.length; bi++) {
    bindLogin(LOGIN_BTNS[bi]);
  }

  (function bindSop() {
    var btn = document.getElementById("btnOpenSop");
    if (!btn || !window.yan4ShellDesktop) return;
    if (typeof window.yan4ShellDesktop.openSop !== "function") {
      btn.disabled = true;
      btn.title = "SOP는 데스크톱 앱에서만 열 수 있습니다";
      return;
    }

    var backdrop = document.createElement("div");
    backdrop.id = "sopSearchBackdrop";
    backdrop.innerHTML =
      '<div class="sop-search-card" role="dialog" aria-label="입고 매뉴얼 검색">' +
      '<div class="sop-search-title">입고 매뉴얼 검색</div>' +
      '<div class="sop-search-row">' +
      '<input type="search" id="sopSearchInput" placeholder="키워드 · 예: 하차, RCRT, 라벨" autocomplete="off" />' +
      '<button type="button" id="sopSearchGo" class="sop-search-go">검색</button>' +
      "</div>" +
      '<div class="sop-search-hint">검색하면 SOP 페이지가 열립니다</div>' +
      '<button type="button" id="sopSearchClose" class="sop-search-close">닫기</button>' +
      "</div>";
    document.body.appendChild(backdrop);

    var inp = document.getElementById("sopSearchInput");
    var go = document.getElementById("sopSearchGo");
    var closeBtn = document.getElementById("sopSearchClose");

    function hideSearch() {
      backdrop.classList.remove("is-open");
    }

    function showSearch() {
      backdrop.classList.add("is-open");
      if (inp) {
        inp.focus();
        inp.select();
      }
    }

    function runOpen() {
      var query = String((inp && inp.value) || "").trim();
      if (!query) {
        if (inp) inp.focus();
        return;
      }
      hideSearch();
      btn.disabled = true;
      window.yan4ShellDesktop
        .openSop({ query: query })
        .then(function (res) {
          if (res && res.ok === false) {
            alert(res.error || "SOP를 열 수 없습니다");
          }
        })
        .catch(function (e) {
          alert(e && e.message ? e.message : String(e));
        })
        .then(function () {
          btn.disabled = false;
        });
    }

    btn.addEventListener("click", function () {
      showSearch();
    });
    if (go) go.addEventListener("click", runOpen);
    if (closeBtn) closeBtn.addEventListener("click", hideSearch);
    if (inp) {
      inp.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          runOpen();
        } else if (ev.key === "Escape") {
          hideSearch();
        }
      });
    }
    backdrop.addEventListener("click", function (ev) {
      if (ev.target === backdrop) hideSearch();
    });
  })();

  (function initCenterSwitch() {
    var api = window.__CFS_CENTER__;
    var sel = document.getElementById("centerSelect");
    var btn = document.getElementById("btnCenterSwitch");
    var label = document.getElementById("centerStatus");
    if (!api || !sel || !btn || !label) return;

    function centerText(id) {
      return api.name(id) + " (" + id + ")";
    }

    function paintIdle(reason) {
      var id = api.activeId();
      label.className = "hint";
      label.textContent = "센터: 확인 안 됨";
      label.title =
        (reason ? reason + " · " : "") +
        (api.hasRecord()
          ? "앱 기준(마지막 확인/전환): " + centerText(id)
          : "WMS 로그인 후 클릭하면 다시 확인") +
        " · 클릭: 다시 확인";
      sel.value = id;
    }

    function paintVerified(id, title) {
      sel.value = id;
      label.className = "ok";
      label.textContent = "센터: " + centerText(id) + " ✓";
      label.title = (title || "서버 세션 기준 현재 센터") + " · 클릭: 다시 확인";
    }

    var detecting = false;
    function refreshCurrent() {
      if (detecting || typeof api.detect !== "function") return;
      detecting = true;
      label.className = "hint";
      label.textContent = "센터 확인 중…";
      api
        .detect()
        .then(function (id) {
          paintVerified(id);
        })
        .catch(function (e) {
          paintIdle(e && e.message ? e.message : String(e));
        })
        .then(function () {
          detecting = false;
        });
    }

    api.regions.forEach(function (region) {
      var group = document.createElement("optgroup");
      group.label = region[0];
      region[1].forEach(function (code) {
        var c = api.list.find(function (row) {
          return row[1] === code;
        });
        if (!c) return;
        var opt = document.createElement("option");
        opt.value = c[0];
        opt.textContent = c[1] + " (" + c[0] + ")";
        group.appendChild(opt);
      });
      sel.appendChild(group);
    });
    paintIdle();
    refreshCurrent();
    label.style.cursor = "pointer";
    label.addEventListener("click", refreshCurrent);
    if (window.yan4ShellDesktop && typeof window.yan4ShellDesktop.onLoginClosed === "function") {
      window.yan4ShellDesktop.onLoginClosed(function (p) {
        if (!p || p.kind === "coupang") refreshCurrent();
      });
    }

    btn.addEventListener("click", function () {
      var id = sel.value;
      if (!id) return;
      btn.disabled = true;
      sel.disabled = true;
      label.className = "hint";
      label.textContent = "센터: " + centerText(id) + " 전환 중…";
      api
        .switchTo(id)
        .then(function (r) {
          paintVerified(
            api.activeId(),
            r && r.verified
              ? "전환 후 서버 세션 확인 완료"
              : "전환 요청 성공 · 서버 재확인은 실패"
          );
        })
        .catch(function (e) {
          paintIdle();
          label.className = "bad";
          label.textContent =
            "전환 실패: " + (e && e.message ? e.message : String(e));
          label.title = "WMS 로그인 상태 확인 후 다시 시도";
        })
        .then(function () {
          btn.disabled = false;
          sel.disabled = false;
        });
    });
  })();

  if (window.yan4ShellDesktop && typeof window.yan4ShellDesktop.onDownloadProgress === "function") {
    window.yan4ShellDesktop.onDownloadProgress(function (payload) {
      if (!statusEl || !payload || !payload.text) return;
      statusEl.className = "ok";
      statusEl.textContent = String(payload.text);
      statusEl.title = String(payload.detail || payload.text);
    });
  }
})();
