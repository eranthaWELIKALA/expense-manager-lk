import React from "react";
import { AccountLogo, Button, EmptyState } from "../../components/ui";
import { viaLabel } from "../../domain";
import { accountLogo, viaLogo } from "../../lib/banks";
import { describe } from "./itemModals";
import { COLLECTIONS } from "./useItemEditor";

const SELF = { banks: "bank", cards: "card", wallets: "cash" };

/** The icon for an item: the account itself, or the account that pays / receives it. */
function itemLogo(plan, coll, item) {
  if (SELF[coll]) return { ...accountLogo(plan, SELF[coll], item), name: item.name };
  if (coll === "incomes") {
    const bank = plan.banks.find((b) => b.id === item.splits?.[0]?.bank);
    return { ...accountLogo(plan, "bank", bank), name: bank?.name || item.name };
  }
  const list = item.via?.kind === "card" ? plan.cards : item.via?.kind === "cash" ? plan.wallets : plan.banks;
  return { ...viaLogo(plan, item.via), name: (list.find((x) => x.id === item.via?.id) || item).name };
}

/** Monthly items grouped by the account they go through; moves get their own group. */
function groupTemplates(plan, items) {
  const order = [
    ...plan.banks.map((b) => ({ key: "bank|" + b.id, label: "Paid from " + b.name })),
    ...plan.wallets.map((w) => ({ key: "cash|" + w.id, label: "Cash · " + w.name })),
    ...plan.cards.map((c) => ({ key: "card|" + c.id, label: "On " + c.name })),
  ];
  const keyOf = (t) => (t.flow === "move" ? "move" : t.via ? t.via.kind + "|" + t.via.id : "");
  const groups = order.map((g) => ({ ...g, items: items.filter((t) => keyOf(t) === g.key) }));
  groups.push({ key: "move", label: "Moves between your banks", items: items.filter((t) => keyOf(t) === "move") });
  const known = new Set(groups.map((g) => g.key));
  groups.push({ key: "other", label: "Payment method missing", items: items.filter((t) => !known.has(keyOf(t))) });
  return groups.filter((g) => g.items.length);
}

/**
 * One collection as a titled section, with Add and an Edit button per row
 * (delete lives in the edit dialog). `editor` is the object returned by useItemEditor().
 */
export function ItemList({ plan, coll, title, description, editor, items = plan[coll], empty }) {
  const { noun } = COLLECTIONS[coll];
  const groups = coll === "templates" ? groupTemplates(plan, items) : [{ key: "all", label: "", items }];
  return (
    <section className="slist" aria-labelledby={"sl-" + coll}>
      <div className="slist-h">
        <div>
          <h2 id={"sl-" + coll}>{title} <span className="slist-n" aria-hidden>{items.length}</span></h2>
          {description && <p>{description}</p>}
        </div>
        {editor.canEdit && <Button size="sm" onClick={() => editor.openAdd(coll)}>+ Add {noun}</Button>}
      </div>
      {items.length === 0 && <EmptyState>{empty || `No ${noun}s yet.`}</EmptyState>}
      {groups.map((g) => (
        <div key={g.key} role="group" aria-label={g.label || undefined}>
          {g.label && <div className="slist-g">{g.label}</div>}
          {g.items.map((item) => {
            const d = describe[coll](plan, item, viaLabel);
            return (
              <div className="srow" key={item.id}>
                <AccountLogo {...itemLogo(plan, coll, item)} />
                <div className="srow-main">
                  <b>{item.name}</b>
                  <small>{d.sub}</small>
                </div>
                {d.amount ? <span className="n srow-amt">{d.amount}</span> : <span />}
                {editor.canEdit
                  ? <Button size="sm" variant="ghost" onClick={() => editor.openEdit(coll, item)} aria-label={"Edit " + item.name}>Edit</Button>
                  : <span />}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
