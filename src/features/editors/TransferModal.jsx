import React from "react";
import { Field, FormModal, Segmented, Select } from "../../components/ui";
import { useForm } from "../../hooks/useForm";
import { defaultDateIn, firstMonth, fmt, isDateISO, mLabel, mShort, monthOfDate, numOr, computeMonth } from "../../domain";
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
  const parts = [];
  if (owed > 0.005) parts.push(toBill >= owed - 0.005 ? `Settles the ${mShort(mk)} bill (${fmt(owed)}).` : `Pays ${fmt(toBill)} of the ${mShort(mk)} bill — ${fmt(owed - toBill)} still to pay.`);
  else parts.push(bill ? `The ${mShort(mk)} bill is already paid.` : `No bill is due in ${mShort(mk)}.`);
  if (ahead > 0.005) parts.push(`${fmt(ahead)} is paid ahead, so the next bill drops to ${fmt(Math.max(0, (card ? card.due : 0) - ahead))}.`);
  return parts.join(" ");
}

/**
 * Record money moving: cash out of a bank, a deposit, bank to bank, paying a card,
 * or extra cash received. Settled as soon as it's saved.
 * onSave({kind, monthKey, from: {kind,id}|null, to: {kind,id}, amount, date, note})
 */
export function TransferModal({ plan, monthKey, initialKind = "cash", onSave, onClose }) {
  const minDate = minDateFor(firstMonth(plan));
  const form = useForm(
    { kind: initialKind, ...defaults(plan, initialKind), amount: "", date: defaultDateIn(monthKey), note: "" },
    (v) => ({
      from: v.kind === "cashin" ? "" : !v.from ? "Choose where it comes from." : v.from === v.to ? "Pick two different accounts." : "",
      to: v.to ? "" : "Choose where it goes.",
      amount: validateAmount(v.amount, { positive: true }),
      date: validateDate(v.date, { min: minDate, max: maxDate(), minLabel: mLabel(firstMonth(plan)) + " (when this plan starts)" }),
    }),
  );
  const v = form.values;
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
        <MoneyField form={form} label="Amount" />
        <DateField form={form} label="Date" min={minDate} />
      </div>
      {preview && <div className="preview">{preview}</div>}
      <TextField form={form} name="note" label="Note" placeholder={v.kind === "cashin" || v.from === OUTSIDE ? "e.g. Sold the old bike" : "optional"} />
    </FormModal>
  );
}
