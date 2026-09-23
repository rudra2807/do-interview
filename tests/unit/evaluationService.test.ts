import { createEvaluationService, FlagRepositoryForEvaluation } from "../../src/services/evaluationService";
import { createFlagCache } from "../../src/cache/flagCache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("evaluationService", () => {
  it("returns the global default when there is no override, and caches it", async () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 100 });
    const flagRepository: FlagRepositoryForEvaluation = {
      findForEvaluation: jest.fn().mockResolvedValue({ defaultEnabled: true, overrides: [] }),
    };
    const service = createEvaluationService({ flagRepository, cache });

    const result = await service.evaluate("f1", "u1");
    expect(result).toMatchObject({ flag: "f1", user_id: "u1", enabled: true, reason: "global" });
    expect(cache.getCachedEval("f1", "u1")).toEqual({ enabled: true, reason: "global" });
  });

  it("returns the user override over the global default", async () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 100 });
    const flagRepository: FlagRepositoryForEvaluation = {
      findForEvaluation: jest
        .fn()
        .mockResolvedValue({ defaultEnabled: false, overrides: [{ enabled: true }] }),
    };
    const service = createEvaluationService({ flagRepository, cache });

    const result = await service.evaluate("f1", "u1");
    expect(result).toMatchObject({ enabled: true, reason: "user_override" });
  });

  it("throws NotFoundError for an unknown flag and never caches the miss", async () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 100 });
    const flagRepository: FlagRepositoryForEvaluation = {
      findForEvaluation: jest.fn().mockResolvedValue(null),
    };
    const service = createEvaluationService({ flagRepository, cache });

    await expect(service.evaluate("f1", "u1")).rejects.toThrow();
    expect(cache.getCachedEval("f1", "u1")).toBeUndefined();
  });

  it("a 404 is not cached: creating the flag right after makes the very next evaluate succeed", async () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 100 });
    const findForEvaluation = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ defaultEnabled: true, overrides: [] });
    const flagRepository: FlagRepositoryForEvaluation = { findForEvaluation };
    const service = createEvaluationService({ flagRepository, cache });

    await expect(service.evaluate("f1", "u1")).rejects.toThrow();

    const result = await service.evaluate("f1", "u1");
    expect(result.enabled).toBe(true);
    expect(findForEvaluation).toHaveBeenCalledTimes(2);
  });

  it("a cache hit never calls the repository", async () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 100 });
    cache.setCachedEval("f1", "u1", { enabled: true, reason: "global" });
    const findForEvaluation = jest.fn();
    const service = createEvaluationService({ flagRepository: { findForEvaluation }, cache });

    const result = await service.evaluate("f1", "u1");
    expect(result.enabled).toBe(true);
    expect(findForEvaluation).not.toHaveBeenCalled();
  });

  it("coalesces N concurrent cold evaluations into exactly one repository call (singleflight)", async () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 100 });
    let callCount = 0;
    const findForEvaluation = jest.fn().mockImplementation(async () => {
      callCount += 1;
      await new Promise((r) => setTimeout(r, 15));
      return { defaultEnabled: true, overrides: [] };
    });
    const service = createEvaluationService({ flagRepository: { findForEvaluation }, cache });

    const results = await Promise.all([
      service.evaluate("f1", "u1"),
      service.evaluate("f1", "u1"),
      service.evaluate("f1", "u1"),
      service.evaluate("f1", "u1"),
      service.evaluate("f1", "u1"),
    ]);

    expect(callCount).toBe(1);
    results.forEach((r) => expect(r.enabled).toBe(true));
  });

  it("does not cache a stale read that resolves after a concurrent invalidation (epoch guard)", async () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 100 });
    const d = deferred<{ defaultEnabled: boolean; overrides: never[] }>();
    const flagRepository: FlagRepositoryForEvaluation = {
      findForEvaluation: jest.fn().mockReturnValue(d.promise),
    };
    const service = createEvaluationService({ flagRepository, cache });

    // Starts a read that will stay pending until we resolve it below.
    const evalPromise = service.evaluate("f1", "u1");

    // A concurrent write invalidates the flag while that read is still in
    // flight, bumping the epoch this request captured before its read.
    cache.invalidateFlag("f1");

    // Only now does the deferred read resolve, with data reflecting state
    // from before the invalidation.
    d.resolve({ defaultEnabled: false, overrides: [] });

    const result = await evalPromise;
    expect(result.enabled).toBe(false); // this request's own answer is unaffected
    expect(cache.getCachedEval("f1", "u1")).toBeUndefined(); // but it must never be cached
  });

  it("a request arriving after an invalidation does not coalesce onto a slower in-flight read that started before it", async () => {
    const cache = createFlagCache({ ttlMs: 30_000, maxEntries: 100 });
    const first = deferred<{ defaultEnabled: boolean; overrides: never[] }>();
    let callCount = 0;
    const findForEvaluation = jest.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) return first.promise;
      return Promise.resolve({ defaultEnabled: true, overrides: [] });
    });
    const service = createEvaluationService({ flagRepository: { findForEvaluation }, cache });

    const staleRead = service.evaluate("f1", "u1"); // epoch 0, still pending

    cache.invalidateFlag("f1"); // epoch becomes 1

    const freshRead = service.evaluate("f1", "u1"); // must start its own read at epoch 1
    expect(callCount).toBe(2); // not coalesced onto the pending epoch-0 read

    first.resolve({ defaultEnabled: false, overrides: [] });

    const [staleResult, freshResult] = await Promise.all([staleRead, freshRead]);
    expect(staleResult.enabled).toBe(false);
    expect(freshResult.enabled).toBe(true);
  });
});
