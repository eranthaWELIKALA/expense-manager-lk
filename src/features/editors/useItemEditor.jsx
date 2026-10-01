import React, { useCallback, useState } from "react";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useProfile } from "../../contexts/ProfileContext";
import { useToast } from "../../contexts/ToastContext";
import { addItem, currentMonthKey, lines, mLabel, removeItem, updateItem, usageOf } from "../../domain";
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

/* Ledger line keys each collection produces (see domain/ledger.js). */
const LINE_PREFIX = { incomes: "s:", wallets: "w:", cards: "b:", templates: "t:", installments: "i:" };
const COSMETIC = new Set(["name", "note"]);

/**
 * Past months (before this calendar month) whose numbers an edit would change.
 * Only real changes count — renaming or editing a note is harmless.
 */
export function pastMonthsAffected(plan, coll, before, after) {
  const changed = Object.keys({ ...before, ...after })
    .filter((k) => !COSMETIC.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (changed.length === 0) return [];
  const past = Object.keys(plan.months).filter((k) => k < currentMonthKey()).sort();
  if (coll === "banks") return changed.includes("opening") ? past : [];
  const p = LINE_PREFIX[coll] + before.id;
  return past.filter((mk) => lines(plan, mk).some((l) => l.key === p || l.key.startsWith(p + ":")));
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const range = (ms) => (ms.length === 1 ? mLabel(ms[0]) : `${mLabel(ms[0])} – ${mLabel(ms[ms.length - 1])}`);

/**
 * Add / edit / delete any plan item through modals, with toasts and
 * confirmation for anything destructive or that rewrites past months.
 * Returns {openAdd(coll), openEdit(coll, item), askDelete(coll, item), dialogs, canEdit}.
 * Render `dialogs` once in the page.
 */
export function useItemEditor({ startMonth } = {}) {
  const { data: plan, update, canEdit } = useProfile();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null); // {coll, item|null}

  const openAdd = useCallback((coll) => canEdit && setEditing({ coll, item: null }), [canEdit]);
  const openEdit = useCallback((coll, item) => canEdit && setEditing({ coll, item }), [canEdit]);

  const askDelete = useCallback(async (coll, item) => {
    if (!canEdit) return false;
    const { noun } = COLLECTIONS[coll];
    const uses = usageOf(plan, coll, item.id);
    const ok = await confirm({
      danger: true,
      title: `Delete “${item.name}”?`,
      message: (uses
        ? `${uses} other item${uses === 1 ? " uses" : "s use"} this ${noun}. They'll stop appearing in months until you point them somewhere else. `
        : "") + "It's removed from every month, including past ones. This can't be undone.",
      confirmLabel: `Delete ${noun}`,
    });
    if (!ok) return false;
    update((d) => removeItem(d, coll, item.id));
    toast.info(`${cap(noun)} “${item.name}” deleted.`);
    return true;
  }, [canEdit, plan, confirm, update, toast]);

  const save = (coll, existing) => async (item) => {
    const { noun } = COLLECTIONS[coll];
    if (existing) {
      const affected = pastMonthsAffected(plan, coll, existing, item);
      if (affected.length) {
        const ok = await confirm({
          danger: true,
          title: "This changes past months",
          message: `Saving updates ${affected.length} past month${affected.length === 1 ? "" : "s"} (${range(affected)}), so their balances will be recalculated. `
            + (coll === "templates" || coll === "installments"
              ? "To change it only from now on, cancel and add a new item with a start date instead."
              : "Past figures you've already checked may no longer match."),
          confirmLabel: "Update past months too",
        });
        if (!ok) return; // keep the modal open
      }
    }
    update((d) => (existing ? updateItem(d, coll, item.id, item) : addItem(d, coll, item)));
    toast.success(`${cap(noun)} “${item.name}” ${existing ? "updated" : "added"}.`);
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
        onSave={save(editing.coll, editing.item)}
        onClose={() => setEditing(null)}
        onDelete={editing.item ? async () => { if (await askDelete(editing.coll, editing.item)) setEditing(null); } : undefined}
      />
    );
  }

  return { openAdd, openEdit, askDelete, dialogs, canEdit };
}
