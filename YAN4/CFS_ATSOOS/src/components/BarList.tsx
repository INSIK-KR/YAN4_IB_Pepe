import type { Tally } from "@/lib/overview";

const BAR_COLOR = "#2a78d6";

const count = (n: number) => n.toLocaleString("ko-KR");
export const percent = (part: number, whole: number) => (whole > 0 ? ((part / whole) * 100).toFixed(1) + "%" : "0.0%");

/** 항목별 유닛 가로 막대. 항목 이름과 값은 글자로 함께 보여준다 */
export default function BarList({ title, note, items, total }: { title: string; note?: string; items: Tally[]; total: number }) {
  const max = Math.max(1, ...items.map((item) => item.units));
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10" aria-label={title}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {items.length === 0 && <p className="text-xs text-muted-foreground">표시할 데이터가 없습니다.</p>}
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.key} className="group relative grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-2 rounded px-1 py-1 hover:bg-muted/60">
            <span className="break-words text-xs">{item.key}</span>
            <span className="block h-3" aria-hidden="true">
              <span
                className="block h-full rounded-r"
                style={{ width: `${Math.max(1, (item.units / max) * 100)}%`, background: BAR_COLOR }}
              />
            </span>
            <span className="whitespace-nowrap text-xs tabular-nums">
              {count(item.units)} <span className="text-muted-foreground">({percent(item.units, total)})</span>
            </span>
            <span className="pointer-events-none absolute top-full right-1 z-10 hidden rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background group-hover:block">
              {item.key} · 유닛 {count(item.units)} · {count(item.rows)}행
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
