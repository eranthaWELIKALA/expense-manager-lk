import React from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { Badge, Menu, MenuDivider, MenuItem, MenuLabel } from "../ui";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { roleLabel } from "../../services/backend";

/** Dropdown to jump between the profiles this account can open. */
export function ProfileSwitcher() {
  const { profiles } = useWorkspace();
  const navigate = useNavigate();
  const match = useMatch("/p/:profileId/*");
  const current = profiles.find((p) => p.id === match?.params.profileId);

  if (profiles.length === 0) return null;

  return (
    <Menu align="left" trigger={({ toggle, props }) => (
      <button type="button" className="switcher" onClick={toggle} {...props}>
        <span className="switcher-lbl">Profile</span>
        <span className="switcher-name">{current ? current.name : "Choose a profile"}</span>
        <span aria-hidden className="caret">▾</span>
      </button>
    )}>
      <MenuLabel>Your profiles</MenuLabel>
      {profiles.map((p) => (
        <MenuItem key={p.id} className={p.id === current?.id ? "on" : undefined} onClick={() => navigate(`/p/${p.id}/month`)}>
          <span className="menu-grow">{p.name}</span>
          {p.role !== "owner" && <Badge tone="acc">{roleLabel(p.role)}</Badge>}
          <span className="mut menu-cur">{p.currency}</span>
        </MenuItem>
      ))}
      <MenuDivider />
      <MenuItem onClick={() => navigate("/settings/profiles?new=1")}>+ New profile</MenuItem>
      <MenuItem onClick={() => navigate("/settings/profiles")}>Manage profiles</MenuItem>
    </Menu>
  );
}
