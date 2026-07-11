import type { GitRevisionPair } from "../../../../types/electron";
import {
  DOCX_REDLINE_RENDERER_VERSION,
  type DocxRedlinePresentation,
} from "./docxRedlineTypes";

const MAX_DOCX_REDLINE_CACHE_ENTRIES = 8;

export class BoundedLruCache<Value> {
  private readonly entries = new Map<string, Value>();

  constructor(private readonly maxEntries: number) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError("LRU cache size must be a positive integer.");
    }
  }

  get(key: string) {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: Value) {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}

const cache = new BoundedLruCache<DocxRedlinePresentation>(MAX_DOCX_REDLINE_CACHE_ENTRIES);

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
  cache.set(key, model);
}

export function clearDocxRedlineCacheForTests() {
  cache.clear();
}
