/* ============================================================
   Month derivation — organised by bank account.

   Salaries land in banks. Money leaves a bank three ways:
     · direct   — standing order / transfer straight from the bank
     · cash     — withdrawn into a cash wallet, then spent
     · card     — charged now, billed to the bank next month
   Bank and cash balances roll into next month automatically.

   Plan data is treated as immutable: every edit produces a new
   object, so results are memoised per data object via WeakMap.
   ============================================================ */

import { MONTH_NAMES, prevM, nextM, mDiff, ordinal, dayOfDate, dayMonthLabel, isDateISO, dateInMonth, todayISO, currentMonthKey, addDays, monthOfDate } from "./months";
import { N, fmt } from "./format";
import { instFor, instPaid, instType } from "./installments";
import { versionAt } from "./versions";

export const blankMonth = () => ({ ov: {}, extra: [], transfers: [], adjust: {} });

/* Recorded money movements between your own accounts (or in from outside), per month:
   M.transfers = [{id, from: {kind, id} | null (money from outside), to: {kind, id}, amount, date?, note?}]
   Each shows as a line in both accounts and is settled as soon as it's recorded. */

/** Name of a bank / cash pot / card. */
const accountName = (d, ref) => {
  if (!ref) return "outside";
  const list = ref.kind === "card" ? d.cards : ref.kind === "cash" ? d.wallets : d.banks;
  return ((list || []).find((x) => x.id === ref.id) || {}).name || "—";
};

/** How a transfer reads, from each side. */
export function transferLabels(d, t) {
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
const joinTags = (...t) => t.filter(Boolean).join(" · ") || null;

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

function computeLines(d, key, withBills) {
  const M = d.months[key] || blankMonth();
  const out = [];
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

  /* Paid in parts (ov.payments): progress on the line itself; parts paid another way
     come out of that bank / cash pot / card as their own locked lines. */
  const pushParts = (base, o2, pays) => {
    const here = (p) => !p.via || (p.via.kind === base.kind && p.via.id === base.id);
    const plan = N(base.plan);
    const paid = sum(pays), paidHere = sum(pays.filter(here));
    // a budget stays open while its month runs (spend can go over); a bill is paid once the parts reach it
    const done = o2.done !== undefined ? !!o2.done : base.budget ? key < currentMonthKey() : paid >= plan - 0.005;
    const over = base.budget && paid > plan + 0.005;
    const progress = base.budget
      ? (over ? `${fmt(paid - plan)} over budget` : `${fmt(paid)} of ${fmt(plan)} spent`)
      : done ? (pays.length > 1 ? `paid in ${pays.length} parts` : null) : `${fmt(paid)} of ${fmt(plan)} paid`;
    out.push({
      ...base, actual: paidHere, done, paid, over, remaining: done ? 0 : Math.max(0, plan - paid), payments: pays, portions: true,
      eff: done ? paidHere : Math.max(plan - (paid - paidHere), paidHere), // still expected to leave here: the unpaid rest
      tag: joinTags(base.tag, progress),
    });
    pays.filter((p) => !here(p)).forEach((p) => out.push({
      key: "p:" + base.key + ":" + p.id, label: base.label + " (part)", kind: p.via.kind, id: p.via.id, flow: base.flow,
      plan: null, actual: N(p.amount), done: true, origin: "part", locked: true, day: base.day || null,
      tag: joinTags(p.note || null, isDateISO(p.date) ? "paid " + dayMonthLabel(p.date) : null),
    }));
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
      push({ key: "t:" + t.id, label: t.name, kind: t.via.kind, id: t.via.id, flow: t.flow === "in" ? "in" : "out", plan: N(t.amount), origin: "recurring",
        tag: joinTags(budget ? "budget" : null, due), day, ...(budget ? { budget } : {}) });
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
      autoPaid: !!it.auto && dateInMonth(key, it.day) <= todayISO() }); // auto-debited once the due day passes
  });

  /* one-offs added to this month only */
  (M.extra || []).forEach((e) => {
    const dated = isDateISO(e.date);
    push({ key: "x:" + e.id, label: e.name, kind: e.kind, id: e.id2, flow: e.flow || "out", plan: N(e.amount), origin: "oneoff",
      tag: joinTags(e.maybe ? "what-if" : null, dated ? dayMonthLabel(e.date) : null), day: dated ? dayOfDate(e.date) : null, date: dated ? e.date : null,
      ...(e.maybe ? { maybe: true } : {}) });
  });

  /* transfers: out of one account, into another (or in from outside) */
  (M.transfers || []).forEach((t) => {
    if (!t || !t.to || !(N(t.amount) > 0)) return;
    const dated = isDateISO(t.date);
    const at = { plan: N(t.amount), origin: "transfer", locked: true, autoPaid: true, tag: dated ? dayMonthLabel(t.date) : null,
      day: dated ? dayOfDate(t.date) : null, date: dated ? t.date : null };
    const label = transferLabels(d, t);
    if (t.from) push({ key: "tx:" + t.id, label: label.out, kind: t.from.kind, id: t.from.id, flow: "out", ...at });
    push({ key: "ti:" + t.id, label: label.in, kind: t.to.kind, id: t.to.id, flow: "in", ...at });
  });

  return out;
}

/* ---------------- card statements ----------------
   A card's statement cycle is named by the month holding most of its days. With a statement day S,
   the cycle runs from the day after one statement to the next: with S up to the 15th it's named by
   the month it starts in (9 Jun – 8 Jul is the Jun statement), later than that by the month it ends
   in (26 May – 25 Jun is the Jun statement). A month's installment slice goes on that month's
   statement whatever its day. The bill is due `payDays` (default 21) after the statement. With no
   statement day, a cycle is the calendar month and its bill falls next month (on `dueDay`, if set). */

export const PAY_DAYS = 21;
export const stmtDay = (c) => (N(c && c.statementDay) >= 1 ? Math.min(31, Math.round(N(c.statementDay))) : null);
export const payDays = (c) => (N(c && c.payDays) >= 1 ? Math.round(N(c.payDays)) : PAY_DAYS);
/** The month cycle M's statement is issued in: the next one when S is early in the month. */
const stmtMonth = (c, M) => (stmtDay(c) <= 15 ? nextM(M) : M);
/** "Jun statement" — what a cycle is called. */
export const statementName = (M) => MONTH_NAMES[+String(M).slice(5, 7) - 1] + " statement";

/** Cycle M's statement date and pay-by date (either may be null). */
export function cardCycleDates(c, M) {
  const S = stmtDay(c);
  if (S) { const statement = dateInMonth(stmtMonth(c, M), S); return { cycle: M, statement, due: addDays(statement, payDays(c)) }; }
  return { cycle: M, statement: null, due: N(c.dueDay) >= 1 ? dateInMonth(nextM(M), Math.min(31, Math.round(N(c.dueDay)))) : null };
}

/** The statement cycles whose bill falls in month `key` (usually one). */
export function billsIn(d, c, key) {
  if (!stmtDay(c)) return [cardCycleDates(c, prevM(key))];
  let M = nextM(key); // a cycle's bill is never due before the month it's named by
  const out = [];
  for (let i = 0; i < 4; i++, M = prevM(M)) { const b = cardCycleDates(c, M); if (monthOfDate(b.due) === key) out.unshift(b); }
  return out;
}

const dayOfLine = (l) => (isDateISO(l.date) ? dayOfDate(l.date) : l.day || 1); // undated lines count from the 1st

/**
 * One card's statement cycle: its charges, what was paid onto it, and what it bills (`due`).
 * A card billed to a bank has its bill on that bank's side. A card with no bank keeps the bill
 * on the card itself (`prevDue`): payments in the next cycle settle that first, the rest is paid ahead.
 */
const CM = new WeakMap();
function cardCycle(d, M, cardId, depth = 0) {
  const zero = { charged: 0, paidIn: 0, prevDue: 0, toPrevBill: 0, due: 0 };
  const card = (d.cards || []).find((c) => c.id === cardId) || {};
  const S = stmtDay(card);
  const SM = S ? stmtMonth(card, M) : M; // the statement month
  if (!d.months[M] && !(S && (d.months[SM] || d.months[prevM(SM)]))) return zero;
  let m = CM.get(d); if (!m) { m = new Map(); CM.set(d, m); }
  const mk = M + "|" + cardId;
  if (m.has(mk)) return m.get(mk);
  m.set(mk, zero); // guards against re-entry
  const on = (key) => (d.months[key] ? linesNoBills(d, key).filter((l) => l.kind === "card" && l.id === cardId) : []);
  const inst = (l) => l.origin === "installment"; // bound to its month, not its day
  const ls = S
    ? [...on(SM).filter((l) => !inst(l) && dayOfLine(l) <= S), ...on(prevM(SM)).filter((l) => !inst(l) && dayOfLine(l) > S), ...on(M).filter(inst)]
    : on(M);
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
    const rows = ls.filter((l) => l.kind === kind && l.id === o.id)
      .slice().sort((a, b) => order(a) - order(b) || (a.day || 0) - (b.day || 0))
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
    const upcoming = cardCycleDates(c, dues.some((b) => b.cycle === key) ? nextM(key) : key);
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

  return {
    ls, banks, wallets, cards, earned, spentDirect, spentCash, spentCard, planned,
    spent: spentDirect + spentCash + spentCard,
    inBank: banks.reduce((s, b) => s + b.closing, 0),
    inCash: wallets.reduce((s, w) => s + w.closing, 0),
    billsNext: cards.reduce((s, c) => s + c.due, 0),
    open: ls.filter((l) => !l.done && !l.locked).length,
    total: ls.filter((l) => !l.locked).length,
    short: banks.filter((b) => b.closing < -0.005),
  };
}
