// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { blankMonth } from "../../domain";
import { NewExpenseModal, RecordPaymentModal } from "./ExpenseModal";

afterEach(cleanup);

const plan = {
  v: 4, active: "2026-08", start: "2026-08",
  banks: [{ id: "b1", name: "Main", opening: 1000 }], incomes: [], wallets: [],
  cards: [{ id: "c1", name: "Visa", bank: "b1" }],
  templates: [{ id: "t1", name: "Rent", amount: 2000, via: { kind: "bank", id: "b1" }, flow: "out" }],
  installments: [], months: { "2026-08": blankMonth() },
};

const setup = () => {
  const onSave = vi.fn();
  render(<RecordPaymentModal plan={plan} monthKey="2026-08" onSave={onSave} onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-08-05" } });
  return onSave;
};

describe("RecordPaymentModal", () => {
  it("searches an existing bill, prefills it, and records the real amount, method and date", async () => {
    const onSave = setup();
    const box = screen.getByRole("combobox", { name: "What for" });
    fireEvent.change(box, { target: { value: "ren" } });
    fireEvent.keyDown(box, { key: "Enter" }); // first match
    expect(box.value).toBe("Rent");
    expect(screen.getByLabelText("Amount paid").value).toBe("2,000");
    fireEvent.change(screen.getByLabelText("Amount paid"), { target: { value: "1950" } });
    fireEvent.change(screen.getByLabelText("Paid with"), { target: { value: "card|c1" } });
    fireEvent.click(screen.getByRole("button", { name: "Record part payment" })); // 1,950 of 2,000
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      type: "pay", monthKey: "2026-08", line: { key: "t:t1" },
      payment: { amount: 1950, via: { kind: "card", id: "c1" }, date: "2026-08-05", settle: false },
    });
  });

  it("records part of a bill, and 'settles it' when ticked", async () => {
    const onSave = setup();
    const box = screen.getByRole("combobox", { name: "What for" });
    fireEvent.change(box, { target: { value: "rent" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.change(screen.getByLabelText("Amount paid"), { target: { value: "500" } });
    expect(screen.getByText(/1,500.00 will still be left/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /This settles it/ }).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Record part payment" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].payment).toMatchObject({ amount: 500, settle: false });
    fireEvent.click(screen.getByRole("checkbox", { name: /This settles it/ }));
    const markPaid = screen.getByRole("button", { name: "Mark paid" });
    await vi.waitFor(() => expect(markPaid.disabled).toBe(false)); // the first save has finished
    fireEvent.click(markPaid);
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].payment).toMatchObject({ amount: 500, settle: true });
  });

  it("records something not in the plan as a paid one-time payment", async () => {
    const onSave = setup();
    fireEvent.change(screen.getByRole("combobox", { name: "What for" }), { target: { value: "Taxi" } });
    expect(screen.getByRole("option", { name: /New payment “Taxi”/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "900" } });
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      type: "once", monthKey: "2026-08",
      item: { name: "Taxi", amount: 900, kind: "card", targetId: "c1", date: "2026-08-05", paid: true },
    });
  });
});

describe("NewExpenseModal — installment", () => {
  it("can start before the plan; earlier payments count as already made", async () => {
    const onSave = vi.fn();
    render(<NewExpenseModal plan={plan} monthKey="2026-08" onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /Installment/ }));
    fireEvent.change(screen.getByLabelText("What for"), { target: { value: "Phone" } });
    fireEvent.change(screen.getByLabelText("Total price"), { target: { value: "120000" } });
    fireEvent.change(screen.getByLabelText("Months"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("First payment"), { target: { value: "2026-01-10" } });
    expect(screen.getByText(/7 payments already made, so Aug 26 is payment 8 of 12/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add installment" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ type: "installment", item: { name: "Phone", startMonth: "2026-01", months: 12 } });
  });

  it("takes the monthly amount or the total — the other follows", async () => {
    const onSave = vi.fn();
    render(<NewExpenseModal plan={plan} monthKey="2026-08" onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /Installment/ }));
    fireEvent.change(screen.getByLabelText("What for"), { target: { value: "Car" } });
    fireEvent.change(screen.getByLabelText("Months"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Pay each month"), { target: { value: "125,000" } });
    expect(screen.getByLabelText("Total price").value).toBe("7,500,000.00");
    fireEvent.change(screen.getByLabelText("Months"), { target: { value: "48" } }); // keeps the monthly amount you typed
    expect(screen.getByLabelText("Total price").value).toBe("6,000,000.00");
    fireEvent.change(screen.getByLabelText("Total price"), { target: { value: "4800000" } });
    expect(screen.getByLabelText("Pay each month").value).toBe("100,000.00");
    fireEvent.click(screen.getByRole("button", { name: "Add installment" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].item).toMatchObject({ mode: "term", total: 4800000, months: 48 });
    expect(onSave.mock.calls[0][0].item).not.toHaveProperty("monthly");
  });
});

describe("RecordPaymentModal — the month a payment counts in", () => {
  /* Months start on the 5th; Amex has a statement on the 20th. */
  const shifted = {
    ...plan, monthStart: 5, active: "2026-09",
    wallets: [{ id: "w1", name: "Cash", from: "b1", amount: 0 }],
    cards: [{ id: "c1", name: "Visa", bank: "b1" }, { id: "c2", name: "Amex", bank: "b1", statementDay: 20 }],
    months: { "2026-08": blankMonth(), "2026-09": blankMonth() },
  };
  const record = (name, via, date) => {
    const onSave = vi.fn();
    render(<RecordPaymentModal plan={shifted} monthKey="2026-09" onSave={onSave} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: date } });
    fireEvent.change(screen.getByLabelText("Paid with"), { target: { value: via } });
    fireEvent.change(screen.getByRole("combobox", { name: "What for" }), { target: { value: name } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "200" } });
    return onSave;
  };

  it("cash spent before the month starts counts in the month before", async () => {
    const onSave = record("Bread", "cash|w1", "2026-09-03");
    expect(screen.getByText("Your months start on the 5th, so it counts in Aug 2026.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ type: "once", monthKey: "2026-08", item: { kind: "cash", date: "2026-09-03" } });
  });

  it("a card charge counts in the month of its statement", async () => {
    const onSave = record("Shoes", "card|c2", "2026-08-25");
    expect(screen.getByText("On the Sep statement, so it counts in Sep 2026.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ type: "once", monthKey: "2026-09" });
  });

  it("finds the bill of the month the date counts in", async () => {
    const onSave = vi.fn();
    render(<RecordPaymentModal plan={shifted} monthKey="2026-09" onSave={onSave} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-03" } });
    const box = screen.getByRole("combobox", { name: "What for" });
    fireEvent.change(box, { target: { value: "rent" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ type: "pay", monthKey: "2026-08", line: { key: "t:t1" } });
  });
});

describe("budgets paid from several accounts", () => {
  const multi = {
    ...plan, wallets: [{ id: "w1", name: "Daily cash", from: "b1", amount: 0 }],
    templates: [{ id: "e", name: "Electricity", amount: 12000, via: { kind: "cash", id: "w1" }, flow: "out", budget: true, also: [{ kind: "card", id: "c1" }] }],
  };

  it("a new budget saves the other accounts it's paid with", async () => {
    const onSave = vi.fn();
    render(<NewExpenseModal plan={multi} monthKey="2026-08" budgetOnly onSave={onSave} onClose={() => {}} />);
    expect(screen.queryByRole("radio", { name: /Installment/ })).toBeNull(); // only a budget here
    fireEvent.change(screen.getByLabelText("What for"), { target: { value: "Fuel" } });
    fireEvent.change(screen.getByLabelText("Budget each month"), { target: { value: "15000" } });
    fireEvent.change(screen.getByLabelText("Mainly paid with"), { target: { value: "cash|w1" } });
    fireEvent.click(screen.getByRole("button", { name: /Visa/ }));
    expect(screen.getByRole("button", { name: /Visa/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: /Daily cash/ })).toBeNull(); // its own account isn't offered again
    fireEvent.click(screen.getByRole("button", { name: "Add budget" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].item).toMatchObject({ name: "Fuel", budget: true, via: { kind: "cash", id: "w1" }, also: [{ kind: "card", id: "c1" }] });
  });

  it("recording a payment offers the budget's accounts first", () => {
    render(<RecordPaymentModal plan={multi} monthKey="2026-08" onSave={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-08-05" } });
    const box = screen.getByRole("combobox", { name: "What for" });
    fireEvent.change(box, { target: { value: "elec" } });
    fireEvent.keyDown(box, { key: "Enter" });
    const first = screen.getByLabelText("Paid with").querySelector("optgroup");
    expect(first.label).toBe("For Electricity");
    expect([...first.querySelectorAll("option")].map((o) => o.value)).toEqual(["cash|w1", "card|c1"]);
  });
});

describe("a budget's card payment", () => {
  /* Visa has its statement on the 20th; Fuel is a budget set aside on it */
  const carded = {
    ...plan, cards: [{ id: "c1", name: "Visa", bank: "b1", statementDay: 20 }],
    templates: [{ id: "f", name: "Fuel", amount: 15000, via: { kind: "card", id: "c1" }, flow: "out", budget: true }],
    months: { "2026-08": blankMonth(), "2026-09": blankMonth() },
  };

  it("can be on any day of the budget's month, and says which statement it goes on", async () => {
    const onSave = vi.fn();
    const line = { key: "t:f", label: "Fuel", kind: "card", id: "c1", budget: true, plan: 15000, paid: 0, remaining: 15000, flow: "out", origin: "recurring" };
    render(<RecordPaymentModal plan={carded} monthKey="2026-08" fixedLine={line} onSave={onSave} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Amount paid/), { target: { value: "4000" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-08-25" } }); // after the Aug statement, still Aug
    expect(screen.getByText("Goes on the card's Sep statement.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add payment" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ type: "pay", monthKey: "2026-08", payment: { amount: 4000, date: "2026-08-25" } });
  });
});
