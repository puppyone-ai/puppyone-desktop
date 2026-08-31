import { useLocalization } from "@puppyone/localization";
import {
  TEXT_SIZE_PRESETS,
  type TextSize,
  type TypographyPreferences,
} from "../../../preferences";
import {
  isAppearanceDecisionLocked,
  isAppearanceValueAllowed,
  type AppearanceSettingDecision,
} from "../../appearance/resolveAppearance";
import { MarkdownFontSetting } from "../MarkdownFontSetting";
import { SettingsSectionHeader, SettingsSubsection } from "../components";

export function EditorSettingsView({
  textSizeDecision,
  typographyPreferences,
  markdownThemeId,
  onTextSizeChange,
  onTypographyPreferencesChange,
}: {
  textSizeDecision: AppearanceSettingDecision<TextSize>;
  typographyPreferences: TypographyPreferences;
  markdownThemeId: string;
  onTextSizeChange: (textSize: TextSize) => void;
  onTypographyPreferencesChange: (preferences: TypographyPreferences) => void;
}) {
  const { t } = useLocalization();
  const textSizeLocked = isAppearanceDecisionLocked(textSizeDecision);

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body" data-po-scrollbar="content">
        <div className="desktop-settings-section">
          <SettingsSectionHeader title={t("settings.editor.title")} detail={t("settings.editor.detail")} />
          <div className="desktop-settings-list">
            <SettingsSubsection title={t("settings.editor.typography.title")}>
              <MarkdownFontSetting
                preferences={typographyPreferences}
                onChange={onTypographyPreferencesChange}
              />
              <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
                <span>{t("settings.editor.typography.contentSize.title")}</span>
                <div
                  className="desktop-theme-segment desktop-appearance-option-segment desktop-appearance-hug-segment"
                  aria-label={t("settings.editor.typography.contentSize.ariaLabel")}
                >
                  {TEXT_SIZE_PRESETS.map((option) => (
                    <button
                      key={option.value}
                      className={`${textSizeDecision.effectiveValue === option.value ? "active" : ""}${textSizeLocked || !isAppearanceValueAllowed(textSizeDecision, option.value) ? " is-policy-controlled" : ""}`}
                      type="button"
                      title={textSizeDecision.reasonKey
                        ? t(textSizeDecision.reasonKey)
                        : t(`settings.editor.typography.contentSize.${option.value}.description`)}
                      aria-disabled={textSizeLocked || !isAppearanceValueAllowed(textSizeDecision, option.value)}
                      aria-pressed={textSizeDecision.effectiveValue === option.value}
                      onClick={() => {
                        if (!textSizeLocked && isAppearanceValueAllowed(textSizeDecision, option.value)) {
                          onTextSizeChange(option.value);
                        }
                      }}
                    >
                      <span>{t(`settings.editor.typography.contentSize.${option.value}.label`)}</span>
                    </button>
                  ))}
                </div>
                {textSizeDecision.reasonKey && (
                  <small className="desktop-appearance-policy-reason">{t(textSizeDecision.reasonKey)}</small>
                )}
              </div>
              <section
                className="desktop-editor-typography-preview markdown-codemirror-editor"
                aria-label={t("settings.editor.typography.preview.ariaLabel")}
                data-po-theme-surface="markdown"
                data-po-theme-id={markdownThemeId}
                data-po-typography-role="content"
              >
                <div className="cm-md-html-rendered-surface" role="document" lang="en">
                  <h1>{t("settings.editor.typography.preview.headingOne")}</h1>
                  <h2>{t("settings.editor.typography.preview.headingTwo")}</h2>
                  <h3>{t("settings.editor.typography.preview.headingThree")}</h3>
                  <p className="desktop-editor-typography-preview-body">
                    <span>
                      {t("settings.editor.typography.preview.body")}{" "}
                      <strong>{t("settings.editor.typography.preview.bold")}</strong>.
                    </span>
                  </p>
                </div>
              </section>
            </SettingsSubsection>
          </div>
        </div>
      </div>
    </section>
  );
}
