import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { backend, canEditRole } from "../services/backend";
import { ErrorCode, errorMessage, isAppError } from "../services/errors";
import { normalizePlan } from "../domain";
import { useToast } from "./ToastContext";

const ProfileContext = createContext(null);
const SAVE_DELAY_MS = 600;

/**
 * Loads one profile and autosaves edits.
 *
 * Saves are debounced and serialised (one request in flight). Each save
 * carries the version it was based on; if a partner saved first the server
 * rejects it, we reload their version and tell the user. Remote edits
 * arrive via `subscribe` and are applied when we have nothing unsaved.
 *
 * saveState: "idle" | "pending" | "saving" | "saved" | "error"
 */
export function ProfileProvider({ profileId, children }) {
  const toast = useToast();
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [loadError, setLoadError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  const [saveState, setSaveState] = useState("idle");

  const dataRef = useRef(null);
  const versionRef = useRef(0);
  const pendingRef = useRef(null); // latest data not yet sent
  const inflightRef = useRef(false);
  const timerRef = useRef(null);
  const canEditRef = useRef(false);

  const applyServer = useCallback((p) => {
    const plan = normalizePlan(p.data);
    versionRef.current = p.version;
    dataRef.current = plan;
    pendingRef.current = null;
    setData(plan);
  }, []);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const p = await backend.profiles.get(profileId);
      const { data: _d, version: _v, ...m } = p;
      canEditRef.current = canEditRole(m.role);
      setMeta(m);
      applyServer(p);
      setSaveState("idle");
      setStatus("ready");
    } catch (e) {
      setLoadError(e);
      setStatus("error");
    }
  }, [profileId, applyServer]);

  useEffect(() => { load(); }, [load]);

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (inflightRef.current || !pendingRef.current) return;
    const snapshot = pendingRef.current;
    pendingRef.current = null;
    inflightRef.current = true;
    setSaveState("saving");
    let failed = false;
    try {
      versionRef.current = await backend.profiles.saveData(profileId, snapshot, versionRef.current);
      setSaveState(pendingRef.current ? "pending" : "saved");
    } catch (e) {
      failed = true;
      if (isAppError(e, ErrorCode.CONFLICT)) {
        try { applyServer(await backend.profiles.get(profileId)); } catch { /* keep local copy */ }
        setSaveState("idle");
        toast.error("A partner changed this profile at the same time. Their version is loaded — please redo your last change.");
      } else {
        if (!pendingRef.current) pendingRef.current = snapshot; // keep it for retry
        setSaveState("error");
        toast.error(errorMessage(e));
      }
    } finally {
      inflightRef.current = false;
      // After a failure, wait for the next edit or an explicit retry instead of looping.
      if (!failed && pendingRef.current) timerRef.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
    }
  }, [profileId, applyServer, toast]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  /** Replace the plan (pass the new object or an updater). No-op for viewers. */
  const update = useCallback((next) => {
    if (!canEditRef.current) return;
    const v = typeof next === "function" ? next(dataRef.current) : next;
    if (v === dataRef.current) return;
    dataRef.current = v;
    pendingRef.current = v;
    setData(v);
    setSaveState("pending");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
  }, []);

  /* partner edits */
  useEffect(() => {
    if (status !== "ready") return undefined;
    return backend.profiles.subscribe(profileId, (row) => {
      setMeta((m) => (m ? { ...m, name: row.name, currency: row.currency } : m));
      if (row.version > versionRef.current && !pendingRef.current && !inflightRef.current) {
        applyServer(row);
      }
    });
  }, [profileId, status, applyServer]);

  /* don't lose edits on navigation / tab close */
  useEffect(() => {
    const warn = (e) => {
      if (pendingRef.current || inflightRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      flushRef.current();
    };
  }, [profileId]);

  const value = useMemo(() => ({
    profileId, status, loadError, meta, data, saveState,
    role: meta?.role, canEdit: canEditRole(meta?.role), isOwner: meta?.role === "owner",
    update, retrySave: flush, reload: load,
  }), [profileId, status, loadError, meta, data, saveState, update, flush, load]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export const useProfile = () => {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside <ProfileProvider>");
  return ctx;
};
