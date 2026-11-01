// htp-calc.mjs 타입 (JS 모듈이라 TypeScript 용 선언을 따로 둔다)

export type Hourly = Record<number, number>;
export type HourlyOrNull = Record<number, number | null>;

export type ShiftGroupKey = "day" | "swing" | "swingNight" | "night";
export type ShiftGroup = { key: ShiftGroupKey; label: string; from: number; to: number };

export type Task = { key: string; group: string | null; label: string; task: string; status?: boolean };

export type MosRow = {
  employee: string;
  htpStart: string;
  htpEnd: string;
  startFrac: number | null;
  endFrac: number | null;
  task: string;
  qty: number;
  location: string;
  pickType: string;
  inboundType: string;
  contractType: string;
  shift: string;
  userWorkType: string;
  hour: number;
};

export type ParsedMos = { rows: MosRow[]; workDate: string; missing: string[] };

export type ShiftShare = { value: number; share: number | null };
export type TaskSummaryRow = {
  label: string;
  unit: "qty" | "hc";
  total: number;
} & Record<ShiftGroupKey, ShiftShare>;

export type Pair = { label: string; each: Hourly; pallet: Hourly; sum: Hourly };
export type ProcessBlock = { hourly: Hourly; total: number; share: number | null };
export type TaskRow = {
  key: string;
  group: string | null;
  label: string;
  task: string;
  hourly: Hourly;
  total: number;
  share: number | null;
  delay: number;
  delayShare: number | null;
};
export type DelayPerson = { employee: string; shift: string; firstStart: number; task: string; manHour: number };

export type SimCell = { total: number; facility: number; gap: number; stow: number | null; htp: number | null };
export type SimulCell = SimCell & { actMinusTarget: number; actMinusSimul: number | null };
type By3<T> = { day: T; swing: T; night: T };

export type StatusModel = {
  hours: number[];
  shiftGroups: ShiftGroup[];
  summary: {
    target: number;
    htpActual: number | null;
    htpGap: number | null;
    obPlan: number;
    sopD1: number;
    sopD0: number;
    sopDiff: number;
    ibMix: number | null;
    plan: By3<number>;
  };
  taskSummary: TaskSummaryRow[];
  vehicles: { count: Hourly; Ambient: Hourly; Chilled: Hourly; Frozen: Hourly; RM: Hourly; pallet: Hourly };
  hourly: {
    unload: Hourly;
    unloadDirect: Hourly;
    unloadTransfer: Hourly;
    receive: Hourly;
    receiveEach: Hourly;
    receivePallet: Hourly;
    stow: Hourly;
    stowEach: Hourly;
    stowPallet: Hourly;
    productivity: HourlyOrNull;
  };
  shiftHtp: { key: ShiftGroupKey; label: string; htp: number | null }[];
  stowMix: { direct: Pair; directParts: Pair[]; transfer: Pair; transferParts: Pair[] };
  process: { direct: ProcessBlock; indirect: ProcessBlock; centre: ProcessBlock };
  tasks: TaskRow[];
  checkInDelay: DelayPerson[];
  simulation: { tar: By3<SimCell>; act: By3<SimCell>; simul: By3<SimulCell> };
};

export const HOURS: number[];
export const SHIFT_GROUPS: ShiftGroup[];
export const TASKS: Task[];
export const MOS_COLUMNS: [string, string][];
export function parseMosTable(table: unknown[][]): ParsedMos;
export function tsvToTable(text: string): string[][];
export function computeStatus(rows: MosRow[], inputs?: unknown): StatusModel;
export function total(hourly: Hourly): number;
