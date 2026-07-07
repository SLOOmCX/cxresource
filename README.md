# CX팀 리소스 캘린더

팀 개인시간(블락) 캘린더. 데일리 / 주간 / 월간으로 09:00~17:00을 15분 단위로 보고,
팀원이 본인 이름을 골라 시간대를 선택 → 사유를 입력해 저장하면 **모두가 실시간으로 같이 봅니다.**

빌드 도구가 필요 없는 순수 HTML/CSS/JS라 GitHub Pages에 그대로 올라갑니다.

## 사용 흐름

1. **Google 계정으로 로그인** (Firebase Auth)
2. **나는 누구?** 에서 본인 이름 선택 → 환영 박스로 바뀌고 내 신청 목록이 보임
3. 빈 시간대를 눌러 **선택**(여러 칸 가능) → 하단 **저장 바**의 `사유 입력하고 저장`
4. 사유 입력 → 저장. 그 시간대에 이름·사유가 표시됨
5. 신청 취소는 사이드바 목록의 **✕**

- **정원 마감**: 필요 인원이 2명이면 그 시간에 최대 3명(5−2)까지만 신청 가능. 다 차면 "마감"으로 막힘.
- 필요 인원이 3명인 구간(13:30~14:00)은 최대 2명까지.

## 필요 인원 규칙

| 시간 | 필요 | 상태 |
|------|------|------|
| 09:00 ~ 11:00 | 5 | 회색 블락(선택 불가) |
| 11:00 ~ 12:30 | 2 | 선택 가능 |
| 12:30 ~ 13:30 | 점심 | 회색 블락(선택 불가) |
| 13:30 ~ 14:00 | 3 | 선택 가능 |
| 14:00 ~ 17:00 | 2 | 선택 가능 |

> 11:00~11:15 구간은 요구사항에 명시가 없어 "2" 구간에 포함했습니다.
> 규칙은 [`js/schedule.js`](js/schedule.js)의 `requiredFor()` 한 곳에서 수정합니다.

셀 색상은 **필요 대비 투입 가능 인원** 비교입니다.
- 🔴 부족: 가능 인원 < 필요
- 🟢 +1 여유
- 🟡 +2 여유 이상

## 팀원 변경

[`js/config.js`](js/config.js)의 `MEMBERS` 배열에서 이름·색상을 바꿉니다.

## Firebase 설정 (Realtime Database + Google 로그인)

설정값이 없으면 **로컬 데모 모드**(이 브라우저에만 저장, 로그인 없음)로 동작합니다.
[`js/config.js`](js/config.js)의 `firebaseConfig`에 값이 채워지면 실시간 공유 + 로그인이 켜집니다.

### 1) Realtime Database
- **빌드 → Realtime Database → 데이터베이스 만들기**
- **규칙(Rules)** 탭 → 로그인한 사용자만 읽기/쓰기 허용:
  ```json
  { "rules": { ".read": "auth != null", ".write": "auth != null" } }
  ```

### 2) Google 로그인 (Authentication)
- **빌드 → Authentication → 시작하기**
- **Sign-in method** 탭 → **Google** → 사용 설정 → 저장
- **Settings → 승인된 도메인(Authorized domains)** 에 배포 도메인 추가:
  `sloomcx.github.io` (GitHub Pages 도메인). `localhost`는 기본 포함.

> 로그인만 하면 누구나(어떤 구글 계정이든) 접근 가능합니다. 특정 인원만 허용하려면
> 규칙에서 `auth.token.email` 을 화이트리스트와 비교하도록 조이면 됩니다.

## 개발용 로그인 우회

로컬에서 로그인 없이 UI를 테스트할 때만: `http://localhost:5500/?dev`
(호스트명이 `localhost`일 때만 동작 → 배포 도메인에서는 절대 작동하지 않음)

## 로컬에서 실행

ES 모듈을 쓰기 때문에 `file://`로 바로 열면 안 되고, 간단한 서버가 필요합니다.

```bash
# Python이 있으면
python -m http.server 5500

# Node가 있으면
npx serve -l 5500
```

Windows에 Node/Python이 없다면 포함된 `serve.ps1`을 쓰세요:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

그다음 http://localhost:5500 접속.

## GitHub Pages 배포

```bash
git init
git add .
git commit -m "CX 리소스 캘린더"
git branch -M main
git remote add origin https://github.com/<사용자명>/<저장소명>.git
git push -u origin main
```

GitHub 저장소 → **Settings → Pages → Source: `main` 브랜치 / `/ (root)`** 선택.
잠시 후 `https://<사용자명>.github.io/<저장소명>/` 에서 열립니다.

## 파일 구조

```
index.html          레이아웃
css/styles.css       스타일
js/config.js         Firebase 설정 · 팀원 목록
js/schedule.js       시간 슬롯 · 필요 인원 규칙
js/data.js           데이터 레이어(Firestore ↔ localStorage 폴백)
js/app.js            렌더링 · 상호작용
serve.ps1            로컬 미리보기용 정적 서버(선택)
```
