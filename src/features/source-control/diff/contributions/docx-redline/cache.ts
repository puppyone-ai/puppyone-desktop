import type { GitRevisionPair } from "../../../../../types/electron";
import { registerFormatAwareDiffCache } from "../../core/cacheControl";
import { WeightedTtlLruCache } from "../../core/WeightedTtlLruCache";
import {
  DOCX_REDLINE_RENDERER_VERSION,
  type DocxRedlinePresentation,
} from "./model";

export const DOCX_REDLINE_CACHE_LIMITS = Object.freeze({
  maxEntries: 8,
  maxWeightBytes: 24 * 1024 * 1024,
  ttlMs: 5 * 60 * 1000,
});

const cache = new WeightedTtlLruCache<DocxRedlinePresentation>({
  maxEntries: DOCX_REDLINE_CACHE_LIMITS.maxEntries,
  maxWeight: DOCX_REDLINE_CACHE_LIMITS.maxWeightBytes,
  ttlMs: DOCX_REDLINE_CACHE_LIMITS.ttlMs,
  weightOf: estimateDocxRedlinePresentationBytes,
});

registerFormatAwareDiffCache(() => cache.clear());

export function createDocxRedlineCacheKey(
  pair: GitRevisionPair,
  rendererVersion = DOCX_REDLINE_RENDERER_VERSION,
) {
  return [
    pair.repositoryIdentity,
    pair.path,
    pair.before.identity,
    pair.after.identity,
    `docx-redline@${rendererVersion}`,
  ].join("\0");
}

export function readDocxRedlineCache(key: string) {
  return cache.get(key);
}

export function writeDocxRedlineCache(key: string, model: DocxRedlinePresentation) {
  return cache.set(key, model);
}

export function clearDocxRedlineCache() {
  cache.clear();
}

export function getDocxRedlineCacheUsageForTests() {
  return { entries: cache.size, weightBytes: cache.totalWeight };
}

export function estimateDocxRedlinePresentationBytes(model: DocxRedlinePresentation) {
  let bytes = 512 + stringBytes(model.rendererVersion) + stringBytes(model.fidelityNote);
  for (const change of model.changes) {
    bytes += 192 + stringBytes(change.id) + stringBytes(change.kind) + stringBytes(change.blockKind);
    for (const segment of change.segments) {
      bytes += 48 + stringBytes(segment.kind) + stringBytes(segment.text);
    }
  }
  return Math.max(0, Math.ceil(bytes));
}

function stringBytes(value: string) {
  return value.length * 2;
}
