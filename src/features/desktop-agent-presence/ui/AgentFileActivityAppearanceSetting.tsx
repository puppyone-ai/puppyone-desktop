import { useState } from "react";
import { useLocalization } from "@puppyone/localization";
import { localAgentActivityProviderId } from "../../local-agents";
import { AgentFileActivityPermissionDialog } from "./AgentFileActivityPermissionDialog";

export function AgentFileActivityAppearanceSetting({
  enabled,
  workspaceRoot,
  onChange,
}: {
  enabled: boolean;
  workspaceRoot: string;
  onChange: (enabled: boolean) => void;
}) {
  const { t } = useLocalization();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [permissionOpen, setPermissionOpen] = useState(false);

  const disable = async () => {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      await reconcileNativeActivityHooks({ enabled: false, workspaceRoot });
      onChange(false);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  const authorize = async () => {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      await reconcileNativeActivityHooks({ enabled: true, workspaceRoot });
      onChange(true);
      setPermissionOpen(false);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  const status = error ? t("settings.appearance.agentFileActivity.error") : undefined;
  return (
    <>
      <div className="desktop-settings-row desktop-settings-row-control">
        <span id="desktop-agent-file-activity-label">
          {t("settings.appearance.agentFileActivity.title")}
        </span>
        <label className="desktop-settings-switch" title={status}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={pending}
            aria-labelledby="desktop-agent-file-activity-label"
            aria-description={status}
            onChange={(event) => {
              if (event.target.checked) {
                setError(false);
                setPermissionOpen(true);
              } else {
                void disable();
              }
            }}
          />
          <span aria-hidden="true" />
        </label>
      </div>
      {permissionOpen && (
        <AgentFileActivityPermissionDialog
          authorizing={pending}
          error={error}
          onCancel={() => {
            if (!pending) {
              setError(false);
              setPermissionOpen(false);
            }
          }}
          onAuthorize={() => void authorize()}
        />
      )}
    </>
  );
}

export async function reconcileNativeActivityHooks({
  enabled,
  workspaceRoot,
}: {
  enabled: boolean;
  workspaceRoot: string;
}) {
  const desktop = window.puppyoneDesktop;
  if (!desktop?.getAgentActivityEnrollment || !desktop.setAgentActivityEnrollment) {
    if (enabled) throw new Error("AGENT_ACTIVITY_ENROLLMENT_UNAVAILABLE");
    return;
  }
  const enrollment = await desktop.getAgentActivityEnrollment();
  let installedIds: Set<string> | null = null;
  if (enabled) {
    if (!desktop.discoverLocalAgentConnections) throw new Error("LOCAL_AGENT_INVENTORY_UNAVAILABLE");
    const inventory = await desktop.discoverLocalAgentConnections({ rootPath: workspaceRoot, refresh: false });
    installedIds = new Set(inventory.connections
      .filter((connection) => connection.installation !== "not-found")
      .map((connection) => localAgentActivityProviderId(connection.id)));
  }

  const changed: Array<{ providerId: string; enabled: boolean }> = [];
  try {
    for (const provider of enrollment.providers) {
      if (!provider.configurable) continue;
      const desired = enabled && (!installedIds || installedIds.has(provider.providerId));
      const current = provider.enrollment === "enabled";
      if (desired === current) continue;
      await desktop.setAgentActivityEnrollment({ providerId: provider.providerId, enabled: desired });
      changed.push({ providerId: provider.providerId, enabled: desired });
    }
  } catch (error) {
    for (const change of changed.reverse()) {
      await desktop.setAgentActivityEnrollment({
        providerId: change.providerId,
        enabled: !change.enabled,
      }).catch(() => undefined);
    }
    throw error;
  }
}
