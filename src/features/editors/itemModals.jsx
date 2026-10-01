import React from "react";
import { Button, Field, FormModal, RemoveButton, Select } from "../../components/ui";
import { useForm } from "../../hooks/useForm";
import { N, fmt, numOr, uid } from "../../domain";
import { validateAmount, validateMonth, validateName } from "../../lib/validation";
import {
  BankField, InstallmentFields, MoneyField, NameField, PaymentMethodField, TextField,
  decodeVia, defaultVia, encodeVia,
} from "./fields";

/* Add / edit dialogs for every plan collection.
   Each takes {plan, item?, onSave(item), onClose, onDelete?}; `item` absent = create. */

const str = (v) => (v === undefined || v === null ? "" : String(v));
const titleFor = (item, noun) => (item ? "Edit " + noun : "Add " + noun);

/* ---------------- bank ---------------- */
export function BankModal({ plan: _plan, item, onSave, onClose, onDelete }) {
  const form = useForm(
    { name: str(item?.name), note: str(item?.note), opening: str(item?.opening ?? 0) },
    (v) => ({ name: validateName(v.name), opening: validateAmount(v.opening, { label: "Balance", required: false }) }),
  );
  const save = form.guard((v) => onSave({ ...(item || { id: uid("bk") }), name: v.name.trim(), note: v.note.trim(), opening: numOr(v.opening) }));
  return (
    <FormModal title={titleFor(item, "bank account")} description="Every rupee lives in a bank or a cash pot." submitLabel={item ? "Save" : "Add bank"}
      onSubmit={save} onClose={onClose} onDelete={onDelete}>
      <NameField form={form} placeholder="e.g. Commercial Bank" />
      <TextField form={form} name="note" label="Note" placeholder="optional" />
      <MoneyField form={form} name="opening" label="Balance at start" hint="Only used for your very first month; later months carry over automatically." />
    </FormModal>
  );
}

/* ---------------- cash pot ---------------- */
export function WalletModal({ plan, item, onSave, onClose, onDelete }) {
  const form = useForm(
    { name: str(item?.name), from: item?.from || plan.banks[0]?.id || "", amount: str(item?.amount ?? "") },
    (v) => ({ name: validateName(v.name), from: v.from ? "" : "Choose a bank.", amount: validateAmount(v.amount) }),
  );
  const save = form.guard((v) => onSave({ ...(item || { id: uid("w") }), name: v.name.trim(), from: v.from, amount: numOr(v.amount) }));
  return (
    <FormModal title={titleFor(item, "cash pot")} description="Money you withdraw and spend by hand. Leftover cash carries into next month."
      submitLabel={item ? "Save" : "Add cash pot"} onSubmit={save} onClose={onClose} onDelete={onDelete}>
      <NameField form={form} placeholder="e.g. Daily cash" />
      <div className="form-grid">
        <BankField plan={plan} form={form} name="from" label="Withdrawn from" />
        <MoneyField form={form} label="Withdraw each month" />
      </div>
    </FormModal>
  );
}

/* ---------------- card ---------------- */
export function CardModal({ plan, item, onSave, onClose, onDelete }) {
  const form = useForm(
    { name: str(item?.name), bank: item ? item.bank || "" : plan.banks[0]?.id || "", note: str(item?.note) },
    (v) => ({ name: validateName(v.name) }),
  );
  const save = form.guard((v) => onSave({ ...(item || { id: uid("c") }), name: v.name.trim(), bank: v.bank, note: v.note.trim() }));
  return (
    <FormModal title={titleFor(item, "card")} description="Charges build up all month; the total debits the bank you choose, next month."
      submitLabel={item ? "Save" : "Add card"} onSubmit={save} onClose={onClose} onDelete={onDelete}>
      <NameField form={form} placeholder="e.g. HNB Visa" />
      <BankField plan={plan} form={form} name="bank" label="Bill paid from" allowNone noneLabel="Not billed to a bank" />
      <TextField form={form} name="note" label="Note" placeholder="e.g. statement date 20th" />
    </FormModal>
  );
}

/* ---------------- salary (split across banks) ---------------- */
export function IncomeModal({ plan, item, onSave, onClose, onDelete }) {
  const initialSplits = (item?.splits?.length ? item.splits : [{ bank: plan.banks[0]?.id || "", amount: "" }]).map((s) => ({ bank: s.bank || "", amount: str(s.amount) }));
  const form = useForm(
    { name: str(item?.name), splits: initialSplits },
    (v) => ({
      name: validateName(v.name),
      splits: v.splits.length === 0 ? "Add at least one bank." : v.splits.some((s) => !s.bank || validateAmount(s.amount)) ? "Each portion needs a bank and an amount." : "",
    }),
  );
  const splits = form.values.splits;
  const setSplit = (ix, patch) => form.set("splits", splits.map((s, i) => (i === ix ? { ...s, ...patch } : s)));
  const total = splits.reduce((s, x) => s + numOr(x.amount), 0);
  const save = form.guard((v) => onSave({
    ...(item || { id: uid("in"), active: true }), name: v.name.trim(),
    splits: v.splits.map((s) => ({ bank: s.bank, amount: numOr(s.amount) })),
  }));
  return (
    <FormModal title={titleFor(item, "salary")} description="A salary can land in several banks. Add a portion for each."
      submitLabel={item ? "Save" : "Add salary"} onSubmit={save} onClose={onClose} onDelete={onDelete}>
      <NameField form={form} placeholder="e.g. Main job" />
      {splits.map((sp, ix) => (
        <div className="split-row" key={ix}>
          <Field label={ix === 0 ? "Paid into" : undefined}>
            <Select value={sp.bank} onChange={(e) => setSplit(ix, { bank: e.target.value })} aria-label={"Portion " + (ix + 1) + " bank"}>
              {!sp.bank && <option value="">Choose a bank…</option>}
              {plan.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label={ix === 0 ? "Amount" : undefined}>
            <input className="input n" inputMode="decimal" value={sp.amount} placeholder="0" aria-label={"Portion " + (ix + 1) + " amount"}
              onChange={(e) => setSplit(ix, { amount: e.target.value })} />
          </Field>
          <RemoveButton label="Remove portion" onClick={() => form.set("splits", splits.filter((_, i) => i !== ix))} />
        </div>
      ))}
      {form.errors.splits && <p className="field-err">{form.errors.splits}</p>}
      <div className="sptot">
        <Button size="sm" variant="ghost" onClick={() => form.set("splits", [...splits, { bank: plan.banks[0]?.id || "", amount: "" }])}>+ Add a portion</Button>
        <span>Total <b className="n">{fmt(total)}</b></span>
      </div>
    </FormModal>
  );
}

/* ---------------- recurring item (every month) ---------------- */
export function RecurringModal({ plan, item, onSave, onClose, onDelete }) {
  const form = useForm(
    { name: str(item?.name), amount: str(item?.amount ?? ""), flow: item?.flow || "out", via: item ? encodeVia(item.via) : defaultVia(plan), to: item?.to || "" },
    (v) => ({
      name: validateName(v.name), amount: validateAmount(v.amount), via: v.via ? "" : "Choose how it's paid.",
      to: v.flow === "move" && !v.to ? "Choose the bank it moves into." : v.flow === "move" && v.via === "bank|" + v.to ? "Pick a different bank." : "",
    }),
  );
  const save = form.guard((v) => {
    const next = { ...(item || { id: uid("t"), active: true }), name: v.name.trim(), amount: numOr(v.amount), via: decodeVia(v.via), flow: v.flow };
    if (v.flow === "move") next.to = v.to; else delete next.to;
    return onSave(next);
  });
  return (
    <FormModal title={titleFor(item, "monthly item")} description="Repeats every month. Change it here and every future month follows."
      submitLabel={item ? "Save" : "Add item"} onSubmit={save} onClose={onClose} onDelete={onDelete}>
      <NameField form={form} placeholder="e.g. Electricity" />
      <div className="form-grid">
        <Field label="Kind">
          <Select value={form.values.flow} onChange={form.set("flow")}>
            <option value="out">Spend</option>
            <option value="in">Receive</option>
            <option value="move">Move between my banks</option>
          </Select>
        </Field>
        <MoneyField form={form} label="Amount each month" />
        <PaymentMethodField plan={plan} form={form} label={form.values.flow === "in" ? "Received into" : form.values.flow === "move" ? "Move from" : "Pay with"} />
        {form.values.flow === "move" && <BankField plan={plan} form={form} name="to" label="Move into" />}
      </div>
    </FormModal>
  );
}

/* ---------------- installment ---------------- */
export const installmentDefaults = (plan, startMonth, item) => ({
  name: str(item?.name),
  mode: item?.mode || "term",
  total: str(item?.total ?? ""),
  months: str(item?.months ?? 12),
  monthly: str(item?.monthly ?? ""),
  prepaid: str(item?.prepaid ?? ""),
  startMonth: item?.startMonth || startMonth,
  via: item ? encodeVia(item.via) : defaultVia(plan),
});

export const validateInstallment = (v) => ({
  name: validateName(v.name),
  total: validateAmount(v.total, { positive: true, label: "Total" }),
  months: v.mode === "term" ? validateAmount(v.months, { positive: true, integer: true, max: 600, label: "Months" }) : "",
  monthly: v.mode === "open" ? validateAmount(v.monthly, { positive: true, label: "Monthly amount" }) : "",
  prepaid: v.mode === "open" ? validateAmount(v.prepaid, { required: false, label: "Already paid" }) || (numOr(v.prepaid) >= numOr(v.total) && numOr(v.total) > 0 ? "Already paid must be less than the total." : "") : "",
  startMonth: validateMonth(v.startMonth),
  via: v.via ? "" : "Choose how it's paid.",
});

export const installmentFromForm = (v, item) => {
  const base = { ...(item || { id: uid("i") }), name: v.name.trim(), mode: v.mode, total: numOr(v.total), startMonth: v.startMonth, via: decodeVia(v.via) };
  if (v.mode === "term") { base.months = Math.round(numOr(v.months, 1)); delete base.monthly; delete base.prepaid; }
  else { base.monthly = numOr(v.monthly); base.prepaid = numOr(v.prepaid); delete base.months; }
  return base;
};

export function InstallmentModal({ plan, item, startMonth, onSave, onClose, onDelete }) {
  const form = useForm(installmentDefaults(plan, startMonth, item), validateInstallment);
  const save = form.guard((v) => onSave(installmentFromForm(v, item)));
  return (
    <FormModal title={titleFor(item, "installment")} description="Set it once. It's added to each month automatically and drops off when paid."
      submitLabel={item ? "Save" : "Add installment"} onSubmit={save} onClose={onClose} onDelete={onDelete}>
      <NameField form={form} placeholder="e.g. Laptop" />
      <PaymentMethodField plan={plan} form={form} />
      <InstallmentFields form={form} />
    </FormModal>
  );
}

/** Short one-line description of an item for list views. */
export const describe = {
  banks: (plan, b) => ({ sub: b.note || "Bank account", amount: N(b.opening) ? "start " + fmt(b.opening) : "" }),
  incomes: (plan, i) => ({
    sub: (i.splits || []).map((s) => (plan.banks.find((b) => b.id === s.bank) || {}).name || "—").join(" + "),
    amount: fmt((i.splits || []).reduce((s, x) => s + N(x.amount), 0)),
  }),
  wallets: (plan, w) => ({ sub: "From " + ((plan.banks.find((b) => b.id === w.from) || {}).name || "—"), amount: fmt(w.amount) + " / month" }),
  cards: (plan, c) => ({ sub: "Billed to " + ((plan.banks.find((b) => b.id === c.bank) || {}).name || "no bank") + (c.note ? " · " + c.note : ""), amount: "" }),
  templates: (plan, t, viaLabel) => ({
    sub: t.flow === "move" ? viaLabel(plan, t.via) + " → " + ((plan.banks.find((b) => b.id === t.to) || {}).name || "—") : (t.flow === "in" ? "Receive · " : "") + viaLabel(plan, t.via),
    amount: fmt(t.amount),
  }),
  installments: (plan, it, viaLabel) => ({
    sub: viaLabel(plan, it.via) + " · " + (it.mode === "term" ? it.months + " months" : fmt(it.monthly) + " / month") + " from " + it.startMonth,
    amount: fmt(it.total),
  }),
};
