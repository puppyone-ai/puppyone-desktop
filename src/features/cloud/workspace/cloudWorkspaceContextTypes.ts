import type { DesktopCloudProjectReadiness } from "../../../lib/cloudApi";
import type { CloudMessageDescriptor } from "../cloudPresentation";
import type { RepositoryTarget } from "../repositoryTarget";

export type CloudWorkspaceContextState =
  | { status: "local-only" }
  | { status: "resolving" }
  | {
      status: "resolved" | "ready" | "git-not-created" | "git-awaiting-first-push";
      projectId: string;
      target?: RepositoryTarget;
      readiness?: DesktopCloudProjectReadiness | null;
    }
  | { status: "identified-but-forbidden"; projectId: string | null; message: CloudMessageDescriptor }
  | { status: "wrong-account"; projectId: string | null }
  | { status: "wrong-host"; expectedOrigin: string }
  | { status: "offline"; projectId: string | null; message: CloudMessageDescriptor }
  | { status: "error"; projectId: string | null; message: CloudMessageDescriptor };
