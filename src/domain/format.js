/* Number coercion and display formatting. */

/** Coerce anything to a finite number (non-numbers become 0). */
export const N = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

/** Money as shown everywhere: thousands separated, always two decimals ("7,500,000.00"). */
export const fmt = (v) => N(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** What's typed into an amount box, grouped as you go ("7500000.5" → "7,500,000.5"). */
export const groupDigits = (raw) => {
  const m = /^(-?)(\d*)(\.?)(\d*)$/.exec(String(raw ?? ""));
  if (!m) return String(raw ?? "");
  return m[1] + m[2].replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") + m[3] + m[4];
};

/** Keep only what an amount can hold: digits, one point, at most two decimals (and a leading minus if allowed). */
export const cleanAmount = (typed, allowNegative = false) => {
  const t = String(typed ?? "").trim();
  const neg = allowNegative && t.startsWith("-") ? "-" : "";
  const s = t.replace(/[^\d.]/g, "");
  const i = s.indexOf(".");
  return neg + (i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "").slice(0, 2));
};

/** A typed amount tidied when you leave the box: "7500000" → "7500000.00" (left alone if it isn't a number). */
export const settleAmount = (raw) => {
  const v = parseAmount(raw);
  return v === null ? String(raw ?? "") : v.toFixed(2);
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
