import React, { useMemo, useState } from "react";
import { Badge, Panel, SectionHeader, StatCard } from "../../components/ui";
import { useProfile } from "../../contexts/ProfileContext";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useViewMonth } from "../../hooks/useViewMonth";
import {
  computeMonth, fmt, fmtK, mLabel, mShort, nextM, monthRail,
  setOverride, markPaid, removeLine, addOneOff, addItem, openMonth, rollInto, ensureMonthsThrough, dayMonthLabel,
} from "../../domain";
import { ExpenseModal } from "../editors/ExpenseModal";
import { MonthNav } from "./MonthNav";
import { MoneyMap } from "./MoneyMap";
import { Ledger } from "./Ledger";
import { CardPanel } from "./CardPanel";
import { RollDialog } from "./RollDialog";
import { PayDialog } from "./PayDialog";

export default function MonthPage() {
  const { data: plan, update, canEdit } = useProfile();
  const [mk, setMonth] = useViewMonth();
  const [rolling, setRolling] = useState(false);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(null); // line key
  const toast = useToast();
  const confirm = useConfirm();

  const month = useMemo(() => computeMonth(plan, mk), [plan, mk]);
  const pills = useMemo(() => monthRail(plan, mk), [plan, mk]);

  const selectMonth = (k) => {
    if (canEdit) update((d) => openMonth(d, k)); // editors extend the balance chain
    setMonth(k);
  };

  const actions = canEdit ? {
    set: (key, field, value) => {
      const line = month.ls.find((l) => l.key === key);
      const name = line ? line.label : "Item";
      const what = field === "done" ? (value ? "marked paid" : "marked unpaid")
        : `${field === "plan" ? "planned" : "actual"} ${value === null ? "cleared" : "set to " + fmt(value)}`;
      update((d) => setOverride(d, mk, key, field, value), { label: `${name} — ${what} in ${mShort(mk)}`, group: `set:${mk}:${key}:${field}` });
    },
    pay: (key) => setPaying(key),
    remove: async (key) => {
      const line = month.ls.find((l) => l.key === key);
      const oneOff = key.startsWith("x:");
      const ok = await confirm({
        danger: true,
        title: `Remove “${line ? line.label : "this item"}” from ${mLabel(mk)}?`,
        message: oneOff
          ? "This one-time payment will be deleted, and the balances for this month and later months will be recalculated."
          : `It's hidden in ${mLabel(mk)} only. Other months keep it — change or delete it in Setup to affect every month.`,
        confirmLabel: oneOff ? "Delete payment" : "Remove from month",
      });
      if (!ok) return;
      update((d) => removeLine(d, mk, key), { label: `Removed “${line ? line.label : "item"}” from ${mShort(mk)}` });
      toast.info(`“${line ? line.label : "Item"}” removed from ${mLabel(mk)}.`);
    },
  } : null;
  const saveExpense = ({ type, item, monthKey }) => {
    if (type === "once") {
      update((d) => addOneOff(ensureMonthsThrough(d, monthKey), monthKey, item), { label: `Added “${item.name}” (${fmt(item.amount)}) on ${dayMonthLabel(item.date)}` });
      toast.success(`“${item.name}” added on ${dayMonthLabel(item.date)}` + (monthKey === mk ? "." : ` — it's in ${mLabel(monthKey)}.`));
    } else if (type === "monthly") {
      update((d) => addItem(d, "templates", item), { label: `Added monthly item “${item.name}”` });
      toast.success(`“${item.name}” added to every month from ${mLabel(item.startMonth)}.`);
    } else {
      update((d) => addItem(d, "installments", item), { label: `Added installment “${item.name}”` });
      toast.success(`Installment “${item.name}” added from ${mLabel(item.startMonth)}.`);
    }
    setAdding(false);
  };

  const payLine = paying && month.ls.find((l) => l.key === paying);
  const bankName = (id) => (plan.banks.find((b) => b.id === id) || {}).name;
  const nextLabel = mShort(nextM(mk));
  const activeIncomes = plan.incomes.filter((i) => i.active !== false).length;
  const overPlan = month.spent > month.planned;

  return (
    <>
      <MonthNav value={mk} items={pills} openedMonths={plan.months} onSelect={selectMonth} onMoveNext={() => setRolling(true)} onAddExpense={() => setAdding(true)} canEdit={canEdit} />

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
            <Ledger key={B.o.id} ledger={B} kind="bank" note={B.o.note} actions={actions} />
          ))}
          <SectionHeader title="Cash" />
          {month.wallets.map((W) => (
            <Ledger key={W.o.id} ledger={W} kind="cash" note={"Withdrawn from " + (bankName(W.o.from) || "—")} actions={actions} />
          ))}
        </div>
        <div className="stack">
          <SectionHeader title="Cards" />
          {month.cards.map((C) => (
            <CardPanel key={C.o.id} card={C} bankName={bankName(C.o.bank)} nextLabel={nextLabel} actions={actions} />
          ))}
        </div>
      </div>

      {rolling && (
        <RollDialog plan={plan} monthKey={mk} month={month} onClose={() => setRolling(false)}
          onConfirm={(adj) => {
            update((d) => rollInto(d, mk, adj), { label: `Moved into ${mLabel(nextM(mk))}` });
            setMonth(nextM(mk));
            setRolling(false);
            toast.success(`Moved into ${mLabel(nextM(mk))}. Balances carried over.`);
          }} />
      )}

      {payLine && (
        <PayDialog plan={plan} line={payLine} monthKey={mk} onClose={() => setPaying(null)}
          onSave={(p) => {
            const verb = payLine.flow === "in" ? "received" : "paid";
            update((d) => markPaid(d, mk, payLine.key, p), { label: `${payLine.label} — ${verb} ${fmt(p.actual)} in ${mShort(mk)}` });
            setPaying(null);
            toast.success(`“${payLine.label}” marked ${verb} for ${mLabel(mk)}.`);
          }} />
      )}

      {adding && <ExpenseModal plan={plan} monthKey={mk} onSave={saveExpense} onClose={() => setAdding(false)} />}
    </>
  );
}
