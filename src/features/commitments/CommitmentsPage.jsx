import React from "react";
import { Badge, Button, EmptyState, SectionHeader } from "../../components/ui";
import { useProfile } from "../../contexts/ProfileContext";
import { useViewMonth } from "../../hooks/useViewMonth";
import { N, fmt, fmtK, instFor, instPaid, mDiff, mLabel, mShort, viaLabel } from "../../domain";
import { useItemEditor } from "../editors/useItemEditor";

function ItemActions({ item, editor }) {
  if (!editor.canEdit) return null;
  return (
    <span className="ins-act">
      <Button size="sm" onClick={() => editor.openEdit("installments", item)} aria-label={"Edit " + item.name}>Edit</Button>
      <Button size="sm" variant="ghost" onClick={() => editor.askDelete("installments", item)} aria-label={"Delete " + item.name}>Delete</Button>
    </span>
  );
}

function RunningItem({ plan, item, mk, editor }) {
  const slice = instFor(item, mk);
  const paid = instPaid(item, mk);
  const pct = Math.min(100, (paid / (N(item.total) || 1)) * 100);
  return (
    <div className="ins">
      <div className="t">
        <b>{item.name}</b>
        <Badge tone="brass">{slice.of ? slice.n + " of " + slice.of : "month " + slice.n}</Badge>
        <span className="n" style={{ fontWeight: 600 }}>{fmt(slice.amount)}</span>
        <ItemActions item={item} editor={editor} />
      </div>
      <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={item.name + " paid"}>
        <i style={{ width: pct + "%" }} />
      </div>
      <div className="m">
        <span>{fmtK(paid)} of {fmtK(item.total)} · {viaLabel(plan, item.via)}</span>
        <span>{fmtK(N(item.total) - paid)} to go</span>
      </div>
    </div>
  );
}

function IdleItem({ item, mk, editor }) {
  const started = mDiff(item.startMonth, mk) >= 0;
  return (
    <div className="ins">
      <div className="t">
        <b>{item.name}</b>
        <Badge>{started ? "paid off" : "starts " + mShort(item.startMonth)}</Badge>
        <span className="n mut">{fmtK(item.total)}</span>
        <ItemActions item={item} editor={editor} />
      </div>
      <div className="bar"><i style={{ width: started ? "100%" : "0%", background: started ? "var(--jade)" : "var(--line)" }} /></div>
    </div>
  );
}

export default function CommitmentsPage() {
  const { data: plan } = useProfile();
  const [mk] = useViewMonth();
  const editor = useItemEditor({ startMonth: mk });
  const running = plan.installments.filter((it) => instFor(it, mk));
  const idle = plan.installments.filter((it) => !instFor(it, mk));
  const monthlyTotal = running.reduce((s, it) => s + instFor(it, mk).amount, 0);

  return (
    <>
      <div className="page-actions">
        <span className="mut">{running.length} running in {mLabel(mk)} · <b className="n">{fmt(monthlyTotal)}</b> this month</span>
        {editor.canEdit && <Button variant="primary" onClick={() => editor.openAdd("installments")}>+ Add installment</Button>}
      </div>
      <div className="cols">
        <div className="stack">
          <SectionHeader title={"Running in " + mLabel(mk)} />
          <div className="pan">
            {running.length === 0 && <EmptyState>Nothing running in {mLabel(mk)}.</EmptyState>}
            {running.map((it) => <RunningItem key={it.id} plan={plan} item={it} mk={mk} editor={editor} />)}
          </div>
        </div>
        <div className="stack">
          <SectionHeader title="Not running" />
          <div className="pan">
            {idle.length === 0 && <EmptyState>Everything is still running.</EmptyState>}
            {idle.map((it) => <IdleItem key={it.id} item={it} mk={mk} editor={editor} />)}
          </div>
        </div>
      </div>
      {editor.dialogs}
    </>
  );
}
