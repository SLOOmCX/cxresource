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

// 팀원 목록 (이름과 색상). 순서/색상 자유롭게 변경 가능.
export const MEMBERS = [
  { name: "조건",   color: "#6366f1" },
  { name: "박가영", color: "#ec4899" },
  { name: "전승리", color: "#14b8a6" },
  { name: "허윤선", color: "#f59e0b" },
  { name: "박혜정", color: "#3b82f6" },
];
