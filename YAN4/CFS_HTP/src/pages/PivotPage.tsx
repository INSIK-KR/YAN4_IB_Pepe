import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computePivot, fieldValues, PIVOT_FIELDS, PIVOT_MEASURES, type PivotConfig, type PivotFieldKey, type PivotMeasureKey, type PivotRow, type PreparedRow } from "@/lib/pivot.mjs";
import { PIVOT_PRESETS } from "@/lib/pivot-presets";
import { fmt1, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = { prepared: PreparedRow[]; config: PivotConfig; onChange: (next: PivotConfig) => void };
type Sort = { col: string; dir: "desc" | "asc" } | null;

const NONE = "__none__";
const FILTER_FIELDS: PivotFieldKey[] = ["group", "task", "channel", "temp", "pick", "shiftGroup"];
const TOTAL_COL = "__total__";

function labelOf(field: PivotFieldKey | "") {
  return PIVOT_FIELDS.find((f) => f.key === field)?.label ?? "";
}

function Field({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-36 bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

export default function PivotPage({ prepared, config, onChange }: Props) {
  const [sort, setSort] = useState<Sort>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const result = useMemo(() => computePivot(prepared, config), [prepared, config]);
  const filterOptions = useMemo(() => {
    const out = {} as Record<PivotFieldKey, string[]>;
    FILTER_FIELDS.forEach((f) => (out[f] = fieldValues(prepared, f)));
    return out;
  }, [prepared]);

  const fmt = config.measure === "mh" || config.measure === "uph" ? fmt1 : fmtInt;
  const update = (patch: Partial<PivotConfig>) => {
    setSort(null);
    setCollapsed(new Set());
    onChange({ ...config, ...patch });
  };

  function sorted(list: PivotRow[]): PivotRow[] {
    if (!sort) return list;
    const val = (r: PivotRow) => (sort.col === TOTAL_COL ? r.total : r.values[sort.col]) || 0;
    return [...list].sort((a, b) => (sort.dir === "desc" ? val(b) - val(a) : val(a) - val(b)));
  }
  const clickSort = (col: string) => setSort((s) => (s?.col !== col ? { col, dir: "desc" } : s.dir === "desc" ? { col, dir: "asc" } : null));

  const heat = (v: number | null | undefined) => (v && result.max ? { backgroundColor: `rgba(42, 120, 214, ${(0.03 + 0.42 * (v / result.max)).toFixed(3)})` } : undefined);
  const sortIcon = (col: string) => (sort?.col === col ? sort.dir === "desc" ? <ArrowDown className="inline size-3" /> : <ArrowUp className="inline size-3" /> : null);
  const hasChildren = result.rows.some((r) => r.children.length > 0);
  const presetKey = PIVOT_PRESETS.find((p) => JSON.stringify(p.config) === JSON.stringify(config))?.key;

  async function copyTable() {
    const head = [labelOf(config.row1), ...(config.row2 ? [labelOf(config.row2)] : []), ...result.cols, "합계"];
    const line = (a: string, b: string | null, r: { values: Record<string, number | null>; total: number | null }) =>
      [a, ...(b === null ? [] : [b]), ...result.cols.map((c) => r.values[c] ?? ""), r.total ?? ""].join("\t");
    const lines = [head.join("\t")];
    sorted(result.rows).forEach((r) => {
      lines.push(line(r.label, config.row2 ? "" : null, r));
      sorted(r.children).forEach((k) => lines.push(line(r.label, k.label, k)));
    });
    lines.push(line("합계", config.row2 ? "" : null, { values: result.colTotals, total: result.grandTotal }));
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("표를 복사했습니다. 엑셀에 붙여넣을 수 있어요.");
    } catch (e) {
      toast.error("복사하지 못했습니다: " + (e as Error).message);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold tracking-tight">피벗</h1>
        <p className="text-sm text-muted-foreground">입고 공정 자료를 행·열·값을 골라 묶어 봅니다. MH에는 체크인 지연이 들어가지 않습니다.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PIVOT_PRESETS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={presetKey === p.key ? "default" : "outline"}
            onClick={() => {
              setSort(null);
              setCollapsed(new Set());
              onChange(p.config);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <Card size="sm">
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="행" value={config.row1} onChange={(v) => update({ row1: v as PivotFieldKey, row2: config.row2 === v ? "" : config.row2 })}>
              {PIVOT_FIELDS.filter((f) => f.key !== config.col).map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.label}
                </SelectItem>
              ))}
            </Field>
            <Field label="하위 행" value={config.row2 || NONE} onChange={(v) => update({ row2: v === NONE ? "" : (v as PivotFieldKey) })}>
              <SelectItem value={NONE}>없음</SelectItem>
              {PIVOT_FIELDS.filter((f) => f.key !== config.row1 && f.key !== config.col).map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.label}
                </SelectItem>
              ))}
            </Field>
            <Field label="열" value={config.col} onChange={(v) => update({ col: v as PivotFieldKey })}>
              {PIVOT_FIELDS.filter((f) => f.key !== config.row1 && f.key !== config.row2).map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.label}
                </SelectItem>
              ))}
            </Field>
            <Field label="값" value={config.measure} onChange={(v) => update({ measure: v as PivotMeasureKey })}>
              {PIVOT_MEASURES.map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.label}
                </SelectItem>
              ))}
            </Field>
            <div className="ml-auto flex gap-2">
              {hasChildren && (
                <Button size="sm" variant="outline" onClick={() => setCollapsed((c) => (c.size ? new Set() : new Set(result.rows.map((r) => r.key))))}>
                  {collapsed.size ? "모두 펼치기" : "모두 접기"}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={copyTable}>
                <ClipboardCopy />표 복사
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t pt-3">
            {FILTER_FIELDS.map((f) => (
              <Field
                key={f}
                label={labelOf(f) + " 필터"}
                value={config.filters[f] || NONE}
                onChange={(v) => update({ filters: { ...config.filters, [f]: v === NONE ? undefined : v } })}
              >
                <SelectItem value={NONE}>전체</SelectItem>
                {filterOptions[f].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </Field>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="py-0">
        <div className="max-h-[calc(100vh-22rem)] min-h-64 overflow-auto rounded-xl">
          <table className="w-max min-w-full border-separate border-spacing-0 text-xs tabular-nums">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 border-r border-b bg-muted px-3 py-2 text-left font-medium whitespace-nowrap">
                  {labelOf(config.row1)}
                  {config.row2 && " › " + labelOf(config.row2)}
                  <span className="ml-2 font-normal text-muted-foreground">{labelOf(config.col)} →</span>
                </th>
                {result.cols.map((c) => (
                  <th key={c} className="cursor-pointer border-b bg-muted px-2 py-2 text-right font-medium whitespace-nowrap hover:bg-accent" onClick={() => clickSort(c)}>
                    {c} {sortIcon(c)}
                  </th>
                ))}
                <th className="sticky right-0 z-30 cursor-pointer border-b border-l bg-muted px-3 py-2 text-right font-semibold whitespace-nowrap" onClick={() => clickSort(TOTAL_COL)}>
                  합계 {sortIcon(TOTAL_COL)}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted(result.rows).map((r) => {
                const open = !collapsed.has(r.key);
                const grouped = r.children.length > 0;
                return (
                  <Fragment key={r.key}>
                    <tr className={cn("hover:[&>td]:brightness-95", grouped && "font-semibold")}>
                      <td className={cn("sticky left-0 z-10 border-r border-b px-3 py-1.5 whitespace-nowrap", grouped ? "bg-muted/80 backdrop-blur" : "bg-card")}>
                        {grouped ? (
                          <button
                            className="flex items-center gap-1"
                            onClick={() =>
                              setCollapsed((c) => {
                                const next = new Set(c);
                                if (next.has(r.key)) next.delete(r.key);
                                else next.add(r.key);
                                return next;
                              })
                            }
                          >
                            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
                            {r.label}
                          </button>
                        ) : (
                          r.label
                        )}
                      </td>
                      {result.cols.map((c) => (
                        <td key={c} className={cn("border-b px-2 py-1.5 text-right whitespace-nowrap", grouped ? "bg-muted/50" : "bg-card")} style={grouped ? undefined : heat(r.values[c])}>
                          {r.values[c] ? fmt(r.values[c]) : ""}
                        </td>
                      ))}
                      <td className={cn("sticky right-0 z-10 border-b border-l px-3 py-1.5 text-right font-semibold whitespace-nowrap", grouped ? "bg-muted" : "bg-card")}>{fmt(r.total)}</td>
                    </tr>
                    {open &&
                      sorted(r.children).map((k) => (
                        <tr key={k.key} className="hover:[&>td]:brightness-95">
                          <td className="sticky left-0 z-10 border-r border-b bg-card py-1.5 pr-3 pl-8 whitespace-nowrap text-muted-foreground">{k.label}</td>
                          {result.cols.map((c) => (
                            <td key={c} className="border-b bg-card px-2 py-1.5 text-right whitespace-nowrap" style={heat(k.values[c])}>
                              {k.values[c] ? fmt(k.values[c]) : ""}
                            </td>
                          ))}
                          <td className="sticky right-0 z-10 border-b border-l bg-card px-3 py-1.5 text-right font-medium whitespace-nowrap">{fmt(k.total)}</td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 font-semibold">
              <tr>
                <td className="sticky left-0 z-30 border-t border-r bg-muted px-3 py-2">합계</td>
                {result.cols.map((c) => (
                  <td key={c} className="border-t bg-muted px-2 py-2 text-right whitespace-nowrap">
                    {fmt(result.colTotals[c])}
                  </td>
                ))}
                <td className="sticky right-0 z-30 border-t border-l bg-muted px-3 py-2 text-right whitespace-nowrap">{fmt(result.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
          {result.rows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">조건에 맞는 자료가 없습니다.</p>}
        </div>
      </Card>
      {config.measure === "hc" && <p className="text-xs text-muted-foreground">인원은 겹치지 않게 센 수라, 합계가 각 칸을 더한 값보다 작을 수 있습니다.</p>}
    </div>
  );
}
