import React, { useEffect } from "react";
import { Combobox, Field, FormModal, Segmented, Select } from "../../components/ui";
import { useForm } from "../../hooks/useForm";
import {
  defaultDateIn, entryMonth, firstMonth, fmt, isDateISO, mLabel, mShort, monthOfDate, numOr, computeMonth, paidSpending, statementName, val, viaLabel,
} from "../../domain";
import { validateAmount, validateDate } from "../../lib/validation";
import { DateField, MoneyField, TextField, countsIn, maxDate, minDateFor } from "./fields";

export const TRANSFER_KINDS = [
  { value: "cash", label: "Get cash", hint: "Bank → cash" },
  { value: "deposit", label: "Deposit", hint: "Cash → bank" },
  { value: "bank", label: "Bank to bank", hint: "Between your banks" },
  { value: "card", label: "Pay a card", hint: "Bank → card" },
  { value: "in", label: "Money in", hint: "Gift, sale, side income" },
  { value: "back", label: "Money back", hint: "Refund, claim, payback" },
];
const FROM_OUTSIDE = new Set(["in", "back"]);

const OUTSIDE = "outside";
const ref = (s) => { if (!s || s === OUTSIDE) return null; const [kind, id] = s.split("|"); return { kind, id }; };
const options = (kind, list) => list.map((x) => <option key={x.id} value={kind + "|" + x.id}>{x.name}</option>);

/** Sensible starting accounts for each kind. */
function defaults(plan, kind) {
  const b0 = plan.banks[0], b1 = plan.banks[1] || plan.banks[0], w0 = plan.wallets[0], c0 = plan.cards[0];
  const bank = (b) => (b ? "bank|" + b.id : "");
  switch (kind) {
    case "cash": return { from: bank(b0), to: w0 ? "cash|" + w0.id : "" };
    case "deposit": return { from: w0 ? "cash|" + w0.id : "", to: bank(b0) };
    case "bank": return { from: bank(b0), to: bank(b1 !== b0 ? b1 : null) };
    case "card": return { from: bank(plan.banks.find((b) => b.id === c0?.bank) || b0), to: c0 ? "card|" + c0.id : "" };
    default: return { from: OUTSIDE, to: bank(b0) || (w0 ? "cash|" + w0.id : "") }; // money in / money back
  }
}

/** The month a card payment on `date` is recorded in: it's paid from a bank, so the plan's months. */
const paymentMonth = (plan, date) => (isDateISO(date) ? entryMonth(plan, null, date) : null);

/** What's outstanding on a card on a date: what's left of the bill due that month, otherwise what it owes. */
export function cardOutstanding(plan, cardRef, date) {
  const to = typeof cardRef === "string" ? ref(cardRef) : cardRef;
  const mk = paymentMonth(plan, date);
  if (!to || to.kind !== "card" || !mk || !plan.months[mk]) return 0;
  const card = computeMonth(plan, mk).cards.find((c) => c.o.id === to.id);
  if (!card) return 0;
  return card.bill && card.bill.left > 0.005 ? card.bill.left : Math.max(0, card.owed || 0);
}

/** What a card payment will do: the bill it settles first, the rest paid ahead. */
function cardPreview(plan, v) {
  const to = ref(v.to), amount = numOr(v.amount);
  if (!to || to.kind !== "card" || !(amount > 0) || !isDateISO(v.date)) return null;
  const mk = paymentMonth(plan, v.date);
  if (!plan.months[mk]) return `It's in ${mLabel(mk)}, which isn't started yet — it starts when you save.`;
  const card = computeMonth(plan, mk).cards.find((c) => c.o.id === to.id);
  const bill = card && card.bill; // on the bank's side, or carried on the card when it has no bank
  const owed = bill ? bill.left : 0;
  const toBill = Math.min(amount, owed), ahead = amount - toBill;
  const name = bill && bill.cycle ? statementName(bill.cycle) : mShort(mk) + " bill"; // the statement the payment goes to
  const parts = [];
  if (owed > 0.005) parts.push(toBill >= owed - 0.005 ? `Settles the ${name} (${fmt(owed)}).` : `Pays ${fmt(toBill)} of the ${name} — ${fmt(owed - toBill)} still to pay.`);
  else parts.push(bill ? `The ${name} is already paid.` : `No bill is due in ${mShort(mk)}.`);
  if (ahead > 0.005) parts.push(`${fmt(ahead)} is paid ahead, so the next bill drops to ${fmt(Math.max(0, (card ? card.due : 0) - ahead))}.`);
  return parts.join(" ");
}

/** Payments that money back can be for, around the month being viewed and the date. Option value: "<month>|<line key>". */
function backOptions(plan, monthKey, date) {
  const upTo = isDateISO(date) && monthOfDate(date) > monthKey ? monthOfDate(date) : monthKey;
  return paidSpending(plan, upTo).map((l) => ({
    value: l.month + "|" + l.key, line: l, label: l.label,
    sub: mLabel(l.month) + " · " + viaLabel(plan, { kind: l.kind, id: l.id }) + (l.back ? " · " + fmt(l.back) + " already back" : ""),
    meta: fmt(val(l)),
  }));
}

/** What the money back does to the payment's cost. */
function backPreview(picked, amount) {
  if (!picked || !(amount > 0)) return null;
  const { line } = picked, cost = val(line), before = Math.max(0, cost - (line.back || 0));
  return `“${line.label}” (${mLabel(line.month)}) then costs you ${fmt(Math.max(0, before - amount))} instead of ${fmt(before)}.`
    + (amount > before + 0.005 ? " That's more than it cost — only what it cost is taken off." : "");
}

const DESCRIPTION = {
  in: "Money that isn't a salary — a gift, a sale, side income. It counts as other income.",
  back: "Money back for something you paid — a refund, an insurance claim, someone paying you back. It lowers what that payment cost.",
};

/**
 * Record money moving: cash out of a bank, a deposit, bank to bank, paying a card, money in from
 * outside, or money back for a payment. Settled as soon as it's saved, in the month its date counts in
 * for the account the money leaves (or, from outside, the one it goes into).
 * onSave({kind, monthKey, from: {kind,id}|null, to: {kind,id}, amount, date, note})
 *  — kind "back" adds {forMonth, line}: the payment it's money back for.
 */
export function TransferModal({ plan, monthKey, initialKind = "cash", initialTo, onSave, onClose }) {
  const minDate = minDateFor(plan);
  const start = { ...defaults(plan, initialKind), ...(initialTo ? { to: initialTo } : {}) };
  if (initialKind === "card" && initialTo) { // pay from the card's usual bank, when it has one
    const c = plan.cards.find((x) => "card|" + x.id === initialTo);
    if (c && c.bank) start.from = "bank|" + c.bank;
  }
  const form = useForm(
    { kind: initialKind, ...start, amount: "", autoAmount: true, date: defaultDateIn(plan, monthKey), note: "", forLine: "", forText: "" },
    (v) => ({
      from: FROM_OUTSIDE.has(v.kind) ? "" : !v.from ? "Choose where it comes from." : v.from === v.to ? "Pick two different accounts." : "",
      to: v.to ? "" : "Choose where it goes.",
      forLine: v.kind === "back" && !backOptions(plan, monthKey, v.date).some((o) => o.value === v.forLine) ? "Choose the payment it's money back for." : "",
      amount: validateAmount(v.amount, { positive: true }),
      date: validateDate(v.date, { min: minDate, max: maxDate(), minLabel: mLabel(firstMonth(plan)) + " (when this plan starts)" }),
    }),
  );
  const v = form.values;

  // paying a card: fill in what's outstanding, until you type your own amount
  const owing = v.kind === "card" ? cardOutstanding(plan, v.to, v.date) : 0;
  useEffect(() => {
    if (v.kind !== "card" || !v.autoAmount) return;
    const next = owing > 0.005 ? owing.toFixed(2) : "";
    if (next !== v.amount) form.setValues((vals) => ({ ...vals, amount: next }));
  }, [v.kind, v.autoAmount, owing]); // eslint-disable-line react-hooks/exhaustive-deps
  const setKind = (k) => { form.set("kind", k); const d = defaults(plan, k); form.set("from", d.from); form.set("to", d.to); };

  // money back: what it's for, and back into the account that paid it
  const forOptions = v.kind === "back" ? backOptions(plan, monthKey, v.date) : [];
  const picked = forOptions.find((o) => o.value === v.forLine);
  const pickFor = (o) => form.setValues((vals) => ({ ...vals, forLine: o.value, forText: o.label, to: o.line.kind + "|" + o.line.id }));

  const banks = options("bank", plan.banks), wallets = options("cash", plan.wallets), cards = options("card", plan.cards);
  const pick = (name, label, options, { hint } = {}) => (
    <Field label={label} error={form.errors[name]} hint={hint}>
      <Select value={v[name] || ""} onChange={form.set(name)}>
        {!v[name] && <option value="">Choose…</option>}
        {options}
      </Select>
    </Field>
  );
  const group = (label, opts) => (opts.length ? [<optgroup key={label} label={label}>{opts}</optgroup>] : []);
  const missing = { cash: !plan.wallets.length && "Add a cash pot in Setup first.", deposit: !plan.wallets.length && "Add a cash pot in Setup first.", card: !plan.cards.length && "Add a card in Setup first." }[v.kind];

  const save = form.guard((vals) => {
    const from = FROM_OUTSIDE.has(vals.kind) ? null : ref(vals.from), to = ref(vals.to);
    const base = { kind: vals.kind, monthKey: entryMonth(plan, from || to, vals.date), from, to, amount: numOr(vals.amount), date: vals.date, note: vals.note.trim() };
    if (vals.kind !== "back") return onSave(base);
    const { line } = backOptions(plan, monthKey, vals.date).find((o) => o.value === vals.forLine);
    return onSave({ ...base, forMonth: line.month, line });
  });
  const preview = v.kind === "card" ? cardPreview(plan, v) : v.kind === "back" ? backPreview(picked, numOr(v.amount)) : null;

  return (
    <FormModal title="Move money" description={DESCRIPTION[v.kind] || "Record money moving between your accounts, or coming in from outside. It's counted straight away."}
      submitLabel={v.kind === "card" ? "Pay card" : "Record"} onSubmit={save} onClose={onClose}>
      <Segmented className="wrap" label="What happened" options={TRANSFER_KINDS} value={v.kind} onChange={setKind} />
      {missing && <p className="field-err">{missing}</p>}
      {v.kind === "back" && (
        <Field label="Money back for" error={form.errors.forLine}
          hint={picked ? `Cost ${fmt(val(picked.line))}` + (picked.line.back ? ` · ${fmt(picked.line.back)} already paid back` : "") : undefined}>
          <Combobox
            autoFocus
            options={forOptions}
            value={v.forLine}
            text={v.forText}
            placeholder="Search what it pays back…"
            emptyText="Nothing paid in the last 12 months"
            onTextChange={(t) => form.setValues((vals) => ({ ...vals, forText: t, forLine: "" }))}
            onSelect={pickFor}
          />
        </Field>
      )}
      <div className="form-grid">
        {v.kind === "cash" && <>{pick("from", "From bank", banks)}{pick("to", "Into cash", wallets)}</>}
        {v.kind === "deposit" && <>{pick("from", "From cash", wallets)}{pick("to", "Into bank", banks)}</>}
        {v.kind === "bank" && <>{pick("from", "From bank", banks)}{pick("to", "Into bank", banks)}</>}
        {v.kind === "card" && <>{pick("to", "Card", cards)}{pick("from", "Paid from bank", banks)}</>}
        {v.kind === "in" && pick("to", "Into", [...group("Banks", banks), ...group("Cash", wallets)])}
        {v.kind === "back" && pick("to", "Back into", [...group("Banks", banks), ...group("Cash", wallets), ...group("Cards", cards)],
          { hint: ref(v.to)?.kind === "card" ? "A refund onto the card lowers its statement." : undefined })}
        <MoneyField form={form} label="Amount" onChange={(a) => form.setValues((vals) => (a === vals.amount ? vals : { ...vals, amount: a, autoAmount: false }))}
          hint={v.kind === "card" && owing > 0.005 ? (v.autoAmount ? `Outstanding: ${fmt(owing)}` : <>Outstanding {fmt(owing)} · <button type="button" className="linkish" onClick={() => form.set("autoAmount", true)}>use it</button></>) : undefined} />
        <DateField form={form} label="Date" min={minDate} hint={countsIn(plan, ref(v.from) || ref(v.to), v.date)} />
      </div>
      {preview && <div className="preview">{preview}</div>}
      <TextField form={form} name="note" label="Note"
        placeholder={v.kind === "back" ? "e.g. Insurance claim, Kasun paid back" : v.kind === "in" ? "e.g. Sold the old bike" : "optional"} />
    </FormModal>
  );
}
