import React from "react";
import { Field, Select } from "../../components/ui";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useProfile } from "../../contexts/ProfileContext";
import { useToast } from "../../contexts/ToastContext";
import { datedMoves, dayMonthLabel, mLabel, monthRange, monthStartDay, ordinal, setMonthStart } from "../../domain";

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

/** How the plan's months run, for month `mk`. */
function describe(plan, mk, day) {
  if (day === 1) return "Each month runs from the 1st to its last day.";
  const { from, to } = monthRange(plan, mk);
  return `${mLabel(mk)} runs ${dayMonthLabel(from)} – ${dayMonthLabel(to)}. `
    + (day <= 16 ? `Spending up to ${dayMonthLabel(to)} still counts in ${mLabel(mk)}.` : `A month is named by the one most of its days are in.`);
}

/** Setup section: the day the plan's months start on (see domain/periods.js). `monthKey` is used for the example. */
export function MonthStart({ monthKey }) {
  const { data: plan, update, canEdit } = useProfile();
  const toast = useToast();
  const confirm = useConfirm();
  const day = monthStartDay(plan);

  const choose = async (next) => {
    if (next === day) return;
    const moving = datedMoves({ ...plan, monthStart: next }).length;
    if (moving) {
      const ok = await confirm({
        title: next === 1 ? "Follow the calendar?" : `Start months on the ${ordinal(next)}?`,
        message: `${moving} dated payment${moving === 1 ? "" : "s"} and transfer${moving === 1 ? "" : "s"} will move into the month ${moving === 1 ? "it" : "they"} now count${moving === 1 ? "s" : ""} in, `
          + "and balances from then on are recalculated. You can undo it from History.",
        confirmLabel: "Change month start",
      });
      if (!ok) return;
    }
    update((d) => setMonthStart(d, next), { label: next === 1 ? "Months now follow the calendar" : `Months now start on the ${ordinal(next)}` });
    toast.success(next === 1 ? "Months follow the calendar." : `Months start on the ${ordinal(next)}.`);
  };

  return (
    <section className="slist" aria-labelledby="sl-months">
      <div className="slist-h">
        <div>
          <h2 id="sl-months">Month start</h2>
          <p>Set it to the day your salary usually lands. Until then you're still spending last month's money, so bank and cash payments before it count in last month.</p>
        </div>
      </div>
      <div className="mstart">
        <Field label="Months start on" hint={canEdit ? undefined : "Only editors can change this."}>
          <Select value={String(day)} onChange={(e) => choose(Number(e.target.value))} disabled={!canEdit}>
            {DAYS.map((n) => <option key={n} value={n}>{n === 1 ? "1st (calendar months)" : ordinal(n)}</option>)}
          </Select>
        </Field>
        <div className="preview">{describe(plan, monthKey, day)}</div>
        <p className="mstart-note">Cards with a statement date follow their statements instead: a charge counts in the month of the statement it's on.</p>
      </div>
    </section>
  );
}
