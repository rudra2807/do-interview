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

  const override = await overrideRepository.upsertOverride(flag.id, userId, enabled);
  // A single upsert call cannot itself report whether it inserted or updated.
  // On insert, createdAt and updatedAt are set from the same write, so equal
  // timestamps mean this was a create; this avoids a separate find-then-act
  // check that would race with a concurrent write.
  const wasCreated = override.createdAt.getTime() === override.updatedAt.getTime();

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
    throw new NotFoundError(`No override for user '${userId}' on flag '${flagKey}'`);
  }
}
