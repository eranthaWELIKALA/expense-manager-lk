import React from "react";
import { AmountInput, Checkbox, RemoveButton } from "../../components/ui";
import { asksAmount, fmt, hasPayments, isPayable } from "../../domain";

/** Column headings shared by ledgers and cards. */
export function LineHeader({ showBalance = true }) {
  return (
    <div className="hrow" aria-hidden>
      <span /><span /><span />
      <span className="hn"><span>Plan</span><span>Actual</span>{showBalance && <span className="b">Balance</span>}</span><span />
    </div>
  );
}

const Dot = ({ ratio, neg }) => (
  <span className="dot" style={{ background: neg ? "var(--flag)" : ratio > 0.4 ? "var(--jade)" : ratio > 0.15 ? "var(--brass)" : "var(--flag)" }} />
);

/**
 * One derived line (salary, bill, recurring item, installment, one-off).
 * `actions`: {set(key, field, value), remove(key), pay(key), keep(key)}; omit for read-only. keep() makes a what-if real.
 * Ticking a payable line or a varying salary opens the pay dialog for the real amount.
 * `account` names the line's account (used where lines from several accounts are mixed).
 * onPayments(line)? opens the payments behind a budget, a line paid in parts, or one of its parts (also when read-only).
 */
export function LineRow({ line, balanceBase, showBalance = true, lockedHint, actions, account, onPayments }) {
  const ro = !actions;
  const tagClass = "tag" + (line.over ? " over" : "");
  const bal = line.actualBal ?? line.bal; // what's really there after this line
  return (
    <div className={"row" + (line.done ? " done" : "") + (line.maybe ? " maybe" : "")}>
      {showBalance ? <span className="rail-c"><Dot ratio={bal / balanceBase} neg={bal < 0} /></span> : <span />}
      {line.maybe
        ? <button type="button" className="chk maybe" disabled={ro} aria-label={"Keep “" + line.label + "” — make it a real payment"} title="What-if — click to keep it as a real payment"
          onClick={() => actions.keep(line.key)}>?</button>
        : <Checkbox checked={line.done} disabled={ro || line.origin === "part" || line.origin === "transfer"}
          label={line.origin === "transfer" ? "Recorded transfer" : line.done ? (line.flow === "in" ? "Received" : "Paid") + " — untick to undo" : isPayable(line) ? "Mark paid" : asksAmount(line) ? "Mark received" : "Settled"}
          onChange={(v) => (v && actions.pay && asksAmount(line) ? actions.pay(line.key) : actions.set(line.key, "done", v))} />}
      <span className="lbl" title={line.label}>
        {line.flow === "in" && showBalance && <span className="in" aria-label="incoming">↑</span>}{line.label}
        {onPayments && hasPayments(line)
          ? <button type="button" className={tagClass + " link"} onClick={() => onPayments(line)} aria-label={`Payments for ${line.label}` + (line.tag ? ` (${line.tag})` : "")}
            title="See the payments">{line.tag || "payments"}<span aria-hidden> ›</span></button>
          : line.tag && <span className={tagClass}>{line.tag}</span>}
        {account && <span className="tag where">{account}</span>}
      </span>
      <span className="nums">
        <AmountInput className="plan" value={line.plan} readOnly={ro || line.locked}
          title={line.locked ? lockedHint : "Planned"} aria-label={line.label + " planned"}
          onChange={(v) => actions.set(line.key, "plan", v)} />
        <AmountInput className="act" value={line.actual} readOnly={ro || line.origin === "part" || line.origin === "transfer" || !!line.portions}
          title={line.portions ? "Paid in parts — tick it or use Record payment to add more" : undefined} aria-label={line.label + " actual"}
          onChange={(v) => actions.set(line.key, "actual", v)} />
        {showBalance && <span className={"bal " + (bal < 0 ? "neg" : "")}>{fmt(bal)}</span>}
      </span>
      {ro ? <span /> : <RemoveButton label="Remove from this month" onClick={() => actions.remove(line.key)} />}
    </div>
  );
}
