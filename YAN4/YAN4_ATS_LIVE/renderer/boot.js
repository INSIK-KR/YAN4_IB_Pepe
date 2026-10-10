(function () {
  "use strict";

  var statusEl = document.getElementById("sessStatus");
  var btnLogin = document.getElementById("btnLogin");
  var host = document.getElementById("host");

  function fmtTime(ms) {
    if (!ms) return "-";
    var d = new Date(ms);
    function p(n) {
      return (n < 10 ? "0" : "") + n;
    }
    return (
      p(d.getHours()) +
      ":" +
      p(d.getMinutes()) +
      ":" +
      p(d.getSeconds())
    );
  }

  function paintStatus(st) {
    if (!statusEl) return;
    if (st && st.cookieCount > 0) {
      statusEl.className = "ok";
      statusEl.textContent =
        "로그인됨 · 쿠키 " +
        st.cookieCount +
        " · " +
        fmtTime(st.sessionAt);
    } else {
      statusEl.className = "bad";
      statusEl.textContent = "로그인 필요";
    }
  }

  function bootAts() {
    if (!host) return;
    if (typeof window.__YAN4_INIT_SHELL_PAGE_ATS__ === "function") {
      window.__YAN4_INIT_SHELL_PAGE_ATS__(host);
    } else {
      host.textContent = "ATS 스크립트 로드 실패 (vendor/yan4-ats-page.js)";
    }
  }

  if (window.yan4AtsDesktop) {
    window.yan4AtsDesktop.sessionStatus().then(paintStatus).catch(function () {});
    window.yan4AtsDesktop.onSessionUpdated(function (payload) {
      paintStatus(payload);
    });
  }

  if (btnLogin && window.yan4AtsDesktop) {
    btnLogin.addEventListener("click", function () {
      btnLogin.disabled = true;
      window.yan4AtsDesktop
        .openLogin()
        .then(function () {
          return window.yan4AtsDesktop.sessionStatus();
        })
        .then(paintStatus)
        .catch(function () {})
        .then(function () {
          btnLogin.disabled = false;
        });
    });
  }

  bootAts();
})();
