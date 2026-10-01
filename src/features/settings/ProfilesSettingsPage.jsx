import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, EmptyState, Modal } from "../../components/ui";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { roleLabel } from "../../services/backend";
import { CreateProfileForm } from "../profiles/CreateProfileForm";
import { SettingsSection } from "./SettingsLayout";

/** All profiles this account owns or has joined. */
export default function ProfilesSettingsPage() {
  const { profiles } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const creating = params.get("new") === "1";
  const setCreating = (on) => setParams(on ? { new: "1" } : {}, { replace: true });

  const owned = profiles.filter((p) => p.role === "owner");
  const shared = profiles.filter((p) => p.role !== "owner");

  const row = (p) => (
    <div className="list-row" key={p.id}>
      <div className="list-main">
        <b>{p.name}</b>
        <small>{p.currency} · updated {new Date(p.updatedAt).toLocaleDateString()}</small>
      </div>
      <Badge tone={p.role === "owner" ? "jade" : "acc"}>{roleLabel(p.role)}</Badge>
      <Link className="btn sm" to={`/settings/profiles/${p.id}`}>{p.role === "owner" ? "Manage" : "Details"}</Link>
      <Link className="btn sm pri" to={`/p/${p.id}/month`}>Open</Link>
    </div>
  );

  return (
    <>
      <h1 className="page-title">Profiles & sharing</h1>
      <p className="mut">One account can hold several money plans. Share any profile you own with partners by invitation.</p>

      <SettingsSection title="Your profiles" action={<Button size="sm" variant="primary" onClick={() => setCreating(true)}>New profile</Button>}>
        {owned.length === 0 ? <EmptyState>You don't own any profiles yet.</EmptyState> : <div className="list">{owned.map(row)}</div>}
      </SettingsSection>

      <SettingsSection title="Shared with you" description="Profiles other people invited you to.">
        {shared.length === 0 ? <EmptyState>Nothing shared with you yet.</EmptyState> : <div className="list">{shared.map(row)}</div>}
      </SettingsSection>

      {creating && (
        <Modal title="New profile" description="Start a separate money plan under this account." onClose={() => setCreating(false)}>
          <CreateProfileForm onCancel={() => setCreating(false)} onCreated={(id) => navigate(`/p/${id}/setup`)} />
        </Modal>
      )}
    </>
  );
}
