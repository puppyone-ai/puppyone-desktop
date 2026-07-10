export function isAssetLibraryHomeEnabled({
  available,
  optedIn,
}: {
  available: boolean;
  optedIn: boolean;
}) {
  return available && optedIn;
}
