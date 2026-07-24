import { Check, LogIn, LogOut, RefreshCw } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type { CloudAuthView, CloudLoginMethod } from "../model";
import "./cloud-auth-card.css";

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
          <span>{loading === "browser"
            ? t("cloud.auth.finishInBrowser")
            : signInLabel ?? t("cloud.auth.signInWithBrowser")}</span>
        </button>
      ) : (
        <>
          <div className="desktop-cloud-auth-heading">
            <h3>{t("cloud.account.signedIn")}</h3>
            <p dir="auto">{signedInEmail ?? t("cloud.productName")}</p>
          </div>
          <div className="desktop-cloud-auth-state">
            <span><Check size={14} /></span>
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

      {(error || message) && (
        <div className="desktop-cloud-auth-feedback">
          {error && <div className="error">{error}</div>}
          {message && loading !== "browser" && <div className="success">{message}</div>}
        </div>
      )}
      {view !== "signedIn" && <p className="desktop-cloud-auth-terms">{t("cloud.auth.terms")}</p>}
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
