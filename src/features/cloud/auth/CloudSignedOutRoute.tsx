import type { DesktopCloudSession } from "../../../lib/cloudApi";
import type { CloudAuthState } from "./cloudAuthTypes";
import { CloudProjectBrowserSignedOut } from "../components/ProjectBrowser";
import { CloudWorkspaceLoadingState } from "../components/shared";

export function CloudSignedOutRoute({
  authState,
  apiBaseUrl,
  loadingLabel,
  onSessionChange,
  onRefresh,
}: {
  authState: CloudAuthState;
  apiBaseUrl: string | null;
  loadingLabel: string;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onRefresh: () => void;
}) {
  const sessionTransitioning = authState.status === "restoring" || authState.status === "signing-out";
  if (sessionTransitioning) {
    return (
      <main className="desktop-cloud-main-view">
        <div className="desktop-cloud-page-shell">
          <CloudWorkspaceLoadingState label={loadingLabel} />
        </div>
      </main>
    );
  }

  return (
    <main className="desktop-cloud-main-view desktop-cloud-auth-main-view">
      <div className="desktop-cloud-page-shell">
        <CloudProjectBrowserSignedOut
          apiBaseUrl={apiBaseUrl}
          accountEmail={null}
          onSignedIn={onSessionChange}
          onSignedOut={() => onSessionChange(null)}
          onRefresh={onRefresh}
        />
      </div>
    </main>
  );
}
