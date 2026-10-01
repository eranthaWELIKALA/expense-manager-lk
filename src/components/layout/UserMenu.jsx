import React from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Menu, MenuDivider, MenuItem, MenuLabel } from "../ui";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { errorMessage } from "../../services/errors";

export function UserMenu() {
  const { signOut } = useAuth();
  const { account, incoming } = useWorkspace();
  const navigate = useNavigate();
  const toast = useToast();

  const doSignOut = async () => {
    try { await signOut(); navigate("/sign-in", { replace: true }); } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <Menu trigger={({ toggle, props }) => (
      <button type="button" className="user-btn" onClick={toggle} aria-label="Account menu" {...props}>
        <Avatar name={account.displayName} email={account.email} />
        {incoming.length > 0 && <span className="dot-badge" aria-label={`${incoming.length} invitations`}>{incoming.length}</span>}
      </button>
    )}>
      <MenuLabel>
        <b>{account.displayName || "Your account"}</b>
        <small>{account.email}</small>
      </MenuLabel>
      <MenuDivider />
      <MenuItem onClick={() => navigate("/settings/account")}>Account settings</MenuItem>
      <MenuItem onClick={() => navigate("/settings/profiles")}>Profiles & sharing</MenuItem>
      <MenuItem onClick={() => navigate("/settings/invitations")}>
        <span className="menu-grow">Invitations</span>
        {incoming.length > 0 && <span className="dot-badge inline">{incoming.length}</span>}
      </MenuItem>
      <MenuDivider />
      <MenuItem onClick={doSignOut}>Sign out</MenuItem>
    </Menu>
  );
}
