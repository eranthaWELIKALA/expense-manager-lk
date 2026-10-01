import React from "react";
import { Navigate, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { LoadingScreen } from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import { safeNext } from "../../lib/validation";

/** Only signed-in users pass; others go to sign-in and come back afterwards. */
export function RequireAuth({ children }) {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === "loading") return <LoadingScreen />;
  if (status === "signed-out") {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  return children ?? <Outlet />;
}

/** Sign-in / sign-up pages: bounce signed-in users to where they were going. */
export function PublicOnly({ children }) {
  const { status } = useAuth();
  const [params] = useSearchParams();
  if (status === "loading") return <LoadingScreen />;
  if (status === "signed-in") return <Navigate to={safeNext(params.get("next"))} replace />;
  return children ?? <Outlet />;
}
