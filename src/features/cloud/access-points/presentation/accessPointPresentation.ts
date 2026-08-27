import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import type { AccessPoint, AccessPointCommand } from "../model/accessPoint";
import { getAccessPointKindDefinition } from "../model/accessPointKindRegistry";

export function formatAccessPointTitle(accessPoint: AccessPoint, t: MessageFormatter): string {
  if (accessPoint.title) return accessPoint.title;
  const definition = getAccessPointKindDefinition(accessPoint.kind);
  return definition.titleId ? t(definition.titleId) : accessPoint.sourceProvider;
}

export function formatAccessPointSubtitle(accessPoint: AccessPoint, t: MessageFormatter): string {
  if (accessPoint.subtitle) return accessPoint.subtitle;
  const definition = getAccessPointKindDefinition(accessPoint.kind);
  return definition.subtitleId ? t(definition.subtitleId) : "";
}

export function formatAccessPointPrompt(
  accessPoint: AccessPoint,
  scopeName: string,
  t: MessageFormatter,
): string {
  if (accessPoint.prompt) return accessPoint.prompt;
  const definition = getAccessPointKindDefinition(accessPoint.kind);
  if (!definition.promptId) return t("cloud.access.surface.generic.prompt");
  return accessPoint.kind === "cli"
    ? t(definition.promptId, { scope: bidiIsolate(scopeName) })
    : t(definition.promptId);
}

export function formatAccessPointCommandLabel(command: AccessPointCommand, t: MessageFormatter): string {
  return t(`cloud.access.command.${command.id}`);
}

export function formatAccessPointAggregate(
  code: "error" | "syncing" | "active" | "mixed" | "paused",
  t: MessageFormatter,
): string {
  return t(`cloud.access.aggregate.${code}`);
}
