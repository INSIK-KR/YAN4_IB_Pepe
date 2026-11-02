// preload.js 가 노출하는 window.cfsHtp (Electron 밖에서 열면 없음)

export type MosSession = { loggedIn: boolean; cookieCount: number; error?: string };

export type MosFetchMessage = {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
  referer?: string;
  binary?: boolean;
};

export type MosFetchResult = {
  ok: boolean;
  status?: number;
  body?: string;
  base64?: string;
  error?: string;
};

type Bridge = {
  appInfo(): Promise<{ name: string; version: string }>;
  loadInputs(): Promise<unknown>;
  saveInputs(inputs: unknown): Promise<boolean>;
  mosStatus(): Promise<MosSession>;
  mosLogin(): Promise<{ ok: boolean; reused?: boolean }>;
  mosFetch(message: MosFetchMessage): Promise<MosFetchResult>;
  onMosSession(cb: (s: MosSession) => void): () => void;
};

declare global {
  interface Window {
    cfsHtp?: Bridge;
    XLSX?: {
      read(data: ArrayBuffer, opts: Record<string, unknown>): { SheetNames: string[]; Sheets: Record<string, unknown> };
      utils: { sheet_to_json(sheet: unknown, opts: Record<string, unknown>): unknown[][] };
    };
  }
}

export const bridge = typeof window !== "undefined" ? window.cfsHtp : undefined;
