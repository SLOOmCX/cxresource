// ────────────────────────────────────────────────────────────
//  데이터 레이어
//  - Firebase 설정이 있으면 Realtime Database(실시간 공유) 사용
//  - 없으면 localStorage(이 브라우저 전용, 데모)로 폴백
//
//  블락 1건 = { date: "YYYY-MM-DD", slot: "09:15", member: "조건" }
//  RTDB 경로: blocks/{id}  (id = "날짜__슬롯__이름")
// ────────────────────────────────────────────────────────────
import { firebaseConfig } from "./config.js";

const FS_VER = "10.12.0";
const LS_KEY = "cx_blocks_v1";

let mode = "local";
let rdb = null;        // database 모듈 함수 모음
let db = null;
let blocksRef = null;

export function getMode() { return mode; }

export async function initData() {
  if (firebaseConfig && firebaseConfig.databaseURL) {
    try {
      const appMod = await import(`https://www.gstatic.com/firebasejs/${FS_VER}/firebase-app.js`);
      const dbMod = await import(`https://www.gstatic.com/firebasejs/${FS_VER}/firebase-database.js`);
      const app = appMod.initializeApp(firebaseConfig);
      db = dbMod.getDatabase(app);
      rdb = dbMod;
      blocksRef = dbMod.ref(db, "blocks");
      mode = "firebase";
    } catch (e) {
      console.warn("[CX] Firebase 초기화 실패 → 로컬 모드로 전환", e);
      mode = "local";
    }
  }
  return mode;
}

const docId = (b) => `${b.date}__${b.slot.replace(":", "")}__${b.member}`;

// ── 구독: [start, end] 날짜 범위(YYYY-MM-DD)의 블락을 실시간으로 콜백 ──
export function subscribeRange(start, end, cb) {
  if (mode === "firebase") {
    // 데이터가 작아 전체를 구독하고 클라이언트에서 범위 필터링
    return rdb.onValue(blocksRef, (snap) => {
      const val = snap.val() || {};
      const rows = Object.values(val).filter((b) => b && b.date >= start && b.date <= end);
      cb(rows);
    });
  }
  // local
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
    if (blocked) await rdb.set(ref, { ...block, createdAt: Date.now() });
    else await rdb.remove(ref);
    return;
  }
  // local
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
