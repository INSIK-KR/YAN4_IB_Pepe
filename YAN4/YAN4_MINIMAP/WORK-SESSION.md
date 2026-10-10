# YAN4 미니맵 · 작업 체크포인트 (2026-05-30)

**이어서 할 때:** 새 채팅에서 `@WORK-SESSION.md` 또는 `@PLAN.md` 붙이면 됨.

---

## 1. 지금까지 확정한 방향

| 역할 | 도구 |
|------|------|
| **맵 그리기** | 포토샵 → **PNG 한 장** (통짜 배경) |
| **1007 박스** | 미니맵 **배치 모드** → `apiBoxes` → JSON 저장 |
| **운영** | Electron 미니맵 — PNG 표시 + inventory API |

- **Unity 제거됨** (`unity-export/` 삭제)
- 편집기(타일 페인트) 제거 — **Viewer + 1007 배치** 중심
- ATS / MINIMAP inventory 세션 분리 유지

---

## 2. 해상도·PNG 규격 (확정)

| 항목 | 값 |
|------|-----|
| 격자 | **50 × 50** |
| 칸당 px (`cellPx`, ZOOM) | **32** |
| 맵 표시 크기 (1:1) | **1600 × 1600** |
| **통짜 배경 PNG** (권장) | **3200 × 3200** (2배 — 선명) 또는 1600×1600 |
| DPI | **72** (화면용 — **픽셀 크기만** 중요) |
| 픽셀 느낌 | **없음** (`body.map-hq`, `image-rendering: auto`) |

구조물을 따로 PNG로 줄 때: **(가로 칸)×32 × (세로 칸)×32** px.

---

## 3. 현재 에셋·JSON 상태

### PNG 위치

```
YAN4/YAN4_MINIMAP/assets/custom/BG.png   ← 통짜 배경 (3200×3200)
```

### `assets/custom/catalog.json`

```json
"cellPx": 32,
"assets": {
  "bg": { "file": "BG.png", "label": "바닥 배경 패턴" }
}
```

### `chamber-layout.json` (요지)

- `meta.tilePx`: **32**, `canvasPx`: **1600**
- `background.enabled`: **false** (반복 타일 안 씀)
- `baseMap`: `{ "asset": "bg", "mode": "contain" }` — **BG.png 전체 배경**
- `apiBoxes`: **[]** (아직 미배치)
- `sprites` / `fixed`: 비어 있음

---

## 4. 구현된 기능 (코드)

### PNG 파이프라인

- `asset-catalog.js` — `catalog.json` 로드, `background` / `sprites` / `baseMap` URL
- `chamber-layout-core.js` — `sprites`, `baseMap`, `fixed`+`asset` 지원

### 1007 박스 배치 UI (`index.html` + `minimap.js`)

사이드바 **「1007 박스 배치」** 패널:

1. **배치 모드 ON/OFF**
2. **1007 로케이션** 입력 (예: `1007-1C1-01-A01`)
3. **크기 W × H** (기본 1×1)
4. **기준 PNG (임시)** — 세션 동안만 오버레이 (파일 선택)

**동작**

- 배치 모드 ON + 맵 **빈 곳 클릭** → `apiBoxes`에 추가 (`r`, `c`, `w`, `h`, `text`, `zone`, `row`)
- 배치 모드 ON + **기존 박스 클릭** → 삭제
- **JSON 저장** → `chamber-layout.json` 디스크 저장
- **API 조회** → 기존 inventory 용량 오버레이

### 배경 표시 우선순위 (`minimap.js`)

1. **기준 PNG (임시)** — `guidePngInput`으로 고른 파일 (배치 작업용)
2. 없으면 **`baseMap`** → `catalog`의 `BG.png`

---

## 5. 실행 방법

```bash
cd YAN4/YAN4_MINIMAP
npm start
```

또는 `start-minimap.cmd`

---

## 6. 1007 박스 찍는 순서 (다음에 할 일)

1. 앱 실행 → 배경 `BG.png` 로드 확인 (**다시 로드**)
2. (선택) **기준 PNG (임시)**에 같은 PNG 다시 넣어 배치용으로 쓰기
3. **배치 모드 ON**
4. `1007-1C1-01-A01` 등 입력 → 맵에서 해당 칸 **클릭**
5. 통로/구역 단위로 묶어서 진행 (예: `1C1` 끝 → `1C2`)
6. **JSON 저장**
7. inventory 로그인 → **API 조회**로 색/키 검증

### `apiBoxes` 항목 예시

```json
{
  "text": "1007-1C1-01-A01",
  "zone": "1C1",
  "row": "01",
  "r": 6,
  "c": 8,
  "w": 1,
  "h": 1
}
```

---

## 7. 알려진 한계 / 다음 개선 후보

| 이슈 | 상태 | 후보 |
|------|------|------|
| 3200 PNG vs 50×50 격자 **좌표 어긋남** | 배치 시 체감 가능 | **오프셋 X/Y, 스케일** 슬라이더 |
| 기준 PNG는 **재시작 시 사라짐** | 임시 URL | `BG.png`는 `baseMap`으로 영구 |
| 대량 1007 입력 | 수동 클릭 | **텍스트/엑셀 붙여넣기 → 순차 배치** |
| 구조물 PNG 분리 | 미사용 | `sprites` + catalog (필요 시) |

---

## 8. 주요 파일 목록

| 파일 | 역할 |
|------|------|
| `WORK-SESSION.md` | **이 문서** — 작업 재개용 |
| `PLAN.md` | 방향 요약 |
| `README.md` | 실행·PNG 규칙 |
| `assets/custom/README.md` | catalog / JSON 예시 |
| `index.html` | UI (배치 패널) |
| `minimap.js` | 렌더 + 배치 + API |
| `asset-catalog.js` | PNG catalog |
| `chamber-layout.json` | 레이아웃 데이터 |
| `chamber-layout-core.js` | JSON ↔ 렌더 |

---

## 9. English resume line

**Photoshop full map `BG.png` (3200²) as `baseMap`; 32px/cell grid; click-to-place `1007` boxes in minimap; save JSON; validate with inventory API. Next: alignment sliders and bulk paste for locations.**
