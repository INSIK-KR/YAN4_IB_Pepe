"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_CFG = {
  enabled: true,
  method: "GET",
  urlTemplate: "",
  bodyTemplate: "",
  contentType: "",
  timeoutMs: 25000,
  delayMsBetweenRequests: 120,
  headers: {},
  noDataHttpStatuses: [404, 204, 410],
  treatAsNoDataIfBodyEmpty: true,
  treatAsNoDataIfJsonEmpty: true,
  treatEmptyObjectAsNoData: true,
  hasDataJsonPath: "",
  /** true: JSON 최상단이 data/items 등만 있고 값이 전부 비어 있으면 '데이터 없음'(초록 처리) */
  inferNoDataFromEmptyJsonWrappers: true,
  /**
   * true: 메타 키 제외 후 본문이 객체·배열 트리 전체가 '의미상 비어 있음'이면 초록.
   * (예: data: { stowList: [] } 처럼 상위 객체는 비어 보이지 않아 기존 휴리스틱이 놓치는 경우)
   */
  inferNoDataFromDeepEmptyPayload: true,
  /** "http" | "coupang_inventory_dom" — 후자는 Electron 창으로 inventory.coupang.com 재고조회 UI를 사용 */
  lookupEngine: "http",
  coupangInventoryListUrl: "https://inventory.coupang.com/inventory/list",
  /** DOM 안정화 대기(한 GC당, ms) */
  coupangSettleMs: 12000,
  /** 목록 URL 첫 로드 후 대기(ms) — 로그인·스크립트 로딩 */
  coupangListReadyMs: 3500,
  /** true면 재고 창을 화면에 표시(디버그·최초 로그인용) */
  coupangInventoryShowWindow: false,
  /**
   * true 이고 sessionPartition 이 있으면 Node fetch 대신 Electron session.fetch 로 쿠키 전송.
   * inventory.coupang.com API 는 로그인 쿠키 필요 → 재고 로그인 창과 동일 partition 권장.
   */
  useElectronSessionFetch: false,
  /** 예: persist:yna4-coupang-inventory */
  sessionPartition: "",
};

function getConfigPath(dir) {
  return path.join(String(dir || ""), "gloc-lookup.json");
}

/**
 * @param {string} userConfigDir 실행 파일 옆(또는 개발 시 프로젝트 configDir)
 * @param {string} [bundledConfigPath] 포장 시 resources/yan4-app/gloc-lookup.json
 */
function readConfig(userConfigDir, bundledConfigPath) {
  const userP = getConfigPath(userConfigDir);
  let p = "";
  let configSource = "user";
  if (fs.existsSync(userP)) {
    p = userP;
    configSource = "user";
  } else if (bundledConfigPath && fs.existsSync(bundledConfigPath)) {
    p = bundledConfigPath;
    configSource = "bundled";
  } else {
    return {
      ok: false,
      error: "gloc-lookup.json 을 찾을 수 없습니다.",
      configPath: userP,
      configHint:
        "포터블이면 resources/yan4-app/gloc-lookup.json 포함 여부를 확인하세요. 개발 중이면 packaged/gloc-lookup.json 이 있는지 확인하세요. 실행 파일 옆 gloc-lookup.json 은 선택 사항입니다(gloc-lookup.example.json 참고).",
    };
  }
  let j;
  try {
    j = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return {
      ok: false,
      error: "gloc-lookup.json 파싱 실패: " + (e && e.message ? e.message : String(e)),
      configPath: p,
    };
  }
  if (!j || typeof j !== "object") {
    return { ok: false, error: "gloc-lookup.json 형식 오류", configPath: p };
  }
  const cfg = Object.assign({}, DEFAULT_CFG, j);
  cfg.lookupEngine = String(cfg.lookupEngine || DEFAULT_CFG.lookupEngine || "http")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (cfg.enabled === false) {
    return {
      ok: false,
      error:
        configSource === "bundled"
          ? "포함된 gloc-lookup.json 에서 조회가 비활성화(enabled: false)되어 있습니다."
          : "gloc-lookup.json 에서 enabled 가 false 입니다.",
      configPath: p,
      configHint:
        configSource === "bundled"
          ? "포함된 gloc-lookup.json 에서 enabled 를 true 로 바꾼 뒤 다시 빌드하거나, 실행 파일 옆 gloc-lookup.json 으로 덮어쓰세요(gloc-lookup.example.json 참고)."
          : "",
    };
  }
  if (cfg.lookupEngine === "coupang_inventory_dom") {
    cfg.coupangInventoryListUrl = String(
      cfg.coupangInventoryListUrl || DEFAULT_CFG.coupangInventoryListUrl || ""
    ).trim();
    cfg.coupangSettleMs = Math.min(
      120000,
      Math.max(2000, Number(cfg.coupangSettleMs) || DEFAULT_CFG.coupangSettleMs)
    );
    cfg.coupangListReadyMs = Math.min(
      60000,
      Math.max(500, Number(cfg.coupangListReadyMs) || DEFAULT_CFG.coupangListReadyMs)
    );
    if (!cfg.urlTemplate || !String(cfg.urlTemplate).trim()) {
      cfg.urlTemplate = "https://inventory.coupang.com/inventory/list?__noop={{loc}}";
    }
  } else {
    const urlT = String(cfg.urlTemplate || "").trim();
    if (!urlT || urlT.indexOf("{{loc}}") === -1) {
      return {
        ok: false,
        error: "urlTemplate 에 {{loc}} 가 필요합니다(로케이션·PL02 바코드가 치환됩니다).",
        configPath: p,
      };
    }
    cfg.urlTemplate = urlT;
  }
  cfg.method = String(cfg.method || "GET").toUpperCase();
  cfg.bodyTemplate = String(cfg.bodyTemplate || "").trim();
  cfg.contentType = String(cfg.contentType || "").trim();
  cfg.headers = cfg.headers && typeof cfg.headers === "object" ? cfg.headers : {};
  cfg.timeoutMs = Math.min(
    120000,
    Math.max(3000, Number(cfg.timeoutMs) || DEFAULT_CFG.timeoutMs)
  );
  cfg.delayMsBetweenRequests = Math.min(
    5000,
    Math.max(0, Number(cfg.delayMsBetweenRequests) || 0)
  );
  cfg.noDataHttpStatuses = Array.isArray(cfg.noDataHttpStatuses)
    ? cfg.noDataHttpStatuses.map(function (x) {
        return Number(x);
      })
    : DEFAULT_CFG.noDataHttpStatuses;
  cfg.hasDataJsonPath = String(cfg.hasDataJsonPath || "").trim();
  cfg.sessionPartition = String(cfg.sessionPartition != null ? cfg.sessionPartition : "").trim();
  cfg.useElectronSessionFetch = cfg.useElectronSessionFetch === true;
  if (
    cfg.lookupEngine === "http" &&
    /inventory\.coupang\.com\/async\/inventory\/search/i.test(String(cfg.urlTemplate || ""))
  ) {
    cfg.headers = Object.assign(
      {
        Accept: "*/*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://inventory.coupang.com/inventory/list",
        "X-Requested-With": "XMLHttpRequest",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      cfg.headers
    );
    if (!cfg.hasDataJsonPath) cfg.hasDataJsonPath = "result.content";
    if (!cfg.sessionPartition) cfg.sessionPartition = "persist:yna4-coupang-inventory";
    if (!Object.prototype.hasOwnProperty.call(j, "useElectronSessionFetch")) {
      cfg.useElectronSessionFetch = true;
    }
  }
  return {
    ok: true,
    cfg: cfg,
    configPath: p,
    configSource: configSource,
  };
}

function isUrlAllowed(u) {
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:") {
      const h = parsed.hostname.toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    }
  } catch (e) {
    return false;
  }
  return false;
}

function buildUrl(cfg, barcode) {
  const raw = String(barcode || "");
  const enc = encodeURIComponent(raw);
  const jsonQuoted = JSON.stringify(raw);
  const jsonInner = jsonQuoted.slice(1, Math.max(1, jsonQuoted.length - 1));
  return String(cfg.urlTemplate)
    .split("{{locJson}}")
    .join(jsonQuoted)
    .split("{{loc}}")
    .join(enc)
    .split("{{locRaw}}")
    .join(raw)
    .split("{{locJsonInner}}")
    .join(jsonInner);
}

function buildBody(cfg, barcode) {
  const bt = cfg.bodyTemplate;
  if (!bt) return null;
  const raw = String(barcode || "");
  const enc = encodeURIComponent(raw);
  const jsonQuoted = JSON.stringify(raw);
  const jsonInner = jsonQuoted.slice(1, Math.max(1, jsonQuoted.length - 1));
  return bt
    .split("{{locJson}}")
    .join(jsonQuoted)
    .split("{{loc}}")
    .join(enc)
    .split("{{locRaw}}")
    .join(raw)
    .split("{{locJsonInner}}")
    .join(jsonInner);
}

function getByPath(obj, dotPath) {
  const parts = String(dotPath || "")
    .split(".")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  let cur = obj;
  let i;
  for (i = 0; i < parts.length; i++) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

const JSON_WRAPPER_PAYLOAD_KEYS = new Set([
  "data",
  "items",
  "results",
  "records",
  "list",
  "rows",
  "content",
  "payload",
  "result",
  "locations",
  "stows",
  "stowlist",
  "inventory",
  "stock",
  "detail",
  "details",
  "value",
  "body",
]);
const JSON_WRAPPER_META_KEYS = new Set([
  "success",
  "message",
  "msg",
  "code",
  "status",
  "statuscode",
  "httpstatus",
  "timestamp",
  "ts",
  "traceid",
  "errorcode",
  "error",
  "err",
  "exception",
  "path",
  "requestid",
  "request_id",
]);

function isJsonValueEmptyishForGloc(v) {
  if (v == null) return true;
  if (typeof v === "boolean") return v === false;
  if (typeof v === "number") return v === 0 || Number.isNaN(v);
  if (typeof v === "string") return !String(v).trim();
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

/**
 * 재고·로케이션 API에서 "표시할 내용 없음"에 가까운 트리인지(중첩 포함).
 * 숫자 0·false·빈 문자열·빈 배열·키 없는 객체만이면 비어 있음으로 본다.
 * @param {number} depth
 * @returns {boolean|null} null = 너무 깊거나 알 수 없음(보수적으로 상위에서 처리)
 */
function isJsonTreeSemanticallyEmptyForNoInventory(v, depth) {
  const max = 10;
  if (depth > max) return null;
  if (v == null) return true;
  if (typeof v === "boolean") return v === false;
  if (typeof v === "number") return v === 0 || Number.isNaN(v);
  if (typeof v === "string") return !String(v).trim();
  if (Array.isArray(v)) {
    if (v.length === 0) return true;
    for (let i = 0; i < v.length; i++) {
      const inner = isJsonTreeSemanticallyEmptyForNoInventory(v[i], depth + 1);
      if (inner === null) return null;
      if (!inner) return false;
    }
    return true;
  }
  if (typeof v === "object") {
    const keys = Object.keys(v);
    if (!keys.length) return true;
    for (let k = 0; k < keys.length; k++) {
      const inner = isJsonTreeSemanticallyEmptyForNoInventory(v[keys[k]], depth + 1);
      if (inner === null) return null;
      if (!inner) return false;
    }
    return true;
  }
  return false;
}

/**
 * @returns {boolean|null} false = 데이터 없음, null = 해당 없음
 */
function inferNoDataFromDeepEmptyJsonBody(bodyText, cfg) {
  if (cfg.inferNoDataFromDeepEmptyPayload === false) return null;
  const t = String(bodyText != null ? bodyText : "").trim();
  if (!t || t.charAt(0) !== "{") return null;
  let j;
  try {
    j = JSON.parse(t);
  } catch (e) {
    return null;
  }
  if (typeof j !== "object" || j === null || Array.isArray(j)) return null;
  const residue = {};
  let k;
  for (k in j) {
    if (!Object.prototype.hasOwnProperty.call(j, k)) continue;
    if (JSON_WRAPPER_META_KEYS.has(String(k || "").toLowerCase())) continue;
    residue[k] = j[k];
  }
  const rk = Object.keys(residue);
  if (!rk.length) return false;
  const deep = isJsonTreeSemanticallyEmptyForNoInventory(residue, 0);
  if (deep === null) return null;
  return deep ? false : null;
}

/**
 * @returns {boolean|null} false = 데이터 없음, null = 이 휴리스틱 해당 없음
 */
function inferNoDataFromJsonWrapperBody(bodyText) {
  const t = String(bodyText != null ? bodyText : "").trim();
  if (!t || t.charAt(0) !== "{") return null;
  try {
    const j = JSON.parse(t);
    if (typeof j !== "object" || j === null || Array.isArray(j)) return null;
    const keys = Object.keys(j);
    if (!keys.length) return false;
    const payloadKeys = keys.filter(function (k) {
      return !JSON_WRAPPER_META_KEYS.has(String(k || "").toLowerCase());
    });
    if (!payloadKeys.length) return null;
    const onlyPayload =
      payloadKeys.length > 0 &&
      payloadKeys.every(function (k) {
        return JSON_WRAPPER_PAYLOAD_KEYS.has(String(k || "").toLowerCase());
      });
    if (!onlyPayload) return null;
    for (let i = 0; i < payloadKeys.length; i++) {
      if (!isJsonValueEmptyishForGloc(j[payloadKeys[i]])) return null;
    }
    return false;
  } catch (e) {
    return null;
  }
}

/**
 * @returns {boolean|null} true = has data (do not mark complete), false = no data (mark complete), null = ambiguous error
 */
function interpretResponse(status, bodyText, cfg) {
  const noSet = new Set(cfg.noDataHttpStatuses || []);
  if (noSet.has(status)) return false;
  if (status < 200 || status >= 300) return null;

  const t = String(bodyText != null ? bodyText : "").trim();
  const pathStr = cfg.hasDataJsonPath;
  if (pathStr) {
    try {
      const j = JSON.parse(t);
      const v = getByPath(j, pathStr);
      if (Array.isArray(v)) return v.length > 0;
      if (v != null && typeof v === "object") return Object.keys(v).length > 0;
      return !!v;
    } catch (eP) {
      return t.length > 0 ? true : false;
    }
  }

  if (cfg.treatAsNoDataIfBodyEmpty !== false) {
    if (!t) return false;
  }
  if (cfg.treatAsNoDataIfJsonEmpty !== false) {
    if (t === "[]" || t === "null") return false;
    if (t === "{}" && cfg.treatEmptyObjectAsNoData !== false) return false;
    try {
      const j = JSON.parse(t);
      if (j === null) return false;
      if (Array.isArray(j) && j.length === 0) return false;
      if (
        typeof j === "object" &&
        j !== null &&
        !Array.isArray(j) &&
        cfg.treatEmptyObjectAsNoData !== false &&
        Object.keys(j).length === 0
      ) {
        return false;
      }
    } catch (eJ) {
      /* keep */
    }
  }
  if (cfg.inferNoDataFromEmptyJsonWrappers !== false) {
    const inferred = inferNoDataFromJsonWrapperBody(t);
    if (inferred === false) return false;
  }
  if (cfg.inferNoDataFromDeepEmptyPayload !== false) {
    const deepInf = inferNoDataFromDeepEmptyJsonBody(t, cfg);
    if (deepInf === false) return false;
  }
  return true;
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string | null, signal?: AbortSignal }} init
 * @param {object} cfg
 */
async function fetchWithSessionOrGlobal(url, init, cfg) {
  if (cfg.useElectronSessionFetch && String(cfg.sessionPartition || "").trim()) {
    try {
      const electron = require("electron");
      const sess = electron.session.fromPartition(String(cfg.sessionPartition).trim());
      return await sess.fetch(url, init);
    } catch (eS) {
      return await fetch(url, init);
    }
  }
  return await fetch(url, init);
}

async function fetchOne(barcode, cfg) {
  const url = buildUrl(cfg, barcode);
  if (!isUrlAllowed(url)) {
    return {
      barcode: barcode,
      error: "허용되지 않은 URL(https 또는 localhost http 만)",
      markComplete: false,
    };
  }
  const headers = Object.assign({ Accept: "*/*" }, cfg.headers);
  const method = cfg.method === "POST" ? "POST" : "GET";
  let body = null;
  if (method === "POST" && cfg.bodyTemplate) {
    body = buildBody(cfg, barcode);
    const ct = cfg.contentType || "application/json";
    if (ct && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = ct;
    }
  }
  const ac = new AbortController();
  const tid = setTimeout(function () {
    ac.abort();
  }, cfg.timeoutMs);
  let res;
  try {
    res = await fetchWithSessionOrGlobal(
      url,
      {
        method: method,
        headers: headers,
        body: body,
        signal: ac.signal,
      },
      cfg
    );
  } catch (e) {
    clearTimeout(tid);
    const msg = e && e.name === "AbortError" ? "타임아웃" : String(e && e.message ? e.message : e);
    return { barcode: barcode, error: msg, markComplete: false };
  }
  clearTimeout(tid);
  const status = res.status;
  let text = "";
  try {
    text = await res.text();
  } catch (eT) {
    return { barcode: barcode, error: "읽기 실패", markComplete: false, status: status };
  }
  try {
    const j = JSON.parse(text);
    if (j && j.success === false) {
      return {
        barcode: barcode,
        error: String(j.message != null ? j.message : "success=false"),
        markComplete: false,
        status: status,
      };
    }
  } catch (eJ) {
    /* not JSON */
  }
  const has = interpretResponse(status, text, cfg);
  if (has === null) {
    return {
      barcode: barcode,
      error: "HTTP " + status,
      markComplete: false,
      status: status,
    };
  }
  return {
    barcode: barcode,
    markComplete: !has,
    status: status,
  };
}

/**
 * @param {string[]} barcodes
 * @param {{ userConfigDir: string, bundledConfigPath?: string }} paths
 */
async function runBatch(barcodes, paths) {
  const userDir = paths && paths.userConfigDir ? paths.userConfigDir : "";
  const bundled =
    paths && paths.bundledConfigPath ? String(paths.bundledConfigPath) : "";
  const rd = readConfig(userDir, bundled);
  if (!rd.ok) {
    return {
      ok: false,
      error: rd.error,
      configPath: rd.configPath,
      configHint: rd.configHint || "",
    };
  }
  const cfg = rd.cfg;
  const seen = new Set();
  const list = [];
  let i;
  for (i = 0; i < barcodes.length; i++) {
    const b = String(barcodes[i] || "").trim();
    if (!b || seen.has(b)) continue;
    seen.add(b);
    list.push(b);
  }
  if (list.length > 800) {
    return { ok: false, error: "한 번에 최대 800개 바코드만 조회할 수 있습니다." };
  }
  if (cfg.lookupEngine === "coupang_inventory_dom") {
    let coupangDom;
    try {
      coupangDom = require("./coupang-inventory-dom-lookup");
    } catch (eReq) {
      return {
        ok: false,
        error: "coupang-inventory-dom-lookup 로드 실패: " + (eReq && eReq.message ? eReq.message : String(eReq)),
        configPath: rd.configPath,
      };
    }
    try {
      const domOut = await coupangDom.runBatch(list, cfg);
      if (!domOut.ok) {
        return Object.assign({}, domOut, { configPath: rd.configPath });
      }
      return Object.assign({}, domOut, { configPath: rd.configPath });
    } catch (eDom) {
      return {
        ok: false,
        error: eDom && eDom.message ? eDom.message : String(eDom),
        configPath: rd.configPath,
      };
    }
  }
  const results = [];
  let noDataCount = 0;
  for (i = 0; i < list.length; i++) {
    if (i > 0 && cfg.delayMsBetweenRequests > 0) {
      await sleep(cfg.delayMsBetweenRequests);
    }
    const one = await fetchOne(list[i], cfg);
    results.push(one);
    if (!one.error && one.markComplete) noDataCount += 1;
  }
  return {
    ok: true,
    results: results,
    noDataCount: noDataCount,
    configPath: rd.configPath,
  };
}

module.exports = {
  runBatch: runBatch,
  getConfigPath: getConfigPath,
};
