import React from "react";
import { Field, Select, TextInput } from "../../components/ui";
import { INSTALLMENT_TYPES, fmt, instType, isDateISO, mDiff, mLabel, mShort, monthOfDate, numOr, todayISO } from "../../domain";
import { BANKS, NETWORKS, NO_LOGO, bankInfo, guessBank, guessNetwork, networkInfo } from "../../lib/banks";

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

/**
 * Which bank (or card network) an account's logo shows. "" matches it from the
 * account name; "none" shows initials. Choices come from lib/banks.
 */
export function LogoField({ form, name, label, networks = false }) {
  const list = networks ? NETWORKS : BANKS;
  const guessed = networks ? guessNetwork(form.values.name) : guessBank(form.values.name);
  const auto = guessed ? "Match name (" + (networks ? networkInfo(guessed) : bankInfo(guessed)).name + ")" : "Match name";
  return (
    <Field label={label} error={form.errors[name]}>
      <Select value={form.values[name] || ""} onChange={form.set(name)}>
        <option value="">{auto}</option>
        {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        <option value={NO_LOGO}>{networks ? "None" : "Other (no logo)"}</option>
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

/** One payment (a bill) or several (a budget like groceries or sport, total varies). Value "one" | "budget". */
export function PaidHowField({ form, name = "budget" }) {
  const budget = form.values[name] === "budget";
  return (
    <Field label="How it's paid" hint={budget
      ? "The amount is a budget. Record each payment as it happens — the month's total can be under or over."
      : "One payment a month (it can still be paid in parts)."}>
      <Select value={form.values[name] || "one"} onChange={form.set(name)}>
        <option value="one">One payment (a bill)</option>
        <option value="budget">Several payments (a budget)</option>
      </Select>
    </Field>
  );
}

/**
 * How an installment that started before the plan's first month will show:
 * the payments before it count as already paid, and it carries on from there.
 */
function startedBefore(v, planStart) {
  if (!planStart || !isDateISO(v.date)) return null;
  const before = mDiff(monthOfDate(v.date), planStart); // months already paid before the plan starts
  if (before <= 0) return null;
  const total = numOr(v.total), first = mShort(planStart), from = mLabel(planStart);
  if (v.mode === "term") {
    const months = Math.round(numOr(v.months));
    if (!(months >= 1)) return null;
    if (before >= months) return `Started before this plan (${from}) and fully paid by then, so it won't show in any month.`;
    return `Started before this plan (${from}): ${before} payment${before === 1 ? "" : "s"} already made, so ${first} is payment ${before + 1} of ${months}.`;
  }
  const monthly = numOr(v.monthly);
  if (!(monthly > 0) || !(total > 0)) return null;
  const paid = Math.min(total, numOr(v.prepaid) + before * monthly);
  if (paid >= total - 0.005) return `Started before this plan (${from}) and fully paid by then, so it won't show in any month.`;
  return `Started before this plan (${from}): ${fmt(paid, 0)} already paid, ${fmt(total - paid, 0)} left from ${first}.`;
}

/**
 * Installment / loan / lease terms: type, then fixed number of months, or a monthly amount until the total is paid.
 * The first payment can be before `planStart` (the plan's first month) — earlier months are skipped.
 */
export function InstallmentFields({ form, planStart }) {
  const v = form.values;
  const total = numOr(v.total), prepaid = numOr(v.prepaid);
  const preview = v.mode === "term"
    ? numOr(v.months) >= 1 && total > 0 && `${fmt(total / Math.round(numOr(v.months)))} a month for ${Math.round(numOr(v.months))} months`
    : numOr(v.monthly) > 0 && total > prepaid && `${fmt(numOr(v.monthly))} a month for about ${Math.ceil((total - prepaid) / numOr(v.monthly))} months`;
  const type = instType(v.itype);
  return (
    <>
      <div className="form-grid">
        <Field label="Type" hint={type.value === "installment" ? "Something bought and paid off monthly." : "Use the monthly rental and what you repay in total, interest included."}>
          <Select value={type.value} onChange={form.set("itype")}>
            {INSTALLMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Runs">
          <Select value={v.mode} onChange={form.set("mode")}>
            <option value="term">Fixed number of months</option>
            <option value="open">Fixed amount until paid</option>
          </Select>
        </Field>
        <MoneyField form={form} name="total" label={type.total} />
        {v.mode === "term"
          ? <MoneyField form={form} name="months" label="Months" />
          : <MoneyField form={form} name="monthly" label="Pay each month" />}
        {v.mode === "open" && <MoneyField form={form} name="prepaid" label="Already paid" hint="Down payment, if any" />}
        <DateField form={form} label="First payment" hint="Can be before this plan started." />
        <Field label="Each month" hint={v.auto === "auto" ? "Marked paid on its due day. Untick it if a deduction fails." : "Tick it off in the month when you pay."}>
          <Select value={v.auto || "manual"} onChange={form.set("auto")}>
            <option value="manual">I pay it myself</option>
            <option value="auto">Deducted automatically</option>
          </Select>
        </Field>
      </div>
      {preview && <div className="preview">≈ <b>{preview}</b>{v.date ? ", from " + mLabel(monthOfDate(v.date)) : ""}.</div>}
      {startedBefore(v, planStart) && <div className="preview">{startedBefore(v, planStart)}</div>}
    </>
  );
}
