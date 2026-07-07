import { MEMBERS } from "./config.js";
import { SLOTS, requiredFor, toMin } from "./schedule.js";
import { initData, getMode, subscribeRange, setBlock } from "./data.js";

const WD = ["일", "월", "화", "수", "목", "금", "토"];

const state = {
  view: "monthly",          // daily | weekly | monthly
  anchor: new Date(),       // 기준 날짜
  currentUser: localStorage.getItem("cx_user") || null,
  blocks: new Map(),        // key `${date}|${slot}` -> Set(member)
  unsub: null,
};

// ── 날짜 유틸 ──
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isToday = (d) => ymd(d) === ymd(new Date());

function mondayOf(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 월=0
  return addDays(x, -day);
}

// 현재 뷰에 표시할 날짜 목록(주말 제외)과 데이터 범위를 반환
function visibleDays() {
  if (state.view === "daily") return [new Date(state.anchor)];
  if (state.view === "weekly") {
    const mon = mondayOf(state.anchor);
    return [0, 1, 2, 3, 4].map((i) => addDays(mon, i)); // 월~금
  }
  // monthly: 해당 월의 평일 전체
  const y = state.anchor.getFullYear(), m = state.anchor.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const out = [];
  for (let day = 1; day <= last; day++) {
    const d = new Date(y, m, day);
    const w = d.getDay();
    if (w !== 0 && w !== 6) out.push(d);
  }
  return out;
}

// ── 블락 조회 헬퍼 ──
const key = (date, slot) => `${date}|${slot}`;
const membersAt = (date, slot) => state.blocks.get(key(date, slot)) || new Set();
const iBlocked = (date, slot) =>
  state.currentUser && membersAt(date, slot).has(state.currentUser);

// ── 렌더링 ──
function render() {
  renderDateLabel();
  renderGrid();
  renderSidePanels();
  document.querySelectorAll("#viewToggle button").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === state.view)
  );
}

function renderDateLabel() {
  const el = document.getElementById("dateLabel");
  const d = state.anchor;
  if (state.view === "daily") {
    el.textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
  } else if (state.view === "weekly") {
    const days = visibleDays();
    const a = days[0], b = days[days.length - 1];
    el.textContent = `${a.getMonth() + 1}월 ${a.getDate()}일 ~ ${b.getMonth() + 1}월 ${b.getDate()}일`;
  } else {
    el.textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  }
}

function availClass(date, slot, required) {
  if (required <= 0) return "";
  const blocked = membersAt(date, slot).size;
  const avail = MEMBERS.length - blocked;
  const diff = avail - required;
  if (diff < 0) return "short";
  if (diff === 1) return "p1";
  if (diff >= 2) return "p2";
  return "";
}

function renderGrid() {
  const grid = document.getElementById("grid");
  const days = visibleDays();
  const daily = state.view === "daily";

  // 열 너비: 시간 / 필요 / (각 날짜)
  const dayW = daily ? "1fr" : (state.view === "weekly" ? "1fr" : "56px");
  grid.style.gridTemplateColumns = `62px 52px repeat(${days.length}, ${dayW})`;

  const cells = [];

  // 헤더
  cells.push(`<div class="gcell ghead col-time">시간</div>`);
  cells.push(`<div class="gcell ghead col-need">필요</div>`);
  for (const d of days) {
    const t = isToday(d) ? " today" : "";
    if (daily) {
      cells.push(`<div class="gcell ghead${t}">개인시간 현황</div>`);
    } else {
      cells.push(`<div class="gcell ghead${t}"><span class="wd">${WD[d.getDay()]}</span><span>${d.getMonth() + 1}/${d.getDate()}</span></div>`);
    }
  }

  // 본문
  for (const slot of SLOTS) {
    const req = requiredFor(slot);
    const isHour = slot.endsWith(":00");

    cells.push(`<div class="gcell col-time${isHour ? " hour" : ""}">${isHour ? slot : slot.slice(3)}</div>`);
    cells.push(`<div class="gcell col-need need${req.locked ? " locked" : ""}">${req.label}</div>`);

    for (const d of days) {
      const date = ymd(d);
      if (req.locked) {
        cells.push(`<div class="gcell slot locked"></div>`);
        continue;
      }
      const cls = availClass(date, slot, req.required);
      if (daily) {
        const set = membersAt(date, slot);
        const chips = [...set].map((name) => {
          const c = MEMBERS.find((m) => m.name === name)?.color || "#888";
          return `<span class="chip" style="background:${c}">${name}</span>`;
        }).join("");
        const avail = MEMBERS.length - set.size;
        const mine = iBlocked(date, slot) ? " mine" : "";
        cells.push(
          `<div class="gcell slot daily ${cls}${mine}" data-date="${date}" data-slot="${slot}">${chips}<span class="avail-tag">가능 ${avail}/${MEMBERS.length}</span></div>`
        );
      } else {
        const blocked = membersAt(date, slot).size;
        const avail = MEMBERS.length - blocked;
        cells.push(
          `<div class="gcell slot ${cls}" data-date="${date}" data-slot="${slot}"><span class="avail">${avail}</span></div>`
        );
      }
    }
  }

  grid.innerHTML = cells.join("");
}

function renderSidePanels() {
  // 멤버 선택
  const picker = document.getElementById("memberPicker");
  picker.innerHTML = MEMBERS.map((m) => {
    const active = m.name === state.currentUser ? " active" : "";
    const style = active ? `style="color:${m.color}"` : "";
    return `<button data-member="${m.name}"${active ? ` class="active"` : ""} ${style}><span class="dot" style="background:${m.color}"></span>${m.name}</button>`;
  }).join("");

  // 팀원 범례
  document.getElementById("memberLegend").innerHTML = MEMBERS.map(
    (m) => `<li><span class="dot" style="background:${m.color}"></span>${m.name}</li>`
  ).join("");

  // 내 블락 목록 (현재 보이는 범위 안)
  const list = document.getElementById("myBlocks");
  const hint = document.getElementById("myBlocksHint");
  const countEl = document.getElementById("myCount");
  const mine = [];
  if (state.currentUser) {
    for (const [k, set] of state.blocks) {
      if (set.has(state.currentUser)) {
        const [date, slot] = k.split("|");
        mine.push({ date, slot });
      }
    }
  }
  mine.sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot));
  countEl.textContent = mine.length;
  if (!state.currentUser) {
    hint.textContent = "먼저 위에서 본인 이름을 선택하세요.";
    list.innerHTML = "";
  } else if (mine.length === 0) {
    hint.textContent = "표시된 기간에 블락한 시간이 없습니다.";
    list.innerHTML = "";
  } else {
    hint.textContent = "";
    list.innerHTML = mine.map(({ date, slot }) => {
      const [, mo, da] = date.split("-");
      return `<li><span>${Number(mo)}/${Number(da)} ${slot}</span><button class="rm" data-date="${date}" data-slot="${slot}">✕</button></li>`;
    }).join("");
  }
}

// ── 데이터 구독 ──
function resubscribe() {
  if (state.unsub) { state.unsub(); state.unsub = null; }
  const days = visibleDays();
  const start = ymd(days[0]);
  const end = ymd(days[days.length - 1]);
  state.unsub = subscribeRange(start, end, (rows) => {
    const map = new Map();
    for (const b of rows) {
      const k = key(b.date, b.slot);
      if (!map.has(k)) map.set(k, new Set());
      map.get(k).add(b.member);
    }
    state.blocks = map;
    renderGrid();
    renderSidePanels();
  });
}

// ── 이벤트 ──
async function toggle(date, slot) {
  if (!state.currentUser) { alert("먼저 오른쪽에서 본인 이름을 선택하세요."); return; }
  const blocked = iBlocked(date, slot);
  // 낙관적 UI: 즉시 반영 후 저장
  const k = key(date, slot);
  if (!state.blocks.has(k)) state.blocks.set(k, new Set());
  if (blocked) state.blocks.get(k).delete(state.currentUser);
  else state.blocks.get(k).add(state.currentUser);
  renderGrid();
  renderSidePanels();
  try {
    await setBlock({ date, slot, member: state.currentUser }, !blocked);
  } catch (e) {
    console.error(e); alert("저장에 실패했습니다. 새로고침 해주세요.");
  }
}

function wireEvents() {
  document.getElementById("viewToggle").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.view = b.dataset.view;
    render(); resubscribe();
  });

  const step = (dir) => {
    if (state.view === "daily") state.anchor = addDays(state.anchor, dir);
    else if (state.view === "weekly") state.anchor = addDays(state.anchor, dir * 7);
    else state.anchor = new Date(state.anchor.getFullYear(), state.anchor.getMonth() + dir, 1);
    render(); resubscribe();
  };
  document.getElementById("prevBtn").addEventListener("click", () => step(-1));
  document.getElementById("nextBtn").addEventListener("click", () => step(1));
  document.getElementById("todayBtn").addEventListener("click", () => {
    state.anchor = new Date(); render(); resubscribe();
  });
  document.getElementById("refreshBtn").addEventListener("click", () => resubscribe());

  document.getElementById("grid").addEventListener("click", (e) => {
    const cell = e.target.closest(".slot"); if (!cell || cell.classList.contains("locked")) return;
    toggle(cell.dataset.date, cell.dataset.slot);
  });

  document.getElementById("memberPicker").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.currentUser = b.dataset.member === state.currentUser ? null : b.dataset.member;
    if (state.currentUser) localStorage.setItem("cx_user", state.currentUser);
    else localStorage.removeItem("cx_user");
    render();
  });

  document.getElementById("myBlocks").addEventListener("click", (e) => {
    const b = e.target.closest(".rm"); if (!b) return;
    toggle(b.dataset.date, b.dataset.slot);
  });
}

// ── 시작 ──
(async function main() {
  wireEvents();
  render();
  await initData();
  const badge = document.getElementById("modeBadge");
  if (getMode() === "firebase") { badge.textContent = "실시간 공유"; badge.className = "mode-badge live"; }
  else { badge.textContent = "로컬 데모"; badge.className = "mode-badge local"; }
  resubscribe();
})();
