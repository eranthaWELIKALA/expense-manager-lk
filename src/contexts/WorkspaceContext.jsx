import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { backend } from "../services/backend";
import { errorMessage } from "../services/errors";
import { useAuth } from "./AuthContext";

const WorkspaceContext = createContext(null);
const lastProfileKey = (userId) => "mmp:last-profile:" + userId;

/**
 * Everything about the signed-in account that isn't a single profile:
 * account settings, the profiles you can open, and invitations waiting for you.
 */
export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [account, setAccount] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [incoming, setIncoming] = useState([]);
  const [error, setError] = useState(null);

  const refreshAccount = useCallback(async () => setAccount(await backend.account.get()), []);
  const refreshProfiles = useCallback(async () => setProfiles(await backend.profiles.list()), []);
  const refreshInvitations = useCallback(async () => setIncoming(await backend.sharing.incoming()), []);

  useEffect(() => {
    let live = true;
    Promise.all([backend.account.get(), backend.profiles.list(), backend.sharing.incoming()])
      .then(([a, p, i]) => { if (live) { setAccount(a); setProfiles(p); setIncoming(i); } })
      .catch((e) => live && setError(errorMessage(e)));
    return () => { live = false; };
  }, [user.id]);

  const rememberProfile = useCallback((id) => {
    try { localStorage.setItem(lastProfileKey(user.id), id); } catch { /* storage disabled */ }
  }, [user.id]);

  const lastProfileId = useCallback(() => {
    try { return localStorage.getItem(lastProfileKey(user.id)); } catch { return null; }
  }, [user.id]);

  const value = useMemo(() => ({
    account, profiles, incoming, error, ready: !!account && !!profiles,
    refreshAccount, refreshProfiles, refreshInvitations, rememberProfile, lastProfileId,
  }), [account, profiles, incoming, error, refreshAccount, refreshProfiles, refreshInvitations, rememberProfile, lastProfileId]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
};
