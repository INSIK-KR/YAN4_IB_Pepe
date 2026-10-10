/**
 * Electron 렌더러 — chrome.runtime / GM_xmlhttpRequest 를 desktop IPC 로 대체
 */
(function () {
  "use strict";

  function desktopFetch(message) {
    if (!window.yan4AtsDesktop || typeof window.yan4AtsDesktop.fetch !== "function") {
      return Promise.reject(new Error("yan4AtsDesktop bridge 없음"));
    }
    return window.yan4AtsDesktop.fetch(message);
  }

  window.GM_xmlhttpRequest = function (details) {
    if (!details || !details.url) return;
    var method = String(details.method || "GET").toUpperCase();
    var headers = details.headers || {};
    desktopFetch({
      type: "yan4DesktopFetch",
      url: details.url,
      method: method,
      referer: headers.Referer || headers.referer || "",
      origin: headers.Origin || headers.origin || "",
      accept: headers.Accept || headers.accept || "",
      contentType: headers["Content-Type"] || headers["content-type"] || "",
      headers: headers,
      body: details.data != null ? details.data : undefined,
    }).then(
      function (res) {
        if (res && res.ok && res.status >= 200 && res.status < 400) {
          if (details.onload) {
            details.onload({
              status: res.status,
              statusText: "OK",
              responseText: String(res.body || ""),
              finalUrl: details.url,
            });
          }
        } else if (res && res.ok) {
          if (details.onload) {
            details.onload({
              status: res.status,
              statusText: "ERR",
              responseText: String(res.body || ""),
              finalUrl: details.url,
            });
          }
        } else if (details.onerror) {
          details.onerror(new Error((res && res.error) || "fetch 실패"));
        }
      },
      function (err) {
        if (details.onerror) details.onerror(err);
      }
    );
  };

  var chromeShim = {
    runtime: {
      lastError: null,
      getURL: function (path) {
        var p = String(path || "").replace(/^\//, "");
        if (p.indexOf("yan4-ats-page.css") >= 0) {
          return "./vendor/yan4-ats-page.css";
        }
        return "./" + p;
      },
      sendMessage: function (message, callback) {
        chromeShim.runtime.lastError = null;
        function done(res) {
          if (typeof callback === "function") {
            try {
              callback(res);
            } catch (eCb) {}
          }
        }
        if (!message || !message.type) {
          chromeShim.runtime.lastError = { message: "message.type 없음" };
          done(null);
          return;
        }
        if (message.type === "yan4Sleep") {
          var ms = Number(message.ms) || 0;
          setTimeout(function () {
            done({ ok: true });
          }, ms);
          return;
        }
        if (
          message.type === "yan4InventoryFetch" ||
          message.type === "yan4InboundFetch" ||
          message.type === "yan4MosFetch" ||
          message.type === "yan4WmsFrontFetch" ||
          message.type === "yan4PoManagementFetch"
        ) {
          desktopFetch(message).then(
            function (res) {
              done(res);
            },
            function (err) {
              done({
                ok: false,
                error: err && err.message ? err.message : String(err),
              });
            }
          );
          return;
        }
        chromeShim.runtime.lastError = {
          message: "unsupported type: " + message.type,
        };
        done(null);
      },
    },
  };

  window.chrome = chromeShim;
})();
