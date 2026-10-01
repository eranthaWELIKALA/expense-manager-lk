import React from "react";
import { useProfile } from "../../contexts/ProfileContext";
import { useViewMonth } from "../../hooks/useViewMonth";
import { ItemList } from "../editors/ItemList";
import { useItemEditor } from "../editors/useItemEditor";

const SECTIONS = [
  { coll: "banks", title: "Bank accounts", description: "Every rupee lives in one of these. Balances carry into the next month by themselves." },
  { coll: "incomes", title: "Salaries", description: "One salary can be split across several banks." },
  { coll: "wallets", title: "Cash", description: "Money you withdraw and spend by hand. Leftover cash carries into next month." },
  { coll: "cards", title: "Cards", description: "Charges build up all month, then the total debits the bank you choose, next month." },
  { coll: "templates", title: "Every month", description: 'Recurring bills and transfers. "Move" shifts money between your own banks instead of spending it.' },
  { coll: "installments", title: "Installments", description: "Set it once. The monthly amount is worked out for you, and it drops off when it's paid." },
];

export default function SetupPage() {
  const { data: plan } = useProfile();
  const [mk] = useViewMonth();
  const editor = useItemEditor({ startMonth: mk });
  return (
    <>
      {SECTIONS.map((s) => <ItemList key={s.coll} plan={plan} editor={editor} {...s} />)}
      {editor.dialogs}
    </>
  );
}
