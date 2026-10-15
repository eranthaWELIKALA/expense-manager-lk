import React, { useMemo, useState } from "react";
import { cx } from "../../components/ui";
import { useProfile } from "../../contexts/ProfileContext";
import { useViewMonth } from "../../hooks/useViewMonth";
import { computeMonth, fmt, mLabel, val } from "../../domain";
import { ItemList } from "../editors/ItemList";
import { useItemEditor } from "../editors/useItemEditor";

const SECTIONS = [
  { coll: "banks", title: "Bank accounts", tone: "acc", description: "Every rupee lives in one of these. Balances carry into the next month by themselves." },
  { coll: "incomes", title: "Salaries", tone: "jade", description: "One salary can be split across several banks." },
  { coll: "wallets", title: "Cash", tone: "brass", description: "Money you withdraw and spend by hand. Leftover cash carries into next month." },
  { coll: "cards", title: "Cards", tone: "violet", description: "Charges build up all month, then the total debits the bank you choose, next month." },
  { coll: "templates", title: "Every month", tone: "ink", description: 'Recurring bills and transfers, grouped by how they\'re paid. "Move" shifts money between your own banks instead of spending it.' },
  { coll: "installments", title: "Installments", tone: "flag", description: "Set it once. The monthly amount is worked out for you, and it drops off when it's paid." },
];

/** Setup: one category at a time, picked from the list on the left. */
export default function SetupPage() {
  const { data: plan } = useProfile();
  const [mk] = useViewMonth();
  const editor = useItemEditor({ startMonth: mk });
  const [tab, setTab] = useState("banks");
  const section = SECTIONS.find((s) => s.coll === tab) || SECTIONS[0];

  const month = useMemo(() => computeMonth(plan, mk), [plan, mk]);
  const comesIn = month.ls.filter((l) => l.origin === "salary").reduce((s, l) => s + val(l), 0);
  const goesOut = month.planned;

  return (
    <>
      <div className="setup">
        <aside className="setup-side">
          <div className="setup-intro">
            <h2>Setup</h2>
            <p>What repeats every month. Changes apply from the month you pick.</p>
          </div>
          <nav className="setup-tabs" aria-label="Setup sections">
            {SECTIONS.map((s) => (
              <button key={s.coll} type="button" className={cx("setup-tab", s.coll === section.coll && "on")}
                aria-current={s.coll === section.coll ? "page" : undefined} onClick={() => setTab(s.coll)}>
                <span className={"sdot t-" + s.tone} aria-hidden />{s.title}<span className="ct">{plan[s.coll].length}</span>
              </button>
            ))}
          </nav>
          <div className="setup-sum">
            <span className="lab">Planned for {mLabel(mk)}</span>
            <div><span>Comes in</span><b className="n pos">{fmt(comesIn, 0)}</b></div>
            <div><span>Goes out</span><b className="n">{fmt(goesOut, 0)}</b></div>
            <div className="tot"><span>Left over</span><b className={cx("n", comesIn - goesOut < 0 && "neg")}>{fmt(comesIn - goesOut, 0)}</b></div>
          </div>
        </aside>
        <div className="setup-main">
          <ItemList key={section.coll} plan={plan} editor={editor} {...section} />
        </div>
      </div>
      {editor.dialogs}
    </>
  );
}
