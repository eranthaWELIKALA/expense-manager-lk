// @vitest-environment jsdom
import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { blankMonth, budgetView, lines, markPaid, recordPayment } from "../../domain";
import { LineRow } from "../plan/LineRow";
import { BudgetCard } from "./BudgetCard";

beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 7, 22, 10)); });
afterAll(() => vi.useRealTimers());
afterEach(cleanup);

const B1 = { kind: "bank", id: "b1" }, CASH = { kind: "cash", id: "w1" }, CARD = { kind: "card", id: "c1" };
const AUG = "2026-08";
const base = () => ({
  v: 5, active: AUG, start: "2026-07",
  banks: [{ id: "b1", name: "Main", opening: 100000 }], incomes: [],
  wallets: [{ id: "w1", name: "Daily cash", from: "b1", amount: 0 }],
  cards: [{ id: "c1", name: "DFCC", bank: "b1" }],
  templates: [
    { id: "e", name: "Electricity", amount: 12000, via: CASH, flow: "out", budget: true, also: [CARD] },
    { id: "r", name: "Rent", amount: 50000, via: B1, flow: "out" },
  ],
  installments: [], months: { "2026-07": blankMonth(), [AUG]: blankMonth() },
});
const paid = () => {
  let d = base();
  d = recordPayment(d, AUG, "t:e", { amount: 5000, via: CASH, date: "2026-08-04", note: "CEB" });
  d = recordPayment(d, AUG, "t:e", { amount: 8000, via: CARD, date: "2026-08-15" });
  return d;
};
const card = (d) => budgetView(d, AUG).budgets[0];

describe("BudgetCard", () => {
  it("lists each payment with its date, account, amount and total so far", () => {
    render(<BudgetCard plan={paid()} s={card(paid())} />);
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(rows).toEqual([
      expect.stringMatching(/^4 Aug.*Daily cash.*CEB.*5,000\.00.*5,000\.00$/),
      expect.stringMatching(/^15 Aug.*DFCC.*8,000\.00.*13,000\.00$/),
    ]);
  });

  it("says how it was paid, how much each account paid, and that it went over", () => {
    render(<BudgetCard plan={paid()} s={card(paid())} />);
    expect(screen.getByText("Paid with Daily cash or DFCC · the rest stays set aside in Daily cash")).toBeTruthy();
    expect(screen.getByText("over budget")).toBeTruthy();
    expect(screen.getByText(/1,000\.00 over budget/)).toBeTruthy();
    const by = within(screen.getByRole("list", { name: "By account" })).getAllByRole("listitem")
      .map((li) => [li.querySelector("span:not(.alogo):not(.alogo *)").textContent, li.querySelector("b").textContent]);
    expect(by).toEqual([["Daily cash", "5,000.00"], ["DFCC", "8,000.00"]]);
  });

  it("shows the months before, each with its figures", () => {
    render(<BudgetCard plan={paid()} s={card(paid())} />);
    const cols = within(screen.getByRole("list", { name: /Spent each month/ })).getAllByRole("listitem");
    expect(cols.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Jul 2026: 0.00 of 12,000.00", "Aug 2026: 13,000.00 of 12,000.00 · 1,000.00 over",
    ]);
  });

  it("removes a payment, but not one ticked off as a single amount", () => {
    const onRemove = vi.fn();
    render(<BudgetCard plan={paid()} s={card(paid())} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove the 8,000.00 payment on 15 Aug" }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ key: "t:e" }), expect.objectContaining({ amount: 8000 }));
    cleanup();
    const whole = markPaid(base(), AUG, "t:e", { actual: 11000, date: "2026-08-30" });
    render(<BudgetCard plan={whole} s={card(whole)} onRemove={onRemove} />);
    expect(screen.getByText("ticked off as one amount")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Remove the/ })).toBeNull();
  });
});

describe("LineRow payments link", () => {
  it("opens the payments of a budget, and of a part shown in another account", () => {
    const d = paid(), onPayments = vi.fn();
    const ls = lines(d, AUG);
    render(<LineRow line={ls.find((l) => l.key === "t:e")} onPayments={onPayments} />);
    fireEvent.click(screen.getByRole("button", { name: /Payments for Electricity/ }));
    const part = ls.find((l) => l.origin === "part");
    render(<LineRow line={part} onPayments={onPayments} />);
    fireEvent.click(screen.getByRole("button", { name: /Payments for Electricity \(part\)/ }));
    expect(onPayments.mock.calls.map((c) => c[0].key)).toEqual(["t:e", part.key]);
    expect(onPayments.mock.calls[1][0].partOf).toEqual({ month: AUG, key: "t:e" }); // opens the month it's part of
  });

  it("leaves other lines' tags as they are", () => {
    render(<LineRow line={lines(base(), AUG).find((l) => l.key === "t:r")} onPayments={() => {}} />);
    expect(screen.queryByRole("button", { name: /Payments for/ })).toBeNull();
  });
});
