import React from "react";
import { AmountInput, Checkbox, RemoveButton } from "../../components/ui";
import { fmt } from "../../domain";

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
  <span className="dot" style={{ background: neg ? "var(--flag)" : ratio > 0.4 ? "var(--jade)" : ratio > 0.15 ? "#C9A227" : "var(--flag)" }} />
);

/**
 * One derived line (salary, bill, recurring item, installment, one-off).
 * `actions`: {set(key, field, value), remove(key)}; omit for read-only.
 */
export function LineRow({ line, balanceBase, showBalance = true, lockedHint, actions }) {
  const ro = !actions;
  return (
    <div className={"row" + (line.done ? " done" : "")}>
      {showBalance ? <span className="rail-c"><Dot ratio={line.bal / balanceBase} neg={line.bal < 0} /></span> : <span />}
      <Checkbox checked={line.done} disabled={ro} onChange={(v) => actions.set(line.key, "done", v)} />
      <span className="lbl" title={line.label}>
        {line.flow === "in" && showBalance ? "↑ " : ""}{line.label}
        {line.tag && <span className="tag">{line.tag}</span>}
      </span>
      <span className="nums">
        <AmountInput className="plan" value={line.plan} readOnly={ro || line.locked}
          title={line.locked ? lockedHint : "Planned"} aria-label={line.label + " planned"}
          onChange={(v) => actions.set(line.key, "plan", v)} />
        <AmountInput className="act" value={line.actual} readOnly={ro} aria-label={line.label + " actual"}
          onChange={(v) => actions.set(line.key, "actual", v)} />
        {showBalance && <span className={"bal " + (line.bal < 0 ? "neg" : "")}>{fmt(line.bal)}</span>}
      </span>
      {ro ? <span /> : <RemoveButton label="Remove from this month" onClick={() => actions.remove(line.key)} />}
    </div>
  );
}
