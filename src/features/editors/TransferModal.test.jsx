// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
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
