import type { CSSProperties } from "react";

export type MarkdownHeadingScale = "compact" | "default" | "large";
export type MarkdownStrongColor = "default" | "accent" | "warm";
export type MarkdownStrongWeight = "medium" | "semibold" | "bold" | "heavy";

export type MarkdownPresentationSettings = Readonly<{
  headingScale: MarkdownHeadingScale;
  strongColor: MarkdownStrongColor;
  strongWeight: MarkdownStrongWeight;
}>;

export const DEFAULT_MARKDOWN_PRESENTATION_SETTINGS: MarkdownPresentationSettings = {
  headingScale: "default",
  strongColor: "default",
  strongWeight: "semibold",
};

export const MARKDOWN_HEADING_SCALE_OPTIONS = [
  { id: "compact" as const, labelKey: "settings.editor.markdownPresentation.scale.compact.label" },
  { id: "default" as const, labelKey: "settings.editor.markdownPresentation.scale.default.label" },
  { id: "large" as const, labelKey: "settings.editor.markdownPresentation.scale.large.label" },
] satisfies readonly { id: MarkdownHeadingScale; labelKey: string }[];

export const MARKDOWN_STRONG_COLOR_OPTIONS = [
  {
    id: "default" as const,
    labelKey: "settings.editor.markdownPresentation.strongColor.default.label",
    descriptionKey: "settings.editor.markdownPresentation.strongColor.default.description",
  },
  {
    id: "accent" as const,
    labelKey: "settings.editor.markdownPresentation.strongColor.accent.label",
    descriptionKey: "settings.editor.markdownPresentation.strongColor.accent.description",
  },
  {
    id: "warm" as const,
    labelKey: "settings.editor.markdownPresentation.strongColor.warm.label",
    descriptionKey: "settings.editor.markdownPresentation.strongColor.warm.description",
  },
] satisfies readonly {
  id: MarkdownStrongColor;
  labelKey: string;
  descriptionKey: string;
}[];

export const MARKDOWN_STRONG_WEIGHT_OPTIONS = [
  { id: "medium" as const, labelKey: "settings.editor.markdownPresentation.strongWeight.medium.label" },
  { id: "semibold" as const, labelKey: "settings.editor.markdownPresentation.strongWeight.semibold.label" },
  { id: "bold" as const, labelKey: "settings.editor.markdownPresentation.strongWeight.bold.label" },
  { id: "heavy" as const, labelKey: "settings.editor.markdownPresentation.strongWeight.heavy.label" },
] satisfies readonly { id: MarkdownStrongWeight; labelKey: string }[];

const MARKDOWN_HEADING_SIZE: Record<
  MarkdownHeadingScale,
  Readonly<{ h1: string; h2: string; h3: string }>
> = {
  compact: { h1: "1.75em", h2: "1.375em", h3: "1.125em" },
  default: { h1: "2em", h2: "1.5em", h3: "1.25em" },
  large: { h1: "2.25em", h2: "1.625em", h3: "1.375em" },
};

const MARKDOWN_STRONG_WEIGHT: Record<MarkdownStrongWeight, string> = {
  medium: "550",
  semibold: "600",
  bold: "650",
  heavy: "700",
};

const MARKDOWN_STRONG_COLOR: Record<MarkdownStrongColor, string> = {
  default: "var(--po-text)",
  accent: "var(--po-accent)",
  warm: "color-mix(in srgb, #c45c26 78%, var(--po-text))",
};

export function isMarkdownHeadingScale(value: string | null | undefined): value is MarkdownHeadingScale {
  return value === "compact" || value === "default" || value === "large";
}

export function isMarkdownStrongColor(value: string | null | undefined): value is MarkdownStrongColor {
  return value === "default" || value === "accent" || value === "warm";
}

export function isMarkdownStrongWeight(value: string | null | undefined): value is MarkdownStrongWeight {
  return value === "medium" || value === "semibold" || value === "bold" || value === "heavy";
}

export function parseMarkdownPresentationSettings(
  value: string | null | undefined,
): MarkdownPresentationSettings {
  if (!value) return DEFAULT_MARKDOWN_PRESENTATION_SETTINGS;

  if (isMarkdownStrongColor(value)) {
    return { ...DEFAULT_MARKDOWN_PRESENTATION_SETTINGS, strongColor: value };
  }

  try {
    const parsed = JSON.parse(value) as (
      Partial<MarkdownPresentationSettings>
      & Partial<LegacyMarkdownPresentationSettings>
    ) | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_MARKDOWN_PRESENTATION_SETTINGS;
    return {
      headingScale: isMarkdownHeadingScale(parsed.headingScale)
        ? parsed.headingScale
        : resolveLegacyHeadingScale(parsed),
      strongColor: isMarkdownStrongColor(parsed.strongColor)
        ? parsed.strongColor
        : DEFAULT_MARKDOWN_PRESENTATION_SETTINGS.strongColor,
      strongWeight: isMarkdownStrongWeight(parsed.strongWeight)
        ? parsed.strongWeight
        : DEFAULT_MARKDOWN_PRESENTATION_SETTINGS.strongWeight,
    };
  } catch {
    return DEFAULT_MARKDOWN_PRESENTATION_SETTINGS;
  }
}

export function serializeMarkdownPresentationSettings(
  settings: MarkdownPresentationSettings,
): string {
  return JSON.stringify(settings);
}

export function resolveMarkdownPresentationStyle(
  settings: MarkdownPresentationSettings,
): CSSProperties {
  const headingSize = MARKDOWN_HEADING_SIZE[settings.headingScale];
  return {
    "--po-md-h1-size": headingSize.h1,
    "--po-md-h2-size": headingSize.h2,
    "--po-md-h3-size": headingSize.h3,
    "--po-md-strong-weight": MARKDOWN_STRONG_WEIGHT[settings.strongWeight],
    "--po-md-strong-color": MARKDOWN_STRONG_COLOR[settings.strongColor],
  } as CSSProperties;
}

type LegacyMarkdownPresentationSettings = Readonly<{
  h1Scale: MarkdownHeadingScale;
  h2Scale: MarkdownHeadingScale;
  h3Scale: MarkdownHeadingScale;
}>;

function resolveLegacyHeadingScale(
  settings: Partial<LegacyMarkdownPresentationSettings>,
): MarkdownHeadingScale {
  const legacyScales = [settings.h1Scale, settings.h2Scale, settings.h3Scale]
    .filter(isMarkdownHeadingScale);
  if (legacyScales.length === 0) return DEFAULT_MARKDOWN_PRESENTATION_SETTINGS.headingScale;

  const firstScale = legacyScales[0];
  return legacyScales.every((scale) => scale === firstScale)
    ? firstScale
    : DEFAULT_MARKDOWN_PRESENTATION_SETTINGS.headingScale;
}
