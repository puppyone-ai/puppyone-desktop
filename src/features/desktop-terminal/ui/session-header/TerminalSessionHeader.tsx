import { useMemo, type CSSProperties } from "react";
import { Plus } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import { DesktopMenuIconButton } from "../../../../components/DesktopMenu";
import { presentTerminalSessionHeader } from "../../model/terminalSessionHeader";
import { TERMINAL_SESSION_HEADER_METRICS } from "../../model/terminalSessionHeaderLayout";
import type { DesktopTerminalSessionSummary } from "../../model/terminalSessions";
import type { TerminalRuntimeRegistry } from "../../runtime/terminalRuntimeRegistry";
import { TerminalSessionOverflowMenu } from "./TerminalSessionOverflowMenu";
import { TerminalSessionTab } from "./TerminalSessionTab";
import { terminalPanelId, terminalTabId } from "./terminalSessionHeaderIds";
import type { TerminalSessionHeaderItem } from "./types";
import { useTerminalSessionHeaderController } from "./useTerminalSessionHeaderController";
import { useTerminalSessionHeaderLayout } from "./useTerminalSessionHeaderLayout";
import "./terminal-session-header.css";

type TerminalSessionHeaderProps = {
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onCreate: () => void;
  runtimeRegistry?: Pick<TerminalRuntimeRegistry, "require">;
  sessions: readonly DesktopTerminalSessionSummary[];
  workspacePath: string;
};

/**
 * Shared session chrome. Capacity measurement, density projection, navigation,
 * motion, tabs and overflow all terminate at this boundary.
 */
export function TerminalSessionHeader({
  activeSessionId,
  onActivate,
  onClose,
  onCreate,
  runtimeRegistry,
  sessions,
  workspacePath,
}: TerminalSessionHeaderProps) {
  const { t } = useLocalization();
  const sessionIds = useMemo(() => sessions.map(({ id }) => id), [sessions]);
  const items = useMemo<TerminalSessionHeaderItem[]>(() => sessions.map((session) => ({
    presentation: presentTerminalSessionHeader(session, workspacePath, t),
    runtime: session.status === "selecting"
      ? null
      : runtimeRegistry?.require(session.id) ?? null,
    session,
  })), [runtimeRegistry, sessions, t, workspacePath]);
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.session.id, item])),
    [items],
  );
  const sessionIndexById = useMemo(
    () => new Map(sessionIds.map((sessionId, index) => [sessionId, index])),
    [sessionIds],
  );
  const { capacityRef, layout } = useTerminalSessionHeaderLayout(
    sessionIds,
    activeSessionId,
  );
  const controller = useTerminalSessionHeaderController({
    activeSessionId,
    motionEligibleSessionIds: layout.visibleSessionIds,
    onActivate,
    sessionIds,
    tabId: terminalTabId,
  });
  const visibleItems = layout.visibleSessionIds
    .map((sessionId) => itemById.get(sessionId))
    .filter((item): item is TerminalSessionHeaderItem => Boolean(item));
  const hiddenItems = layout.hiddenSessionIds
    .map((sessionId) => itemById.get(sessionId))
    .filter((item): item is TerminalSessionHeaderItem => Boolean(item));

  return (
    <header
      className="desktop-terminal-subheader"
      data-window-no-drag="true"
      style={{
        "--desktop-terminal-header-gap": `${TERMINAL_SESSION_HEADER_METRICS.gap}px`,
        "--desktop-terminal-tab-activation-motion": `${TERMINAL_SESSION_HEADER_METRICS.activationMotionMs}ms`,
        "--desktop-terminal-tab-control-height": `${TERMINAL_SESSION_HEADER_METRICS.createControl}px`,
        "--desktop-terminal-tab-width": `${TERMINAL_SESSION_HEADER_METRICS.fullMaximum}px`,
      } as CSSProperties}
    >
      <div className="desktop-terminal-header-capacity" ref={capacityRef}>
        <div
          className="desktop-terminal-tab-rail"
          data-layout={layout.mode}
          data-activation-motion={controller.activationMotionActive ? "true" : undefined}
        >
          <div
            className="desktop-terminal-tabs"
            role="tablist"
            aria-label={t("terminal.title")}
          >
            {visibleItems.map((item) => {
              const { session } = item;
              const active = session.id === activeSessionId;
              return (
                <TerminalSessionTab
                  key={session.id}
                  item={item}
                  index={sessionIndexById.get(session.id) ?? 0}
                  active={active}
                  compact={!active && layout.mode !== "full"}
                  width={active ? layout.activeTabWidth : layout.inactiveTabWidth}
                  onActivate={controller.activate}
                  onClose={onClose}
                  onKeyDown={controller.handleKeyDown}
                  panelId={terminalPanelId}
                  tabId={terminalTabId}
                />
              );
            })}
          </div>
          {hiddenItems.length > 0 && (
            <TerminalSessionOverflowMenu
              items={hiddenItems}
              onActivate={controller.activate}
              onClose={onClose}
            />
          )}
        </div>
        <div className="desktop-terminal-subheader-new">
          <DesktopMenuIconButton
            className="desktop-terminal-new-button"
            label={t("terminal.new")}
            icon={<Plus size={14} strokeWidth={1.9} aria-hidden="true" />}
            onClick={onCreate}
          />
        </div>
      </div>
    </header>
  );
}
