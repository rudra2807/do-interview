import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  CACHE_TTL_MS: z.coerce.number().int().positive().default(30_000),
  CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(5000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.issues);
  process.exit(1);
}

export const env = {
  port: parsed.data.PORT,
  databaseUrl: parsed.data.DATABASE_URL,
  cacheTtlMs: parsed.data.CACHE_TTL_MS,
  cacheMaxEntries: parsed.data.CACHE_MAX_ENTRIES,
};
