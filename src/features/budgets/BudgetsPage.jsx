import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button, EmptyState, StatCard } from "../../components/ui";
import { useProfile } from "../../contexts/ProfileContext";
import { useToast } from "../../contexts/ToastContext";
import { useViewMonth } from "../../hooks/useViewMonth";
import { addItem, budgetView, dayMonthLabel, fmt, lines, mLabel, monthRail, monthRange, offCalendar } from "../../domain";
import { NewExpenseModal, RecordPaymentModal } from "../editors/ExpenseModal";
import { MonthNav } from "../plan/MonthNav";
import { usePayments } from "../plan/usePayments";
import { BudgetCard, cardAnchor } from "./BudgetCard";

const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** How much went out of banks, cash and cards across the month's budgets. */
function byKind(view) {
  const t = { bank: 0, cash: 0, card: 0 };
  for (const b of view.budgets) for (const p of b.payments) t[p.via.kind] = (t[p.via.kind] || 0) + p.amount;
  return t;
}
const mostly = (k) => (k.card >= k.bank && k.card >= k.cash ? "card" : k.cash >= k.bank ? "cash" : "bank");

/**
 * /p/:id/budgets — every budget of the month on screen with the payments that made it up:
 * when, how much and from which account, against the budget and the months before. Bills
 * paid in parts are listed after them. Opens on a card when the URL has its #anchor.
 */
export default function BudgetsPage() {
  const { data: plan, update, canEdit } = useProfile();
  const [mk, setMonth] = useViewMonth();
  const { pay, removePart } = usePayments(mk);
  const toast = useToast();
  const { hash } = useLocation();
  const [paying, setPaying] = useState(null); // line key
  const [adding, setAdding] = useState(false);
  const view = useMemo(() => budgetView(plan, mk), [plan, mk]);
  const pills = useMemo(() => monthRail(plan, mk), [plan, mk]);
  const focus = hash ? decodeURIComponent(hash.slice(1)) : null;

  useEffect(() => { // came from a line on the Month page: bring its card into view
    if (!focus) return;
    const el = document.getElementById(focus);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focus, mk]);

  const payLine = paying && lines(plan, mk).find((l) => l.key === paying);
  const t = view.totals;
  const kinds = byKind(view);
  const spentAll = kinds.bank + kinds.cash + kinds.card || 1;
  const pct = (v) => (Math.max(0, v) / spentAll) * 100 + "%";
  const timing = t.status === "now"
    ? (t.left > 0.005 && t.daysLeft ? `about ${fmt(t.left / t.daysLeft)} a day for ${plural(t.daysLeft, "day")}` : plural(t.daysLeft, "day") + " left in the month")
    : t.status === "past" ? "Month ended " + dayMonthLabel(view.range.to) : "Starts " + dayMonthLabel(view.range.from);
  const edit = canEdit ? { onAdd: (s) => setPaying(s.key), onRemove: (line, p) => removePart(line, p, { ask: true }) } : {};

  return (
    <>
      <MonthNav value={mk} range={offCalendar(plan) ? monthRange(plan, mk) : null} items={pills} openedMonths={plan.months} onSelect={setMonth} canEdit={false} />

      <div className="page-head2">
        <div>
          <h2>Budgets</h2>
          <p>Every payment towards a budget in {mLabel(mk)}: when, how much and which account it came from.</p>
        </div>
        {canEdit && <Button variant="primary" onClick={() => setAdding(true)}>+ New budget</Button>}
      </div>

      {view.budgets.length > 0 && (
        <div className="stats">
          <StatCard highlight label="Budgeted" value={fmt(t.plan)} sub={plural(view.budgets.length, "budget")} />
          <StatCard label="Spent" value={fmt(t.spent)} subTone={t.over ? "neg" : undefined}
            sub={plural(t.payments, "payment") + (t.over ? ` · ${t.over} over budget` : "")} />
          <StatCard label="Left" value={fmt(t.left)} sub={timing} />
          <StatCard label="Paid with" value={t.spent > 0.005 ? "Mostly " + mostly(kinds) : "—"}>
            <div className="route" role="img" aria-label={`Bank ${fmt(kinds.bank)}, cash ${fmt(kinds.cash)}, card ${fmt(kinds.card)}`}>
              <i className="d" style={{ width: pct(kinds.bank) }} /><i className="c" style={{ width: pct(kinds.cash) }} /><i className="k" style={{ width: pct(kinds.card) }} />
            </div>
            <div className="route-k" aria-hidden><span className="d">Bank {fmt(kinds.bank)}</span><span className="c">Cash {fmt(kinds.cash)}</span><span className="k">Card {fmt(kinds.card)}</span></div>
          </StatCard>
        </div>
      )}

      <section className="buds" aria-label="Budgets">
        {view.budgets.length === 0 && (
          <EmptyState action={canEdit && <Button onClick={() => setAdding(true)}>+ New budget</Button>}>
            No budgets in {mLabel(mk)}. A budget is a monthly amount you spend in several payments — groceries, fuel, electricity —
            from one account or several. You can also make one from a monthly item in <Link to="../setup">Setup</Link>.
          </EmptyState>
        )}
        {view.budgets.map((s) => <BudgetCard key={s.key} plan={plan} s={s} highlight={focus === cardAnchor(s.key)} {...edit} />)}
      </section>

      {view.parts.length > 0 && (
        <section className="buds" aria-labelledby="buds-parts">
          <h3 className="buds-h" id="buds-parts">Paid in parts <span className="mut">· bills you've paid in more than one go</span></h3>
          {view.parts.map((s) => <BudgetCard key={s.key} plan={plan} s={s} highlight={focus === cardAnchor(s.key)} {...edit} />)}
        </section>
      )}

      {payLine && (
        <RecordPaymentModal plan={plan} monthKey={mk} fixedLine={payLine} onClose={() => setPaying(null)}
          onSave={async (r) => { if (r.type === "pay" && (await pay(r))) setPaying(null); }}
          onRemovePart={(line, p) => removePart(line, p)} />
      )}
      {adding && (
        <NewExpenseModal plan={plan} monthKey={mk} budgetOnly onClose={() => setAdding(false)}
          onSave={({ item }) => {
            update((d) => addItem(d, "templates", item), { label: `Added monthly item “${item.name}”` });
            toast.success(`“${item.name}” added to every month from ${mLabel(item.startMonth)}.`);
            setAdding(false);
          }} />
      )}
    </>
  );
}
