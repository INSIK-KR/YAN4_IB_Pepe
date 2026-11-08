# CFS ATSOOS

CFS HTP, CFS IB LIVE와 별개인 Electron 앱입니다. 현재는 WMS 로그인까지만 구현되어 있습니다.

## 실행

```bash
npm install
npm start
```

휴대용 exe는 `npm run dist`로 `release` 폴더에 만들어집니다.

## WMS 로그인

- 로그인 창에서 `https://inbound.coupang.com/`을 열어 사용자가 직접 로그인합니다.
- 쿠키는 전용 세션 `persist:cfs-atsoos`에 저장되어 앱을 다시 켜도 유지되고, 다른 CFS 앱과 공유하지 않습니다.
- 로그인 여부는 쿠키 개수가 아니라 WMS에 실제로 요청해서 판단합니다. 로그인 화면으로 넘어가면 로그아웃 상태입니다.
- 앱을 켤 때, 로그인 창을 닫을 때, 메인 창으로 돌아올 때마다 다시 확인합니다.
- WMS 요청에는 시간 제한을 두지 않습니다.
