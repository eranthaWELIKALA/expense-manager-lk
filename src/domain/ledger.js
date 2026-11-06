/* ============================================================
   Month derivation — organised by bank account.

   Salaries land in banks. Money leaves a bank three ways:
     · direct   — standing order / transfer straight from the bank
     · cash     — withdrawn into a cash wallet, then spent
     · card     — charged now, billed to the bank next month
   Bank and cash balances roll into next month automatically.
   A month is each account's own (see periods.js): dated one-offs and
   transfers are kept in the month they count in (see refileDated).

   Plan data is treated as immutable: every edit produces a new
   object, so results are memoised per data object via WeakMap.
   ============================================================ */

import { MONTH_NAMES, prevM, nextM, mDiff, ordinal, dayOfDate, dayMonthLabel, isDateISO, isMonthKey, dateInMonth, todayISO, addDays } from "./months";
import { N, fmt } from "./format";
import { instFor, instPaid, instType } from "./installments";
import { versionAt } from "./versions";
import { dueDateIn, monthFor, monthRange, payDays, stmtDay } from "./periods";

export const blankMonth = () => ({ ov: {}, extra: [], transfers: [], adjust: {} });

/* Recorded money movements between your own accounts (or in from outside), per month:
   M.transfers = [{id, from: {kind, id} | null (money from outside), to: {kind, id}, amount, date?, note?,
                   for?: {month, key, label}}]
   Each shows as a line in both accounts and is settled as soon as it's recorded.
   Money from outside with `for` is money back (a refund, an insurance claim, someone paying you back)
   for the payment with line key `key` in `month`: it lowers what that payment cost. Without `for`
   it's other income. */

/** Name of a bank / cash pot / card. */
const accountName = (d, ref) => {
  if (!ref) return "outside";
  const list = ref.kind === "card" ? d.cards : ref.kind === "cash" ? d.wallets : d.banks;
  return ((list || []).find((x) => x.id === ref.id) || {}).name || "—";
};

const listOf = (d, kind) => (kind === "card" ? d.cards : kind === "cash" ? d.wallets : kind === "bank" ? d.banks : null) || [];
/** Does this bank / cash pot / card still exist? */
export const hasAccount = (d, ref) => !!ref && listOf(d, ref.kind).some((x) => x.id === ref.id);

/** The other accounts a budget is also paid from (template.also), that still exist — never its own. */
const alsoVia = (d, t) => (Array.isArray(t.also) ? t.also : [])
  .filter((v) => v && hasAccount(d, v) && !(v.kind === t.via.kind && v.id === t.via.id))
  .map((v) => ({ kind: v.kind, id: v.id }));

/** How a transfer reads, from each side. */
export function transferLabels(d, t) {
  if (!t.from && t.for) { const head = t.note || "Money back"; return { out: head, in: head + " · for " + t.for.label }; }
  const from = t.from ? t.from.kind : null, to = t.to.kind;
  const verb = !from ? "Money in" : to === "card" ? "Card payment"
    : from === "bank" && to === "cash" ? "Cash withdrawn" : from === "cash" && to === "bank" ? "Cash deposited" : "Transfer";
  const head = t.note ? t.note : verb;
  return { out: head + " → " + accountName(d, t.to), in: head + (t.from ? " ← " + accountName(d, t.from) : "") };
}

/** Lines you can settle with a real amount and method: bills, installments, one-offs. */
export const isPayable = (line) => line.flow === "out" && ["recurring", "installment", "oneoff"].includes(line.origin);

/** Lines that ask for the real amount when ticked: payable ones, and salaries that vary. */
export const asksAmount = (line) => isPayable(line) || (line.origin === "salary" && line.variable);

/** Effective amount of a line: actual when entered, otherwise plan. */
export const val = (l) => (l.eff !== undefined ? l.eff : l.actual !== null && l.actual !== undefined ? N(l.actual) : N(l.plan));

const sum = (ps) => ps.reduce((s, p) => s + N(p.amount), 0);
const monthName = (mk) => MONTH_NAMES[+mk.slice(5, 7) - 1] + " " + mk.slice(0, 4);
const joinTags = (...t) => t.filter(Boolean).join(" · ") || null;

/** Money back recorded for payments in month `key`: line key → amount (null when there's none). Memoised per plan. */
const BK = new WeakMap();
function paidBackIn(d, key) {
  let ix = BK.get(d);
  if (!ix) {
    ix = new Map();
    for (const M of Object.values(d.months || {})) {
      for (const t of (M && M.transfers) || []) {
        const f = t && !t.from && t.for;
        if (!f || !isMonthKey(f.month) || typeof f.key !== "string" || !(N(t.amount) > 0)) continue;
        const m = ix.get(f.month) || new Map();
        m.set(f.key, (m.get(f.key) || 0) + N(t.amount));
        ix.set(f.month, m);
      }
    }
    BK.set(d, ix);
  }
  return ix.get(key) || null;
}

const LC = new WeakMap(), LCN = new WeakMap();
export function lines(d, key) {
  let m = LC.get(d); if (!m) { m = new Map(); LC.set(d, m); }
  if (m.has(key)) return m.get(key);
  m.set(key, []); // guards against re-entry while computing
  const r = computeLines(d, key, true);
  m.set(key, r);
  return r;
}

/** A month's lines without the card bills — what card statements are built from (so they never depend on themselves). */
function linesNoBills(d, key) {
  let m = LCN.get(d); if (!m) { m = new Map(); LCN.set(d, m); }
  if (!m.has(key)) m.set(key, computeLines(d, key, false));
  return m.get(key);
}

/* Parts paid on a card go on the statement their date is on, which can belong to another month than
   the payment they're part of (a budget runs over the plan's month; a card's statement doesn't):
   such a part is a line of that other month. Index: month → its part lines from other months. */
const AW = new WeakMap();
function partsFiledIn(d, key) {
  let ix = AW.get(d);
  if (!ix) {
    ix = new Map();
    AW.set(d, ix); // guards against re-entry
    for (const mk of Object.keys(d.months || {})) {
      const away = [];
      computeLines(d, mk, false, away); // only what's recorded in mk itself
      for (const a of away) { if (!ix.has(a.month)) ix.set(a.month, []); ix.get(a.month).push(a.line); }
    }
  }
  return ix.get(key) || [];
}

const sameRef = (a, b) => a.kind === b.kind && a.id === b.id;
const firstKey = (d) => Object.keys(d.months || {}).sort()[0];

/** The month a part paid from `via` on `date` is a line of: a card charge's statement month, otherwise `key`. */
function partMonth(d, key, via, date) {
  if (via.kind !== "card" || !isDateISO(date)) return key;
  const F = monthFor(d, via, date), first = firstKey(d);
  return first && F < first ? first : F;
}

/**
 * Month `key`'s lines. `away` (an array): collect the parts filed in other months there instead of
 * adding the parts other months file here — what the index above is built from.
 */
function computeLines(d, key, withBills, away = null) {
  const M = d.months[key] || blankMonth();
  const out = [];
  const elsewhere = away || [];
  const push = (o) => {
    const o2 = M.ov[o.key] || {};
    if (o2.removed) return;
    const via = o2.via && o2.via.kind && o2.via.id ? { kind: o2.via.kind, id: o2.via.id } : null; // paid another way this month
    const base = { ...o, ...via, plan: o2.plan !== undefined ? o2.plan : o.plan };
    const pays = Array.isArray(o2.payments) ? o2.payments.filter((p) => p && N(p.amount) > 0) : [];
    if (pays.length) return pushParts(base, o2, pays);
    const done = o2.done !== undefined ? !!o2.done : !!o.autoPaid;
    const paidOn = done && isDateISO(o2.paidOn) && o2.paidOn !== o.date ? (o.flow === "in" ? "received " : "paid ") + dayMonthLabel(o2.paidOn) : null;
    const line = { ...base, actual: o2.actual !== undefined ? o2.actual : null, done, tag: joinTags(o.tag, paidOn) };
    out.push({ ...line, paid: done ? val(line) : 0, remaining: done ? 0 : val(line) }); // an entered actual is the expected cost
  };

  /* Paid in parts (ov.payments): progress on the line itself; parts paid another way come out of that
     bank / cash pot / card as their own locked lines — on a card, in the month of the statement they're on. */
  const pushParts = (base, o2, pays) => {
    const home = { kind: base.kind, id: base.id };
    const viaOf = (p) => (p.via && p.via.kind && p.via.id ? { kind: p.via.kind, id: p.via.id } : home);
    const filedIn = (p) => partMonth(d, key, viaOf(p), p.date);
    const here = (p) => filedIn(p) === key && sameRef(viaOf(p), home);
    const plan = N(base.plan);
    const paid = sum(pays), paidHere = sum(pays.filter(here));
    // a budget stays open while its month runs (spend can go over); a bill is paid once the parts reach it
    const done = o2.done !== undefined ? !!o2.done
      : base.budget ? monthRange(d, key).to < todayISO() : paid >= plan - 0.005; // a budget runs over the plan's month
    const over = base.budget && paid > plan + 0.005;
    const progress = base.budget
      ? (over ? `${fmt(paid - plan)} over budget` : `${fmt(paid)} of ${fmt(plan)} spent`)
      : done ? (pays.length > 1 ? `paid in ${pays.length} parts` : null) : `${fmt(paid)} of ${fmt(plan)} paid`;
    out.push({
      ...base, actual: paidHere, done, paid, over, remaining: done ? 0 : Math.max(0, plan - paid), payments: pays, portions: true,
      eff: done ? paidHere : Math.max(plan - (paid - paidHere), paidHere), // still expected to leave here: the unpaid rest
      tag: joinTags(base.tag, progress),
    });
    pays.filter((p) => !here(p)).forEach((p) => {
      const via = viaOf(p), F = filedIn(p), dated = isDateISO(p.date);
      const line = {
        key: "p:" + base.key + ":" + p.id, label: base.label + " (part)", kind: via.kind, id: via.id, flow: base.flow,
        plan: null, actual: N(p.amount), done: true, origin: "part", locked: true,
        day: dated ? dayOfDate(p.date) : base.day || null, ...(dated ? { date: p.date } : {}),
        partOf: { month: key, key: base.key }, // the payment it's part of
        tag: joinTags(p.note || null, dated ? "paid " + dayMonthLabel(p.date) : null, F !== key ? "for " + monthName(key) : null),
      };
      if (F === key) out.push(line); else elsewhere.push({ month: F, line });
    });
  };
  const planOf = (k, fallback) => { const o = M.ov[k]; return o && o.plan !== undefined ? o.plan : fallback; };

  /* salaries land in banks */
  (d.incomes || []).filter((i) => i.active !== false).map((i) => versionAt(i, key)).forEach((inc) =>
    (inc.splits || []).forEach((sp, ix) => {
      const portion = inc.splits.length > 1 ? "portion " + (ix + 1) + "/" + inc.splits.length : null;
      const est = inc.variable && !(M.ov["s:" + inc.id + ":" + ix] || {}).done ? "estimate" : null; // varies: enter what came in
      push({
        key: "s:" + inc.id + ":" + ix, label: inc.name + " salary", kind: "bank", id: sp.bank,
        flow: "in", plan: N(sp.amount), origin: "salary", variable: !!inc.variable,
        tag: [portion, est].filter(Boolean).join(" · ") || null,
      });
    })
  );

  /* card statements due this month bill to the card's bank */
  if (withBills) {
    (d.cards || []).forEach((c) => {
      if (!c.bank) return;
      const due = billsIn(d, c, key);
      const tot = due.reduce((s, b) => s + cardTotal(d, b.cycle, c.id), 0);
      if (Math.abs(tot) < 0.005) return;
      const last = due[due.length - 1];
      const day = last.due ? dayOfDate(last.due) : null;
      push({ key: "b:" + c.id, label: c.name + " bill", kind: "bank", id: c.bank, flow: "out", plan: tot, origin: "bill",
        tag: joinTags(statementName(last.cycle), day ? "due " + ordinal(day) : null), cycle: last.cycle,
        locked: true, day, ...(last.due ? { date: last.due } : {}) });
    });
  }

  /* cash withdrawals: out of the bank, into the wallet */
  (d.wallets || []).forEach((w) => {
    const amt = planOf("w:" + w.id, N(w.amount));
    push({ key: "w:" + w.id, label: "Withdraw — " + w.name, kind: "bank", id: w.from, flow: "out", plan: amt, origin: "withdrawal" });
    push({ key: "wi:" + w.id, label: "Cash withdrawn", kind: "cash", id: w.id, flow: "in", plan: amt, origin: "withdrawal", locked: true });
  });

  /* recurring items (from their start month, if they have one) */
  (d.templates || []).filter((t) => t.active !== false).map((t) => versionAt(t, key)).forEach((t) => {
    if (t.startMonth && mDiff(t.startMonth, key) < 0) return;
    const amt = planOf("t:" + t.id, N(t.amount));
    const day = t.day || null;
    const budget = !!t.budget && t.flow !== "move" && t.flow !== "in"; // spent in several payments, total varies
    const due = day && !budget ? "due " + ordinal(day) : null;
    if (t.flow === "move") {
      push({ key: "t:" + t.id, label: t.name, kind: t.via.kind, id: t.via.id, flow: "out", plan: N(t.amount), origin: "move", tag: "transfer", day });
      push({ key: "tm:" + t.id, label: t.name, kind: "bank", id: t.to, flow: "in", plan: amt, origin: "move", tag: "transfer", locked: true, day });
    } else {
      const also = budget ? alsoVia(d, t) : [];
      push({ key: "t:" + t.id, label: t.name, kind: t.via.kind, id: t.via.id, flow: t.flow === "in" ? "in" : "out", plan: N(t.amount), origin: "recurring",
        tag: joinTags(budget ? "budget" : null, due), day, ...(budget ? { budget, ...(also.length ? { also } : {}) } : {}) });
    }
  });

  /* installments */
  (d.installments || []).forEach((it) => {
    const s = instFor(it, key);
    if (!s) return;
    const tag = (it.type ? instType(it).noun + " " : "") + (s.of ? s.n + "/" + s.of : "#" + s.n) + (it.day ? " · due " + ordinal(it.day) : "") + (it.auto ? " · auto" : "");
    push({ key: "i:" + it.id, label: it.name, kind: it.via.kind, id: it.via.id, flow: "out", plan: s.amount,
      origin: "installment", tag, locked: true, day: it.day || null,
      ...(it.auto ? { auto: true } : {}),
      autoPaid: !!it.auto && dueDateIn(d, key, it.via, it.day) <= todayISO() }); // auto-debited once the due day passes
  });

  /* one-offs added to this month only */
  (M.extra || []).forEach((e) => {
    const dated = isDateISO(e.date);
    push({ key: "x:" + e.id, label: e.name, kind: e.kind, id: e.id2, flow: e.flow || "out", plan: N(e.amount), origin: "oneoff",
      tag: joinTags(e.maybe ? "what-if" : null, dated ? dayMonthLabel(e.date) : null), day: dated ? dayOfDate(e.date) : null, date: dated ? e.date : null,
      ...(e.maybe ? { maybe: true } : {}) });
  });

  /* parts of other months' payments that are on this month's card statements */
  if (!away) out.push(...partsFiledIn(d, key));

  /* transfers: out of one account, into another (or in from outside) */
  (M.transfers || []).forEach((t) => {
    if (!t || !t.to || !(N(t.amount) > 0)) return;
    const dated = isDateISO(t.date);
    const at = { plan: N(t.amount), origin: "transfer", locked: true, autoPaid: true, tag: dated ? dayMonthLabel(t.date) : null,
      day: dated ? dayOfDate(t.date) : null, date: dated ? t.date : null };
    const label = transferLabels(d, t);
    if (t.from) push({ key: "tx:" + t.id, label: label.out, kind: t.from.kind, id: t.from.id, flow: "out", ...at });
    push({ key: "ti:" + t.id, label: label.in, kind: t.to.kind, id: t.to.id, flow: "in", ...at,
      ...(t.from ? {} : { outside: true, ...(t.for ? { refund: true } : {}) }) }); // from outside: money back, or other income
  });

  /* money back for this month's payments, wherever it landed */
  const back = paidBackIn(d, key);
  if (back) {
    out.forEach((l) => {
      const b = l.flow === "out" && back.get(l.key);
      if (b) { l.back = b; l.tag = joinTags(l.tag, fmt(b) + " paid back"); }
    });
  }

  return out;
}

/**
 * Payments money can come back for: spending that's been paid (or charged to a card) in the latest
 * `count` opened months up to `upTo`, newest first. Each carries its `month`.
 */
export function paidSpending(d, upTo, count = 12) {
  return Object.keys(d.months).filter((k) => k <= upTo).sort().reverse().slice(0, count)
    .flatMap((k) => lines(d, k)
      .filter((l) => isSpend(l) && !l.maybe && l.origin !== "part" && (l.done || N(l.paid) > 0 || l.kind === "card"))
      .map((l) => ({ ...l, month: k })));
}

/* ---------------- card statements ----------------
   A card with a statement day S has one statement a month, named the way periodOf names months
   (months.js): with S up to the 15th by the month its cycle starts in (9 Jun – 8 Jul is the Jun
   statement), later than that by the month it ends in (26 May – 25 Jun is the Jun statement).
   Charges count in the month of their statement (see periods.js), so a card's lines in month M are
   exactly its M statement — monthly items and installment slices included, whatever their day.
   The bill is due `payDays` (default 21) after the statement, in the month that date counts in for
   the bank. With no statement day, a cycle is the plan's month and its bill falls in the next one
   (on `dueDay`, if set). */

/** "Jun statement" — what a cycle is called. */
export const statementName = (M) => MONTH_NAMES[+String(M).slice(5, 7) - 1] + " statement";

/** Cycle M's statement date and pay-by date (either may be null). */
export function cardCycleDates(c, M, d) {
  const S = stmtDay(c);
  if (S) { const statement = dateInMonth(S <= 15 ? nextM(M) : M, S); return { cycle: M, statement, due: addDays(statement, payDays(c)) }; }
  return { cycle: M, statement: null, due: N(c.dueDay) >= 1 ? dueDateIn(d, nextM(M), null, Math.min(31, Math.round(N(c.dueDay)))) : null };
}

/** The statement cycles whose bill falls in month `key` (usually one). */
export function billsIn(d, c, key) {
  if (!stmtDay(c)) return [cardCycleDates(c, prevM(key), d)];
  let M = nextM(key);
  const out = [];
  for (let i = 0; i < 6; i++, M = prevM(M)) { const b = cardCycleDates(c, M, d); if (monthFor(d, null, b.due) === key) out.unshift(b); }
  return out;
}

/**
 * One card's statement cycle: its charges (the card's lines in month M), what was paid onto it, and
 * what it bills (`due`). A card billed to a bank has its bill on that bank's side. A card with no bank
 * keeps the bill on the card itself (`prevDue`): payments in the next cycle settle that first, the rest is paid ahead.
 */
const CM = new WeakMap();
function cardCycle(d, M, cardId, depth = 0) {
  const zero = { charged: 0, paidIn: 0, prevDue: 0, toPrevBill: 0, due: 0 };
  if (!d.months[M]) return zero;
  let m = CM.get(d); if (!m) { m = new Map(); CM.set(d, m); }
  const mk = M + "|" + cardId;
  if (m.has(mk)) return m.get(mk);
  m.set(mk, zero); // guards against re-entry
  const card = (d.cards || []).find((c) => c.id === cardId) || {};
  const ls = linesNoBills(d, M).filter((l) => l.kind === "card" && l.id === cardId);
  const charged = ls.filter((l) => l.flow !== "in").reduce((s, l) => s + val(l), 0);
  const paidIn = ls.filter((l) => l.flow === "in").reduce((s, l) => s + val(l), 0);
  const prevDue = !card.bank && depth < MAX_CHAIN ? cardCycle(d, prevM(M), cardId, depth + 1).due : 0;
  const toPrevBill = Math.min(paidIn, prevDue);
  const r = { charged, paidIn, prevDue, toPrevBill, due: Math.max(0, charged - (paidIn - toPrevBill)) };
  m.set(mk, r);
  return r;
}

/** What a card's statement cycle bills: its charges less anything paid ahead onto it (never below zero). */
export const cardTotal = (d, M, cardId) => cardCycle(d, M, cardId).due;

/**
 * The rest of every installment plan on a card after this month — not charged yet, but the bank
 * holds it against the limit from the start.
 */
function cardInstallmentsAhead(d, key, c) {
  return (d.installments || []).filter((it) => it.via && it.via.kind === "card" && it.via.id === c.id)
    .reduce((s, it) => s + Math.max(0, N(it.total) - instPaid(it, key)), 0);
}

/**
 * What a card owes at the end of a month: carried over, plus the month's charges (the real amount
 * once entered, otherwise the planned one), less payments onto it and bills paid from a bank.
 * So it's never below an unpaid bill: the bill plus what's been charged since.
 */
const CO = new WeakMap();
function cardOwed(d, key, c, depth = 0) {
  if (!d.months[key]) return 0;
  let m = CO.get(d); if (!m) { m = new Map(); CO.set(d, m); }
  const mk = key + "|" + c.id;
  if (m.has(mk)) return m.get(mk);
  m.set(mk, 0);
  const before = depth < MAX_CHAIN ? cardOwed(d, prevM(key), c, depth + 1) : 0;
  const moved = linesNoBills(d, key).filter((l) => l.kind === "card" && l.id === c.id && !l.maybe)
    .reduce((s, l) => s + (l.flow === "in" ? -settled(l) : val(l)), 0);
  const bill = lines(d, key).find((l) => l.key === "b:" + c.id); // paid on the bank's side
  const r = before + moved - (bill ? (bill.done ? val(bill) : bill.portions ? N(bill.paid) : 0) : 0);
  m.set(mk, r);
  return r;
}

/* month results, memoised — openings chain backwards through the months you've opened */
const MC = new WeakMap();
const MAX_CHAIN = 240; // 20 years of history

export function computeMonth(d, key, depth = 0) {
  let m = MC.get(d); if (!m) { m = new Map(); MC.set(d, m); }
  if (m.has(key)) return m.get(key);
  const r = doMonth(d, key, depth);
  m.set(key, r);
  return r;
}

function openingFor(d, key, kind, id, depth) {
  const M = d.months[key] || blankMonth();
  const adj = N((M.adjust || {})[kind + ":" + id]);
  const pk = prevM(key);
  if (d.months[pk] && depth < MAX_CHAIN) {
    const p = computeMonth(d, pk, depth + 1);
    const grp = kind === "bank" ? p.banks : p.wallets;
    const f = grp.find((x) => x.o.id === id);
    return (f ? f.closing : 0) + adj;
  }
  if (kind === "bank") return N((d.banks.find((b) => b.id === id) || {}).opening) + adj;
  return adj;
}

const ORIGIN_ORDER = { salary: 0, move: 1, bill: 2, recurring: 3, installment: 3, part: 3, oneoff: 4, withdrawal: 5 };
/** What has really moved on a line so far: a ticked line in full, or the parts already paid. */
const settled = (l) => (l.done ? val(l) : l.portions ? N(l.actual) : 0);
const isSpend = (l) => l.flow === "out" && !["bill", "withdrawal", "move", "transfer"].includes(l.origin);

function doMonth(d, key, depth) {
  const ls = lines(d, key);
  const build = (kind, o) => {
    let bal = openingFor(d, key, kind, o.id, depth);
    const opening = bal;
    const order = (l) => (kind === "cash" && l.flow === "in" ? -1 : ORIGIN_ORDER[l.origin] ?? 3); // a cash pot is filled before it's spent
    const ref = { kind, id: o.id };
    const when = (l) => l.date || (l.day ? dueDateIn(d, key, ref, l.day) : ""); // its day in this account's month
    const rows = ls.filter((l) => l.kind === kind && l.id === o.id)
      .slice().sort((a, b) => order(a) - order(b) || when(a).localeCompare(when(b)))
      .map((l) => { const a = val(l); bal += l.flow === "in" ? a : -a; return { ...l, amt: a, bal }; });
    // what's really there: only money that has actually come in or gone out (actualBal = running, per row)
    let actual = opening;
    rows.forEach((l) => { if (!l.maybe) actual += l.flow === "in" ? settled(l) : -settled(l); l.actualBal = actual; });
    return { o, opening, rows, closing: bal, actual };
  };

  const banks = (d.banks || []).map((b) => build("bank", b));
  const wallets = (d.wallets || []).map((w) => build("cash", w));
  const cards = (d.cards || []).map((c) => {
    const rows = ls.filter((l) => l.kind === "card" && l.id === c.id);
    const charges = rows.filter((l) => l.flow !== "in");
    const charged = charges.reduce((s, l) => s + val(l), 0);
    const paid = rows.filter((l) => l.flow === "in").reduce((s, l) => s + val(l), 0); // paid ahead this month
    // the bill due this month: on the bank's side, or carried on the card when it has no bank
    const dues = billsIn(d, c, key);
    const last = dues[dues.length - 1];
    const line = ls.find((l) => l.key === "b:" + c.id);
    let bill = null;
    if (line) bill = { amount: val(line), left: line.done ? 0 : N(line.remaining), date: line.date || null, done: !!line.done };
    else if (!c.bank && dues.length) {
      const amount = dues.reduce((s, b) => s + cardTotal(d, b.cycle, c.id), 0);
      const settledBy = dues.reduce((s, b) => s + cardCycle(d, nextM(b.cycle), c.id).toPrevBill, 0);
      if (amount > 0.005) bill = { amount, left: Math.max(0, amount - settledBy), date: last.due, done: amount - settledBy < 0.005 };
    }
    if (bill) Object.assign(bill, { statement: last.statement, cycle: last.cycle });
    // the next statement still building up (not the one due this month)
    const upcoming = cardCycleDates(c, dues.some((b) => b.cycle === key) ? nextM(key) : key, d);
    const cm = cardCycle(d, upcoming.cycle, c.id, depth);
    const owed = Math.max(0, cardOwed(d, key, c, depth)); // what's really owed now
    const instAhead = cardInstallmentsAhead(d, key, c); // installments on the card still to come
    const balance = owed + instAhead;
    return {
      o: c, rows, bill, next: upcoming, owed, instAhead,
      balance, available: N(c.limit) > 0 ? N(c.limit) - balance : null,
      plan: charges.reduce((s, l) => s + N(l.plan), 0),
      actual: charges.reduce((s, l) => s + (l.actual !== null && l.actual !== undefined ? N(l.actual) : 0), 0),
      charged, paid, // paid onto the card this month
      due: cm.due, // what the next statement bills
    };
  });

  const earned = ls.filter((l) => l.origin === "salary").reduce((s, l) => s + val(l), 0);
  const spentDirect = ls.filter((l) => l.kind === "bank" && isSpend(l)).reduce((s, l) => s + val(l), 0);
  const spentCash = ls.filter((l) => l.kind === "cash" && isSpend(l)).reduce((s, l) => s + val(l), 0);
  const spentCard = cards.reduce((s, c) => s + c.charged, 0);
  const planned = ls.filter(isSpend).reduce((s, l) => s + N(l.plan), 0);
  // money back lowers what this month's payments cost (never below nothing); other money in is income
  const paidBack = ls.filter((l) => isSpend(l) && l.back && !l.maybe).reduce((s, l) => s + Math.min(l.back, Math.max(0, val(l))), 0);
  const otherIn = ls.filter((l) => l.outside && !l.refund && l.flow === "in").reduce((s, l) => s + val(l), 0);

  return {
    ls, banks, wallets, cards, earned, otherIn, spentDirect, spentCash, spentCard, planned, paidBack,
    spent: spentDirect + spentCash + spentCard - paidBack, // what this month's spending really cost
    inBank: banks.reduce((s, b) => s + b.closing, 0),
    inCash: wallets.reduce((s, w) => s + w.closing, 0),
    billsNext: cards.reduce((s, c) => s + c.due, 0),
    open: ls.filter((l) => !l.done && !l.locked).length,
    total: ls.filter((l) => !l.locked).length,
    short: banks.filter((b) => b.closing < -0.005),
  };
}
