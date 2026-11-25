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

  /**
   * 팀즈 복사용 HTML 표를 그림(PNG)으로 바꿔 클립보드에 넣음.
   * 팀즈가 붙여넣은 HTML 표를 크게 바꿔도 그림은 보이는 크기 그대로 붙음. 성공하면 true.
   */
  globalThis.yan4CopyHtmlAsImage = async function (html) {
    var host = null;
    try {
      if (typeof html2canvas !== "function") throw new Error("html2canvas 없음");
      var inner = String(html || "");
      var mb = /<body[^>]*>([\s\S]*)<\/body>/i.exec(inner);
      if (mb) inner = mb[1];
      inner = inner.replace(/<!--(Start|End)Fragment-->/g, "");
      if (!inner.trim()) return false;
      host = document.createElement("div");
      host.setAttribute("data-yan4-image-copy", "1");
      host.style.cssText =
        "position:fixed;left:-100000px;top:0;z-index:-1;display:inline-block;width:max-content;max-width:none;" +
        "padding:10px;margin:0;background:#ffffff;color:#0f172a;text-align:left;" +
        "font-family:'Segoe UI','Malgun Gothic',sans-serif;font-size:12px;line-height:1.35;";
      host.innerHTML = inner;
      document.body.appendChild(host);
      var canvas = await html2canvas(host, {
        backgroundColor: "#ffffff",
        scale: Math.max(1, window.devicePixelRatio || 1),
        logging: false,
        useCORS: true,
      });
      var dataUrl = canvas.toDataURL("image/png");
      var desk = window.yan4ShellDesktop;
      if (desk && typeof desk.clipboardWritePng === "function") {
        var resp = await desk.clipboardWritePng(dataUrl);
        if (resp && resp.ok) return true;
      }
      var blob = await new Promise(function (resolve) {
        canvas.toBlob(resolve, "image/png");
      });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return true;
    } catch (eImg) {
      console.warn("[YAN4] 표 이미지 복사 실패", eImg);
      return false;
    } finally {
      if (host && host.parentNode) host.parentNode.removeChild(host);
    }
  };
})();
