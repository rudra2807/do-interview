import { prisma } from "../db/prisma";

export function upsertOverride(flagId: string, userId: string, enabled: boolean) {
  return prisma.featureFlagOverride.upsert({
    where: { flagId_userId: { flagId, userId } },
    create: { flagId, userId, enabled },
    update: { enabled },
  });
}

// deleteMany, not delete: deleting a non-existent override should not throw.
// The caller checks the returned count to decide 204 vs 404.
export function deleteOverride(flagId: string, userId: string) {
  return prisma.featureFlagOverride.deleteMany({ where: { flagId, userId } });
}
