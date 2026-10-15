import { N, todayISO } from "../../domain";
import { accountLogo } from "../../lib/banks";

/**
 * Lines still waiting for a tick. Part payments are already paid, and the receiving side
 * of a withdrawal ("wi:") or a move between banks ("tm:") is ticked at its source.
 * (Installments and card bills are locked — their amount is set elsewhere — but still need ticking.)
 * What-ifs aren't real yet, so they don't wait for a tick either.
 */
export const isOpen = (l) => !l.done && !l.maybe && l.origin !== "part" && !/^(wi|tm):/.test(l.key);

/**
 * Every bank, cash pot and card in a computed month, as one list for the month view.
 * key is "bank:<id>" | "cash:<id>" | "card:<id>".
 */
export function monthAccounts(plan, month) {
  const bankName = (id) => (plan.banks.find((b) => b.id === id) || {}).name;
  const ledger = (kind) => (L) => {
    const sum = (flow) => L.rows.filter((r) => r.flow === flow).reduce((s, r) => s + r.amt, 0);
    return {
      key: kind + ":" + L.o.id, kind, o: L.o, name: L.o.name, rows: L.rows,
      logo: accountLogo(plan, kind, L.o),
      note: kind === "cash" ? "Withdrawn from " + (bankName(L.o.from) || "—") : L.o.note || "",
      opening: L.opening, closing: L.closing, actual: L.actual, inSum: sum("in"), outSum: sum("out"),
      balance: L.closing, short: L.closing < -0.005, open: L.rows.filter(isOpen).length,
    };
  };
  return {
    banks: month.banks.map(ledger("bank")),
    wallets: month.wallets.map(ledger("cash")),
    cards: month.cards.map((C) => ({
      key: "card:" + C.o.id, kind: "card", o: C.o, name: C.o.name, rows: C.rows,
      logo: accountLogo(plan, "card", C.o),
      note: C.o.note || "", bankName: bankName(C.o.bank),
      plan: C.plan, charged: C.charged, paid: C.paid, due: C.due, bill: C.bill,
      balance: C.balance, limit: N(C.o.limit) > 0 ? N(C.o.limit) : null, available: C.available, overLimit: C.available !== null && C.available < -0.005,
      late: !!(C.bill && C.bill.left > 0.005 && C.bill.date && C.bill.date < todayISO()), over: C.actual > C.plan + 0.005 && C.actual > 0,
      short: false, open: C.rows.filter(isOpen).length,
    })),
  };
}
