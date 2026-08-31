import type { TypographyPreferences } from "../../preferences";
import { bidiIsolate, useLocalization } from "@puppyone/localization";
import {
  createCatalogFontFamily,
  getFontCatalogEntries,
  THEME_CONTENT_FONT_ID,
  useTypographyCatalog,
  withTypographyFont,
} from "../typography";

export function MarkdownFontSetting({
  preferences,
  onChange,
}: {
  preferences: TypographyPreferences;
  onChange: (preferences: TypographyPreferences) => void;
}) {
  const { t } = useLocalization();
  const fontCatalog = useTypographyCatalog();
  const markdownFonts = getFontCatalogEntries("content", fontCatalog);

  return (
    <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
      <span>{t("settings.editor.typography.textFont.title")}</span>
      <div
        className="desktop-theme-segment desktop-markdown-font-segment"
        aria-label={t("settings.editor.typography.textFont.ariaLabel")}
      >
        <button
          className={preferences.contentFontId === THEME_CONTENT_FONT_ID ? "active" : ""}
          type="button"
          aria-label={t("settings.editor.typography.textFont.theme.use")}
          aria-pressed={preferences.contentFontId === THEME_CONTENT_FONT_ID}
          onClick={() => onChange(withTypographyFont(preferences, "content", THEME_CONTENT_FONT_ID))}
        >
          <span>{t("settings.editor.typography.textFont.theme.label")}</span>
        </button>
        {markdownFonts.map((font) => (
          <button
            key={font.id}
            className={preferences.contentFontId === font.id ? "active" : ""}
            type="button"
            aria-label={t("settings.editor.typography.textFont.use", { font: bidiIsolate(font.label) })}
            aria-pressed={preferences.contentFontId === font.id}
            onClick={() => onChange(withTypographyFont(preferences, "content", font.id))}
          >
            <span style={{ fontFamily: createCatalogFontFamily(font) }}>{font.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
