import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeftRight, CheckCircle2, CircleAlert, Download, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bridge, type PbiStatus, type WmsSession } from "@/lib/bridge";
import { parseAtsOosExport, type AtsOosTable } from "@/lib/ats-oos";
import { CENTER_NAMES, CENTER_REGIONS, DEFAULT_CENTER, centerIdOf, isSelectableCenter } from "@/lib/centers";

const PREVIEW_ROWS = 20;
const FIELD_CLASS = "h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground";

function CenterSelect({ value, onChange, label }: { value: string; onChange: (center: string) => void; label: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD_CLASS}>
        {CENTER_REGIONS.map(([region, names]) => (
          <optgroup key={region} label={region}>
            {names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

type Tone = "busy" | "ok" | "idle" | "error";

function StatusLine({ tone, title, children }: { tone: Tone; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-2" role="status">
      {tone === "busy" && <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />}
      {tone === "ok" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
      {(tone === "idle" || tone === "error") && (
        <CircleAlert className={"mt-0.5 size-4 shrink-0 " + (tone === "error" ? "text-destructive" : "text-muted-foreground")} />
      )}
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {children && <p className="mt-0.5 break-all text-xs text-muted-foreground">{children}</p>}
      </div>
    </div>
  );
}

export default function App() {
  const [version, setVersion] = useState("");
  // null = 첫 확인이 아직 끝나지 않음
  const [wms, setWms] = useState<WmsSession | null>(null);
  const [pbi, setPbi] = useState<PbiStatus>({ loggedIn: false, checking: true, loginOpen: false });
  const [date, setDate] = useState(yesterday);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [table, setTable] = useState<(AtsOosTable & { date: string; center: string }) | null>(null);
  const [dataCenter, setDataCenter] = useState(DEFAULT_CENTER);
  const [switchTarget, setSwitchTarget] = useState(DEFAULT_CENTER);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");

  const wmsCenterId = wms?.centerId;
  const wmsCenterName = wmsCenterId ? (CENTER_NAMES[wmsCenterId] ?? wmsCenterId) : undefined;

  // WMS 현재 센터가 확인되거나 바뀌면 전환 목록과 데이터 센터를 그 값으로 맞춘다 (데이터 센터는 이후 따로 바꿀 수 있음)
  useEffect(() => {
    if (!isSelectableCenter(wmsCenterName)) return;
    setSwitchTarget(wmsCenterName);
    setDataCenter(wmsCenterName);
  }, [wmsCenterName]);

  useEffect(() => {
    if (!bridge) return;
    void bridge.appInfo().then((info) => setVersion(info.version));
    // 결과는 onWmsSession 으로 온다 (늦게 끝난 확인이 새 결과를 덮지 않게 한 곳에서만 받음)
    const offWms = bridge.onWmsSession(setWms);
    const offPbi = bridge.onPbiStatus(setPbi);
    void bridge.wmsStatus();
    void bridge.pbiStatus().then(setPbi);
    return () => {
      offWms();
      offPbi();
    };
  }, []);

  async function fetchData() {
    if (!bridge || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await bridge.pbiExport({ center: dataCenter, date });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTable({ ...parseAtsOosExport(res.base64), date, center: dataCenter });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function switchCenter() {
    const id = centerIdOf(switchTarget);
    if (!bridge || !id || switching) return;
    setSwitching(true);
    setSwitchError("");
    try {
      const res = await bridge.wmsChangeCenter(id);
      if (!res.ok) setSwitchError(res.error);
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwitching(false);
    }
  }

  const wmsIn = wms?.loggedIn === true;
  const wmsFailed = !!wms?.error;

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="flex h-12 items-center gap-2 border-b bg-background px-4">
        <span className="font-semibold">CFS ATSOOS</span>
        {version && <span className="text-xs text-muted-foreground">v{version}</span>}
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>WMS 로그인</CardTitle>
              <CardDescription>쿠팡 계정으로 로그인하면 이 앱에 로그인 상태가 유지됩니다.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <StatusLine
                tone={wms === null ? "busy" : wmsIn ? "ok" : wmsFailed ? "error" : "idle"}
                title={wms === null ? "로그인 상태 확인 중" : wmsIn ? "로그인됨" : wmsFailed ? "WMS에 연결하지 못했습니다" : "로그인이 필요합니다"}
              >
                {wms?.error ?? (wmsIn ? "현재 센터 " + (wmsCenterName ?? "확인 불가") : undefined)}
              </StatusLine>
              {wmsIn && (
                <div className="flex items-end gap-2">
                  <CenterSelect label="WMS 센터 전환" value={switchTarget} onChange={setSwitchTarget} />
                  <Button size="lg" variant="outline" disabled={switching || switchTarget === wmsCenterName} onClick={switchCenter}>
                    {switching ? <Loader2 className="animate-spin" /> : <ArrowLeftRight />}
                    {switching ? "전환 중" : "전환"}
                  </Button>
                </div>
              )}
              {switchError && <StatusLine tone="error" title={switchError} />}
              <Button size="lg" variant={wmsIn ? "outline" : "default"} onClick={() => bridge?.wmsLogin()}>
                <LogIn />
                {wmsIn ? "WMS 다시 로그인" : "WMS 로그인"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Power BI 로그인</CardTitle>
              <CardDescription>ATS OOS 리포트를 받을 회사 계정으로 로그인합니다.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <StatusLine
                tone={pbi.loggedIn ? "ok" : pbi.checking ? "busy" : "idle"}
                title={pbi.loggedIn ? "로그인됨" : pbi.loginOpen ? "로그인 창에서 로그인해 주세요" : pbi.checking ? "로그인 상태 확인 중" : "로그인이 필요합니다"}
              />
              {!pbi.loggedIn && (
                <Button size="lg" onClick={() => bridge?.pbiLogin()}>
                  <LogIn />
                  Power BI 로그인
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>ATS OOS 데이터</CardTitle>
            <CardDescription>센터와 날짜를 골라 OOS 데이터를 Power BI에서 받습니다.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-2">
              <CenterSelect label="센터" value={dataCenter} onChange={setDataCenter} />
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                OOS 날짜
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD_CLASS} />
              </label>
              <Button size="lg" disabled={!pbi.loggedIn || busy || !date} onClick={fetchData}>
                {busy ? <Loader2 className="animate-spin" /> : <Download />}
                {busy ? "받는 중" : "데이터 받기"}
              </Button>
            </div>

            {error && <StatusLine tone="error" title={error} />}

            {table && !error && (
              <>
                <p className="font-medium">
                  {table.center} · {table.date} · {table.rows.length.toLocaleString("ko-KR")}행
                  {table.rows.length > PREVIEW_ROWS && <span className="ml-2 text-xs font-normal text-muted-foreground">앞 {PREVIEW_ROWS}행만 표시</span>}
                </p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-max text-xs">
                    <thead className="bg-muted/60 text-left">
                      <tr>
                        {table.columns.map((c, i) => (
                          <th key={i} className="whitespace-nowrap px-2 py-1.5 font-medium">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.slice(0, PREVIEW_ROWS).map((row, r) => (
                        <tr key={r} className="border-t">
                          {row.map((v, c) => (
                            <td key={c} className="whitespace-nowrap px-2 py-1">
                              {v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
