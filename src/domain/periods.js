/* Which month a date counts in — it depends on the account.

   Banks and cash (and budgets, whatever pays them) follow the plan's months. They usually start on
   `plan.monthStart` (1–28; the day the salary usually lands, 1 = calendar months): spending in the days
   before it is still paid from the month before, so it counts there. A month can also have its own
   start, when the salary came early or late that time: `plan.monthStarts` = {"YYYY-MM": "YYYY-MM-DD"}.
   Each month then runs from its start to the day before the next month's start. A start is kept
   between the 17th of the month before and the 16th of the month itself, which holds every usual
   start (Dec: 17 Nov – 16 Dec), so months stay in order and never overlap.

   A card with a statement day follows its statements instead: a charge counts in the month of the
   statement it's on. See periodOf in months.js for how statement months are named.

   @typedef {{kind: "bank"|"cash"|"card", id: string}} AccountRef */

import { N } from "./format";
import { addDays, dateInMonth, dateInPeriod, isDateISO, isMonthKey, monthOfDate, nextM, periodOf, periodRange, prevM, todayISO } from "./months";

export const PAY_DAYS = 21;
/** A card's statement day (1–31), or null when it has none. */
export const stmtDay = (c) => (N(c && c.statementDay) >= 1 ? Math.min(31, Math.round(N(c.statementDay))) : null);
/** Days from a card's statement to its pay-by date. */
export const payDays = (c) => (N(c && c.payDays) >= 1 ? Math.round(N(c.payDays)) : PAY_DAYS);

/** The day of the month the plan's months usually start on (1 = calendar months). */
export const monthStartDay = (d) => {
  const s = Math.round(N(d && d.monthStart));
  return s >= 2 && s <= 28 ? s : 1;
};

/** The statement day of the card `ref` points at; null for banks, cash and cards without one (they follow the plan's months). */
const statementDayOf = (d, ref) =>
  (ref && ref.kind === "card" ? stmtDay(((d && d.cards) || []).find((c) => c.id === ref.id)) : null);

/** The earliest and latest day month `mk` can start on. */
export const startLimits = (mk) => ({ min: dateInMonth(prevM(mk), 17), max: dateInMonth(mk, 16) });

/** The day month `mk` starts on when it has no start of its own. */
export const usualStart = (d, mk) => periodRange(mk, monthStartDay(d) - 1).from;

/** A start of its own for month `mk` that's usable (well-formed and within the limits), or null. */
function ownStart(d, mk) {
  const s = d && d.monthStarts && d.monthStarts[mk];
  if (!isDateISO(s)) return null;
  const { min, max } = startLimits(mk);
  return s >= min && s <= max ? s : null;
}

/** The day the plan's month `mk` starts on: its own start when it has one, else the usual day. */
export const monthStartOf = (d, mk) => ownStart(d, mk) || usualStart(d, mk);

/** Does month `mk` start on a day of its own (not the usual one)? */
export const hasOwnStart = (d, mk) => { const s = ownStart(d, mk); return !!s && s !== usualStart(d, mk); };

/** Do the plan's months differ from calendar months anywhere (a usual start day, or a month with its own)? */
export const offCalendar = (d) => monthStartDay(d) > 1 || Object.keys((d && d.monthStarts) || {}).some((k) => isMonthKey(k) && hasOwnStart(d, k));

/** First and last day of the plan's month `mk`. */
const planRange = (d, mk) => ({ from: monthStartOf(d, mk), to: addDays(monthStartOf(d, nextM(mk)), -1) });

/** The plan's month that date `s` counts in: its calendar month, the one before, or the one after. */
function planMonth(d, s) {
  const c = monthOfDate(s);
  if (s >= monthStartOf(d, nextM(c))) return nextM(c);
  return s >= monthStartOf(d, c) ? c : prevM(c);
}

/** The date in `range` that falls on day-of-month `day`, else its last day. */
function dayIn({ from, to }, day) {
  for (let mk = monthOfDate(from); mk <= monthOfDate(to); mk = nextM(mk)) {
    const x = dateInMonth(mk, day);
    if (x >= from && x <= to) return x;
  }
  return to;
}

/** The month a date counts in for an account (`ref` null: the plan's months). */
export const monthFor = (d, ref, date) => {
  const S = statementDayOf(d, ref);
  return S ? periodOf(date, S) : planMonth(d, date);
};

/** First and last day of month `mk` for an account (`ref` null: the plan's months). */
export const monthRange = (d, mk, ref = null) => {
  const S = statementDayOf(d, ref);
  return S ? periodRange(mk, S) : planRange(d, mk);
};

/** The date a due day falls on in month `mk`, for an account. */
export const dueDateIn = (d, mk, ref, day) => {
  const S = statementDayOf(d, ref);
  return S ? dateInPeriod(mk, S, day || 1) : dayIn(planRange(d, mk), day || 1);
};

/** The month today counts in (`ref` null: the plan's months). */
export const currentMonth = (d, ref = null, today = todayISO()) => monthFor(d, ref, today);

/** A date to start a form on in month `mk`: today when it's in that month, otherwise the month's first day. */
export const defaultDateIn = (d, mk, ref = null) => (currentMonth(d, ref) === mk ? todayISO() : monthRange(d, mk, ref).from);
