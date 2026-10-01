import React, { useState } from "react";
import { Button, Field, FormError, Select, TextInput } from "../../components/ui";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { backend } from "../../services/backend";
import { PLAN_TEMPLATES, currentMonthKey } from "../../domain";
import { CURRENCIES, validateName } from "../../lib/validation";

/** Create a new profile from a starter template. Calls onCreated(id). */
export function CreateProfileForm({ onCreated, onCancel, submitLabel = "Create profile" }) {
  const { account, refreshProfiles } = useWorkspace();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(account?.defaultCurrency || "LKR");
  const [template, setTemplate] = useState("blank");
  const [touched, setTouched] = useState(false);
  const { run, pending, error } = useAsyncAction(async () => {
    const tpl = PLAN_TEMPLATES.find((t) => t.id === template) || PLAN_TEMPLATES[0];
    const id = await backend.profiles.create({ name: name.trim(), currency, data: tpl.build(currentMonthKey()) });
    await refreshProfiles();
    return id;
  });

  const nameErr = validateName(name, "Profile name");
  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (nameErr) return;
    const res = await run();
    if (res.ok) onCreated(res.value);
  };

  return (
    <form onSubmit={submit} noValidate className="stack-form">
      <FormError>{error}</FormError>
      <Field label="Profile name" error={touched ? nameErr : ""} hint="e.g. Household, Business, Parents">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
      </Field>
      <Field label="Currency">
        <Select value={currency} onChange={(e) => setCurrency(e.target.value)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
      </Field>
      <fieldset className="fs choice">
        <legend>Start from</legend>
        {PLAN_TEMPLATES.map((t) => (
          <label key={t.id} className={"choice-opt" + (template === t.id ? " on" : "")}>
            <input type="radio" name="template" value={t.id} checked={template === t.id} onChange={() => setTemplate(t.id)} />
            <span><b>{t.label}</b><small>{t.description}</small></span>
          </label>
        ))}
      </fieldset>
      <div className="form-actions">
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        <Button type="submit" variant="primary" loading={pending}>{submitLabel}</Button>
      </div>
    </form>
  );
}
