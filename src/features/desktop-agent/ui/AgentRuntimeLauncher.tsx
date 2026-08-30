import { CircleAlert, History, RefreshCw } from "lucide-react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { AgentRuntimeCatalogEntry, AgentSessionListItem } from "../domain/agent-contract";
import { isSelectableAgentBackend } from "../domain/agent-backend-routing";
import { AgentBrandMark } from "./AgentBrandMark";
import { AgentConversationHistory } from "./AgentConversationHistory";

type AgentRuntimeLauncherProps = {
  agentRuntimes: AgentRuntimeCatalogEntry[];
  onLaunch: (runtimeId: string) => void;
  onRefresh: () => void;
  historyOpen: boolean;
  historySessions: readonly AgentSessionListItem[];
  historyLoading: boolean;
  historyRefreshing: boolean;
  historyLoadingMore: boolean;
  historyHasMore: boolean;
  historyError: string | null;
  onShowHistory: () => void;
  onHideHistory: () => void;
  onOpenSession: (session: AgentSessionListItem) => void;
  onRefreshHistory: () => void;
  onLoadMoreHistory: () => void;
};

/** Pre-Chat launch surface. Choosing a row establishes the harness boundary. */
export function AgentRuntimeLauncher({
  agentRuntimes,
  onLaunch,
  onRefresh,
  historyOpen,
  historySessions,
  historyLoading,
  historyRefreshing,
  historyLoadingMore,
  historyHasMore,
  historyError,
  onShowHistory,
  onHideHistory,
  onOpenSession,
  onRefreshHistory,
  onLoadMoreHistory,
}: AgentRuntimeLauncherProps) {
  const { t } = useLocalization();

  return (
    <section
      className={`desktop-agent-runtime-launcher${historyOpen ? " is-history" : ""}`}
      aria-labelledby={historyOpen ? "desktop-agent-history-title" : "desktop-agent-runtime-launcher-title"}
      aria-describedby={historyOpen ? undefined : "desktop-agent-runtime-launcher-description"}
    >
      {historyOpen ? (
        <AgentConversationHistory
          sessions={historySessions}
          runtimes={agentRuntimes}
          loading={historyLoading}
          refreshing={historyRefreshing}
          loadingMore={historyLoadingMore}
          hasMore={historyHasMore}
          error={historyError}
          onOpen={onOpenSession}
          onRefresh={onRefreshHistory}
          onLoadMore={onLoadMoreHistory}
          onBack={onHideHistory}
        />
      ) : (
        <div className="desktop-agent-runtime-launcher-content">
          <div className="desktop-agent-runtime-launcher-group">
            <header className="desktop-agent-runtime-launcher-heading">
              <h2 id="desktop-agent-runtime-launcher-title">
                <span>{t("agent.launcher.title")}</span>
              </h2>
              <button
                type="button"
                className="desktop-agent-runtime-launcher-refresh"
                aria-label={t("agent.launcher.scanAgain")}
                title={t("agent.launcher.scanAgain")}
                onClick={onRefresh}
              >
                <RefreshCw size={12} strokeWidth={1.7} aria-hidden="true" />
              </button>
            </header>

            <p
              id="desktop-agent-runtime-launcher-description"
              className="desktop-agent-runtime-launcher-description"
            >
              {t("agent.launcher.description")}
            </p>

            {agentRuntimes.length > 0 ? (
              <div className="desktop-agent-runtime-launcher-list">
                {agentRuntimes.map((entry) => {
                  const ready = isSelectableAgentBackend(entry);
                  const detail = entry.readiness.message || entry.descriptor.description || "";
                  return (
                    <button
                      key={entry.descriptor.id}
                      type="button"
                      className="desktop-agent-runtime-launcher-option"
                      aria-label={entry.descriptor.displayName}
                      title={detail || entry.descriptor.displayName}
                      onClick={() => onLaunch(entry.descriptor.id)}
                    >
                      <AgentBrandMark
                        iconKey={entry.descriptor.iconKey}
                        label={entry.descriptor.displayName}
                      />
                      <span>{entry.descriptor.displayName}</span>
                      {!ready && (
                        <CircleAlert
                          className="desktop-agent-runtime-launcher-warning"
                          size={13}
                          strokeWidth={1.7}
                          aria-label={detail
                            ? t("agent.launcher.needsAttention", { agent: bidiIsolate(entry.descriptor.displayName) })
                            : undefined}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="desktop-agent-runtime-launcher-empty" role="status">
                {t("agent.launcher.noneAvailable")}
              </div>
            )}
          </div>
          <button
            type="button"
            className="desktop-agent-runtime-launcher-history"
            aria-label={t("agent.history.openAria")}
            onClick={onShowHistory}
          >
            <History size={13} strokeWidth={1.7} aria-hidden="true" />
            <span>{t("agent.history.openButton")}</span>
          </button>
        </div>
      )}
    </section>
  );
}
