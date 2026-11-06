// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { blankMonth } from "../../domain";
import { TransferModal } from "./TransferModal";

afterEach(cleanup);

/* Aug: 400 charged on the card, so Sep's bill is 400. */
const plan = {
  v: 4, active: "2026-09", start: "2026-08",
  banks: [{ id: "b1", name: "Main", opening: 1000 }, { id: "b2", name: "Save", opening: 2000 }],
  incomes: [], wallets: [], installments: [],
  cards: [{ id: "c1", name: "Card", bank: "b1" }],
  templates: [{ id: "t2", name: "Food", amount: 400, via: { kind: "card", id: "c1" }, flow: "out" }],
  months: { "2026-08": blankMonth(), "2026-09": blankMonth() },
};

describe("TransferModal — paying a card", () => {
  it("fills in what's outstanding, from the card's usual bank, until you type your own", () => {
    render(<TransferModal plan={plan} monthKey="2026-09" initialKind="card" initialTo="card|c1" onSave={() => {}} onClose={() => {}} />);
    const amount = screen.getByLabelText("Amount");
    expect(amount.value).toBe("400.00");
    expect(screen.getByLabelText("Paid from bank").value).toBe("bank|b1");
    fireEvent.change(amount, { target: { value: "150" } });
    expect(amount.value).toBe("150");
    fireEvent.click(screen.getByRole("button", { name: "use it" }));
    expect(amount.value).toBe("400.00");
  });
});

describe("TransferModal — money back", () => {
  /* Aug also has a 50,000 hospital bill, paid from Main. */
  const withBill = {
    ...plan,
    months: { ...plan.months, "2026-08": { ...blankMonth(), extra: [{ id: "x1", name: "Hospital", amount: 50000, kind: "bank", id2: "b1", flow: "out", date: "2026-08-10" }], ov: { "x:x1": { done: true } } } },
  };
  const choose = (text) => {
    const box = screen.getByRole("combobox", { name: "Money back for" });
    fireEvent.change(box, { target: { value: text } });
    fireEvent.keyDown(box, { key: "Enter" });
  };

  it("is for a payment, goes back where it was paid from, and says what the payment then cost", async () => {
    const onSave = vi.fn();
    render(<TransferModal plan={withBill} monthKey="2026-09" initialKind="back" onSave={onSave} onClose={() => {}} />);
    choose("hosp");
    expect(screen.getByLabelText("Back into").value).toBe("bank|b1");
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "40000" } });
    expect(screen.getByText("“Hospital” (Aug 2026) then costs you 10,000.00 instead of 50,000.00.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Insurance" } });
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      kind: "back", monthKey: "2026-09", from: null, to: { kind: "bank", id: "b1" }, amount: 40000, note: "Insurance",
      forMonth: "2026-08", line: { key: "x:x1", label: "Hospital" },
    });
  });

  it("a card purchase is refunded onto the card", () => {
    render(<TransferModal plan={withBill} monthKey="2026-09" initialKind="back" onSave={() => {}} onClose={() => {}} />);
    choose("food");
    expect(screen.getByLabelText("Back into").value).toBe("card|c1");
    expect(screen.getByText("A refund onto the card lowers its statement.")).toBeTruthy();
  });

  it("needs the payment it's for", async () => {
    const onSave = vi.fn();
    render(<TransferModal plan={withBill} monthKey="2026-09" initialKind="back" onSave={onSave} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(await screen.findByText("Choose the payment it's money back for.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});
