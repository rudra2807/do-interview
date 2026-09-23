import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

export interface UpsertOverrideResult {
  wasCreated: boolean;
  override: {
    userId: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

// Deliberately not a single prisma.upsert() call. Prisma's upsert is atomic
// at the database level (a unique-key race can never produce two rows), but
// createdAt/updatedAt are computed client-side per call, so two requests
// issued in the same millisecond can both see createdAt === updatedAt on the
// same row, making "was this just created" unreliable to infer from
// timestamps alone. Attempting create() first and falling back to update()
// only on a genuine P2002 makes wasCreated deterministic: Postgres's unique
// constraint guarantees exactly one caller's create() can ever succeed.
export async function upsertOverride(
  flagId: string,
  userId: string,
  enabled: boolean
): Promise<UpsertOverrideResult> {
  try {
    const override = await prisma.featureFlagOverride.create({
      data: { flagId, userId, enabled },
    });
    return { wasCreated: true, override };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const override = await prisma.featureFlagOverride.update({
        where: { flagId_userId: { flagId, userId } },
        data: { enabled },
      });
      return { wasCreated: false, override };
    }
    throw err;
  }
}

// deleteMany, not delete: deleting a non-existent override should not throw.
// The caller checks the returned count to decide 204 vs 404.
export function deleteOverride(flagId: string, userId: string) {
  return prisma.featureFlagOverride.deleteMany({ where: { flagId, userId } });
}
