# YAN4 ATS Live (Electron)

확장 프로그램 **ATS 보충**만 데스크톱(exe)으로 띄웁니다.  
확장이 회사 정책으로 막힐 때를 위한 **단독 대체본**입니다.  
확장에 추가 권한이 필요 없습니다.

## 사용

1. `YAN4-ATS-Live` EXE 실행
2. 상단 **「Coupang 로그인」** → EXE 안에서 SSO 로그인
3. ATS 보충 화면에서 조회/실행

세션은 Electron에만 저장됩니다.  
Chrome과 같은 계정을 **동시에** 쓰면 SSO가 풀릴 수 있으니, 확장이 막힌 환경에서는 **EXE만** 쓰면 됩니다.

## 개발 / 빌드

```bash
cd YAN4/YAN4_ATS_LIVE
npm install
npm start
npm run dist
```

`release/YAN4-ATS-Live 1.0.0.exe`
