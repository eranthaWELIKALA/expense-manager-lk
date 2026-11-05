import React from "react";
import { Field, FormModal, Select } from "../../components/ui";
import { useForm } from "../../hooks/useForm";
import { addDays, dayMonthLabel, defaultDateIn, entryMonth, firstMonth, fmt, isDateISO, lines, mLabel, monthRange, nextM, numOr } from "../../domain";
import { validateAmount, validateDate } from "../../lib/validation";
import { DateField, MoneyField, maxDate, minDateFor } from "../editors/fields";

/* Modals behind the Month page's Actions menu. */

const EARLY_DAYS = 7; // a salary this close to the next month's start may be that month's, paid early

/**
 * Salaries money received on `date` can be: those of the month it counts in, and in that month's last
 * week the next month's too. Each carries its `month`; `value` tells them apart.
 */
const salariesFor = (plan, date) => {
  if (!isDateISO(date)) return [];
  const mk = entryMonth(plan, null, date);
  const months = addDays(date, EARLY_DAYS) > monthRange(plan, mk).to ? [mk, nextM(mk)] : [mk];
  return months.flatMap((k) => lines(plan, k).filter((l) => l.origin === "salary").map((l) => ({ ...l, month: k, value: k + "|" + l.key })));
};

/**
 * Record what a salary actually paid in a month (for ones that vary, or a one-off difference).
 * onSave({monthKey, line, payment: {actual, date}})
 */
export function IncomeReceivedModal({ plan, monthKey, onSave, onClose }) {
  const minDate = minDateFor(plan);
  const form = useForm(
    { line: "", amount: "", date: defaultDateIn(plan, monthKey) },
    (v) => ({
      line: salariesFor(plan, v.date).some((l) => l.value === v.line) ? "" : "Choose which salary.",
      amount: validateAmount(v.amount, { label: "Amount received" }),
      date: validateDate(v.date, { min: minDate, max: maxDate(), minLabel: mLabel(firstMonth(plan)) + " (when this plan starts)" }),
    }),
  );
  const v = form.values;
  const options = salariesFor(plan, v.date);
  const months = new Set(options.map((l) => l.month)).size;
  const selected = options.find((l) => l.value === v.line);
  const pick = (value) => {
    const l = options.find((x) => x.value === value);
    form.setValues((vals) => ({ ...vals, line: l ? value : "", amount: l ? String(l.actual ?? l.plan) : vals.amount }));
  };
  const save = form.guard((vals) => {
    const line = salariesFor(plan, vals.date).find((l) => l.value === vals.line);
    return onSave({ monthKey: line.month, line, payment: { actual: numOr(vals.amount), date: vals.date } });
  });
  const into = selected ? selected.month : isDateISO(v.date) ? entryMonth(plan, null, v.date) : null;
  return (
    <FormModal title="Record income received"
      description={into ? `Received ${dayMonthLabel(v.date)} · recorded in ${mLabel(into)}. Other months keep their estimate.` : "Pick a date."}
      submitLabel="Record income" onSubmit={save} onClose={onClose}>
      <Field label="Which salary" error={form.errors.line}
        hint={options.length ? undefined : "No salaries that month — add one in Setup, or change the date."}>
        <Select value={v.line} onChange={(e) => pick(e.target.value)} autoFocus>
          <option value="">Choose a salary…</option>
          {options.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}{months > 1 ? " · " + mLabel(l.month) : ""} → {(plan.banks.find((b) => b.id === l.id) || {}).name || "—"} · {l.variable && !l.done ? "≈ " : ""}{fmt(l.actual ?? l.plan)}{l.done ? " · received" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <div className="form-grid">
        <MoneyField form={form} label="Amount received" />
        <DateField form={form} label="Received on" min={minDate} hint={months > 1 ? "Close to the next month's start — pick which month's salary it is." : undefined} />
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
