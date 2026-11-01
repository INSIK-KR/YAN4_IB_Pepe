import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Database, LogIn, CheckCircle2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { bridge, type MosSession } from "@/lib/bridge";
import { defaultInputs, mergeInputs, type Inputs } from "@/lib/inputs";
import type { MosData } from "@/lib/mos";
import { fmtInt } from "@/lib/format";
import StatusPage from "@/pages/StatusPage";
import MosPage from "@/pages/MosPage";
import InputsPage from "@/pages/InputsPage";

type Tab = "status" | "mos" | "inputs";

export default function App() {
  const [tab, setTab] = useState<Tab>("status");
  const [version, setVersion] = useState("");
  const [session, setSession] = useState<MosSession>({ loggedIn: false, cookieCount: 0 });
  const [mos, setMos] = useState<MosData | null>(null);
  const [inputs, setInputsState] = useState<Inputs>(defaultInputs);
  const [inputsLoaded, setInputsLoaded] = useState(false);
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
    bridge.mosStatus().then(setSession);
    return bridge.onMosSession(setSession);
  }, []);

  // 입력값은 고칠 때마다 0.3초 모아서 저장
  const setInputs = useCallback((next: Inputs) => {
    setInputsState(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => bridge?.saveInputs(next), 300);
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-muted/40">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
          <div className="flex h-14 items-center gap-6 px-6">
            <div className="flex items-center gap-2 font-semibold tracking-tight">
              <Activity className="size-5 text-primary" />
              CFS HTP
            </div>
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList>
                <TabsTrigger value="status">Status</TabsTrigger>
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
                <TooltipContent>MOS 로그인 창 열기</TooltipContent>
              </Tooltip>
              {version && <span className="text-xs text-muted-foreground">v{version}</span>}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1920px] p-6">
          {tab === "status" && <StatusPage mos={mos} inputs={inputs} onGoMos={() => setTab("mos")} />}
          {tab === "mos" && <MosPage mos={mos} onLoaded={setMos} onClear={() => setMos(null)} loggedIn={session.loggedIn} />}
          {tab === "inputs" && inputsLoaded && <InputsPage inputs={inputs} onChange={setInputs} />}
        </main>
        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}
