import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { hourLabel } from "@/lib/format";

export type ShiftGroup = { key: string; label: string; from: number; to: number };

export type HourlyRow = {
  label: string;
  /** 0 = 묶음 합계, 1 = 하위, 2 = 하위의 하위 */
  level?: 0 | 1 | 2;
  kind?: "sum" | "sub";
  values: Record<number, number | null | undefined>;
  fmt: (v: number | null | undefined) => string;
  /** 셀 색 (예: 생산성 목표 이상/미만) */
  tone?: (v: number | null | undefined) => string | undefined;
  /** 합계 열 값. 없으면 보이는 시간대 값의 합 */
  total?: (hours: number[]) => number | null;
  /** 이름 뒤 추가 열 (비율, 지연 MH 등) */
  lead?: ReactNode[];
};

type Props = {
  hours: number[];
  groups: ShiftGroup[];
  rows: HourlyRow[];
  leadHeaders?: string[];
  totalLabel?: string;
};

const cell = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";

export default function HourlyTable({ hours, groups, rows, leadHeaders = [], totalLabel = "합계" }: Props) {
  const visibleGroups = groups.filter((g) => hours.some((h) => h >= g.from && h <= g.to));
  const groupStart = new Set(visibleGroups.map((g) => Math.max(g.from, hours[0])));

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-max min-w-full border-collapse text-xs" style={{ minWidth: hours.length > 12 ? "100%" : undefined }}>
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 bg-muted" colSpan={1} />
            <th colSpan={leadHeaders.length + 1} />
            {visibleGroups.map((g) => {
              const span = hours.filter((h) => h >= g.from && h <= g.to).length;
              return (
                <th key={g.key} colSpan={span} className="border-l px-2 py-1.5 text-center font-medium text-foreground">
                  {g.label}
                </th>
              );
            })}
          </tr>
          <tr className="border-b">
            <th className="sticky left-0 z-10 bg-muted px-3 py-1.5 text-left font-medium" />
            {leadHeaders.map((h) => (
              <th key={h} className={cn(cell, "font-medium")}>
                {h}
              </th>
            ))}
            <th className={cn(cell, "font-medium text-foreground")}>{totalLabel}</th>
            {hours.map((h) => (
              <th key={h} className={cn(cell, "font-medium", groupStart.has(h) && "border-l")}>
                {hourLabel(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const total = r.total ? r.total(hours) : hours.reduce((s, h) => s + (r.values[h] || 0), 0);
            const strong = r.kind === "sum";
            return (
              <tr
                key={i}
                className={cn(
                  "border-b last:border-b-0 hover:bg-muted/40",
                  strong && "bg-primary/[0.04] font-semibold",
                  r.kind === "sub" && "bg-muted/30 font-medium"
                )}
              >
                <td
                  className={cn(
                    "sticky left-0 z-10 bg-card px-3 py-1.5 text-left whitespace-nowrap",
                    strong && "bg-[color-mix(in_oklab,var(--card),var(--primary)_4%)]",
                    r.level === 1 && "pl-6 text-muted-foreground",
                    r.level === 2 && "pl-9 text-muted-foreground"
                  )}
                >
                  {r.label}
                </td>
                {(r.lead || []).map((c, j) => (
                  <td key={j} className={cn(cell, "text-muted-foreground")}>
                    {c}
                  </td>
                ))}
                <td className={cn(cell, "font-semibold")}>{r.fmt(total)}</td>
                {hours.map((h) => {
                  const v = r.values[h];
                  return (
                    <td key={h} className={cn(cell, groupStart.has(h) && "border-l", v ? r.tone?.(v) : "")}>
                      {v ? r.fmt(v) : ""}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
