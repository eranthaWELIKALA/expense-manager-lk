/* Which month a date counts in — it depends on the account.

   Banks and cash follow the plan's months. They start on `plan.monthStart` (1–28; the day the salary
   usually lands, 1 = calendar months): spending in the days before it is still paid from the month
   before, so it counts there. A card with a statement day follows its statements instead: a charge
   counts in the month of the statement it's on. See periodOf in months.js for how months are named.

   @typedef {{kind: "bank"|"cash"|"card", id: string}} AccountRef */

import { N } from "./format";
import { dateInPeriod, periodOf, periodRange, todayISO } from "./months";

export const PAY_DAYS = 21;
/** A card's statement day (1–31), or null when it has none. */
export const stmtDay = (c) => (N(c && c.statementDay) >= 1 ? Math.min(31, Math.round(N(c.statementDay))) : null);
/** Days from a card's statement to its pay-by date. */
export const payDays = (c) => (N(c && c.payDays) >= 1 ? Math.round(N(c.payDays)) : PAY_DAYS);

/** The day of the month the plan's months start on (1 = calendar months). */
export const monthStartDay = (d) => {
  const s = Math.round(N(d && d.monthStart));
  return s >= 2 && s <= 28 ? s : 1;
};

/** The day an account's months end on (0 = the calendar month's last day). */
export function cutoffFor(d, ref) {
  if (ref && ref.kind === "card") {
    const S = stmtDay(((d && d.cards) || []).find((c) => c.id === ref.id));
    if (S) return S;
  }
  return monthStartDay(d) - 1;
}

/** The month a date counts in for an account (`ref` null: the plan's months). */
export const monthFor = (d, ref, date) => periodOf(date, cutoffFor(d, ref));

/** First and last day of month `mk` for an account (`ref` null: the plan's months). */
export const monthRange = (d, mk, ref = null) => periodRange(mk, cutoffFor(d, ref));

/** The date a due day falls on in month `mk`, for an account. */
export const dueDateIn = (d, mk, ref, day) => dateInPeriod(mk, cutoffFor(d, ref), day || 1);

/** The month today counts in (`ref` null: the plan's months). */
export const currentMonth = (d, ref = null, today = todayISO()) => monthFor(d, ref, today);

/** A date to start a form on in month `mk`: today when it's in that month, otherwise the month's first day. */
export const defaultDateIn = (d, mk, ref = null) => (currentMonth(d, ref) === mk ? todayISO() : monthRange(d, mk, ref).from);
