import type { PivotConfig } from "@/lib/pivot.mjs";

export type PresetKey = "hourTask" | "stowTemp" | "shiftMh" | "shiftUph" | "stowPeople" | "taskChannel";

export const PIVOT_PRESETS: { key: PresetKey; label: string; config: PivotConfig }[] = [
  { key: "hourTask", label: "공정 × 시간대 수량", config: { row1: "group", row2: "task", col: "hourName", measure: "qty", filters: {} } },
  { key: "stowTemp", label: "진열: 직납·이관 × 온도대", config: { row1: "channel", row2: "temp", col: "hourName", measure: "qty", filters: { task: "진열" } } },
  { key: "shiftMh", label: "공정 × 근무조 MH", config: { row1: "group", row2: "task", col: "shiftGroup", measure: "mh", filters: {} } },
  { key: "shiftUph", label: "공정 × 근무조 시간당 수량", config: { row1: "task", row2: "", col: "shiftGroup", measure: "uph", filters: {} } },
  { key: "stowPeople", label: "진열: 작업자별", config: { row1: "employee", row2: "", col: "hourName", measure: "qty", filters: { task: "진열" } } },
  { key: "taskChannel", label: "하차·매입·진열 흐름", config: { row1: "channel", row2: "task", col: "shiftGroup", measure: "qty", filters: {} } },
];

export const defaultPivot = PIVOT_PRESETS[0].config;
