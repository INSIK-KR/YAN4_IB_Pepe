"use strict";

const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");

const APP_TITLE = "CFS HTP";
// MOS 로그인 쿠키 등을 앱 재시작 후에도 유지하기 위한 영구 세션
const PARTITION = "persist:cfs-htp";

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: APP_TITLE,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      partition: PARTITION,
    },
  });
  mainWindow.setMenu(null);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

ipcMain.handle("cfs-htp-app-info", async function () {
  return { name: APP_TITLE, version: app.getVersion() };
});

// 입력값(Target, S&OP, H/C, 이관 차량)은 portable exe 옆이 아니라 사용자 데이터 폴더에 저장
function inputsPath() {
  return path.join(app.getPath("userData"), "inputs.json");
}

ipcMain.handle("cfs-htp-inputs-load", async function () {
  try {
    return JSON.parse(fs.readFileSync(inputsPath(), "utf8"));
  } catch (_e) {
    return null;
  }
});

ipcMain.handle("cfs-htp-inputs-save", async function (_e, inputs) {
  fs.mkdirSync(path.dirname(inputsPath()), { recursive: true });
  fs.writeFileSync(inputsPath(), JSON.stringify(inputs, null, 2), "utf8");
  return true;
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", function () {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(function () {
    createMainWindow();
  });

  app.on("window-all-closed", function () {
    app.quit();
  });
}
