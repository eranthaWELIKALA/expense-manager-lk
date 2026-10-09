import React from "react";
import { Field, FormModal, Select } from "../../components/ui";
import { useForm } from "../../hooks/useForm";
import { dayMonthLabel, defaultDateIn, firstMonth, fmt, isDateISO, lines, mLabel, monthOfDate, numOr } from "../../domain";
import { validateAmount, validateDate } from "../../lib/validation";
import { DateField, MoneyField, maxDate, minDateFor } from "../editors/fields";

/* Modals behind the Month page's Actions menu. */

const salariesIn = (plan, date) => (isDateISO(date) ? lines(plan, monthOfDate(date)).filter((l) => l.origin === "salary") : []);

/**
 * Record what a salary actually paid in a month (for ones that vary, or a one-off difference).
 * onSave({monthKey, line, payment: {actual, date}})
 */
export function IncomeReceivedModal({ plan, monthKey, onSave, onClose }) {
  const minDate = minDateFor(firstMonth(plan));
  const form = useForm(
    { line: "", amount: "", date: defaultDateIn(monthKey) },
    (v) => ({
      line: salariesIn(plan, v.date).some((l) => l.key === v.line) ? "" : "Choose which salary.",
      amount: validateAmount(v.amount, { label: "Amount received" }),
      date: validateDate(v.date, { min: minDate, max: maxDate(), minLabel: mLabel(firstMonth(plan)) + " (when this plan starts)" }),
    }),
  );
  const v = form.values;
  const options = salariesIn(plan, v.date);
  const pick = (key) => {
    const l = options.find((x) => x.key === key);
    form.setValues((vals) => ({ ...vals, line: l ? key : "", amount: l ? String(l.actual ?? l.plan) : vals.amount }));
  };
  const save = form.guard((vals) => onSave({
    monthKey: monthOfDate(vals.date),
    line: options.find((l) => l.key === vals.line),
    payment: { actual: numOr(vals.amount), date: vals.date },
  }));
  return (
    <FormModal title="Record income received"
      description={isDateISO(v.date) ? `Received ${dayMonthLabel(v.date)} · recorded in ${mLabel(monthOfDate(v.date))}. Other months keep their estimate.` : "Pick a date."}
      submitLabel="Record income" onSubmit={save} onClose={onClose}>
      <Field label="Which salary" error={form.errors.line}
        hint={options.length ? undefined : "No salaries that month — add one in Setup, or change the date."}>
        <Select value={v.line} onChange={(e) => pick(e.target.value)} autoFocus>
          <option value="">Choose a salary…</option>
          {options.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label} → {(plan.banks.find((b) => b.id === l.id) || {}).name || "—"} · {l.variable && !l.done ? "≈ " : ""}{fmt(l.actual ?? l.plan)}{l.done ? " · received" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <div className="form-grid">
        <MoneyField form={form} label="Amount received" />
        <DateField form={form} label="Received on" min={minDate} hint="Its month is where it's recorded." />
      </div>
    </FormModal>
  );
}

/**
 * Choose an item to change, then hand it to the editor (which asks which months it applies to).
 * onPick(item)
 */
export function PickItemModal({ title, items, describe, onPick, onClose }) {
  const form = useForm({ id: "" }, (v) => ({ id: v.id ? "" : "Choose one." }));
  const save = form.guard((v) => onPick(items.find((x) => x.id === v.id)));
  return (
    <FormModal title={title} description="Next you'll edit it, then choose which months the change applies to."
      submitLabel="Continue" onSubmit={save} onClose={onClose}>
      <Field label="Item" error={form.errors.id} hint={items.length ? undefined : "Nothing here yet — add one in Setup."}>
        <Select value={form.values.id} onChange={form.set("id")} autoFocus>
          <option value="">Choose…</option>
          {items.map((x) => <option key={x.id} value={x.id}>{x.name}{describe ? " · " + describe(x) : ""}</option>)}
        </Select>
      </Field>
    </FormModal>
  );
}
