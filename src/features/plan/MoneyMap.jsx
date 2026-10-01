import React from "react";
import { Chip } from "../../components/ui";
import { fmt, fmtK } from "../../domain";

/** Salary → bank → routes overview, one row per bank. */
export function MoneyMap({ plan, month }) {
  return (
    <div className="map">
      <div className="h">
        <h3>Where the money goes</h3>
        <p>Salary lands in a bank, then leaves as cash, on a card, or straight out.</p>
      </div>
      {month.banks.map((B) => {
        const ins = B.rows.filter((r) => r.flow === "in");
        const withdrawals = B.rows.filter((r) => r.origin === "withdrawal");
        const billedCards = plan.cards.filter((x) => x.bank === B.o.id);
        const direct = B.rows.filter((r) => r.flow === "out" && r.origin !== "withdrawal" && r.origin !== "bill");
        const directSum = direct.reduce((s, r) => s + r.amt, 0);
        return (
          <div className="mrow" key={B.o.id}>
            <div className="chips r">
              {ins.length === 0 && <Chip tone="mute" label="No money in" />}
              {ins.map((r) => <Chip key={r.key} tone="in" label={r.label.replace(/ salary$/, "")} value={fmtK(r.amt)} />)}
            </div>
            <div className="arw" aria-hidden>→</div>
            <div className="mbank">
              <b>{B.o.name}</b>
              <span className={"bal " + (B.closing < 0 ? "neg" : "")}>{fmt(B.closing, 0)}</span>
              <span className="sub">{B.closing < 0 ? "short" : "left"}</span>
            </div>
            <div className="arw" aria-hidden>→</div>
            <div className="chips">
              {withdrawals.map((r) => <Chip key={r.key} tone="cash" label="Cash" value={fmtK(r.amt)} />)}
              {billedCards.map((x) => {
                const cc = month.cards.find((y) => y.o.id === x.id);
                return <Chip key={x.id} tone="card" label={x.name} value={fmtK(cc ? cc.due : 0)} />;
              })}
              {direct.length > 0 && <Chip tone="dir" label={direct.length + " direct"} value={fmtK(directSum)} />}
              {withdrawals.length + billedCards.length + direct.length === 0 && <Chip tone="mute" label="Nothing paid from here" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
