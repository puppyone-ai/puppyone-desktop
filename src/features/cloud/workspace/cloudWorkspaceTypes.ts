import type {
  DesktopCloudProjectReadiness,
  DesktopCloudWorkspaceBinding,
} from "../../../lib/cloudApi";

export type CloudWorkspaceBindingState =
  | { status: "local-only" }
  | { status: "binding-resolving"; bindingId: string | null }
  | {
      status: "bound-full" | "bound-scoped" | "ready" | "git-not-created" | "git-awaiting-first-push";
      projectId: string;
      binding?: DesktopCloudWorkspaceBinding;
      readiness?: DesktopCloudProjectReadiness | null;
    }
  | { status: "legacy-confirmation-required"; projectId: string; scopeId: string; bindingKind: "full" | "scoped" }
  | { status: "identified-but-forbidden"; projectId: string | null; message: string }
  | { status: "binding-revoked"; projectId: string | null }
  | { status: "wrong-account"; projectId: string | null }
  | { status: "wrong-host"; expectedOrigin: string }
  | { status: "offline"; projectId: string | null; message: string }
  | { status: "error"; projectId: string | null; message: string };
