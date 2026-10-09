import React from "react";
import { FormModal } from "../../components/ui";
import { useForm } from "../../hooks/useForm";
import { fmt, mLabel, numOr } from "../../domain";
import { validateAmount } from "../../lib/validation";
import { MoneyField, PaymentMethodField, decodeVia } from "../editors/fields";

/** Lines you can settle with a real amount and method: bills, installments, one-offs. */
export const isPayable = (line) => line.flow === "out" && ["recurring", "installment", "oneoff"].includes(line.origin);

/** Lines that ask for the real amount when ticked: payable ones, and salaries that vary. */
export const asksAmount = (line) => isPayable(line) || (line.origin === "salary" && line.variable);

/**
 * Mark one month's payment as paid (or a varying salary as received): the real amount and, for payments, how.
 * Changing the method here only affects this month — other months, and the item itself, keep theirs.
 * onSave({actual, via})
 */
export function PayDialog({ plan, line, monthKey, onSave, onClose }) {
  const form = useForm(
    { amount: String(line.actual ?? line.plan ?? ""), via: line.kind + "|" + line.id },
    (v) => ({ amount: validateAmount(v.amount, { label: "Amount paid" }), via: v.via ? "" : "Choose how it was paid." }),
  );
  const incoming = !isPayable(line);
  const save = form.guard((v) => onSave(incoming ? { actual: numOr(v.amount) } : { actual: numOr(v.amount), via: decodeVia(v.via) }));
  return (
    <FormModal
      title={`Mark “${line.label}” ${incoming ? "received" : "paid"}`}
      description={incoming
        ? `${mLabel(monthKey)} · estimated ${fmt(line.plan)}. Enter what actually came in.`
        : `${mLabel(monthKey)} · planned ${fmt(line.plan)}. A different method here applies to ${mLabel(monthKey)} only.`}
      submitLabel={incoming ? "Mark received" : "Mark paid"}
      onSubmit={save}
      onClose={onClose}
    >
      <div className="form-grid">
        <MoneyField form={form} label={incoming ? "Amount received" : "Amount paid"} />
        {!incoming && <PaymentMethodField plan={plan} form={form} label="Paid with" />}
      </div>
    </FormModal>
  );
}
