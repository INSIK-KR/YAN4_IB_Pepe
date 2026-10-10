# YAN4 미니맵 · 맵 제작 계획 (2026-05-28)

대화에서 확정한 **방향만** 정리. 구현 상세는 코드/README 참고.

> **작업 재개:** [`WORK-SESSION.md`](WORK-SESSION.md) — 최신 체크포인트 (배경 PNG, 1007 배치 모드, 다음 할 일)

---

## 1. 역할 분리 (최종)

| 역할 | 도구 | 비고 |
|------|------|------|
| **맵 그리기** | **포토샵** | 구조물·바닥 패턴 — **고화질 PNG** 로 제공 |
| **배치·데이터** | `chamber-layout.json` (수동 또는 이후 배치 도구) | 격자·`sprites`·`apiBoxes` |
| **보기·운영** | **YAN4_MINIMAP (Electron)** | **Viewer-only** — PNG 표시 + API(진열 여유) |

- **Unity 경로는 사용하지 않음** (`unity-export` 제거).
- 미니맵은 `chamber-layout.json` **불러오기 + PNG 표시 + API** 만.
- ATS와 MINIMAP은 **inventory 세션 분리** (`persist:yna4-minimap-inventory`).

---

## 2. 포토샵 → 미니맵 파이프라인

1. 포토샵에서 **구조물·바닥 패턴** 제작 → **투명 PNG** export  
2. `assets/custom/` 에 파일 복사  
3. `assets/custom/catalog.json` 에 id 등록 (`entrance`, `bg-floor`, …)  
4. `chamber-layout.json` 에 배치:
   - `background` — 바닥 패턴 (`asset`, `mode: repeat`)
   - `sprites` — 구조물 (`asset`, `r0`~`r1`, `c0`~`c1`)
   - `baseMap` — (선택) 도면 **한 장** 전체
   - `apiBoxes` — 1007- 로케이션 (API 오버레이)
5. `start-minimap.cmd` 또는 `npm start` 로 확인

자세한 파일 규칙: **`assets/custom/README.md`**

**기본 해상도:** `cellPx` **32** · 50×50 = **1600×1600** (픽셀아트 필터 없음, 부드러운 PNG)

---

## 3. 에셋·폴더

- **PNG 카탈로그**: `assets/custom/catalog.json` + `asset-catalog.js`
- Kenney/Warehouse 타일시트: **레거시** (옛 JSON용, 신규 작업은 PNG 권장)
- 실행: `YAN4_MINIMAP/start-minimap.cmd`

---

## 4. 다음 작업 후보

1. **`apiBoxes` 클릭 배치** — ✅ 1차 구현됨 (`WORK-SESSION.md` 참고)  
2. **기준 PNG 오프셋/스케일** — 3200 배경과 격자 클릭 맞추기  
3. **1007 목록 붙여넣기** — 통로 단위 자동 순차 배치  
4. (선택) 구조물 `sprites` / PSD → JSON  

---

## English one-liner

**Draw in Photoshop (HQ PNGs); register in catalog; place in `chamber-layout.json`; MINIMAP views + API only.**
