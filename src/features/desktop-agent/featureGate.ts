export function isDesktopAgentChatEnabled({
  available,
  optedIn,
}: {
  available: boolean;
  optedIn: boolean;
}) {
  return available && optedIn;
}
