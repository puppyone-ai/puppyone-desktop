import type {
  DesktopCloudAutomationConfigField,
  DesktopCloudAutomationProviderSpec,
  DesktopCloudCreateAutomationRequest,
} from "../../lib/cloudApi";

export type AutomationRunMode = "manual" | "scheduled" | "realtime";

const CLOUD_AUTOMATION_INTERNAL_CONFIG_KEYS = new Set([
  "access_key",
  "authority",
  "connection_id",
  "credentials_ref",
  "credential_ref",
  "direction",
  "external_resource_id",
  "external_resource",
  "last_sync_commit_id",
  "name",
  "oauth_user_id",
  "provider",
  "resource_id",
  "status",
  "sync_behavior",
  "target_folder_path",
  "target_output",
  "target_path",
  "user_id",
  "write_behavior",
]);

export function getCloudAutomationUserConfigFields(
  provider: DesktopCloudAutomationProviderSpec | null,
): DesktopCloudAutomationConfigField[] {
  return (provider?.config_fields ?? []).filter((field) => !CLOUD_AUTOMATION_INTERNAL_CONFIG_KEYS.has(field.key));
}

export function defaultAutomationConfigValues(
  provider: DesktopCloudAutomationProviderSpec,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of getCloudAutomationUserConfigFields(provider)) {
    values[field.key] = field.default === null || field.default === undefined ? "" : String(field.default);
  }
  return values;
}

export function defaultAutomationTargetPath(provider: DesktopCloudAutomationProviderSpec | null) {
  const label = provider?.display_name || provider?.provider || "Automation";
  return normalizeAutomationTargetPath(label.replace(/[<>:"|?*]/g, "-"));
}

export function normalizeAutomationTargetPath(path: string) {
  return path.trim().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

export function getSupportedAutomationRunModes(
  provider: DesktopCloudAutomationProviderSpec | null,
): AutomationRunMode[] {
  const supported = (provider?.supported_sync_modes ?? [])
    .filter((mode): mode is AutomationRunMode => mode === "manual" || mode === "scheduled" || mode === "realtime");
  return supported.length > 0 ? [...new Set(supported)] : ["manual"];
}

export function getDefaultAutomationRunMode(
  provider: DesktopCloudAutomationProviderSpec | null,
): AutomationRunMode {
  const modes = getSupportedAutomationRunModes(provider);
  const preferred = provider?.default_sync_mode;
  return modes.find((mode) => mode === preferred) ?? modes[0];
}

export function buildDesktopCreateAutomationRequest({
  projectId,
  provider,
  configValues,
  targetPath,
  runMode,
  schedule,
  timezone,
}: {
  projectId: string;
  provider: DesktopCloudAutomationProviderSpec;
  configValues: Record<string, string>;
  targetPath: string;
  runMode: AutomationRunMode;
  schedule: string;
  timezone: string;
}): DesktopCloudCreateAutomationRequest {
  const fieldsByKey = new Map(getCloudAutomationUserConfigFields(provider).map((field) => [field.key, field]));
  const options: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(configValues)) {
    const trimmed = value.trim();
    if (!trimmed || key === "resource_url") continue;
    const field = fieldsByKey.get(key);
    options[key] = field?.type === "number" ? Number(trimmed) : value;
  }

  const resourceUrl = (configValues.resource_url ?? "").trim();
  const source = provider.provider === "url"
    ? {
        provider: provider.provider,
        resource_type: "web_page",
        resource_id: resourceUrl,
        resource_name: resourceUrl,
        resource_url: resourceUrl,
      }
    : {
        provider: provider.provider,
        resource_type: "manual",
        resource_id: provider.provider,
        resource_name: provider.display_name,
      };

  const trigger = runMode === "scheduled"
    ? { type: "schedule", schedule: schedule.trim(), timezone }
    : { type: runMode };

  return {
    project_id: projectId,
    provider: provider.provider,
    config: {
      source,
      options,
    },
    target_folder_path: targetPath,
    target_path: targetPath,
    direction: "inbound",
    sync_mode: runMode,
    trigger,
  };
}
