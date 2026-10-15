import React from "react";
import { Combobox, Field, FormModal, RemoveButton, Segmented } from "../../components/ui";
import { useForm } from "../../hooks/useForm";
import {
  dayMonthLabel, dayOfDate, defaultDateIn, firstMonth, fmt, isDateISO, isPayable, lines, mLabel, monthOfDate, numOr, todayISO, uid, viaLabel,
} from "../../domain";
import { validateAmount, validateDate, validateName } from "../../lib/validation";
import { DateField, InstallmentFields, MoneyField, NameField, PaidHowField, PaymentMethodField, TextField, decodeVia, defaultVia, maxDate, minDateFor } from "./fields";
import { installmentDefaults, installmentFromForm, validateInstallment } from "./itemModals";

/** Payments due in the month of `date` that can be recorded as paid. */
const payableIn = (plan, date) => (isDateISO(date) ? lines(plan, monthOfDate(date)).filter(isPayable) : []);

const dateRule = (plan) => ({ min: minDateFor(firstMonth(plan)), max: maxDate(), minLabel: mLabel(firstMonth(plan)) + " (when this plan starts)" });

/** Already-paid parts of a line, each removable. */
function PartsSoFar({ plan, line, onRemove }) {
  if (!line.payments || !line.payments.length) return null;
  return (
    <div className="parts">
      <div className="parts-h">
        <span>{line.budget ? "Spent so far" : "Paid so far"}</span>
        <b className="n">{fmt(line.paid)} <span className="mut">of {fmt(line.plan)}{line.over ? " · " + fmt(line.paid - line.plan) + " over" : ""}</span></b>
      </div>
      <div className={"bar" + (line.over ? " over" : "")}><i style={{ width: Math.min(100, (line.paid / (Number(line.plan) || 1)) * 100) + "%" }} /></div>
      {line.payments.map((p) => (
        <div className="part" key={p.id}>
          <span>{isDateISO(p.date) ? dayMonthLabel(p.date) : "—"}</span>
          <span className="mut">{p.note ? <>{p.note} · </> : null}{viaLabel(plan, p.via || { kind: line.kind, id: line.id })}</span>
          <b className="n">{fmt(p.amount)}</b>
          {onRemove && <RemoveButton label={`Remove the ${fmt(p.amount)} part`} onClick={() => onRemove(line, p)} />}
        </div>
      ))}
    </div>
  );
}

/**
 * Record a payment. Search this month's bills, installments and scheduled
 * one-time payments and pay one — in full or one part of it (real amount,
 * method, date) — or type something new to record it as a one-time payment
 * (scheduled if the date is ahead).
 * `fixedLine` skips the search (ticking a line on the Month page).
 *
 * onSave({type: "pay", monthKey, line, payment: {amount, via, date, settle, note?}})
 *      | ({type: "once", monthKey, item: {name, amount, kind, targetId, date, paid}})
 * onRemovePart(line, part)? — remove an already-recorded part.
 */
export function RecordPaymentModal({ plan, monthKey, fixedLine, onSave, onRemovePart, onClose }) {
  const minDate = minDateFor(firstMonth(plan));
  // what's left of a bill, or the whole amount again; a budget's payments vary, so start empty
  const rest = (l) => (l.budget ? "" : String(l.remaining > 0.005 ? l.remaining : l.actual ?? l.plan));
  const form = useForm(
    fixedLine
      ? { text: fixedLine.label, line: fixedLine.key, amount: rest(fixedLine), via: fixedLine.kind + "|" + fixedLine.id, date: defaultDateIn(monthKey), settle: "", note: "" }
      : { text: "", line: "", amount: "", via: defaultVia(plan), date: defaultDateIn(monthKey), settle: "", note: "" },
    (v) => {
      const due = payableIn(plan, v.date);
      return {
        text: validateName(v.text, "What for")
          || (v.line && !due.some((l) => l.key === v.line) ? `Not due in ${isDateISO(v.date) ? mLabel(monthOfDate(v.date)) : "that month"} — pick again or change the date.` : ""),
        amount: validateAmount(v.amount, { positive: true, label: "Amount" }),
        via: v.via ? "" : "Choose how it was paid.",
        date: validateDate(v.date, dateRule(plan)) || (fixedLine && isDateISO(v.date) && monthOfDate(v.date) !== monthKey ? `Pick a date in ${mLabel(monthKey)}.` : ""),
      };
    },
  );
  const v = form.values;
  const due = payableIn(plan, v.date);
  const selected = due.find((l) => l.key === v.line);
  const ahead = isDateISO(v.date) && v.date > todayISO();
  const mk = isDateISO(v.date) ? monthOfDate(v.date) : monthKey;
  const amount = numOr(v.amount);
  const left = selected ? (selected.remaining > 0.005 ? selected.remaining : Number(selected.actual ?? selected.plan) || 0) : 0;
  const budget = !!(selected && selected.budget);
  const spent = selected ? selected.paid || 0 : 0;
  const settles = selected && (v.settle === "" ? !budget && amount >= left - 0.005 : v.settle === "yes"); // a budget closes only when you say so

  const options = due.map((l) => ({
    value: l.key,
    label: l.label,
    sub: viaLabel(plan, { kind: l.kind, id: l.id }) + (l.tag ? " · " + l.tag : ""),
    meta: l.budget
      ? (l.over ? fmt(l.paid - l.plan) + " over" : fmt(Math.max(0, l.plan - (l.paid || 0))) + " left")
      : l.done ? "paid · " + fmt(l.paid || l.actual || l.plan) : l.paid > 0 ? fmt(l.remaining) + " left" : fmt(l.plan),
  }));

  const pick = (o) => {
    const l = due.find((x) => x.key === o.value);
    form.setValues((vals) => ({ ...vals, text: l.label, line: l.key, amount: rest(l), via: l.kind + "|" + l.id, settle: "" }));
  };

  const save = form.guard((vals) => {
    const monthOf = monthOfDate(vals.date);
    if (selected) return onSave({ type: "pay", monthKey: monthOf, line: selected, payment: { amount: numOr(vals.amount), via: decodeVia(vals.via), date: vals.date, settle: !!settles, ...(budget && vals.note.trim() ? { note: vals.note.trim() } : {}) } });
    const via = decodeVia(vals.via);
    return onSave({
      type: "once", monthKey: monthOf,
      item: { name: vals.text.trim(), amount: numOr(vals.amount), kind: via.kind, targetId: via.id, date: vals.date, paid: vals.date <= todayISO() },
    });
  });

  const description = !isDateISO(v.date) ? "Pick a date."
    : budget ? `Adds a payment to “${selected.label}” — ${fmt(spent + amount)} of the ${fmt(selected.plan)} budget spent in ${mLabel(mk)}`
      + (spent + amount > Number(selected.plan) + 0.005 ? ` (${fmt(spent + amount - selected.plan)} over).` : ".")
    : selected ? (settles
      ? `Marks “${selected.label}” paid in ${mLabel(mk)}.`
      : `Records part of “${selected.label}” — ${fmt(Math.max(0, left - amount))} will still be left to pay in ${mLabel(mk)}.`)
      : v.text.trim() ? `${ahead ? "Schedules" : "Records"} a new one-time payment in ${mLabel(mk)}.`
        : `Search ${mLabel(mk)}'s bills and installments, or type something new.`;

  return (
    <FormModal title={fixedLine ? `Pay “${fixedLine.label}”` : "Record payment"} description={description} onSubmit={save} onClose={onClose}
      submitLabel={budget ? "Add payment" : selected ? (settles ? "Mark paid" : "Record part payment") : ahead ? "Schedule payment" : "Record payment"}>
      {!fixedLine && (
        <Field label="What for" error={form.errors.text}
          hint={selected ? undefined : v.text.trim() ? "Not in your plan — it'll be added as a one-time payment." : undefined}>
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
      )}
      {selected && <PartsSoFar plan={plan} line={selected} onRemove={onRemovePart} />}
      <div className="form-grid">
        <MoneyField form={form} label={budget
          ? (selected.over ? `Amount paid · ${fmt(selected.paid - selected.plan)} over budget` : `Amount paid · ${fmt(Math.max(0, selected.plan - spent))} left in budget`)
          : selected ? (selected.paid > 0 && !selected.done ? `Amount paid now · ${fmt(left)} left` : "Amount paid") : "Amount"} />
        <PaymentMethodField plan={plan} form={form} label="Paid with" />
        <DateField form={form} label="Date" min={minDate} hint={ahead && !selected ? "In the future — saved as scheduled, not paid." : "Its month is where it's recorded."} />
      </div>
      {budget && <TextField form={form} name="note" label="Note" placeholder="optional — e.g. Keells, new bat" />}
      {selected && (
        <label className="check">
          <input type="checkbox" checked={!!settles} onChange={(e) => form.set("settle", e.target.checked ? "yes" : "no")} />
          {budget ? (
            <span>
              <b>That's all for {mLabel(mk)}</b>
              <small>{settles
                ? (spent + amount < Number(selected.plan) - 0.005 ? `Closes the budget — the unspent ${fmt(selected.plan - spent - amount)} is no longer set aside.` : "Closes the budget for this month.")
                : "Leave unticked while you're still spending — the rest of the budget stays set aside."}</small>
            </span>
          ) : (
            <span>
              <b>This settles it</b>
              <small>{settles
                ? (amount < left - 0.005 ? `Marked paid even though ${fmt(left - amount)} less than ${selected.paid > 0 ? "what was left" : "planned"}.` : "Nothing more to pay this month.")
                : "Leave unticked to pay the rest later — it stays open with what's left."}</small>
            </span>
          )}
        </label>
      )}
    </FormModal>
  );
}

const TYPES = [
  { value: "monthly", label: "Every month", hint: "Recurring bill" },
  { value: "installment", label: "Installment", hint: "Split over months" },
  { value: "maybe", label: "What if…", hint: "See if it fits a month" },
];

function describeStart(v) {
  if (!isDateISO(v.date)) return "Pick a date.";
  if (v.type === "maybe") return `Counted in ${mLabel(monthOfDate(v.date))}'s balances as a what-if, so you can see whether it fits. Keep it or drop it afterwards.`;
  if (v.type === "monthly" && v.budget === "budget") return `A budget every month from ${mLabel(monthOfDate(v.date))}. Earlier months aren't changed.`;
  if (v.type === "monthly") return `Every month from ${mLabel(monthOfDate(v.date))}, due on day ${dayOfDate(v.date)}. Earlier months aren't changed.`;
  return `First payment ${dayMonthLabel(v.date)} ${monthOfDate(v.date).slice(0, 4)}, then monthly.`;
}

/**
 * Set up a new expense that repeats (every month, or an installment), or try a
 * one-time what-if in a month to see whether it fits.
 * onSave({type: "monthly" | "installment", item})
 *      | ({type: "maybe", monthKey, item: {name, amount, kind, targetId, date}})
 */
export function NewExpenseModal({ plan, monthKey, initialType = "monthly", onSave, onClose }) {
  const minDate = minDateFor(firstMonth(plan));
  const form = useForm(
    { type: initialType, amount: "", budget: "one", ...installmentDefaults(plan, monthKey) },
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
    if (vals.type === "maybe") {
      const via = decodeVia(vals.via);
      return onSave({ type: "maybe", monthKey: monthOfDate(vals.date), item: { name: vals.name.trim(), amount: numOr(vals.amount), kind: via.kind, targetId: via.id, date: vals.date } });
    }
    return onSave({
      type: vals.type,
      item: {
        id: uid("t"), name: vals.name.trim(), amount: numOr(vals.amount), via: decodeVia(vals.via), flow: "out", active: true,
        startMonth: monthOfDate(vals.date), day: dayOfDate(vals.date), ...(vals.budget === "budget" ? { budget: true } : {}),
      },
    });
  });

  return (
    <FormModal title="New expense" description={describeStart(v)} onSubmit={save} onClose={onClose}
      submitLabel={v.type === "installment" ? "Add installment" : v.type === "maybe" ? "Try it" : "Add expense"}>
      <Segmented label="Expense type" options={TYPES} value={v.type} onChange={(t) => form.set("type", t)} />
      <NameField form={form} label="What for" placeholder={v.type === "installment" ? "e.g. Laptop" : v.type === "maybe" ? "e.g. New phone" : v.budget === "budget" ? "e.g. Cricket" : "e.g. Electricity"} />
      <div className="form-grid">
        <PaymentMethodField plan={plan} form={form} label="Pay with" />
        {v.type === "monthly" && <MoneyField form={form} label={v.budget === "budget" ? "Budget each month" : "Amount each month"} />}
        {v.type === "monthly" && <DateField form={form} label={v.budget === "budget" ? "Starts" : "First payment"} min={minDate} />}
        {v.type === "maybe" && <MoneyField form={form} label="Amount" />}
        {v.type === "maybe" && <DateField form={form} label="When" min={minDate} />}
        {v.type === "monthly" && <PaidHowField form={form} />}
      </div>
      {v.type === "installment" && <InstallmentFields form={form} planStart={firstMonth(plan)} />}
    </FormModal>
  );
}
