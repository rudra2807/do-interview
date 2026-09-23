import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

// Applied via URLSearchParams rather than string-concatenating a query
// string onto DATABASE_URL. The platform-bound connection string may or
// may not already have query params (for example sslmode), and blindly
// appending "?connection_limit=N" would produce a malformed URL if it
// does. URLSearchParams adds or overwrites the single param correctly
// either way, leaving everything else in the URL untouched.
function withConnectionLimit(databaseUrl: string, limit: number): string {
  const url = new URL(databaseUrl);
  url.searchParams.set("connection_limit", String(limit));
  return url.toString();
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: withConnectionLimit(env.databaseUrl, env.databaseConnectionLimit),
    },
  },
});
