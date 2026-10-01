import React, { useCallback, useEffect, useState } from "react";
import { Avatar, Badge, Button, ConfirmDialog, Field, LoadingScreen, Select, TextInput } from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { INVITABLE_ROLES, backend, inviteLink, roleLabel } from "../../services/backend";
import { errorMessage } from "../../services/errors";
import { validateEmail } from "../../lib/validation";

/** Load members + pending invitations for a profile. Owners see invitations. */
export function useSharing(profileId, isOwner) {
  const [members, setMembers] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([
        backend.sharing.members(profileId),
        isOwner ? backend.sharing.invitations(profileId) : Promise.resolve([]),
      ]);
      setMembers(m); setInvitations(i);
    } catch (e) {
      toast.error(errorMessage(e));
      setMembers((cur) => cur || []);
    }
  }, [profileId, isOwner, toast]);

  useEffect(() => { refresh(); }, [refresh]);
  return { members, invitations, refresh };
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function InviteForm({ profileId, onInvited }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [touched, setTouched] = useState(false);
  const { run, pending } = useAsyncAction((p) => backend.sharing.invite(profileId, p));
  const emailErr = touched ? validateEmail(email) : "";

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (validateEmail(email)) return;
    const res = await run({ email: email.trim().toLowerCase(), role });
    if (!res.ok) return;
    const copied = await copy(inviteLink(res.value.id));
    toast.success(copied ? `Invitation created — link copied. Send it to ${res.value.email}.` : `Invitation created for ${res.value.email}.`);
    setEmail(""); setTouched(false);
    onInvited();
  };

  return (
    <form className="invite-form" onSubmit={submit} noValidate>
      <div className="invite-row">
        <Field label="Partner's email" error={emailErr} className="grow">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" />
        </Field>
        <Field label="Access">
          <Select value={role} onChange={(e) => setRole(e.target.value)}
            options={INVITABLE_ROLES.map((r) => ({ value: r.id, label: `${r.label} — ${r.description.toLowerCase()}` }))} />
        </Field>
        <Button type="submit" variant="primary" loading={pending} className="invite-btn">Invite</Button>
      </div>
      <p className="field-hint">
        They'll see the invitation when they sign in with this email, or you can send them the link. Invitations expire after 14 days.
      </p>
    </form>
  );
}

export function PendingInvitations({ invitations, onChange }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(null);
  if (invitations.length === 0) return null;

  const revoke = async (inv) => {
    const ok = await confirm({
      danger: true,
      title: `Revoke the invitation for ${inv.email}?`,
      message: "The invitation link will stop working. You can send a new invitation later.",
      confirmLabel: "Revoke invitation",
    });
    if (!ok) return;
    setBusy(inv.id);
    try { await backend.sharing.revoke(inv.id); toast.info(`Invitation for ${inv.email} revoked.`); onChange(); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(null); }
  };
  const copyLink = async (inv) => {
    if (await copy(inviteLink(inv.id))) toast.success("Link copied.");
    else toast.error("Couldn't copy — your browser blocked clipboard access.");
  };

  return (
    <div className="list">
      <div className="list-cap">Pending invitations</div>
      {invitations.map((inv) => {
        const expired = new Date(inv.expiresAt) < new Date();
        return (
          <div className="list-row" key={inv.id}>
            <Avatar email={inv.email} />
            <div className="list-main">
              <b>{inv.email}</b>
              <small>{expired ? "Expired" : "Expires " + new Date(inv.expiresAt).toLocaleDateString()}</small>
            </div>
            <Badge tone={expired ? "flag" : "brass"}>{expired ? "expired" : roleLabel(inv.role)}</Badge>
            {!expired && <Button size="sm" onClick={() => copyLink(inv)}>Copy link</Button>}
            <Button size="sm" variant="ghost" loading={busy === inv.id} onClick={() => revoke(inv)}>Revoke</Button>
          </div>
        );
      })}
    </div>
  );
}

export function MembersList({ profileId, members, isOwner, onChange }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [removing, setRemoving] = useState(null);

  if (!members) return <LoadingScreen compact label="Loading members…" />;

  const changeRole = async (m, role) => {
    const who = m.displayName || m.email;
    const ok = await confirm({
      danger: role === "viewer",
      title: `Make ${who} ${role === "viewer" ? "a viewer" : "an editor"}?`,
      message: role === "viewer"
        ? `${who} will no longer be able to change this plan. They can still see everything in it.`
        : `${who} will be able to add, change and delete anything in this plan.`,
      confirmLabel: role === "viewer" ? "Make viewer" : "Make editor",
    });
    if (!ok) return;
    try { await backend.sharing.setRole(profileId, m.userId, role); toast.success(`${m.displayName || m.email} is now ${roleLabel(role).toLowerCase()}.`); onChange(); }
    catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div className="list">
      {members.map((m) => {
        const you = m.userId === user.id;
        const editable = isOwner && !you && m.role !== "owner";
        return (
          <div className="list-row" key={m.userId}>
            <Avatar name={m.displayName} email={m.email} />
            <div className="list-main">
              <b>{m.displayName || m.email}{you && <span className="mut"> (you)</span>}</b>
              <small>{m.email}</small>
            </div>
            {editable ? (
              <select className="input sm" value={m.role} aria-label={"Role for " + (m.displayName || m.email)} onChange={(e) => changeRole(m, e.target.value)}>
                {INVITABLE_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            ) : (
              <Badge tone={m.role === "owner" ? "jade" : "acc"}>{roleLabel(m.role)}</Badge>
            )}
            {editable && <Button size="sm" variant="ghost" onClick={() => setRemoving(m)}>Remove</Button>}
          </div>
        );
      })}

      {removing && (
        <ConfirmDialog
          danger
          title={`Remove ${removing.displayName || removing.email}?`}
          message="They'll lose access to this profile immediately. You can invite them again later."
          confirmLabel="Remove access"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try { await backend.sharing.removeMember(profileId, removing.userId); toast.info("Access removed."); setRemoving(null); onChange(); }
            catch (e) { toast.error(errorMessage(e)); }
          }}
        />
      )}
    </div>
  );
}
