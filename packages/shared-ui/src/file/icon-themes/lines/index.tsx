import type { ReactNode } from "react";
import type {
  FileIconPreviewContext,
  FileIconRenderContext,
} from "../iconThemeTypes";
import { createThemeVariant } from "../themeFactory";
import { renderCenteredIcon } from "../shared/PreviewShell";
import { defaultTheme } from "../default";

function renderStandaloneLinesGlyph({
  color,
  size,
}: FileIconRenderContext): ReactNode {
  return <StandaloneDocumentLinesGlyph size={size} color={color} />;
}

function renderStandaloneLinesPreview(
  context: FileIconPreviewContext,
): ReactNode {
  return renderCenteredIcon(
    context.size,
    <StandaloneDocumentLinesGlyph
      size={Math.round(context.size * 0.62)}
      color={context.color}
    />,
  );
}

function StandaloneDocumentLinesGlyph({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3.7 5.8h10.6M3.7 9h10.6M3.7 12.2h7.2" stroke={color} strokeWidth="1.7" strokeLinecap="round" opacity="0.92" />
    </svg>
  );
}

export const linesTheme = createThemeVariant({
  id: "lines",
  base: defaultTheme,
  glyphOverrides: {
    markdown: renderStandaloneLinesGlyph,
  },
  previewOverrides: {
    markdown: renderStandaloneLinesPreview,
  },
});
