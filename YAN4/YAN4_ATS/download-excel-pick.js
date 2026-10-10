/**
 * 다운로드 폴더 내 YAN4 이관/SLA 엑셀 파일명 규칙에 따라 경로 선택 (Node, Electron main).
 * 파일명: YYYY-MM-DD_HHMMSS_이름.xlsx  (Chrome (1) 중복 접미사 허용)
 */
const path = require("path");
const fs = require("fs");

const RE_CHROME_DUP = /\s*\(\d+\)\s*(?=\.[^.]+)$/i;
const RE_NAMED =
  /^(\d{4}-\d{2}-\d{2})_(\d{6})_(.+)\.(xlsx|xlsm)$/i;
const RE_TRANSFER_STEM = /^(진열대기|진열중|이동중)(?:_(\d+))?$/;

function normalizeBaseName(fileName) {
  return String(fileName || "").replace(RE_CHROME_DUP, "");
}

function parseEntry(absPath) {
  const baseName = normalizeBaseName(path.basename(absPath));
  const m = RE_NAMED.exec(baseName);
  if (!m) return null;
  const date = m[1];
  const time = m[2];
  const stem = m[3];
  const tsKey = date + "_" + time;
  const tm = RE_TRANSFER_STEM.exec(stem);
  if (tm) {
    const base = tm[1];
    const partNum = tm[2] ? parseInt(tm[2], 10) : 0;
    if (!Number.isFinite(partNum) || partNum < 0) return null;
    return {
      kind: "transfer",
      base,
      partNum,
      tsKey,
      path: absPath,
      stem,
    };
  }
  if (/^SLA$/i.test(stem)) {
    return { kind: "sla", tsKey, path: absPath, stem };
  }
  return null;
}

function scanDownloads(downloadsDir) {
  const out = [];
  if (!downloadsDir || !fs.existsSync(downloadsDir)) return out;
  let names;
  try {
    names = fs.readdirSync(downloadsDir);
  } catch (e) {
    return out;
  }
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    if (!/\.(xlsx|xlsm)$/i.test(n)) continue;
    const abs = path.join(downloadsDir, n);
    let st;
    try {
      st = fs.statSync(abs);
    } catch (e) {
      continue;
    }
    if (!st.isFile()) continue;
    const parsed = parseEntry(abs);
    if (parsed) out.push(parsed);
  }
  return out;
}

function tsCompare(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** @returns {string|null} */
function pickLatestSla(entries) {
  const sla = entries.filter(function (e) {
    return e.kind === "sla";
  });
  if (!sla.length) return null;
  let best = sla[0];
  let j;
  for (j = 1; j < sla.length; j++) {
    if (tsCompare(sla[j].tsKey, best.tsKey) > 0) best = sla[j];
  }
  return best.path;
}

/**
 * 한 이관 라벨(진열대기|진열중|이동중)에 대해: 번호 없음 최신 vs 번호 셋트(동일 tsKey) 중 최신 셋트 비교.
 * 셋트 시간 = 파트 파일 tsKey 중 max (보통 동일).
 * 동률이면 번호 없는 단일 파일 우선.
 * @returns {string[]}
 */
function pickPathsForTransferBase(entries, base) {
  const subset = entries.filter(function (e) {
    return e.kind === "transfer" && e.base === base;
  });
  if (!subset.length) return [];

  const unnum = subset.filter(function (e) {
    return e.partNum === 0;
  });
  const numbered = subset.filter(function (e) {
    return e.partNum > 0;
  });

  let bestUn = null;
  for (let i = 0; i < unnum.length; i++) {
    const e = unnum[i];
    if (!bestUn || tsCompare(e.tsKey, bestUn.tsKey) > 0) bestUn = e;
  }

  const setByTs = new Map();
  for (let k = 0; k < numbered.length; k++) {
    const e = numbered[k];
    if (!setByTs.has(e.tsKey)) setByTs.set(e.tsKey, new Map());
    setByTs.get(e.tsKey).set(e.partNum, e.path);
  }

  let bestSetTs = null;
  let bestSetParts = null;
  setByTs.forEach(function (partMap, tsKey) {
    const nums = Array.from(partMap.keys()).sort(function (a, b) {
      return a - b;
    });
    if (!nums.length) return;
    const paths = nums.map(function (n) {
      return partMap.get(n);
    });
    if (!bestSetTs || tsCompare(tsKey, bestSetTs) > 0) {
      bestSetTs = tsKey;
      bestSetParts = paths;
    }
  });

  if (!bestUn && (!bestSetParts || !bestSetParts.length)) return [];
  if (!bestSetParts || !bestSetParts.length) return [bestUn.path];
  if (!bestUn) return bestSetParts;

  const cmp = tsCompare(bestUn.tsKey, bestSetTs);
  if (cmp > 0) return [bestUn.path];
  if (cmp < 0) return bestSetParts;
  return [bestUn.path];
}

/**
 * @returns {{ slot0Path: string|null, slot1PathGroups: string[][] }}
 */
function pickFromEntries(entries) {
  const slot0Path = pickLatestSla(entries);
  const g0 = pickPathsForTransferBase(entries, "진열대기");
  const g1 = pickPathsForTransferBase(entries, "진열중");
  const g2 = pickPathsForTransferBase(entries, "이동중");
  const slot1PathGroups = [g0, g1, g2].filter(function (g) {
    return g && g.length;
  });
  return { slot0Path, slot1PathGroups };
}

function pickFromDownloads(downloadsDir) {
  return pickFromEntries(scanDownloads(downloadsDir));
}

function mergeEntryLists(a, b) {
  const m = new Map();
  function addAll(arr) {
    if (!arr || !arr.length) return;
    let i;
    for (i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e && e.path) m.set(e.path, e);
    }
  }
  addAll(a);
  addAll(b);
  return Array.from(m.values());
}

/** 스캔 폴더 + 추가 경로(auto-load 등) 합쳐서 엔트리 생성 */
function buildEntriesFromDirAndPaths(downloadsDir, extraAbsPaths) {
  const fromDir = scanDownloads(downloadsDir);
  const fromExtra = [];
  const list = Array.isArray(extraAbsPaths) ? extraAbsPaths : [];
  let i;
  for (i = 0; i < list.length; i++) {
    const p = String(list[i] || "").trim();
    if (!p) continue;
    try {
      if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
    } catch (e) {
      continue;
    }
    if (!/\.(xlsx|xlsm)$/i.test(p)) continue;
    const parsed = parseEntry(p);
    if (parsed) fromExtra.push(parsed);
  }
  return mergeEntryLists(fromDir, fromExtra);
}

function pickMergedScanAndPaths(downloadsDir, extraAbsPaths) {
  return pickFromEntries(
    buildEntriesFromDirAndPaths(downloadsDir, extraAbsPaths)
  );
}

/** auto-load.json 등에 나열된 파일 경로만으로 동일 규칙 적용 (순서 무관) */
function pickFromFilePaths(absPaths) {
  return pickFromEntries(buildEntriesFromDirAndPaths("", absPaths));
}

module.exports = {
  pickFromDownloads,
  pickFromFilePaths,
  pickFromEntries,
  pickMergedScanAndPaths,
  buildEntriesFromDirAndPaths,
  scanDownloads,
  parseEntry,
};
