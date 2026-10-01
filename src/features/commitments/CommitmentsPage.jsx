import React from "react";
import { Badge, EmptyState, SectionHeader } from "../../components/ui";
import { useProfile } from "../../contexts/ProfileContext";
import { useViewMonth } from "../../hooks/useViewMonth";
import { N, fmt, fmtK, instFor, instPaid, mDiff, mLabel, mShort } from "../../domain";

function payerName(plan, via) {
  const list = via.kind === "card" ? plan.cards : via.kind === "cash" ? plan.wallets : plan.banks;
  return (list.find((x) => x.id === via.id) || {}).name;
}

function RunningItem({ plan, item, mk }) {
  const slice = instFor(item, mk);
  const paid = instPaid(item, mk);
  const pct = Math.min(100, (paid / (N(item.total) || 1)) * 100);
  return (
    <div className="ins">
      <div className="t">
        <b>{item.name}</b>
        <Badge tone="brass">{slice.of ? slice.n + " of " + slice.of : "month " + slice.n}</Badge>
        <span className="n" style={{ fontWeight: 600 }}>{fmt(slice.amount)}</span>
      </div>
      <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={item.name + " paid"}>
        <i style={{ width: pct + "%" }} />
      </div>
      <div className="m">
        <span>{fmtK(paid)} of {fmtK(item.total)} · {payerName(plan, item.via) || "—"}</span>
        <span>{fmtK(N(item.total) - paid)} to go</span>
      </div>
    </div>
  );
}

function IdleItem({ item, mk }) {
  const started = mDiff(item.startMonth, mk) >= 0;
  return (
    <div className="ins">
      <div className="t">
        <b>{item.name}</b>
        <Badge>{started ? "paid off" : "starts " + mShort(item.startMonth)}</Badge>
        <span className="n mut">{fmtK(item.total)}</span>
      </div>
      <div className="bar"><i style={{ width: started ? "100%" : "0%", background: started ? "var(--jade)" : "var(--line)" }} /></div>
    </div>
  );
}

export default function CommitmentsPage() {
  const { data: plan } = useProfile();
  const [mk] = useViewMonth();
  const running = plan.installments.filter((it) => instFor(it, mk));
  const idle = plan.installments.filter((it) => !instFor(it, mk));

  return (
    <div className="cols">
      <div className="stack">
        <SectionHeader title={"Running in " + mLabel(mk)} />
        <div className="pan">
          {running.length === 0 && <EmptyState>Nothing running in {mLabel(mk)}.</EmptyState>}
          {running.map((it) => <RunningItem key={it.id} plan={plan} item={it} mk={mk} />)}
        </div>
      </div>
      <div className="stack">
        <SectionHeader title="Not running" />
        <div className="pan">
          {idle.length === 0 && <EmptyState>Everything is still running.</EmptyState>}
          {idle.map((it) => <IdleItem key={it.id} item={it} mk={mk} />)}
        </div>
      </div>
    </div>
  );
}
