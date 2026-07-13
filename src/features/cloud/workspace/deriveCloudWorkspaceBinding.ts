import type { getPuppyoneRemote } from "../../source-control/remotes";
import type { CloudWorkspaceBindingState } from "./cloudWorkspaceTypes";
import { cloudMessage, type CloudMessageDescriptor } from "../cloudPresentation";

export function deriveCloudWorkspaceBinding({
  cloudRemote,
  projectId,
  loading,
  error,
}: {
  cloudRemote: ReturnType<typeof getPuppyoneRemote>;
  projectId: string | null;
  loading: boolean;
  error: CloudMessageDescriptor | null;
}): CloudWorkspaceBindingState {
  if (projectId) {
    return { status: "bound-full", projectId, readiness: null };
  }
  if (cloudRemote && loading) {
    return { status: "binding-resolving", bindingId: null };
  }
  if (cloudRemote) {
    return {
      status: "error",
      projectId: null,
      message: cloudMessage("binding-unresolvable"),
    };
  }
  if (error) {
    return { status: "error", projectId: null, message: error };
  }
  return { status: "local-only" };
}
