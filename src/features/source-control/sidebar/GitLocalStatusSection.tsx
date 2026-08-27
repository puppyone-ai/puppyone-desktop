import { useId, type ReactNode } from "react";
import { SourceControlSectionHeader } from "../components";
import { GitSectionCollapse } from "./GitSidebarPrimitives";

/** Shared flat disclosure contract for local Git status sections. */
export function GitLocalStatusSection({
  title,
  count,
  showCount = true,
  expanded,
  action,
  children,
  onToggle,
}: {
  title: string;
  count: number;
  showCount?: boolean;
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
        showCount={showCount}
        controlsId={bodyId}
        expanded={expanded}
        onToggle={onToggle}
        action={action}
      />
      <GitSectionCollapse
        id={bodyId}
        expanded={expanded}
        className="desktop-git-local-section-body"
      >
        {children}
      </GitSectionCollapse>
    </>
  );
}
