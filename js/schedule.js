// ────────────────────────────────────────────────────────────
//  시간대 & 필요 인원 규칙
// ────────────────────────────────────────────────────────────

// 09:00 ~ 17:00 까지 15분 단위 슬롯
export const SLOTS = (() => {
  const out = [];
  for (let m = 9 * 60; m <= 17 * 60; m += 15) {
    const h = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    out.push(`${h}:${mm}`);
  }
  return out;
})();

export const toMin = (slot) => {
  const [h, m] = slot.split(":").map(Number);
  return h * 60 + m;
};

// 각 슬롯의 필요 인원 규칙.
//   locked=true  → 회색으로 블락, 선택 불가
//   required     → 필요 인원 (투입 가능 인원과 비교하는 기준)
//   label        → 필요 열에 표시할 텍스트
//
//  ※ 11:00~11:15 구간은 요구사항에 명시가 없어 오전 블락 다음의
//    "2" 구간에 포함했습니다. (js/schedule.js 에서 한 줄로 조정 가능)
export function requiredFor(slot) {
  const m = toMin(slot);
  if (m >= 9 * 60 && m < 11 * 60)                 // 09:00 ~ 11:00
    return { locked: true, required: 5, label: "5" };
  if (m >= 11 * 60 && m < 12 * 60 + 30)           // 11:00 ~ 12:30
    return { locked: false, required: 2, label: "2" };
  if (m >= 12 * 60 + 30 && m < 13 * 60 + 30)      // 12:30 ~ 13:30
    return { locked: true, required: 0, label: "점심" };
  if (m >= 13 * 60 + 30 && m < 14 * 60)           // 13:30 ~ 14:00
    return { locked: false, required: 3, label: "3" };
  if (m >= 14 * 60 && m <= 17 * 60)               // 14:00 ~ 17:00
    return { locked: false, required: 2, label: "2" };
  return { locked: false, required: 0, label: "" };
}
