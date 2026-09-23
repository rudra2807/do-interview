import { z } from "zod";

export const createFlagSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_]*$/, "key must be a lowercase slug (letters, numbers, - or _)"),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  defaultEnabled: z.boolean().optional().default(false),
});

export type CreateFlagInput = z.infer<typeof createFlagSchema>;
