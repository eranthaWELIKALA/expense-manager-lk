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
import { instFor } from "./installments";
import { versionAt } from "./versions";

export const blankMonth = () => ({ ov: {}, extra: [], adjust: {} });

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
      tag: isDateISO(p.date) ? "paid " + dayMonthLabel(p.date) : null,
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
      push({ key: "b:" + c.id, label: c.name + " bill", kind: "bank", id: c.bank, flow: "out", plan: tot, origin: "bill", tag: mShort(prevM(key)), locked: true });
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
    const tag = (s.of ? s.n + "/" + s.of : "#" + s.n) + (it.day ? " · due " + ordinal(it.day) : "") + (it.auto ? " · auto" : "");
    push({ key: "i:" + it.id, label: it.name, kind: it.via.kind, id: it.via.id, flow: "out", plan: s.amount,
      origin: "installment", tag, locked: true, day: it.day || null,
      autoPaid: !!it.auto && dateInMonth(key, it.day) <= todayISO() }); // auto-debited once the due day passes
  });

  /* one-offs added to this month only */
  (M.extra || []).forEach((e) => {
    const dated = isDateISO(e.date);
    push({ key: "x:" + e.id, label: e.name, kind: e.kind, id: e.id2, flow: e.flow || "out", plan: N(e.amount), origin: "oneoff",
      tag: dated ? dayMonthLabel(e.date) : null, day: dated ? dayOfDate(e.date) : null, date: dated ? e.date : null });
  });

  return out;
}

export function cardTotal(d, key, cardId) {
  if (!d.months[key]) return 0;
  return lines(d, key).filter((l) => l.kind === "card" && l.id === cardId).reduce((s, l) => s + val(l), 0);
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
const isSpend = (l) => l.flow === "out" && l.origin !== "bill" && l.origin !== "withdrawal" && l.origin !== "move";

function doMonth(d, key, depth) {
  const ls = lines(d, key);
  const build = (kind, o) => {
    let bal = openingFor(d, key, kind, o.id, depth);
    const opening = bal;
    const rows = ls.filter((l) => l.kind === kind && l.id === o.id)
      .slice().sort((a, b) => (ORIGIN_ORDER[a.origin] ?? 3) - (ORIGIN_ORDER[b.origin] ?? 3) || (a.day || 0) - (b.day || 0))
      .map((l) => { const a = val(l); bal += l.flow === "in" ? a : -a; return { ...l, amt: a, bal }; });
    return { o, opening, rows, closing: bal };
  };

  const banks = (d.banks || []).map((b) => build("bank", b));
  const wallets = (d.wallets || []).map((w) => build("cash", w));
  const cards = (d.cards || []).map((c) => {
    const rows = ls.filter((l) => l.kind === "card" && l.id === c.id);
    return {
      o: c, rows,
      plan: rows.reduce((s, l) => s + N(l.plan), 0),
      actual: rows.reduce((s, l) => s + (l.actual !== null && l.actual !== undefined ? N(l.actual) : 0), 0),
      due: rows.reduce((s, l) => s + val(l), 0),
    };
  });

  const earned = ls.filter((l) => l.origin === "salary").reduce((s, l) => s + val(l), 0);
  const spentDirect = ls.filter((l) => l.kind === "bank" && isSpend(l)).reduce((s, l) => s + val(l), 0);
  const spentCash = ls.filter((l) => l.kind === "cash" && l.flow === "out").reduce((s, l) => s + val(l), 0);
  const spentCard = cards.reduce((s, c) => s + c.due, 0);
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
