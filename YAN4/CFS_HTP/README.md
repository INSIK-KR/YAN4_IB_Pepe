# CFS HTP

MOS에서 자료를 받아 가공하는 Electron 데스크톱 앱 (직원 배포용 portable exe).

## 실행

```
npm install
npm start
```

## 배포 exe 만들기

```
npm run dist
```

`release/CFS HTP <버전>.exe` 가 만들어집니다. 버전은 `package.json`의 `version`.

## 구조

- `main.js` — 메인 프로세스 (창 생성, 단일 인스턴스, IPC)
- `preload.js` — 렌더러에 `window.cfsHtp` 노출
- `renderer/` — 화면 (index.html, app.js, style.css)

## 남은 결정

- 앱 목적과 핵심 화면 2~3개
- MOS 접근 방식 (웹 주소, 로그인, 엑셀 다운로드 여부)
- 아이콘 (현재 Electron 기본 아이콘)
