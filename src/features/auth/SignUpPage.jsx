import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Banner, Button, Field, FormError, TextInput } from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { PASSWORD_MIN, validateEmail, validateName, validatePassword } from "../../lib/validation";

export default function SignUpPage() {
  const { signUp } = useAuth();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ displayName: "", email: "", password: "", confirm: "" });
  const [touched, setTouched] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const { run, pending, error } = useAsyncAction(signUp);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const errors = {
    displayName: validateName(form.displayName, "Your name"),
    email: validateEmail(form.email),
    password: validatePassword(form.password),
    confirm: form.confirm !== form.password ? "Passwords don't match." : "",
  };
  const show = (k) => (touched ? errors[k] : "");

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    const res = await run({ email: form.email.trim(), password: form.password, displayName: form.displayName.trim() });
    if (res.ok && res.value.needsConfirmation) setSentTo(form.email.trim());
  };

  if (sentTo) {
    return (
      <div>
        <h1 className="auth-title">Check your email</h1>
        <Banner tone="info">We sent a confirmation link to <b>{sentTo}</b>. Open it to finish creating your account.</Banner>
        <p className="auth-alt"><Link to="/sign-in">Back to sign in</Link></p>
      </div>
    );
  }

  const keepNext = params.get("next") ? "?next=" + encodeURIComponent(params.get("next")) : "";
  return (
    <form onSubmit={submit} noValidate>
      <h1 className="auth-title">Create your account</h1>
      <FormError>{error}</FormError>
      <Field label="Your name" error={show("displayName")}>
        <TextInput autoComplete="name" value={form.displayName} onChange={set("displayName")} maxLength={80} autoFocus />
      </Field>
      <Field label="Email" error={show("email")} hint="Partners invite you using this address.">
        <TextInput type="email" autoComplete="email" value={form.email} onChange={set("email")} />
      </Field>
      <Field label="Password" error={show("password")} hint={`At least ${PASSWORD_MIN} characters, with a letter and a number.`}>
        <TextInput type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
      </Field>
      <Field label="Confirm password" error={show("confirm")}>
        <TextInput type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />
      </Field>
      <Button type="submit" variant="primary" className="block" loading={pending}>Create account</Button>
      <p className="auth-alt">Already have an account? <Link to={"/sign-in" + keepNext}>Sign in</Link></p>
    </form>
  );
}
