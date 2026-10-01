import React from "react";
import { cx } from "./cx";

/** Small pill. tone: jade | flag | brass | violet | acc | grey */
export function Badge({ tone = "grey", children, title }) {
  const t = { jade: "j", flag: "f", brass: "b", violet: "v", acc: "a", grey: "g" }[tone] || "g";
  return <span className={"chipx " + t} title={title}>{children}</span>;
}

/** Money-map chip. tone: in | cash | card | dir | mute */
export function Chip({ tone, label, value }) {
  return (
    <span className={cx("chip", tone === "mute" ? "mut" : tone)}>
      {label}{value !== undefined && <b>{value}</b>}
    </span>
  );
}

export function StatCard({ label, value, sub, highlight = false, subTone }) {
  return (
    <div className={cx("stat", highlight && "hi")}>
      <label>{label}</label>
      <div className="v">{value}</div>
      {sub && <div className={cx("sub", subTone)}>{sub}</div>}
    </div>
  );
}

export function SectionHeader({ title, children }) {
  return <div className="sect">{title}<i />{children}</div>;
}

export function EmptyState({ children, action }) {
  return (
    <div className="empty">
      {children}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

/** Card with header (title, badges, right-aligned total), optional note and body. */
export function Panel({ title, badges, total, totalTone, note, warn = false, children, bodyClass = "pbody" }) {
  return (
    <div className={cx("pan", warn && "warn")}>
      {(title || badges || total !== undefined) && (
        <div className="phead">
          {typeof title === "string" ? <h3>{title}</h3> : title}
          {badges}
          {total !== undefined && <span className={cx("ptot", totalTone)}>{total}</span>}
        </div>
      )}
      {note ? <div className="pnote">{note}</div> : null}
      {children !== undefined && <div className={bodyClass}>{children}</div>}
    </div>
  );
}

/** Settings-style section: title, action button, description, rows. */
export function ConfigCard({ title, description, action, children }) {
  return (
    <section className="cfg">
      <div className="h">
        <h3>{title}</h3>
        {action}
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Info / warning / error strip. */
export function Banner({ tone = "info", children, action }) {
  return (
    <div className={"banner " + tone} role={tone === "error" ? "alert" : undefined}>
      <span>{children}</span>
      {action}
    </div>
  );
}

export function Spinner({ label = "Loading…" }) {
  return <span className="spin" role="status" aria-label={label} />;
}

export function LoadingScreen({ label = "Loading…", compact = false }) {
  return <div className={cx("loading", compact && "compact")}><Spinner label={label} /><span>{label}</span></div>;
}

/** Initials avatar. */
export function Avatar({ name, email, size = 28 }) {
  const src = (name || email || "?").trim();
  const initials = src.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join("");
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden>{initials}</span>;
}
