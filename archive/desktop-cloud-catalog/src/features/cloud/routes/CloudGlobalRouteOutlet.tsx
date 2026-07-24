import { openCloudApp, type DesktopCloudSession } from "../../../lib/cloudApi";
import type { DesktopCloudDataState } from "../data";
import type { CloudWorkspaceSection } from "../types";
import { CloudGlobalBillingPage } from "../components/CloudBillingPage";
import { CloudGlobalTeamPage } from "../components/CloudGlobalPages";
import { CloudTemplateStore } from "../components/CloudTemplateStore";
import { useFeatureFlag } from "../../flags";
import { getCloudRouteWebPath } from "./cloudRoutes";

export type CloudGlobalRouteSection = "cloud-team" | "cloud-billing" | "templates";

export function isCloudGlobalRouteSection(
  section: CloudWorkspaceSection,
): section is CloudGlobalRouteSection {
  return section === "cloud-team" || section === "cloud-billing" || section === "templates";
}

export function CloudGlobalRouteOutlet({
  activeSection,
  cloudSession,
  cloudApiBaseUrl,
  cloudData,
  accountEmail,
  onSessionChange,
  onOpenProject,
}: {
  activeSection: CloudGlobalRouteSection;
  cloudSession: DesktopCloudSession;
  cloudApiBaseUrl: string | null;
  cloudData: DesktopCloudDataState;
  accountEmail: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onOpenProject: (projectId: string, section?: CloudWorkspaceSection) => void;
}) {
  const billingEnabled = useFeatureFlag("cloudBilling");

  if (activeSection === "cloud-team") {
    return (
      <CloudGlobalTeamPage
        accountEmail={accountEmail}
        session={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        projects={cloudData.projects}
        onSessionChange={onSessionChange}
        onOpen={() => openCloudApp(getCloudRouteWebPath("cloud-team"))}
      />
    );
  }

  if (activeSection === "cloud-billing") {
    if (!billingEnabled) {
      return (
        <CloudGlobalTeamPage
          accountEmail={accountEmail}
          session={cloudSession}
          apiBaseUrl={cloudApiBaseUrl}
          onSessionChange={onSessionChange}
          onOpen={() => openCloudApp(getCloudRouteWebPath("cloud-team"))}
        />
      );
    }
    return (
      <CloudGlobalBillingPage
        session={cloudSession}
        apiBaseUrl={cloudApiBaseUrl}
        onSessionChange={onSessionChange}
      />
    );
  }

  return (
    <CloudTemplateStore
      session={cloudSession}
      apiBaseUrl={cloudApiBaseUrl}
      onSessionChange={onSessionChange}
      onProjectCreated={(project) => {
        // Creating from a template must not mutate the open repository remote.
        onOpenProject(project.id, "contents");
      }}
    />
  );
}
