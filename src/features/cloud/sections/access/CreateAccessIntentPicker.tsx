import { DesktopCloudProviderIcon } from "./accessProviders";
import { useLocalization } from "@puppyone/localization/react";
import {
  CREATE_ACCESS_INTENT_OPTIONS,
  getCreateAccessTileProvider,
  type CreateAccessIntent,
} from "./createAccessModel";

export function CreateAccessIntentPicker({
  value,
  onChange,
}: {
  value: CreateAccessIntent;
  onChange: (value: CreateAccessIntent) => void;
}) {
  const { t } = useLocalization();
  return (
    <section className="desktop-cloud-create-access-intent">
      <div className="desktop-cloud-create-access-intent-header">
        <div>
          <span>{t("cloud.access.create.startWithJob")}</span>
          <strong>{t("cloud.access.create.intentQuestion")}</strong>
        </div>
        <small>{t("cloud.access.create.intentHelp")}</small>
      </div>
      <div className="desktop-cloud-create-access-intent-grid">
        {CREATE_ACCESS_INTENT_OPTIONS.map((option) => {
          const active = value === option.id;
          const preview = option.preview ?? t(option.previewId!);
          return (
            <button
              key={option.id}
              className={`desktop-cloud-create-access-intent-option ${active ? "active" : ""}`}
              type="button"
              onClick={() => onChange(option.id)}
            >
              <span className="desktop-cloud-create-access-intent-title">
                <span className={`desktop-cloud-create-access-provider-tile ${getCreateAccessTileProvider(option.provider)} ${active ? "active" : ""}`} aria-hidden="true">
                  <DesktopCloudProviderIcon provider={option.provider} size={option.provider === "git_remote" ? 20 : 15} />
                </span>
                <span>{t(option.labelId)}</span>
              </span>
              <span className={`desktop-cloud-create-access-intent-preview ${preview.includes("://") ? "mono" : ""}`}>
                {preview}
              </span>
              <span className="desktop-cloud-create-access-chip-list">
                {option.chipIds.map((chipId) => <span key={chipId}>{t(chipId)}</span>)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
