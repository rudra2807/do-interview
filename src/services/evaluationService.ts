import * as flagRepository from "../repositories/flagRepository";
import { NotFoundError } from "../errors/AppError";

export interface EvaluationResult {
  flag: string;
  user_id: string;
  enabled: boolean;
  reason: "user_override" | "global";
}

export async function evaluate(flagKey: string, userId: string): Promise<EvaluationResult> {
  const flag = await flagRepository.findForEvaluation(flagKey, userId);
  if (!flag) {
    throw new NotFoundError(`Flag '${flagKey}' not found`);
  }

  const override = flag.overrides[0];
  if (override) {
    return { flag: flagKey, user_id: userId, enabled: override.enabled, reason: "user_override" };
  }
  return { flag: flagKey, user_id: userId, enabled: flag.defaultEnabled, reason: "global" };
}
