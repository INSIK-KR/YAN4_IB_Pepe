"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cfsHtp", {
  appInfo: function () {
    return ipcRenderer.invoke("cfs-htp-app-info");
  },
  loadInputs: function () {
    return ipcRenderer.invoke("cfs-htp-inputs-load");
  },
  saveInputs: function (inputs) {
    return ipcRenderer.invoke("cfs-htp-inputs-save", inputs);
  },
  mosStatus: function () {
    return ipcRenderer.invoke("cfs-htp-mos-status");
  },
  mosLogin: function () {
    return ipcRenderer.invoke("cfs-htp-mos-login");
  },
  mosFetch: function (message) {
    return ipcRenderer.invoke("cfs-htp-mos-fetch", message);
  },
  onMosSession: function (cb) {
    const handler = function (_e, payload) {
      cb(payload);
    };
    ipcRenderer.on("cfs-htp-mos-session", handler);
    return function () {
      ipcRenderer.removeListener("cfs-htp-mos-session", handler);
    };
  },
});
