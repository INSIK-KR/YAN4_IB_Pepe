import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bridge, type WmsSession } from "@/lib/bridge";

export default function App() {
  const [version, setVersion] = useState("");
  // null = 첫 확인이 아직 끝나지 않음
  const [session, setSession] = useState<WmsSession | null>(null);

  useEffect(() => {
    if (!bridge) return;
    void bridge.appInfo().then((info) => setVersion(info.version));
    // 결과는 onWmsSession 으로 온다 (늦게 끝난 확인이 새 결과를 덮지 않게 한 곳에서만 받음)
    const off = bridge.onWmsSession(setSession);
    void bridge.wmsStatus();
    return off;
  }, []);

  const loggedIn = session?.loggedIn === true;
  const failed = !!session?.error;

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="flex h-12 items-center gap-2 border-b bg-background px-4">
        <span className="font-semibold">CFS ATSOOS</span>
        {version && <span className="text-xs text-muted-foreground">v{version}</span>}
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>WMS 로그인</CardTitle>
            <CardDescription>쿠팡 계정으로 로그인하면 이 앱에 로그인 상태가 유지됩니다.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start gap-2" role="status">
              {session === null && <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />}
              {loggedIn && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
              {session !== null && !loggedIn && <CircleAlert className={"mt-0.5 size-4 shrink-0 " + (failed ? "text-destructive" : "text-muted-foreground")} />}
              <div className="min-w-0">
                <p className="font-medium">
                  {session === null ? "로그인 상태 확인 중" : loggedIn ? "로그인됨" : failed ? "WMS에 연결하지 못했습니다" : "로그인이 필요합니다"}
                </p>
                {session?.error && <p className="mt-0.5 break-all text-xs text-muted-foreground">{session.error}</p>}
              </div>
            </div>
            <Button size="lg" variant={loggedIn ? "outline" : "default"} onClick={() => bridge?.wmsLogin()}>
              <LogIn />
              {loggedIn ? "WMS 다시 로그인" : "WMS 로그인"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
