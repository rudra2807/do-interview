import { FeatureFlag } from "@prisma/client";
import { NotFoundError } from "../errors/AppError";
import { UpsertOverrideResult } from "../repositories/overrideRepository";
import { FlagCache } from "../cache/flagCache";

export interface SetOverrideResult {
  status: 201 | 200;
  userId: string;
  enabled: boolean;
  updatedAt: Date;
}

export interface FlagRepositoryForOverrideService {
  findByKey(key: string): Promise<FeatureFlag | null>;
}

export interface OverrideRepositoryForOverrideService {
  upsertOverride(flagId: string, userId: string, enabled: boolean): Promise<UpsertOverrideResult>;
  deleteOverride(flagId: string, userId: string): Promise<{ count: number }>;
}

export interface OverrideServiceDeps {
  flagRepository: FlagRepositoryForOverrideService;
  overrideRepository: OverrideRepositoryForOverrideService;
  cache: FlagCache;
}

export interface OverrideService {
  setOverride(flagKey: string, userId: string, enabled: boolean): Promise<SetOverrideResult>;
  removeOverride(flagKey: string, userId: string): Promise<void>;
}

export function createOverrideService(deps: OverrideServiceDeps): OverrideService {
  const { flagRepository, overrideRepository, cache } = deps;

  return {
    async setOverride(flagKey, userId, enabled) {
      const flag = await flagRepository.findByKey(flagKey);
      if (!flag) {
        throw new NotFoundError(`Flag '${flagKey}' not found`);
      }

      const { wasCreated, override } = await overrideRepository.upsertOverride(
        flag.id,
        userId,
        enabled
      );

      // Invalidate only after the write has committed.
      cache.invalidateEval(flagKey, userId);

      return {
        status: wasCreated ? 201 : 200,
        userId: override.userId,
        enabled: override.enabled,
        updatedAt: override.updatedAt,
      };
    },

    async removeOverride(flagKey, userId) {
      const flag = await flagRepository.findByKey(flagKey);
      if (!flag) {
        throw new NotFoundError(`Flag '${flagKey}' not found`);
      }

      const result = await overrideRepository.deleteOverride(flag.id, userId);
      if (result.count === 0) {
        // The flag may have been deleted (cascading away the override)
        // between the check above and this delete. Re-check so the error
        // message reflects the real cause instead of always blaming a
        // missing override.
        const stillExists = await flagRepository.findByKey(flagKey);
        if (!stillExists) {
          throw new NotFoundError(`Flag '${flagKey}' not found`);
        }
        throw new NotFoundError(`No override for user '${userId}' on flag '${flagKey}'`);
      }

      cache.invalidateEval(flagKey, userId);
    },
  };
}
