import React from "react";
import { FormModal, Segmented } from "../../components/ui";
import { useForm } from "../../hooks/useForm";
import { Field, Select } from "../../components/ui";
import { dayMonthLabel, dayOfDate, firstMonth, fmt, isDateISO, isPayable, lines, mLabel, monthOfDate, numOr, todayISO, uid } from "../../domain";
import { validateAmount, validateDate, validateName } from "../../lib/validation";
import { DateField, InstallmentFields, MoneyField, NameField, PaymentMethodField, decodeVia, maxDate, minDateFor } from "./fields";
import { installmentDefaults, installmentFromForm, validateInstallment } from "./itemModals";

const TYPES = [
  { value: "once", label: "One-time", hint: "A single payment" },
  { value: "monthly", label: "Every month", hint: "Recurring bill" },
  { value: "installment", label: "Installment", hint: "Split over months" },
  { value: "pay", label: "Record payment", hint: "Pay a bill you've set up" },
];

/** Payments due in the month of `date` that can be recorded as paid. */
const payableIn = (plan, date) => (isDateISO(date) ? lines(plan, monthOfDate(date)).filter(isPayable) : []);

function describeWhen(v) {
  if (!isDateISO(v.date)) return "Pick a date.";
  if (v.type === "pay") return `Paid on ${dayMonthLabel(v.date)} · recorded in ${mLabel(monthOfDate(v.date))}. A different method applies to that month only.`;
  const when = v.date < todayISO() ? "Past payment" : v.date > todayISO() ? "Scheduled payment" : "Today";
  if (v.type === "once") return `${when} · goes into ${mLabel(monthOfDate(v.date))}.`;
  if (v.type === "monthly") return `Every month from ${mLabel(monthOfDate(v.date))}, due on day ${dayOfDate(v.date)}. Earlier months aren't changed.`;
  return `First payment ${dayMonthLabel(v.date)} ${monthOfDate(v.date).slice(0, 4)}, then monthly.`;
}

/**
 * Single entry point for adding spending: pick the type, how it's paid
 * (direct from a bank, cash, or a card) and when — past or future.
 * Or record that an existing bill / installment was paid: the real amount, method and date.
 * onSave({type, item, monthKey}) — monthKey is the month a one-time payment lands in.
 * For "pay": onSave({type, monthKey, line, payment: {actual, via, date}}).
 */
export function ExpenseModal({ plan, monthKey, initialType = "once", onSave, onClose }) {
  const minDate = minDateFor(firstMonth(plan));
  const form = useForm(
    { type: initialType, amount: "", line: "", ...installmentDefaults(plan, monthKey) },
    (v) => (v.type === "installment"
      ? validateInstallment(v, plan)
      : v.type === "pay" ? {
        line: payableIn(plan, v.date).some((l) => l.key === v.line) ? "" : "Choose which payment.",
        amount: validateAmount(v.amount, { label: "Amount paid" }),
        via: v.via ? "" : "Choose how it was paid.",
        date: validateDate(v.date, { min: minDate, max: maxDate(), minLabel: mLabel(firstMonth(plan)) + " (when this plan starts)" }),
      } : {
        name: validateName(v.name),
        amount: validateAmount(v.amount, { positive: true }),
        via: v.via ? "" : "Choose how it's paid.",
        date: validateDate(v.date, { min: minDate, max: maxDate(), minLabel: mLabel(firstMonth(plan)) + " (when this plan starts)" }),
      }),
  );
  const v = form.values;
  const payLines = v.type === "pay" ? payableIn(plan, v.date) : [];
  const pickLine = (key) => {
    const l = payLines.find((x) => x.key === key);
    form.setValues((vals) => (l ? { ...vals, line: key, amount: String(l.actual ?? l.plan), via: l.kind + "|" + l.id } : { ...vals, line: "" }));
  };

  const save = form.guard((vals) => {
    if (vals.type === "pay") {
      const line = payLines.find((l) => l.key === vals.line);
      return onSave({ type: "pay", monthKey: monthOfDate(vals.date), line, payment: { actual: numOr(vals.amount), via: decodeVia(vals.via), date: vals.date } });
    }
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
    <FormModal title="Add expense" description={describeWhen(v)} submitLabel={v.type === "pay" ? "Record payment" : "Add expense"} onSubmit={save} onClose={onClose}>
      <Segmented label="Expense type" options={TYPES} value={v.type} onChange={(t) => form.set("type", t)} />
      {v.type === "pay" ? (
        <>
          <Field label="Which payment" error={form.errors.line}
            hint={payLines.length ? undefined : `Nothing to pay in ${isDateISO(v.date) ? mLabel(monthOfDate(v.date)) : "that month"} — change the date.`}>
            <Select value={v.line} onChange={(e) => pickLine(e.target.value)} autoFocus>
              <option value="">Choose a bill or installment…</option>
              {payLines.map((l) => (
                <option key={l.key} value={l.key}>{l.label} · {fmt(l.actual ?? l.plan)}{l.done ? " · paid" : ""}</option>
              ))}
            </Select>
          </Field>
          <div className="form-grid">
            <MoneyField form={form} label="Amount paid" />
            <PaymentMethodField plan={plan} form={form} label="Paid with" />
            <DateField form={form} label="Paid on" min={minDate} hint="Its month is where the payment is recorded." />
          </div>
        </>
      ) : <NameField form={form} label="What for" placeholder={v.type === "installment" ? "e.g. Laptop" : "e.g. Groceries"} />}
      {v.type !== "pay" && (
        <div className="form-grid">
          <PaymentMethodField plan={plan} form={form} label="Pay with" />
          {v.type !== "installment" && <MoneyField form={form} label={v.type === "monthly" ? "Amount each month" : "Amount"} />}
          {v.type !== "installment" && (
            <DateField form={form} label={v.type === "monthly" ? "First payment" : "Date"} min={minDate}
              hint={v.type === "once" ? "Past or future — it goes into that month." : undefined} />
          )}
        </div>
      )}
      {v.type === "installment" && <InstallmentFields form={form} minDate={minDate} />}
    </FormModal>
  );
}
