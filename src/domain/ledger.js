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

import { prevM, mShort, mDiff, ordinal, dayOfDate, dayMonthLabel, isDateISO, dateInMonth, todayISO, currentMonthKey } from "./months";
import { N, fmt } from "./format";
import { instFor, instType } from "./installments";
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

const LC = new WeakMap();
export function lines(d, key) {
  let m = LC.get(d); if (!m) { m = new Map(); LC.set(d, m); }
  if (m.has(key)) return m.get(key);
  m.set(key, []); // guards against re-entry while computing
  const r = computeLines(d, key);
  m.set(key, r);
  return r;
}

function computeLines(d, key) {
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
      ? (over ? `${fmt(paid - plan, 0)} over budget` : `${fmt(paid, 0)} of ${fmt(plan, 0)} spent`)
      : done ? (pays.length > 1 ? `paid in ${pays.length} parts` : null) : `${fmt(paid, 0)} of ${fmt(plan, 0)} paid`;
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

  /* last month's card totals bill to the card's bank */
  if (d.months[prevM(key)]) {
    (d.cards || []).forEach((c) => {
      const tot = cardTotal(d, prevM(key), c.id);
      if (Math.abs(tot) < 0.005 || !c.bank) return;
      const day = N(c.dueDay) >= 1 ? Math.min(31, Math.round(N(c.dueDay))) : null;
      push({ key: "b:" + c.id, label: c.name + " bill", kind: "bank", id: c.bank, flow: "out", plan: tot, origin: "bill",
        tag: joinTags(mShort(prevM(key)), day ? "due " + ordinal(day) : null), locked: true, day, ...(day ? { date: dateInMonth(key, day) } : {}) });
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

/**
 * One card's month: its charges, what was paid onto it, and what it bills next month (`due`).
 * A card billed to a bank has its last bill on that bank's side. A card with no bank keeps last
 * month's bill on the card itself (`prevDue`): payments onto it settle that first, the rest is paid ahead.
 */
const CM = new WeakMap();
function cardMonth(d, key, cardId, depth = 0) {
  if (!d.months[key]) return { charged: 0, paidIn: 0, prevDue: 0, toPrevBill: 0, due: 0 };
  let m = CM.get(d); if (!m) { m = new Map(); CM.set(d, m); }
  const mk = key + "|" + cardId;
  if (m.has(mk)) return m.get(mk);
  const card = (d.cards || []).find((c) => c.id === cardId) || {};
  const ls = lines(d, key).filter((l) => l.kind === "card" && l.id === cardId);
  const charged = ls.filter((l) => l.flow !== "in").reduce((s, l) => s + val(l), 0);
  const paidIn = ls.filter((l) => l.flow === "in").reduce((s, l) => s + val(l), 0);
  const prevDue = !card.bank && d.months[prevM(key)] && depth < MAX_CHAIN ? cardMonth(d, prevM(key), cardId, depth + 1).due : 0;
  const toPrevBill = Math.min(paidIn, prevDue);
  const r = { charged, paidIn, prevDue, toPrevBill, due: Math.max(0, charged - (paidIn - toPrevBill)) };
  m.set(mk, r);
  return r;
}

/** What a card bills for a month: its charges less anything paid ahead onto it (never below zero). */
export const cardTotal = (d, key, cardId) => cardMonth(d, key, cardId).due;

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
    // owed right now: last month's bill until it's paid, plus this month's charges so far, less anything paid onto the card
    const cm = cardMonth(d, key, c.id, depth);
    const line = ls.find((l) => l.key === "b:" + c.id); // on the bank's side
    const dueDate = N(c.dueDay) >= 1 ? dateInMonth(key, Math.min(31, Math.round(N(c.dueDay)))) : null;
    const bill = line ? { amount: val(line), left: line.done ? 0 : N(line.remaining), date: line.date || null, done: !!line.done }
      : cm.prevDue > 0.005 ? { amount: cm.prevDue, left: cm.prevDue - cm.toPrevBill, date: dueDate, done: cm.prevDue - cm.toPrevBill < 0.005 } : null;
    const billLeft = bill ? bill.left : 0;
    const moved = rows.reduce((s, l) => s + (l.maybe ? 0 : l.flow === "in" ? -settled(l) : settled(l)), 0);
    const balance = Math.max(0, billLeft + moved + cm.toPrevBill); // payments that settled the card's own bill are already off billLeft
    return {
      o: c, rows, bill,
      balance, available: N(c.limit) > 0 ? N(c.limit) - balance : null,
      plan: charges.reduce((s, l) => s + N(l.plan), 0),
      actual: charges.reduce((s, l) => s + (l.actual !== null && l.actual !== undefined ? N(l.actual) : 0), 0),
      charged, paid: paid - cm.toPrevBill, // paid ahead
      due: cm.due, // what it bills next month
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
