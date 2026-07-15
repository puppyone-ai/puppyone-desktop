export type ProjectRootRepositoryTarget = {
  kind: "project_root";
  project_id: string;
};

export type ScopeRepositoryTarget = {
  kind: "scope";
  project_id: string;
  scope_id: string;
};

export type RepositoryTarget = ProjectRootRepositoryTarget | ScopeRepositoryTarget;

export function projectRootTarget(projectId: string): ProjectRootRepositoryTarget {
  return { kind: "project_root", project_id: projectId };
}

export function projectRootRepositoryView(projectId: string) {
  return {
    id: projectId,
    target: projectRootTarget(projectId),
    project_id: projectId,
    name: "Project repository",
    path: "",
    exclude: [] as string[],
    max_mode: "rw" as const,
  };
}

export function repositoryScopeView<T extends {
  id: string;
  project_id: string;
  name: string;
  path: string;
  exclude: string[];
  max_mode: "r" | "rw";
}>(scope: T) {
  return {
    ...scope,
    target: {
      kind: "scope" as const,
      project_id: scope.project_id,
      scope_id: scope.id,
    },
  };
}

export function repositoryTargetKey(target: RepositoryTarget): string {
  return target.kind === "project_root"
    ? `project:${target.project_id}`
    : `scope:${target.scope_id}`;
}

export function sameRepositoryTarget(
  left: RepositoryTarget | null | undefined,
  right: RepositoryTarget | null | undefined,
): boolean {
  return Boolean(
    left
    && right
    && left.project_id === right.project_id
    && repositoryTargetKey(left) === repositoryTargetKey(right),
  );
}

export function repositoryTargetMatchesRemote(
  target: RepositoryTarget,
  remote: { kind: "project" | "scope" | "access-point"; projectId?: string; scopeId?: string },
): boolean {
  if (remote.kind === "access-point" || !remote.projectId) return false;
  if (target.project_id !== remote.projectId) return false;
  return remote.kind === "project"
    ? target.kind === "project_root"
    : target.kind === "scope" && target.scope_id === remote.scopeId;
}
