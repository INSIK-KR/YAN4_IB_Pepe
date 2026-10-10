# 포토샵 PNG 에셋 (고화질)

구조물·바닥 패턴은 **포토샵에서 제작**한 PNG를 이 폴더에 넣습니다.  
미니맵은 **`catalog.json`** 과 **`chamber-layout.json`** 으로 배치·표시합니다.

## 1. PNG 넣기

| 파일 예시 | 용도 |
|-----------|------|
| `BG.png` | 바닥 패턴 (32×32, 격자 칸마다 반복) |
| `chamber-base.png` | (선택) 통째 도면 한 장 |
| `entrance.png`, `conveyor.png` … | 구조물 (투명 배경 권장) |

## 2. catalog.json 등록

```json
"entrance": {
  "file": "entrance.png",
  "label": "챔버입구"
}
```

`id` = `chamber-layout.json`의 `asset` 값과 동일하게 맞춥니다.

## 3. chamber-layout.json 예시

**바닥 패턴 반복**

```json
"background": {
  "enabled": true,
  "asset": "bg",
  "mode": "repeat"
}
```

**구조물 배치** (`sprites` — 격자 r0,c0 ~ r1,c1)

```json
"sprites": [
  { "asset": "entrance", "r0": 2, "c0": 24, "r1": 4, "c1": 26 }
]
```

**전체 도면 한 장** (API 박스만 격자 위에 올림)

```json
"baseMap": {
  "asset": "chamber-base",
  "mode": "contain"
}
```

## 4. 권장 제작 규칙

- **투명 PNG** (구조물)
- 격자 **한 칸 = 32px** (기본) · 50×50 맵 = **1600×1600** · `catalog.json` `cellPx` 와 포토샵 export 크기 통일
- 파일명은 **영문·숫자·하이픈** (`entrance.png`)

배치 좌표는 도구/수동 JSON — 포토샵 레이어 위치를 그대로 쓰지 않습니다.
