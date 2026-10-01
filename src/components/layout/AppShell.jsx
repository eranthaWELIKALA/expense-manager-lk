import React from "react";
import { Link } from "react-router-dom";
import { Banner, Button, LoadingScreen } from "../ui";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { backend } from "../../services/backend";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { UserMenu } from "./UserMenu";
import { SuspenseOutlet } from "./SuspenseOutlet";

/** Signed-in chrome: brand, profile switcher, account menu. */
export function AppShell() {
  const { ready, error } = useWorkspace();

  return (
    <div className="wrap">
      <header className="top">
        <Link to="/" className="brand"><b>Monthly Money Plan</b><span>by bank account</span></Link>
        {ready && <ProfileSwitcher />}
        <div className="top-end">{ready && <UserMenu />}</div>
      </header>

      {backend.kind === "local" && (
        <Banner tone="warn">Demo mode — data is stored only in this browser and isn't protected. Don't enter real financial details.</Banner>
      )}

      {error
        ? <Banner tone="error" action={<Button size="sm" onClick={() => window.location.reload()}>Reload</Button>}>{error}</Banner>
        : ready ? <SuspenseOutlet /> : <LoadingScreen />}
    </div>
  );
}
