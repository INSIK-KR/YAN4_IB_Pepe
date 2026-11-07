import { useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Camera, ClipboardCopy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import WorkerChart from "@/components/WorkerChart";
import { bridge } from "@/lib/bridge";
import { fmt1, fmtInt, fmtPct } from "@/lib/format";
import type { MosData } from "@/lib/mos";
import { STOW_BANDS, STOW_TYPES, type StowProductivity, type StowShift, type StowSummary, type StowWorker } from "@/lib/stow-prod.mjs";
import { cn } from "@/lib/utils";

type Props = { stow: StowProductivity; mos: MosData };

// 유형 색 (validate_palette 통과 조합의 앞 3개)
const TYPE_COLOR: Record<string, string> = { each: "#2a78d6", pallet: "#eda100", case: "#6250d6" };
// EACH HTP 구간: 순서가 있는 값이라 한 색의 진하기로
const BAND_COLOR = ["#c6dbf4", "#8db6e6", "#4f8ed3", "#1f5fa8"];
const LOW = "#ea7a2c";

function Section({ title, sub, action, children, className }: { title: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  );
}

/** "박지영(W5971514)" → 이름과 사번 */
function splitName(employee: string) {
  const m = /^(.*?)\(([^)]*)\)$/.exec(employee);
  return m ? { name: m[1], id: m[2] } : { name: employee, id: "" };
}

function Name({ employee }: { employee: string }) {
  const { name, id } = splitName(employee);
  return (
    <span className="whitespace-nowrap">
      {name}
      {id && <span className="ml-1 text-xs text-muted-foreground">{id}</span>}
    </span>
  );
}

function ShiftCard({ label, sm, dark }: { label: string; sm: StowSummary; dark?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl border p-4 shadow-xs", dark ? "border-transparent bg-slate-900 text-white" : "bg-card")}>
      <div className={cn("text-xs font-medium", dark ? "text-slate-400" : "text-muted-foreground")}>{label} 진열 HTP</div>
      <div className="text-3xl leading-tight font-bold tracking-tight tabular-nums">{fmt1(sm.htp) || "-"}</div>
      <div className={cn("flex flex-wrap gap-x-2 text-xs tabular-nums", dark ? "text-slate-300" : "text-muted-foreground")}>
        {STOW_TYPES.map((t) => (
          <span key={t.key}>
            {t.label} <b className={dark ? "text-white" : "text-foreground"}>{fmtInt(sm[t.key].htp) || "-"}</b>
          </span>
        ))}
      </div>
      <div className={cn("text-xs tabular-nums", dark ? "text-slate-400" : "text-muted-foreground")}>
        {sm.people}명 · 물량 {fmtInt(sm.qty)} · MH {fmt1(sm.mh)}
      </div>
    </div>
  );
}

type Metric = { label: string; get: (s: StowSummary) => number | null; fmt: (v: number | null) => string; lowIsBad?: boolean; note?: string };
const METRICS: Metric[] = [
  { label: "진열 인원 (명)", get: (s) => s.people, fmt: fmtInt },
  { label: "PERM / TEMP", get: () => null, fmt: () => "" },
  { label: "진열 물량", get: (s) => s.qty, fmt: fmtInt },
  { label: "진열 MH", get: (s) => s.mh, fmt: fmt1 },
  { label: "진열 HTP", get: (s) => s.htp, fmt: fmt1, lowIsBad: true },
  { label: "EACH HTP", get: (s) => s.each.htp, fmt: fmt1, lowIsBad: true },
  { label: "PALLET HTP", get: (s) => s.pallet.htp, fmt: fmt1, lowIsBad: true },
  { label: "CASE HTP", get: (s) => s.case.htp, fmt: fmt1, lowIsBad: true },
  { label: "EACH 물량 비중", get: (s) => s.eachQtyShare, fmt: fmtPct },
  { label: "EACH MH 비중", get: (s) => s.eachMhShare, fmt: fmtPct },
  { label: "EACH HTP 하위 25%", get: (s) => s.q1, fmt: fmt1 },
  { label: "EACH HTP 중앙값", get: (s) => s.median, fmt: fmt1, lowIsBad: true },
  { label: "EACH HTP 상위 25%", get: (s) => s.q3, fmt: fmt1 },
  { label: "진열 외 업무 많은 인원", get: (s) => s.otherWork, fmt: fmtInt, note: "총 근무 4h 이상 · 진열 비중 60% 미만" },
];

function SummaryTable({ stow }: { stow: StowProductivity }) {
  const cols: { label: string; sm: StowSummary }[] = [...stow.shifts.map((s) => ({ label: s.label, sm: s.summary })), { label: "전체", sm: stow.total }];
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          <th className="py-1.5 text-left font-medium">지표</th>
          {cols.map((c) => (
            <th key={c.label} className={cn("py-1.5 text-right font-medium", c.label === "전체" && "pl-3")}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {METRICS.map((m) => {
          const vals = stow.shifts.map((s) => m.get(s.summary));
          const nums = vals.filter((v): v is number => v !== null);
          const min = m.lowIsBad && nums.length > 1 ? Math.min(...nums) : null;
          return (
            <tr key={m.label} className="border-b last:border-0">
              <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground" title={m.note}>
                {m.label}
              </td>
              {cols.map((c, i) => {
                const v = m.get(c.sm);
                const worst = i < vals.length && min !== null && v === min;
                return (
                  <td key={c.label} className={cn("py-1.5 text-right", c.label === "전체" && "pl-3 font-semibold", worst && "font-bold text-red-600")}>
                    {m.label === "PERM / TEMP" ? `${c.sm.perm} / ${c.sm.temp}` : m.fmt(v)}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** 근무조별 유형 HTP (묶은 막대) — 한 축 */
function TypeHtpChart({ shifts }: { shifts: StowShift[] }) {
  const max = Math.max(1, ...shifts.flatMap((s) => STOW_TYPES.map((t) => s.summary[t.key].htp || 0)));
  return (
    <div className="grid gap-2">
      {shifts.map((s) => (
        <div key={s.key} className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
          <span className="text-sm font-medium">{s.label}</span>
          <div className="grid gap-1">
            {STOW_TYPES.map((t) => {
              const v = s.summary[t.key].htp;
              return (
                <div key={t.key} className="flex items-center gap-2" title={`${s.label} ${t.label} HTP ${fmt1(v)}`}>
                  <div className="h-2.5 rounded-r-full" style={{ width: `${((v || 0) / max) * 85}%`, background: TYPE_COLOR[t.key] }} />
                  <span className="text-xs text-muted-foreground tabular-nums">{fmtInt(v) || "-"}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 근무조별 진열 물량 구성 (100% 막대) */
function TypeMixChart({ shifts }: { shifts: StowShift[] }) {
  return (
    <div className="grid gap-2">
      {shifts.map((s) => (
        <div key={s.key} className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
          <span className="text-sm font-medium">{s.label}</span>
          <div className="flex h-5 gap-0.5 overflow-hidden rounded-md">
            {STOW_TYPES.map((t) => {
              const share = s.summary.qty ? s.summary[t.key].qty / s.summary.qty : 0;
              return (
                <div
                  key={t.key}
                  className="flex items-center justify-center text-[11px] font-medium text-white tabular-nums"
                  style={{ width: `${share * 100}%`, background: TYPE_COLOR[t.key] }}
                  title={`${s.label} ${t.label} ${fmtInt(s.summary[t.key].qty)} (${fmtPct(share)})`}
                >
                  {share >= 0.1 ? Math.round(share * 100) + "%" : ""}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function BandTable({ shifts }: { shifts: StowShift[] }) {
  return (
    <div className="grid gap-2">
      {shifts.map((s) => {
        const n = STOW_BANDS.reduce((acc, b) => acc + (s.summary.bands[b.label] || 0), 0);
        return (
          <div key={s.key} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2">
            <span className="text-sm font-medium">{s.label}</span>
            <div className="flex h-5 gap-0.5 overflow-hidden rounded-md bg-muted">
              {STOW_BANDS.map((b, i) => {
                const c = s.summary.bands[b.label] || 0;
                return c ? (
                  <div
                    key={b.label}
                    className={cn("flex items-center justify-center text-[11px] font-medium tabular-nums", i >= 2 ? "text-white" : "text-slate-800")}
                    style={{ width: `${(c / (n || 1)) * 100}%`, background: BAND_COLOR[i] }}
                    title={`${s.label} ${b.label}: ${c}명`}
                  >
                    {c}
                  </div>
                ) : null;
              })}
            </div>
            <span className="text-right text-xs text-muted-foreground tabular-nums">{n}명</span>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {STOW_BANDS.map((b, i) => (
          <span key={b.label} className="flex items-center gap-1">
            <span className="size-2.5 rounded-sm" style={{ background: BAND_COLOR[i] }} />
            {b.label}
          </span>
        ))}
        <span>· EACH MH 1h 이상 작업자</span>
      </div>
    </div>
  );
}

function RankList({ title, workers, tone }: { title: string; workers: StowWorker[]; tone: "top" | "bottom" }) {
  return (
    <div className="grid gap-1">
      <div className={cn("text-xs font-semibold", tone === "top" ? "text-emerald-700" : "text-orange-700")}>{title}</div>
      {workers.length ? (
        workers.map((w, i) => (
          <div key={w.employee} className="grid grid-cols-[1.25rem_1fr_auto_auto] items-baseline gap-x-2 text-sm tabular-nums">
            <span className="text-xs text-muted-foreground">{i + 1}</span>
            <span className="truncate">
              <Name employee={w.employee} />
            </span>
            <span className={cn("font-semibold", tone === "bottom" && "text-orange-700")}>{fmt1(w.eachHtp)}</span>
            <span className="w-14 text-right text-xs text-muted-foreground">{fmt1(w.each.mh)}h</span>
          </div>
        ))
      ) : (
        <span className="text-xs text-muted-foreground">없음</span>
      )}
    </div>
  );
}

type SortKey = "eachHtp" | "htp" | "qty" | "mh" | "totalMh" | "stowShare" | "each.qty" | "pallet.htp" | "case.htp";
type ShiftFilter = "all" | "day" | "swing" | "night";

const TABLE_COLS: { key: SortKey | null; label: string; get: (w: StowWorker) => number | null; fmt: (v: number | null) => string; group?: string }[] = [
  { key: "qty", label: "물량", get: (w) => w.qty, fmt: fmtInt, group: "진열" },
  { key: "mh", label: "MH", get: (w) => w.mh, fmt: fmt1, group: "진열" },
  { key: "htp", label: "HTP", get: (w) => w.htp, fmt: fmt1, group: "진열" },
  { key: "each.qty", label: "물량", get: (w) => w.each.qty, fmt: fmtInt, group: "EACH" },
  { key: null, label: "MH", get: (w) => w.each.mh, fmt: fmt1, group: "EACH" },
  { key: "eachHtp", label: "HTP", get: (w) => w.eachHtp, fmt: fmt1, group: "EACH" },
  { key: null, label: "물량", get: (w) => w.pallet.qty, fmt: fmtInt, group: "PALLET" },
  { key: null, label: "MH", get: (w) => w.pallet.mh, fmt: fmt1, group: "PALLET" },
  { key: "pallet.htp", label: "HTP", get: (w) => w.pallet.htp, fmt: fmt1, group: "PALLET" },
  { key: null, label: "물량", get: (w) => w.case.qty, fmt: fmtInt, group: "CASE" },
  { key: null, label: "MH", get: (w) => w.case.mh, fmt: fmt1, group: "CASE" },
  { key: "case.htp", label: "HTP", get: (w) => w.case.htp, fmt: fmt1, group: "CASE" },
  { key: "totalMh", label: "총 근무 MH", get: (w) => w.totalMh, fmt: fmt1 },
  { key: "stowShare", label: "진열 비중", get: (w) => w.stowShare, fmt: fmtPct },
];

function WorkerTable({ stow }: { stow: StowProductivity }) {
  const [shift, setShift] = useState<ShiftFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [otherOnly, setOtherOnly] = useState(false);

  const q1Of = Object.fromEntries(stow.shifts.map((s) => [s.key, s.summary.q1]));
  const rows = useMemo(() => {
    let list = stow.shifts.filter((s) => shift === "all" || s.key === shift).flatMap((s) => s.workers.map((w) => ({ shift: s, w })));
    if (otherOnly) list = list.filter(({ w }) => w.totalMh >= 4 && w.stowShare !== null && w.stowShare < 0.6);
    if (sort) {
      const col = TABLE_COLS.find((c) => c.key === sort.key)!;
      list = [...list].sort((a, b) => ((col.get(a.w) ?? -Infinity) - (col.get(b.w) ?? -Infinity)) * sort.dir);
    }
    return list;
  }, [stow, shift, sort, otherOnly]);

  const clickSort = (key: SortKey) => setSort((s) => (s?.key !== key ? { key, dir: -1 } : s.dir === -1 ? { key, dir: 1 } : null));
  const sortIcon = (key: SortKey | null) => (key && sort?.key === key ? sort.dir === -1 ? <ArrowDown className="inline size-3" /> : <ArrowUp className="inline size-3" /> : null);

  async function copyTable() {
    const head = ["근무조", "작업자", "계약", "주 온도", ...TABLE_COLS.map((c) => (c.group ? c.group + " " : "") + c.label), "EACH 구간"];
    const lines = [head.join("\t")].concat(
      rows.map(({ shift: s, w }) => [s.label, w.employee, w.contract, w.temp, ...TABLE_COLS.map((c) => c.get(w) ?? ""), w.band].join("\t"))
    );
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("표를 복사했습니다. 엑셀에 붙여넣을 수 있어요.");
    } catch (e) {
      toast.error("복사하지 못했습니다: " + (e as Error).message);
    }
  }

  const groups = TABLE_COLS.reduce<{ label: string; span: number }[]>((acc, c) => {
    const g = c.group || "";
    if (acc.length && acc[acc.length - 1].label === g) acc[acc.length - 1].span++;
    else acc.push({ label: g, span: 1 });
    return acc;
  }, []);

  return (
    <Section
      title="작업자별"
      sub={`${rows.length}명 · 주황 = 근무조 EACH HTP 하위 25%`}
      action={
        <div className="flex flex-wrap items-center gap-2" data-capture-hide>
          <ToggleGroup type="single" variant="outline" size="sm" value={shift} onValueChange={(v) => v && setShift(v as ShiftFilter)}>
            <ToggleGroupItem value="all">전체</ToggleGroupItem>
            {stow.shifts.map((s) => (
              <ToggleGroupItem key={s.key} value={s.key}>
                {s.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button size="sm" variant={otherOnly ? "default" : "outline"} onClick={() => setOtherOnly((v) => !v)}>
            진열 외 업무 많은 인원
          </Button>
          <Button size="sm" variant="outline" onClick={copyTable}>
            <ClipboardCopy />표 복사
          </Button>
        </div>
      }
    >
      <div className="max-h-[640px] overflow-auto rounded-md border">
        <table className="w-max min-w-full border-separate border-spacing-0 text-xs tabular-nums">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th colSpan={5} className="border-b" />
              {groups.map((g, i) => (
                <th key={i} colSpan={g.span} className={cn("border-b px-2 pt-1.5 text-center font-semibold", g.label && "border-l")}>
                  {g.label}
                </th>
              ))}
              <th className="border-b" />
            </tr>
            <tr>
              {["근무조", "작업자", "계약", "주 온도"].map((h) => (
                <th key={h} className="border-b px-2 py-1.5 text-left font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
              <th className="border-b" />
              {TABLE_COLS.map((c, i) => (
                <th
                  key={i}
                  className={cn("border-b px-2 py-1.5 text-right font-medium whitespace-nowrap", c.key && "cursor-pointer hover:text-foreground", i > 0 && TABLE_COLS[i - 1].group !== c.group && "border-l")}
                  onClick={() => c.key && clickSort(c.key)}
                >
                  {c.label} {sortIcon(c.key)}
                </th>
              ))}
              <th className="border-b px-2 py-1.5 text-left font-medium whitespace-nowrap">EACH 구간</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ shift: s, w }) => {
              const low = w.eachHtp !== null && q1Of[s.key] !== null && w.eachHtp < (q1Of[s.key] as number);
              return (
                <tr key={s.key + w.employee} className={cn("hover:bg-muted/50", low && "bg-orange-50")}>
                  <td className="border-b px-2 py-1.5">{s.label}</td>
                  <td className="border-b px-2 py-1.5">
                    <Name employee={w.employee} />
                  </td>
                  <td className="border-b px-2 py-1.5">{w.contract}</td>
                  <td className="border-b px-2 py-1.5">{w.temp}</td>
                  <td className="border-b" />
                  {TABLE_COLS.map((c, i) => (
                    <td
                      key={i}
                      className={cn(
                        "border-b px-2 py-1.5 text-right",
                        i > 0 && TABLE_COLS[i - 1].group !== c.group && "border-l",
                        c.key === "eachHtp" && "font-semibold",
                        c.key === "eachHtp" && low && "text-orange-700"
                      )}
                    >
                      {c.fmt(c.get(w))}
                    </td>
                  ))}
                  <td className="border-b px-2 py-1.5 whitespace-nowrap">{w.band}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export default function StowPage({ stow, mos }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);
  const chartMax = Math.max(1, ...stow.shifts.flatMap((s) => s.workers.map((w) => w.eachHtp || 0)));

  async function capture() {
    if (!bridge || !area.current) {
      toast.error("앱(exe)에서만 캡처할 수 있습니다.");
      return;
    }
    setCapturing(true);
    toast.dismiss();
    try {
      window.scrollTo(0, 0);
      // 알림이 사라지고 버튼이 숨겨진 뒤에 찍는다
      await new Promise((r) => setTimeout(r, 450));
      const r = area.current.getBoundingClientRect();
      // 창 밖까지 찍을 때는 스크롤바가 없어져 화면이 그만큼 넓어진다
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      const res = await bridge.capture({ x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width + scrollbar, height: r.height }, "진열 생산성_" + mos.workDate);
      if (res.ok) {
        toast.success("캡처했습니다. 클립보드에도 복사됐어요.", { description: res.path, action: { label: "폴더 열기", onClick: () => bridge?.showCapture() } });
      } else {
        toast.error("캡처하지 못했습니다: " + res.error);
      }
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div ref={area} className="grid gap-4 bg-slate-100 p-1">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight">진열 생산성</h1>
          <p className="text-sm text-muted-foreground">
            운영일 <b className="text-foreground">{mos.workDate}</b> · 근무조 = MOS Shift 열 · 진열 MH 1h 이상 작업자 · MH = HTP 시간 × 8/9
          </p>
        </div>
        <span style={{ visibility: capturing ? "hidden" : undefined }}>
          <Button size="sm" onClick={capture} disabled={capturing}>
            {capturing ? <Loader2 className="animate-spin" /> : <Camera />}
            대시보드 캡처
          </Button>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stow.shifts.map((s) => (
          <ShiftCard key={s.key} label={s.label} sm={s.summary} />
        ))}
        <ShiftCard label="전체" sm={stow.total} dark />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Section title="근무조별 요약" sub="빨간 굵은 숫자 = 근무조 중 최저">
          <SummaryTable stow={stow} />
        </Section>
        <div className="grid content-start gap-4">
          <Section title="유형별 진열 HTP">
            <TypeHtpChart shifts={stow.shifts} />
            <TypeMixLegend />
          </Section>
          <Section title="진열 물량 구성">
            <TypeMixChart shifts={stow.shifts} />
            <TypeMixLegend />
          </Section>
          <Section title="EACH HTP 구간별 인원">
            <BandTable shifts={stow.shifts} />
          </Section>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {stow.shifts.map((s) => (
          <Section key={s.key} title={`${s.label} EACH HTP`} sub="상위 5 · 하위 5 · 오른쪽은 EACH MH">
            <RankList title="▲ 상위" workers={s.top} tone="top" />
            <RankList title="▼ 하위 (EACH MH 1h 이상 중)" workers={s.bottom} tone="bottom" />
          </Section>
        ))}
      </div>

      <Section title="작업자별 EACH HTP" sub="주황 = 근무조 하위 25% · 세 차트는 같은 축">
        <div className="grid gap-4">
          {stow.shifts.map((s) => (
            <WorkerChart key={s.key} title={s.label} workers={s.workers} q1={s.summary.q1} median={s.summary.median} max={chartMax} color={TYPE_COLOR.each} lowColor={LOW} />
          ))}
        </div>
      </Section>

      <WorkerTable stow={stow} />
    </div>
  );
}

function TypeMixLegend() {
  return (
    <div className="flex gap-3 text-xs text-muted-foreground">
      {STOW_TYPES.map((t) => (
        <span key={t.key} className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm" style={{ background: TYPE_COLOR[t.key] }} />
          {t.label}
        </span>
      ))}
    </div>
  );
}
