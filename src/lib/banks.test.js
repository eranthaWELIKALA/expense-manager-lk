import { describe, expect, it } from "vitest";
import { BANKS, NETWORKS, NO_LOGO, bankLogoId, cardLogoIds, guessBank, guessNetwork } from "./banks";

describe("bank logos", () => {
  it("guesses the bank from an account or card name", () => {
    expect(guessBank("Sampath Bank")).toBe("sampath");
    expect(guessBank("Sampath Mastercard")).toBe("sampath");
    expect(guessBank("ComBank savings")).toBe("combank");
    expect(guessBank("BOC Joint")).toBe("boc");
    expect(guessBank("Indian Overseas Bank")).toBe("iob");
    expect(guessBank("Indian Bank")).toBe("indian-bank");
    expect(guessBank("Union Bank")).toBe("union");
    expect(guessBank("UnionPay card")).toBe(""); // a network, not Union Bank
    expect(guessBank("Bocage")).toBe(""); // whole words only
    expect(guessBank("Main current")).toBe("");
  });

  it("guesses the card network", () => {
    expect(guessNetwork("HNB Visa Platinum")).toBe("visa");
    expect(guessNetwork("Sampath Mastercard")).toBe("mastercard");
    expect(guessNetwork("Amex Gold")).toBe("amex");
    expect(guessNetwork("Everyday card")).toBe("");
  });

  it("prefers an explicit choice, and 'none' turns the logo off", () => {
    expect(bankLogoId({ name: "Salary account", logo: "hnb" })).toBe("hnb");
    expect(bankLogoId({ name: "Sampath Bank", logo: NO_LOGO })).toBe("");
    expect(bankLogoId({ name: "Sampath Bank", logo: "not-a-bank" })).toBe("sampath");
  });

  it("falls back to the billed bank for a card's issuer", () => {
    const plan = { banks: [{ id: "b1", name: "Commercial Bank" }] };
    expect(cardLogoIds(plan, { name: "Everyday card", bank: "b1" })).toEqual({ issuer: "combank", network: "" });
    expect(cardLogoIds(plan, { name: "Amex Gold", bank: "b1", issuer: "ntb" })).toEqual({ issuer: "ntb", network: "amex" });
    expect(cardLogoIds(plan, { name: "Visa", bank: "b1", issuer: NO_LOGO, network: NO_LOGO })).toEqual({ issuer: "", network: "" });
  });

  it("has unique ids and points at existing files", async () => {
    const { existsSync } = await import("node:fs");
    const all = [...BANKS, ...NETWORKS];
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    all.filter((x) => x.file).forEach((x) => expect(existsSync("public/banks/" + x.file), x.file).toBe(true));
  });
});
