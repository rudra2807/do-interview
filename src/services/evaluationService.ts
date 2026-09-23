import { NotFoundError } from "../errors/AppError";
import { FlagCache, EvaluationResult as CachedEvaluationResult } from "../cache/flagCache";

export interface EvaluationResult {
  flag: string;
  user_id: string;
  enabled: boolean;
  reason: "user_override" | "global";
}

export interface EvaluationFlagRow {
  defaultEnabled: boolean;
  overrides: { enabled: boolean }[];
}

export interface FlagRepositoryForEvaluation {
  findForEvaluation(key: string, userId: string): Promise<EvaluationFlagRow | null>;
}

export interface EvaluationServiceDeps {
  flagRepository: FlagRepositoryForEvaluation;
  cache: FlagCache;
}

export interface EvaluationService {
  evaluate(flagKey: string, userId: string): Promise<EvaluationResult>;
}

export function createEvaluationService(deps: EvaluationServiceDeps): EvaluationService {
  const { flagRepository, cache } = deps;

  // Keyed by flagKey + userId + the epoch captured at request start, not
  // just flagKey + userId. A request that arrives after an invalidation has
  // a newer epoch, so it never coalesces onto an in-flight computation that
  // started before the write and would otherwise hand it a stale result.
  const inFlight = new Map<string, Promise<CachedEvaluationResult>>();

  async function computeAndCache(
    flagKey: string,
    userId: string,
    epochBeforeRead: number
  ): Promise<CachedEvaluationResult> {
    const flag = await flagRepository.findForEvaluation(flagKey, userId);
    if (!flag) {
      throw new NotFoundError(`Flag '${flagKey}' not found`);
    }

    const override = flag.overrides[0];
    const result: CachedEvaluationResult = override
      ? { enabled: override.enabled, reason: "user_override" }
      : { enabled: flag.defaultEnabled, reason: "global" };

    // Only cache if nothing invalidated this flag while the read was in
    // flight. A NotFoundError thrown above skips this line entirely, so a
    // 404 is never cached.
    if (cache.getEpoch(flagKey) === epochBeforeRead) {
      cache.setCachedEval(flagKey, userId, result);
    }

    return result;
  }

  return {
    async evaluate(flagKey, userId) {
      const cached = cache.getCachedEval(flagKey, userId);
      if (cached) {
        return { flag: flagKey, user_id: userId, ...cached };
      }

      const epochBeforeRead = cache.getEpoch(flagKey);
      const inFlightKey = `${flagKey}\u0000${userId}\u0000${epochBeforeRead}`;

      let promise = inFlight.get(inFlightKey);
      if (!promise) {
        promise = computeAndCache(flagKey, userId, epochBeforeRead);
        inFlight.set(inFlightKey, promise);
        // Separate chain for cleanup only. Not awaited by callers, so it
        // needs its own rejection handler or an uncaught computeAndCache
        // error would additionally surface as an unhandled rejection on
        // this derived promise, even though callers already handle it via
        // the awaited `promise` below.
        promise.finally(() => inFlight.delete(inFlightKey)).catch(() => {});
      }

      const result = await promise;
      return { flag: flagKey, user_id: userId, ...result };
    },
  };
}
