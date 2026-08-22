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
}: {
  title: string;
  count: number;
  context: string;
  expanded: boolean;
  action?: ReactNode;
  children: ReactNode;
  onToggle: () => void;
}) {
  const bodyId = useId();

  return (
    <>
      <SourceControlSectionHeader
        title={title}
        count={count}
        showCount={false}
        controlsId={bodyId}
        expanded={expanded}
        onToggle={onToggle}
      />
      <GitSectionCollapse id={bodyId} expanded={expanded} className="desktop-git-status-card">
        <div className="desktop-git-status-card-context-row">
          <span className="desktop-git-status-card-context">{context}</span>
          {action}
        </div>
        {children}
      </GitSectionCollapse>
    </>
  );
}
