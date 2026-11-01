# CFS HTP

MOS 자료를 받아 입고 HTP 현황(엑셀 `Status` 시트)을 보여주는 Electron 데스크톱 앱 (직원 배포용 portable exe).

## 실행

```
npm install
npm start          # 화면 빌드(vite build) 후 Electron 실행
```

화면만 고치면서 볼 때: `npm run dev`(Vite 서버, 5183 포트)를 켜 두고 다른 터미널에서 `CFS_HTP_DEV_URL=http://localhost:5183 npx electron .`

## 배포 exe 만들기

```
npm run dist
```

`release/CFS HTP <버전>.exe` 가 만들어집니다. 버전은 `package.json`의 `version`.

## 화면

React + Tailwind + shadcn/ui (`components.json`, 부품은 `src/components/ui`). 글꼴은 Pretendard.


- **개요**: 중요 지표(HTP·진열·하차·매입·MH), 시간대별 진열·생산성 차트, 지금 확인할 것, 근무조별, 입고 흐름, S&OP와 실적, 진열 구성, 공정별 MH, 이관 차량
- **피벗**: 입고 공정 자료를 행·하위 행·열·값(수량, MH, 인원, 시간당 수량)과 필터로 묶어 보기. 표 복사로 엑셀에 붙여넣기 가능
- **상세 표**: 엑셀 Status 시트와 같은 계산 (HTP Actual·Gap, S&OP, 업무별 근무조 비중, H/C, 근무조 시뮬레이션, 시간대별 하차·매입·진열·생산성, 진열 구성, 공정별 MH, 체크인 지연)
- **MOS 데이터**: [MOS에서 받기](로그인 세션으로 exportExcel → getAsyncFileSaveStatus → downloadSavedFile), 엑셀/CSV 파일 끌어놓기, 복사한 표 Ctrl+V. 통합문서에 `MOS` 시트가 있으면 그 시트만 읽음
- **입력**: Target, S&OP, 진열 비율, Facility 인원, H/C, 이관 차량 하차 정보. 사용자 데이터 폴더의 `inputs.json`에 저장

## 구조

- `main.js` — 메인 프로세스 (창, 단일 인스턴스, 입력값 저장, MOS 로그인 창, MOS 요청)
- `preload.js` — 화면에 `window.cfsHtp` 노출
- `src/` — 화면 (Vite root). `pages/` 개요·피벗·상세 표·MOS 데이터·입력, `components/HourlyChart.tsx` 개요 차트, `components/HourlyTable.tsx` 시간대별 표
- `src/lib/htp-calc.mjs` — 엑셀 계산(Caculation·ManHour·MosDelay → Status)을 옮긴 모듈. 타입은 `htp-calc.d.mts`
- `src/lib/pivot.mjs` — 피벗 계산. 타입은 `pivot.d.mts`, 자주 쓰는 조합은 `pivot-presets.ts`
- `src/lib/mos.ts` — MOS 자료 읽기와 MOS에서 받기
- `src/public/vendor/xlsx.full.min.js` — SheetJS (CFS IB LIVE와 같은 파일)
- `tools/verify.mjs` — 계산 결과를 엑셀 Status 값과 대조
- `dist/` — 빌드된 화면 (git 제외)

## 엑셀과 대조

```
node tools/verify.mjs <MOS 시트를 탭 구분으로 내보낸 파일> <Status 값 JSON>
```

2026-10-29 자료(123.xlsm) 기준 1,328개 값 중 1,324개 일치. 다른 4개는 엑셀 Status G23·L23 셀이 수식 대신 공백으로 덮여 있어 엑셀 쪽이 0으로 나오는 경우.

## 엑셀과 다르게 한 부분

- Status L5:P11(근무조별 인원 환산)은 엑셀에 값이 고정돼 있어, R열과 같은 식(시간대 MH 합 ÷ 8)으로 계산
- 이관 차량 대수·하차 PLT(Status 12~17행)는 엑셀 수식이 피벗의 엉뚱한 열(RM·총합계·빈 열)을 가리키고 있어, 입력한 차량 목록에서 도착 시간대·온도별로 직접 집계
- 개요·피벗의 온도대는 로케이션 2CM을 냉장으로 묶음. 상세 표의 진열 구성은 엑셀과 같이 2CM을 넣지 않음

## 아직 안 옮긴 부분 (Status 오른쪽)

- AT~AX: 온도별 Inbound S&OP, Staffing (Plan), 진열비율
- AE30:AJ35: CD H/C 계산기
- AD47:AO51: 온도별 공정 인원표
- 아이콘 (현재 Electron 기본 아이콘)
