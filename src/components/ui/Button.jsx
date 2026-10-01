import React from "react";
import { cx } from "./cx";

/**
 * @param {{variant?: "default"|"primary"|"ghost"|"danger", size?: "md"|"sm", loading?: boolean}} props
 */
export function Button({ variant = "default", size = "md", loading = false, className, children, disabled, type = "button", ...rest }) {
  return (
    <button
      type={type}
      className={cx("btn", variant === "primary" && "pri", variant === "ghost" && "gh", variant === "danger" && "dng", size === "sm" && "sm", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** The small "×" used to delete a row. */
export function RemoveButton({ label = "Remove", ...rest }) {
  return <button type="button" className="del" aria-label={label} title={label} {...rest}>×</button>;
}
