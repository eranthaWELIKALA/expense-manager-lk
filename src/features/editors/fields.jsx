import React from "react";
import { Field, Select, TextInput } from "../../components/ui";
import { fmt, mLabel, monthOfDate, numOr, todayISO } from "../../domain";

/* Form fields shared by every add/edit modal. Values are strings while editing. */

export function NameField({ form, label = "Name", placeholder, autoFocus = true }) {
  return (
    <Field label={label} error={form.errors.name}>
      <TextInput value={form.values.name} onChange={form.set("name")} maxLength={80} placeholder={placeholder} autoFocus={autoFocus} />
    </Field>
  );
}

export function TextField({ form, name, label, placeholder, hint }) {
  return (
    <Field label={label} hint={hint} error={form.errors[name]}>
      <TextInput value={form.values[name] ?? ""} onChange={form.set(name)} maxLength={120} placeholder={placeholder} />
    </Field>
  );
}

export function MoneyField({ form, name = "amount", label = "Amount", hint, className }) {
  return (
    <Field label={label} hint={hint} error={form.errors[name]} className={className}>
      <TextInput className="n" inputMode="decimal" value={form.values[name] ?? ""} onChange={form.set(name)} placeholder="0" />
    </Field>
  );
}

/** Furthest ahead an expense can be scheduled. */
export const maxDate = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 5); return todayISO(d); };

/** Earliest allowed date: the 1st of the plan's first month (balances start there). */
export const minDateFor = (firstMonthKey) => firstMonthKey + "-01";

export function DateField({ form, name = "date", label = "Date", hint, min, max = maxDate() }) {
  return (
    <Field label={label} hint={hint} error={form.errors[name]}>
      <TextInput type="date" value={form.values[name] ?? ""} onChange={form.set(name)} min={min} max={max} />
    </Field>
  );
}

export function BankField({ plan, form, name, label, allowNone = false, noneLabel = "None", hint }) {
  return (
    <Field label={label} hint={hint} error={form.errors[name]}>
      <Select value={form.values[name] || ""} onChange={form.set(name)}>
        {(allowNone || !form.values[name]) && <option value="">{allowNone ? noneLabel : "Choose a bank…"}</option>}
        {plan.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </Select>
    </Field>
  );
}

/** Payment method: straight from a bank, from a cash pot, or on a card. Value is "kind|id". */
export function PaymentMethodField({ plan, form, name = "via", label = "Pay with" }) {
  const empty = plan.banks.length + plan.wallets.length + plan.cards.length === 0;
  return (
    <Field label={label} error={form.errors[name]} hint={empty ? "Add a bank, cash pot or card in Setup first." : undefined}>
      <Select value={form.values[name] || ""} onChange={form.set(name)}>
        {!form.values[name] && <option value="">Choose how it's paid…</option>}
        {plan.banks.length > 0 && <optgroup label="Direct from bank">{plan.banks.map((b) => <option key={b.id} value={"bank|" + b.id}>{b.name}</option>)}</optgroup>}
        {plan.wallets.length > 0 && <optgroup label="Cash">{plan.wallets.map((w) => <option key={w.id} value={"cash|" + w.id}>{w.name}</option>)}</optgroup>}
        {plan.cards.length > 0 && <optgroup label="Card">{plan.cards.map((c) => <option key={c.id} value={"card|" + c.id}>{c.name}</option>)}</optgroup>}
      </Select>
    </Field>
  );
}

export const encodeVia = (via) => (via && via.kind && via.id ? via.kind + "|" + via.id : "");
export const decodeVia = (s) => { const [kind, id] = String(s).split("|"); return { kind, id }; };

/** A sensible default payment method: first card, else first bank, else first cash pot. */
export const defaultVia = (plan) => {
  if (plan.cards[0]) return "card|" + plan.cards[0].id;
  if (plan.banks[0]) return "bank|" + plan.banks[0].id;
  if (plan.wallets[0]) return "cash|" + plan.wallets[0].id;
  return "";
};

/** Installment terms: fixed number of months, or a monthly amount until the total is paid. */
export function InstallmentFields({ form, minDate }) {
  const v = form.values;
  const total = numOr(v.total), prepaid = numOr(v.prepaid);
  const preview = v.mode === "term"
    ? numOr(v.months) >= 1 && total > 0 && `${fmt(total / Math.round(numOr(v.months)))} a month for ${Math.round(numOr(v.months))} months`
    : numOr(v.monthly) > 0 && total > prepaid && `${fmt(numOr(v.monthly))} a month for about ${Math.ceil((total - prepaid) / numOr(v.monthly))} months`;
  return (
    <>
      <div className="form-grid">
        <Field label="Runs">
          <Select value={v.mode} onChange={form.set("mode")}>
            <option value="term">Fixed number of months</option>
            <option value="open">Fixed amount until paid</option>
          </Select>
        </Field>
        <MoneyField form={form} name="total" label="Total price" />
        {v.mode === "term"
          ? <MoneyField form={form} name="months" label="Months" />
          : <MoneyField form={form} name="monthly" label="Pay each month" />}
        {v.mode === "open" && <MoneyField form={form} name="prepaid" label="Already paid" hint="Down payment, if any" />}
        <DateField form={form} label="First payment" min={minDate} />
      </div>
      {preview && <div className="preview">≈ <b>{preview}</b>{v.date ? ", from " + mLabel(monthOfDate(v.date)) : ""}.</div>}
    </>
  );
}
