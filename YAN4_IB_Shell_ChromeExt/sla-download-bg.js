/* MV3 — SharePoint SLA · MOS/inventory/WMS/inbound: background fetch(쿠키·CORS) */
"use strict";

var SLA_AUTO_ALARM_NAME = "yan4-sla-auto-pipeline";
var SLA_AUTO_ENABLED_KEY = "yna4_sla_auto_enabled_v1";
var SLA_AUTO_INTERVAL_KEY = "yna4_sla_auto_interval_min_v1";

function sanitizeDownloadRelativePath(raw) {
  var parts = String(raw || "")
    .replace(/\\/g, "/")
    .split("/");
  var clean = [];
  var i, seg;
  for (i = 0; i < parts.length; i++) {
    seg = String(parts[i] || "")
      .replace(/[:*?"<>|]+/g, "_")
      .replace(/^\.+/, "")
      .trim();
    if (!seg || seg === "..") continue;
    clean.push(seg);
  }
  return clean.length ? clean.join("/") : "download.bin";
}

function defaultSlaCaptureFilename() {
  var d = new Date();
  function p2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  return (
    "Inbox/sla-" +
    d.getFullYear() +
    p2(d.getMonth() + 1) +
    p2(d.getDate()) +
    "_" +
    p2(d.getHours()) +
    p2(d.getMinutes()) +
    p2(d.getSeconds()) +
    ".png"
  );
}

function syncSlaAutoAlarm(enabled, intervalMin) {
  var mins = Number(intervalMin) || 30;
  if (mins < 1) mins = 30;
  if (enabled) {
    chrome.alarms.create(SLA_AUTO_ALARM_NAME, { periodInMinutes: mins });
  } else {
    chrome.alarms.clear(SLA_AUTO_ALARM_NAME);
  }
}

function restoreSlaAutoAlarmFromStorage() {
  chrome.storage.local.get(
    [SLA_AUTO_ENABLED_KEY, SLA_AUTO_INTERVAL_KEY],
    function (r) {
      syncSlaAutoAlarm(!!r[SLA_AUTO_ENABLED_KEY], r[SLA_AUTO_INTERVAL_KEY] || 30);
    }
  );
}

chrome.runtime.onStartup.addListener(restoreSlaAutoAlarmFromStorage);
chrome.runtime.onInstalled.addListener(restoreSlaAutoAlarmFromStorage);

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (!alarm || alarm.name !== SLA_AUTO_ALARM_NAME) return;
  chrome.storage.local.get([SLA_AUTO_ENABLED_KEY], function (r) {
    if (!r[SLA_AUTO_ENABLED_KEY]) return;
    chrome.tabs.query({}, function (tabs) {
      var ti, tab;
      if (!tabs || !tabs.length) return;
      for (ti = 0; ti < tabs.length; ti++) {
        tab = tabs[ti];
        if (!tab.id || !tab.url || tab.url.indexOf("coupang.com") === -1) {
          continue;
        }
        chrome.tabs.sendMessage(tab.id, { type: "yan4SlaAutoRun" }, function () {
          void chrome.runtime.lastError;
        });
      }
    });
  });
});

function arrayBufferToBase64(ab) {
  var u8 = new Uint8Array(ab);
  var CHUNK = 0x8000;
  var bin = "";
  var i;
  for (i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  /** 탭 백그라운드 setTimeout 스로틀 회피 — content script sleep 대리 */
  if (message && message.type === "yan4Sleep") {
    var sleepMs = Number(message.ms);
    if (!isFinite(sleepMs) || sleepMs < 0) sleepMs = 0;
    if (sleepMs > 120000) sleepMs = 120000;
    if (sleepMs === 0) {
      sendResponse({ ok: true });
      return false;
    }
    setTimeout(function () {
      try {
        sendResponse({ ok: true });
      } catch (eSleepRsp) {}
    }, sleepMs);
    return true;
  }
  if (message && message.type === "yan4SlaAutoNextRun") {
    chrome.alarms.get(SLA_AUTO_ALARM_NAME, function (alarm) {
      sendResponse({
        ok: true,
        scheduledTime: alarm && alarm.scheduledTime ? alarm.scheduledTime : 0,
        periodMinutes:
          alarm && alarm.periodInMinutes ? alarm.periodInMinutes : 0,
      });
    });
    return true;
  }
  if (message && message.type === "yan4SlaAutoScheduleUpdate") {
    syncSlaAutoAlarm(!!message.enabled, message.intervalMin || 30);
    if (typeof chrome.storage !== "undefined" && chrome.storage.local) {
      chrome.storage.local.set({
        yna4_sla_auto_enabled_v1: !!message.enabled,
        yna4_sla_auto_interval_min_v1: Number(message.intervalMin) || 30,
      });
    }
    sendResponse({ ok: true });
    return false;
  }
  if (message && message.type === "yan4SlaDownloadJson") {
    var jsonFn = sanitizeDownloadRelativePath(
      message.filename || "Inbox/sla-batch.teams.json"
    );
    var jsonText = String(message.json || "");
    var jsonUrl =
      "data:application/json;charset=utf-8," + encodeURIComponent(jsonText);
    chrome.downloads.download(
      {
        url: jsonUrl,
        filename: jsonFn,
        saveAs: false,
        conflictAction: "uniquify",
      },
      function (dlId) {
        if (chrome.runtime.lastError) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError.message,
          });
          return;
        }
        sendResponse({ ok: true, downloadId: dlId, filename: jsonFn });
      }
    );
    return true;
  }
  if (message && message.type === "yan4SlaDownloadPng") {
    var pngUrl = String(message.dataUrl || "");
    var pngFn = sanitizeDownloadRelativePath(
      message.filename || defaultSlaCaptureFilename()
    );
    if (pngUrl.indexOf("data:image/") !== 0) {
      sendResponse({ ok: false, error: "PNG dataUrl 아님" });
      return false;
    }
    chrome.downloads.download(
      {
        url: pngUrl,
        filename: pngFn,
        saveAs: false,
        conflictAction: "uniquify",
      },
      function (dlId) {
        if (chrome.runtime.lastError) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError.message,
          });
          return;
        }
        sendResponse({ ok: true, downloadId: dlId, filename: pngFn });
      }
    );
    return true;
  }
  if (message && message.type === "yan4InventoryFetch") {
    var url = String(message.url || "");
    if (url.indexOf("https://inventory.coupang.com/") !== 0) {
      sendResponse({ ok: false, error: "inventory.coupang.com URL만 허용" });
      return false;
    }
    var method = String(message.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") {
      sendResponse({ ok: false, error: "GET/POST만 허용" });
      return false;
    }
    var ref = String(
      message.referer || "https://inventory.coupang.com/inventory/list"
    );
    var fetchOpts = {
      method: method,
      credentials: "include",
      headers: {
        Accept: message.accept || "application/json, text/html, */*; q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "X-Requested-With": "XMLHttpRequest",
        Referer: ref,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    };
    if (method === "POST" && message.body != null) {
      fetchOpts.headers["Content-Type"] =
        message.contentType || "application/x-www-form-urlencoded;charset=UTF-8";
      fetchOpts.body = String(message.body);
    }
    fetch(url, fetchOpts)
      .then(function (res) {
        return res.text().then(function (text) {
          sendResponse({ ok: true, status: res.status, body: text });
        });
      })
      .catch(function (e) {
        sendResponse({
          ok: false,
          error: e && e.message ? e.message : String(e),
        });
      });
    return true;
  }
  if (message && message.type === "yan4MosFetch") {
    var mosUrl = String(message.url || "");
    if (mosUrl.indexOf("https://mos.coupang.net/") !== 0) {
      sendResponse({ ok: false, error: "mos.coupang.net URL만 허용" });
      return false;
    }
    var mosMethod = String(message.method || "GET").toUpperCase();
    if (mosMethod !== "GET" && mosMethod !== "POST") {
      sendResponse({ ok: false, error: "GET/POST만 허용" });
      return false;
    }
    if (
      mosMethod === "POST" &&
      mosUrl.indexOf("https://mos.coupang.net/worker/call/v2/create/") !== 0 &&
      mosUrl.indexOf("https://mos.coupang.net/kpi/gross-uph/datas") !== 0
    ) {
      sendResponse({ ok: false, error: "허용되지 않은 MOS POST URL" });
      return false;
    }
    var mosRef = String(message.referer || "https://mos.coupang.net/");
    var mosFetchOpts = {
      method: mosMethod,
      credentials: "include",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        Referer: mosRef,
      },
    };
    if (mosMethod === "POST") {
      if (message.contentType) {
        mosFetchOpts.headers["Content-Type"] = String(message.contentType);
      }
      if (message.body != null) {
        mosFetchOpts.body = String(message.body);
      }
    }
    fetch(mosUrl, mosFetchOpts)
      .then(function (res) {
        return res.text().then(function (text) {
          sendResponse({ ok: true, status: res.status, body: text });
        });
      })
      .catch(function (e) {
        sendResponse({
          ok: false,
          error: e && e.message ? e.message : String(e),
        });
      });
    return true;
  }
  if (message && message.type === "yan4WmsFrontFetch") {
    var wmsUrl = String(message.url || "");
    if (wmsUrl.indexOf("https://wms-front.coupang.com/") !== 0) {
      sendResponse({ ok: false, error: "wms-front.coupang.com URL만 허용" });
      return false;
    }
    var wmsMethod = String(message.method || "GET").toUpperCase();
    if (wmsMethod !== "GET" && wmsMethod !== "POST") {
      sendResponse({ ok: false, error: "GET/POST만 허용" });
      return false;
    }
    var wmsRef = String(message.referer || "https://wms-front.coupang.com/receiving");
    var wmsHeaders = {
      Accept: message.accept || "application/json, text/plain, */*",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "X-Requested-With": "XMLHttpRequest",
      Referer: wmsRef,
      activeresultcode: "true",
      "x-coupang-accept-language": "ko_KR",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    };
    if (message.wmsFrontHeader) {
      wmsHeaders["x-wms-front-header"] = String(message.wmsFrontHeader);
    }
    var wmsFetchOpts = {
      method: wmsMethod,
      credentials: "include",
      headers: wmsHeaders,
    };
    if (wmsMethod === "POST" && message.body != null) {
      wmsFetchOpts.headers["Content-Type"] =
        message.contentType || "application/json; charset=UTF-8";
      wmsFetchOpts.body = String(message.body);
    }
    fetch(wmsUrl, wmsFetchOpts)
      .then(function (res) {
        return res.text().then(function (text) {
          sendResponse({ ok: true, status: res.status, body: text });
        });
      })
      .catch(function (e) {
        sendResponse({
          ok: false,
          error: e && e.message ? e.message : String(e),
        });
      });
    return true;
  }
  if (message && message.type === "yan4InboundFetch") {
    var inboundUrl = String(message.url || "");
    if (inboundUrl.indexOf("https://inbound.coupang.com/") !== 0) {
      sendResponse({ ok: false, error: "inbound.coupang.com URL만 허용" });
      return false;
    }
    var inboundMethod = String(message.method || "GET").toUpperCase();
    if (inboundMethod !== "GET" && inboundMethod !== "POST") {
      sendResponse({ ok: false, error: "GET/POST만 허용" });
      return false;
    }
    var inboundRef = String(
      message.referer || "https://inbound.coupang.com/unloadWork/list"
    );
    var inboundFetchOpts = {
      method: inboundMethod,
      credentials: "include",
      headers: {
        Accept: message.accept || "text/html, */*; q=0.01",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "X-Requested-With": "XMLHttpRequest",
        Referer: inboundRef,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    };
    if (inboundMethod === "POST" && message.body != null) {
      inboundFetchOpts.headers["Content-Type"] =
        message.contentType || "application/x-www-form-urlencoded;charset=UTF-8";
      inboundFetchOpts.body = String(message.body);
    }
    fetch(inboundUrl, inboundFetchOpts)
      .then(function (res) {
        if (
          message.responseType === "arraybuffer" ||
          message.binary === true
        ) {
          return res.arrayBuffer().then(function (ab) {
            sendResponse({
              ok: res.status >= 200 && res.status < 400,
              status: res.status,
              base64: arrayBufferToBase64(ab),
              byteLength: ab.byteLength,
              error:
                res.status >= 200 && res.status < 400
                  ? undefined
                  : "HTTP " + res.status,
            });
          });
        }
        return res.text().then(function (text) {
          sendResponse({ ok: true, status: res.status, body: text });
        });
      })
      .catch(function (e) {
        sendResponse({
          ok: false,
          error: e && e.message ? e.message : String(e),
        });
      });
    return true;
  }
  if (message && message.type === "yan4PoManagementFetch") {
    var poUrl = String(message.url || "");
    if (poUrl.indexOf("https://po-management.coupang.net/") !== 0) {
      sendResponse({ ok: false, error: "po-management.coupang.net URL만 허용" });
      return false;
    }
    var poMethod = String(message.method || "POST").toUpperCase();
    if (poMethod !== "GET" && poMethod !== "POST") {
      sendResponse({ ok: false, error: "GET/POST만 허용" });
      return false;
    }
    var poRef = String(
      message.referer || "https://po-management.coupang.net/po/sku/list"
    );
    var poFetchOpts = {
      method: poMethod,
      credentials: "include",
      headers: {
        Accept: message.accept || "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "X-Requested-With": "XMLHttpRequest",
        Referer: poRef,
        Origin: "https://po-management.coupang.net",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    };
    if (poMethod === "POST" && message.body != null) {
      poFetchOpts.headers["Content-Type"] =
        message.contentType ||
        "application/x-www-form-urlencoded; charset=UTF-8";
      poFetchOpts.body = String(message.body);
    }
    fetch(poUrl, poFetchOpts)
      .then(function (res) {
        return res.text().then(function (text) {
          sendResponse({
            ok: res.ok,
            status: res.status,
            body: text,
            apiStatus: res.headers.get("pomanagement-api-status") || "",
          });
        });
      })
      .catch(function (e) {
        sendResponse({
          ok: false,
          error: e && e.message ? e.message : String(e),
        });
      });
    return true;
  }
  if (message && message.type === "yan4SlaFetch") {
    var spoUrl = String(message.url || "");
    if (spoUrl.indexOf("https://coupangfsnam.sharepoint.com/") !== 0) {
      sendResponse({ ok: false, error: "SharePoint URL만 허용" });
      return false;
    }
    var spoRef = String(
      message.referer ||
        "https://coupangfsnam.sharepoint.com/sites/FreshFinanceR2/Shared%20Documents/Forms/AllItems.aspx"
    );
    fetch(spoUrl, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8",
        Referer: spoRef,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("SharePoint HTTP " + res.status);
        }
        return res.arrayBuffer();
      })
      .then(function (ab) {
        if (!ab || ab.byteLength < 400) {
          throw new Error("SharePoint 빈 응답");
        }
        var peek = new TextDecoder("utf-8", { fatal: false }).decode(
          new Uint8Array(ab.slice(0, 500))
        );
        if (/^[\s\S]{0,500}<\s*html/i.test(peek)) {
          throw new Error("SharePoint HTML 응답(로그인·권한 확인)");
        }
        sendResponse({
          ok: true,
          base64: arrayBufferToBase64(ab),
          byteLength: ab.byteLength,
        });
      })
      .catch(function (e) {
        sendResponse({
          ok: false,
          error: e && e.message ? e.message : String(e),
        });
      });
    return true;
  }
  if (message && message.type === "yan4ExtensionResourceFetch") {
    var relPath = String(message.path || "")
      .replace(/^\/+/, "")
      .replace(/\\/g, "/");
    if (!/^[a-zA-Z0-9._-]+\.json$/.test(relPath)) {
      sendResponse({ ok: false, error: "허용되지 않은 확장 리소스" });
      return false;
    }
    fetch(chrome.runtime.getURL(relPath))
      .then(function (res) {
        return res.text().then(function (text) {
          sendResponse({
            ok: res.ok,
            status: res.status,
            body: text,
          });
        });
      })
      .catch(function (e) {
        sendResponse({
          ok: false,
          error: e && e.message ? e.message : String(e),
        });
      });
    return true;
  }
  if (!message || message.type !== "yan4SlaDownload") {
    return false;
  }
  var dlUrl = String(message.url || "");
  if (dlUrl.indexOf("https://coupangfsnam.sharepoint.com/") !== 0) {
    sendResponse({ ok: false, error: "SharePoint URL만 허용" });
    return false;
  }
  var filename = String(message.filename || "SLA.xlsx").replace(/[\\/:*?"<>|]+/g, "_");
  fetch(dlUrl, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8",
      Referer:
        "https://coupangfsnam.sharepoint.com/sites/FreshFinanceR2/Shared%20Documents/Forms/AllItems.aspx",
    },
  })
    .then(function (res) {
      if (!res.ok) {
        throw new Error("SharePoint HTTP " + res.status);
      }
      return res.arrayBuffer();
    })
    .then(function (ab) {
      if (!ab || ab.byteLength < 400) {
        throw new Error("SharePoint 빈 응답");
      }
      var b64 = arrayBufferToBase64(ab);
      var dataUrl =
        "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," +
        b64;
      chrome.downloads.download(
        { url: dataUrl, filename: filename, saveAs: false },
        function (dlId) {
          if (chrome.runtime.lastError) {
            sendResponse({
              ok: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }
          sendResponse({ ok: true, downloadId: dlId });
        }
      );
    })
    .catch(function (e) {
      sendResponse({
        ok: false,
        error: e && e.message ? e.message : String(e),
      });
    });
  return true;
});
