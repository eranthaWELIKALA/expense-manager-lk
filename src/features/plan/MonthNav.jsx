import React from "react";
import { Button, Menu, MenuDivider, MenuItem, MenuLabel } from "../../components/ui";
import { mLabel, mShort, nextM, prevM } from "../../domain";

/**
 * Month rail: prev/next, a pill per opened month, add expense, the Actions menu and the roll-over action.
 * onAction(name): "pay" | "income" | "edit:templates" | "edit:incomes" | "edit:installments" | "undo" | "history"
 */
export function MonthNav({ value, items, openedMonths, onSelect, onMoveNext, onAddExpense, onAction, canEdit }) {
  return (
    <div className="mrail">
      <button type="button" className="mnav" onClick={() => onSelect(prevM(value))} aria-label="Previous month">‹</button>
      <div className="mnow" aria-live="polite">{mLabel(value)}</div>
      <button type="button" className="mnav" onClick={() => onSelect(nextM(value))} aria-label="Next month">›</button>
      <div className="mpills">
        {items.map((key) => (
          <button
            type="button"
            key={key}
            className={"mpill" + (key === value ? " on" : "") + (!openedMonths[key] ? " ghost" : "")}
            aria-current={key === value ? "date" : undefined}
            onClick={() => onSelect(key)}
          >
            {mShort(key)}
          </button>
        ))}
      </div>
      {canEdit && <Button variant="primary" onClick={onAddExpense}>+ Add expense</Button>}
      {canEdit && (
        <Menu trigger={({ toggle, props }) => <Button onClick={toggle} {...props}>Actions ▾</Button>}>
          <MenuLabel>Record</MenuLabel>
          <MenuItem onClick={() => onAction("pay")}>Record a payment…</MenuItem>
          <MenuItem onClick={() => onAction("income")}>Record income received…</MenuItem>
          <MenuDivider />
          <MenuLabel>Change</MenuLabel>
          <MenuItem onClick={() => onAction("edit:templates")}>Change a monthly item…</MenuItem>
          <MenuItem onClick={() => onAction("edit:incomes")}>Change a salary…</MenuItem>
          <MenuItem onClick={() => onAction("edit:installments")}>Change an installment…</MenuItem>
          <MenuDivider />
          <MenuItem onClick={() => onAction("undo")}>Undo last change</MenuItem>
          <MenuItem onClick={() => onAction("history")}>View history</MenuItem>
        </Menu>
      )}
      {canEdit && <Button onClick={onMoveNext}>Move into {mShort(nextM(value))} →</Button>}
    </div>
  );
}
