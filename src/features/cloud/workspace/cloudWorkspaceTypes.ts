import type {
  DesktopCloudProjectReadiness,
  DesktopCloudWorkspaceBinding,
} from "../../../lib/cloudApi";
import type { CloudMessageDescriptor } from "../cloudPresentation";
import type { RepositoryTarget } from "../repositoryTarget";

export type CloudWorkspaceBindingState =
  | { status: "local-only" }
  | { status: "binding-resolving"; bindingId: string | null }
  | {
      status: "bound-full" | "bound-scoped" | "ready" | "git-not-created" | "git-awaiting-first-push";
      projectId: string;
      binding?: DesktopCloudWorkspaceBinding;
      readiness?: DesktopCloudProjectReadiness | null;
    }
  | { status: "legacy-confirmation-required"; projectId: string; target: RepositoryTarget }
  | { status: "identified-but-forbidden"; projectId: string | null; message: CloudMessageDescriptor }
  | { status: "binding-revoked"; projectId: string | null }
  | { status: "wrong-account"; projectId: string | null }
  | { status: "wrong-host"; expectedOrigin: string }
  | { status: "offline"; projectId: string | null; message: CloudMessageDescriptor }
  | { status: "error"; projectId: string | null; message: CloudMessageDescriptor };
