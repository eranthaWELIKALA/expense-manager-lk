import React, { useId } from "react";
import { cx } from "./cx";

/** Label + control + hint/error, wired up for screen readers. */
export function Field({ label, hint, error, children, className }) {
  const id = useId();
  const describedBy = error ? id + "-err" : hint ? id + "-hint" : undefined;
  const control = React.isValidElement(children)
    ? React.cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })
    : children;
  return (
    <div className={cx("field", error && "has-err", className)}>
      {label && <label htmlFor={id}>{label}</label>}
      {control}
      {error ? <p className="field-err" id={id + "-err"}>{error}</p> : hint ? <p className="field-hint" id={id + "-hint"}>{hint}</p> : null}
    </div>
  );
}

export const TextInput = React.forwardRef(function TextInput({ className, ...rest }, ref) {
  return <input ref={ref} className={cx("input", className)} {...rest} />;
});

export function Select({ className, options, children, ...rest }) {
  return (
    <select className={cx("input", className)} {...rest}>
      {options ? options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>) : children}
    </select>
  );
}

/** A form-level error message. */
export function FormError({ children }) {
  if (!children) return null;
  return <div className="form-err" role="alert">{children}</div>;
}
