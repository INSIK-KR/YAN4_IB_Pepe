// 입력 탭 값 (Target, S&OP, H/C, 이관 차량). main.js 가 사용자 데이터 폴더 inputs.json 에 저장

export type ShiftKey = "day" | "swing" | "night";
export type TarAct = { tar: number; act: number };
export type HcRow = { label: string; day: TarAct; swing: TarAct; night: TarAct };
export type SopSide = { direct: number; xdock: number; rc: number; rocketmart: number };
export type Vehicle = {
  date: string;
  arrival: string;
  fromFc: string;
  temp: string;
  measured: number | "";
  vehicleNo: string;
  pallet: number | "";
};

export type Inputs = {
  target: number;
  obPlan: number;
  rates: Record<ShiftKey, number>;
  facility: Record<ShiftKey, number>;
  sop: { d1: SopSide; d0: SopSide };
  hc: HcRow[];
  vehicles: Vehicle[];
};

export const HC_LABELS = ["팀캡틴", "계약직", "단기직", "신규", "조퇴", "OB->IB", "IB->OB", "IB->ICQA", "Hub->IB"];
export const VEHICLE_TEMPS = ["Ambient", "Chilled", "Frozen", "RM"];

function emptyHc(label: string): HcRow {
  return { label, day: { tar: 0, act: 0 }, swing: { tar: 0, act: 0 }, night: { tar: 0, act: 0 } };
}

export function defaultInputs(): Inputs {
  return {
    target: 223.2,
    obPlan: 0,
    rates: { day: 0.356, swing: 0.326, night: 0.318 },
    facility: { day: 0, swing: 0, night: 0 },
    sop: {
      d1: { direct: 0, xdock: 0, rc: 0, rocketmart: 0 },
      d0: { direct: 0, xdock: 0, rc: 0, rocketmart: 0 },
    },
    hc: HC_LABELS.map(emptyHc),
    vehicles: [],
  };
}

/** 저장된 값(이전 버전 포함)을 현재 모양에 맞춘다 */
export function mergeInputs(saved: unknown): Inputs {
  const base = defaultInputs();
  if (!saved || typeof saved !== "object") return base;
  const s = saved as Partial<Inputs>;
  return {
    target: num(s.target, base.target),
    obPlan: num(s.obPlan, base.obPlan),
    rates: { ...base.rates, ...(s.rates || {}) },
    facility: { ...base.facility, ...(s.facility || {}) },
    sop: {
      d1: { ...base.sop.d1, ...(s.sop?.d1 || {}) },
      d0: { ...base.sop.d0, ...(s.sop?.d0 || {}) },
    },
    hc: HC_LABELS.map(function (label, i) {
      const row = (s.hc || [])[i];
      const ta = (v?: Partial<TarAct>): TarAct => ({ tar: Number(v?.tar) || 0, act: Number(v?.act) || 0 });
      return { label, day: ta(row?.day), swing: ta(row?.swing), night: ta(row?.night) };
    }),
    vehicles: Array.isArray(s.vehicles) ? s.vehicles : [],
  };
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}
