import { useId, type ReactNode } from "react";
import { SourceControlSectionHeader } from "../components";
import { GitSectionCollapse } from "./GitSidebarPrimitives";

/** Shared visual and disclosure contract for local Git status sections. */
export function GitStatusCardSection({
  title,
  count,
  context,
  contextIcon,
  contextVariant = "status",
  expanded,
  action,
  children,
  onToggle,
  showHeader = true,
}: {
  title: string;
  count: number;
  context: string;
  contextIcon?: ReactNode;
  contextVariant?: "status" | "group";
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
          <span className={`desktop-git-status-card-context${contextVariant === "group" ? " is-group-label" : ""}`}>
            {contextIcon && (
              <span
                className="desktop-git-status-card-context-icon desktop-git-identity-icon-slot"
                aria-hidden="true"
              >
                {contextIcon}
              </span>
            )}
            <span className="desktop-git-status-card-context-copy">{context}</span>
          </span>
          {action}
        </div>
        {children}
      </GitSectionCollapse>
    </>
  );
}
