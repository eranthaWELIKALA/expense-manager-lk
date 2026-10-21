import React from "react";
import { AccountLogo, Badge, Button, EmptyState, cx } from "../../components/ui";
import { dayMonthLabel, fmt, ordinal, payDays, statementName, stmtDay, val } from "../../domain";
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
export function AccountDetail({ account, openRows, autoOpen = 0, hideAuto = false, onHideAuto, onPayCard, actions, openOnly, onOpenOnly, nextLabel }) {
  let head, stats, body;
  if (!account) {
    const toPay = openRows.filter((r) => r.line.flow === "out").reduce((s, r) => s + val(r.line), 0);
    head = { title: "Needs a tick", note: "Every unticked line this month, across all accounts" + (hideAuto && autoOpen ? ` · ${autoOpen} auto-debit${autoOpen === 1 ? "" : "s"} hidden` : "") };
    stats = [
      <Stat key="n" label="Open lines" value={openRows.length} />,
      <Stat key="a" label="Accounts" value={new Set(openRows.map((r) => r.account.key)).size} />,
      <Stat key="p" label="Still to pay" value={fmt(toPay)} />,
    ];
    body = (
      <>
        <LineHeader showBalance={false} />
        {openRows.length === 0 && <EmptyState>{hideAuto && autoOpen ? "Only auto-debits are left — they're marked paid on their due day." : "Everything this month is ticked off."}</EmptyState>}
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
      badges: <>{a.kind === "cash" && <Badge tone="brass">cash</Badge>}{card && a.late && <Badge tone="flag">bill overdue</Badge>}{card && a.overLimit && <Badge tone="flag">over limit</Badge>}{card && a.over && <Badge tone="flag">over plan</Badge>}{a.short && <Badge tone="flag">short</Badge>}</>,
      note: card
        ? <>{!a.o.bank ? "No bank set — pay it from any bank with Move money" : <>Bills <b>{a.bankName}</b></>}
          {stmtDay(a.o) ? ` · statement on the ${ordinal(stmtDay(a.o))}, pay within ${payDays(a.o)} days` : a.o.dueDay ? " · pay by the " + ordinal(a.o.dueDay) : ""}{a.note ? " · " + a.note : ""}</>
        : a.note,
    };
    stats = card
      ? [
        <Stat key="o" label="Balance" value={fmt(a.balance)} tone={a.overLimit ? "neg" : undefined} />,
        ...(a.instAhead > 0.005 ? [<Stat key="ia" label="Of which installments to come" value={fmt(a.instAhead)} />] : []),
        ...(a.limit ? [<Stat key="l" label={"Available of " + fmt(a.limit)} value={fmt(a.available)} tone={a.overLimit ? "neg" : "pos"} />] : []),
        ...(a.bill && a.bill.amount > 0.005 ? [<Stat key="d" label={(a.bill.cycle ? statementName(a.bill.cycle) + " · " : "") + (a.bill.date ? "pay by " + dayMonthLabel(a.bill.date) : "due this month")}
          value={a.bill.left > 0.005 ? fmt(a.bill.left) : "Paid"} tone={a.late ? "neg" : a.bill.left > 0.005 ? undefined : "pos"} />] : []),
        <Stat key="c" label="Charged" value={fmt(a.charged)} />,
        <Stat key="b" label={a.next && a.next.statement ? statementName(a.next.cycle) + " · on " + dayMonthLabel(a.next.statement) : "To bill in " + nextLabel} value={fmt(a.due)} />,
      ]
      : [
        <Stat key="o" label="Brought forward" value={fmt(a.opening)} />,
        <Stat key="i" label="In" value={fmt(a.inSum)} tone="pos" />,
        <Stat key="u" label="Out" value={fmt(a.outSum)} />,
        <Stat key="c" label={a.short ? "Closing · short" : "Closing"} value={fmt(a.closing)} tone={a.short ? "neg" : undefined} />,
        <Stat key="a" label="Actual balance" value={fmt(a.actual)} tone={a.actual < -0.005 ? "neg" : undefined} />,
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
        {!account && (autoOpen > 0 || hideAuto) && (
          <div className="mseg" role="group" aria-label="Auto-debits">
            <button type="button" aria-pressed={!hideAuto} className={cx(!hideAuto && "on")} onClick={() => onHideAuto(false)}>All</button>
            <button type="button" aria-pressed={hideAuto} className={cx(hideAuto && "on")} onClick={() => onHideAuto(true)}>Hide auto-debits</button>
          </div>
        )}
        {account && account.kind === "card" && onPayCard && (
          <Button size="sm" variant="primary" onClick={() => onPayCard(account.o.id)}>Pay card</Button>
        )}
        {account && (
          <div className="mseg" role="group" aria-label="Show">
            <button type="button" aria-pressed={!openOnly} className={cx(!openOnly && "on")} onClick={() => onOpenOnly(false)}>All lines</button>
            <button type="button" aria-pressed={openOnly} className={cx(openOnly && "on")} onClick={() => onOpenOnly(true)}>Open only</button>
          </div>
        )}
      </div>
      <div className="dstats">{stats}</div>
      <div className="acct-b">{body}</div>
    </section>
  );
}
