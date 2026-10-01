// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

/* Smoke test through the real UI on the demo backend:
   sign up → create profile → edit → invite → partner accepts. */

afterEach(() => cleanup());

async function signUp(user, { name, email }) {
  await user.click(await screen.findByRole("link", { name: /create an account/i }));
  await user.type(await screen.findByLabelText("Your name"), name);
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), "secret123");
  await user.type(screen.getByLabelText("Confirm password"), "secret123");
  await user.click(screen.getByRole("button", { name: /create account/i }));
}

describe("App", () => {
  it("runs the full account → profile → sharing flow", { timeout: 30000 }, async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/");
    render(<App />);

    // unauthenticated → sign-in
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();

    // sign-up validation
    await user.click(screen.getByRole("link", { name: /create an account/i }));
    await user.click(await screen.findByRole("button", { name: /create account/i }));
    expect(screen.getByText("Your name is required.")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: /^sign in$/i }));

    await signUp(user, { name: "Olivia Owner", email: "owner@x.com" });

    // onboarding → create first profile from the sample template
    expect(await screen.findByRole("heading", { name: /welcome, olivia/i })).toBeTruthy();
    await user.type(screen.getByLabelText("Profile name"), "Household");
    await user.click(screen.getByLabelText(/example household/i));
    await user.click(screen.getByRole("button", { name: /create and open/i }));

    // month view renders the plan
    expect(await screen.findByText("Where the money goes")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Household" })).toBeTruthy();
    expect(screen.getAllByText("Main current").length).toBeGreaterThan(0);

    // edit an actual amount → autosaves
    const rent = screen.getByLabelText("Rent actual");
    await user.click(rent);
    await new Promise((r) => requestAnimationFrame(r)); // AmountInput selects its text on the next frame
    await user.type(rent, "85000", { skipClick: true });
    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy(), { timeout: 3000 });

    // add expense: validation, then a one-time cash spend
    await user.click(screen.getByRole("button", { name: "+ Add expense" }));
    let dlg = await screen.findByRole("dialog", { name: "Add expense" });
    await user.click(within(dlg).getByRole("button", { name: "Add expense" }));
    expect(within(dlg).getByText("Name is required.")).toBeTruthy();
    await user.type(within(dlg).getByLabelText("What for"), "Doctor");
    await user.selectOptions(within(dlg).getByLabelText("Pay with"), within(dlg).getByRole("option", { name: "Daily cash" }));
    await user.type(within(dlg).getByLabelText("Amount"), "3500");
    await user.click(within(dlg).getByRole("button", { name: "Add expense" }));
    expect(await screen.findByText(/“Doctor” added on/)).toBeTruthy();
    expect(screen.getByLabelText("Doctor planned").value).toBe("3,500");

    // removing a row asks first; cancel keeps it, confirm deletes it
    const doctorRow = screen.getByLabelText("Doctor planned").closest(".row");
    await user.click(within(doctorRow).getByRole("button", { name: "Remove from this month" }));
    let ask = await screen.findByRole("dialog", { name: /Remove “Doctor”/ });
    expect(within(ask).getByText(/one-time payment will be deleted/)).toBeTruthy();
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Doctor planned")).toBeTruthy();
    await user.click(within(screen.getByLabelText("Doctor planned").closest(".row")).getByRole("button", { name: "Remove from this month" }));
    ask = await screen.findByRole("dialog", { name: /Remove “Doctor”/ });
    await user.click(within(ask).getByRole("button", { name: "Delete payment" }));
    expect(await screen.findByText(/“Doctor” removed from/)).toBeTruthy();
    expect(screen.queryByLabelText("Doctor planned")).toBeNull();

    // future-dated one-time payment lands in next month with its date
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    const iso = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-15`;
    await user.click(screen.getByRole("button", { name: "+ Add expense" }));
    dlg = await screen.findByRole("dialog", { name: "Add expense" });
    await user.type(within(dlg).getByLabelText("What for"), "Dentist");
    await user.type(within(dlg).getByLabelText("Amount"), "8000");
    const dateInput = within(dlg).getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, iso);
    expect(within(dlg).getByText(/Scheduled payment · goes into/)).toBeTruthy();
    await user.click(within(dlg).getByRole("button", { name: "Add expense" }));
    expect(await screen.findByText(/“Dentist” added on 15 .* it's in/)).toBeTruthy();
    expect(screen.queryByLabelText("Dentist planned")).toBeNull(); // not in this month
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByLabelText("Dentist planned")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Previous month" }));

    // add expense: installment on a card
    await user.click(screen.getByRole("button", { name: "+ Add expense" }));
    dlg = await screen.findByRole("dialog", { name: "Add expense" });
    await user.click(within(dlg).getByRole("radio", { name: /installment/i }));
    await user.type(within(dlg).getByLabelText("What for"), "Phone");
    await user.type(within(dlg).getByLabelText("Total price"), "120000");
    await user.clear(within(dlg).getByLabelText("Months"));
    await user.type(within(dlg).getByLabelText("Months"), "6");
    expect(within(dlg).getByText(/20,000 a month for 6 months/)).toBeTruthy();
    await user.click(within(dlg).getByRole("button", { name: "Add expense" }));
    expect(await screen.findByText(/Installment “Phone” added/)).toBeTruthy();
    expect(screen.getByText("Phone")).toBeTruthy();

    // commitments: edit an installment in a modal
    await user.click(screen.getByRole("link", { name: "Commitments" }));
    expect(await screen.findByRole("button", { name: "+ Add installment" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Edit Phone" }));
    dlg = await screen.findByRole("dialog", { name: "Edit installment" });
    const nm = within(dlg).getByLabelText("Name");
    await user.clear(nm);
    await user.type(nm, "Phone + case");
    await user.click(within(dlg).getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/“Phone \+ case” updated/)).toBeTruthy();

    // setup: add a bank via modal, then delete it with confirmation
    await user.click(screen.getByRole("link", { name: "Setup" }));
    expect(await screen.findByRole("heading", { name: "Bank accounts" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "+ Add bank account" }));
    dlg = await screen.findByRole("dialog", { name: "Add bank account" });
    await user.type(within(dlg).getByLabelText("Name"), "Test Bank");
    await user.click(within(dlg).getByRole("button", { name: "Add bank" }));
    expect(await screen.findByText(/Bank account “Test Bank” added/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Delete Test Bank" }));
    await user.click(within(await screen.findByRole("dialog", { name: /Delete “Test Bank”/ })).getByRole("button", { name: "Delete bank account" }));
    expect(await screen.findByText(/“Test Bank” deleted/)).toBeTruthy();
    expect(screen.queryByText("Test Bank")).toBeNull();

    // second profile under the same account
    await user.click(screen.getByRole("button", { name: /profile household/i }));
    await user.click(screen.getByRole("menuitem", { name: /new profile/i }));
    dlg = await screen.findByRole("dialog");
    await user.type(within(dlg).getByLabelText("Profile name"), "Business");
    await user.click(within(dlg).getByRole("button", { name: /create profile/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Business" })).toBeTruthy();

    // invite a partner to Household
    await user.click(screen.getByRole("button", { name: /profile business/i }));
    await user.click(screen.getByRole("menuitem", { name: /manage profiles/i }));
    const householdRow = (await screen.findByText("Household")).closest(".list-row");
    await user.click(within(householdRow).getByRole("link", { name: "Manage" }));
    await user.type(await screen.findByLabelText("Partner's email"), "partner@x.com");
    await user.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByText("partner@x.com")).toBeTruthy();
    expect(screen.getByText("Pending invitations")).toBeTruthy();

    // partner signs up and accepts from onboarding
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await signUp(user, { name: "Pat Partner", email: "partner@x.com" });
    expect(await screen.findByText("You've been invited")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Household" })).toBeTruthy();
    expect(screen.getByText("Editor")).toBeTruthy();
    expect(screen.getByLabelText("Rent actual").value).toBe("85,000");
  });
});
