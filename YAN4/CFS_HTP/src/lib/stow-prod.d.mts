// stow-prod.mjs 타입
import type { MosRow } from "./htp-calc.mjs";

export type StowShiftKey = "day" | "swing" | "night";
export type StowTypeKey = "each" | "pallet" | "case";
export type StowTypeStat = { qty: number; mh: number; htp: number | null };

export type StowWorker = {
  employee: string;
  contract: string;
  temp: string;
  qty: number;
  mh: number;
  htp: number | null;
  totalMh: number;
  stowShare: number | null;
  eachHtp: number | null;
  band: string;
} & Record<StowTypeKey, StowTypeStat>;

export type StowSummary = {
  people: number;
  perm: number;
  temp: number;
  qty: number;
  mh: number;
  htp: number | null;
  eachQtyShare: number | null;
  eachMhShare: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  bands: Record<string, number>;
  otherWork: number;
} & Record<StowTypeKey, StowTypeStat>;

export type StowShift = { key: StowShiftKey; label: string; workers: StowWorker[]; summary: StowSummary; top: StowWorker[]; bottom: StowWorker[] };
export type StowProductivity = { shifts: StowShift[]; total: StowSummary };

export const STOW_SHIFTS: { key: StowShiftKey; label: string; match: string }[];
export const STOW_TYPES: { key: StowTypeKey; label: string }[];
export const STOW_BANDS: { label: string; below: number }[];
export const STOW_MIN_MH: number;
export function computeStowProductivity(rows: MosRow[]): StowProductivity;
export function rowMh(r: MosRow): number;
export function shiftKeyOf(shift: string): StowShiftKey | null;
