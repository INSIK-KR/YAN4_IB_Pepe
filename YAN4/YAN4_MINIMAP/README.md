# YAN4 1챔ber 미니맵 (Electron)

**`chamber-layout.json`** = 격자·PNG 배치·API 박스.  
**맵 아트** = 포토샵에서 만든 **고화질 PNG** → `assets/custom/`.

## 실행

```bash
cd YAN4/YAN4_MINIMAP
npm start
```

또는 `start-minimap.cmd`

## 포토샵 PNG 제공 (권장 워크플로)

1. 구조물·바닥 패턴을 **투명/불투명 PNG**로 export  
2. `assets/custom/` 에 복사  
3. `assets/custom/catalog.json` 에 id 등록  
4. `chamber-layout.json` 에 `background` / `sprites` / `baseMap` / `apiBoxes` 작성  

→ **`assets/custom/README.md`** 에 JSON 예시 있음.

## 기본 해상도

- **32px / 격자 칸** · 50×50 = **1600×1600** 맵
- `catalog.json` `cellPx`, `meta.tilePx`, 앱 ZOOM **32** 로 통일

## chamber-layout.json 요약

| 필드 | 용도 |
|------|------|
| `grid` | rows × cols (API 격자) |
| `background` | 바닥 패턴 PNG (`asset`, `mode: repeat`) |
| `sprites` | 구조물 PNG 배치 (`asset`, `r0`~`r1`, `c0`~`c1`) |
| `baseMap` | (선택) 전체 도면 한 장 |
| `apiBoxes` | 1007- 로케이션 — inventory API 오버레이 |

## EXE

```bash
npm run dist
```

빌드에 `assets/**/*` 포함.

## 레거시 (선택)

Kenney / Pixel Warehouse **타일시트**는 옛 `fixed` + `tileCol`/`tileRow` JSON용.  
신규 작업은 **PNG + catalog** 를 사용하세요.

---

계획 요약: **`PLAN.md`**
