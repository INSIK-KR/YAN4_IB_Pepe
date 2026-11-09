// preload.js 가 노출하는 window.cfsAtsoos (Electron 밖에서 열면 없음)

export type WmsSession = { loggedIn: boolean; centerId?: string; error?: string; detail?: string };
export type WmsChangeCenterResult = { ok: true; verified: boolean } | { ok: false; error: string };
export type WmsOrderCutlineResult = { ok: true; found: boolean; cutlines: string[]; diagnostic?: string } | { ok: false; error: string; needLogin?: boolean };
export type WmsTransferInfoResult =
  | { ok: true; found: false }
  | { ok: true; found: true; ctMatched: boolean; load: string; unload: string; stow: string; vehicle: string; diagnostic?: string }
  | { ok: false; error: string; needLogin?: boolean };
export type PbiStatus = { loggedIn: boolean; checking: boolean; loginOpen: boolean };
export type PbiExportResult = { ok: true; base64: string } | { ok: false; error: string; needLogin?: boolean };

type Bridge = {
  appInfo(): Promise<{ name: string; version: string }>;
  wmsStatus(): Promise<WmsSession>;
  wmsLogin(): Promise<{ ok: boolean; reused?: boolean }>;
  onWmsSession(cb: (s: WmsSession) => void): () => void;
  wmsChangeCenter(centerId: string): Promise<WmsChangeCenterResult>;
  wmsTransferInfo(request: { cart: string; ct: string; center: string; date: string }): Promise<WmsTransferInfoResult>;
  wmsOrderCutline(orderNumber: string, externalSku: string, date: string): Promise<WmsOrderCutlineResult>;
  saveExcel(name: string, base64: string): Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  showSavedExcel(): Promise<boolean>;
  pbiStatus(): Promise<PbiStatus>;
  pbiLogin(): Promise<{ ok: boolean }>;
  pbiExport(request: { centers: string[]; date: string }): Promise<PbiExportResult>;
  onPbiStatus(cb: (s: PbiStatus) => void): () => void;
};

type SheetCell = { t: string; v: unknown; w?: string; z?: string };

declare global {
  interface Window {
    cfsAtsoos?: Bridge;
    XLSX?: {
      read(data: ArrayBuffer, opts: Record<string, unknown>): { SheetNames: string[]; Sheets: Record<string, Record<string, unknown>> };
      write(book: unknown, opts: Record<string, unknown>): string;
      utils: {
        decode_range(ref: string): { s: { r: number; c: number }; e: { r: number; c: number } };
        encode_cell(cell: { r: number; c: number }): string;
        book_new(): unknown;
        aoa_to_sheet(rows: (string | number)[][]): Record<string, unknown>;
        book_append_sheet(book: unknown, sheet: unknown, name: string): void;
      };
      SSF: { is_date(format: string): boolean };
    };
  }
}

export type { SheetCell };
export const bridge = typeof window !== "undefined" ? window.cfsAtsoos : undefined;
