import { prisma } from "../db/prisma";
import { CreateFlagInput } from "../validation/flagSchemas";

export function createFlag(input: CreateFlagInput) {
  return prisma.featureFlag.create({ data: input });
}

export function listFlags() {
  return prisma.featureFlag.findMany({ orderBy: { createdAt: "asc" } });
}
