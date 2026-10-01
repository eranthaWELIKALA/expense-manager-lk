import React, { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Badge, Banner, Button, ConfirmDialog, EmptyState, Field, FormError, Select, TextInput } from "../../components/ui";
import { useToast } from "../../contexts/ToastContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { backend, canEditRole, roleLabel } from "../../services/backend";
import { errorMessage } from "../../services/errors";
import { normalizePlan } from "../../domain";
import { CURRENCIES, validateName } from "../../lib/validation";
import { SettingsSection } from "./SettingsLayout";
import { InviteForm, MembersList, PendingInvitations, useSharing } from "./sharing";

const MAX_IMPORT_BYTES = 1_500_000;

function GeneralForm({ profile, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(profile.name);
  const [currency, setCurrency] = useState(profile.currency);
  const { run, pending, error } = useAsyncAction(() => backend.profiles.updateMeta(profile.id, { name: name.trim(), currency }));
  const nameErr = validateName(name, "Profile name");
  const dirty = name.trim() !== profile.name || currency !== profile.currency;

  const submit = async (e) => {
    e.preventDefault();
    if (nameErr) return;
    if ((await run()).ok) { toast.success("Profile updated."); onSaved(); }
  };

  return (
    <form onSubmit={submit} noValidate className="stack-form">
      <FormError>{error}</FormError>
      <Field label="Name" error={nameErr}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Currency">
        <Select value={currency} onChange={(e) => setCurrency(e.target.value)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
      </Field>
      <div className="form-actions start">
        <Button type="submit" variant="primary" loading={pending} disabled={!dirty}>Save</Button>
      </div>
    </form>
  );
}

function DataTools({ profile }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [pendingImport, setPendingImport] = useState(null);

  const exportJson = async () => {
    try {
      const p = await backend.profiles.get(profile.id);
      const blob = new Blob([JSON.stringify({ name: p.name, currency: p.currency, exportedAt: new Date().toISOString(), data: p.data }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${p.name.replace(/[^\w-]+/g, "_").slice(0, 40) || "profile"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return toast.error("That file is too large to import.");
    try {
      const parsed = JSON.parse(await file.text());
      const plan = normalizePlan(parsed && parsed.data ? parsed.data : parsed);
      setPendingImport({ plan, fileName: file.name });
    } catch (err) {
      toast.error(err instanceof SyntaxError ? "That file isn't valid JSON." : errorMessage(err));
    }
  };

  const doImport = async () => {
    try {
      const current = await backend.profiles.get(profile.id);
      await backend.profiles.saveData(profile.id, pendingImport.plan, current.version);
      toast.success("Plan imported.");
      setPendingImport(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="form-actions start">
      <Button onClick={exportJson}>Export as JSON</Button>
      {canEditRole(profile.role) && (
        <>
          <Button onClick={() => fileRef.current?.click()}>Import from JSON…</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={pickFile} />
        </>
      )}
      {pendingImport && (
        <ConfirmDialog
          danger
          title="Replace this plan?"
          message={`Everything in “${profile.name}” will be replaced with the contents of ${pendingImport.fileName}. Export first if you want a backup.`}
          confirmLabel="Replace plan"
          onClose={() => setPendingImport(null)}
          onConfirm={doImport}
        />
      )}
    </div>
  );
}

const ACTION_TEXT = {
  "profile.created": "created the profile",
  "profile.deleted": "deleted the profile",
  "invitation.created": (d) => `invited ${d.email} as ${d.role}`,
  "invitation.revoked": (d) => `revoked the invitation for ${d.email}`,
  "invitation.accepted": (d) => `joined as ${d.role}`,
  "invitation.declined": () => "declined an invitation",
  "member.role_changed": (d) => `changed a member from ${d.from} to ${d.to}`,
  "member.removed": () => "removed a member",
  "member.left": () => "left the profile",
};

function Activity({ profileId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    backend.sharing.activity(profileId).then(setRows, (e) => setError(errorMessage(e)));
  }, [profileId]);
  if (error) return <Banner tone="error">{error}</Banner>;
  if (!rows) return <EmptyState>Loading…</EmptyState>;
  if (rows.length === 0) return <EmptyState>No activity yet.</EmptyState>;
  return (
    <ul className="activity">
      {rows.map((r) => {
        const t = ACTION_TEXT[r.action];
        return (
          <li key={r.id}>
            <b>{r.actorName}</b> {typeof t === "function" ? t(r.details || {}) : t || r.action}
            <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString()}</time>
          </li>
        );
      })}
    </ul>
  );
}

/** /settings/profiles/:profileId — details, sharing, data and danger zone for one profile. */
export default function ProfileSettingsPage() {
  const { profileId } = useParams();
  const { profiles, refreshProfiles } = useWorkspace();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(null); // "delete" | "leave"

  const profile = profiles.find((p) => p.id === profileId);
  const isOwner = profile?.role === "owner";
  const sharing = useSharing(profileId, isOwner);

  if (!profile) return <Navigate to="/settings/profiles" replace />;

  const leaveOrDelete = async () => {
    try {
      if (confirm === "delete") await backend.profiles.remove(profile.id);
      else await backend.profiles.leave(profile.id);
      await refreshProfiles();
      toast.info(confirm === "delete" ? `“${profile.name}” was deleted.` : `You left “${profile.name}”.`);
      navigate("/settings/profiles", { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{profile.name}</h1>
        <Badge tone={isOwner ? "jade" : "acc"}>{roleLabel(profile.role)}</Badge>
        <Link className="btn sm pri" to={`/p/${profile.id}/month`}>Open profile</Link>
      </div>

      {isOwner && (
        <SettingsSection title="General">
          <GeneralForm key={profile.name + profile.currency} profile={profile} onSaved={refreshProfiles} />
        </SettingsSection>
      )}

      <SettingsSection
        title="People with access"
        description={isOwner
          ? "Invite partners to work on this profile. Editors can change the plan; viewers can only look."
          : "Only the owner can invite people or change access."}
      >
        {sharing.error && <Banner tone="error">{sharing.error}</Banner>}
        {isOwner && <InviteForm profileId={profile.id} onInvited={sharing.refresh} />}
        {isOwner && <PendingInvitations invitations={sharing.invitations} onChange={sharing.refresh} />}
        <MembersList profileId={profile.id} members={sharing.members} isOwner={isOwner} onChange={sharing.refresh} />
      </SettingsSection>

      <SettingsSection title="Data" description="Download a copy of this plan, or replace it from a file.">
        <DataTools profile={profile} />
      </SettingsSection>

      {isOwner && (
        <SettingsSection title="Activity" description="Recent sharing and access changes (last 50).">
          <Activity profileId={profile.id} />
        </SettingsSection>
      )}

      <SettingsSection danger title={isOwner ? "Delete profile" : "Leave profile"}
        description={isOwner
          ? "Permanently deletes the plan for everyone it's shared with. This can't be undone."
          : "You'll lose access until the owner invites you again."}>
        <Button variant="danger" onClick={() => setConfirm(isOwner ? "delete" : "leave")}>{isOwner ? "Delete profile…" : "Leave profile…"}</Button>
      </SettingsSection>

      {confirm && (
        <ConfirmDialog
          danger
          title={confirm === "delete" ? `Delete “${profile.name}”?` : `Leave “${profile.name}”?`}
          message={confirm === "delete" ? "All months, settings and sharing for this profile will be removed." : undefined}
          confirmText={confirm === "delete" ? profile.name : undefined}
          confirmLabel={confirm === "delete" ? "Delete forever" : "Leave"}
          onClose={() => setConfirm(null)}
          onConfirm={leaveOrDelete}
        />
      )}
    </>
  );
}
