export const FEATURE_FLAG_DEFAULTS = {
  cloudWorkspace: true,
  cloudOnlyWorkspace: false,
  assetLibraryHome: false,
  desktopAgentChat: false,
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAG_DEFAULTS;
export type FeatureFlags = Record<FeatureFlagKey, boolean>;
