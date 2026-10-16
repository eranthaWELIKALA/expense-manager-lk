import React, { useLayoutEffect, useRef, useState } from "react";
import { cleanAmount, fmt, groupDigits, parseAmount, settleAmount } from "../../domain";
import { cx } from "./cx";

/* Typing into a grouped box: remember how many digits sat before the caret, and put it back
   after the commas move. */
const digitsBefore = (s, pos) => s.slice(0, pos).replace(/[^\d.-]/g, "").length;
const posAfterDigits = (s, n) => { let i = 0; for (let seen = 0; i < s.length && seen < n; i++) if (/[\d.-]/.test(s[i])) seen++; return i; };
function useCaret(shown) {
  const ref = useRef(null), want = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && want.current !== null && document.activeElement === el) { const p = posAfterDigits(shown, want.current); el.setSelectionRange(p, p); }
    want.current = null;
  }, [shown]);
  return { ref, mark: (e) => { want.current = digitsBefore(e.target.value, e.target.selectionStart ?? e.target.value.length); } };
}

/**
 * Money box for forms: shows commas as you type ("7,500,000.50") and settles to two decimals on leaving.
 * value / onChange(raw) hold the plain typed number ("7500000.50"), without commas.
 */
export function MoneyInput({ value, onChange, onBlur, className, allowNegative = false, ...rest }) {
  const shown = groupDigits(value ?? "");
  const caret = useCaret(shown);
  return (
    <input
      ref={caret.ref}
      className={cx("input n", className)}
      inputMode="decimal"
      value={shown}
      onChange={(e) => { caret.mark(e); onChange(cleanAmount(e.target.value, allowNegative)); }}
      onBlur={(e) => { if (String(value ?? "").trim() !== "") onChange(settleAmount(value)); onBlur && onBlur(e); }}
      {...rest}
    />
  );
}

/**
 * Money input in a line: shows formatted "1,250.00" until focused, then the number, grouped as you type.
 * Calls onChange(number|null) as the user types.
 */
export function AmountInput({ value, onChange, className, placeholder = "—", readOnly = false, title, ...rest }) {
  const [txt, setTxt] = useState("");
  const [focused, setFocused] = useState(false);
  const empty = value === null || value === undefined || value === "";
  const shown = focused ? groupDigits(txt) : empty ? "" : fmt(value);
  const caret = useCaret(shown);
  return (
    <input
      ref={caret.ref}
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
        caret.mark(e);
        const raw = cleanAmount(e.target.value);
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
