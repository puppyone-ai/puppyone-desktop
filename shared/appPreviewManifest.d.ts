export const APP_PREVIEW_TYPE: "puppyone.app";
export const APP_PREVIEW_VERSION: 1;
export const APP_PREVIEW_EXTENSION: ".puppyoneapp";
export const APP_PREVIEW_TEMPLATE_VARIABLES: readonly ["port"];

export type AppPreviewHealth = Readonly<{
  path: string;
  expectStatus: number;
}>;

export type AppPreviewLocalServerLaunch = Readonly<{
  kind: "local-server";
  command: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  url: string;
  health: AppPreviewHealth;
}>;

export type AppPreviewStaticFileLaunch = Readonly<{
  kind: "static-file";
  path: string;
}>;

export type AppPreviewExistingUrlLaunch = Readonly<{
  kind: "existing-url";
  url: string;
}>;

export type AppPreviewLaunch =
  | AppPreviewLocalServerLaunch
  | AppPreviewStaticFileLaunch
  | AppPreviewExistingUrlLaunch;

export type AppPreviewManifest = Readonly<{
  id: string | null;
  name: string;
  type: "puppyone.app";
  version: 1;
  launch: AppPreviewLaunch | null;
  permissions: Readonly<{ workspace: readonly ("read" | "write")[] }>;
}>;

export class AppPreviewManifestError extends Error {
  readonly code: string;
  constructor(message: string, code?: string);
}

export function parseAppPreviewManifest(
  content: string,
  options?: { appPath?: string },
): AppPreviewManifest;
export function normalizeAppPreviewManifest(
  value: unknown,
  options?: { appPath?: string },
): AppPreviewManifest;
export function interpolateAppPreviewTemplate(
  value: string,
  variables: Readonly<Record<string, string | number>>,
  label?: string,
): string;
export function interpolateAppPreviewCommand(
  command: readonly string[],
  variables: Readonly<Record<string, string | number>>,
): string[];
export function getAppPreviewManifestDisplayName(content: string, appPath?: string): string;
export function createUnconfiguredAppPreviewManifestContent(): string;
export function isConfiguredAppPreviewManifest(
  manifest: AppPreviewManifest,
): manifest is AppPreviewManifest & Readonly<{ launch: AppPreviewLaunch }>;
