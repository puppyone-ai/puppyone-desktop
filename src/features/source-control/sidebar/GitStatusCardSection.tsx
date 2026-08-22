import { useId, type ReactNode } from "react";
import { SourceControlSectionHeader } from "../components";
import { GitSectionCollapse } from "./GitSidebarPrimitives";

/** Shared visual and disclosure contract for local Git status sections. */
export function GitStatusCardSection({
  title,
  count,
  context,
  expanded,
  action,
  children,
  onToggle,
  showHeader = true,
}: {
  title: string;
  count: number;
  context: string;
  expanded: boolean;
  action?: ReactNode;
  children: ReactNode;
  onToggle: () => void;
  showHeader?: boolean;
}) {
  const bodyId = useId();

  return (
    <>
      {showHeader && (
        <SourceControlSectionHeader
          title={title}
          count={count}
          showCount={false}
          controlsId={bodyId}
          expanded={expanded}
          onToggle={onToggle}
        />
      )}
      <GitSectionCollapse
        id={showHeader ? bodyId : undefined}
        expanded={expanded}
        className="desktop-git-status-card"
        ariaLabel={showHeader ? undefined : title}
      >
        <div className="desktop-git-status-card-context-row">
          <span className="desktop-git-status-card-context">{context}</span>
          {action}
        </div>
        {children}
      </GitSectionCollapse>
    </>
  );
}
