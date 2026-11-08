import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Electron 이 file:// 로 여는 화면이라 상대 경로(base "./")로 빌드
export default defineConfig({
  root: path.resolve(__dirname, "src"),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    // 데스크톱 앱이라 화면 코드가 한 파일로 묶여도 괜찮음
    chunkSizeWarningLimit: 1500,
  },
  // CFS HTP(5183)와 동시에 띄울 수 있게 다른 포트
  server: { port: 5184, strictPort: true },
});
