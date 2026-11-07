import { useMemo, type ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import HourlyChart, { type ChartSeries } from "@/components/HourlyChart";
import type { StatusModel } from "@/lib/htp-calc.mjs";
import { computePivot, type PreparedRow } from "@/lib/pivot.mjs";
import type { PresetKey } from "@/lib/pivot-presets";
import { fmt1, fmtInt, fmtPct, hourLabel } from "@/lib/format";
import type { Inputs } from "@/lib/inputs";
import type { MosData } from "@/lib/mos";
import { cn } from "@/lib/utils";

type Props = {
  model: StatusModel;
  prepared: PreparedRow[];
  mos: MosData;
  inputs: Inputs;
  onOpenPivot: (key: PresetKey) => void;
  onOpenDetail: () => void;
  onOpenInputs: () => void;
};

// 차트 색: 항목마다 고정 (validate_palette 통과 조합)
const CHANNEL_COLOR: Record<string, string> = { 직납: "#2a78d6", 이관: "#eda100", 기타: "#94a3b8" };
const TEMP_COLOR: Record<string, string> = { 상온: "#eb6834", 냉장: "#1baf7a", 냉동: "#6250d6", 로켓마트: "#e87ba4", 기타: "#94a3b8" };
const SHIFTS3 = [
  ["day", "Day"],
  ["swing", "Swing"],
  ["night", "Night"],
] as const;
const WAIT_KEYS = ["stowWait", "receiveWait", "unloadWait"];

type Hourly = Record<number, number>;
const sum = (h: Hourly) => Object.values(h).reduce((s, v) => s + (v || 0), 0);

function Kpi({ title, value, sub, accent, children }: { title: string; value: ReactNode; sub?: ReactNode; accent: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-t-[3px] bg-card p-4 shadow-xs" style={{ borderTopColor: accent }}>
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="text-3xl leading-tight font-bold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground tabular-nums">{sub}</div>}
      {children}
    </div>
  );
}

function Bar({ value, max, color, className }: { value: number; max: number; color: string; className?: string }) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full" style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%`, background: color }} />
    </div>
  );
}

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

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium whitespace-nowrap text-blue-700 hover:underline">
      {children}
      <ArrowRight className="size-3" />
    </button>
  );
}

type Tone = "bad" | "good" | "warn" | "info" | "muted";
const TONE: Record<Tone, string> = {
  bad: "bg-red-600 text-white",
  good: "bg-emerald-600 text-white",
  warn: "bg-amber-200 text-amber-900",
  info: "bg-blue-600 text-white",
  muted: "bg-slate-200 text-slate-700",
};
type Check = { tone: Tone; tag: string; title: string; detail: string; onClick?: () => void };

export default function OverviewPage({ model: m, prepared, mos, inputs, onOpenPivot, onOpenDetail, onOpenInputs }: Props) {
  const s = m.summary;
  const target = inputs.target;
  const gap = s.htpGap;

  const stowByChannelHour = useMemo(() => computePivot(prepared, { row1: "channel", row2: "", col: "hourName", measure: "qty", filters: { task: "진열" } }), [prepared]);
  const stowByTemp = useMemo(() => computePivot(prepared, { row1: "temp", row2: "", col: "channel", measure: "qty", filters: { task: "진열" } }), [prepared]);

  const series: ChartSeries[] = stowByChannelHour.rows.map((r) => {
    const values: Hourly = {};
    m.hours.forEach((h) => (values[h] = r.values[hourLabel(h) + "시"] || 0));
    return { key: r.key, label: r.label, color: CHANNEL_COLOR[r.key] || CHANNEL_COLOR.기타, values };
  });

  const stowTotal = sum(m.hourly.stow);
  const unloadDirect = sum(m.hourly.unloadDirect);
  const unloadTransfer = sum(m.hourly.unloadTransfer);
  const receiveTotal = sum(m.hourly.receive);
  const channelTotal = (key: string) => stowByChannelHour.rows.find((r) => r.key === key)?.total || 0;
  const stowDirect = channelTotal("직납");
  const stowTransfer = channelTotal("이관");
  const mhWork = m.process.direct.total + m.process.indirect.total;
  const mhHourly: Hourly = {};
  m.hours.forEach((h) => (mhHourly[h] = (m.process.direct.hourly[h] || 0) + (m.process.indirect.hourly[h] || 0)));
  const short = gap !== null && gap < 0 ? target * mhWork - stowTotal : 0;

  const taskMh = m.tasks.map((t) => ({ ...t, sumMh: t.total + t.delay })).filter((t) => t.sumMh > 0);
  const topTasks = [...taskMh].sort((a, b) => b.sumMh - a.sumMh).slice(0, 8);
  const waitMh = taskMh.filter((t) => WAIT_KEYS.includes(t.key)).reduce((acc, t) => acc + t.sumMh, 0);
  const delayPeople = m.checkInDelay.filter((p) => p.manHour > 0);
  const delayMh = delayPeople.reduce((acc, p) => acc + p.manHour, 0);
  const delayByTask = taskMh.filter((t) => t.delay > 0).sort((a, b) => b.delay - a.delay);

  // 진열이 거의 없는 시간(휴게 등)은 빼고 가장 낮은 시간대를 찾는다
  const peakStow = Math.max(...m.hours.map((h) => m.hourly.stow[h] || 0), 1);
  const lowest = m.hours
    .filter((h) => (m.hourly.stow[h] || 0) >= peakStow * 0.05 && m.hourly.productivity[h])
    .reduce<number | null>((best, h) => (best === null || (m.hourly.productivity[h] as number) < (m.hourly.productivity[best] as number) ? h : best), null);
  const shiftsWithData = m.shiftHtp.filter((g) => g.htp);
  const worstShift = shiftsWithData.reduce<(typeof shiftsWithData)[number] | null>((b, g) => (!b || (g.htp as number) < (b.htp as number) ? g : b), null);

  const checks: Check[] = [];
  if (gap !== null) {
    checks.push(
      gap < 0
        ? { tone: "bad", tag: "미달", title: `HTP ${fmt1(s.htpActual)} · 목표보다 ${fmt1(-gap)} 낮음`, detail: `같은 MH로 Target을 맞추려면 진열 ${fmtInt(short)} 유닛 더 필요`, onClick: () => onOpenPivot("shiftUph") }
        : { tone: "good", tag: "달성", title: `HTP ${fmt1(s.htpActual)} · 목표보다 ${fmt1(gap)} 높음`, detail: `Target ${fmt1(target)} 기준` }
    );
  }
  if (worstShift) {
    checks.push({
      tone: (worstShift.htp as number) < target ? "bad" : "muted",
      tag: "근무조",
      title: `${worstShift.label} HTP ${fmt1(worstShift.htp)} 가장 낮음`,
      detail: lowest !== null ? `시간대로는 ${hourLabel(lowest)}시 ${fmt1(m.hourly.productivity[lowest])}가 최저 (휴게 시간 제외)` : "",
      onClick: () => onOpenPivot("shiftMh"),
    });
  }
  if (waitMh > 0) {
    checks.push({ tone: "warn", tag: "대기", title: `대기 ${fmt1(waitMh)} MH · 직접·간접의 ${fmtPct(waitMh / mhWork)}`, detail: taskMh.filter((t) => WAIT_KEYS.includes(t.key)).map((t) => `${t.label} ${fmt1(t.sumMh)}`).join(" · "), onClick: () => onOpenPivot("shiftMh") });
  }
  if (delayPeople.length) {
    checks.push({ tone: "warn", tag: "지연", title: `체크인 지연 ${delayPeople.length}명 · ${fmt1(delayMh)} MH`, detail: delayByTask.slice(0, 3).map((t) => `${t.label} ${fmt1(t.delay)}`).join(" · "), onClick: onOpenDetail });
  }
  if (unloadDirect - receiveTotal > 0 || unloadTransfer - stowTransfer > 0) {
    checks.push({
      tone: "info",
      tag: "차이",
      title: `직납 하차−매입 ${fmtInt(unloadDirect - receiveTotal)} · 이관 하차−진열 ${fmtInt(unloadTransfer - stowTransfer)}`,
      detail: "오늘 처리량끼리의 차이입니다. 전날 넘어온 물량은 구분하지 못합니다.",
      onClick: () => onOpenPivot("taskChannel"),
    });
  }
  if (!target) checks.push({ tone: "muted", tag: "입력", title: "Target HTP가 비어 있습니다", detail: "입력 탭에 넣으면 목표 대비 실적이 나옵니다", onClick: onOpenInputs });
  if (!s.sopD1) checks.push({ tone: "muted", tag: "입력", title: "S&OP가 비어 있습니다", detail: "입력 탭에 넣으면 Plan 대비 실적이 나옵니다", onClick: onOpenInputs });

  const vehicles = inputs.vehicles.filter((v) => v.arrival);
  const vehiclePlt = (temp: string) => sum(m.vehicles[temp as "Ambient"]);
  const maxShiftHtp = Math.max(...m.shiftHtp.map((g) => g.htp || 0), target, 1);
  const shiftStat = m.shiftGroups.map((g) => {
    const hs = m.hours.filter((h) => h >= g.from && h <= g.to);
    return { ...g, stow: hs.reduce((acc, h) => acc + (m.hourly.stow[h] || 0), 0), mh: hs.reduce((acc, h) => acc + (mhHourly[h] || 0), 0), htp: m.shiftHtp.find((x) => x.key === g.key)?.htp ?? null };
  });
  const tempTotal = stowByTemp.grandTotal || 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight">개요</h1>
          <p className="text-sm text-muted-foreground">
            운영일 <b className="text-foreground">{mos.workDate}</b> · {mos.source}
          </p>
        </div>
        <LinkButton onClick={onOpenDetail}>상세 표 보기</LinkButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.25fr_1fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-1 rounded-xl bg-slate-900 p-4 text-white shadow-sm sm:col-span-2 lg:col-span-1">
          <div className="text-xs font-medium text-slate-400">HTP Actual</div>
          <div className={cn("text-4xl leading-tight font-bold tracking-tight tabular-nums", gap === null ? "" : gap >= 0 ? "text-emerald-400" : "text-amber-400")}>{fmt1(s.htpActual) || "-"}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-300 tabular-nums">
            Target {fmt1(target)}
            {gap !== null && (
              <span className="inline-flex items-center font-semibold">
                {gap >= 0 ? <ArrowUpRight className="size-3.5 text-emerald-400" /> : <ArrowDownRight className="size-3.5 text-amber-400" />}
                Gap {gap > 0 ? "+" : ""}
                {fmt1(gap)}
              </span>
            )}
          </div>
        </div>
        <Kpi title="진열" accent="#2a78d6" value={fmtInt(stowTotal)} sub={s.sopD1 ? `Plan D-1 ${fmtInt(s.sopD1)} · ${fmtPct(stowTotal / s.sopD1)}` : "Plan 입력 전"}>
          {s.sopD1 > 0 && <Bar className="mt-1" value={stowTotal} max={s.sopD1} color="#2a78d6" />}
        </Kpi>
        <Kpi title="하차" accent="#6250d6" value={fmtInt(unloadDirect + unloadTransfer)} sub={`직납 ${fmtInt(unloadDirect)} · 이관 ${fmtInt(unloadTransfer)}`} />
        <Kpi title="매입" accent="#0d9488" value={fmtInt(receiveTotal)} sub={unloadDirect ? `직납 하차의 ${fmtPct(receiveTotal / unloadDirect)}` : undefined} />
        <Kpi title="직접·간접 MH" accent="#64748b" value={fmtInt(mhWork)} sub={`직접 ${fmtInt(m.process.direct.total)} · 간접 ${fmtInt(m.process.indirect.total)} · 간접 비율 ${fmtPct(mhWork ? m.process.indirect.total / mhWork : null)}`} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,2.6fr)_minmax(320px,1fr)]">
        <Section
          title="시간대별 진열과 생산성"
          action={<LinkButton onClick={() => onOpenPivot("stowTemp")}>피벗으로 보기</LinkButton>}
        >
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {series.map((d) => (
              <span key={d.key} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: d.color }} />
                {d.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-emerald-600" />
              Target 이상
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-red-600" />
              Target 미만
            </span>
          </div>
          <HourlyChart
            hours={m.hours}
            groups={m.shiftGroups}
            shiftHtp={m.shiftHtp}
            series={series}
            productivity={m.hourly.productivity}
            target={target}
            extras={[
              { label: "직접·간접 MH", values: mhHourly, fmt: fmt1 },
              { label: "하차", values: m.hourly.unload, fmt: fmtInt },
              { label: "매입", values: m.hourly.receive, fmt: fmtInt },
            ]}
          />
        </Section>

        <Section title="지금 확인할 것">
          {checks.map((c) => {
            const body = (
              <>
                <span className="flex items-start gap-2">
                  <Badge className={cn("mt-0.5 shrink-0 rounded-md border-0 font-semibold", TONE[c.tone])}>{c.tag}</Badge>
                  <span className="text-sm font-semibold">{c.title}</span>
                </span>
                {c.detail && <span className="mt-1 block pl-12 text-xs text-muted-foreground">{c.detail}</span>}
              </>
            );
            return c.onClick ? (
              <button key={c.tag} onClick={c.onClick} className="block w-full rounded-lg bg-muted/60 p-3 text-left transition-colors hover:bg-muted">
                {body}
              </button>
            ) : (
              <div key={c.tag} className="rounded-lg bg-muted/60 p-3">
                {body}
              </div>
            );
          })}
        </Section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <Section title="근무조별" action={<LinkButton onClick={() => onOpenPivot("shiftMh")}>피벗으로 보기</LinkButton>}>
          {shiftStat.map((g) => (
            <div key={g.key} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{g.label}</span>
                <span className="flex items-center gap-1 text-sm font-bold tabular-nums">
                  {g.htp !== null && target > 0 && (g.htp >= target ? <ArrowUpRight className="size-4 text-emerald-600" /> : <ArrowDownRight className="size-4 text-red-600" />)}
                  {g.htp === null ? "-" : fmt1(g.htp)}
                </span>
              </div>
              <div className="relative">
                <Bar value={g.htp || 0} max={maxShiftHtp} color={!target ? "#94a3b8" : g.htp !== null && g.htp >= target ? "#059669" : "#dc2626"} />
                {target > 0 && <span className="absolute -top-0.5 h-3 w-0.5 bg-foreground/60" style={{ left: `${(target / maxShiftHtp) * 100}%` }} title={`Target ${fmt1(target)}`} />}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                진열 {fmtInt(g.stow)} ({fmtPct(stowTotal ? g.stow / stowTotal : null)}) · MH {fmtInt(g.mh)}
              </div>
            </div>
          ))}
          {target > 0 && <p className="text-xs text-muted-foreground">막대 위 세로 표시 = Target {fmt1(target)}</p>}
        </Section>

        <Section title="입고 흐름" sub="오늘 처리량" action={<LinkButton onClick={() => onOpenPivot("taskChannel")}>피벗으로 보기</LinkButton>}>
          {(
            [
              ["직납", CHANNEL_COLOR.직납, [["하차", unloadDirect], ["매입", receiveTotal], ["진열", stowDirect]]],
              ["이관", CHANNEL_COLOR.이관, [["하차", unloadTransfer], ["진열", stowTransfer]]],
            ] as [string, string, [string, number][]][]
          ).map(([name, color, steps]) => (
            <div key={name} className="grid gap-1.5">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <span className="size-2.5 rounded-sm" style={{ background: color }} />
                {name}
              </div>
              {steps.map(([label, v], i) => (
                <div key={label} className="grid grid-cols-[2.5rem_1fr_4.5rem] items-center gap-2 text-xs tabular-nums">
                  <span className="text-muted-foreground">{label}</span>
                  <Bar value={v} max={steps[0][1]} color={color} />
                  <span className="text-right font-medium">{fmtInt(v)}</span>
                  {i > 0 && steps[i - 1][1] - v !== 0 && (
                    <span className="col-span-2 col-start-2 -mt-1 text-right text-muted-foreground">앞 단계와 차이 {fmtInt(v - steps[i - 1][1])}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </Section>

        <Section title="S&OP와 실적" action={<LinkButton onClick={onOpenInputs}>입력</LinkButton>}>
          <div className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["D-1", fmtInt(s.sopD1)],
                ["D-0", fmtInt(s.sopD0)],
                ["IB MIX", fmtPct(s.ibMix) || "-"],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/60 p-2">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="font-bold tabular-nums">{value}</div>
              </div>
            ))}
          </div>
          {SHIFTS3.map(([k, label]) => {
            const plan = s.plan[k];
            const act = m.simulation.act[k].stow || 0;
            return (
              <div key={k} className="grid gap-1">
                <div className="flex justify-between text-xs tabular-nums">
                  <span className="font-semibold">{label}</span>
                  <span className="text-muted-foreground">
                    실적 <b className="text-foreground">{fmtInt(act)}</b> / Plan {fmtInt(plan)} {plan ? `· ${fmtPct(act / plan)}` : ""}
                  </span>
                </div>
                <Bar value={act} max={Math.max(plan, act)} color="#2a78d6" />
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">실적은 MOS Shift 기준 (Day·Swing·Over Night)</p>
        </Section>

        <Section title="진열 구성" sub={fmtInt(tempTotal) + " 유닛"} action={<LinkButton onClick={() => onOpenPivot("stowTemp")}>피벗으로 보기</LinkButton>}>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {stowByTemp.rows.map((r) => (
              <div key={r.key} style={{ width: `${((r.total || 0) / (tempTotal || 1)) * 100}%`, background: TEMP_COLOR[r.key] }} title={r.label} />
            ))}
          </div>
          <div className="grid gap-1.5 text-sm">
            {stowByTemp.rows.map((r) => (
              <div key={r.key} className="grid grid-cols-[1fr_auto] gap-x-3">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm" style={{ background: TEMP_COLOR[r.key] }} />
                  {r.label}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    직납 {fmtInt(r.values["직납"] || 0)} · 이관 {fmtInt(r.values["이관"] || 0)}
                  </span>
                </span>
                <span className="text-right font-semibold tabular-nums">
                  {fmtInt(r.total)} <span className="text-xs font-normal text-muted-foreground">{fmtPct((r.total || 0) / (tempTotal || 1))}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between border-t pt-2 text-xs text-muted-foreground tabular-nums">
            <span>개별 {fmtInt(sum(m.hourly.stowEach))}</span>
            <span>팔레트 {fmtInt(sum(m.hourly.stowPallet))}</span>
            <span>팔레트 비율 {fmtPct(stowTotal ? sum(m.hourly.stowPallet) / stowTotal : null)}</span>
          </div>
        </Section>

        <Section title="공정별 MH" sub="상위 8개 · 체크인 지연 포함" action={<LinkButton onClick={() => onOpenPivot("shiftMh")}>피벗으로 보기</LinkButton>}>
          <div className="grid gap-1.5">
            {topTasks.map((t) => (
              <div key={t.key} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2 text-xs tabular-nums">
                <span className="truncate text-muted-foreground">{t.label}</span>
                <Bar value={t.sumMh} max={topTasks[0].sumMh} color={WAIT_KEYS.includes(t.key) ? "#d97706" : "#475569"} />
                <span className="text-right font-medium">{fmt1(t.sumMh)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between border-t pt-2 text-xs text-muted-foreground tabular-nums">
            <span>직접 {fmtPct(m.process.direct.share)}</span>
            <span>간접 {fmtPct(m.process.indirect.share)}</span>
            <span>센터 {fmtPct(m.process.centre.share)}</span>
          </div>
        </Section>

        <Section title="이관 차량" sub={vehicles.length ? `${vehicles.length}대` : undefined} action={<LinkButton onClick={onOpenInputs}>입력</LinkButton>}>
          {vehicles.length ? (
            <>
              <div className="text-3xl font-bold tabular-nums">
                {fmtInt(sum(m.vehicles.pallet))} <span className="text-sm font-normal text-muted-foreground">PLT 하차</span>
              </div>
              <div className="grid gap-1.5">
                {(
                  [
                    ["Ambient", "상온", TEMP_COLOR.상온],
                    ["Chilled", "냉장", TEMP_COLOR.냉장],
                    ["Frozen", "냉동", TEMP_COLOR.냉동],
                    ["RM", "로켓마트", TEMP_COLOR.로켓마트],
                  ] as const
                ).map(([k, label, color]) => (
                  <div key={k} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2 text-xs tabular-nums">
                    <span className="text-muted-foreground">{label}</span>
                    <Bar value={vehiclePlt(k)} max={sum(m.vehicles.pallet)} color={color} />
                    <span className="text-right font-medium">{fmtInt(vehiclePlt(k))}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">입력 탭에 이관 차량을 넣으면 온도대별 PLT가 나옵니다.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
