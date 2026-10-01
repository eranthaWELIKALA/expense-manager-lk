import React from "react";
import { AddRow, Badge, EmptyState, Panel } from "../../components/ui";
import { fmt } from "../../domain";
import { LineHeader, LineRow } from "./LineRow";

/** A bank or cash ledger with running balance. */
export function Ledger({ ledger, kind, note, actions, onAdd }) {
  const base = Math.abs(ledger.opening) || 1;
  const short = ledger.closing < -0.005;
  return (
    <Panel
      title={ledger.o.name}
      warn={short}
      badges={<>{kind === "cash" && <Badge tone="brass">cash</Badge>}{short && <Badge tone="flag">short</Badge>}</>}
      total={fmt(ledger.closing)}
      totalTone={ledger.closing < 0 ? "neg" : undefined}
      note={note}
    >
      <div className="opn">
        <span className="t">Brought forward</span>
        <span className="v n">{fmt(ledger.opening)}</span>
      </div>
      <LineHeader />
      {ledger.rows.length === 0 && <EmptyState>Nothing moves through here yet.</EmptyState>}
      {ledger.rows.map((r) => (
        <LineRow key={r.key} line={r} balanceBase={base} actions={actions} lockedHint="Comes from elsewhere — change it at the source" />
      ))}
      {actions && <AddRow onAdd={onAdd} placeholder={kind === "cash" ? "Add a cash spend" : "Add a payment"} />}
    </Panel>
  );
}
