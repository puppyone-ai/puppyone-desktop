import {
  isCloudSessionForApiBase,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import type { CloudEnvironment } from "../environment";
import type { CloudAuthState } from "./cloudAuthTypes";

export function resolveCloudAuthState({
  cloudSession,
  sessionRestoring = false,
  environmentRestoring = false,
  environment,
}: {
  cloudSession: DesktopCloudSession | null;
  sessionRestoring?: boolean;
  environmentRestoring?: boolean;
  environment: CloudEnvironment;
}): CloudAuthState {
  const effectiveSession = isCloudSessionForApiBase(cloudSession, environment.apiBaseUrl)
    ? cloudSession
    : null;

  if ((sessionRestoring || environmentRestoring) && !effectiveSession) {
    return { status: "restoring", apiBaseUrl: environment.apiBaseUrl };
  }

  if (effectiveSession) {
    if (effectiveSession.status === "refreshing") {
      return { status: "refreshing", apiBaseUrl: environment.apiBaseUrl, session: effectiveSession };
    }
    if (effectiveSession.status === "offline-authenticated") {
      return { status: "offline-authenticated", apiBaseUrl: environment.apiBaseUrl, session: effectiveSession };
    }
    if (effectiveSession.status === "signing-out") {
      return { status: "signing-out", apiBaseUrl: environment.apiBaseUrl, session: effectiveSession };
    }
    if (effectiveSession.status === "signing-in") {
      return { status: "signing-in", apiBaseUrl: environment.apiBaseUrl, session: effectiveSession };
    }
    if (effectiveSession.status === "expired") {
      return { status: "expired", apiBaseUrl: environment.apiBaseUrl };
    }
    return {
      status: "signed-in",
      apiBaseUrl: environment.apiBaseUrl,
      session: effectiveSession,
    };
  }

  if (cloudSession && environment.apiBaseUrl) {
    return {
      status: "wrong-host",
      apiBaseUrl: environment.apiBaseUrl,
      session: cloudSession,
    };
  }

  return { status: "signed-out", apiBaseUrl: environment.apiBaseUrl };
}
