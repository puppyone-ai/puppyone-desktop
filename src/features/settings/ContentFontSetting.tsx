import type { TypographyPreferences } from "../../preferences";
import {
  getFontCatalogEntries,
  resolveTypography,
  useTypographyCatalog,
  withTypographyFont,
} from "../typography";

const CONTENT_FONT_PREVIEW = "Knowledge, notes, and ideas · 知识、笔记与思考";

export function ContentFontSetting({
  preferences,
  onChange,
}: {
  preferences: TypographyPreferences;
  onChange: (preferences: TypographyPreferences) => void;
}) {
  const fontCatalog = useTypographyCatalog();
  const contentFonts = getFontCatalogEntries("content", fontCatalog);
  const resolvedContentFont = resolveTypography(preferences, fontCatalog).content;

  return (
    <div className="desktop-settings-row desktop-settings-row-control desktop-content-font-row">
      <div className="desktop-content-font-copy">
        <span className="desktop-content-font-label">Content font</span>
        <output
          className="desktop-content-font-preview"
          style={{ fontFamily: resolvedContentFont.family }}
          aria-label={`${resolvedContentFont.label} content font preview`}
          data-font-id={resolvedContentFont.id}
        >
          <span className="desktop-content-font-preview-glyph" aria-hidden="true">Aa</span>
          <span className="desktop-content-font-preview-text" aria-hidden="true">
            {CONTENT_FONT_PREVIEW}
          </span>
        </output>
      </div>
      <div className="desktop-theme-segment desktop-content-font-segment" aria-label="Content font">
        {contentFonts.map((font) => (
          <button
            key={font.id}
            className={preferences.contentFontId === font.id ? "active" : ""}
            type="button"
            aria-label={`Use ${font.label} for content`}
            aria-pressed={preferences.contentFontId === font.id}
            onClick={() => onChange(withTypographyFont(preferences, "content", font.id))}
          >
            <span style={{ fontFamily: font.family }}>{font.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
