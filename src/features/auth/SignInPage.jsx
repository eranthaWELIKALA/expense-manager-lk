import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Field, FormError, TextInput } from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { validateEmail } from "../../lib/validation";

export default function SignInPage() {
  const { signIn } = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const { run, pending, error } = useAsyncAction(signIn);

  const emailErr = touched ? validateEmail(email) : "";
  const keepNext = params.get("next") ? "?next=" + encodeURIComponent(params.get("next")) : "";

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (validateEmail(email) || !password) return;
    run({ email: email.trim(), password }); // PublicOnly redirects once signed in
  };

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="auth-title">Sign in</h1>
      <FormError>{error}</FormError>
      <Field label="Email" error={emailErr}>
        <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </Field>
      <Field label="Password" error={touched && !password ? "Enter your password." : ""}>
        <TextInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <div className="auth-row">
        <Link to="/forgot-password">Forgot password?</Link>
      </div>
      <Button type="submit" variant="primary" className="block" loading={pending}>Sign in</Button>
      <p className="auth-alt">New here? <Link to={"/sign-up" + keepNext}>Create an account</Link></p>
    </form>
  );
}
