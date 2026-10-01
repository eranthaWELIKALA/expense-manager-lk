import React from "react";
import { NavLink } from "react-router-dom";
import { cx } from "../../components/ui";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { SuspenseOutlet } from "../../components/layout/SuspenseOutlet";

export default function SettingsLayout() {
  const { incoming } = useWorkspace();
  const link = ({ isActive }) => cx("side-link", isActive && "on");
  return (
    <div className="settings">
      <nav className="side" aria-label="Settings">
        <h2 className="side-title">Settings</h2>
        <NavLink to="/settings/account" className={link}>Account</NavLink>
        <NavLink to="/settings/profiles" className={link}>Profiles & sharing</NavLink>
        <NavLink to="/settings/invitations" className={link}>
          Invitations{incoming.length > 0 && <span className="dot-badge inline">{incoming.length}</span>}
        </NavLink>
      </nav>
      <div className="settings-main"><SuspenseOutlet /></div>
    </div>
  );
}

/** Heading + description + content block used on every settings page. */
export function SettingsSection({ title, description, children, action, danger }) {
  return (
    <section className={cx("sset", danger && "danger")}>
      <div className="sset-h">
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      <div className="sset-b">{children}</div>
    </section>
  );
}
