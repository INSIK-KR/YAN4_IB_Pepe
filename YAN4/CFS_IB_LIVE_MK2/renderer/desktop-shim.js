/**
 * Desktop chrome.* / GM bridge — must load BEFORE gm-bridge.js / shell.js
 */
(function () {
  "use strict";

  window.__YAN4_DESKTOP_SHELL__ = true;

  var api = window.yan4ShellDesktop;
  if (!api) {
    console.error("[yan4-desktop-shim] yan4ShellDesktop preload missing");
    return;
  }

  /* 알림창 제목: 로그인 필요 안내면 「재로그인 필요」 (기본 제목 「cfs-ib-live」 대신) */
  if (typeof api.alertSync === "function") {
    window.alert = function (message) {
      try {
        api.alertSync(message);
      } catch (eAlert) {}
    };
  }

  /** 401·403 이 어느 시스템인지 — 상단 로그인 버튼 이름(WMS·PO·MOS·SHPT) */
  function loginSystemOf(url) {
    var h = "";
    try {
      h = new URL(String(url || ""), "https://inbound.coupang.com/").hostname;
    } catch (eU) {}
    if (/shipments\.coupang\.net$/.test(h)) return "SHPT";
    if (/po-management\.coupang\.net$/.test(h)) return "PO";
    if (/mos\.coupang\.net$/.test(h)) return "MOS";
    if (/sharepoint\.com$/.test(h)) return "SharePoint";
    return "WMS";
  }

  function loginNeededText(url, status) {
    var sys = loginSystemOf(url);
    /* 상단 로그인 버튼을 「재로그인 필요」로 (boot.js) */
    try {
      if (typeof window.__YAN4_MARK_RELOGIN__ === "function") window.__YAN4_MARK_RELOGIN__(sys);
    } catch (eMark) {}
    var how =
      sys === "SharePoint"
        ? "SharePoint에 다시 로그인하세요"
        : "상단 「" + sys + "」 버튼으로 로그인하세요";
    return sys + " 로그인 필요 — " + how;
  }

  window.__YAN4_LOGIN_TEXT__ = function (url) {
    return loginNeededText(url, 0);
  };
  /** status 가 401·403 이면 로그인 안내, 아니면 fallback 또는 「HTTP 500 …」 */
  window.__YAN4_HTTP_ERR__ = function (status, url, rest, fallback) {
    var s = Number(status);
    if (s === 401 || s === 403) return loginNeededText(url, s);
    return fallback || "HTTP " + status + (rest || "");
  };

  function mkLastError(msg) {
    return msg ? { message: String(msg) } : null;
  }

  var chromeShim = {
    runtime: {
      id: "yan4-shell-desktop",
      lastError: null,
      getURL: function (pathName) {
        var p = String(pathName || "").replace(/^\//, "");
        if (p.indexOf("media/") === 0) return "./" + p;
        if (p.indexOf("vendor/") === 0) return "./" + p;
        // extension WAR paths → local vendor/media
        var base = p.split("/").pop();
        if (/\.(wav|png|jpg|jpeg|gif|svg)$/i.test(base)) {
          return "./media/" + base;
        }
        if (/\.(js|css|json)$/i.test(base)) {
          return "./vendor/" + base;
        }
        return "./vendor/" + p;
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
        api
          .runtimeMessage(message)
          .then(function (res) {
            var m401 = res && /^HTTP (401|403)\b/.exec(String(res.error || ""));
            if (m401) {
              res.error = loginNeededText(message && message.url, Number(m401[1]));
            } else if (res && !res.error && (res.status === 401 || res.status === 403)) {
              res.error = loginNeededText(message && message.url, res.status);
            }
            if (res && res.ok === false && res.error) {
              chromeShim.runtime.lastError = mkLastError(res.error);
            }
            done(res);
          })
          .catch(function (err) {
            chromeShim.runtime.lastError = mkLastError(
              err && err.message ? err.message : String(err)
            );
            done(null);
          });
      },
      onMessage: {
        addListener: function () {},
        removeListener: function () {},
      },
      onInstalled: { addListener: function () {} },
      onStartup: { addListener: function () {} },
    },
    storage: {
      local: {
        get: function (keys, callback) {
          chromeShim.runtime.lastError = null;
          api
            .storageGet(keys)
            .then(function (obj) {
              if (typeof callback === "function") callback(obj || {});
            })
            .catch(function (err) {
              chromeShim.runtime.lastError = mkLastError(
                err && err.message ? err.message : String(err)
              );
              if (typeof callback === "function") callback({});
            });
        },
        set: function (items, callback) {
          chromeShim.runtime.lastError = null;
          api
            .storageSet(items)
            .then(function () {
              if (typeof callback === "function") callback();
            })
            .catch(function (err) {
              chromeShim.runtime.lastError = mkLastError(
                err && err.message ? err.message : String(err)
              );
              if (typeof callback === "function") callback();
            });
        },
        remove: function (keys, callback) {
          chromeShim.runtime.lastError = null;
          api
            .storageRemove(keys)
            .then(function () {
              if (typeof callback === "function") callback();
            })
            .catch(function (err) {
              chromeShim.runtime.lastError = mkLastError(
                err && err.message ? err.message : String(err)
              );
              if (typeof callback === "function") callback();
            });
        },
      },
    },
    alarms: {
      create: function () {},
      clear: function (_n, cb) {
        if (typeof cb === "function") cb(true);
      },
      get: function (_n, cb) {
        if (typeof cb === "function") cb(undefined);
      },
      onAlarm: { addListener: function () {} },
    },
    downloads: {
      download: function (opts, cb) {
        // routed via runtime messages for SLA; generic unused
        if (typeof cb === "function") cb(undefined);
      },
    },
    tabs: {
      query: function (_q, cb) {
        if (typeof cb === "function") cb([]);
      },
      sendMessage: function (_id, _msg, cb) {
        if (typeof cb === "function") cb(undefined);
      },
    },
  };

  window.chrome = chromeShim;

  // Prefer session-backed fetch over page fetch for GM_xmlhttpRequest
  // (gm-bridge will overwrite GM_xmlhttpRequest — patch after it loads via boot.js)
  window.__YAN4_DESKTOP_PATCH_GM_XHR__ = function () {
    window.GM_xmlhttpRequest = function (details) {
      if (!details || !details.url) return;
      var method = String(details.method || "GET").toUpperCase();
      var headers = details.headers || {};
      api
        .fetch({
          url: details.url,
          method: method,
          referer: headers.Referer || headers.referer || "",
          origin: headers.Origin || headers.origin || "",
          accept: headers.Accept || headers.accept || "",
          contentType: headers["Content-Type"] || headers["content-type"] || "",
          headers: headers,
          body: details.data != null ? details.data : undefined,
          // 호출 쪽 timeout(28~60초)은 데스크톱에서 원래 안 쓰던 값 — 느린 조회가 새로 실패하지 않게
          // main 기본 시간 제한(3분)만 적용, 멈춘 요청만 끊음
        })
        .then(function (res) {
          if (res && res.timedOut && details.ontimeout) {
            details.ontimeout();
            return;
          }
          if (res && res.ok) {
            if (details.onload) {
              details.onload({
                status: res.status,
                statusText: res.status >= 200 && res.status < 400 ? "OK" : "ERR",
                responseText: String(res.body || ""),
                finalUrl: details.url,
              });
            }
          } else if (details.onerror) {
            details.onerror(new Error((res && res.error) || "fetch 실패"));
          }
        })
        .catch(function (err) {
          if (details.onerror) details.onerror(err);
        });
    };
  };
})();
