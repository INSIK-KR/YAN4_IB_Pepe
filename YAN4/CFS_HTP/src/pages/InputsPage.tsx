import { Fragment } from "react";
import { Eraser, Plus, Trash2, Truck, Target, Users } from "lucide-react";
import { toast } from "sonner";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { tsvToTable } from "@/lib/htp-calc.mjs";
import { defaultInputs, VEHICLE_TEMPS, type Inputs, type ShiftKey, type SopSide, type Vehicle } from "@/lib/inputs";

type Props = { inputs: Inputs; onChange: (next: Inputs) => void };

const SHIFTS: [ShiftKey, string][] = [
  ["day", "Day"],
  ["swing", "Swing"],
  ["night", "Night"],
];
const SOP_ROWS: [keyof SopSide, string][] = [
  ["direct", "Direct"],
  ["xdock", "Xdock"],
  ["rc", "RC"],
  ["rocketmart", "RocketMart"],
];

function NumInput({ value, onValue, step, className }: { value: number; onValue: (n: number) => void; step?: string; className?: string }) {
  return (
    <Input
      type="number"
      step={step}
      value={value === 0 ? "" : value}
      placeholder="0"
      onChange={(e) => onValue(e.target.value === "" ? 0 : Number(e.target.value))}
      className={className ?? "h-8 w-28 text-right tabular-nums"}
    />
  );
}

export default function InputsPage({ inputs, onChange }: Props) {
  const set = (patch: Partial<Inputs>) => onChange({ ...inputs, ...patch });

  function setVehicle(i: number, patch: Partial<Vehicle>) {
    const vehicles = inputs.vehicles.slice();
    vehicles[i] = { ...vehicles[i], ...patch };
    set({ vehicles });
  }

  /** 엑셀 이관차량하차정보 C~J열 붙여넣기 (하차시간대 열은 건너뜀) */
  function onVehiclePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!text || text.indexOf("\t") < 0) return;
    e.preventDefault();
    const rows = tsvToTable(text).filter((r: string[]) => r.length >= 8 && /\d{1,2}:\d{2}/.test(r[1]));
    const added: Vehicle[] = rows.map((r: string[]) => ({
      date: r[0],
      arrival: r[1],
      fromFc: r[3],
      temp: r[4],
      measured: r[5] === "" ? "" : Number(r[5]),
      vehicleNo: r[6],
      pallet: r[7] === "" ? "" : Number(r[7]),
    }));
    set({ vehicles: inputs.vehicles.concat(added) });
    toast.success("이관 차량 " + added.length + "건을 붙여넣었습니다");
  }

  // 날마다 새로 넣는 값만 비운다. Target HTP·진열 비율은 기준값이라 그대로 둔다
  function clearDaily() {
    const blank = defaultInputs();
    onChange({ ...blank, target: inputs.target, rates: inputs.rates });
    toast.success("입력을 지웠습니다", { description: "Target HTP와 진열 비율은 그대로 두었습니다." });
  }

  return (
    <div className="grid gap-6">
      <div className="flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Eraser />
              입력 전체 지우기
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>입력을 모두 지울까요?</AlertDialogTitle>
              <AlertDialogDescription>
                OB Plan, S&amp;OP, Facility 인원, H/C, 이관 차량 {inputs.vehicles.length}건을 지웁니다. Target HTP와 진열 비율은 그대로 둡니다. 지운 값은 되돌릴 수
                없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={clearDaily}>
                전체 지우기
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-4" />
              목표 · S&amp;OP
            </CardTitle>
            <CardDescription>Status 맨 위 요약과 근무조 시뮬레이션에 쓰입니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid grid-cols-[8rem_auto] items-center gap-x-4 gap-y-2 text-sm">
              <span className="text-muted-foreground">Target HTP</span>
              <NumInput value={inputs.target} step="0.1" onValue={(target) => set({ target })} />
              <span className="text-muted-foreground">OB Plan (D0)</span>
              <NumInput value={inputs.obPlan} onValue={(obPlan) => set({ obPlan })} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>S&amp;OP</TableHead>
                  <TableHead className="text-right">D-1</TableHead>
                  <TableHead className="text-right">D-0</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SOP_ROWS.map(([k, label]) => (
                  <TableRow key={k}>
                    <TableCell className="text-muted-foreground">{label}</TableCell>
                    {(["d1", "d0"] as const).map((side) => (
                      <TableCell key={side} className="text-right">
                        <NumInput
                          className="ml-auto h-8 w-32 text-right tabular-nums"
                          value={inputs.sop[side][k]}
                          onValue={(v) => set({ sop: { ...inputs.sop, [side]: { ...inputs.sop[side], [k]: v } } })}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>근무조</TableHead>
                  {SHIFTS.map(([k, label]) => (
                    <TableHead key={k} className="text-right">
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-muted-foreground">진열 비율</TableCell>
                  {SHIFTS.map(([k]) => (
                    <TableCell key={k} className="text-right">
                      <NumInput
                        className="ml-auto h-8 w-24 text-right tabular-nums"
                        step="0.001"
                        value={inputs.rates[k]}
                        onValue={(v) => set({ rates: { ...inputs.rates, [k]: v } })}
                      />
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">Facility 인원</TableCell>
                  {SHIFTS.map(([k]) => (
                    <TableCell key={k} className="text-right">
                      <NumInput
                        className="ml-auto h-8 w-24 text-right tabular-nums"
                        value={inputs.facility[k]}
                        onValue={(v) => set({ facility: { ...inputs.facility, [k]: v } })}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" />
              H/C
            </CardTitle>
            <CardDescription>근무조별 목표(Tar.)와 실제(Act.) 인원. 팀캡틴·계약직·단기직 합이 시뮬레이션 Total이 됩니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead rowSpan={2}></TableHead>
                  {SHIFTS.map(([k, label]) => (
                    <TableHead key={k} colSpan={2} className="border-l text-center">
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  {SHIFTS.map(([k]) => (
                    <Fragment key={k}>
                      <TableHead className="border-l text-center text-xs">Tar.</TableHead>
                      <TableHead className="text-center text-xs">Act.</TableHead>
                    </Fragment>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {inputs.hc.map((row, i) => (
                  <TableRow key={row.label}>
                    <TableCell className="text-muted-foreground">{row.label}</TableCell>
                    {SHIFTS.map(([k]) =>
                      (["tar", "act"] as const).map((kind) => (
                        <TableCell key={k + kind} className={kind === "tar" ? "border-l" : ""}>
                          <NumInput
                            className="h-8 w-16 text-right tabular-nums"
                            value={row[k][kind]}
                            onValue={(v) => {
                              const hc = inputs.hc.slice();
                              hc[i] = { ...row, [k]: { ...row[k], [kind]: v } };
                              set({ hc });
                            }}
                          />
                        </TableCell>
                      ))
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="size-4" />
            이관 차량 하차 정보
          </CardTitle>
          <CardDescription>
            엑셀 이관차량하차정보 시트의 C~J열을 복사해 표 안 아무 칸에 붙여넣으면 한꺼번에 들어갑니다. 도착시간과 온도로 Status의 시간대별
            차량대수·하차 PLT를 셉니다.
          </CardDescription>
          <CardAction className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                set({ vehicles: inputs.vehicles.concat([{ date: "", arrival: "", fromFc: "", temp: "", measured: "", vehicleNo: "", pallet: "" }]) })
              }
            >
              <Plus />행 추가
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" disabled={!inputs.vehicles.length}>
                  <Trash2 />
                  모두 지우기
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>이관 차량 {inputs.vehicles.length}건을 모두 지울까요?</AlertDialogTitle>
                  <AlertDialogDescription>지운 뒤에는 다시 붙여넣어야 합니다.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => set({ vehicles: [] })}>
                    모두 지우기
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardAction>
        </CardHeader>
        <CardContent onPaste={onVehiclePaste}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>운영일자</TableHead>
                <TableHead>실제도착시간</TableHead>
                <TableHead>From FC</TableHead>
                <TableHead>온도구분</TableHead>
                <TableHead className="text-right">측정온도</TableHead>
                <TableHead>차량번호</TableHead>
                <TableHead className="text-right">PALLET</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inputs.vehicles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                    차량이 없습니다. [행 추가]를 누르거나 엑셀에서 복사한 행을 붙여넣으세요.
                  </TableCell>
                </TableRow>
              )}
              {inputs.vehicles.map((v, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Input className="h-8 w-36" value={String(v.date ?? "")} onChange={(e) => setVehicle(i, { date: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input className="h-8 w-28" placeholder="13:05" value={v.arrival} onChange={(e) => setVehicle(i, { arrival: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input className="h-8 w-24" value={v.fromFc} onChange={(e) => setVehicle(i, { fromFc: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Select value={v.temp || undefined} onValueChange={(temp) => setVehicle(i, { temp })}>
                      <SelectTrigger size="sm" className="w-28">
                        <SelectValue placeholder="선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {VEHICLE_TEMPS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="ml-auto h-8 w-20 text-right tabular-nums"
                      type="number"
                      step="0.1"
                      value={v.measured}
                      onChange={(e) => setVehicle(i, { measured: e.target.value === "" ? "" : Number(e.target.value) })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input className="h-8 w-24" value={String(v.vehicleNo ?? "")} onChange={(e) => setVehicle(i, { vehicleNo: e.target.value })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="ml-auto h-8 w-20 text-right tabular-nums"
                      type="number"
                      value={v.pallet}
                      onChange={(e) => setVehicle(i, { pallet: e.target.value === "" ? "" : Number(e.target.value) })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="삭제"
                      onClick={() => set({ vehicles: inputs.vehicles.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
