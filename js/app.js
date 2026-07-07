import { MEMBERS, ADMINS, identityByEmail } from "./config.js";
import { SLOTS, requiredFor, toMin } from "./schedule.js";
import { initData, getMode, subscribeRange, setBlock, onAuth, signInGoogle, signOutUser } from "./data.js";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const TOTAL = MEMBERS.length;

// localhost 에서 ?dev 로 로그인 게이트를 건너뛰는 개발용 우회 (운영 도메인에서는 절대 동작하지 않음)
const DEV_BYPASS = location.hostname === "localhost" && new URLSearchParams(location.search).has("dev");

const state = {
  view: "monthly",
  anchor: new Date(),
  authUser: null,
  currentUser: localStorage.getItem("cx_user") || null,
  identityLocked: false,    // 이메일로 본인이 확정되면 true (이름 변경 불가)
  isAdmin: false,           // 관리자(조회 전용) 계정
  records: [],              // 현재 범위의 블락 전체
  bySlot: new Map(),        // key -> [record]
  pending: new Set(),       // 선택 중 'date|slot'
  unsub: null,
};

// ── 날짜 유틸 ──
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isToday = (d) => ymd(d) === ymd(new Date());
function mondayOf(d) { const x = new Date(d); return addDays(x, -((x.getDay() + 6) % 7)); }

function visibleDays() {
  if (state.view === "daily") return [new Date(state.anchor)];
  if (state.view === "weekly") { const mon = mondayOf(state.anchor); return [0, 1, 2, 3, 4].map((i) => addDays(mon, i)); }
  const y = state.anchor.getFullYear(), m = state.anchor.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const out = [];
  for (let day = 1; day <= last; day++) { const d = new Date(y, m, day); const w = d.getDay(); if (w !== 0 && w !== 6) out.push(d); }
  return out;
}

// ── 블락 조회 ──
const key = (date, slot) => `${date}|${slot}`;
const recordsAt = (date, slot) => state.bySlot.get(key(date, slot)) || [];
const blockedCount = (date, slot) => recordsAt(date, slot).length;
const maxBlockable = (required) => TOTAL - required;           // 이 시간에 블락 가능한 최대 인원
const isFull = (date, slot, required) => blockedCount(date, slot) >= maxBlockable(required);
const iBlocked = (date, slot) => state.currentUser && recordsAt(date, slot).some((r) => r.member === state.currentUser);
const isStaged = (date, slot) => state.pending.has(key(date, slot));

const colorOf = (name) => (MEMBERS.find((m) => m.name === name) || ADMINS.find((a) => a.name === name))?.color || "#888";

function fmtDur(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h ? h + "시간" : ""}${m ? (h ? " " : "") + m + "분" : ""}` || "0분";
}
const endOf = (slot) => { const t = toMin(slot) + 15; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

// ── 렌더 ──
function render() {
  renderDateLabel();
  renderGrid();
  renderSide();
  renderSaveBar();
  document.querySelectorAll("#viewToggle button").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
}

function renderDateLabel() {
  const el = document.getElementById("dateLabel"); const d = state.anchor;
  if (state.view === "daily") el.textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
  else if (state.view === "weekly") { const days = visibleDays(); const a = days[0], b = days[days.length - 1]; el.textContent = `${a.getMonth() + 1}월 ${a.getDate()}일 ~ ${b.getMonth() + 1}월 ${b.getDate()}일`; }
  else el.textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

function availClass(date, slot, required) {
  if (required <= 0) return "";
  const diff = (TOTAL - blockedCount(date, slot)) - required;
  if (diff < 0) return "short";
  if (diff === 1) return "p1";
  if (diff >= 2) return "p2";
  return "";
}

function renderGrid() {
  const grid = document.getElementById("grid");
  const days = visibleDays();
  const daily = state.view === "daily";
  const dayW = daily ? "1fr" : (state.view === "weekly" ? "1fr" : "56px");
  grid.style.gridTemplateColumns = `62px 52px repeat(${days.length}, ${dayW})`;

  const cells = [];
  cells.push(`<div class="gcell ghead col-time">시간</div>`);
  cells.push(`<div class="gcell ghead col-need">필요</div>`);
  for (const d of days) {
    const t = isToday(d) ? " today" : "";
    cells.push(daily
      ? `<div class="gcell ghead${t}">개인시간 현황</div>`
      : `<div class="gcell ghead${t}"><span class="wd">${WD[d.getDay()]}</span><span>${d.getMonth() + 1}/${d.getDate()}</span></div>`);
  }

  for (const slot of SLOTS) {
    const req = requiredFor(slot);
    const isHour = slot.endsWith(":00");
    cells.push(`<div class="gcell col-time${isHour ? " hour" : ""}">${isHour ? slot : slot.slice(3)}</div>`);
    cells.push(`<div class="gcell col-need need${req.locked ? " locked" : ""}">${req.label}</div>`);

    for (const d of days) {
      const date = ymd(d);
      if (req.locked) { cells.push(`<div class="gcell slot locked"></div>`); continue; }

      const recs = recordsAt(date, slot);
      const full = isFull(date, slot, req.required);
      const mine = iBlocked(date, slot);
      const staged = isStaged(date, slot);
      let cls = availClass(date, slot, req.required);
      if (full) cls = "full";
      if (staged) cls += " staged";
      if (mine) cls += " mine";

      if (daily) {
        const chips = recs.map((r) => {
          const c = MEMBERS.find((m) => m.name === r.member)?.color || "#888";
          const rsn = r.reason ? `<span class="rsn">· ${escapeHtml(r.reason)}</span>` : "";
          return `<span class="chip" style="background:${c}" title="${escapeHtml(r.reason || "")}">${r.member}${rsn}</span>`;
        }).join("");
        const tag = full ? "마감" : `가능 ${TOTAL - recs.length}/${TOTAL}`;
        cells.push(`<div class="gcell slot daily ${cls}" data-date="${date}" data-slot="${slot}">${chips}<span class="avail-tag">${tag}</span></div>`);
      } else {
        const label = full ? "마감" : (TOTAL - recs.length);
        cells.push(`<div class="gcell slot ${cls}" data-date="${date}" data-slot="${slot}"><span class="avail">${label}</span></div>`);
      }
    }
  }
  grid.innerHTML = cells.join("");
}

function renderSide() {
  const has = !!state.currentUser;
  document.getElementById("memberPanel").hidden = has;
  document.getElementById("teamPanel").hidden = has;
  document.getElementById("welcomeBox").hidden = !has;
  document.getElementById("myPanel").hidden = !has;

  // 멤버 선택 버튼
  document.getElementById("memberPicker").innerHTML = MEMBERS.map(
    (m) => `<button data-member="${m.name}"><span class="dot" style="background:${m.color}"></span>${m.name}</button>`
  ).join("");
  // 팀원 범례
  document.getElementById("memberLegend").innerHTML = MEMBERS.map(
    (m) => `<li><span class="dot" style="background:${m.color}"></span>${m.name}</li>`
  ).join("");

  if (has) {
    document.getElementById("wbAvatar").textContent = state.currentUser.slice(-2);
    document.getElementById("wbAvatar").style.background = colorOf(state.currentUser);
    document.getElementById("wbName").textContent = state.currentUser;
    document.getElementById("changeUserBtn").hidden = state.identityLocked; // 이메일 확정이면 변경 숨김
    if (state.isAdmin) {
      document.getElementById("myCount").hidden = true;
      document.getElementById("myBlocksHint").hidden = false;
      document.getElementById("myBlocksHint").textContent = "조회 전용 관리자 계정입니다. (개인시간 신청 불가)";
      document.getElementById("myBlocks").innerHTML = "";
    } else {
      document.getElementById("myCount").hidden = false;
      renderMyBlocks();
    }
  }
}

function renderMyBlocks() {
  const list = document.getElementById("myBlocks");
  const hint = document.getElementById("myBlocksHint");
  const countEl = document.getElementById("myCount");

  // 내 신청을 groupId 로 묶기
  const groups = new Map();
  for (const r of state.records) {
    if (r.member !== state.currentUser) continue;
    const g = r.groupId || `s_${r.date}_${r.slot}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const items = [...groups.entries()].map(([g, recs]) => {
    recs.sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot));
    const first = recs[0], lastSlot = recs[recs.length - 1].slot;
    return { g, date: first.date, start: first.slot, end: endOf(lastSlot), dur: recs.length * 15, reason: first.reason || "(사유 없음)" };
  });
  items.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  countEl.textContent = items.length;
  if (items.length === 0) { hint.hidden = false; list.innerHTML = ""; return; }
  hint.hidden = true;
  list.innerHTML = items.map((it) => {
    const [, mo, da] = it.date.split("-");
    return `<li><div>
      <div><span class="mb-when">${Number(mo)}/${Number(da)} ${it.start}~${it.end}</span><span class="mb-dur">${fmtDur(it.dur)}</span></div>
      <div class="mb-reason">${escapeHtml(it.reason)}</div>
    </div><button class="rm" data-group="${it.g}" title="신청 취소">✕</button></li>`;
  }).join("");
}

function renderSaveBar() {
  const bar = document.getElementById("saveBar");
  const n = state.pending.size;
  bar.hidden = n === 0;
  if (n > 0) document.getElementById("saveBarText").textContent = `선택한 시간 ${n}개 (${fmtDur(n * 15)})`;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ── 구독 ──
function resubscribe() {
  if (state.unsub) { state.unsub(); state.unsub = null; }
  const days = visibleDays();
  state.unsub = subscribeRange(ymd(days[0]), ymd(days[days.length - 1]), (rows) => {
    state.records = rows;
    const map = new Map();
    for (const b of rows) { const k = key(b.date, b.slot); if (!map.has(k)) map.set(k, []); map.get(k).push(b); }
    state.bySlot = map;
    renderGrid(); renderSide();
  });
}

// ── 선택/저장 ──
function onSlotClick(date, slot) {
  if (!state.currentUser) { alert("먼저 오른쪽에서 본인 이름을 선택하세요."); return; }
  if (state.isAdmin) { alert("관리자 계정은 조회 전용입니다. 개인시간 신청은 팀원 계정에서 해주세요."); return; }
  if (isStaged(date, slot)) { state.pending.delete(key(date, slot)); renderGrid(); renderSaveBar(); return; }
  if (iBlocked(date, slot)) { alert("이미 신청한 시간입니다. 취소는 오른쪽 목록의 ✕ 를 눌러주세요."); return; }
  const req = requiredFor(slot);
  if (isFull(date, slot, req.required)) { alert(`이 시간은 이미 최대 인원(${maxBlockable(req.required)}명)이 신청해 마감되었어요.`); return; }
  state.pending.add(key(date, slot));
  renderGrid(); renderSaveBar();
}

function openReasonModal() {
  if (state.pending.size === 0) return;
  document.getElementById("reasonSummary").textContent = `선택한 ${state.pending.size}개 시간(${fmtDur(state.pending.size * 15)})에 적용됩니다.`;
  document.getElementById("reasonInput").value = "";
  document.getElementById("reasonError").hidden = true;
  document.getElementById("reasonModal").hidden = false;
  document.getElementById("reasonInput").focus();
}

async function commitReason() {
  const reason = document.getElementById("reasonInput").value.trim();
  if (!reason) { document.getElementById("reasonError").hidden = false; return; }
  const groupId = "g" + Date.now();
  const slots = [...state.pending];
  document.getElementById("reasonModal").hidden = true;
  state.pending.clear();
  renderSaveBar();

  let skipped = 0;
  for (const k of slots) {
    const [date, slot] = k.split("|");
    const req = requiredFor(slot);
    if (isFull(date, slot, req.required) && !iBlocked(date, slot)) { skipped++; continue; } // 저장 직전 재확인
    try { await setBlock({ date, slot, member: state.currentUser, reason, groupId }, true); }
    catch (e) { console.error(e); }
  }
  if (skipped > 0) alert(`${skipped}개 시간은 그 사이 마감되어 제외했어요.`);
}

async function removeGroup(groupId) {
  const targets = state.records.filter((r) => r.member === state.currentUser && (r.groupId || `s_${r.date}_${r.slot}`) === groupId);
  for (const r of targets) { try { await setBlock(r, false); } catch (e) { console.error(e); } }
}

// ── 이벤트 ──
function wireEvents() {
  document.getElementById("viewToggle").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.view = b.dataset.view; state.pending.clear(); render(); resubscribe();
  });
  const step = (dir) => {
    if (state.view === "daily") state.anchor = addDays(state.anchor, dir);
    else if (state.view === "weekly") state.anchor = addDays(state.anchor, dir * 7);
    else state.anchor = new Date(state.anchor.getFullYear(), state.anchor.getMonth() + dir, 1);
    state.pending.clear(); render(); resubscribe();
  };
  document.getElementById("prevBtn").addEventListener("click", () => step(-1));
  document.getElementById("nextBtn").addEventListener("click", () => step(1));
  document.getElementById("todayBtn").addEventListener("click", () => { state.anchor = new Date(); state.pending.clear(); render(); resubscribe(); });
  document.getElementById("refreshBtn").addEventListener("click", () => resubscribe());

  document.getElementById("grid").addEventListener("click", (e) => {
    const cell = e.target.closest(".slot"); if (!cell || cell.classList.contains("locked")) return;
    onSlotClick(cell.dataset.date, cell.dataset.slot);
  });

  document.getElementById("memberPicker").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.currentUser = b.dataset.member;
    localStorage.setItem("cx_user", state.currentUser);
    render();
  });
  document.getElementById("changeUserBtn").addEventListener("click", () => {
    state.currentUser = null; localStorage.removeItem("cx_user"); state.pending.clear(); render(); renderSaveBar();
  });

  document.getElementById("myBlocks").addEventListener("click", (e) => {
    const b = e.target.closest(".rm"); if (!b) return;
    if (confirm("이 신청을 취소할까요?")) removeGroup(b.dataset.group);
  });

  document.getElementById("saveSelBtn").addEventListener("click", openReasonModal);
  document.getElementById("cancelSelBtn").addEventListener("click", () => { state.pending.clear(); renderGrid(); renderSaveBar(); });
  document.getElementById("reasonConfirm").addEventListener("click", commitReason);
  document.getElementById("reasonCancel").addEventListener("click", () => { document.getElementById("reasonModal").hidden = true; });

  document.getElementById("googleLoginBtn").addEventListener("click", async () => {
    const err = document.getElementById("loginError"); err.hidden = true;
    try { await signInGoogle(); }
    catch (e) { err.textContent = "로그인 실패: " + (e?.message || e); err.hidden = false; }
  });
  document.getElementById("logoutBtn").addEventListener("click", () => signOutUser());
}

// ── 화면 전환 ──
function showApp(user) {
  state.authUser = user;
  document.getElementById("loginScreen").hidden = true;
  document.getElementById("app").hidden = false;
  const acc = document.getElementById("account");
  if (getMode() === "firebase" && user && !user.local) {
    acc.hidden = false; acc.textContent = user.email || user.displayName || "";
    document.getElementById("logoutBtn").hidden = false;
    // 로그인 계정(이메일)으로 본인 확정 — 매칭되면 자동 선택 + 잠금
    const id = identityByEmail(user.email);
    if (id) { state.currentUser = id.name; state.identityLocked = true; state.isAdmin = id.role === "admin"; }
    else { state.currentUser = null; state.identityLocked = false; state.isAdmin = false; } // 미등록 계정은 직접 선택
  }
  render(); resubscribe();
}
function showLogin() {
  document.getElementById("app").hidden = true;
  document.getElementById("loginScreen").hidden = false;
}

// ── 시작 ──
(async function main() {
  wireEvents();
  await initData();
  const badge = document.getElementById("modeBadge");
  if (getMode() === "firebase") { badge.textContent = "실시간 공유"; badge.className = "mode-badge live"; }
  else { badge.textContent = "로컬 데모"; badge.className = "mode-badge local"; }

  if (DEV_BYPASS) {
    // ?dev=someone@x.com 이면 그 이메일로 로그인한 것처럼 시뮬레이션 (이메일 매핑 테스트용)
    const devEmail = new URLSearchParams(location.search).get("dev");
    showApp(devEmail && devEmail.includes("@") ? { email: devEmail } : { local: true });
    return;
  }

  onAuth((user) => {
    if (user) showApp(user);
    else showLogin();
  });
})();
