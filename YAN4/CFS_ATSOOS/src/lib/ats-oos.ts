import type { SheetCell } from "./bridge";

export type AtsOosTable = { columns: string[]; rows: string[][] };

const DATE_COLUMN = /date|time|stowed|eligible/i;
const TIME_COLUMN = /time|stowed|eligible/i;
// 이 범위(1982~2119년) 밖의 숫자는 날짜 열이어도 시리얼 값으로 보지 않는다
const isSerial = (v: number) => v >= 30000 && v < 80000;

/** 엑셀 날짜 시리얼을 2026-11-08 또는 2026-11-08 00:09:32 형태로 */
function serialText(serial: number, column: string): string {
  const seconds = Math.round(serial * 86400);
  const iso = new Date(Date.UTC(1899, 11, 30) + seconds * 1000).toISOString();
  const withTime = TIME_COLUMN.test(column) || seconds % 86400 !== 0;
  return iso.slice(0, 10) + (withTime ? " " + iso.slice(11, 19) : "");
}

// 주문번호 같은 긴 숫자가 지수·콤마 표기로 바뀌지 않게 날짜 칸만 변환한다.
// Power BI 파일은 날짜 열의 셀 서식이 날짜로 읽히지 않을 수 있어 열 이름으로도 판단한다
function cellText(cell: SheetCell | undefined, column: string): string {
  if (!cell || cell.v == null) return "";
  if (cell.t === "n" && typeof cell.v === "number" && isSerial(cell.v)) {
    const dated = DATE_COLUMN.test(column) || (cell.z ? window.XLSX!.SSF.is_date(cell.z) : false);
    if (dated) return serialText(cell.v, column);
  }
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
    const readRow = (r: number, nameOf: (c: number) => string) => {
      const row: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        row.push(cellText(sheet[XLSX.utils.encode_cell({ r, c })] as SheetCell | undefined, nameOf(c - range.s.c)));
      }
      return row;
    };
    let columns: string[] | null = null;
    const rows: string[][] = [];
    let centerIndex = -1;
    for (let r = range.s.r; r <= range.e.r; r++) {
      if (!columns) {
        const row = readRow(r, () => "");
        if (row.includes("centercode") && row.includes("ordernumber")) {
          columns = row;
          centerIndex = row.indexOf("centercode");
        }
        continue;
      }
      const names: string[] = columns;
      const row = readRow(r, (c) => names[c]);
      if (row[centerIndex] !== "") rows.push(row);
    }
    if (columns) return { columns, rows };
  }
  throw new Error("엑셀에서 ATS OOS 머리글을 찾지 못했습니다");
}
