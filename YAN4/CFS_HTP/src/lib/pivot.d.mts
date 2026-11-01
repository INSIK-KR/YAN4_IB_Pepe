// pivot.mjs 타입
import type { MosRow } from "./htp-calc.mjs";

export type PivotFieldKey = "group" | "task" | "channel" | "temp" | "pick" | "shiftGroup" | "hourName" | "contract" | "location" | "employee";
export type PivotMeasureKey = "qty" | "mh" | "hc" | "uph";
export type PreparedRow = Record<PivotFieldKey, string> & { qty: number; mh: number };
export type PivotConfig = {
  row1: PivotFieldKey;
  row2: PivotFieldKey | "";
  col: PivotFieldKey;
  measure: PivotMeasureKey;
  filters: Partial<Record<PivotFieldKey, string>>;
};
export type PivotRow = { key: string; label: string; values: Record<string, number | null>; total: number | null; children: PivotRow[] };
export type PivotResult = { cols: string[]; rows: PivotRow[]; colTotals: Record<string, number | null>; grandTotal: number | null; max: number };

export const PIVOT_FIELDS: { key: PivotFieldKey; label: string; order?: string[] }[];
export const PIVOT_MEASURES: { key: PivotMeasureKey; label: string }[];
export function preparePivotRows(rows: MosRow[]): PreparedRow[];
export function computePivot(prepared: PreparedRow[], config: PivotConfig): PivotResult;
export function fieldValues(prepared: PreparedRow[], field: PivotFieldKey): string[];
