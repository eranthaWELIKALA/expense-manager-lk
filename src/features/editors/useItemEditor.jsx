import React, { useCallback, useState } from "react";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useProfile } from "../../contexts/ProfileContext";
import { useToast } from "../../contexts/ToastContext";
import {
  addItem, applyItemChange, canApplyToOneMonth, currentMonthKey, lines, mLabel, mShort, pinPaidHistory, removeItem, replaceItem, usageOf, versionedChanges,
} from "../../domain";
import { ScopeDialog } from "./ScopeDialog";
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
/* Payment method / auto-debit changes leave history alone (see pinPaidHistory). */
const PINNED = new Set(["via", "auto"]);
/* Edits to these ask which months they apply to (see applyItemChange). */
const SCOPED = new Set(["templates", "incomes"]);
const SCOPE_SUFFIX = { month: (mk) => " — " + mShort(mk) + " only", future: (mk) => " — from " + mShort(mk), all: () => " — all months" };

/**
 * Past months (before this calendar month) whose numbers an edit would change.
 * Only real changes count — renaming or editing a note is harmless.
 */
export function pastMonthsAffected(plan, coll, before, after, { keepsPinned = true } = {}) {
  const changed = Object.keys({ ...before, ...after })
    .filter((k) => !COSMETIC.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .filter((k) => !(keepsPinned && PINNED.has(k) && (coll === "templates" || coll === "installments")));
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
export function useItemEditor({ startMonth = currentMonthKey() } = {}) {
  const { data: plan, update, canEdit } = useProfile();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null); // {coll, item|null}
  const [scoping, setScoping] = useState(null); // {props, resolve} while asking which months an edit applies to

  const askScope = (props) => new Promise((resolve) => setScoping({ props, resolve }));
  const settleScope = (scope) => { scoping?.resolve(scope); setScoping(null); };

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
    update((d) => removeItem(d, coll, item.id), { label: `Deleted ${noun} “${item.name}”` });
    toast.info(`${cap(noun)} “${item.name}” deleted.`);
    return true;
  }, [canEdit, plan, confirm, update, toast]);

  const save = (coll, existing) => async (item) => {
    const { noun } = COLLECTIONS[coll];
    if (existing && SCOPED.has(coll) && versionedChanges(coll, existing, item).length) {
      const scope = await askScope({
        name: item.name, monthKey: startMonth,
        monthOk: canApplyToOneMonth(coll, existing, item),
        past: pastMonthsAffected(plan, coll, existing, item, { keepsPinned: false }),
      });
      if (!scope) return; // back to the edit dialog
      update((d) => applyItemChange(d, coll, existing, item, scope, startMonth), { label: `Edited ${noun} “${item.name}”` + SCOPE_SUFFIX[scope](startMonth) });
      toast.success(`${cap(noun)} “${item.name}” updated` + (scope === "month" ? ` for ${mLabel(startMonth)} only.` : scope === "future" ? ` from ${mLabel(startMonth)}.` : " in every month."));
      setEditing(null);
      return;
    }
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
    update((d) => (existing ? replaceItem(pinPaidHistory(d, coll, existing, item), coll, item) : addItem(d, coll, item)),
      { label: `${existing ? "Edited" : "Added"} ${noun} “${item.name}”` });
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
    if (scoping) dialogs = <>{dialogs}<ScopeDialog {...scoping.props} onChoose={settleScope} onClose={() => settleScope(null)} /></>;
  }

  return { openAdd, openEdit, askDelete, dialogs, canEdit };
}
