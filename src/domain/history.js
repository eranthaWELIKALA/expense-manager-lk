/* Change log with undo, stored in the plan itself (`plan.log`, newest first).

   Each entry records the previous value of every part of the plan the change
   touched: top-level keys ("templates", "banks", …) and single months
   ("months.2026-10"). Entries form a linear history, so undoing an entry
   also undoes every change made after it.

   @typedef {{id:string, at:string, by?:string, label:string, group?:string,
              prev:Object<string,{v?:any}>, undid?:string}} LogEntry
   prev[key] is {v: old value}, or {} when the key didn't exist before. */

import { uid } from "./ids";

export const LOG_MAX = 60;
const MERGE_MS = 2 * 60 * 1000; // typing into one field within this window is one entry
const MONTH = "months.";

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const old = (obj, k) => (Object.prototype.hasOwnProperty.call(obj, k) ? { v: obj[k] } : {});

/** What `before` held for every key that differs in `after`. */
export function diffPrev(before, after) {
  const prev = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (k === "log" || k === "months") continue;
    if (!same(before[k], after[k])) prev[k] = old(before, k);
  }
  const bm = before.months || {}, am = after.months || {};
  if (bm !== am) {
    for (const mk of new Set([...Object.keys(bm), ...Object.keys(am)])) {
      if (!same(bm[mk], am[mk])) prev[MONTH + mk] = old(bm, mk);
    }
  }
  return prev;
}

/**
 * Record the change from `before` to `after` in after.log.
 * meta: {label, by?, group?, undid?} — consecutive changes with the same `group` merge.
 */
export function withLog(before, after, meta, now = new Date()) {
  if (!meta || !meta.label || after === before) return after;
  const prev = diffPrev(before, after);
  if (Object.keys(prev).length === 0) return after;
  const log = Array.isArray(before.log) ? before.log : [];
  const last = log[0];
  const at = now.toISOString();
  if (meta.group && last && last.group === meta.group && last.by === meta.by && now - Date.parse(last.at) < MERGE_MS) {
    const merged = { ...last, at, label: meta.label, prev: { ...prev, ...last.prev } }; // keep the oldest values
    return { ...after, log: [merged, ...log.slice(1)] };
  }
  const entry = { id: uid("h"), at, label: String(meta.label).slice(0, 200), prev };
  if (meta.by) entry.by = meta.by;
  if (meta.group) entry.group = meta.group;
  if (meta.undid) entry.undid = meta.undid;
  return { ...after, log: [entry, ...log].slice(0, LOG_MAX) };
}

/** The plan as it was just before log entry `index` (0 = newest) — undoes it and everything after. */
export function revertTo(d, index) {
  const log = Array.isArray(d.log) ? d.log : [];
  const out = { ...d };
  const months = { ...d.months };
  for (let j = 0; j <= index && j < log.length; j++) {
    for (const [k, p] of Object.entries(log[j].prev || {})) {
      const has = Object.prototype.hasOwnProperty.call(p, "v");
      if (k.startsWith(MONTH)) {
        const mk = k.slice(MONTH.length);
        if (has) months[mk] = p.v; else delete months[mk];
      } else if (has) out[k] = p.v;
      else delete out[k];
    }
  }
  out.months = months;
  return out;
}

/** Keep only well-formed entries (from storage or an import). */
export const normalizeLog = (raw) => (Array.isArray(raw) ? raw : [])
  .filter((e) => e && typeof e === "object" && typeof e.id === "string" && typeof e.label === "string" && e.prev && typeof e.prev === "object")
  .slice(0, LOG_MAX);
