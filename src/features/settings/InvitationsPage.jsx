import React, { useEffect } from "react";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { IncomingInvitations } from "../invitations/IncomingInvitations";
import { SettingsSection } from "./SettingsLayout";

export default function InvitationsPage() {
  const { account, refreshInvitations } = useWorkspace();
  useEffect(() => { refreshInvitations(); }, [refreshInvitations]);
  return (
    <>
      <h1 className="page-title">Invitations</h1>
      <SettingsSection title="Waiting for you" description={`Invitations sent to ${account.email}.`}>
        <IncomingInvitations />
      </SettingsSection>
    </>
  );
}
