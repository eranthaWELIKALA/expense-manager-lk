import React from "react";
import { Banner } from "../../components/ui";
import { backend } from "../../services/backend";
import { SuspenseOutlet } from "../../components/layout/SuspenseOutlet";

/** Centered card shell for sign-in, sign-up and password pages. */
export function AuthLayout({ children }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand auth-brand"><b>Monthly Money Plan</b><span>by bank account</span></div>
        {backend.kind === "local" && (
          <Banner tone="warn">Demo mode: accounts and data are stored only in this browser. Configure Supabase for real sign-in.</Banner>
        )}
        <SuspenseOutlet>{children}</SuspenseOutlet>
      </div>
    </div>
  );
}
