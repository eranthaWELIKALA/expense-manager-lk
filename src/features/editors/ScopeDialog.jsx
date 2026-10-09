import React, { useState } from "react";
import { Button, Modal, Segmented } from "../../components/ui";
import { mLabel, mShort } from "../../domain";

/**
 * Ask which months an edit to a monthly item / salary applies to.
 * `past`: past months the "all" option would rewrite. onChoose("month" | "future" | "all").
 */
export function ScopeDialog({ name, monthKey, monthOk, past, onChoose, onClose }) {
  const [scope, setScope] = useState("future");
  const options = [
    monthOk && { value: "month", label: "Only " + mLabel(monthKey), hint: "Other months stay as they are" },
    { value: "future", label: mShort(monthKey) + " onwards", hint: "Earlier months keep the old values" },
    { value: "all", label: "All months", hint: past.length ? `Also rewrites ${past.length} past month${past.length === 1 ? "" : "s"}` : "Past months included" },
  ].filter(Boolean);
  return (
    <Modal
      title={`Apply the change to “${name}” from when?`}
      description={monthOk ? undefined : "Only amounts and payment methods can be changed for a single month — set those on the Month page, or pick a range."}
      onClose={onClose}
      footer={<>
        <Button onClick={onClose}>Back</Button>
        <Button variant={scope === "all" && past.length ? "danger" : "primary"} onClick={() => onChoose(scope)}>Apply change</Button>
      </>}
    >
      <Segmented label="Which months" options={options} value={scope} onChange={setScope} />
      {scope === "all" && past.length > 0 && (
        <p className="mut" style={{ fontSize: 12.5, margin: 0 }}>
          Balances for {past.length === 1 ? mLabel(past[0]) : `${mLabel(past[0])} – ${mLabel(past[past.length - 1])}`} will be recalculated.
          Payments already marked paid keep the method they were paid with. You can undo this from History.
        </p>
      )}
    </Modal>
  );
}
