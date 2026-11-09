import type { AtsOosTable } from "./ats-oos";
import { EVIDENCE_HEADERS, TRANSFER_COLUMNS, buildOverviewRows, cutlineKey, formatLate, transferKey, type TransferCells } from "./overview";

type Cell = string | number;

function sheetFrom(rows: Cell[][]) {
  const XLSX = window.XLSX!;
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const widths = rows[0].map((_, c) => Math.min(40, Math.max(...rows.map((row) => String(row[c] ?? "").length)) + 2));
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  return sheet;
}

/** 취합 데이터와 OOS 사유 근거 두 시트. 화면 표와 달리 항상 전체 행을 담는다 */
export function buildExportBase64(table: AtsOosTable & { date: string }, cutlines: Record<string, string>, transfers: Record<string, TransferCells>): string {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error("엑셀 도구를 불러오지 못했습니다");
  const col = (name: string) => table.columns.indexOf(name);
  const iCenter = col("centercode");
  const iOrder = col("ordernumber");
  const iSku = col("externalskuid");
  const iCart = col("cartbarcode");
  const iCt = col("ctbarcode");
  const iUnits = col("units");

  const merged: Cell[][] = [[...table.columns, "출고 커트라인", ...TRANSFER_COLUMNS.map(([, label]) => label)]];
  for (const row of table.rows) {
    const center = row[iCenter];
    const pair = transfers[transferKey(center, row[iCart], row[iCt] ?? "")];
    merged.push([
      ...row.map((value, i): Cell => (i === iUnits && value !== "" ? Number(value) : value)),
      cutlines[cutlineKey(center, row[iOrder], row[iSku] ?? "")] ?? "",
      ...TRANSFER_COLUMNS.map(([key]) => pair?.[key] ?? ""),
    ]);
  }

  const evidence: Cell[][] = [
    EVIDENCE_HEADERS,
    ...buildOverviewRows(table, cutlines, transfers).map((r): Cell[] => [
      r.center,
      r.order,
      r.temperature,
      r.cutline,
      r.load,
      r.unload,
      r.stow,
      r.verdict,
      formatLate(r.lateMinutes),
      r.rca3,
      r.fromFc,
      r.f3sd,
      r.units,
    ]),
  ];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheetFrom(merged), "취합 데이터");
  XLSX.utils.book_append_sheet(book, sheetFrom(evidence), "OOS 사유 근거");
  return XLSX.write(book, { type: "base64", bookType: "xlsx" });
}

export function exportFileName(centers: string[], date: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const label = centers.length > 3 ? centers.length + "개센터" : centers.join("_");
  return `ATS_OOS_${label}_${date}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
