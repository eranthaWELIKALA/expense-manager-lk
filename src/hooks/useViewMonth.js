import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { isMonthKey, currentMonthKey } from "../domain";
import { useProfile } from "../contexts/ProfileContext";

/**
 * The month being viewed, kept in the URL (?m=YYYY-MM) so it's per-person
 * and linkable — partners on the same profile don't move each other around.
 */
export function useViewMonth() {
  const { data } = useProfile();
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("m");
  const month = isMonthKey(fromUrl) ? fromUrl : data?.active || currentMonthKey();

  const setMonth = useCallback((k) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set("m", k); return n; }, { replace: true });
  }, [setParams]);

  return [month, setMonth];
}
