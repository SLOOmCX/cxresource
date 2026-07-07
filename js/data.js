// ────────────────────────────────────────────────────────────
//  데이터 레이어
//  - Firebase 설정이 있으면 Realtime Database(실시간 공유) + Google 로그인 사용
//  - 없으면 localStorage(이 브라우저 전용, 데모)로 폴백 (로그인 없음)
//
//  블락 1건 = { date, slot, member, reason, groupId, createdAt }
//  RTDB 경로: blocks/{id}  (id = "날짜__슬롯__이름")
// ────────────────────────────────────────────────────────────
import { firebaseConfig } from "./config.js";

const FS_VER = "10.12.0";
const LS_KEY = "cx_blocks_v1";

let mode = "local";
let rdb = null;        // database 모듈
let am = null;         // auth 모듈
let db = null;
let auth = null;
let blocksRef = null;

export function getMode() { return mode; }

export async function initData() {
  if (firebaseConfig && firebaseConfig.databaseURL) {
    try {
      const appMod = await import(`https://www.gstatic.com/firebasejs/${FS_VER}/firebase-app.js`);
      const dbMod = await import(`https://www.gstatic.com/firebasejs/${FS_VER}/firebase-database.js`);
      const authMod = await import(`https://www.gstatic.com/firebasejs/${FS_VER}/firebase-auth.js`);
      const app = appMod.initializeApp(firebaseConfig);
      db = dbMod.getDatabase(app);
      auth = authMod.getAuth(app);
      rdb = dbMod;
      am = authMod;
      blocksRef = dbMod.ref(db, "blocks");
      mode = "firebase";
    } catch (e) {
      console.warn("[CX] Firebase 초기화 실패 → 로컬 모드로 전환", e);
      mode = "local";
    }
  }
  return mode;
}

// ── 인증 ──
export function onAuth(cb) {
  if (mode === "firebase") return am.onAuthStateChanged(auth, cb);
  // 로컬 모드: 로그인 개념 없음. 항상 로그인된 것으로 취급
  cb({ local: true, displayName: "로컬", email: "local" });
  return () => {};
}

export async function signInGoogle() {
  if (mode !== "firebase") return;
  await am.signInWithPopup(auth, new am.GoogleAuthProvider());
}

export async function signOutUser() {
  if (mode === "firebase") await am.signOut(auth);
}

const docId = (b) => `${b.date}__${b.slot.replace(":", "")}__${b.member}`;

// ── 구독: [start, end] 날짜 범위(YYYY-MM-DD)의 블락을 실시간으로 콜백 ──
export function subscribeRange(start, end, cb) {
  if (mode === "firebase") {
    return rdb.onValue(blocksRef, (snap) => {
      const val = snap.val() || {};
      cb(Object.values(val).filter((b) => b && b.date >= start && b.date <= end));
    });
  }
  const emit = () => cb(readLocal().filter((b) => b.date >= start && b.date <= end));
  emit();
  const handler = () => emit();
  window.addEventListener("storage", handler);
  window.addEventListener("cx-local-change", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("cx-local-change", handler);
  };
}

// ── 블락 설정/해제 ──
export async function setBlock(block, blocked) {
  if (mode === "firebase") {
    const ref = rdb.ref(db, `blocks/${docId(block)}`);
    if (blocked) await rdb.set(ref, { ...block, createdAt: block.createdAt || Date.now() });
    else await rdb.remove(ref);
    return;
  }
  let all = readLocal();
  const id = docId(block);
  all = all.filter((b) => docId(b) !== id);
  if (blocked) all.push({ ...block, createdAt: Date.now() });
  localStorage.setItem(LS_KEY, JSON.stringify(all));
  window.dispatchEvent(new Event("cx-local-change"));
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
  catch { return []; }
}
