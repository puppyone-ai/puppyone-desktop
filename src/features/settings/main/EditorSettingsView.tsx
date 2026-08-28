import { useLocalization } from "@puppyone/localization";
import {
  MARKDOWN_HEADING_SCALE_OPTIONS,
  MARKDOWN_STRONG_COLOR_OPTIONS,
  MARKDOWN_STRONG_WEIGHT_OPTIONS,
  type MarkdownHeadingScale,
  type MarkdownPresentationSettings,
} from "../../markdown/markdownPresentation";
import { SettingsSectionHeader, SettingsSubsection } from "../components";

export function EditorSettingsView({
  markdownPresentation,
  onMarkdownPresentationChange,
}: {
  markdownPresentation: MarkdownPresentationSettings;
  onMarkdownPresentationChange: (settings: MarkdownPresentationSettings) => void;
}) {
  const { t } = useLocalization();
  const updatePresentation = (patch: Partial<MarkdownPresentationSettings>) => {
    onMarkdownPresentationChange({ ...markdownPresentation, ...patch });
  };

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body" data-po-scrollbar="content">
        <div className="desktop-settings-section">
          <SettingsSectionHeader title={t("settings.editor.title")} detail={t("settings.editor.detail")} />
          <div className="desktop-settings-list">
            <SettingsSubsection title={t("settings.editor.markdownPresentation.title")}>
              <HeadingScaleRow
                label={t("settings.editor.markdownPresentation.h1.title")}
                detail={t("settings.editor.markdownPresentation.h1.detail")}
                ariaLabel={t("settings.editor.markdownPresentation.h1.ariaLabel")}
                value={markdownPresentation.h1Scale}
                onChange={(h1Scale) => updatePresentation({ h1Scale })}
              />
              <HeadingScaleRow
                label={t("settings.editor.markdownPresentation.h2.title")}
                detail={t("settings.editor.markdownPresentation.h2.detail")}
                ariaLabel={t("settings.editor.markdownPresentation.h2.ariaLabel")}
                value={markdownPresentation.h2Scale}
                onChange={(h2Scale) => updatePresentation({ h2Scale })}
              />
              <HeadingScaleRow
                label={t("settings.editor.markdownPresentation.h3.title")}
                detail={t("settings.editor.markdownPresentation.h3.detail")}
                ariaLabel={t("settings.editor.markdownPresentation.h3.ariaLabel")}
                value={markdownPresentation.h3Scale}
                onChange={(h3Scale) => updatePresentation({ h3Scale })}
              />
              <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
                <span title={t("settings.editor.markdownPresentation.strongColor.detail")}>
                  {t("settings.editor.markdownPresentation.strongColor.title")}
                </span>
                <SegmentedControl
                  ariaLabel={t("settings.editor.markdownPresentation.strongColor.ariaLabel")}
                  options={MARKDOWN_STRONG_COLOR_OPTIONS.map((option) => ({
                    id: option.id,
                    label: t(option.labelKey),
                    title: t(option.descriptionKey),
                  }))}
                  value={markdownPresentation.strongColor}
                  onChange={(strongColor) => updatePresentation({ strongColor })}
                />
              </div>
              <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
                <span title={t("settings.editor.markdownPresentation.strongWeight.detail")}>
                  {t("settings.editor.markdownPresentation.strongWeight.title")}
                </span>
                <SegmentedControl
                  ariaLabel={t("settings.editor.markdownPresentation.strongWeight.ariaLabel")}
                  options={MARKDOWN_STRONG_WEIGHT_OPTIONS.map((option) => ({
                    id: option.id,
                    label: t(option.labelKey),
                  }))}
                  value={markdownPresentation.strongWeight}
                  onChange={(strongWeight) => updatePresentation({ strongWeight })}
                />
              </div>
              <MarkdownPresentationPreview />
            </SettingsSubsection>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeadingScaleRow({
  label,
  detail,
  ariaLabel,
  value,
  onChange,
}: {
  label: string;
  detail: string;
  ariaLabel: string;
  value: MarkdownHeadingScale;
  onChange: (value: MarkdownHeadingScale) => void;
}) {
  const { t } = useLocalization();
  return (
    <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
      <span title={detail}>{label}</span>
      <SegmentedControl
        ariaLabel={ariaLabel}
        options={MARKDOWN_HEADING_SCALE_OPTIONS.map((option) => ({
          id: option.id,
          label: t(option.labelKey),
        }))}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function SegmentedControl<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: readonly { id: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="desktop-theme-segment desktop-appearance-option-segment desktop-appearance-hug-segment"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={value === option.id ? "active" : ""}
          title={option.title}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function MarkdownPresentationPreview() {
  const { t } = useLocalization();
  return (
    <div
      className="desktop-markdown-presentation-preview"
      aria-label={t("settings.editor.markdownPresentation.preview.ariaLabel")}
    >
      <p className="desktop-markdown-presentation-preview__heading desktop-markdown-presentation-preview__h1">
        {t("settings.editor.markdownPresentation.preview.h1")}
      </p>
      <p className="desktop-markdown-presentation-preview__heading desktop-markdown-presentation-preview__h2">
        {t("settings.editor.markdownPresentation.preview.h2")}
      </p>
      <p className="desktop-markdown-presentation-preview__heading desktop-markdown-presentation-preview__h3">
        {t("settings.editor.markdownPresentation.preview.h3")}
      </p>
      <p className="desktop-markdown-presentation-preview__body">
        {t("settings.editor.markdownPresentation.preview.lead")}{" "}
        <strong>{t("settings.editor.markdownPresentation.preview.strong")}</strong>
        {t("settings.editor.markdownPresentation.preview.tail")}
      </p>
    </div>
  );
}
