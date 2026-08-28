import type { CSSProperties } from "react";

export type MarkdownHeadingScale = "compact" | "default" | "large";
export type MarkdownStrongColor = "default" | "accent" | "warm";
export type MarkdownStrongWeight = "medium" | "semibold" | "bold" | "heavy";

export type MarkdownPresentationSettings = Readonly<{
  h1Scale: MarkdownHeadingScale;
  h2Scale: MarkdownHeadingScale;
  h3Scale: MarkdownHeadingScale;
  strongColor: MarkdownStrongColor;
  strongWeight: MarkdownStrongWeight;
}>;

export const DEFAULT_MARKDOWN_PRESENTATION_SETTINGS: MarkdownPresentationSettings = {
  h1Scale: "default",
  h2Scale: "default",
  h3Scale: "default",
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

const MARKDOWN_H1_SIZE: Record<MarkdownHeadingScale, string> = {
  compact: "1.75em",
  default: "2em",
  large: "2.25em",
};

const MARKDOWN_H2_SIZE: Record<MarkdownHeadingScale, string> = {
  compact: "1.375em",
  default: "1.5em",
  large: "1.625em",
};

const MARKDOWN_H3_SIZE: Record<MarkdownHeadingScale, string> = {
  compact: "1.125em",
  default: "1.25em",
  large: "1.375em",
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
    const parsed = JSON.parse(value) as Partial<MarkdownPresentationSettings> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_MARKDOWN_PRESENTATION_SETTINGS;
    return {
      h1Scale: isMarkdownHeadingScale(parsed.h1Scale) ? parsed.h1Scale : DEFAULT_MARKDOWN_PRESENTATION_SETTINGS.h1Scale,
      h2Scale: isMarkdownHeadingScale(parsed.h2Scale) ? parsed.h2Scale : DEFAULT_MARKDOWN_PRESENTATION_SETTINGS.h2Scale,
      h3Scale: isMarkdownHeadingScale(parsed.h3Scale) ? parsed.h3Scale : DEFAULT_MARKDOWN_PRESENTATION_SETTINGS.h3Scale,
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
  return {
    "--po-md-h1-size": MARKDOWN_H1_SIZE[settings.h1Scale],
    "--po-md-h2-size": MARKDOWN_H2_SIZE[settings.h2Scale],
    "--po-md-h3-size": MARKDOWN_H3_SIZE[settings.h3Scale],
    "--po-md-strong-weight": MARKDOWN_STRONG_WEIGHT[settings.strongWeight],
    "--po-md-strong-color": MARKDOWN_STRONG_COLOR[settings.strongColor],
  } as CSSProperties;
}
