import localFlags from "./flags.json";
import {
  FEATURE_FLAG_DEFAULTS,
  type FeatureFlagKey,
  type FeatureFlags,
} from "./registry";

type LocalFeatureFlags = Partial<Record<FeatureFlagKey, unknown>>;

export function resolveFeatureFlags(flags: LocalFeatureFlags = localFlags): FeatureFlags {
  return Object.fromEntries(
    Object.entries(FEATURE_FLAG_DEFAULTS).map(([key, defaultValue]) => {
      const flagKey = key as FeatureFlagKey;
      const value = flags[flagKey];
      return [flagKey, typeof value === "boolean" ? value : defaultValue];
    }),
  ) as FeatureFlags;
}
