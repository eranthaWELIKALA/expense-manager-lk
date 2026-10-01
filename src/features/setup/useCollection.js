import { useMemo } from "react";
import { useProfile } from "../../contexts/ProfileContext";
import { addItem, removeItem, updateItem } from "../../domain";

/** CRUD helpers for one plan collection ("banks", "cards", …). */
export function useCollection(coll) {
  const { update } = useProfile();
  return useMemo(() => ({
    add: (item) => update((d) => addItem(d, coll, item)),
    patch: (id, p) => update((d) => updateItem(d, coll, id, p)),
    remove: (id) => update((d) => removeItem(d, coll, id)),
  }), [update, coll]);
}
