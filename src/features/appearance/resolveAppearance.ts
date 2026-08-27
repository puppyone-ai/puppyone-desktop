import type { FileIconThemeId } from "@puppyone/shared-ui";
import {
  getSidebarNavigationOrientation,
  getSidebarNavigationPlacement,
  resolveActiveThemeMode,
  type SidebarNavigationLayout,
  type SidebarNavigationOrientation,
  type SidebarNavigationPlacement,
  type TextSize,
  type ThemeMode,
} from "../../preferences";
import {
  getInterfaceStyleDefinition,
  type InterfaceStyle,
} from "./interfaceStyles";

export type AppearanceSettingStatus = "editable" | "constrained" | "forced" | "unavailable";
export type AppearanceDecisionSource =
  | "accessibility"
  | "platform"
  | "style-surface"
  | "style"
  | "user"
  | "default";

export type AppearanceSettingDecision<T> = Readonly<{
  requestedValue: T;
  effectiveValue: T;
  status: AppearanceSettingStatus;
  source: AppearanceDecisionSource;
  reasonKey?: string;
  allowedValues?: readonly T[];
}>;

export type AppearancePolicy<T extends string> =
  | Readonly<{ mode: "inherit" }>
  | Readonly<{ mode: "allow"; values: readonly T[]; default?: T }>
  | Readonly<{ mode: "force"; value: T; reasonKey: string }>
  | Readonly<{ mode: "unavailable"; reasonKey: string }>;

export type AppearanceResolutionInput = Readonly<{
  interfaceStyle: InterfaceStyle;
  themeMode: ThemeMode;
  sidebarNavigationLayout: SidebarNavigationLayout;
  textSize: TextSize;
  fileIconTheme: FileIconThemeId;
}>;

export type ResolvedAppearance = Readonly<{
  interfaceStyle: InterfaceStyle;
  profile: ReturnType<typeof getInterfaceStyleDefinition>["profile"];
  tokenSet: string;
  composition: ReturnType<typeof getInterfaceStyleDefinition>["composition"];
  decisions: Readonly<{
    themeMode: AppearanceSettingDecision<ThemeMode>;
    sidebarNavigationLayout: AppearanceSettingDecision<SidebarNavigationLayout>;
    textSize: AppearanceSettingDecision<TextSize>;
    fileIconTheme: AppearanceSettingDecision<FileIconThemeId>;
  }>;
  themeMode: ThemeMode;
  sidebarNavigationLayout: SidebarNavigationLayout;
  sidebarNavigationPlacement: SidebarNavigationPlacement;
  sidebarNavigationOrientation: SidebarNavigationOrientation;
  textSize: TextSize;
  fileIconTheme: FileIconThemeId;
}>;

export function resolveAppearance(input: AppearanceResolutionInput): ResolvedAppearance {
  const profile = getInterfaceStyleDefinition(input.interfaceStyle);
  const themeMode = resolveSetting(
    input.themeMode,
    profile.policies.themeMode as AppearancePolicy<ThemeMode>,
    resolveActiveThemeMode(input.interfaceStyle, input.themeMode),
  );
  const sidebarNavigationLayout = resolveSetting(
    input.sidebarNavigationLayout,
    profile.policies.sidebarNavigationLayout as AppearancePolicy<SidebarNavigationLayout>,
    input.sidebarNavigationLayout,
  );
  const textSize = resolveSetting(
    input.textSize,
    profile.policies.textSize as AppearancePolicy<TextSize>,
    input.textSize,
  );
  const fileIconTheme = resolveSetting(
    input.fileIconTheme,
    profile.policies.fileIconTheme as AppearancePolicy<FileIconThemeId>,
    input.fileIconTheme,
  );
  return Object.freeze({
    interfaceStyle: input.interfaceStyle,
    profile: profile.profile,
    tokenSet: profile.tokenSet,
    composition: profile.composition,
    decisions: Object.freeze({
      themeMode,
      sidebarNavigationLayout,
      textSize,
      fileIconTheme,
    }),
    themeMode: themeMode.effectiveValue,
    sidebarNavigationLayout: sidebarNavigationLayout.effectiveValue,
    sidebarNavigationPlacement: getSidebarNavigationPlacement(sidebarNavigationLayout.effectiveValue),
    sidebarNavigationOrientation: getSidebarNavigationOrientation(sidebarNavigationLayout.effectiveValue),
    textSize: textSize.effectiveValue,
    fileIconTheme: fileIconTheme.effectiveValue,
  });
}

export function resolveSetting<T extends string>(
  requestedValue: T,
  policy: AppearancePolicy<T>,
  inheritedValue: T,
): AppearanceSettingDecision<T> {
  if (policy.mode === "force") {
    return Object.freeze({
      requestedValue,
      effectiveValue: policy.value,
      status: "forced",
      source: "style",
      reasonKey: policy.reasonKey,
    });
  }
  if (policy.mode === "allow") {
    const allowed = policy.values.includes(requestedValue);
    return Object.freeze({
      requestedValue,
      effectiveValue: allowed ? requestedValue : (policy.default ?? policy.values[0] ?? inheritedValue),
      status: allowed ? "editable" : "constrained",
      source: allowed ? "user" : "style",
      allowedValues: Object.freeze([...policy.values]),
    });
  }
  if (policy.mode === "unavailable") {
    return Object.freeze({
      requestedValue,
      effectiveValue: inheritedValue,
      status: "unavailable",
      source: "style",
      reasonKey: policy.reasonKey,
    });
  }
  return Object.freeze({
    requestedValue,
    effectiveValue: inheritedValue,
    status: "editable",
    source: "user",
  });
}

export function isAppearanceDecisionLocked<T>(decision: AppearanceSettingDecision<T>): boolean {
  return decision.status === "forced" || decision.status === "unavailable";
}

export function isAppearanceValueAllowed<T>(
  decision: AppearanceSettingDecision<T>,
  value: T,
): boolean {
  return decision.allowedValues?.includes(value) ?? true;
}
