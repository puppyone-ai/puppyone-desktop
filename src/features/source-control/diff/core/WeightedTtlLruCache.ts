type TimerHandle = ReturnType<typeof setTimeout>;

type WeightedTtlLruCacheOptions<Value> = {
  maxEntries: number;
  maxWeight: number;
  ttlMs: number;
  weightOf(value: Value): number;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancelScheduled?: (handle: TimerHandle) => void;
};

type WeightedCacheEntry<Value> = {
  value: Value;
  weight: number;
  expiresAt: number;
};

export class WeightedTtlLruCache<Value> {
  private readonly entries = new Map<string, WeightedCacheEntry<Value>>();
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => TimerHandle;
  private readonly cancelScheduled: (handle: TimerHandle) => void;
  private expiryTimer: TimerHandle | null = null;
  private currentWeight = 0;

  constructor(private readonly options: WeightedTtlLruCacheOptions<Value>) {
    assertPositiveInteger(options.maxEntries, "cache entry limit");
    assertPositiveInteger(options.maxWeight, "cache weight limit");
    assertPositiveInteger(options.ttlMs, "cache TTL");
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancelScheduled = options.cancelScheduled ?? clearTimeout;
  }

  get(key: string) {
    this.purgeExpired();
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: Value) {
    this.purgeExpired();
    const weight = this.options.weightOf(value);
    if (!Number.isSafeInteger(weight) || weight < 0) {
      throw new RangeError("Cache entry weight must be a non-negative safe integer.");
    }
    this.deleteEntry(key);
    if (weight > this.options.maxWeight) return false;

    this.entries.set(key, {
      value,
      weight,
      expiresAt: this.now() + this.options.ttlMs,
    });
    this.currentWeight += weight;
    while (
      this.entries.size > this.options.maxEntries
      || this.currentWeight > this.options.maxWeight
    ) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.deleteEntry(oldest);
    }
    this.scheduleExpiry();
    return this.entries.has(key);
  }

  delete(key: string) {
    const deleted = this.deleteEntry(key);
    this.scheduleExpiry();
    return deleted;
  }

  clear() {
    this.entries.clear();
    this.currentWeight = 0;
    this.cancelExpiryTimer();
  }

  purgeExpired() {
    const timestamp = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= timestamp) this.deleteEntry(key);
    }
    this.scheduleExpiry();
  }

  get size() {
    return this.entries.size;
  }

  get totalWeight() {
    return this.currentWeight;
  }

  private deleteEntry(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.currentWeight -= entry.weight;
    return true;
  }

  private scheduleExpiry() {
    this.cancelExpiryTimer();
    let nearest = Number.POSITIVE_INFINITY;
    for (const entry of this.entries.values()) nearest = Math.min(nearest, entry.expiresAt);
    if (!Number.isFinite(nearest)) return;
    this.expiryTimer = this.schedule(() => {
      this.expiryTimer = null;
      this.purgeExpired();
    }, Math.max(0, nearest - this.now()));
    (this.expiryTimer as unknown as { unref?: () => void }).unref?.();
  }

  private cancelExpiryTimer() {
    if (this.expiryTimer == null) return;
    this.cancelScheduled(this.expiryTimer);
    this.expiryTimer = null;
  }
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}
