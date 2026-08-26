import { DesktopEntryState } from "../../../components/DesktopEntryState";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import { useLocalization } from "@puppyone/localization/react";
import { CloudAuthCard, CloudProductMark } from "./CloudAuthCard";
import { useCloudAuthController } from "../hooks/useCloudAuthController";
import { getCloudSectionDescriptor } from "../navigation";
import type { CloudWorkspaceSection } from "../types";
import "./cloud-sign-in.css";

export function CloudSignInView({
  activeSection,
  apiBaseUrl,
  onSessionChange,
  onRefresh,
}: {
  activeSection: CloudWorkspaceSection;
  apiBaseUrl: string | null;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => void | Promise<void>;
}) {
  const { t } = useLocalization();
  const section = getCloudSectionDescriptor(activeSection, t);
  const SectionIcon = section.icon;
  const auth = useCloudAuthController({
    cloudApiBaseUrl: apiBaseUrl,
    accountEmail: null,
    onSignedIn: onSessionChange,
    onSignedOut: () => onSessionChange(null),
    onRefresh,
  });

  return (
    <DesktopEntryState
      className="desktop-cloud-sign-in-entry"
      ariaLabel={t("cloud.auth.signInToCloud")}
      visual={(
        <div className="desktop-cloud-login-logo">
          <CloudProductMark />
          <span className="desktop-cloud-login-route-badge">
            <SectionIcon size={16} strokeWidth={1.8} />
          </span>
        </div>
      )}
      title={section.title}
      description={section.description}
      action={(
        <CloudAuthCard
          view={auth.signedInEmail ? "signedIn" : auth.view}
          signedInEmail={auth.signedInEmail}
          signInLabel={t("cloud.auth.signInToContinue")}
          loading={auth.loading}
          signingOut={auth.signingOut}
          error={auth.error}
          message={auth.message}
          onProviderLogin={auth.startProviderLogin}
          onOpenCloud={onRefresh}
          onRefresh={onRefresh}
          onSignOut={auth.handleSignOut}
        />
      )}
    />
  );
}
