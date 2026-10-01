import React from "react";
import { FormModal, Segmented } from "../../components/ui";
import { useForm } from "../../hooks/useForm";
import { mLabel, numOr, uid } from "../../domain";
import { validateAmount, validateName } from "../../lib/validation";
import { InstallmentFields, MoneyField, NameField, PaymentMethodField, decodeVia } from "./fields";
import { installmentDefaults, installmentFromForm, validateInstallment } from "./itemModals";

const TYPES = [
  { value: "once", label: "One-time", hint: "Only this month" },
  { value: "monthly", label: "Every month", hint: "Recurring bill" },
  { value: "installment", label: "Installment", hint: "Split over months" },
];

/**
 * Single entry point for adding spending: pick the type, then how it's paid
 * (direct from a bank, cash, or a card).
 * onSave({type, item}) — type "once" → one-off for `monthKey`,
 * "monthly" → recurring template, "installment" → installment.
 */
export function ExpenseModal({ plan, monthKey, onSave, onClose }) {
  const form = useForm(
    { type: "once", amount: "", ...installmentDefaults(plan, monthKey) },
    (v) => (v.type === "installment"
      ? validateInstallment(v)
      : { name: validateName(v.name), amount: validateAmount(v.amount, { positive: true }), via: v.via ? "" : "Choose how it's paid." }),
  );
  const type = form.values.type;

  const save = form.guard((v) => {
    const name = v.name.trim();
    if (v.type === "installment") return onSave({ type: v.type, item: installmentFromForm(v) });
    const via = decodeVia(v.via);
    if (v.type === "monthly") return onSave({ type: v.type, item: { id: uid("t"), name, amount: numOr(v.amount), via, flow: "out", active: true } });
    return onSave({ type: v.type, item: { name, amount: numOr(v.amount), kind: via.kind, targetId: via.id } });
  });

  return (
    <FormModal
      title="Add expense"
      description={type === "once" ? `Added to ${mLabel(monthKey)} only.` : type === "monthly" ? "Added to every month from now on." : "Spread across months automatically."}
      submitLabel="Add expense"
      onSubmit={save}
      onClose={onClose}
    >
      <Segmented label="Expense type" options={TYPES} value={type} onChange={(t) => form.set("type", t)} />
      <NameField form={form} label="What for" placeholder={type === "installment" ? "e.g. Laptop" : "e.g. Groceries"} />
      <div className="form-grid">
        <PaymentMethodField plan={plan} form={form} label="Pay with" />
        {type !== "installment" && <MoneyField form={form} label={type === "monthly" ? "Amount each month" : "Amount"} />}
      </div>
      {type === "installment" && <InstallmentFields form={form} />}
    </FormModal>
  );
}
