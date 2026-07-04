import { useEffect, useState } from "react";
import type { DesktopCloudSession } from "../../../lib/cloudApi";
import {
  clearDesktopCloudSession,
  onDesktopCloudAuthError,
  signInDesktopCloudWithPassword,
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
    signInWithPassword: (email: string, password: string) => void signInWithPassword(email, password),
    handleSignOut: () => void handleSignOut(),
  };
}
