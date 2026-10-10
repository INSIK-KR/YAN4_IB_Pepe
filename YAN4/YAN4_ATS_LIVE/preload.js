"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yan4AtsDesktop", {
  fetch: function (message) {
    return ipcRenderer.invoke("yan4-ats-fetch", message);
  },
  sessionStatus: function () {
    return ipcRenderer.invoke("yan4-ats-session-status");
  },
  openLogin: function () {
    return ipcRenderer.invoke("yan4-ats-open-login");
  },
  onSessionUpdated: function (cb) {
    if (typeof cb !== "function") return function () {};
    const handler = function (_e, payload) {
      cb(payload);
    };
    ipcRenderer.on("yan4-ats-session-updated", handler);
    return function () {
      ipcRenderer.removeListener("yan4-ats-session-updated", handler);
    };
  },
});
