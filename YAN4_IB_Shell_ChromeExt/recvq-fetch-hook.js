(function () {
  "use strict";
  if (window.__YAN4_RECVQ_FETCH_HOOK__) return;
  window.__YAN4_RECVQ_FETCH_HOOK__ = true;

  var NAME_FIELDS = [
    "skuName",
    "name",
    "productName",
    "unitDescription",
    "skuDescription",
    "itemName",
    "displayName",
  ];

  function emit(keys, names) {
    if ((!keys || !keys.length) && (!names || !names.length)) return;
    window.postMessage(
      { type: "YAN4_RECVQ_SHRINK_SCAN", keys: keys || [], names: names || [] },
      "*"
    );
  }

  function collectNames(node, out, depth) {
    if (!node || typeof node !== "object" || depth > 3) return;
    var i, v;
    if (Array.isArray(node)) {
      for (i = 0; i < node.length; i++) collectNames(node[i], out, depth + 1);
      return;
    }
    for (i = 0; i < NAME_FIELDS.length; i++) {
      v = node[NAME_FIELDS[i]];
      if (typeof v === "string" && v.trim()) out.push(v.trim());
    }
    for (var k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      if (node[k] && typeof node[k] === "object") {
        collectNames(node[k], out, depth + 1);
      }
    }
  }

  function scanReceivingUrl(url, text) {
    var keys = [];
    var names = [];
    var u = null;
    var bc;
    var m;
    var i;
    var row;
    var j;

    try {
      u = new URL(url, location.origin);
    } catch (eU) {}

    if (u && /\/unload-works\/[^/]+\/skus/i.test(u.pathname)) {
      bc = u.searchParams.get("skuBarcode");
      if (bc) keys.push(bc);
    }
    if (/\/skus\/(\d+)\/receive-direction/i.test(url)) {
      m = url.match(/\/skus\/(\d+)\/receive-direction/i);
      if (m && m[1]) keys.push(m[1]);
    }

    try {
      j = JSON.parse(text || "");
    } catch (eJ) {
      j = null;
    }

    if (j && String(j.resultCode || "").toUpperCase() === "SUCCESS" && j.data) {
      if (Array.isArray(j.data)) {
        for (i = 0; i < j.data.length; i++) {
          row = j.data[i];
          if (row && row.barcode) keys.push(String(row.barcode));
          if (row && row.skuId != null) keys.push(String(row.skuId));
        }
      } else if (j.data && typeof j.data === "object") {
        if (j.data.barcode) keys.push(String(j.data.barcode));
        if (j.data.skuId != null) keys.push(String(j.data.skuId));
      }
      collectNames(j.data, names, 0);
    }

    emit(keys, names);
  }

  function hookFetchResponse(url, text) {
    if (String(url || "").indexOf("/v2/receiving/") < 0) return;
    scanReceivingUrl(url, text);
  }

  var origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input, init) {
      return origFetch.apply(this, arguments).then(function (res) {
        try {
          var url = typeof input === "string" ? input : (input && input.url) || "";
          if (url.indexOf("/v2/receiving/") >= 0) {
            res
              .clone()
              .text()
              .then(function (t) {
                hookFetchResponse(url, t);
              })
              .catch(function () {});
          }
        } catch (eF) {}
        return res;
      });
    };
  }

  var XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    var origOpen = XHR.prototype.open;
    var origSend = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this.__yan4RecvqUrl = String(url || "");
      return origOpen.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      var xhr = this;
      var url = xhr.__yan4RecvqUrl || "";
      if (url.indexOf("/v2/receiving/") >= 0) {
        xhr.addEventListener("load", function () {
          try {
            hookFetchResponse(url, xhr.responseText || "");
          } catch (eX) {}
        });
      }
      return origSend.apply(this, arguments);
    };
  }
})();
