import { useId, type ReactNode } from "react";
import type { GitSidebarLayout } from "../../../preferences";
import { SourceControlSectionHeader } from "../components";
import { GitSectionCollapse } from "./GitSidebarPrimitives";

/** Shared visual and disclosure contract for local Git status sections. */
export function GitStatusCardSection({
  title,
  count,
  context,
  contextIcon,
  contextVariant = "status",
  layout,
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
  layout: GitSidebarLayout;
  expanded: boolean;
  action?: ReactNode;
  children: ReactNode;
  onToggle: () => void;
  showHeader?: boolean;
}) {
  const bodyId = useId();
  const separateIdentity = layout === "dividers" && contextVariant === "group";
  const contextContent = (
    <span className={`desktop-git-status-card-context${contextVariant === "group" && !separateIdentity ? " is-group-label" : ""}`}>
      {contextIcon && !separateIdentity && (
        <span
          className="desktop-git-status-card-context-icon desktop-git-identity-icon-slot"
          aria-hidden="true"
        >
          {contextIcon}
        </span>
      )}
      <span className="desktop-git-status-card-context-copy">{context}</span>
    </span>
  );

  return (
    <>
      {(showHeader || separateIdentity) && (
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
        id={showHeader || separateIdentity ? bodyId : undefined}
        expanded={expanded}
        className={`desktop-git-status-card${separateIdentity ? " is-divider-layout" : ""}`}
        ariaLabel={showHeader || separateIdentity ? undefined : title}
      >
        <div className="desktop-git-status-card-context-row">
          {contextContent}
          {action}
        </div>
        {children}
      </GitSectionCollapse>
    </>
  );
}
