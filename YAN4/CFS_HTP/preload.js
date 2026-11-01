"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cfsHtp", {
  appInfo: function () {
    return ipcRenderer.invoke("cfs-htp-app-info");
  },
});
