import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { isMonthKey, currentMonth } from "../domain";
import { useProfile } from "../contexts/ProfileContext";

/**
 * The month being viewed, kept in the URL (?m=YYYY-MM) so it's per-person
 * and linkable — partners on the same profile don't move each other around.
 * Without ?m it opens on the month today counts in (if the plan has it) — with months starting
 * on the 5th, that's still last month on the 3rd.
 */
export function useViewMonth() {
  const { data } = useProfile();
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("m");
  const today = currentMonth(data);
  // Default: today's month when the plan covers it, else the latest opened month.
  const fallback = data?.months?.[today] ? today : data?.active || today;
  const month = isMonthKey(fromUrl) ? fromUrl : fallback;

  const setMonth = useCallback((k) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set("m", k); return n; }, { replace: true });
  }, [setParams]);

  return [month, setMonth];
}
