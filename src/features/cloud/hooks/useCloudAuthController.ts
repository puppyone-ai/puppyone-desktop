import { useEffect, useState } from "react";
import {
  openCloudApp,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import {
  clearDesktopCloudSession,
  onDesktopCloudAuthError,
  signInDesktopCloudWithPassword,
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
  const [loading, setLoading] = useState<CloudLoginMethod | null>(null);
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
    setSignedInEmail(undefined);
  }, [accountEmail]);

  const startCloudLogin = async (method?: Exclude<CloudLoginMethod, "email" | "password" | "browser">) => {
    const params = new URLSearchParams();
    if (method) params.set("provider", method);

    setLoading(method ?? "browser");
    setError(null);
    try {
      if (supportsDesktopCloudOAuth()) {
        await startDesktopCloudOAuth(method ?? cloudApiBaseUrl, method ? cloudApiBaseUrl : undefined);
        setMessage("Finish sign-in in your browser. Desktop will connect automatically.");
      } else {
        openCloudApp(`/login${params.size > 0 ? `?${params.toString()}` : ""}`);
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to start Cloud sign-in");
    } finally {
      window.setTimeout(() => setLoading(null), 1200);
    }
  };

  const signInWithPassword = async (email: string, password: string) => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Enter your email and password.");
      return;
    }

    setLoading("password");
    setError(null);
    setMessage(null);
    try {
      const session = await signInDesktopCloudWithPassword(trimmedEmail, password, cloudApiBaseUrl);
      if (!session) {
        setError("Sign-in failed. Please try again.");
        return;
      }
      setSignedInEmail(session.user_email);
      onSignedIn(session);
      setMessage("Signed in.");
      void onRefresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in");
    } finally {
      setLoading(null);
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
    signInWithPassword: (email: string, password: string) => void signInWithPassword(email, password),
    handleSignOut: () => void handleSignOut(),
  };
}
