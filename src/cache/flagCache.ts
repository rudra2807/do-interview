import { LRUCache } from "lru-cache";

export interface EvaluationResult {
  enabled: boolean;
  reason: "user_override" | "global";
}

export interface FlagCacheOptions {
  ttlMs: number;
  maxEntries: number;
}

export interface FlagCache {
  getCachedEval(flagKey: string, userId: string): EvaluationResult | undefined;
  setCachedEval(flagKey: string, userId: string, value: EvaluationResult): void;
  getEpoch(flagKey: string): number;
  invalidateFlag(flagKey: string): void;
  invalidateEval(flagKey: string, userId: string): void;
  debugIndexSize(flagKey: string): number;
}

// JSON-encode the pair rather than joining with a delimiter character.
// userId is an unrestricted, opaque external id with no charset
// constraint, so a hand-picked delimiter (even an unlikely one like a null
// byte) could in principle collide if some component ever contained it.
// JSON.stringify escapes its inputs, so two distinct (flagKey, userId)
// pairs can never serialize to the same string, regardless of content.
function cacheKeyFor(flagKey: string, userId: string): string {
  return JSON.stringify([flagKey, userId]);
}

function parseCacheKey(cacheKey: string): { flagKey: string; userId: string } {
  const [flagKey, userId] = JSON.parse(cacheKey) as [string, string];
  return { flagKey, userId };
}

// Factory, not a module-level singleton: each call returns an independent
// cache (its own LRUCache, index, and epoch map), so tests can construct a
// fresh instance instead of sharing mutable global state across test cases.
export function createFlagCache(options: FlagCacheOptions): FlagCache {
  // Tracks which userIds currently have a cached evaluation for a given
  // flag, so a flag-level write can evict exactly those entries instead of
  // scanning or wiping the whole cache.
  const flagUserIndex = new Map<string, Set<string>>();

  function addToIndex(flagKey: string, userId: string): void {
    let users = flagUserIndex.get(flagKey);
    if (!users) {
      users = new Set();
      flagUserIndex.set(flagKey, users);
    }
    users.add(userId);
  }

  function removeFromIndex(flagKey: string, userId: string): void {
    const users = flagUserIndex.get(flagKey);
    if (!users) return;
    users.delete(userId);
    if (users.size === 0) {
      flagUserIndex.delete(flagKey);
    }
  }

  const evalCache = new LRUCache<string, EvaluationResult>({
    max: options.maxEntries,
    ttl: options.ttlMs,
    // Fires on overwrite, explicit delete, and eviction/expiry alike
    // (verified directly against this library, not assumed). Only ever
    // removes the specific key being disposed; it never needs to know why.
    dispose: (_value, cacheKey) => {
      const { flagKey, userId } = parseCacheKey(cacheKey);
      removeFromIndex(flagKey, userId);
    },
  });

  // Bumped on every write that affects a flag (flag-level update/delete, or
  // an override write for that flag). A pending evaluation captures the
  // epoch before its read and only caches its result if the epoch is still
  // unchanged afterward, so a write landing mid-read can never be clobbered
  // by a slower concurrent read's stale value.
  //
  // Entries here are never deleted, including when a flag is permanently
  // deleted. This looks like a leak but deleting an entry resets getEpoch()
  // back to its default of 0, which can collide with a slow in-flight read
  // that captured epoch 0 before any write ever happened to that flag (for
  // example, the very first read on a brand-new flag). If that read
  // resolves after the flag is deleted and the entry was reset to "not
  // present" (defaulting to 0 again), it would see its captured epoch as
  // still current and cache a stale result for a flag that no longer
  // exists, masking a correct 404 behind a stale cache hit on the next
  // evaluate. Growing forever is bounded by the number of distinct flag
  // keys ever created, not by request volume, and is negligible in size.
  const epochs = new Map<string, number>();

  function getEpoch(flagKey: string): number {
    return epochs.get(flagKey) ?? 0;
  }

  function bumpEpoch(flagKey: string): void {
    epochs.set(flagKey, getEpoch(flagKey) + 1);
  }

  return {
    getEpoch,

    getCachedEval(flagKey, userId) {
      return evalCache.get(cacheKeyFor(flagKey, userId));
    },

    setCachedEval(flagKey, userId, value) {
      const key = cacheKeyFor(flagKey, userId);
      // dispose can fire synchronously inside set() itself, for the entry
      // being overwritten at this exact key or for a different entry
      // evicted to make room. Adding to the index only after set() returns
      // means dispose's removal (for this same key's old value, if any)
      // can never clobber the addition we are about to make.
      evalCache.set(key, value);
      addToIndex(flagKey, userId);
    },

    invalidateFlag(flagKey) {
      bumpEpoch(flagKey);
      const users = flagUserIndex.get(flagKey);
      if (!users) return;
      // Snapshot before iterating: evalCache.delete() triggers dispose,
      // which mutates this same Set via removeFromIndex.
      for (const userId of Array.from(users)) {
        evalCache.delete(cacheKeyFor(flagKey, userId));
      }
      flagUserIndex.delete(flagKey);
    },

    invalidateEval(flagKey, userId) {
      bumpEpoch(flagKey);
      evalCache.delete(cacheKeyFor(flagKey, userId));
    },

    debugIndexSize(flagKey) {
      return flagUserIndex.get(flagKey)?.size ?? 0;
    },
  };
}
