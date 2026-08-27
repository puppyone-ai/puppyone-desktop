import { CloudWebEmpty } from "../../components/shared";
import type { AccessPointCatalogDefinition } from "../presentation";

export function AccessPointEmptyState({
  definition,
  title,
  detail,
}: {
  definition: AccessPointCatalogDefinition;
  title: string;
  detail: string;
}) {
  return <CloudWebEmpty icon={definition.icon} title={title} detail={detail} />;
}
