import { describe, it, expect } from "vitest";
import {
  nextM, prevM, mDiff, isMonthKey, fmt, fmtK, parseAmount,
  instFor, instPaid, computeMonth, blankMonth,
  blankPlan, samplePlan, normalizePlan, setOverride, removeLine, addOneOff, openMonth, rollInto,
} from "./index";

const plan = () => ({
  v: 4, active: "2026-08", start: "2026-08",
  banks: [{ id: "b1", name: "Main", opening: 1000 }, { id: "b2", name: "Save", opening: 0 }],
  incomes: [{ id: "in1", name: "Job", active: true, splits: [{ bank: "b1", amount: 5000 }] }],
  wallets: [{ id: "w1", name: "Cash", from: "b1", amount: 500 }],
  cards: [{ id: "c1", name: "Card", bank: "b1" }],
  templates: [
    { id: "t1", name: "Rent", amount: 2000, via: { kind: "bank", id: "b1" }, flow: "out" },
    { id: "t2", name: "Food", amount: 300, via: { kind: "card", id: "c1" }, flow: "out" },
    { id: "t3", name: "Save", amount: 100, via: { kind: "bank", id: "b1" }, flow: "move", to: "b2" },
    { id: "t4", name: "Groceries", amount: 200, via: { kind: "cash", id: "w1" }, flow: "out" },
  ],
  installments: [{ id: "i1", name: "TV", mode: "term", total: 1200, months: 12, startMonth: "2026-08", via: { kind: "card", id: "c1" } }],
  months: { "2026-08": blankMonth() },
});

describe("months", () => {
  it("wraps years", () => {
    expect(nextM("2026-12")).toBe("2027-01");
    expect(prevM("2026-01")).toBe("2025-12");
    expect(mDiff("2025-11", "2026-02")).toBe(3);
  });
  it("validates keys", () => {
    expect(isMonthKey("2026-08")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("26-8")).toBe(false);
  });
});

describe("format", () => {
  it("formats and parses", () => {
    expect(fmt(1234.5)).toBe("1,234.50");
    expect(fmtK(125000)).toBe("125K");
    expect(fmtK(1500000)).toBe("1.5M");
    expect(parseAmount("1,250.5")).toBe(1250.5);
    expect(parseAmount("  ")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("installments", () => {
  it("term installments split evenly and end", () => {
    const it = { mode: "term", total: 1200, months: 12, startMonth: "2026-01" };
    expect(instFor(it, "2025-12")).toBeNull();
    expect(instFor(it, "2026-01")).toEqual({ amount: 100, n: 1, of: 12 });
    expect(instFor(it, "2027-01")).toBeNull();
    expect(instPaid(it, "2026-06")).toBe(600);
  });
  it("open installments stop once the total is paid", () => {
    const it = { mode: "open", total: 1000, prepaid: 700, monthly: 200, startMonth: "2026-01" };
    expect(instFor(it, "2026-01").amount).toBe(200);
    expect(instFor(it, "2026-02").amount).toBe(100);
    expect(instFor(it, "2026-03")).toBeNull();
  });
});

describe("computeMonth", () => {
  it("balances a month across banks, cash and cards", () => {
    const c = computeMonth(plan(), "2026-08");
    const main = c.banks.find((b) => b.o.id === "b1");
    // 1000 + 5000 salary − 2000 rent − 100 move − 500 withdrawal
    expect(main.closing).toBe(3400);
    expect(c.banks.find((b) => b.o.id === "b2").closing).toBe(100);
    expect(c.wallets[0].closing).toBe(300);
    expect(c.cards[0].due).toBe(400); // food 300 + TV 100
    expect(c.spent).toBe(2000 + 200 + 400);
  });

  it("bills last month's card into the card's bank and carries balances", () => {
    const d = rollInto(plan(), "2026-08", {});
    const c = computeMonth(d, "2026-09");
    const main = c.banks.find((b) => b.o.id === "b1");
    const bill = main.rows.find((r) => r.origin === "bill");
    expect(bill.amt).toBe(400);
    expect(main.opening).toBe(3400);
    expect(c.wallets[0].opening).toBe(300);
  });

  it("applies actuals, removals and one-offs", () => {
    let d = plan();
    d = setOverride(d, "2026-08", "t:t1", "actual", 2500);
    d = removeLine(d, "2026-08", "t:t4");
    d = addOneOff(d, "2026-08", { kind: "bank", targetId: "b1", name: "Gift", amount: 50 });
    const main = computeMonth(d, "2026-08").banks[0];
    expect(main.closing).toBe(3400 - 500 - 50);
    expect(computeMonth(d, "2026-08").wallets[0].closing).toBe(500);
    const x = d.months["2026-08"].extra[0];
    d = removeLine(d, "2026-08", "x:" + x.id);
    expect(d.months["2026-08"].extra).toHaveLength(0);
  });

  it("applies opening adjustments when rolling over", () => {
    const d = rollInto(plan(), "2026-08", { "bank:b1": -400, "bank:b2": 0, bad: NaN });
    expect(d.active).toBe("2026-09");
    expect(d.months["2026-09"].adjust).toEqual({ "bank:b1": -400 });
    expect(computeMonth(d, "2026-09").banks[0].opening).toBe(3000);
  });
});

describe("plan helpers", () => {
  it("openMonth tracks the latest month without moving backwards", () => {
    const d = openMonth(plan(), "2026-07");
    expect(d.active).toBe("2026-08");
    expect(d.months["2026-07"]).toBeDefined();
    expect(openMonth(d, "2026-07")).toBe(d);
  });

  it("templates produce valid plans", () => {
    for (const p of [blankPlan("2026-01"), samplePlan("2026-01")]) {
      expect(() => normalizePlan(p)).not.toThrow();
      expect(() => computeMonth(p, "2026-01")).not.toThrow();
    }
  });

  it("normalizePlan rejects junk and fills gaps", () => {
    expect(() => normalizePlan(null)).toThrow();
    expect(() => normalizePlan({ banks: "x" })).toThrow();
    expect(() => normalizePlan({ banks: [{ name: "no id" }] })).toThrow();
    const n = normalizePlan({ months: { "2026-02": {}, nope: {} } });
    expect(n.banks).toEqual([]);
    expect(Object.keys(n.months)).toEqual(["2026-02"]);
    expect(n.active).toBe("2026-02");
  });
});

import { usageOf, viaLabel } from "./plan";
describe("usageOf / viaLabel", () => {
  it("counts references and labels payment methods", () => {
    const d = plan();
    expect(usageOf(d, "banks", "b1")).toBe(5); // income, wallet, card, rent, transfer source
    expect(usageOf(d, "banks", "b2")).toBe(1); // move target
    expect(usageOf(d, "cards", "c1")).toBe(2);
    expect(usageOf(d, "wallets", "w1")).toBe(1);
    expect(viaLabel(d, { kind: "card", id: "c1" })).toBe("Card · Card");
  });
});

import { isDateISO, ordinal, dateInMonth, dayMonthLabel } from "./months";
import { ensureMonthsThrough, firstMonth, addItem } from "./plan";
describe("dates", () => {
  it("validates and formats dates", () => {
    expect(isDateISO("2026-02-28")).toBe(true);
    expect(isDateISO("2026-02-30")).toBe(false);
    expect(isDateISO("2026-2-3")).toBe(false);
    expect(ordinal(1)).toBe("1st"); expect(ordinal(12)).toBe("12th"); expect(ordinal(22)).toBe("22nd"); expect(ordinal(13)).toBe("13th");
    expect(dateInMonth("2026-11", 31)).toBe("2026-11-30");
    expect(dateInMonth("2028-02", 30)).toBe("2028-02-29");
    expect(dayMonthLabel("2026-10-05")).toBe("5 Oct");
  });

  it("dated one-offs carry a date tag and sort by day", () => {
    let d = plan();
    d = addOneOff(d, "2026-08", { kind: "bank", targetId: "b1", name: "Late", amount: 10, date: "2026-08-25" });
    d = addOneOff(d, "2026-08", { kind: "bank", targetId: "b1", name: "Early", amount: 10, date: "2026-08-03" });
    const rows = computeMonth(d, "2026-08").banks[0].rows.filter((r) => r.origin === "oneoff");
    expect(rows.map((r) => [r.label, r.tag])).toEqual([["Early", "3 Aug"], ["Late", "25 Aug"]]);
  });

  it("recurring items with a start month don't touch earlier months", () => {
    let d = rollInto(plan(), "2026-08", {});
    d = addItem(d, "templates", { id: "t9", name: "Gym", amount: 100, via: { kind: "bank", id: "b1" }, flow: "out", startMonth: "2026-09", day: 5 });
    expect(computeMonth(d, "2026-08").banks[0].rows.some((r) => r.label === "Gym")).toBe(false);
    const gym = computeMonth(d, "2026-09").banks[0].rows.find((r) => r.label === "Gym");
    expect(gym.tag).toBe("due 5th");
  });

  it("ensureMonthsThrough opens the gap so balances carry, without moving active", () => {
    const d = ensureMonthsThrough(plan(), "2026-11");
    expect(Object.keys(d.months).sort()).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(d.active).toBe("2026-08");
    expect(computeMonth(d, "2026-11").banks[0].opening).toBeGreaterThan(1000); // chained, not reset to opening
    expect(ensureMonthsThrough(d, "2026-09")).toBe(d);
    expect(firstMonth(d)).toBe("2026-08");
  });
});
