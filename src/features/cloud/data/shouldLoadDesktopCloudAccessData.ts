import type { DesktopView } from "../../../components/DesktopCloudShell";

/** Access/Automation top-level views are Cloud-only; Local Files must not eager-fetch Access. */
export function shouldLoadDesktopCloudAccessData({
  workspaceKind,
  activeView,
}: {
  workspaceKind: "local" | "cloud";
  activeView: DesktopView;
}): boolean {
  return workspaceKind === "cloud" && (activeView === "access" || activeView === "automation");
}
