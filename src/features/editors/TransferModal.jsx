import React, { useEffect } from "react";
import { Field, FormModal, Segmented, Select } from "../../components/ui";
import { useForm } from "../../hooks/useForm";
import { defaultDateIn, firstMonth, fmt, isDateISO, mLabel, mShort, monthOfDate, numOr, computeMonth, statementName } from "../../domain";
import { validateAmount, validateDate } from "../../lib/validation";
import { DateField, MoneyField, TextField, maxDate, minDateFor } from "./fields";

export const TRANSFER_KINDS = [
  { value: "cash", label: "Get cash", hint: "Bank → cash" },
  { value: "deposit", label: "Deposit", hint: "Cash or other money → bank" },
  { value: "bank", label: "Bank to bank", hint: "Between your banks" },
  { value: "card", label: "Pay a card", hint: "Bank → card" },
  { value: "cashin", label: "Cash received", hint: "Extra cash on hand" },
];

const OUTSIDE = "outside";
const ref = (s) => { if (!s || s === OUTSIDE) return null; const [kind, id] = s.split("|"); return { kind, id }; };
const options = (kind, list) => list.map((x) => <option key={x.id} value={kind + "|" + x.id}>{x.name}</option>);

/** Sensible starting accounts for each kind. */
function defaults(plan, kind) {
  const b0 = plan.banks[0], b1 = plan.banks[1] || plan.banks[0], w0 = plan.wallets[0], c0 = plan.cards[0];
  const bank = (b) => (b ? "bank|" + b.id : "");
  switch (kind) {
    case "cash": return { from: bank(b0), to: w0 ? "cash|" + w0.id : "" };
    case "deposit": return { from: w0 ? "cash|" + w0.id : OUTSIDE, to: bank(b0) };
    case "bank": return { from: bank(b0), to: bank(b1 !== b0 ? b1 : null) };
    case "card": return { from: bank(plan.banks.find((b) => b.id === c0?.bank) || b0), to: c0 ? "card|" + c0.id : "" };
    default: return { from: OUTSIDE, to: w0 ? "cash|" + w0.id : "" };
  }
}

/** What's outstanding on a card on a date: what's left of the bill due that month, otherwise what it owes. */
export function cardOutstanding(plan, cardRef, date) {
  const to = typeof cardRef === "string" ? ref(cardRef) : cardRef;
  if (!to || to.kind !== "card" || !isDateISO(date) || !plan.months[monthOfDate(date)]) return 0;
  const card = computeMonth(plan, monthOfDate(date)).cards.find((c) => c.o.id === to.id);
  if (!card) return 0;
  return card.bill && card.bill.left > 0.005 ? card.bill.left : Math.max(0, card.owed || 0);
}

/** What a card payment will do: the bill it settles first, the rest paid ahead. */
function cardPreview(plan, v) {
  const to = ref(v.to), amount = numOr(v.amount);
  if (!to || to.kind !== "card" || !(amount > 0) || !isDateISO(v.date)) return null;
  const mk = monthOfDate(v.date);
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

/**
 * Record money moving: cash out of a bank, a deposit, bank to bank, paying a card,
 * or extra cash received. Settled as soon as it's saved.
 * onSave({kind, monthKey, from: {kind,id}|null, to: {kind,id}, amount, date, note})
 */
export function TransferModal({ plan, monthKey, initialKind = "cash", initialTo, onSave, onClose }) {
  const minDate = minDateFor(firstMonth(plan));
  const start = { ...defaults(plan, initialKind), ...(initialTo ? { to: initialTo } : {}) };
  if (initialKind === "card" && initialTo) { // pay from the card's usual bank, when it has one
    const c = plan.cards.find((x) => "card|" + x.id === initialTo);
    if (c && c.bank) start.from = "bank|" + c.bank;
  }
  const form = useForm(
    { kind: initialKind, ...start, amount: "", autoAmount: true, date: defaultDateIn(monthKey), note: "" },
    (v) => ({
      from: v.kind === "cashin" ? "" : !v.from ? "Choose where it comes from." : v.from === v.to ? "Pick two different accounts." : "",
      to: v.to ? "" : "Choose where it goes.",
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

  const banks = options("bank", plan.banks), wallets = options("cash", plan.wallets), cards = options("card", plan.cards);
  const pick = (name, label, options, { outside = false, hint } = {}) => (
    <Field label={label} error={form.errors[name]} hint={hint}>
      <Select value={v[name] || ""} onChange={form.set(name)}>
        {!v[name] && <option value="">Choose…</option>}
        {options}
        {outside && <option value={OUTSIDE}>Money from outside (gift, sale, refund…)</option>}
      </Select>
    </Field>
  );
  const missing = { cash: !plan.wallets.length && "Add a cash pot in Setup first.", card: !plan.cards.length && "Add a card in Setup first.", cashin: !plan.wallets.length && "Add a cash pot in Setup first." }[v.kind];

  const save = form.guard((vals) => onSave({
    kind: vals.kind, monthKey: monthOfDate(vals.date), from: vals.kind === "cashin" ? null : ref(vals.from), to: ref(vals.to),
    amount: numOr(vals.amount), date: vals.date, note: vals.note.trim(),
  }));
  const preview = v.kind === "card" ? cardPreview(plan, v) : null;

  return (
    <FormModal title="Move money" description="Record money moving between your accounts, or coming in from outside. It's counted straight away."
      submitLabel={v.kind === "card" ? "Pay card" : "Record"} onSubmit={save} onClose={onClose}>
      <Segmented className="wrap" label="What happened" options={TRANSFER_KINDS} value={v.kind} onChange={setKind} />
      {missing && <p className="field-err">{missing}</p>}
      <div className="form-grid">
        {v.kind === "cash" && <>{pick("from", "From bank", banks)}{pick("to", "Into cash", wallets)}</>}
        {v.kind === "deposit" && <>{pick("from", "From", [<optgroup key="c" label="Cash">{wallets}</optgroup>], { outside: true })}{pick("to", "Into bank", banks)}</>}
        {v.kind === "bank" && <>{pick("from", "From bank", banks)}{pick("to", "Into bank", banks)}</>}
        {v.kind === "card" && <>{pick("to", "Card", cards)}{pick("from", "Paid from bank", banks)}</>}
        {v.kind === "cashin" && <>{pick("to", "Into cash", wallets, { hint: "Cash you got from somewhere, or found you had more of." })}</>}
        <MoneyField form={form} label="Amount" onChange={(a) => form.setValues((vals) => (a === vals.amount ? vals : { ...vals, amount: a, autoAmount: false }))}
          hint={v.kind === "card" && owing > 0.005 ? (v.autoAmount ? `Outstanding: ${fmt(owing)}` : <>Outstanding {fmt(owing)} · <button type="button" className="linkish" onClick={() => form.set("autoAmount", true)}>use it</button></>) : undefined} />
        <DateField form={form} label="Date" min={minDate} />
      </div>
      {preview && <div className="preview">{preview}</div>}
      <TextField form={form} name="note" label="Note" placeholder={v.kind === "cashin" || v.from === OUTSIDE ? "e.g. Sold the old bike" : "optional"} />
    </FormModal>
  );
}
