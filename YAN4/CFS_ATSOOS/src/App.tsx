import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, CheckCircle2, CircleAlert, Clock, Download, Loader2, LogIn, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bridge, type PbiStatus, type WmsSession } from "@/lib/bridge";
import { parseAtsOosExport, type AtsOosTable } from "@/lib/ats-oos";
import { BI_CENTERS, CENTER_NAMES, CENTER_REGIONS, DEFAULT_CENTER, centerIdOf, isSelectableCenter } from "@/lib/centers";

const PREVIEW_ROWS = 20;
// WMS 서버 부담을 줄이려고 오더 사이에 두는 간격
const CUTLINE_GAP_MS = 140;
const CUTLINE_EMPTY = "-";
const CUTLINE_UNAVAILABLE = "조회 불가";
const CUTLINE_FAILED = "실패";
const CUTLINE_SWITCH_FAILED = "전환 실패";

type CutlineLookup = {
  running: boolean;
  phase: "order" | "gc";
  center: string;
  done: number;
  total: number;
  found: number;
  empty: number;
  failed: number;
  error: string;
  stopped: boolean;
  note: string;
  gcDone: number;
  gcTotal: number;
  gcFound: number;
  gcCartOnly: number;
  gcMissing: number;
  gcFailed: number;
  gcNote: string;
  centerErrors: string[];
};
type TransferCells = { load: string; unload: string; stow: string; vehicle: string };
type CenterGroup = { orders: Set<string>; pairs: Map<string, { cart: string; ct: string }> };

const TRANSFER_COLUMNS: [keyof TransferCells, string][] = [
  ["load", "WMS 상차시간"],
  ["unload", "WMS 하차시간"],
  ["stow", "WMS 진열완료시간"],
  ["vehicle", "WMS 차량번호"],
];
// 같은 오더넘버·GC가 다른 센터에 있을 수 있어 센터까지 묶어서 구분한다
const cutlineKey = (center: string, order: string) => center + "|" + order;
const transferKey = (center: string, cart: string, ct: string) => center + "|" + cart + "|" + ct;
const count = (n: number) => n.toLocaleString("ko-KR");

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

function CenterChecks({ value, onChange }: { value: string[]; onChange: (centers: string[]) => void }) {
  const toggle = (name: string) => onChange(value.includes(name) ? value.filter((c) => c !== name) : [...value, name]);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="mr-1">센터 {value.length}개 선택</span>
        <Button size="xs" variant="ghost" onClick={() => onChange([...BI_CENTERS])}>
          모두 선택
        </Button>
        <Button size="xs" variant="ghost" onClick={() => onChange([])}>
          모두 해제
        </Button>
      </div>
      {CENTER_REGIONS.map(([region, names]) => (
        <div key={region} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-14 text-xs text-muted-foreground">{region}</span>
          {names
            .filter((name) => BI_CENTERS.includes(name))
            .map((name) => (
              <label key={name} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input type="checkbox" data-center={name} checked={value.includes(name)} onChange={() => toggle(name)} />
                {name}
              </label>
            ))}
        </div>
      ))}
    </div>
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
  const [table, setTable] = useState<(AtsOosTable & { date: string; centers: string[] }) | null>(null);
  const [dataCenters, setDataCenters] = useState<string[]>([DEFAULT_CENTER]);
  const centersTouched = useRef(false);
  const [switchTarget, setSwitchTarget] = useState(DEFAULT_CENTER);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [cutlines, setCutlines] = useState<Record<string, string>>({});
  const [transfers, setTransfers] = useState<Record<string, TransferCells>>({});
  const [lookup, setLookup] = useState<CutlineLookup | null>(null);
  const stopLookup = useRef(false);

  const wmsCenterId = wms?.centerId;
  const wmsCenterName = wmsCenterId ? (CENTER_NAMES[wmsCenterId] ?? wmsCenterId) : undefined;

  // WMS 현재 센터가 확인되거나 바뀌면 전환 목록을 맞춘다. 체크박스는 처음 한 번만 현재 센터로 맞추고 이후엔 고른 대로 둔다
  useEffect(() => {
    if (!isSelectableCenter(wmsCenterName)) return;
    setSwitchTarget(wmsCenterName);
    if (!centersTouched.current && BI_CENTERS.includes(wmsCenterName)) {
      centersTouched.current = true;
      setDataCenters([wmsCenterName]);
    }
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

  function changeDataCenters(centers: string[]) {
    centersTouched.current = true;
    setDataCenters(centers);
  }

  async function fetchData() {
    if (!bridge || busy || !dataCenters.length) return;
    setBusy(true);
    setError("");
    const centers = BI_CENTERS.filter((c) => dataCenters.includes(c));
    try {
      const res = await bridge.pbiExport({ centers, date });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTable({ ...parseAtsOosExport(res.base64), date, centers });
      setCutlines({});
      setTransfers({});
      setLookup(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runCutlineLookup() {
    if (!bridge || !table || lookup?.running) return;
    const col = (name: string) => table.columns.indexOf(name);
    const centerIndex = col("centercode");
    const orderIndex = col("ordernumber");
    const cartIndex = col("cartbarcode");
    const ctIndex = col("ctbarcode");

    // 데이터에 나온 센터 순서대로 묶어서, 센터를 한 번만 전환하고 그 센터 건을 모두 조회한다
    const groups = new Map<string, CenterGroup>();
    for (const row of table.rows) {
      const center = row[centerIndex];
      let group = groups.get(center);
      if (!group) {
        group = { orders: new Set(), pairs: new Map() };
        groups.set(center, group);
      }
      if (row[orderIndex]) group.orders.add(row[orderIndex]);
      const cart = cartIndex >= 0 ? row[cartIndex] : "";
      const ct = ctIndex >= 0 ? row[ctIndex] : "";
      if (/^GC-/i.test(cart)) group.pairs.set(transferKey(center, cart, ct), { cart, ct });
    }

    let total = 0;
    let gcTotal = 0;
    groups.forEach((group) => {
      total += group.orders.size;
      gcTotal += group.pairs.size;
    });
    const state: CutlineLookup = {
      running: true,
      phase: "order",
      center: "",
      done: 0,
      total,
      found: 0,
      empty: 0,
      failed: 0,
      error: "",
      stopped: false,
      note: "",
      gcDone: 0,
      gcTotal,
      gcFound: 0,
      gcCartOnly: 0,
      gcMissing: 0,
      gcFailed: 0,
      gcNote: "",
      centerErrors: [],
    };
    const finish = (patch: Partial<CutlineLookup>) => setLookup({ ...state, ...patch, running: false });
    const gap = () => new Promise((resolve) => setTimeout(resolve, CUTLINE_GAP_MS));
    stopLookup.current = false;
    setCutlines({});
    setTransfers({});
    setLookup({ ...state });

    let current = wmsCenterName;
    for (const [center, group] of groups) {
      if (stopLookup.current) return finish({ stopped: true });
      state.center = center;
      state.phase = "order";
      setLookup({ ...state });

      // 다른 센터 오더는 그 센터로 전환해야 열린다. 실패해도 다음 센터는 계속 조회한다
      if (current !== center) {
        const id = centerIdOf(center);
        const switched = id ? await bridge.wmsChangeCenter(id) : { ok: false as const, error: "센터 ID를 찾지 못했습니다" };
        if (!switched.ok) {
          state.centerErrors.push(center + " 센터 전환 실패: " + switched.error);
          state.failed += group.orders.size;
          state.done += group.orders.size;
          state.gcFailed += group.pairs.size;
          state.gcDone += group.pairs.size;
          const failedCells: Record<string, string> = {};
          group.orders.forEach((order) => (failedCells[cutlineKey(center, order)] = CUTLINE_SWITCH_FAILED));
          setCutlines((prev) => ({ ...prev, ...failedCells }));
          setLookup({ ...state });
          continue;
        }
        current = center;
      }

      for (const order of group.orders) {
        if (stopLookup.current) return finish({ stopped: true });
        const res = await bridge.wmsOrderCutline(order, table.date);
        if (!res.ok && res.needLogin) return finish({ error: res.error });
        let value: string;
        if (!res.ok) {
          value = CUTLINE_FAILED;
          state.failed++;
        } else if (res.cutlines.length) {
          value = res.cutlines.join(" / ");
          state.found++;
        } else {
          value = res.found ? CUTLINE_EMPTY : CUTLINE_UNAVAILABLE;
          state.empty++;
          if (!state.note && res.diagnostic) state.note = order + ": " + res.diagnostic;
        }
        state.done++;
        setCutlines((prev) => ({ ...prev, [cutlineKey(center, order)]: value }));
        setLookup({ ...state });
        await gap();
      }

      state.phase = "gc";
      setLookup({ ...state });
      for (const [key, { cart, ct }] of group.pairs) {
        if (stopLookup.current) return finish({ stopped: true });
        const res = await bridge.wmsTransferInfo({ cart, ct, center, date: table.date });
        if (!res.ok && res.needLogin) return finish({ error: res.error });
        if (!res.ok) {
          state.gcFailed++;
        } else if (!res.found) {
          state.gcMissing++;
          if (!state.gcNote) state.gcNote = cart + ": 이관현황에 없음";
        } else {
          if (res.ctMatched) state.gcFound++;
          else state.gcCartOnly++;
          if (!state.gcNote && res.diagnostic) state.gcNote = res.diagnostic;
          setTransfers((prev) => ({ ...prev, [key]: { load: res.load, unload: res.unload, stow: res.stow, vehicle: res.vehicle } }));
        }
        state.gcDone++;
        setLookup({ ...state });
        await gap();
      }
    }
    finish({});
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
  const columnOf = (name: string) => (table ? table.columns.indexOf(name) : -1);

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
                  <Button size="lg" variant="outline" disabled={switching || lookup?.running || switchTarget === wmsCenterName} onClick={switchCenter}>
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
            <CenterChecks value={dataCenters} onChange={changeDataCenters} />
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                OOS 날짜
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD_CLASS} />
              </label>
              <Button size="lg" disabled={!pbi.loggedIn || busy || !date || !dataCenters.length || lookup?.running} onClick={fetchData}>
                {busy ? <Loader2 className="animate-spin" /> : <Download />}
                {busy ? "받는 중" : "데이터 받기"}
              </Button>
              {table && !error && !lookup?.running && (
                <Button size="lg" variant="outline" disabled={!wmsIn || table.rows.length === 0} onClick={runCutlineLookup}>
                  <Clock />
                  WMS 재조회
                </Button>
              )}
              {lookup?.running && (
                <Button size="lg" variant="outline" onClick={() => (stopLookup.current = true)}>
                  <Square />
                  중지
                </Button>
              )}
            </div>

            {lookup?.running && (
              <StatusLine
                tone="busy"
                title={
                  (lookup.center ? lookup.center + " " : "") +
                  (lookup.phase === "order" ? `출고 커트라인 조회 중 ${count(lookup.done)} / ${count(lookup.total)}` : `이관 정보 조회 중 ${count(lookup.gcDone)} / ${count(lookup.gcTotal)}`)
                }
              />
            )}
            {lookup && !lookup.running && lookup.error && <StatusLine tone="error" title={lookup.error} />}
            {lookup && lookup.centerErrors.map((message) => <StatusLine key={message} tone="error" title={message} />)}
            {lookup && !lookup.running && !lookup.error && (
              <StatusLine tone={lookup.failed ? "idle" : "ok"} title={`출고 커트라인 조회 ${lookup.stopped ? "중지" : "완료"} ${count(lookup.done)} / ${count(lookup.total)}`}>
                {`값 있음 ${count(lookup.found)} · 값 없음 ${count(lookup.empty)} · 실패 ${count(lookup.failed)}${lookup.note ? ` · 조회 불가 예시 ${lookup.note}` : ""}`}
              </StatusLine>
            )}
            {lookup && !lookup.running && !lookup.error && lookup.gcTotal > 0 && (
              <StatusLine
                tone={lookup.gcFailed || lookup.gcMissing ? "idle" : "ok"}
                title={`이관 정보 조회 ${lookup.stopped ? "중지" : "완료"} ${count(lookup.gcDone)} / ${count(lookup.gcTotal)}`}
              >
                {`GC·CT 일치 ${count(lookup.gcFound)} · GC만 일치 ${count(lookup.gcCartOnly)} · 없음 ${count(lookup.gcMissing)} · 실패 ${count(lookup.gcFailed)}${lookup.gcNote ? ` · ${lookup.gcNote}` : ""}`}
              </StatusLine>
            )}

            {error && <StatusLine tone="error" title={error} />}

            {table && !error && (
              <>
                <p className="font-medium">
                  {table.centers.join(", ")} · {table.date} · {count(table.rows.length)}행
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
                        {lookup && <th className="whitespace-nowrap px-2 py-1.5 font-medium">출고 커트라인</th>}
                        {lookup &&
                          lookup.gcTotal > 0 &&
                          TRANSFER_COLUMNS.map(([key, label]) => (
                            <th key={key} className="whitespace-nowrap px-2 py-1.5 font-medium">
                              {label}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.slice(0, PREVIEW_ROWS).map((row, r) => {
                        const center = row[columnOf("centercode")];
                        const pair = transfers[transferKey(center, row[columnOf("cartbarcode")], row[columnOf("ctbarcode")] ?? "")];
                        return (
                          <tr key={r} className="border-t">
                            {row.map((v, c) => (
                              <td key={c} className="whitespace-nowrap px-2 py-1">
                                {v}
                              </td>
                            ))}
                            {lookup && <td className="whitespace-nowrap px-2 py-1">{cutlines[cutlineKey(center, row[columnOf("ordernumber")])] ?? ""}</td>}
                            {lookup &&
                              lookup.gcTotal > 0 &&
                              TRANSFER_COLUMNS.map(([key]) => (
                                <td key={key} className="whitespace-nowrap px-2 py-1">
                                  {pair?.[key] ?? ""}
                                </td>
                              ))}
                          </tr>
                        );
                      })}
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
