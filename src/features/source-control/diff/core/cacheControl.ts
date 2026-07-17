type CacheClearer = () => void;

const cacheClearers = new Set<CacheClearer>();

export function registerFormatAwareDiffCache(clear: CacheClearer) {
  cacheClearers.add(clear);
  return () => cacheClearers.delete(clear);
}

export function clearFormatAwareDiffCaches() {
  for (const clear of cacheClearers) clear();
}
