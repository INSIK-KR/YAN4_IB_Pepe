"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yan4ShellDesktop", {
  fetch: function (message) {
    return ipcRenderer.invoke("yan4-shell-fetch", message);
  },
  runtimeMessage: function (message) {
    return ipcRenderer.invoke("yan4-shell-runtime-message", message);
  },
  sessionStatus: function () {
    return ipcRenderer.invoke("yan4-shell-session-status");
  },
  openLogin: function (kind, center) {
    return ipcRenderer.invoke("yan4-shell-open-login", kind || "coupang", center);
  },
  openUrl: function (url) {
    return ipcRenderer.invoke("yan4-shell-open-url", url);
  },
  onDownloadProgress: function (cb) {
    if (typeof cb !== "function") return function () {};
    const handler = function (_e, payload) {
      cb(payload);
    };
    ipcRenderer.on("yan4-shell-download-progress", handler);
    return function () {
      ipcRenderer.removeListener("yan4-shell-download-progress", handler);
    };
  },
  printToPdf: function (opts) {
    return ipcRenderer.invoke("yan4-shell-print-to-pdf", opts || {});
  },
  captureRectToClipboard: function (rect) {
    return ipcRenderer.invoke("yan4-shell-capture-rect-to-clipboard", rect);
  },
  captureRect: function (rect) {
    return ipcRenderer.invoke("yan4-shell-capture-rect", rect);
  },
  clipboardWritePng: function (dataUrl) {
    return ipcRenderer.invoke("yan4-shell-clipboard-write-png", dataUrl);
  },
  storageGet: function (keys) {
    return ipcRenderer.invoke("yan4-shell-storage-get", keys);
  },
  storageSet: function (items) {
    return ipcRenderer.invoke("yan4-shell-storage-set", items);
  },
  storageRemove: function (keys) {
    return ipcRenderer.invoke("yan4-shell-storage-remove", keys);
  },
  prestoQuery: function (opts) {
    return ipcRenderer.invoke("yan4-shell-presto-query", opts || {});
  },
  openSop: function (opts) {
    return ipcRenderer.invoke("yan4-shell-open-sop", opts || {});
  },
  onSessionUpdated: function (cb) {
    if (typeof cb !== "function") return function () {};
    const handler = function (_e, payload) {
      cb(payload);
    };
    ipcRenderer.on("yan4-shell-session-updated", handler);
    return function () {
      ipcRenderer.removeListener("yan4-shell-session-updated", handler);
    };
  },
  onLoginClosed: function (cb) {
    if (typeof cb !== "function") return function () {};
    const handler = function (_e, payload) {
      cb(payload);
    };
    ipcRenderer.on("yan4-shell-login-closed", handler);
    return function () {
      ipcRenderer.removeListener("yan4-shell-login-closed", handler);
    };
  },
});
