# YAN4 IB Shell Desktop (1단계)

> **MK2**: 디자인 개편용 복사본. 원본은 `../CFS_IB_LIVE` (계속 업데이트). 데이터 코드(WMS 요청·계산)는 되도록 원본과 같게 유지하고 수정은 양쪽에 반영. 저장 폴더는 `%LOCALAPPDATA%\CFSIBLiveMK2`.

확장 **통합 패널**을 Electron portable EXE로 이식한 앱입니다.  
ATS Live(1.0.0)와 **별도**입니다.

## 보안 정책 (안전한 방향)

- **Chrome 쿠키/디버그 포트 연동 없음** (회사 보안 리스크 회피)
- Coupang/PO 로그인은 **EXE 안 웹 창**
- SLA SharePoint는 **Chrome 다운로드 → Downloads 자동 수집**
- 세션은 `%LOCALAPPDATA%\YAN4ShellDesktop` 에만 저장 · 종료 시 쿠키 flush

## SharePoint SLA

1. SLA 조회 시 Chrome으로 다운로드 URL을 염  
2. Downloads의 새 엑셀을 EXE가 자동 수집  

## 로그인

| 버튼 | 용도 |
|------|------|
| **Coupang** | inventory / inbound / outbound / ATS / transfer 엑셀 |
| **PO** | PO Management |
| **MOS** | Gross HTP / Need help Tracking (`mos.coupang.net`) |

HTTP 401 on `/transfer/.../excel` → EXE에서 **Coupang 미로그인·세션 만료**인 경우가 대부분입니다.

## 1단계 제외

- receiving 드로어 / fetch hook / Shrink 페이지 알림
- Chrome 세션 가져오기

## 실행 / 빌드

```bash
cd YAN4/YAN4_SHELL_DESKTOP
npm install
npm start
npm run dist
```

배포 EXE는 항상 `release/YAN4-IB-Shell <version>.exe` 한곳입니다.  
(`npm run dist`는 파일 잠금을 피하려고 LocalAppData에 빌드한 뒤 `release/`로 복사합니다.)

잠긴 예전 `release-*` 폴더가 남으면 Cursor/EXE를 종료한 뒤 `cleanup-old-releases.cmd`를 실행하세요.
