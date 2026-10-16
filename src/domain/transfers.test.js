import { describe, expect, it } from "vitest";
import {
  addDays, addOneOff, addTransfer, billsIn, blankMonth, computeMonth, currentMonthKey, lines, makeReal, markPaid, nextM, normalizePlan, payCard, prevM, removeLine, withoutMaybes,
} from "./index";

/* Aug: card c1 is charged Food 300 + TV 100 = 400, billed to b1 in Sep. */
const plan = () => ({
  v: 4, active: "2026-09", start: "2026-08",
  banks: [{ id: "b1", name: "Main", opening: 1000 }, { id: "b2", name: "Save", opening: 2000 }],
  incomes: [{ id: "in1", name: "Job", active: true, splits: [{ bank: "b1", amount: 5000 }] }],
  wallets: [{ id: "w1", name: "Cash", from: "b1", amount: 0 }],
  cards: [{ id: "c1", name: "Card", bank: "b1" }],
  templates: [{ id: "t2", name: "Food", amount: 300, via: { kind: "card", id: "c1" }, flow: "out" }],
  installments: [{ id: "i1", name: "TV", mode: "term", total: 1200, months: 12, startMonth: "2026-08", via: { kind: "card", id: "c1" } }],
  months: { "2026-08": blankMonth(), "2026-09": blankMonth() },
});
const bank = (m, id) => m.banks.find((b) => b.o.id === id);
const card = (m, id) => m.cards.find((c) => c.o.id === id);
const AUG = "2026-08", SEP = "2026-09";

describe("transfers", () => {
  it("moves money between accounts without counting as spending", () => {
    const before = computeMonth(plan(), AUG);
    const d = addTransfer(plan(), AUG, { from: { kind: "bank", id: "b1" }, to: { kind: "cash", id: "w1" }, amount: 1000, date: "2026-08-10" });
    const m = computeMonth(d, AUG);
    expect(bank(m, "b1").closing).toBe(bank(before, "b1").closing - 1000);
    expect(m.wallets[0].closing).toBe(before.wallets[0].closing + 1000);
    expect(m.spent).toBe(before.spent);
    const [out, inn] = lines(d, AUG).filter((l) => l.origin === "transfer");
    expect(out).toMatchObject({ label: "Cash withdrawn → Cash", done: true, kind: "bank" });
    expect(inn).toMatchObject({ label: "Cash withdrawn ← Main", done: true, kind: "cash" });
  });

  it("records money from outside on one side only", () => {
    const before = computeMonth(plan(), AUG);
    const d = addTransfer(plan(), AUG, { from: null, to: { kind: "bank", id: "b2" }, amount: 500, note: "Gift" });
    const m = computeMonth(d, AUG);
    expect(bank(m, "b2").closing).toBe(bank(before, "b2").closing + 500);
    expect(m.earned).toBe(before.earned);
    expect(lines(d, AUG).filter((l) => l.origin === "transfer").map((l) => l.label)).toEqual(["Gift"]);
  });

  it("removes both sides together", () => {
    const d = addTransfer(plan(), AUG, { from: { kind: "bank", id: "b1" }, to: { kind: "bank", id: "b2" }, amount: 50 });
    const key = lines(d, AUG).find((l) => l.key.startsWith("ti:")).key;
    expect(lines(removeLine(d, AUG, key), AUG).some((l) => l.origin === "transfer")).toBe(false);
  });

  it("survives saving and loading", () => {
    const d = addTransfer(plan(), AUG, { from: { kind: "bank", id: "b1" }, to: { kind: "bank", id: "b2" }, amount: 50 });
    expect(normalizePlan(JSON.parse(JSON.stringify(d))).months[AUG].transfers).toHaveLength(1);
  });
});

describe("card payments", () => {
  it("paying ahead lowers next month's bill but not this month's spending", () => {
    const d = payCard(plan(), AUG, { cardId: "c1", bankId: "b1", amount: 150 }).plan;
    expect(card(computeMonth(d, AUG), "c1")).toMatchObject({ charged: 400, paid: 150, due: 250 });
    expect(computeMonth(d, AUG).spentCard).toBe(400);
    expect(lines(d, SEP).find((l) => l.key === "b:c1").plan).toBe(250);
  });

  it("settles this month's bill first, from any bank, then pays ahead", () => {
    const before = computeMonth(plan(), SEP);
    const r = payCard(plan(), SEP, { cardId: "c1", bankId: "b2", amount: 500, date: "2026-09-05" });
    expect(r).toMatchObject({ toBill: 400, ahead: 100 });
    const m = computeMonth(r.plan, SEP);
    const bill = lines(r.plan, SEP).find((l) => l.key === "b:c1");
    expect(bill.done).toBe(true);
    expect(bank(m, "b1").closing).toBe(bank(before, "b1").closing + 400); // no longer paid from the card's usual bank
    expect(bank(m, "b2").closing).toBe(bank(before, "b2").closing - 500);
    expect(card(m, "c1").due).toBe(card(before, "c1").due - 100);
  });

  it("can pay part of the bill", () => {
    const r = payCard(plan(), SEP, { cardId: "c1", bankId: "b1", amount: 150 });
    expect(r).toMatchObject({ toBill: 150, ahead: 0 });
    const bill = lines(r.plan, SEP).find((l) => l.key === "b:c1");
    expect(bill.done).toBe(false);
    expect(bill.remaining).toBe(250);
  });
});

describe("what-ifs", () => {
  it("count in balances until made real or dropped", () => {
    const d = addOneOff(plan(), AUG, { kind: "bank", targetId: "b1", name: "New phone", amount: 900, date: "2026-08-20", maybe: true });
    const line = lines(d, AUG).find((l) => l.label === "New phone");
    expect(line).toMatchObject({ maybe: true, done: false });
    expect(line.tag).toMatch(/what-if/);
    const withIt = bank(computeMonth(d, AUG), "b1").closing;
    expect(bank(computeMonth(withoutMaybes(d), AUG), "b1").closing).toBe(withIt + 900);
    expect(withoutMaybes(plan())).toEqual(plan()); // nothing to strip
    const real = makeReal(d, AUG, line.key);
    expect(lines(real, AUG).find((l) => l.label === "New phone").maybe).toBeUndefined();
    expect(withoutMaybes(real)).toBe(real);
  });
});

/* The card tests below run in the current month (N) and the one before (P), so "already issued" is real. */
const N0 = currentMonthKey(), P0 = prevM(N0);
const live = (card) => {
  const d = plan();
  d.start = P0; d.active = N0;
  d.months = { [P0]: blankMonth(), [N0]: blankMonth() };
  d.installments = [{ ...d.installments[0], startMonth: P0 }];
  d.cards = [{ id: "c1", name: "Card", bank: "b1", ...card }];
  return d;
};

describe("card balance, limit and due date", () => {
  const withTerms = () => live({ limit: 2000, dueDay: 25 });
  // owed: last month's 400 bill + this month's 400; the TV plan (1,200 over 12 months) holds its last 1,000 against the card

  it("owes last month's bill until it's paid, plus this month's charges", () => {
    const m = computeMonth(withTerms(), N0);
    expect(card(m, "c1")).toMatchObject({ owed: 800, instAhead: 1000, balance: 1800, available: 200, bill: { amount: 400, left: 400, date: N0 + "-25", done: false } });
    expect(lines(withTerms(), N0).find((l) => l.key === "b:c1")).toMatchObject({ day: 25 });
    const ticked = markPaid(withTerms(), N0, "t:t2", { actual: 350 }); // Food came to 350, not the planned 300
    expect(card(computeMonth(ticked, N0), "c1")).toMatchObject({ owed: 850, balance: 1850 });
  });

  it("drops once the bill is paid", () => {
    const d = payCard(withTerms(), N0, { cardId: "c1", bankId: "b1", amount: 400, date: N0 + "-05" }).plan;
    expect(card(computeMonth(d, N0), "c1")).toMatchObject({ owed: 400, balance: 1400, available: 600, bill: { left: 0, done: true } });
  });
});

describe("cards with no bank", () => {
  const noBank = () => live({ bank: "", dueDay: 25 });

  it("keep last month's charges as the card's own bill", () => {
    const m = computeMonth(noBank(), N0);
    expect(lines(noBank(), N0).some((l) => l.key === "b:c1")).toBe(false); // nothing on any bank
    expect(card(m, "c1")).toMatchObject({ owed: 800, balance: 1800, bill: { amount: 400, left: 400, date: N0 + "-25" } });
  });

  it("settle that bill first from any bank, the rest is paid ahead", () => {
    let r = payCard(noBank(), N0, { cardId: "c1", bankId: "b2", amount: 150, date: N0 + "-05" });
    expect(r).toMatchObject({ toBill: 150, ahead: 0 });
    r = payCard(r.plan, N0, { cardId: "c1", bankId: "b1", amount: 350, date: N0 + "-06" });
    expect(r).toMatchObject({ toBill: 250, ahead: 100 });
    const m = computeMonth(r.plan, N0);
    expect(card(m, "c1")).toMatchObject({ owed: 300, balance: 1300, bill: { left: 0, done: true }, due: 300 }); // this month's 400 − 100 ahead
    expect(bank(m, "b2").closing).toBe(bank(computeMonth(noBank(), N0), "b2").closing - 150);
  });
});

describe("card statement cycles", () => {
  // a 50 charge on the 25th of last month: after a statement on the 20th, before one on the 5th... both put it on the next statement
  const late = (card) => addOneOff(live(card), P0, { name: "Shoes", amount: 50, kind: "card", targetId: "c1", date: P0 + "-25" });

  it("bill what's up to the statement day, due 21 days later", () => {
    const d = late({ statementDay: 20 });
    const stmt = P0 + "-20", due = addDays(stmt, 21);
    expect(billsIn(d, d.cards[0], N0).map((b) => b.cycle)).toEqual([P0]);
    expect(lines(d, N0).find((l) => l.key === "b:c1")).toMatchObject({ plan: 400, date: due, tag: expect.stringMatching(/^statement 20 /) });
    expect(card(computeMonth(d, N0), "c1")).toMatchObject({ next: { cycle: N0 }, due: 450 }); // this month's 400 + the late 50
  });

  it("can fall due in the statement's own month", () => {
    const d = late({ statementDay: 5, payDays: 21 });
    expect(billsIn(d, d.cards[0], N0).map((b) => b.cycle)).toEqual([N0]);
    expect(lines(d, N0).find((l) => l.key === "b:c1")).toMatchObject({ plan: 450, date: N0 + "-26" }); // 400 by the 5th + the late 50
  });
});

describe("card installments ahead", () => {
  it("count only the months after this one — this month's slice is already a charge", () => {
    const d = live({});
    expect(card(computeMonth(d, N0), "c1")).toMatchObject({ instAhead: 1000 });
  });
  it("hold a plan that hasn't started yet in full", () => {
    const d = live({});
    d.installments = [{ ...d.installments[0], startMonth: nextM(N0) }];
    expect(card(computeMonth(d, N0), "c1").instAhead).toBe(1200);
  });
});
