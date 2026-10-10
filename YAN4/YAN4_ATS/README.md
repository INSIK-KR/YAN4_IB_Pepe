# YNA4 보충 대시보드 (Electron)

브라우저 단독 HTML은 로컬 디스크의 엑셀을 임의 경로로 자동 읽기 어렵습니다. 이 폴더는 동일한 `보충데이터입력.html` + `yna4-replenish-core.js`를 띄우고, 시작 시 **폴더**(기본: 시스템 다운로드)와 **`auto-load.json` / 실행 인자**에 적힌 경로를 **합쳐서** 파일명 규칙으로 ① SLA · ② 이관만 채웁니다.

## 폴더 선택

- 첫 실행은 **시스템 다운로드** 폴더를 스캔합니다.
- 앱에서 **「폴더 선택…」**으로 다른 폴더를 고르면, 설정이  
  **`%LOCALAPPDATA%\YNA4ReplenishDesktop\scan-config.json`** 에 저장되고 이후부터 그 폴더를 씁니다.
- 폴더를 바꾼 뒤에는 **페이지가 한 번 새로고침**되어 다시 불러옵니다.
- **「새로고침」**으로 선택한 폴더·`auto-load` 경로를 **다시 읽어** ①·②를 디스크 최신 내용으로 덮어씁니다(워크플로우 붙여넣기는 그대로).

## 파일명 규칙 (선택 폴더 + auto-load 공통)

| 패턴 (앞에 `YYYY-MM-DD_HHMMSS_`) | 슬롯 |
|----------------------------------|------|
| `SLA` | ① SLA — 여러 개면 **타임스탬프 최신** 한 파일 |
| `진열대기`, `진열중`, `이동중` (번호 없음 또는 `_1` `_2` … 셋트) | ② 이관 — 세 종류를 **진열대기 → 진열중 → 이동중** 순으로 TSV 병합 |

- 같은 라벨에서 **번호 없음 최신** vs **`_1`·`_2` 셋트(같은 tsKey) 중 최신 셋트**를 비교해, **더 최근 타임스탬프**인 쪽만 사용. **동률**이면 **번호 없는 한 파일** 우선.
- Chrome이 붙인 ` (1)` 같은 접미사는 제거 후 인식.
- 각 파일은 시트 **`①이관현황 Data`**가 있으면 그 시트, 없으면 첫 시트를 TSV로 읽습니다.

`download-excel-pick.js`에 파싱·선택 로직이 있습니다.

## 준비

```bash
cd yna4-replenish-desktop
npm install
```

`postinstall`이 `../vendor/xlsx.full.min.js`에 SheetJS 번들을 복사합니다(오프라인·스토어 빌드용). 인터넷이 되면 CDN으로도 동작합니다.

## 실행 (개발) · 미리보기

**전체 미리보기(①② 디스크 자동 + 워크플로우)**는 Electron 개발 실행이 가장 확실합니다.

```bash
cd yna4-replenish-desktop
npm start
```

같은 폴더의 상위 `YAN4`에 있는 `보충데이터입력.html`을 띄우므로, HTML/JS를 고친 뒤에는 **앱에서 새로고침**(또는 창을 닫았다가 다시 `npm start`)만 하면 됩니다.

**브라우저만**으로 `보충데이터입력.html`을 연 경우: 레이아웃·워크플로우·이전에 저장된 ①②(localStorage)는 볼 수 있지만, **로컬 엑셀 자동 스캔·파일 선택 바**는 `window.yna4Desktop`이 없으면 나오지 않습니다. ①②를 디스크에서 바로 보려면 위 `npm start`를 쓰세요.

선택적으로 엑셀 경로를 인자로:

```bash
npx electron . "C:\path\sla.xlsx" "C:\path\transfer.xlsx"
```

## 자동 로드 설정

`yna4-replenish-desktop` 폴더(개발 시) 또는 **포터블 exe와 같은 폴더**(배포 시)에 `auto-load.json`을 둡니다.

`auto-load.example.json`을 참고해 `excel` 배열 등에 **절대 경로**를 넣습니다. **순서는 무관**하며, 파일명이 `…_SLA`면 ①, `…_진열대기` / `…_진열중` / `…_이동중`이면 ② 병합 후보로만 쓰입니다.

## Windows portable exe

```bash
npm run dist
```

`release/` 아래 portable exe가 생성됩니다. `보충데이터입력.html` 등은 `resources/yan4-app/`에 포함됩니다. `auto-load.json`은 **exe 옆 폴더**에 두면 됩니다.

## 캐시 오류 (0x5, Unable to move the cache)

프로젝트가 **OneDrive·동기화 폴더** 안에 있거나 권한이 빡빡할 때 Chromium이 캐시를 못 옮겨 로그가 날 수 있습니다. `main.js`에서 **userData → `%LOCALAPPDATA%\YNA4ReplenishDesktop`**, **디스크 캐시 → `%TEMP%\yna4-replenish-chromium-cache`** 로 고정해 두었습니다. 그래도 나오면 앱을 **로컬 디스크 일반 폴더**로 옮겨 실행해 보세요.
