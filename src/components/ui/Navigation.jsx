import React, { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cx } from "./cx";

/**
 * Route-driven tab bar. items: [{to, label, end?}]
 * `keepSearch` carries the current query string (e.g. ?m=2026-08) across tabs.
 */
export function NavTabs({ items, keepSearch = false, className }) {
  const { search } = useLocation();
  return (
    <nav className={cx("tabs", className)}>
      {items.map((it) => (
        <NavLink key={it.to} to={keepSearch ? { pathname: it.to, search } : it.to} end={it.end}
          className={({ isActive }) => cx("tab", isActive && "on")}>
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * Click-to-open dropdown. `trigger` receives {open, toggle, props}.
 * Closes on outside click, Escape, or when an item is chosen.
 */
export function Menu({ trigger, children, align = "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o), props: { "aria-haspopup": "menu", "aria-expanded": open } })}
      {open && (
        <div className={"menu-pop " + align} role="menu" onClick={(e) => e.target.closest("[data-close]") && setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ as: As = "button", children, className, ...rest }) {
  return <As role="menuitem" data-close className={cx("menu-item", className)} {...rest}>{children}</As>;
}

export const MenuDivider = () => <div className="menu-div" role="separator" />;
export const MenuLabel = ({ children }) => <div className="menu-lbl">{children}</div>;
