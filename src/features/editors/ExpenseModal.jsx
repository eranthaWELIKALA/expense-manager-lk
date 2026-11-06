import React from "react";
import { Combobox, Field, FormModal, RemoveButton, Segmented } from "../../components/ui";
import { useForm } from "../../hooks/useForm";
import {
  dayMonthLabel, dayOfDate, defaultDateIn, entryMonth, firstMonth, fmt, instType, isDateISO, isPayable, lineMonth, lineRef, lines, mLabel, monthFor, monthOfDate, monthRange,
  nextM, numOr, prevM, statementName, stmtDay, todayISO, uid, viaLabel,
} from "../../domain";
import { validateAmount, validateDate, validateName } from "../../lib/validation";
import {
  AlsoPaidWithField, DateField, InstallmentFields, MoneyField, NameField, PaidHowField, PaymentMethodField, TextField,
  countsIn, decodeAlso, decodeVia, defaultVia, encodeVia, maxDate, minDateFor,
} from "./fields";
import { INST_PLACEHOLDER, installmentDefaults, installmentFromForm, validateInstallment } from "./itemModals";

/**
 * Payments that can be recorded as paid on `date`: each account's lines in the month that date counts
 * in for it (a card's statement month, the plan's month for the rest). Each carries its `month`.
 */
const payableOn = (plan, date) => {
  if (!isDateISO(date)) return [];
  const mk = monthOfDate(date), seen = new Set();
  return [prevM(mk), mk, nextM(mk)]
    .flatMap((k) => lines(plan, k).filter((l) => isPayable(l) && lineMonth(plan, l, date) === k).map((l) => ({ ...l, month: k })))
    .filter((l) => !seen.has(l.key) && seen.add(l.key));
};

/** For a payment on a card with statements: the statement its date puts it on. */
const onStatement = (plan, via, date) => {
  const card = via.kind === "card" && isDateISO(date) && plan.cards.find((c) => c.id === via.id);
  return stmtDay(card) ? `Goes on the card's ${statementName(monthFor(plan, via, date))}.` : undefined;
};

const dateRule = (plan) => ({ min: minDateFor(plan), max: maxDate(), minLabel: mLabel(firstMonth(plan)) + " (when this plan starts)" });

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
 * A payment is recorded in the month its date counts in for the account it's paid from.
 *
 * onSave({type: "pay", monthKey, line, payment: {amount, via, date, settle, note?}})
 *      | ({type: "once", monthKey, item: {name, amount, kind, targetId, date, paid}})
 * onRemovePart(line, part)? — remove an already-recorded part (line.month: its month, when not `monthKey`).
 */
export function RecordPaymentModal({ plan, monthKey, fixedLine, onSave, onRemovePart, onClose }) {
  const minDate = minDateFor(plan);
  // what's left of a bill, or the whole amount again; a budget's payments vary, so start empty
  const rest = (l) => (l.budget ? "" : String(l.remaining > 0.005 ? l.remaining : l.actual ?? l.plan));
  const form = useForm(
    fixedLine
      ? { text: fixedLine.label, line: fixedLine.key, amount: rest(fixedLine), via: fixedLine.kind + "|" + fixedLine.id, date: defaultDateIn(plan, monthKey, lineRef(fixedLine)), settle: "", note: "" }
      : { text: "", line: "", amount: "", via: defaultVia(plan), date: defaultDateIn(plan, monthKey), settle: "", note: "" },
    (v) => {
      const due = payableOn(plan, v.date);
      const span = fixedLine && monthRange(plan, monthKey, lineRef(fixedLine));
      return {
        text: validateName(v.text, "What for")
          || (v.line && !due.some((l) => l.key === v.line) ? `Not due in ${isDateISO(v.date) ? mLabel(entryMonth(plan, decodeVia(v.via), v.date)) : "that month"} — pick again or change the date.` : ""),
        amount: validateAmount(v.amount, { positive: true, label: "Amount" }),
        via: v.via ? "" : "Choose how it was paid.",
        date: validateDate(v.date, dateRule(plan))
          || (fixedLine && isDateISO(v.date) && lineMonth(plan, fixedLine, v.date) !== monthKey
            ? `Pick a date in ${mLabel(monthKey)} (${dayMonthLabel(span.from)} – ${dayMonthLabel(span.to)}).` : ""),
      };
    },
  );
  const v = form.values;
  const due = payableOn(plan, v.date);
  const selected = due.find((l) => l.key === v.line);
  const ahead = isDateISO(v.date) && v.date > todayISO();
  const mk = selected ? selected.month : isDateISO(v.date) ? entryMonth(plan, decodeVia(v.via), v.date) : monthKey;
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
    if (selected) return onSave({ type: "pay", monthKey: selected.month, line: selected, payment: { amount: numOr(vals.amount), via: decodeVia(vals.via), date: vals.date, settle: !!settles, ...(budget && vals.note.trim() ? { note: vals.note.trim() } : {}) } });
    const via = decodeVia(vals.via);
    return onSave({
      type: "once", monthKey: entryMonth(plan, via, vals.date),
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
        <PaymentMethodField plan={plan} form={form} label="Paid with"
          preferred={budget && selected.also ? [encodeVia(selected), ...selected.also.map(encodeVia)] : undefined} preferredLabel={budget ? `For ${selected.label}` : undefined} />
        <DateField form={form} label="Date" min={minDate}
          hint={selected ? onStatement(plan, decodeVia(v.via), v.date) : [ahead && "In the future — saved as scheduled, not paid.", countsIn(plan, decodeVia(v.via), v.date)].filter(Boolean).join(" ")} />
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
  { value: "installment", label: "Installment / loan", hint: "Paid off monthly" },
  { value: "maybe", label: "What if…", hint: "See if it fits a month" },
];

function describeStart(plan, v) {
  if (!isDateISO(v.date)) return "Pick a date.";
  const via = decodeVia(v.via);
  if (v.type === "maybe") return `Counted in ${mLabel(entryMonth(plan, via, v.date))}'s balances as a what-if, so you can see whether it fits. Keep it or drop it afterwards.`;
  if (v.type === "monthly" && v.budget === "budget") return `A budget every month from ${mLabel(monthFor(plan, via, v.date))}. Earlier months aren't changed.`;
  if (v.type === "monthly") return `Every month from ${mLabel(monthFor(plan, via, v.date))}, due on day ${dayOfDate(v.date)}. Earlier months aren't changed.`;
  return `First payment ${dayMonthLabel(v.date)} ${monthOfDate(v.date).slice(0, 4)}, then monthly.`;
}

/**
 * Set up a new expense that repeats (every month, or an installment), or try a
 * one-time what-if in a month to see whether it fits. `budgetOnly`: just a new budget.
 * onSave({type: "monthly" | "installment", item})
 *      | ({type: "maybe", monthKey, item: {name, amount, kind, targetId, date}})
 */
export function NewExpenseModal({ plan, monthKey, initialType = "monthly", budgetOnly = false, onSave, onClose }) {
  const minDate = minDateFor(plan);
  const form = useForm(
    { type: budgetOnly ? "monthly" : initialType, amount: "", budget: budgetOnly ? "budget" : "one", also: [], ...installmentDefaults(plan, monthKey) },
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
    if (vals.type === "installment") return onSave({ type: vals.type, item: installmentFromForm(plan, vals) });
    if (vals.type === "maybe") {
      const via = decodeVia(vals.via);
      return onSave({ type: "maybe", monthKey: entryMonth(plan, via, vals.date), item: { name: vals.name.trim(), amount: numOr(vals.amount), kind: via.kind, targetId: via.id, date: vals.date } });
    }
    return onSave({
      type: vals.type,
      item: {
        id: uid("t"), name: vals.name.trim(), amount: numOr(vals.amount), via: decodeVia(vals.via), flow: "out", active: true,
        startMonth: monthFor(plan, decodeVia(vals.via), vals.date), day: dayOfDate(vals.date),
        ...(vals.budget === "budget" ? { budget: true, ...(decodeAlso(vals.also, vals.via).length ? { also: decodeAlso(vals.also, vals.via) } : {}) } : {}),
      },
    });
  });

  return (
    <FormModal title={budgetOnly ? "New budget" : "New expense"} description={describeStart(plan, v)} onSubmit={save} onClose={onClose}
      submitLabel={budgetOnly ? "Add budget" : v.type === "installment" ? "Add " + instType(v.itype).noun : v.type === "maybe" ? "Try it" : "Add expense"}>
      {!budgetOnly && <Segmented label="Expense type" options={TYPES} value={v.type} onChange={(t) => form.set("type", t)} />}
      <NameField form={form} label="What for" placeholder={v.type === "installment" ? INST_PLACEHOLDER[instType(v.itype).value] : v.type === "maybe" ? "e.g. New phone" : v.budget === "budget" ? "e.g. Cricket" : "e.g. Electricity"} />
      <div className="form-grid">
        <PaymentMethodField plan={plan} form={form} label={budgetOnly ? "Mainly paid with" : "Pay with"} />
        {v.type === "monthly" && <MoneyField form={form} label={v.budget === "budget" ? "Budget each month" : "Amount each month"} />}
        {v.type === "monthly" && <DateField form={form} label={v.budget === "budget" ? "Starts" : "First payment"} min={minDate} />}
        {v.type === "maybe" && <MoneyField form={form} label="Amount" />}
        {v.type === "maybe" && <DateField form={form} label="When" min={minDate} hint={countsIn(plan, decodeVia(v.via), v.date)} />}
        {v.type === "monthly" && !budgetOnly && <PaidHowField form={form} />}
      </div>
      {v.type === "monthly" && v.budget === "budget" && <AlsoPaidWithField plan={plan} form={form} primary={v.via} />}
      {v.type === "installment" && <InstallmentFields form={form} plan={plan} />}
    </FormModal>
  );
}
