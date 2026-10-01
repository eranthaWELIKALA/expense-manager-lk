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

    // other tabs render
    await user.click(screen.getByRole("link", { name: "Commitments" }));
    expect(await screen.findByText("Laptop")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Setup" }));
    expect(await screen.findByRole("heading", { name: "Bank accounts" })).toBeTruthy();

    // second profile under the same account
    await user.click(screen.getByRole("button", { name: /profile household/i }));
    await user.click(screen.getByRole("menuitem", { name: /new profile/i }));
    const dlg = await screen.findByRole("dialog");
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
