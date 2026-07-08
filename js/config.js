// ────────────────────────────────────────────────────────────
//  Firebase 설정 (Realtime Database)
// ────────────────────────────────────────────────────────────
//  databaseURL 이 비어 있으면 "로컬 데모 모드"로 동작합니다.
//  (데이터가 이 브라우저에만 저장되고 공유되지 않음)
//
//  실시간 공유를 켜려면:
//   1. Realtime Database 생성 (완료)
//   2. 프로젝트 개요 > + 앱 추가 > 웹(</>) → firebaseConfig 값 복사
//   3. 아래 값을 붙여넣고 저장 → 자동으로 실시간 공유로 전환됩니다.
//      (databaseURL 이 반드시 포함되어야 합니다)
// ────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyAAANmH3UJn8vFBevnB93Jtg8PE7pk2TmA",
  authDomain: "cxresource-aec79.firebaseapp.com",
  databaseURL: "https://cxresource-aec79-default-rtdb.firebaseio.com",
  projectId: "cxresource-aec79",
  storageBucket: "cxresource-aec79.firebasestorage.app",
  messagingSenderId: "423546103627",
  appId: "1:423546103627:web:5c029d3366a499703aeace",
  measurementId: "G-F6H06CDE4K",
};

// 팀원 목록 (이름 · 색상 · 구글 이메일).
//  등록된 이메일로 로그인하면 자동으로 본인 이름이 뜨고 다른 사람으로 못 바꿈.
export const MEMBERS = [
  { name: "조건",   color: "#6366f1", email: "g.jo@olit.co.kr" },
  { name: "박가영", color: "#ec4899", email: "gy.park@olit.co.kr" },
  { name: "전승리", color: "#14b8a6", email: "sl.jun@olit.co.kr" },
  { name: "허윤선", color: "#f59e0b", email: "ys.huh@olit.co.kr" },
  { name: "박혜정", color: "#3b82f6", email: "hj.park@olit.co.kr" },
  // 올릿CS: 팀원 권한(블락 가능)이지만 테스트 계정이라 "가능 인원" 집계에서는 제외 (숫자는 5명 기준)
  { name: "올릿CS", color: "#0ea5e9", email: "help_cs@olit.co.kr", test: true },
];

// 관리자 (편집 권한 풀). 팀원을 골라 그 사람의 개인시간을 추가/취소/조정할 수 있음.
export const ADMINS = [
  { name: "김현지",   color: "#64748b", email: "hj.kim@olit.co.kr" },
  { name: "박근영",   color: "#64748b", email: "ky.park@olit.co.kr" },
  { name: "올릿",     color: "#64748b", email: "olit@olit.co.kr" },
];

// 이 도메인 계정은 로그인 시 최소 "조회 전용"으로 접근 가능
export const ALLOWED_DOMAIN = "olit.co.kr";

// 이메일 → 신원 찾기 (대소문자·공백 무시). role: "member" | "admin"
export function identityByEmail(email) {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  const m = MEMBERS.find((x) => x.email && x.email.trim().toLowerCase() === e);
  if (m) return { ...m, role: "member" };
  const a = ADMINS.find((x) => x.email && x.email.trim().toLowerCase() === e);
  if (a) return { ...a, role: "admin" };
  return null;
}
