/* Client-side validation. The server re-validates everything; this is for fast feedback. */

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const PASSWORD_MIN = 8;

export const validateEmail = (v) => (EMAIL_RE.test(String(v).trim()) ? "" : "Enter a valid email address.");

export const validatePassword = (v) => {
  if (String(v).length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return "Use at least one letter and one number.";
  return "";
};

export const validateName = (v, what = "Name") => {
  const n = String(v).trim();
  if (!n) return `${what} is required.`;
  if (n.length > 80) return `${what} must be 80 characters or fewer.`;
  return "";
};

export const CURRENCIES = ["LKR", "USD", "EUR", "GBP", "AUD", "CAD", "INR", "SGD", "AED"];

/** Only allow same-origin relative paths as post-login redirects (prevents open redirects). */
export const safeNext = (next, fallback = "/") =>
  typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;

/**
 * Validate a typed amount. Returns "" when valid.
 * opts: {required=true, positive=false (must be > 0), integer=false, max}
 */
export const validateAmount = (raw, { required = true, positive = false, integer = false, max = 1e12, label = "Amount" } = {}) => {
  const s = String(raw ?? "").replace(/,/g, "").trim();
  if (s === "") return required ? `${label} is required.` : "";
  const v = Number(s);
  if (!isFinite(v)) return `${label} must be a number.`;
  if (v < 0) return `${label} can't be negative.`;
  if (positive && v === 0) return `${label} must be more than zero.`;
  if (integer && !Number.isInteger(v)) return `${label} must be a whole number.`;
  if (v > max) return `${label} is too large.`;
  return "";
};

export const validateMonth = (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v)) ? "" : "Choose a month.");
