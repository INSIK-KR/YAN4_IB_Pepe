import type { AtsOosTable } from "./ats-oos";

export type TransferCells = { load: string; unload: string; stow: string; vehicle: string };

// 같은 오더넘버·GC가 다른 센터에 있을 수 있어 센터까지 묶어서 구분한다
export const cutlineKey = (center: string, order: string) => center + "|" + order;
export const transferKey = (center: string, cart: string, ct: string) => center + "|" + cart + "|" + ct;

export const VERDICTS = ["상차 지연", "하차 지연", "진열 지연", "커트라인 전 진열", "판단 불가"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const LATE_VERDICTS: Verdict[] = ["상차 지연", "하차 지연", "진열 지연"];

export type OverviewRow = {
  center: string;
  order: string;
  temperature: string;
  fromFc: string;
  f3sd: string;
  rca3: string;
  units: number;
  cutline: string;
  cutlineMs: number | null;
  load: string;
  unload: string;
  stow: string;
  verdict: Verdict;
  lateMinutes: number | null;
};

export type Tally = { key: string; units: number; rows: number };

/** WMS 시간 문구를 시각으로. 연도가 없으면 OOS 날짜의 연도를 쓰고, 시간만 있으면 날짜를 알 수 없어 null */
export function parseStamp(text: string, baseYear: number): number | null {
  const s = String(text || "").trim();
  const m =
    /(?:(\d{4})[-./])?(\d{1,2})[-./](\d{1,2})[\sT]+(오전|오후)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(s);
  if (!m) return null;
  let hour = Number(m[5]);
  const pm = m[4] === "오후" || /pm/i.test(m[8] || "");
  const am = m[4] === "오전" || /am/i.test(m[8] || "");
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  return new Date(m[1] ? Number(m[1]) : baseYear, Number(m[2]) - 1, Number(m[3]), hour, Number(m[6]), Number(m[7] || 0)).getTime();
}

/** 운송장이 여러 개면 " / "로 이어져 있다. 그중 가장 늦은 커트라인을 기준으로 삼는다 */
function latestStamp(text: string, baseYear: number): number | null {
  const stamps = String(text || "")
    .split(" / ")
    .map((part) => parseStamp(part, baseYear))
    .filter((v): v is number => v !== null);
  return stamps.length ? Math.max(...stamps) : null;
}

function judge(cut: number | null, load: number | null, unload: number | null, stow: number | null): { verdict: Verdict; lateMinutes: number | null } {
  if (cut === null || (load === null && unload === null && stow === null)) return { verdict: "판단 불가", lateMinutes: null };
  const minutes = (t: number) => Math.round((t - cut) / 60000);
  if (load !== null && load > cut) return { verdict: "상차 지연", lateMinutes: minutes(load) };
  if (unload !== null && unload > cut) return { verdict: "하차 지연", lateMinutes: minutes(unload) };
  if (stow !== null && stow > cut) return { verdict: "진열 지연", lateMinutes: minutes(stow) };
  return stow !== null ? { verdict: "커트라인 전 진열", lateMinutes: null } : { verdict: "판단 불가", lateMinutes: null };
}

export function buildOverviewRows(
  table: AtsOosTable & { date: string },
  cutlines: Record<string, string>,
  transfers: Record<string, TransferCells>
): OverviewRow[] {
  const col = (name: string) => table.columns.indexOf(name);
  const at = (row: string[], index: number) => (index >= 0 ? row[index] || "" : "");
  const iCenter = col("centercode");
  const iOrder = col("ordernumber");
  const iTemp = col("temperature");
  const iFrom = col("from FC");
  const iF3 = col("F3_SD");
  const iRca = col("RCA_Level_3");
  const iUnits = col("units");
  const iCart = col("cartbarcode");
  const iCt = col("ctbarcode");
  const year = Number(table.date.slice(0, 4));

  return table.rows.map((row) => {
    const center = at(row, iCenter);
    const order = at(row, iOrder);
    const cutline = cutlines[cutlineKey(center, order)] ?? "";
    const pair = transfers[transferKey(center, at(row, iCart), at(row, iCt))];
    const load = pair?.load ?? "";
    const unload = pair?.unload ?? "";
    const stow = pair?.stow ?? "";
    const cutlineMs = latestStamp(cutline, year);
    return {
      center,
      order,
      temperature: at(row, iTemp) || "(없음)",
      fromFc: at(row, iFrom) || "(없음)",
      f3sd: at(row, iF3) || "(없음)",
      rca3: at(row, iRca) || "(없음)",
      units: Number(at(row, iUnits)) || 0,
      cutline,
      cutlineMs,
      load,
      unload,
      stow,
      ...judge(cutlineMs, parseStamp(load, year), parseStamp(unload, year), parseStamp(stow, year)),
    };
  });
}

export function tally(rows: OverviewRow[], keyOf: (row: OverviewRow) => string): Tally[] {
  const map = new Map<string, Tally>();
  for (const row of rows) {
    const key = keyOf(row);
    const item = map.get(key) ?? { key, units: 0, rows: 0 };
    item.units += row.units;
    item.rows += 1;
    map.set(key, item);
  }
  return [...map.values()].sort((a, b) => b.units - a.units || a.key.localeCompare(b.key));
}

/** 항목이 많으면 뒤쪽을 "기타"로 묶는다 */
export function topWithOther(items: Tally[], limit: number): Tally[] {
  if (items.length <= limit) return items;
  const rest = items.slice(limit);
  return [...items.slice(0, limit), { key: `기타 ${rest.length}개`, units: rest.reduce((s, i) => s + i.units, 0), rows: rest.reduce((s, i) => s + i.rows, 0) }];
}

export function cutlineLabel(ms: number | null): string {
  if (ms === null) return "커트라인 없음";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatLate(minutes: number | null): string {
  if (minutes === null) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return "+" + (h ? `${h}시간 ` : "") + `${m}분`;
}
