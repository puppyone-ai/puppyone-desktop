export function isDesktopTerminalEnabled({
  terminalToolEnabled,
  workspaceIsCloud,
}: {
  terminalToolEnabled: boolean;
  workspaceIsCloud: boolean;
}) {
  return terminalToolEnabled && !workspaceIsCloud;
}
