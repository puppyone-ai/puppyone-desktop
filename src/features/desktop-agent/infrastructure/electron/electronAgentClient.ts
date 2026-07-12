import type { AgentClientPort, AgentClientProvider } from "../../application/AgentClientPort";

/** The only Agent feature module that reads the Electron window bridge. */
export const getElectronAgentClient: AgentClientProvider = () => (
  window.puppyoneDesktop as AgentClientPort | undefined
);

export function getElectronFilePath(file: File) {
  return window.puppyoneDesktop?.getPathForFile?.(file) || null;
}
