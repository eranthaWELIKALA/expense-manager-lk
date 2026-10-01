import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../services/errors";
import { useToast } from "../contexts/ToastContext";

/**
 * Wrap an async handler with pending state for forms and buttons.
 * Failures are shown as an error toast (pass {toastErrors: false} to opt out).
 * `run` never throws: it resolves to {ok: true, value} or {ok: false}.
 */
export function useAsyncAction(fn, { toastErrors = true } = {}) {
  const toast = useToast();
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
      const msg = errorMessage(e);
      if (toastErrors) toast.error(msg);
      if (mounted.current) setError(msg);
      return { ok: false };
    } finally {
      if (mounted.current) setPending(false);
    }
  }, [toast, toastErrors]);

  return { run, pending, error, setError };
}
