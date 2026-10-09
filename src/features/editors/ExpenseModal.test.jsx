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
    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      type: "pay", monthKey: "2026-08", line: { key: "t:t1" },
      payment: { actual: 1950, via: { kind: "card", id: "c1" }, date: "2026-08-05" },
    });
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
