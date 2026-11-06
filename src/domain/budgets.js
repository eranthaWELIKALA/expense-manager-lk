/* Budgets, and bills paid in parts: the payments that made them up — when, how much and from
   which account — for the Budgets view and the payments dialog on the Month page.
   Everything is read off the month's lines (ledger.js), so it always agrees with the balances. */

import { N } from "./format";
import { lines, statementName, val } from "./ledger";
import { isDateISO, mDiff, prevM, todayISO } from "./months";
import { monthFor, monthRange, stmtDay } from "./periods";

const viaKey = (v) => v.kind + "|" + v.id;
const sameVia = (a, b) => a.kind === b.kind && a.id === b.id;

/** "p:t:abc:p_1" (a part paid from another account) → "t:abc", the line it's part of. Other keys are returned as they are. */
export const partOf = (key) => (String(key).startsWith("p:") ? key.slice(2, key.lastIndexOf(":")) : key);

/** Can this line be opened as a list of payments? Budgets, lines paid in parts, and those parts themselves. */
export const hasPayments = (line) => !!(line && (line.budget || line.portions || line.origin === "part"));

/** The accounts a line is paid from: its own first, then a budget's others. */
export const paidWith = (line) => {
  const own = { kind: line.kind, id: line.id };
  return [own, ...(line.also || []).filter((v) => !sameVia(v, own))];
};

/** Days from `a` to `b` (ISO dates), both included; 0 when `b` is before `a`. */
const daysBetween = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1);

/** Where `today` is relative to a month's days, and the days left in it (today included). */
const timing = (range, today) => {
  const status = today < range.from ? "ahead" : today > range.to ? "past" : "now";
  return { status, daysLeft: status === "now" ? daysBetween(today, range.to) : 0 };
};

/** Money back recorded for line `key` of month `mk`, wherever and whenever it came in. */
export function moneyBackFor(d, mk, key) {
  const out = [];
  for (const [month, M] of Object.entries(d.months || {})) {
    for (const t of (M && M.transfers) || []) {
      if (!t || t.from || !t.for || t.for.month !== mk || t.for.key !== key || !(N(t.amount) > 0)) continue;
      out.push({ id: t.id, amount: N(t.amount), date: isDateISO(t.date) ? t.date : null, to: t.to, note: t.note || null, month });
    }
  }
  return out.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
}

/**
 * The payments behind one line of month `mk`, oldest first, each with the running total.
 * A line ticked off as one amount (not in parts) is a single payment marked `whole`.
 */
function paymentsOf(d, mk, l) {
  const own = { kind: l.kind, id: l.id };
  /** The statement a dated card payment is on, when the card has statements. */
  const statementOf = (via, date) => {
    const card = via.kind === "card" && date && (d.cards || []).find((c) => c.id === via.id);
    return stmtDay(card) ? statementName(monthFor(d, via, date)) : null;
  };
  if (Array.isArray(l.payments) && l.payments.length) {
    const list = l.payments.map((p, i) => {
      const via = p.via && p.via.kind && p.via.id ? { kind: p.via.kind, id: p.via.id } : own;
      const date = isDateISO(p.date) ? p.date : null;
      return { id: p.id, amount: N(p.amount), date, note: p.note || null, via, statement: statementOf(via, date), i };
    });
    // by date; undated ones keep the order they were recorded in, after the dated ones
    list.sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) || a.i - b.i : a.date ? -1 : b.date ? 1 : a.i - b.i));
    return list;
  }
  if (!l.done || !(val(l) > 0.005)) return [];
  const ov = ((d.months[mk] || {}).ov || {})[l.key] || {};
  const date = isDateISO(ov.paidOn) ? ov.paidOn : l.date || null;
  return [{ id: null, amount: val(l), date, note: null, via: own, statement: statementOf(own, date), whole: true }];
}

/** Spent against line `key` in each of the `count` months up to `mk` that the plan covers. */
export function spendingHistory(d, mk, key, count = 6) {
  const first = Object.keys(d.months || {}).sort()[0] || mk;
  const months = [];
  for (let k = mk, i = 0; i < count && mDiff(first, k) >= 0; k = prevM(k), i++) months.unshift(k);
  return months.map((k) => {
    const l = lines(d, k).find((x) => x.key === key);
    return l ? { month: k, plan: N(l.plan), spent: N(l.paid) } : { month: k, plan: 0, spent: 0, none: true };
  });
}

/**
 * One budget (or line paid in parts) of month `mk`: its plan and spending, what's left and for how
 * many days, the payments with a running total, the total per account, and money back for it.
 */
export function paymentSummary(d, mk, line, today = todayISO()) {
  const payments = paymentsOf(d, mk, line);
  let run = 0;
  for (const p of payments) { run += p.amount; p.running = run; }
  const spent = run, plan = N(line.plan);
  const via = paidWith(line);
  const totals = new Map(via.map((v) => [viaKey(v), { via: v, amount: 0 }]));
  for (const p of payments) {
    const k = viaKey(p.via);
    if (!totals.has(k)) totals.set(k, { via: p.via, amount: 0 });
    totals.get(k).amount += p.amount;
  }
  const range = monthRange(d, mk, line.budget ? null : via[0]); // a budget runs over the plan's month, a bill over its account's
  const { status, daysLeft } = timing(range, today);
  const left = Math.max(0, plan - spent);
  const back = moneyBackFor(d, mk, line.key);
  return {
    key: line.key, label: line.label, month: mk, line, budget: !!line.budget,
    plan, spent, left, over: !!line.budget && spent > plan + 0.005, closed: !!line.done,
    payments, via, byAccount: [...totals.values()],
    range, status, daysLeft, perDay: daysLeft && left > 0.005 && !line.done ? left / daysLeft : 0,
    back, backTotal: back.reduce((s, b) => s + b.amount, 0),
  };
}

/**
 * Month `mk`'s budgets and its other lines paid in parts, each as a paymentSummary, with totals for
 * the budgets. What-ifs are left out. `history` adds each budget's spending over the last 6 months.
 */
export function budgetView(d, mk, { today = todayISO(), history = true } = {}) {
  const ls = lines(d, mk).filter((l) => !l.maybe && l.flow === "out");
  const budgets = ls.filter((l) => l.budget).map((l) => ({
    ...paymentSummary(d, mk, l, today), ...(history ? { history: spendingHistory(d, mk, l.key) } : {}),
  }));
  const parts = ls.filter((l) => !l.budget && l.portions).map((l) => paymentSummary(d, mk, l, today));
  const total = (f) => budgets.reduce((s, b) => s + f(b), 0);
  const range = monthRange(d, mk);
  return {
    month: mk, budgets, parts, range,
    totals: {
      plan: total((b) => b.plan), spent: total((b) => b.spent), left: total((b) => b.left),
      over: budgets.filter((b) => b.over).length, payments: total((b) => b.payments.length),
      ...timing(range, today), // the plan's month, for the page as a whole
    },
  };
}

/** The payments behind line `key` of month `mk` (a part's key opens the line it's part of); null if it's not there. */
export function paymentsFor(d, mk, key, today = todayISO()) {
  const k = partOf(key);
  const l = lines(d, mk).find((x) => x.key === k);
  if (!l) return null;
  return { ...paymentSummary(d, mk, l, today), ...(l.budget ? { history: spendingHistory(d, mk, k) } : {}) };
}
