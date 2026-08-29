import { useRef } from "react";
import { GitBranch } from "lucide-react";
import type { Workspace } from "@puppyone/shared-ui";
import { DesktopOverlayPortal } from "./DesktopOverlayPortal";
import {
  DesktopWorkspaceSwitcher,
  type DesktopWorkspaceSwitcherItem,
} from "./DesktopWorkspaceSwitcher";
import "./workspace-menu-visual-smoke.css";

const currentWorkspace = workspace("todo", "To-Do-List", "/Users/demo/Desktop/To-Do-List");
const recentWorkspace = workspace("puppyone", "PuppyOne", "/Users/demo/Code/puppyone");
const notesWorkspace = workspace("notes", "Notes", "/Users/demo/Documents/Notes");
const fixtureBranchName = "main";

/** Deterministic browser fixture for reviewing the Workspace menu hierarchy. */
export function WorkspaceMenuVisualSmokeHarness() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const items = [
    item(currentWorkspace, "~/Desktop"),
    item(recentWorkspace, "~/Code"),
    item(notesWorkspace, "~/Documents"),
  ];

  return (
    <main className="app-shell dark workspace-menu-visual-smoke" data-workspace-menu-visual-ready="true">
      <DesktopOverlayPortal theme="dark">{null}</DesktopOverlayPortal>
      <header className="workspace-menu-visual-titlebar">
        <div className="desktop-titlebar-context">
          <DesktopWorkspaceSwitcher
            open
            refObject={anchorRef}
            titlebarLabel={currentWorkspace.name}
            workspace={currentWorkspace}
            items={items}
            onAddFolder={() => undefined}
            onClose={() => undefined}
            onOpenFolder={() => undefined}
            onGoHome={() => undefined}
            onToggle={() => undefined}
          />
          <div className="workspace-menu-visual-branch">
            <GitBranch size={14} />
            <span>{fixtureBranchName}</span>
          </div>
        </div>
      </header>
      <section className="workspace-menu-visual-body" aria-hidden="true">
        <aside />
        <div>
          <span />
          <span />
          <span />
        </div>
      </section>
    </main>
  );
}

function workspace(id: string, name: string, path: string): Workspace {
  return { id, name, path, status: "recording", workspaceInstanceId: `${id}-instance` };
}

function item(value: Workspace, detail: string): DesktopWorkspaceSwitcherItem {
  return {
    id: value.id,
    label: value.name,
    detail,
    title: `${value.name} - ${value.path}`,
    workspace: value,
  };
}
