import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { dispatchTypographyChange } from "@puppyone/shared-ui";
import {
  BUILTIN_FONT_CATALOG,
  resolveTypography,
  type FontCatalogEntry,
  type ResolvedTypography,
  type TypographyPreferences,
} from "./fontCatalog";

type TypographyCustomProperties = CSSProperties & {
  "--po-font-ui": string;
  "--po-font-content": string;
  "--po-font-code": string;
  "--po-font-terminal": string;
};

export type TypographyRootProps = {
  "data-font-ui": string;
  "data-font-content": string;
  "data-font-code": string;
  "data-font-terminal": string;
  style: TypographyCustomProperties;
};

export function useTypographyRuntime(
  preferences: TypographyPreferences,
  catalog: readonly FontCatalogEntry[] = BUILTIN_FONT_CATALOG,
) {
  const resolved = useMemo(
    () => resolveTypography(preferences, catalog),
    [catalog, preferences],
  );
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let cancelled = false;
    let appliedFrame: number | null = requestAnimationFrame(() => {
      appliedFrame = null;
      if (!cancelled) dispatchTypographyChange(document, { generation, phase: "applied" });
    });

    const families = new Set([
      resolved.ui.family,
      resolved.content.family,
      resolved.code.family,
      resolved.terminal.family,
    ]);
    const fontsReady = document.fonts
      ? Promise.allSettled([...families].map((family) => document.fonts.load(`16px ${family}`)))
        .then(() => document.fonts.ready)
      : Promise.resolve();
    void fontsReady.then(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (!cancelled) dispatchTypographyChange(document, { generation, phase: "ready" });
      });
    });

    return () => {
      cancelled = true;
      if (appliedFrame !== null) cancelAnimationFrame(appliedFrame);
    };
  }, [
    resolved.code.family,
    resolved.code.id,
    resolved.content.family,
    resolved.content.id,
    resolved.ui.family,
    resolved.ui.id,
    resolved.terminal.family,
    resolved.terminal.id,
  ]);

  return resolved;
}

export function createTypographyRootProps(resolved: ResolvedTypography): TypographyRootProps {
  return {
    "data-font-ui": resolved.ui.id,
    "data-font-content": resolved.content.id,
    "data-font-code": resolved.code.id,
    "data-font-terminal": resolved.terminal.id,
    style: {
      "--po-font-ui": resolved.ui.family,
      "--po-font-content": resolved.content.family,
      "--po-font-code": resolved.code.family,
      "--po-font-terminal": resolved.terminal.family,
    },
  };
}

export function applyTypographyToElement(element: HTMLElement, resolved: ResolvedTypography) {
  element.dataset.fontUi = resolved.ui.id;
  element.dataset.fontContent = resolved.content.id;
  element.dataset.fontCode = resolved.code.id;
  element.dataset.fontTerminal = resolved.terminal.id;
  element.style.setProperty("--po-font-ui", resolved.ui.family);
  element.style.setProperty("--po-font-content", resolved.content.family);
  element.style.setProperty("--po-font-code", resolved.code.family);
  element.style.setProperty("--po-font-terminal", resolved.terminal.family);
}
