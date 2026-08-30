import {
  appendWorkspaceContentChange,
  type WorkbenchWorkspace,
  type WorkspaceContentChange,
} from "@puppyone/shared-ui";

export type WorkbenchWorkspaceMutation = Readonly<{
  workspaceFolderId: string | null;
  paths: readonly string[] | string | null;
}>;

/**
 * Maps one provider-local filesystem notification into the window's canonical
 * Workbench mutation journal. Missing Folder identity degrades to a global
 * refresh so an event can be over-broad, but can never alias another root.
 */
export function appendWorkbenchWorkspaceContentChange(
  current: WorkspaceContentChange,
  workbench: WorkbenchWorkspace | null,
  mutation: WorkbenchWorkspaceMutation,
): WorkspaceContentChange {
  const folder = mutation.workspaceFolderId
    ? workbench?.folders.find((candidate) => candidate.id === mutation.workspaceFolderId) ?? null
    : null;
  const scoped = Boolean(mutation.workspaceFolderId && folder);
  return appendWorkspaceContentChange(current, {
    rootUri: scoped ? folder!.uri : null,
    // Never route an unscoped provider path through the legacy primary-Folder
    // fallback. Unknown or detached ownership becomes a safe global refresh.
    paths: scoped ? mutation.paths : null,
  });
}
