import { useConfirm } from "../../contexts/ConfirmContext";
import { useProfile } from "../../contexts/ProfileContext";
import { useToast } from "../../contexts/ToastContext";
import { revertTo } from "../../domain";

/**
 * Undo a logged change (and everything made after it), after confirming.
 * Returns undo(index) — 0 is the newest entry. Resolves true when undone.
 */
export function useUndo() {
  const { data: plan, update } = useProfile();
  const confirm = useConfirm();
  const toast = useToast();

  return async (index) => {
    const log = plan.log || [];
    const entry = log[index];
    if (!entry) { toast.info("There's nothing to undo yet."); return false; }
    const later = log.slice(0, index);
    const ok = await confirm({
      danger: true,
      title: `Undo “${entry.label}”?`,
      message: later.length
        ? `The ${later.length} change${later.length === 1 ? "" : "s"} made after it will be undone too: ${later.map((e) => "“" + e.label + "”").join(", ")}. You can undo the undo afterwards.`
        : "The plan goes back to how it was before this change. You can undo the undo afterwards.",
      confirmLabel: later.length ? `Undo ${later.length + 1} changes` : "Undo",
    });
    if (!ok) return false;
    update((d) => {
      const ix = (d.log || []).findIndex((e) => e.id === entry.id);
      return ix < 0 ? d : revertTo(d, ix);
    }, { label: `Undid “${entry.label}”` + (later.length ? ` and ${later.length} later change${later.length === 1 ? "" : "s"}` : ""), undid: entry.id });
    toast.info(`Undid “${entry.label}”.`);
    return true;
  };
}
