/* YAN4 Shell — Tampermonkey GM_* polyfills for Chrome MV3 content script */
(function () {
  "use strict";

  var STORAGE_PREFIX = "yan4.shell.";

  globalThis.GM_xmlhttpRequest = function (details) {
    if (!details || !details.url) return;
    var method = String(details.method || "GET").toUpperCase();
    var url = details.url;
    var timeout = typeof details.timeout === "number" ? details.timeout : 45000;

    var controller =
      typeof AbortController === "function" ? new AbortController() : null;
    var tid = null;
    if (controller && timeout > 0) {
      tid = setTimeout(function () {
        try {
          controller.abort();
        } catch (eA) {}
      }, timeout);
    }

    var headersInit = details.headers;
    var headers = new Headers();
    if (headersInit && typeof headersInit === "object") {
      for (var k in headersInit) {
        if (!Object.prototype.hasOwnProperty.call(headersInit, k)) continue;
        try {
          headers.set(k, String(headersInit[k]));
        } catch (eH) {}
      }
    }

    var init = {
      method: method,
      credentials: details.anonymous ? "omit" : "include",
      headers: headers,
    };
    if (controller) init.signal = controller.signal;

    var body = details.data;
    if (body != null && method !== "GET" && method !== "HEAD") {
      init.body =
        typeof body === "string" ? body : body instanceof FormData ? body : String(body);
    }

    fetch(url, init)
      .then(function (res) {
        return res.text().then(function (text) {
          if (tid) clearTimeout(tid);
          var r = {
            status: res.status,
            statusText: res.statusText,
            responseText: text,
            finalUrl: res.url,
          };
          if (details.onload) details.onload(r);
        });
      })
      .catch(function (err) {
        if (tid) clearTimeout(tid);
        var aborted = err && err.name === "AbortError";
        if (aborted && details.ontimeout) details.ontimeout();
        else if (!aborted && details.onerror) details.onerror(err);
        else if (aborted && details.onerror) details.onerror(err);
      });
  };

  function storageKey(key) {
    return STORAGE_PREFIX + String(key == null ? "" : key);
  }

  globalThis.GM_getValue = function (key, defaultValue) {
    var k = storageKey(key);
    return new Promise(function (resolve) {
      chrome.storage.local.get([k], function (obj) {
        if (chrome.runtime.lastError) {
          resolve(defaultValue);
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(obj, k)) resolve(defaultValue);
        else resolve(obj[k]);
      });
    });
  };

  globalThis.GM_setValue = function (key, value) {
    var k = storageKey(key);
    return new Promise(function (resolve, reject) {
      var payload = {};
      payload[k] = value;
      chrome.storage.local.set(payload, function () {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  };

  globalThis.GM_deleteValue = function (key) {
    var k = storageKey(key);
    return new Promise(function (resolve, reject) {
      chrome.storage.local.remove([k], function () {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  };

  async function writeHtmlToClipboard(html, plainFallback) {
    if (typeof ClipboardItem === "undefined") {
      if (plainFallback != null) await navigator.clipboard.writeText(String(plainFallback));
      return;
    }
    var htmlBlob = new Blob([String(html)], { type: "text/html" });
    var plainBlob = new Blob([String(plainFallback != null ? plainFallback : "")], {
      type: "text/plain",
    });
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": plainBlob,
      }),
    ]);
  }

  globalThis.GM_setClipboard = async function (data, info) {
    var str = data == null ? "" : String(data);
    var mime = "";
    if (typeof info === "string") mime = info;
    else if (info && typeof info === "object") mime = String(info.type || info.mimetype || "");

    try {
      if (/html/i.test(mime)) {
        var stripped = str.replace(/<[^>]+>/g, "");
        await writeHtmlToClipboard(str, stripped);
      } else {
        await navigator.clipboard.writeText(str);
      }
    } catch (eClip) {
      try {
        var ta = document.createElement("textarea");
        ta.value = str;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.documentElement.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch (eLegacy) {}
    }
  };
})();
