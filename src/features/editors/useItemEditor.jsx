import React, { useCallback, useState } from "react";
import { ConfirmDialog } from "../../components/ui";
import { useProfile } from "../../contexts/ProfileContext";
import { useToast } from "../../contexts/ToastContext";
import { addItem, removeItem, updateItem, usageOf } from "../../domain";
import { BankModal, CardModal, IncomeModal, InstallmentModal, RecurringModal, WalletModal } from "./itemModals";

/** Everything the UI needs to know about each plan collection. */
export const COLLECTIONS = {
  banks: { noun: "bank account", Modal: BankModal },
  incomes: { noun: "salary", Modal: IncomeModal },
  wallets: { noun: "cash pot", Modal: WalletModal },
  cards: { noun: "card", Modal: CardModal },
  templates: { noun: "monthly item", Modal: RecurringModal },
  installments: { noun: "installment", Modal: InstallmentModal },
};

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/**
 * Add / edit / delete any plan item through modals, with toasts.
 * Returns {openAdd(coll), openEdit(coll, item), askDelete(coll, item), dialogs}.
 * Render `dialogs` once in the page.
 */
export function useItemEditor({ startMonth } = {}) {
  const { data: plan, update, canEdit } = useProfile();
  const toast = useToast();
  const [editing, setEditing] = useState(null); // {coll, item|null}
  const [deleting, setDeleting] = useState(null); // {coll, item}

  const openAdd = useCallback((coll) => canEdit && setEditing({ coll, item: null }), [canEdit]);
  const openEdit = useCallback((coll, item) => canEdit && setEditing({ coll, item }), [canEdit]);
  const askDelete = useCallback((coll, item) => canEdit && setDeleting({ coll, item }), [canEdit]);

  const save = (coll, existing) => (item) => {
    update((d) => (existing ? updateItem(d, coll, item.id, item) : addItem(d, coll, item)));
    toast.success(`${cap(COLLECTIONS[coll].noun)} “${item.name}” ${existing ? "updated" : "added"}.`);
    setEditing(null);
  };

  const confirmDelete = () => {
    const { coll, item } = deleting;
    update((d) => removeItem(d, coll, item.id));
    toast.info(`${cap(COLLECTIONS[coll].noun)} “${item.name}” deleted.`);
    setDeleting(null);
    setEditing(null);
  };

  let dialogs = null;
  if (editing) {
    const { Modal } = COLLECTIONS[editing.coll];
    dialogs = (
      <Modal
        plan={plan}
        item={editing.item}
        startMonth={startMonth}
        onSave={save(editing.coll, !!editing.item)}
        onClose={() => setEditing(null)}
        onDelete={editing.item ? () => setDeleting({ coll: editing.coll, item: editing.item }) : undefined}
      />
    );
  }
  if (deleting) {
    const uses = usageOf(plan, deleting.coll, deleting.item.id);
    dialogs = (
      <>
        {dialogs}
        <ConfirmDialog
          danger
          title={`Delete “${deleting.item.name}”?`}
          message={uses
            ? `${uses} other item${uses === 1 ? " uses" : "s use"} this ${COLLECTIONS[deleting.coll].noun}. They'll stop appearing in months until you point them somewhere else.`
            : "This can't be undone."}
          confirmLabel="Delete"
          onClose={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      </>
    );
  }

  return { openAdd, openEdit, askDelete, dialogs, canEdit };
}
