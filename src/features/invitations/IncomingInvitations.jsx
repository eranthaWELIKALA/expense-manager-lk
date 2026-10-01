import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, EmptyState } from "../../components/ui";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { backend, roleLabel } from "../../services/backend";
import { errorMessage } from "../../services/errors";

/** Hook: accept / decline an invitation and refresh workspace state. */
export function useRespondInvitation() {
  const { refreshProfiles, refreshInvitations } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);

  const respond = async (inv, accept) => {
    if (!accept && !(await confirm({
      danger: true,
      title: `Decline the invitation to “${inv.profileName}”?`,
      message: "You won't be able to accept it afterwards. The owner would have to invite you again.",
      confirmLabel: "Decline",
    }))) return false;
    setBusy(inv.id);
    try {
      const profileId = await backend.sharing.respond(inv.id, accept);
      await Promise.all([refreshProfiles(), refreshInvitations()]);
      if (accept) {
        toast.success(`You joined “${inv.profileName}”.`);
        navigate(`/p/${profileId}/month`);
      } else {
        toast.info("Invitation declined.");
      }
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  return { respond, busy };
}

export function InvitationCard({ inv, onRespond, busy }) {
  return (
    <div className="list-row">
      <div className="list-main">
        <b>{inv.profileName}</b>
        <small>
          From {inv.invitedByName || inv.invitedByEmail || "a partner"}{inv.invitedByName && inv.invitedByEmail ? ` (${inv.invitedByEmail})` : ""}
          {" · expires "}{new Date(inv.expiresAt).toLocaleDateString()}
        </small>
      </div>
      <Badge tone="acc">{roleLabel(inv.role)}</Badge>
      <Button size="sm" disabled={!!busy} onClick={() => onRespond(inv, false)}>Decline</Button>
      <Button size="sm" variant="primary" loading={busy === inv.id} disabled={!!busy} onClick={() => onRespond(inv, true)}>Accept</Button>
    </div>
  );
}

/** List of invitations waiting for the signed-in user. */
export function IncomingInvitations({ emptyText = "No invitations waiting for you." }) {
  const { incoming } = useWorkspace();
  const { respond, busy } = useRespondInvitation();
  if (incoming.length === 0) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <div className="list">
      {incoming.map((inv) => <InvitationCard key={inv.id} inv={inv} busy={busy} onRespond={respond} />)}
    </div>
  );
}
