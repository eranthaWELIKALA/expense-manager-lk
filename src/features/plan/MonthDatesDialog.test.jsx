// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { addOneOff, blankMonth, setMonthDates } from "../../domain";
import { MonthDatesDialog } from "./MonthDatesDialog";

afterEach(cleanup);

/* months usually start on the 25th: Dec is 25 Nov – 24 Dec */
const plan = {
  v: 5, active: "2026-12", start: "2026-11", monthStart: 25,
  banks: [{ id: "b1", name: "Main", opening: 0 }], incomes: [], wallets: [{ id: "w1", name: "Cash", from: "b1", amount: 0 }], cards: [],
  templates: [], installments: [], months: { "2026-11": blankMonth(), "2026-12": blankMonth() },
};

describe("MonthDatesDialog", () => {
  it("previews the months around it and saves the new dates", async () => {
    const d = addOneOff(plan, "2026-12", { kind: "cash", targetId: "w1", name: "Bread", amount: 100, date: "2026-11-26", paid: true });
    const onSave = vi.fn();
    render(<MonthDatesDialog plan={d} monthKey="2026-12" onSave={onSave} onClose={() => {}} />);
    expect(screen.getByLabelText("Starts on").value).toBe("2026-11-25");
    fireEvent.change(screen.getByLabelText("Starts on"), { target: { value: "2026-11-28" } });
    expect(screen.getByText("Nov 2026").parentElement.textContent).toBe("Nov 202625 Oct – 27 Nov (34 days)");
    expect(screen.getByText("Dec 2026").parentElement.textContent).toBe("Dec 202628 Nov – 24 Dec (27 days)");
    expect(screen.getByText(/1 dated payment will move/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save dates" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith({ from: "2026-11-28", to: null }));
  });

  it("keeps a start within its limits", async () => {
    const onSave = vi.fn();
    render(<MonthDatesDialog plan={plan} monthKey="2026-12" onSave={onSave} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Starts on"), { target: { value: "2026-11-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save dates" }));
    expect(await screen.findByText("Pick a day between 17 Nov and 16 Dec.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("goes back to the usual days", () => {
    const onSave = vi.fn();
    render(<MonthDatesDialog plan={setMonthDates(plan, "2026-12", { from: "2026-11-28" })} monthKey="2026-12" onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Use the usual days \(25 Nov – 24 Dec\)/ }));
    expect(onSave).toHaveBeenCalledWith({ from: null, to: null });
  });
});
