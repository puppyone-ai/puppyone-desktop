import type { DesktopCloudSession } from "../../../lib/cloudApi";
import { useLocalization } from "@puppyone/localization/react";
import type { CloudWorkspaceSection } from "../types";
import { CloudActivationHero } from "../components/CloudActivationHero";
import { CloudAuthCard } from "./CloudAuthCard";
import { useCloudAuthController } from "../hooks/useCloudAuthController";
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
  const auth = useCloudAuthController({
    cloudApiBaseUrl: apiBaseUrl,
    accountEmail: null,
    onSignedIn: onSessionChange,
    onSignedOut: () => onSessionChange(null),
    onRefresh,
  });

  return (
    <CloudActivationHero
      activeSection={activeSection}
      className="desktop-cloud-sign-in-entry"
      ariaLabel={t("cloud.auth.signInToCloud")}
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
