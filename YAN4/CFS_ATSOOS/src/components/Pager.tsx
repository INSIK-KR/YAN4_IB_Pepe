import { Button } from "@/components/ui/button";

export const PAGE_SIZE = 100;

export const lastPageOf = (total: number) => Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

/** page 는 0부터. 한 페이지로 끝나면 표시하지 않는다 */
export default function Pager({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const last = lastPageOf(total);
  if (last === 0) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onChange(page - 1)}>
        이전
      </Button>
      <span className="tabular-nums">
        {page + 1} / {last + 1} 페이지
      </span>
      <Button size="sm" variant="outline" disabled={page === last} onClick={() => onChange(page + 1)}>
        다음
      </Button>
    </div>
  );
}
