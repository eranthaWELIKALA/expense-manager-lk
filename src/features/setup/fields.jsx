import React from "react";

/** Pick where money is paid from: a bank, a cash pot, or a card. */
export function ViaSelect({ plan, value, onChange, ...rest }) {
  const cur = value ? value.kind + "|" + value.id : "";
  return (
    <select value={cur} onChange={(e) => { const [kind, id] = e.target.value.split("|"); onChange({ kind, id }); }} {...rest}>
      {!cur && <option value="">Choose…</option>}
      <optgroup label="Straight from bank">{plan.banks.map((b) => <option key={b.id} value={"bank|" + b.id}>{b.name}</option>)}</optgroup>
      <optgroup label="Cash">{plan.wallets.map((w) => <option key={w.id} value={"cash|" + w.id}>{w.name}</option>)}</optgroup>
      <optgroup label="Card">{plan.cards.map((x) => <option key={x.id} value={"card|" + x.id}>{x.name}</option>)}</optgroup>
    </select>
  );
}

export function BankSelect({ plan, value, onChange, allowNone, noneLabel = "None", ...rest }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} {...rest}>
      {(allowNone || !value) && <option value="">{allowNone ? noneLabel : "Choose…"}</option>}
      {plan.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );
}

/** Grid header + rows sharing a column template. */
export function ConfigGrid({ columns, headings, children }) {
  return (
    <>
      <div className="cl crow" style={{ gridTemplateColumns: columns }} aria-hidden>
        {headings.map((h, i) => <span key={i} style={h.right ? { textAlign: "right" } : undefined}>{h.label ?? h}</span>)}
        <span />
      </div>
      {React.Children.map(children, (row) => row && React.cloneElement(row, { style: { gridTemplateColumns: columns, ...row.props.style } }))}
    </>
  );
}

export const ConfigRow = ({ children, style }) => <div className="crow" style={style}>{children}</div>;
