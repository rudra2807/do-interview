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

export const updateFlagSchema = z
  .object({
    description: z.string().max(1000).optional(),
    defaultEnabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field (description, defaultEnabled) must be provided",
  });

export type UpdateFlagInput = z.infer<typeof updateFlagSchema>;

export const setOverrideSchema = z.object({
  enabled: z.boolean(),
});

export type SetOverrideInput = z.infer<typeof setOverrideSchema>;

// user_id is a plain non-empty string, not a boolean field. Query params arrive as
// strings, so z.coerce.boolean() would treat any non-empty value (including "false")
// as truthy. No boolean fields are accepted via query params in this API.
export const evaluateQuerySchema = z.object({
  user_id: z.string().min(1),
});

export type EvaluateQuery = z.infer<typeof evaluateQuerySchema>;
