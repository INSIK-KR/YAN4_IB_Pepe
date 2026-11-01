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
