import React, { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button, Modal } from "../../components/ui";
import { dayMonthLabel, mLabel, paymentsFor } from "../../domain";
import { BudgetCard, cardAnchor } from "./BudgetCard";

/**
 * The payments behind one line of the Month page — a budget, a bill paid in parts, or one of
 * those parts showing in another account. Read-only; onAdd(lineKey)? records another payment.
 */
export function PaymentsDialog({ plan, monthKey, lineKey, onAdd, onClose }) {
  const s = useMemo(() => paymentsFor(plan, monthKey, lineKey), [plan, monthKey, lineKey]);
  const { search } = useLocation();
  useEffect(() => { if (!s) onClose(); }, [s, onClose]); // the line went away (removed, or undone)
  if (!s) return null;

  const to = { pathname: "../budgets", search, hash: "#" + cardAnchor(s.key) };
  return (
    <Modal title={s.label} onClose={onClose}
      description={`${mLabel(monthKey)} · ${dayMonthLabel(s.range.from)} – ${dayMonthLabel(s.range.to)}` + (s.budget ? " · budget" : " · paid in parts")}
      footer={(
        <>
          <Link className="btn gh dlg-left" to={to} onClick={onClose}>Open in Budgets</Link>
          <Button onClick={onClose}>Close</Button>
          {onAdd && <Button variant="primary" onClick={() => onAdd(s.key)}>Add payment</Button>}
        </>
      )}>
      <BudgetCard compact plan={plan} s={s} />
    </Modal>
  );
}
