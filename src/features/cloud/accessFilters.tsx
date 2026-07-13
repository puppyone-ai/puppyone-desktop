import type { ReactNode } from "react";
import { GitBranch, Server, SquareTerminal } from "lucide-react";
import type { MessageFormatter } from "@puppyone/localization/core";

export type CloudAccessFilter = "all" | "cli" | "git" | "mcp";
export type CloudAccessIconComponent = (props: { size?: number; className?: string }) => ReactNode;

export type CloudAccessFilterDescriptor = {
  id: CloudAccessFilter;
  labelId: string;
  titleId: string;
  descriptionId: string;
  emptyTitleId: string;
  emptyDetailId: string;
  icon: CloudAccessIconComponent;
};

export const CLOUD_ACCESS_FILTERS: CloudAccessFilterDescriptor[] = [
  {
    id: "all",
    labelId: "cloud.access.filter.all.label",
    titleId: "cloud.access.filter.all.title",
    descriptionId: "cloud.access.filter.all.description",
    emptyTitleId: "cloud.access.filter.all.emptyTitle",
    emptyDetailId: "cloud.access.filter.all.emptyDetail",
    icon: AccessChainIcon,
  },
  {
    id: "cli",
    labelId: "cloud.access.filter.cli.label",
    titleId: "cloud.access.filter.cli.title",
    descriptionId: "cloud.access.filter.cli.description",
    emptyTitleId: "cloud.access.filter.cli.emptyTitle",
    emptyDetailId: "cloud.access.filter.cli.emptyDetail",
    icon: SquareTerminal,
  },
  {
    id: "git",
    labelId: "cloud.access.filter.git.label",
    titleId: "cloud.access.filter.git.title",
    descriptionId: "cloud.access.filter.git.description",
    emptyTitleId: "cloud.access.filter.git.emptyTitle",
    emptyDetailId: "cloud.access.filter.git.emptyDetail",
    icon: GitBranch,
  },
  {
    id: "mcp",
    labelId: "cloud.access.filter.mcp.label",
    titleId: "cloud.access.filter.mcp.title",
    descriptionId: "cloud.access.filter.mcp.description",
    emptyTitleId: "cloud.access.filter.mcp.emptyTitle",
    emptyDetailId: "cloud.access.filter.mcp.emptyDetail",
    icon: Server,
  },
];

export const CLOUD_ACCESS_BUILTIN_FILTERS = CLOUD_ACCESS_FILTERS.filter((item) => (
  item.id === "cli" || item.id === "git" || item.id === "mcp"
));

export function getCloudAccessFilterDescriptor(filter: CloudAccessFilter): CloudAccessFilterDescriptor {
  return CLOUD_ACCESS_FILTERS.find((item) => item.id === filter) ?? CLOUD_ACCESS_FILTERS[0];
}

export function getCloudAccessFilterPresentation(filter: CloudAccessFilter, t: MessageFormatter) {
  const descriptor = getCloudAccessFilterDescriptor(filter);
  return {
    ...descriptor,
    label: t(descriptor.labelId),
    title: t(descriptor.titleId),
    description: t(descriptor.descriptionId),
    emptyTitle: t(descriptor.emptyTitleId),
    emptyDetail: t(descriptor.emptyDetailId),
  };
}

export function AccessChainIcon({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
