import { Fragment, useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import HourlyTable, { type HourlyRow } from "@/components/HourlyTable";
import type { StatusModel } from "@/lib/htp-calc.mjs";
import { fmt1, fmtInt, fmtPct } from "@/lib/format";
import type { Inputs } from "@/lib/inputs";
import type { MosData } from "@/lib/mos";
import { cn } from "@/lib/utils";

type Props = { model: StatusModel; mos: MosData; inputs: Inputs };
type Hourly = Record<number, number>;

const SHIFTS3 = [
  ["day", "Day"],
  ["swing", "Swing"],
  ["night", "Night"],
] as const;

function sumHours(values: Hourly, hours: number[]) {
  return hours.reduce((s, h) => s + (values[h] || 0), 0);
}

/** 작은 표 공통 셀 */
const num = "text-right tabular-nums";

export default function StatusPage({ model: m, mos, inputs }: Props) {
  const [shift, setShift] = useState("all");

  const target = inputs.target;
  const s = m.summary;
  const groups = m.shiftGroups;
  const hours = shift === "all" ? m.hours : m.hours.filter((h) => groups.some((g) => g.key === shift && h >= g.from && h <= g.to));
  const shiftLabel = shift === "all" ? "합계" : groups.find((g) => g.key === shift)!.label + " 합계";
  const tone = (v: number | null | undefined) =>
    v === null || v === undefined ? undefined : v >= target ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50";

  const productivityTotal = (hs: number[]) => {
    const mh = sumHours(m.process.direct.hourly, hs) + sumHours(m.process.indirect.hourly, hs);
    return mh ? sumHours(m.hourly.stow, hs) / mh : null;
  };

  const hourlyRows: HourlyRow[] = [
    { label: "차량대수 (실제 도착)", values: m.vehicles.count, fmt: fmtInt },
    { label: "하차 PLT", kind: "sum", values: m.vehicles.pallet, fmt: fmtInt },
    { label: "Ambient", level: 1, values: m.vehicles.Ambient, fmt: fmtInt },
    { label: "Chilled", level: 1, values: m.vehicles.Chilled, fmt: fmtInt },
    { label: "Frozen", level: 1, values: m.vehicles.Frozen, fmt: fmtInt },
    { label: "RocketMart", level: 1, values: m.vehicles.RM, fmt: fmtInt },
    { label: "생산성 (진열 ÷ 직접·간접 MH)", kind: "sub", values: m.hourly.productivity, fmt: fmt1, tone, total: productivityTotal },
    { label: "하차", kind: "sum", values: m.hourly.unload, fmt: fmtInt },
    { label: "직납", level: 1, values: m.hourly.unloadDirect, fmt: fmtInt },
    { label: "이관", level: 1, values: m.hourly.unloadTransfer, fmt: fmtInt },
    { label: "매입", kind: "sum", values: m.hourly.receive, fmt: fmtInt },
    { label: "개별", level: 1, values: m.hourly.receiveEach, fmt: fmtInt },
    { label: "팔레트", level: 1, values: m.hourly.receivePallet, fmt: fmtInt },
    { label: "진열", kind: "sum", values: m.hourly.stow, fmt: fmtInt },
    { label: "ACT.개별", level: 1, values: m.hourly.stowEach, fmt: fmtInt },
    { label: "ACT.팔레트", level: 1, values: m.hourly.stowPallet, fmt: fmtInt },
  ];

  // 진열 구성 — 비율은 상위 묶음 대비 (전일 기준)
  const mixRows: HourlyRow[] = [];
  const share = (part: Hourly, whole: Hourly) => fmtPct(sumHours(whole, m.hours) ? sumHours(part, m.hours) / sumHours(whole, m.hours) : null);
  (
    [
      [m.stowMix.direct, m.stowMix.directParts],
      [m.stowMix.transfer, m.stowMix.transferParts],
    ] as const
  ).forEach(([g, parts]) => {
    mixRows.push({ label: g.label, kind: "sum", values: g.sum, fmt: fmtInt, lead: [""] });
    mixRows.push({ label: "개별", level: 1, values: g.each, fmt: fmtInt, lead: [share(g.each, g.sum)] });
    mixRows.push({ label: "팔레트", level: 1, values: g.pallet, fmt: fmtInt, lead: [share(g.pallet, g.sum)] });
    parts.forEach((p: typeof g) => {
      mixRows.push({ label: p.label, kind: "sub", level: 1, values: p.sum, fmt: fmtInt, lead: [share(p.sum, g.sum)] });
      mixRows.push({ label: "개별", level: 2, values: p.each, fmt: fmtInt, lead: [share(p.each, p.sum)] });
      mixRows.push({ label: "팔레트", level: 2, values: p.pallet, fmt: fmtInt, lead: [share(p.pallet, p.sum)] });
    });
  });

  // 공정별 MH + 체크인 지연
  const mhRows: HourlyRow[] = [
    ["직접공정", m.process.direct],
    ["간접공정", m.process.indirect],
    ["센터공정", m.process.centre],
  ].map(([label, p]: any) => ({ label, kind: "sum" as const, values: p.hourly, fmt: fmt1, lead: [fmtPct(p.share), fmt1(p.total), "", ""] }));
  let lastGroup: string | null = null;
  m.tasks.forEach((t) => {
    if (t.group !== lastGroup) {
      lastGroup = t.group;
      const members = m.tasks.filter((x) => x.group === t.group);
      const gh: Hourly = {};
      m.hours.forEach((h) => (gh[h] = members.reduce((acc, x) => acc + (x.hourly[h] || 0), 0)));
      const delay = members.reduce((acc, x) => acc + x.delay, 0);
      mhRows.push({ label: String(t.group), kind: "sub", values: gh, fmt: fmt1, lead: ["", fmt1(sumHours(gh, m.hours)), delay ? fmt1(delay) : "", ""] });
    }
    mhRows.push({
      label: t.label,
      level: 1,
      values: t.hourly,
      fmt: fmt1,
      lead: [fmtPct(t.share), fmt1(t.total), t.delay ? fmt1(t.delay) : "", t.delay ? fmtPct(t.delayShare) : ""],
    });
  });

  const delayPeople = m.checkInDelay.filter((p) => p.manHour > 0).sort((a, b) => b.manHour - a.manHour);
  const sop = inputs.sop;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">상세 표</h1>
          <p className="text-sm text-muted-foreground">
            운영일 {mos.workDate} · {mos.source}
          </p>
        </div>
        <ToggleGroup type="single" variant="outline" size="sm" value={shift} onValueChange={(v) => v && setShift(v)}>
          <ToggleGroupItem value="all">전체</ToggleGroupItem>
          {groups.map((g) => (
            <ToggleGroupItem key={g.key} value={g.key}>
              {g.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>근무조별 업무량</CardTitle>
            <CardDescription>처리 수량과 인원 환산(MH ÷ 8). 비율은 업무 총계 대비</CardDescription>
          </CardHeader>
          <CardContent>
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>업무</TableHead>
                  <TableHead className={num}>Total</TableHead>
                  {groups.map((g) => (
                    <TableHead key={g.key} colSpan={2} className="border-l text-center">
                      {g.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.taskSummary.map((row, i) => {
                  const f = row.unit === "qty" ? fmtInt : fmt1;
                  return (
                    <TableRow key={i} className={cn(i === 3 && "border-t-2")}>
                      <TableCell className="font-medium">
                        {row.label}
                        {row.unit === "hc" && <span className="ml-1 text-muted-foreground">인원</span>}
                      </TableCell>
                      <TableCell className={cn(num, "font-semibold")}>{f(row.total)}</TableCell>
                      {groups.map((g) => {
                        const cellv = (row as any)[g.key];
                        return (
                          <Fragment key={g.key}>
                            <TableCell className={cn(num, "border-l")}>{f(cellv.value)}</TableCell>
                            <TableCell className={cn(num, "text-muted-foreground")}>{fmtPct(cellv.share)}</TableCell>
                          </Fragment>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>S&amp;OP</CardTitle>
            <CardDescription>입력 탭 값</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead className={num}>D-1</TableHead>
                  <TableHead className={num}>D-0</TableHead>
                  <TableHead className={num}>Diff.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className={num}>{fmtInt(s.sopD1)}</TableCell>
                  <TableCell className={num}>{fmtInt(s.sopD0)}</TableCell>
                  <TableCell className={num}>{fmtInt(s.sopDiff)}</TableCell>
                </TableRow>
                {(
                  [
                    ["direct", "Direct"],
                    ["xdock", "Xdock"],
                    ["rc", "RC"],
                    ["rocketmart", "RocketMart"],
                  ] as const
                ).map(([k, label]) => (
                  <TableRow key={k}>
                    <TableCell className="text-muted-foreground">{label}</TableCell>
                    <TableCell className={num}>{fmtInt(sop.d1[k])}</TableCell>
                    <TableCell className={num}>{fmtInt(sop.d0[k])}</TableCell>
                    <TableCell className={num}>{fmtInt(sop.d0[k] - sop.d1[k])}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead />
                  {SHIFTS3.map(([k, label]) => (
                    <TableHead key={k} className={num}>
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-muted-foreground">진열 비율</TableCell>
                  {SHIFTS3.map(([k]) => (
                    <TableCell key={k} className={num}>
                      {fmtPct(inputs.rates[k])}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">진열 Plan</TableCell>
                  {SHIFTS3.map(([k]) => (
                    <TableCell key={k} className={num}>
                      {fmtInt(s.plan[k])}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" />
              H/C
            </CardTitle>
            <CardDescription>입력 탭 값 · Diff. = Act. − Tar.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead />
                  {SHIFTS3.map(([k, label]) => (
                    <TableHead key={k} colSpan={3} className="border-l text-center">
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  <TableHead />
                  {SHIFTS3.map(([k]) => (
                    <Fragment key={k}>
                      <TableHead className={cn(num, "border-l")}>Tar.</TableHead>
                      <TableHead className={num}>Act.</TableHead>
                      <TableHead className={num}>Diff.</TableHead>
                    </Fragment>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {inputs.hc.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="text-muted-foreground">{row.label}</TableCell>
                    {SHIFTS3.map(([k]) => {
                      const d = row[k].act - row[k].tar;
                      return (
                        <Fragment key={k}>
                          <TableCell className={cn(num, "border-l")}>{row[k].tar || ""}</TableCell>
                          <TableCell className={num}>{row[k].act || ""}</TableCell>
                          <TableCell className={cn(num, d < 0 && "text-red-600", d > 0 && "text-emerald-600")}>{d || ""}</TableCell>
                        </Fragment>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>근무조 시뮬레이션</CardTitle>
            <CardDescription>Tar = 목표 인원·Plan · Act = 실제 인원·진열 · Simul = Day 실적 기준 남은 물량 배분</CardDescription>
          </CardHeader>
          <CardContent>
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead />
                  {SHIFTS3.map(([k, label]) => (
                    <TableHead key={k} className={num}>
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  [
                    ["tar", "Tar"],
                    ["act", "Act"],
                    ["simul", "Simul"],
                  ] as const
                ).map(([b, title]) => (
                  <Fragment key={b}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={4} className="font-semibold">
                        {title}
                      </TableCell>
                    </TableRow>
                    {(
                      [
                        ["total", "Total", fmtInt],
                        ["facility", "Facility", fmtInt],
                        ["gap", "Gap", fmtInt],
                        ["stow", b === "simul" ? "Expect Stow" : "Stow", fmtInt],
                        ["htp", "HTP", fmt1],
                      ] as const
                    ).map(([key, label, f]) => (
                      <TableRow key={key}>
                        <TableCell className="pl-4 text-muted-foreground">{label}</TableCell>
                        {SHIFTS3.map(([k]) => {
                          const v = (m.simulation as any)[b][k][key];
                          return (
                            <TableCell key={k} className={cn(num, key === "htp" && v !== null && (v >= target ? "text-emerald-600" : "text-red-600"))}>
                              {f(v)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
                {(
                  [
                    ["actMinusTarget", "Act − Target Stow"],
                    ["actMinusSimul", "Act − Simul Stow"],
                  ] as const
                ).map(([key, label]) => (
                  <TableRow key={key} className="font-medium">
                    <TableCell>{label}</TableCell>
                    {SHIFTS3.map(([k]) => {
                      const v = (m.simulation.simul as any)[k][key];
                      return (
                        <TableCell key={k} className={cn(num, v < 0 && "text-red-600", v > 0 && "text-emerald-600")}>
                          {fmtInt(v)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>시간대별 현황</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            근무조 HTP
            {m.shiftHtp.map((g) => (
              <Badge key={g.key} variant="outline" className={cn(g.htp !== null && (g.htp >= target ? "text-emerald-700" : "text-red-700"))}>
                {g.label} {fmt1(g.htp)}
              </Badge>
            ))}
            <span>· 생산성 칸은 Target {fmt1(target)} 이상 초록, 미만 빨강</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HourlyTable hours={hours} groups={groups} rows={hourlyRows} totalLabel={shiftLabel} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>진열 구성</CardTitle>
          <CardDescription>직납·이관별 온도대·개별/팔레트 진열 수량. 비율은 상위 묶음 대비</CardDescription>
        </CardHeader>
        <CardContent>
          <HourlyTable hours={hours} groups={groups} rows={mixRows} leadHeaders={["비율"]} totalLabel={shiftLabel} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>공정별 투입시간 (MH)</CardTitle>
          <CardDescription>비율·총계·체크인 지연은 하루 전체 기준. 공정 총계에는 체크인 지연 MH가 포함됩니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <HourlyTable hours={hours} groups={groups} rows={mhRows} leadHeaders={["비율", "총계", "지연 MH", "지연 비율"]} totalLabel={shiftLabel} />
        </CardContent>
      </Card>

      <Card>
        <Collapsible>
          <CardHeader>
            <CollapsibleTrigger asChild>
              <button className="group flex w-full items-center justify-between text-left">
                <div>
                  <CardTitle>체크인 지연 인원 {delayPeople.length}명</CardTitle>
                  <CardDescription className="mt-1">근무조 시작보다 첫 작업이 늦은 입고 인원 · 지연 MH 큰 순</CardDescription>
                </div>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>근무조</TableHead>
                    <TableHead className={num}>첫 시작</TableHead>
                    <TableHead>첫 공정</TableHead>
                    <TableHead className={num}>지연 MH</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {delayPeople.map((p) => {
                    const mins = Math.round(p.firstStart * 1440);
                    return (
                      <TableRow key={p.employee}>
                        <TableCell>{p.employee}</TableCell>
                        <TableCell className="text-muted-foreground">{p.shift}</TableCell>
                        <TableCell className={num}>
                          {String(Math.floor(mins / 60)).padStart(2, "0")}:{String(mins % 60).padStart(2, "0")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.task}</TableCell>
                        <TableCell className={cn(num, "font-medium")}>{fmt1(p.manHour)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}
