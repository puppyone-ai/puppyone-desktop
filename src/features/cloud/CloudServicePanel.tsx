import { Check, Cloud, LogIn, LogOut, RefreshCw, Server, SquareTerminal, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useLocalization } from "@puppyone/localization/react";
import type { CloudAuthView, CloudLoginFeature, CloudLoginMethod } from "./model";
import type { CloudServicePanelProps } from "./types";
import { useCloudAuthController } from "./hooks/useCloudAuthController";
import { resolveCloudEnvironment } from "./environment";

export function CloudServicePanel({
  open,
  status,
  accountEmail,
  loading,
  error,
  onClose,
  onRefresh,
  onSignedIn,
  onSignedOut,
  onEnterCloud,
  onOpenGitSettings,
}: CloudServicePanelProps) {
  const { t } = useLocalization();
  const cloudEnvironment = resolveCloudEnvironment({ status });
  const cloudRemote = cloudEnvironment.cloudRemote;
  const cloudApiBaseUrl = cloudEnvironment.apiBaseUrl;
  const auth = useCloudAuthController({
    cloudApiBaseUrl,
    accountEmail,
    onSignedIn,
    onSignedOut,
    onRefresh,
  });

  if (!open) return null;

  const hosted = Boolean(cloudRemote);
  const signedInEmail = auth.signedInEmail;
  const effectiveAuthView: CloudAuthView = !hosted && signedInEmail ? "signedIn" : auth.view;
  const showHostedCard = Boolean(hosted && signedInEmail);
  const statusBadge = error
    ? t("cloud.auth.checkFailed")
    : loading && !status
      ? t("cloud.common.checking")
      : showHostedCard
        ? t("cloud.auth.hosted")
        : null;
  const statusTitle = t(showHostedCard ? "cloud.auth.workspaceConnected" : "cloud.auth.signInToContinue");
  const cloudFeatures: CloudLoginFeature[] = [
    {
      label: t("cloud.auth.feature.team"),
      icon: Users,
    },
    {
      label: t("cloud.auth.feature.backup"),
      icon: Cloud,
    },
    {
      label: t("cloud.auth.feature.mcpCli"),
      icon: SquareTerminal,
    },
    {
      label: t("cloud.auth.feature.alwaysOnline"),
      icon: Server,
    },
  ];

  return (
    <div className="desktop-cloud-panel-layer">
      <button className="desktop-cloud-panel-scrim" type="button" aria-label={t("cloud.auth.closePanel")} onClick={onClose} />
      <section className={`desktop-cloud-panel ${showHostedCard ? "hosted" : "locked"}`} role="dialog" aria-modal="true" aria-label={t("cloud.auth.serviceAria")}>
        <div className="desktop-cloud-panel-body">
          <section className="desktop-cloud-login-layout">
            <div className="desktop-cloud-login-copy">
              <div className="desktop-cloud-login-copy-content">
                <div className="desktop-cloud-login-identity">
                  <div className="desktop-cloud-login-logo" aria-hidden="true">
                    <CloudProductMark />
                  </div>
                  <div className="desktop-cloud-login-copy-stack">
                    <h3>{t("cloud.auth.getCloud")}</h3>
                    {statusBadge && (
                      <span className={`desktop-cloud-login-badge ${showHostedCard ? "hosted" : "locked"}`}>{statusBadge}</span>
                    )}
                    <p>{t("cloud.auth.shortDescription")}</p>
                  </div>
                </div>
                <div className="desktop-cloud-login-feature-list">
                  {cloudFeatures.map((feature) => (
                    <CloudLoginFeatureRow key={feature.label} feature={feature} />
                  ))}
                </div>
              </div>
            </div>
            <aside className="desktop-cloud-login-card">
              {showHostedCard ? (
                <CloudHostedLoginCard
                  loading={loading}
                  statusTitle={statusTitle}
                  error={error}
                  signingOut={auth.signingOut}
                  onOpenCloud={onEnterCloud}
                  onRefresh={onRefresh}
                  onSignOut={auth.handleSignOut}
                  onOpenGitSettings={onOpenGitSettings}
                />
              ) : (
                <CloudAuthCard
                  view={effectiveAuthView}
                  signedInEmail={signedInEmail}
                  loading={auth.loading}
                  signingOut={auth.signingOut}
                  error={auth.error}
                  message={auth.message}
                  onProviderLogin={auth.startProviderLogin}
                  onOpenCloud={onEnterCloud}
                  onRefresh={onRefresh}
                  onSignOut={auth.handleSignOut}
                />
              )}
            </aside>
          </section>
        </div>
      </section>
    </div>
  );
}

export function CloudAuthCard({
  view,
  signedInEmail,
  signInLabel,
  loading,
  signingOut,
  error,
  message,
  onProviderLogin,
  onOpenCloud,
  onRefresh,
  onSignOut,
}: {
  view: CloudAuthView;
  signedInEmail: string | null;
  signInLabel?: string;
  loading: CloudLoginMethod | null;
  signingOut: boolean;
  error: string | null;
  message: string | null;
  onProviderLogin: (method?: Exclude<CloudLoginMethod, "email" | "password" | "browser">) => void;
  onOpenCloud: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  const { t } = useLocalization();
  const disabled = Boolean(loading) || signingOut;
  const resolvedSignInLabel = signInLabel ?? t("cloud.auth.signInWithBrowser");

  return (
    <div className="desktop-cloud-auth-card">
      {view !== "signedIn" ? (
        <button
          className="desktop-cloud-auth-submit"
          type="button"
          disabled={disabled}
          onClick={() => onProviderLogin()}
        >
          <LogIn size={15} />
          <span>{loading === "browser" ? t("cloud.auth.finishInBrowser") : resolvedSignInLabel}</span>
        </button>
      ) : (
        <>
          <div className="desktop-cloud-auth-heading">
            <h3>{t("cloud.account.signedIn")}</h3>
            <p dir="auto">{signedInEmail ?? t("cloud.productName")}</p>
          </div>
          <div className="desktop-cloud-auth-state">
            <span>
              <Check size={14} />
            </span>
            <div>
              <strong>{t("cloud.auth.accountConnected")}</strong>
              <p>{t("cloud.auth.backupToEnable")}</p>
            </div>
          </div>
          <button className="desktop-cloud-auth-submit" type="button" onClick={onOpenCloud}>
            {t("cloud.auth.enterCloud")}
          </button>
          <button className="desktop-cloud-auth-secondary" type="button" onClick={onRefresh}>
            <RefreshCw size={14} />
            <span>{t("cloud.auth.checkWorkspaceStatus")}</span>
          </button>
          <button className="desktop-cloud-auth-secondary" type="button" disabled={signingOut} onClick={onSignOut}>
            <LogOut size={14} />
            <span>{t(signingOut ? "cloud.auth.signingOut" : "cloud.auth.signOut")}</span>
          </button>
        </>
      )}

      <CloudAuthFeedback error={error} message={loading === "browser" ? null : message} />

      {view !== "signedIn" && (
        <p className="desktop-cloud-auth-terms">{t("cloud.auth.terms")}</p>
      )}
    </div>
  );
}

export function CloudHostedLoginCard({
  loading,
  statusTitle,
  error,
  signingOut,
  onOpenCloud,
  onRefresh,
  onSignOut,
  onOpenGitSettings,
}: {
  loading: boolean;
  statusTitle: string;
  error: string | null;
  signingOut: boolean;
  onOpenCloud: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onOpenGitSettings: () => void;
}) {
  const { t } = useLocalization();
  return (
    <div className="desktop-cloud-auth-card desktop-cloud-auth-card-hosted">
      <h3>{t("cloud.productName")}</h3>
      <p className="desktop-cloud-auth-hosted-copy">{statusTitle}</p>
      <button className="desktop-cloud-auth-submit" type="button" onClick={onOpenCloud}>
        {t("cloud.auth.enterCloud")}
      </button>
      <button className="desktop-cloud-auth-secondary" type="button" onClick={onRefresh}>
        <RefreshCw size={14} className={loading ? "spin" : undefined} />
        <span>{t("cloud.auth.checkStatus")}</span>
      </button>
      <button className="desktop-cloud-auth-secondary" type="button" onClick={onOpenGitSettings}>
        {t("cloud.auth.gitSyncDetails")}
      </button>
      <button className="desktop-cloud-auth-secondary" type="button" disabled={signingOut} onClick={onSignOut}>
        <LogOut size={14} />
        <span>{t(signingOut ? "cloud.auth.signingOut" : "cloud.auth.signOut")}</span>
      </button>
      {error && <p className="desktop-cloud-login-error">{error}</p>}
    </div>
  );
}

export function CloudProviderButton({
  icon,
  label,
  loadingLabel,
  isLoading,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  loadingLabel: string;
  isLoading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button className="desktop-cloud-provider-button" type="button" disabled={disabled} onClick={onClick}>
      <span className="desktop-cloud-provider-button-icon">{icon}</span>
      <span>{isLoading ? loadingLabel : label}</span>
    </button>
  );
}

export function CloudAuthFeedback({ error, message }: { error: string | null; message: string | null }) {
  if (!error && !message) return null;

  return (
    <div className="desktop-cloud-auth-feedback">
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
    </div>
  );
}

export function CloudLoginFeatureRow({ feature }: { feature: CloudLoginFeature }) {
  return (
    <div className="desktop-cloud-login-feature-row">
      <span>
        <Check size={13} />
      </span>
      <div>
        <strong>{feature.label}</strong>
      </div>
    </div>
  );
}

export function CloudProductMark() {
  return (
    <svg className="desktop-cloud-product-mark" viewBox="0 0 160 100" aria-hidden="true" focusable="false">
      <path
        className="desktop-cloud-product-mark-cloud"
        d="M43.8 76.5h72.6c14.4 0 26.1-11.1 26.1-24.8 0-13.6-11.4-24.6-25.6-24.9C111.2 13.8 98.1 5.5 83.5 7.1 67.3 8.8 54.2 21.1 51.2 37.2h-6.8c-15.5 0-27.9 11.1-27.9 24.6 0 9.6 9.3 14.7 27.3 14.7Z"
      />
    </svg>
  );
}

export function CloudGoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 533.5 544.3" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#4285f4" d="M533.5 278.4c0-17.6-1.6-34.4-4.6-50.4H272v95.3h147c-6.4 34.6-25.8 63.9-55 83.6l89 69.4c51.8-47.7 80.5-118 80.5-198z" />
      <path fill="#34a853" d="M272 544.3c74.7 0 137.5-24.8 183.3-67.4l-89-69.4c-24.7 16.6-56.3 26.3-94.3 26.3-72.5 0-134-49-155.9-114.9l-92 71.6c41.6 82.5 127.1 153.8 247.9 153.8z" />
      <path fill="#fbbc04" d="M116.1 318.9c-10-29.8-10-62.1 0-91.9l-92-71.6C4 211 0 240.9 0 272.4s4 61.4 24.1 116.9l92-70.4z" />
      <path fill="#ea4335" d="M272 107.7c39.7-.6 77.6 14.7 105.8 42.9l77.5-77.5C395.1 24 334.2 0 272 0 151.2 0 65.7 71.3 24.1 155.5l92 71.6C138 161.3 199.5 107.7 272 107.7z" />
    </svg>
  );
}

export function CloudGithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 1C6 1 1.5 5.5 1.5 11.5c0 4.6 3 8.5 7.2 9.9.5.1.7-.2.7-.5v-1.9c-2.9.6-3.5-1.2-3.5-1.2-.5-1.2-1.2-1.6-1.2-1.6-1-.7.1-.7.1-.7 1.1.1 1.7 1.1 1.7 1.1 1 1.7 2.6 1.2 3.2.9.1-.7.4-1.2.7-1.5-2.4-.3-4.9-1.2-4.9-5.3 0-1.2.4-2.1 1.1-2.9-.1-.3-.5-1.4.1-2.9 0 0 .9-.3 3 .1 1-.3 2-.4 3.1-.4s2.1.1 3.1.4c2.1-1.4 3-.1 3-.1.6 1.5.2 2.6.1 2.9.7.8 1.1 1.7 1.1 2.9 0 4.1-2.6 5.1-5 5.4.4.3.7 1 .7 2v3c0 .3.2.6.7.5 4.2-1.4 7.2-5.3 7.2-9.9C22.5 5.5 18 1 12 1z" />
    </svg>
  );
}
