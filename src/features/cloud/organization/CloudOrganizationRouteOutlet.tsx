import { openCloudApp, type DesktopCloudSession } from "../../../lib/cloudApi";
import { useFeatureFlag } from "../../flags";
import type { CloudWorkspaceSection } from "../types";
import { getCloudRouteWebPath } from "../routes/cloudRoutes";
import { CloudOrganizationBillingPage } from "./CloudOrganizationBillingPage";
import { CloudOrganizationTeamPage } from "./CloudOrganizationTeamPage";

export type CloudOrganizationRouteSection = "cloud-team" | "cloud-billing";

export function isCloudOrganizationRouteSection(
  section: CloudWorkspaceSection,
): section is CloudOrganizationRouteSection {
  return section === "cloud-team" || section === "cloud-billing";
}

export function CloudOrganizationRouteOutlet({
  activeSection,
  cloudSession,
  cloudApiBaseUrl,
  accountEmail,
  onSessionChange,
}: {
  activeSection: CloudOrganizationRouteSection;
  cloudSession: DesktopCloudSession;
  cloudApiBaseUrl: string | null;
  accountEmail: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
}) {
  const billingEnabled = useFeatureFlag("cloudBilling");

  if (activeSection === "cloud-billing" && billingEnabled) {
    return (
      <CloudOrganizationBillingPage
        session={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        onSessionChange={onSessionChange}
      />
    );
  }

  return (
    <CloudOrganizationTeamPage
      accountEmail={accountEmail}
      session={cloudSession}
      apiBaseUrl={cloudApiBaseUrl}
      onSessionChange={onSessionChange}
      onOpen={() => openCloudApp(getCloudRouteWebPath("cloud-team"))}
    />
  );
}

