import { ArrowLeftRight, LoaderCircle } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentConnectionStatus as AgentConnectionStatusModel } from "../domain/agent-projection-types";

export function AgentConnectionStatus({ status }: { status: AgentConnectionStatusModel }) {
  const { t } = useLocalization();
  const reconnecting = status.state === "reconnecting";
  const fallbackLabel = reconnecting ? t("agent.connection.reconnecting") : t("agent.connection.fallback");
  const attempt = status.attempt && status.maxAttempts
    ? ` ${status.attempt}/${status.maxAttempts}`
    : "";
  const label = status.message || `${fallbackLabel}${attempt}`;
  const Icon = reconnecting ? LoaderCircle : ArrowLeftRight;

  return (
    <div className="desktop-agent-connection-status" data-state={status.state} role="status" aria-live="polite">
      <Icon className={reconnecting ? "desktop-agent-spin" : undefined} size={12} aria-hidden="true" />
      <span dir="auto">{label}</span>
    </div>
  );
}
