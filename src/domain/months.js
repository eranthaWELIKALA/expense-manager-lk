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
