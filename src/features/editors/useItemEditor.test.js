// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { blankMonth, currentMonthKey, prevM } from "../../domain";
import { pastMonthsAffected } from "./useItemEditor";

const now = currentMonthKey(), last = prevM(now), older = prevM(last);
const plan = {
  banks: [{ id: "b1", name: "Main", opening: 100 }], wallets: [], cards: [], incomes: [],
  templates: [
    { id: "t1", name: "Rent", amount: 50, via: { kind: "bank", id: "b1" }, flow: "out" },
    { id: "t2", name: "Gym", amount: 10, via: { kind: "bank", id: "b1" }, flow: "out", startMonth: now },
  ],
  installments: [],
  months: { [older]: blankMonth(), [last]: blankMonth(), [now]: blankMonth() },
};

describe("pastMonthsAffected", () => {
  it("flags past months when an amount changes", () => {
    const t = plan.templates[0];
    expect(pastMonthsAffected(plan, "templates", t, { ...t, amount: 60 })).toEqual([older, last]);
  });
  it("ignores cosmetic edits", () => {
    const t = plan.templates[0];
    expect(pastMonthsAffected(plan, "templates", t, { ...t, name: "Rent!" })).toEqual([]);
  });
  it("ignores items that only start this month", () => {
    const t = plan.templates[1];
    expect(pastMonthsAffected(plan, "templates", t, { ...t, amount: 20 })).toEqual([]);
  });
  it("treats a changed opening balance as affecting every past month", () => {
    const b = plan.banks[0];
    expect(pastMonthsAffected(plan, "banks", b, { ...b, opening: 200 })).toEqual([older, last]);
    expect(pastMonthsAffected(plan, "banks", b, { ...b, note: "x" })).toEqual([]);
  });
});
