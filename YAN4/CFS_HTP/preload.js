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
});
