"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cfsAtsoos", {
  appInfo: function () {
    return ipcRenderer.invoke("cfs-atsoos-app-info");
  },
  wmsStatus: function () {
    return ipcRenderer.invoke("cfs-atsoos-wms-status");
  },
  wmsLogin: function () {
    return ipcRenderer.invoke("cfs-atsoos-wms-login");
  },
  onWmsSession: function (cb) {
    const handler = function (_e, payload) {
      cb(payload);
    };
    ipcRenderer.on("cfs-atsoos-wms-session", handler);
    return function () {
      ipcRenderer.removeListener("cfs-atsoos-wms-session", handler);
    };
  },
});
