import { createFlagCache } from "../../src/cache/flagCache";

describe("createFlagCache", () => {
  it("returns a cached value on hit and undefined on miss", () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 100 });
    expect(cache.getCachedEval("f1", "u1")).toBeUndefined();

    cache.setCachedEval("f1", "u1", { enabled: true, reason: "global" });
    expect(cache.getCachedEval("f1", "u1")).toEqual({ enabled: true, reason: "global" });
  });

  it("shrinks the per-flag index when an entry is evicted by max size", () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 1 });
    cache.setCachedEval("f1", "u1", { enabled: true, reason: "global" });
    expect(cache.debugIndexSize("f1")).toBe(1);

    cache.setCachedEval("f1", "u2", { enabled: false, reason: "global" }); // evicts u1
    expect(cache.getCachedEval("f1", "u1")).toBeUndefined();
    expect(cache.debugIndexSize("f1")).toBe(1);
  });

  it("shrinks the per-flag index after TTL expiry", async () => {
    const cache = createFlagCache({ ttlMs: 15, maxEntries: 100 });
    cache.setCachedEval("f1", "u1", { enabled: true, reason: "global" });
    expect(cache.debugIndexSize("f1")).toBe(1);

    await new Promise((r) => setTimeout(r, 40));
    expect(cache.getCachedEval("f1", "u1")).toBeUndefined();
    expect(cache.debugIndexSize("f1")).toBe(0);
  });

  it("overwriting an entry does not corrupt the index (dispose fires on overwrite too)", () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 100 });
    cache.setCachedEval("f1", "u1", { enabled: true, reason: "global" });
    cache.setCachedEval("f1", "u1", { enabled: false, reason: "user_override" });

    expect(cache.debugIndexSize("f1")).toBe(1);
    expect(cache.getCachedEval("f1", "u1")).toEqual({ enabled: false, reason: "user_override" });
  });

  it("invalidateFlag evicts every cached user for that flag, bumps the epoch, and leaves other flags untouched", () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 100 });
    cache.setCachedEval("f1", "u1", { enabled: true, reason: "global" });
    cache.setCachedEval("f1", "u2", { enabled: true, reason: "global" });
    cache.setCachedEval("f2", "u1", { enabled: true, reason: "global" });
    const epochBefore = cache.getEpoch("f1");

    cache.invalidateFlag("f1");

    expect(cache.getCachedEval("f1", "u1")).toBeUndefined();
    expect(cache.getCachedEval("f1", "u2")).toBeUndefined();
    expect(cache.getCachedEval("f2", "u1")).toEqual({ enabled: true, reason: "global" });
    expect(cache.getEpoch("f1")).toBe(epochBefore + 1);
    expect(cache.debugIndexSize("f1")).toBe(0);
  });

  it("invalidateEval evicts only that one user's entry for that flag", () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 100 });
    cache.setCachedEval("f1", "u1", { enabled: true, reason: "global" });
    cache.setCachedEval("f1", "u2", { enabled: true, reason: "global" });

    cache.invalidateEval("f1", "u1");

    expect(cache.getCachedEval("f1", "u1")).toBeUndefined();
    expect(cache.getCachedEval("f1", "u2")).toEqual({ enabled: true, reason: "global" });
    expect(cache.debugIndexSize("f1")).toBe(1);
  });

  it("does not collide cache keys even when a component contains characters that could be used as a naive delimiter", () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 100 });
    // userId is an unrestricted opaque string. Under a naive `${flagKey}\0${userId}`
    // join, these two distinct pairs would serialize to the identical string
    // "flag\0A\0B", silently aliasing one cache entry onto the other.
    cache.setCachedEval("flag\u0000A", "B", { enabled: true, reason: "global" });
    cache.setCachedEval("flag", "A\u0000B", { enabled: false, reason: "global" });

    expect(cache.getCachedEval("flag\u0000A", "B")).toEqual({ enabled: true, reason: "global" });
    expect(cache.getCachedEval("flag", "A\u0000B")).toEqual({ enabled: false, reason: "global" });
  });

  it("invalidateEval also bumps the flag's epoch", () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 100 });
    const before = cache.getEpoch("f1");
    cache.invalidateEval("f1", "u1");
    expect(cache.getEpoch("f1")).toBe(before + 1);
  });
});
