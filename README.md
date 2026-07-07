# CX 리소스

팀 개인시간(블락) 캘린더. 데일리 / 주간 / 월간으로 09:00~17:00을 15분 단위로 보고,
팀원이 본인 이름을 골라 시간대를 눌러 개인시간을 블락하면 **모두가 실시간으로 같이 봅니다.**

빌드 도구가 필요 없는 순수 HTML/CSS/JS라 GitHub Pages에 그대로 올라갑니다.

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

## 데이터 공유 켜기 (Firebase Realtime Database)

설정 전에는 **로컬 데모 모드**(이 브라우저에만 저장)로 동작합니다.
실시간 공유를 켜려면:

1. https://console.firebase.google.com 에서 프로젝트 생성
2. **빌드 → Realtime Database → 데이터베이스 만들기** (테스트 모드로 시작)
3. **규칙(Rules)** 탭에서 읽기/쓰기 허용 (사내 내부 도구 기준):
   ```json
   { "rules": { ".read": true, ".write": true } }
   ```
4. **프로젝트 개요 → + 앱 추가 → 웹(`</>`)** 후 `firebaseConfig` 값 복사
   (`databaseURL`이 반드시 포함되어야 합니다)
5. [`js/config.js`](js/config.js)의 `firebaseConfig`에 붙여넣기 → 우측 상단 배지가 **"실시간 공유"**로 바뀝니다.

> `.read/.write: true`는 "링크를 아는 누구나 접근 가능"입니다. 사내 신뢰 범위 내부 도구일 때만 쓰세요.
> 외부 노출이 걱정되면 Firebase Authentication(구글 로그인 등)을 붙이고 `auth != null`로 규칙을 조이면 됩니다.

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
