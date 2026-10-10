const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yna4Desktop", {
  getSpec: function () {
    return ipcRenderer.invoke("yna4:get-spec");
  },
  readFileAsBase64: function (absPath) {
    return ipcRenderer.invoke("yna4:read-file", absPath);
  },
  pickExcelFiles: function () {
    return ipcRenderer.invoke("yna4:pick-files");
  },
  resolveDownloadExcels: function () {
    return ipcRenderer.invoke("yna4:resolve-download-excels");
  },
  getScanDir: function () {
    return ipcRenderer.invoke("yna4:get-scan-dir");         
  },
  pickScanFolder: function () {
    return ipcRenderer.invoke("yna4:pick-scan-folder");
  },
  applySelectedFiles: function (paths) {
    return ipcRenderer.invoke("yna4:apply-selected-files", paths);
  },
  glocLookupBatch: function (payload) {
    return ipcRenderer.invoke("yna4:gloc-lookup-batch", payload || {});
  },
  printMergeToPdf: function (opts) {
    return ipcRenderer.invoke("yna4:print-merge-pdf", opts || {});
  },
  openInventoryLogin: function (payload) {
    return ipcRenderer.invoke("yna4:open-inventory-login", payload || {});
  },
});
