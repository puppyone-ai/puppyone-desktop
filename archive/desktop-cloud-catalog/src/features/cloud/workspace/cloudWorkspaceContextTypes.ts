import type { CloudMessageDescriptor } from "../cloudPresentation";
import type { RepositoryTarget } from "../repositoryTarget";

export type CloudWorkspaceContextState =
  | { status: "local-only" }
  | { status: "resolving" }
  | {
      status: "resolved";
      projectId: string;
      target?: RepositoryTarget;
    }
  | { status: "identified-but-forbidden"; projectId: string | null; message: CloudMessageDescriptor }
  | { status: "wrong-account"; projectId: string | null }
  | { status: "wrong-host"; expectedOrigin: string }
  | { status: "offline"; projectId: string | null; message: CloudMessageDescriptor }
  | { status: "error"; projectId: string | null; message: CloudMessageDescriptor };
