import React, { useEffect, useId, useRef, useState } from "react";
import { Button } from "./Button";
import { Field, TextInput } from "./Form";

/** Accessible dialog: Escape closes, focus moves in and is restored on close. */
export function Modal({ title, description, onClose, children, footer, size = "md" }) {
  const titleId = useId();
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Mount-only: callers often pass an inline onClose, which must not re-steal focus.
  useEffect(() => {
    const prev = document.activeElement;
    const first = ref.current?.querySelector("input, select, textarea, button");
    (first || ref.current)?.focus();
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, []);

  return (
    <div className="ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"dlg " + size} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div className="h">
          <h2 id={titleId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <div className="b">{children}</div>
        {footer && <div className="f">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Confirmation for destructive actions. Pass `confirmText` to require typing
 * a phrase (e.g. the profile name) before the button unlocks.
 */
export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, confirmText, onConfirm, onClose }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = confirmText !== undefined && typed.trim() !== confirmText;
  const go = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  return (
    <Modal
      title={title}
      description={message}
      onClose={onClose}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} disabled={locked} loading={busy} onClick={go}>{confirmLabel}</Button>
      </>}
    >
      {confirmText !== undefined && (
        <Field label={<>Type <b>{confirmText}</b> to confirm</>}>
          <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </Field>
      )}
    </Modal>
  );
}
