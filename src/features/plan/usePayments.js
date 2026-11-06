import { useCallback } from "react";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useProfile } from "../../contexts/ProfileContext";
import { useToast } from "../../contexts/ToastContext";
import { dayMonthLabel, ensureMonthsThrough, fmt, mLabel, mShort, monthsToOpen, recordPayment, removePayment } from "../../domain";

/**
 * Recording and removing payments on a line, shared by the Month and Budgets pages.
 * `viewMonth` is the month on screen (toasts say when a payment lands in another one).
 * Returns {confirmNewMonths(mk, reason?), pay({monthKey, line, payment}), removePart(line, part, {ask})}.
 */
export function usePayments(viewMonth) {
  const { data: plan, update } = useProfile();
  const toast = useToast();
  const confirm = useConfirm();

  /** Ask before adding months to the plan. Resolves true when there's nothing new or the user agrees. */
  const confirmNewMonths = useCallback(async (k, reason) => {
    const added = monthsToOpen(plan, k);
    if (!added.length) return true;
    const span = added.length === 1 ? mLabel(added[0]) : `${added.length} months (${mLabel(added[0])} – ${mLabel(added[added.length - 1])})`;
    return confirm({
      title: `Start ${mLabel(k)}?`,
      message: `${reason ? reason + " " : ""}This adds ${span} to your plan. Salaries, monthly items and installments are filled in, and balances carry over from the month before. You can undo it from History.`,
      confirmLabel: added.length === 1 ? `Start ${mShort(k)}` : `Add ${added.length} months`,
    });
  }, [plan, confirm]);

  /** A payment towards `line` of `monthKey` (from RecordPaymentModal). Resolves true once it's saved. */
  const pay = useCallback(async ({ monthKey, line, payment }) => {
    if (!(await confirmNewMonths(monthKey, `This payment is in ${mLabel(monthKey)}, which isn't started yet.`))) return false;
    const where = monthKey === viewMonth ? "." : ` in ${mLabel(monthKey)}.`;
    if (line.budget) {
      const spent = (line.paid || 0) + payment.amount;
      update((d) => recordPayment(ensureMonthsThrough(d, monthKey), monthKey, line.key, payment),
        { label: `${line.label} — spent ${fmt(payment.amount)} on ${dayMonthLabel(payment.date)}` + (payment.note ? ` (${payment.note})` : "") });
      toast.success(`${fmt(payment.amount)} added to “${line.label}” — ${fmt(spent)} of ${fmt(line.plan)} spent` + where);
      return true;
    }
    const after = (line.paid || 0) + payment.amount;
    const settled = payment.settle || payment.amount >= line.remaining - 0.005 || after >= Number(line.plan) - 0.005;
    update((d) => recordPayment(ensureMonthsThrough(d, monthKey), monthKey, line.key, payment),
      { label: `${line.label} — ${settled ? "paid" : "part paid"} ${fmt(payment.amount)} on ${dayMonthLabel(payment.date)}` });
    toast.success(`“${line.label}” ${settled ? "paid" : `part paid (${fmt(after)} of ${fmt(line.plan)})`}` + where);
    return true;
  }, [confirmNewMonths, update, toast, viewMonth]);

  /**
   * Remove one recorded payment of `line` (line.month: its month, when it isn't the one on screen).
   * With `ask`, confirm first. Resolves true once it's removed.
   */
  const removePart = useCallback(async (line, part, { ask = false } = {}) => {
    const mk = line.month || viewMonth;
    if (ask) {
      const ok = await confirm({
        danger: true,
        title: `Delete this payment of ${fmt(part.amount)}?`,
        message: `It's taken off “${line.label}” in ${mLabel(mk)}, and balances from then on are recalculated. You can undo it from History.`,
        confirmLabel: "Delete payment",
      });
      if (!ok) return false;
    }
    update((d) => removePayment(d, mk, line.key, part.id), { label: `${line.label} — removed a ${fmt(part.amount)} part` });
    toast.info(`Removed the ${fmt(part.amount)} payment from “${line.label}”.`);
    return true;
  }, [confirm, update, toast, viewMonth]);

  return { confirmNewMonths, pay, removePart };
}
