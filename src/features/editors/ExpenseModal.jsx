import React from "react";
import { Combobox, Field, FormModal, Segmented } from "../../components/ui";
import { useForm } from "../../hooks/useForm";
import {
  dayMonthLabel, dayOfDate, defaultDateIn, firstMonth, fmt, isDateISO, isPayable, lines, mLabel, monthOfDate, numOr, todayISO, uid, viaLabel,
} from "../../domain";
import { validateAmount, validateDate, validateName } from "../../lib/validation";
import { DateField, InstallmentFields, MoneyField, NameField, PaymentMethodField, decodeVia, defaultVia, maxDate, minDateFor } from "./fields";
import { installmentDefaults, installmentFromForm, validateInstallment } from "./itemModals";

/** Payments due in the month of `date` that can be recorded as paid. */
const payableIn = (plan, date) => (isDateISO(date) ? lines(plan, monthOfDate(date)).filter(isPayable) : []);

const dateRule = (plan) => ({ min: minDateFor(firstMonth(plan)), max: maxDate(), minLabel: mLabel(firstMonth(plan)) + " (when this plan starts)" });

/**
 * Record a payment. Search this month's bills, installments and scheduled
 * one-time payments and mark one paid (real amount, method, date) — or type
 * something new to record it as a one-time payment (scheduled if the date is ahead).
 *
 * onSave({type: "pay", monthKey, line, payment: {actual, via, date}})
 *      | ({type: "once", monthKey, item: {name, amount, kind, targetId, date, paid}})
 */
export function RecordPaymentModal({ plan, monthKey, onSave, onClose }) {
  const minDate = minDateFor(firstMonth(plan));
  const form = useForm(
    { text: "", line: "", amount: "", via: defaultVia(plan), date: defaultDateIn(monthKey) },
    (v) => {
      const due = payableIn(plan, v.date);
      const isNew = !v.line;
      return {
        text: validateName(v.text, "What for")
          || (v.line && !due.some((l) => l.key === v.line) ? `Not due in ${isDateISO(v.date) ? mLabel(monthOfDate(v.date)) : "that month"} — pick again or change the date.` : ""),
        amount: validateAmount(v.amount, { positive: isNew, label: "Amount" }),
        via: v.via ? "" : "Choose how it was paid.",
        date: validateDate(v.date, dateRule(plan)),
      };
    },
  );
  const v = form.values;
  const due = payableIn(plan, v.date);
  const selected = due.find((l) => l.key === v.line);
  const ahead = isDateISO(v.date) && v.date > todayISO();
  const mk = isDateISO(v.date) ? monthOfDate(v.date) : monthKey;

  const options = due.map((l) => ({
    value: l.key,
    label: l.label,
    sub: viaLabel(plan, { kind: l.kind, id: l.id }) + (l.tag ? " · " + l.tag : ""),
    meta: (l.done ? "paid · " : "") + fmt(l.actual ?? l.plan),
  }));

  const pick = (o) => {
    const l = due.find((x) => x.key === o.value);
    form.setValues((vals) => ({ ...vals, text: l.label, line: l.key, amount: String(l.actual ?? l.plan), via: l.kind + "|" + l.id }));
  };

  const save = form.guard((vals) => {
    const monthOf = monthOfDate(vals.date);
    if (selected) return onSave({ type: "pay", monthKey: monthOf, line: selected, payment: { actual: numOr(vals.amount), via: decodeVia(vals.via), date: vals.date } });
    const via = decodeVia(vals.via);
    return onSave({
      type: "once", monthKey: monthOf,
      item: { name: vals.text.trim(), amount: numOr(vals.amount), kind: via.kind, targetId: via.id, date: vals.date, paid: vals.date <= todayISO() },
    });
  });

  const description = !isDateISO(v.date) ? "Pick a date."
    : selected ? `Marks “${selected.label}” paid in ${mLabel(mk)}. A different method applies to ${mLabel(mk)} only.`
      : v.text.trim() ? `${ahead ? "Schedules" : "Records"} a new one-time payment in ${mLabel(mk)}.`
        : `Search ${mLabel(mk)}'s bills and installments, or type something new.`;

  return (
    <FormModal title="Record payment" description={description} onSubmit={save} onClose={onClose}
      submitLabel={selected ? "Mark paid" : ahead ? "Schedule payment" : "Record payment"}>
      <Field label="What for" error={form.errors.text}
        hint={selected ? (selected.done ? "Already marked paid — saving updates it." : undefined) : v.text.trim() ? "Not in your plan — it'll be added as a one-time payment." : undefined}>
        <Combobox
          autoFocus
          options={options}
          value={v.line}
          text={v.text}
          placeholder="Search, or type a new payment…"
          emptyText={`Nothing due in ${mLabel(mk)} yet`}
          onTextChange={(t) => form.setValues((vals) => ({ ...vals, text: t, line: "" }))}
          onSelect={pick}
          onCreate={(t) => form.setValues((vals) => ({ ...vals, text: t, line: "" }))}
          createLabel={(t) => `New payment “${t}”`}
        />
      </Field>
      <div className="form-grid">
        <MoneyField form={form} label={selected ? "Amount paid" : "Amount"} />
        <PaymentMethodField plan={plan} form={form} label="Paid with" />
        <DateField form={form} label="Date" min={minDate} hint={ahead ? "In the future — saved as scheduled, not paid." : "Its month is where it's recorded."} />
      </div>
    </FormModal>
  );
}

const TYPES = [
  { value: "monthly", label: "Every month", hint: "Recurring bill" },
  { value: "installment", label: "Installment", hint: "Split over months" },
];

function describeStart(v) {
  if (!isDateISO(v.date)) return "Pick a date.";
  if (v.type === "monthly") return `Every month from ${mLabel(monthOfDate(v.date))}, due on day ${dayOfDate(v.date)}. Earlier months aren't changed.`;
  return `First payment ${dayMonthLabel(v.date)} ${monthOfDate(v.date).slice(0, 4)}, then monthly.`;
}

/**
 * Set up a new expense that repeats: every month, or an installment.
 * onSave({type: "monthly" | "installment", item})
 */
export function NewExpenseModal({ plan, monthKey, onSave, onClose }) {
  const minDate = minDateFor(firstMonth(plan));
  const form = useForm(
    { type: "monthly", amount: "", ...installmentDefaults(plan, monthKey) },
    (v) => (v.type === "installment"
      ? validateInstallment(v, plan)
      : {
        name: validateName(v.name),
        amount: validateAmount(v.amount, { positive: true }),
        via: v.via ? "" : "Choose how it's paid.",
        date: validateDate(v.date, dateRule(plan)),
      }),
  );
  const v = form.values;

  const save = form.guard((vals) => {
    if (vals.type === "installment") return onSave({ type: vals.type, item: installmentFromForm(vals) });
    return onSave({
      type: vals.type,
      item: { id: uid("t"), name: vals.name.trim(), amount: numOr(vals.amount), via: decodeVia(vals.via), flow: "out", active: true, startMonth: monthOfDate(vals.date), day: dayOfDate(vals.date) },
    });
  });

  return (
    <FormModal title="New expense" description={describeStart(v)} submitLabel={v.type === "installment" ? "Add installment" : "Add expense"} onSubmit={save} onClose={onClose}>
      <Segmented label="Expense type" options={TYPES} value={v.type} onChange={(t) => form.set("type", t)} />
      <NameField form={form} label="What for" placeholder={v.type === "installment" ? "e.g. Laptop" : "e.g. Electricity"} />
      <div className="form-grid">
        <PaymentMethodField plan={plan} form={form} label="Pay with" />
        {v.type === "monthly" && <MoneyField form={form} label="Amount each month" />}
        {v.type === "monthly" && <DateField form={form} label="First payment" min={minDate} />}
      </div>
      {v.type === "installment" && <InstallmentFields form={form} minDate={minDate} />}
    </FormModal>
  );
}
