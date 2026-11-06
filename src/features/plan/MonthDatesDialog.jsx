import React from "react";
import { Button, FormModal } from "../../components/ui";
import { useForm } from "../../hooks/useForm";
import {
  addDays, datedMoves, dayMonthLabel, hasOwnStart, isDateISO, mLabel, monthRange, nextM, prevM, startLimits, usualStart, withMonthDates,
} from "../../domain";
import { DateField } from "../editors/fields";

const days = ({ from, to }) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
const span = (r) => `${dayMonthLabel(r.from)} – ${dayMonthLabel(r.to)} (${days(r)} days)`;

/** Is `day` usable as the start of month `mk`? An error message, or "". */
function checkStart(mk, day, what) {
  if (!isDateISO(day)) return "Pick a date.";
  const { min, max } = startLimits(mk);
  const shift = what === "end" ? -1 : 0;
  const lo = addDays(min, shift), hi = addDays(max, shift);
  return day >= min && day <= max ? "" : `Pick a day between ${dayMonthLabel(lo)} and ${dayMonthLabel(hi)}.`;
}

/**
 * The days one month of the plan really ran — for when the salary came early or late. Its start
 * ends the month before; its end starts the next one. Cards with a statement date aren't affected.
 * onSave({from, to}) — null for the usual day.
 */
export function MonthDatesDialog({ plan, monthKey: mk, onSave, onClose }) {
  const now = monthRange(plan, mk);
  const form = useForm({ from: now.from, to: now.to }, (v) => ({
    from: checkStart(mk, v.from, "start"),
    to: isDateISO(v.to) ? checkStart(nextM(mk), addDays(v.to, 1), "end") : "Pick a date.",
  }));
  const v = form.values;
  const usual = { from: usualStart(plan, mk), to: addDays(usualStart(plan, nextM(mk)), -1) };
  const own = hasOwnStart(plan, mk) || hasOwnStart(plan, nextM(mk));
  const ok = !checkStart(mk, v.from, "start") && isDateISO(v.to) && !checkStart(nextM(mk), addDays(v.to, 1), "end");
  // what the months around it become, and how many dated payments move
  const after = ok ? withMonthDates(plan, mk, { from: v.from, to: v.to }) : null;
  const moving = after ? datedMoves(after).length : 0;
  const changed = v.from !== now.from || v.to !== now.to;

  const save = form.guard((vals) => onSave({
    from: vals.from === usual.from ? null : vals.from,
    to: vals.to === usual.to ? null : vals.to,
  }));

  return (
    <FormModal title={`${mLabel(mk)}'s dates`} submitLabel="Save dates" onSubmit={save} onClose={onClose}
      description="When the salary comes early or late, set the days this month really ran. The month before ends the day before it starts, and the next one starts the day after it ends. Cards with a statement date keep following their statements.">
      <div className="form-grid">
        <DateField form={form} name="from" label="Starts on" min={startLimits(mk).min} max={startLimits(mk).max}
          hint={`Usually ${dayMonthLabel(usual.from)}`} />
        <DateField form={form} name="to" label="Ends on" min={addDays(startLimits(nextM(mk)).min, -1)} max={addDays(startLimits(nextM(mk)).max, -1)}
          hint={`Usually ${dayMonthLabel(usual.to)}`} />
      </div>
      {after && (
        <div className="preview mdates">
          <div><span>{mLabel(prevM(mk))}</span>{span(monthRange(after, prevM(mk)))}</div>
          <div className="on"><span>{mLabel(mk)}</span>{span(monthRange(after, mk))}</div>
          <div><span>{mLabel(nextM(mk))}</span>{span(monthRange(after, nextM(mk)))}</div>
          {changed && moving > 0 && <p>{moving} dated payment{moving === 1 ? "" : "s"} will move into the month {moving === 1 ? "it now counts" : "they now count"} in. You can undo it from History.</p>}
        </div>
      )}
      {own && (
        <Button size="sm" variant="ghost" onClick={() => onSave({ from: null, to: null })}>
          Use the usual days ({dayMonthLabel(usual.from)} – {dayMonthLabel(usual.to)})
        </Button>
      )}
    </FormModal>
  );
}
