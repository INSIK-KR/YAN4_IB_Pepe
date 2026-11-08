// preload.js 가 노출하는 window.cfsAtsoos (Electron 밖에서 열면 없음)

export type WmsSession = { loggedIn: boolean; error?: string; detail?: string };

type Bridge = {
  appInfo(): Promise<{ name: string; version: string }>;
  wmsStatus(): Promise<WmsSession>;
  wmsLogin(): Promise<{ ok: boolean; reused?: boolean }>;
  onWmsSession(cb: (s: WmsSession) => void): () => void;
};

declare global {
  interface Window {
    cfsAtsoos?: Bridge;
  }
}

export const bridge = typeof window !== "undefined" ? window.cfsAtsoos : undefined;
