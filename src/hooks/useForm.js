import { useCallback, useState } from "react";

/**
 * Minimal form state: string values, a pure `validate(values) → {field: message}`,
 * and errors that appear only after the first submit attempt.
 */
export function useForm(initial, validate) {
  const [values, setValues] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const allErrors = validate(values);

  /** set("name") returns an onChange handler; set("name", value) sets directly. */
  const set = useCallback((key, ...direct) => {
    const apply = (v) => setValues((vals) => ({ ...vals, [key]: v && v.target ? v.target.value : v }));
    if (direct.length) return apply(direct[0]);
    return apply;
  }, []);

  /** Wrap a submit handler: blocks (and reveals errors) until the form is valid. */
  const guard = (fn) => async () => {
    setSubmitted(true);
    if (Object.values(allErrors).some(Boolean)) return;
    await fn(values);
  };

  return { values, setValues, set, errors: submitted ? allErrors : {}, guard };
}
