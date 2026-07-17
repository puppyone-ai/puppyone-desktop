import {
  createCloudMcpEndpoint,
  createCloudScope,
  type DesktopCloudMcpEndpoint,
  type DesktopCloudRepositoryView,
  type DesktopCloudSession,
} from "../../../../lib/cloudApi";
import {
  getCliAccessRowId,
  getGitAccessRowId,
  type CreateAccessIntent,
  type OptionalAccessProvider,
} from "./createAccessModel";
import { repositoryScopeView } from "../../repositoryTarget";

type CreateAccessFlowInput = {
  projectId: string;
  cloudSession: DesktopCloudSession;
  apiBaseUrl: string | null;
  path: string;
  name: string;
  mode: "r" | "rw";
  existingScope: DesktopCloudRepositoryView | null;
  optionalProvidersToCreate: OptionalAccessProvider[];
  intent: CreateAccessIntent;
  existingMcpEndpoints: DesktopCloudMcpEndpoint[];
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
};

export type CreateAccessFlowResult = {
  scope: DesktopCloudRepositoryView;
  preferredRowId: string;
};

export async function createDesktopCloudAccess({
  projectId,
  cloudSession,
  apiBaseUrl,
  path,
  name,
  mode,
  existingScope,
  optionalProvidersToCreate,
  intent,
  existingMcpEndpoints,
  onCloudSessionChange,
}: CreateAccessFlowInput): Promise<CreateAccessFlowResult> {
  const scope = existingScope ?? repositoryScopeView(
    await createCloudScope(
      cloudSession,
      projectId,
      {
        name,
        path,
        max_mode: mode,
        exclude: [],
      },
      onCloudSessionChange,
      apiBaseUrl,
    ),
  );

  const createdMcpEndpoints = await Promise.all(optionalProvidersToCreate.map((provider) => {
    if (provider !== "mcp") return Promise.resolve(null);
    return createCloudMcpEndpoint(
      cloudSession,
      {
        project_id: projectId,
        path: scope.path,
        name: "MCP Server",
        accesses: [{ path: scope.path, json_path: "", readonly: scope.max_mode !== "rw" }],
      },
      onCloudSessionChange,
      apiBaseUrl,
    );
  }));

  return {
    scope,
    preferredRowId: getPreferredCreatedAccessRowId({
      scope,
      intent,
      createdMcpEndpoint: createdMcpEndpoints.find((endpoint): endpoint is DesktopCloudMcpEndpoint => Boolean(endpoint)) ?? null,
      existingMcpEndpoint: existingMcpEndpoints[0] ?? null,
    }),
  };
}

function getPreferredCreatedAccessRowId({
  scope,
  intent,
  createdMcpEndpoint,
  existingMcpEndpoint,
}: {
  scope: DesktopCloudRepositoryView;
  intent: CreateAccessIntent;
  createdMcpEndpoint: DesktopCloudMcpEndpoint | null;
  existingMcpEndpoint: DesktopCloudMcpEndpoint | null;
}) {
  if (intent === "git_remote") return getGitAccessRowId(scope);
  if (intent === "cli") return getCliAccessRowId(scope);
  if (intent === "remote_workspace") return getCliAccessRowId(scope);
  const mcpEndpoint = createdMcpEndpoint ?? existingMcpEndpoint;
  return mcpEndpoint ? `${scope.id}:mcp:${mcpEndpoint.id}` : getCliAccessRowId(scope);
}
