/* Dated versions of recurring items, so a change can apply "from this month on"
   while earlier months keep the old values.

   item.past = [{until:"YYYY-MM", ...fields}], sorted by `until`. Each entry holds
   the values in force up to and including `until`; the item's own fields apply after the last one. */

import { prevM } from "./months";

/** Fields that can differ from month to month. Name, start date etc. stay global. */
export const VERSIONED = {
  templates: ["amount", "via", "flow", "to", "day"],
  incomes: ["splits", "variable"],
};

/** The values of `item` in force in month `key`. */
export function versionAt(item, key) {
  const p = (item.past || []).find((x) => key <= x.until);
  if (!p) return item;
  const { until: _u, ...fields } = p;
  return { ...item, ...fields };
}

const snapshot = (item, coll) => Object.fromEntries(VERSIONED[coll].map((f) => [f, item[f] === undefined ? null : item[f]]));

/** `item.past` after a change that starts in month `mk`: everything before `mk` keeps its values. */
export function pastBefore(item, coll, mk) {
  const cut = prevM(mk);
  const past = [];
  let lastUntil = null;
  for (const p of item.past || []) {
    if (lastUntil !== null && lastUntil >= cut) break;
    past.push({ ...p, until: p.until < cut ? p.until : cut });
    lastUntil = p.until;
  }
  if (lastUntil === null || lastUntil < cut) past.push({ until: cut, ...snapshot(item, coll) });
  return past;
}

/** Versioned fields that differ between two versions of an item. */
export function versionedChanges(coll, before, after) {
  return (VERSIONED[coll] || []).filter((f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null));
}

/**
 * Can this edit be applied to a single month as overrides?
 * Monthly items: amount and payment method. Salaries: amounts of the same banks.
 */
export function canApplyToOneMonth(coll, before, after) {
  const changed = versionedChanges(coll, before, after);
  if (coll === "templates") return changed.every((f) => f === "amount" || f === "via") && !(after.flow === "move" && changed.includes("via"));
  if (coll === "incomes") {
    if (changed.some((f) => f !== "splits")) return false;
    const a = before.splits || [], b = after.splits || [];
    return a.length === b.length && a.every((s, i) => s.bank === b[i].bank);
  }
  return false;
}
