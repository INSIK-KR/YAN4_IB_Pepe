export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "";
  return Math.round(v).toLocaleString("ko-KR");
}

export function fmt1(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "";
  return v.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "";
  return (v * 100).toFixed(1) + "%";
}

/** HourOfWorkDate 8..31 → "08".."07" */
export function hourLabel(h: number): string {
  return String(h % 24).padStart(2, "0");
}

export function todayLocal(): string {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
