"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yan4Sop", {
  getPdf: function () {
    return ipcRenderer.invoke("yan4-sop-pdf");
  },
  search: function (query) {
    return ipcRenderer.invoke("yan4-sop-search", { query: query || "" });
  },
  consumeLaunchQuery: function () {
    return ipcRenderer.invoke("yan4-sop-consume-launch-query");
  },
  onApplyQuery: function (cb) {
    if (typeof cb !== "function") return function () {};
    var handler = function (_e, payload) {
      cb(payload || {});
    };
    ipcRenderer.on("yan4-sop-apply-query", handler);
    return function () {
      ipcRenderer.removeListener("yan4-sop-apply-query", handler);
    };
  },
});
