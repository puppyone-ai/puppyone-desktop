import type { AccessPointCatalogKind, AccessPointRow } from "./accessPoint";

export type AccessPointStatusFilter = "all" | "active" | "inactive";

export function accessPointMatchesCatalogKind(row: AccessPointRow, kind: AccessPointCatalogKind): boolean {
  return kind === "all" || row.accessPoint.kind === kind;
}

export function selectAccessPointRows({
  rows,
  kind,
  status,
  query,
  locale,
  getSearchText,
}: {
  rows: readonly AccessPointRow[];
  kind: AccessPointCatalogKind;
  status: AccessPointStatusFilter;
  query: string;
  locale: string;
  getSearchText: (row: AccessPointRow) => string;
}): AccessPointRow[] {
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  return rows.filter((row) => {
    if (!accessPointMatchesCatalogKind(row, kind)) return false;
    const active = row.accessPoint.status.kind === "ready";
    if (status === "active" && !active) return false;
    if (status === "inactive" && active) return false;
    return !normalizedQuery || getSearchText(row).toLocaleLowerCase(locale).includes(normalizedQuery);
  });
}
