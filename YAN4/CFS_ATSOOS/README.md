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
- 센터 전환은 `/auth/changeCenter/{id}`를 호출한 뒤 첫 화면의 `centerId`로 실제 전환 여부를 다시 확인합니다. 이 앱의 세션만 바뀝니다.

## Power BI ATS OOS 받기

- 리포트 "ATS OOS dashboard_v1"의 데이터 내보내기 요청(`/export/xlsx`)을 앱에서 그대로 보냅니다.
- `powerbi-query.json`은 캡처한 요청 본문입니다. 리포트의 열이나 필터가 바뀌면 새로 캡처해서 이 파일을 교체합니다.
- 앱은 `centercode`, `oos_date`, `Month` 필터만 바꿔서 보냅니다.
- 데이터의 센터는 WMS 현재 센터를 따라가며, 화면에서 따로 고를 수도 있습니다.
- 인증 토큰은 앱이 열어 둔 Power BI 창의 요청에서 얻고, 메모리에만 둡니다. 파일에 저장하지 않고 화면 코드에도 넘기지 않습니다.
