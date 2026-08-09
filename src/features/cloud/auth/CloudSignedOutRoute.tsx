import type { DesktopCloudSession } from "../../../lib/cloudApi";
import type { CloudAuthState } from "./cloudAuthTypes";
import { CloudWorkspaceLoadingState } from "../components/shared";
import { CloudSignInView } from "./CloudSignInView";

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
      <main className="desktop-cloud-main-view" data-po-scrollbar="content">
        <div className="desktop-cloud-page-shell">
          <CloudWorkspaceLoadingState label={loadingLabel} />
        </div>
      </main>
    );
  }

  return (
    <main
      className="desktop-cloud-main-view desktop-cloud-auth-main-view"
      data-po-scrollbar="content"
    >
      <div className="desktop-cloud-auth-page-shell">
        <CloudSignInView
          apiBaseUrl={apiBaseUrl}
          onSessionChange={onSessionChange}
          onRefresh={onRefresh}
        />
      </div>
    </main>
  );
}
