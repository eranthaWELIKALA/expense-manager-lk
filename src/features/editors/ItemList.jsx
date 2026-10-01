import React from "react";
import { Button, ConfigCard, EmptyState } from "../../components/ui";
import { viaLabel } from "../../domain";
import { describe } from "./itemModals";
import { COLLECTIONS } from "./useItemEditor";

/**
 * A titled card listing one collection, with Add / Edit / Delete.
 * `editor` is the object returned by useItemEditor().
 */
export function ItemList({ plan, coll, title, description, editor, items = plan[coll], empty }) {
  const { noun } = COLLECTIONS[coll];
  return (
    <ConfigCard
      title={title}
      description={description}
      action={editor.canEdit && <Button size="sm" onClick={() => editor.openAdd(coll)}>+ Add {noun}</Button>}
    >
      <div className="items">
        {items.length === 0 && <EmptyState>{empty || `No ${noun}s yet.`}</EmptyState>}
        {items.map((item) => {
          const d = describe[coll](plan, item, viaLabel);
          return (
            <div className="list-row" key={item.id}>
              <div className="list-main">
                <b>{item.name}</b>
                <small>{d.sub}</small>
              </div>
              {d.amount && <span className="n item-amt">{d.amount}</span>}
              {editor.canEdit && (
                <>
                  <Button size="sm" onClick={() => editor.openEdit(coll, item)} aria-label={"Edit " + item.name}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => editor.askDelete(coll, item)} aria-label={"Delete " + item.name}>Delete</Button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </ConfigCard>
  );
}
