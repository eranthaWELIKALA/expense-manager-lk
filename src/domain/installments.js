import { mDiff } from "./months";
import { N } from "./format";

/**
 * The installment slice due in a given month, or null when not running.
 * "term" splits the total evenly; "open" pays a fixed monthly amount until the total is reached.
 */
export function instFor(inst, key) {
  const i = mDiff(inst.startMonth, key);
  if (!isFinite(i) || i < 0) return null;
  if (inst.mode === "open") {
    const left = N(inst.total) - (N(inst.prepaid) + i * N(inst.monthly));
    if (left <= 0.005) return null;
    return { amount: Math.min(N(inst.monthly), left), n: i + 1, of: 0 };
  }
  if (i >= N(inst.months)) return null;
  return { amount: N(inst.total) / N(inst.months), n: i + 1, of: N(inst.months) };
}

/** Total paid off by the end of the given month. */
export function instPaid(inst, key) {
  const i = Math.max(0, mDiff(inst.startMonth, key) + 1);
  if (inst.mode === "open") return Math.min(N(inst.total), N(inst.prepaid) + i * N(inst.monthly));
  return Math.min(N(inst.total), (N(inst.total) / N(inst.months)) * Math.min(i, N(inst.months)));
}
