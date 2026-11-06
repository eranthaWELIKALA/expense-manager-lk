import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  addMoneyBack, blankMonth, budgetView, computeMonth, lines, markPaid, normalizePlan, partOf, paymentsFor, recordPayment, removeItem,
  removeLine, setMonthDates,
} from "./index";

const B1 = { kind: "bank", id: "b1" }, CASH = { kind: "cash", id: "w1" }, CARD = { kind: "card", id: "c1" };
const AUG = "2026-08", SEP = "2026-09";

/* Groceries is a 40,000 budget set aside in Main, also paid with cash or the card. Electricity is a bill. */
const plan = () => ({
  v: 5, active: SEP, start: "2026-07",
  banks: [{ id: "b1", name: "Main", opening: 100000 }],
  incomes: [],
  wallets: [{ id: "w1", name: "Cash", from: "b1", amount: 20000 }],
  cards: [{ id: "c1", name: "Card", bank: "b1" }],
  templates: [
    { id: "g", name: "Groceries", amount: 40000, via: B1, flow: "out", budget: true, also: [CASH, CARD] },
    { id: "e", name: "Electricity", amount: 9000, via: B1, flow: "out", day: 20 },
  ],
  installments: [],
  months: { "2026-07": blankMonth(), [AUG]: blankMonth(), [SEP]: blankMonth() },
});

const spend = (d, mk, key, amount, via, date, note) => recordPayment(d, mk, key, { amount, via, date, note });
/** Aug: three grocery runs, one on each account, recorded out of date order. */
const shopped = () => {
  let d = plan();
  d = spend(d, AUG, "t:g", 6000, B1, "2026-08-03", "Keells");
  d = spend(d, AUG, "t:g", 14500, CARD, "2026-08-21", "Rice");
  d = spend(d, AUG, "t:g", 3900, CASH, "2026-08-09");
  return d;
};

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 22, 10)); }); // 22 Aug: August still running
afterAll(() => vi.useRealTimers());

describe("budget payments", () => {
  it("lists each payment by date with a running total and the account it came from", () => {
    const g = budgetView(shopped(), AUG).budgets.find((b) => b.key === "t:g");
    expect(g.payments.map((p) => [p.date, p.amount, p.via.kind, p.running])).toEqual([
      ["2026-08-03", 6000, "bank", 6000], ["2026-08-09", 3900, "cash", 9900], ["2026-08-21", 14500, "card", 24400],
    ]);
    expect(g.payments[0].note).toBe("Keells");
    expect(g).toMatchObject({ plan: 40000, spent: 24400, left: 15600, over: false, closed: false });
  });

  it("totals what each account paid, its own account first", () => {
    const g = budgetView(shopped(), AUG).budgets[0];
    expect(g.via).toEqual([B1, CASH, CARD]);
    expect(g.byAccount.map((a) => [a.via.kind, a.amount])).toEqual([["bank", 6000], ["cash", 3900], ["card", 14500]]);
  });

  it("spreads what's left over the days left in the month", () => {
    const g = budgetView(shopped(), AUG).budgets[0];
    expect(g).toMatchObject({ status: "now", daysLeft: 10 }); // 22nd – 31st
    expect(g.perDay).toBeCloseTo(1560);
    const after = budgetView(shopped(), AUG, { today: "2026-09-02" }).budgets[0];
    expect(after).toMatchObject({ status: "past", daysLeft: 0, perDay: 0 });
  });

  it("follows the plan's month start", () => {
    const d = { ...shopped(), monthStart: 25 };
    const g = budgetView(d, SEP, { today: "2026-08-26" });
    expect(g.range).toEqual({ from: "2026-08-25", to: "2026-09-24" });
    expect(g.totals).toMatchObject({ status: "now", daysLeft: 30 });
  });

  it("matches the month's balances", () => {
    const d = shopped(), m = computeMonth(d, AUG);
    const g = budgetView(d, AUG).budgets[0];
    expect(m.ls.find((l) => l.key === "t:g").paid).toBe(g.spent);
  });

  it("shows a budget ticked off as one amount as a single payment", () => {
    const d = markPaid(plan(), AUG, "t:g", { actual: 38000, date: "2026-08-30" });
    const g = budgetView(d, AUG).budgets[0];
    expect(g.payments).toEqual([expect.objectContaining({ amount: 38000, date: "2026-08-30", whole: true, running: 38000 })]);
  });

  it("flags a budget that went over", () => {
    const d = spend(shopped(), AUG, "t:g", 20000, B1, "2026-08-28");
    expect(budgetView(d, AUG).budgets[0]).toMatchObject({ spent: 44400, left: 0, over: true });
    expect(budgetView(d, AUG).totals).toMatchObject({ plan: 40000, spent: 44400, over: 1, payments: 4 });
  });

  it("keeps the spending of the months before", () => {
    const h = budgetView(shopped(), SEP).budgets[0].history;
    expect(h.map((x) => [x.month, x.spent])).toEqual([["2026-07", 0], [AUG, 24400], [SEP, 0]]);
    expect(h.every((x) => x.plan === 40000)).toBe(true);
  });

  it("lists bills paid in parts separately", () => {
    const d = spend(plan(), AUG, "t:e", 4000, CASH, "2026-08-18");
    const v = budgetView(d, AUG);
    expect(v.parts.map((p) => [p.label, p.spent, p.left])).toEqual([["Electricity", 4000, 5000]]);
    expect(v.budgets.map((b) => b.label)).toEqual(["Groceries"]);
  });

  it("includes money back for it", () => {
    const d = shopped();
    const r = addMoneyBack(d, SEP, { to: B1, amount: 1200, date: "2026-09-02", note: "Returned", forMonth: AUG, line: lines(d, AUG).find((l) => l.key === "t:g") });
    const g = budgetView(r, AUG).budgets[0];
    expect(g.back).toEqual([expect.objectContaining({ amount: 1200, date: "2026-09-02", note: "Returned", month: SEP })]);
    expect(g.backTotal).toBe(1200);
  });

  it("opens from a part paid in another account", () => {
    const d = shopped();
    const part = lines(d, AUG).find((l) => l.origin === "part" && l.kind === "cash");
    expect(partOf(part.key)).toBe("t:g");
    expect(paymentsFor(d, AUG, part.key)).toMatchObject({ key: "t:g", spent: 24400 });
    expect(paymentsFor(d, AUG, "t:nope")).toBeNull();
  });
});

describe("budgets paid from several accounts", () => {
  it("carry their other accounts on the line", () => {
    expect(lines(plan(), AUG).find((l) => l.key === "t:g").also).toEqual([CASH, CARD]);
    expect(lines(plan(), AUG).find((l) => l.key === "t:e").also).toBeUndefined();
  });

  it("drop an account once it's deleted", () => {
    expect(lines(removeItem(plan(), "wallets", "w1"), AUG).find((l) => l.key === "t:g").also).toEqual([CARD]);
  });

  it("are tidied on load: well-formed, once each, never their own account, only on budgets", () => {
    const raw = plan();
    raw.templates[0].also = [CASH, B1, CASH, { kind: "nope", id: "x" }, "junk", CARD];
    raw.templates[1].also = [CASH];
    const d = normalizePlan(raw);
    expect(d.templates[0].also).toEqual([CASH, CARD]);
    expect(d.templates[1]).not.toHaveProperty("also");
  });
});

describe("a budget's card payments", () => {
  /* the card's statement is on the 20th: 21 Aug – 20 Sep is its Sep statement */
  const withStatement = (d) => ({ ...d, cards: [{ ...d.cards[0], statementDay: 20 }] });
  const late = () => withStatement(shopped()); // the 14,500 on 21 Aug is after the Aug statement
  const onCard = (d, mk) => lines(d, mk).filter((l) => l.kind === "card" && l.origin === "part");

  it("go on the statement their date is on, while still counting in the budget's own month", () => {
    const d = late();
    expect(onCard(d, AUG)).toEqual([]);
    expect(onCard(d, SEP)).toEqual([expect.objectContaining({
      label: "Groceries (part)", actual: 14500, date: "2026-08-21", partOf: { month: AUG, key: "t:g" }, tag: "Rice · paid 21 Aug · for Aug 2026",
    })]);
    expect(budgetView(d, AUG).budgets[0]).toMatchObject({ spent: 24400 });
    expect(budgetView(d, SEP).budgets[0]).toMatchObject({ spent: 0 });
  });

  it("are billed with that statement", () => {
    const d = late();
    expect(computeMonth(d, AUG).cards[0].charged).toBe(0);
    expect(computeMonth(d, SEP).cards[0].charged).toBe(14500);
    expect(lines(d, "2026-10").find((l) => l.key === "b:c1").plan).toBe(14500); // Sep statement, paid in Oct
  });

  it("say which statement they're on", () => {
    const g = budgetView(late(), AUG).budgets[0];
    expect(g.payments.map((p) => p.statement)).toEqual([null, null, "Sep statement"]);
  });

  it("can be removed from the statement's month", () => {
    const d = late();
    const r = removeLine(d, SEP, onCard(d, SEP)[0].key);
    expect(onCard(r, SEP)).toEqual([]);
    expect(budgetView(r, AUG).budgets[0].spent).toBe(9900);
  });

  it("open the budget they're part of", () => {
    const d = late();
    expect(paymentsFor(d, AUG, onCard(d, SEP)[0].partOf.key)).toMatchObject({ month: AUG, spent: 24400 });
  });

  it("leave a budget set aside on a card running over the plan's months", () => {
    const d = withStatement(plan());
    d.templates[0] = { ...d.templates[0], via: CARD, also: [B1] };
    expect(budgetView(d, AUG).budgets[0].range).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });
});

describe("a budget's payments when a month's dates change", () => {
  it("move to the month their date now counts in", () => {
    let d = spend(plan(), SEP, "t:g", 2000, CASH, "2026-09-03", "Bread");
    d = setMonthDates(d, SEP, { from: "2026-09-05" }); // the salary came on the 5th
    expect(budgetView(d, SEP).budgets[0].payments).toEqual([]);
    expect(budgetView(d, AUG).budgets[0].payments.map((p) => [p.date, p.note])).toEqual([["2026-09-03", "Bread"]]);
    expect(setMonthDates(d, SEP, { from: null }).months[SEP].ov["t:g"].payments).toHaveLength(1); // and back
  });
});
