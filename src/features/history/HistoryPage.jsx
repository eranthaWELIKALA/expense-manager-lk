import React from "react";
import { Badge, Button, ConfigCard, EmptyState } from "../../components/ui";
import { useProfile } from "../../contexts/ProfileContext";
import { LOG_MAX } from "../../domain";
import { useUndo } from "./useUndo";

const when = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/** Everything changed in this profile, newest first, with undo. */
export default function HistoryPage() {
  const { data: plan, canEdit } = useProfile();
  const undo = useUndo();
  const log = plan.log || [];
  // an undo reverts its target and everything between it and the undo
  const undone = new Set();
  log.forEach((e, i) => {
    const target = e.undid ? log.findIndex((x) => x.id === e.undid) : -1;
    for (let j = i + 1; target > i && j <= target; j++) undone.add(log[j].id);
  });

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
            {canEdit && <Button size="sm" onClick={() => undo(i)} aria-label={"Undo " + e.label}>Undo</Button>}
          </div>
        ))}
      </div>
    </ConfigCard>
  );
}
