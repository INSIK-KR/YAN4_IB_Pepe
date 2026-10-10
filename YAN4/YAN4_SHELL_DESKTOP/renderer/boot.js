(function () {
  "use strict";

  if (typeof window.__YAN4_DESKTOP_PATCH_GM_XHR__ === "function") {
    window.__YAN4_DESKTOP_PATCH_GM_XHR__();
  }

  var statusEl = document.getElementById("sessStatus");
  var lastDetail = { coupang: 0, sharepoint: 0, po: 0, mos: 0 };
  var busyKind = "";
  /** 이번 실행에서 로그인 창을 닫아 확인된 서비스만 「로그인완료」 */
  var confirmedOk = { coupang: false, po: false, mos: false };

  var LOGIN_BTNS = [
    { id: "btnLoginCoupang", kind: "coupang", idle: "Coupang", detailKey: "coupang" },
    { id: "btnLoginPo", kind: "po", idle: "PO", detailKey: "po" },
    { id: "btnLoginMos", kind: "mos", idle: "MOS", detailKey: "mos" },
  ];

  function clearStatusBanner() {
    if (!statusEl) return;
    statusEl.className = "hint";
    statusEl.textContent = "";
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
            ? "inventory/inbound/outbound 세션"
            : spec.kind === "po"
              ? "PO Management 세션"
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
            : "";
    if (!key) return;
    var n = Number(lastDetail[key]) || 0;
    confirmedOk[key] = n > 0;
  }

  function bindLogin(spec) {
    var btn = document.getElementById(spec.id);
    if (!btn || !window.yan4ShellDesktop) return;
    btn.addEventListener("click", function () {
      busyKind = spec.kind;
      paintLoginButtons();
      btn.disabled = true;
      window.yan4ShellDesktop
        .openLogin(spec.kind)
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

  if (window.yan4ShellDesktop && typeof window.yan4ShellDesktop.onDownloadProgress === "function") {
    window.yan4ShellDesktop.onDownloadProgress(function (payload) {
      if (!statusEl || !payload || !payload.text) return;
      statusEl.className = "ok";
      statusEl.textContent = String(payload.text);
    });
  }
})();
