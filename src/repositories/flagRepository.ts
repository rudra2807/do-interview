import { prisma } from "../db/prisma";
import { CreateFlagInput, UpdateFlagInput } from "../validation/flagSchemas";

export function createFlag(input: CreateFlagInput) {
  return prisma.featureFlag.create({ data: input });
}

export function listFlags() {
  return prisma.featureFlag.findMany({ orderBy: { createdAt: "asc" } });
}

export function findByKey(key: string) {
  return prisma.featureFlag.findUnique({ where: { key } });
}

// Single Prisma call for evaluation: the flag plus, at most, the one override
// row for this userId (filtered in the include, not fetched separately).
export function findForEvaluation(key: string, userId: string) {
  return prisma.featureFlag.findUnique({
    where: { key },
    include: { overrides: { where: { userId } } },
  });
}

// Prisma throws P2025 if the key does not exist, which the central error
// handler maps to 404. No separate existence check is needed here.
export function updateFlag(key: string, input: UpdateFlagInput) {
  return prisma.featureFlag.update({ where: { key }, data: input });
}

export function deleteFlag(key: string) {
  return prisma.featureFlag.delete({ where: { key } });
}
