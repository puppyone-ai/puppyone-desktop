import { useEffect, useState } from "react";
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
  const [loading, setLoading] = useState<CloudLoginMethod | null>(() => (
    getCachedDesktopCloudAuthState()?.status === "signing-in" ? "browser" : null
  ));
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null | undefined>(undefined);
  const effectiveSignedInEmail = signedInEmail === undefined ? accountEmail : signedInEmail;

  useEffect(() => {
    return onDesktopCloudAuthError((message) => {
      setLoading(null);
      setSigningOut(false);
      setMessage(null);
      setError(message);
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
      setError(loginError instanceof Error ? loginError.message : "Unable to start Cloud sign-in");
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
      setMessage("Signed out.");
      void onRefresh();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Sign-out failed");
    } finally {
      setSigningOut(false);
    }
  };

  return {
    view: "main" as CloudAuthView,
    signedInEmail: effectiveSignedInEmail,
    loading,
    signingOut,
    error,
    message,
    startProviderLogin: (method?: Exclude<CloudLoginMethod, "email" | "password" | "browser">) => void startCloudLogin(method),
    handleSignOut: () => void handleSignOut(),
  };
}
