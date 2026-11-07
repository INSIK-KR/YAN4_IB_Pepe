import { useLayoutEffect, useRef, useState } from "react";
import { fmt1, fmtInt } from "@/lib/format";
import type { StowWorker } from "@/lib/stow-prod.mjs";

type Props = { title: string; workers: StowWorker[]; q1: number | null; median: number | null; max: number; color: string; lowColor: string };

const LEFT = 40;
const RIGHT = 8;
const TOP = 10;
const PLOT_H = 150;
const LABEL_H = 64;
const HEIGHT = TOP + PLOT_H + LABEL_H;
const AXIS = "var(--muted-foreground)";
const GRID = "var(--border)";

function niceMax(v: number) {
  const step = Math.pow(10, Math.floor(Math.log10(v))) / 2;
  return Math.ceil(v / step) * step;
}

/** 작업자별 EACH HTP 막대. EACH MH 1h 미만은 빼고, 하위 25% 는 다른 색 */
export default function WorkerChart({ title, workers, q1, median, max, color, lowColor }: Props) {
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

  const list = workers.filter((w) => w.eachHtp !== null);
  const top = niceMax(max);
  const colW = (width - LEFT - RIGHT) / Math.max(list.length, 1);
  const barW = Math.max(3, Math.min(28, colW - 2));
  const y = (v: number) => TOP + PLOT_H - (v / top) * PLOT_H;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => top * f);
  const hw = hover !== null ? list[hover] : null;

  return (
    <div className="grid gap-1">
      <div className="text-sm font-semibold">
        {title} <span className="text-xs font-normal text-muted-foreground">{list.length}명 · 중앙값 {fmt1(median)} · 하위 25% 기준 {fmt1(q1)}</span>
      </div>
      <div ref={box} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={`${title} 작업자별 EACH HTP`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={LEFT} x2={width - RIGHT} y1={y(t)} y2={y(t)} stroke={GRID} strokeDasharray={t ? "2 3" : undefined} />
              <text x={LEFT - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={AXIS}>
                {fmtInt(t)}
              </text>
            </g>
          ))}
          {list.map((w, i) => {
            const v = w.eachHtp as number;
            const low = q1 !== null && v < q1;
            const cx = LEFT + i * colW + colW / 2;
            const h = Math.max(3, TOP + PLOT_H - y(v));
            const name = w.employee.replace(/\(.*\)$/, "");
            return (
              <g key={w.employee} onMouseEnter={() => setHover(i)}>
                <rect x={LEFT + i * colW} y={TOP} width={colW} height={PLOT_H + LABEL_H} fill="transparent" />
                <path
                  d={`M${cx - barW / 2},${TOP + PLOT_H} v${-(h - 3)} q0,-3 3,-3 h${barW - 6} q3,0 3,3 v${h - 3} z`}
                  fill={low ? lowColor : color}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
                <text x={cx} y={TOP + PLOT_H + 8} fontSize={10} fill={AXIS} textAnchor="end" transform={`rotate(-50 ${cx} ${TOP + PLOT_H + 8})`}>
                  {name}
                </text>
              </g>
            );
          })}
          {median !== null && (
            <g>
              <line x1={LEFT} x2={width - RIGHT} y1={y(median)} y2={y(median)} stroke="var(--foreground)" strokeOpacity={0.55} strokeDasharray="5 3" />
              <text x={width - RIGHT} y={y(median) - 3} textAnchor="end" fontSize={10} fill={AXIS}>
                중앙값 {fmt1(median)}
              </text>
            </g>
          )}
        </svg>
        {hw && hover !== null && (
          <div
            className="pointer-events-none absolute z-20 w-52 rounded-lg border bg-popover p-3 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(LEFT + hover * colW - 80, 0), width - 210), top: 0 }}
          >
            <div className="mb-1 font-semibold">{hw.employee}</div>
            <div className="grid grid-cols-[1fr_auto] gap-x-3 tabular-nums">
              <span className="text-muted-foreground">EACH HTP</span>
              <b>{fmt1(hw.eachHtp)}</b>
              <span className="text-muted-foreground">EACH 물량 · MH</span>
              <span>
                {fmtInt(hw.each.qty)} · {fmt1(hw.each.mh)}h
              </span>
              <span className="text-muted-foreground">진열 HTP</span>
              <span>{fmt1(hw.htp)}</span>
              <span className="text-muted-foreground">계약 · 주 온도</span>
              <span>
                {hw.contract} · {hw.temp}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
