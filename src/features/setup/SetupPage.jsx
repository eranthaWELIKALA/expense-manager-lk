import React from "react";
import { useProfile } from "../../contexts/ProfileContext";
import { useViewMonth } from "../../hooks/useViewMonth";
import { BanksSection, CardsSection, IncomesSection, InstallmentsSection, TemplatesSection, WalletsSection } from "./sections";

export default function SetupPage() {
  const { data: plan, canEdit } = useProfile();
  const [mk] = useViewMonth();
  return (
    // A disabled fieldset makes every control read-only for viewers in one place.
    <fieldset className="fs" disabled={!canEdit}>
      <legend className="sr-only">Profile setup</legend>
      <BanksSection plan={plan} />
      <IncomesSection plan={plan} />
      <WalletsSection plan={plan} />
      <CardsSection plan={plan} />
      <TemplatesSection plan={plan} />
      <InstallmentsSection plan={plan} currentMonth={mk} />
    </fieldset>
  );
}
