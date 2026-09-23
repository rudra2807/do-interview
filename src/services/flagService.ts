import { FeatureFlag } from "@prisma/client";
import { CreateFlagInput, UpdateFlagInput } from "../validation/flagSchemas";
import { FlagCache } from "../cache/flagCache";

export interface FlagRepositoryForFlagService {
  createFlag(input: CreateFlagInput): Promise<FeatureFlag>;
  listFlags(): Promise<FeatureFlag[]>;
  updateFlag(key: string, input: UpdateFlagInput): Promise<FeatureFlag>;
  deleteFlag(key: string): Promise<FeatureFlag>;
}

export interface FlagServiceDeps {
  flagRepository: FlagRepositoryForFlagService;
  cache: FlagCache;
}

export interface FlagService {
  createFlag(input: CreateFlagInput): Promise<FeatureFlag>;
  listFlags(): Promise<FeatureFlag[]>;
  updateFlag(key: string, input: UpdateFlagInput): Promise<FeatureFlag>;
  deleteFlag(key: string): Promise<FeatureFlag>;
}

export function createFlagService(deps: FlagServiceDeps): FlagService {
  const { flagRepository, cache } = deps;

  return {
    createFlag(input) {
      return flagRepository.createFlag(input);
    },

    listFlags() {
      return flagRepository.listFlags();
    },

    async updateFlag(key, input) {
      const flag = await flagRepository.updateFlag(key, input);
      // Invalidate only after the write has committed.
      cache.invalidateFlag(key);
      return flag;
    },

    async deleteFlag(key) {
      const flag = await flagRepository.deleteFlag(key);
      cache.invalidateFlag(key);
      return flag;
    },
  };
}
