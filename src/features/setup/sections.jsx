import React from "react";
import { Button, ConfigCard, NumberInput, RemoveButton } from "../../components/ui";
import { N, fmt, uid } from "../../domain";
import { useCollection } from "./useCollection";
import { BankSelect, ConfigGrid, ConfigRow, ViaSelect } from "./fields";

const firstBank = (plan) => plan.banks[0] && plan.banks[0].id;

export function BanksSection({ plan }) {
  const c = useCollection("banks");
  return (
    <ConfigCard
      title="Bank accounts"
      action={<Button size="sm" onClick={() => c.add({ id: uid("bk"), name: "New bank", note: "", opening: 0 })}>Add bank</Button>}
      description="Every rupee lives in one of these. Balances carry into the next month by themselves — the opening figure below is only used for your very first month."
    >
      <ConfigGrid columns="1fr 1fr 130px 24px" headings={["Name", "Note", { label: "Balance at start", right: true }]}>
        {plan.banks.map((b) => (
          <ConfigRow key={b.id}>
            <input value={b.name} aria-label="Bank name" maxLength={80} onChange={(e) => c.patch(b.id, { name: e.target.value })} />
            <input value={b.note || ""} placeholder="optional" aria-label="Note" maxLength={120} onChange={(e) => c.patch(b.id, { note: e.target.value })} />
            <NumberInput value={b.opening} aria-label="Opening balance" onChange={(v) => c.patch(b.id, { opening: v })} />
            <RemoveButton label={"Delete " + b.name} onClick={() => c.remove(b.id)} />
          </ConfigRow>
        ))}
      </ConfigGrid>
    </ConfigCard>
  );
}

export function IncomesSection({ plan }) {
  const c = useCollection("incomes");
  const addPortion = (inc) => c.patch(inc.id, { splits: [...inc.splits, { bank: firstBank(plan), amount: 0 }] });
  return (
    <ConfigCard
      title="Salaries"
      action={<Button size="sm" onClick={() => c.add({ id: uid("in"), name: "New salary", active: true, splits: [{ bank: firstBank(plan), amount: 0 }] })}>Add salary</Button>}
      description="One salary can be split across several banks. Add a portion for each bank it's paid into."
    >
      {plan.incomes.map((inc) => {
        const splits = inc.splits || [];
        const tot = splits.reduce((s, x) => s + N(x.amount), 0);
        const setSplit = (ix, p) => c.patch(inc.id, { splits: splits.map((s, i) => (i === ix ? { ...s, ...p } : s)) });
        return (
          <div className="split" key={inc.id}>
            <div className="sprow" style={{ paddingBottom: 4 }}>
              <input className="input strong" value={inc.name} aria-label="Salary name" maxLength={80} onChange={(e) => c.patch(inc.id, { name: e.target.value })} />
              <span className="n" style={{ textAlign: "right", fontWeight: 600, fontSize: 13 }}>{fmt(tot)}</span>
              <RemoveButton label={"Delete " + inc.name} onClick={() => c.remove(inc.id)} />
            </div>
            {splits.map((sp, ix) => (
              <div className="sprow" key={ix}>
                <BankSelect className="input" plan={plan} value={sp.bank} aria-label="Paid into" onChange={(v) => setSplit(ix, { bank: v })} />
                <NumberInput className="input" value={sp.amount} aria-label="Amount" onChange={(v) => setSplit(ix, { amount: v })} style={{ textAlign: "right" }} />
                <RemoveButton label="Remove portion" onClick={() => c.patch(inc.id, { splits: splits.filter((_, i) => i !== ix) })} />
              </div>
            ))}
            <div className="sptot">
              <Button size="sm" variant="ghost" onClick={() => addPortion(inc)}>+ Add a portion</Button>
              <span>{splits.length} bank{splits.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        );
      })}
    </ConfigCard>
  );
}

export function WalletsSection({ plan }) {
  const c = useCollection("wallets");
  return (
    <ConfigCard
      title="Cash"
      action={<Button size="sm" onClick={() => c.add({ id: uid("w"), name: "New cash pot", from: firstBank(plan), amount: 0 })}>Add cash pot</Button>}
      description="Money you withdraw and spend by hand. Leftover cash carries into next month."
    >
      <ConfigGrid columns="1fr 170px 130px 24px" headings={["Name", "Withdrawn from", { label: "Each month", right: true }]}>
        {plan.wallets.map((w) => (
          <ConfigRow key={w.id}>
            <input value={w.name} aria-label="Cash pot name" maxLength={80} onChange={(e) => c.patch(w.id, { name: e.target.value })} />
            <BankSelect plan={plan} value={w.from} aria-label="Withdrawn from" onChange={(v) => c.patch(w.id, { from: v })} />
            <NumberInput value={w.amount} aria-label="Monthly amount" onChange={(v) => c.patch(w.id, { amount: v })} />
            <RemoveButton label={"Delete " + w.name} onClick={() => c.remove(w.id)} />
          </ConfigRow>
        ))}
      </ConfigGrid>
    </ConfigCard>
  );
}

export function CardsSection({ plan }) {
  const c = useCollection("cards");
  return (
    <ConfigCard
      title="Cards"
      action={<Button size="sm" onClick={() => c.add({ id: uid("c"), name: "New card", bank: firstBank(plan), note: "" })}>Add card</Button>}
      description="Charges build up all month, then the total debits the bank you choose here, next month."
    >
      <ConfigGrid columns="1fr 170px 1fr 24px" headings={["Name", "Billed to", "Note"]}>
        {plan.cards.map((x) => (
          <ConfigRow key={x.id}>
            <input value={x.name} aria-label="Card name" maxLength={80} onChange={(e) => c.patch(x.id, { name: e.target.value })} />
            <BankSelect plan={plan} value={x.bank} allowNone noneLabel="Not billed" aria-label="Billed to" onChange={(v) => c.patch(x.id, { bank: v })} />
            <input value={x.note || ""} placeholder="e.g. statement date" aria-label="Note" maxLength={120} onChange={(e) => c.patch(x.id, { note: e.target.value })} />
            <RemoveButton label={"Delete " + x.name} onClick={() => c.remove(x.id)} />
          </ConfigRow>
        ))}
      </ConfigGrid>
    </ConfigCard>
  );
}

export function TemplatesSection({ plan }) {
  const c = useCollection("templates");
  return (
    <ConfigCard
      title="Every month"
      action={<Button size="sm" onClick={() => c.add({ id: uid("t"), name: "New item", amount: 0, via: { kind: "bank", id: firstBank(plan) }, flow: "out", active: true })}>Add item</Button>}
      description={'Change an amount here and every future month follows. "Move to" shifts money between your own banks instead of spending it.'}
    >
      <ConfigGrid columns="1fr 110px 190px 108px 150px 24px" headings={["Name", { label: "Amount", right: true }, "Paid by", "Kind", "Into"]}>
        {plan.templates.map((t) => (
          <ConfigRow key={t.id}>
            <input value={t.name} aria-label="Item name" maxLength={80} onChange={(e) => c.patch(t.id, { name: e.target.value })} />
            <NumberInput value={t.amount} aria-label="Amount" onChange={(v) => c.patch(t.id, { amount: v })} />
            <ViaSelect plan={plan} value={t.via} aria-label="Paid by" onChange={(v) => c.patch(t.id, { via: v })} />
            <select value={t.flow || "out"} aria-label="Kind" onChange={(e) => c.patch(t.id, { flow: e.target.value })}>
              <option value="out">Spend</option><option value="in">Receive</option><option value="move">Move to</option>
            </select>
            {t.flow === "move"
              ? <BankSelect plan={plan} value={t.to} aria-label="Move into" onChange={(v) => c.patch(t.id, { to: v })} />
              : <span className="mut" style={{ fontSize: 12 }}>—</span>}
            <RemoveButton label={"Delete " + t.name} onClick={() => c.remove(t.id)} />
          </ConfigRow>
        ))}
      </ConfigGrid>
    </ConfigCard>
  );
}

export function InstallmentsSection({ plan, currentMonth }) {
  const c = useCollection("installments");
  const firstCard = plan.cards[0];
  const defaultVia = firstCard ? { kind: "card", id: firstCard.id } : { kind: "bank", id: firstBank(plan) };
  return (
    <ConfigCard
      title="Installments"
      action={<Button size="sm" onClick={() => c.add({ id: uid("i"), name: "New installment", mode: "term", total: 0, months: 12, startMonth: currentMonth, via: defaultVia })}>Add installment</Button>}
      description="Set it once. The monthly amount is worked out for you, and it drops off when it's paid."
    >
      <ConfigGrid columns="1fr 100px 108px 92px 92px 110px 170px 24px"
        headings={["Name", "Runs", { label: "Total", right: true }, { label: "Months / monthly", right: true }, { label: "Paid ahead", right: true }, "Starts", "Paid by"]}>
        {plan.installments.map((it) => (
          <ConfigRow key={it.id}>
            <input value={it.name} aria-label="Installment name" maxLength={80} onChange={(e) => c.patch(it.id, { name: e.target.value })} />
            <select value={it.mode} aria-label="Runs" onChange={(e) => c.patch(it.id, { mode: e.target.value })}>
              <option value="term">Fixed term</option><option value="open">Until paid</option>
            </select>
            <NumberInput value={it.total} aria-label="Total" onChange={(v) => c.patch(it.id, { total: v })} />
            {it.mode === "term"
              ? <NumberInput value={it.months} fallback={1} title="Number of months" aria-label="Number of months" onChange={(v) => c.patch(it.id, { months: Math.max(1, Math.round(v)) })} />
              : <NumberInput value={it.monthly || 0} title="Amount per month" aria-label="Amount per month" onChange={(v) => c.patch(it.id, { monthly: v })} />}
            <NumberInput value={it.prepaid || 0} title="Already paid up front" aria-label="Paid ahead" onChange={(v) => c.patch(it.id, { prepaid: v })} />
            <input type="month" value={it.startMonth} aria-label="Start month" onChange={(e) => e.target.value && c.patch(it.id, { startMonth: e.target.value })} />
            <ViaSelect plan={plan} value={it.via} aria-label="Paid by" onChange={(v) => c.patch(it.id, { via: v })} />
            <RemoveButton label={"Delete " + it.name} onClick={() => c.remove(it.id)} />
          </ConfigRow>
        ))}
      </ConfigGrid>
    </ConfigCard>
  );
}
