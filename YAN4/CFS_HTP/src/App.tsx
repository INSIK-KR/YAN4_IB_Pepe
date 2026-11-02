import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Database, LogIn, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { bridge, type MosSession } from "@/lib/bridge";
import { defaultInputs, mergeInputs, type Inputs } from "@/lib/inputs";
import type { MosData } from "@/lib/mos";
import { fmtInt } from "@/lib/format";
import { computeStatus } from "@/lib/htp-calc.mjs";
import { preparePivotRows, type PivotConfig } from "@/lib/pivot.mjs";
import { defaultPivot, PIVOT_PRESETS, type PresetKey } from "@/lib/pivot-presets";
import OverviewPage from "@/pages/OverviewPage";
import PivotPage from "@/pages/PivotPage";
import StatusPage from "@/pages/StatusPage";
import MosPage from "@/pages/MosPage";
import InputsPage from "@/pages/InputsPage";

type Tab = "overview" | "pivot" | "status" | "mos" | "inputs";

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [version, setVersion] = useState("");
  const [session, setSession] = useState<MosSession>({ loggedIn: false, cookieCount: 0 });
  const [mos, setMos] = useState<MosData | null>(null);
  const [inputs, setInputsState] = useState<Inputs>(defaultInputs);
  const [inputsLoaded, setInputsLoaded] = useState(false);
  const [pivot, setPivot] = useState<PivotConfig>(defaultPivot);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!bridge) {
      setInputsLoaded(true);
      return;
    }
    bridge.appInfo().then((i) => setVersion(i.version));
    bridge.loadInputs().then(
      (saved) => {
        setInputsState(mergeInputs(saved));
        setInputsLoaded(true);
      },
      () => setInputsLoaded(true)
    );
    // 결과는 onMosSession 으로 온다 (늦게 끝난 확인이 새 결과를 덮지 않게 한 곳에서만 받음)
    const off = bridge.onMosSession(setSession);
    void bridge.mosStatus();
    return off;
  }, []);

  // 입력값은 고칠 때마다 0.3초 모아서 저장
  const setInputs = useCallback((next: Inputs) => {
    setInputsState(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => bridge?.saveInputs(next), 300);
  }, []);

  const model = useMemo(() => (mos ? computeStatus(mos.rows, inputs) : null), [mos, inputs]);
  const prepared = useMemo(() => (mos ? preparePivotRows(mos.rows) : []), [mos]);
  const openTab = useCallback((next: Tab) => {
    setTab(next);
    window.scrollTo(0, 0);
  }, []);
  const openPivot = useCallback(
    (key: PresetKey) => {
      setPivot(PIVOT_PRESETS.find((p) => p.key === key)!.config);
      openTab("pivot");
    },
    [openTab]
  );

  const noData = (
    <Card className="mx-auto mt-16 max-w-md text-center">
      <CardHeader>
        <CardTitle>MOS 자료가 없습니다</CardTitle>
        <CardDescription>MOS 데이터 탭에서 날짜를 골라 MOS에서 받으세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => setTab("mos")}>
          <Database />
          MOS 데이터로 가기
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-100">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
          <div className="flex h-14 items-center gap-6 px-6">
            <div className="flex items-center gap-2 font-semibold tracking-tight">
              <Activity className="size-5 text-primary" />
              CFS HTP
            </div>
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList>
                <TabsTrigger value="overview">개요</TabsTrigger>
                <TabsTrigger value="pivot">피벗</TabsTrigger>
                <TabsTrigger value="status">상세 표</TabsTrigger>
                <TabsTrigger value="mos">MOS 데이터</TabsTrigger>
                <TabsTrigger value="inputs">입력</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="ml-auto flex items-center gap-3">
              {mos ? (
                <Badge variant="secondary" className="gap-1.5">
                  <Database className="size-3.5" />
                  {mos.workDate} · {fmtInt(mos.rows.length)}행
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  MOS 자료 없음
                </Badge>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant={session.loggedIn ? "outline" : "default"} onClick={() => bridge?.mosLogin()}>
                    {session.loggedIn ? <CheckCircle2 className="text-emerald-600" /> : <LogIn />}
                    {session.loggedIn ? "MOS 로그인됨" : "MOS 로그인"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{session.error ? "MOS 연결 확인 실패: " + session.error : session.detail ? "로그인 필요 (" + session.detail + ")" : "MOS 로그인 창 열기"}</TooltipContent>
              </Tooltip>
              {version && <span className="text-xs text-muted-foreground">v{version}</span>}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1920px] p-4">
          {(tab === "overview" || tab === "pivot" || tab === "status") && (!mos || !model) && noData}
          {tab === "overview" && mos && model && (
            <OverviewPage
              model={model}
              prepared={prepared}
              mos={mos}
              inputs={inputs}
              onOpenPivot={openPivot}
              onOpenDetail={() => openTab("status")}
              onOpenInputs={() => openTab("inputs")}
            />
          )}
          {tab === "pivot" && mos && <PivotPage prepared={prepared} config={pivot} onChange={setPivot} />}
          {tab === "status" && mos && model && <StatusPage model={model} mos={mos} inputs={inputs} />}
          {tab === "mos" && <MosPage mos={mos} onLoaded={setMos} onClear={() => setMos(null)} loggedIn={session.loggedIn} />}
          {tab === "inputs" && inputsLoaded && <InputsPage inputs={inputs} onChange={setInputs} />}
        </main>
        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}
