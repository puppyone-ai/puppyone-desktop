export const CLOUD_API_BASE_URL_STORAGE_KEY: string;

export function normalizeCloudApiBaseUrl(apiBaseUrl: string | null | undefined): string | null;
export function resolveCloudApiBaseUrl(
  apiBaseUrl?: string | null,
  fallback?: string | null,
): string;
export function cloudApiBaseUrlFromRemote(remoteUrl: string | null | undefined): string | null;
export function buildCloudApiUrl(path: string, apiBaseUrl?: string | null): string;
export function normalizeCloudApiPath(path: string): string;
export function sameCloudApiBaseUrl(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean;
export function formatCloudApiHost(apiBaseUrl: string | null | undefined): string;
