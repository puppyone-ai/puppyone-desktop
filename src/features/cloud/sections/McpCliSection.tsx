import { GitBranch, Server, SquareTerminal } from "lucide-react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { DesktopCloudMcpEndpoint, DesktopCloudRepoIdentity, DesktopCloudScope } from "../../../lib/cloudApi";
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
import { getApiBaseFromGitUrl, getCanonicalScopeGitUrl, getScopeDisplayName, getScopeIdentifierName, profileSlug, shellQuote } from "../utils";

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
  scopes: DesktopCloudScope[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  loading: boolean;
  onOpenProject: (projectId: string, section?: CloudWorkspaceSection) => void;
}) {
  const { t } = useLocalization();
  const rootScope = scopes.find((scope) => scope.is_root) ?? scopes[0] ?? null;
  const apiBase = identity?.url ? getApiBaseFromGitUrl(identity.url) : "";
  const gitUrl = getCanonicalScopeGitUrl(identity, rootScope, apiBase);
  const scopeName = rootScope ? getScopeDisplayName(rootScope, t) : t("cloud.scope.workspaceRoot");
  const scopeIdentifier = rootScope ? getScopeIdentifierName(rootScope) : "root";
  const profileName = profileSlug(scopeIdentifier);
  const cliCommand = rootScope?.access_key && apiBase
    ? `printf '%s' ${shellQuote(rootScope.access_key)} | puppyone ap login ${shellQuote(profileName)} --api-url ${shellQuote(apiBase)} --access-key-stdin`
    : "";

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
          {!rootScope?.access_key && (
            <div className="desktop-cloud-method-warning">
              {t("cloud.access.noCliKeyWarning")}
            </div>
          )}
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
