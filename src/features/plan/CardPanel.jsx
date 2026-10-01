import React from "react";
import { AddRow, Badge, EmptyState, Panel } from "../../components/ui";
import { fmt } from "../../domain";
import { LineHeader, LineRow } from "./LineRow";

/** A credit card: this month's charges, billed to a bank next month. */
export function CardPanel({ card, bankName, nextLabel, actions, onAdd }) {
  const over = card.actual > card.plan + 0.005 && card.actual > 0;
  const noteSuffix = card.o.note ? " · " + card.o.note : "";
  return (
    <Panel
      title={card.o.name}
      badges={over && <Badge tone="flag">over plan</Badge>}
      total={fmt(card.due)}
      note={card.due > 0.005
        ? <>Bills <b>{bankName || "no bank set"}</b> in {nextLabel}{noteSuffix}</>
        : <>No charges yet{noteSuffix}</>}
    >
      <LineHeader showBalance={false} />
      {card.rows.length === 0 && <EmptyState>No charges on this card.</EmptyState>}
      {card.rows.map((r) => (
        <LineRow key={r.key} line={r} showBalance={false} actions={actions} lockedHint="Set by the installment" />
      ))}
      {actions && <AddRow onAdd={onAdd} placeholder="Add a charge" />}
    </Panel>
  );
}
