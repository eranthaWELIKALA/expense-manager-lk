import React from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Panel, SectionHeader } from "../../components/ui";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { CreateProfileForm } from "./CreateProfileForm";
import { IncomingInvitations } from "../invitations/IncomingInvitations";

/** First run: create a profile, or join one you were invited to. */
export default function OnboardingPage() {
  const { account, profiles, incoming } = useWorkspace();
  const navigate = useNavigate();
  if (profiles.length > 0) return <Navigate to="/" replace />;

  return (
    <div className="narrow">
      <h1 className="page-title">Welcome{account.displayName ? ", " + account.displayName.split(" ")[0] : ""}</h1>
      <p className="mut">A profile is one money plan — your household, a business, or a parent's accounts. You can have several and share each with partners.</p>

      {incoming.length > 0 && (
        <>
          <SectionHeader title="You've been invited" />
          <Panel><IncomingInvitations /></Panel>
        </>
      )}

      <SectionHeader title={incoming.length > 0 ? "Or start your own" : "Create your first profile"} />
      <Panel>
        <CreateProfileForm submitLabel="Create and open" onCreated={(id) => navigate(`/p/${id}/month`)} />
      </Panel>
    </div>
  );
}
