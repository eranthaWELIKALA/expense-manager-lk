import React, { useState } from "react";
import { AccountLogo, Badge, Button, EmptyState, StatCard, cx } from "../../components/ui";
import { useProfile } from "../../contexts/ProfileContext";
import { useViewMonth } from "../../hooks/useViewMonth";
import { N, fmt, fmtK, instFor, instPaid, mDiff, mLabel, mShort, nextM, ordinal, viaLabel } from "../../domain";
import { viaLogo } from "../../lib/banks";
import { useItemEditor } from "../editors/useItemEditor";

const addMonths = (k, n) => { let m = k; for (let i = 0; i < n; i++) m = nextM(m); return m; };

/** Months still to pay after `mk` (0 = this is the last one). */
function monthsLeft(item, mk) {
  const slice = instFor(item, mk);
  if (!slice) return 0;
  if (slice.of) return slice.of - slice.n;
  const rest = N(item.total) - instPaid(item, mk);
  return rest > 0.005 && N(item.monthly) > 0 ? Math.ceil(rest / N(item.monthly)) : 0;
}

function viaName(plan, via) {
  const list = via?.kind === "card" ? plan.cards : via?.kind === "cash" ? plan.wallets : plan.banks;
  return (list.find((x) => x.id === via?.id) || {}).name || "";
}

function Row({ plan, item, mk, editor, running }) {
  const paid = running ? instPaid(item, mk) : mDiff(item.startMonth, mk) >= 0 ? N(item.total) : 0;
  const total = N(item.total) || 1;
  const pct = Math.min(100, (paid / total) * 100);
  const slice = instFor(item, mk);
  const left = running ? monthsLeft(item, mk) : 0;
  const started = mDiff(item.startMonth, mk) >= 0;
  return (
    <div className="inst">
      <AccountLogo {...viaLogo(plan, item.via)} name={viaName(plan, item.via) || item.name} size="lg" />
      <div className="inst-main">
        <div className="inst-t">
          <b>{item.name}</b>
          {running
            ? <Badge tone="brass">{slice.of ? slice.n + " of " + slice.of : "month " + slice.n}</Badge>
            : <Badge tone={started ? "jade" : "grey"}>{started ? "paid off" : "starts " + mShort(item.startMonth)}</Badge>}
          {item.auto && <Badge>auto-debit</Badge>}
        </div>
        <div className="inst-via">{viaLabel(plan, item.via)}{item.day ? " · due " + ordinal(item.day) : ""} · from {mShort(item.startMonth)}</div>
        <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={item.name + " paid"}>
          <i className={cx(pct >= 99.5 && "done", !started && "idle")} style={{ width: pct + "%" }} />
        </div>
        <div className="inst-m">
          <span><b className="n">{fmtK(paid)}</b> of <span className="n">{fmtK(item.total)}</span> paid</span>
          <span>{running ? `${fmtK(N(item.total) - paid)} to go · ${left ? "ends " + mLabel(addMonths(mk, left)) : "last payment this month"}` : started ? "Finished" : "Not started"}</span>
        </div>
      </div>
      <div className="inst-r">
        <b className="n">{running ? fmt(slice.amount, 0) : "—"}</b>
        <small>{running ? "this month" : started ? "nothing due" : "from " + mShort(item.startMonth)}</small>
        {editor.canEdit && <Button size="sm" variant="ghost" onClick={() => editor.openEdit("installments", item)} aria-label={"Edit " + item.name}>Edit</Button>}
      </div>
    </div>
  );
}

export default function CommitmentsPage() {
  const { data: plan } = useProfile();
  const [mk] = useViewMonth();
  const editor = useItemEditor({ startMonth: mk });
  const [tab, setTab] = useState("running");

  const byEnd = (a, b) => monthsLeft(a, mk) - monthsLeft(b, mk);
  const running = plan.installments.filter((it) => instFor(it, mk)).sort(byEnd);
  const idle = plan.installments.filter((it) => !instFor(it, mk)).sort((a, b) => (a.startMonth < b.startMonth ? 1 : -1));
  const monthlyTotal = running.reduce((s, it) => s + instFor(it, mk).amount, 0);
  const owed = running.reduce((s, it) => s + Math.max(0, N(it.total) - instPaid(it, mk)), 0) + monthlyTotal;
  const next = running[0];
  const items = tab === "running" ? running : idle;

  return (
    <>
      <div className="page-head2">
        <div>
          <h2>Installments</h2>
          <p>Leases, loans and card plans, and how far along each one is. Viewing {mLabel(mk)}.</p>
        </div>
        {editor.canEdit && <Button variant="primary" onClick={() => editor.openAdd("installments")}>+ Add installment</Button>}
      </div>

      <div className="stats">
        <StatCard highlight label="Due this month" value={fmt(monthlyTotal, 0)} sub={`${running.length} installment${running.length === 1 ? "" : "s"} running`} />
        <StatCard label="Still owed" value={fmt(owed, 0)} sub="across everything running, this month included" />
        <StatCard label="Next to finish" value={next ? next.name : "—"} subTone="pos"
          sub={next ? (monthsLeft(next, mk) ? `Last payment in ${mLabel(addMonths(mk, monthsLeft(next, mk)))}` : "Last payment this month") + ` · frees ${fmt(instFor(next, mk).amount, 0)} / month` : "Nothing running"} />
      </div>

      <div className="tabbar">
        <div className="mseg" role="group" aria-label="Show">
          <button type="button" aria-pressed={tab === "running"} className={cx(tab === "running" && "on")} onClick={() => setTab("running")}>Running <span className="ct">{running.length}</span></button>
          <button type="button" aria-pressed={tab === "idle"} className={cx(tab === "idle" && "on")} onClick={() => setTab("idle")}>Upcoming &amp; paid off <span className="ct">{idle.length}</span></button>
        </div>
        {tab === "running" && running.length > 1 && <span className="mut">Sorted by what finishes first</span>}
      </div>

      <section className="insts" aria-label={tab === "running" ? "Running installments" : "Upcoming and paid-off installments"}>
        {items.length === 0 && <EmptyState>{tab === "running" ? `Nothing running in ${mLabel(mk)}.` : "Nothing upcoming or paid off."}</EmptyState>}
        {items.map((it) => <Row key={it.id} plan={plan} item={it} mk={mk} editor={editor} running={tab === "running"} />)}
      </section>
      {editor.dialogs}
    </>
  );
}
