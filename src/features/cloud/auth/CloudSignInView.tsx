import { DesktopEntryState } from "../../../components/DesktopEntryState";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import { useLocalization } from "@puppyone/localization/react";
import { CloudAuthCard, CloudProductMark } from "./CloudAuthCard";
import { useCloudAuthController } from "../hooks/useCloudAuthController";
import "./cloud-sign-in.css";

export function CloudSignInView({
  apiBaseUrl,
  onSessionChange,
  onRefresh,
}: {
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
    <DesktopEntryState
      className="desktop-cloud-sign-in-entry"
      ariaLabel={t("cloud.auth.signInToCloud")}
      visual={(
        <div className="desktop-cloud-login-logo">
          <CloudProductMark />
        </div>
      )}
      title={t("cloud.productName")}
      description={t("cloud.auth.description")}
      action={(
        <CloudAuthCard
          view={auth.signedInEmail ? "signedIn" : auth.view}
          signedInEmail={auth.signedInEmail}
          signInLabel={t("cloud.auth.signInToCloud")}
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
