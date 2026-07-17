import { useEffect, useState } from "react";
import { useLocalization } from "@puppyone/localization/react";
import {
  openCloudApp,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import {
  clearDesktopCloudSession,
  getCachedDesktopCloudAuthState,
  onDesktopCloudAuthError,
  onDesktopCloudAuthStateChanged,
  startDesktopCloudOAuth,
  supportsDesktopCloudOAuth,
} from "../../../lib/cloudSession";
import type { CloudAuthView, CloudLoginMethod } from "../model";
import {
  cloudMessage,
  formatCloudMessage,
  type CloudMessageDescriptor,
} from "../cloudPresentation";

export function useCloudAuthController({
  cloudApiBaseUrl,
  accountEmail,
  onSignedIn,
  onSignedOut,
  onRefresh,
}: {
  cloudApiBaseUrl: string | null;
  accountEmail: string | null;
  onSignedIn: (session: DesktopCloudSession) => void;
  onSignedOut?: () => void;
  onRefresh: () => void | Promise<void>;
}) {
  const { t } = useLocalization();
  const [loading, setLoading] = useState<CloudLoginMethod | null>(() => (
    getCachedDesktopCloudAuthState()?.status === "signing-in" ? "browser" : null
  ));
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<CloudMessageDescriptor | null>(null);
  const [message, setMessage] = useState<CloudMessageDescriptor | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null | undefined>(undefined);
  const effectiveSignedInEmail = signedInEmail === undefined ? accountEmail : signedInEmail;

  useEffect(() => {
    return onDesktopCloudAuthError((message) => {
      setLoading(null);
      setSigningOut(false);
      setMessage(null);
      setError(cloudMessage("auth-start-failed", undefined, message));
    });
  }, []);

  useEffect(() => {
    const syncAuthState = (state: { status: DesktopCloudSession["status"] } | null) => {
      if (!state) return;
      if (state.status === "signing-in") {
        setLoading("browser");
        setError(null);
        setMessage(null);
        return;
      }
      setLoading((current) => current === "browser" ? null : current);
    };
    syncAuthState(getCachedDesktopCloudAuthState());
    return onDesktopCloudAuthStateChanged(syncAuthState);
  }, []);

  useEffect(() => {
    setSignedInEmail(undefined);
    if (accountEmail) {
      setLoading(null);
      setError(null);
      setMessage(null);
    }
  }, [accountEmail]);

  const startCloudLogin = async (method?: Exclude<CloudLoginMethod, "email" | "password" | "browser">) => {
    const params = new URLSearchParams();
    if (method) params.set("provider", method);

    setLoading(method ?? "browser");
    setError(null);
    try {
      if (supportsDesktopCloudOAuth()) {
        await startDesktopCloudOAuth(method ?? cloudApiBaseUrl, method ? cloudApiBaseUrl : undefined);
      } else {
        openCloudApp(`/login${params.size > 0 ? `?${params.toString()}` : ""}`);
        setLoading(null);
      }
    } catch (loginError) {
      setLoading(null);
      setError(cloudMessage(
        "auth-start-failed",
        undefined,
        loginError instanceof Error ? loginError.message : undefined,
      ));
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setError(null);
    setMessage(null);
    try {
      await clearDesktopCloudSession();
      setSignedInEmail(null);
      onSignedOut?.();
      setMessage(cloudMessage("auth-signed-out"));
      void onRefresh();
    } catch (signOutError) {
      setError(cloudMessage(
        "auth-signout-failed",
        undefined,
        signOutError instanceof Error ? signOutError.message : undefined,
      ));
    } finally {
      setSigningOut(false);
    }
  };

  return {
    view: "main" as CloudAuthView,
    signedInEmail: effectiveSignedInEmail,
    loading,
    signingOut,
    error: error ? formatCloudMessage(error, t) : null,
    message: message ? formatCloudMessage(message, t) : null,
    startProviderLogin: (method?: Exclude<CloudLoginMethod, "email" | "password" | "browser">) => void startCloudLogin(method),
    handleSignOut: () => void handleSignOut(),
  };
}
