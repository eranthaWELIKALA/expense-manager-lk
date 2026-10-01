import React from "react";
import { Navigate } from "react-router-dom";
import { useWorkspace } from "../../contexts/WorkspaceContext";

/** "/" → last opened profile, first profile, or onboarding. */
export default function HomeRedirect() {
  const { profiles, lastProfileId } = useWorkspace();
  if (profiles.length === 0) return <Navigate to="/welcome" replace />;
  const last = lastProfileId();
  const target = profiles.find((p) => p.id === last) || profiles[0];
  return <Navigate to={`/p/${target.id}/month`} replace />;
}
