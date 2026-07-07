import { MEMBERS, ADMINS, identityByEmail, ALLOWED_DOMAIN } from "./config.js";
import { SLOTS, requiredFor, toMin } from "./schedule.js";
import { initData, getMode, subscribeRange, setBlock, onAuth, signInGoogle, signOutUser } from "./data.js";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const TOTAL = MEMBERS.length;

// localhost 에서 ?dev(=email) 로 로그인 게이트를 건너뛰는 개발용 우회 (운영 도메인에서는 절대 동작 안 함)
const DEV_BYPASS = location.hostname === "localhost" && new URLSearchParams(location.search).has("dev");

const state = {
  view: "daily",
  anchor: new Date(),
  authUser: null,
  currentUser: localStorage.getItem("cx_user") || null,  // 로그인한 사람의 표시 이름
  role: "member",           // member | admin | viewer
  editTarget: localStorage.getItem("cx_user") || null,   // 실제로 편집 중인 팀원 이름
  identityLocked: false,    // 이메일로 신원이 확정되면 true
  records: [],
  bySlot: new Map(),
  pending: new Set(),
  unsub: null,
};

const canEdit = () => state.role === "member" || state.role === "admin";

// ── 날짜 유틸 ──
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
const maxBlockable = (required) => TOTAL - required;
const isFull = (date, slot, required) => blockedCount(date, slot) >= maxBlockable(required);
const targetBlocked = (date, slot) => state.editTarget && recordsAt(date, slot).some((r) => r.member === state.editTarget);
const isStaged = (date, slot) => state.pending.has(key(date, slot));

const colorOf = (name) => (MEMBERS.find((m) => m.name === name) || ADMINS.find((a) => a.name === name))?.color || "#888";

function fmtDur(mins) { const h = Math.floor(mins / 60), m = mins % 60; return `${h ? h + "시간" : ""}${m ? (h ? " " : "") + m + "분" : ""}` || "0분"; }
const endOf = (slot) => { const t = toMin(slot) + 15; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
function fmtDateK(dateStr) { const [y, mo, da] = dateStr.split("-").map(Number); return `${mo}/${da} (${WD[new Date(y, mo - 1, da).getDay()]})`; }
// 신청 묶음 키: 반드시 날짜 단위로 분리 (groupId 가 여러 날에 걸쳐도 날짜별로 나뉨)
const groupKey = (r) => `${r.date}__${r.groupId || "s_" + r.slot}`;

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
      const mine = targetBlocked(date, slot);
      const staged = isStaged(date, slot);
      let cls = availClass(date, slot, req.required);
      if (full) cls = "full";
      if (staged) cls += " staged";
      if (mine) cls += " mine";

      if (daily) {
        const chips = recs.map((r) => {
          const rsn = r.reason ? `<span class="rsn">· ${escapeHtml(r.reason)}</span>` : "";
          return `<span class="chip" style="background:${colorOf(r.member)}" title="${escapeHtml(r.reason || "")}">${r.member}${rsn}</span>`;
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
  const role = state.role;
  const identified = !!state.currentUser;
  const isAdmin = role === "admin";
  const isViewer = role === "viewer";
  const manual = !state.identityLocked;      // 로컬/미등록: 직접 이름 선택 방식

  // 이름 선택 화면: 관리자(편집 대상 선택) 또는 수동 미선택 상태
  const showPicker = isAdmin || (manual && !identified);
  document.getElementById("memberPanel").hidden = !showPicker;
  document.getElementById("teamPanel").hidden = identified && !isAdmin;
  document.getElementById("welcomeBox").hidden = !identified;
  document.getElementById("myPanel").hidden = !identified;

  // 선택 버튼 (편집 대상 강조)
  document.getElementById("memberPicker").innerHTML = MEMBERS.map((m) => {
    const active = m.name === state.editTarget ? " active" : "";
    return `<button class="${active.trim()}" data-member="${m.name}"><span class="dot" style="background:${m.color}"></span>${m.name}</button>`;
  }).join("");
  document.getElementById("memberLegend").innerHTML = MEMBERS.map(
    (m) => `<li><span class="dot" style="background:${m.color}"></span>${m.name}</li>`
  ).join("");

  // 피커 제목
  const mpTitle = document.getElementById("memberPanelTitle");
  const mpSub = document.getElementById("memberPanelSub");
  if (isAdmin) {
    mpTitle.textContent = "편집할 팀원 선택";
    mpSub.textContent = "관리자: 팀원을 골라 그 사람의 개인시간을 추가/취소/조정할 수 있어요.";
  } else {
    mpTitle.textContent = "나는 누구?";
    mpSub.textContent = "이름을 선택하면 시간대를 눌러 개인시간을 신청할 수 있어요.";
  }

  if (identified) {
    document.getElementById("wbAvatar").textContent = state.currentUser.slice(-2);
    document.getElementById("wbAvatar").style.background = colorOf(state.currentUser);
    document.getElementById("wbName").textContent = state.currentUser;
    const badge = document.getElementById("wbRole");
    badge.hidden = role === "member";
    badge.textContent = isAdmin ? "관리자" : (isViewer ? "조회 전용" : "");
    // 이름 바꾸기: 로컬/수동으로 직접 선택했을 때만
    document.getElementById("changeUserBtn").hidden = !(manual && identified);

    const title = document.getElementById("myPanelTitle");
    const hint = document.getElementById("myBlocksHint");
    const countEl = document.getElementById("myCount");
    if (isViewer) {
      title.textContent = "안내";
      countEl.hidden = true; hint.hidden = false;
      hint.textContent = "조회 전용 계정입니다. 개인시간은 팀원 계정에서 신청하고, 조정은 관리자에게 요청하세요.";
      document.getElementById("myBlocks").innerHTML = "";
    } else if (isAdmin && !state.editTarget) {
      title.textContent = "편집 대상";
      countEl.hidden = true; hint.hidden = false;
      hint.textContent = "위에서 편집할 팀원을 먼저 선택하세요.";
      document.getElementById("myBlocks").innerHTML = "";
    } else {
      title.textContent = isAdmin ? `${state.editTarget} 개인시간 (편집)` : "내 개인시간 신청";
      countEl.hidden = false;
      renderMyBlocks();
    }
  }
}

function renderMyBlocks() {
  const list = document.getElementById("myBlocks");
  const hint = document.getElementById("myBlocksHint");
  const countEl = document.getElementById("myCount");

  const groups = new Map();
  for (const r of state.records) {
    if (r.member !== state.editTarget) continue;
    const g = groupKey(r);
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
  if (items.length === 0) { hint.hidden = false; hint.textContent = "표시된 기간에 신청한 시간이 없습니다."; list.innerHTML = ""; return; }
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
  if (n > 0) document.getElementById("saveBarText").textContent = `선택한 시간 ${n}개 (${fmtDur(n * 15)})` + (state.role === "admin" ? ` · ${state.editTarget}` : "");
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
  if (state.role === "viewer") { alert("조회 전용 계정입니다. 편집은 팀원 또는 관리자 계정에서 가능합니다."); return; }
  if (!state.editTarget) {
    alert(state.role === "admin" ? "먼저 오른쪽에서 편집할 팀원을 선택하세요." : "먼저 오른쪽에서 본인 이름을 선택하세요.");
    return;
  }
  if (isStaged(date, slot)) { state.pending.delete(key(date, slot)); renderGrid(); renderSaveBar(); return; }
  if (targetBlocked(date, slot)) { alert("이미 신청된 시간입니다. 취소는 오른쪽 목록의 ✕ 를 눌러주세요."); return; }
  const req = requiredFor(slot);
  if (isFull(date, slot, req.required)) { alert(`이 시간은 이미 최대 인원(${maxBlockable(req.required)}명)이 신청해 마감되었어요.`); return; }
  state.pending.add(key(date, slot));
  renderGrid(); renderSaveBar();
}

// 주간·월간: 숫자 셀 클릭 → 그 시간대 신청자 명단 팝오버
function showBlockers(date, slot, cellEl) {
  const pop = document.getElementById("blockersPopover");
  const recs = [...recordsAt(date, slot)].sort(
    (a, b) => MEMBERS.findIndex((m) => m.name === a.member) - MEMBERS.findIndex((m) => m.name === b.member)
  );
  document.getElementById("popHead").textContent = `${fmtDateK(date)} ${slot}~${endOf(slot)} · 신청 ${recs.length}명`;
  document.getElementById("popList").innerHTML = recs.length
    ? recs.map((r) => `<li><span class="dot" style="background:${colorOf(r.member)}"></span><span class="nm">${r.member}</span>${r.reason ? `<span class="rsn" title="${escapeHtml(r.reason)}">${escapeHtml(r.reason)}</span>` : ""}</li>`).join("")
    : `<li class="empty">신청자 없음</li>`;
  pop.hidden = false;
  const rect = cellEl.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = rect.right + 8; if (left + pw > innerWidth) left = rect.left - pw - 8; if (left < 8) left = 8;
  let top = rect.top; if (top + ph > innerHeight) top = innerHeight - ph - 8; if (top < 8) top = 8;
  pop.style.left = left + "px"; pop.style.top = top + "px";
}
function hidePopover() { document.getElementById("blockersPopover").hidden = true; }

function openReasonModal() {
  if (state.pending.size === 0) return;
  const who = state.role === "admin" ? `${state.editTarget}의 ` : "";
  document.getElementById("reasonSummary").textContent = `${who}선택한 ${state.pending.size}개 시간(${fmtDur(state.pending.size * 15)})에 적용됩니다.`;
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
  const member = state.editTarget;
  document.getElementById("reasonModal").hidden = true;
  state.pending.clear();
  renderSaveBar();

  let skipped = 0;
  for (const k of slots) {
    const [date, slot] = k.split("|");
    const req = requiredFor(slot);
    if (isFull(date, slot, req.required) && !targetBlocked(date, slot)) { skipped++; continue; }
    try { await setBlock({ date, slot, member, reason, groupId }, true); }
    catch (e) { console.error(e); }
  }
  if (skipped > 0) alert(`${skipped}개 시간은 그 사이 마감되어 제외했어요.`);
}

async function removeGroup(groupId) {
  const targets = state.records.filter((r) => r.member === state.editTarget && groupKey(r) === groupId);
  for (const r of targets) { try { await setBlock(r, false); } catch (e) { console.error(e); } }
}

// ── 이벤트 ──
function wireEvents() {
  document.getElementById("viewToggle").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.view = b.dataset.view; state.pending.clear(); hidePopover(); render(); resubscribe();
  });
  const step = (dir) => {
    if (state.view === "daily") state.anchor = addDays(state.anchor, dir);
    else if (state.view === "weekly") state.anchor = addDays(state.anchor, dir * 7);
    else state.anchor = new Date(state.anchor.getFullYear(), state.anchor.getMonth() + dir, 1);
    state.pending.clear(); hidePopover(); render(); resubscribe();
  };
  document.getElementById("prevBtn").addEventListener("click", () => step(-1));
  document.getElementById("nextBtn").addEventListener("click", () => step(1));
  document.getElementById("todayBtn").addEventListener("click", () => { state.anchor = new Date(); state.pending.clear(); hidePopover(); render(); resubscribe(); });
  document.getElementById("refreshBtn").addEventListener("click", () => resubscribe());

  document.getElementById("grid").addEventListener("click", (e) => {
    const cell = e.target.closest(".slot"); if (!cell || cell.classList.contains("locked")) return;
    if (state.view === "daily") onSlotClick(cell.dataset.date, cell.dataset.slot);
    else showBlockers(cell.dataset.date, cell.dataset.slot, cell);   // 주간·월간: 명단 보기
  });
  // 팝오버 바깥 클릭 시 닫기 (슬롯 클릭은 위 핸들러가 처리)
  document.addEventListener("click", (e) => {
    const pop = document.getElementById("blockersPopover");
    if (pop.hidden || pop.contains(e.target) || e.target.closest(".slot")) return;
    hidePopover();
  });

  document.getElementById("memberPicker").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const name = b.dataset.member;
    state.pending.clear();
    if (state.role === "admin") { state.editTarget = name; }
    else { state.currentUser = name; state.editTarget = name; localStorage.setItem("cx_user", name); }
    render(); renderSaveBar();
  });
  document.getElementById("changeUserBtn").addEventListener("click", () => {
    state.currentUser = null; state.editTarget = null; localStorage.removeItem("cx_user"); state.pending.clear(); render(); renderSaveBar();
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

// ── 신원 확정 ──
function resolveIdentity(user) {
  const id = identityByEmail(user.email);
  if (id) return { role: id.role, name: id.name };
  if (user.email && user.email.trim().toLowerCase().endsWith("@" + ALLOWED_DOMAIN))
    return { role: "viewer", name: user.displayName || user.email.split("@")[0] };
  return { role: "denied", name: null };
}

// ── 화면 전환 ──
function showApp(user) {
  state.authUser = user;
  if (getMode() === "firebase" && user && !user.local) {
    const who = resolveIdentity(user);
    if (who.role === "denied") { signOutUser(); showLogin(`이 계정(${user.email || ""})은 접근 권한이 없습니다. @${ALLOWED_DOMAIN} 계정으로 로그인해 주세요.`); return; }
    state.currentUser = who.name;
    state.role = who.role;
    state.identityLocked = true;
    state.editTarget = who.role === "member" ? who.name : null; // 관리자/뷰어는 대상 별도 선택
    document.getElementById("account").hidden = false;
    document.getElementById("account").textContent = user.email || user.displayName || "";
    document.getElementById("logoutBtn").hidden = false;
  } else {
    // 로컬 데모: 수동 선택, 편집 가능
    state.role = "member";
    state.identityLocked = false;
  }
  document.getElementById("loginScreen").hidden = true;
  document.getElementById("app").hidden = false;
  render(); resubscribe();
}
function showLogin(errorMsg) {
  document.getElementById("app").hidden = true;
  document.getElementById("loginScreen").hidden = false;
  const err = document.getElementById("loginError");
  if (errorMsg) { err.textContent = errorMsg; err.hidden = false; }
}

// ── 시작 ──
(async function main() {
  wireEvents();
  await initData();
  const badge = document.getElementById("modeBadge");
  if (getMode() === "firebase") { badge.textContent = "실시간 공유"; badge.className = "mode-badge live"; }
  else { badge.textContent = "로컬 데모"; badge.className = "mode-badge local"; }

  if (DEV_BYPASS) {
    const devEmail = new URLSearchParams(location.search).get("dev");
    showApp(devEmail && devEmail.includes("@") ? { email: devEmail } : { local: true });
    return;
  }
  onAuth((user) => { if (user) showApp(user); else showLogin(); });
})();
