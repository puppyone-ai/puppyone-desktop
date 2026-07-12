import { ArrowRight } from "lucide-react";
import { getCloudProviderIconUrl, providerIcon } from "../cloud/utils";
import type { AutomationTemplate } from "./automationTemplates";

export function AutomationTemplateCard({
  template,
  actionLabel = "Add",
  status,
  statusTone = "neutral",
  selected = false,
  onAdd,
}: {
  template: AutomationTemplate;
  actionLabel?: string;
  status?: string | null;
  statusTone?: "neutral" | "ready" | "required" | "error";
  selected?: boolean;
  onAdd: () => void;
}) {
  const ProviderIcon = providerIcon(template.provider);
  const iconUrl = template.iconUrl || getCloudProviderIconUrl(template.provider);

  return (
    <article className={`desktop-cloud-automation-template-card ${selected ? "selected" : ""}`}>
      <div className="desktop-cloud-automation-template-card-topline">
        <div
          className="desktop-cloud-automation-template-route"
          aria-label={`${template.sourceLabel} to PuppyOne project folder`}
        >
          <span className="desktop-cloud-automation-template-mark source">
            {iconUrl ? <img src={iconUrl} alt="" /> : <ProviderIcon size={17} />}
          </span>
          <span className="desktop-cloud-automation-template-connector" aria-hidden="true">
            <span />
            <ArrowRight size={12} strokeWidth={1.8} />
          </span>
          <span className="desktop-cloud-automation-template-mark target">
            <img src="/icons/folder.svg" alt="" />
          </span>
        </div>
        {status && <span className={`desktop-cloud-automation-template-status ${statusTone}`}>{status}</span>}
      </div>
      <h2>{template.title}</h2>
      <p>{template.description}</p>
      <button
        type="button"
        className="desktop-cloud-automation-template-add"
        aria-pressed={selected || undefined}
        onClick={onAdd}
      >
        {selected ? "Selected" : actionLabel}
      </button>
    </article>
  );
}
