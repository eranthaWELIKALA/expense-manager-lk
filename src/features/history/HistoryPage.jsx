import React, { useState } from "react";
import { Badge, Button, EmptyState, cx } from "../../components/ui";
import { useProfile } from "../../contexts/ProfileContext";
import { LOG_MAX } from "../../domain";
import { useUndo } from "./useUndo";

/* What kind of change a log entry is, read from its label (see the `label`s passed to update()). */
const PENCIL = "M4 20h4L19 9l-4-4L4 16v4z";
const UNDO = "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3";
const KINDS = [
  { id: "month", re: /^(Started|Moved into)\b/, icon: "M5 12h14M13 6l6 6-6 6" },
  { id: "setup", tone: "add", re: /^Added\b/, icon: "M12 5v14M5 12h14" },
  { id: "setup", tone: "edit", re: /^Edited\b/, icon: PENCIL },
  { id: "setup", tone: "del", re: /^Deleted\b/, icon: "M6 6l12 12M18 6L6 18" },
  { id: "undo", re: /^Undid\b/, icon: UNDO },
  { id: "pay", re: /\b(paid|received|scheduled|part paid)\b/i, icon: "M5 12.5l4.5 4.5L19 7.5" },
  { id: "edit", re: /./, icon: PENCIL },
];
const kindOf = (label) => KINDS.find((k) => k.re.test(label));
const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "pay", label: "Payments" },
  { id: "setup", label: "Setup changes" },
  { id: "month", label: "Months" },
];

const dayKey = (d) => d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
function dayLabel(d) {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  if (dayKey(d) === dayKey(today)) return "Today · " + date;
  if (dayKey(d) === dayKey(yesterday)) return "Yesterday · " + date;
  return d.toLocaleDateString(undefined, { weekday: "short" }) + " · " + date;
}

/** Everything changed in this profile, newest first, grouped by day, with undo. */
export default function HistoryPage() {
  const { data: plan, canEdit } = useProfile();
  const undo = useUndo();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const log = plan.log || [];
  // an undo reverts its target and everything between it and the undo
  const undone = new Set();
  log.forEach((e, i) => {
    const target = e.undid ? log.findIndex((x) => x.id === e.undid) : -1;
    for (let j = i + 1; target > i && j <= target; j++) undone.add(log[j].id);
  });

  const needle = q.trim().toLowerCase();
  const days = [];
  log.forEach((e, i) => {
    const kind = kindOf(e.label);
    if (filter !== "all" && kind.id !== filter) return;
    if (needle && !e.label.toLowerCase().includes(needle)) return;
    const d = new Date(e.at);
    const key = isNaN(d) ? "?" : dayKey(d);
    let day = days[days.length - 1];
    if (!day || day.key !== key) { day = { key, label: isNaN(d) ? "Earlier" : dayLabel(d), items: [] }; days.push(day); }
    day.items.push({ e, i, kind, time: isNaN(d) ? "" : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) });
  });

  return (
    <>
      <div className="page-head2">
        <div>
          <h2>History</h2>
          <p>The last {LOG_MAX} changes to this profile. Undoing a change also undoes everything made after it.</p>
        </div>
        {canEdit && log.length > 0 && (
          <Button onClick={() => undo(0)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={UNDO} /></svg>
            Undo last change
          </Button>
        )}
      </div>

      <div className="tabbar">
        <div className="mseg" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} className={cx(filter === f.id && "on")} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <label className="accs-find hist-find">
          <span className="sr-only">Search changes</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search changes" />
        </label>
      </div>

      <section className="hist" aria-label="Changes">
        {days.length === 0 && <EmptyState>{log.length === 0 ? "No changes recorded yet." : "No changes match."}</EmptyState>}
        {days.map((day) => (
          <div key={day.key} role="group" aria-label={day.label}>
            <div className="hist-day">{day.label}</div>
            {day.items.map(({ e, i, kind, time }) => (
              <div className={cx("hev", undone.has(e.id) && "undone")} key={e.id}>
                <span className={"hev-ic k-" + (kind.tone || kind.id)} aria-hidden>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={kind.icon} /></svg>
                </span>
                <div className="hev-main">
                  <b>{e.label}</b>
                  <small>{time}{e.by ? " · " + e.by : ""}</small>
                </div>
                <div className="hev-r">
                  {undone.has(e.id) && <Badge>undone</Badge>}
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => undo(i)} aria-label={"Undo " + e.label}>Undo</Button>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>
    </>
  );
}
