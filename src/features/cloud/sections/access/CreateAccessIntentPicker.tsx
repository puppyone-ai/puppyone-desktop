import { DesktopCloudProviderIcon } from "./accessProviders";
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
  return (
    <section className="desktop-cloud-create-access-intent">
      <div className="desktop-cloud-create-access-intent-header">
        <div>
          <span>Start with the job</span>
          <strong>What are you trying to do?</strong>
        </div>
        <small>This helps pick the right way in.</small>
      </div>
      <div className="desktop-cloud-create-access-intent-grid">
        {CREATE_ACCESS_INTENT_OPTIONS.map((option) => {
          const active = value === option.id;
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
                <span>{option.label}</span>
              </span>
              <span className={`desktop-cloud-create-access-intent-preview ${option.preview.includes("://") ? "mono" : ""}`}>
                {option.preview}
              </span>
              <span className="desktop-cloud-create-access-chip-list">
                {option.chips.map((chip) => <span key={chip}>{chip}</span>)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
