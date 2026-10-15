// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { blankMonth } from "../../domain";
import { RecordPaymentModal } from "./ExpenseModal";

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
    expect(screen.getByLabelText("Amount paid").value).toBe("2000");
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
    expect(screen.getByText(/1,500 will still be left/)).toBeTruthy();
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
