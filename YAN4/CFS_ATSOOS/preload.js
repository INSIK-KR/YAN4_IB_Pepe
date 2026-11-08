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
  wmsOrderCutline: function (orderNumber) {
    return ipcRenderer.invoke("cfs-atsoos-wms-order-cutline", orderNumber);
  },
  wmsChangeCenter: function (centerId) {
    return ipcRenderer.invoke("cfs-atsoos-wms-change-center", centerId);
  },
  pbiStatus: function () {
    return ipcRenderer.invoke("cfs-atsoos-pbi-status");
  },
  pbiLogin: function () {
    return ipcRenderer.invoke("cfs-atsoos-pbi-login");
  },
  pbiExport: function (request) {
    return ipcRenderer.invoke("cfs-atsoos-pbi-export", request);
  },
  onPbiStatus: function (cb) {
    const handler = function (_e, payload) {
      cb(payload);
    };
    ipcRenderer.on("cfs-atsoos-pbi-status", handler);
    return function () {
      ipcRenderer.removeListener("cfs-atsoos-pbi-status", handler);
    };
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
