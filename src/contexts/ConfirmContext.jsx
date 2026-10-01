import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ui";

const ConfirmContext = createContext(null);

/**
 * Promise-based confirmation for risky actions:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title, message, confirmLabel, danger }))) return;
 *
 * Resolves true on confirm, false on cancel / Escape / backdrop click.
 * Pass `confirmText` to require typing a phrase first.
 */
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolveRef.current?.(false); // a newer request supersedes an unanswered one
    resolveRef.current = resolve;
    setRequest(options);
  }), []);

  const settle = (value) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <ConfirmDialog
          {...request}
          onConfirm={() => settle(true)}
          onClose={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
};
