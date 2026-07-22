/** Failures that keep the current repository in the same Cloud recovery screen. */
export function isRetryableCloudFailure(status: number | null): boolean {
  return status == null || status === 408 || status === 425 || status === 429 || status >= 500;
}
