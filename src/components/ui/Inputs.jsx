import React, { useState } from "react";
import { fmt, parseAmount } from "../../domain";
import { cx } from "./cx";

/**
 * Money input: shows formatted "1,250.00" until focused, then the raw number.
 * Calls onChange(number|null) as the user types.
 */
export function AmountInput({ value, onChange, className, placeholder = "—", readOnly = false, title, ...rest }) {
  const [txt, setTxt] = useState("");
  const [focused, setFocused] = useState(false);
  const empty = value === null || value === undefined || value === "";
  const shown = focused ? txt : empty ? "" : fmt(value);
  return (
    <input
      className={cx("amt", className, readOnly && "ro")}
      value={shown}
      title={title}
      readOnly={readOnly}
      placeholder={placeholder}
      inputMode="decimal"
      onFocus={(e) => {
        if (readOnly) return;
        setFocused(true);
        setTxt(empty ? "" : String(value));
        const el = e.target;
        requestAnimationFrame(() => el.select());
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, "");
        setTxt(raw);
        if (raw.trim() === "") return onChange(null);
        const v = parseAmount(raw);
        if (v !== null) onChange(v);
      }}
      {...rest}
    />
  );
}

/** Numeric config field that always holds a number (blank → fallback). */
export function NumberInput({ value, onChange, fallback = 0, className, ...rest }) {
  return (
    <input
      className={cx("n", className)}
      value={value ?? ""}
      inputMode="decimal"
      onFocus={(e) => e.target.select()}
      onChange={(e) => { const v = parseAmount(e.target.value); onChange(v === null ? fallback : v); }}
      {...rest}
    />
  );
}

/** Round "settled" tick box. */
export function Checkbox({ checked, onChange, label = "Settled", disabled }) {
  return (
    <button
      type="button"
      className={cx("chk", checked && "on")}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
    >
      {checked ? "✓" : ""}
    </button>
  );
}

/** Name + amount inline adder used at the foot of ledgers. */
export function AddRow({ onAdd, placeholder = "Add a one-off item" }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const go = () => {
    const n = name.trim();
    if (!n) return;
    onAdd(n, parseAmount(amount) ?? 0);
    setName(""); setAmount("");
  };
  const onKey = (e) => e.key === "Enter" && go();
  return (
    <div className="add">
      <input value={name} placeholder={placeholder} maxLength={120} aria-label="Item name" onChange={(e) => setName(e.target.value)} onKeyDown={onKey} />
      <input className="a" value={amount} placeholder="0" inputMode="decimal" aria-label="Amount" onChange={(e) => setAmount(e.target.value)} onKeyDown={onKey} />
      <button type="button" className="btn sm" onClick={go}>Add</button>
    </div>
  );
}
