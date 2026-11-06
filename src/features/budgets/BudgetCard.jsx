import React from "react";
import { AccountLogo, AccountLogos, Badge, Button, RemoveButton, cx } from "../../components/ui";
import { MONTH_NAMES, dayMonthLabel, fmt, mLabel } from "../../domain";
import { viaLogo } from "../../lib/banks";

/** Name of a bank / cash pot / card. */
export const accountName = (plan, via) => {
  const list = via.kind === "card" ? plan.cards : via.kind === "cash" ? plan.wallets : plan.banks;
  return ((list || []).find((x) => x.id === via.id) || {}).name || "Deleted account";
};

const orList = (names) => (names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " or " + names[names.length - 1]);
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** The anchor a budget card is reachable at (Budgets page, `#…`). */
export const cardAnchor = (key) => "pay-" + String(key).replace(/[^\w-]/g, "-");

/** Where a budget stands: what's left, and how fast it can go. */
function standing(s) {
  if (!s.budget) return s.closed ? (s.left > 0.005 ? `settled ${fmt(s.left)} under` : "paid in full") : `${fmt(s.left)} left to pay`;
  const parts = [s.over ? `${fmt(s.spent - s.plan)} over budget` : `${fmt(s.left)} left`];
  if (s.status === "ahead") parts.push("starts " + dayMonthLabel(s.range.from));
  else if (s.status === "past") parts.push("month ended " + dayMonthLabel(s.range.to));
  else if (s.closed) parts.push("closed for the month");
  else if (s.perDay > 0) parts.push(`about ${fmt(s.perDay)} a day for ${plural(s.daysLeft, "day")}`);
  else parts.push(plural(s.daysLeft, "day") + " left");
  return parts.join(" · ");
}

/**
 * Spending in each of the last few months, against that month's budget (the tick).
 * One series: past months in the light accent, the month on screen in the full one. Hover or focus a column for its figures.
 */
function SpendChart({ history, month }) {
  const top = Math.max(1, ...history.map((h) => Math.max(h.spent, h.plan)));
  const pct = (v) => Math.min(100, (v / top) * 100) + "%";
  const over = history.filter((h) => h.spent > h.plan + 0.005 && !h.none).length;
  return (
    <figure className="bhist">
      <div className="bhist-cols" role="list" aria-label={`Spent each month, last ${history.length} months`}>
        {history.map((h) => {
          const tip = `${mLabel(h.month)}: ` + (h.none ? "not running"
            : `${fmt(h.spent)} of ${fmt(h.plan)}` + (h.spent > h.plan + 0.005 ? ` · ${fmt(h.spent - h.plan)} over` : ""));
          return (
            <div key={h.month} role="listitem" tabIndex={0} className={cx("bcol", h.month === month && "on")} aria-label={tip} data-tip={tip}>
              <span className="bcol-track">
                {h.spent > 0.005 && <i style={{ height: pct(h.spent) }} />}
                {h.plan > 0.005 && <b style={{ bottom: pct(h.plan) }} />}
              </span>
              <small aria-hidden>{MONTH_NAMES[+h.month.slice(5) - 1]}</small>
            </div>
          );
        })}
      </div>
      <figcaption>{over ? `Over budget in ${plural(over, "month")} of ${history.length}` : `Within budget for ${history.length} months`} · tick = budget</figcaption>
    </figure>
  );
}

/** The payments, oldest first: date, account and note, amount, total so far. */
function PaymentList({ plan, s, onRemove }) {
  if (!s.payments.length) {
    return <p className="bpays-none">{s.budget ? "Nothing spent yet this month." : "No payments yet."}</p>;
  }
  return (
    <table className="bpays">
      <caption className="sr-only">Payments towards {s.label} in {mLabel(s.month)}</caption>
      <thead>
        <tr><th scope="col">Date</th><th scope="col">Paid with</th><th scope="col" className="r">Amount</th><th scope="col" className="r run">Total so far</th>{onRemove && <th scope="col"><span className="sr-only">Remove</span></th>}</tr>
      </thead>
      <tbody>
        {s.payments.map((p, i) => (
          <tr key={p.id || i}>
            <td className="dt">{p.date ? dayMonthLabel(p.date) : "—"}</td>
            <td className="who">
              <div>
                <AccountLogo {...viaLogo(plan, p.via)} name={accountName(plan, p.via)} size="sm" />
                <span>
                  <b>{accountName(plan, p.via)}</b>
                  {(p.note || p.whole || p.statement) && <small>{[p.note || (p.whole ? "ticked off as one amount" : null), p.statement && "on the " + p.statement].filter(Boolean).join(" · ")}</small>}
                </span>
              </div>
            </td>
            <td className="r n">{fmt(p.amount)}</td>
            <td className="r n run mut">{fmt(p.running)}</td>
            {onRemove && <td className="x">{p.id && <RemoveButton label={`Remove the ${fmt(p.amount)} payment${p.date ? " on " + dayMonthLabel(p.date) : ""}`} onClick={() => onRemove(s.line, p)} />}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One budget (or bill paid in parts) of a month: how much of it is spent, the payments that made
 * it up and which accounts they came from. `s` is a paymentSummary (domain/budgets.js).
 * `compact` leaves out the heading (the payments dialog has its own). onAdd(s)? onRemove(line, payment)?
 */
export function BudgetCard({ plan, s, compact = false, onAdd, onRemove, highlight = false }) {
  const names = s.via.map((v) => accountName(plan, v));
  const used = s.byAccount.filter((a) => a.amount > 0.005);
  const ratio = s.plan > 0 ? s.spent / s.plan : s.spent > 0 ? 1 : 0;
  const done = !s.budget && s.closed;
  return (
    <article className={cx("bud", compact && "compact", highlight && "hl")} id={compact ? undefined : cardAnchor(s.key)} aria-label={compact ? undefined : s.label}>
      {!compact && (
        <header className="bud-h">
          <AccountLogos logos={s.via.map((v) => ({ ...viaLogo(plan, v), name: accountName(plan, v) }))} size="lg" />
          <div className="bud-t">
            <div className="bud-name">
              <h3>{s.label}</h3>
              {s.over && <Badge tone="flag">over budget</Badge>}
              {done && <Badge tone="jade">paid</Badge>}
              {s.budget && s.closed && s.status === "now" && <Badge>closed</Badge>}
            </div>
            <div className="bud-via">
              {s.budget ? "Paid with " + orList(names) : "Paid from " + names[0]}
              {s.budget && names.length > 1 ? ` · the rest stays set aside in ${names[0]}` : ""}
            </div>
          </div>
          <div className="bud-amt">
            <b className="n">{fmt(s.spent)}</b>
            <small>of {fmt(s.plan)}</small>
          </div>
        </header>
      )}

      <div className="bud-body">
        <div className="bud-prog">
          {compact && (
            <div className="bud-fig"><b className="n">{fmt(s.spent)}</b> <span className="mut">of {fmt(s.plan)} {s.budget ? "spent" : "paid"}</span></div>
          )}
          <div className={cx("bar", s.over && "over")} role="progressbar" aria-label={`${s.label}: ${fmt(s.spent)} of ${fmt(s.plan)}`}
            aria-valuenow={Math.round(Math.min(ratio, 1) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <i className={cx(done && "done")} style={{ width: Math.min(100, ratio * 100) + "%" }} />
          </div>
          <div className={cx("bud-meta", s.over && "neg")}>{standing(s)}</div>
          {used.length > 1 && (
            <ul className="bud-accts" aria-label="By account">
              {used.map((a) => (
                <li key={a.via.kind + a.via.id}>
                  <AccountLogo {...viaLogo(plan, a.via)} name={accountName(plan, a.via)} size="sm" />
                  <span>{accountName(plan, a.via)}</span><b className="n">{fmt(a.amount)}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
        {s.history && s.history.length > 1 && <SpendChart history={s.history} month={s.month} />}
      </div>

      <PaymentList plan={plan} s={s} onRemove={onRemove} />

      {s.back.length > 0 && (
        <div className="bback">
          <div className="bback-h">Money back · {fmt(s.backTotal)} <span className="mut">— it cost you {fmt(Math.max(0, s.spent - s.backTotal))}</span></div>
          {s.back.map((b) => (
            <div className="bback-r" key={b.id}>
              <span className="dt">{b.date ? dayMonthLabel(b.date) : "—"}</span>
              <span className="mut">{b.note ? b.note + " · " : ""}into {accountName(plan, b.to)}</span>
              <b className="n pos">+{fmt(b.amount)}</b>
            </div>
          ))}
        </div>
      )}

      {onAdd && (
        <div className="bud-f">
          <Button size="sm" onClick={() => onAdd(s)}><span aria-hidden>+</span> Add payment</Button>
        </div>
      )}
    </article>
  );
}
