/* Number coercion and display formatting. */

/** Coerce anything to a finite number (non-numbers become 0). */
export const N = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

export const fmt = (v, dp) => {
  const n = N(v);
  const d = dp === undefined ? (Math.abs(n % 1) > 0.004 ? 2 : 0) : dp;
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};

export const fmtK = (v) => {
  const n = N(v), a = Math.abs(n);
  if (a >= 1000000) return (n / 1000000).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (a >= 10000) return Math.round(n / 1000) + "K";
  return fmt(n, 0);
};

/** Parse user-typed amounts ("1,250.50"). Returns null for blank, NaN-safe. */
export const parseAmount = (raw) => {
  const s = String(raw ?? "").replace(/,/g, "").trim();
  if (s === "") return null;
  const v = parseFloat(s);
  return isFinite(v) ? v : null;
};

/** Parse with a fallback, for config fields that must always hold a number. */
export const numOr = (raw, fallback = 0) => {
  const v = parseAmount(raw);
  return v === null ? fallback : v;
};
