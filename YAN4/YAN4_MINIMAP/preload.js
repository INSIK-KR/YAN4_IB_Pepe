const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yan4Minimap", {
  isElectron: true,
  openInventoryLogin: function () {
    return ipcRenderer.invoke("yna4-minimap:open-login");
  },
  fetchCapacity: function (boxes) {
    return ipcRenderer.invoke("yna4-minimap:fetch-capacity", boxes);
  },
  onFetchProgress: function (cb) {
    ipcRenderer.on("yna4-minimap:fetch-progress", function (_ev, data) {
      if (typeof cb === "function") cb(data);
    });
  },
  readChamberLayout: function () {
    return ipcRenderer.invoke("yna4-minimap:read-chamber-layout");
  },
  saveChamberLayout: function (layout) {
    return ipcRenderer.invoke("yna4-minimap:save-chamber-layout", layout);
  },
});
