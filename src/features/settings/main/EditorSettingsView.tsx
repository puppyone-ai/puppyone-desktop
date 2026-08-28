import { MarkdownPresentationPreview } from "@puppyone/shared-ui/markdown-presentation-preview";
import { useLocalization } from "@puppyone/localization";
import { useId } from "react";
import {
  MARKDOWN_HEADING_SCALE_OPTIONS,
  MARKDOWN_STRONG_COLOR_OPTIONS,
  MARKDOWN_STRONG_WEIGHT_OPTIONS,
  resolveMarkdownPresentationStyle,
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
  const previewValue = [
    `# ${t("settings.editor.markdownPresentation.preview.h1")}`,
    `## ${t("settings.editor.markdownPresentation.preview.h2")}`,
    `### ${t("settings.editor.markdownPresentation.preview.h3")}`,
    `${t("settings.editor.markdownPresentation.preview.lead")} **${t("settings.editor.markdownPresentation.preview.strong")}**${t("settings.editor.markdownPresentation.preview.tail")}`,
  ].join("\n\n");

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body" data-po-scrollbar="content">
        <div className="desktop-settings-section">
          <SettingsSectionHeader title={t("settings.editor.title")} detail={t("settings.editor.detail")} />
          <div className="desktop-settings-list">
            <SettingsSubsection title={t("settings.editor.markdownPresentation.title")}>
              <div className="desktop-markdown-presentation-layout">
                <div className="desktop-markdown-presentation-controls">
                  <PresentationSettingRow
                    label={t("settings.editor.markdownPresentation.headingScale.title")}
                    detail={t("settings.editor.markdownPresentation.headingScale.detail")}
                    ariaLabel={t("settings.editor.markdownPresentation.headingScale.ariaLabel")}
                    options={MARKDOWN_HEADING_SCALE_OPTIONS.map((option) => ({
                      id: option.id,
                      label: t(option.labelKey),
                    }))}
                    value={markdownPresentation.headingScale}
                    onChange={(headingScale) => updatePresentation({ headingScale })}
                  />
                  <PresentationSettingRow
                    label={t("settings.editor.markdownPresentation.strongColor.title")}
                    detail={t("settings.editor.markdownPresentation.strongColor.detail")}
                    ariaLabel={t("settings.editor.markdownPresentation.strongColor.ariaLabel")}
                    options={MARKDOWN_STRONG_COLOR_OPTIONS.map((option) => ({
                      id: option.id,
                      label: t(option.labelKey),
                      title: t(option.descriptionKey),
                    }))}
                    value={markdownPresentation.strongColor}
                    onChange={(strongColor) => updatePresentation({ strongColor })}
                  />
                  <PresentationSettingRow
                    label={t("settings.editor.markdownPresentation.strongWeight.title")}
                    detail={t("settings.editor.markdownPresentation.strongWeight.detail")}
                    ariaLabel={t("settings.editor.markdownPresentation.strongWeight.ariaLabel")}
                    options={MARKDOWN_STRONG_WEIGHT_OPTIONS.map((option) => ({
                      id: option.id,
                      label: t(option.labelKey),
                    }))}
                    value={markdownPresentation.strongWeight}
                    onChange={(strongWeight) => updatePresentation({ strongWeight })}
                  />
                </div>
                <MarkdownPresentationPreview
                  ariaLabel={t("settings.editor.markdownPresentation.preview.ariaLabel")}
                  value={previewValue}
                  style={resolveMarkdownPresentationStyle(markdownPresentation)}
                />
              </div>
            </SettingsSubsection>
          </div>
        </div>
      </div>
    </section>
  );
}

function PresentationSettingRow<T extends string>({
  label,
  detail,
  ariaLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  detail: string;
  ariaLabel: string;
  options: readonly { id: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const detailId = useId();
  return (
    <div className="desktop-markdown-presentation-setting">
      <div className="desktop-markdown-presentation-setting__copy">
        <span>{label}</span>
        <small id={detailId}>{detail}</small>
      </div>
      <SegmentedControl
        ariaLabel={ariaLabel}
        describedBy={detailId}
        options={options}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

function SegmentedControl<T extends string>({
  ariaLabel,
  describedBy,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  describedBy: string;
  options: readonly { id: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="desktop-theme-segment desktop-appearance-option-segment desktop-markdown-presentation-segment"
      role="group"
      aria-label={ariaLabel}
      aria-describedby={describedBy}
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
