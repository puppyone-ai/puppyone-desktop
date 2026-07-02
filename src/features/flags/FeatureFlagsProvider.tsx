import { createContext, type ReactNode } from "react";
import { resolveFeatureFlags } from "./resolveFlags";
import type { FeatureFlags } from "./registry";

export const FeatureFlagsContext = createContext<FeatureFlags>(resolveFeatureFlags());

export function FeatureFlagsProvider({
  children,
  value = resolveFeatureFlags(),
}: {
  children: ReactNode;
  value?: FeatureFlags;
}) {
  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}
