import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { backend } from "../services/backend";

const AuthContext = createContext(null);

/**
 * Session state for the whole app.
 * status: "loading" | "signed-in" | "signed-out"
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: "loading", user: null });
  const navigate = useNavigate();

  useEffect(() => {
    let live = true;
    backend.auth.getUser().then((user) => {
      if (live) setState({ status: user ? "signed-in" : "signed-out", user });
    });
    const off = backend.auth.onChange((user, event) => {
      if (!live) return;
      setState({ status: user ? "signed-in" : "signed-out", user });
      // Supabase signs the user in from the reset email; send them to set a new password.
      if (event === "PASSWORD_RECOVERY") navigate("/reset-password", { replace: true });
    });
    return () => { live = false; off(); };
  }, [navigate]);

  const value = useMemo(() => ({
    ...state,
    signIn: backend.auth.signIn,
    signUp: backend.auth.signUp,
    signOut: backend.auth.signOut,
    requestPasswordReset: backend.auth.requestPasswordReset,
    updatePassword: backend.auth.updatePassword,
  }), [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};
