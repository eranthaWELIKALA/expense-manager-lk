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
