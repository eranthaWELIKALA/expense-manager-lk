import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banner, Button, StatCard } from "../../components/ui";
import { useProfile } from "../../contexts/ProfileContext";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useViewMonth } from "../../hooks/useViewMonth";
import {
  computeMonth, fmt, fmtK, mLabel, mShort, nextM, monthRail,
  N, isDateISO, isPayable, monthOfDate, setOverride, markPaid, recordPayment, removePayment, removeLine, addOneOff, addItem, openMonth, rollInto, ensureMonthsThrough, monthsToOpen, dayMonthLabel,
  addTransfer, payCard, makeReal, withoutMaybes, viaLabel, firstMonth, instType,
} from "../../domain";
import { NewExpenseModal, RecordPaymentModal } from "../editors/ExpenseModal";
import { TransferModal } from "../editors/TransferModal";
import { MonthNav } from "./MonthNav";
import { AccountList } from "./AccountList";
import { AccountDetail } from "./AccountDetail";
import { isOpen, monthAccounts } from "./accounts";
import { RollDialog } from "./RollDialog";
import { PayDialog } from "./PayDialog";
import { IncomeReceivedModal, PickItemModal } from "./ActionModals";
import { useItemEditor } from "../editors/useItemEditor";
import { useUndo } from "../history/useUndo";

const PICK = {
  templates: { title: "Change a monthly item", describe: (x) => fmt(x.amount) },
  incomes: { title: "Change a salary", describe: (x) => (x.variable ? "≈ " : "") + fmt((x.splits || []).reduce((s, p) => s + N(p.amount), 0)) },
  installments: { title: "Change an installment", describe: (x) => fmt(x.total) },
};

export default function MonthPage() {
  const { data: plan, update, canEdit } = useProfile();
  const [mk, setMonth] = useViewMonth();
  const [rolling, setRolling] = useState(false);
  const [adding, setAdding] = useState(null); // "record" | "new" | "maybe" | "transfer"
  const [hideMaybes, setHideMaybes] = useState(false); // compare balances without the what-ifs
  const [paying, setPaying] = useState(null); // line key
  const [modal, setModal] = useState(null); // Actions menu: "income" | "edit:<coll>"
  const [selected, setSelected] = useState(null); // account key ("bank:<id>" …) or "open"; null = first account
  const [openOnly, setOpenOnly] = useState(false);
  const editor = useItemEditor({ startMonth: mk });
  const undo = useUndo();
  const navigate = useNavigate();

  const onAction = (a) => {
    if (a === "undo") undo(0);
    else if (a === "history") navigate("../history");
    else if (a === "move") setRolling(true);
    else if (a === "maybe") setAdding("maybe");
    else setModal(a);
  };
  const toast = useToast();
  const confirm = useConfirm();

  const month = useMemo(() => computeMonth(hideMaybes ? withoutMaybes(plan) : plan, mk), [plan, mk, hideMaybes]);
  const pills = useMemo(() => monthRail(plan, mk), [plan, mk]);

  const opened = !!plan.months[mk];

  /** Ask before adding months to the plan. Resolves true when there's nothing new or the user agrees. */
  const confirmNewMonths = async (k, reason) => {
    const added = monthsToOpen(plan, k);
    if (!added.length) return true;
    const span = added.length === 1 ? mLabel(added[0]) : `${added.length} months (${mLabel(added[0])} – ${mLabel(added[added.length - 1])})`;
    return confirm({
      title: `Start ${mLabel(k)}?`,
      message: `${reason ? reason + " " : ""}This adds ${span} to your plan. Salaries, monthly items and installments are filled in, and balances carry over from the month before. You can undo it from History.`,
      confirmLabel: added.length === 1 ? `Start ${mShort(k)}` : `Add ${added.length} months`,
    });
  };

  const startMonth = async () => {
    if (!(await confirmNewMonths(mk))) return;
    update((d) => openMonth(ensureMonthsThrough(d, mk), mk), { label: `Started ${mLabel(mk)}` });
    toast.success(`${mLabel(mk)} started.`);
  };

  const actions = canEdit && opened ? {
    set: (key, field, value) => {
      const line = month.ls.find((l) => l.key === key);
      const name = line ? line.label : "Item";
      const what = field === "done" ? (value ? "marked paid" : "marked unpaid")
        : `${field === "plan" ? "planned" : "actual"} ${value === null ? "cleared" : "set to " + fmt(value)}`;
      update((d) => setOverride(d, mk, key, field, value), { label: `${name} — ${what} in ${mShort(mk)}`, group: `set:${mk}:${key}:${field}` });
    },
    pay: (key) => setPaying(key),
    keep: (key) => {
      const line = month.ls.find((l) => l.key === key);
      update((d) => makeReal(d, mk, key), { label: `Kept what-if “${line ? line.label : "payment"}” in ${mShort(mk)}` });
      toast.success(`“${line ? line.label : "Payment"}” is now a planned payment in ${mLabel(mk)}.`);
    },
    remove: async (key) => {
      const line = month.ls.find((l) => l.key === key);
      if (line && line.maybe) { // a what-if: nothing real is lost
        update((d) => removeLine(d, mk, key), { label: `Dropped what-if “${line.label}” from ${mShort(mk)}` });
        toast.info(`What-if “${line.label}” dropped.`);
        return;
      }
      if (key.startsWith("tx:") || key.startsWith("ti:")) {
        const ok = await confirm({
          danger: true, title: `Delete this transfer of ${line ? fmt(line.plan) : "money"}?`,
          message: "It's removed from both accounts, and balances for this month and later months are recalculated.",
          confirmLabel: "Delete transfer",
        });
        if (!ok) return;
        update((d) => removeLine(d, mk, key), { label: `Deleted transfer “${line ? line.label : ""}” in ${mShort(mk)}` });
        toast.info("Transfer deleted.");
        return;
      }
      const oneOff = key.startsWith("x:"), part = key.startsWith("p:");
      const ok = await confirm({
        danger: true,
        title: part ? `Remove this part payment of ${line ? fmt(line.actual) : "it"}?` : `Remove “${line ? line.label : "this item"}” from ${mLabel(mk)}?`,
        message: part
          ? "It's taken off the bill, which goes back to having that much left to pay."
          : oneOff
            ? "This one-time payment will be deleted, and the balances for this month and later months will be recalculated."
            : `It's hidden in ${mLabel(mk)} only. Other months keep it — change or delete it in Setup to affect every month.`,
        confirmLabel: oneOff || part ? "Delete payment" : "Remove from month",
      });
      if (!ok) return;
      update((d) => removeLine(d, mk, key), { label: `Removed “${line ? line.label : "item"}” from ${mShort(mk)}` });
      toast.info(`“${line ? line.label : "Item"}” removed from ${mLabel(mk)}.`);
    },
  } : null;
  const saveExpense = async ({ type, item, monthKey, line, payment }) => {
    if (type === "maybe") {
      if (!(await confirmNewMonths(monthKey, `This is in ${mLabel(monthKey)}, which isn't started yet.`))) return;
      update((d) => addOneOff(ensureMonthsThrough(d, monthKey), monthKey, { ...item, maybe: true }),
        { label: `Tried what-if “${item.name}” (${fmt(item.amount)}) in ${mShort(monthKey)}` });
      if (monthKey !== mk) setMonth(monthKey);
      setHideMaybes(false);
      toast.success(`What-if “${item.name}” added to ${mLabel(monthKey)}. Check the balances, then keep or drop it.`);
      setAdding(null);
      return;
    }
    if ((type === "pay" || type === "once") && !(await confirmNewMonths(monthKey, `This payment is in ${mLabel(monthKey)}, which isn't started yet.`))) return; // keep the form open
    if (type === "pay" && line.budget) {
      const spent = (line.paid || 0) + payment.amount;
      update((d) => recordPayment(ensureMonthsThrough(d, monthKey), monthKey, line.key, payment),
        { label: `${line.label} — spent ${fmt(payment.amount)} on ${dayMonthLabel(payment.date)}` + (payment.note ? ` (${payment.note})` : "") });
      toast.success(`${fmt(payment.amount)} added to “${line.label}” — ${fmt(spent, 0)} of ${fmt(line.plan, 0)} spent` + (monthKey === mk ? "." : ` in ${mLabel(monthKey)}.`));
      setPaying(null);
    } else if (type === "pay") {
      const after = (line.paid || 0) + payment.amount;
      const settled = payment.settle || payment.amount >= line.remaining - 0.005 || after >= Number(line.plan) - 0.005;
      const what = settled ? "paid" : `part paid (${fmt(after, 0)} of ${fmt(line.plan, 0)})`;
      update((d) => recordPayment(ensureMonthsThrough(d, monthKey), monthKey, line.key, payment),
        { label: `${line.label} — ${settled ? "paid" : "part paid"} ${fmt(payment.amount)} on ${dayMonthLabel(payment.date)}` });
      toast.success(`“${line.label}” ${what}` + (monthKey === mk ? "." : ` in ${mLabel(monthKey)}.`));
      setPaying(null);
    } else if (type === "once") {
      const verb = item.paid ? "Paid" : "Scheduled";
      update((d) => addOneOff(ensureMonthsThrough(d, monthKey), monthKey, item), { label: `${verb} “${item.name}” (${fmt(item.amount)}) on ${dayMonthLabel(item.date)}` });
      toast.success(`“${item.name}” ${verb.toLowerCase()} on ${dayMonthLabel(item.date)}` + (monthKey === mk ? "." : ` — it's in ${mLabel(monthKey)}.`));
    } else if (type === "monthly") {
      update((d) => addItem(d, "templates", item), { label: `Added monthly item “${item.name}”` });
      toast.success(`“${item.name}” added to every month from ${mLabel(item.startMonth)}.`);
    } else {
      const type = instType(item);
      update((d) => addItem(d, "installments", item), { label: `Added ${type.noun} “${item.name}”` });
      toast.success(`${type.noun[0].toUpperCase() + type.noun.slice(1)} “${item.name}” added from ${mLabel(item.startMonth)}.` + (item.startMonth < firstMonth(plan) ? ` Payments before ${mLabel(firstMonth(plan))} count as already paid.` : ""));
    }
    setAdding(null);
  };
  const saveIncome = async ({ monthKey, line, payment }) => {
    if (!(await confirmNewMonths(monthKey, `This is in ${mLabel(monthKey)}, which isn't started yet.`))) return;
    update((d) => markPaid(ensureMonthsThrough(d, monthKey), monthKey, line.key, payment),
      { label: `${line.label} — received ${fmt(payment.actual)} on ${dayMonthLabel(payment.date)}` });
    toast.success(`“${line.label}” recorded as received` + (monthKey === mk ? "." : ` in ${mLabel(monthKey)}.`));
    setModal(null);
  };
  const editColl = modal && modal.startsWith("edit:") ? modal.slice(5) : null;

  const payLine = paying && month.ls.find((l) => l.key === paying);
  const removePart = (line, part) => {
    const partMonth = isDateISO(part.date) ? monthOfDate(part.date) : mk; // parts are dated inside their bill's month
    update((d) => removePayment(d, partMonth, line.key, part.id),
      { label: `${line.label} — removed a ${fmt(part.amount)} part` });
    toast.info(`Removed the ${fmt(part.amount)} part of “${line.label}”.`);
  };
  const nextLabel = mShort(nextM(mk));
  const overPlan = month.spent > month.planned;

  const accounts = useMemo(() => monthAccounts(plan, month), [plan, month]);
  const allAccounts = [...accounts.banks, ...accounts.wallets, ...accounts.cards];

  /* Money moving between accounts (or in from outside), and card payments. */
  const saveTransfer = async ({ kind, monthKey, from, to, amount, date, note }) => {
    if (!(await confirmNewMonths(monthKey, `This is in ${mLabel(monthKey)}, which isn't started yet.`))) return;
    const on = date ? " on " + dayMonthLabel(date) : "";
    const name = (ref) => (ref ? viaLabel(plan, ref).replace(/^(Bank|Cash|Card) · /, "") : "outside");
    if (kind === "card") {
      let result;
      update((d) => { result = payCard(ensureMonthsThrough(d, monthKey), monthKey, { cardId: to.id, bankId: from.id, amount, date }); return result.plan; },
        { label: `Paid card “${name(to)}” ${fmt(amount)} from ${name(from)}${on}` });
      const r = result || { toBill: 0, ahead: amount };
      toast.success(r.toBill > 0.005 && r.ahead > 0.005 ? `${fmt(r.toBill, 0)} paid on the bill, ${fmt(r.ahead, 0)} paid ahead.`
        : r.toBill > 0.005 ? `${fmt(r.toBill, 0)} paid on the “${name(to)}” bill.` : `${fmt(r.ahead, 0)} paid ahead on “${name(to)}” — next month's bill goes down.`);
    } else {
      const verb = { cash: "Withdrew cash", deposit: "Deposited", bank: "Transferred", cashin: "Cash received" }[kind] || "Transferred";
      const route = from ? `${name(from)} → ${name(to)}` : `into ${name(to)}`;
      update((d) => addTransfer(ensureMonthsThrough(d, monthKey), monthKey, { from, to, amount, date, note }),
        { label: `${verb} ${fmt(amount)} — ${route}${note ? " (" + note + ")" : ""}${on}` });
      toast.success(`${verb} ${fmt(amount, 0)}: ${route}` + (monthKey === mk ? "." : ` (in ${mLabel(monthKey)}).`));
    }
    setAdding(null);
  };

  /* What-ifs in this month, and what they do to the bank balances. */
  const maybes = month.ls.filter((l) => l.maybe);
  const allMaybes = hideMaybes ? computeMonth(plan, mk).ls.filter((l) => l.maybe) : maybes;
  const withMaybes = hideMaybes ? computeMonth(plan, mk) : month;
  const without = computeMonth(withoutMaybes(plan), mk);
  const shortBecause = withMaybes.short.filter((b) => !without.short.some((x) => x.o.id === b.o.id));
  const maybeTotal = allMaybes.reduce((s, l) => s + N(l.plan), 0);
  const openRows = allAccounts.flatMap((a) => a.rows.filter(isOpen).map((line) => ({ line, account: a })));
  const current = selected === "open" ? null : allAccounts.find((a) => a.key === selected) || allAccounts[0] || null;
  const salaries = month.ls.filter((l) => l.origin === "salary");
  const routeTotal = month.spentDirect + month.spentCash + month.spentCard || 1;
  const pct = (v) => (Math.max(0, v) / routeTotal) * 100 + "%";

  return (
    <>
      <MonthNav value={mk} items={pills} openedMonths={plan.months} onSelect={setMonth} onRecord={() => setAdding("record")} onNewExpense={() => setAdding("new")}
        onTransfer={() => setAdding("transfer")} onAction={onAction} canEdit={canEdit} />

      {!opened && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="info" action={canEdit && <Button size="sm" variant="primary" onClick={startMonth}>Start {mShort(mk)}</Button>}>
            {mLabel(mk)} isn't part of the plan yet — this is a preview.{canEdit ? " Start it to tick things off and change amounts." : ""}
          </Banner>
        </div>
      )}

      <div className="stats">
        <StatCard highlight label={`Left in ${plan.banks.length} bank${plan.banks.length === 1 ? "" : "s"}`} value={fmt(month.inBank, 0)}
          sub={`${fmtK(month.inCash)} cash` + (month.short.length ? ` · ${month.short.length} short` : "")} />
        <StatCard label="Salaries in" value={fmt(month.earned, 0)}
          sub={salaries.length ? `${salaries.filter((l) => l.done).length} of ${salaries.length} received` : "No salaries yet"} />
        <StatCard label="Spent" value={fmt(month.spent, 0)} subTone={overPlan ? "neg" : "pos"}
          sub={Math.abs(month.spent - month.planned) < 1 ? "On plan" : `${fmtK(Math.abs(month.spent - month.planned))} ${overPlan ? "over" : "under"} plan`}>
          <div className="route" role="img" aria-label={`Direct ${fmtK(month.spentDirect)}, cash ${fmtK(month.spentCash)}, card ${fmtK(month.spentCard)}`}>
            <i className="d" style={{ width: pct(month.spentDirect) }} /><i className="c" style={{ width: pct(month.spentCash) }} /><i className="k" style={{ width: pct(month.spentCard) }} />
          </div>
          <div className="route-k" aria-hidden><span className="d">Direct {fmtK(month.spentDirect)}</span><span className="c">Cash {fmtK(month.spentCash)}</span><span className="k">Card {fmtK(month.spentCard)}</span></div>
        </StatCard>
        <StatCard label="Still to tick" value={`${openRows.length} line${openRows.length === 1 ? "" : "s"}`}
          sub={`across ${new Set(openRows.map((r) => r.account.key)).size} accounts · ${fmtK(month.billsNext)} card bills in ${nextLabel}`} />
      </div>

      {month.short.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="warn">
            {month.short.map((b) => b.o.name).join(", ")} {month.short.length === 1 ? "goes" : "go"} below zero this month. Move a payment to another bank, or top up.
          </Banner>
        </div>
      )}

      {allMaybes.length > 0 && (
        <div className="whatif" role="status">
          <div className="whatif-t">
            <b>{allMaybes.length} what-if{allMaybes.length === 1 ? "" : "s"} in {mLabel(mk)} · {fmt(maybeTotal, 0)}</b>
            <span>
              {shortBecause.length
                ? `With ${allMaybes.length === 1 ? "it" : "them"}, ${shortBecause.map((b) => b.o.name).join(", ")} would go below zero.`
                : `${allMaybes.length === 1 ? "It fits" : "They fit"} — no bank goes below zero.`}
              {" "}Left in the banks: {fmt(withMaybes.inBank, 0)} with, {fmt(without.inBank, 0)} without.
            </span>
          </div>
          <div className="whatif-a">
            <div className="mseg" role="group" aria-label="Balances">
              <button type="button" aria-pressed={!hideMaybes} className={hideMaybes ? undefined : "on"} onClick={() => setHideMaybes(false)}>With</button>
              <button type="button" aria-pressed={hideMaybes} className={hideMaybes ? "on" : undefined} onClick={() => setHideMaybes(true)}>Without</button>
            </div>
            {actions && !hideMaybes && <Button size="sm" onClick={() => {
              update((d) => allMaybes.reduce((acc, l) => makeReal(acc, mk, l.key), d), { label: `Kept ${allMaybes.length} what-if${allMaybes.length === 1 ? "" : "s"} in ${mShort(mk)}` });
              toast.success("Kept — they're planned payments now.");
            }}>Keep all</Button>}
            {actions && <Button size="sm" variant="ghost" onClick={() => {
              update((d) => allMaybes.reduce((acc, l) => removeLine(acc, mk, l.key), d), { label: `Dropped ${allMaybes.length} what-if${allMaybes.length === 1 ? "" : "s"} in ${mShort(mk)}` });
              setHideMaybes(false);
              toast.info("What-ifs dropped.");
            }}>Drop all</Button>}
          </div>
        </div>
      )}

      <div className="mwork">
        <AccountList accounts={accounts} selected={current ? current.key : "open"} onSelect={setSelected} openCount={openRows.length} />
        <AccountDetail account={current} openRows={openRows} actions={actions} openOnly={openOnly} onOpenOnly={setOpenOnly}
          nextLabel={nextLabel} />
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

      {payLine && isPayable(payLine) && (
        <RecordPaymentModal plan={plan} monthKey={mk} fixedLine={payLine} onSave={saveExpense} onRemovePart={removePart} onClose={() => setPaying(null)} />
      )}
      {payLine && !isPayable(payLine) && (
        <PayDialog plan={plan} line={payLine} monthKey={mk} onClose={() => setPaying(null)}
          onSave={(p) => {
            const verb = payLine.flow === "in" ? "received" : "paid";
            update((d) => markPaid(d, mk, payLine.key, p), { label: `${payLine.label} — ${verb} ${fmt(p.actual)} in ${mShort(mk)}` });
            setPaying(null);
            toast.success(`“${payLine.label}” marked ${verb} for ${mLabel(mk)}.`);
          }} />
      )}

      {adding === "record" && <RecordPaymentModal plan={plan} monthKey={mk} onSave={saveExpense} onRemovePart={removePart} onClose={() => setAdding(null)} />}
      {(adding === "new" || adding === "maybe") && <NewExpenseModal plan={plan} monthKey={mk} initialType={adding === "maybe" ? "maybe" : "monthly"} onSave={saveExpense} onClose={() => setAdding(null)} />}
      {adding === "transfer" && <TransferModal plan={plan} monthKey={mk} onSave={saveTransfer} onClose={() => setAdding(null)} />}
      {modal === "income" && <IncomeReceivedModal plan={plan} monthKey={mk} onSave={saveIncome} onClose={() => setModal(null)} />}
      {editColl && (
        <PickItemModal {...PICK[editColl]} items={plan[editColl]} onClose={() => setModal(null)}
          onPick={(item) => { setModal(null); editor.openEdit(editColl, item); }} />
      )}
      {editor.dialogs}
    </>
  );
}
