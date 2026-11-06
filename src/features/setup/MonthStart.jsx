import React, { useState } from "react";
import { Badge, Button, Field, Select } from "../../components/ui";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useProfile } from "../../contexts/ProfileContext";
import { useToast } from "../../contexts/ToastContext";
import {
  currentMonth, datedMoves, dayMonthLabel, firstMonth, hasOwnStart, mLabel, monthRange, monthStartDay, nextM, ordinal, prevM, setMonthDates, setMonthStart,
} from "../../domain";
import { MonthDatesDialog } from "../plan/MonthDatesDialog";

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

/** How the plan's months usually run, for month `mk`. */
function describe(plan, mk, day) {
  if (day === 1) return "Each month usually runs from the 1st to its last day.";
  const { from, to } = monthRange({ ...plan, monthStarts: undefined }, mk);
  return `${mLabel(mk)} usually runs ${dayMonthLabel(from)} – ${dayMonthLabel(to)}. `
    + (day <= 16 ? `Spending up to ${dayMonthLabel(to)} still counts in ${mLabel(mk)}.` : `A month is named by the one most of its days are in.`);
}

/** The months to list: up to three before today's, today's and two after, and any other month with dates of its own — none before the plan starts. */
function monthsAround(plan) {
  const now = currentMonth(plan), first = firstMonth(plan);
  const ks = new Set([prevM(prevM(prevM(now))), prevM(prevM(now)), prevM(now), now, nextM(now), nextM(nextM(now))]);
  for (const k of Object.keys(plan.monthStarts || {})) if (hasOwnStart(plan, k)) ks.add(k);
  return [...ks].filter((k) => k >= first).sort();
}

/** Setup section: the day the plan's months usually start on, and months that ran on other days (see domain/periods.js). */
export function MonthStart({ monthKey }) {
  const { data: plan, update, canEdit } = useProfile();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null); // month key whose dates are being changed
  const day = monthStartDay(plan);

  const choose = async (next) => {
    if (next === day) return;
    const moving = datedMoves({ ...plan, monthStart: next }).length;
    if (moving) {
      const ok = await confirm({
        title: next === 1 ? "Follow the calendar?" : `Start months on the ${ordinal(next)}?`,
        message: `${moving} dated payment${moving === 1 ? "" : "s"} and transfer${moving === 1 ? "" : "s"} will move into the month ${moving === 1 ? "it" : "they"} now count${moving === 1 ? "s" : ""} in, `
          + "and balances from then on are recalculated. Months with dates of their own keep them. You can undo it from History.",
        confirmLabel: "Change month start",
      });
      if (!ok) return;
    }
    update((d) => setMonthStart(d, next), { label: next === 1 ? "Months now follow the calendar" : `Months now start on the ${ordinal(next)}` });
    toast.success(next === 1 ? "Months follow the calendar." : `Months start on the ${ordinal(next)}.`);
  };

  const saveDates = (mk) => (dates) => {
    update((d) => setMonthDates(d, mk, dates), { label: `${mLabel(mk)} dates ${dates.from === null && dates.to === null ? "back to the usual days" : "changed"}` });
    const r = monthRange(setMonthDates(plan, mk, dates), mk);
    toast.success(`${mLabel(mk)} now runs ${dayMonthLabel(r.from)} – ${dayMonthLabel(r.to)}.`);
    setEditing(null);
  };

  return (
    <section className="slist" aria-labelledby="sl-months">
      <div className="slist-h">
        <div>
          <h2 id="sl-months">Month start</h2>
          <p>Set it to the day your salary usually lands. Until then you're still spending last month's money, so bank and cash payments — and budgets — before it count in last month.</p>
        </div>
      </div>
      <div className="mstart">
        <Field label="Months usually start on" hint={canEdit ? undefined : "Only editors can change this."}>
          <Select value={String(day)} onChange={(e) => choose(Number(e.target.value))} disabled={!canEdit}>
            {DAYS.map((n) => <option key={n} value={n}>{n === 1 ? "1st (calendar months)" : ordinal(n)}</option>)}
          </Select>
        </Field>
        <div className="preview">{describe(plan, monthKey, day)}</div>

        <div className="mlist" role="table" aria-label="Each month's dates">
          <div className="mlist-h" role="row">
            <span role="columnheader">Month</span><span role="columnheader">Runs</span><span role="columnheader"><span className="sr-only">Change</span></span>
          </div>
          {monthsAround(plan).map((mk) => {
            const r = monthRange(plan, mk);
            const own = hasOwnStart(plan, mk) || hasOwnStart(plan, nextM(mk));
            return (
              <div className="mlist-r" role="row" key={mk}>
                <span role="cell"><b>{mLabel(mk)}</b>{mk === currentMonth(plan) && <Badge tone="acc">now</Badge>}</span>
                <span role="cell" className="n">{dayMonthLabel(r.from)} – {dayMonthLabel(r.to)}{own && <Badge tone="brass">own dates</Badge>}</span>
                <span role="cell">{canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(mk)} aria-label={`Change ${mLabel(mk)}'s dates`}>Change</Button>}</span>
              </div>
            );
          })}
        </div>
        <p className="mstart-note">
          When the salary comes early or late one month, change that month's dates here or from the dates under the month on the Month page.
          Cards with a statement date follow their statements instead: a card payment counts on the statement its date is on, even for a budget.
        </p>
      </div>
      {editing && <MonthDatesDialog plan={plan} monthKey={editing} onClose={() => setEditing(null)} onSave={saveDates(editing)} />}
    </section>
  );
}
