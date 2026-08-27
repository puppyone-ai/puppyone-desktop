import type { CloudWorkspaceSection } from "../../types";
import type { AccessPointCatalogKind } from "../model";

const ACCESS_POINT_ROUTE_KINDS: Partial<Record<CloudWorkspaceSection, AccessPointCatalogKind>> = {
  access: "all",
  cli: "cli",
  "git-sync": "git",
  mcp: "mcp",
};

export function getAccessPointCatalogKindForSection(
  section: CloudWorkspaceSection,
): AccessPointCatalogKind | null {
  return ACCESS_POINT_ROUTE_KINDS[section] ?? null;
}
