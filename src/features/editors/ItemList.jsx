import React from "react";
import { AccountLogos, Button, EmptyState } from "../../components/ui";
import { viaLabel } from "../../domain";
import { accountLogo, viaLogo } from "../../lib/banks";
import { describe } from "./itemModals";
import { COLLECTIONS } from "./useItemEditor";

const SELF = { banks: "bank", cards: "card", wallets: "cash" };

const viaName = (plan, via) => {
  const list = via?.kind === "card" ? plan.cards : via?.kind === "cash" ? plan.wallets : plan.banks;
  return (list.find((x) => x.id === via?.id) || {}).name;
};
const LINE_PREFIX = { templates: "t:", installments: "i:" };

/** Other methods an item has really been paid with (parts, or paid another way in a month). */
function paidWith(plan, coll, item) {
  const key = LINE_PREFIX[coll] && LINE_PREFIX[coll] + item.id;
  if (!key) return [];
  const out = [];
  Object.values(plan.months || {}).forEach((M) => {
    const ov = (M && M.ov && M.ov[key]) || {};
    if (ov.via) out.push(ov.via);
    (Array.isArray(ov.payments) ? ov.payments : []).forEach((p) => p && p.via && out.push(p.via));
  });
  return out;
}

/**
 * The icons for an item: the account itself, or every account it goes through —
 * each bank a salary is split across, a move's two banks, and any other bank or card it was paid with.
 */
function itemLogos(plan, coll, item) {
  if (SELF[coll]) return [{ ...accountLogo(plan, SELF[coll], item), name: item.name }];
  let vias;
  if (coll === "incomes") vias = (item.splits || []).map((s) => ({ kind: "bank", id: s.bank }));
  else {
    vias = [item.via, ...(item.flow === "move" && item.to ? [{ kind: "bank", id: item.to }] : []), ...paidWith(plan, coll, item)];
  }
  const seen = new Set();
  const logos = vias.filter((v) => v && v.id && !seen.has(v.kind + "|" + v.id) && seen.add(v.kind + "|" + v.id))
    .map((v) => ({ ...viaLogo(plan, v), name: viaName(plan, v) || item.name }));
  return logos.length ? logos : [{ ...viaLogo(plan, null), name: item.name }];
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
  const logos = new Map(items.map((item) => [item.id, itemLogos(plan, coll, item)]));
  const stacked = [...logos.values()].some((l) => l.length > 1); // widen every row's icon column so names line up
  return (
    <section className={"slist" + (stacked ? " stacked" : "")} aria-labelledby={"sl-" + coll}>
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
                <AccountLogos logos={logos.get(item.id)} />
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
