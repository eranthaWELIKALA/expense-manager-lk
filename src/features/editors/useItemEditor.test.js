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
  it("ignores payment-method changes, since history keeps its method", () => {
    const t = plan.templates[0];
    expect(pastMonthsAffected(plan, "templates", t, { ...t, via: { kind: "cash", id: "w1" } })).toEqual([]);
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

import { installmentDefaults, installmentFromForm } from "./itemModals";

describe("installment type in the form", () => {
  it("stores loan / lease and leaves installments untyped", () => {
    const plan = { start: "2026-08", banks: [{ id: "b1" }], wallets: [], cards: [] };
    const base = { ...installmentDefaults(plan, "2026-08"), name: "Home", total: "1200", months: "12" };
    expect(installmentFromForm({ ...base, itype: "loan" }).type).toBe("loan");
    expect(installmentFromForm({ ...base, itype: "installment" }, { id: "i1", type: "loan" })).not.toHaveProperty("type");
    expect(installmentDefaults(plan, "2026-08", { type: "lease" }).itype).toBe("lease");
  });
});
