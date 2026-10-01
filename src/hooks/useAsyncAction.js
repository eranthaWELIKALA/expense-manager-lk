import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../services/errors";

/**
 * Wrap an async handler with pending/error state for forms and buttons.
 * `run` never throws: it resolves to {ok: true, value} or {ok: false} and sets `error`.
 */
export function useAsyncAction(fn) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => () => { mounted.current = false; }, []);

  const run = useCallback(async (...args) => {
    setPending(true);
    setError("");
    try {
      return { ok: true, value: await fnRef.current(...args) };
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
      return { ok: false };
    } finally {
      if (mounted.current) setPending(false);
    }
  }, []);

  return { run, pending, error, setError };
}
