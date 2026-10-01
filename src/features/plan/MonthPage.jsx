import React, { useMemo, useState } from "react";
import { Badge, Panel, SectionHeader, StatCard } from "../../components/ui";
import { useProfile } from "../../contexts/ProfileContext";
import { useViewMonth } from "../../hooks/useViewMonth";
import {
  computeMonth, fmt, fmtK, mShort, nextM, monthRail,
  setOverride, removeLine, addOneOff, openMonth, rollInto,
} from "../../domain";
import { MonthNav } from "./MonthNav";
import { MoneyMap } from "./MoneyMap";
import { Ledger } from "./Ledger";
import { CardPanel } from "./CardPanel";
import { RollDialog } from "./RollDialog";

export default function MonthPage() {
  const { data: plan, update, canEdit } = useProfile();
  const [mk, setMonth] = useViewMonth();
  const [rolling, setRolling] = useState(false);

  const month = useMemo(() => computeMonth(plan, mk), [plan, mk]);
  const pills = useMemo(() => monthRail(plan, mk), [plan, mk]);

  const selectMonth = (k) => {
    if (canEdit) update((d) => openMonth(d, k)); // editors extend the balance chain
    setMonth(k);
  };

  const actions = canEdit ? {
    set: (key, field, value) => update((d) => setOverride(d, mk, key, field, value)),
    remove: (key) => update((d) => removeLine(d, mk, key)),
  } : null;
  const addTo = (kind, targetId) => (name, amount) => update((d) => addOneOff(d, mk, { kind, targetId, name, amount }));

  const bankName = (id) => (plan.banks.find((b) => b.id === id) || {}).name;
  const nextLabel = mShort(nextM(mk));
  const activeIncomes = plan.incomes.filter((i) => i.active !== false).length;
  const overPlan = month.spent > month.planned;

  return (
    <>
      <MonthNav value={mk} items={pills} openedMonths={plan.months} onSelect={selectMonth} onMoveNext={() => setRolling(true)} canEdit={canEdit} />

      <div className="stats">
        <StatCard label="Salaries in" value={fmt(month.earned, 0)} sub={`${activeIncomes} salaries across ${plan.banks.length} banks`} />
        <StatCard label="Spent this month" value={fmt(month.spent, 0)} subTone={overPlan ? "neg" : "pos"}
          sub={`${overPlan ? "+" : "−"}${fmtK(Math.abs(month.spent - month.planned))} vs plan`} />
        <StatCard label="By route" value={`${fmtK(month.spentDirect)} · ${fmtK(month.spentCash)} · ${fmtK(month.spentCard)}`} sub="direct · cash · card" />
        <StatCard label={`Bills due ${nextLabel}`} value={fmt(month.billsNext, 0)} sub="from this month's cards" />
        <StatCard highlight label="Left in the banks" value={fmt(month.inBank, 0)}
          sub={`${fmtK(month.inCash)} cash · ${month.open} line${month.open === 1 ? "" : "s"} open`} />
      </div>

      {month.short.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Panel warn title={
            <h3 style={{ fontWeight: 500, fontSize: 13.5 }}>
              {month.short.map((b) => b.o.name).join(", ")} {month.short.length === 1 ? "goes" : "go"} below zero this month. Move a payment to another bank, or top up.
            </h3>
          } badges={<Badge tone="flag">short</Badge>} />
        </div>
      )}

      <MoneyMap plan={plan} month={month} />

      <div className="cols">
        <div className="stack">
          <SectionHeader title="Bank accounts" />
          {month.banks.map((B) => (
            <Ledger key={B.o.id} ledger={B} kind="bank" note={B.o.note} actions={actions} onAdd={addTo("bank", B.o.id)} />
          ))}
          <SectionHeader title="Cash" />
          {month.wallets.map((W) => (
            <Ledger key={W.o.id} ledger={W} kind="cash" note={"Withdrawn from " + (bankName(W.o.from) || "—")} actions={actions} onAdd={addTo("cash", W.o.id)} />
          ))}
        </div>
        <div className="stack">
          <SectionHeader title="Cards" />
          {month.cards.map((C) => (
            <CardPanel key={C.o.id} card={C} bankName={bankName(C.o.bank)} nextLabel={nextLabel} actions={actions} onAdd={addTo("card", C.o.id)} />
          ))}
        </div>
      </div>

      {rolling && (
        <RollDialog plan={plan} monthKey={mk} month={month} onClose={() => setRolling(false)}
          onConfirm={(adj) => {
            update((d) => rollInto(d, mk, adj));
            setMonth(nextM(mk));
            setRolling(false);
          }} />
      )}
    </>
  );
}
