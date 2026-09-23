import * as flagRepository from "./repositories/flagRepository";
import * as overrideRepository from "./repositories/overrideRepository";
import { createFlagCache } from "./cache/flagCache";
import { createFlagService } from "./services/flagService";
import { createOverrideService } from "./services/overrideService";
import { createEvaluationService } from "./services/evaluationService";
import { env } from "./config/env";

const cache = createFlagCache({
  ttlMs: env.cacheTtlMs,
  maxEntries: env.cacheMaxEntries,
});

export const flagService = createFlagService({ flagRepository, cache });
export const overrideService = createOverrideService({
  flagRepository,
  overrideRepository,
  cache,
});
export const evaluationService = createEvaluationService({ flagRepository, cache });
