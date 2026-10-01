import React from "react";
import { FormModal, Segmented } from "../../components/ui";
import { useForm } from "../../hooks/useForm";
import { dayMonthLabel, dayOfDate, firstMonth, isDateISO, mLabel, monthOfDate, numOr, todayISO, uid } from "../../domain";
import { validateAmount, validateDate, validateName } from "../../lib/validation";
import { DateField, InstallmentFields, MoneyField, NameField, PaymentMethodField, decodeVia, maxDate, minDateFor } from "./fields";
import { installmentDefaults, installmentFromForm, validateInstallment } from "./itemModals";

const TYPES = [
  { value: "once", label: "One-time", hint: "A single payment" },
  { value: "monthly", label: "Every month", hint: "Recurring bill" },
  { value: "installment", label: "Installment", hint: "Split over months" },
];

function describeWhen(v) {
  if (!isDateISO(v.date)) return "Pick a date.";
  const when = v.date < todayISO() ? "Past payment" : v.date > todayISO() ? "Scheduled payment" : "Today";
  if (v.type === "once") return `${when} · goes into ${mLabel(monthOfDate(v.date))}.`;
  if (v.type === "monthly") return `Every month from ${mLabel(monthOfDate(v.date))}, due on day ${dayOfDate(v.date)}. Earlier months aren't changed.`;
  return `First payment ${dayMonthLabel(v.date)} ${monthOfDate(v.date).slice(0, 4)}, then monthly.`;
}

/**
 * Single entry point for adding spending: pick the type, how it's paid
 * (direct from a bank, cash, or a card) and when — past or future.
 * onSave({type, item, monthKey}) — monthKey is the month a one-time payment lands in.
 */
export function ExpenseModal({ plan, monthKey, onSave, onClose }) {
  const minDate = minDateFor(firstMonth(plan));
  const form = useForm(
    { type: "once", amount: "", ...installmentDefaults(plan, monthKey) },
    (v) => (v.type === "installment"
      ? validateInstallment(v, plan)
      : {
        name: validateName(v.name),
        amount: validateAmount(v.amount, { positive: true }),
        via: v.via ? "" : "Choose how it's paid.",
        date: validateDate(v.date, { min: minDate, max: maxDate(), minLabel: mLabel(firstMonth(plan)) + " (when this plan starts)" }),
      }),
  );
  const v = form.values;

  const save = form.guard((vals) => {
    const name = vals.name.trim();
    if (vals.type === "installment") return onSave({ type: vals.type, item: installmentFromForm(vals) });
    const via = decodeVia(vals.via);
    if (vals.type === "monthly") {
      return onSave({
        type: vals.type,
        item: { id: uid("t"), name, amount: numOr(vals.amount), via, flow: "out", active: true, startMonth: monthOfDate(vals.date), day: dayOfDate(vals.date) },
      });
    }
    return onSave({ type: vals.type, monthKey: monthOfDate(vals.date), item: { name, amount: numOr(vals.amount), kind: via.kind, targetId: via.id, date: vals.date } });
  });

  return (
    <FormModal title="Add expense" description={describeWhen(v)} submitLabel="Add expense" onSubmit={save} onClose={onClose}>
      <Segmented label="Expense type" options={TYPES} value={v.type} onChange={(t) => form.set("type", t)} />
      <NameField form={form} label="What for" placeholder={v.type === "installment" ? "e.g. Laptop" : "e.g. Groceries"} />
      <div className="form-grid">
        <PaymentMethodField plan={plan} form={form} label="Pay with" />
        {v.type !== "installment" && <MoneyField form={form} label={v.type === "monthly" ? "Amount each month" : "Amount"} />}
        {v.type !== "installment" && (
          <DateField form={form} label={v.type === "monthly" ? "First payment" : "Date"} min={minDate}
            hint={v.type === "once" ? "Past or future — it goes into that month." : undefined} />
        )}
      </div>
      {v.type === "installment" && <InstallmentFields form={form} minDate={minDate} />}
    </FormModal>
  );
}
