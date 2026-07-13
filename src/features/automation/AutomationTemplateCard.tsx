import { ArrowRight } from "lucide-react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { getCloudProviderIconUrl, providerIcon } from "../cloud/utils";
import type { AutomationTemplate } from "./automationTemplates";
import {
  formatAutomationTemplateDescription,
  formatAutomationTemplateTitle,
} from "./automationPresentation";

export function AutomationTemplateCard({
  template,
  actionLabel,
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
  const { t } = useLocalization();
  const ProviderIcon = providerIcon(template.provider);
  const iconUrl = template.iconUrl || getCloudProviderIconUrl(template.provider);
  const title = formatAutomationTemplateTitle(template, t);
  const description = formatAutomationTemplateDescription(template, t);

  return (
    <article className={`desktop-cloud-automation-template-card ${selected ? "selected" : ""}`}>
      <div className="desktop-cloud-automation-template-card-topline">
        <div
          className="desktop-cloud-automation-template-route"
          aria-label={t("automation.template.route", { source: bidiIsolate(template.sourceLabel) })}
        >
          <span className="desktop-cloud-automation-template-mark source">
            {iconUrl ? <img src={iconUrl} alt="" /> : <ProviderIcon size={17} />}
          </span>
          <span className="desktop-cloud-automation-template-connector" aria-hidden="true">
            <span />
            <ArrowRight className="po-directional-icon" size={12} strokeWidth={1.8} />
          </span>
          <span className="desktop-cloud-automation-template-mark target">
            <img src="/icons/folder.svg" alt="" />
          </span>
        </div>
        {status && <span className={`desktop-cloud-automation-template-status ${statusTone}`}>{status}</span>}
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <button
        type="button"
        className="desktop-cloud-automation-template-add"
        aria-pressed={selected || undefined}
        onClick={onAdd}
      >
        {selected ? t("automation.template.selected") : actionLabel ?? t("automation.template.add")}
      </button>
    </article>
  );
}
