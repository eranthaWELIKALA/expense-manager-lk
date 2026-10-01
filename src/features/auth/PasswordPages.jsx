import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Banner, Button, Field, FormError, LoadingScreen, TextInput } from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { backend } from "../../services/backend";
import { PASSWORD_MIN, validateEmail, validatePassword } from "../../lib/validation";

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);
  const { run, pending, error } = useAsyncAction(requestPasswordReset);

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (validateEmail(email)) return;
    // Same response whether or not the account exists, so emails can't be enumerated.
    if ((await run(email.trim())).ok) setSent(true);
  };

  if (sent) {
    return (
      <div>
        <h1 className="auth-title">Check your email</h1>
        {backend.kind === "local"
          ? <Banner tone="warn">Demo mode can't send email. Sign in and change your password under Settings → Account.</Banner>
          : <Banner tone="info">If an account exists for <b>{email.trim()}</b>, a reset link is on its way.</Banner>}
        <p className="auth-alt"><Link to="/sign-in">Back to sign in</Link></p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="auth-title">Reset your password</h1>
      <FormError>{error}</FormError>
      <Field label="Email" error={touched ? validateEmail(email) : ""}>
        <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </Field>
      <Button type="submit" variant="primary" className="block" loading={pending}>Send reset link</Button>
      <p className="auth-alt"><Link to="/sign-in">Back to sign in</Link></p>
    </form>
  );
}

/** Reusable new-password form (reset flow and Settings → Account). */
export function NewPasswordForm({ onDone, submitLabel = "Update password" }) {
  const { updatePassword } = useAuth();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const { run, pending, error } = useAsyncAction(updatePassword);

  const pwErr = validatePassword(pw);
  const confirmErr = confirm !== pw ? "Passwords don't match." : "";

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (pwErr || confirmErr) return;
    if ((await run(pw)).ok) { setPw(""); setConfirm(""); setTouched(false); onDone?.(); }
  };

  return (
    <form onSubmit={submit} noValidate>
      <FormError>{error}</FormError>
      <Field label="New password" error={touched ? pwErr : ""} hint={`At least ${PASSWORD_MIN} characters, with a letter and a number.`}>
        <TextInput type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Field label="Confirm new password" error={touched ? confirmErr : ""}>
        <TextInput type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" loading={pending}>{submitLabel}</Button>
    </form>
  );
}

/** Landing page from the reset email (Supabase signs the user in with a recovery session). */
export function ResetPasswordPage() {
  const { status } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  if (status === "loading") return <LoadingScreen />;
  if (status === "signed-out") return <Navigate to="/forgot-password" replace />;
  return (
    <div>
      <h1 className="auth-title">Choose a new password</h1>
      <NewPasswordForm submitLabel="Save and continue" onDone={() => { toast.success("Password updated."); navigate("/", { replace: true }); }} />
    </div>
  );
}
