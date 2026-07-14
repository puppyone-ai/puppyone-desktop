import { GitBranch, Server, SquareTerminal } from "lucide-react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { DesktopCloudMcpEndpoint, DesktopCloudRepoIdentity, DesktopCloudRepositoryView } from "../../../lib/cloudApi";
import { PageLoading } from "../../../components/loading";
import type { CloudWorkspaceSection } from "../types";
import {
  CloudCommandBlock,
  CloudMcpEndpointCard,
  CloudMethodCard,
  CloudMethodSection,
  CloudPromptBlock,
  CloudWebEmpty,
  CloudWebPage,
} from "../components/shared";
import { getApiBaseFromGitUrl, getCanonicalGitUrlForView, getScopeDisplayName, getScopeIdentifierName, profileSlug, shellQuote } from "../utils";

export function CloudMcpCliSection({
  projectId,
  identity,
  scopes,
  mcpEndpoints,
  loading,
  onOpenProject,
}: {
  projectId: string;
  identity: DesktopCloudRepoIdentity | null;
  scopes: DesktopCloudRepositoryView[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  loading: boolean;
  onOpenProject: (projectId: string, section?: CloudWorkspaceSection) => void;
}) {
  const { t } = useLocalization();
  const projectRootView = scopes.find((scope) => scope.target.kind === "project_root") ?? null;
  const apiBase = identity?.url ? getApiBaseFromGitUrl(identity.url) : "";
  const gitUrl = getCanonicalGitUrlForView(identity, projectRootView, apiBase);
  const scopeName = projectRootView ? getScopeDisplayName(projectRootView, t) : t("cloud.scope.workspaceRoot");
  const scopeIdentifier = projectRootView ? getScopeIdentifierName(projectRootView) : "root";
  const profileName = profileSlug(scopeIdentifier);
  const cliCommand = "";

  return (
    <CloudWebPage
      title={t("cloud.route.mcp-cli.title")}
      count={t(loading ? "cloud.common.loading" : "cloud.status.ready")}
      action={<button className="desktop-cloud-row-action" type="button" onClick={() => onOpenProject(projectId, "mcp-cli")}>{t("cloud.access.open")}</button>}
    >
      {loading ? (
        <PageLoading variant="fill" label={t("cloud.common.loading")} className="desktop-cloud-web-loading" />
      ) : (
        <div className="desktop-cloud-method-page">
          <div className="desktop-cloud-method-warning">
            {t("cloud.access.noCliKeyWarning")}
          </div>
          <CloudMethodSection title={t("cloud.access.surface.cli.title")}>
            <CloudMethodCard icon={SquareTerminal} subtitle={t("cloud.access.surface.cli.subtitle")} active={Boolean(cliCommand)}>
              <CloudPromptBlock
                value={t("cloud.access.surface.cli.longPrompt", { scope: bidiIsolate(scopeName) })}
              />
              <CloudCommandBlock
                label={t("cloud.access.command.login")}
                value={cliCommand || t("cloud.access.regenerateRootKey")}
                disabled={!cliCommand}
              />
              <CloudCommandBlock
                label={t("cloud.access.command.explore")}
                value={`puppyone fs tree / --profile ${shellQuote(profileName)}\npuppyone fs ls / --profile ${shellQuote(profileName)}`}
                disabled={!cliCommand}
              />
            </CloudMethodCard>
          </CloudMethodSection>
          <CloudMethodSection title={t("cloud.access.surface.git.title")}>
            <CloudMethodCard icon={GitBranch} subtitle={t("cloud.access.surface.git.subtitle")} active={Boolean(gitUrl)}>
              <CloudPromptBlock
                value={t("cloud.access.surface.git.longPrompt")}
              />
              <CloudCommandBlock
                label={t("cloud.access.command.existing-folder")}
                value={`git remote add puppyone ${gitUrl || "<git-url>"}\ngit fetch puppyone`}
                disabled={!gitUrl}
              />
              <CloudCommandBlock
                label={t("cloud.access.command.clone")}
                value={`git clone ${gitUrl || "<git-url>"} ${shellQuote(scopeIdentifier)}`}
                disabled={!gitUrl}
              />
            </CloudMethodCard>
          </CloudMethodSection>
          <CloudMethodSection title={t("cloud.access.filter.mcp.label")}>
            {mcpEndpoints.length === 0 ? (
              <CloudWebEmpty icon={Server} title={t("cloud.access.mcp.noneYet")} detail={t("cloud.access.mcp.noneYetDetail")} />
            ) : (
              <div className="desktop-cloud-method-endpoint-list">
                {mcpEndpoints.map((endpoint) => (
                  <CloudMcpEndpointCard
                    key={endpoint.id}
                    endpoint={endpoint}
                    apiBase={apiBase}
                    onOpen={() => onOpenProject(projectId, "mcp-cli")}
                  />
                ))}
              </div>
            )}
          </CloudMethodSection>
        </div>
      )}
    </CloudWebPage>
  );
}
