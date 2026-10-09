import React from "react";
import { Badge, Button, ConfigCard, EmptyState } from "../../components/ui";
import { useProfile } from "../../contexts/ProfileContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useToast } from "../../contexts/ToastContext";
import { LOG_MAX, revertTo } from "../../domain";

const when = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/** Everything changed in this profile, newest first, with undo. */
export default function HistoryPage() {
  const { data: plan, update, canEdit } = useProfile();
  const confirm = useConfirm();
  const toast = useToast();
  const log = plan.log || [];
  // an undo reverts its target and everything between it and the undo
  const undone = new Set();
  log.forEach((e, i) => {
    const target = e.undid ? log.findIndex((x) => x.id === e.undid) : -1;
    for (let j = i + 1; target > i && j <= target; j++) undone.add(log[j].id);
  });

  const undo = async (entry, index) => {
    const later = log.slice(0, index);
    const ok = await confirm({
      danger: true,
      title: `Undo “${entry.label}”?`,
      message: later.length
        ? `The ${later.length} change${later.length === 1 ? "" : "s"} made after it will be undone too: ${later.map((e) => "“" + e.label + "”").join(", ")}. You can undo the undo afterwards.`
        : "The plan goes back to how it was before this change. You can undo the undo afterwards.",
      confirmLabel: later.length ? `Undo ${later.length + 1} changes` : "Undo",
    });
    if (!ok) return;
    update((d) => {
      const ix = (d.log || []).findIndex((e) => e.id === entry.id);
      return ix < 0 ? d : revertTo(d, ix);
    }, { label: `Undid “${entry.label}”` + (later.length ? ` and ${later.length} later change${later.length === 1 ? "" : "s"}` : ""), undid: entry.id });
    toast.info(`Undid “${entry.label}”.`);
  };

  return (
    <ConfigCard title="History" description={`The last ${LOG_MAX} changes to this profile. Undoing a change also undoes everything made after it.`}>
      <div className="items">
        {log.length === 0 && <EmptyState>No changes recorded yet.</EmptyState>}
        {log.map((e, i) => (
          <div className="list-row" key={e.id}>
            <div className="list-main">
              <b>{e.label}</b>
              <small>{when(e.at)}{e.by ? " · " + e.by : ""}</small>
            </div>
            {undone.has(e.id) && <Badge>undone</Badge>}
            {canEdit && <Button size="sm" onClick={() => undo(e, i)} aria-label={"Undo " + e.label}>Undo</Button>}
          </div>
        ))}
      </div>
    </ConfigCard>
  );
}
