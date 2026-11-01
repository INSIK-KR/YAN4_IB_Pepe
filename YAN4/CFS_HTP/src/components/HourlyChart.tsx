import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { fmt1, fmtInt, hourLabel } from "@/lib/format";
import type { ShiftGroup } from "@/lib/htp-calc.mjs";

type Values = Record<number, number | null | undefined>;
export type ChartSeries = { key: string; label: string; color: string; values: Values };

type Props = {
  hours: number[];
  groups: ShiftGroup[];
  shiftHtp: { key: string; htp: number | null }[];
  series: ChartSeries[];
  productivity: Values;
  target: number;
  /** 툴팁에만 보여줄 값 */
  extras: { label: string; values: Values; fmt: (v: number | null | undefined) => string }[];
};

const LEFT = 42;
const RIGHT = 10;
const BAND_H = 26;
const BAR_H = 220;
const GAP_H = 26;
const LINE_H = 96;
const AXIS_H = 24;
const HEIGHT = BAND_H + BAR_H + GAP_H + LINE_H + AXIS_H;

const AXIS = "var(--muted-foreground)";
const GRID = "var(--border)";
const GOOD = "#059669";
const BAD = "#dc2626";

function niceStep(max: number) {
  const raw = max / 4 || 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

function compact(v: number) {
  return v >= 1000 ? +(v / 1000).toFixed(1) + "K" : String(v);
}

/** 위: 시간대별 진열 수량(쌓은 막대) / 아래: 시간대별 생산성(선). 축을 따로 두고 시간축만 공유한다 */
export default function HourlyChart({ hours, groups, shiftHtp, series, productivity, target, extras }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const colW = (width - LEFT - RIGHT) / hours.length;
  const x = (i: number) => LEFT + i * colW;
  const cx = (i: number) => x(i) + colW / 2;

  const totals = hours.map((h) => series.reduce((s, d) => s + (d.values[h] || 0), 0));
  const peak = Math.max(...totals, 1);
  const step = niceStep(peak);
  const top = Math.ceil(peak / step) * step;
  const barBase = BAND_H + BAR_H;
  const yBar = (v: number) => barBase - (v / top) * (BAR_H - 18);
  const barW = Math.min(24, colW * 0.62);
  const showAllLabels = colW >= 34;
  const peakIdx = totals.indexOf(peak);

  // 진열이 거의 없는 시간(휴게 등)은 생산성 선을 끊는다
  const lineTop = barBase + GAP_H;
  const points = hours.map((h, i) => {
    const v = productivity[h];
    return v && totals[i] >= peak * 0.05 ? v : null;
  });
  const valid = points.filter((v): v is number => v !== null);
  const lineMax = Math.max(...valid, target, 1) * 1.12;
  const yLine = (v: number) => lineTop + LINE_H - (v / lineMax) * LINE_H;
  const segments: string[] = [];
  let cur = "";
  points.forEach((v, i) => {
    if (v === null) {
      if (cur) segments.push(cur);
      cur = "";
    } else {
      cur += (cur ? "L" : "M") + cx(i).toFixed(1) + " " + yLine(v).toFixed(1);
    }
  });
  if (cur) segments.push(cur);
  const maxLine = valid.length ? Math.max(...valid) : null;
  const minLine = valid.length ? Math.min(...valid) : null;

  const hoverHour = hover === null ? null : hours[hover];
  const hoverGroup = hoverHour === null ? null : groups.find((g) => hoverHour >= g.from && hoverHour <= g.to);
  const hoverProd = hoverHour === null ? null : productivity[hoverHour];

  return (
    <div ref={box} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={HEIGHT} role="img" aria-label="시간대별 진열 수량과 생산성" className="block">
        {groups.map((g, gi) => {
          const from = hours.indexOf(g.from);
          const to = hours.indexOf(g.to);
          if (from < 0 || to < 0) return null;
          const htp = shiftHtp.find((s) => s.key === g.key)?.htp ?? null;
          return (
            <g key={g.key}>
              {gi % 2 === 0 && <rect x={x(from)} y={0} width={(to - from + 1) * colW} height={HEIGHT - AXIS_H} fill="var(--muted)" opacity={0.55} />}
              <text x={x(from) + 8} y={17} fontSize={12} fontWeight={600} fill="var(--foreground)">
                {g.label}
              </text>
              <text x={x(to + 1) - 8} y={17} fontSize={11} textAnchor="end" fill={AXIS}>
                {htp === null ? "" : "HTP " + fmt1(htp)}
              </text>
            </g>
          );
        })}

        {/* 진열 수량 */}
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((t) => (
          <g key={t}>
            <line x1={LEFT} x2={width - RIGHT} y1={yBar(t)} y2={yBar(t)} stroke={GRID} />
            <text x={LEFT - 8} y={yBar(t) + 4} fontSize={11} textAnchor="end" fill={AXIS}>
              {compact(t)}
            </text>
          </g>
        ))}
        {hours.map((h, i) => {
          if (!totals[i]) return null;
          let acc = 0;
          const present = series.filter((d) => d.values[h]);
          return (
            <g key={h} opacity={hover === null || hover === i ? 1 : 0.55}>
              {present.map((d, si) => {
                const v = d.values[h] || 0;
                const y0 = yBar(acc);
                acc += v;
                const y1 = yBar(acc);
                const isTop = si === present.length - 1;
                const hgt = Math.max(1, y0 - y1 - (si > 0 ? 2 : 0));
                const left = cx(i) - barW / 2;
                const yTop = y0 - (si > 0 ? 2 : 0) - hgt;
                if (!isTop) return <rect key={d.key} x={left} y={yTop} width={barW} height={hgt} fill={d.color} />;
                const r = Math.min(4, hgt, barW / 2);
                return (
                  <path
                    key={d.key}
                    fill={d.color}
                    d={`M${left} ${yTop + hgt}V${yTop + r}Q${left} ${yTop} ${left + r} ${yTop}H${left + barW - r}Q${left + barW} ${yTop} ${left + barW} ${yTop + r}V${yTop + hgt}Z`}
                  />
                );
              })}
              {(showAllLabels || i === peakIdx) && (
                <text x={cx(i)} y={yBar(totals[i]) - 5} fontSize={10.5} textAnchor="middle" fontWeight={i === peakIdx ? 700 : 500} fill={i === peakIdx ? "var(--foreground)" : AXIS}>
                  {fmtInt(totals[i])}
                </text>
              )}
            </g>
          );
        })}

        {/* 생산성 */}
        <text x={LEFT - 8} y={yLine(target) + 4} fontSize={11} textAnchor="end" fontWeight={600} fill="var(--foreground)">
          {Math.round(target)}
        </text>
        <line x1={LEFT} x2={width - RIGHT} y1={yLine(target)} y2={yLine(target)} stroke="var(--foreground)" opacity={0.35} />
        <text x={LEFT + 4} y={lineTop - 8} fontSize={11} fill={AXIS}>
          생산성 (진열 ÷ 직접·간접 MH) · 가로선 = Target
        </text>
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--foreground)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {points.map((v, i) =>
          v === null ? null : (
            <g key={i}>
              <circle cx={cx(i)} cy={yLine(v)} r={4} fill={v >= target ? GOOD : BAD} stroke="var(--card)" strokeWidth={2} />
              {(v === maxLine || v === minLine) && (
                <text x={cx(i)} y={v === maxLine ? yLine(v) - 8 : yLine(v) + 17} fontSize={11} fontWeight={600} textAnchor="middle" fill="var(--foreground)">
                  {Math.round(v)}
                </text>
              )}
            </g>
          )
        )}

        {/* 시간축 + 마우스 영역 */}
        {hours.map((h, i) => (
          <text key={h} x={cx(i)} y={HEIGHT - 8} fontSize={11} textAnchor="middle" fontWeight={hover === i ? 700 : 400} fill={hover === i ? "var(--foreground)" : AXIS}>
            {hourLabel(h)}
          </text>
        ))}
        {hover !== null && <line x1={cx(hover)} x2={cx(hover)} y1={BAND_H} y2={HEIGHT - AXIS_H} stroke="var(--foreground)" opacity={0.2} />}
        {hours.map((h, i) => (
          <rect key={h} x={x(i)} y={BAND_H} width={colW} height={HEIGHT - BAND_H} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>

      {hover !== null && hoverHour !== null && (
        <div
          className="pointer-events-none absolute z-20 w-48 rounded-lg border bg-popover p-3 text-xs shadow-lg"
          style={{ top: BAND_H + 4, left: cx(hover) > width / 2 ? cx(hover) - 204 : cx(hover) + 12 }}
        >
          <div className="mb-2 flex items-center justify-between font-semibold">
            <span>{hourLabel(hoverHour)}시</span>
            <span className="font-normal text-muted-foreground">{hoverGroup?.label}</span>
          </div>
          <div className="grid gap-1 tabular-nums">
            {series.map((d) => (
              <div key={d.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2 rounded-sm" style={{ background: d.color }} />
                  {d.label}
                </span>
                {fmtInt(d.values[hoverHour] || 0)}
              </div>
            ))}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>진열</span>
              {fmtInt(totals[hover])}
            </div>
            <div className="flex items-center justify-between font-semibold">
              <span>생산성</span>
              <span className="flex items-center gap-0.5">
                {hoverProd ? hoverProd >= target ? <ArrowUpRight className="size-3.5 text-emerald-600" /> : <ArrowDownRight className="size-3.5 text-red-600" /> : null}
                {hoverProd ? fmt1(hoverProd) : "-"}
              </span>
            </div>
            {extras.map((e) => (
              <div key={e.label} className="flex justify-between text-muted-foreground">
                <span>{e.label}</span>
                {e.fmt(e.values[hoverHour] || 0)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
