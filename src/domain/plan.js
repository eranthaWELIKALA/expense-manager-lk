/* Plan (profile data) shape, starter templates, validation and pure mutations.

   @typedef {{kind: "bank"|"cash"|"card", id: string}} Via
   @typedef {{id:string, name:string, note?:string, opening:number}} Bank
   @typedef {{id:string, name:string, active?:boolean, splits:{bank:string, amount:number}[]}} Income
   @typedef {{id:string, name:string, from:string, amount:number}} Wallet
   @typedef {{id:string, name:string, bank:string, note?:string}} Card
   @typedef {{id:string, name:string, amount:number, via:Via, flow:"out"|"in"|"move", to?:string, active?:boolean}} Template
   @typedef {{id:string, name:string, mode:"term"|"open", total:number, months?:number, monthly?:number,
              prepaid?:number, startMonth:string, via:Via}} Installment
   @typedef {{ov:Object<string,{plan?:number, actual?:number|null, done?:boolean, removed?:boolean}>,
              extra:{id:string, name:string, amount:number, kind:string, id2:string, flow?:string}[],
              adjust:Object<string,number>}} MonthState
   @typedef {{v:number, active:string, start:string, banks:Bank[], incomes:Income[], wallets:Wallet[],
              cards:Card[], templates:Template[], installments:Installment[],
              months:Object<string,MonthState>}} Plan
*/

import { uid } from "./ids";
import { blankMonth } from "./ledger";
import { currentMonthKey, isDateISO, isMonthKey, mDiff, nextM } from "./months";

export const PLAN_VERSION = 4;
export const PLAN_COLLECTIONS = ["banks", "incomes", "wallets", "cards", "templates", "installments"];
const MAX_ITEMS_PER_COLLECTION = 500;
const MAX_MONTHS = 600;

/* ---------------- starter templates ---------------- */

/** A minimal plan: one bank and one cash pot, nothing else. */
export function blankPlan(startMonth = currentMonthKey()) {
  const bank = { id: uid("bk"), name: "Main account", note: "", opening: 0 };
  return {
    v: PLAN_VERSION, active: startMonth, start: startMonth,
    banks: [bank], incomes: [],
    wallets: [{ id: uid("w"), name: "Cash", from: bank.id, amount: 0 }],
    cards: [], templates: [], installments: [],
    months: { [startMonth]: blankMonth() },
  };
}

/** A generic example household so new users can see every feature in action. */
export function samplePlan(startMonth = currentMonthKey()) {
  const t = (name, amount, kind, id) => ({ id: uid("t"), name, amount, via: { kind, id }, flow: "out", active: true });
  const bk = { main: uid("bk"), bills: uid("bk"), sav: uid("bk") };
  const w = uid("w");
  const c = { groceries: uid("c"), subs: uid("c") };
  return {
    v: PLAN_VERSION, active: startMonth, start: startMonth,
    banks: [
      { id: bk.main, name: "Main current", note: "Salary account", opening: 0 },
      { id: bk.bills, name: "Bills account", note: "", opening: 0 },
      { id: bk.sav, name: "Savings", note: "Nothing is paid from here", opening: 50000 },
    ],
    incomes: [
      { id: uid("in"), name: "Primary job", active: true, splits: [{ bank: bk.main, amount: 250000 }, { bank: bk.bills, amount: 60000 }] },
      { id: uid("in"), name: "Side income", active: true, splits: [{ bank: bk.main, amount: 40000 }] },
    ],
    wallets: [{ id: w, name: "Daily cash", from: bk.main, amount: 50000 }],
    cards: [
      { id: c.groceries, name: "Everyday card", bank: bk.main, note: "" },
      { id: c.subs, name: "Subscriptions card", bank: bk.main, note: "Statement date 20th" },
    ],
    templates: [
      t("Supermarket", 25000, "card", c.groceries), t("Fuel", 15000, "card", c.groceries),
      t("Streaming", 3500, "card", c.subs), t("Broadband", 5000, "card", c.subs), t("Insurance", 12000, "card", c.subs),
      t("Rent", 80000, "bank", bk.main), t("Utilities", 15000, "bank", bk.bills), t("Mobile", 2500, "bank", bk.bills),
      { id: uid("t"), name: "To savings", amount: 20000, via: { kind: "bank", id: bk.main }, flow: "move", to: bk.sav, active: true },
      t("Vegetables & Fish", 15000, "cash", w), t("Transport", 8000, "cash", w), t("Other", 10000, "cash", w),
    ],
    installments: [
      { id: uid("i"), name: "Laptop", mode: "term", total: 240000, months: 12, startMonth, via: { kind: "card", id: c.groceries } },
      { id: uid("i"), name: "Land", mode: "open", total: 1500000, prepaid: 300000, monthly: 40000, startMonth, via: { kind: "bank", id: bk.main } },
    ],
    months: { [startMonth]: blankMonth() },
  };
}

export const PLAN_TEMPLATES = [
  { id: "blank", label: "Blank", description: "One bank and a cash pot. Add the rest yourself.", build: blankPlan },
  { id: "sample", label: "Example household", description: "Pre-filled with sample salaries, cards and installments.", build: samplePlan },
];

/* ---------------- validation (imports, data from storage) ---------------- */

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Normalise untrusted plan JSON (an import, or a row from storage).
 * Throws an Error with a user-facing message when the shape is unusable.
 * @returns {Plan}
 */
export function normalizePlan(raw) {
  if (!isObj(raw)) throw new Error("This file doesn't look like a money plan.");
  const out = { ...raw, v: PLAN_VERSION };
  for (const c of PLAN_COLLECTIONS) {
    const arr = raw[c] === undefined ? [] : raw[c];
    if (!Array.isArray(arr)) throw new Error(`"${c}" must be a list.`);
    if (arr.length > MAX_ITEMS_PER_COLLECTION) throw new Error(`Too many ${c} (max ${MAX_ITEMS_PER_COLLECTION}).`);
    if (arr.some((x) => !isObj(x) || typeof x.id !== "string" || !x.id)) throw new Error(`Every item in "${c}" needs an id.`);
    out[c] = arr.map((x) => ({ ...x, name: String(x.name ?? "").slice(0, 120) }));
  }
  const months = isObj(raw.months) ? raw.months : {};
  const keys = Object.keys(months).filter(isMonthKey);
  if (keys.length > MAX_MONTHS) throw new Error(`Too many months (max ${MAX_MONTHS}).`);
  out.months = {};
  for (const k of keys) {
    const M = isObj(months[k]) ? months[k] : {};
    out.months[k] = {
      ov: isObj(M.ov) ? M.ov : {},
      extra: Array.isArray(M.extra) ? M.extra.filter(isObj) : [],
      adjust: isObj(M.adjust) ? M.adjust : {},
    };
  }
  const fallback = keys.sort().at(-1) || currentMonthKey();
  out.active = isMonthKey(raw.active) ? raw.active : fallback;
  out.start = isMonthKey(raw.start) ? raw.start : out.active;
  return out;
}

/* ---------------- mutations (all pure: return a new plan) ---------------- */

const monthOf = (d, mk) => d.months[mk] || blankMonth();
const withMonth = (d, mk, M) => ({ ...d, months: { ...d.months, [mk]: M } });

/** Set one field (plan / actual / done / removed) on a derived line for one month. */
export function setOverride(d, mk, lineKey, field, value) {
  const M = monthOf(d, mk);
  return withMonth(d, mk, { ...M, ov: { ...M.ov, [lineKey]: { ...(M.ov[lineKey] || {}), [field]: value } } });
}

/** Remove a line from one month. One-offs are deleted; derived lines are hidden. */
export function removeLine(d, mk, lineKey) {
  const M = monthOf(d, mk);
  if (lineKey.startsWith("x:")) {
    const id = lineKey.slice(2);
    return withMonth(d, mk, { ...M, extra: (M.extra || []).filter((e) => e.id !== id) });
  }
  return setOverride(d, mk, lineKey, "removed", true);
}

/** Add a one-off payment to a single month. */
export function addOneOff(d, mk, { kind, targetId, name, amount, date }) {
  const M = monthOf(d, mk);
  const item = { id: uid("x"), name: String(name).slice(0, 120), amount, kind, id2: targetId, flow: "out" };
  if (isDateISO(date)) item.date = date;
  return withMonth(d, mk, { ...M, extra: [...(M.extra || []), item] });
}

/** Make a month part of the chain (so balances carry into it) and track the latest one opened. */
export function openMonth(d, mk) {
  const months = d.months[mk] ? d.months : { ...d.months, [mk]: blankMonth() };
  const active = !d.active || mDiff(d.active, mk) > 0 ? mk : d.active;
  if (months === d.months && active === d.active) return d;
  return { ...d, active, months };
}

/** Open the month after `mk`, applying opening-balance corrections ("bank:id" → amount). */
export function rollInto(d, mk, adjustments) {
  const clean = {};
  Object.keys(adjustments || {}).forEach((k) => {
    const v = adjustments[k];
    if (typeof v === "number" && isFinite(v) && v !== 0) clean[k] = v;
  });
  const nk = nextM(mk);
  const opened = openMonth(d, nk);
  const nm = monthOf(opened, nk);
  return { ...withMonth(opened, nk, { ...nm, adjust: { ...(nm.adjust || {}), ...clean } }), active: nk };
}

export const addItem = (d, coll, item) => ({ ...d, [coll]: [...d[coll], item] });
export const updateItem = (d, coll, id, patch) => ({ ...d, [coll]: d[coll].map((x) => (x.id === id ? { ...x, ...patch } : x)) });
export const removeItem = (d, coll, id) => ({ ...d, [coll]: d[coll].filter((x) => x.id !== id) });

/** Month keys to show in the month rail: every opened month plus the next one. */
export function monthRail(d, viewing) {
  const ks = Object.keys(d.months).sort();
  const s = new Set(ks);
  if (ks.length) s.add(nextM(ks[ks.length - 1]));
  s.add(viewing); s.add(nextM(viewing));
  return [...s].sort();
}

/** How many other items reference a bank / cash pot / card (to warn before deleting it). */
export function usageOf(d, coll, id) {
  const via = (kind) => (x) => x.via && x.via.kind === kind && x.via.id === id;
  if (coll === "banks") {
    return d.incomes.filter((i) => (i.splits || []).some((s) => s.bank === id)).length
      + d.wallets.filter((w) => w.from === id).length
      + d.cards.filter((c) => c.bank === id).length
      + d.templates.filter((t) => via("bank")(t) || t.to === id).length
      + d.installments.filter(via("bank")).length;
  }
  if (coll === "wallets") return d.templates.filter(via("cash")).length + d.installments.filter(via("cash")).length;
  if (coll === "cards") return d.templates.filter(via("card")).length + d.installments.filter(via("card")).length;
  return 0;
}

/** Human label for a payment method ("Card · Everyday card"). */
export function viaLabel(d, via) {
  if (!via) return "—";
  const list = via.kind === "card" ? d.cards : via.kind === "cash" ? d.wallets : d.banks;
  const name = (list.find((x) => x.id === via.id) || {}).name || "missing";
  return ({ bank: "Bank", cash: "Cash", card: "Card" })[via.kind] + " · " + name;
}

/** The first month this plan covers (balances start there). */
export const firstMonth = (d) => Object.keys(d.months).sort()[0] || d.start || d.active;

/**
 * Make sure `mk` and every month between the last opened month and `mk`
 * exist, so balances carry into it. Doesn't move `active` (the default view).
 */
export function ensureMonthsThrough(d, mk) {
  const keys = Object.keys(d.months).sort();
  const months = { ...d.months };
  let k = keys.length ? keys[keys.length - 1] : mk;
  if (!months[k]) months[k] = blankMonth();
  while (mDiff(k, mk) > 0) { k = nextM(k); if (!months[k]) months[k] = blankMonth(); }
  if (!months[mk]) months[mk] = blankMonth(); // a gap inside the range
  return Object.keys(months).length === keys.length ? d : { ...d, months };
}
