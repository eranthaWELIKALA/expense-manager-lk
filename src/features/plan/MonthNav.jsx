import React from "react";
import { Button } from "../../components/ui";
import { mLabel, mShort, nextM, prevM } from "../../domain";

/** Month rail: prev/next, a pill per opened month, and the roll-over action. */
export function MonthNav({ value, items, openedMonths, onSelect, onMoveNext, canEdit }) {
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
      {canEdit && <Button variant="primary" onClick={onMoveNext}>Move into {mShort(nextM(value))} →</Button>}
    </div>
  );
}
