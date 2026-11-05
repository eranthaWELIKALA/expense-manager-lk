import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addOneOff, addTransfer, billsIn, blankMonth, computeMonth, currentMonth, dateInPeriod, defaultDateIn, entryMonth, lines,
  monthFor, monthRange, normalizePlan, periodOf, periodRange, recordPayment, refileDated, setMonthStart,
} from "./index";

const OCT = "2026-10", NOV = "2026-11", DEC = "2026-12";
const BANK = { kind: "bank", id: "b1" }, CASH = { kind: "cash", id: "w1" }, CARD = { kind: "card", id: "c1" }, PLAIN = { kind: "card", id: "c2" };

/* Oct–Dec. Card c1 has a statement on the 25th; c2 has none. */
const plan = (extra = {}) => ({
  v: 5, active: DEC, start: OCT,
  banks: [{ id: "b1", name: "Main", opening: 10000 }],
  incomes: [{ id: "in1", name: "Job", active: true, splits: [{ bank: "b1", amount: 5000 }] }],
  wallets: [{ id: "w1", name: "Cash", from: "b1", amount: 1000 }],
  cards: [{ id: "c1", name: "Card", bank: "b1", statementDay: 25 }, { id: "c2", name: "Plain", bank: "b1" }],
  templates: [], installments: [],
  months: { [OCT]: blankMonth(), [NOV]: blankMonth(), [DEC]: blankMonth() },
  ...extra,
});
/** Record a paid one-off where the app would: in the month its date counts in. */
const spend = (d, ref, date, amount = 100, name = "Spend") =>
  addOneOff(d, entryMonth(d, ref, date), { kind: ref.kind, targetId: ref.id, name, amount, date, paid: true });
const names = (d, mk) => (d.months[mk].extra || []).map((e) => e.name);

describe("months that don't follow the calendar", () => {
  it("are calendar months by default", () => {
    expect(periodOf("2026-12-02")).toBe(DEC);
    expect(periodRange(NOV)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });

  it("starting on the 5th, the first days count in the month before", () => {
    expect(periodOf("2026-12-04", 4)).toBe(NOV);
    expect(periodOf("2026-12-05", 4)).toBe(DEC);
    expect(periodRange(NOV, 4)).toEqual({ from: "2026-11-05", to: "2026-12-04" });
    expect(dateInPeriod(NOV, 4, 2)).toBe("2026-12-02");
    expect(dateInPeriod(NOV, 4, 20)).toBe("2026-11-20");
  });

  it("starting late in the month, are named by the month they end in", () => {
    expect(periodOf("2026-10-25", 24)).toBe(NOV);
    expect(periodRange(NOV, 24)).toEqual({ from: "2026-10-25", to: "2026-11-24" });
  });

  it("end on a short month's last day when the cutoff is past it", () => {
    expect(periodOf("2026-02-28", 30)).toBe("2026-02");
    expect(periodOf("2026-03-01", 30)).toBe("2026-03");
    expect(periodRange("2026-02", 30)).toEqual({ from: "2026-01-31", to: "2026-02-28" });
    expect(periodRange("2026-03", 30)).toEqual({ from: "2026-03-01", to: "2026-03-30" });
    expect(dateInPeriod("2026-03", 30, 31)).toBe("2026-03-30");
  });
});

describe("which month a date counts in", () => {
  it("banks and cash follow the plan's month start; a card with a statement day follows its statements", () => {
    const d = plan({ monthStart: 5 });
    expect(monthFor(d, CASH, "2026-12-02")).toBe(NOV);
    expect(monthFor(d, BANK, "2026-12-05")).toBe(DEC);
    expect(monthFor(d, PLAIN, "2026-12-02")).toBe(NOV); // no statement day: the plan's months
    expect(monthFor(d, CARD, "2026-11-28")).toBe(DEC); // after the 25th: on the Dec statement
    expect(monthRange(d, NOV)).toEqual({ from: "2026-11-05", to: "2026-12-04" });
    expect(currentMonth(d, null, "2026-11-03")).toBe(OCT);
    expect(defaultDateIn(d, "2020-03")).toBe("2020-03-05");
  });

  it("is never before the plan's first month", () => {
    expect(entryMonth(plan({ monthStart: 5 }), CASH, "2026-10-02")).toBe(OCT);
  });
});

describe("spending before the month starts", () => {
  it("counts in the month before — its spending and its balances", () => {
    const base = plan({ monthStart: 5 });
    const d = spend(base, CASH, "2026-12-02", 300);
    expect(names(d, NOV)).toEqual(["Spend"]);
    const nov = computeMonth(d, NOV), before = computeMonth(base, NOV);
    expect(nov.spentCash - before.spentCash).toBe(300);
    expect(nov.wallets[0].closing).toBe(before.wallets[0].closing - 300);
    expect(computeMonth(d, DEC).wallets[0].opening).toBe(nov.wallets[0].closing);
  });

  it("shows in date order through the month", () => {
    const d = spend(spend(plan({ monthStart: 5 }), BANK, "2026-12-02", 10, "Late"), BANK, "2026-11-20", 10, "Early");
    expect(computeMonth(d, NOV).banks[0].rows.filter((r) => r.origin === "oneoff").map((r) => r.label)).toEqual(["Early", "Late"]);
  });
});

describe("today's month", () => {
  afterEach(() => vi.useRealTimers());

  it("runs to its last day: budgets stay open and auto-debits wait for their date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 3, 12)); // 3 Nov — still Oct's month when months start on the 5th
    const d = plan({ monthStart: 5 });
    d.templates = [{ id: "t1", name: "Groceries", amount: 500, via: BANK, flow: "out", budget: true }];
    d.installments = [{ id: "i1", name: "Loan", mode: "term", total: 1200, months: 12, startMonth: OCT, day: 4, via: BANK, auto: true }];
    const spent = recordPayment(d, OCT, "t:t1", { amount: 100, via: BANK, date: "2026-10-10" });
    expect(currentMonth(d)).toBe(OCT);
    expect(lines(spent, OCT).find((l) => l.key === "t:t1")).toMatchObject({ done: false, paid: 100 });
    expect(lines(d, OCT).find((l) => l.key === "i:i1")).toMatchObject({ done: false }); // due 4 Nov
  });
});

describe("card statements by month", () => {
  it("a charge after the statement day is on the next statement, and counts in its month", () => {
    const d = spend(plan(), CARD, "2026-11-28", 200);
    expect(names(d, DEC)).toEqual(["Spend"]);
    expect(computeMonth(d, NOV).spentCard).toBe(0);
    expect(computeMonth(d, DEC).cards[0]).toMatchObject({ charged: 200, due: 200, next: { cycle: DEC, statement: "2026-12-25" } });
  });

  it("a monthly item is on its own month's statement, whatever its day", () => {
    const d = plan();
    d.templates = [{ id: "t1", name: "Streaming", amount: 40, via: CARD, flow: "out", startMonth: NOV, day: 28 }];
    expect(lines(d, DEC).find((l) => l.key === "b:c1")).toMatchObject({ plan: 40, cycle: NOV });
  });

  it("a bill counts in the plan month its pay-by date falls in", () => {
    const d = plan({ monthStart: 5, cards: [{ id: "c1", name: "Card", bank: "b1", statementDay: 20, payDays: 14 }] });
    expect(billsIn(d, d.cards[0], OCT).map((b) => b.due)).toEqual(["2026-11-03"]); // before 5 Nov: Oct's month
    expect(billsIn(d, d.cards[0], NOV).map((b) => b.cycle)).toEqual([NOV]);
  });
});

describe("changing the month start", () => {
  it("moves dated payments and transfers into the month they now count in, ticks included", () => {
    let d = spend(plan(), CASH, "2026-12-02", 300, "Early Dec");
    d = spend(d, CASH, "2026-12-10", 50, "Mid Dec");
    d = addTransfer(d, DEC, { from: BANK, to: CASH, amount: 1000, date: "2026-12-03" });
    const moved = setMonthStart(d, 5);
    expect(moved.monthStart).toBe(5);
    expect(names(moved, NOV)).toEqual(["Early Dec"]);
    expect(names(moved, DEC)).toEqual(["Mid Dec"]);
    expect(moved.months[NOV].transfers).toHaveLength(1);
    const id = moved.months[NOV].extra[0].id;
    expect(moved.months[NOV].ov["x:" + id]).toMatchObject({ done: true, paidOn: "2026-12-02" });
    expect(moved.months[DEC].ov["x:" + id]).toBeUndefined();

    const back = setMonthStart(moved, 1);
    expect(back).not.toHaveProperty("monthStart");
    expect(names(back, DEC)).toEqual(["Mid Dec", "Early Dec"]);
    expect(refileDated(back)).toBe(back); // nothing left to move
  });

  it("adds a month after the last one when a date now counts in it", () => {
    const moved = setMonthStart(spend(plan(), CASH, "2026-12-28", 10), 25); // 25 Dec – 24 Jan is Jan
    expect(names(moved, "2027-01")).toEqual(["Spend"]);
    expect(moved.active).toBe(DEC);
  });

  it("doesn't duplicate an entry that's already in its month (e.g. after an undo)", () => {
    const d = spend(plan(), CASH, "2026-12-02", 10);
    const item = d.months[DEC].extra[0];
    const twice = { ...d, monthStart: 5, months: { ...d.months, [NOV]: { ...d.months[NOV], extra: [item] } } };
    const r = refileDated(twice);
    expect(r.months[NOV].extra).toHaveLength(1);
    expect(r.months[DEC].extra).toHaveLength(0);
  });
});

describe("plans saved before v5", () => {
  it("move dated card charges to their statement's month, and start monthly card items from their first statement", () => {
    const old = plan({ v: 4 });
    old.months[NOV] = { ...blankMonth(), extra: [{ id: "x1", name: "Shoes", amount: 50, kind: "card", id2: "c1", flow: "out", date: "2026-11-28" }], ov: { "x:x1": { done: true } } };
    old.templates = [
      { id: "t1", name: "Streaming", amount: 40, via: CARD, flow: "out", startMonth: NOV, day: 28 }, // first charged 28 Nov: the Dec statement
      { id: "t2", name: "Gym", amount: 30, via: CARD, flow: "out", startMonth: NOV, day: 10 },
    ];
    const d = normalizePlan(old);
    expect(d.v).toBe(5);
    expect(d.months[DEC].extra.map((e) => e.id)).toEqual(["x1"]);
    expect(d.months[DEC].ov["x:x1"]).toEqual({ done: true });
    expect(d.templates.map((t) => t.startMonth)).toEqual([DEC, NOV]);
    expect(normalizePlan(d).templates[0].startMonth).toBe(DEC); // only once
  });

  it("keep only a valid month start", () => {
    expect(normalizePlan(plan({ monthStart: 40 }))).not.toHaveProperty("monthStart");
    expect(normalizePlan(plan({ monthStart: 5 })).monthStart).toBe(5);
  });
});
