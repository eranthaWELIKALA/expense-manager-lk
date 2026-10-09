import React, { useEffect, useRef } from "react";
import { Button, Menu, MenuDivider, MenuItem, MenuLabel } from "../../components/ui";
import { mLabel, mShort, nextM, prevM } from "../../domain";

/**
 * Month rail: prev/next, a pill per opened month, record payment, new expense, the Actions menu and the roll-over action.
 * onAction(name): "income" | "edit:templates" | "edit:incomes" | "edit:installments" | "undo" | "history"
 */
export function MonthNav({ value, items, openedMonths, onSelect, onMoveNext, onRecord, onNewExpense, onAction, canEdit }) {
  const pillsRef = useRef(null);
  useEffect(() => { // keep the chosen month in view
    const on = pillsRef.current?.querySelector(".mpill.on");
    if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "center" });
  }, [value]);

  return (
    <div className="mrail">
      <div className="mrail-nav">
        <button type="button" className="mnav" onClick={() => onSelect(prevM(value))} aria-label="Previous month">‹</button>
        <div className="mnow" aria-live="polite">{mLabel(value)}</div>
        <button type="button" className="mnav" onClick={() => onSelect(nextM(value))} aria-label="Next month">›</button>
        <div className="mpills" ref={pillsRef}>
          {items.map((key) => (
            <button
              type="button"
              key={key}
              className={"mpill" + (key === value ? " on" : "") + (!openedMonths[key] ? " ghost" : "")}
              aria-current={key === value ? "date" : undefined}
              title={openedMonths[key] ? undefined : "Not started yet"}
              onClick={() => onSelect(key)}
            >
              {mShort(key)}
            </button>
          ))}
        </div>
      </div>
      {canEdit && (
        <div className="mrail-act">
          <Button variant="primary" onClick={onRecord}><span className="ico" aria-hidden>+</span>Record payment</Button>
          <Button onClick={onNewExpense}>New expense</Button>
          <Menu trigger={({ toggle, props }) => <Button onClick={toggle} {...props}>Actions <span aria-hidden>▾</span></Button>}>
            <MenuLabel>Record</MenuLabel>
            <MenuItem onClick={() => onAction("income")}><span className="mi" aria-hidden>↓</span>Record income received…</MenuItem>
            <MenuDivider />
            <MenuLabel>Change</MenuLabel>
            <MenuItem onClick={() => onAction("edit:templates")}><span className="mi" aria-hidden>↻</span>Change a monthly item…</MenuItem>
            <MenuItem onClick={() => onAction("edit:incomes")}><span className="mi" aria-hidden>₨</span>Change a salary…</MenuItem>
            <MenuItem onClick={() => onAction("edit:installments")}><span className="mi" aria-hidden>▤</span>Change an installment…</MenuItem>
            <MenuDivider />
            <MenuItem onClick={() => onAction("undo")}><span className="mi" aria-hidden>↶</span>Undo last change</MenuItem>
            <MenuItem onClick={() => onAction("history")}><span className="mi" aria-hidden>☰</span>View history</MenuItem>
          </Menu>
          <Button onClick={onMoveNext}>Move into {mShort(nextM(value))} <span aria-hidden>→</span></Button>
        </div>
      )}
    </div>
  );
}
