import React, { useState } from "react";
import { Button, EmptyState, Modal, MoneyInput } from "../../components/ui";
import { dayMonthLabel, fmt, lines, mLabel, mShort, nextM, parseAmount, statementName } from "../../domain";

/** Confirm moving into next month, with optional opening-balance corrections. */
export function RollDialog({ plan, monthKey, month, onClose, onConfirm }) {
  const nk = nextM(monthKey);
  const [adj, setAdj] = useState({});
  // card statements whose bill falls next month
  const bills = lines(plan, nk).filter((l) => l.origin === "bill" && Number(l.plan) > 0.005)
    .map((l) => ({ o: plan.cards.find((c) => "b:" + c.id === l.key) || { id: l.key, name: l.label }, due: l.plan, date: l.date, cycle: l.cycle }));
  const bankName = (id) => (plan.banks.find((b) => b.id === id) || {}).name;
  const balances = [...month.banks.map((x) => ({ ...x, k: "bank" })), ...month.wallets.map((x) => ({ ...x, k: "cash" }))];

  const confirm = () => {
    const parsed = {};
    Object.keys(adj).forEach((k) => { const v = parseAmount(adj[k]); if (v !== null) parsed[k] = v; });
    onConfirm(parsed);
  };

  return (
    <Modal
      title={"Move into " + mLabel(nk)}
      description={`Balances roll over on their own. This is what ${mLabel(monthKey)} hands across.`}
      onClose={onClose}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={confirm}>Open {mShort(nk)}</Button>
      </>}
    >
      <div className="cl" style={{ padding: "10px 0 4px" }}>Balances brought forward</div>
      {balances.map((B) => {
        const k = B.k + ":" + B.o.id;
        return (
          <div className="crry" key={k}>
            <div className="nm">{B.o.name}<small>{B.k === "cash" ? "cash on hand" : "bank"} · closes at {fmt(B.closing)}</small></div>
            <span className={"n " + (B.closing < 0 ? "neg" : "")} style={{ fontSize: 13, fontWeight: 600 }}>{fmt(B.closing)}</span>
            <MoneyInput className="adj" allowNegative placeholder="adjust" aria-label={"Adjust " + B.o.name}
              title="Correct the opening balance if the real bank differs"
              value={adj[k] ?? ""} onChange={(v) => setAdj((a) => ({ ...a, [k]: v }))} />
          </div>
        );
      })}
      <div className="cl" style={{ padding: "16px 0 4px" }}>Card bills landing in {mShort(nk)}</div>
      {bills.length === 0 && <EmptyState>No card charges to bill forward.</EmptyState>}
      {bills.map((x) => (
        <div className="crry" key={x.o.id}>
          <div className="nm">{x.o.name}<small>{x.cycle ? statementName(x.cycle) + " · " : ""}debits {bankName(x.o.bank)}{x.date ? " · due " + dayMonthLabel(x.date) : ""}</small></div>
          <span className="n" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(x.due)}</span>
        </div>
      ))}
      <p className="mut" style={{ fontSize: 12.5, padding: "12px 0 0", margin: 0 }}>
        Salaries, recurring items and live installments are added to {mShort(nk)} automatically.
      </p>
    </Modal>
  );
}
