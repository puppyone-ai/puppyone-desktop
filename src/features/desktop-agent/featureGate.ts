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
