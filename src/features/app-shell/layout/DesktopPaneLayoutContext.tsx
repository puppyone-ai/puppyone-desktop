import { createContext, useContext } from "react";
import type { ResolvedDesktopPaneLayout } from "./desktopPaneLayout";

const DesktopPaneLayoutContext = createContext<ResolvedDesktopPaneLayout | null>(null);

export const DesktopPaneLayoutProvider = DesktopPaneLayoutContext.Provider;

export function useDesktopPaneLayout() {
  return useContext(DesktopPaneLayoutContext);
}
