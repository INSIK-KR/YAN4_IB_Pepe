import { useState } from "react";
import { ko } from "react-day-picker/locale";
import { CalendarIcon, CloudDownload, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadFromMos, type MosData } from "@/lib/mos";
import { fmtInt, todayLocal } from "@/lib/format";

type Props = {
  mos: MosData | null;
  loggedIn: boolean;
  onLoaded: (data: MosData) => void;
  onClear: () => void;
};

function toDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export default function MosPage({ mos, loggedIn, onLoaded, onClear }: Props) {
  const [date, setDate] = useState(todayLocal());
  const [dateOpen, setDateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);

  async function onDownload() {
    setBusy(true);
    setError(null);
    setProgress("");
    try {
      const r = await downloadFromMos(date, setProgress);
      if (r.ok) {
        onLoaded(r.data);
        setProgress("완료 · " + fmtInt(r.data.rows.length) + "행 · " + fmtInt(r.bytes / 1024) + " KB");
        toast.success("MOS에서 받았습니다", { description: fmtInt(r.data.rows.length) + "행 · 운영일 " + r.data.workDate });
      } else {
        setProgress("");
        setError({ message: r.error, detail: r.detail });
      }
    } catch (e) {
      setProgress("");
      setError({ message: "오류: " + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudDownload className="size-4" />
            MOS에서 받기
          </CardTitle>
          <CardDescription>
            근무 이력(worker history)을 YAN4 · INBOUND/OTHER/OUTBOUND 전체로 받아 바로 계산합니다.
            {!loggedIn && " 먼저 오른쪽 위 MOS 로그인을 해주세요."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-44 justify-start font-normal" data-testid="mos-date">
                  <CalendarIcon />
                  {date}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={ko}
                  selected={toDate(date)}
                  onSelect={(d) => {
                    if (d) setDate(toIso(d));
                    setDateOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
            <Button onClick={onDownload} disabled={busy} data-testid="mos-download">
              {busy ? <Loader2 className="animate-spin" /> : <CloudDownload />}
              MOS에서 받기
            </Button>
          </div>
          {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
        </CardContent>
      </Card>


      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="grid gap-2">
            <p className="text-sm font-medium text-destructive">{error.message}</p>
            {error.detail && (
              <pre className="max-h-52 overflow-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap break-all">{error.detail}</pre>
            )}
          </CardContent>
        </Card>
      )}

      {mos && (
        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-2">
            <div className="grid gap-1">
              <CardTitle>미리보기</CardTitle>
              <CardDescription>
                {mos.source} · {fmtInt(mos.rows.length)}행 · 운영일 {mos.workDate} · 앞 30행
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onClear}>
              <Trash2 />
              지우기
            </Button>
          </CardHeader>
          <CardContent>
            <div className="max-h-[480px] overflow-auto rounded-md border">
              <Table className="text-xs">
                <TableHeader className="sticky top-0 bg-muted">
                  <TableRow>
                    {(mos.preview[0] || []).slice(0, 33).map((c, i) => (
                      <TableHead key={i} className="whitespace-nowrap">
                        {String(c)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mos.preview.slice(1).map((r, i) => (
                    <TableRow key={i}>
                      {r.slice(0, 33).map((c, j) => (
                        <TableCell key={j} className="whitespace-nowrap">
                          {String(c ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
