// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { blankMonth } from "../../domain";
import { ExpenseModal } from "./ExpenseModal";

const plan = {
  v: 4, active: "2026-08", start: "2026-08",
  banks: [{ id: "b1", name: "Main", opening: 1000 }], incomes: [], wallets: [],
  cards: [{ id: "c1", name: "Visa", bank: "b1" }],
  templates: [{ id: "t1", name: "Rent", amount: 2000, via: { kind: "bank", id: "b1" }, flow: "out" }],
  installments: [], months: { "2026-08": blankMonth() },
};

describe("ExpenseModal — record payment", () => {
  it("picks an existing bill, prefills it, and saves the real amount, method and date", async () => {
    const onSave = vi.fn();
    render(<ExpenseModal plan={plan} monthKey="2026-08" onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /Record payment/ }));
    fireEvent.change(screen.getByLabelText("Paid on"), { target: { value: "2026-08-05" } });
    fireEvent.change(screen.getByLabelText("Which payment"), { target: { value: "t:t1" } });
    expect(screen.getByLabelText("Amount paid").value).toBe("2000");
    fireEvent.change(screen.getByLabelText("Amount paid"), { target: { value: "1950" } });
    fireEvent.change(screen.getByLabelText("Paid with"), { target: { value: "card|c1" } });
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      type: "pay", monthKey: "2026-08", line: { key: "t:t1" },
      payment: { actual: 1950, via: { kind: "card", id: "c1" }, date: "2026-08-05" },
    });
  });
});
