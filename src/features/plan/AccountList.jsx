import React, { useState } from "react";
import { AccountLogo, cx } from "../../components/ui";
import { fmt } from "../../domain";

const status = (a) => {
  if (a.short) return { text: "goes short", dot: "short" };
  if (a.kind === "card") return { text: a.open ? a.open + " open" : a.due > 0.005 ? "bills next month" : "no charges", dot: a.open ? "open" : "ok" };
  return { text: a.open ? a.open + " open" : "all settled", dot: a.open ? "open" : "ok" };
};

function AccountButton({ a, on, onSelect }) {
  const s = status(a);
  return (
    <button type="button" className={cx("acc", on && "on")} aria-current={on || undefined} onClick={() => onSelect(a.key)}>
      <AccountLogo {...a.logo} name={a.name} />
      <span className="acc-main"><b>{a.name}</b><small><span className={"sdot " + s.dot} aria-hidden />{s.text}</small></span>
      <span className={cx("acc-bal n", a.short && "neg")}>{fmt(a.balance, 0)}</span>
    </button>
  );
}

const TodoIcon = ({ size = 16 }) => (
  <span className="alogo" aria-hidden><span className="alogo-tile todo">
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></svg>
  </span></span>
);

/**
 * Left column of the month view: every account, grouped, plus "Needs a tick".
 * selected: an account key or "open".
 * On narrow screens the list folds into a picker that shows the chosen account (see .accs-pick in plan.css).
 */
export function AccountList({ accounts, selected, onSelect, openCount }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false); // narrow screens only
  const pick = (key) => { setOpen(false); onSelect(key); };
  const chosen = [...accounts.banks, ...accounts.wallets, ...accounts.cards].find((a) => a.key === selected);
  const match = (a) => !q.trim() || a.name.toLowerCase().includes(q.trim().toLowerCase());
  const total = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
  const groups = [
    { label: "Banks", items: accounts.banks, total: fmt(total(accounts.banks, (x) => x.closing), 0) },
    { label: "Cash", items: accounts.wallets, total: fmt(total(accounts.wallets, (x) => x.closing), 0) },
    { label: "Cards", items: accounts.cards, total: fmt(total(accounts.cards, (x) => x.due), 0) + " due" },
  ].filter((g) => g.items.length);
  const all = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <nav className={cx("accs", open && "open")} aria-label="Accounts">
      <button type="button" className="accs-pick" aria-expanded={open} aria-controls="accs-body" onClick={() => setOpen((o) => !o)}>
        {chosen ? <AccountLogo {...chosen.logo} name={chosen.name} /> : <TodoIcon />}
        <span className="acc-main"><small>Showing</small><b>{chosen ? chosen.name : "Needs a tick"}</b></span>
        <span className="accs-pick-r">{all} account{all === 1 ? "" : "s"} <span className="caret" aria-hidden>▾</span></span>
      </button>
      <div className="accs-body" id="accs-body">
      {all > 5 && (
        <label className="accs-find">
          <span className="sr-only">Find an account</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an account" />
        </label>
      )}
      <button type="button" className={cx("acc", selected === "open" && "on")} aria-current={selected === "open" || undefined} onClick={() => pick("open")}>
        <TodoIcon />
        <span className="acc-main"><b>Needs a tick</b><small>All open lines</small></span>
        <span className="acc-bal n">{openCount}</span>
      </button>
      {groups.map((g) => {
        const items = g.items.filter(match);
        if (!items.length) return null;
        return (
          <div key={g.label} className="accs-grp">
            <div className="accs-h"><span>{g.label} · {g.items.length}</span><span className="n">{g.total}</span></div>
            {items.map((a) => <AccountButton key={a.key} a={a} on={selected === a.key} onSelect={pick} />)}
          </div>
        );
      })}
      {q.trim() && groups.every((g) => !g.items.some(match)) && <p className="accs-none">No account matches “{q.trim()}”.</p>}
      </div>
    </nav>
  );
}
