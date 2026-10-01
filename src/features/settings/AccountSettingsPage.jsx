import React, { useState } from "react";
import { Button, Field, FormError, Select, TextInput } from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { backend } from "../../services/backend";
import { CURRENCIES, validateName } from "../../lib/validation";
import { NewPasswordForm } from "../auth/PasswordPages";
import { SettingsSection } from "./SettingsLayout";

function ProfileDetailsForm() {
  const { account, refreshAccount } = useWorkspace();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(account.displayName);
  const [defaultCurrency, setDefaultCurrency] = useState(account.defaultCurrency);
  const { run, pending, error } = useAsyncAction(async () => {
    await backend.account.update({ displayName: displayName.trim(), defaultCurrency });
    await refreshAccount();
  });
  const nameErr = validateName(displayName, "Your name");
  const dirty = displayName.trim() !== account.displayName || defaultCurrency !== account.defaultCurrency;

  const submit = async (e) => {
    e.preventDefault();
    if (nameErr) return;
    if ((await run()).ok) toast.success("Account updated.");
  };

  return (
    <form onSubmit={submit} noValidate className="stack-form">
      <FormError>{error}</FormError>
      <Field label="Your name" error={nameErr} hint="Shown to partners you share profiles with.">
        <TextInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} autoComplete="name" />
      </Field>
      <Field label="Email">
        <TextInput value={account.email} readOnly disabled />
      </Field>
      <Field label="Default currency for new profiles">
        <Select value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
      </Field>
      <div className="form-actions start">
        <Button type="submit" variant="primary" loading={pending} disabled={!dirty}>Save changes</Button>
      </div>
    </form>
  );
}

export default function AccountSettingsPage() {
  const { signOut } = useAuth();
  const toast = useToast();
  return (
    <>
      <h1 className="page-title">Account</h1>
      <SettingsSection title="Your details">
        <ProfileDetailsForm />
      </SettingsSection>
      <SettingsSection title="Password" description="Use a password you don't use anywhere else.">
        <NewPasswordForm onDone={() => toast.success("Password updated.")} />
      </SettingsSection>
      <SettingsSection title="Session" description="Sign out of this device.">
        <Button onClick={signOut}>Sign out</Button>
      </SettingsSection>
    </>
  );
}
