import {
  bidiIsolate,
  type LocaleFormatters,
  type MessageFormatter,
} from "@puppyone/localization/core";
import type {
  AutomationTriggerDraft,
  AutomationTriggerPreset,
  AutomationValidationError,
} from "./automationRequest";
import type { AutomationCatalogCategory, AutomationTemplate } from "./automationTemplates";

export function formatAutomationValidationError(
  error: AutomationValidationError | null,
  t: MessageFormatter,
): string | null {
  if (!error) return null;
  if (error.code === "cron-field") {
    return t("automation.validation.cronField", { field: error.field });
  }
  return t(`automation.validation.${error.code}`);
}

export function formatAutomationTriggerPreset(
  preset: AutomationTriggerPreset,
  t: MessageFormatter,
): string {
  return t(`automation.trigger.preset.${preset}`);
}

export function formatAutomationWeekday(weekday: string | number, t: MessageFormatter): string {
  const normalized = String(weekday);
  return /^[0-6]$/.test(normalized)
    ? t(`automation.weekday.${normalized}`)
    : t("automation.weekday.generic");
}

export function formatAutomationTriggerSummary(
  draft: AutomationTriggerDraft,
  t: MessageFormatter,
): string {
  const timezone = bidiIsolate(draft.timezone || "UTC");
  if (draft.preset === "manual") return t("automation.trigger.summary.manual");
  if (draft.preset === "realtime") return t("automation.trigger.summary.realtime");
  if (draft.preset === "hourly") return t("automation.trigger.summary.hourly", { timezone });
  if (draft.preset === "daily") {
    return t("automation.trigger.summary.daily", {
      time: bidiIsolate(draft.time),
      timezone,
    });
  }
  if (draft.preset === "weekly") {
    return t("automation.trigger.summary.weekly", {
      weekday: formatAutomationWeekday(draft.weekday, t),
      time: bidiIsolate(draft.time),
      timezone,
    });
  }
  return t("automation.trigger.summary.custom", {
    schedule: bidiIsolate(draft.customCron.trim() || t("automation.trigger.customSchedule")),
    timezone,
  });
}

export function formatAutomationNextRun(
  date: Date | null,
  timezone: string,
  formatters: Pick<LocaleFormatters, "formatDate">,
): string | null {
  if (!date) return null;
  return formatters.formatDate(date, {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAutomationCategory(
  category: AutomationCatalogCategory,
  t: MessageFormatter,
): string {
  return t(`automation.category.${category}`);
}

export function formatAutomationTemplateTitle(
  template: AutomationTemplate,
  t: MessageFormatter,
): string {
  if (template.presentation === "catalog") return t(`automation.template.${template.id}.title`);
  return t("automation.template.generic.title", { source: bidiIsolate(template.sourceLabel) });
}

export function formatAutomationTemplateDescription(
  template: AutomationTemplate,
  t: MessageFormatter,
): string {
  if (template.presentation === "catalog") return t(`automation.template.${template.id}.description`);
  return t("automation.template.generic.description", { source: bidiIsolate(template.sourceLabel) });
}

export function formatAutomationStatus(status: string | null | undefined, t: MessageFormatter): string {
  const normalized = status?.trim().toLocaleLowerCase() || "unknown";
  if (KNOWN_AUTOMATION_STATUSES.has(normalized)) return t(`automation.status.${normalized}`);
  return t("automation.status.other", { status: bidiIsolate(status || t("automation.status.unknown")) });
}

export function formatAutomationRelativeTime(
  value: string | null | undefined,
  formatters: Pick<LocaleFormatters, "formatRelativeTime">,
): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const deltaSeconds = (timestamp - Date.now()) / 1000;
  const absoluteSeconds = Math.abs(deltaSeconds);
  const [divisor, unit]: [number, Intl.RelativeTimeFormatUnit] = absoluteSeconds < 60
    ? [1, "second"]
    : absoluteSeconds < 3_600
      ? [60, "minute"]
      : absoluteSeconds < 86_400
        ? [3_600, "hour"]
        : absoluteSeconds < 2_592_000
          ? [86_400, "day"]
          : absoluteSeconds < 31_536_000
            ? [2_592_000, "month"]
            : [31_536_000, "year"];
  return formatters.formatRelativeTime(Math.round(deltaSeconds / divisor), unit, { numeric: "auto" });
}

const KNOWN_AUTOMATION_STATUSES = new Set([
  "active",
  "blocked",
  "canceled",
  "cancelled",
  "completed",
  "connected",
  "error",
  "failed",
  "paused",
  "pending",
  "processing",
  "queued",
  "ready",
  "running",
  "success",
  "syncing",
  "warning",
]);
