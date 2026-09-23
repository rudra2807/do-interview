import * as flagRepository from "../repositories/flagRepository";
import * as overrideRepository from "../repositories/overrideRepository";
import { NotFoundError } from "../errors/AppError";

export interface SetOverrideResult {
  status: 201 | 200;
  userId: string;
  enabled: boolean;
  updatedAt: Date;
}

export async function setOverride(
  flagKey: string,
  userId: string,
  enabled: boolean
): Promise<SetOverrideResult> {
  const flag = await flagRepository.findByKey(flagKey);
  if (!flag) {
    throw new NotFoundError(`Flag '${flagKey}' not found`);
  }

  const { wasCreated, override } = await overrideRepository.upsertOverride(
    flag.id,
    userId,
    enabled
  );

  return {
    status: wasCreated ? 201 : 200,
    userId: override.userId,
    enabled: override.enabled,
    updatedAt: override.updatedAt,
  };
}

export async function removeOverride(flagKey: string, userId: string): Promise<void> {
  const flag = await flagRepository.findByKey(flagKey);
  if (!flag) {
    throw new NotFoundError(`Flag '${flagKey}' not found`);
  }

  const result = await overrideRepository.deleteOverride(flag.id, userId);
  if (result.count === 0) {
    // The flag may have been deleted (cascading away the override) between
    // the check above and this delete. Re-check so the error message
    // reflects the real cause instead of always blaming a missing override.
    const stillExists = await flagRepository.findByKey(flagKey);
    if (!stillExists) {
      throw new NotFoundError(`Flag '${flagKey}' not found`);
    }
    throw new NotFoundError(`No override for user '${userId}' on flag '${flagKey}'`);
  }
}
