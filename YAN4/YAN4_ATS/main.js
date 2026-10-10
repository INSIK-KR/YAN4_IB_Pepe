const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  nativeTheme,
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

/** OneDrive·동기화·권한 제한 경로에서 Chromium 캐시 이동 실패(0x5) 완화 */
(function configureStableUserDataAndCache() {
  try {
    const local =
      process.env.LOCALAPPDATA ||
      path.join(os.homedir(), "AppData", "Local");
    const userDataDir = path.join(local, "YNA4ReplenishDesktop");
    fs.mkdirSync(userDataDir, { recursive: true });
    app.setPath("userData", userDataDir);
  } catch (e) {
    console.warn("[yna4] userData:", e && e.message ? e.message : e);
  }
  try {
    const cacheDir = path.join(os.tmpdir(), "yna4-replenish-chromium-cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    app.commandLine.appendSwitch("disk-cache-dir", cacheDir);
  } catch (e2) {
    console.warn("[yna4] disk-cache-dir:", e2 && e2.message ? e2.message : e2);
  }
  try {
    app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
  } catch (e3) {}
})();

const { pathToFileURL } = require("url");
const {
  pickMergedScanAndPaths,
  parseEntry,
} = require("./download-excel-pick");
const glocLookup = require("./gloc-lookup");

function resolveGlocBundledConfigPath() {
  try {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, "yan4-app", "gloc-lookup.json");
    }
  } catch (e) {}
  return path.join(__dirname, "packaged", "gloc-lookup.json");
}

const PREFER_SHEET = "①이관현황 Data";

function splitLinesTsv(t) {
  return String(t || "")
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\n|\r/)
    .map(function (line) {
      return line.replace(/^\uFEFF+/, "").replace(/^\r+|\r+$/g, "");
    });
}

/** 여러 TSV 블록을 세로로 이어 붙임. 두 번째부터 첫 줄이 첫 블록 헤더와 같으면 헤더 생략. */
function mergeSequentialTsvBlocks(blocks) {
  if (!blocks || !blocks.length) return "";
  let headerLine = null;
  let out = "";
  let i;
  for (i = 0; i < blocks.length; i++) {
    let b = String(blocks[i] || "").replace(/\s+$/g, "");
    if (!b.trim()) continue;
    const lines = splitLinesTsv(b);
    if (!lines.length) continue;
    if (headerLine == null) {
      headerLine = lines[0];
      out = b;
      continue;
    }
    const bodyLines = lines.slice();
    if (lines[0] === headerLine) bodyLines.shift();
    const body = bodyLines.join("\n");
    if (body.length) out += "\n" + body;
  }
  return out;
}

function wbToTsvPrefer(XLSX, wb) {
  const names = wb.SheetNames || [];
  const sn =
    names.indexOf(PREFER_SHEET) >= 0 ? PREFER_SHEET : names[0] || "";
  if (!sn) return "";
  const sh = wb.Sheets[sn];
  if (!sh) return "";
  let csv = XLSX.utils.sheet_to_csv(sh, { FS: "\t", RS: "\n" });
  if (csv.length && csv.charAt(csv.length - 1) === "\n") {
    csv = csv.slice(0, -1);
  }
  return csv;
}

function buildSlot1TsvFromPathGroups(slot1PathGroups) {
  const XLSX = require("xlsx");
  const categoryTsvs = [];
  let gi;
  for (gi = 0; gi < slot1PathGroups.length; gi++) {
    const paths = slot1PathGroups[gi];
    const partTsvs = [];
    let pj;
    for (pj = 0; pj < paths.length; pj++) {
      const buf = fs.readFileSync(paths[pj]);
      const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
      partTsvs.push(wbToTsvPrefer(XLSX, wb));
    }
    categoryTsvs.push(mergeSequentialTsvBlocks(partTsvs));
  }
  return mergeSequentialTsvBlocks(categoryTsvs);
}

function appContentDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "yan4-app");
  }
  return path.join(__dirname, "..");
}

function configDir() {
  if (app.isPackaged) {
    return path.dirname(process.execPath);
  }
  return __dirname;
}

function isExcelPath(p) {
  return /\.(xlsx|xlsm)$/i.test(String(p || ""));
}

function collectAllExcelPaths() {
  const out = [];
  const seen = new Set();
  function add(p) {
    if (!p || typeof p !== "string") return;
    const trimmed = p.replace(/^["']|["']$/g, "").trim();
    if (!trimmed) return;
    const resolved = path.isAbsolute(trimmed)
      ? trimmed
      : path.resolve(configDir(), trimmed);
    if (seen.has(resolved)) return;
    if (!fs.existsSync(resolved) || !isExcelPath(resolved)) return;
    seen.add(resolved);
    out.push(resolved);
  }

  for (let i = 1; i < process.argv.length; i++) {
    add(process.argv[i]);
  }

  try {
    const cfgPath = path.join(configDir(), "auto-load.json");
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, "utf8");
      const j = JSON.parse(raw);
      if (Array.isArray(j.excel)) {
        for (let k = 0; k < j.excel.length; k++) add(j.excel[k]);
      }
      if (j.slot0) add(j.slot0);
      if (j.slot1) add(j.slot1);
    }
  } catch (e) {
    console.warn("[yna4] auto-load.json:", e && e.message ? e.message : e);
  }
  return out;
}

function scanConfigPath() {
  return path.join(app.getPath("userData"), "scan-config.json");
}

function readSavedScanDir() {
  try {
    const raw = fs.readFileSync(scanConfigPath(), "utf8");
    const j = JSON.parse(raw);
    const d = String(j.scanDir || "").trim();
    if (!d) return null;
    if (!fs.existsSync(d)) return null;
    const st = fs.statSync(d);
    if (!st.isDirectory()) return null;
    return d;
  } catch (e) {
    return null;
  }
}

function writeSavedScanDir(dirPath) {
  const d = String(dirPath || "").trim();
  if (!d) return;
  fs.mkdirSync(path.dirname(scanConfigPath()), { recursive: true });
  fs.writeFileSync(
    scanConfigPath(),
    JSON.stringify({ scanDir: d }, null, 2),
    "utf8"
  );
}

function getEffectiveScanDir() {
  const saved = readSavedScanDir();
  if (saved) return saved;
  try {
    return app.getPath("downloads");
  } catch (e) {
    return os.homedir();
  }
}

function readHtmlForWindow() {
  const dir = appContentDir();
  const htmlPath = path.join(dir, "보충데이터입력.html");
  let html = fs.readFileSync(htmlPath, "utf8");
  const baseUrl = pathToFileURL(path.join(dir, path.sep)).href;
  if (!/<base\s+href=/i.test(html)) {
    html = html.replace("<head>", '<head>\n  <base href="' + baseUrl + '">');
  }
  const cdn =
    '<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>';
  const vendorPath = path.join(dir, "vendor", "xlsx.full.min.js");
  if (fs.existsSync(vendorPath)) {
    const href = pathToFileURL(vendorPath).href;
    html = html.replace(cdn, '<script src="' + href + '"></script>');
  }
  const tmp = path.join(app.getPath("temp"), "yna4-replenish-boot-" + Date.now() + ".html");
  fs.writeFileSync(tmp, html, "utf8");
  return tmp;
}

function resolveWindowIconPath() {
  const p = path.join(__dirname, "build", "icon.ico");
  return fs.existsSync(p) ? p : undefined;
}

function createWindow() {
  const tmp = readHtmlForWindow();

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    show: false,
    icon: resolveWindowIconPath(),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f172a" : "#f1f5f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      defaultEncoding: "utf-8",
      spellcheck: false,
    },
  });

  win.webContents.once("did-finish-load", function () {
    try {
      if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (eTmp) {}
  });

  win.once("ready-to-show", function () {
    win.show();
  });

  win.loadFile(tmp).catch(function (err) {
    console.error(err);
    dialog.showErrorBox("YNA4 보충", String(err && err.message ? err.message : err));
  });

  win.webContents.on("did-fail-load", function (_e, code, desc, url) {
    dialog.showErrorBox(
      "YNA4 보충",
      "페이지 로드 실패 (" + code + "): " + desc + "\n" + url
    );
  });

  if (!app.isPackaged) {
    try {
      win.webContents.on("console-message", function (_ev, level, message) {
        if (level >= 2) console.log("[renderer]", message);
      });
    } catch (eIgn) {}
  }
}

ipcMain.handle("yna4:get-spec", function () {
  const allPaths = collectAllExcelPaths();
  return { allPaths: allPaths, initialPaths: allPaths };
});

ipcMain.handle("yna4:get-scan-dir", function () {
  const saved = readSavedScanDir();
  const effective = getEffectiveScanDir();
  return {
    savedScanDir: saved,
    effectiveScanDir: effective,
    usingDefaultDownloads: !saved,
  };
});

ipcMain.handle("yna4:pick-scan-folder", async function (event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  const r = await dialog.showOpenDialog(win || undefined, {
    title: "엑셀 파일을 스캔할 폴더 (보통 다운로드)",
    properties: ["openDirectory"],
  });
  if (r.canceled || !r.filePaths || !r.filePaths.length) {
    return { ok: false };
  }
  const picked = r.filePaths[0];
  writeSavedScanDir(picked);
  return { ok: true, scanDir: picked };
});

ipcMain.handle("yna4:resolve-download-excels", function () {
  try {
    const scanDir = getEffectiveScanDir();
    const extras = collectAllExcelPaths();
    const pick = pickMergedScanAndPaths(scanDir, extras);
    const out = {
      ok: true,
      slot0Path: pick.slot0Path || null,
      slot1Tsv: null,
      slot1GroupCount:
        pick.slot1PathGroups && pick.slot1PathGroups.length
          ? pick.slot1PathGroups.length
          : 0,
      scanDir: scanDir,
      extraPathCount: extras.length,
    };
    if (pick.slot0Path) {
      const pe = parseEntry(pick.slot0Path);
      if (!pe || pe.kind !== "sla") {
        out.slot0Path = null;
      }
    }
    if (pick.slot1PathGroups && pick.slot1PathGroups.length) {
      out.slot1Tsv = buildSlot1TsvFromPathGroups(pick.slot1PathGroups);
    }
    return out;
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
    };
  }
});

ipcMain.handle("yna4:read-file", function (_ev, absPath) {
  try {
    const p = String(absPath || "").trim();
    if (!p || !path.isAbsolute(p)) {
      return { ok: false, error: "절대 경로만 허용" };
    }
    if (!isExcelPath(p)) {
      return { ok: false, error: "xlsx/xlsm 만 허용" };
    }
    if (!fs.existsSync(p)) {
      return { ok: false, error: "파일 없음" };
    }
    const buf = fs.readFileSync(p);
    return { ok: true, data: buf.toString("base64") };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle("yna4:apply-selected-files", function (_ev, paths) {
  try {
    const list = Array.isArray(paths) ? paths : [];
    const pick = pickMergedScanAndPaths("", list);
    const out = {
      ok: true,
      slot0Path: pick.slot0Path || null,
      slot1Tsv: null,
      slot1GroupCount:
        pick.slot1PathGroups && pick.slot1PathGroups.length
          ? pick.slot1PathGroups.length
          : 0,
      scanDir: "",
      extraPathCount: list.length,
    };
    if (pick.slot0Path) {
      const pe = parseEntry(pick.slot0Path);
      if (!pe || pe.kind !== "sla") {
        out.slot0Path = null;
      }
    }
    if (pick.slot1PathGroups && pick.slot1PathGroups.length) {
      out.slot1Tsv = buildSlot1TsvFromPathGroups(pick.slot1PathGroups);
    }
    return out;
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
    };
  }
});

ipcMain.handle("yna4:gloc-lookup-batch", async function (_ev, payload) {
  try {
    const raw = payload && payload.barcodes ? payload.barcodes : [];
    const list = Array.isArray(raw) ? raw : [];
    return await glocLookup.runBatch(list, {
      userConfigDir: configDir(),
      bundledConfigPath: resolveGlocBundledConfigPath(),
    });
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
    };
  }
});

let inventoryLoginWin = null;

ipcMain.handle("yna4:open-inventory-login", async function (_ev, payload) {
  const o = payload && typeof payload === "object" ? payload : {};
  const listUrl = String(o.listUrl || "").trim() || "https://inventory.coupang.com/inventory/list";
  let h = "";
  try {
    h = new URL(listUrl).hostname.toLowerCase();
  } catch (eU) {
    return { ok: false, error: "listUrl 형식 오류" };
  }
  if (h !== "inventory.coupang.com") {
    return { ok: false, error: "inventory.coupang.com 만 허용됩니다." };
  }
  if (inventoryLoginWin && !inventoryLoginWin.isDestroyed()) {
    inventoryLoginWin.focus();
    return { ok: true, reused: true };
  }
  inventoryLoginWin = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    title: "재고 로그인 (보충조회 API 쿠키)",
    webPreferences: {
      partition: "persist:yna4-coupang-inventory",
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  inventoryLoginWin.on("closed", function () {
    inventoryLoginWin = null;
  });
  try {
    await inventoryLoginWin.loadURL(listUrl);
  } catch (e) {
    try {
      if (inventoryLoginWin && !inventoryLoginWin.isDestroyed()) inventoryLoginWin.destroy();
    } catch (e2) {}
    inventoryLoginWin = null;
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
  return { ok: true };
});

ipcMain.handle("yna4:print-merge-pdf", async function (event, opts) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    return { ok: false, error: "BrowserWindow 없음" };
  }
  const o = opts && typeof opts === "object" ? opts : {};
  const defName = String(o.defaultFileName || "").trim() || "YNA4보충.pdf";
  const pdfOptions = {
    landscape: o.landscape !== false,
    printBackground: true,
    pageSize: o.pageSize && String(o.pageSize).trim() ? String(o.pageSize).trim() : "A4",
    marginsType:
      o.marginsType != null && !Number.isNaN(Number(o.marginsType))
        ? Number(o.marginsType)
        : 0,
    preferCSSPageSize: o.preferCSSPageSize !== false,
    displayHeaderFooter: false,
  };
  try {
    const data = await win.webContents.printToPDF(pdfOptions);
    const r = await dialog.showSaveDialog(win, {
      title: "PDF 저장",
      defaultPath: defName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (r.canceled || !r.filePath) {
      return { ok: false, canceled: true };
    }
    fs.writeFileSync(r.filePath, data);
    return { ok: true, path: r.filePath };
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
    };
  }
});

ipcMain.handle("yna4:pick-files", async function (event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  const r = await dialog.showOpenDialog(win || undefined, {
    title: "엑셀 여러 개 선택 (이름 규칙으로 ① SLA / ② 이관 자동 분류)",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Excel", extensions: ["xlsx", "xlsm"] },
      { name: "All", extensions: ["*"] },
    ],
  });
  if (r.canceled || !r.filePaths || !r.filePaths.length) return [];
  return r.filePaths;
});

app.whenReady().then(function () {
  createWindow();
  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
