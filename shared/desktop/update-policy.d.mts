export type DesktopUpdateVersionRelation = "newer" | "same" | "older" | "invalid";

export type DesktopUpdateCandidateEvaluation = Readonly<{
  allowed: boolean;
  candidateVersion: string | null;
  channel: "dev" | "internal" | "stable" | null;
  channelCompatible: boolean;
  currentVersion: string | null;
  invalid: readonly ("channel" | "currentVersion" | "candidateVersion")[];
  relation: DesktopUpdateVersionRelation;
}>;

export const DESKTOP_UPDATE_VERSION_RELATIONS: readonly DesktopUpdateVersionRelation[];

export type CanonicalDesktopVersion = Readonly<{
  version: string;
  major: number;
  minor: number;
  patch: number;
  prerelease: readonly (number | string)[];
}>;

export function parseCanonicalDesktopVersion(value: unknown): CanonicalDesktopVersion | null;
export function compareCanonicalDesktopVersions(left: unknown, right: unknown): -1 | 0 | 1;

export function evaluateDesktopUpdateCandidate(options: {
  channel: unknown;
  currentVersion: unknown;
  candidateVersion: unknown;
}): DesktopUpdateCandidateEvaluation;

export function isDesktopUpdateCandidateNewer(options: {
  channel: unknown;
  currentVersion: unknown;
  candidateVersion: unknown;
}): boolean;
