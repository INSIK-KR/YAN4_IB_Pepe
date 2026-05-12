# Chrome 웹스토어 등록 — 차근차근 체크리스트 (YAN4 IB Shell 확장용)

공식 문서가 바뀔 수 있으니, 표기보다 **`developer.chrome.com` 링크**를 우선 신뢰하세요.

---

## 0. 이 문서에서 말하는 “확장 폴더”

본 가이드는 아래 폴더 안 파일들을 패키지하는 것을 기준으로 합니다.

- `manifest.json` (루트에 있어야 함)
- `gm-bridge.js`
- `shell.js`

---

## 1. 사전 준비

### 1-1. 개발자 계정 등록

1. [Chrome Web Store에 확장 프로그램 게시](https://developer.chrome.com/docs/webstore/publish) 상단의 **registering** 링크를 따라 [개발자 등록](https://developer.chrome.com/docs/webstore/register) 절차 확인.
2. **Google 계정**으로 [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole) 접속 가능한지 확인.
3. **일회성 개발자 등록 비용**이 있습니다. **정확한 금액·결제 수단**은 위 공식 “Register” 페이지 기준으로 확인하세요.

### 1-2. 로컬에서 한 번 더 확인

1. `chrome://extensions` → **개발자 모드** → **압축해제된 확장 프로그램 로드**로 이 폴더를 연다.
2. Coupang 대상 URL에서 패널·주요 기능이 정상인지 확인.
3. `manifest.json`의 `"version"`이 의도한 버전인지 확인 (업데이트할 때마다 올려야 함).

---

## 2. ZIP 만들기 (여기서 실수 많음)

### 올바른 구조

ZIP을 풀었을 때 **바로** 아래처럼 보여야 합니다.

```text
(압축 해제한 폴더)/
  manifest.json
  gm-bridge.js
  shell.js
```

### 하면 안 되는 구조

```text
YAN4_IB_Shell_ChromeExt/
  YAN4_IB_Shell_ChromeExt/
    manifest.json   ← 한 겹 더 들어가면 업로드/검증에서 꼬일 수 있음
```

**Windows에서 팁:** 확장 폴더 **안의 파일만** 선택 → 우클릭 → 보내기 → 압축(zip) 폴더.  
또는 상위 폴더째 zip 하지 말고, **`manifest.json`이 zip 루트에 오도록** 재확인.

- 패키지 최대 크기: **2GB** (일반 확장은 훨씬 작음).

---

## 3. 대시보드에서 새 항목 만들기

1. [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole) 접속 (개발자로 등록한 계정).
2. **새 항목 추가(Add new item)**.
3. **ZIP 파일 선택 후 업로드**.
4. `manifest`·ZIP 형식이 유효하면 항목 편집 화면으로 진입.

> 계정당 **게시 가능한 확장 프로그램 개수 상한**(공식 문서 기준, 예: 20개)이 있으니, 여러 개 운영 시 [한도 증가 요청](https://support.google.com/chrome_webstore/contact/one_stop_support) 등 공지를 확인.

---

## 4. 왼쪽 메뉴 탭별로 채우기

아래는 공식 “Publish” 문서의 탭 구성과 동일한 흐름입니다.  
각 탭 상세: [게시 문서](https://developer.chrome.com/docs/webstore/publish) 내 링크 모음.

| 탭 | 할 일 (요약) |
|----|----------------|
| **Package** | 업로드한 빌드 정보 확인 (처음엔 여기서 직접 편집은 제한적일 수 있음). |
| **Store listing** | 이름, 설명, 스크린샷(필요 시), 카테고리 등 스토어에 보이는 문구·이미지. |
| **Privacy** | 단일 목적·사용 데이터 처리 방식 선언 ([Privacy 가이드](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)). 이 확장은 `storage`, `clipboardWrite`, 특정 호스트 접근 등이 있으므로 **실제 동작과 다르게 쓰지 말 것**. |
| **Distribution** | 국가, 유료 여부, **공개 범위(Visibility)**. 회사 내만 쓸 거면 보통 **`Unlisted`**(검색 비노출, 링크로만 설치) 또는 조직에 맞는 **Private/제한 배포** 옵션을 검토 ([Distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)). |
| **Test instructions** | 검수자가 로그인 없이는 재현이 어렵다면, **테스트 계정/절차**를 짧게라도 적는 것이 거절률을 줄임 ([Test instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions)). Coupang 사내 계정이 필요하면 그 점을 명시. |

### Privacy / 데이터 관련

- 원격 서버로 사용자 데이터를 **보내지 않는다**면 그에 맞게 체크.
- **개인정보처리방침 URL**이 필요한 경우가 있으니, 회사 정책·스토어 질문 항목에 맞춰 준비.

---

## 5. 검수 제출

1. 필수 항목을 모두 채웠는지 다시 스크롤하며 확인.
2. **Submit for Review(검수 제출)**.
3. 다이얼로그에서 **검수 완료 후 자동 게시 여부** 확인.  
   - 바로 공개가 부담이면 **Deferred publishing(게시 연기)** 옵션을 활용할 수 있습니다 ([게시 문서의 Deferred publishing](https://developer.chrome.com/docs/webstore/publish#deferred)).
4. 검수 중 수정이 필요하면 공식 안내에 따라 **[검수 취소](https://developer.chrome.com/docs/webstore/cancel-review)** 후 새 ZIP 업로드 등을 검토.

> 검수 통과 후 **일정 기간 안에 게시**하지 않으면 초안 상태로 되돌아갈 수 있음(현재 공지: 최대 약 **30일** 내 게시 등 — 대시보드 상태 문구 확인).

---

## 6. 검수 기간·이메일

- 소요 시간은 항목에 따라 다름. [Review process](https://developer.chrome.com/docs/webstore/review-process) 참고.
- **거절·삭제 알림 메일**이 기본으로 옴. 대시보드 **계정 페이지**에서 “게시됨/스테이징” 등 알림도 켜두면 좋음.

---

## 7. 이후 업데이트

1. `manifest.json`의 `"version"`을 **이전보다 큰 값**으로 올림 (예: `0.22.7` → `0.22.8`).
2. `shell.js` 등 소스 반영 후 **새 ZIP** 생성 (구조는 2절과 동일).
3. 대시보드에서 해당 항목 → 새 패키지 업로드 → 스토어 문구/프라이버시 변경이 있으면 같이 수정 → 다시 제출.

공식: [Update your Chrome Web Store Item](https://developer.chrome.com/docs/webstore/update).

---

## 8. 자주 나는 사고 (미리 체크)

- ZIP 안에 **`manifest.json`이 한 단계 아래**에 박혀 있음.
- 권한·호스트 설명을 **실제와 다르게** 적어 프라이버시 불일치로 거절.
- 스크린샷·설명이 **다른 회사 브랜드/민감 UI**를 그대로 노출 (회사 규정·스토어 정책 확인).
- Coupang **로그인 없이 테스트 불가**인데 Test instructions 비어 있음.
- 업데이트 시 **`version` 안 올림**으로 패키지 거절 또는 혼선.

---

## English (short)

1. Register a Chrome Web developer account (one-time fee — see [Register](https://developer.chrome.com/docs/webstore/register)).
2. Zip **`manifest.json` at the root** with `gm-bridge.js` and `shell.js` ([Publish](https://developer.chrome.com/docs/webstore/publish)).
3. [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **Add new item** → upload zip.
4. Complete **Store listing**, **Privacy**, **Distribution** (often **Unlisted** for internal link-only install), **Test instructions** if reviewers need accounts.
5. **Submit for review**; use **deferred publish** if you do not want auto-publish after approval.
6. For updates: bump **`version`**, upload new zip, resubmit ([Update](https://developer.chrome.com/docs/webstore/update)).

---

## 바로 열어둘 링크 모음

- https://developer.chrome.com/docs/webstore/publish  
- https://developer.chrome.com/docs/webstore/register  
- https://developer.chrome.com/docs/webstore/prepare  
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy  
- https://developer.chrome.com/docs/webstore/cws-dashboard-distribution  
- https://developer.chrome.com/docs/webstore/review-process  
- https://chrome.google.com/webstore/devconsole  
