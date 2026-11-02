// MOS에서 받기 (exportExcel → getAsyncFileSaveStatus → downloadSavedFile)
import { parseMosTable } from "@/lib/htp-calc.mjs";
import { bridge } from "@/lib/bridge";

export type MosRow = ReturnType<typeof parseMosTable>["rows"][number];
export type MosData = { rows: MosRow[]; workDate: string; source: string; preview: unknown[][] };
export type LoadResult = { ok: true; data: MosData } | { ok: false; error: string };

function fromTable(table: unknown[][], source: string): LoadResult {
  const parsed = parseMosTable(table);
  if (parsed.missing.length) return { ok: false, error: "필요한 열을 찾지 못했습니다: " + parsed.missing.join(", ") };
  if (!parsed.rows.length) return { ok: false, error: "MOS 행이 없습니다." };
  return { ok: true, data: { rows: parsed.rows, workDate: parsed.workDate, source, preview: table.slice(0, 31) } };
}

/** 엑셀/CSV 바이트 → MOS 행. 큰 통합문서도 MOS 시트만 읽는다 */
function loadWorkbook(buf: ArrayBuffer, label: string): LoadResult {
  const XLSX = window.XLSX;
  if (!XLSX) return { ok: false, error: "엑셀 읽기 모듈을 불러오지 못했습니다." };
  const probe = XLSX.read(buf, { type: "array", bookSheets: true });
  const sheetName = probe.SheetNames.indexOf("MOS") >= 0 ? "MOS" : probe.SheetNames[0];
  const wb = XLSX.read(buf, { type: "array", sheets: [sheetName], dense: true });
  const table = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: "" });
  return fromTable(table, label + " [" + sheetName + "]");
}

// ---------- MOS에서 받기 ----------
const MOS_BASE = "https://mos.coupang.net";
const MOS_REFERER = MOS_BASE + "/status/worker-history?resource=38";
const MOS_CENTER_ID = "1007"; // YAN4
const STATUS_POLL_MS = 1500;
const STATUS_POLL_MAX = 600; // 1.5초 × 600 = 15분까지 기다림
const XHR_HEADERS = { "X-Requested-With": "XMLHttpRequest", Accept: "application/json, text/javascript, */*; q=0.01" };

function workerHistoryQuery(date: string): string {
  const p = new URLSearchParams();
  p.set("startDate", date);
  p.set("endDate", date);
  p.set("centerId", MOS_CENTER_ID);
  p.set("contractType", "ALL");
  ["INBOUND", "OTHER", "OUTBOUND"].forEach((t) => p.append("workTypeCdList", t));
  p.set("isAgv", "ALL");
  return p.toString();
}

/**
 * exportExcel 응답에서 파일 ID(UUID)와 파일 이름을 찾는다.
 * 응답 모양을 아직 확인하지 못해 문자열에서 UUID·*.xlsx 를 찾고,
 * 파일 이름이 없으면 MOS 화면과 같은 규칙(worker_history_요청시각.xlsx)으로 만든다.
 */
function parseExportResponse(text: string, requestedAt: Date) {
  const s = String(text || "").replace(/\\\//g, "/");
  const id = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.exec(s);
  if (!id) return null;
  const name = /[\w.-]+\.xlsx/.exec(s);
  const d = requestedAt;
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  return { id: id[0], fileName: name ? name[0] : "worker_history_" + stamp + ".xlsx", nameFromServer: !!name };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export type DownloadResult = { ok: true; data: MosData; bytes: number } | { ok: false; error: string; detail?: string };

export async function downloadFromMos(date: string, onProgress: (msg: string) => void): Promise<DownloadResult> {
  if (!bridge) return { ok: false, error: "앱(exe)에서만 MOS에서 받을 수 있습니다." };
  const st = await bridge.mosStatus();
  if (st.error) return { ok: false, error: "MOS에 연결하지 못했습니다: " + st.error };
  if (!st.loggedIn) return { ok: false, error: "MOS 로그인이 필요합니다. 오른쪽 위 MOS 로그인을 눌러주세요." };

  onProgress("MOS에 엑셀 만들기 요청 중…");
  const requestedAt = new Date();
  const exp = await bridge.mosFetch({
    url: MOS_BASE + "/status/worker-history/exportExcel?" + workerHistoryQuery(date),
    method: "POST",
    body: "",
    contentType: "application/x-www-form-urlencoded; charset=UTF-8",
    referer: MOS_REFERER,
    headers: { ...XHR_HEADERS, Origin: MOS_BASE },
  });
  if (!exp.ok) return { ok: false, error: "엑셀 만들기 실패: " + (exp.error || "HTTP " + exp.status) };
  const rawExport = "exportExcel 응답:\n" + String(exp.body || "").slice(0, 2000);
  const job = parseExportResponse(exp.body || "", requestedAt);
  if (!job && /<html/i.test(exp.body || "")) return { ok: false, error: "MOS 로그인이 끊긴 것 같습니다. 오른쪽 위 MOS 로그인을 다시 해주세요." };
  if (!job) return { ok: false, error: "MOS 응답에서 파일 ID를 찾지 못했습니다. 아래 내용을 개발자에게 전달해 주세요.", detail: rawExport };

  for (let i = 0; ; i++) {
    if (i >= STATUS_POLL_MAX) return { ok: false, error: "15분이 지나도 파일이 준비되지 않았습니다." };
    const res = await bridge.mosFetch({
      url: MOS_BASE + "/common/export-excel/getAsyncFileSaveStatus/" + job.id,
      method: "GET",
      referer: MOS_REFERER,
      headers: XHR_HEADERS,
    });
    if (!res.ok) return { ok: false, error: "진행 확인 실패: " + (res.error || "HTTP " + res.status) };
    let status = "";
    try {
      status = String(JSON.parse(res.body || "{}").status || "").toUpperCase();
    } catch {
      return { ok: false, error: "진행 상태를 읽지 못했습니다.", detail: String(res.body || "").slice(0, 1000) };
    }
    if (status === "SUCCESS") break;
    if (/FAIL|ERROR|CANCEL/.test(status)) return { ok: false, error: "MOS 파일 만들기 실패 (" + status + ")" };
    onProgress("MOS가 엑셀을 만드는 중… " + Math.round(((i + 1) * STATUS_POLL_MS) / 1000) + "초");
    await sleep(STATUS_POLL_MS);
  }

  onProgress("파일 받는 중… " + job.fileName);
  const file = await bridge.mosFetch({
    url: MOS_BASE + "/common/export-excel/downloadSavedFile/" + job.id + "/" + encodeURIComponent(job.fileName),
    method: "GET",
    referer: MOS_REFERER,
    binary: true,
    headers: { Accept: "*/*" },
  });
  if (!file.ok || !file.base64) {
    return {
      ok: false,
      error: "파일 받기 실패: " + (file.error || "HTTP " + file.status) + (job.nameFromServer ? "" : " (파일 이름을 추정해서 요청함)"),
      detail: job.nameFromServer ? undefined : rawExport,
    };
  }

  onProgress("엑셀 읽는 중…");
  await sleep(30);
  const buf = base64ToArrayBuffer(file.base64);
  const loaded = loadWorkbook(buf, "MOS " + date);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  return { ok: true, data: loaded.data, bytes: buf.byteLength };
}
