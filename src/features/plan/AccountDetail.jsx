import React from "react";
import { AccountLogo, Badge, Button, EmptyState, cx } from "../../components/ui";
import { fmt, val } from "../../domain";
import { LineHeader, LineRow } from "./LineRow";
import { isOpen } from "./accounts";

/** A figure under the account's name; `text` for words (a bank name) rather than an amount. */
const Stat = ({ label, value, tone, text = false }) => (
  <div className="dstat"><span>{label}</span><b className={cx(!text && "n", tone)}>{value}</b></div>
);

const LOCKED_HINT = { bank: "Comes from elsewhere — change it at the source", cash: "Comes from elsewhere — change it at the source", card: "Set by the installment" };

/**
 * Right column of the month view: one account's lines, or (account = null)
 * every open line across accounts. `openRows` = [{line, account}] for that view.
 */
export function AccountDetail({ account, openRows, actions, openOnly, onOpenOnly, nextLabel, monthLabel, onMoveNext }) {
  let head, stats, body;
  if (!account) {
    const toPay = openRows.filter((r) => r.line.flow === "out").reduce((s, r) => s + val(r.line), 0);
    head = { title: "Needs a tick", note: "Every unticked line this month, across all accounts" };
    stats = [
      <Stat key="n" label="Open lines" value={openRows.length} />,
      <Stat key="a" label="Accounts" value={new Set(openRows.map((r) => r.account.key)).size} />,
      <Stat key="p" label="Still to pay" value={fmt(toPay, 0)} />,
    ];
    body = (
      <>
        <LineHeader showBalance={false} />
        {openRows.length === 0 && <EmptyState>Everything this month is ticked off.</EmptyState>}
        {openRows.map(({ line, account: a }) => (
          <LineRow key={line.key} line={line} showBalance={false} account={a.name} actions={actions} lockedHint={LOCKED_HINT[a.kind]} />
        ))}
      </>
    );
  } else {
    const a = account;
    const card = a.kind === "card";
    const rows = openOnly ? a.rows.filter(isOpen) : a.rows;
    head = {
      title: a.name, logo: a.logo,
      badges: <>{a.kind === "cash" && <Badge tone="brass">cash</Badge>}{card && a.over && <Badge tone="flag">over plan</Badge>}{a.short && <Badge tone="flag">short</Badge>}</>,
      note: card
        ? <>{a.due > 0.005 ? <>Bills <b>{a.bankName || "no bank set"}</b> in {nextLabel}</> : "No charges yet"}{a.note ? " · " + a.note : ""}</>
        : a.note,
    };
    stats = card
      ? [
        <Stat key="c" label="Charged" value={fmt(a.charged, 0)} />,
        <Stat key="p" label="Planned" value={fmt(a.plan, 0)} />,
        ...(a.paid > 0.005 ? [<Stat key="a" label="Paid ahead" value={fmt(a.paid, 0)} tone="pos" />] : []),
        <Stat key="b" label={"To bill in " + nextLabel} value={fmt(a.due, 0)} />,
      ]
      : [
        <Stat key="o" label="Brought forward" value={fmt(a.opening, 0)} />,
        <Stat key="i" label="In" value={fmt(a.inSum, 0)} tone="pos" />,
        <Stat key="u" label="Out" value={fmt(a.outSum, 0)} />,
        <Stat key="c" label={a.short ? "Closing · short" : "Closing"} value={fmt(a.closing, 0)} tone={a.short ? "neg" : undefined} />,
        <Stat key="a" label="Actual balance" value={fmt(a.actual, 0)} tone={a.actual < -0.005 ? "neg" : undefined} />,
      ];
    const base = Math.abs(a.opening || 0) || 1;
    body = (
      <>
        <LineHeader showBalance={!card} />
        {rows.length === 0 && <EmptyState>{openOnly && a.rows.length ? "Everything here is ticked off." : card ? "No charges on this card." : "Nothing moves through here yet."}</EmptyState>}
        {rows.map((r) => <LineRow key={r.key} line={r} balanceBase={base} showBalance={!card} actions={actions} lockedHint={LOCKED_HINT[a.kind]} />)}
      </>
    );
  }

  return (
    <section className={cx("acctd", account?.short && "warn")} aria-label={head.title}>
      <div className="acct-h">
        {head.logo
          ? <AccountLogo {...head.logo} name={head.title} size="lg" />
          : <span className="alogo lg" aria-hidden><span className="alogo-tile todo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></svg>
          </span></span>}
        <div className="acct-id">
          <div className="acct-t"><h2>{head.title}</h2>{head.badges}</div>
          {head.note ? <p>{head.note}</p> : null}
        </div>
        {account && (
          <div className="mseg" role="group" aria-label="Show">
            <button type="button" aria-pressed={!openOnly} className={cx(!openOnly && "on")} onClick={() => onOpenOnly(false)}>All lines</button>
            <button type="button" aria-pressed={openOnly} className={cx(openOnly && "on")} onClick={() => onOpenOnly(true)}>Open only</button>
          </div>
        )}
      </div>
      <div className="dstats">{stats}</div>
      <div className="acct-b">{body}</div>
      {onMoveNext && (
        <div className="acct-f">
          <span>Done with {monthLabel}? Balances and open lines carry over.</span>
          <Button size="sm" onClick={onMoveNext}>Move into {nextLabel} <span aria-hidden>→</span></Button>
        </div>
      )}
    </section>
  );
}
