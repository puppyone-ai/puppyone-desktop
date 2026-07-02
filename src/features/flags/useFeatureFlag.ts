import { useContext } from "react";
import { FeatureFlagsContext } from "./FeatureFlagsProvider";
import type { FeatureFlagKey } from "./registry";

export function useFeatureFlag(key: FeatureFlagKey): boolean {
  return useContext(FeatureFlagsContext)[key];
}
