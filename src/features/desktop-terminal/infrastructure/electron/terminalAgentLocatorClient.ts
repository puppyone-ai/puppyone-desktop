export function locateTerminalAgents(refresh: boolean, requestId: string): Promise<unknown> {
  const locate = window.puppyoneDesktop?.locateTerminalAgents;
  if (!locate) return Promise.reject(new Error("Terminal Agent locator is unavailable."));
  return locate({ refresh, requestId });
}

export function subscribeToTerminalAgentLocationProgress(
  callback: (event: unknown) => void,
): () => void {
  const subscribe = window.puppyoneDesktop?.onTerminalAgentLocationProgress;
  return typeof subscribe === "function" ? subscribe(callback) : () => {};
}
