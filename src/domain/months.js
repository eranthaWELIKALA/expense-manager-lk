/* Month keys are "YYYY-MM" strings. All helpers are pure. */

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonthKey = (k) => typeof k === "string" && MONTH_KEY_RE.test(k);
export const mkey = (y, m) => y + "-" + String(m).padStart(2, "0");
export const pm = (k) => ({ y: +String(k).split("-")[0], m: +String(k).split("-")[1] });
export const nextM = (k) => { const { y, m } = pm(k); return m === 12 ? mkey(y + 1, 1) : mkey(y, m + 1); };
export const prevM = (k) => { const { y, m } = pm(k); return m === 1 ? mkey(y - 1, 12) : mkey(y, m - 1); };
export const mLabel = (k) => { const { y, m } = pm(k); return MONTH_NAMES[m - 1] + " " + y; };
export const mShort = (k) => { const { y, m } = pm(k); return MONTH_NAMES[m - 1] + " " + String(y).slice(2); };
export const mDiff = (a, b) => { const A = pm(a), B = pm(b); return (B.y - A.y) * 12 + (B.m - A.m); };

export const currentMonthKey = (date = new Date()) => mkey(date.getFullYear(), date.getMonth() + 1);

/* Dates are "YYYY-MM-DD" strings (local calendar days, no time zone). */
const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const pad2 = (n) => String(n).padStart(2, "0");

export const todayISO = (date = new Date()) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** A real calendar date (rejects 2026-02-30). */
export const isDateISO = (s) => {
  const m = DATE_RE.exec(String(s));
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
};

export const monthOfDate = (s) => String(s).slice(0, 7);
export const dayOfDate = (s) => +String(s).slice(8, 10);

/** Today when `mk` is the current month, otherwise the 1st of `mk`. */
export const defaultDateIn = (mk) => (mk === currentMonthKey() ? todayISO() : mk + "-01");

/** "12 Oct" */
export const dayMonthLabel = (s) => dayOfDate(s) + " " + MONTH_NAMES[+String(s).slice(5, 7) - 1];

/** 1 → "1st", 22 → "22nd" */
export const ordinal = (n) => {
  const v = n % 100;
  return n + (v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" })[n % 10] || "th");
};

/** Date in `mk` for a day-of-month, clamped to the month's length (31st → 30 Nov). */
export const dateInMonth = (mk, day) => {
  const { y, m } = pm(mk);
  const last = new Date(y, m, 0).getDate();
  return mk + "-" + pad2(Math.min(Math.max(1, day || 1), last));
};
