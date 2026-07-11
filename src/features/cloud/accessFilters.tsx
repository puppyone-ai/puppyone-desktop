import type { ReactNode } from "react";
import { GitBranch, Server, SquareTerminal } from "lucide-react";

export type CloudAccessFilter = "all" | "cli" | "git" | "mcp";
export type CloudAccessIconComponent = (props: { size?: number; className?: string }) => ReactNode;

export type CloudAccessFilterDescriptor = {
  id: CloudAccessFilter;
  label: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDetail: string;
  icon: CloudAccessIconComponent;
};

export const CLOUD_ACCESS_FILTERS: CloudAccessFilterDescriptor[] = [
  {
    id: "all",
    label: "All Access",
    title: "Access",
    description: "Manage Git, CLI, and MCP access for this Cloud project.",
    emptyTitle: "No access surfaces",
    emptyDetail: "Open the Cloud Access page to create a scoped key, MCP endpoint, or connector.",
    icon: AccessChainIcon,
  },
  {
    id: "cli",
    label: "Puppyone CLI",
    title: "Puppyone CLI",
    description: "Terminal access keys and commands for reading or writing this Cloud project.",
    emptyTitle: "No CLI access",
    emptyDetail: "Create or regenerate an access key before using Puppyone CLI.",
    icon: SquareTerminal,
  },
  {
    id: "git",
    label: "Git Remote",
    title: "Git Remote",
    description: "Git clone, fetch, push, and remote commands generated from Cloud access keys.",
    emptyTitle: "No Git remote access",
    emptyDetail: "Create or regenerate an access key before using this Cloud project as a Git remote.",
    icon: GitBranch,
  },
  {
    id: "mcp",
    label: "MCP Endpoints",
    title: "MCP Endpoints",
    description: "MCP server endpoints that expose scoped project data to agents and tools.",
    emptyTitle: "No MCP endpoints",
    emptyDetail: "Create an MCP endpoint in Cloud Access, then it will appear here.",
    icon: Server,
  },
];

export const CLOUD_ACCESS_BUILTIN_FILTERS = CLOUD_ACCESS_FILTERS.filter((item) => (
  item.id === "cli" || item.id === "git" || item.id === "mcp"
));

export function getCloudAccessFilterDescriptor(filter: CloudAccessFilter): CloudAccessFilterDescriptor {
  return CLOUD_ACCESS_FILTERS.find((item) => item.id === filter) ?? CLOUD_ACCESS_FILTERS[0];
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
