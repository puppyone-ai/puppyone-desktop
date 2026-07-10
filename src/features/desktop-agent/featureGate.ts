export function isDesktopTerminalEnabled({
  terminalToolEnabled,
  workspaceIsCloud,
}: {
  terminalToolEnabled: boolean;
  workspaceIsCloud: boolean;
}) {
  return terminalToolEnabled && !workspaceIsCloud;
}

export function isDesktopAgentChatEnabled({
  available,
  optedIn,
  workspaceIsCloud,
}: {
  available: boolean;
  optedIn: boolean;
  workspaceIsCloud: boolean;
}) {
  return available && optedIn && !workspaceIsCloud;
}
