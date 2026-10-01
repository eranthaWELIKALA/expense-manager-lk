import React, { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Banner, Button, LoadingScreen, NavTabs } from "../../components/ui";
import { ProfileProvider, useProfile } from "../../contexts/ProfileContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { roleLabel } from "../../services/backend";
import { SuspenseOutlet } from "../../components/layout/SuspenseOutlet";
import { ErrorCode, errorMessage, isAppError } from "../../services/errors";

const SAVE_LABEL = { pending: "Unsaved changes", saving: "Saving…", saved: "Saved", error: "Not saved" };

function SaveIndicator() {
  const { saveState, retrySave } = useProfile();
  if (saveState === "idle") return null;
  if (saveState === "error") {
    return <span className="save err">Not saved <button type="button" className="linkish" onClick={retrySave}>Retry</button></span>;
  }
  return <span className={"save " + saveState} aria-live="polite">{SAVE_LABEL[saveState]}</span>;
}

function ProfileFrame() {
  const { status, loadError, meta, canEdit, isOwner, profileId, reload } = useProfile();
  const { rememberProfile } = useWorkspace();

  useEffect(() => { if (status === "ready") rememberProfile(profileId); }, [status, profileId, rememberProfile]);

  if (status === "loading") return <LoadingScreen label="Loading profile…" />;
  if (status === "error") {
    const missing = isAppError(loadError, ErrorCode.NOT_FOUND);
    return (
      <Banner tone={missing ? "warn" : "error"} action={missing ? <Link className="btn sm" to="/">Go to my profiles</Link> : <Button size="sm" onClick={reload}>Try again</Button>}>
        {missing ? "This profile doesn't exist or you no longer have access to it." : errorMessage(loadError)}
      </Banner>
    );
  }

  const base = `/p/${profileId}`;
  return (
    <>
      <div className="phdr">
        <h1 className="phdr-name">{meta.name}</h1>
        <span className="mut phdr-cur">{meta.currency}</span>
        {meta.role !== "owner" && <Badge tone="acc">{roleLabel(meta.role)}</Badge>}
        <SaveIndicator />
        <NavTabs keepSearch items={[
          { to: base + "/month", label: "Month" },
          { to: base + "/commitments", label: "Commitments" },
          { to: base + "/setup", label: "Setup" },
        ]} />
        <Link className="btn sm" to={`/settings/profiles/${profileId}`}>{isOwner ? "Share" : "Details"}</Link>
      </div>
      {!canEdit && <Banner tone="info">You have view-only access to this profile.</Banner>}
      <SuspenseOutlet />
    </>
  );
}

/** /p/:profileId/* — loads the profile and renders the Month / Commitments / Setup tabs. */
export default function ProfileLayout() {
  const { profileId } = useParams();
  // key: fully reset state (and flush saves) when switching profiles
  return (
    <ProfileProvider key={profileId} profileId={profileId}>
      <ProfileFrame />
    </ProfileProvider>
  );
}
