import type { getCanonicalPuppyoneRemote } from "../../source-control/remotes";
import type { CloudWorkspaceContextState } from "./cloudWorkspaceContextTypes";
import { cloudMessage, type CloudMessageDescriptor } from "../cloudPresentation";

export function deriveCloudWorkspaceContext({
  cloudRemote,
  projectId,
  loading,
  error,
}: {
  cloudRemote: ReturnType<typeof getCanonicalPuppyoneRemote>;
  projectId: string | null;
  loading: boolean;
  error: CloudMessageDescriptor | null;
}): CloudWorkspaceContextState {
  if (projectId) return { status: "resolved", projectId };
  if (cloudRemote && loading) return { status: "resolving" };
  if (cloudRemote) {
    return { status: "error", projectId: null, message: cloudMessage("remote-unresolvable") };
  }
  if (error) return { status: "error", projectId: null, message: error };
  return { status: "local-only" };
}
