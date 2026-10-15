import { describe, expect, it } from "vitest";
import {
  addOneOff, addTransfer, blankMonth, computeMonth, lines, makeReal, markPaid, normalizePlan, payCard, removeLine, withoutMaybes,
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

describe("card balance, limit and due date", () => {
  const withTerms = () => { const d = plan(); d.cards = [{ ...d.cards[0], limit: 1000, dueDay: 25 }]; return d; };

  it("owes last month's bill until it's paid, plus charges made so far", () => {
    const m = computeMonth(withTerms(), SEP);
    expect(card(m, "c1")).toMatchObject({ balance: 400, available: 600, bill: { amount: 400, left: 400, date: "2026-09-25", done: false } });
    expect(lines(withTerms(), SEP).find((l) => l.key === "b:c1")).toMatchObject({ day: 25, tag: "Aug 26 · due 25th" });
    const ticked = markPaid(withTerms(), SEP, "t:t2", { actual: 300 }); // Food charged this month
    expect(card(computeMonth(ticked, SEP), "c1").balance).toBe(700);
  });

  it("drops once the bill is paid", () => {
    const d = payCard(withTerms(), SEP, { cardId: "c1", bankId: "b1", amount: 400, date: "2026-09-05" }).plan;
    expect(card(computeMonth(d, SEP), "c1")).toMatchObject({ balance: 0, available: 1000, bill: { left: 0, done: true } });
  });
});

describe("cards with no bank", () => {
  const noBank = () => { const d = plan(); d.cards = [{ id: "c1", name: "Card", bank: "", dueDay: 25 }]; return d; };

  it("keep last month's charges as the card's own bill", () => {
    const m = computeMonth(noBank(), SEP);
    expect(lines(noBank(), SEP).some((l) => l.key === "b:c1")).toBe(false); // nothing on any bank
    expect(card(m, "c1")).toMatchObject({ balance: 400, bill: { amount: 400, left: 400, date: "2026-09-25" } });
  });

  it("settle that bill first from any bank, the rest is paid ahead", () => {
    let r = payCard(noBank(), SEP, { cardId: "c1", bankId: "b2", amount: 150, date: "2026-09-05" });
    expect(r).toMatchObject({ toBill: 150, ahead: 0 });
    r = payCard(r.plan, SEP, { cardId: "c1", bankId: "b1", amount: 350, date: "2026-09-06" });
    expect(r).toMatchObject({ toBill: 250, ahead: 100 });
    const m = computeMonth(r.plan, SEP);
    expect(card(m, "c1")).toMatchObject({ balance: 0, bill: { left: 0, done: true }, paid: 100, due: 300 }); // Sep charges 400 − 100 ahead
    expect(bank(m, "b2").closing).toBe(bank(computeMonth(noBank(), SEP), "b2").closing - 150);
  });
});
