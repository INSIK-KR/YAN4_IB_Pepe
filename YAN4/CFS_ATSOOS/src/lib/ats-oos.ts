import type { SheetCell } from "./bridge";

export type AtsOosTable = { columns: string[]; rows: string[][] };

// 주문번호 같은 긴 숫자가 지수·콤마 표기로 바뀌지 않게 날짜 칸만 표시 형식을 쓴다
function cellText(cell: SheetCell | undefined): string {
  if (!cell || cell.v == null) return "";
  if (cell.t === "n" && cell.z && window.XLSX!.SSF.is_date(cell.z) && cell.w) return cell.w;
  return String(cell.v);
}

/** Power BI 내보내기 엑셀에서 머리글 줄을 찾아 데이터만 꺼낸다 (필터 안내 줄은 제외) */
export function parseAtsOosExport(base64: string): AtsOosTable {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error("엑셀 읽기 도구를 불러오지 못했습니다");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const book = XLSX.read(bytes.buffer, { type: "array", cellNF: true });

  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    const ref = sheet["!ref"];
    if (typeof ref !== "string") continue;
    const range = XLSX.utils.decode_range(ref);
    const all: string[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        row.push(cellText(sheet[XLSX.utils.encode_cell({ r, c })] as SheetCell | undefined));
      }
      all.push(row);
    }
    const headerIndex = all.findIndex((row) => row.includes("oos_date") && row.includes("ordernumber"));
    if (headerIndex < 0) continue;
    const columns = all[headerIndex];
    const centerIndex = columns.indexOf("centercode");
    if (centerIndex < 0) continue;
    return { columns, rows: all.slice(headerIndex + 1).filter((row) => row[centerIndex] !== "") };
  }
  throw new Error("엑셀에서 ATS OOS 머리글을 찾지 못했습니다");
}
