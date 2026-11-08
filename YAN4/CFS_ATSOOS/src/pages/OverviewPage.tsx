import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import BarList, { percent } from "@/components/BarList";
import Pager, { PAGE_SIZE, lastPageOf } from "@/components/Pager";
import { Button } from "@/components/ui/button";
import type { AtsOosTable } from "@/lib/ats-oos";
import {
  EVIDENCE_HEADERS,
  LATE_VERDICTS,
  VERDICTS,
  buildOverviewRows,
  cutlineLabel,
  formatLate,
  tally,
  topWithOther,
  type OverviewRow,
  type Tally,
  type TransferCells,
  type Verdict,
} from "@/lib/overview";

const ALL = "전체";
const FIELD_CLASS = "h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground";
const count = (n: number) => n.toLocaleString("ko-KR");

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {sub && <span className="text-xs break-words text-muted-foreground">{sub}</span>}
    </div>
  );
}

const lateCell = (row: OverviewRow, step: Verdict) => (row.verdict === step ? "px-2 py-1 whitespace-nowrap font-semibold" : "px-2 py-1 whitespace-nowrap");

type Props = {
  table: (AtsOosTable & { date: string; centers: string[] }) | null;
  cutlines: Record<string, string>;
  transfers: Record<string, TransferCells>;
  requeried: boolean;
  running: boolean;
  onDownload: () => void;
};

export default function OverviewPage({ table, cutlines, transfers, requeried, running, onDownload }: Props) {
  const [center, setCenter] = useState(ALL);
  const [verdict, setVerdict] = useState(ALL);
  const [evidencePage, setEvidencePage] = useState(0);

  const allRows = useMemo(() => (table ? buildOverviewRows(table, cutlines, transfers) : []), [table, cutlines, transfers]);
  const centers = useMemo(() => tally(allRows, (r) => r.center), [allRows]);
  // 다른 데이터를 받아 고른 센터가 사라지면 전체로 본다
  const activeCenter = centers.some((c) => c.key === center) ? center : ALL;
  const rows = useMemo(() => (activeCenter === ALL ? allRows : allRows.filter((r) => r.center === activeCenter)), [allRows, activeCenter]);

  if (!table) {
    return <p className="p-6 text-sm text-muted-foreground">데이터 탭에서 Power BI 데이터를 먼저 받아 주세요.</p>;
  }

  const totalUnits = rows.reduce((sum, r) => sum + r.units, 0);
  const allUnits = allRows.reduce((sum, r) => sum + r.units, 0);
  const orders = new Set(rows.map((r) => r.center + "|" + r.order)).size;
  const verdicts: Tally[] = VERDICTS.map((key) => {
    const hit = rows.filter((r) => r.verdict === key);
    return { key, units: hit.reduce((s, r) => s + r.units, 0), rows: hit.length };
  });
  const lateUnits = verdicts.filter((v) => LATE_VERDICTS.includes(v.key as Verdict)).reduce((s, v) => s + v.units, 0);
  const unknown = verdicts[verdicts.length - 1];
  const rca = tally(rows, (r) => r.rca3);
  const byCutline = tally(rows.filter((r) => r.cutlineMs !== null), (r) => cutlineLabel(r.cutlineMs)).sort((a, b) => a.key.localeCompare(b.key));
  const evidence = verdict === ALL ? rows : rows.filter((r) => r.verdict === verdict);
  // 필터로 행이 줄면 마지막 페이지 안으로 맞춘다
  const page = Math.min(evidencePage, lastPageOf(evidence.length));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-lg font-semibold">ATS OOS 개요</h2>
          <p className="text-xs text-muted-foreground">
            {table.centers.join(", ")} · {table.date} · 단위는 유닛(units)입니다.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          센터 보기
          <select value={activeCenter} onChange={(e) => setCenter(e.target.value)} className={FIELD_CLASS} aria-label="센터 보기">
            <option value={ALL}>{ALL}</option>
            {centers.map((c) => (
              <option key={c.key} value={c.key}>
                {c.key}
              </option>
            ))}
          </select>
        </label>
        <Button size="lg" variant="outline" disabled={running} onClick={onDownload}>
          <Download />
          엑셀 다운로드
        </Button>
      </div>

      {(!requeried || running) && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          {running ? "WMS 재조회가 끝나면 지연 판정이 완성됩니다." : "지연 판정에는 출고 커트라인과 WMS 시간이 필요합니다. 데이터 탭에서 WMS 재조회를 실행해 주세요."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="OOS 유닛" value={count(totalUnits)} sub={`${count(rows.length)}행 · 오더 ${count(orders)}건`} />
        <Tile label="커트라인보다 늦음" value={percent(lateUnits, totalUnits)} sub={`${count(lateUnits)} 유닛 · 상차·하차·진열 지연 합계`} />
        <Tile label="가장 많은 RCA_Level_3" value={rca[0] ? percent(rca[0].units, totalUnits) : "-"} sub={rca[0]?.key} />
        <Tile label="판단 불가" value={count(unknown.units)} sub={`${count(unknown.rows)}행 · 커트라인 또는 WMS 시간 없음`} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <BarList title="출고 커트라인 대비 지연 구간" note="커트라인보다 처음 늦어진 단계로 구분합니다." items={verdicts} total={totalUnits} />
        {centers.length > 1 && (
          <BarList title="센터별 OOS" note="선택한 센터의 전체 OOS 중 비중입니다. 출고량 대비 비율은 아닙니다." items={centers} total={allUnits} />
        )}
        <BarList title="출고 커트라인별 OOS" note="시간순으로 표시합니다." items={byCutline} total={totalUnits} />
        <BarList title="RCA_Level_3" items={topWithOther(rca, 8)} total={totalUnits} />
        <BarList title="F3 / SD" items={tally(rows, (r) => r.f3sd)} total={totalUnits} />
        <BarList title="From FC" items={topWithOther(tally(rows, (r) => r.fromFc), 8)} total={totalUnits} />
        <BarList title="온도대" items={tally(rows, (r) => r.temperature)} total={totalUnits} />
      </div>

      <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10" aria-label="OOS 근거">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h3 className="text-sm font-semibold">OOS 사유 근거</h3>
            <p className="text-xs text-muted-foreground">
              {count(evidence.length)}행 · 처음 늦어진 시간은 굵게 표시합니다.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            판정
            <select value={verdict} onChange={(e) => setVerdict(e.target.value)} className={FIELD_CLASS} aria-label="판정">
              <option value={ALL}>{ALL}</option>
              {VERDICTS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="max-h-[480px] overflow-auto rounded-lg border">
          <table className="w-max text-xs">
            <thead className="sticky top-0 bg-muted text-left">
              <tr>
                {EVIDENCE_HEADERS.map((h) => (
                  <th key={h} className="px-2 py-1.5 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {evidence.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1 whitespace-nowrap">{r.center}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.order}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.temperature}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.cutline}</td>
                  <td className={lateCell(r, "상차 지연")}>{r.load}</td>
                  <td className={lateCell(r, "하차 지연")}>{r.unload}</td>
                  <td className={lateCell(r, "진열 지연")}>{r.stow}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.verdict}</td>
                  <td className="px-2 py-1 whitespace-nowrap tabular-nums">{formatLate(r.lateMinutes)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.rca3}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.fromFc}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.f3sd}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap tabular-nums">{r.units}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} total={evidence.length} onChange={setEvidencePage} />
      </section>
    </main>
  );
}
