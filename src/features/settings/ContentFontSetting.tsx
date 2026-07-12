import type { TypographyPreferences } from "../../preferences";
import {
  getFontCatalogEntries,
  useTypographyCatalog,
  withTypographyFont,
} from "../typography";

export function ContentFontSetting({
  preferences,
  onChange,
}: {
  preferences: TypographyPreferences;
  onChange: (preferences: TypographyPreferences) => void;
}) {
  const fontCatalog = useTypographyCatalog();

  return (
    <div className="desktop-settings-row desktop-settings-row-control">
      <span>Content font</span>
      <div className="desktop-theme-segment desktop-content-font-segment" aria-label="Content font">
        {getFontCatalogEntries("content", fontCatalog).map((font) => (
          <button
            key={font.id}
            className={preferences.contentFontId === font.id ? "active" : ""}
            type="button"
            title={font.description}
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
