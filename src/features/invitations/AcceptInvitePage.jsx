import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Banner, Button, LoadingScreen } from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { roleLabel } from "../../services/backend";
import { useRespondInvitation } from "./IncomingInvitations";

/** Landing page for an invitation link: /invite/:inviteId */
export default function AcceptInvitePage() {
  const { inviteId } = useParams();
  const { user, signOut } = useAuth();
  const { incoming, refreshInvitations } = useWorkspace();
  const { respond, busy } = useRespondInvitation();
  const [checked, setChecked] = useState(false);
  const navigate = useNavigate();
  const decline = async (inv) => { if (await respond(inv, false)) navigate("/", { replace: true }); };

  useEffect(() => {
    refreshInvitations().finally(() => setChecked(true));
  }, [refreshInvitations]);

  if (!checked) return <LoadingScreen label="Checking invitation…" />;

  const inv = incoming.find((i) => i.id === inviteId);
  if (!inv) {
    return (
      <div className="narrow">
        <h1 className="page-title">Invitation not available</h1>
        <Banner tone="warn">
          This invitation has expired, was already used, or was sent to a different email address than <b>{user.email}</b>.
        </Banner>
        <p className="mut">Ask the person who invited you to send a new invitation, or sign in with the invited email address.</p>
        <div className="form-actions start">
          <Button onClick={signOut}>Sign in with another account</Button>
          <Link className="btn" to="/">Go to my profiles</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="narrow">
      <h1 className="page-title">Join “{inv.profileName}”</h1>
      <p>
        <b>{inv.invitedByName || inv.invitedByEmail}</b> invited you as <b>{roleLabel(inv.role).toLowerCase()}</b>.
        {inv.role === "viewer" ? " You'll be able to see the plan but not change it." : " You'll be able to edit the plan together."}
      </p>
      <div className="form-actions start">
        <Button variant="primary" loading={busy === inv.id} disabled={!!busy} onClick={() => respond(inv, true)}>Accept invitation</Button>
        <Button disabled={!!busy} onClick={() => decline(inv)}>Decline</Button>
      </div>
    </div>
  );
}
