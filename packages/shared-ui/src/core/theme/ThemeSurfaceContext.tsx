"use client";

import { createContext, useContext, type ReactNode } from "react";

export type ThemeSurfaceTarget = "application" | "markdown" | "csv";

export type ThemeSurfaceSelection = Readonly<Record<ThemeSurfaceTarget, string>>;

const DEFAULT_SELECTION: ThemeSurfaceSelection = Object.freeze({
  application: "default",
  markdown: "default",
  csv: "default",
});

const ThemeSurfaceContext = createContext<ThemeSurfaceSelection>(DEFAULT_SELECTION);

export function ThemeSurfaceProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ThemeSurfaceSelection;
}) {
  return (
    <ThemeSurfaceContext.Provider value={value}>
      {children}
    </ThemeSurfaceContext.Provider>
  );
}

export function useThemeSurfaceId(target: ThemeSurfaceTarget): string {
  return useContext(ThemeSurfaceContext)[target] || "default";
}
