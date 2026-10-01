import React, { useState } from "react";
import { Button, EmptyState, Modal } from "../../components/ui";
import { fmt, mLabel, mShort, nextM, parseAmount } from "../../domain";

/** Confirm moving into next month, with optional opening-balance corrections. */
export function RollDialog({ plan, monthKey, month, onClose, onConfirm }) {
  const nk = nextM(monthKey);
  const [adj, setAdj] = useState({});
  const bills = month.cards.filter((x) => x.due > 0.005 && x.o.bank);
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
            <span className={"n " + (B.closing < 0 ? "neg" : "")} style={{ fontSize: 13, fontWeight: 600 }}>{fmt(B.closing, 0)}</span>
            <input placeholder="adjust" inputMode="decimal" aria-label={"Adjust " + B.o.name}
              title="Correct the opening balance if the real bank differs"
              value={adj[k] ?? ""} onChange={(e) => setAdj({ ...adj, [k]: e.target.value })} />
          </div>
        );
      })}
      <div className="cl" style={{ padding: "16px 0 4px" }}>Card bills landing in {mShort(nk)}</div>
      {bills.length === 0 && <EmptyState>No card charges to bill forward.</EmptyState>}
      {bills.map((x) => (
        <div className="crry" key={x.o.id}>
          <div className="nm">{x.o.name}<small>debits {bankName(x.o.bank)}</small></div>
          <span className="n" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(x.due)}</span>
        </div>
      ))}
      <p className="mut" style={{ fontSize: 12.5, padding: "12px 0 0", margin: 0 }}>
        Salaries, recurring items and live installments are added to {mShort(nk)} automatically.
      </p>
    </Modal>
  );
}
